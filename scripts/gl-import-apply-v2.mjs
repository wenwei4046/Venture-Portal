// Apply v2 GL import. Reads scripts/gl-import-entries-v2.json (produced by
// gl-import-preview-v2.mjs), then:
//   1) deletes all existing manual_jv journal_lines + journal_entries.
//   2) batch-inserts the new journal_entries (returns IDs in input order).
//   3) batch-inserts all journal_lines tied to those IDs.
//   4) verifies TB balance + per-account net + per-segment P&L.
//   5) verifies per-bank × per-segment matches the "Alliance = Director only" plan.
//
// Run: node scripts/gl-import-apply-v2.mjs
import { readFile } from 'node:fs/promises'
import { createClient } from '@supabase/supabase-js'

const env = await readFile('.env.local', 'utf8')
const getVar = (k) => env.match(new RegExp(`^${k}=(.*)$`, 'm'))?.[1]?.trim()
const url = getVar('NEXT_PUBLIC_SUPABASE_URL')
const key = getVar('SUPABASE_SERVICE_ROLE_KEY')
if (!url || !key) { console.error('Missing URL or service role key'); process.exit(1) }
const supabase = createClient(url, key, { auth: { persistSession: false } })

const CREATED_BY = 'cbc6a18a-3f38-4567-b8c3-385d00b9e6b3'

const entries = JSON.parse(await readFile('scripts/gl-import-entries-v2.json', 'utf8'))
console.log(`Loaded ${entries.length} entries to insert`)

console.log('\n== 1) Wiping existing manual_jv journal entries ==')
const { data: oldEntries } = await supabase
  .from('journal_entries')
  .select('id')
  .eq('reference_type', 'manual_jv')
const oldIds = (oldEntries ?? []).map((r) => r.id)
console.log(` Found ${oldIds.length} existing manual_jv entries`)
if (oldIds.length) {
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
  console.error('  ERROR: insertedIds count != entries count'); process.exit(1)
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
const segBank = new Map()
const INC_SET = new Set(['5010','5020','5000','7000'])
for (const l of allLines) {
  const dr = Number(l.debit ?? 0)
  const cr = Number(l.credit ?? 0)
  totDr += dr; totCr += cr
  accNet.set(l.account_code, (accNet.get(l.account_code) || 0) + dr - cr)
  const code = l.account_code
  const seg = segById.get(l.entry_id) || 'unallocated'
  if (code === '3000' || code === '3010') {
    const k = seg + '|' + code
    segBank.set(k, (segBank.get(k) || 0) + dr - cr)
  }
  let kind = null
  if (INC_SET.has(code)) kind = 'inc'
  else if (/^9\d{3}$/.test(code) && code !== '1900') kind = 'exp'
  if (!kind) continue
  const k = `${seg}|${kind}`
  segPL.set(k, (segPL.get(k) || 0) + (kind === 'inc' ? cr - dr : dr - cr))
}
const r2 = (n) => Math.round(n * 100) / 100
console.log(` Total Dr ${r2(totDr).toFixed(2)}  Cr ${r2(totCr).toFixed(2)}  imbalance ${r2(totDr - totCr).toFixed(2)}`)

// Expected system-account totals (after YE close + Suspense Split + per-bank cleanup).
// Source: Trial Balance As At 26/05/2026 PDF, with adjustments for the
// suspense split which system shows but TB source doesn't (3053 567K -38333,
// 4052 -473K +38333; 3063 +38333; 4062 -38333). Per user confirmation.
const NEW_TB = {
  '1500': -3000, '1510': 2024, '2000': 9803.37, '3030': 91.26, '3071': 14996.64,
  '3000': 9005.67, '3010': 922.47, '3051': 266666.67,
  '3053': 564700.00, '3063': 38333.33,
  '3055': 95381.63, '3058': 28575.50, '3052': 12216.40, '3059': 2904,
  '4052': -473163.78, '4062': -38333.33, '4051': -118613.75, '4058': -100000, '4057': -50000,
  '4054': -133000, '4056': -49000, '4055': -73200, '4050': -749.40,
  '5020': -500043.33, '5000': -122209.79, '7000': -15620.00,
  '9081': 57285, '9083': 620.80, '9020': 1607.90, '9082': 5433.00,
  '9084': 23201.89, '9085': 1290, '9086': 631.58, '9087': 4977.85,
  '9088': 2807.34, '9089': 0.40, '9030': 484022.47, '9090': 67.25,
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

console.log('\n PER-BANK × PER-SEGMENT (Alliance = Director only target):')
console.log(' Segment         | HL (3000)     | Alliance (3010) | Total')
console.log(' ----------------+---------------+-----------------+----------')
let totHL = 0, totAl = 0
for (const s of SEGS) {
  const hl = r2(segBank.get(s+'|3000') || 0)
  const al = r2(segBank.get(s+'|3010') || 0)
  totHL += hl; totAl += al
  console.log(' ' + s.padEnd(15) + ' |' + hl.toFixed(2).padStart(13) + '  |' + al.toFixed(2).padStart(14) + '   |' + r2(hl+al).toFixed(2).padStart(11))
}
console.log(' ' + 'TOTAL'.padEnd(15) + ' |' + r2(totHL).toFixed(2).padStart(13) + '  |' + r2(totAl).toFixed(2).padStart(14) + '   |' + r2(totHL+totAl).toFixed(2).padStart(11))

console.log('\nDone.')
