import dayjs from 'dayjs'
import { fetchAllRows } from '@/lib/paginate'
import type { createClient } from '@/lib/supabase/server'
import { fetchIncomeStatement } from '@/lib/cfo-reports'
import { deptNameToPoolKey, splitPoolAccrual, type DeptPoolAccrual } from '@/lib/dept-pool-accrual'
import { extraDeptNameToSegment, primedRegistryRows } from '@/lib/dept-registry'
import { startRead } from '@/lib/start-read'
import { readsEveryPool } from '@/lib/surfaces'
import type { User } from '@/types'

// What Dept Pool reads (2026-10-15, lifted out of its page word for word so the
// Finance phone app reads the very same): each department's accrual P&L to
// date, or its cash — balance, in and out to date, the HR costing approved for
// it and its latest submission — Venture (Office)'s three-way cash, and each
// department's slice of each bank — for whoever reads every department's pool.

type Client = Awaited<ReturnType<typeof createClient>>

// Each department's own pool page.
export const DEPT_NAME_TO_SLUG: Record<string, string> = {
  Marketing: 'marketing',
  HR: 'hr',
  Finance: 'finance',
  'Director Office': 'director-office',
}

export interface HRCostSubmissionRow {
  id: string
  period_month: string
  submitted_at: string
  submitted_by_name: string | null
  execution_state: string
  dept_summaries: Record<
    string,
    { total_ctc?: number; department_id?: string; staff_count?: number; total_basic?: number; total_statutory?: number; total_allowance?: number }
  > | null
}

// Every department's pool is for whoever reads them all (Dept Pool · View at All). The own-department reader
// (the Dept Manager's) went with the kind (2026-10-17): anybody short of All reads none — never more.
export function visibleDepartments<D extends { id: string }>(user: User, departments: D[] | null): D[] {
  return readsEveryPool(user) ? departments ?? [] : []
}

export interface PoolAccrualRead {
  visible: Array<{ id: string; name: string }>
  rows: Array<{ dept: { id: string; name: string }; a: DeptPoolAccrual; href: string | null }>
  /** Venture (= Office / corporate), for whoever reads every department. */
  ventureAccrual: DeptPoolAccrual | null
  totalNetMargin: number
}

/** Each department's accrual P&L, cumulative to the end of `period`'s month. */
export async function readPoolAccrual(supabase: Client, user: User, period: string): Promise<PoolAccrualRead> {
  // Load departments. Filter is_internal=false so the hidden 'Venture Office'
  // pseudo-department (departments.is_internal=true) never renders as a 6th
  // real department in the "By department" list. Its ledger is instead folded
  // into the Venture (Office) row below (see ventureCash).
  const departmentsRead = startRead(
    supabase
      .from('departments')
      .select('id, name')
      .eq('is_internal', false)
      .order('name'),
  )

  // Cumulative (to-date) accrual P&L — matches the Cash view's all-time basis.
  // From inception through the end of the current period (not just this month).
  // Asked beside the departments: it needs nothing from them.
  const from = '2000-01-01'
  const to = dayjs(period).endOf('month').format('YYYY-MM-DD')
  const [{ data: departments }, income] = await Promise.all([
    departmentsRead,
    fetchIncomeStatement(supabase, { from, to }),
  ])
  const visible = visibleDepartments(user, departments)
  const poolByKey = new Map(income.pools.map((p) => [p.pool, p]))

  const rows = visible.map((dept) => {
    const key = deptNameToPoolKey(dept.name)
    const a = splitPoolAccrual(key ? poolByKey.get(key) ?? null : null)
    const slug = DEPT_NAME_TO_SLUG[dept.name]
    return { dept, a, href: slug ? `/dept-pool/${slug}` : null }
  })
  // Venture (= Office / corporate) shown as its own row for principal/finance.
  // Its P&L lives in the income statement's venture_pool bucket.
  const ventureAccrual =
    readsEveryPool(user)
      ? splitPoolAccrual(poolByKey.get('venture_pool') ?? null)
      : null

  // Total = the visible departments + Venture (whole-company net margin).
  const totalNetMargin =
    rows.reduce((s, r) => s + r.a.netMargin, 0) + (ventureAccrual?.netMargin ?? 0)
  return { visible, rows, ventureAccrual, totalNetMargin }
}

