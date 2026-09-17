/*
 * Preference access. Keys are declared in addon/prefs.js under
 * extensions.zotero.pdfTranslate.* and read here through the short form
 * accepted by Zotero.Prefs (which prepends extensions.zotero.).
 */

/* eslint-disable no-var */
var ZPT = (typeof ZPT !== 'undefined' && ZPT) ? ZPT : {};

ZPT.prefs = (function () {
	const PREFIX = 'pdfTranslate.';

	const DEFAULTS = {
		provider: 'google-free',
		'provider.autoFallback': true,
		// Smart routing: word -> free endpoint, sentence -> LLM, with fallback
		'translate.autoRoute': true,
		sourceLang: 'auto',
		targetLang: 'zh-CN',
		'popup.showButton': true,
		'popup.buttonLabel': '译',
		'popup.width': 380,
		'popup.showSource': true,
		'popup.closeOnClickOutside': true,
		'annotation.enabled': true,
		'annotation.type': 'highlight',
		'annotation.color': '#ffd400',
		'googleFree.endpoint': 'https://translate.googleapis.com/translate_a/single',
		'mymemory.endpoint': 'https://api.mymemory.translated.net/get',
		'mymemory.email': '',
		'openai.baseURL': 'https://api.openai.com/v1',
		'openai.apiKey': '',
		'openai.model': 'gpt-4o-mini',
		'openai.systemPrompt': '',
		'request.timeout': 20,
		'request.maxCharsPerChunk': 1500,
		'cache.size': 200,
		debug: false,
		selfTestOnStartup: false,
		selfTestFile: ''
	};

	function get(key) {
		let fallback = DEFAULTS[key];
		let value;
		try {
			value = Zotero.Prefs.get(PREFIX + key);
		}
		catch (e) {
			return fallback;
		}
		// An empty string is a meaningful value for the text prefs (API key,
		// system prompt), so only undefined/null fall back to the default.
		if (value === undefined || value === null) {
			return fallback;
		}
		return value;
	}

	function getString(key) {
		let value = get(key);
		return value === undefined || value === null ? '' : String(value);
	}

	function getNumber(key) {
		let value = Number(get(key));
		if (!isFinite(value)) {
			value = Number(DEFAULTS[key]);
		}
		return isFinite(value) ? value : 0;
	}

	function getBool(key) {
		return !!get(key);
	}

	function set(key, value) {
		return Zotero.Prefs.set(PREFIX + key, value);
	}

	function all() {
		let out = {};
		for (let key of Object.keys(DEFAULTS)) {
			out[key] = get(key);
		}
		return out;
	}

	return { get, getString, getNumber, getBool, set, all, DEFAULTS, PREFIX };
})();
