/**
 * Pay lines (2026-09-27): what HR adds to a salesperson's month from the salary
 * preview under their ledger on Comm Cal — "他可能有一个 special claim，我就选
 * special claim，然后 key in 金额。这个就是 edit 他的 payroll" (user). A line
 * is a kind, an optional description and an amount.
 *
 * THE KIND IS THE RULE. Special claim, allowance and incentive are EARNINGS:
 * added to gross pay in full — never pro-rated, and outside the statutory wage
 * (no EPF / SOCSO / EIS), the way the non-statutory allowance already is. A
 * deduction comes off TAKE-HOME pay only, like SKBBK: gross, statutory and tax
 * stay where they were.
 *
 * `revenue_pay_lines` is the table and `revenue_save_pay_lines` its one writer;
 * the payroll triggers add the two totals into gross and net (mig
 * 20260927040000), and `lib/revenue-pay.ts` does the same for the preview. This
 * file is the list of kinds, the sums, and the editor's arithmetic — pure, so
 * the rules are tested without a page in the way.
 */

export type PayLineKind = 'special_claim' | 'allowance' | 'incentive' | 'deduction'

export interface PayLineKindDef {
  kind: PayLineKind
  label: string
  /** Comes off take-home pay instead of adding to gross. */
  deduction: boolean
}

/** The dropdown, in its order — the four kinds the table's CHECK allows. */
export const PAY_LINE_KINDS: readonly PayLineKindDef[] = [
  { kind: 'special_claim', label: 'Special claim', deduction: false },
  { kind: 'allowance', label: 'Allowance', deduction: false },
  { kind: 'incentive', label: 'Incentive', deduction: false },
  { kind: 'deduction', label: 'Deduction', deduction: true },
]

/** One line as stored. */
export interface PayLine {
  id: string
  kind: PayLineKind
  description: string | null
  amount: number
  /** Bumped by every save. The editor hands back what it opened, so a save over a newer edit is refused. */
  version: number
}

/** The most a month holds — the RPC refuses more. */
export const MAX_PAY_LINES = 50
/** The table's CHECK on a description. */
export const MAX_DESCRIPTION = 200
const MAX_AMOUNT = 9_999_999_999_999.99

export function isPayLineKind(value: unknown): value is PayLineKind {
  return PAY_LINE_KINDS.some(k => k.kind === value)
}

export function payLineKind(kind: PayLineKind): PayLineKindDef {
  return PAY_LINE_KINDS.find(k => k.kind === kind)!
}

/** What a line reads as on a payslip: "Special claim · Petrol, Penang fair". */
export function payLineLabel(line: { kind: PayLineKind; description: string | null }): string {
  const name = payLineKind(line.kind).label
  return line.description ? `${name} · ${line.description}` : name
}

/**
 * Rows as PostgREST returns them — `amount` is a NUMERIC, so a string. A row
 * that is not a pay line is an error, never a line quietly worth nothing.
 */
export function normalisePayLine(raw: unknown): PayLine & { staffId: string } {
  const row = raw as Record<string, unknown> | null
  const amount = Number(row?.amount)
  if (!row || typeof row.id !== 'string' || typeof row.staff_id !== 'string' || !isPayLineKind(row.kind)
    || !Number.isFinite(amount) || amount <= 0) {
    throw new Error('A pay line could not be read')
  }
  return {
    id: row.id,
    staffId: row.staff_id,
    kind: row.kind,
    description: typeof row.description === 'string' && row.description.trim() ? row.description : null,
    amount,
    version: Number(row.version ?? 1),
  }
}

/** What the lines add to gross, and what they take off take-home pay — to the sen. */
export function payLineTotals(lines: readonly { kind: PayLineKind; amount: number }[]): {
  earnings: number
  deductions: number
} {
  let earnings = 0
  let deductions = 0
  for (const line of lines) {
    const sen = Math.round(line.amount * 100)
    if (payLineKind(line.kind).deduction) deductions += sen
    else earnings += sen
  }
  return { earnings: earnings / 100, deductions: deductions / 100 }
}

/** What the editor opened, the way `revenue_save_pay_lines` checks it. */
export function seenOf(lines: readonly PayLine[]): string[] {
  return lines.map(line => `${line.id}:${line.version}`)
}

// ─── The editor ─────────────────────────────────────────────────────────────

/** One line in the editor, as typed. */
export interface PayLineDraft {
  /** The React key: the line's id, or a made-up one for a new line. */
  key: string
  /** Null for a line not saved yet. */
  id: string | null
  kind: PayLineKind
  description: string
  amount: string
}

/** What the RPC is sent for one line. */
export interface PayLineToSave {
  id: string | null
  kind: PayLineKind
  description: string | null
  amount: number
}

export function draftOf(line: PayLine): PayLineDraft {
  return {
    key: line.id,
    id: line.id,
    kind: line.kind,
    description: line.description ?? '',
    amount: line.amount.toFixed(2),
  }
}

export function newDraft(key: string, kind: PayLineKind = 'special_claim'): PayLineDraft {
  return { key, id: null, kind, description: '', amount: '' }
}

