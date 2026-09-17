/*
 * Small pure helpers: text normalization, chunking, URL joining and
 * cross-compartment value conversion. Kept free of Zotero APIs so it can be
 * unit-tested in Node.
 */

/* eslint-disable no-var */
var ZPT = (typeof ZPT !== 'undefined' && ZPT) ? ZPT : {};

ZPT.util = (function () {
	/**
	 * Make PDF/EPUB extracted text friendlier for translation services:
	 * join hard-wrapped lines, repair words split by a hyphen, squeeze spaces.
	 */
	function normalizeText(text) {
		if (text === undefined || text === null) {
			return '';
		}
		let s = String(text);
		s = s.replace(/\r\n?/g, '\n');
		// U+00A0 and other exotic spaces
		s = s.replace(/[\u00a0\u2000-\u200b\u202f\u205f\u3000]/g, ' ');
		// "trans-\nformer" -> "transformer"
		s = s.replace(/(\p{Ll})-\n(\p{Ll})/gu, '$1$2');
		// Join lines inside a paragraph
		s = s.replace(/[ \t]*\n[ \t]*/g, ' ');
		s = s.replace(/[ \t]{2,}/g, ' ');
		s = s.replace(/\s+([,.;:!?%)\]}\u3001\u3002\uff0c\uff1b\uff1a\uff01\uff1f])/g, '$1');
		return s.trim();
	}

	function encodedLength(text) {
		try {
			return encodeURIComponent(text).length;
		}
		catch (e) {
			return text.length * 3;
		}
	}

	// Sentence-ish boundaries, keeping the punctuation.
	const SENTENCE_RE = /[^\n.!?\u3002\uff01\uff1f\uff1b;]+[.!?\u3002\uff01\uff1f\uff1b;]*[ \t]*/g;

	function splitSegments(text) {
		let segments = text.match(SENTENCE_RE);
		if (!segments || !segments.length) {
			return text ? [text] : [];
		}
		// Drop empty/whitespace-only matches
		return segments.filter((s) => s.trim().length || s === ' ');
	}

	/**
	 * Split text into chunks that stay below the given character and
	 * percent-encoded length limits, preferring sentence boundaries.
	 *
	 * @param {String} text
	 * @param {Object} [options]
	 * @param {Number} [options.maxChars=1500]
	 * @param {Number} [options.maxEncoded=4000]
	 * @returns {String[]}
	 */
	function chunkText(text, options) {
		let maxChars = (options && options.maxChars) || 1500;
		let maxEncoded = (options && options.maxEncoded) || 4000;
		let normalized = normalizeText(text);
		if (!normalized) {
			return [];
		}
		let chunks = [];
		let current = '';
		for (let segment of splitSegments(normalized)) {
			let piece = segment;
			while (piece.length > maxChars || encodedLength(piece) > maxEncoded) {
				let cut = findCut(piece, maxChars, maxEncoded);
				if (current) {
					chunks.push(current);
					current = '';
				}
				chunks.push(piece.slice(0, cut));
				piece = piece.slice(cut);
			}
			if (!piece) {
				continue;
			}
			let candidate = current + piece;
			if (current && (candidate.length > maxChars || encodedLength(candidate) > maxEncoded)) {
				chunks.push(current);
				current = piece;
			}
			else {
				current = candidate;
			}
		}
		if (current.trim()) {
			chunks.push(current);
		}
		return chunks.map((chunk) => chunk.trim()).filter((chunk) => chunk.length);
	}

	function findCut(text, maxChars, maxEncoded) {
		let lowest = 1;
		let highest = Math.min(text.length, maxChars);
		// Binary search for the largest prefix that fits the encoded limit
		let best = 1;
		while (lowest <= highest) {
			let mid = Math.floor((lowest + highest) / 2);
			if (encodedLength(text.slice(0, mid)) <= maxEncoded) {
				best = mid;
				lowest = mid + 1;
			}
			else {
				highest = mid - 1;
			}
		}
		// Prefer to break at a space
		let slice = text.slice(0, best);
		let space = slice.lastIndexOf(' ');
		if (space > best * 0.6) {
			return space + 1;
		}
		return best;
	}

	function joinURL(base, path) {
		let left = String(base || '').replace(/\/+$/, '');
		let right = String(path || '').replace(/^\/+/, '');
		return right ? left + '/' + right : left;
	}

	/**
	 * Convert a value coming from another compartment (reader iframe objects)
	 * into a plain value owned by the current compartment.
	 */
	function toPlain(value) {
		if (value === null || value === undefined || typeof value !== 'object') {
			return value;
		}
		try {
			return JSON.parse(JSON.stringify(value));
		}
		catch (e) {
			return value;
		}
	}

	function truncate(text, max) {
		let s = String(text === undefined || text === null ? '' : text);
		return s.length > max ? s.slice(0, max) + '…' : s;
	}

	// Language names used when building LLM prompts. Deliberately English so
	// that the instruction is unambiguous for any model.
	const PROMPT_LANG_NAMES = {
		'auto': 'the source language',
		'zh-CN': 'Simplified Chinese',
		'zh-TW': 'Traditional Chinese',
		'en': 'English',
		'ja': 'Japanese',
		'ko': 'Korean',
		'fr': 'French',
		'de': 'German',
		'es': 'Spanish',
		'ru': 'Russian',
		'pt': 'Portuguese',
		'it': 'Italian',
		'ar': 'Arabic',
		'hi': 'Hindi'
	};

	function promptLangName(code) {
		return PROMPT_LANG_NAMES[code] || code || 'the target language';
	}

	/**
	 * Build a localized Error with a machine-readable `code`.
	 * @param {String} code - e.g. 'parse', 'emptyResult', 'noApiKey'
	 * @param {Object} [args]
	 */
	function pluginError(code, args) {
		let error = new Error(ZPT.l10n.t('error.' + code, args));
		error.code = code;
		return error;
	}

	return {
		normalizeText,
		chunkText,
		splitSegments,
		encodedLength,
		joinURL,
		toPlain,
		truncate,
		pluginError,
		promptLangName,
		PROMPT_LANG_NAMES
	};
})();
