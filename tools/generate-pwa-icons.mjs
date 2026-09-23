// Renders the installed-app icons from the portal's mark (src/app/icon.svg).
//
//   node tools/generate-pwa-icons.mjs
//
// Outputs (committed — this is not a build step; the manifest that lists them
// is public/manifest.webmanifest):
//   public/icons/icon-192.png, icon-512.png   manifest "any" — the mark as drawn,
//                                             rounded tile on transparent
//   public/icons/maskable-512.png             manifest "maskable" — full bleed;
//                                             Android crops it to its own shape,
//                                             so the H stays inside the 80% safe
//                                             circle
//   src/app/apple-icon.png (180)              iOS home screen — full bleed, no
//                                             transparency (iOS would fill it
//                                             black) and iOS rounds the corners
//
// Re-run after changing icon.svg.
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const mark = readFileSync(join(root, 'src/app/icon.svg'), 'utf8')

const fill = mark.match(/<rect[^>]*fill="([^"]+)"/)?.[1]
const glyph = mark.match(/<path[^>]*\/>/)?.[0]
if (!fill || !glyph) throw new Error('icon.svg no longer has one <rect fill> and one <path> — update this script')

// Full-bleed tile, the H scaled about the centre.
const fullBleed = (scale) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">` +
  `<rect width="32" height="32" fill="${fill}"/>` +
  `<g transform="translate(16 16) scale(${scale}) translate(-16 -16)">${glyph}</g></svg>`

const render = (svg, size) => sharp(Buffer.from(svg), { density: 72 * (size / 32) * 2 }).resize(size, size).png().toBuffer()

const outputs = [
  ['public/icons/icon-192.png', mark, 192],
  ['public/icons/icon-512.png', mark, 512],
  ['public/icons/maskable-512.png', fullBleed(1), 512],
  ['src/app/apple-icon.png', fullBleed(1.15), 180],
]

for (const [file, svg, size] of outputs) {
  const target = join(root, file)
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, await render(svg, size))
  console.log(`${file}  ${size}×${size}`)
}
