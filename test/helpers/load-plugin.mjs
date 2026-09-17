/*
 * Test helper: load the plugin's classic scripts into a Node VM context with a
 * minimal fake Zotero, so the translation core can be exercised without Zotero.
 */

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const addonDir = path.join(root, 'addon');

// Same order as bootstrap.js
export const SCRIPTS = [
	'content/scripts/l10n.js',
	'content/scripts/log.js',
	'content/scripts/prefs.js',
	'content/scripts/util.js',
	'content/scripts/http.js',
	'content/scripts/provider-google-free.js',
	'content/scripts/provider-mymemory.js',
	'content/scripts/provider-openai.js',
	'content/scripts/translate.js',
	'content/scripts/annotations.js'
];

/** Parse the real default prefs so tests run against shipped defaults. */
export function readDefaultPrefs() {
	const source = fs.readFileSync(path.join(addonDir, 'prefs.js'), 'utf8');
	const store = new Map();
	for (const match of source.matchAll(/pref\(\s*"([^"]+)"\s*,\s*(.+?)\s*\);/g)) {
		const raw = match[2];
		let value;
		if (raw === 'true') {
			value = true;
		}
		else if (raw === 'false') {
			value = false;
		}
		else if (/^-?\d+(\.\d+)?$/.test(raw)) {
			value = Number(raw);
		}
		else {
			value = JSON.parse(raw);
		}
		store.set(match[1], value);
	}
	return store;
}

export function loadPlugin(options = {}) {
	const prefStore = readDefaultPrefs();
	for (const [key, value] of Object.entries(options.prefs || {})) {
		prefStore.set('extensions.zotero.pdfTranslate.' + key, value);
	}
	const savedAnnotations = [];

	const Zotero = {
		locale: options.locale || 'zh-CN',
		debug() {},
		logError(exception) {
			throw exception;
		},
		Prefs: {
			get(key) {
				return prefStore.get('extensions.zotero.' + key);
			},
			set(key, value) {
				prefStore.set('extensions.zotero.' + key, value);
			}
		},
		HTTP: {
			async request() {
				throw new Error('HTTP transport is not available in tests; inject one');
			}
		},
		Utilities: {
			generateObjectKey: () => 'KEY00001',
			Internal: { copyTextToClipboard() {} }
		},
		Items: {
			get: (id) => options.attachment || null
		},
		Annotations: {
			saveFromJSON: async (attachment, json) => {
				savedAnnotations.push(json);
				return Object.assign({ id: id(json.key) }, json);
			}
		},
		Reader: {
			registerEventListener() {},
			unregisterEventListener() {}
		},
		PreferencePanes: {
			register: async () => 'test-pane',
			unregister() {}
		},
		initializationPromise: Promise.resolve()
	};

	function id(key) {
		return 1;
	}

	const sandbox = {
		console,
		Zotero,
		Services: {
			locale: {
				appLocaleAsBCP47: options.locale || 'zh-CN',
				requestedLocales: [options.locale || 'zh-CN']
			}
		},
		setTimeout,
		clearTimeout,
		setInterval,
		clearInterval
	};
	sandbox.globalThis = sandbox;

	const context = vm.createContext(sandbox);
	for (const script of SCRIPTS) {
		const code = fs.readFileSync(path.join(addonDir, script), 'utf8');
		vm.runInContext(code, context, { filename: script });
	}
	return { ZPT: context.ZPT, Zotero, prefStore, savedAnnotations, context };
}

/** Build a fake HTTP transport that answers from a handler. */
export function makeTransport(handler) {
	const calls = [];
	const http = {
		async requestJSON(method, url, options) {
			calls.push({ method, url, options });
			return handler({ method, url, options }, calls.length - 1);
		},
		async request(method, url, options) {
			calls.push({ method, url, options });
			return handler({ method, url, options }, calls.length - 1);
		},
		calls
	};
	return http;
}

/**
 * Install a fake transport through ZPT.http (so errors get normalized the same
 * way they are in Zotero). Returns the recorded calls.
 */
export function installTransport(ZPT, handler) {
	const calls = [];
	ZPT.http.setTransport(async (method, url, options) => {
		calls.push({ method, url, options });
		return handler({ method, url, options }, calls.length - 1);
	});
	return calls;
}

export function timeoutError() {
	const error = new Error('Request timed out');
	error.name = 'TimeoutException';
	return error;
}

export function statusError(status) {
	const error = new Error('HTTP request failed with status code ' + status);
	error.status = status;
	return error;
}

/** Minimal Google Translate (dj=1) response */
export function googleResponse(translation, detected = 'en') {
	return {
		status: 200,
		body: {
			sentences: [{ trans: translation, orig: 'x', backend: 10 }],
			src: detected
		}
	};
}

/** Minimal OpenAI chat-completions response */
export function openAIResponse(content) {
	return {
		status: 200,
		body: {
			choices: [{ message: { role: 'assistant', content } }]
		}
	};
}

/** Minimal MyMemory response */
export function myMemoryResponse(translation) {
	return {
		status: 200,
		body: {
			responseData: { translatedText: translation, match: 0.85 },
			responseStatus: 200,
			responseDetails: ''
		}
	};
}
