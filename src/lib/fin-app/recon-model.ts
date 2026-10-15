// Daily › Reconciliation in the Finance phone app (2026-10-15, part 5c — a
// page the design does not draw, in its style): the desktop page's banks
// against the GL and its saved months (`readReconHub`) as a hub; a month as its
// page, as the review page reads it (`readReconSession`) — where the statement
// stands against the GL, what is matched, contra'd and ignored, and the lines
// still open on either side, to match on their own screen; its report as the
// report page builds it (`fetchReconReport`). Pure.

import type { HubCardItem } from '@/components/finv/Hub'
import type { ReconBank, ReconSessionRead, ReconSessionRow } from '@/app/(portal)/reconciliation/_lib/recon-read'
import type { ReconReportData } from '@/lib/recon-report-data'
import type { ReconReportItem } from '@/lib/recon-report'
import { dayWords, f2, monthWords, plural, r2, rm } from './page-model'

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const dayMon = (iso: string) => `${Number(iso.slice(8, 10))} ${MON[Number(iso.slice(5, 7)) - 1]}`
/** A signed statement or book amount as the review page writes it: money in +, money out −. */
export const signed = (n: number) => `${n < 0 ? '−' : '+'}${f2(Math.abs(n))}`
const toneOf = (n: number): 'ledger' | 'out' => (n < 0 ? 'out' : 'ledger')

export const SESSIONS_CARD = 'sessions'

export interface ReconListRow {
  id: string
  title: string
  desc: string
  amount: string
}

export interface ReconHubModel {
  hero: { value: string; label: string }
  chip: { text: string; tone: 'ledger' | 'danger' } | null
  cards: HubCardItem[]
  /** A card's list: a bank's months, or every month — open first. */
  lists: Record<string, { title: string; groups: Array<{ title: string; rows: ReconListRow[] }> }>
}

const sessionRow = (s: ReconSessionRow, withBank: boolean): ReconListRow => ({
  id: s.id,
  title: monthWords(s.periodMonth.slice(0, 7)),
  desc: [withBank ? s.bank : null, s.status === 'done' ? 'Done' : 'Open', s.file].filter(Boolean).join(' · '),
  amount: `${s.cleared}/${s.total}`,
})

export function reconHubModel(banks: ReconBank[], sessions: ReconSessionRow[]): ReconHubModel {
  const diffs = banks.map((b) => ({ b, diff: r2(Number(b.current_balance) - b.gl) }))
  const off = diffs.filter((x) => x.diff !== 0)
  const offTotal = r2(off.reduce((t, x) => t + Math.abs(x.diff), 0))
  const open = sessions.filter((s) => s.status !== 'done')
  const done = sessions.filter((s) => s.status === 'done')
  const split = (list: ReconSessionRow[], withBank: boolean) =>
    [
      { title: 'Open', rows: list.filter((s) => s.status !== 'done').map((s) => sessionRow(s, withBank)) },
      { title: 'Done', rows: list.filter((s) => s.status === 'done').map((s) => sessionRow(s, withBank)) },
    ].filter((g, i) => i === 0 || g.rows.length > 0)

  const lists: ReconHubModel['lists'] = {}
  for (const { b } of diffs) lists[b.id] = { title: b.bank_name, groups: split(sessions.filter((s) => s.bankId === b.id), false) }
  lists[SESSIONS_CARD] = { title: 'Monthly reconciliations', groups: split(sessions, true) }

  return {
    hero: off.length === 0 ? { value: '✓ Ties to GL', label: `Bank vs GL · ${plural(banks.length, 'bank', 'banks')}` } : { value: rm(offTotal), label: `Off · bank vs GL · ${plural(off.length, 'bank', 'banks')}` },
    chip: banks.length === 0 ? null : off.length === 0 ? { text: 'Every bank ties', tone: 'ledger' } : { text: `${plural(off.length, 'bank', 'banks')} off`, tone: 'danger' },
    cards: [
      ...diffs.map(({ b, diff }) => ({
        key: b.id,
        tone: diff === 0 ? ('paid' as const) : ('approved' as const),
        icon: 'approve' as const,
        label: `${b.bank_name} · bank vs GL`,
        sub: `Cache ${f2(Number(b.current_balance))} · GL ${f2(b.gl)}`,
        value: diff === 0 ? '✓ Ties to GL' : rm(diff),
      })),
      { key: SESSIONS_CARD, tone: 'all', icon: 'calendar', label: 'Monthly reconciliations', sub: `${open.length} open · ${done.length} done`, value: plural(sessions.length, 'session', 'sessions') },
    ],
    lists,
  }
}

