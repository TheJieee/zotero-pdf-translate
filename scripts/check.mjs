/*
 * Static consistency checks (no dependencies, no Zotero needed):
 *   - every JS file parses
 *   - prefs declared in addon/prefs.js match the defaults used by the scripts
 *   - both locales define exactly the same string ids
 *   - scripts listed in bootstrap.js exist
 *   - ids looked up with byId() in the preferences pane exist in the markup
 *
 * Run with: npm run check
 */

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const addonDir = path.join(root, 'addon');

const failures = [];
const notes = [];

function fail(message) {
	failures.push(message);
}

function read(relative) {
	return fs.readFileSync(path.join(root, relative), 'utf8');
}

function walk(dir, base = dir, out = []) {
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			walk(full, base, out);
		}
		else {
			out.push(path.relative(base, full).replace(/\\/g, '/'));
		}
	}
	return out;
}

// --- 1. Syntax check every JS file -----------------------------------------
const jsFiles = walk(addonDir).filter((file) => file.endsWith('.js'));
for (const file of jsFiles) {
	try {
		new vm.Script(read(path.join('addon', file)), { filename: file });
	}
	catch (e) {
		fail(`syntax error in ${file}: ${e.message}`);
	}
}
notes.push(`parsed ${jsFiles.length} scripts`);

// --- 2. Pref keys ----------------------------------------------------------
const prefsFile = read('addon/prefs.js');
const declaredPrefs = new Set();
for (const match of prefsFile.matchAll(/pref\(\s*"extensions\.zotero\.pdfTranslate\.([^"]+)"\s*,/g)) {
	declaredPrefs.add(match[1]);
}

const prefsScript = read('addon/content/scripts/prefs.js');
const defaultsMatch = /const DEFAULTS = \{([\s\S]*?)\n\t\};/.exec(prefsScript);
if (!defaultsMatch) {
	fail('could not find the DEFAULTS map in content/scripts/prefs.js');
}
else {
	const defaultValueKeys = new Set();
	const body = defaultsMatch[1];
	for (const match of body.matchAll(/^\s*(?:'([^']+)'|([A-Za-z][\w.]*))\s*:/gm)) {
		defaultValueKeys.add(match[1] || match[2]);
	}
	for (const key of declaredPrefs) {
		if (!defaultValueKeys.has(key)) {
			fail(`pref "${key}" is declared in addon/prefs.js but missing from DEFAULTS`);
		}
	}
	for (const key of defaultValueKeys) {
		if (!declaredPrefs.has(key)) {
			fail(`default "${key}" exists in DEFAULTS but is not declared in addon/prefs.js`);
		}
	}
	notes.push(`checked ${declaredPrefs.size} prefs`);
}

// --- 3. Localization key parity -------------------------------------------
const l10n = read('addon/content/scripts/l10n.js');
const localeBlocks = [...l10n.matchAll(/'(en-US|zh-CN)':\s*\{([\s\S]*?)\n\t\t\}/g)];
if (localeBlocks.length !== 2) {
	fail(`expected 2 locale blocks in l10n.js, found ${localeBlocks.length}`);
}
else {
	const keysByLocale = localeBlocks.map((block) => {
		const keys = new Set();
		for (const match of block[2].matchAll(/^\s*'([^']+)':/gm)) {
			keys.add(match[1]);
		}
		return { locale: block[1], keys };
	});
	const [a, b] = keysByLocale;
	for (const key of a.keys) {
		if (!b.keys.has(key)) {
			fail(`string "${key}" exists in ${a.locale} but not in ${b.locale}`);
		}
	}
	for (const key of b.keys) {
		if (!a.keys.has(key)) {
			fail(`string "${key}" exists in ${b.locale} but not in ${a.locale}`);
		}
	}
	notes.push(`checked ${a.keys.size} localized strings per locale`);

	// Every error.<code> used by scripts must exist
	const usedCodes = new Set();
	for (const file of jsFiles) {
		const source = read(path.join('addon', file));
		for (const match of source.matchAll(/pluginError\('([^']+)'|error\.' \+ (\w+)/g)) {
			if (match[1]) {
				usedCodes.add(match[1]);
			}
		}
	}
	for (const code of usedCodes) {
		if (!a.keys.has('error.' + code)) {
			fail(`error code "${code}" has no localized string`);
		}
	}
}

