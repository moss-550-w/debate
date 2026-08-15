/**
 * 生成小程序 tabBar 占位图标 (81x81 PNG)
 * 灰色未选中 + 蓝色选中
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const SIZE = 81;
const COLORS = {
  gray: [153, 153, 153, 255],
  blue: [37, 99, 235, 255],
};

function crc32(buf) {
  let crc = 0xffffffff;
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c;
  }
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function createPNG(pixels) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(SIZE, 0);
  ihdr.writeUInt32BE(SIZE, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const raw = Buffer.alloc(SIZE * (1 + SIZE * 4));
  let off = 0;
  for (let y = 0; y < SIZE; y++) {
    raw[off++] = 0;
    for (let x = 0; x < SIZE; x++) {
      const [r, g, b, a] = pixels[y][x];
      raw[off++] = r; raw[off++] = g; raw[off++] = b; raw[off++] = a;
    }
  }
  const idat = zlib.deflateSync(raw);
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

function circle(cx, cy, r) {
  return (x, y) => {
    const dx = x - cx, dy = y - cy;
    return dx * dx + dy * dy <= r * r;
  };
}

function drawHome(color) {
  const pixels = Array.from({ length: SIZE }, () => Array.from({ length: SIZE }, () => [0, 0, 0, 0]));
  const c = circle(40, 40, 38);
  const roof = (x, y) => {
    if (y < 18 || y > 40) return false;
    const w = y - 18;
    return x >= 40 - w && x <= 40 + w;
  };
  const body = (x, y) => y >= 38 && y <= 68 && x >= 22 && x <= 58;
  const door = (x, y) => y >= 50 && y <= 68 && x >= 35 && x <= 45;
  for (let y = 0; y < SIZE; y++)
    for (let x = 0; x < SIZE; x++) {
      if (c(x, y) && (roof(x, y) || body(x, y)) && !door(x, y))
        pixels[y][x] = color;
    }
  return pixels;
}

function drawTopic(color) {
  const pixels = Array.from({ length: SIZE }, () => Array.from({ length: SIZE }, () => [0, 0, 0, 0]));
  const c = circle(40, 40, 38);
  for (let y = 0; y < SIZE; y++)
    for (let x = 0; x < SIZE; x++) {
      if (c(x, y)) pixels[y][x] = color;
    }
  for (let y = 28; y <= 55; y++) {
    const lineW = y < 38 ? 36 : 36 - (y - 38) * 0.6;
    for (let x = Math.round(40 - lineW / 2); x <= Math.round(40 + lineW / 2); x++) {
      if (c(x, y)) pixels[y][x] = [255, 255, 255, 255];
    }
  }
  return pixels;
}

function drawProfile(color) {
  const pixels = Array.from({ length: SIZE }, () => Array.from({ length: SIZE }, () => [0, 0, 0, 0]));
  const headC = circle(40, 30, 14);
  const bodyC = circle(40, 80, 28);
  for (let y = 0; y < SIZE; y++)
    for (let x = 0; x < SIZE; x++) {
      if (headC(x, y) || (bodyC(x, y) && y > 48)) pixels[y][x] = color;
    }
  return pixels;
}

const out = path.join(__dirname, '..', 'miniprogram', 'assets');
if (!fs.existsSync(out)) fs.mkdirSync(out, { recursive: true });

const icons = { home: drawHome, topic: drawTopic, profile: drawProfile };
for (const [name, draw] of Object.entries(icons)) {
  for (const [colorName, color] of Object.entries(COLORS)) {
    const suffix = colorName === 'gray' ? '' : '-active';
    const buf = createPNG(draw(color));
    fs.writeFileSync(path.join(out, `${name}${suffix}.png`), buf);
    console.log(`  Created: ${name}${suffix}.png`);
  }
}
console.log('\nDone! All 6 tabBar icons generated.');
