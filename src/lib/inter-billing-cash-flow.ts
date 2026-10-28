// Inter-billing / own-share → cash-flow bridge.
//
// Internal cost reallocations between a department and Venture (Office) settle
// ONLY in the dept_pools management ledger — a conceptual cash transfer within
// the Hong Leong bank, with NO GL journal entry (there is no real bank movement;
// HV's cash is commingled). So the GL-driven Cash Flow, read from journal_lines,
// can't see them — a segment's closing cash comes out equal to its raw GL bank
// slice, diverging from its Dept Pool balance by the net it reallocated.
//
// Every reallocation is recorded as a PAIR sharing one `HV-OR-…` PV reference:
//   payer   : dept_pools `inter_billing_out`  (−, its slice down)
//   receiver: dept_pools `np_in`              (+, its slice up)
// Both directions occur — a dept paying Venture (Office) its share (inter-billing)
// AND Venture (Office) paying a dept back its own share (own-share). So the PAYER
// is always the `inter_billing_out` row (which may be a real dept OR Venture
// Office), and the RECEIVER is the `np_in` row carrying the same PV ref.
//
// To make each segment's Cash Flow tie to its Dept Pool, we feed SYNTHETIC lines
// into buildCashFlow — for each side, a bank leg + a Financing "Inter-billing"
// leg. These exist only in the report computation (never the GL); payer and
// receiver net to zero, so the consolidated (all-segments) Cash Flow is unchanged
// while each single-segment view now closes at its Dept Pool balance. This
// mirrors how an in-house-bank participant's cash flow carries a "transfer
// to/from the in-house bank" financing line.

import type { CoaAccount, GlLine } from './gl-reports'
import type { CashFlowLayout } from './cash-flow-custom'
import type { SupabaseClient } from '@supabase/supabase-js'
import { primedNameToSegment } from './dept-registry'
import { fetchAllRows, fetchAllRowsAsWritten } from './paginate'

/** Pseudo account code for the synthetic Financing transfer legs. */
export const INTERBILL_TRANSFER_CODE = 'IB-XFER'

/** Pseudo COA account so buildCashFlow files the transfer under Financing. */
export const interBillTransferAccount: CoaAccount = {
  code: INTERBILL_TRANSFER_CODE,
  name: 'Inter-billing (internal transfer)',
  type: 'equity', // unused for cash flow — cash_flow_category drives categorisation
  parent_code: null,
  cash_flow_category: 'financing',
}

/** Mig 20260721: payroll funding is a dept_pools-only reallocation too — each
 *  department hands its contribution to HR custody with NO per-dept GL bank
 *  line (only one hr-segment staging JE). Same bridge treatment, its own
 *  Financing line so the report reads "transfer to HR payroll custody". */
export const PAYROLL_XFER_CODE = 'PY-XFER'
/** Real COA account the PAYING dept's payroll funding shows up as in its cash
 *  flow. 4070 'Accrual - Salary' — the SAME row the pre-July per-segment
 *  salary payments cleared — so the salary series reads as ONE continuous
 *  line across the flow change (user 2026-08-20: "salary 分开了，不能做一起
 *  吗?"; it previously landed on 9030 Salary Expense, splitting the report
 *  into two salary blocks). Note the funding drain is the dept's FULL CTC
 *  contribution (salary + statutory), so from July the 4070 row carries the
 *  whole packet while the 4071-4074 component rows simply end. Revenue's
 *  rounds are split by account instead (below, 2026-10-22). */
export const PAYROLL_EXPENSE_CODE = '4070'

/** The department whose rounds to HR show by account (2026-10-22 — the user:
 *  "我从revenue 的pool 交给hr 不能让他也跟着科目分开?" → "可以，只改 Revenue"):
 *  its months before HR paid them (Aug, Sep) were Finance's own vouchers, by
 *  account; every other department keeps the one 4070 row. */
const SPLIT_PAYROLL_SEGMENT = 'revenue_department'
/** Commission & Allowances takes what the accrual books net — the pay-line
 *  deductions (the user: "那就remain 扣在commission & allowance") — and the cents. */
const PAYROLL_REST_CODE = '9093'
const MONTH_NO: Record<string, string> = { Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06', Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12' }

