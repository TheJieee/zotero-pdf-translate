import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPlugin, makeTransport, installTransport, timeoutError, statusError, googleResponse, openAIResponse, myMemoryResponse } from './helpers/load-plugin.mjs';

test('google-free is the default provider and returns a translated string', async () => {
	const { ZPT } = loadPlugin();
	const http = makeTransport(() => googleResponse('你好，世界。'));
	const result = await ZPT.translate.translate('Hello, world.', { http });
	assert.equal(result.text, '你好，世界。');
	assert.equal(result.provider, 'google-free');
	assert.equal(result.detectedLang, 'en');
	assert.equal(result.cached, false);
	assert.equal(http.calls.length, 1);
	assert.equal(http.calls[0].method, 'GET');
});

test('results are cached and force bypasses the cache', async () => {
	const { ZPT } = loadPlugin();
	const http = makeTransport(() => googleResponse('缓存'));
	await ZPT.translate.translate('Hello again.', { http });
	const second = await ZPT.translate.translate('Hello again.', { http });
	assert.equal(second.cached, true);
	assert.equal(http.calls.length, 1);
	await ZPT.translate.translate('Hello again.', { http, force: true });
	assert.equal(http.calls.length, 2);
});

test('cache key includes the target language', async () => {
	const { ZPT } = loadPlugin();
	const http = makeTransport(() => googleResponse('x'));
	await ZPT.translate.translate('Same text', { http, targetLang: 'zh-CN' });
	await ZPT.translate.translate('Same text', { http, targetLang: 'ja' });
	assert.equal(http.calls.length, 2);
});

test('long text is split into several requests and rejoined', async () => {
	const { ZPT } = loadPlugin({ prefs: { 'request.maxCharsPerChunk': 60 } });
	const http = makeTransport(({ url }) => {
		const query = new URL(url).searchParams.get('q');
		return googleResponse('[译]' + query.slice(0, 5));
	});
	const text = 'This is sentence number one. This is sentence number two. This is sentence number three. This is sentence number four.';
	const result = await ZPT.translate.translate(text, { http });
	assert.ok(http.calls.length > 1, 'expected multiple chunk requests');
	assert.equal(result.text.split('\n').length, http.calls.length);
});

test('the openai provider is used when selected and receives the target language', async () => {
	const { ZPT } = loadPlugin({ prefs: { provider: 'openai', 'openai.apiKey': 'sk-test', 'openai.model': 'gpt-4o-mini' } });
	const http = makeTransport(() => openAIResponse('你好世界'));
	const result = await ZPT.translate.translate('Hello world', { http });
	assert.equal(result.text, '你好世界');
	assert.equal(result.provider, 'openai');
	const payload = JSON.parse(http.calls[0].options.body);
	assert.match(payload.messages[0].content, /Simplified Chinese/);
	assert.equal(http.calls[0].options.headers.Authorization, 'Bearer sk-test');
});

test('a missing api key produces a noApiKey error', async () => {
	const { ZPT } = loadPlugin({ prefs: { provider: 'openai', 'openai.apiKey': '' } });
	const http = makeTransport(() => openAIResponse('x'));
	await assert.rejects(
		() => ZPT.translate.translate('Hello', { http }),
		(error) => error.code === 'noApiKey'
	);
	assert.equal(http.calls.length, 0);
});

test('empty text is rejected before any request', async () => {
	const { ZPT } = loadPlugin();
	const http = makeTransport(() => googleResponse('x'));
	await assert.rejects(() => ZPT.translate.translate('   '), (error) => error.code === 'emptyText');
	assert.equal(http.calls.length, 0);
});

test('HTTP status codes are mapped to localized error codes', async () => {
	const cases = [
		[429, 'rateLimit'],
		[401, 'auth'],
		[500, 'server'],
		[404, 'http']
	];
	for (const [status, code] of cases) {
		const { ZPT } = loadPlugin();
		ZPT.http.setTransport(async () => {
			const error = new Error('HTTP GET failed with status code ' + status);
			error.status = status;
			throw error;
		});
		await assert.rejects(
			() => ZPT.translate.translate('Hello', { force: true }),
			(error) => error.code === code
		);
	}
});

