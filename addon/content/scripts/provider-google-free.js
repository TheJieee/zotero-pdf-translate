/*
 * Google Translate provider using the free, key-less web endpoint
 * (the same one the Google Translate browser extension uses).
 *
 *   GET https://translate.googleapis.com/translate_a/single
 *       ?client=gtx&sl=auto&tl=zh-CN&dt=t&dj=1&q=<text>
 *
 * With dj=1 the response is {"sentences":[{"trans":...}],"src":"en",...}.
 * The legacy array form is parsed too, in case the endpoint changes.
 */

/* eslint-disable no-var */
var ZPT = (typeof ZPT !== 'undefined' && ZPT) ? ZPT : {};

ZPT.providers = ZPT.providers || {};

ZPT.providers['google-free'] = (function () {
	const ID = 'google-free';
	const DEFAULT_ENDPOINT = 'https://translate.googleapis.com/translate_a/single';
	const MAX_CHUNK_CHARS = 1500;
	const MAX_ENCODED_CHARS = 3500;

	function endpoint() {
		let value = ZPT.prefs.getString('googleFree.endpoint').trim();
		return value || DEFAULT_ENDPOINT;
	}

	function buildURL(text, sourceLang, targetLang) {
		let params = [
			['client', 'gtx'],
			['sl', sourceLang || 'auto'],
			['tl', targetLang || 'zh-CN'],
			['dt', 't'],
			['dj', '1'],
			['q', text]
		];
		let query = params
			.map((pair) => encodeURIComponent(pair[0]) + '=' + encodeURIComponent(pair[1]))
			.join('&');
		return endpoint() + '?' + query;
	}

	function parse(data) {
		if (data && Array.isArray(data.sentences)) {
			let text = data.sentences
				.map((sentence) => (sentence && sentence.trans) || '')
				.join('');
			return { text, detectedLang: data.src || null };
		}
		// Legacy format: [[["translated","original",...],...],null,"en",...]
		if (Array.isArray(data) && Array.isArray(data[0])) {
			let text = data[0]
				.map((segment) => (segment && segment[0]) || '')
				.join('');
			return { text, detectedLang: data[2] || null };
		}
		throw ZPT.util.pluginError('parse');
	}

	async function translate(context) {
		let chunks = ZPT.util.chunkText(context.text, {
			maxChars: context.maxChars || MAX_CHUNK_CHARS,
			maxEncoded: MAX_ENCODED_CHARS
		});
		if (!chunks.length) {
			throw ZPT.util.pluginError('emptyText');
		}
		let parts = [];
		let detectedLang = null;
		for (let chunk of chunks) {
			let url = buildURL(chunk, context.sourceLang, context.targetLang);
			let response = await context.http.requestJSON('GET', url, { debugURL: endpoint() });
			let parsed = parse(response.body);
			if (!detectedLang && parsed.detectedLang) {
				detectedLang = parsed.detectedLang;
			}
			parts.push(parsed.text);
		}
		let text = parts.join('\n').trim();
		if (!text) {
			throw ZPT.util.pluginError('emptyResult');
		}
		return { text, detectedLang, provider: ID };
	}

	return {
		id: ID,
		labelKey: 'provider.' + ID,
		// Family used by the smart router: 'free' = dictionary-ish web endpoint,
		// 'llm' = chat-completions model
		kind: 'free',
		needsApiKey: false,
		isConfigured: () => true,
		translate,
		parse,
		buildURL,
		endpoint,
		MAX_CHUNK_CHARS
	};
})();
