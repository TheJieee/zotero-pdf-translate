/*
 * 装完插件后的自检脚本。
 *
 * 用法：Zotero → 工具 → 开发者 → Run JavaScript → 勾选 Run as async → 粘贴 → 运行
 * 结果写入 D:\repo\zotero PDF translate\.diag\post-install.txt
 *
 * 会报告：插件是否安装/启用、插件自身状态、真实翻译自检结果、已打开阅读器里的注入情况。
 */

const { AddonManager } = ChromeUtils.importESModule("resource://gre/modules/AddonManager.sys.mjs");
const OUT = "D:\\repo\\zotero PDF translate\\.diag\\post-install.txt";
const ID = "zotero-pdf-translate@example.com";

const out = [];
const push = (s) => out.push(s);
push("=== PDF Translate 安装后自检 ===");
push("time: " + new Date().toString());

// 1. 插件是否装上/启用
try {
	const addon = await AddonManager.getAddonByID(ID);
	push("[1] addon: " + (addon ? JSON.stringify({
		id: addon.id,
		version: addon.version,
		isActive: addon.isActive,
		userDisabled: addon.userDisabled,
		appDisabled: addon.appDisabled,
		signedState: addon.signedState,
		path: addon.path
	}) : "未安装"));
}
catch (e) {
	push("[1] getAddonByID THREW: " + (e.message || e));
}

// 2. 插件是否已启动 + 真实翻译自检
try {
	if (typeof Zotero.PDFTranslate !== "undefined") {
		push("[2] plugin  : v" + Zotero.PDFTranslate.version
			+ " providers=" + JSON.stringify(Zotero.PDFTranslate.providers()));
		push("[3] status  : " + JSON.stringify(Zotero.PDFTranslate.status()));
		try {
			push("[4] selfTest: " + JSON.stringify(await Zotero.PDFTranslate.selfTest()));
		}
		catch (e) {
			push("[4] selfTest FAILED: " + (e.message || e));
		}
	}
	else {
		push("[2] Zotero.PDFTranslate 不存在：插件没被加载（未安装 / 未启用 / 需重启）");
	}
}
catch (e) {
	push("[2] THREW: " + (e.message || e));
}

// 3. 已打开的阅读器里注入情况（选中过文本后 shouldInjectStyles 才会为 true）
try {
	const readers = Zotero.Reader._readers || [];
	push("[5] open readers: " + readers.length);
	for (const reader of readers) {
		let hasStyles = false;
		let hasCard = false;
		try {
			const doc = reader._iframeDocument;
			hasStyles = !!(doc && doc.getElementById("zpt-reader-styles"));
			hasCard = !!(doc && doc.querySelector(".zpt-card"));
		}
		catch (e) {}
		push("    itemID=" + reader.itemID + " injectedStyles=" + hasStyles + " cardPresent=" + hasCard);
	}
}
catch (e) {
	push("[5] reader probe THREW: " + (e.message || e));
}

const text = out.join("\n");

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

return text;
