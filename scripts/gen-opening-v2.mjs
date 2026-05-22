// Regenerate the HV opening from the FINAL new TB (22.05) + new GL.
// Full replace: BS entry + 5 P&L segment entries (clearing-balanced),
// then customizations: interest-in-suspense split (in BS) + Director->Director Pool.
// Outputs SQL to opening-v2.sql and prints a reconciliation. Does NOT touch the DB.
import fs from 'node:fs'
import { createRequire } from 'node:module'
const XLSX = createRequire(import.meta.url)('xlsx')

const U = "'cbc6a18a-3f38-4567-b8c3-385d00b9e6b3'"
const GL = 'C:/Users/User/OneDrive/Desktop/HV - General Legder 22.05.xlsx'
const r2 = n => Math.round(n * 100) / 100

// source P&L account -> system COA code + income flag
const PNL = {
  '500-0000': ['5010', 1], '700-0010': ['5020', 1], '700-0020': ['5000', 1], '700-0030': ['7000', 1],
  '900-E001': ['9081', 0], '900-E002': ['9083', 0], '900-M001': ['9020', 0], '900-S001': ['9082', 0],
  '900-S002': ['9084', 0], '900-S003': ['9085', 0], '900-U001': ['9086', 0], '900-W001': ['9087', 0],
  '901-0000': ['9088', 0], '902-0000': ['9089', 0], '904-0000': ['9030', 0], '905-0000': ['9090', 0],
  '907-0000': ['9091', 0], '911-0000': ['9010', 0], '912-0000': ['9092', 0], '913-0000': ['9093', 0],
  '914-0000': ['9094', 0], '915-0000': ['9000', 0],
}
// dept -> allocation bucket (office & director kept separate; merged into
// 'corporate' only when emitting the corporate journal entry).
const bucketOf = d => ({ DIRECTOR: 'director', OFFICE: 'office', DO: 'director_office', MAR: 'marketing', FIN: 'finance', HR: 'hr' }[d] || 'office')

// NEW TB exact P&L control totals (normal-balance positive) per system code.
const TB_PNL = {
  '5010': 3846.87, '5020': 496196.46, '5000': 122209.79, '7000': 15620.00,
  '9081': 57139.00, '9083': 619.40, '9020': 1607.90, '9082': 5420.70,
  '9084': 23001.89, '9085': 1290.00, '9086': 631.58, '9087': 4795.33,
  '9088': 2807.34, '9089': 0.40, '9030': 483022.47, '9090': 67.25,
  '9091': 828.14, '9010': 9630.00, '9092': 19.30, '9093': 22360.38,
  '9094': 16889.14, '9000': 230.00,
}
const INC = new Set(['5010', '5020', '5000', '7000'])

// ---- parse GL: per (sysCode, bucket) raw signed sum (for proportions) ----
const wb = XLSX.readFile(GL)
const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, blankrows: false })
let cur = null
const raw = {}  // sysCode -> { bucket: signedAmt }
for (const row of rows) {
  const c0 = row[0]
  if (typeof c0 === 'string' && c0.startsWith('Acc. No.:')) { const m = c0.match(/Acc\. No\.: ([0-9A-Za-z-]+)/); cur = m ? m[1] : null; continue }
  if (row[1] == null) continue // footer total row
  const p = PNL[cur]; if (!p) continue
  const dr = typeof row[8] === 'number' ? row[8] : 0
  const cr = typeof row[9] === 'number' ? row[9] : 0
  const [sys, inc] = p
  const val = inc ? (cr - dr) : (dr - cr)
  const b = bucketOf(String(row[5] || '').trim().toUpperCase())
  raw[sys] = raw[sys] || {}
  raw[sys][b] = (raw[sys][b] || 0) + val
}

// ---- allocate each account's TB-exact total across buckets (abs-weight,
//      last bucket absorbs the rounding remainder so each account ties exactly) ----
const BUCKETS = ['marketing', 'finance', 'hr', 'director_office', 'office', 'director']
const allocBucket = {}  // bucket -> { sysCode: amt }
for (const b of BUCKETS) allocBucket[b] = {}
for (const sys of Object.keys(TB_PNL)) {
  const tb = TB_PNL[sys]
  const w = raw[sys] || {}
  const present = BUCKETS.filter(b => Math.abs(w[b] || 0) > 0.0000001)
  const totW = present.reduce((a, b) => a + Math.abs(w[b]), 0)
  if (present.length === 0 || totW === 0) { allocBucket['office'][sys] = tb; continue }
  let assigned = 0
  present.forEach((b, i) => {
    const amt = i === present.length - 1 ? r2(tb - assigned) : r2(tb * Math.abs(w[b]) / totW)
    assigned = r2(assigned + amt)
    if (Math.abs(amt) > 0.004) allocBucket[b][sys] = amt
  })
}

