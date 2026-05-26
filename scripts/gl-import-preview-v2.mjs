// PREVIEW v2 (read-only): parses the 26-May-2026 source GL.
//
// Differences from v1 (gl-import-preview.mjs):
//   * Points at the new XLSX (26.05.2026 revision)
//   * Drops the PV-000077 4,130→3,540 correction — already baked into the
//     new source file (verified: PV-000077's 911-0000 line shows Dr 3,540 raw)
//   * Drops the 2026-05-20 SUSPENSE-SPLIT adjusting JE by default
//     (toggle via INCLUDE_SUSPENSE_SPLIT below)
//   * Drops the 2025-12-31 year-end closing JE by default
//     (toggle via INCLUDE_YE_CLOSING below)
//   * Drops the hardcoded NEW_TB reconciliation block — verify against the
//     fresh TB once user provides it
//
// Run: node scripts/gl-import-preview-v2.mjs
//
// Writes: scripts/gl-import-entries-v2.json (read by gl-import-apply-v2.mjs)

import { writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
const XLSX = createRequire(import.meta.url)('xlsx')

const GL_PATH = 'C:/Users/User/OneDrive/Desktop/Houzs Venture - General Ledger 26.05.2026.xlsx'
const OUT_PATH = 'scripts/gl-import-entries-v2.json'

// Toggles — flip to true after confirming with user
const INCLUDE_YE_CLOSING = true
const INCLUDE_SUSPENSE_SPLIT = true
const INCLUDE_PER_BANK_CLEANUP = true  // Alliance = Director-only convention

// Source GL account -> system COA code (actual codes used in DB).
const ACC_MAP = {
  '100-0000': '1500', '150-0000': '1510', '200-3000': '2000',
  '300-0000': '3030',
  '305-0000': '3071', '305-2001': '3071', '305-C001': '3071',
  '305-D001': '3030', // Dream Crafter trade receivable
  '305-H001': '3071', '305-H002': '3071', '305-T001': '3071',
  '310-0010': '3000', '310-0030': '3010',
  '350-0010': '3051', '350-0020': '3053', '350-0050': '4052',
  '350-0060': '3055', '350-0070': '3058', '350-0080': '4051',
  '350-0090': '3052', '350-0120': '3059',
  '360-0020': '4058',
  '370-0010': '4057', '370-0020': '4054', '370-0030': '4056', '370-0040': '4055',
  '405-0000': '4050', '405-H001': '4050', '405-Y001': '4050',
  '410-0010': '4070', '410-0020': '4071', '410-0030': '4072',
  '410-0040': '4073', '410-0050': '4074', '410-0060': '4075',
  '420-1000': '7000',
  '500-0000': '5010', '700-0010': '5020', '700-0020': '5000', '700-0030': '7000',
  '900-E001': '9081', '900-E002': '9083', '900-I001': '9000',
  '900-M001': '9020', '900-S001': '9082',
  '900-S002': '9084', '900-S003': '9085', '900-U001': '9086', '900-W001': '9087',
  '901-0000': '9088', '902-0000': '9089', '904-0000': '9030', '905-0000': '9090',
  '907-0000': '9091', '911-0000': '9010', '912-0000': '9092', '913-0000': '9093',
  '914-0000': '9094', '915-0000': '9000',
}
const SEG_MAP = {
  DIRECTOR: 'director', OFFICE: 'corporate', DO: 'director_office',
  FIN: 'finance', HR: 'hr', MAR: 'marketing',
}

const r2 = (n) => Math.round(n * 100) / 100
const excelToDate = (s) => new Date(Math.round((s - 25569) * 86400000)).toISOString().slice(0, 10)

// ---- Parse GL ----
const wb = XLSX.readFile(GL_PATH)
const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, blankrows: false })

let curAcc = null
const ALL_LINES = []
const unmappedAccs = new Set()
const unmappedDepts = new Set()
const balanceBFCount = { rows: 0, nonZero: 0 }

