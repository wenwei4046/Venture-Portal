// Builds src/lib/address/malaysia-postcodes.json — the states, cities and postcodes an address is picked from.
//
// The government's own list first (2026-10-20, the user: "我要的是 Standard 的地址，不是跟着 Post Malaysia 的邮政局命名，
// 是 Standard Malaysia 的那个地址罢了" — then picked the official list from three): every postcode data.gov.my holds —
// MCMC's postcode dictionary, CC BY 4.0, https://storage.data.gov.my/dictionaries/postcodes.csv — under ITS city, the
// place's own name (11060 Paya Terubong, 11500 Air Itam), not the post office's. A postcode only Pos Malaysia's list
// holds (the npm package malaysia-postcodes 3.0.0, ISC) is added under that package's city, spelled as the government
// spells the same place in that state, so every postcode can still be picked.
//
// Usage: node scripts/build-malaysia-postcodes.mjs <postcodes.csv> <the unpacked malaysia-postcodes package>
//   (npm pack malaysia-postcodes@3.0.0 && tar -xzf malaysia-postcodes-3.0.0.tgz)
import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'

const [csvPath, pkgDir] = process.argv.slice(2)
if (!csvPath || !pkgDir) throw new Error('usage: node scripts/build-malaysia-postcodes.mjs <postcodes.csv> <malaysia-postcodes package dir>')

const clean = s => String(s).replace(/\s+/g, ' ').trim()
// The package's names for the federal territories, as the government names them.
const STATES = { 'Wp Kuala Lumpur': 'W.P. Kuala Lumpur', 'Wp Labuan': 'W.P. Labuan', 'Wp Putrajaya': 'W.P. Putrajaya' }
// The same place spelled two ways: the package's → the government's.
const SAME_PLACE = { 'Pahang|Bandar Tun Abdul Razak': 'Bandar Tun Razak', 'Perak|Kampung Gajah': 'Kampong Gajah' }

const places = new Map() // state → city → postcodes
const add = (state, city, postcode) => {
  if (!/^\d{5}$/.test(postcode)) throw new Error(`not a postcode: ${postcode} (${city}, ${state})`)
  if (!places.has(state)) places.set(state, new Map())
  const cities = places.get(state)
  if (!cities.has(city)) cities.set(city, new Set())
  cities.get(city).add(postcode)
}

// 1. The government's list.
const rows = readFileSync(csvPath, 'utf8').trim().split(/\r?\n/).slice(1).map(line => line.split(','))
for (const row of rows) {
  if (row.length !== 3) throw new Error(`a row of ${row.length} fields: ${row.join(',')}`)
  add(clean(row[0]), clean(row[1]), clean(row[2]))
}
const official = new Set(rows.map(row => clean(row[2])))

// 2. What only Pos Malaysia's list holds.
const pkg = createRequire(import.meta.url)(path.resolve(pkgDir, 'dist/index.cjs'))
let filled = 0
for (const s of pkg.allPostcodes) {
  const state = STATES[s.name] ?? clean(s.name)
  if (!places.has(state)) throw new Error(`the package's state ${s.name} is not one of the government's`)
  const named = [...places.get(state).keys()]
  for (const c of s.city) {
    const own = clean(c.name)
    const city = SAME_PLACE[`${state}|${own}`] ?? named.find(n => n.toLowerCase() === own.toLowerCase()) ?? own
    for (const postcode of c.postcode) {
      if (official.has(postcode)) continue
      add(state, city, postcode)
      filled++
    }
  }
}

// States A→Z with the federal territories last, cities A→Z, postcodes ascending.
const order = (a, b) => (a.startsWith('W.P. ') === b.startsWith('W.P. ') ? a.localeCompare(b) : a.startsWith('W.P. ') ? 1 : -1)
const states = [...places.keys()].sort(order).map(state => [
  state,
  [...places.get(state)].sort(([a], [b]) => a.localeCompare(b)).map(([city, codes]) => [city, [...codes].sort()]),
])
const source =
  "The government's postcode list — data.gov.my, MCMC's postcode dictionary (CC BY 4.0), each postcode under its place's own name — " +
  "with the postcodes only Pos Malaysia's list holds (malaysia-postcodes 3.0.0, npm, ISC) under that list's town. " +
  'Built by scripts/build-malaysia-postcodes.mjs on 2026-10-20.'
const out = `{\n  "source": ${JSON.stringify(source)},\n  "states": [\n${states.map(s => `    ${JSON.stringify(s)}`).join(',\n')}\n  ]\n}\n`
writeFileSync(new URL('../src/lib/address/malaysia-postcodes.json', import.meta.url), out)

const cities = states.reduce((n, [, c]) => n + c.length, 0)
const postcodes = new Set(states.flatMap(([, c]) => c.flatMap(([, p]) => p)))
console.log(`${states.length} states, ${cities} cities, ${postcodes.size} postcodes (${official.size} the government's, ${filled} filled in)`)
