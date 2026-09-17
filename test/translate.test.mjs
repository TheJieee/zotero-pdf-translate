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
		() => ZPT.translate.translate('This sentence needs a key.', { http }),
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

test('a single word goes to the free Google endpoint', async () => {
	const { ZPT } = loadPlugin({ prefs: { provider: 'openai', 'openai.apiKey': 'sk-test' } });
	const http = makeTransport(() => googleResponse('变压器'));
	const result = await ZPT.translate.translate('transformer', { http });
	assert.equal(result.route, 'word');
	assert.equal(result.kind, 'word');
	assert.equal(result.provider, 'google-free');
	assert.equal(http.calls.length, 1);
	assert.match(http.calls[0].url, /translate\.googleapis\.com/);
	assert.match(http.calls[0].url, /sl=en/);
});

test('a sentence goes to the LLM when it is configured', async () => {
	const { ZPT } = loadPlugin({ prefs: { provider: 'google-free', 'openai.apiKey': 'sk-test' } });
	const http = makeTransport(() => openAIResponse('这是一个句子。'));
	const result = await ZPT.translate.translate('This is a sentence.', { http });
	assert.equal(result.route, 'sentence');
	assert.equal(result.kind, 'sentence');
	assert.equal(result.provider, 'openai');
	assert.equal(http.calls.length, 1);
	assert.match(http.calls[0].url, /chat\/completions/);
});

test('an unconfigured LLM falls back to the free endpoint for sentences', async () => {
	const { ZPT } = loadPlugin({ prefs: { 'openai.apiKey': '' } });
	const http = makeTransport(() => googleResponse('句子译文'));
	const result = await ZPT.translate.translate('This sentence has no LLM configured.', { http });
	assert.equal(result.route, 'sentence');
	assert.equal(result.provider, 'google-free');
	assert.equal(http.calls.length, 1, 'the unconfigured LLM must not be called');
});

test('an unreachable Google endpoint is skipped in favour of the preferred service', async () => {
	const { ZPT } = loadPlugin({ prefs: { 'openai.apiKey': 'sk-test', provider: 'mymemory' } });
	const calls = installTransport(ZPT, ({ url }) => {
		if (url.includes('mymemory')) {
			return myMemoryResponse('变压器');
		}
		throw timeoutError();
	});
	// The preferred service leads for single words, so Google is not even tried
	const result = await ZPT.translate.translate('autoregressive', { force: true });
	assert.equal(result.kind, 'word');
	assert.equal(result.provider, 'mymemory');
	assert.equal(result.text, '变压器');
	assert.equal(calls.length, 1);
	assert.equal(calls[0].url.includes('mymemory'), true);
});

test('when every free endpoint fails the LLM answers instead', async () => {
	const { ZPT } = loadPlugin({ prefs: { 'openai.apiKey': 'sk-test', provider: 'google-free' } });
	const calls = installTransport(ZPT, ({ url }) => {
		if (url.includes('chat/completions')) {
			return openAIResponse('自回归的');
		}
		throw timeoutError();
	});
	// google-free and mymemory both time out, the LLM answers
	const result = await ZPT.translate.translate('autoregressive', { force: true });
	assert.equal(result.provider, 'openai');
	assert.equal(result.fallbackFrom, 'google-free');
	assert.equal(result.text, '自回归的');
	assert.equal(calls.length, 3);
	assert.equal(calls[2].url.includes('chat/completions'), true);
});

test('an unreachable free endpoint can fall back to the LLM', async () => {
	const { ZPT } = loadPlugin({ prefs: { 'openai.apiKey': 'sk-test', provider: 'mymemory' } });
	let allowMymemory = true;
	const calls = installTransport(ZPT, ({ url }) => {
		if (url.includes('chat/completions')) {
			return openAIResponse('自回归的');
		}
		if (url.includes('mymemory') && allowMymemory) {
			return myMemoryResponse('自回归');
		}
		throw timeoutError();
	});
	// mymemory (the preferred service) answers the first request
	const first = await ZPT.translate.translate('autoregressive', { force: true });
	assert.equal(first.provider, 'mymemory');
	// once it is unhealthy the LLM takes over
	allowMymemory = false;
	const second = await ZPT.translate.translate('autoregressive', { force: true });
	assert.equal(second.provider, 'openai');
	assert.equal(second.text, '自回归的');
	assert.match(calls[calls.length - 1].url, /chat\/completions/);
});

