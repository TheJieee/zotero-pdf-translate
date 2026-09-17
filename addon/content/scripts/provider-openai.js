/*
 * OpenAI-compatible chat-completions provider.
 * Works with OpenAI, DeepSeek, Moonshot, SiliconFlow, local Ollama/LM Studio,
 * or any other service exposing POST {baseURL}/chat/completions.
 */

/* eslint-disable no-var */
var ZPT = (typeof ZPT !== 'undefined' && ZPT) ? ZPT : {};

ZPT.providers = ZPT.providers || {};

ZPT.providers['openai'] = (function () {
	const ID = 'openai';
	const DEFAULT_BASE_URL = 'https://api.openai.com/v1';
	const MAX_CHUNK_CHARS = 3000;
	const MAX_ENCODED_CHARS = 12000;

	function settings() {
		return {
			baseURL: ZPT.prefs.getString('openai.baseURL').trim() || DEFAULT_BASE_URL,
			apiKey: ZPT.prefs.getString('openai.apiKey').trim(),
			model: ZPT.prefs.getString('openai.model').trim() || 'gpt-4o-mini',
			systemPrompt: ZPT.prefs.getString('openai.systemPrompt').trim()
		};
	}

	function defaultSystemPrompt(targetLang) {
		return 'You are a professional academic translator. Translate the text provided by '
			+ 'the user into ' + ZPT.util.promptLangName(targetLang) + '.\n'
			+ 'Rules:\n'
			+ '1. Output only the translation — no explanations, notes, pinyin or quotation marks.\n'
			+ '2. Preserve the paragraph structure, formulas, citation markers ([12], (Smith, 2020)) '
			+ 'and numbers exactly as they appear.\n'
			+ '3. Translate terminology accurately and consistently; keep well-known proper nouns '
			+ 'and abbreviations in their conventional form.\n'
			+ '4. If the text is already in the target language, return it unchanged.';
	}

	function isLocalURL(url) {
		return /(^|\/\/)(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:|\/|$)/i.test(url);
	}

	function buildRequest(config, text, sourceLang, targetLang) {
		let systemPrompt = config.systemPrompt || defaultSystemPrompt(targetLang);
		if (config.systemPrompt && sourceLang && sourceLang !== 'auto') {
			systemPrompt += '\nThe source language is ' + ZPT.util.promptLangName(sourceLang) + '.';
		}
		let payload = {
			model: config.model,
			temperature: 0,
			stream: false,
			messages: [
				{ role: 'system', content: systemPrompt },
				{ role: 'user', content: text }
			]
		};
		let headers = {
			'Content-Type': 'application/json',
			'Accept': 'application/json'
		};
		if (config.apiKey) {
			headers['Authorization'] = 'Bearer ' + config.apiKey;
		}
		return {
			url: ZPT.util.joinURL(config.baseURL, 'chat/completions'),
			body: JSON.stringify(payload),
			headers
		};
	}

	function parse(data) {
		let choice = data && Array.isArray(data.choices) ? data.choices[0] : null;
		let content = choice && choice.message ? choice.message.content : null;
		if (Array.isArray(content)) {
			content = content.map((part) => (part && part.text) || '').join('');
		}
		if (typeof content !== 'string' || !content.trim()) {
			throw ZPT.util.pluginError('emptyResult');
		}
		// Some models wrap the answer in a fenced code block
		let text = content.trim().replace(/^```[a-zA-Z]*\s*/, '').replace(/\s*```$/, '').trim();
		if (!text) {
			throw ZPT.util.pluginError('emptyResult');
		}
		return { text };
	}

	async function translate(context) {
		let config = settings();
		if (!config.apiKey && !isLocalURL(config.baseURL)) {
			throw ZPT.util.pluginError('noApiKey');
		}
		let chunks = ZPT.util.chunkText(context.text, {
			maxChars: context.maxChars || MAX_CHUNK_CHARS,
			maxEncoded: MAX_ENCODED_CHARS
		});
		if (!chunks.length) {
			throw ZPT.util.pluginError('emptyText');
		}
		let parts = [];
		for (let chunk of chunks) {
			let request = buildRequest(config, chunk, context.sourceLang, context.targetLang);
			let response = await context.http.requestJSON('POST', request.url, {
				body: request.body,
				headers: request.headers,
				debugURL: request.url
			});
			parts.push(parse(response.body).text);
		}
		return {
			text: parts.join('\n\n').trim(),
			detectedLang: context.sourceLang && context.sourceLang !== 'auto' ? context.sourceLang : null,
			provider: ID,
			model: config.model
		};
	}

	return {
		id: ID,
		labelKey: 'provider.' + ID,
		needsApiKey: true,
		isConfigured: () => {
			let config = settings();
			return !!config.apiKey || isLocalURL(config.baseURL);
		},
		translate,
		parse,
		buildRequest,
		defaultSystemPrompt,
		settings,
		isLocalURL,
		MAX_CHUNK_CHARS
	};
})();