// ── A month as its page ────────────────────────────────────────────────────

export interface ReconLine {
  id: string
  date: string
  description: string
  amount: number
}
export interface ReconBookLine extends ReconLine {
  entryNo: string
  /** Before the statement month: a prior month's item still in transit. */
  earlier: boolean
}

export interface ReconGroupView {
  id: string
  /** Its first statement line — Unmatch takes the line's groups away. */
  lineId: string | null
  label: string
  sub: string
  amount: number
  statement: ReconLine[]
  books: ReconBookLine[]
}

export interface ReconSessionModel {
  id: string
  bank: string
  glCode: string
  /** First day of the statement month. */
  monthStart: string
  month: string
  status: 'open' | 'done'
  file: string | null
  hero: { amount: string; to: string; note: string; light: 'ledger' | 'danger' | 'def' }
  summary: Array<{ label: string; value: string; sub?: string; mono?: boolean; tone?: 'ledger' | 'wait' | 'muted' }>
  counts: { cleared: number; total: number; open: number; bookOpen: number; bookEarlier: number }
  matched: ReconGroupView[]
  contra: ReconGroupView[]
  ignored: ReconLine[]
  open: ReconLine[]
  book: ReconBookLine[]
  /** Reconciliation's Edit (match, contra, ignore, unmatch, delete) and Approve (done / reopen), on the page's boxes. */
  can: { edit: boolean; approve: boolean }
}

