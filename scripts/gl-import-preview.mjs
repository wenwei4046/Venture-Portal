// PREVIEW (read-only): parses the source GL, applies the user-specified
// corrections, groups by Ref.1 with multi-dept journals split per segment,
// and prints per-dept / per-account totals so we can verify before writing
// anything to the DB.
//
// Corrections applied:
//   1) PV-000077 HOUZS Century interest 4,130 -> 3,540 (-590), bank payment
//      23,796.67 -> 23,206.67 (so the journal still balances).
//   2) Interest-in-suspense split: a one-time adjusting JE at 2026-05-20
//      moves 38,333.33 from 3053 -> 3063 (The Cont) and 4052 -> 4062
//      (HOUZS Century).
//
// Run: node scripts/gl-import-preview.mjs

import { writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
const XLSX = createRequire(import.meta.url)('xlsx')

const GL_PATH = 'C:/Users/User/OneDrive/Desktop/HV - General Legder 22.05.xlsx'

// Source GL account -> system COA code (actual codes used in DB).
// Sub-accounts (305-xxxx per-subsidiary debtor, 405-xxxx per-party creditor)
// are consolidated to the parent system code, matching the TB's roll-up view.
const ACC_MAP = {
  '100-0000': '1500', '150-0000': '1510', '200-3000': '2000',
  '300-0000': '3030',
  // 305-xxxx -> 3071 Other Debtor (consolidated); 305-D001 (Dream Crafter) -> 3030 Trade Debtors (91.26)
  '305-0000': '3071', '305-2001': '3071', '305-C001': '3071',
  '305-D001': '3030', // Dream Crafter trade receivable
  '305-H001': '3071', '305-H002': '3071', '305-T001': '3071',
  '310-0010': '3000', '310-0030': '3010',
  '350-0010': '3051', '350-0020': '3053', '350-0050': '4052',
  '350-0060': '3055', '350-0070': '3058', '350-0080': '4051',
  '350-0090': '3052', '350-0120': '3059',
  '360-0020': '4058',
  '370-0010': '4057', '370-0020': '4054', '370-0030': '4056', '370-0040': '4055',
  // 405-xxxx Other Creditor (per-party) -> 4050 (consolidated)
  '405-0000': '4050', '405-H001': '4050', '405-Y001': '4050',
  '410-0010': '4070', '410-0020': '4071', '410-0030': '4072',
  '410-0040': '4073', '410-0050': '4074', '410-0060': '4075',
  '420-1000': '7000', // hire purchase suspense merged into Interest Income per opening
  '500-0000': '5010', '700-0010': '5020', '700-0020': '5000', '700-0030': '7000',
  '900-E001': '9081', '900-E002': '9083', '900-I001': '9000', // INCORPORATION EXP WRITTEN OFF -> General Expenses
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
// Income account prefixes (in source GL coding)
const isIncome = (acc) => /^(500-|700-)/.test(acc)
// Expense account prefixes — everything 9xx (incl 901-915)
const isExpense = (acc) => /^9\d\d-/.test(acc)

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
  if (row[1] == null) continue // footer/total row
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
  // Empty / unknown dept -> default to OFFICE (corporate / Venture pool)
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
console.log('Transaction lines parsed :', ALL_LINES.length)
console.log('BALANCE B/F rows skipped :', balanceBFCount.rows, '(nonzero:', balanceBFCount.nonZero, ')')
if (unmappedAccs.size) console.warn('Unmapped source accounts :', [...unmappedAccs].join(', '))
if (unmappedDepts.size) console.warn('Unmapped depts           :', [...unmappedDepts].slice(0, 10).join('; '))

// ---- Apply PV-000077 correction ----
const pv77 = ALL_LINES.filter((l) => l.ref === 'PV-000077')
console.log('\n==================== PV-000077 (before correction) ====================')
for (const l of pv77) console.log(' ', l.acc.padEnd(10), l.dept.padEnd(9), 'Dr', l.dr.toFixed(2).padStart(11), 'Cr', l.cr.toFixed(2).padStart(11), '|', l.desc)
// PV-000077 has 4 lines: Dr 350-0050 19,666.67 (principal) + Dr 911-0000 4,130 (interest);
// Cr 310-0010 19,666.67 (principal) + Cr 310-0010 4,130 (interest). HOUZS Century interest
// 3.5%->3% means the 4,130 interest portion drops to 3,540 on BOTH the expense and bank
// sides; principal repayment unchanged. Net bank payment 23,796.67 -> 23,206.67.
let cInt = 0, cBnk = 0
for (const l of pv77) {
  if (l.acc === '911-0000' && l.dr === 4130) { l.dr = 3540; cInt++ }
  if (l.acc === '310-0010' && l.cr === 4130) { l.cr = 3540; cBnk++ }
}
console.log(`Correction applied: ${cInt} interest line(s), ${cBnk} bank-interest line(s)`)
console.log('==================== PV-000077 (after correction) ====================')
for (const l of pv77) console.log(' ', l.acc.padEnd(10), l.dept.padEnd(9), 'Dr', l.dr.toFixed(2).padStart(11), 'Cr', l.cr.toFixed(2).padStart(11), '|', l.desc)

// ---- Group by Ref.1 ----
const journals = new Map()
for (const l of ALL_LINES) {
  if (!journals.has(l.ref)) journals.set(l.ref, { date: l.date, lines: [] })
  // earliest date wins
  if (l.date < journals.get(l.ref).date) journals.get(l.ref).date = l.date
  journals.get(l.ref).lines.push(l)
}
console.log('\n==================== JOURNAL GROUPS ====================')
console.log('Total journals (by Ref.1):', journals.size)

// Check per-journal balance
let unbalanced = 0
for (const [ref, j] of journals) {
  const dr = r2(j.lines.reduce((a, l) => a + l.dr, 0))
  const cr = r2(j.lines.reduce((a, l) => a + l.cr, 0))
  if (Math.abs(dr - cr) > 0.01) { unbalanced++; if (unbalanced <= 5) console.warn(`  Unbalanced: ${ref} Dr ${dr} Cr ${cr}`) }
}
console.log('Unbalanced journals       :', unbalanced)

// ---- Build entries per (ref, segment), multi-dept gets clearing ----
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
console.log('Total entries to post     :', entries.length, '(before suspense JE)')

// ---- Year-end closing JE (2025-12-31, unallocated) ----
// Close Incorporation Expense Written Off (900-I001 -> 9000) to Retained
// Earnings, matching the TB's "RE 2024 Dr, 900-I001 not shown" state.
entries.push({
  date: '2025-12-31',
  segment: 'corporate',
  ref: 'YEAR-END-CLOSING-2025',
  desc: 'Close Incorporation Expense Written Off to Retained Earnings',
  lines: [
    { code: '1510', dr: 2024.00, cr: 0,       memo: 'Close incorporation expense to RE' },
    { code: '9000', dr: 0,       cr: 2024.00, memo: 'Close incorporation expense (was 900-I001)' },
  ],
  total: 2024.00,
})

// ---- Suspense split adjusting JE (2026-05-20, unallocated) ----
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
console.log('Total entries (with suspense JE):', entries.length)

// ---- Totals across all entries ----
let tDr = 0, tCr = 0
for (const e of entries) for (const l of e.lines) { tDr += l.dr; tCr += l.cr }
console.log(`\nTotal across all entries  : Dr ${r2(tDr).toFixed(2)}  Cr ${r2(tCr).toFixed(2)}  imbalance ${r2(tDr - tCr).toFixed(2)}`)

// ---- Per-system-account net (Dr - Cr) for verification against TB ----
const accNet = new Map()
for (const e of entries) {
  for (const l of e.lines) {
    accNet.set(l.code, r2((accNet.get(l.code) || 0) + l.dr - l.cr))
  }
}
console.log('\n==================== PER-ACCOUNT NET (sorted by abs) ====================')
const sorted = [...accNet].map(([k, v]) => [k, v]).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
for (const [code, net] of sorted) console.log(' ', code.padEnd(6), net.toFixed(2).padStart(14))

// ---- Per-segment P&L net (income - expense) for verification ----
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
const segs = ['marketing', 'finance', 'hr', 'director_office', 'director', 'corporate']
let totInc = 0, totExp = 0
for (const s of segs) {
  const inc = segPL.get(`${s}|inc`) || 0
  const exp = segPL.get(`${s}|exp`) || 0
  totInc += inc; totExp += exp
  console.log(`  ${s.padEnd(16)} Inc ${inc.toFixed(2).padStart(12)}  Exp ${exp.toFixed(2).padStart(12)}  Net ${r2(inc - exp).toFixed(2).padStart(12)}`)
}
console.log(`  ${'TOTAL'.padEnd(16)} Inc ${r2(totInc).toFixed(2).padStart(12)}  Exp ${r2(totExp).toFixed(2).padStart(12)}  Net ${r2(totInc - totExp).toFixed(2).padStart(12)}`)

// ---- Per-account TB check vs new TB ----
const NEW_TB = {
  '1500': -3000, '1510': 2024, '2000': 9803.37,
  '3030': 91.26, '3071': 15179.16,
  '3000': 9005.67, '3010': 922.47,
  '3051': 266666.67,
  '3053': 564700, '3063': 38333.33,
  '3055': 95381.63, '3058': 28575.50, '3052': 12216.40, '3059': 2904,
  '4052': -473163.78, '4062': -38333.33,
  '4051': -118613.75, '4058': -100000, '4057': -50000,
  '4054': -133000, '4056': -49000, '4055': -73200, '4050': -749.40,
  '4070': 1058.50, '4071': 278, '4072': 15.80, '4073': 2.80, '4074': 4.60,
  '5010': -3846.87, '5020': -496196.46, '5000': -122209.79, '7000': -15620.00,
  '9081': 57139, '9083': 619.40, '9020': 1607.90, '9082': 5420.70,
  '9084': 23001.89, '9085': 1290, '9086': 631.58, '9087': 4795.33,
  '9088': 2807.34, '9089': 0.40, '9030': 483022.47, '9090': 67.25,
  '9091': 828.14, '9010': 9040, '9092': 19.30, '9093': 22360.38,
  '9094': 16889.14, '9000': 230,
}
console.log('\n==================== TB RECONCILIATION (NEW TB 22.05 + corrections) ====================')
let mismatches = 0
for (const code of Object.keys(NEW_TB).sort()) {
  const actual = r2(accNet.get(code) || 0)
  const expected = NEW_TB[code]
  const diff = r2(actual - expected)
  if (Math.abs(diff) > 0.01) {
    mismatches++
    console.log(`  ${code}: actual ${actual.toFixed(2).padStart(12)}  expected ${expected.toFixed(2).padStart(12)}  diff ${diff.toFixed(2)}`)
  }
}
// Also list accounts in entries that are NOT in NEW_TB (might be unexpected)
const unexpected = [...accNet.keys()].filter((c) => !(c in NEW_TB) && c !== '1900')
if (unexpected.length) console.log('  Accounts in entries but not in expected TB:', unexpected.join(', '))
console.log(`Mismatches: ${mismatches}`)

await writeFile('scripts/gl-import-entries.json', JSON.stringify(entries, null, 2))
console.log('\nWrote scripts/gl-import-entries.json (entries to be posted)')
