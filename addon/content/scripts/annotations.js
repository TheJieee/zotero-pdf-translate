/*
 * Saving a translation as a highlight/underline annotation whose comment holds
 * the translated text.
 *
 * The reader hands us the annotation JSON for the current text selection
 * (params.annotation in the renderTextSelectionPopup event); we add a fresh
 * object key and the translation, then persist it through
 * Zotero.Annotations.saveFromJSON().
 */

/* eslint-disable no-var */
var ZPT = (typeof ZPT !== 'undefined' && ZPT) ? ZPT : {};

ZPT.annotations = (function () {
	const ALLOWED_TYPES = ['highlight', 'underline', 'note'];

	function isEnabled() {
		return ZPT.prefs.getBool('annotation.enabled');
	}

	function buildJSON(annotation, translation) {
		let source = annotation || {};
		let type = ZPT.prefs.getString('annotation.type') || 'highlight';
		if (!ALLOWED_TYPES.includes(type)) {
			type = 'highlight';
		}
		let position = ZPT.util.toPlain(source.position);
		if (position && typeof position === 'object' && !Array.isArray(position)) {
			position = ZPT.util.toPlain(position);
		}
		let json = {
			key: Zotero.Utilities.generateObjectKey(),
			type,
			color: ZPT.prefs.getString('annotation.color') || '#ffd400',
			text: source.text === undefined || source.text === null ? '' : String(source.text),
			comment: translation,
			position
		};
		if (source.pageLabel !== undefined && source.pageLabel !== null && source.pageLabel !== '') {
			json.pageLabel = String(source.pageLabel);
		}
		if (source.sortIndex !== undefined && source.sortIndex !== null && source.sortIndex !== '') {
			json.sortIndex = String(source.sortIndex);
		}
		else if (position && typeof position === 'object' && position.pageIndex !== undefined) {
			json.sortIndex = String(position.pageIndex).padStart(5, '0') + '|000000|00000';
		}
		if (Array.isArray(source.tags)) {
			json.tags = ZPT.util.toPlain(source.tags);
		}
		return json;
	}

	/**
	 * @param {Object} reader - Zotero.Reader instance from the event
	 * @param {Object} annotation - Selected-text annotation JSON
	 * @param {String} translation
	 * @returns {Promise<Zotero.Item>} the saved annotation item
	 */
	async function saveTranslation(reader, annotation, translation) {
		if (!isEnabled()) {
			throw ZPT.util.pluginError('annotationDisabled');
		}
		if (!translation || !String(translation).trim()) {
			throw ZPT.util.pluginError('emptyResult');
		}
		let itemID = reader && reader.itemID ? reader.itemID : null;
		let attachment = itemID ? Zotero.Items.get(itemID) : null;
		if (!attachment) {
			throw ZPT.util.pluginError('noAttachment');
		}
		let json = buildJSON(annotation, String(translation).trim());
		ZPT.log.debug('saving annotation ' + json.key + ' (' + json.type + ') on attachment ' + itemID);
		return Zotero.Annotations.saveFromJSON(attachment, json, { skipSelect: true });
	}

	return { saveTranslation, buildJSON, isEnabled, ALLOWED_TYPES };
})();
