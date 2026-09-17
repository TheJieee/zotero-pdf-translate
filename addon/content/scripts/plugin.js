/*
 * Plugin lifecycle: reader integration, settings pane and the small debug
 * surface exposed as Zotero.PDFTranslate.
 */

/* eslint-disable no-var */
var ZPT = (typeof ZPT !== 'undefined' && ZPT) ? ZPT : {};

ZPT.plugin = (function () {
	let started = false;
	let paneID = null;

	async function startup({ id, version, rootURI }) {
		if (started) {
			return;
		}
		started = true;
		ZPT.log.info('starting v' + version + ' (' + id + ')');
		ZPT.log.debug('rootURI: ' + rootURI);

		ZPT.readerUI.register();
		await registerPrefPane();
		exposeGlobalAPI();

		ZPT.log.info('ready (locale ' + ZPT.l10n.getLocale()
			+ ', provider ' + ZPT.translate.getProviderID()
			+ ', target ' + ZPT.prefs.getString('targetLang') + ')');

		writeDiagnostics({
			event: 'startup',
			timestamp: new Date().toISOString(),
			id: ZPT.id,
			version: ZPT.version,
			locale: ZPT.l10n.getLocale(),
			provider: ZPT.translate.getProviderID(),
			targetLang: ZPT.prefs.getString('targetLang'),
			providers: Object.keys(ZPT.providers),
			paneID
		});

		if (ZPT.prefs.getBool('selfTestOnStartup')) {
			runSelfTest('startup').catch(() => {});
		}
	}

	async function registerPrefPane() {
		try {
			if (!Zotero.PreferencePanes || typeof Zotero.PreferencePanes.register !== 'function') {
				ZPT.log.debug('Zotero.PreferencePanes is unavailable');
				return;
			}
			paneID = await Zotero.PreferencePanes.register({
				pluginID: ZPT.id,
				src: ZPT.rootURI + 'content/preferences.xhtml',
				scripts: [
					ZPT.rootURI + 'content/scripts/l10n.js',
					ZPT.rootURI + 'content/scripts/log.js',
					ZPT.rootURI + 'content/preferences.js'
				],
				label: ZPT.l10n.t('prefs.paneLabel')
			});
			ZPT.log.debug('registered preference pane ' + paneID);
		}
		catch (e) {
			ZPT.log.error('failed to register the preference pane', e);
		}
	}

	function exposeGlobalAPI() {
		try {
			Zotero.PDFTranslate = {
				id: ZPT.id,
				version: ZPT.version,
				translate: (text, options) => ZPT.translate.translate(text, options),
				selfTest: (options) => ZPT.translate.selfTest(options),
				providers: () => Object.keys(ZPT.providers),
				clearCache: () => ZPT.translate.clearCache(),
				preferences: () => ZPT.prefs.all(),
				status: () => ({
					id: ZPT.id,
					version: ZPT.version,
					locale: ZPT.l10n.getLocale(),
					provider: ZPT.translate.getProviderID(),
					target: ZPT.prefs.getString('targetLang')
				})
			};
		}
		catch (e) {
			ZPT.log.error('failed to expose Zotero.PDFTranslate', e);
		}
	}

	async function runSelfTest(source) {
		try {
			let result = await ZPT.translate.selfTest();
			ZPT.log.info('self-test (' + source + ') OK via ' + result.provider
				+ ' in ' + result.ms + 'ms: ' + result.translation);
			writeDiagnostics(Object.assign({ event: 'selfTest', source, timestamp: new Date().toISOString() }, result));
			return result;
		}
		catch (e) {
			ZPT.log.error('self-test (' + source + ') FAILED: ' + ((e && e.message) || e), e);
			writeDiagnostics({
				event: 'selfTest',
				source,
				timestamp: new Date().toISOString(),
				ok: false,
				code: (e && e.code) || 'unknown',
				error: (e && e.message) || String(e)
			});
			throw e;
		}
	}

	/**
	 * Optional diagnostics file (`selfTestFile` pref). Handy for verifying a
	 * silent/headless startup and for troubleshooting.
	 */
	function writeDiagnostics(payload) {
		let path = ZPT.prefs.getString('selfTestFile');
		if (!path) {
			return;
		}
		try {
			if (typeof IOUtils === 'undefined' || !IOUtils.writeUTF8) {
				return;
			}
			IOUtils.writeUTF8(path.replace(/\\/g, '/'), JSON.stringify(payload, null, 2))
				.catch((e) => ZPT.log.error('failed to write diagnostics file', e));
		}
		catch (e) {
			ZPT.log.error('failed to write diagnostics file', e);
		}
	}

	function onMainWindowLoad(window) {
		ZPT.log.debug('main window loaded');
	}

	function onMainWindowUnload(window) {
		// Reader UI lives in reader documents, so there is nothing to do here.
	}

	function shutdown(reason) {
		ZPT.log.info('shutting down (' + reason + ')');
		try {
			ZPT.readerUI.unregister();
			ZPT.readerUI.cleanupAll();
		}
		catch (e) {
			ZPT.log.error('cleanup failed', e);
		}
		try {
			if (paneID && Zotero.PreferencePanes) {
				Zotero.PreferencePanes.unregister(paneID);
			}
		}
		catch (e) {}
		try {
			if (Zotero.PDFTranslate) {
				delete Zotero.PDFTranslate;
			}
		}
		catch (e) {}
		ZPT.translate.clearCache();
		started = false;
	}

	return { startup, shutdown, onMainWindowLoad, onMainWindowUnload, runSelfTest };
})();
