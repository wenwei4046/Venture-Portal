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
// Column classification (2026-09-28, "Venture - Aug'26.pdf"): the money cells
// are RIGHT-aligned, so a short number's left edge sits far to the right of a
// long one's — "1.60" in Deposit starts at x 23.96 while "100,000.00" starts
// at 22.71. Nearest-header-x therefore mis-filed the small rows: August's two
// rebate credits (1.60 + 0.40) were read as withdrawals (by 0.03 of a unit)
// and its two service charges were read as the balance column and dropped.
// Instead the x's of every money cell on a dated row are clustered across the
// whole document — the three columns fall out as three tight, well-separated
// bands — and each band is tied to its header. Long or short, a cell is then
// classified by the band it sits in.
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

type MoneyColumn = 'deposit' | 'withdrawal' | 'balance'

interface HeaderXs { deposit: number; withdrawal: number; balance: number }

/** Header x's from the first page that carries a transaction table. */
function headerXs(pages: PdfPageItems[]): HeaderXs | null {
  for (const page of pages) {
    let deposit = -1, withdrawal = -1, balance = -1
    for (const item of page.items) {
      const t = item.text.trim().toLowerCase()
      if (t === 'deposit') deposit = item.x
      if (t === 'withdrawal') withdrawal = item.x
      if (t === 'balance') balance = item.x
    }
    if (deposit >= 0 && withdrawal >= 0 && balance >= 0) return { deposit, withdrawal, balance }
  }
  return null
}

/** Sorted x's → bands, split wherever the gap exceeds `gap` units. */
function bandsFromXs(xs: number[], gap = 2): Array<{ lo: number; hi: number }> {
  const sorted = [...xs].sort((a, b) => a - b)
  const bands: Array<{ lo: number; hi: number }> = []
  for (const x of sorted) {
    const last = bands[bands.length - 1]
    if (last && x - last.hi <= gap) last.hi = x
    else bands.push({ lo: x, hi: x })
  }
  return bands
}

/**
 * Build the classifier: cluster every money cell that sits on a dated row and
 * tie each band to a column. Three bands read left→right as deposit /
 * withdrawal / balance; otherwise each band takes the header nearest its left
 * edge (where the column's longest — leftmost-starting — number sits).
 * Falls back to plain nearest-header when there is nothing to cluster.
 */
function buildClassifier(pages: PdfPageItems[], h: HeaderXs): (x: number) => MoneyColumn {
  const xs: number[] = []
  for (const page of pages) {
    for (const row of toRows(page.items)) {
      if (!DATE_RE.test(row[0].text.trim())) continue
      for (const item of row.slice(1)) if (parseNum(item.text) != null) xs.push(item.x)
    }
  }
  const nearest = (x: number): MoneyColumn => {
    const d = Math.abs(x - h.deposit), w = Math.abs(x - h.withdrawal), b = Math.abs(x - h.balance)
    if (d <= w && d <= b) return 'deposit'
    if (w <= b) return 'withdrawal'
    return 'balance'
  }
  const bands = bandsFromXs(xs)
  if (bands.length === 0) return nearest
  const cols: MoneyColumn[] =
    bands.length === 3
      ? ['deposit', 'withdrawal', 'balance']
      : bands.map((b) => nearest(b.lo))
  return (x: number): MoneyColumn => {
    for (let i = 0; i < bands.length; i++) {
      if (x >= bands[i].lo - 0.5 && x <= bands[i].hi + 0.5) return cols[i]
    }
    // Outside every band (a stray cell): nearest band, else nearest header.
    let best = -1, bestDist = Infinity
    for (let i = 0; i < bands.length; i++) {
      const dist = x < bands[i].lo ? bands[i].lo - x : x > bands[i].hi ? x - bands[i].hi : 0
      if (dist < bestDist) { bestDist = dist; best = i }
    }
    return bestDist <= 2 ? cols[best] : nearest(x)
  }
}

export function parseHlbPdf(pages: PdfPageItems[]): PdfParsedStatement | { error: string } {
  const lines: PdfParsedStatement['lines'] = []
  let opening: number | null = null
  let closing: number | null = null
  let skipped = 0

  const headers = headerXs(pages)
  if (!headers) {
    return { error: 'No Deposit / Withdrawal / Balance columns found in the PDF — send this file to Claude to tune the template.' }
  }
  const classify = buildClassifier(pages, headers)

  for (const page of pages) {
    const rows = toRows(page.items)

    // Pages without the transaction table (cover / terms) carry no money cells.
    const hasTable = page.items.some((i) => /^(deposit|withdrawal|balance)$/i.test(i.text.trim()))
    if (!hasTable) continue

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
        error:
          `Parsed movements (RM ${sum.toFixed(2)}) don't tie to the statement's opening→closing change (RM ${expected.toFixed(2)})` +
          (skipped > 0 ? ` — ${skipped} dated row${skipped === 1 ? '' : 's'} had no readable amount` : '') +
          ' — send this file to Claude to tune the template.',
      }
    }
  }

  return { bank: 'hlb', lines, opening, closing, skipped }
}