/** The month a round to HR pays for, off its pool row ("PV HV-PV-…: Payroll bank transfer — Sep 2026"): `2026-09`. */
export function payrollMonthOf(description: string | null | undefined): string | null {
  const m = /—\s*([A-Z][a-z]{2})[a-z]*\s+(\d{4})/.exec(description ?? '')
  const mm = m ? MONTH_NO[m[1]] : undefined
  return m && mm ? `${m[2]}-${mm}` : null
}

/**
 * A round to HR split the way its month's accrual splits the pay: each account
 * but Commission & Allowances takes its share — its accrual figure × the round
 * ÷ what the month's rounds come to — and Commission & Allowances the rest.
 * Null (one 4070 line, as before) without an accrual, or when the shares would
 * come to more than the round.
 */
export function splitPayrollDrain(
  drain: number,
  funded: number,
  accrual: Readonly<Record<string, number>>,
): { code: string; amount: number }[] | null {
  const codes = Object.keys(accrual).filter((c) => (accrual[c] ?? 0) > 0).sort()
  if (codes.length === 0 || !(drain > 0) || !(funded > 0)) return null
  const parts = codes.filter((c) => c !== PAYROLL_REST_CODE).map((code) => ({ code, amount: round2((accrual[code] * drain) / funded) }))
  const rest = round2(drain - parts.reduce((s, p) => s + p.amount, 0))
  if (rest < 0) return null
  return [...parts, { code: PAYROLL_REST_CODE, amount: rest }].filter((p) => p.amount > 0).sort((a, b) => a.code.localeCompare(b.code))
}

export const payrollCustodyAccount: CoaAccount = {
  code: PAYROLL_XFER_CODE,
  name: 'Payroll custody (internal transfer)',
  type: 'equity',
  parent_code: null,
  cash_flow_category: 'financing',
}

/**
 * Slot the synthetic transfer account into a custom cash-flow layout's Financing
 * category, so the monthly (custom-layout) report files it under Financing
 * Activities instead of the red "Unassigned" bucket (a saved layout can't know a
 * synthetic code). Applied at render time — never mutates the stored layout.
 */
export function ensureInterBillCategory(layout: CashFlowLayout): CashFlowLayout {
  const codes = [INTERBILL_TRANSFER_CODE, PAYROLL_XFER_CODE]
  const missing = codes.filter(
    (code) => !layout.categories.some((c) => c.accounts.includes(code)),
  )
  if (missing.length === 0) return layout
  const cats = layout.categories.map((c) => ({ ...c, accounts: [...c.accounts] }))
  const fin = cats.find((c) => c.id === 'financing') ?? cats.find((c) => /financing/i.test(c.name))
  if (fin) fin.accounts.push(...missing)
  else cats.push({ id: 'financing', name: 'Financing Activities', accounts: [...missing] })
  return { categories: cats }
}

// Dept name → GL segment. Venture Office (the internal-bank hub) is 'corporate'.
const DEPT_TO_SEGMENT: Record<string, string> = {
  Marketing: 'marketing',
  HR: 'hr',
  Finance: 'finance',
  'Director Office': 'director_office',
  Director: 'director',
  'Venture Office': 'corporate',
}

const PVREF = /HV-OR-\d+-\d+/
const PVREF_PV = /HV-PV-\d+-\d+/

function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100
}

export interface TransferSide {
  deptName: string
  amount: number
  date: string // YYYY-MM-DD (settle date)
  direction: 'out' | 'in'
  /** Which internal-transfer flavour this side belongs to (drives the pseudo
   *  Financing account + line labels). Default: 'interbill'. */
  kind?: 'interbill' | 'payroll'
  /** Real COA expense account this slice represents on the PAYING side —
   *  9094 Office Rental, 9091 Water & Electricity, 9030 Salary… (user
   *  2026-07-30: "marketing 的 internal transfer 就是 payroll 和 rental,不能
   *  直接显示成相对应的 account 的费用?"). Taken from the settle voucher's
   *  mirror rows, which carry the nature since the 2026-07-24 by-nature
   *  change. Absent → falls back to the IB-XFER / PY-XFER pseudo account. */
  natureCode?: string
  /** The source dept_pools row's own description (e.g. "PV HV-OR-…: Notion
   *  Claim … [dept_pool_marketing]") — appended to the drill-down label so
   *  the user can see WHAT each transfer actually was (user 2026-08-24:
   *  "展开时可以show description?"). */
  sourceDesc?: string | null
}