for (const row of rows) {
  const c0 = row[0]
  if (typeof c0 === 'string' && c0.startsWith('Acc. No.:')) {
    const m = c0.match(/Acc\. No\.: ([0-9A-Za-z-]+)/)
    curAcc = m ? m[1] : null
    continue
  }
  if (row[1] == null) continue
  const date = row[1]
  const dept = String(row[5] || '').trim().toUpperCase()
  const ref = String(row[6] || '').trim()
  const desc = String(row[7] || '').trim()
  const dr = typeof row[8] === 'number' ? row[8] : 0
  const cr = typeof row[9] === 'number' ? row[9] : 0
  if (ref === 'BALANCE B/F' || date === 0) {
    balanceBFCount.rows++
    if (dr !== 0 || cr !== 0) balanceBFCount.nonZero++
    continue
  }
  if (!curAcc) continue
  if (!(curAcc in ACC_MAP)) { unmappedAccs.add(curAcc); continue }
  let deptKey = dept
  if (!(deptKey in SEG_MAP)) { unmappedDepts.add(`${dept || '(empty)'} ref=${ref}`); deptKey = 'OFFICE' }
  ALL_LINES.push({
    acc: curAcc, sysAcc: ACC_MAP[curAcc],
    dept: deptKey, seg: SEG_MAP[deptKey],
    dr: r2(dr), cr: r2(cr),
    date: excelToDate(date), ref, desc,
  })
}

console.log('==================== PARSE STATS ====================')
console.log('Source              :', GL_PATH)
console.log('Transaction lines   :', ALL_LINES.length)
console.log('BALANCE B/F rows skipped :', balanceBFCount.rows, '(nonzero:', balanceBFCount.nonZero, ')')
if (unmappedAccs.size) console.warn('Unmapped source accounts :', [...unmappedAccs].join(', '))
if (unmappedDepts.size) console.warn('Unmapped depts           :', [...unmappedDepts].slice(0, 10).join('; '))

// ---- Group by Ref.1 ----
const journals = new Map()
for (const l of ALL_LINES) {
  if (!journals.has(l.ref)) journals.set(l.ref, { date: l.date, lines: [] })
  if (l.date < journals.get(l.ref).date) journals.get(l.ref).date = l.date
  journals.get(l.ref).lines.push(l)
}
console.log('\n==================== JOURNAL GROUPS ====================')
console.log('Total journals (by Ref.1):', journals.size)

let unbalanced = 0
for (const [ref, j] of journals) {
  const dr = r2(j.lines.reduce((a, l) => a + l.dr, 0))
  const cr = r2(j.lines.reduce((a, l) => a + l.cr, 0))
  if (Math.abs(dr - cr) > 0.01) {
    unbalanced++
    if (unbalanced <= 5) console.warn(`  Unbalanced: ${ref} Dr ${dr} Cr ${cr}`)
  }
}
console.log('Unbalanced journals       :', unbalanced)

// ---- Build entries per (ref, segment), multi-dept gets 1900 clearing ----
const entries = []
let multi = 0
for (const [ref, j] of journals) {
  const bySeg = new Map()
  for (const l of j.lines) {
    if (!bySeg.has(l.seg)) bySeg.set(l.seg, [])
    bySeg.get(l.seg).push(l)
  }
  const isMulti = bySeg.size > 1
  if (isMulti) multi++
  for (const [seg, segLines] of bySeg) {
    const lines = segLines.map((l) => ({
      code: l.sysAcc, dr: l.dr, cr: l.cr, memo: (l.desc || '').slice(0, 200),
    }))
    const dr = r2(lines.reduce((a, l) => a + l.dr, 0))
    const cr = r2(lines.reduce((a, l) => a + l.cr, 0))
    const diff = r2(dr - cr)
    if (Math.abs(diff) > 0.005) {
      if (diff > 0) lines.push({ code: '1900', dr: 0, cr: diff, memo: `multi-dept clearing (${ref})` })
      else lines.push({ code: '1900', dr: -diff, cr: 0, memo: `multi-dept clearing (${ref})` })
    }
    const total = r2(lines.reduce((a, l) => a + l.dr, 0))
    const desc0 = (j.lines[0]?.desc || '').slice(0, 150)
    entries.push({ date: j.date, segment: seg, ref, desc: `${ref}${isMulti ? ` [${seg}]` : ''} — ${desc0}`, lines, total })
  }
}
console.log('Multi-dept journals       :', multi, '(each split into per-segment sub-entries)')