// --- 4. bootstrap script list ---------------------------------------------
const bootstrap = read('addon/bootstrap.js');
const scriptListMatch = /var ZPT_SCRIPTS = \[([\s\S]*?)\];/.exec(bootstrap);
if (!scriptListMatch) {
	fail('could not find ZPT_SCRIPTS in bootstrap.js');
}
else {
	const listed = [...scriptListMatch[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
	for (const script of listed) {
		if (!fs.existsSync(path.join(addonDir, script))) {
			fail(`bootstrap.js loads missing script ${script}`);
		}
	}
	const present = walk(path.join(addonDir, 'content', 'scripts')).map((f) => 'content/scripts/' + f);
	for (const file of present) {
		if (!listed.includes(file)) {
			fail(`${file} exists but is not loaded by bootstrap.js`);
		}
	}
	notes.push(`checked ${listed.length} bootstrap scripts`);
}

// --- 5. Preference pane ids -----------------------------------------------
const paneScript = read('addon/content/preferences.js');
const paneMarkup = read('addon/content/preferences.xhtml');
const markupIds = new Set([...paneMarkup.matchAll(/id="([^"]+)"/g)].map((m) => m[1]));
for (const match of paneScript.matchAll(/byId\('([^']+)'\)/g)) {
	const id = match[1];
	if (id === 'zpt-prefpane' || id.endsWith('-')) {
		continue;
	}
	if (!markupIds.has(id)) {
		fail(`preferences.js looks up #${id}, which does not exist in preferences.xhtml`);
	}
}
notes.push(`checked ${markupIds.size} markup ids`);

// --- 5b. Files referenced by the preference pane registration --------------
// plugin.js points Zotero at content/... through ZPT.rootURI + '...'; a typo
// there would only show up as a broken pane at runtime.
{
	const pluginScript = read('addon/content/scripts/plugin.js');
	const referenced = new Set();
	for (const match of pluginScript.matchAll(/ZPT\.rootURI\s*\+\s*'([^']+)'/g)) {
		referenced.add(match[1]);
	}
	for (const file of referenced) {
		if (!fs.existsSync(path.join(addonDir, file))) {
			fail(`plugin.js references missing file ${file}`);
		}
	}
	// The pane stylesheet has to be registered too, otherwise the fields are
	// left with their intrinsic width.
	if (referenced.has('content/preferences.css') && !/stylesheets\s*:/.test(pluginScript)) {
		fail('plugin.js references preferences.css but does not pass stylesheets to PreferencePanes.register');
	}
	notes.push(`checked ${referenced.size} plugin-referenced files`);
}

// --- 5c. Preference pane fields -------------------------------------------
{
	const fields = [...paneMarkup.matchAll(/<(?:html:)?(?:input|textarea)\b[^>]*>/g)].map((m) => m[0]);
	const missing = [];
	for (const tag of fields) {
		const id = /id="([^"]+)"/.exec(tag);
		if (!/placeholder="/.test(tag)) {
			missing.push((id ? id[1] : tag) + ' (placeholder)');
		}
		if (!/class="[^"]*zpt-field/.test(tag)) {
			missing.push((id ? id[1] : tag) + ' (zpt-field)');
		}
	}
	if (missing.length) {
		fail(`preference pane fields without an input hint / full-width class: ${missing.join(', ')}`);
	}
	notes.push(`checked ${fields.length} preference pane fields`);
}

// --- 6. Manifest -----------------------------------------------------------
try {
	const manifest = JSON.parse(read('addon/manifest.json'));
	const pkg = JSON.parse(read('package.json'));
	if (manifest.version !== pkg.version) {
		fail(`manifest version ${manifest.version} != package version ${pkg.version}`);
	}
	if (!manifest.applications || !manifest.applications.zotero || !manifest.applications.zotero.id) {
		fail('manifest.json is missing applications.zotero.id');
	}
	// Zotero's patched Extension.sys.mjs refuses to load a plugin whose manifest
	// lacks any of these (see loadManifest() -> manifestError(...)):
	//   applications.zotero.id / update_url / strict_max_version
	const zotero = (manifest.applications && manifest.applications.zotero) || {};
	for (const field of ['id', 'update_url', 'strict_max_version']) {
		if (!zotero[field]) {
			fail(`manifest.json: applications.zotero.${field} is required by Zotero`);
		}
	}
	if (zotero.strict_min_version && zotero.strict_min_version.split('.').includes('*')) {
		fail("manifest.json: '*' is not allowed in strict_min_version");
	}
	// update_url has to point at the update manifest we actually upload as a
	// release asset, otherwise Zotero's update check 404s.
	const repoUrl = (pkg.repository && (pkg.repository.url || pkg.repository)) || '';
	const repoMatch = /github\.com[/:]([^/]+)\/([^/.]+)/.exec(repoUrl);
	if (repoMatch && zotero.update_url) {
		const expected = `https://github.com/${repoMatch[1]}/${repoMatch[2]}/releases/latest/download/updates.json`;
		if (zotero.update_url !== expected) {
			fail(`manifest.json update_url should be ${expected} (found ${zotero.update_url})`);
		}
	}
	if ('browser_specific_settings' in manifest) {
		notes.push('note: browser_specific_settings is ignored by Zotero (it nulls it during manifest load)');
	}
	for (const icon of Object.values(manifest.icons || {})) {
		if (!fs.existsSync(path.join(addonDir, icon))) {
			fail(`manifest icon ${icon} is missing`);
		}
	}
}
catch (e) {
	fail('manifest.json / package.json could not be parsed: ' + e.message);
}

for (const note of notes) {
	console.log('  • ' + note);
}
if (failures.length) {
	console.error('\n' + failures.length + ' check(s) failed:');
	for (const message of failures) {
		console.error('  ✗ ' + message);
	}
	process.exit(1);
}
console.log('\nAll checks passed.');
