/*
 * MyMemory provider — a free, key-less translation API
 * (https://mymemory.translated.net/doc/spec.php).
 *
 * Useful as a fallback when the Google endpoint is not reachable (e.g. from
 * mainland China). Limits for anonymous use: ~500 bytes per request and
 * ~5000 characters per day; adding an email address raises the daily quota.
 */

/* eslint-disable no-var */
var ZPT = (typeof ZPT !== 'undefined' && ZPT) ? ZPT : {};

ZPT.providers = ZPT.providers || {};

ZPT.providers.mymemory = (function () {
	const ID = 'mymemory';
	const DEFAULT_ENDPOINT = 'https://api.mymemory.translated.net/get';
	// The API rejects `q` longer than 500 bytes
	const MAX_CHUNK_CHARS = 400;
	const MAX_ENCODED_CHARS = 1500;

	function endpoint() {
		let value = ZPT.prefs.getString('mymemory.endpoint').trim();
		return value || DEFAULT_ENDPOINT;
	}

	function buildURL(text, sourceLang, targetLang) {
		let source = sourceLang && sourceLang !== 'auto' ? sourceLang : 'Autodetect';
		let params = [
			['q', text],
			['langpair', source + '|' + (targetLang || 'zh-CN')]
		];
		let email = ZPT.prefs.getString('mymemory.email').trim();
		if (email) {
			params.push(['de', email]);
		}
		let query = params
			.map((pair) => encodeURIComponent(pair[0]) + '=' + encodeURIComponent(pair[1]))
			.join('&');
		return endpoint() + '?' + query;
	}

	function parse(data) {
		let status = data && data.responseStatus;
		if (status !== undefined && status !== null && String(status) !== '200') {
			let detail = String((data && data.responseDetails) || '');
			if (/all available free translations|used all|quota|limit|too many|bytes|not available for anonymous|next available/i.test(detail)) {
				throw ZPT.util.pluginError('quota');
			}
			throw ZPT.util.pluginError('server', { status });
		}
		let text = data && data.responseData ? data.responseData.translatedText : null;
		if (typeof text !== 'string' || !text.trim()) {
			throw ZPT.util.pluginError('emptyResult');
		}
		return { text: text.trim(), detectedLang: null };
	}

	async function translate(context) {
		let chunks = ZPT.util.chunkText(context.text, {
			maxChars: MAX_CHUNK_CHARS,
			maxEncoded: MAX_ENCODED_CHARS
		});
		if (!chunks.length) {
			throw ZPT.util.pluginError('emptyText');
		}
		let parts = [];
		for (let chunk of chunks) {
			let url = buildURL(chunk, context.sourceLang, context.targetLang);
			let response = await context.http.requestJSON('GET', url, { debugURL: endpoint() });
			parts.push(parse(response.body).text);
		}
		return {
			text: parts.join('\n').trim(),
			detectedLang: context.sourceLang && context.sourceLang !== 'auto' ? context.sourceLang : null,
			provider: ID
		};
	}

	return {
		id: ID,
		labelKey: 'provider.' + ID,
		needsApiKey: false,
		isConfigured: () => true,
		translate,
		parse,
		buildURL,
		endpoint,
		MAX_CHUNK_CHARS
	};
})();
