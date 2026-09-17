/* Default preferences for the PDF Translate plugin.
 * Loaded by Zotero into the default pref branch; read/write with
 * Zotero.Prefs.get('pdfTranslate.<key>') / Zotero.Prefs.set(...).
 */
pref("extensions.zotero.pdfTranslate.provider", "google-free");
pref("extensions.zotero.pdfTranslate.provider.autoFallback", true);
/* Smart routing: single words -> Google free endpoint, sentences -> LLM API,
 * each falling back to the other family when unavailable. */
pref("extensions.zotero.pdfTranslate.translate.autoRoute", true);
pref("extensions.zotero.pdfTranslate.sourceLang", "auto");
pref("extensions.zotero.pdfTranslate.targetLang", "zh-CN");

pref("extensions.zotero.pdfTranslate.popup.showButton", true);
pref("extensions.zotero.pdfTranslate.popup.buttonLabel", "译");
pref("extensions.zotero.pdfTranslate.popup.width", 380);
pref("extensions.zotero.pdfTranslate.popup.showSource", true);
/* Close the floating card when the user clicks outside of it. */
pref("extensions.zotero.pdfTranslate.popup.closeOnClickOutside", true);

pref("extensions.zotero.pdfTranslate.annotation.enabled", true);
pref("extensions.zotero.pdfTranslate.annotation.type", "highlight");
pref("extensions.zotero.pdfTranslate.annotation.color", "#ffd400");

pref("extensions.zotero.pdfTranslate.googleFree.endpoint", "https://translate.googleapis.com/translate_a/single");

pref("extensions.zotero.pdfTranslate.mymemory.endpoint", "https://api.mymemory.translated.net/get");
pref("extensions.zotero.pdfTranslate.mymemory.email", "");

pref("extensions.zotero.pdfTranslate.openai.baseURL", "https://api.openai.com/v1");
pref("extensions.zotero.pdfTranslate.openai.apiKey", "");
pref("extensions.zotero.pdfTranslate.openai.model", "gpt-4o-mini");
pref("extensions.zotero.pdfTranslate.openai.systemPrompt", "");

pref("extensions.zotero.pdfTranslate.request.timeout", 20);
pref("extensions.zotero.pdfTranslate.request.maxCharsPerChunk", 1500);
pref("extensions.zotero.pdfTranslate.cache.size", 200);

pref("extensions.zotero.pdfTranslate.debug", false);
pref("extensions.zotero.pdfTranslate.selfTestOnStartup", false);
pref("extensions.zotero.pdfTranslate.selfTestFile", "");
