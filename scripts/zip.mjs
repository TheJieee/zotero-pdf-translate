/*
 * Minimal ZIP writer (deflate, no external dependencies) used to package the
 * plugin into an .xpi. Implements exactly what Zotero/Firefox needs to read a
 * plain zip archive.
 */

import { deflateRawSync } from 'node:zlib';

const CRC_TABLE = (() => {
	const table = new Int32Array(256);
	for (let i = 0; i < 256; i++) {
		let c = i;
		for (let k = 0; k < 8; k++) {
			c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		}
		table[i] = c;
	}
	return table;
})();

function crc32(buffer) {
	let crc = -1;
	for (let i = 0; i < buffer.length; i++) {
		crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ buffer[i]) & 0xff];
	}
	return (crc ^ -1) >>> 0;
}

function dosDateTime(date) {
	const year = Math.max(1980, date.getFullYear());
	const time = ((date.getHours() & 0x1f) << 11)
		| ((date.getMinutes() & 0x3f) << 5)
		| ((Math.floor(date.getSeconds() / 2)) & 0x1f);
	const day = (((year - 1980) & 0x7f) << 9)
		| (((date.getMonth() + 1) & 0x0f) << 5)
		| (date.getDate() & 0x1f);
	return { time, day };
}

/**
 * @param {Array<{name: string, data: Buffer|string, date?: Date}>} entries
 * @returns {Buffer} zip archive
 */
export function createZip(entries) {
	const chunks = [];
	const central = [];
	let offset = 0;

	for (const entry of entries) {
		const nameBuffer = Buffer.from(entry.name.replace(/\\/g, '/'), 'utf8');
		const data = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(String(entry.data), 'utf8');
		const compressed = deflateRawSync(data, { level: 9 });
		const useStore = compressed.length >= data.length;
		const payload = useStore ? data : compressed;
		const method = useStore ? 0 : 8;
		const { time, day } = dosDateTime(entry.date || new Date());
		const crc = crc32(data);

		const local = Buffer.alloc(30);
		local.writeUInt32LE(0x04034b50, 0);
		local.writeUInt16LE(20, 4);          // version needed
		local.writeUInt16LE(0x0800, 6);      // UTF-8 names
		local.writeUInt16LE(method, 8);
		local.writeUInt16LE(time, 10);
		local.writeUInt16LE(day, 12);
		local.writeUInt32LE(crc, 14);
		local.writeUInt32LE(payload.length, 18);
		local.writeUInt32LE(data.length, 22);
		local.writeUInt16LE(nameBuffer.length, 26);
		local.writeUInt16LE(0, 28);

		chunks.push(local, nameBuffer, payload);

		const directory = Buffer.alloc(46);
		directory.writeUInt32LE(0x02014b50, 0);
		directory.writeUInt16LE(20, 4);      // version made by
		directory.writeUInt16LE(20, 6);      // version needed
		directory.writeUInt16LE(0x0800, 8);
		directory.writeUInt16LE(method, 10);
		directory.writeUInt16LE(time, 12);
		directory.writeUInt16LE(day, 14);
		directory.writeUInt32LE(crc, 16);
		directory.writeUInt32LE(payload.length, 20);
		directory.writeUInt32LE(data.length, 24);
		directory.writeUInt16LE(nameBuffer.length, 28);
		directory.writeUInt16LE(0, 30);      // extra length
		directory.writeUInt16LE(0, 32);      // comment length
		directory.writeUInt16LE(0, 34);      // disk number
		directory.writeUInt16LE(0, 36);      // internal attributes
		directory.writeUInt32LE((0o100644 << 16) >>> 0, 38); // external attributes
		directory.writeUInt32LE(offset, 42);

		central.push(directory, nameBuffer);
		offset += local.length + nameBuffer.length + payload.length;
	}

	const centralBuffer = Buffer.concat(central);
	const end = Buffer.alloc(22);
	end.writeUInt32LE(0x06054b50, 0);
	end.writeUInt16LE(0, 4);
	end.writeUInt16LE(0, 6);
	end.writeUInt16LE(entries.length, 8);
	end.writeUInt16LE(entries.length, 10);
	end.writeUInt32LE(centralBuffer.length, 12);
	end.writeUInt32LE(offset, 16);
	end.writeUInt16LE(0, 20);

	return Buffer.concat([...chunks, centralBuffer, end]);
}