test('CJK text keeps the auto-detect source language', async () => {
	const { ZPT } = loadPlugin({ prefs: { 'openai.apiKey': 'sk-test' } });
	const http = makeTransport(() => googleResponse('a method'));
	const result = await ZPT.translate.translate('中文词语', { http });
	assert.equal(result.provider, 'google-free');
	assert.equal(result.sourceLang, 'auto');
	assert.match(http.calls[0].url, /sl=auto/);
});

test('smart routing can be turned off', async () => {
	const { ZPT } = loadPlugin({ prefs: { 'translate.autoRoute': false, provider: 'mymemory' } });
	const http = makeTransport(() => myMemoryResponse('变压器'));
	const result = await ZPT.translate.translate('transformer', { http });
	assert.equal(result.route, null);
	assert.equal(result.provider, 'mymemory');
	assert.equal(result.kind, 'word');
});

test('providerChain keeps the text-appropriate family first and appends the other', () => {
	const { ZPT } = loadPlugin({ prefs: { 'openai.apiKey': 'sk-test' } });
	// sentences prefer the LLM, then the free endpoints
	assert.deepEqual(Array.from(ZPT.translate.providerChain('sentence', 'google-free')), ['openai', 'google-free', 'mymemory']);
	// words prefer the free family, and the preferred service leads it
	assert.deepEqual(Array.from(ZPT.translate.providerChain('word', 'mymemory')), ['mymemory', 'google-free', 'openai']);
	// manual (no routing): the user's own service leads, free before LLM
	assert.deepEqual(Array.from(ZPT.translate.providerChain(null, 'openai')), ['openai', 'google-free', 'mymemory']);
	assert.deepEqual(Array.from(ZPT.translate.providerChain(null, 'mymemory')), ['mymemory', 'google-free', 'openai']);
	// without a key the LLM family is unusable: the free family covers sentences
	const noKey = loadPlugin();
	assert.deepEqual(Array.from(noKey.ZPT.translate.providerChain('sentence', 'google-free')), ['google-free', 'mymemory']);
	// ...unless the user picked the LLM explicitly — then the real error shows
	assert.deepEqual(Array.from(noKey.ZPT.translate.providerChain('sentence', 'openai')), ['openai', 'google-free', 'mymemory']);
});

test('an explicit provider option wins over the routing choice', async () => {
	for (const prefs of [{}, { 'translate.autoRoute': false }]) {
		const { ZPT } = loadPlugin({ prefs });
		const http = makeTransport(() => myMemoryResponse('译文'));
		const result = await ZPT.translate.translate('This is a sentence.', { provider: 'mymemory', http });
		assert.equal(result.provider, 'mymemory');
		assert.match(http.calls[0].url, /mymemory/);
	}
});

test('the preferred service answers when smart routing is off', async () => {
	const { ZPT } = loadPlugin({ prefs: { 'translate.autoRoute': false, provider: 'openai', 'openai.apiKey': 'sk-test' } });
	const http = makeTransport(() => openAIResponse('你好'));
	const result = await ZPT.translate.translate('This is a sentence.', { http });
	assert.equal(result.provider, 'openai');
	assert.equal(result.route, null);
	assert.match(http.calls[0].url, /chat\/completions/);
});

test('a preferred service without a key reports noApiKey instead of silently swapping', async () => {
	const { ZPT } = loadPlugin({ prefs: { 'translate.autoRoute': false, provider: 'openai', 'openai.apiKey': '' } });
	const http = makeTransport(() => googleResponse('x'));
	await assert.rejects(
		() => ZPT.translate.translate('This is a sentence.', { http }),
		(error) => error.code === 'noApiKey'
	);
	assert.equal(http.calls.length, 0);
});

test('turning auto-fallback off does not change which service answers', async () => {
	for (const autoFallback of [true, false]) {
		const { ZPT } = loadPlugin({ prefs: { provider: 'mymemory', 'provider.autoFallback': autoFallback } });
		const http = makeTransport(() => myMemoryResponse('译文'));
		const result = await ZPT.translate.translate('transformer', { http });
		assert.equal(result.provider, 'mymemory', `autoFallback=${autoFallback}`);
		assert.equal(http.calls.length, 1);
	}
});