export interface PerBankBreakdownRead {
  banks: Array<{ code: string; name: string; balance: number }>
  rows: Array<{ segment: string; label: string; perBank: Record<string, number>; total: number }>
  totals: { perBank: Record<string, number>; grand: number }
}

export interface PoolCashRead {
  visible: Array<{ id: string; name: string }>
  balanceMap: Map<string, number>
  inOutByDept: Map<string, { in_amt: number; out_amt: number }>
  costingByDept: Map<string, number>
  /** Each department's latest HR costing submission. */
  latestHr: Map<string, { id: string; state: string; period: string }>
  /** Every HR costing submission (the submissions page's list), newest month first as the RPC answers. */
  submissions: HRCostSubmissionRow[]
  ventureCash: { balance: number; in_amt: number; out_amt: number } | null
  perBankBreakdown: PerBankBreakdownRead | null
  /** Every department's balance plus Venture's — the physical bank balance. */
  totalDeployed: number
}

/** Each department's cash to date, Venture (Office)'s, and each department's slice of each bank. */
export async function readPoolCash(supabase: Client, user: User): Promise<PoolCashRead> {
  // Load departments. Filter is_internal=false so the hidden 'Venture Office'
  // pseudo-department (departments.is_internal=true) never renders as a 6th
  // real department in the "By department" list. Its ledger is instead folded
  // into the Venture (Office) row below (see ventureCash).
  const departmentsRead = startRead(
    supabase
      .from('departments')
      .select('id, name')
      .eq('is_internal', false)
      .order('name'),
  )


  // ── The cash view's reads, all in flight before the first is awaited ──
  const balancesRead = startRead(supabase.from('dept_pool_balances').select('department_id, balance'))
  const ventureOfficeRead = startRead(
    supabase
      .from('departments')
      .select('id')
      .eq('is_internal', true)
      .eq('name', 'Venture Office')
      .maybeSingle(),
  )
  const poolTxnsRead = startRead(
    fetchAllRows((lo, hi) => supabase
      .from('dept_pools')
      .select('department_id, transaction_type, amount')
      .order('id', { ascending: true })
      .range(lo, hi)),
  )
  const submissionsRead = startRead(supabase.rpc('get_hr_cost_submissions_list'))
  // Venture (Office) and the per-bank breakdown are Principal / Finance only.
  // Both start from the active bank accounts — the cash slice from their GL
  // codes, the breakdown from the rest — so the accounts are read ONCE (they
  // were two reads of the same rows), and each journal_lines read starts the
  // moment they are in. null = no active bank has a GL code: nothing to read.
  const bankRowsRead =
    readsEveryPool(user)
      ? startRead(
          supabase
            .from('bank_accounts')
            .select('gl_account_code, bank_name, current_balance, is_primary')
            .eq('status', 'active')
            .order('is_primary', { ascending: false })
            .then(({ data }) => data ?? []),
        )
      : null
  const corpCashRead =
    bankRowsRead &&
    startRead(
      bankRowsRead.then(async (bankRows) => {
        const cashCodes = bankRows.map((b) => b.gl_account_code as string).filter(Boolean)
        if (cashCodes.length === 0) return null
        return fetchAllRows((lo, hi) => supabase
          .from('journal_lines')
          .select('debit, credit, journal_entries!inner(segment, is_reversed)')
          .in('account_code', cashCodes)
          .in('journal_entries.segment', ['corporate', 'treasury'])
          // Void pairs net to zero in the balance but inflated the Venture row's
          // gross In/Out (user 2026-09-10).
          .eq('journal_entries.is_reversed', false)
          .order('id', { ascending: true })
          .range(lo, hi))
      }),
    )
  const bankLinesRead =
    bankRowsRead &&
    startRead(
      bankRowsRead.then(async (bankRows) => {
        const codes = bankRows.filter((b) => b.gl_account_code).map((b) => b.gl_account_code as string)
        if (codes.length === 0) return null
        return fetchAllRows((lo, hi) => supabase
          .from('journal_lines')
          .select('account_code, debit, credit, journal_entries!inner(segment)')
          .in('account_code', codes)
          .order('id', { ascending: true })
          .range(lo, hi))
      }),
    )

  const { data: departments } = await departmentsRead
  const visible = visibleDepartments(user, departments)

  // Load balances — all 5 Dept Pools live in dept_pool_balances after the
  // Stage-6 unification (HR / Finance / Director Office migrated from
  // operating_pools into dept_pools).
  const { data: balances } = await balancesRead

  const balanceMap = new Map(
    (balances ?? []).map((b) => [b.department_id as string, Number(b.balance)])
  )

  // Resolve the hidden 'Venture Office' pseudo-department. Its dept_pools
  // ledger is an OVERLAY on the GL-derived Venture (Office) cash figure — see
  // the three-way distinction documented on ventureCash below. We pull its
  // balance + In/Out out of the real-dept maps so it is neither rendered as a
  // 6th department nor double-counted in the grand total; it is folded into
  // ventureCash instead.
  const { data: ventureOfficeDept } = await ventureOfficeRead
  const ventureOfficeId = ventureOfficeDept?.id as string | undefined
  // The pseudo-dept's own view balance (folded into ventureCash below). Remove
  // it from balanceMap so the totalDeployed sum-over-real-depts excludes it.
  const ventureOfficeBalance = ventureOfficeId ? (balanceMap.get(ventureOfficeId) ?? 0) : 0
  if (ventureOfficeId) balanceMap.delete(ventureOfficeId)

  // This-month In / Out per dept. Only Marketing runs on P&L semantics
  // (revenue - staff cost - expenses); the other 4 pools are pure ledger
  // movement so we show credits in / debits out directly from dept_pools.
  // Marketing's P&L breakdown still lives on /dept-pool/marketing.
  // Accumulated (all-time) In/Out per dept, so In − Out foots exactly to the
  // accumulated Balance. (Previously this-month only.)
  const poolTxns = await poolTxnsRead

  const inOutByDept = new Map<string, { in_amt: number; out_amt: number }>()
  for (const t of poolTxns ?? []) {
    const key = t.department_id as string
    const cur = inOutByDept.get(key) ?? { in_amt: 0, out_amt: 0 }
    if (t.transaction_type === 'np_in') {
      cur.in_amt += Number(t.amount)
    } else if (t.transaction_type === 'expense_out' || t.transaction_type === 'inter_billing_out') {
      // 'inter_billing_out' (mig 255) is a forced obligation from another
      // dept's billing — folded into Out alongside discretionary expense.
      cur.out_amt += Number(t.amount)
    }
    inOutByDept.set(key, cur)
  }

  // Lifetime sum of approved HR cost submissions per dept. Only count
  // submissions Principal has approved — pending snapshots shouldn't flow
  // into the Dept Pool total yet.
  const { data: submissionsRaw } = await submissionsRead
  const submissions = (submissionsRaw ?? []) as unknown as HRCostSubmissionRow[]
  const costingByDept = new Map<string, number>()
  for (const sub of submissions) {
    if (sub.execution_state === 'pending') continue
    const entries = Object.entries(sub.dept_summaries ?? {})
    for (const [, info] of entries) {
      const deptId = info?.department_id
      const ctc = Number(info?.total_ctc ?? 0)
      if (!deptId || !Number.isFinite(ctc)) continue
      costingByDept.set(deptId, (costingByDept.get(deptId) ?? 0) + ctc)
    }
  }

  // Venture (Office) cash — a THREE-WAY composite. Keep these distinct:
  //   1. venture_pool ledger (adjustPool VENTURE_POOL, dept_pool_balances /
  //      operating_pools) — feeds the ACCRUAL / treasury P&L view, NOT this
  //      cash page. Never summed here.
  //   2. GL corporate/treasury cash slice — real cash impact of every journal
  //      entry tagged segment IN ('corporate','treasury') on a HV bank account
  //      (computed as vIn/vOut below). corporate covers generic HV expenses +
  //      historical OFFICE manual_jv; treasury covers fund_source / loan /
  //      repayment activity (auto-tagged by derive_journal_segment, mig 217).
  //   3. The 'Venture Office' pseudo-department dept_pools overlay — np_in rows
  //      written at dept→Venture inter-billing settle time (payments/actions.ts)
  //      so the paying dept's −X is offset by Venture +X and the cash-page total
  //      still ties to the physical bank. Folded into ventureCash here.
  // ventureCash = (2) + (3): both the "By department" Venture (Office) row AND
  // the "Per-bank breakdown" Venture (Office) total therefore include the
  // pseudo-dept overlay.
  let ventureCash: { balance: number; in_amt: number; out_amt: number } | null = null
  if (readsEveryPool(user)) {
    // The GL corporate/treasury lines on every active bank's code (item 2),
    // read above beside everything else; null = no bank code, nothing read.
    let vIn = 0
    let vOut = 0
    const corpCashRows = await corpCashRead
    for (const r of corpCashRows ?? []) {
      vIn += Number(r.debit ?? 0)
      vOut += Number(r.credit ?? 0)
    }
    // Fold in the 'Venture Office' pseudo-dept overlay (item 3 above). Its
    // In/Out come from dept_pools (via inOutByDept), its balance from the
    // dept_pool_balances view (ventureOfficeBalance, already pulled out of the
    // real-dept balanceMap).
    const voInOut = ventureOfficeId
      ? inOutByDept.get(ventureOfficeId) ?? { in_amt: 0, out_amt: 0 }
      : { in_amt: 0, out_amt: 0 }
    ventureCash = {
      balance: vIn - vOut + ventureOfficeBalance,
      in_amt: vIn + voInOut.in_amt,
      out_amt: vOut + voInOut.out_amt,
    }
  }

  // Per-bank × per-segment breakdown (cash basis only). Pulls the full
  // journal_lines net per (bank account, segment) so the user can see the
  // "Alliance = Director's slice; HL = everyone else's slice" convention
  // landing as intended. Drives a separate section below the main table.
  type BankInfo = { code: string; name: string; balance: number }
  type PerBankRow = { segment: string; label: string; perBank: Record<string, number>; total: number }
  let perBankBreakdown: { banks: BankInfo[]; rows: PerBankRow[]; totals: { perBank: Record<string, number>; grand: number } } | null = null
  if (readsEveryPool(user)) {
    const bankRows = await bankRowsRead
    const banks: BankInfo[] = (bankRows ?? [])
      .filter((b) => b.gl_account_code)
      .map((b) => ({
        code: b.gl_account_code as string,
        name: b.bank_name as string,
        balance: Number(b.current_balance ?? 0),
      }))

    if (banks.length > 0) {
      // Every journal line on those banks' codes, read above the moment the
      // accounts were in.
      const bankLines = await bankLinesRead
      const agg = new Map<string, Map<string, number>>() // segment -> bankCode -> net
      for (const r of bankLines ?? []) {
        const seg = (r as { journal_entries: { segment: string } }).journal_entries.segment ?? 'unallocated'
        const code = r.account_code as string
        if (!agg.has(seg)) agg.set(seg, new Map())
        const map = agg.get(seg)!
        map.set(code, (map.get(code) ?? 0) + Number(r.debit ?? 0) - Number(r.credit ?? 0))
      }

      // Build display rows. 5 dept segments individually, and Venture (Office)
      // aggregates corporate + treasury (matches /venture-pool's filter and
      // dashboard hv_fund_balance per mig 273). Skip 'unallocated'.
      //
      // The per-bank cells start GL-derived (journal_lines). But an inter-billing
      // settle moves cash allocation in the dept_pools ledger (paying dept
      // inter_billing_out −X / Venture-Office np_in +X) WITHOUT any bank JE —
      // conceptually a transfer within the primary (Hong Leong) bank between
      // departments. So the pure-GL slice diverges from the "By department" pool
      // balance by exactly that net. We fold that gap into the PRIMARY bank cell
      // (see below), so each row's Total foots to the "By department" balance and
      // the inter-billing adjustments — netting to zero across departments — keep
      // every bank column summing to that bank's balance.
      const nameToSeg: Record<string, string> = {
        Marketing: 'marketing',
        HR: 'hr',
        Finance: 'finance',
        'Director Office': 'director_office',
        Director: 'director',
      }
      // Dynamic full departments (2026-08-24): their segment_key is a first-
      // class row too, resolved via the primed registry.
      const extraSegByName = extraDeptNameToSegment(primedRegistryRows())
      const segToBalance = new Map<string, number>()
      for (const d of departments ?? []) {
        const seg = nameToSeg[d.name as string] ?? extraSegByName[d.name as string]
        if (seg) segToBalance.set(seg, balanceMap.get(d.id as string) ?? 0)
      }
      const segLabels: Array<{ seg: string | string[]; label: string }> = [
        { seg: 'director',                       label: 'Director' },
        { seg: 'director_office',                label: 'Director Office' },
        { seg: 'finance',                        label: 'Finance' },
        { seg: 'hr',                             label: 'HR' },
        { seg: 'marketing',                      label: 'Marketing' },
        ...Object.entries(extraSegByName).map(([name, seg]) => ({ seg, label: name })),
        { seg: ['corporate', 'treasury'],        label: 'Venture (Office)' },
      ]
      const primaryCode = banks[0]?.code // is_primary desc → Hong Leong first
      const rows: PerBankRow[] = segLabels.map(({ seg, label }) => {
        const perBank: Record<string, number> = {}
        let glTotal = 0
        const segs = Array.isArray(seg) ? seg : [seg]
        for (const b of banks) {
          const v = segs.reduce((s, sg) => s + (agg.get(sg)?.get(b.code) ?? 0), 0)
          perBank[b.code] = v
          glTotal += v
        }
        const segKey = Array.isArray(seg) ? seg.join('+') : seg
        // Pool balance from "By department": Venture = GL corporate/treasury
        // slice + Venture-Office overlay (already in ventureCash.balance); the
        // 5 real depts come from the dept_pool_balances view (balanceMap).
        const poolBalance = label === 'Venture (Office)'
          ? (ventureCash?.balance ?? glTotal)
          : (segToBalance.get(segKey) ?? glTotal)
        // Fold the inter-billing gap (pool balance − GL slice) into the primary
        // (Hong Leong) bank cell — an inter-billing settle is a HL transfer
        // between departments. Row Total then = "By department" balance; the
        // adjustments net to zero across depts so each column still foots to
        // the bank balance.
        const adjust = Math.round((poolBalance - glTotal) * 100) / 100
        if (primaryCode && adjust !== 0) {
          perBank[primaryCode] = Math.round(((perBank[primaryCode] ?? 0) + adjust) * 100) / 100
        }
        return { segment: segKey, label, perBank, total: poolBalance }
      })
      const totals = { perBank: {} as Record<string, number>, grand: 0 }
      for (const b of banks) {
        const sum = Math.round(rows.reduce((s, r) => s + (r.perBank[b.code] ?? 0), 0) * 100) / 100
        totals.perBank[b.code] = sum
        totals.grand += sum
      }
      totals.grand = Math.round(totals.grand * 100) / 100
      perBankBreakdown = { banks, rows, totals }
    }
  }

  // Total cash = sum of REAL dept balances + Venture (GL corporate/treasury
  // slice + Venture Office pseudo-dept overlay). balanceMap has already had the
  // pseudo-dept removed, and ventureCash.balance now carries its overlay, so
  // the pseudo-dept balance is counted exactly once. For a dept→Venture
  // inter-billing the paying dept is −X (inter_billing_out) and Venture Office
  // is +X (np_in overlay), netting to zero — so the total still ties to the
  // physical bank. Director and Office are independent segments post the
  // 2026-05-26 re-import (Director got a top-up FROM Office via cross-segment
  // cleanup JE, so Office can be negative while Director > natural GL).
  const totalDeployed =
    Array.from(balanceMap.values()).reduce((acc, b) => acc + b, 0) +
    (ventureCash?.balance ?? 0)

  // Each department's latest HR costing submission (the handoff's status
  // chip in the HR Costing Submission column).
  const latestHr = new Map<string, { id: string; state: string; period: string }>()
  for (const sub of [...submissions].sort((a, b) => b.period_month.localeCompare(a.period_month))) {
    for (const info of Object.values(sub.dept_summaries ?? {})) {
      const deptId = info?.department_id
      if (deptId && !latestHr.has(deptId)) latestHr.set(deptId, { id: sub.id, state: sub.execution_state, period: sub.period_month })
    }
  }

  return { visible, balanceMap, inOutByDept, costingByDept, latestHr, submissions, ventureCash, perBankBreakdown, totalDeployed }
}
