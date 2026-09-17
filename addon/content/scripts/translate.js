/*
 * Translation orchestration: provider selection, result cache, language
 * handling and the self test used by the settings pane.
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

	function getProviderID() {
		return ZPT.prefs.getString('provider') || 'google-free';
	}

	function getProvider(id) {
		let key = id || getProviderID();
		return ZPT.providers[key] || ZPT.providers['google-free'];
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

	/**
	 * Preferred provider first, then the other configured providers
	 * (key-less ones first). If the preferred provider recently failed, it is
	 * moved to the back so the user is not kept waiting for a timeout.
	 */
	function candidateProviders(preferred) {
		if (!ZPT.prefs.getBool('provider.autoFallback')) {
			return [preferred];
		}
		let others = Object.keys(ZPT.providers)
			.map((id) => ZPT.providers[id])
			.filter((provider) => provider.id !== preferred.id)
			.filter((provider) => (typeof provider.isConfigured === 'function' ? provider.isConfigured() : true))
			.sort((a, b) => (a.needsApiKey ? 1 : 0) - (b.needsApiKey ? 1 : 0));
		if (isUnhealthy(preferred.id) && others.length) {
			return others.concat([preferred]);
		}
		return [preferred].concat(others);
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
	 * @param {String} [options.provider] Provider id
	 * @param {String} [options.sourceLang]
	 * @param {String} [options.targetLang]
	 * @param {Boolean} [options.force] Skip the cache
	 * @param {Object} [options.http] Transport override (tests)
	 * @returns {Promise<Object>} { text, provider, providerLabel, sourceLang, targetLang, detectedLang, cached }
	 */
	async function translate(rawText, options) {
		options = options || {};
		let text = ZPT.util.normalizeText(rawText);
		if (!text) {
			throw ZPT.util.pluginError('emptyText');
		}
		let sourceLang = options.sourceLang || ZPT.prefs.getString('sourceLang') || 'auto';
		let targetLang = options.targetLang || ZPT.prefs.getString('targetLang') || 'zh-CN';
		let provider = getProvider(options.provider);

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
		let result = await runWithFallback(provider, context, !!options.force);
		result.sourceLang = sourceLang;
		result.targetLang = targetLang;
		result.requestedProvider = provider.id;
		result.providerLabel = providerLabel(result.provider);
		result.cached = false;
		cacheSet(key, result);
		ZPT.log.debug('translated ' + text.length + ' chars via ' + result.provider
			+ ' in ' + (Date.now() - started) + 'ms');
		return result;
	}

	async function runWithFallback(preferred, context, force) {
		let candidates = candidateProviders(preferred);
		let firstError = null;
		for (let provider of candidates) {
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

	/**
	 * Round-trip check against the configured service. Used by the settings
	 * pane button and by Zotero.PDFTranslate.selfTest() in Run JavaScript.
	 */
	async function selfTest(options) {
		options = options || {};
		let text = options.text || SELF_TEST_TEXT;
		let started = Date.now();
		let result = await translate(text, {
			force: true,
			sourceLang: options.sourceLang || 'en',
			provider: options.provider
		});
		return {
			ok: true,
			provider: result.provider,
			providerLabel: result.providerLabel,
			fallbackFrom: result.fallbackFrom || null,
			targetLang: result.targetLang,
			ms: Date.now() - started,
			translation: result.text
		};
	}

	return {
		translate,
		selfTest,
		clearCache,
		providerHealth,
		getProvider,
		getProviderID,
		providerLabel,
		langLabel,
		SELF_TEST_TEXT
	};
})();