/**
 * "1,234.50" → 1234.5. Null unless it is an amount above 0 to the sen — the
 * table stores two decimals, so a third is refused rather than rounded away.
 */
export function parsePayLineAmount(text: string): number | null {
  const clean = text.trim().replace(/,/g, '')
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) return null
  const value = Number(clean)
  return value > 0 && value <= MAX_AMOUNT ? value : null
}

export type PayLinesCheck =
  | { ok: true; lines: PayLineToSave[] }
  | { ok: false; key: string; message: string }

/** Every draft checked in order; the first problem is named by its line number. */
export function payLinesToSave(drafts: readonly PayLineDraft[]): PayLinesCheck {
  if (drafts.length > MAX_PAY_LINES) {
    return { ok: false, key: drafts[MAX_PAY_LINES].key, message: `A month holds at most ${MAX_PAY_LINES} pay lines.` }
  }
  const lines: PayLineToSave[] = []
  for (const [index, draft] of drafts.entries()) {
    const n = index + 1
    const amount = parsePayLineAmount(draft.amount)
    if (amount === null) {
      return {
        ok: false,
        key: draft.key,
        message: draft.amount.trim()
          ? `Line ${n}: the amount must be more than 0, to the sen.`
          : `Line ${n}: enter an amount.`,
      }
    }
    const description = draft.description.trim()
    if (description.length > MAX_DESCRIPTION) {
      return { ok: false, key: draft.key, message: `Line ${n}: keep the description under ${MAX_DESCRIPTION} characters.` }
    }
    lines.push({ id: draft.id, kind: draft.kind, description: description || null, amount })
  }
  return { ok: true, lines }
}

/** The drafts' totals as they stand — an amount still being typed counts for nothing yet. */
export function draftTotals(drafts: readonly PayLineDraft[]): { earnings: number; deductions: number } {
  return payLineTotals(drafts.flatMap(d => {
    const amount = parsePayLineAmount(d.amount)
    return amount === null ? [] : [{ kind: d.kind, amount }]
  }))
}

/** The drafts' lines that already count, for the preview table. */
export function draftLines(drafts: readonly PayLineDraft[]): Array<{ key: string; kind: PayLineKind; description: string | null; amount: number }> {
  return drafts.flatMap(d => {
    const amount = parsePayLineAmount(d.amount)
    return amount === null ? [] : [{ key: d.key, kind: d.kind, description: d.description.trim() || null, amount }]
  })
}

// ─── What the server action accepts ─────────────────────────────────────────

/** One save: a person's whole month of lines, and what the editor opened. */
export interface SavePayLinesInput {
  staffId: string
  /** The first of the month, e.g. 2026-09-01. */
  period: string
  lines: PayLineToSave[]
  /** `seenOf` the lines the editor opened. */
  seen: string[]
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * The shape a browser may send. The rules that matter — who, which month, a
 * stale editor — are the RPC's; this only refuses what could not be a save.
 */
export function checkSavePayLines(input: SavePayLinesInput): SavePayLinesInput {
  if (!input || typeof input.staffId !== 'string' || !UUID.test(input.staffId)) throw new Error('Choose a salesperson.')
  if (typeof input.period !== 'string' || !/^\d{4}-\d{2}-01$/.test(input.period)) {
    throw new Error('Pay lines belong to the first of a month, e.g. 2026-09-01.')
  }
  if (!Array.isArray(input.lines) || input.lines.length > MAX_PAY_LINES) {
    throw new Error(`A month holds at most ${MAX_PAY_LINES} pay lines.`)
  }
  if (!Array.isArray(input.seen) || input.seen.some(token => typeof token !== 'string')) {
    throw new Error('Reload the page and try again.')
  }
  const lines = input.lines.map((line, index) => {
    const amount = line?.amount
    // To the sen, allowing for binary floats (0.29 × 100 is 28.999…).
    if (!line || !isPayLineKind(line.kind) || typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0
      || Math.abs(Math.round(amount * 100) - amount * 100) > 1e-6 || amount > MAX_AMOUNT
      || (line.id !== null && (typeof line.id !== 'string' || !UUID.test(line.id)))
      || (line.description !== null && (typeof line.description !== 'string' || line.description.length > MAX_DESCRIPTION))) {
      throw new Error(`Line ${index + 1} is not complete.`)
    }
    return { id: line.id, kind: line.kind, description: line.description?.trim() || null, amount }
  })
  return { staffId: input.staffId, period: input.period, lines, seen: input.seen }
}

/** Whether saving the drafts would change anything stored. */
export function draftsDiffer(drafts: readonly PayLineDraft[], lines: readonly PayLine[]): boolean {
  if (drafts.length !== lines.length) return true
  return drafts.some((draft, index) => {
    const line = lines[index]
    return draft.id !== line.id
      || draft.kind !== line.kind
      || (draft.description.trim() || null) !== line.description
      || parsePayLineAmount(draft.amount) !== line.amount
  })
}
