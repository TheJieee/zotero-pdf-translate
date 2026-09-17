/*
 * 安装诊断 v4：验证「路径含空格导致 jar URI 读取失败」这个假设，并顺带把插件装上。
 *
 * 用法：
 *   1. Zotero → 工具 → 开发者 → Run JavaScript
 *   2. 勾选「Run as async」
 *   3. 粘贴本文件全部内容（已在剪贴板），Ctrl+R 运行
 *   4. 结果写入 D:\repo\zotero PDF translate\.diag\install-result.txt
 *
 * 它会：
 *   A. 把 xpi 复制到 C:\Users\<你>\AppData\Local\Temp\zpt-install\（路径不含空格）
 *   B. 从新路径 getInstallForFile → install()（永久）→ installTemporaryAddon()（临时）
 *   C. 再对原路径（含空格）做一次同样的解析，做 A/B 对比
 *   D. 把 additionalErrors 明细完整打印出来
 */

const { AddonManager } = ChromeUtils.importESModule("resource://gre/modules/AddonManager.sys.mjs");
const SRC = "D:\\repo\\zotero PDF translate\\dist\\zotero-pdf-translate-1.0.0.xpi";
const OUT = "D:\\repo\\zotero PDF translate\\.diag\\install-result.txt";
const ID = "zotero-pdf-translate@example.com";

const out = [];
const push = (s) => out.push(s);

function describe(e) {
	if (!e) {
		return "n/a";
	}
	const parts = [];
	parts.push("message=" + (e.message || String(e)));
	if (e.name) {
		parts.push("name=" + e.name);
	}
	if (e.result) {
		parts.push("result=0x" + Number(e.result).toString(16));
	}
	if (Array.isArray(e.additionalErrors) && e.additionalErrors.length) {
		parts.push("additionalErrors=[" + e.additionalErrors.map((x) => {
			if (!x) {
				return String(x);
			}
			return (x.message || String(x)) + (x.stack ? " @ " + String(x.stack).split("\n")[1] : "");
		}).join(" || ") + "]");
	}
	if (e.stack) {
		parts.push("stack=" + String(e.stack).split("\n").slice(0, 4).join(" <- "));
	}
	return parts.join(" | ");
}

push("=== PDF Translate 安装诊断 (v4) ===");
push("time: " + new Date().toString());
push("src : " + SRC + "  (路径含空格: " + /\s/.test(SRC) + ")");

// A. 复制到不含空格的临时目录
let copyPath = null;
try {
	const dir = PathUtils.join(PathUtils.tempDir, "zpt-install");
	await IOUtils.makeDirectory(dir, { ignoreExisting: true });
	copyPath = PathUtils.join(dir, "zotero-pdf-translate-1.0.0.xpi");
	await IOUtils.copy(SRC, copyPath);
	const stat = await IOUtils.stat(copyPath);
	push("[A] 已复制到无空格路径: " + copyPath + " (" + stat.size + " bytes)");
}
catch (e) {
	push("[A] 复制失败: " + describe(e));
}

// B. 从无空格路径安装
if (copyPath) {
	const file = Zotero.File.pathToFile(copyPath);
	try {
		const install = await AddonManager.getInstallForFile(file);
		push("[B1] getInstallForFile(无空格): state=" + install.state
			+ " error=" + install.error + " desc=" + install.errorDescription
			+ " name=" + install.name + " id=" + (install.addon && install.addon.id));
		try {
			await install.install();
			push("[B2] install() OK —— 插件已永久安装，重启 Zotero 后生效");
		}
		catch (e) {
			push("[B2] install() THREW: " + describe(e));
		}
	}
	catch (e) {
		push("[B1] getInstallForFile THREW: " + describe(e));
	}
	try {
		const addon = await AddonManager.installTemporaryAddon(file);
		push("[B3] 临时安装 OK: id=" + addon.id + " version=" + addon.version
			+ " isActive=" + addon.isActive);
	}
	catch (e) {
		push("[B3] 临时安装 THREW: " + describe(e));
	}
}

// C. 对照：原路径（含空格）
try {
	const file = Zotero.File.pathToFile(SRC);
	const install = await AddonManager.getInstallForFile(file);
	push("[C1] getInstallForFile(原路径/含空格): state=" + install.state
		+ " error=" + install.error + " desc=" + install.errorDescription
		+ " name=" + install.name + " id=" + (install.addon && install.addon.id));
}
catch (e) {
	push("[C1] 原路径 THREW: " + describe(e));
}
try {
	const file = Zotero.File.pathToFile(SRC);
	await AddonManager.installTemporaryAddon(file);
	push("[C2] 原路径临时安装 OK");
}
catch (e) {
	push("[C2] 原路径临时安装 THREW: " + describe(e));
}

// D. 插件状态 + 真实翻译自检
try {
	const addon = await AddonManager.getAddonByID(ID);
	push("[D1] getAddonByID: " + (addon ? JSON.stringify({
		id: addon.id,
		version: addon.version,
		isActive: addon.isActive,
		userDisabled: addon.userDisabled,
		appDisabled: addon.appDisabled,
		path: addon.path
	}) : "未安装"));
}
catch (e) {
	push("[D1] getAddonByID THREW: " + describe(e));
}
try {
	if (typeof Zotero.PDFTranslate !== "undefined") {
		push("[D2] plugin status: " + JSON.stringify(Zotero.PDFTranslate.status()));
		try {
			push("[D3] selfTest OK: " + JSON.stringify(await Zotero.PDFTranslate.selfTest()));
		}
		catch (e) {
			push("[D3] selfTest FAILED: " + describe(e));
		}
	}
	else {
		push("[D2] Zotero.PDFTranslate 不存在（插件未启动）");
	}
}
catch (e) {
	push("[D2] THREW: " + describe(e));
}

const text = out.join("\n");

// 写文件（同步，不依赖 IOUtils）
try {
	const C = Components.classes;
	const I = Components.interfaces;
	const f = C["@mozilla.org/file/local;1"].createInstance(I.nsIFile);
	f.initWithPath(OUT);
	if (!f.parent.exists()) {
		f.parent.create(I.nsIFile.DIRECTORY_TYPE, 0o755);
	}
	const fos = C["@mozilla.org/network/file-output-stream;1"].createInstance(I.nsIFileOutputStream);
	fos.init(f, 0x02 | 0x08 | 0x20, 0o664, 0);
	const cos = C["@mozilla.org/intl/converter-output-stream;1"].createInstance(I.nsIConverterOutputStream);
	cos.init(fos, "UTF-8");
	cos.writeString(text);
	cos.close();
}
catch (e) {}

try {
	Services.prefs.setStringPref("extensions.zotero.pdfTranslate.lastDiag", text);
	Services.prefs.savePrefFile(null);
}
catch (e) {}

return text;