/** Collapse newlines, trim the trailing " [pool tag]" and leading "PV ", cap
 *  length — the pool description is written for the ledger, not a report row. */
function cleanSourceDesc(d: string | null | undefined): string {
  if (!d) return ''
  const oneLine = d.replace(/\s+/g, ' ').trim().replace(/\s*\[[^\]]*\]\s*$/, '').replace(/^PV\s+/, '')
  return oneLine.length > 140 ? `${oneLine.slice(0, 137)}…` : oneLine
}

function mkLine(
  entry_id: string,
  account_code: string,
  debit: number,
  credit: number,
  date: string,
  segment: string,
  description: string,
): GlLine {
  return {
    account_code,
    debit,
    credit,
    description,
    entry_id,
    date,
    entry_no: null,
    entry_description: description,
    segment,
    ref_type: 'inter_billing_transfer',
    ref_id: null,
    party: null,
  }
}

/**
 * Pure: turn reallocation sides into synthetic cash-flow lines. Each side is a
 * self-balancing 2-leg entry (bank + Financing transfer) tagged its segment;
 * 'out' drops that segment's cash, 'in' raises it.
 */
export function buildInterBillingCashFlowLines(sides: TransferSide[], bankCode: string): GlLine[] {
  const lines: GlLine[] = []
  let i = 0
  for (const s of sides) {
    const seg = DEPT_TO_SEGMENT[s.deptName] ?? primedNameToSegment()[s.deptName]
    const amt = round2(s.amount)
    const date = (s.date ?? '').slice(0, 10)
    if (!seg || !(amt > 0) || !date) continue
    const payroll = s.kind === 'payroll'
    const xferCode = payroll ? PAYROLL_XFER_CODE : INTERBILL_TRANSFER_CODE
    const id = `${payroll ? 'pyx' : 'ibx'}-${s.direction}-${i++}`
    const src = cleanSourceDesc(s.sourceDesc)
    const suffix = src ? ` · ${src}` : ''
    if (s.direction === 'out') {
      // Paying side lands on the REAL expense account when we know the nature,
      // so a dept's cash flow reads "Office Rental / Salary" instead of a
      // generic internal-transfer line. Receiving side keeps the pseudo
      // account — "recharge received" has no natural expense code.
      const outCode = s.natureCode ?? xferCode
      lines.push(
        mkLine(id, bankCode, 0, amt, date, seg,
          payroll ? 'Transfer to HR payroll custody' : 'Inter-billing transfer out'),
        mkLine(id, outCode, amt, 0, date, seg,
          (payroll ? `Payroll share — ${s.deptName}` : `Inter-billing paid — ${s.deptName}`) + suffix),
      )
    } else {
      lines.push(
        mkLine(id, bankCode, amt, 0, date, seg,
          payroll ? 'Payroll custody received' : 'Inter-billing transfer in'),
        mkLine(id, xferCode, 0, amt, date, seg,
          (payroll ? `Payroll custody received — ${s.deptName}` : `Inter-billing received — ${s.deptName}`) + suffix),
      )
    }
  }
  return lines
}

interface PoolRow {
  amount: number | null
  created_at: string | null
  description: string | null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  departments: any
}

/**
 * Fetch reallocation settles and return synthetic cash-flow lines + the pseudo
 * account. Payer = every `inter_billing_out`; receiver = the `np_in` carrying the
 * same `HV-OR-…` PV ref (which excludes ordinary external receipts). Resilient:
 * on any read error it returns no lines, so the Cash Flow still renders (just
 * un-adjusted, as before).
 *
 * `bankCodes` may be the page's own pending read (2026-10-08): none of the
 * reads below needs it — only the synthetic lines' bank leg does — so they all
 * start at once, beside the page's journal read, instead of after it.
 *
 * Every row of every read (2026-10-08): the pool reads are whole-history and
 * PostgREST stops an unranged read at 1000 rows without a word — the rounds
 * past it would silently drop out of every segment's cash. The pool reads go
 * out as written while they fit (fetchAllRowsAsWritten): the sides below
 * follow the rows' order, and so does a same-day drill-down. A capped answer
 * is read again in pages, in ledger order (`created_at`, `id`).
 */
