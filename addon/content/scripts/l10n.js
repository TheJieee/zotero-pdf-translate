/*
 * Localization for the PDF Translate plugin.
 *
 * Small built-in dictionary (en-US / zh-CN) so that the plugin never depends on
 * Zotero's plugin FTL registration. This file is also loaded into the
 * preferences-pane sandbox, so it must not reference anything besides ZPT.
 */

/* eslint-disable no-var */
var ZPT = (typeof ZPT !== 'undefined' && ZPT) ? ZPT : {};

ZPT.l10n = (function () {
	const STRINGS = {
		'en-US': {
			'ui.buttonTitle': 'Translate selected text',
			'ui.cardTitle': 'Translate',
			'ui.loading': 'Translating…',
			'ui.sourceLabel': 'Original',
			'ui.targetLabel': 'Translation',
			'ui.copy': 'Copy',
			'ui.copied': 'Copied',
			'ui.annotate': 'Save as annotation',
			'ui.annotating': 'Saving…',
			'ui.annotated': 'Saved as annotation',
			'ui.retry': 'Retry',
			'ui.close': 'Close',
			'ui.autoDetect': 'Auto-detect',
			'ui.meta': '{provider} · {source} → {target}',
			'ui.metaDetected': '{provider} · {source} → {target}',
			'ui.fallbackSuffix': ' · switched from {from}',
			'ui.cached': 'cached',
			'ui.charCount': '{count} chars',
			'ui.pinHint': 'Drag the header to move',

			'error.timeout': 'The translation service did not respond in time. Please try again.',
			'error.network': 'Network error. Check your internet connection or proxy settings.',
			'error.auth': 'Authentication failed (HTTP {status}). Check your API key.',
			'error.rateLimit': 'Rate limit reached (HTTP 429). Wait a moment and try again.',
			'error.server': 'The translation service returned an error (HTTP {status}).',
			'error.http': 'Request failed (HTTP {status}).',
			'error.unknown': 'Translation failed: {detail}',
			'error.emptyText': 'Nothing to translate.',
			'error.noApiKey': 'No API key configured. Open Settings → PDF Translate and add one.',
			'error.noAttachment': 'Could not find the PDF attachment for this reader.',
			'error.emptyResult': 'The translation service returned an empty result.',
			'error.parse': 'Could not understand the response from the translation service.',
			'error.quota': 'The free translation quota is used up (MyMemory allows ~5000 characters/day). Add an email address in the settings or switch to another service.',
			'error.annotationDisabled': 'Saving translations as annotations is disabled in the plugin settings.',

			'provider.google-free': 'Google Translate (free endpoint)',
			'provider.mymemory': 'MyMemory (free, no key needed)',
			'provider.openai': 'OpenAI-compatible API',

			'prefs.paneLabel': 'PDF Translate',
			'prefs.general': 'General',
			'prefs.provider': 'Translation service',
			'prefs.provider.hint': 'The free Google endpoint needs no configuration. The OpenAI-compatible option works with OpenAI, DeepSeek, Moonshot, local Ollama, and similar services.',
			'prefs.provider.autoFallback': 'Automatically switch to another configured service when the selected one is unreachable',
			'prefs.sourceLang': 'Source language',
			'prefs.targetLang': 'Target language',
			'prefs.popup': 'Reader popup',
			'prefs.popup.showButton': 'Show a translate button in the text-selection popup',
			'prefs.popup.buttonLabel': 'Button label',
			'prefs.popup.width': 'Card width (px)',
			'prefs.popup.showSource': 'Show the original text in the card',
			'prefs.annotation': 'Annotations',
			'prefs.annotation.enabled': 'Allow saving a translation as an annotation comment',
			'prefs.annotation.type': 'Annotation type',
			'prefs.annotation.color': 'Annotation color',
			'prefs.google': 'Google (free endpoint)',
			'prefs.google.endpoint': 'Endpoint',
			'prefs.google.hint': 'Unstable but free and key-less. If the request fails, try again later or switch to another service.',
			'prefs.mymemory': 'MyMemory (free, no key needed)',
			'prefs.mymemory.endpoint': 'Endpoint',
			'prefs.mymemory.email': 'Email (optional, raises the daily quota)',
			'prefs.mymemory.hint': 'Reachable without a proxy. Anonymous use is limited to about 5000 characters per day.',
			'prefs.openai': 'OpenAI-compatible API',
			'prefs.openai.baseURL': 'Base URL',
			'prefs.openai.apiKey': 'API key',
			'prefs.openai.model': 'Model',
			'prefs.openai.systemPrompt': 'System prompt (optional)',
			'prefs.openai.systemPrompt.hint': 'Leave empty for the built-in academic translation prompt.',
			'prefs.advanced': 'Advanced',
			'prefs.timeout': 'Request timeout (seconds)',
			'prefs.maxChars': 'Max characters per request',
			'prefs.debug': 'Write debug messages to the Zotero debug log',
			'prefs.selfTest': 'Test translation service',
			'prefs.selfTest.running': 'Testing…',
			'prefs.selfTest.ok': 'OK: {text}',
			'prefs.selfTest.failed': 'Failed: {text}'
		},
		'zh-CN': {
			'ui.buttonTitle': '翻译选中文本',
			'ui.cardTitle': '划词翻译',
			'ui.loading': '翻译中…',
			'ui.sourceLabel': '原文',
			'ui.targetLabel': '译文',
			'ui.copy': '复制',
			'ui.copied': '已复制',
			'ui.annotate': '存为批注',
			'ui.annotating': '保存中…',
			'ui.annotated': '已保存为批注',
			'ui.retry': '重试',
			'ui.close': '关闭',
			'ui.autoDetect': '自动检测',
			'ui.meta': '{provider} · {source} → {target}',
			'ui.metaDetected': '{provider} · {source} → {target}',
			'ui.fallbackSuffix': ' · 已从 {from} 自动切换',
			'ui.cached': '缓存',
			'ui.charCount': '{count} 字符',
			'ui.pinHint': '拖动标题栏可移动',

			'error.timeout': '翻译服务响应超时，请稍后重试。',
			'error.network': '网络错误，请检查网络连接或代理设置。',
			'error.auth': '鉴权失败（HTTP {status}），请检查 API Key。',
			'error.rateLimit': '请求过于频繁（HTTP 429），请稍后重试。',
			'error.server': '翻译服务返回错误（HTTP {status}）。',
			'error.http': '请求失败（HTTP {status}）。',
			'error.unknown': '翻译失败：{detail}',
			'error.emptyText': '没有可翻译的文本。',
			'error.noApiKey': '尚未配置 API Key，请在「设置 → PDF Translate」中填写。',
			'error.noAttachment': '找不到该阅读器对应的附件条目。',
			'error.emptyResult': '翻译服务返回了空结果。',
			'error.parse': '无法解析翻译服务返回的内容。',
			'error.quota': '免费翻译额度已用尽（MyMemory 匿名使用约 5000 字符/天）。可在设置中填写邮箱提高额度，或改用其他翻译服务。',
			'error.annotationDisabled': '插件设置中已关闭「把译文存为批注」。',

			'provider.google-free': 'Google 翻译（免费接口）',
			'provider.mymemory': 'MyMemory 翻译（免费、无需 Key）',
			'provider.openai': 'OpenAI 兼容接口',

			'prefs.paneLabel': '划词翻译',
			'prefs.general': '常规',
			'prefs.provider': '翻译服务',
			'prefs.provider.hint': 'Google 免费接口无需配置即可使用；OpenAI 兼容接口可用于 OpenAI、DeepSeek、通义、Kimi 以及本地 Ollama 等服务。',
			'prefs.provider.autoFallback': '当所选服务不可用时，自动切换到其他已配置的服务',
			'prefs.sourceLang': '源语言',
			'prefs.targetLang': '目标语言',
			'prefs.popup': '阅读器悬浮气泡',
			'prefs.popup.showButton': '在划词弹出的工具条中显示翻译按钮',
			'prefs.popup.buttonLabel': '按钮文字',
			'prefs.popup.width': '卡片宽度（像素）',
			'prefs.popup.showSource': '在卡片中显示原文',
			'prefs.annotation': '批注',
			'prefs.annotation.enabled': '允许把译文保存为批注注释',
			'prefs.annotation.type': '批注类型',
			'prefs.annotation.color': '批注颜色',
			'prefs.google': 'Google（免费接口）',
			'prefs.google.endpoint': '接口地址',
			'prefs.google.hint': '免费、无需 Key，但接口不稳定；失败时可稍后重试或改用其他服务。',
			'prefs.mymemory': 'MyMemory（免费接口）',
			'prefs.mymemory.endpoint': '接口地址',
			'prefs.mymemory.email': '邮箱（可选，可提高每日额度）',
			'prefs.mymemory.hint': '无需代理即可访问，匿名使用每天约 5000 字符。',
			'prefs.openai': 'OpenAI 兼容接口',
			'prefs.openai.baseURL': '接口地址（Base URL）',
			'prefs.openai.apiKey': 'API Key',
			'prefs.openai.model': '模型',
			'prefs.openai.systemPrompt': '系统提示词（可选）',
			'prefs.openai.systemPrompt.hint': '留空则使用内置的学术翻译提示词。',
			'prefs.advanced': '高级',
			'prefs.timeout': '请求超时（秒）',
			'prefs.maxChars': '单次请求最大字符数',
			'prefs.debug': '在 Zotero 调试日志中输出调试信息',
			'prefs.selfTest': '测试翻译服务',
			'prefs.selfTest.running': '测试中…',
			'prefs.selfTest.ok': '成功：{text}',
			'prefs.selfTest.failed': '失败：{text}'
		}
	};

	// Labels for language menus, keyed by the BCP-47 tag used in prefs.
	const LANG_LABELS = {
		'auto': '自动检测 / Auto-detect',
		'zh-CN': '中文（简体） / Chinese (Simplified)',
		'zh-TW': '中文（繁體） / Chinese (Traditional)',
		'en': 'English / 英语',
		'ja': '日本語 / 日语',
		'ko': '한국어 / 韩语',
		'fr': 'Français / 法语',
		'de': 'Deutsch / 德语',
		'es': 'Español / 西班牙语',
		'ru': 'Русский / 俄语',
		'pt': 'Português / 葡萄牙语',
		'it': 'Italiano / 意大利语',
		'ar': 'العربية / 阿拉伯语',
		'hi': 'हिन्दी / 印地语'
	};

	let locale = null;

	function detectLocale() {
		let candidates = [];
		try {
			if (typeof Zotero !== 'undefined' && Zotero.locale) {
				candidates.push(Zotero.locale);
			}
		}
		catch (e) {}
		try {
			if (typeof Services !== 'undefined' && Services.locale) {
				candidates.push(Services.locale.appLocaleAsBCP47);
				let locales = Services.locale.requestedLocales;
				if (locales && locales.length) {
					candidates.push(locales[0]);
				}
			}
		}
		catch (e) {}
		for (let candidate of candidates) {
			if (!candidate) {
				continue;
			}
			let value = String(candidate);
			if (STRINGS[value]) {
				return value;
			}
			if (/^zh/i.test(value)) {
				return /tw|hk|hant/i.test(value) ? 'zh-TW' : 'zh-CN';
			}
			if (/^en/i.test(value)) {
				return 'en-US';
			}
		}
		return 'en-US';
	}

	function getLocale() {
		if (!locale) {
			locale = detectLocale();
		}
		return locale;
	}

	/**
	 * Translate a string id, substituting {placeholders}.
	 */
	function t(key, args) {
		let table = STRINGS[getLocale()] || STRINGS['en-US'];
		let value = table[key];
		if (value === undefined) {
			value = STRINGS['en-US'][key];
		}
		if (value === undefined) {
			return key;
		}
		if (args) {
			for (let name of Object.keys(args)) {
				value = value.split('{' + name + '}').join(String(args[name]));
			}
		}
		return value;
	}

	function langLabel(code) {
		return LANG_LABELS[code] || code;
	}

	return {
		t,
		getLocale,
		langLabel,
		LANG_LABELS
	};
})();