// segment maps: corporate = office + director (merge); director extracted for reclass
const SEG_BUCKETS = { marketing: ['marketing'], finance: ['finance'], hr: ['hr'], director_office: ['director_office'], corporate: ['office', 'director'] }
const bySeg = {}
for (const s of Object.keys(SEG_BUCKETS)) {
  bySeg[s] = {}
  for (const b of SEG_BUCKETS[s]) for (const sys of Object.keys(allocBucket[b])) {
    bySeg[s][sys] = bySeg[s][sys] || { inc: INC.has(sys), amt: 0 }
    bySeg[s][sys].amt = r2(bySeg[s][sys].amt + allocBucket[b][sys])
  }
}
const director = {}
for (const sys of Object.keys(allocBucket['director'])) director[sys] = { inc: INC.has(sys), amt: allocBucket['director'][sys] }

// ---- BS entry (new TB, with interest-in-suspense split applied) ----
const bs = [
  ['1500', 0, 3000], ['1510', 2024, 0], ['2000', 9803.37, 0], ['3030', 91.26, 0], ['3071', 15179.16, 0],
  ['3000', 8415.67, 0], ['3010', 922.47, 0],
  ['3051', 266666.67, 0],
  ['3053', 564700, 0], ['3063', 38333.33, 0],          // The Cont split
  ['3055', 95381.63, 0], ['3058', 28575.50, 0], ['3052', 12216.40, 0], ['3059', 2904, 0],
  ['4052', 0, 473163.78], ['4062', 0, 38333.33],        // HOUZS Century split
  ['4051', 0, 118613.75], ['4058', 0, 100000], ['4057', 0, 50000], ['4054', 0, 133000], ['4056', 0, 49000], ['4055', 0, 73200],
  ['4050', 0, 749.40],
  ['4070', 1058.50, 0], ['4071', 278, 0], ['4072', 15.80, 0], ['4073', 2.80, 0], ['4074', 4.60, 0],
]

const fmtVal = n => n > 0.000001 ? n.toFixed(2) + '::numeric' : 'NULL::numeric'
function entrySQL(segment, desc, lines) {
  // lines: [code, dr, cr]
  const sumDr = r2(lines.reduce((a, l) => a + l[1], 0))
  const sumCr = r2(lines.reduce((a, l) => a + l[2], 0))
  const clr = r2(sumCr - sumDr) // +ve => need Dr clearing, -ve => need Cr clearing
  const full = lines.slice()
  if (Math.abs(clr) > 0.004) full.push(['1900', clr > 0 ? clr : 0, clr < 0 ? -clr : 0])
  const total = r2(full.reduce((a, l) => a + l[1], 0))
  const vals = full.map(l => `('${l[0]}',${fmtVal(l[1])},${fmtVal(l[2])})`).join(',\n  ')
  const sql = `WITH s AS (SELECT nextval('journal_entry_no_seq') AS seq),
e AS (INSERT INTO journal_entries (entry_no,transaction_date,period_month,description,reference_type,segment,total_amount,created_by)
 SELECT format('JE-%s-%s',to_char(DATE '2026-05-20','YYYYMM'),lpad(s.seq::text,4,'0')),DATE '2026-05-20',DATE '2026-05-01','${desc}','manual_jv','${segment}'::gl_segment,${total.toFixed(2)},${U} FROM s RETURNING id)
INSERT INTO journal_lines (entry_id,account_code,debit,credit)
SELECT e.id,x.code,x.dr,x.cr FROM e,(VALUES
  ${vals}
) AS x(code,dr,cr);`
  return { sql, sumDr, sumCr, clr, total }
}

let sql = `-- ============ FULL REPLACE: HV opening from final TB 22.05 (1,676,933.38) ============
-- Step 1: wipe existing manual_jv opening + Director Pool opening
DELETE FROM journal_lines WHERE entry_id IN (SELECT id FROM journal_entries WHERE reference_type='manual_jv');
DELETE FROM journal_entries WHERE reference_type='manual_jv';
DELETE FROM dept_pools WHERE department_id=(SELECT id FROM departments WHERE name='Director')
  AND description LIKE 'Opening Director Pool%';

`

