/*
 * Compatibility verification.
 *
 *   1. Reads the packaged .xpi and checks its structure and manifest.
 *   2. Looks for every Zotero API this plugin uses inside an installed Zotero
 *      build (omni.ja) and reports what is present.
 *
 * Usage:
 *   node scripts/verify.mjs                     # auto-detects Zotero
 *   node scripts/verify.mjs --zotero "C:\\Program Files\\Zotero"
 *   node scripts/verify.mjs --xpi dist/foo.xpi  # check a specific archive
 *
 * Exits with a non-zero status when an API the plugin depends on is missing.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readZip } from './zip-reader.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];

function argValue(flag) {
	const index = process.argv.indexOf(flag);
	return index >= 0 ? process.argv[index + 1] : null;
}

// ---------------------------------------------------------------- 1. the .xpi
function checkXpi() {
	const explicit = argValue('--xpi');
	let xpiPath = explicit;
	if (!xpiPath) {
		const dist = path.join(root, 'dist');
		if (!fs.existsSync(dist)) {
			failures.push('no dist/ directory — run "npm run build" first');
			return;
		}
		const candidates = fs.readdirSync(dist).filter((name) => name.endsWith('.xpi'));
		if (!candidates.length) {
			failures.push('no .xpi in dist/ — run "npm run build" first');
			return;
		}
		xpiPath = path.join(dist, candidates[candidates.length - 1]);
	}
	if (!fs.existsSync(xpiPath)) {
		failures.push('xpi not found: ' + xpiPath);
		return;
	}
	const zip = readZip(fs.readFileSync(xpiPath));
	console.log('XPI: ' + path.relative(root, xpiPath) + ' (' + zip.names().length + ' entries)');

	const required = [
		'manifest.json',
		'bootstrap.js',
		'prefs.js',
		'content/preferences.xhtml',
		'content/preferences.css',
		'content/preferences.js',
		'content/scripts/plugin.js',
		'content/scripts/reader-ui.js',
		'content/icons/icon-48.png',
		'content/icons/icon-96.png'
	];
	for (const name of required) {
		if (!zip.has(name)) {
			failures.push('missing file in xpi: ' + name);
		}
	}

	const manifest = JSON.parse(zip.readText('manifest.json'));
	const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
	if (manifest.version !== pkg.version) {
		failures.push(`xpi version ${manifest.version} != package version ${pkg.version}`);
	}
	const zotero = manifest.applications && manifest.applications.zotero;
	if (!zotero) {
		failures.push('manifest.json has no applications.zotero section');
	}
	else {
		console.log('  id                : ' + zotero.id);
		console.log('  version           : ' + manifest.version);
		console.log('  min/max Zotero    : ' + zotero.strict_min_version + ' – ' + zotero.strict_max_version);
	}

	// Every script loaded by bootstrap.js must be in the archive
	const bootstrap = zip.readText('bootstrap.js');
	const listMatch = /var ZPT_SCRIPTS = \[([\s\S]*?)\];/.exec(bootstrap);
	if (listMatch) {
		for (const match of listMatch[1].matchAll(/'([^']+)'/g)) {
			if (!zip.has(match[1])) {
				failures.push('bootstrap.js loads a file missing from the xpi: ' + match[1]);
			}
		}
	}
	else {
		failures.push('could not read ZPT_SCRIPTS from bootstrap.js');
	}
}

// ------------------------------------------------------- 2. the Zotero install
function findZoteroHome() {
	const explicit = argValue('--zotero') || process.env.ZOTERO_HOME;
	const candidates = [
		explicit,
		'C:\\Program Files\\Zotero',
		'C:\\Program Files (x86)\\Zotero',
		'/Applications/Zotero.app/Contents/Resources',
		path.join(process.env.HOME || '', '.zotero'),
		'/usr/lib/zotero'
	].filter(Boolean);
	for (const candidate of candidates) {
		if (candidate && fs.existsSync(path.join(candidate, 'app', 'omni.ja'))) {
			return candidate;
		}
		if (candidate && fs.existsSync(path.join(candidate, 'omni.ja'))) {
			return candidate;
		}
	}
	return null;
}

function checkZoteroApi() {
	const home = findZoteroHome();
	if (!home) {
		console.log('\nZotero install not found — skipping the API check (use --zotero <path>).');
		return;
	}
	const omniPath = fs.existsSync(path.join(home, 'app', 'omni.ja'))
		? path.join(home, 'app', 'omni.ja')
		: path.join(home, 'omni.ja');
	const appIni = path.join(home, 'app', 'application.ini');
	let version = 'unknown';
	if (fs.existsSync(appIni)) {
		const match = /^Version=(.+)$/m.exec(fs.readFileSync(appIni, 'utf8'));
		if (match) {
			version = match[1].trim();
		}
	}
	console.log('\nZotero: ' + home + ' (version ' + version + ')');
	console.log('Reading ' + path.basename(omniPath) + ' (' + (fs.statSync(omniPath).size / 1048576).toFixed(1) + ' MB)...');

	const zip = readZip(fs.readFileSync(omniPath));
	const cache = new Map();
	const source = (name) => {
		if (!cache.has(name)) {
			cache.set(name, zip.readText(name) || '');
		}
		return cache.get(name);
	};

	const XPCOM = 'chrome/content/zotero/xpcom/';
	const dependencies = [
		['Zotero.Reader.registerEventListener', XPCOM + 'reader.js', /registerEventListener\s*\(\s*type\s*,\s*handler/],
		['Zotero.Reader.unregisterEventListener', XPCOM + 'reader.js', /unregisterEventListener\s*\(/],
		['renderTextSelectionPopup event', 'resource/reader/reader.js', /"TextSelectionPopup"/],
		['selection popup "append" API', XPCOM + 'reader.js', /cloneInto\(args/],
		['Zotero.Annotations.saveFromJSON', XPCOM + 'annotations.js', /this\.saveFromJSON\s*=\s*async function/],
		['Zotero.Utilities.generateObjectKey', XPCOM + 'utilities/utilities.js', /generateObjectKey:\s*function/],
		['Zotero.Utilities.Internal.copyTextToClipboard', XPCOM + 'utilities_internal.js', /copyTextToClipboard:\s*function/],
		['Zotero.PreferencePanes.register', XPCOM + 'preferencePanes.js', /register:\s*async function/],
		['preference panes use defaultXUL', XPCOM + 'preferencePanes.js', /defaultXUL:\s*true/],
		['preference pane stylesheets', XPCOM + 'preferencePanes.js', /options\.stylesheets\s*\|\|=/],
		['preference pane scripts', XPCOM + 'preferencePanes.js', /options\.scripts\s*\|\|=/],
		['preference attribute binding', 'chrome/content/zotero/preferences/preferences.js', /_syncFromPref\(elem, preference/],
		['Zotero.Prefs.get/set', XPCOM + 'prefs.js', /this\.get = get;/],
		['Zotero.Prefs.registerObserver', XPCOM + 'prefs.js', /this\.registerObserver|registerObserver/],
		['Zotero.HTTP.request', XPCOM + 'http.js', /this\.request = async function/],
		['Zotero.Items.get', XPCOM + 'data/items.js', /this\.get\(/],
		['plugin sandbox globals (Services, IOUtils, Zotero)', XPCOM + 'plugins.js', /IOUtils,/],
		['plugin prefs.js loading', XPCOM + 'plugins.js', /getResourceURI\("prefs\.js"\)/],
		['plugin locale auto-registration', XPCOM + 'plugins.js', /registerLocales/],
		['Zotero.getMainWindow', XPCOM + 'zotero.js', /this\.getMainWindow = function/],
		['Zotero.initializationPromise', XPCOM + 'zotero.js', /initializationPromise/]
	];

	// The preferences pane logic lives next to preferences.xhtml in Zotero 10
	if (!zip.has('chrome/content/zotero/preferences/preferences.js')) {
		failures.push('could not find Zotero\'s preferences.js — the preference binding check is unreliable');
	}

	let missing = 0;
	for (const [label, file, pattern] of dependencies) {
		const text = source(file);
		const ok = !!text && pattern.test(text);
		if (!ok) {
			missing++;
			failures.push('missing Zotero API: ' + label + ' (' + file + ')');
		}
		console.log('  ' + (ok ? 'ok  ' : 'MISS') + ' ' + label);
	}
	if (!missing) {
		console.log('  → all ' + dependencies.length + ' integration points found');
	}
}

checkXpi();
checkZoteroApi();

if (failures.length) {
	console.error('\n' + failures.length + ' problem(s):');
	for (const message of failures) {
		console.error('  ✗ ' + message);
	}
	process.exit(1);
}
console.log('\nVerification passed.');