export async function fetchInterBillingCashFlow(
  supabase: SupabaseClient,
  bankCodes: ReadonlySet<string> | PromiseLike<ReadonlySet<string>>,
): Promise<{ lines: GlLine[]; account: CoaAccount; payrollAccount: CoaAccount }> {
  try {
    const POOL_COLUMNS = 'amount, created_at, description, departments!inner(name)'
    const [payRead, recRead, custodyRead, fundRead, voidedRows, flagsRes, mirrorRes, accrualRead] = await Promise.all([
      fetchAllRowsAsWritten((page) => {
        const q = supabase.from('dept_pools').select(POOL_COLUMNS).eq('transaction_type', 'inter_billing_out')
        return page ? q.order('created_at').order('id').range(page.from, page.to) : q
      }),
      fetchAllRowsAsWritten((page) => {
        const q = supabase
          .from('dept_pools')
          .select(POOL_COLUMNS)
          .eq('transaction_type', 'np_in')
          .like('description', 'PV HV-OR-%')
        return page ? q.order('created_at').order('id').range(page.from, page.to) : q
      }),
      // Payroll custody receipts — the funding PV parks the FULL round in the
      // custody pool; marker written by approve_single_voucher. The wording
      // changed 2026-08 ('… → HR custody' → '… → custody pool'), which
      // silently unbridged every August round — match the stable prefix and
      // let the ref-pairing below do the filtering.
      fetchAllRowsAsWritten((page) => {
        const q = supabase
          .from('dept_pools')
          .select(POOL_COLUMNS)
          .eq('transaction_type', 'np_in')
          .like('description', '%payroll fund → %')
        return page ? q.order('created_at').order('id').range(page.from, page.to) : q
      }),
      // Payroll funding drains — each department's typed contribution.
      // Director rounds too (2026-09-11): since 2026-08-07 director funding
      // drains dept_pool_director into HR custody exactly like staff, and
      // from Sept the payout JEs are hr-segment (mig 20260911010000), so the
      // Director segment's cash-out exists ONLY as this bridged drain.
      fetchAllRowsAsWritten((page) => {
        const q = supabase
          .from('dept_pools')
          .select(POOL_COLUMNS)
          .eq('transaction_type', 'expense_out')
          .or(
            'description.like.PV HV-PV-%: Payroll bank transfer%,description.like.PV HV-PV-%: Director salary bank transfer%',
          )
        return page ? q.order('created_at').order('id').range(page.from, page.to) : q
      }),
      // Voiding a paid voucher REVERSES its pool rows with new void_in/void_out
      // rows — the originals stay for audit. Skip both sides of any voided
      // voucher's round, otherwise the bridge counts the original leg while the
      // reversal leg never matches (found live with voided HV-PV-202607-0115).
      // A set of voucher numbers: any order will do.
      fetchAllRows((from, to) =>
        supabase.from('payment_vouchers').select('voucher_no').eq('status', 'voided').order('id').range(from, to),
      ),
      // Pairing refs via SECURITY DEFINER (mig 20260820020000), so the payroll
      // bridge pairs whatever the reader's RLS hides of the HR-pool custody
      // rows and the payment_vouchers. Ref strings only — unioned with the
      // direct reads below.
      supabase.rpc('bridge_ref_flags' as never),
      // Mirror rows carry the PAYING side's real expense account per nature
      // (rent / utilities / salary…) since the 2026-07-24 by-nature change.
      // Via bridge_mirror_slices RPC (mig 20260820030000), which serves
      // finance/principal every slice (the Dept Manager's own-department slices
      // went with the kind, 2026-10-17) — and the service role, which Marketing's
      // pool reads through (mig 20261028120000).
      // (In this batch since 2026-10-08 — it needs nothing from the reads
      // above; awaited after them it was one more round trip in a row.)
      supabase.rpc('bridge_mirror_slices' as never),
      // Revenue's payroll accruals (2026-10-22): what each of its rounds to HR
      // paid for. A read that fails leaves its rounds on one 4070 line — never
      // the whole bridge.
      fetchAllRows((from, to) =>
        supabase
          .from('journal_entries')
          .select('transaction_date, journal_lines(account_code, debit)')
          .eq('reference_type', 'payroll_accrual')
          .eq('segment', SPLIT_PAYROLL_SEGMENT)
          .eq('is_reversed', false)
          .order('id')
          .range(from, to),
      ).catch(() => []),
    ])
    const banks = await bankCodes
    const bankCode = banks.has('3000') ? '3000' : (banks.values().next().value ?? '3000')
    // A read that failed has thrown already (fetchAllRows*), into the catch
    // below — no lines, as before.

    const payRows = payRead as unknown as PoolRow[]
    const recRows = recRead as unknown as PoolRow[]
    const custodyRows = custodyRead as unknown as PoolRow[]
    const fundRows = fundRead as unknown as PoolRow[]
    const flags = ((flagsRes as { data?: unknown })?.data ?? {}) as {
      voided?: string[]
      payroll_refs?: string[]
    }
    const voided = new Set([
      ...((voidedRows as { voucher_no: string | null }[])
        .map((v) => v.voucher_no)
        .filter(Boolean) as string[]),
      ...(Array.isArray(flags.voided) ? flags.voided : []),
    ])

    const pvref = (d: string | null): string | null => d?.match(PVREF)?.[0] ?? null
    const payerPvrefs = new Set(
      payRows.map((r) => pvref(r.description)).filter((ref) => ref && !voided.has(ref)) as string[],
    )

    // voucher_no → its mirror slices, so a payer row can be split by nature.
    const naturesByPv = new Map<string, { code: string; amount: number }[]>()
    const mirrorSlices = Array.isArray((mirrorRes as { data?: unknown })?.data)
      ? ((mirrorRes as { data: unknown }).data as Array<{
          voucher_no: string | null
          account_code: string | null
          amount: number | null
        }>)
      : []
    for (const m of mirrorSlices) {
      const no = m.voucher_no
      const code = m.account_code
      if (!no || !code) continue
      const arr = naturesByPv.get(no) ?? []
      arr.push({ code, amount: round2(Number(m.amount ?? 0)) })
      naturesByPv.set(no, arr)
    }

    const sides: TransferSide[] = []
    for (const r of payRows) {
      const ref = pvref(r.description)
      if (ref && voided.has(ref)) continue
      const deptName = (r.departments?.name as string) ?? ''
      const amount = round2(Number(r.amount ?? 0))
      const date = String(r.created_at ?? '').slice(0, 10)
      // Split by nature when the mirror slices reconcile to this row's amount;
      // any mismatch (legacy rows, partial data) falls back to one lumped line
      // so the segment's cash total can never drift.
      const natures = ref ? naturesByPv.get(ref) : undefined
      const natureSum = natures ? round2(natures.reduce((s, n) => s + n.amount, 0)) : null
      if (natures && natureSum === amount) {
        for (const n of natures) {
          if (!(n.amount > 0)) continue
          sides.push({ deptName, amount: n.amount, date, direction: 'out', natureCode: n.code, sourceDesc: r.description })
        }
      } else {
        sides.push({ deptName, amount, date, direction: 'out', sourceDesc: r.description })
      }
    }
    // Receivers: only np_in whose PV ref matches a (non-voided) payer.
    for (const r of recRows) {
      const ref = pvref(r.description)
      if (ref && payerPvrefs.has(ref)) {
        sides.push({
          deptName: (r.departments?.name as string) ?? '',
          amount: Number(r.amount ?? 0),
          date: String(r.created_at ?? '').slice(0, 10),
          direction: 'in',
          sourceDesc: r.description,
        })
      }
    }

    // Payroll custody: pair funding drains to custody receipts by the funding
    // PV ref, so only true custody rounds bridge (any similarly-worded drain
    // without a custody twin is left alone). Voided rounds are skipped on both
    // sides — their pool effect is already nulled by the void_in/void_out rows.
    // Pairing is SYMMETRIC (2026-08-20): a custody receipt only bridges when a
    // drain shares its ref too, so a park without a typed drain (the pre-
    // custody Jun-2026 director rounds) is left alone. Director drains match
    // since 2026-09-11; the Jul-2026 round's GL was re-tagged to hr on
    // 2026-09-15 (mig 20260915050000), so no legacy carve-out remains —
    // every custody round bridges the same way.
    const pvrefPv = (d: string | null): string | null => d?.match(PVREF_PV)?.[0] ?? null
    const custodyRefs = new Set([
      ...(custodyRows
        .map((r) => pvrefPv(r.description))
        .filter((ref) => ref && !voided.has(ref)) as string[]),
      // RLS-proof pairing set (already excludes voided server-side).
      ...(Array.isArray(flags.payroll_refs) ? flags.payroll_refs : []),
    ])
    const drainRefs = new Set(
      fundRows
        .map((r) => pvrefPv(r.description))
        .filter((ref) => ref && !voided.has(ref)) as string[],
    )
    // Revenue's rounds by account: its months' accruals (debits by account) and
    // what its rounds for each month come to.
    const accrualByMonth = new Map<string, Record<string, number>>()
    for (const e of accrualRead as unknown as Array<{ transaction_date: string | null; journal_lines: Array<{ account_code: string | null; debit: number | string | null }> | null }>) {
      const month = String(e.transaction_date ?? '').slice(0, 7)
      if (!month) continue
      const sums = accrualByMonth.get(month) ?? {}
      for (const l of e.journal_lines ?? []) {
        const amt = Number(l.debit ?? 0)
        if (l.account_code && amt > 0) sums[l.account_code] = round2((sums[l.account_code] ?? 0) + amt)
      }
      accrualByMonth.set(month, sums)
    }
    const segmentOf = (deptName: string) => DEPT_TO_SEGMENT[deptName] ?? primedNameToSegment()[deptName]
    const splitMonthOf = (r: PoolRow) =>
      segmentOf((r.departments?.name as string) ?? '') === SPLIT_PAYROLL_SEGMENT ? payrollMonthOf(r.description) : null
    const fundedByMonth = new Map<string, number>()
    for (const r of fundRows) {
      const ref = pvrefPv(r.description)
      const month = splitMonthOf(r)
      if (ref && custodyRefs.has(ref) && month) fundedByMonth.set(month, round2((fundedByMonth.get(month) ?? 0) + Number(r.amount ?? 0)))
    }

    for (const r of fundRows) {
      const ref = pvrefPv(r.description)
      if (ref && custodyRefs.has(ref)) {
        const side = {
          deptName: (r.departments?.name as string) ?? '',
          date: String(r.created_at ?? '').slice(0, 10),
          direction: 'out' as const,
          kind: 'payroll' as const,
          sourceDesc: r.description,
        }
        const amount = round2(Number(r.amount ?? 0))
        const month = splitMonthOf(r)
        const parts = month ? splitPayrollDrain(amount, fundedByMonth.get(month) ?? 0, accrualByMonth.get(month) ?? {}) : null
        if (parts) {
          for (const p of parts) sides.push({ ...side, amount: p.amount, natureCode: p.code })
        } else {
          // Cash actually left this dept to fund payroll — direct-method cash
          // flow calls that salary, so show it on 4070 rather than PY-XFER.
          sides.push({ ...side, amount, natureCode: PAYROLL_EXPENSE_CODE })
        }
      }
    }
    for (const r of custodyRows) {
      const ref = pvrefPv(r.description)
      if (!ref || voided.has(ref) || !drainRefs.has(ref)) continue
      sides.push({
        deptName: (r.departments?.name as string) ?? '',
        amount: Number(r.amount ?? 0),
        date: String(r.created_at ?? '').slice(0, 10),
        direction: 'in',
        kind: 'payroll',
        sourceDesc: r.description,
      })
    }

    return {
      lines: buildInterBillingCashFlowLines(sides, bankCode),
      account: interBillTransferAccount,
      payrollAccount: payrollCustodyAccount,
    }
  } catch {
    return { lines: [], account: interBillTransferAccount, payrollAccount: payrollCustodyAccount }
  }
}
