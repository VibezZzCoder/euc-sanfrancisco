// Vendored by tools/vendor-euc.mjs from VibezZzCoder/EUC-thrills@5f45fff src/render/pngDecode.ts.
// MIT, (c) 2026 VibezZzCoder. See js/euc/LICENSE and NOTICE-EUC-THRILLS.md. Do not edit; re-run the tool.
/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64_LOOKUP = (() => {
    const table = new Int16Array(128).fill(-1);
    for (let i = 0; i < B64.length; i += 1)
        table[B64.charCodeAt(i)] = i;
    return table;
})();
export function bytesFromBase64(text) {
    let length = text.length;
    while (length > 0 && text.charCodeAt(length - 1) === 61)
        length -= 1;
    const out = new Uint8Array(Math.floor((length * 3) / 4));
    let bits = 0;
    let held = 0;
    let at = 0;
    for (let i = 0; i < length; i += 1) {
        const code = text.charCodeAt(i);
        const value = code < 128 ? B64_LOOKUP[code] : -1;
        if (value < 0)
            throw new Error(`base64: unexpected character at ${i}`);
        held = (held << 6) | value;
        bits += 6;
        if (bits >= 8) {
            bits -= 8;
            out[at] = (held >> bits) & 0xff;
            at += 1;
        }
    }
    return out;
}
const MAX_BITS = 15;
function buildHuffman(lengths, count) {
    const counts = new Int32Array(MAX_BITS + 1);
    for (let symbol = 0; symbol < count; symbol += 1)
        counts[lengths[symbol]] += 1;
    counts[0] = 0;
    const offsets = new Int32Array(MAX_BITS + 2);
    for (let length = 1; length <= MAX_BITS; length += 1) {
        offsets[length + 1] = offsets[length] + counts[length];
    }
    const symbols = new Int32Array(count);
    for (let symbol = 0; symbol < count; symbol += 1) {
        const length = lengths[symbol];
        if (length !== 0) {
            symbols[offsets[length]] = symbol;
            offsets[length] += 1;
        }
    }
    return { count: counts, symbol: symbols };
}
class BitReader {
    data;
    at;
    held = 0;
    bits = 0;
    constructor(data, start) {
        this.data = data;
        this.at = start;
    }
    bit() {
        if (this.bits === 0) {
            if (this.at >= this.data.length)
                throw new Error('deflate: out of input');
            this.held = this.data[this.at];
            this.at += 1;
            this.bits = 8;
        }
        const value = this.held & 1;
        this.held >>= 1;
        this.bits -= 1;
        return value;
    }
    read(count) {
        let value = 0;
        for (let i = 0; i < count; i += 1)
            value |= this.bit() << i;
        return value;
    }
    align() {
        this.bits = 0;
        this.held = 0;
        return this.at;
    }
    seek(position) {
        this.at = position;
        this.bits = 0;
        this.held = 0;
    }
    decode(table) {
        let code = 0;
        let first = 0;
        let index = 0;
        for (let length = 1; length <= MAX_BITS; length += 1) {
            code |= this.bit();
            const count = table.count[length];
            if (code - first < count)
                return table.symbol[index + (code - first)];
            index += count;
            first = (first + count) << 1;
            code <<= 1;
        }
        throw new Error('deflate: invalid Huffman code');
    }
}
const LENGTH_BASE = Int32Array.from([
    3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31,
    35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258,
]);
const LENGTH_EXTRA = Int32Array.from([
    0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2,
    3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0,
]);
const DISTANCE_BASE = Int32Array.from([
    1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193,
    257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12_289, 16_385, 24_577,
]);
const DISTANCE_EXTRA = Int32Array.from([
    0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6,
    7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13,
]);
const CODE_LENGTH_ORDER = Int32Array.from([
    16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15,
]);
const FIXED_LITERALS = (() => {
    const lengths = new Uint8Array(288);
    lengths.fill(8, 0, 144);
    lengths.fill(9, 144, 256);
    lengths.fill(7, 256, 280);
    lengths.fill(8, 280, 288);
    return buildHuffman(lengths, 288);
})();
const FIXED_DISTANCES = buildHuffman(new Uint8Array(30).fill(5), 30);
export function inflate(source, expected) {
    if (source.length < 2)
        throw new Error('zlib: stream too short');
    const method = source[0] & 0x0f;
    if (method !== 8)
        throw new Error(`zlib: compression method ${method} is not DEFLATE`);
    if (((source[0] << 8) | source[1]) % 31 !== 0)
        throw new Error('zlib: bad header check');
    if ((source[1] & 0x20) !== 0)
        throw new Error('zlib: preset dictionaries are not supported');
    const out = new Uint8Array(expected);
    let written = 0;
    const put = (byte) => {
        if (written >= expected)
            throw new Error('zlib: stream is longer than the image');
        out[written] = byte;
        written += 1;
    };
    const reader = new BitReader(source, 2);
    for (;;) {
        const last = reader.bit();
        const type = reader.read(2);
        if (type === 0) {
            const at = reader.align();
            if (at + 4 > source.length)
                throw new Error('deflate: truncated stored block');
            const length = source[at] | (source[at + 1] << 8);
            const check = source[at + 2] | (source[at + 3] << 8);
            if ((length ^ 0xffff) !== check)
                throw new Error('deflate: stored block length check failed');
            for (let i = 0; i < length; i += 1)
                put(source[at + 4 + i]);
            reader.seek(at + 4 + length);
        }
        else if (type === 1 || type === 2) {
            let literals = FIXED_LITERALS;
            let distances = FIXED_DISTANCES;
            if (type === 2) {
                const literalCount = reader.read(5) + 257;
                const distanceCount = reader.read(5) + 1;
                const codeCount = reader.read(4) + 4;
                const codeLengths = new Uint8Array(19);
                for (let i = 0; i < codeCount; i += 1) {
                    codeLengths[CODE_LENGTH_ORDER[i]] = reader.read(3);
                }
                const codeTable = buildHuffman(codeLengths, 19);
                const lengths = new Uint8Array(literalCount + distanceCount);
                let at = 0;
                while (at < lengths.length) {
                    const symbol = reader.decode(codeTable);
                    if (symbol < 16) {
                        lengths[at] = symbol;
                        at += 1;
                    }
                    else if (symbol === 16) {
                        if (at === 0)
                            throw new Error('deflate: repeat with no previous length');
                        const previous = lengths[at - 1];
                        let repeat = 3 + reader.read(2);
                        while (repeat > 0 && at < lengths.length) {
                            lengths[at] = previous;
                            at += 1;
                            repeat -= 1;
                        }
                    }
                    else {
                        const repeatLength = symbol === 17 ? 3 + reader.read(3) : 11 + reader.read(7);
                        let repeat = repeatLength;
                        while (repeat > 0 && at < lengths.length) {
                            lengths[at] = 0;
                            at += 1;
                            repeat -= 1;
                        }
                    }
                }
                literals = buildHuffman(lengths.subarray(0, literalCount), literalCount);
                distances = buildHuffman(lengths.subarray(literalCount), distanceCount);
            }
            for (;;) {
                const symbol = reader.decode(literals);
                if (symbol < 256) {
                    put(symbol);
                }
                else if (symbol === 256) {
                    break;
                }
                else {
                    const index = symbol - 257;
                    if (index >= LENGTH_BASE.length)
                        throw new Error('deflate: invalid length symbol');
                    const length = LENGTH_BASE[index] + reader.read(LENGTH_EXTRA[index]);
                    const distanceSymbol = reader.decode(distances);
                    if (distanceSymbol >= DISTANCE_BASE.length)
                        throw new Error('deflate: invalid distance symbol');
                    const distance = DISTANCE_BASE[distanceSymbol] + reader.read(DISTANCE_EXTRA[distanceSymbol]);
                    if (distance > written)
                        throw new Error('deflate: distance reaches before the output');
                    for (let i = 0; i < length; i += 1)
                        put(out[written - distance]);
                }
            }
        }
        else {
            throw new Error('deflate: reserved block type');
        }
        if (last === 1)
            break;
    }
    if (written !== expected) {
        throw new Error(`zlib: decoded ${written} bytes, expected ${expected}`);
    }
    return out;
}
function paeth(a, b, c) {
    const p = a + b - c;
    const pa = Math.abs(p - a);
    const pb = Math.abs(p - b);
    const pc = Math.abs(p - c);
    if (pa <= pb && pa <= pc)
        return a;
    return pb <= pc ? b : c;
}
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
export function decodePng(bytes) {
    for (let i = 0; i < PNG_SIGNATURE.length; i += 1) {
        if (bytes[i] !== PNG_SIGNATURE[i])
            throw new Error('png: bad signature');
    }
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let at = 8;
    let width = 0;
    let height = 0;
    const parts = [];
    let compressedLength = 0;
    let sawHeader = false;
    while (at + 8 <= bytes.length) {
        const length = view.getUint32(at);
        const type = String.fromCharCode(bytes[at + 4], bytes[at + 5], bytes[at + 6], bytes[at + 7]);
        const body = at + 8;
        if (type === 'IHDR') {
            width = view.getUint32(body);
            height = view.getUint32(body + 4);
            const depth = bytes[body + 8];
            const colour = bytes[body + 9];
            const interlace = bytes[body + 12];
            if (depth !== 8)
                throw new Error(`png: bit depth ${depth} is not supported`);
            if (colour !== 6)
                throw new Error(`png: colour type ${colour} is not supported (RGBA only)`);
            if (interlace !== 0)
                throw new Error('png: interlaced images are not supported');
            sawHeader = true;
        }
        else if (type === 'IDAT') {
            parts.push(bytes.subarray(body, body + length));
            compressedLength += length;
        }
        else if (type === 'IEND') {
            break;
        }
        at = body + length + 4;
    }
    if (!sawHeader)
        throw new Error('png: no IHDR');
    if (parts.length === 0)
        throw new Error('png: no IDAT');
    if (width <= 0 || height <= 0)
        throw new Error('png: empty image');
    let compressed;
    if (parts.length === 1) {
        compressed = parts[0];
    }
    else {
        compressed = new Uint8Array(compressedLength);
        let offset = 0;
        for (const part of parts) {
            compressed.set(part, offset);
            offset += part.length;
        }
    }
    const stride = width * 4;
    const raw = inflate(compressed, height * (stride + 1));
    const rgba = new Uint8Array(height * stride);
    for (let y = 0; y < height; y += 1) {
        const filter = raw[y * (stride + 1)];
        const line = y * (stride + 1) + 1;
        const row = y * stride;
        const above = row - stride;
        for (let x = 0; x < stride; x += 1) {
            const value = raw[line + x];
            const left = x >= 4 ? rgba[row + x - 4] : 0;
            const up = y > 0 ? rgba[above + x] : 0;
            const upLeft = y > 0 && x >= 4 ? rgba[above + x - 4] : 0;
            let restored;
            switch (filter) {
                case 0:
                    restored = value;
                    break;
                case 1:
                    restored = value + left;
                    break;
                case 2:
                    restored = value + up;
                    break;
                case 3:
                    restored = value + ((left + up) >> 1);
                    break;
                case 4:
                    restored = value + paeth(left, up, upLeft);
                    break;
                default: throw new Error(`png: filter ${filter} on row ${y}`);
            }
            rgba[row + x] = restored & 0xff;
        }
    }
    return { width, height, rgba };
}
