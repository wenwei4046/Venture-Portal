// Bank reconciliation engine (user 2026-08-08: "upload pdf 或excel 后自动对账
// … 金额，名字等等，日期其次。对不上就问我").
//
// Matching philosophy, per the user's priority order:
//   1. AMOUNT must equal to the sen (signed — money-in matches money-in).
//   2. Within an amount bucket, pairs are chosen by NAME similarity between
//      the statement description and the book line's description.
//   3. DATE proximity only breaks ties. No hard date window — the user pays
//      and records on different days routinely.
// Anything the greedy pairing can't settle stays unmatched for manual review
// ("对不上就问我").

const r2 = (n: number) => Math.round(n * 100) / 100

export interface StatementLine {
  /** Caller-side identifier (row index or db id). */
  key: string
  date: string // YYYY-MM-DD
  description: string
  /** Signed: positive = money in, negative = money out. */
  amount: number
}

export interface BookLine {
  key: string
  date: string
  description: string
  /** Signed the same way: journal debit − credit on the bank GL. */
  amount: number
}

export interface MatchPair {
  statementKey: string
  bookKey: string
  score: number
}

export interface MatchResult {
  pairs: MatchPair[]
  unmatchedStatement: string[]
  unmatchedBook: string[]
}

/** Alphanumeric lowercase tokens, 2+ chars, numbers kept (invoice/PV nos). */
export function tokens(s: string | null | undefined): string[] {
  if (!s) return []
  return (s.toLowerCase().match(/[a-z0-9]{2,}/g) ?? []).filter(
    t => !['the', 'and', 'for', 'pv', 'hv', 'je', 'rm'].includes(t),
  )
}

/** 0..1 token-overlap similarity (size of intersection / smaller set). */
export function nameSimilarity(a: string | null | undefined, b: string | null | undefined): number {
  const ta = new Set(tokens(a))
  const tb = new Set(tokens(b))
  if (ta.size === 0 || tb.size === 0) return 0
  let hit = 0
  for (const t of ta) if (tb.has(t)) hit++
  return hit / Math.min(ta.size, tb.size)
}

function daysApart(a: string, b: string): number {
  const ms = Math.abs(new Date(`${a}T00:00:00Z`).getTime() - new Date(`${b}T00:00:00Z`).getTime())
  return Math.round(ms / 86_400_000)
}

/** Pair score: name dominates (0..10), date proximity tie-breaks (0..1). */
export function pairScore(s: StatementLine, b: BookLine): number {
  const name = nameSimilarity(s.description, b.description) * 10
  const days = daysApart(s.date, b.date)
  const dateBonus = 1 / (1 + days)
  return r2(name + dateBonus)
}

/**
 * Greedy best-score pairing within equal-amount buckets. Every statement line
 * can match at most one book line and vice versa; leftovers stay unmatched.
 */
export function autoMatch(statement: StatementLine[], book: BookLine[]): MatchResult {
  const byAmount = new Map<string, { s: StatementLine[]; b: BookLine[] }>()
  const amountKey = (n: number) => r2(n).toFixed(2)
  for (const s of statement) {
    const k = amountKey(s.amount)
    const bucket = byAmount.get(k) ?? { s: [], b: [] }
    bucket.s.push(s)
    byAmount.set(k, bucket)
  }
  for (const b of book) {
    const k = amountKey(b.amount)
    const bucket = byAmount.get(k) ?? { s: [], b: [] }
    bucket.b.push(b)
    byAmount.set(k, bucket)
  }

  const pairs: MatchPair[] = []
  const usedS = new Set<string>()
  const usedB = new Set<string>()

  for (const bucket of byAmount.values()) {
    if (bucket.s.length === 0 || bucket.b.length === 0) continue
    const candidates: MatchPair[] = []
    for (const s of bucket.s)
      for (const b of bucket.b)
        candidates.push({ statementKey: s.key, bookKey: b.key, score: pairScore(s, b) })
    candidates.sort((a, b) => b.score - a.score)
    for (const c of candidates) {
      if (usedS.has(c.statementKey) || usedB.has(c.bookKey)) continue
      usedS.add(c.statementKey)
      usedB.add(c.bookKey)
      pairs.push(c)
    }
  }

  return {
    pairs,
    unmatchedStatement: statement.filter(s => !usedS.has(s.key)).map(s => s.key),
    unmatchedBook: book.filter(b => !usedB.has(b.key)).map(b => b.key),
  }
}

// ─── Statement table parsing (CSV / spreadsheet rows) ───────────────────────
// Works on a row-of-cells model so the same detector serves CSV text and
// xlsx sheets. Header detection is heuristic; when it fails the caller shows
// the raw preview and asks the user for the format.

export interface ParsedStatement {
  lines: Array<{ date: string; description: string; amount: number }>
  skipped: number
}

const DATE_HEADERS = ['date', 'txn date', 'transaction date', 'value date', 'posting date', 'tarikh']
const DESC_HEADERS = ['description', 'transaction description', 'details', 'particulars', 'remark', 'remarks', 'butiran', 'transaction']
const DEBIT_HEADERS = ['debit', 'debit amount', 'withdrawal', 'withdrawals', 'money out', 'out', 'dr']
const CREDIT_HEADERS = ['credit', 'credit amount', 'deposit', 'deposits', 'money in', 'in', 'cr']
const AMOUNT_HEADERS = ['amount', 'transaction amount', 'amount (rm)', 'amount rm']

