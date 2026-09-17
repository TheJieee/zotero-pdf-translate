/*
 * Preferences pane logic.
 *
 * Loaded by Zotero as a pane script, i.e. into its own sandbox whose prototype
 * is the preferences window, *before* the pane markup is inserted. Strings come
 * from the plugin dictionary in content/scripts/l10n.js, which is loaded into
 * the same sandbox first; pref values are bound declaratively in the markup
 * through `preference` attributes.
 */

/* global Zotero, document, MutationObserver, setTimeout, clearInterval, clearTimeout */

(function () {
	const ROOT_ID = 'zpt-prefpane';
	const XUL_NS = 'http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul';

	const SOURCE_LANGS = ['auto', 'zh-CN', 'zh-TW', 'en', 'ja', 'ko', 'fr', 'de', 'es', 'ru', 'pt', 'it', 'ar', 'hi'];
	const TARGET_LANGS = ['zh-CN', 'zh-TW', 'en', 'ja', 'ko', 'fr', 'de', 'es', 'ru', 'pt', 'it', 'ar', 'hi'];

	const ANNOTATION_TYPE_LABELS = {
		highlight: { 'en-US': 'Highlight', 'zh-CN': '高亮' },
		underline: { 'en-US': 'Underline', 'zh-CN': '下划线' }
	};

	const COLOR_LABELS = {
		'#ffd400': { 'en-US': 'Yellow', 'zh-CN': '黄色' },
		'#ff6666': { 'en-US': 'Red', 'zh-CN': '红色' },
		'#5fb236': { 'en-US': 'Green', 'zh-CN': '绿色' },
		'#2ea8e5': { 'en-US': 'Blue', 'zh-CN': '蓝色' },
		'#a28ae5': { 'en-US': 'Purple', 'zh-CN': '紫色' }
	};

	function t(key, args) {
		return ZPT.l10n.t(key, args);
	}

	function logDebug(message) {
		try {
			if (ZPT.log) {
				ZPT.log.debug(message);
			}
		}
		catch (e) {}
	}

	function logError(message, exception) {
		try {
			if (ZPT.log) {
				ZPT.log.error(message, exception);
			}
		}
		catch (e) {}
	}

	function byId(id) {
		return document.getElementById(id);
	}

	function setText(id, text) {
		let element = byId(id);
		if (!element) {
			return;
		}
		// XUL labels render their `value`, XUL buttons their `label`
		if (element.namespaceURI === XUL_NS) {
			if (element.localName === 'label') {
				element.setAttribute('value', text);
				return;
			}
			if (element.localName === 'button') {
				element.setAttribute('label', text);
				return;
			}
		}
		element.textContent = text;
	}

	function setLabel(id, text) {
		let element = byId(id);
		if (!element) {
			return;
		}
		element.setAttribute('label', text);
	}

	function localized(map, code) {
		let locale = ZPT.l10n.getLocale() === 'zh-CN' ? 'zh-CN' : 'en-US';
		return (map[code] && (map[code][locale] || map[code]['en-US'])) || code;
	}

	function createMenuItem(value, label) {
		let item;
		if (typeof document.createXULElement === 'function') {
			item = document.createXULElement('menuitem');
		}
		else {
			item = document.createElementNS(XUL_NS, 'menuitem');
		}
		item.setAttribute('value', value);
		item.setAttribute('label', label);
		return item;
	}

	function populateLanguages() {
		let sourcePopup = byId('zpt-source-lang-popup');
		if (sourcePopup && !sourcePopup.childElementCount) {
			for (let code of SOURCE_LANGS) {
				sourcePopup.appendChild(createMenuItem(code, ZPT.l10n.langLabel(code)));
			}
		}
		let targetPopup = byId('zpt-target-lang-popup');
		if (targetPopup && !targetPopup.childElementCount) {
			for (let code of TARGET_LANGS) {
				targetPopup.appendChild(createMenuItem(code, ZPT.l10n.langLabel(code)));
			}
		}
	}

	function populateAnnotationTypes() {
		setLabel('zpt-annotation-highlight', localized(ANNOTATION_TYPE_LABELS, 'highlight'));
		setLabel('zpt-annotation-underline', localized(ANNOTATION_TYPE_LABELS, 'underline'));
		for (let color of Object.keys(COLOR_LABELS)) {
			setLabel('zpt-color-' + colorName(color), localized(COLOR_LABELS, color));
		}
	}

	function colorName(color) {
		return {
			'#ffd400': 'yellow',
			'#ff6666': 'red',
			'#5fb236': 'green',
			'#2ea8e5': 'blue',
			'#a28ae5': 'purple'
		}[color] || color;
	}

	function applyStrings() {
		setText('zpt-heading-general', t('prefs.general'));
		setLabel('zpt-label-provider', t('prefs.provider'));
		setLabel('zpt-provider-google-free', t('provider.google-free'));
		setLabel('zpt-provider-mymemory', t('provider.mymemory'));
		setLabel('zpt-provider-openai', t('provider.openai'));
		setText('zpt-hint-provider', t('prefs.provider.hint'));
		setLabel('zpt-auto-route', t('prefs.route'));
		setText('zpt-hint-route', t('prefs.route.hint'));
		setLabel('zpt-auto-fallback', t('prefs.provider.autoFallback'));
		setLabel('zpt-label-source-lang', t('prefs.sourceLang'));
		setLabel('zpt-label-target-lang', t('prefs.targetLang'));

		setText('zpt-heading-popup', t('prefs.popup'));
		setLabel('zpt-show-button', t('prefs.popup.showButton'));
		setLabel('zpt-label-button-label', t('prefs.popup.buttonLabel'));
		setLabel('zpt-label-card-width', t('prefs.popup.width'));
		setLabel('zpt-show-source', t('prefs.popup.showSource'));
		setLabel('zpt-close-outside', t('prefs.popup.closeOnClickOutside'));

		setText('zpt-heading-annotation', t('prefs.annotation'));
		setLabel('zpt-annotation-enabled', t('prefs.annotation.enabled'));
		setLabel('zpt-label-annotation-type', t('prefs.annotation.type'));
		setLabel('zpt-label-annotation-color', t('prefs.annotation.color'));

		setText('zpt-heading-google', t('prefs.google'));
		setLabel('zpt-label-google-endpoint', t('prefs.google.endpoint'));
		setText('zpt-hint-google', t('prefs.google.hint'));

		setText('zpt-heading-mymemory', t('prefs.mymemory'));
		setLabel('zpt-label-mymemory-endpoint', t('prefs.mymemory.endpoint'));
		setLabel('zpt-label-mymemory-email', t('prefs.mymemory.email'));
		setText('zpt-hint-mymemory', t('prefs.mymemory.hint'));

		setText('zpt-heading-openai', t('prefs.openai'));
		setLabel('zpt-label-openai-base-url', t('prefs.openai.baseURL'));
		setLabel('zpt-label-openai-api-key', t('prefs.openai.apiKey'));
		setLabel('zpt-label-openai-model', t('prefs.openai.model'));
		setLabel('zpt-label-openai-prompt', t('prefs.openai.systemPrompt'));
		setText('zpt-hint-openai', t('prefs.openai.hint'));
		setText('zpt-hint-openai-prompt', t('prefs.openai.systemPrompt.hint'));

		setText('zpt-heading-advanced', t('prefs.advanced'));
		setLabel('zpt-label-timeout', t('prefs.timeout'));
		setLabel('zpt-label-max-chars', t('prefs.maxChars'));
		setLabel('zpt-debug', t('prefs.debug'));

		let button = byId('zpt-selftest-button');
		if (button) {
			setText('zpt-selftest-button', t('prefs.selfTest'));
		}
		setText('zpt-selftest-status', '');
	}

	// Numeric prefs are bound here instead of with `preference` attributes,
	// because the declarative binding writes strings into int prefs.
	const NUMBER_FIELDS = [
		['zpt-card-width', 'popup.width', 240, 800, 380],
		['zpt-timeout', 'request.timeout', 5, 120, 20],
		['zpt-max-chars', 'request.maxCharsPerChunk', 300, 8000, 1500]
	];

	function bindNumberFields() {
		for (let [id, pref, min, max, fallback] of NUMBER_FIELDS) {
			let input = byId(id);
			if (!input) {
				continue;
			}
			let read = () => {
				try {
					let value = parseInt(Zotero.Prefs.get('pdfTranslate.' + pref), 10);
					return isFinite(value) ? value : fallback;
				}
				catch (e) {
					return fallback;
				}
			};
			input.value = String(read());
			let write = () => {
				let value = parseInt(input.value, 10);
				if (!isFinite(value)) {
					input.value = String(read());
					return;
				}
				value = Math.min(Math.max(value, min), max);
				input.value = String(value);
				try {
					Zotero.Prefs.set('pdfTranslate.' + pref, value);
				}
				catch (e) {
					logError('failed to save ' + pref, e);
				}
			};
			input.addEventListener('change', write);
			input.addEventListener('blur', write);
		}
	}

	function currentProvider() {
		try {
			return Zotero.Prefs.get('pdfTranslate.provider') || 'google-free';
		}
		catch (e) {
			return 'google-free';
		}
	}

	/**
	 * The provider groups stay visible at all times. They used to be hidden
	 * unless the "preferred service" menu selected that provider, which meant
	 * the Base URL / API key fields were simply not reachable when the menu was
	 * on Google — the settings for a service you are about to configure.
	 * Instead the dropdown only marks which group is the current choice.
	 */
	function updateProviderHighlight() {
		let provider = currentProvider();
		for (let [id, name] of [['zpt-prefpane-google', 'google-free'],
			['zpt-prefpane-mymemory', 'mymemory'],
			['zpt-prefpane-openai', 'openai']]) {
			let box = byId(id);
			if (!box) {
				continue;
			}
			box.hidden = false;
			box.setAttribute('data-active', provider === name ? 'true' : 'false');
		}
	}

	function truncate(text, max) {
		let value = String(text === undefined || text === null ? '' : text);
		return value.length > max ? value.slice(0, max) + '…' : value;
	}

	async function runSelfTest() {
		let button = byId('zpt-selftest-button');
		let status = byId('zpt-selftest-status');
		if (button) {
			button.disabled = true;
		}
		setText('zpt-selftest-status', t('prefs.selfTest.running'));
		try {
			if (!Zotero.PDFTranslate) {
				throw new Error('Zotero.PDFTranslate is not available');
			}
			let result = await Zotero.PDFTranslate.selfTest();
			setText('zpt-selftest-status', t('prefs.selfTest.ok', {
				text: truncate(result.translation, 120) + ' · ' + result.ms + 'ms'
			}));
		}
		catch (e) {
			setText('zpt-selftest-status', t('prefs.selfTest.failed', {
				text: (e && (e.message || e.code)) || String(e)
			}));
		}
		finally {
			if (button) {
				button.disabled = false;
			}
		}
	}

	function init(root) {
		populateLanguages();
		populateAnnotationTypes();
		applyStrings();
		bindNumberFields();
		updateProviderHighlight();

		let providerMenu = byId('zpt-provider');
		if (providerMenu) {
			providerMenu.addEventListener('command', updateProviderHighlight);
			providerMenu.addEventListener('change', updateProviderHighlight);
		}
		let testButton = byId('zpt-selftest-button');
		if (testButton) {
			testButton.addEventListener('command', () => runSelfTest());
			testButton.addEventListener('click', () => runSelfTest());
		}
		logDebug('preferences pane initialized');
	}

	function whenReady(callback) {
		let root = byId(ROOT_ID);
		if (root) {
			callback(root);
			return;
		}
		let observer = null;
		let timer = null;
		let finished = false;
		let finish = (element) => {
			if (finished) {
				return;
			}
			finished = true;
			if (observer) {
				observer.disconnect();
			}
			if (timer) {
				clearInterval(timer);
			}
			callback(element);
		};
		try {
			observer = new MutationObserver(() => {
				let element = byId(ROOT_ID);
				if (element) {
					finish(element);
				}
			});
			observer.observe(document.documentElement, { childList: true, subtree: true });
		}
		catch (e) {}
		let attempts = 0;
		timer = setInterval(() => {
			let element = byId(ROOT_ID);
			if (element) {
				finish(element);
			}
			else if (++attempts > 200) {
				finish(null);
			}
		}, 100);
	}

	whenReady((root) => {
		try {
			if (!root) {
				logError('preferences pane markup was not found');
				return;
			}
			init(root);
		}
		catch (e) {
			logError('preferences pane failed to initialize', e);
		}
	});
})();
