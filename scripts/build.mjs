/*
 * Build script: stages addon/ with the version from package.json and packages
 * it as dist/<name>-<version>.xpi (a plain zip; install it in Zotero via
 * Tools -> Plugins -> Install Plugin From File).
 *
 * No external dependencies — run with: npm run build
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createZip } from './zip.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const addonDir = path.join(root, 'addon');
const buildDir = path.join(root, 'build');
const distDir = path.join(root, 'dist');

function readJSON(file) {
	return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function walk(dir, base = dir, out = []) {
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			walk(full, base, out);
		}
		else if (entry.isFile()) {
			out.push({ full, relative: path.relative(base, full).replace(/\\/g, '/') });
		}
	}
	return out;
}

function copyFile(from, to) {
	fs.mkdirSync(path.dirname(to), { recursive: true });
	fs.copyFileSync(from, to);
}

const pkg = readJSON(path.join(root, 'package.json'));
const version = pkg.version;
const manifestPath = path.join(addonDir, 'manifest.json');
const manifest = readJSON(manifestPath);
manifest.version = version;
const pluginName = `zotero-pdf-translate-${version}`;

// 1. Stage an installable, unpacked copy (handy for development)
fs.rmSync(buildDir, { recursive: true, force: true });
fs.mkdirSync(buildDir, { recursive: true });
const stageDir = path.join(buildDir, pluginName);
const files = walk(addonDir);
for (const file of files) {
	copyFile(file.full, path.join(stageDir, file.relative));
}
// Stamp the version into the staged manifest as well
fs.writeFileSync(path.join(stageDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

// 2. Package the .xpi
const entries = walk(stageDir, stageDir).map((file) => ({
	name: file.relative,
	data: fs.readFileSync(file.full)
}));
// Keep manifest.json first for readability
entries.sort((a, b) => (a.name === 'manifest.json' ? -1 : b.name === 'manifest.json' ? 1 : a.name.localeCompare(b.name)));

const archive = createZip(entries);
fs.mkdirSync(distDir, { recursive: true });
const xpiPath = path.join(distDir, `${pluginName}.xpi`);
fs.writeFileSync(xpiPath, archive);

const totalBytes = entries.reduce((sum, entry) => sum + entry.data.length, 0);
console.log(`Built ${path.relative(root, xpiPath)}`);
console.log(`  plugin id : ${manifest.applications.zotero.id}`);
console.log(`  version   : ${version}`);
console.log(`  files     : ${entries.length} (${(totalBytes / 1024).toFixed(1)} KiB raw, ${(archive.length / 1024).toFixed(1)} KiB packaged)`);
console.log(`  staged    : ${path.relative(root, stageDir)}`);
