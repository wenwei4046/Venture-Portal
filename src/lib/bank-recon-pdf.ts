// PDF bank-statement template parsing (user 2026-08-08, sample:
// "Venture - Apr'26.pdf"). Coordinate-based — the text layer glues the
// Deposit/Withdrawal/Balance columns together, but pdf2json keeps every text
// run's x/y, and the column header x-positions let us classify each number.
//
// HLB PRIMEBIZ layout (per page):
//   header row:  Date | Transaction Description | Deposit | Withdrawal | Balance
//   txn row:     DD-MM-YYYY at x≈3.4, type text at x≈6.1, number items right
//                of the description; balance only on the last txn of a date.
//   continuation lines (remark / PV no / counterparty) share the description x
//   until the next date row — pure gold for name-matching, joined with ' · '.
//   noise: bank refs (20260401HLBB…), page artifacts (23600599248_6 1),
//   footer lines.
//
// Every parse is validated: opening + Σ(signed amounts) must equal closing to
// the sen, else we refuse (fail-safe — never save a half-read statement).

const r2 = (n: number) => Math.round(n * 100) / 100

export interface PdfTextItem {
  x: number
  y: number
  text: string
}

export interface PdfPageItems {
  items: PdfTextItem[]
}

export interface PdfParsedStatement {
  bank: 'hlb'
  lines: Array<{ date: string; description: string; amount: number }>
  opening: number | null
  closing: number | null
  skipped: number
}

const DATE_RE = /^(\d{2})-(\d{2})-(\d{4})$/
const NUM_RE = /^-?[\d,]+\.\d{2}$/
const NOISE_RE = /^(\d{8}HLBB|\d{9,}_\d+|Hong Leong Bank Berhad|Protected by PIDM|Dilindungi oleh)/i

export function looksLikeHlb(pages: PdfPageItems[]): boolean {
  return pages.some(p =>
    p.items.some(i => /HLB|HONG LEONG/i.test(i.text)),
  )
}

function toIso(d: string): string | null {
  const m = d.match(DATE_RE)
  if (!m) return null
  return `${m[3]}-${m[2]}-${m[1]}`
}

function parseNum(s: string): number | null {
  if (!NUM_RE.test(s.trim())) return null
  const n = Number(s.replace(/,/g, ''))
  return Number.isFinite(n) ? r2(n) : null
}

/** Group items into visual rows by y (tolerance) then sort left-to-right. */
function toRows(items: PdfTextItem[], tolerance = 0.3): PdfTextItem[][] {
  const sorted = [...items].sort((a, b) => a.y - b.y || a.x - b.x)
  const rows: PdfTextItem[][] = []
  for (const item of sorted) {
    const last = rows[rows.length - 1]
    if (last && Math.abs(last[0].y - item.y) <= tolerance) last.push(item)
    else rows.push([item])
  }
  for (const row of rows) row.sort((a, b) => a.x - b.x)
  return rows
}

export function parseHlbPdf(pages: PdfPageItems[]): PdfParsedStatement | { error: string } {
  const lines: PdfParsedStatement['lines'] = []
  let opening: number | null = null
  let closing: number | null = null
  let skipped = 0

  for (const page of pages) {
    const rows = toRows(page.items)

    // Column calibration from this page's header row.
    let depositX = -1, withdrawalX = -1, balanceX = -1
    for (const row of rows) {
      for (const item of row) {
        const t = item.text.trim().toLowerCase()
        if (t === 'deposit') depositX = item.x
        if (t === 'withdrawal') withdrawalX = item.x
        if (t === 'balance') balanceX = item.x
      }
      if (depositX >= 0 && withdrawalX >= 0 && balanceX >= 0) break
    }
    if (depositX < 0 || withdrawalX < 0 || balanceX < 0) continue // page without a txn table

    const classify = (x: number): 'deposit' | 'withdrawal' | 'balance' => {
      const d = Math.abs(x - depositX)
      const w = Math.abs(x - withdrawalX)
      const b = Math.abs(x - balanceX)
      if (d <= w && d <= b) return 'deposit'
      if (w <= b) return 'withdrawal'
      return 'balance'
    }

    let currentLineIdx: number | null = null

    for (const row of rows) {
      const first = row[0]
      const texts = row.map(i => i.text.trim()).filter(Boolean)
      if (texts.length === 0) continue
      const joined = texts.join(' ')

      // Opening balance row.
      if (/balance from previous statement/i.test(joined)) {
        const n = row.map(i => parseNum(i.text)).find(v => v != null)
        if (n != null) opening = n
        continue
      }

      const iso = toIso(first.text.trim())
      if (iso) {
        // New transaction row: description texts + column-classified numbers.
        const parts: string[] = []
        let amount: number | null = null
        let sawBalance: number | null = null
        for (const item of row.slice(1)) {
          const n = parseNum(item.text)
          if (n == null) {
            if (!NOISE_RE.test(item.text.trim())) parts.push(item.text.trim())
            continue
          }
          const col = classify(item.x)
          if (col === 'deposit') amount = Math.abs(n)
          else if (col === 'withdrawal') amount = -Math.abs(n)
          else sawBalance = n
        }
        if (sawBalance != null) closing = sawBalance
        if (amount != null) {
          lines.push({ date: iso, description: parts.join(' · '), amount: r2(amount) })
          currentLineIdx = lines.length - 1
        } else {
          skipped++
          currentLineIdx = null
        }
        continue
      }

      // Continuation line (remark / ref / counterparty) for the current txn.
      if (currentLineIdx != null) {
        const clean = texts.filter(t => !NOISE_RE.test(t) && parseNum(t) == null)
        if (clean.length > 0) {
          const existing = lines[currentLineIdx].description
          lines[currentLineIdx].description = existing
            ? `${existing} · ${clean.join(' · ')}`
            : clean.join(' · ')
        }
      }
    }
  }

  if (lines.length === 0) {
    return { error: 'No transactions parsed from the PDF — send this file to Claude to tune the template.' }
  }

  // Fail-safe: the statement must add up before we trust it.
  if (opening != null && closing != null) {
    const sum = r2(lines.reduce((s, l) => s + l.amount, 0))
    const expected = r2(closing - opening)
    if (Math.abs(sum - expected) > 0.01) {
      return {
        error: `Parsed movements (RM ${sum.toFixed(2)}) don't tie to the statement's opening→closing change (RM ${expected.toFixed(2)}) — send this file to Claude to tune the template.`,
      }
    }
  }

  return { bank: 'hlb', lines, opening, closing, skipped }
}
