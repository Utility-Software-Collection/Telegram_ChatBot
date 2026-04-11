// functions/_shared/captcha.js
// Pure-JS PNG captcha generator — no Canvas, works in Cloudflare Workers.

// ── 5×7 pixel font ──────────────────────────────────────────────────────────
// Each entry = 7 rows; each row = 5 bits, bit-4 is leftmost pixel.
const FONT = {
  '0':[14,17,19,21,25,17,14], '1':[4,12,4,4,4,4,14],
  '2':[14,17,1,6,8,16,31],   '3':[30,1,1,14,1,1,30],
  '4':[3,5,9,17,31,1,1],     '5':[31,16,16,30,1,17,14],
  '6':[7,8,16,30,17,17,14],  '7':[31,1,2,4,8,8,8],
  '8':[14,17,17,14,17,17,14],'9':[14,17,17,15,1,2,12],
  'A':[14,17,17,31,17,17,17],'B':[30,17,17,30,17,17,30],
  'C':[14,17,16,16,16,17,14],'D':[30,17,17,17,17,17,30],
  'E':[31,16,16,30,16,16,31],'F':[31,16,16,30,16,16,16],
  'G':[14,17,16,23,17,17,15],'H':[17,17,17,31,17,17,17],
  'J':[7,1,1,1,17,17,14],   'K':[17,18,20,24,20,18,17],
  'L':[16,16,16,16,16,16,31],'M':[17,27,21,21,17,17,17],
  'N':[17,25,21,19,17,17,17],'P':[30,17,17,30,16,16,16],
  'Q':[14,17,17,17,21,19,15],'R':[30,17,17,30,20,18,17],
  'S':[14,17,16,14,1,17,14], 'T':[31,4,4,4,4,4,4],
  'U':[17,17,17,17,17,17,14],'V':[17,17,17,17,10,10,4],
  'W':[17,17,17,21,21,27,17],'X':[17,17,10,4,10,17,17],
  'Y':[17,17,10,4,4,4,4],   'Z':[31,1,2,4,8,16,31],
};

// Safe char pools (no O/I/0/1 confusion)
const NUMERIC_CHARS = '23456789';
const ALPHA_CHARS   = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

// ── Code generation ──────────────────────────────────────────────────────────

export function generateCode(type) {
  const pool = type === 'image_alphanumeric' ? ALPHA_CHARS : NUMERIC_CHARS;
  const len  = type === 'image_alphanumeric' ? 5 : 4;
  const buf  = new Uint8Array(len);
  crypto.getRandomValues(buf);
  return Array.from(buf, b => pool[b % pool.length]).join('');
}

export function generateWrongOptions(correct, type) {
  const pool = type === 'image_alphanumeric' ? ALPHA_CHARS : NUMERIC_CHARS;
  const len  = correct.length;
  const wrongs = new Set();
  while (wrongs.size < 3) {
    const buf = new Uint8Array(len);
    crypto.getRandomValues(buf);
    const w = Array.from(buf, b => pool[b % pool.length]).join('');
    if (w !== correct) wrongs.add(w);
  }
  return [...wrongs];
}

// ── PNG rendering ────────────────────────────────────────────────────────────

const SCALE   = 4;   // font-pixels → screen-pixels
const PADDING = 14;  // border padding
const SPACING = 4;   // gap between chars
const CW = 5, CH = 7;

export async function renderCaptchaPNG(text, seed = text) {
  const W = PADDING * 2 + text.length * (CW + SPACING) * SCALE - SPACING * SCALE;
  const H = PADDING * 2 + CH * SCALE + 6; // +6 vertical jitter room

  const rgb = new Uint8Array(W * H * 3);

  // Background: soft gradient
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 3;
      rgb[i]   = 238 + Math.round((x / W) * 10);
      rgb[i+1] = 243 + Math.round((y / H) * 8);
      rgb[i+2] = 255;
    }
  }

  // Deterministic PRNG from seed for reproducible images
  const rng = lcg(seed);

  // Noise lines (drawn before text so text is readable on top)
  const lineColors = [[180,190,220],[160,180,210],[170,185,215],[175,188,218]];
  for (let n = 0; n < 4; n++) {
    const x1 = Math.floor(rng() * W), y1 = Math.floor(rng() * H);
    const x2 = Math.floor(rng() * W), y2 = Math.floor(rng() * H);
    drawLine(rgb, W, H, x1, y1, x2, y2, lineColors[n % lineColors.length]);
  }

  // Characters with per-char vertical jitter and alternating colors
  const charColors = [[25,50,120],[120,30,30],[30,100,30],[80,30,120]];
  for (let ci = 0; ci < text.length; ci++) {
    const glyph = FONT[text[ci]];
    if (!glyph) continue;
    const cx    = PADDING + ci * (CW + SPACING) * SCALE;
    const yOff  = Math.floor(rng() * 6); // 0–5 px jitter
    const color = charColors[ci % charColors.length];

    for (let gy = 0; gy < CH; gy++) {
      const row = glyph[gy];
      for (let gx = 0; gx < CW; gx++) {
        if (row & (1 << (CW - 1 - gx))) {
          for (let sy = 0; sy < SCALE; sy++) {
            for (let sx = 0; sx < SCALE; sx++) {
              const px = cx + gx * SCALE + sx;
              const py = PADDING + yOff + gy * SCALE + sy;
              if (px >= 0 && px < W && py >= 0 && py < H) {
                const idx = (py * W + px) * 3;
                rgb[idx]   = color[0];
                rgb[idx+1] = color[1];
                rgb[idx+2] = color[2];
              }
            }
          }
        }
      }
    }
  }

  // Noise dots on top
  for (let n = 0; n < 70; n++) {
    const nx = Math.floor(rng() * W);
    const ny = Math.floor(rng() * H);
    const nv = 130 + Math.floor(rng() * 100);
    const idx = (ny * W + nx) * 3;
    rgb[idx] = nv; rgb[idx+1] = nv; rgb[idx+2] = nv;
  }

  return encodePNG(W, H, rgb);
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function lcg(seed) {
  // Linear-congruential PRNG seeded from string
  let s = 0xdeadbeef;
  for (let i = 0; i < seed.length; i++) s = (Math.imul(s, 31) + seed.charCodeAt(i)) | 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) | 0;
    return (s >>> 0) / 0x100000000;
  };
}

