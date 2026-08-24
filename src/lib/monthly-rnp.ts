// Monthly Receipt & Payment — the rows the cash matrix doesn't have, shared
// by the page and the export route so screen and file can never drift:
//   开单/收回/月末未收 (per-month 3030 movements + running balance), the
//   per-debtor split (positive balances only) and 部门总资金 (closing cash +
//   outstanding). The 支出对象 paid-to breakdown was REMOVED on request
//   (user 2026-08-24: "我只是要还没收回的就好") — the user's read is
//   receivables; the by-account outflow sections above already cover spend.

import dayjs from 'dayjs'
import { applyGlRefs, type GlLine, type GlRefs } from './gl-reports'
import type { MatrixRow } from './monthly-matrix'

const AR_CODE = '3030'
const r2 = (n: number) => Math.round(n * 100) / 100

export interface RnpExtrasInput {
  /** RAW journal lines (fetchAllJournalLines) — NOT ref-applied. */
  lines: GlLine[]
  glRefs: GlRefs
  /** voucher id → payee (voucher_party_refs RPC), both directions. */
  payeeByVoucherId: Map<string, string>
  /** company full name → short code, to unify invoice/receipt party keys. */
  shortByName: Map<string, string>
  months: string[]
  accPeriod: { from: string; to: string }
  segList: string[] | undefined
  closingByCol: number[]
}

export function buildRnpMatrixRows(i: RnpExtrasInput): MatrixRow[] {
  const inSeg = (l: GlLine) => !i.segList || i.segList.includes(l.segment)
  const monthEnd = (ym: string) => dayjs(`${ym}-01`).endOf('month').format('YYYY-MM-DD')

  // ── Receivables (3030, ref-applied for party attribution) ─────────────────
  const arLines = applyGlRefs(
    i.lines.filter((l) => l.account_code === AR_CODE && inSeg(l)),
    i.glRefs,
  )
  const billedInMonth = (ym: string) =>
    r2(arLines.filter((l) => l.date.startsWith(ym)).reduce((s, l) => s + Number(l.debit ?? 0), 0))
  const collectedInMonth = (ym: string) =>
    r2(arLines.filter((l) => l.date.startsWith(ym)).reduce((s, l) => s + Number(l.credit ?? 0), 0))
  const balanceAt = (toDate: string) =>
    r2(
      arLines
        .filter((l) => l.date <= toDate)
        .reduce((s, l) => s + Number(l.debit ?? 0) - Number(l.credit ?? 0), 0),
    )

  const billedByCol = [
    r2(i.months.reduce((s, ym) => s + billedInMonth(ym), 0)),
    ...i.months.map(billedInMonth),
  ]
  const collectedByCol = [
    r2(i.months.reduce((s, ym) => s + collectedInMonth(ym), 0)),
    ...i.months.map(collectedInMonth),
  ]
  const outstandingByCol = [balanceAt(i.accPeriod.to), ...i.months.map((ym) => balanceAt(monthEnd(ym)))]

  const partyOf = (l: GlLine) => {
    const raw =
      (l as GlLine & { party?: string | null }).party ??
      (l.ref_type === 'payment_voucher' || l.ref_type === 'payment_voucher_void'
        ? (l.ref_id ? i.payeeByVoucherId.get(l.ref_id) ?? null : null)
        : null)
    if (!raw) return '未标示 · Unattributed'
    return i.shortByName.get(raw) ?? raw
  }
  const parties = [...new Set(arLines.map(partyOf))]
  const partyBalanceAt = (p: string, toDate: string) =>
    r2(
      arLines
        .filter((l) => partyOf(l) === p && l.date <= toDate)
        .reduce((s, l) => s + Number(l.debit ?? 0) - Number(l.credit ?? 0), 0),
    )
  const partyRows: MatrixRow[] = parties
    .map((p) => ({
      p,
      values: [partyBalanceAt(p, i.accPeriod.to), ...i.months.map((ym) => partyBalanceAt(p, monthEnd(ym)))],
    }))
    // 只看还没收回的: only debtors whose accumulated balance is still positive.
    .filter((r) => r.values[0] > 0.005)
    .sort((a, b) => b.values[0] - a.values[0])
    .map((r) => ({
      key: `AR_P_${r.p}`,
      label: r.p,
      depth: 1,
      kind: 'account' as const,
      values: r.values,
    }))

  return [
    { key: 'AR_BILLED', label: '开单 · Billed (应收 ↑)', depth: 0, kind: 'subtotal', tone: 'ledger', values: billedByCol },
    { key: 'AR_COLLECTED', label: '收回/CN · Collected (应收 ↓)', depth: 0, kind: 'subtotal', tone: 'auto', values: collectedByCol.map((v) => -v) },
    { key: 'AR_OUTSTANDING', label: '月末未收 · Outstanding (AR balance)', depth: 0, kind: 'subtotal', tone: 'danger', emphasis: 'strong', values: outstandingByCol },
    ...partyRows,
    {
      key: 'TOTAL_POSITION',
      label: '部门总资金 · Cash + 未收 (Total position)',
      depth: 0,
      kind: 'subtotal',
      tone: 'ledger',
      emphasis: 'strong',
      values: i.closingByCol.map((c, idx) => r2(c + (outstandingByCol[idx] ?? 0))),
    },
  ]
}