if (INCLUDE_YE_CLOSING) {
  entries.push({
    date: '2025-12-31',
    segment: 'corporate',
    ref: 'YEAR-END-CLOSING-2025',
    desc: 'Close Incorporation Expense Written Off to Retained Earnings',
    lines: [
      { code: '1510', dr: 2024.00, cr: 0, memo: 'Close incorporation expense to RE' },
      { code: '9000', dr: 0, cr: 2024.00, memo: 'Close incorporation expense (was 900-I001)' },
    ],
    total: 2024.00,
  })
}
if (INCLUDE_SUSPENSE_SPLIT) {
  entries.push({
    date: '2026-05-20',
    segment: 'unallocated',
    ref: 'SUSPENSE-SPLIT',
    desc: 'Interest-in-suspense split — The Cont 38,333.33 + HOUZS Century 38,333.33',
    lines: [
      { code: '3063', dr: 38333.33, cr: 0, memo: 'Interest in suspense — The Cont (LO#19)' },
      { code: '3053', dr: 0, cr: 38333.33, memo: 'Reclass from The Cont AR' },
      { code: '4052', dr: 38333.33, cr: 0, memo: 'Reclass from HOUZS Century AP' },
      { code: '4062', dr: 0, cr: 38333.33, memo: 'Interest in suspense — HOUZS Century (BI#19)' },
    ],
    total: 76666.66,
  })
}

// Per-bank-per-segment cleanup: Alliance becomes Director-only at opening,
// HL gets the rest. 6 JEs total (4 within-segment Alliance↔HL transfers,
// 2 cross-segment for Director top-up from Corporate via 1900 clearing).
// All balanced; TB and bank totals unchanged; only per-bank-per-segment
// allocation in journal_lines changes.
if (INCLUDE_PER_BANK_CLEANUP) {
  // Within-segment cleanup (4 JEs): zero out Alliance for non-Director
  // segments by moving their Alliance balance into HL.
  // Amounts derived from per-bank × per-segment current GL state.
  const withinSegmentMoves = [
    { seg: 'director_office', amount: 4358.00 },
    { seg: 'finance',         amount: 16319.62 },
    { seg: 'hr',              amount: 20140.68 },
    { seg: 'marketing',       amount: 33587.90 },
  ]
  for (const { seg, amount } of withinSegmentMoves) {
    entries.push({
      date: '2026-05-20',
      segment: seg,
      ref: `BANK-CLEANUP-${seg.toUpperCase()}`,
      desc: `Per-bank cleanup: ${seg} Alliance balance moved to HL (Alliance reserved for Director only)`,
      lines: [
        { code: '3010', dr: amount, cr: 0, memo: `${seg} Alliance → 0` },
        { code: '3000', dr: 0, cr: amount, memo: `${seg} HL absorbs Alliance balance` },
      ],
      total: amount,
    })
  }
  // Within-segment for Corporate: Alliance → 0, HL absorbs the 79,000.
  // (No transfer to Director — Director invoice pool lives separately in
  // invoice_payout_pool; Director's bank cash stays at natural GL 17,566.94.)
  entries.push({
    date: '2026-05-20',
    segment: 'corporate',
    ref: 'BANK-CLEANUP-CORPORATE',
    desc: 'Per-bank cleanup: corporate Alliance balance moved to HL',
    lines: [
      { code: '3000', dr: 79000.00, cr: 0,        memo: 'Corporate HL absorbs Alliance' },
      { code: '3010', dr: 0,        cr: 79000.00, memo: 'Corporate Alliance → 0' },
    ],
    total: 79000.00,
  })
  // Within-segment for Director: bring Alliance from -3,671.33 to +922.47
  // (delta +4,593.80), offset by HL reduction. Director total stays at
  // natural GL value 17,566.94.
  entries.push({
    date: '2026-05-20',
    segment: 'director',
    ref: 'BANK-CLEANUP-DIRECTOR',
    desc: 'Per-bank cleanup: Director Alliance reset to 922.47 (Alliance = Director-only convention)',
    lines: [
      { code: '3010', dr: 4593.80, cr: 0,       memo: 'Director Alliance → 922.47' },
      { code: '3000', dr: 0,       cr: 4593.80, memo: 'Director HL absorbs Alliance shift' },
    ],
    total: 4593.80,
  })
}
console.log('Total entries to post     :', entries.length, `(YE: ${INCLUDE_YE_CLOSING}, suspense: ${INCLUDE_SUSPENSE_SPLIT}, bank-cleanup: ${INCLUDE_PER_BANK_CLEANUP})`)

