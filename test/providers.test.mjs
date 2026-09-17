import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPlugin } from './helpers/load-plugin.mjs';
const { ZPT } = loadPlugin();
const google = ZPT.providers['google-free'];
const openai = ZPT.providers.openai;

test('google: buildURL encodes the query and the endpoint', () => {
	const url = google.buildURL('a b&c=1', 'auto', 'zh-CN');
	assert.ok(url.startsWith('https://translate.googleapis.com/translate_a/single?'));
	assert.ok(url.includes('client=gtx'));
	assert.ok(url.includes('sl=auto'));
	assert.ok(url.includes('tl=zh-CN'));
	assert.ok(url.includes('dj=1'));
	assert.ok(url.includes('q=a%20b%26c%3D1'));
});

test('google: parse handles the dj=1 response format', () => {
	const parsed = google.parse({ sentences: [{ trans: '你好' }, { trans: '世界' }], src: 'en' });
	assert.equal(parsed.text, '你好世界');
	assert.equal(parsed.detectedLang, 'en');
});

test('google: parse handles the legacy array format', () => {
	const parsed = google.parse([[['你好', 'Hello', null, null, 10]], null, 'en']);
	assert.equal(parsed.text, '你好');
	assert.equal(parsed.detectedLang, 'en');
});

test('google: parse rejects unknown payloads with a parse error', () => {
	assert.throws(() => google.parse({ unexpected: true }), (error) => error.code === 'parse');
});

test('openai: buildRequest builds an authenticated chat completion', () => {
	const config = { baseURL: 'https://api.deepseek.com/v1', apiKey: 'sk-1', model: 'deepseek-chat', systemPrompt: '' };
	const request = openai.buildRequest(config, 'Hello', 'en', 'zh-CN');
	assert.equal(request.url, 'https://api.deepseek.com/v1/chat/completions');
	assert.equal(request.headers.Authorization, 'Bearer sk-1');
	const payload = JSON.parse(request.body);
	assert.equal(payload.model, 'deepseek-chat');
	assert.equal(payload.temperature, 0);
	assert.equal(payload.messages.length, 2);
	assert.equal(payload.messages[1].content, 'Hello');
	assert.match(payload.messages[0].content, /Simplified Chinese/);
});

test('openai: no Authorization header without a key (local services)', () => {
	const request = openai.buildRequest({ baseURL: 'http://localhost:11434/v1', apiKey: '', model: 'llama3', systemPrompt: '' }, 'Hi', 'en', 'zh-CN');
	assert.equal(request.headers.Authorization, undefined);
});

test('openai: isLocalURL detects local endpoints', () => {
	assert.equal(openai.isLocalURL('http://localhost:11434/v1'), true);
	assert.equal(openai.isLocalURL('http://127.0.0.1:1234/v1'), true);
	assert.equal(openai.isLocalURL('https://api.openai.com/v1'), false);
});

test('openai: custom system prompt is used verbatim', () => {
	const request = openai.buildRequest({ baseURL: 'https://x/v1', apiKey: 'k', model: 'm', systemPrompt: 'Translate to Klingon.' }, 'Hi', 'auto', 'zh-CN');
	const payload = JSON.parse(request.body);
	assert.equal(payload.messages[0].content, 'Translate to Klingon.');
});

test('openai: parse unwraps fenced code blocks and rejects empty content', () => {
	assert.equal(openai.parse({ choices: [{ message: { content: '```\n你好\n```' } }] }).text, '你好');
	assert.throws(() => openai.parse({ choices: [{ message: { content: '   ' } }] }), (error) => error.code === 'emptyResult');
	assert.throws(() => openai.parse({}), (error) => error.code === 'emptyResult');
});

const mymemory = ZPT.providers.mymemory;

test('mymemory: buildURL uses Autodetect when the source language is automatic', () => {
	const url = mymemory.buildURL('hello world', 'auto', 'zh-CN');
	assert.ok(url.startsWith('https://api.mymemory.translated.net/get?'));
	assert.ok(url.includes('langpair=Autodetect%7Czh-CN'));
	assert.ok(url.includes('q=hello%20world'));
});

test('mymemory: buildURL passes an optional email address', () => {
	const { ZPT: withEmail } = loadPlugin({ prefs: { 'mymemory.email': 'me@example.com' } });
	const url = withEmail.providers.mymemory.buildURL('hi', 'en', 'zh-CN');
	assert.ok(url.includes('de=me%40example.com'));
});

test('mymemory: parse reads the translated text', () => {
	const parsed = mymemory.parse({ responseData: { translatedText: '你好' }, responseStatus: 200 });
	assert.equal(parsed.text, '你好');
});

test('mymemory: quota responses map to a quota error', () => {
	assert.throws(
		() => mymemory.parse({ responseStatus: 403, responseDetails: "YOU USED ALL AVAILABLE FREE TRANSLATIONS FOR TODAY. NEXT AVAILABLE IN 03 HOURS" }),
		(error) => error.code === 'quota'
	);
});

test('mymemory: other failures map to a server error', () => {
	assert.throws(
		() => mymemory.parse({ responseStatus: 500, responseDetails: 'INVALID LANGUAGE PAIR' }),
		(error) => error.code === 'server'
	);
});