function headerIndex(headers: string[], names: string[]): number {
  return headers.findIndex(h => names.some(n => h === n || h.startsWith(n)))
}

export function parseAmount(raw: unknown): number | null {
  if (raw == null) return null
  if (typeof raw === 'number') return Number.isFinite(raw) ? r2(raw) : null
  let s = String(raw).trim()
  if (!s || s === '-' || s === '—') return null
  let negative = false
  if (/^\(.*\)$/.test(s)) {
    negative = true
    s = s.slice(1, -1)
  }
  if (/(^-)|(-$)/.test(s)) negative = negative || s.startsWith('-') || s.endsWith('-')
  if (/(cr|dr|\+)$/i.test(s)) {
    if (/dr$/i.test(s)) negative = true
    s = s.replace(/(cr|dr|\+)$/i, '')
  }
  s = s.replace(/^-|-$/g, '').replace(/rm/i, '').replace(/[,\s]/g, '')
  const n = Number(s)
  if (!Number.isFinite(n)) return null
  return r2(negative ? -n : n)
}

export function parseDate(raw: unknown): string | null {
  if (raw == null) return null
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    const y = raw.getUTCFullYear()
    // Sheet dates parse at UTC midnight-ish; use UTC parts to avoid TZ drift.
    return `${y}-${String(raw.getUTCMonth() + 1).padStart(2, '0')}-${String(raw.getUTCDate()).padStart(2, '0')}`
  }
  const s = String(raw).trim()
  if (!s) return null
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
  m = s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})/)
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` // DD/MM/YYYY (MY banks)
  m = s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2})$/)
  if (m) return `20${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  m = s.match(/^(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4})/)
  if (m) {
    const months = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec']
    const idx = months.indexOf(m[2].slice(0, 3).toLowerCase())
    if (idx >= 0) return `${m[3]}-${String(idx + 1).padStart(2, '0')}-${m[1].padStart(2, '0')}`
  }
  return null
}

/**
 * Detect the header row and column roles, then extract lines. Rows before the
 * header (bank letterhead) and non-data rows are skipped and counted.
 */
export function parseStatementRows(rows: unknown[][]): ParsedStatement | { error: string } {
  // Find the header row: first row containing a date-ish AND a debit/credit/amount-ish cell.
  let headerRow = -1
  let dateCol = -1, descCol = -1, debitCol = -1, creditCol = -1, amountCol = -1
  for (let i = 0; i < Math.min(rows.length, 30); i++) {
    const cells = (rows[i] ?? []).map(c => String(c ?? '').trim().toLowerCase())
    const d = headerIndex(cells, DATE_HEADERS)
    if (d < 0) continue
    const de = headerIndex(cells, DEBIT_HEADERS)
    const cr = headerIndex(cells, CREDIT_HEADERS)
    const am = headerIndex(cells, AMOUNT_HEADERS)
    if (de < 0 && cr < 0 && am < 0) continue
    headerRow = i
    dateCol = d
    descCol = headerIndex(cells, DESC_HEADERS)
    debitCol = de
    creditCol = cr
    amountCol = am
    break
  }
  if (headerRow < 0) {
    return { error: 'Could not find the header row (Date + Debit/Credit/Amount columns). Send me this file and I will add its layout.' }
  }

  const lines: ParsedStatement['lines'] = []
  let skipped = 0
  for (let i = headerRow + 1; i < rows.length; i++) {
    const row = rows[i] ?? []
    const date = parseDate(row[dateCol])
    if (!date) { skipped++; continue }
    const description = descCol >= 0 ? String(row[descCol] ?? '').trim() : ''
    let amount: number | null = null
    if (amountCol >= 0) {
      amount = parseAmount(row[amountCol])
    } else {
      const debit = debitCol >= 0 ? parseAmount(row[debitCol]) : null
      const credit = creditCol >= 0 ? parseAmount(row[creditCol]) : null
      if (credit != null && credit !== 0) amount = Math.abs(credit)
      else if (debit != null && debit !== 0) amount = -Math.abs(debit)
    }
    if (amount == null || amount === 0) { skipped++; continue }
    lines.push({ date, description, amount: r2(amount) })
  }
  if (lines.length === 0) {
    return { error: 'Header found but no transaction rows parsed. Send me this file and I will add its layout.' }
  }
  return { lines, skipped }
}

/** CSV text → rows of cells (simple quoted-field aware split). */
export function csvToRows(text: string): string[][] {
  const rows: string[][] = []
  for (const rawLine of text.split(/\r?\n/)) {
    if (!rawLine.trim()) continue
    const cells: string[] = []
    let cur = ''
    let inQ = false
    for (let i = 0; i < rawLine.length; i++) {
      const ch = rawLine[i]
      if (inQ) {
        if (ch === '"' && rawLine[i + 1] === '"') { cur += '"'; i++ }
        else if (ch === '"') inQ = false
        else cur += ch
      } else if (ch === '"') inQ = true
      else if (ch === ',') { cells.push(cur); cur = '' }
      else cur += ch
    }
    cells.push(cur)
    rows.push(cells)
  }
  return rows
}
