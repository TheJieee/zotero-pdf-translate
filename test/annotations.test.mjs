import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPlugin } from './helpers/load-plugin.mjs';

const position = { pageIndex: 3, rects: [[10, 20, 100, 35]] };

test('buildJSON produces a new annotation carrying the translation as comment', () => {
	const { ZPT } = loadPlugin();
	const json = ZPT.annotations.buildJSON(
		{ text: 'Attention is all you need', position, pageLabel: '4', sortIndex: '00003|000100|00000', id: 'OLDKEY01' },
		'注意力就是一切'
	);
	assert.equal(json.key, 'KEY00001');
	assert.notEqual(json.key, 'OLDKEY01');
	assert.equal(json.type, 'highlight');
	assert.equal(json.color, '#ffd400');
	assert.equal(json.text, 'Attention is all you need');
	assert.equal(json.comment, '注意力就是一切');
	assert.deepEqual(JSON.parse(JSON.stringify(json.position)), position);
	assert.equal(json.pageLabel, '4');
	assert.equal(json.sortIndex, '00003|000100|00000');
});

test('buildJSON respects the configured colour and type', () => {
	const { ZPT } = loadPlugin({ prefs: { 'annotation.type': 'underline', 'annotation.color': '#5fb236' } });
	const json = ZPT.annotations.buildJSON({ text: 'x', position }, 'y');
	assert.equal(json.type, 'underline');
	assert.equal(json.color, '#5fb236');
});

test('buildJSON rejects an invalid annotation type', () => {
	const { ZPT } = loadPlugin({ prefs: { 'annotation.type': 'sticker' } });
	assert.equal(ZPT.annotations.buildJSON({ text: 'x', position }, 'y').type, 'highlight');
});

test('buildJSON derives a sort index when the reader does not provide one', () => {
	const { ZPT } = loadPlugin();
	const json = ZPT.annotations.buildJSON({ text: 'x', position }, 'y');
	assert.equal(json.sortIndex, '00003|000000|00000');
});

test('saveTranslation stores the annotation on the attachment', async () => {
	const { ZPT, savedAnnotations } = loadPlugin({ attachment: { id: 42, libraryID: 1 } });
	const reader = { itemID: 42 };
	const saved = await ZPT.annotations.saveTranslation(reader, { text: 'Hello', position }, '你好');
	assert.equal(saved.comment, '你好');
	assert.equal(savedAnnotations.length, 1);
	assert.equal(savedAnnotations[0].key, 'KEY00001');
});

test('saveTranslation refuses when annotations are disabled', async () => {
	const { ZPT } = loadPlugin({ prefs: { 'annotation.enabled': false } });
	await assert.rejects(
		() => ZPT.annotations.saveTranslation({ itemID: 42 }, { text: 'Hello', position }, '你好'),
		(error) => error.code === 'annotationDisabled'
	);
});

test('saveTranslation reports a missing attachment', async () => {
	const { ZPT } = loadPlugin();
	await assert.rejects(
		() => ZPT.annotations.saveTranslation({}, { text: 'Hello', position }, '你好'),
		(error) => error.code === 'noAttachment'
	);
});