let tDr = 0, tCr = 0
for (const e of entries) for (const l of e.lines) { tDr += l.dr; tCr += l.cr }
console.log(`\nTotal across all entries  : Dr ${r2(tDr).toFixed(2)}  Cr ${r2(tCr).toFixed(2)}  imbalance ${r2(tDr - tCr).toFixed(2)}`)

// ---- Per-system-account net (Dr - Cr) ----
const accNet = new Map()
for (const e of entries) {
  for (const l of e.lines) {
    accNet.set(l.code, r2((accNet.get(l.code) || 0) + l.dr - l.cr))
  }
}
console.log('\n==================== PER-ACCOUNT NET (sorted by abs) ====================')
const sorted = [...accNet].map(([k, v]) => [k, v]).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
for (const [code, net] of sorted) console.log(' ', code.padEnd(6), net.toFixed(2).padStart(14))

// ---- Per-segment P&L (income - expense) ----
const segPL = new Map()
for (const e of entries) {
  for (const l of e.lines) {
    const code = l.code
    let kind = null
    if (['5010', '5020', '5000', '7000'].includes(code)) kind = 'inc'
    else if (/^9\d{3}$/.test(code) && code !== '1900') kind = 'exp'
    if (!kind) continue
    const k = `${e.segment}|${kind}`
    segPL.set(k, r2((segPL.get(k) || 0) + (kind === 'inc' ? l.cr - l.dr : l.dr - l.cr)))
  }
}
console.log('\n==================== PER-SEGMENT P&L (cumulative) ====================')
const segs = ['marketing', 'finance', 'hr', 'director_office', 'director', 'corporate', 'unallocated']
let totInc = 0, totExp = 0
for (const s of segs) {
  const inc = segPL.get(`${s}|inc`) || 0
  const exp = segPL.get(`${s}|exp`) || 0
  totInc += inc; totExp += exp
  console.log(`  ${s.padEnd(16)} Inc ${inc.toFixed(2).padStart(12)}  Exp ${exp.toFixed(2).padStart(12)}  Net ${r2(inc - exp).toFixed(2).padStart(12)}`)
}
console.log(`  ${'TOTAL'.padEnd(16)} Inc ${r2(totInc).toFixed(2).padStart(12)}  Exp ${r2(totExp).toFixed(2).padStart(12)}  Net ${r2(totInc - totExp).toFixed(2).padStart(12)}`)

// ---- Per-segment cash impact on bank accounts (3000 + 3010) ----
const segCash = new Map()
for (const e of entries) {
  for (const l of e.lines) {
    if (l.code === '3000' || l.code === '3010') {
      const k = e.segment
      segCash.set(k, r2((segCash.get(k) || 0) + l.dr - l.cr))
    }
  }
}
console.log('\n==================== PER-SEGMENT CASH FLOW (3000+3010 net) ====================')
let totCash = 0
for (const s of segs) {
  const v = segCash.get(s) || 0
  totCash += v
  console.log(`  ${s.padEnd(16)} ${v.toFixed(2).padStart(14)}`)
}
console.log(`  ${'TOTAL'.padEnd(16)} ${r2(totCash).toFixed(2).padStart(14)}`)

await writeFile(OUT_PATH, JSON.stringify(entries, null, 2), 'utf8')
console.log(`\nWrote ${entries.length} entries to ${OUT_PATH}`)