test('timeouts are mapped to the timeout error code', async () => {
	const { ZPT } = loadPlugin();
	ZPT.http.setTransport(async () => {
		const error = new Error('Request timed out');
		error.name = 'TimeoutException';
		throw error;
	});
	await assert.rejects(
		() => ZPT.translate.translate('Hello', { force: true }),
		(error) => error.code === 'timeout'
	);
});

test('self test reports the provider and translation', async () => {
	const { ZPT } = loadPlugin();
	ZPT.http.setTransport(async () => googleResponse('译文'));
	const result = await ZPT.translate.selfTest();
	assert.equal(result.ok, true);
	assert.equal(result.translation, '译文');
	assert.equal(result.provider, 'google-free');
});

test('provider labels are localized', () => {
	const zh = loadPlugin({ locale: 'zh-CN' });
	assert.equal(zh.ZPT.translate.providerLabel('openai'), 'OpenAI 兼容接口');
	const en = loadPlugin({ locale: 'en-US' });
	assert.equal(en.ZPT.translate.providerLabel('openai'), 'OpenAI-compatible API');
	assert.equal(en.ZPT.translate.langLabel('zh-CN'), '中文（简体） / Chinese (Simplified)');
	assert.equal(en.ZPT.translate.langLabel('auto'), 'Auto-detect');
});

test('clearing the cache forces a new request', async () => {
	const { ZPT } = loadPlugin();
	const http = makeTransport(() => googleResponse('x'));
	await ZPT.translate.translate('Cache me', { http });
	ZPT.translate.clearCache();
	await ZPT.translate.translate('Cache me', { http });
	assert.equal(http.calls.length, 2);
});

test('an unreachable provider falls back to another configured one', async () => {
	const { ZPT } = loadPlugin();
	const calls = installTransport(ZPT, ({ url }) => {
		if (url.includes('mymemory')) {
			return myMemoryResponse('变压器');
		}
		throw timeoutError();
	});
	const result = await ZPT.translate.translate('Transformer', { force: true });
	assert.equal(result.provider, 'mymemory');
	assert.equal(result.fallbackFrom, 'google-free');
	assert.equal(result.text, '变压器');
	assert.equal(calls.length, 2, 'expected one failed and one successful request');
});

test('after a failure the preferred provider is skipped for a while', async () => {
	const { ZPT } = loadPlugin();
	const calls = installTransport(ZPT, ({ url }) => {
		if (url.includes('mymemory')) {
			return myMemoryResponse('译文');
		}
		throw timeoutError();
	});
	await ZPT.translate.translate('First text', { force: true });
	assert.equal(calls.length, 2);
	const second = await ZPT.translate.translate('Second text', { force: true });
	assert.equal(second.provider, 'mymemory');
	assert.equal(calls.length, 3, 'the unhealthy provider should be skipped');
	assert.equal(ZPT.translate.providerHealth()['google-free'], 'unhealthy');
});

test('fallback can be turned off', async () => {
	const { ZPT } = loadPlugin({ prefs: { 'provider.autoFallback': false } });
	const calls = installTransport(ZPT, () => {
		throw timeoutError();
	});
	await assert.rejects(
		() => ZPT.translate.translate('Transformer', { force: true }),
		(error) => error.code === 'timeout'
	);
	assert.equal(calls.length, 1);
});

test('authentication errors do not trigger a fallback', async () => {
	const { ZPT } = loadPlugin({ prefs: { provider: 'openai', 'openai.apiKey': 'sk-bad' } });
	const calls = installTransport(ZPT, () => {
		throw statusError(401);
	});
	await assert.rejects(
		() => ZPT.translate.translate('Hello', { force: true }),
		(error) => error.code === 'auth'
	);
	assert.equal(calls.length, 1);
});
