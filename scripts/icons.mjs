// The Garage's icon, drawn with no dependencies: a teal rounded square (the
// colour of a pathos node) with a cream clock face — the history — whose
// hands stop at a visit. 4×4 supersampled per pixel, written as PNG through
// zlib. `node scripts/icons.mjs` → icons/icon{16,32,48,128}.png
import fs from 'node:fs'
import zlib from 'node:zlib'

const TEAL = [0, 121, 107]
const CREAM = [251, 248, 241]
const INK = [62, 39, 35]

const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0 })
const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0 }
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type), data])
  const c = Buffer.alloc(4); c.writeUInt32BE(crc(td))
  return Buffer.concat([len, td, c])
}

// distance from point to segment
const seg = (px, py, ax, ay, bx, by) => {
  const dx = bx - ax; const dy = by - ay
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

// colour of a point in the unit square (0..1)
const shade = (x, y) => {
  const r = 0.2   // corner radius
  const cx = Math.min(Math.max(x, r), 1 - r); const cy = Math.min(Math.max(y, r), 1 - r)
  if (Math.hypot(x - cx, y - cy) > r) return null                     // outside the rounded square
  const d = Math.hypot(x - 0.5, y - 0.5)
  if (d > 0.33) return TEAL
  if (d > 0.285) return CREAM                                          // the rim
  if (d < 0.06) return TEAL                                            // the hub: a node, over the hands
  if (seg(x, y, 0.5, 0.5, 0.5, 0.27) < 0.035) return INK               // minute hand → 12
  if (seg(x, y, 0.5, 0.5, 0.65, 0.58) < 0.04) return INK               // hour hand
  return CREAM
}

const png = (size) => {
  const S = 4
  const raw = Buffer.alloc(size * (size * 4 + 1))
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0
    for (let x = 0; x < size; x++) {
      let r = 0; let g = 0; let b = 0; let a = 0
      for (let sy = 0; sy < S; sy++) {
        for (let sx = 0; sx < S; sx++) {
          const c = shade((x + (sx + 0.5) / S) / size, (y + (sy + 0.5) / S) / size)
          if (c) { r += c[0]; g += c[1]; b += c[2]; a++ }
        }
      }
      const o = y * (size * 4 + 1) + 1 + x * 4
      raw[o] = a ? Math.round(r / a) : 0; raw[o + 1] = a ? Math.round(g / a) : 0; raw[o + 2] = a ? Math.round(b / a) : 0
      raw[o + 3] = Math.round((a / (S * S)) * 255)
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
}

fs.mkdirSync(new URL('../icons/', import.meta.url), { recursive: true })
for (const size of [16, 32, 48, 128]) {
  fs.writeFileSync(new URL(`../icons/icon${size}.png`, import.meta.url), png(size))
  console.log(`icons/icon${size}.png`)
}
