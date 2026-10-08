// Lay the app over the prototype: node compare.mjs <states.json> [onlyName...]
// Writes shots/compare/<name>.png = prototype | app | diff (red = different) and prints the share of pixels that differ.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.join(here, '../../../package.json'));
const sharp = require('sharp');
const states = JSON.parse(fs.readFileSync(path.resolve(process.argv[2]), 'utf8'));
const only = new Set(process.argv.slice(3));
const outDir = path.join(here, '../shots/compare');
fs.mkdirSync(outDir, { recursive: true });

for (const st of states) {
  if (only.size && !only.has(st.name)) continue;
  const proto = path.join(here, '../shots/proto', `${st.name}.png`);
  const app = path.join(here, '../shots/app', `${st.name}.png`);
  if (!fs.existsSync(proto) || !fs.existsSync(app)) { console.log('skip', st.name); continue; }
  // the screen inside the device: no bezel, no corners
  const crop = st.crop || (st.w === 1440 ? { left: 0, top: 0, width: 1440, height: 900 } : st.w === 410 ? { left: 10, top: 10, width: 390, height: 864 } : { left: 12, top: 12, width: 390, height: 844 });
  const a = await sharp(proto).extract(crop).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const b = await sharp(app).extract(crop).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height } = a.info;
  const diff = Buffer.alloc(width * height * 4);
  let bad = 0;
  for (let i = 0; i < width * height; i++) {
    const o = i * 4;
    const d = Math.max(Math.abs(a.data[o] - b.data[o]), Math.abs(a.data[o + 1] - b.data[o + 1]), Math.abs(a.data[o + 2] - b.data[o + 2]));
    const g = Math.round((b.data[o] + b.data[o + 1] + b.data[o + 2]) / 3);
    if (d > 40) { bad++; diff[o] = 230; diff[o + 1] = 20; diff[o + 2] = 20; diff[o + 3] = 255; }
    else { const v = 255 - Math.round((255 - g) * 0.25); diff[o] = v; diff[o + 1] = v; diff[o + 2] = v; diff[o + 3] = 255; }
  }
  const gap = 12;
  const sheet = sharp({ create: { width: width * 3 + gap * 2, height, channels: 4, background: '#888888' } }).composite([
    { input: a.data, raw: { width, height, channels: 4 }, left: 0, top: 0 },
    { input: b.data, raw: { width, height, channels: 4 }, left: width + gap, top: 0 },
    { input: diff, raw: { width, height, channels: 4 }, left: (width + gap) * 2, top: 0 },
  ]);
  const out = path.join(outDir, `${st.name}.png`);
  await sheet.png().toFile(out);
  console.log(`${st.name.padEnd(28)} ${(bad / (width * height) * 100).toFixed(2)}% different  -> ${out}`);
}