export function reconSessionModel(read: ReconSessionRead, can: { edit: boolean; approve: boolean }): ReconSessionModel {
  const { session, bank, statementLines } = read
  const monthStart = session.period_month
  const lineById = new Map(statementLines.map((l) => [l.id, l]))
  const line = (l: { id: string; date: string; description: string; amount: number }): ReconLine => ({ id: l.id, date: l.date, description: l.description, amount: l.amount })
  const book = (id: string): ReconBookLine | null => {
    const b = read.bookInfo[id]
    return b ? { id: b.id, date: b.date, entryNo: b.entryNo, description: b.description, amount: b.amount, earlier: b.date < monthStart } : null
  }
  const matched = statementLines.filter((l) => l.matchKind === 'auto' || l.matchKind === 'manual')
  const ignored = statementLines.filter((l) => l.matchKind === 'ignored')
  const contraS = statementLines.filter((l) => l.matchKind === 'contra')
  const open = statementLines.filter((l) => l.matchKind == null)
  const bookOpen = read.unmatchedBook.map((b) => ({ ...b, earlier: b.date < monthStart }))
  const totalIn = r2(statementLines.filter((l) => l.amount > 0).reduce((s, l) => s + l.amount, 0))
  const totalOut = r2(statementLines.filter((l) => l.amount < 0).reduce((s, l) => s + l.amount, 0))

  const closing = session.statement_closing
  const tie = closing != null && Math.abs(read.glClosing - closing) <= 0.005
  const groups: ReconGroupView[] = read.groups.map((g) => {
    const st = g.statementLineIds.map((id) => lineById.get(id)).filter((l): l is NonNullable<typeof l> => !!l)
    const books = g.journalLineIds.map(book).filter((b): b is ReconBookLine => !!b)
    const how = st[0]?.matchKind ?? 'manual'
    const first = st[0]
    return {
      id: g.id,
      lineId: first?.id ?? null,
      label: first ? `${first.description || '—'}${st.length > 1 ? ` + ${st.length - 1} more` : ''}` : '—',
      sub: [first ? dayMon(first.date) : null, `${how}${st.length > 1 || books.length > 1 ? ` · ${st.length}↔${books.length}` : ''}`, plural(books.length, 'book entry', 'book entries')].filter(Boolean).join(' · '),
      amount: r2(st.reduce((s, l) => s + l.amount, 0)),
      statement: st.map(line),
      books,
    }
  })
  const contra: ReconGroupView[] = [
    ...read.contraGroups.map((g) => {
      const books = g.journalLineIds.map(book).filter((b): b is ReconBookLine => !!b)
      return {
        id: g.id,
        lineId: null,
        label: books[0] ? `${books[0].description || books[0].entryNo}${books.length > 1 ? ` + ${books.length - 1} more` : ''}` : '—',
        sub: `Book contra · no bank movement · ${plural(books.length, 'line', 'lines')}`,
        amount: r2(books.reduce((s, b) => s + b.amount, 0)),
        statement: [],
        books,
      }
    }),
    ...read.statementContraGroups.map((g) => {
      const st = g.statementLineIds.map((id) => lineById.get(id)).filter((l): l is NonNullable<typeof l> => !!l)
      return {
        id: g.id,
        lineId: null,
        label: st[0] ? `${st[0].description || '—'}${st.length > 1 ? ` + ${st.length - 1} more` : ''}` : '—',
        sub: `Statement contra · bank charge waived · ${plural(st.length, 'line', 'lines')}`,
        amount: r2(st.reduce((s, l) => s + l.amount, 0)),
        statement: st.map(line),
        books: [],
      }
    }),
  ]
  const earlier = bookOpen.filter((b) => b.earlier).length

  return {
    id: session.id,
    bank: bank.bank_name,
    glCode: bank.gl_account_code,
    monthStart,
    month: monthWords(monthStart.slice(0, 7)),
    status: session.status === 'done' ? 'done' : 'open',
    file: session.source_filename,
    hero: {
      amount: closing != null ? rm(closing) : '—',
      to: `${bank.bank_name} · GL ${bank.gl_account_code}`,
      note: closing == null ? `GL ${f2(read.glClosing)} · no statement closing on file` : tie ? `✓ Ties to GL ${f2(read.glClosing)}` : `Off by ${f2(r2(closing - read.glClosing))} · GL ${f2(read.glClosing)}`,
      light: closing == null ? 'def' : tie ? 'ledger' : 'danger',
    },
    summary: [
      ...(session.statement_opening != null && closing != null ? [{ label: 'Statement', value: `${f2(session.statement_opening)} → ${f2(closing)}`, mono: true }] : []),
      { label: 'GL at month-end', value: f2(read.glClosing), mono: true, sub: closing == null ? undefined : tie ? '✓ tie' : `diff ${f2(r2(closing - read.glClosing))}` },
      { label: 'In · out', value: `${f2(totalIn)} · ${f2(Math.abs(totalOut))}`, mono: true },
      {
        label: 'Cleared',
        value: `${matched.length + ignored.length + contraS.length} / ${statementLines.length}`,
        mono: true,
        sub: ignored.length + contraS.length > 0 ? [`${matched.length} matched`, contraS.length > 0 ? `${contraS.length} contra` : null, ignored.length > 0 ? `${ignored.length} ignored` : null].filter(Boolean).join(' · ') : undefined,
      },
      { label: 'Statement unmatched', value: String(open.length), mono: true, tone: open.length > 0 ? 'wait' : undefined },
      { label: 'Book unmatched', value: String(bookOpen.length - earlier), mono: true, sub: earlier > 0 ? `+${earlier} earlier` : undefined, tone: bookOpen.length - earlier > 0 ? 'wait' : undefined },
      ...(session.source_filename ? [{ label: 'Statement file', value: session.source_filename }] : []),
    ],
    counts: { cleared: matched.length + ignored.length + contraS.length, total: statementLines.length, open: open.length, bookOpen: bookOpen.length - earlier, bookEarlier: earlier },
    matched: groups,
    contra,
    ignored: ignored.map(line),
    open: open.map(line),
    book: bookOpen,
    can,
  }
}

// ── Matching on the phone: what the ticked lines add up to ─────────────────

export interface MatchState {
  sCount: number
  bCount: number
  sSum: number
  bSum: number
  /** Both sides ticked and their sums equal: Match. */
  canMatch: boolean
  /** Only book lines, two or more, summing to nothing: a book contra. */
  canContraBook: boolean
  /** Only statement lines, two or more, summing to nothing: a statement contra. */
  canContraStatement: boolean
  /** Only statement lines: each can be ignored. */
  canIgnore: boolean
  /** The sums in the review page's words. */
  words: string
}

