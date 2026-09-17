/*
 * Translation orchestration: provider selection, result cache, language
 * handling and the self test used by the settings pane.
 *
 * Smart routing: a selection that looks like a single word goes to the free,
 * key-less Google endpoint (fast and dictionary-like), a selection that looks
 * like a sentence goes to the configured LLM (context aware). Each route falls
 * back to the other one when its whole provider family is unavailable.
 */

/* eslint-disable no-var */
var ZPT = (typeof ZPT !== 'undefined' && ZPT) ? ZPT : {};

ZPT.translate = (function () {
	// Insertion-ordered Map used as an LRU cache
	const cache = new Map();
	// provider id -> timestamp until which it is considered unreachable
	const unhealthy = new Map();
	const UNHEALTHY_MS = 5 * 60 * 1000;
	// Errors that are worth retrying with another provider
	const RETRYABLE = ['network', 'timeout', 'server', 'http', 'quota'];
	// Families used by the router, in fallback order per text kind
	const KIND_ORDER = { word: ['free', 'llm'], sentence: ['llm', 'free'] };
	// Language assumed for non-CJK selections, so a free endpoint cannot
	// auto-detect a third language and answer in it
	const CJK_RE = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uac00-\ud7af]/;

	function getProviderID() {
		return ZPT.prefs.getString('provider') || 'google-free';
	}

	function getProvider(id) {
		let key = id || getProviderID();
		return ZPT.providers[key] || ZPT.providers['google-free'];
	}

	function providerKind(provider) {
		return (provider && provider.kind) || 'free';
	}

	function isRetryable(error) {
		return !!error && RETRYABLE.includes(error.code);
	}

	function isUnhealthy(id) {
		let until = unhealthy.get(id);
		if (!until) {
			return false;
		}
		if (Date.now() > until) {
			unhealthy.delete(id);
			return false;
		}
		return true;
	}

	function markUnhealthy(id) {
		unhealthy.set(id, Date.now() + UNHEALTHY_MS);
	}

	function markHealthy(id) {
		unhealthy.delete(id);
	}

	/** Provider ids in the given family, in preference order. */
	function family(kind) {
		return Object.keys(ZPT.providers)
			.map((id) => ZPT.providers[id])
			.filter((provider) => providerKind(provider) === kind)
			.sort((a, b) => (a.needsApiKey ? 1 : 0) - (b.needsApiKey ? 1 : 0))
			.map((provider) => provider.id);
	}

	function isConfigured(id) {
		let provider = ZPT.providers[id];
		if (!provider) {
			return false;
		}
		return typeof provider.isConfigured === 'function' ? !!provider.isConfigured() : true;
	}

	function dropUnhealthy(ids) {
		let healthy = ids.filter((id) => !isUnhealthy(id));
		return healthy.length ? healthy : ids;
	}

	/**
	 * Ordered provider chain: the family that suits the text kind first (free
	 * endpoints for words, LLMs for sentences), the other family after it, so an
	 * unreachable Google or a missing API key never leaves the user without a
	 * translation.
	 *
	 * - `kind` is 'word' / 'sentence' when the router picked the route, or null
	 *   when the user's own service choice decides everything. With null the
	 *   preferred service leads and the free family comes before the LLMs.
	 * - `preferredID` is the service from the settings pane. It leads whenever it
	 *   belongs to the first family, so a user who picked MyMemory gets it before
	 *   Google.
	 * - A family that cannot be used yet (no API key) does not shadow a usable
	 *   one; an explicitly preferred broken service is kept anyway so that the
	 *   real "no API key" hint reaches the user.
	 *
	 * `preferredID` may also be an array, which is how the self test asks for a
	 * specific chain head.
	 */
	function providerChain(kind, preferredID) {
		let manual = !kind;
		let order = manual || !KIND_ORDER[kind] ? ['free', 'llm'] : KIND_ORDER[kind];
		let groups = order.map((name) => family(name));
		let first = groups[0];
		let second = groups[1];
		let preferredIds = Array.isArray(preferredID)
			? preferredID.slice()
			: (preferredID ? [preferredID] : []);
		let known = preferredIds.filter((id) => ZPT.providers[id]);
		let chain = [];
		if (manual) {
			// The user's own service answers first, whatever family it is in
			chain = known;
		}
		groups.forEach((ids) => {
			let usable = ids.filter(isConfigured);
			let leads = known.filter((id) => ids.includes(id));
			if (!usable.length && leads.length) {
				// keep the user's choice visible instead of hiding the problem
				usable = leads;
			}
			usable = leads.concat(usable.filter((id) => !leads.includes(id)));
			// A service that just failed sinks below its healthy peers
			usable = dropUnhealthy(usable);
			chain = chain.concat(usable.filter((id) => !chain.includes(id)));
		});
		return chain.length ? chain : [known[0] || first[0] || second[0] || getProviderID()];
	}

	/**
	 * Same chain a normal routed request would build for `kind`, used by the
	 * self test so it exercises the services the user actually configured.
	 */
	function routableChain(kind, preferredID) {
		return providerChain(kind, preferredID);
	}

	/**
	 * Source language sent to the service.
	 *
	 * Auto-detection is only flaky for a short selection — Google happily
	 * answers "Transformer" as Dutch — so a short ASCII/Latin token is sent as
	 * English. Sentences are long enough for real auto-detection, and text that
	 * is not ASCII (German umlauts, Cyrillic, Greek, CJK) is always left to the
	 * service, so no language is ever mislabelled.
	 */
	const NON_ASCII_RE = /[^\x20-\x7e]/;
	const HAS_LETTER_RE = /[A-Za-z]/;
	const SHORT_TOKEN_MAX = 30;

	function sourceLanguageFor(text, sourceLang) {
		if (sourceLang && sourceLang !== 'auto') {
			return sourceLang;
		}
		let value = String(text || '').trim();
		if (!value || NON_ASCII_RE.test(value)) {
			return 'auto';
		}
		if (ZPT.util.detectTextKind(value) === 'word' && HAS_LETTER_RE.test(value)
			&& value.length <= SHORT_TOKEN_MAX) {
			return 'en';
		}
		return 'auto';
	}

	/**
	 * The provider that leads the chain for a routed request. There is exactly
	 * one chain builder (`providerChain`), so the reported route and the real
	 * request can never disagree.
	 */
	function resolveProvider(kind, preferredID) {
		let chain = providerChain(kind, preferredID);
		return chain[0];
	}

	/**
	 * Pick the service and the source language for a selection.
	 * `route` is set to null when smart routing is off (the user's own choice
	 * then applies), otherwise to 'word' or 'sentence'.
	 *
	 * When the service a text kind would rather use is not usable yet (the LLM
	 * has no API key, say), the user's preferred service takes over instead of
	 * the request failing with a configuration error.
	 */
	function routeFor(text, sourceLang) {
		let kind = ZPT.util.detectTextKind(text);
		let resolved = sourceLanguageFor(text, sourceLang);
		if (!ZPT.prefs.getBool('translate.autoRoute')) {
			// Even without routing, do not let the free endpoint guess a
			// third language for plain English text.
			return {
				provider: getProviderID(),
				sourceLang: resolved,
				kind,
				route: null
			};
		}
		let preferred = getProviderID();
		let provider = resolveProvider(kind, preferred);
		return {
			provider,
			sourceLang: resolved,
			kind,
			route: kind
		};
	}

	/**
	 * Chain used for one translation.
	 *
	 * - `options.provider` is an explicit caller choice: it leads the chain and
	 *   auto-fallback may still append every other configured service.
	 * - `options.chain` is used verbatim (the self test builds its own).
	 * - Otherwise the chain follows the router's text kind and the settings pane.
	 */
	function chainFor(options) {
		if (options.chain) {
			return options.chain;
		}
		let explicit = options.provider && ZPT.providers[options.provider] ? options.provider : null;
		if (!ZPT.prefs.getBool('provider.autoFallback')) {
			return explicit ? [explicit] : [routeFor(options.text || '', options.sourceLang).provider];
		}
		if (explicit) {
			let others = Object.keys(ZPT.providers)
				.filter((id) => id !== explicit)
				.filter(isConfigured)
				.sort((a, b) => (ZPT.providers[a].needsApiKey ? 1 : 0) - (ZPT.providers[b].needsApiKey ? 1 : 0));
			// A service that just failed sinks below its healthy peers
			let healthy = dropUnhealthy(others);
			return [explicit].concat(healthy, others.filter((id) => !healthy.includes(id)));
		}
		// The router knows the text kind, so the chain can lead with the family
		// that suits it.
		let kind = ZPT.util.detectTextKind(options.text || '');
		return providerChain(ZPT.prefs.getBool('translate.autoRoute') ? kind : null, getProviderID());
	}

	function providerLabel(id) {
		let provider = getProvider(id);
		return ZPT.l10n.t(provider.labelKey || ('provider.' + provider.id));
	}

	function langLabel(code) {
		if (!code || code === 'auto') {
			return ZPT.l10n.t('ui.autoDetect');
		}
		return ZPT.l10n.langLabel(code);
	}

	/** Localized label for 'word' / 'sentence' / null. */
	function kindLabel(kind) {
		if (kind === 'word') {
			return ZPT.l10n.t('ui.kindWord');
		}
		if (kind === 'sentence') {
			return ZPT.l10n.t('ui.kindSentence');
		}
		return '';
	}

	function cacheKey(providerID, sourceLang, targetLang, text) {
		return providerID + '|' + sourceLang + '|' + targetLang + '|' + text;
	}

	function cacheGet(key) {
		if (!cache.has(key)) {
			return null;
		}
		let value = cache.get(key);
		// Refresh recency
		cache.delete(key);
		cache.set(key, value);
		return value;
	}

	function cacheSet(key, value) {
		cache.set(key, value);
		let limit = Math.max(0, ZPT.prefs.getNumber('cache.size'));
		while (cache.size > limit) {
			cache.delete(cache.keys().next().value);
		}
	}

	function clearCache() {
		cache.clear();
		unhealthy.clear();
	}

	function providerHealth() {
		let out = {};
		for (let id of Object.keys(ZPT.providers)) {
			out[id] = isUnhealthy(id) ? 'unhealthy' : 'ok';
		}
		return out;
	}

	/**
	 * Translate a piece of text with the configured (or given) provider.
	 *
	 * @param {String} rawText
	 * @param {Object} [options]
	 * @param {String} [options.provider] Use this provider first (routing off for this call)
	 * @param {String[]} [options.chain] Force the whole fallback chain
	 * @param {String} [options.sourceLang]
	 * @param {String} [options.targetLang]
	 * @param {Boolean} [options.force] Skip the cache
	 * @param {Object} [options.http] Transport override (tests)
	 * @returns {Promise<Object>} { text, provider, providerLabel, sourceLang, targetLang, detectedLang, kind, route, cached }
	 */
	async function translate(rawText, options) {
		options = options || {};
		let text = ZPT.util.normalizeText(rawText);
		if (!text) {
			throw ZPT.util.pluginError('emptyText');
		}
		let route = routeFor(text, options.sourceLang);
		// Callers that pass a source language keep control; otherwise the
		// router's choice (including the short-English-token rule) wins.
		if (!options.sourceLang || route.route) {
			options = Object.assign({}, options, { sourceLang: route.sourceLang });
		}
		let sourceLang = options.sourceLang || ZPT.prefs.getString('sourceLang') || 'auto';
		let targetLang = options.targetLang || ZPT.prefs.getString('targetLang') || 'zh-CN';
		let providerIDs = chainFor(Object.assign({ text }, options));
		let provider = getProvider(providerIDs[0]);

		let key = cacheKey(provider.id, sourceLang, targetLang, text);
		if (!options.force) {
			let hit = cacheGet(key);
			if (hit) {
				ZPT.log.debug('cache hit (' + text.length + ' chars)');
				return Object.assign({}, hit, { cached: true });
			}
		}

		let context = {
			text,
			sourceLang,
			targetLang,
			http: options.http || ZPT.http,
			log: ZPT.log,
			maxChars: ZPT.prefs.getNumber('request.maxCharsPerChunk')
		};

		let started = Date.now();
		let result = await runWithFallback(providerIDs, provider, context, !!options.force);
		result.sourceLang = sourceLang;
		result.targetLang = targetLang;
		result.requestedProvider = provider.id;
		result.providerLabel = providerLabel(result.provider);
		result.kind = route.kind;
		result.route = route.route;
		result.cached = false;
		// Key the entry by the service that actually answered, so a fallback
		// result is found again on the next identical request.
		if (result.provider !== provider.id) {
			key = cacheKey(result.provider, sourceLang, targetLang, text);
		}
		cacheSet(key, result);
		ZPT.log.debug('translated ' + text.length + ' chars ('
			+ (route.route || 'manual') + ') via ' + result.provider
			+ ' in ' + (Date.now() - started) + 'ms');
		return result;
	}

	async function runWithFallback(providerIDs, preferred, context, force) {
		let ordered = providerIDs.filter((id) => ZPT.providers[id]);
		if (!ordered.length) {
			ordered = [preferred.id];
		}
		// A service that already failed recently sinks below the healthy ones,
		// even when it is the only member of its family — otherwise the user
		// re-pays its full timeout on every request for the next five minutes.
		if (ordered.length > 1) {
			ordered = dropUnhealthy(ordered);
		}
		let firstError = null;
		let attempts = 0;
		for (let id of ordered) {
			let provider = ZPT.providers[id];
			// A provider that failed earlier in this same request must not be
			// tried again just because another one marked it unhealthy.
			if (attempts > 0 && isUnhealthy(id)) {
				continue;
			}
			attempts++;
			try {
				let result = await provider.translate(context);
				if (!result || !result.text) {
					throw ZPT.util.pluginError('emptyResult');
				}
				result.provider = provider.id;
				if (provider.id !== preferred.id) {
					result.fallbackFrom = preferred.id;
					markUnhealthy(preferred.id);
					ZPT.log.info('provider ' + preferred.id + ' failed, using ' + provider.id + ' instead');
				}
				else {
					markHealthy(provider.id);
				}
				return result;
			}
			catch (e) {
				if (provider.id === preferred.id) {
					firstError = e;
				}
				ZPT.log.warn('provider ' + provider.id + ' failed: ' + ((e && e.message) || e));
				if (!isRetryable(e)) {
					// Configuration problems (bad key, parsing) are not fixed by
					// trying another service.
					throw e;
				}
				markUnhealthy(provider.id);
			}
		}
		throw firstError || ZPT.util.pluginError('unknown', { detail: 'no provider succeeded' });
	}

	const SELF_TEST_TEXT = 'Translation is the communication of meaning from one language to another.';
	const SELF_TEST_WORD = 'transformer';

	/**
	 * Round-trip check against the configured service. Used by the settings
	 * pane button and by Zotero.PDFTranslate.selfTest() in Run JavaScript.
	 *
	 * With smart routing on, both routes are exercised: the sentence goes to the
	 * LLM and the single word to the free endpoint. Each step uses the same chain
	 * `translate()` would build (the user's own service leads its family), and
	 * `kind` / `steps` in the result describe what answered and what failed.
	 */
	async function selfTest(options) {
		options = options || {};
		let started = Date.now();
		let preferred = getProviderID();
		let firstText = options.text || SELF_TEST_TEXT;
		let plans = [];

		if (!options.provider && ZPT.prefs.getBool('translate.autoRoute')) {
			// Sentence first, then a single word — this covers both routes.
			let firstName = ZPT.util.detectTextKind(firstText);
			plans.push({
				text: firstText,
				chain: routableChain(firstName, preferred)
			});
			let secondName = firstName === 'word' ? 'sentence' : 'word';
			plans.push({
				text: secondName === 'word' ? SELF_TEST_WORD : SELF_TEST_TEXT,
				chain: routableChain(secondName, preferred)
			});
		}
		else {
			plans.push({
				text: firstText,
				chain: chainFor(Object.assign({ text: firstText }, options))
			});
		}

		let steps = [];
		let lastError = null;
		plans.forEach((plan) => {
			plan.head = plan.chain[0];
		});
		for (let plan of plans) {
			try {
				let result = await translate(plan.text, {
					force: true,
					sourceLang: options.sourceLang || 'en',
					chain: plan.chain
				});
				steps.push({
					kind: result.kind,
					provider: result.provider,
					providerLabel: result.providerLabel,
					translation: result.text,
					fallbackFrom: result.fallbackFrom || null
				});
			}
			catch (e) {
				lastError = e;
				steps.push({
					kind: ZPT.util.detectTextKind(plan.text),
					provider: plan.head,
					error: (e && (e.message || e.code)) || String(e)
				});
			}
		}

		let first = steps.find((step) => !step.error);
		if (!first) {
			let error = lastError || ZPT.util.pluginError('unknown', { detail: 'self test failed' });
			error.steps = steps;
			throw error;
		}
		return {
			ok: true,
			provider: first.provider,
			providerLabel: first.providerLabel,
			// Only report a switch that really happened in the successful step
			fallbackFrom: first.fallbackFrom || null,
			targetLang: ZPT.prefs.getString('targetLang'),
			ms: Date.now() - started,
			translation: first.translation,
			kind: first.kind,
			steps
		};
	}

	return {
		translate,
		selfTest,
		clearCache,
		providerHealth,
		getProvider,
		getProviderID,
		providerChain,
		providerLabel,
		kindLabel,
		langLabel,
		SELF_TEST_TEXT,
		SELF_TEST_WORD
	};
})();