test('a short ASCII token is sent as English, other scripts keep auto-detect', async () => {
	const cases = [
		['transformer', 'en'],
		['Transformer', 'en'],
		['guten Morgen', 'auto'],
		['Bonjour le monde', 'auto'],
		['Привет мир', 'auto'],
		['Größe', 'auto'],
		['神经网络', 'auto']
	];
	for (const [text, expected] of cases) {
		const { ZPT } = loadPlugin();
		const http = makeTransport(() => googleResponse('x'));
		const result = await ZPT.translate.translate(text, { http });
		assert.equal(result.sourceLang, expected, `${text} should use ${expected}`);
		assert.match(http.calls[0].url, new RegExp('sl=' + expected));
	}
});

test('a failed provider is skipped on the next request', async () => {
	const { ZPT } = loadPlugin({ prefs: { 'openai.apiKey': 'sk-test' } });
	const calls = installTransport(ZPT, ({ url }) => {
		if (url.includes('chat/completions')) {
			throw timeoutError();
		}
		return googleResponse('句子译文');
	});
	await ZPT.translate.translate('First sentence here.', { force: true });
	const second = await ZPT.translate.translate('Second sentence here.', { force: true });
	assert.equal(second.provider, 'google-free');
	assert.equal(ZPT.translate.providerHealth()['openai'], 'unhealthy');
	assert.equal(
		calls.filter((call) => call.url.includes('chat/completions')).length,
		1,
		'the unhealthy LLM must not be retried within the cool-down window'
	);
});

test('a fallback answer is served from the cache on the next identical request', async () => {
	const { ZPT } = loadPlugin();
	const calls = installTransport(ZPT, ({ url }) => {
		if (url.includes('mymemory')) {
			return myMemoryResponse('变压器');
		}
		throw timeoutError();
	});
	const first = await ZPT.translate.translate('Transformer', { force: true });
	assert.equal(first.provider, 'mymemory');
	assert.equal(first.fallbackFrom, 'google-free');
	const second = await ZPT.translate.translate('Transformer');
	assert.equal(second.cached, true);
	assert.equal(second.provider, 'mymemory');
	assert.equal(calls.length, 2, 'the cached answer must not be requested again');
});

test('the self test does not report a switch that never happened', async () => {
	const { ZPT } = loadPlugin({ prefs: { provider: 'mymemory' } });
	const calls = installTransport(ZPT, ({ url }) => {
		return url.includes('mymemory') ? myMemoryResponse('译文') : googleResponse('G');
	});
	const result = await ZPT.translate.selfTest();
	assert.equal(result.ok, true);
	assert.equal(result.fallbackFrom, null);
	assert.equal(result.steps.length, 2);
	assert.equal(result.steps[0].kind, 'sentence');
	assert.equal(result.steps[0].provider, 'mymemory');
	assert.equal(result.steps[1].kind, 'word');
	assert.equal(result.steps[1].provider, 'mymemory');
	assert.equal(
		calls.some((call) => call.url.includes('mymemory')),
		true,
		"the user's configured service must be exercised"
	);
});

test('the self test works with smart routing turned off', async () => {
	const { ZPT } = loadPlugin({ prefs: { 'translate.autoRoute': false, provider: 'mymemory' } });
	const calls = installTransport(ZPT, () => myMemoryResponse('译文'));
	const result = await ZPT.translate.selfTest();
	assert.equal(result.ok, true);
	assert.equal(result.provider, 'mymemory');
	assert.equal(result.steps.length, 1);
	assert.equal(calls.length, 1);
});

test('the self test covers both routes when smart routing is on', async () => {
	const { ZPT } = loadPlugin({ prefs: { 'openai.apiKey': 'sk-test' } });
	const calls = installTransport(ZPT, ({ url }) => {
		return url.includes('chat/completions')
			? openAIResponse('句子译文')
			: googleResponse('单词译文');
	});
	const result = await ZPT.translate.selfTest();
	assert.equal(result.ok, true);
	assert.equal(result.steps.length, 2);
	assert.equal(result.steps[0].kind, 'sentence');
	assert.equal(result.steps[0].provider, 'openai');
	assert.equal(result.steps[1].kind, 'word');
	assert.equal(result.steps[1].provider, 'google-free');
	assert.equal(calls.length, 2);
});

test('the self test reports a failure for both routes', async () => {
	const { ZPT } = loadPlugin({ prefs: { 'openai.apiKey': 'sk-test' } });
	installTransport(ZPT, () => {
		throw timeoutError();
	});
	await assert.rejects(
		() => ZPT.translate.selfTest(),
		(error) => {
			assert.equal(error.code, 'timeout');
			assert.equal(error.steps.length, 2);
			return true;
		}
	);
});
