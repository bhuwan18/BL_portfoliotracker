// Generates PWA icons (no dependencies) — a rounded-gradient tile with an
// upward bar chart + rising line. Run: node scripts/gen-icons.mjs
import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public')
mkdirSync(OUT, { recursive: true })

// ---- minimal PNG encoder (8-bit RGBA) ----
function crc32(buf) {
  let c = ~0
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i]
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1))
  }
  return ~c >>> 0
}
function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const t = Buffer.from(type, 'ascii')
  const body = Buffer.concat([t, data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body), 0)
  return Buffer.concat([len, body, crc])
}
function encodePNG(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // color type RGBA
  // rows with filter byte 0
  const stride = width * 4
  const raw = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride)
  }
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// ---- drawing ----
function draw(size, { fullBleed }) {
  const buf = Buffer.alloc(size * size * 4)
  const px = (x, y, r, g, b, a = 255) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return
    const i = (y * size + x) * 4
    const af = a / 255
    buf[i] = Math.round(buf[i] * (1 - af) + r * af)
    buf[i + 1] = Math.round(buf[i + 1] * (1 - af) + g * af)
    buf[i + 2] = Math.round(buf[i + 2] * (1 - af) + b * af)
    buf[i + 3] = Math.max(buf[i + 3], Math.round(255 * af))
  }
  const radius = fullBleed ? 0 : Math.round(size * 0.22)
  const inCorner = (x, y) => {
    const r = radius
    if (r === 0) return true
    const cx = x < r ? r : x > size - 1 - r ? size - 1 - r : x
    const cy = y < r ? r : y > size - 1 - r ? size - 1 - r : y
    const dx = x - cx
    const dy = y - cy
    return dx * dx + dy * dy <= r * r
  }
  // background vertical gradient: #13a36a -> #0a6f44
  for (let y = 0; y < size; y++) {
    const t = y / (size - 1)
    const r = Math.round(0x13 + (0x0a - 0x13) * t)
    const g = Math.round(0xa3 + (0x6f - 0xa3) * t)
    const b = Math.round(0x6a + (0x44 - 0x6a) * t)
    for (let x = 0; x < size; x++) if (inCorner(x, y)) px(x, y, r, g, b, 255)
  }
  // chart geometry — leave extra margin on maskable icons (safe zone)
  const m = Math.round(size * (fullBleed ? 0.26 : 0.2))
  const x0 = m
  const y1 = size - m
  const cw = size - 2 * m
  const ch = size - 2 * m
  const fillRect = (x, y, w, h, r, g, b, a) => {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) px(xx, yy, r, g, b, a)
  }
  // four bars of increasing height
  const heights = [0.34, 0.52, 0.46, 0.82]
  const bw = Math.round(cw / 7)
  const gap = Math.round((cw - bw * 4) / 3)
  const tops = []
  for (let i = 0; i < 4; i++) {
    const bx = x0 + i * (bw + gap)
    const bh = Math.round(ch * heights[i])
    fillRect(bx, y1 - bh, bw, bh, 255, 255, 255, 225)
    tops.push([bx + bw / 2, y1 - bh])
  }
  // rising line across the bar tops + dots
  const lw = Math.max(2, Math.round(size * 0.018))
  const stamp = (cx, cy, rad, r, g, b, a) => {
    for (let yy = -rad; yy <= rad; yy++)
      for (let xx = -rad; xx <= rad; xx++)
        if (xx * xx + yy * yy <= rad * rad) px(Math.round(cx + xx), Math.round(cy + yy), r, g, b, a)
  }
  for (let i = 0; i < tops.length - 1; i++) {
    const [ax, ay] = tops[i]
    const [bx2, by] = tops[i + 1]
    const steps = Math.round(Math.hypot(bx2 - ax, by - ay))
    for (let s = 0; s <= steps; s++) {
      const t = s / steps
      stamp(ax + (bx2 - ax) * t, ay - size * 0.06 + (by - ay) * t, lw, 255, 255, 255, 255)
    }
  }
  for (const [cx, cy] of tops) stamp(cx, cy - size * 0.06, lw + 2, 255, 255, 255, 255)
  return buf
}

function write(name, size, opts) {
  writeFileSync(join(OUT, name), encodePNG(size, size, draw(size, opts)))
  console.log('wrote', name, size + 'x' + size)
}

write('pwa-192.png', 192, { fullBleed: false })
write('pwa-512.png', 512, { fullBleed: false })
write('pwa-maskable-512.png', 512, { fullBleed: true })
write('apple-touch-icon.png', 180, { fullBleed: true })

// favicon.svg (vector, same motif)
const favicon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#13a36a"/><stop offset="1" stop-color="#0a6f44"/></linearGradient></defs>
  <rect width="64" height="64" rx="14" fill="url(#g)"/>
  <g fill="#fff">
    <rect x="13" y="36" width="7" height="14" rx="2" opacity=".9"/>
    <rect x="24" y="28" width="7" height="22" rx="2" opacity=".9"/>
    <rect x="35" y="32" width="7" height="18" rx="2" opacity=".9"/>
    <rect x="46" y="18" width="7" height="32" rx="2" opacity=".9"/>
  </g>
  <polyline points="16,34 27,26 38,30 49,16" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
`
writeFileSync(join(OUT, 'favicon.svg'), favicon)
console.log('wrote favicon.svg')
