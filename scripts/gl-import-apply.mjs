// Apply the GL import. Reads scripts/gl-import-entries.json (produced by
// gl-import-preview.mjs), then:
//   1) deletes all existing manual_jv journal_lines + journal_entries.
//   2) batch-inserts the new journal_entries (returns IDs in input order).
//   3) batch-inserts all journal_lines tied to those IDs.
//   4) verifies TB balance + per-account net + per-segment P&L.
//
// Run: node scripts/gl-import-apply.mjs
import { readFile } from 'node:fs/promises'
import { createClient } from '@supabase/supabase-js'

const env = await readFile('.env.local', 'utf8')
const getVar = (k) => env.match(new RegExp(`^${k}=(.*)$`, 'm'))?.[1]?.trim()
const url = getVar('NEXT_PUBLIC_SUPABASE_URL')
const key = getVar('SUPABASE_SERVICE_ROLE_KEY')
if (!url || !key) { console.error('Missing URL or service role key'); process.exit(1) }
const supabase = createClient(url, key, { auth: { persistSession: false } })

const CREATED_BY = 'cbc6a18a-3f38-4567-b8c3-385d00b9e6b3'

const entries = JSON.parse(await readFile('scripts/gl-import-entries.json', 'utf8'))
console.log(`Loaded ${entries.length} entries to insert`)

console.log('\n== 1) Wiping existing manual_jv journal entries ==')
const { data: oldEntries } = await supabase
  .from('journal_entries')
  .select('id')
  .eq('reference_type', 'manual_jv')
const oldIds = (oldEntries ?? []).map((r) => r.id)
console.log(` Found ${oldIds.length} existing manual_jv entries`)
if (oldIds.length) {
  // Delete in chunks to avoid URL-length limits on the IN(...) filter.
  for (let i = 0; i < oldIds.length; i += 100) {
    const chunk = oldIds.slice(i, i + 100)
    const { error: lErr } = await supabase.from('journal_lines').delete().in('entry_id', chunk)
    if (lErr) { console.error(' journal_lines delete err:', lErr); process.exit(1) }
  }
  const { error: eErr } = await supabase.from('journal_entries').delete().eq('reference_type', 'manual_jv')
  if (eErr) { console.error(' journal_entries delete err:', eErr); process.exit(1) }
  console.log(' Wiped.')
}

console.log('\n== 2) Inserting journal_entries (batched) ==')
const firstOfMonth = (iso) => iso.slice(0, 7) + '-01'
const entryRows = entries.map((e) => ({
  transaction_date: e.date,
  period_month: firstOfMonth(e.date),
  description: (e.desc || '').slice(0, 500),
  reference_type: 'manual_jv',
  segment: e.segment,
  total_amount: e.total,
  created_by: CREATED_BY,
}))
const insertedIds = []
for (let i = 0; i < entryRows.length; i += 100) {
  const batch = entryRows.slice(i, i + 100)
  const { data, error } = await supabase
    .from('journal_entries')
    .insert(batch)
    .select('id')
  if (error) { console.error(` insert batch ${i} err:`, error); process.exit(1) }
  for (const r of data) insertedIds.push(r.id)
  process.stdout.write(`  inserted ${insertedIds.length}/${entryRows.length}\r`)
}
console.log(`\n  total inserted: ${insertedIds.length}`)

if (insertedIds.length !== entries.length) {
  console.error('  ERROR: insertedIds count != entries count')
  process.exit(1)
}

console.log('\n== 3) Inserting journal_lines (batched) ==')
const lineRows = []
for (let i = 0; i < entries.length; i++) {
  for (const l of entries[i].lines) {
    lineRows.push({
      entry_id: insertedIds[i],
      account_code: l.code,
      debit: l.dr > 0 ? l.dr : null,
      credit: l.cr > 0 ? l.cr : null,
      description: (l.memo || '').slice(0, 500),
    })
  }
}
console.log(` Total lines to insert: ${lineRows.length}`)
let linesInserted = 0
for (let i = 0; i < lineRows.length; i += 500) {
  const batch = lineRows.slice(i, i + 500)
  const { error } = await supabase.from('journal_lines').insert(batch)
  if (error) { console.error(` lines batch ${i} err:`, error); process.exit(1) }
  linesInserted += batch.length
  process.stdout.write(`  inserted ${linesInserted}/${lineRows.length}\r`)
}
console.log(`\n  total lines inserted: ${linesInserted}`)

console.log('\n== 4) Verifying ==')
// Pull aggregate totals via a single SELECT per check. Use small RPC-less queries.
const { data: totals } = await supabase
  .from('journal_lines')
  .select('debit.sum(), credit.sum()')