export function matchState(open: ReconLine[], book: ReconLine[], selS: ReadonlySet<string>, selB: ReadonlySet<string>): MatchState {
  const s = open.filter((l) => selS.has(l.id))
  const b = book.filter((l) => selB.has(l.id))
  const sSum = r2(s.reduce((t, l) => t + l.amount, 0))
  const bSum = r2(b.reduce((t, l) => t + l.amount, 0))
  const equal = s.length > 0 && b.length > 0 && Math.abs(sSum - bSum) <= 0.005
  const parts = [
    s.length > 0 ? `Statement Σ (${s.length}) ${signed(sSum)}` : null,
    b.length > 0 ? `Book Σ (${b.length}) ${signed(bSum)}` : null,
  ].filter(Boolean)
  const words =
    parts.length === 0
      ? 'Nothing ticked'
      : `${parts.join(' · ')}${s.length > 0 && b.length > 0 ? (equal ? ' ✓' : ` · off by ${f2(Math.abs(r2(sSum - bSum)))}`) : ''}`
  return {
    sCount: s.length,
    bCount: b.length,
    sSum,
    bSum,
    canMatch: equal,
    canContraBook: s.length === 0 && b.length >= 2 && Math.abs(bSum) <= 0.005,
    canContraStatement: b.length === 0 && s.length >= 2 && Math.abs(sSum) <= 0.005,
    canIgnore: s.length > 0 && b.length === 0,
    words,
  }
}

// ── The month's report ─────────────────────────────────────────────────────

export interface ReconReportView {
  title: string
  sub: string
  walk: Array<{ label: string; value: string; strong?: boolean }>
  verdict: { text: string; tone: 'ledger' | 'danger' | 'muted' }
  parts: Array<{ title: string; rows: Array<{ label: string; sub: string; value: string; tone: 'ledger' | 'out' }> }>
  files: Array<{ key: string; label: string; href: string; format: 'pdf' | 'xlsx' }>
}

const money = (n: number | null) => (n == null ? '—' : n < 0 ? `(${f2(-n)})` : f2(n))

export function reconReportModel(r: ReconReportData): ReconReportView {
  const m = r.model
  const end = dayWords(m.monthEnd)
  const item = (i: ReconReportItem) => ({ label: i.description || '—', sub: `${dayWords(i.date)}${i.ref ? ` · ${i.ref}` : ''}${i.ignored ? ' · ignored' : ''}`, value: money(i.amount), tone: toneOf(i.amount) })
  return {
    title: r.bankName,
    sub: [r.accountNumber, `GL ${r.glCode}`, r.sourceFilename, `status ${r.status}`].filter(Boolean).join(' · '),
    walk: [
      { label: `Balance per bank statement (${end})`, value: money(m.statementClosing) },
      { label: `Add · outstanding receipts not yet banked (${m.outstandingReceipts.length})`, value: money(m.sums.bookReceipts) },
      { label: `Less · outstanding payments not yet presented (${m.outstandingPayments.length})`, value: money(m.sums.bookPayments) },
      { label: `Less · receipts in bank not in books (${m.stmtReceiptsNotInBooks.length})`, value: money(-m.sums.stmtReceipts) },
      { label: `Add · payments in bank not in books (${m.stmtPaymentsNotInBooks.length})`, value: money(-m.sums.stmtPayments) },
      { label: 'Adjusted balance', value: money(m.adjustedBank), strong: true },
      { label: `Balance per GL ${r.glCode} (${end})`, value: money(m.glClosing), strong: true },
    ],
    verdict: m.tie
      ? { text: '✓ Reconciled — statement ties to GL', tone: 'ledger' }
      : m.diff == null
        ? { text: 'No statement closing balance on this session', tone: 'muted' }
        : { text: `✗ Off by ${money(m.diff)}`, tone: 'danger' },
    parts: [
      { title: 'Outstanding payments — in books, not yet presented', rows: m.outstandingPayments.map(item) },
      { title: 'Outstanding receipts — in books, not yet banked', rows: m.outstandingReceipts.map(item) },
      { title: 'Bank payments not in books', rows: m.stmtPaymentsNotInBooks.map(item) },
      { title: 'Bank receipts not in books', rows: m.stmtReceiptsNotInBooks.map(item) },
    ].filter((p) => p.rows.length > 0),
    files: [
      { key: 'pdf', label: 'Export PDF', href: `/reconciliation/${r.sessionId}/report/export?format=pdf`, format: 'pdf' },
      { key: 'xlsx', label: 'Export Excel', href: `/reconciliation/${r.sessionId}/report/export?format=xlsx`, format: 'xlsx' },
    ],
  }
}
