/*
 * 生成 Zotero 插件更新清单 release/updates.json。
 *
 * Zotero 的 `applications.zotero.update_url` 指向的就是这个文件，格式为
 * Firefox 的 update.json：
 *   { "addons": { "<addon-id>": { "updates": [
 *       { "version": "...", "update_link": "...", "update_hash": "sha256:...",
 *         "applications": { "zotero": { "strict_min_version": "7.0" } } } ] } } }
 *
 * 用法：
 *   npm run build            # 先生成 dist/*.xpi
 *   npm run update-manifest  # 再生成 release/updates.json（含 XPI 的 sha256）
 *
 * 下载地址取自 package.json 的 repository 字段（或 GITHUB_REPOSITORY 环境变量），
 * 形如 https://github.com/<owner>/<repo>/releases/latest/download/<file>。
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function repoSlug() {
	if (process.env.GITHUB_REPOSITORY) {
		return process.env.GITHUB_REPOSITORY;
	}
	const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
	const url = (pkg.repository && (pkg.repository.url || pkg.repository)) || '';
	const match = /github\.com[/:]([^/]+)\/([^/.]+)/.exec(url);
	if (!match) {
		throw new Error('无法确定仓库地址：请在 package.json 里设置 repository，或传入 GITHUB_REPOSITORY=owner/repo');
	}
	return match[1] + '/' + match[2];
}

const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'addon', 'manifest.json'), 'utf8'));
const zotero = manifest.applications && manifest.applications.zotero;
if (!zotero || !zotero.id) {
	throw new Error('addon/manifest.json 缺少 applications.zotero.id');
}

const slug = repoSlug();
const version = pkg.version;
const xpiName = `zotero-pdf-translate-${version}.xpi`;
const xpiPath = path.join(root, 'dist', xpiName);
const base = `https://github.com/${slug}/releases/latest/download`;

const update = {
	version,
	update_link: `${base}/${xpiName}`
};

if (fs.existsSync(xpiPath)) {
	const hash = crypto.createHash('sha256').update(fs.readFileSync(xpiPath)).digest('hex');
	update.update_hash = 'sha256:' + hash;
}
else {
	console.warn('! 未找到 ' + path.relative(root, xpiPath) + '，跳过 update_hash（请先运行 npm run build）');
}

if (zotero.strict_min_version) {
	update.applications = { zotero: { strict_min_version: zotero.strict_min_version } };
}

const data = { addons: { [zotero.id]: { updates: [update] } } };
const outDir = path.join(root, 'release');
fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, 'updates.json');
fs.writeFileSync(outPath, JSON.stringify(data, null, 2) + '\n');

console.log('Wrote ' + path.relative(root, outPath));
console.log('  addon       : ' + zotero.id);
console.log('  version     : ' + version);
console.log('  update_link : ' + update.update_link);
console.log('  update_hash : ' + (update.update_hash || '(omitted)'));
