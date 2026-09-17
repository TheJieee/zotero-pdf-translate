/*
 * Minimal ZIP reader (stored + deflate) so scripts can inspect .xpi archives
 * and Zotero's omni.ja without external dependencies.
 */

import { inflateRawSync } from 'node:zlib';

const EOCD_SIG = 0x06054b50;
const CENTRAL_SIG = 0x02014b50;
const LOCAL_SIG = 0x04034b50;

export function readZip(buffer) {
	let eocd = -1;
	const lowest = Math.max(0, buffer.length - 22 - 65536);
	for (let i = buffer.length - 22; i >= lowest; i--) {
		if (buffer.readUInt32LE(i) === EOCD_SIG) {
			eocd = i;
			break;
		}
	}
	if (eocd < 0) {
		throw new Error('not a zip archive');
	}
	const count = buffer.readUInt16LE(eocd + 10);
	const centralOffset = buffer.readUInt32LE(eocd + 16);
	const index = new Map();

	let pointer = centralOffset;
	for (let i = 0; i < count; i++) {
		if (buffer.readUInt32LE(pointer) !== CENTRAL_SIG) {
			throw new Error('corrupt central directory at entry ' + i);
		}
		const method = buffer.readUInt16LE(pointer + 10);
		const compressedSize = buffer.readUInt32LE(pointer + 20);
		const uncompressedSize = buffer.readUInt32LE(pointer + 24);
		const nameLength = buffer.readUInt16LE(pointer + 28);
		const extraLength = buffer.readUInt16LE(pointer + 30);
		const commentLength = buffer.readUInt16LE(pointer + 32);
		const localOffset = buffer.readUInt32LE(pointer + 42);
		const name = buffer.toString('utf8', pointer + 46, pointer + 46 + nameLength);
		index.set(name, { method, compressedSize, uncompressedSize, localOffset });
		pointer += 46 + nameLength + extraLength + commentLength;
	}

	function read(name) {
		const entry = index.get(name);
		if (!entry) {
			return null;
		}
		const local = entry.localOffset;
		if (buffer.readUInt32LE(local) !== LOCAL_SIG) {
			throw new Error('corrupt local header for ' + name);
		}
		const nameLength = buffer.readUInt16LE(local + 26);
		const extraLength = buffer.readUInt16LE(local + 28);
		const start = local + 30 + nameLength + extraLength;
		const raw = buffer.subarray(start, start + entry.compressedSize);
		return entry.method === 0 ? Buffer.from(raw) : inflateRawSync(raw);
	}

	return {
		names: () => Array.from(index.keys()),
		has: (name) => index.has(name),
		read,
		readText: (name) => {
			const data = read(name);
			return data === null ? null : data.toString('utf8');
		}
	};
}
