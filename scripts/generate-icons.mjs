// Generates PWA icons as PNGs with zero image dependencies.
// A minimal PNG encoder (IHDR + IDAT[zlib] + IEND) draws a simple
// placeholder mark: dark rounded field with an accent ring + dot.
// Run: npm run icons  (outputs to public/icons/)
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');

// ---- tiny PNG encoder -------------------------------------------------
const CRC_TABLE = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function encodePng(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  // scanlines: filter byte 0 + row pixels
  const raw = Buffer.alloc(size * (1 + size * 4));
  for (let y = 0; y < size; y++) {
    rgba.copy(raw, y * (1 + size * 4) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---- REFLEX brand mark: five start lamps, last one lit amber -----------
const BG = [0x13, 0x11, 0x10]; // --bg
const LAMP_OFF = [0x33, 0x15, 0x12]; // --game-light-off
const LAMP_ON = [0xff, 0xb0, 0x00]; // --accent (signal amber)

function drawIcon(size, { maskable }) {
  const rgba = Buffer.alloc(size * size * 4);
  const c = size / 2;
  // maskable icons must keep content inside the central 80% "safe zone"
  const scale = maskable ? 0.72 : 1;
  const lampR = size * 0.062 * scale;
  const gap = size * 0.165 * scale; // center-to-center spacing
  const cornerR = maskable ? 0 : size * 0.2; // rounded corners unless maskable
  const centers = [-2, -1, 0, 1, 2].map((k) => c + k * gap);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      // rounded-rect alpha test
      let alpha = 255;
      if (cornerR > 0) {
        const dx = Math.max(cornerR - x, x - (size - 1 - cornerR), 0);
        const dy = Math.max(cornerR - y, y - (size - 1 - cornerR), 0);
        if (dx * dx + dy * dy > cornerR * cornerR) alpha = 0;
      }
      let col = BG;
      for (let l = 0; l < 5; l++) {
        if (Math.hypot(x - centers[l] + 0.5, y - c + 0.5) < lampR) {
          col = l === 4 ? LAMP_ON : LAMP_OFF;
          break;
        }
      }
      rgba[i] = col[0];
      rgba[i + 1] = col[1];
      rgba[i + 2] = col[2];
      rgba[i + 3] = alpha;
    }
  }
  return encodePng(size, rgba);
}

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(join(OUT_DIR, 'icon-192.png'), drawIcon(192, { maskable: false }));
writeFileSync(join(OUT_DIR, 'icon-512.png'), drawIcon(512, { maskable: false }));
writeFileSync(join(OUT_DIR, 'maskable-512.png'), drawIcon(512, { maskable: true }));
console.log('icons written to', OUT_DIR);
