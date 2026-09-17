/*
 * Bootstrap entry point for the "PDF Translate" Zotero plugin.
 *
 * Zotero loads this file into a sandbox whose globals include Zotero, Services,
 * ChromeUtils, setTimeout, ... (see Zotero.Plugins._loadScope). All plugin
 * scripts are loaded into that same scope, so they share the ZPT namespace.
 */

/* global Zotero, Services */

var ZPT = {
	id: null,
	version: null,
	rootURI: null
};

// Loaded in order; each file adds to the shared ZPT namespace.
var ZPT_SCRIPTS = [
	'content/scripts/l10n.js',
	'content/scripts/log.js',
	'content/scripts/prefs.js',
	'content/scripts/util.js',
	'content/scripts/http.js',
	'content/scripts/provider-google-free.js',
	'content/scripts/provider-mymemory.js',
	'content/scripts/provider-openai.js',
	'content/scripts/translate.js',
	'content/scripts/annotations.js',
	'content/scripts/reader-ui.js',
	'content/scripts/plugin.js'
];

var zptScope = null;

function install(data, reason) {}

async function startup({ id, version, rootURI }, reason) {
	try {
		await Zotero.initializationPromise;
	}
	catch (e) {
		// Nothing we can do without Zotero
		return;
	}

	ZPT.id = id;
	ZPT.version = version;
	ZPT.rootURI = rootURI;
	zptScope = this;

	for (let script of ZPT_SCRIPTS) {
		Services.scriptloader.loadSubScript(rootURI + script, zptScope);
	}

	await ZPT.plugin.startup({ id, version, rootURI });
}

function onMainWindowLoad({ window }) {
	try {
		if (ZPT.plugin && ZPT.plugin.onMainWindowLoad) {
			ZPT.plugin.onMainWindowLoad(window);
		}
	}
	catch (e) {
		Zotero.logError(e);
	}
}

function onMainWindowUnload({ window }) {
	try {
		if (ZPT.plugin && ZPT.plugin.onMainWindowUnload) {
			ZPT.plugin.onMainWindowUnload(window);
		}
	}
	catch (e) {
		Zotero.logError(e);
	}
}

function shutdown(data, reason) {
	if (!ZPT.plugin) {
		return;
	}
	try {
		ZPT.plugin.shutdown(reason);
	}
	catch (e) {
		Zotero.logError(e);
	}
}

function uninstall(data, reason) {}