console.log('================ RECONCILIATION ================')
// BS
const bsR = entrySQL('unallocated', '期初 BS @20/05/2026 (TB 22.05)', bs)
sql += '-- Step 2a: BS opening\n' + bsR.sql + '\n\n'
console.log(`BS         Dr ${bsR.sumDr.toFixed(2).padStart(13)}  Cr ${bsR.sumCr.toFixed(2).padStart(13)}  clearing ${(bsR.clr).toFixed(2).padStart(11)} (net profit roll)`)

// P&L segments
const SEG_ORDER = ['marketing', 'finance', 'hr', 'director_office', 'corporate']
let totNet = 0, clearingSum = bsR.clr > 0 ? bsR.clr : -(-bsR.clr)
let clearingTotal = bsR.clr // signed: + means Dr clearing posted... track net
sql += '-- Step 2b: P&L segment entries\n'
for (const s of SEG_ORDER) {
  const accts = bySeg[s] || {}
  const lines = Object.keys(accts).sort().map(code => {
    const { inc, amt } = accts[code]
    return inc ? [code, 0, r2(amt)] : [code, r2(amt), 0]
  })
  const eR = entrySQL(s, `期初 P&L ${s} @20/05/2026 (TB 22.05)`, lines)
  sql += eR.sql + '\n\n'
  const inc = r2(lines.filter(l => l[2] > 0).reduce((a, l) => a + l[2], 0))
  const exp = r2(lines.filter(l => l[1] > 0).reduce((a, l) => a + l[1], 0))
  const net = r2(inc - exp)
  totNet += net
  clearingTotal += eR.clr
  console.log(`${s.padEnd(16)} Inc ${inc.toFixed(2).padStart(12)}  Exp ${exp.toFixed(2).padStart(12)}  Net ${net.toFixed(2).padStart(11)}  clr ${eR.clr.toFixed(2).padStart(11)}`)
}
console.log(`P&L total net profit: ${totNet.toFixed(2)}  (BS clearing offsets this)`)
console.log(`SUM of all clearing legs (must be ~0): ${r2(clearingTotal).toFixed(2)}`)

// ---- Step 3 already folded into BS (suspense split). ----
// ---- Step 4: Director -> Director Pool reclass ----
const dirInc = r2(Object.values(director).filter(v => v.inc).reduce((a, v) => a + v.amt, 0))
const dirExp = r2(Object.values(director).filter(v => !v.inc).reduce((a, v) => a + v.amt, 0))
const dirNet = r2(dirInc - dirExp)
const rlines = []
for (const code of Object.keys(director).sort()) {
  const { inc, amt } = director[code]
  if (Math.abs(amt) < 0.004) continue
  if (inc) rlines.push([code, r2(amt), 0])   // Dr to reverse income
  else rlines.push([code, 0, r2(amt)])       // Cr to reverse expense
}
rlines.push(['4080', 0, dirNet])              // net -> Director Pool Payable (Cr, profit)
const recR = entrySQL('corporate', 'Reclass: DIRECTOR opening P&L -> Director Pool Payable', rlines)
sql += '-- Step 4: Director -> Director Pool reclass\n' + recR.sql + '\n\n'
sql += `-- Step 4b: mirror into operational Director Pool ledger
INSERT INTO dept_pools(department_id,transaction_type,amount,period_month,description,created_by)
SELECT id,'np_in'::dept_pool_txn_type,${dirNet.toFixed(2)},DATE '2026-05-01','Opening Director Pool balance (ledger DIRECTOR dept net P&L)',${U}
FROM departments WHERE name='Director';
`
console.log(`\nDirector reclass: Inc ${dirInc.toFixed(2)}  Exp ${dirExp.toFixed(2)}  Net(->4080 & Director Pool) ${dirNet.toFixed(2)}  reclassBalanced=${Math.abs(recR.clr) < 0.004}`)

fs.writeFileSync('C:/Users/User/OneDrive/Desktop/Claude/Venture/Venture-Portal/scripts/opening-v2.sql', sql)
console.log('\nWROTE opening-v2.sql (' + sql.length + ' chars)')