console.log(' Total lines sums (Dr/Cr): see DB inspection')

// Per-account net via SELECT-with-sum (PostgREST limitation: no GROUP-BY without RPC).
// Use a simpler approach: fetch all journal_lines for manual_jv and compute locally.
const { data: jeData } = await supabase
  .from('journal_entries').select('id, segment').eq('reference_type','manual_jv').eq('is_reversed', false)
const segById = new Map((jeData ?? []).map((j) => [j.id, j.segment]))
const ids = [...segById.keys()]
let allLines = []
for (let i = 0; i < ids.length; i += 100) {
  const { data } = await supabase
    .from('journal_lines')
    .select('entry_id, account_code, debit, credit')
    .in('entry_id', ids.slice(i, i + 100))
  allLines = allLines.concat(data ?? [])
}
console.log(` Pulled ${allLines.length} journal_lines for verification`)
let totDr = 0, totCr = 0
const accNet = new Map()
const segPL = new Map()
const INC_SET = new Set(['5010','5020','5000','7000'])
for (const l of allLines) {
  const dr = Number(l.debit ?? 0)
  const cr = Number(l.credit ?? 0)
  totDr += dr; totCr += cr
  accNet.set(l.account_code, (accNet.get(l.account_code) || 0) + dr - cr)
  const code = l.account_code
  const seg = segById.get(l.entry_id) || 'unallocated'
  let kind = null
  if (INC_SET.has(code)) kind = 'inc'
  else if (/^9\d{3}$/.test(code) && code !== '1900') kind = 'exp'
  if (!kind) continue
  const k = `${seg}|${kind}`
  segPL.set(k, (segPL.get(k) || 0) + (kind === 'inc' ? cr - dr : dr - cr))
}
const r2 = (n) => Math.round(n * 100) / 100
console.log(` Total Dr ${r2(totDr).toFixed(2)}  Cr ${r2(totCr).toFixed(2)}  imbalance ${r2(totDr - totCr).toFixed(2)}`)

const NEW_TB = {
  '1500': -3000, '1510': 2024, '2000': 9803.37, '3030': 91.26, '3071': 15179.16,
  '3000': 9005.67, '3010': 922.47, '3051': 266666.67, '3053': 564700, '3063': 38333.33,
  '3055': 95381.63, '3058': 28575.50, '3052': 12216.40, '3059': 2904,
  '4052': -473163.78, '4062': -38333.33, '4051': -118613.75, '4058': -100000, '4057': -50000,
  '4054': -133000, '4056': -49000, '4055': -73200, '4050': -749.40,
  '4070': 1058.50, '4071': 278, '4072': 15.80, '4073': 2.80, '4074': 4.60,
  '5010': -3846.87, '5020': -496196.46, '5000': -122209.79, '7000': -15620.00,
  '9081': 57139, '9083': 619.40, '9020': 1607.90, '9082': 5420.70,
  '9084': 23001.89, '9085': 1290, '9086': 631.58, '9087': 4795.33,
  '9088': 2807.34, '9089': 0.40, '9030': 483022.47, '9090': 67.25,
  '9091': 828.14, '9010': 9040, '9092': 19.30, '9093': 22360.38,
  '9094': 16889.14, '9000': 230,
}
let badAcc = 0
for (const code of Object.keys(NEW_TB).sort()) {
  const a = r2(accNet.get(code) || 0)
  const b = NEW_TB[code]
  if (Math.abs(a - b) > 0.01) { badAcc++; console.log(`  TB MISMATCH ${code}: actual ${a.toFixed(2)} expected ${b.toFixed(2)} diff ${r2(a-b).toFixed(2)}`) }
}
console.log(` TB matches: ${badAcc === 0 ? 'ALL OK' : badAcc + ' mismatches'}`)

console.log('\n PER-SEGMENT P&L (cumulative):')
const SEGS = ['marketing','finance','hr','director_office','director','corporate']
let totInc=0, totExp=0
for (const s of SEGS) {
  const inc = r2(segPL.get(`${s}|inc`) || 0)
  const exp = r2(segPL.get(`${s}|exp`) || 0)
  totInc+=inc; totExp+=exp
  console.log(`  ${s.padEnd(16)} Inc ${inc.toFixed(2).padStart(12)}  Exp ${exp.toFixed(2).padStart(12)}  Net ${r2(inc-exp).toFixed(2).padStart(12)}`)
}
console.log(`  ${'TOTAL'.padEnd(16)} Inc ${r2(totInc).toFixed(2).padStart(12)}  Exp ${r2(totExp).toFixed(2).padStart(12)}  Net ${r2(totInc-totExp).toFixed(2).padStart(12)}`)

console.log('\nDone.')