function drawLine(rgb, W, H, x1, y1, x2, y2, color) {
  const dx = Math.abs(x2 - x1), dy = Math.abs(y2 - y1);
  const sx = x1 < x2 ? 1 : -1, sy = y1 < y2 ? 1 : -1;
  let err = dx - dy, x = x1, y = y1;
  for (;;) {
    if (x >= 0 && x < W && y >= 0 && y < H) {
      const i = (y * W + x) * 3;
      rgb[i] = color[0]; rgb[i+1] = color[1]; rgb[i+2] = color[2];
    }
    if (x === x2 && y === y2) break;
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x += sx; }
    if (e2 <  dx) { err += dx; y += sy; }
  }
}

// ── PNG encoder ──────────────────────────────────────────────────────────────

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c;
  }
  return t;
})();

function crc32(data) {
  let c = 0xffffffff;
  for (const b of data) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function be32(n) {
  return [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
}

function pngChunk(type, data) {
  const typeBytes = new TextEncoder().encode(type);
  const crcSrc   = new Uint8Array(4 + data.length);
  crcSrc.set(typeBytes); crcSrc.set(data, 4);
  const crc = crc32(crcSrc);
  const out = new Uint8Array(4 + 4 + data.length + 4);
  out.set(be32(data.length));
  out.set(typeBytes, 4);
  out.set(data, 8);
  out.set(be32(crc), 8 + data.length);
  return out;
}

async function compress(raw) {
  // CompressionStream('deflate') = zlib format (RFC 1950) — exactly what PNG needs
  const cs     = new CompressionStream('deflate');
  const writer = cs.writable.getWriter();
  const reader = cs.readable.getReader();

  // Write and read concurrently (streams require it)
  const writeP = writer.write(raw).then(() => writer.close());
  const chunks = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  await writeP;

  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out   = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) { out.set(c, off); off += c.length; }
  return out;
}

async function encodePNG(W, H, rgb) {
  // Filter-0 (None) scanlines: 1 filter byte + W*3 rgb bytes per row
  const rowStride = 1 + W * 3;
  const scanlines = new Uint8Array(H * rowStride);
  for (let y = 0; y < H; y++) {
    scanlines[y * rowStride] = 0; // None filter
    for (let x = 0; x < W; x++) {
      const src = (y * W + x) * 3;
      const dst = y * rowStride + 1 + x * 3;
      scanlines[dst]   = rgb[src];
      scanlines[dst+1] = rgb[src+1];
      scanlines[dst+2] = rgb[src+2];
    }
  }

  const idat = await compress(scanlines);

  // IHDR: width(4) height(4) bitDepth(1) colorType(1=RGB=2) compress(1) filter(1) interlace(1)
  const ihdr = new Uint8Array(13);
  ihdr.set(be32(W)); ihdr.set(be32(H), 4);
  ihdr[8] = 8; ihdr[9] = 2; // 8-bit RGB

  const sig   = new Uint8Array([137,80,78,71,13,10,26,10]);
  const parts = [sig, pngChunk('IHDR', ihdr), pngChunk('IDAT', idat), pngChunk('IEND', new Uint8Array(0))];
  const total = parts.reduce((n, p) => n + p.length, 0);
  const png   = new Uint8Array(total);
  let off = 0;
  for (const p of parts) { png.set(p, off); off += p.length; }
  return png.buffer;
}
