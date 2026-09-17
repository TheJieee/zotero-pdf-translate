/*
 * Thin wrapper around Zotero.HTTP with error normalization.
 * The request implementation can be swapped through ZPT.http.setTransport()
 * so the translation core can be unit-tested without Zotero.
 */

/* eslint-disable no-var */
var ZPT = (typeof ZPT !== 'undefined' && ZPT) ? ZPT : {};

ZPT.http = (function () {
	function defaultTransport(method, url, options) {
		return Zotero.HTTP.request(method, url, options).then((xhr) => {
			let body = xhr.response !== undefined && xhr.response !== null ? xhr.response : xhr.responseText;
			return { status: xhr.status, body, xhr };
		});
	}

	let transport = defaultTransport;

	function setTransport(fn) {
		transport = fn || defaultTransport;
	}

	function statusOf(exception) {
		if (!exception) {
			return 0;
		}
		let status = exception.status || exception.statusCode;
		if (!status && exception.xhr && exception.xhr.status) {
			status = exception.xhr.status;
		}
		if (!status && exception.response && exception.response.status) {
			status = exception.response.status;
		}
		if (!status) {
			let match = /status code (\d{3})/i.exec(String(exception.message || ''));
			if (match) {
				status = parseInt(match[1], 10);
			}
		}
		return status || 0;
	}

	function normalizeError(exception) {
		let status = statusOf(exception);
		let message = String((exception && exception.message) || exception || '');
		let code = 'unknown';
		if (/timeout|timed out/i.test(message) || (exception && exception.name === 'TimeoutException')) {
			code = 'timeout';
		}
		else if (status === 401 || status === 403) {
			code = 'auth';
		}
		else if (status === 429) {
			code = 'rateLimit';
		}
		else if (status >= 500) {
			code = 'server';
		}
		else if (status >= 400) {
			code = 'http';
		}
		else if (!status && /network|NS_ERROR|connection|refused|unreachable|offline/i.test(message)) {
			code = 'network';
		}
		else if (!status && /JSON|parse|Unexpected token/i.test(message)) {
			code = 'parse';
		}
		let error = new Error(ZPT.l10n.t('error.' + code, { status, detail: message }));
		error.code = code;
		error.status = status;
		error.cause = exception;
		return error;
	}

	/**
	 * @param {String} method
	 * @param {String} url
	 * @param {Object} [options] Zotero.HTTP.request options
	 * @returns {Promise<{status: Number, body: *, xhr: Object}>}
	 */
	async function request(method, url, options) {
		let opts = Object.assign({}, options);
		let timeout = ZPT.prefs.getNumber('request.timeout');
		if (opts.timeout === undefined && timeout > 0) {
			opts.timeout = timeout * 1000;
		}
		if (ZPT.log) {
			ZPT.log.debug(method + ' ' + (opts.debugURL || String(url).split('?')[0]));
		}
		try {
			return await transport(method, url, opts);
		}
		catch (e) {
			throw normalizeError(e);
		}
	}

	function requestJSON(method, url, options) {
		return request(method, url, Object.assign({ responseType: 'json' }, options));
	}

	function postJSON(url, data, options) {
		return requestJSON('POST', url, Object.assign({
			body: JSON.stringify(data),
			headers: {
				'Content-Type': 'application/json',
				'Accept': 'application/json'
			}
		}, options));
	}

	return { request, requestJSON, postJSON, setTransport, normalizeError, statusOf };
})();
