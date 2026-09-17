/*
 * Logging helpers. Everything is prefixed so it can be grepped in the Zotero
 * debug output. Verbose messages are only emitted when the `debug` pref is on.
 */

/* eslint-disable no-var */
var ZPT = (typeof ZPT !== 'undefined' && ZPT) ? ZPT : {};

ZPT.log = (function () {
	const PREFIX = '[PDF Translate] ';

	function debugEnabled() {
		try {
			return !!ZPT.prefs.get('debug');
		}
		catch (e) {
			return false;
		}
	}

	function debug(message) {
		if (!debugEnabled()) {
			return;
		}
		try {
			Zotero.debug(PREFIX + message);
		}
		catch (e) {}
	}

	function info(message) {
		try {
			Zotero.debug(PREFIX + message);
		}
		catch (e) {}
	}

	function warn(message) {
		try {
			Zotero.debug(PREFIX + 'WARNING: ' + message, 2);
		}
		catch (e) {}
	}

	function error(message, exception) {
		try {
			let text = PREFIX + 'ERROR: ' + message;
			if (exception) {
				text += '\n' + (exception.stack || exception.message || exception);
			}
			Zotero.debug(text, 1);
		}
		catch (e) {}
	}

	return { debug, info, warn, error };
})();
