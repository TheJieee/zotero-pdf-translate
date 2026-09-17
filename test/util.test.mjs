import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPlugin } from './helpers/load-plugin.mjs';

const { ZPT } = loadPlugin();

test('normalizeText joins wrapped lines and repairs hyphenation', () => {
	const input = 'The trans-\nformer architecture is\nsimple.';
	assert.equal(ZPT.util.normalizeText(input), 'The transformer architecture is simple.');
});

test('normalizeText collapses exotic whitespace and stray spaces before punctuation', () => {
	const input = 'Hello\u00a0\u00a0world ,  again\u3000!';
	assert.equal(ZPT.util.normalizeText(input), 'Hello world, again!');
});

test('normalizeText keeps CJK text intact', () => {
	const input = '本文提出了一种\n新的方法。';
	assert.equal(ZPT.util.normalizeText(input), '本文提出了一种 新的方法。');
});

test('chunkText returns a single chunk for short text', () => {
	assert.deepEqual(Array.from(ZPT.util.chunkText('Hello world.', { maxChars: 100 })), ['Hello world.']);
});

test('chunkText respects the character limit and keeps sentence boundaries', () => {
	const sentence = 'This is a sentence about translation. ';
	const text = sentence.repeat(40);
	const chunks = ZPT.util.chunkText(text, { maxChars: 200 });
	assert.ok(chunks.length > 1);
	for (const chunk of chunks) {
		assert.ok(chunk.length <= 200, `chunk of ${chunk.length} chars exceeds the limit`);
	}
	assert.equal(Array.from(chunks).join(' ').replace(/\s+/g, ' ').trim(), text.trim());
});

test('chunkText respects the percent-encoded limit for CJK text', () => {
	const text = '这是一个用于测试分块逻辑的中文句子。'.repeat(200);
	const chunks = ZPT.util.chunkText(text, { maxChars: 5000, maxEncoded: 1200 });
	assert.ok(chunks.length > 1);
	for (const chunk of chunks) {
		assert.ok(ZPT.util.encodedLength(chunk) <= 1200, 'encoded chunk exceeds the limit');
	}
	assert.equal(chunks.join(''), text);
});

test('chunkText hard-splits a single oversized word', () => {
	const chunks = ZPT.util.chunkText('a'.repeat(250), { maxChars: 100 });
	assert.deepEqual(Array.from(chunks, (chunk) => chunk.length), [100, 100, 50]);
});

test('chunkText returns nothing for empty input', () => {
	assert.deepEqual(Array.from(ZPT.util.chunkText('   \n  ')), []);
});

test('joinURL', () => {
	assert.equal(ZPT.util.joinURL('https://api.openai.com/v1/', '/chat/completions'), 'https://api.openai.com/v1/chat/completions');
	assert.equal(ZPT.util.joinURL('https://example.com', 'chat/completions'), 'https://example.com/chat/completions');
});

test('promptLangName falls back to the raw code', () => {
	assert.equal(ZPT.util.promptLangName('zh-CN'), 'Simplified Chinese');
	assert.equal(ZPT.util.promptLangName('xx'), 'xx');
});

test('detectTextKind treats single tokens as words', () => {
	const cases = [
		'transformer', 'Transformer', 'Transformer.', 'Transformer,', 'well-known',
		'神经网络', '中文词汇', 'GmbH.', 'e.g.', 'and/or'
	];
	for (const text of cases) {
		assert.equal(ZPT.util.detectTextKind(text), 'word', `${text} should be a word`);
	}
});

test('detectTextKind treats numbers, DOIs, links and addresses as lookups', () => {
	const cases = ['3.14', '1,000', '12.5%', '10.1000/xyz123', 'https://example.com/a?b=1', 'www.example.com', 'user@example.com'];
	for (const text of cases) {
		assert.equal(ZPT.util.detectTextKind(text), 'word', `${text} should be a word`);
	}
});

test('detectTextKind treats prose as sentences', () => {
	const cases = [
		'This is a sentence.',
		'Translation is the communication of meaning from one language to another.',
		'Hello, world.',
		'guten Morgen',
		'Bonjour le monde',
		'Привет мир',
		'本文提出了一种新的方法。',
		'本文提出了一种新的方法，并在多个数据集上进行了验证。',
		'Transformer 模型在机器翻译任务上取得了很好的效果。',
		'a'.repeat(ZPT.util.WORD_TEXT_MAX + 1) + ' b'
	];
	for (const text of cases) {
		assert.equal(ZPT.util.detectTextKind(text), 'sentence', `${text.slice(0, 30)} should be a sentence`);
	}
});

test('detectTextKind keeps the CJK length boundary', () => {
	const short = '神'.repeat(ZPT.util.CJK_PHRASE_TEXT_MAX);
	const long = '神'.repeat(ZPT.util.CJK_PHRASE_TEXT_MAX + 1);
	assert.equal(ZPT.util.detectTextKind(short), 'word');
	assert.equal(ZPT.util.detectTextKind(long), 'sentence');
});

test('detectTextKind is not fooled by blank input', () => {
	assert.equal(ZPT.util.detectTextKind('   '), 'word');
	assert.equal(ZPT.util.detectTextKind(''), 'word');
});
