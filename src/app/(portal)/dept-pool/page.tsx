import Link from 'next/link'
import dayjs from 'dayjs'
import { redirect } from 'next/navigation'
import { requirePermission } from '@/lib/auth'
import { canDo } from '@/lib/permission-actions'
import { fetchAllRows } from '@/lib/paginate'
import { createClient } from '@/lib/supabase/server'
import { formatMoney, getPeriodMonth } from '@/lib/utils'
import { fetchIncomeStatement } from '@/lib/cfo-reports'
import { deptNameToPoolKey, splitPoolAccrual } from '@/lib/dept-pool-accrual'
import { extraDeptNameToSegment, primedRegistryRows } from '@/lib/dept-registry'
import { startRead } from '@/lib/start-read'
import type { User } from '@/types'
import { BalanceProvider, BalanceToggle, BalanceValue } from './_components/RevealAmount'
import { ownDepartmentOnly } from '@/lib/surfaces'
import { DeptPoolAccrualSheet, DeptPoolCashSheet } from './_components/DeptPoolSheet'

// dept_manager only owns their own dept pool. Skip the multi-dept list and
// land them straight on their own detail page — same content as clicking View.
const DEPT_NAME_TO_SLUG: Record<string, string> = {
  Marketing: 'marketing',
  HR: 'hr',
  Finance: 'finance',
  'Director Office': 'director-office',
}

interface HRCostSubmissionRow {
  id: string
  period_month: string
  submitted_at: string
  submitted_by_name: string | null
  execution_state: string
  dept_summaries: Record<string, { total_ctc?: number; department_id?: string }> | null
}

// Somebody whose Dept Pool reaches only their own department sees only it
// (2026-10-09, Q7: by their cell, not the dept_manager kind).
function visibleDepartments<D extends { id: string }>(user: User, departments: D[] | null): D[] {
  const all = departments ?? []
  return ownDepartmentOnly(user, 'dept_pool') ? all.filter((d) => d.id === user.department_id) : all
}

export default async function DeptPoolPage({
  searchParams,
}: {
  searchParams: Promise<{ basis?: string }>
}) {
  const user = await requirePermission('dept_pool')
  const supabase = await createClient()

  const { basis: basisParam } = await searchParams
  const basis = basisParam === 'accrual' ? 'accrual' : 'cash'

  // Fast-path: their own department only → its detail page. No reason to
  // show a 1-row list and make them click View.
  if (ownDepartmentOnly(user, 'dept_pool') && user.department_id) {
    const { data: ownDept } = await supabase
      .from('departments')
      .select('name')
      .eq('id', user.department_id)
      .single()
    const slug = ownDept?.name ? DEPT_NAME_TO_SLUG[ownDept.name] : null
    if (slug) redirect(`/dept-pool/${slug === 'marketing' ? 'marketing' : slug}`)
  }

  const period = getPeriodMonth()

  // Every read either view needs is started before the first is awaited
  // (2026-10-08): the cash view awaited nine one after another, 0.7–1.0 s in
  // production, though only its two journal_lines reads need an earlier
  // answer (the active banks' GL codes). Each answer is still read below,
  // where it always was.

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

  if (basis === 'accrual') {
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
      !ownDepartmentOnly(user, 'dept_pool')
        ? splitPoolAccrual(poolByKey.get('venture_pool') ?? null)
        : null

    // Total = the visible departments + Venture (whole-company net margin).
    const totalNetMargin =
      rows.reduce((s, r) => s + r.a.netMargin, 0) + (ventureAccrual?.netMargin ?? 0)

    // Finance's view (2026-10-09, the user's Claude Design handoff): whoever
    // reads every department gets the sheet's cards and tables, drawn from the
    // same figures; somebody who reads only their own keeps the page below,
    // as it was. The accrual view stays read-only (no New project contract).
    if (!ownDepartmentOnly(user, 'dept_pool')) {
      return (
        <DeptPoolAccrualSheet
          monthTitle={dayjs(period).format('MMMM YYYY').toUpperCase()}
          asAt={dayjs(period).endOf('month').format('D MMM YYYY')}
          canNewContract={false}
          rows={rows.map(({ dept, a, href }) => ({
            id: dept.id,
            name: dept.name,
            href,
            pnlHref: dept.name === 'Marketing' && href ? `${href}?tab=pnl` : null,
            a,
          }))}
          venture={ventureAccrual}
        />
      )
    }

    return (
      <div>
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-4 mb-10">
          <div>
            <div className="page-eyebrow">
              <em>I.</em> DEPARTMENTS · POOL OVERVIEW
            </div>
            <h1 className="page-title">Department Pools</h1>
          </div>
          {/* Accrual view is read-only — intentionally omits the dept_manager "New project contract" action. */}
          <div className="flex items-center gap-3 shrink-0">
            {/* Cash / Accrual switching lives in the sidebar (Dept Pool > Cash / Accrual P&L). */}
            <Link
              href="/dept-pool/submissions"
              className="bg-surface hover:bg-surface-2 border border-hairline text-ink font-serif italic text-sm px-4 py-2 rounded-md transition-colors"
            >
              HR Past Month Submission
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 mb-12 pb-12 border-b border-hairline">
          <div className="lg:col-span-7 hero-walnut px-6 py-6 md:px-8 md:py-7">
            <div className="font-serif italic text-accent text-base mb-1">
              Total net margin · P&amp;L (cumulative to-date)
            </div>
            <div className="statement-amount text-ink">
              {formatMoney(totalNetMargin)}
            </div>
            <div className="font-mono text-xs text-muted mt-2">
              {visible.length} department{visible.length === 1 ? '' : 's'}{ventureAccrual ? ' + Venture' : ''} visible · Cumulative to-date · as at{' '}
              {dayjs(period).endOf('month').format('D MMM YYYY')}
            </div>
          </div>
        </div>

        <section className="mb-12">
          <h2 className="font-serif text-xl text-ink mb-1">By department</h2>
          {visible.length === 0 ? (
            <div className="border border-hairline rounded-md bg-surface p-6 text-center">
              <p className="font-serif italic text-muted text-sm">
                No departments visible to your role.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-hairline text-xs uppercase tracking-wide text-muted font-sans">
                    <th className="text-left py-3 pr-4 font-medium">Department</th>
                    <th className="text-right py-3 pr-4 font-medium">Revenue (bill)</th>
                    <th className="text-right py-3 pr-4 font-medium">− Cost</th>
                    <th className="text-right py-3 pr-4 font-medium">− Expense</th>
                    <th className="text-right py-3 pr-4 font-medium">− Inter-billing</th>
                    <th className="text-right py-3 pr-4 font-medium">= Net margin</th>
                    <th className="py-3 text-right font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ dept, a, href }) => (
                    <tr key={dept.id} className="border-b border-hairline last:border-0">
                      <td className="py-3 pr-4 font-serif text-md text-ink">{dept.name}</td>
                      <td className="py-3 pr-4 text-right font-mono tabular text-ledger">
                        {formatMoney(a.revenue)}
                      </td>
                      <td className="py-3 pr-4 text-right font-mono tabular text-graphite">
                        {a.cost === 0 ? formatMoney(0) : <span className="neg">{formatMoney(-a.cost)}</span>}
                      </td>
                      <td className="py-3 pr-4 text-right font-mono tabular text-graphite">
                        {a.expense === 0 ? formatMoney(0) : <span className="neg">{formatMoney(-a.expense)}</span>}
                      </td>
                      <td className="py-3 pr-4 text-right font-mono tabular text-graphite">
                        {a.interBilling === 0 ? formatMoney(0) : <span className="neg">{formatMoney(-a.interBilling)}</span>}
                      </td>
                      <td className="py-3 pr-4 text-right font-mono tabular font-semibold">
                        <span className={a.netMargin >= 0 ? 'text-ink' : 'text-danger'}>
                          {formatMoney(a.netMargin)}
                        </span>
                      </td>
                      <td className="py-3 text-right space-x-4">
                        {href ? (
                          <Link href={href} className="text-sm text-accent hover:text-accent-hover font-serif italic">
                            View
                          </Link>
                        ) : null}
                        {dept.name === 'Marketing' && href ? (
                          <Link href={`${href}?tab=pnl`} className="text-sm text-accent hover:text-accent-hover font-serif italic">
                            P&amp;L
                          </Link>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                  {ventureAccrual ? (
                    <tr className="border-t-2 border-hairline">
                      <td className="py-3 pr-4 font-serif text-md text-ink">
                        Venture <span className="font-mono text-xs text-muted">(Office)</span>
                      </td>
                      <td className="py-3 pr-4 text-right font-mono tabular text-ledger">
                        {formatMoney(ventureAccrual.revenue)}
                      </td>
                      <td className="py-3 pr-4 text-right font-mono tabular text-graphite">
                        {ventureAccrual.cost === 0 ? formatMoney(0) : <span className="neg">{formatMoney(-ventureAccrual.cost)}</span>}
                      </td>
                      <td className="py-3 pr-4 text-right font-mono tabular text-graphite">
                        {ventureAccrual.expense === 0 ? formatMoney(0) : <span className="neg">{formatMoney(-ventureAccrual.expense)}</span>}
                      </td>
                      <td className="py-3 pr-4 text-right font-mono tabular text-graphite">
                        {ventureAccrual.interBilling === 0 ? formatMoney(0) : <span className="neg">{formatMoney(-ventureAccrual.interBilling)}</span>}
                      </td>
                      <td className="py-3 pr-4 text-right font-mono tabular font-semibold">
                        <span className={ventureAccrual.netMargin >= 0 ? 'text-ink' : 'text-danger'}>
                          {formatMoney(ventureAccrual.netMargin)}
                        </span>
                      </td>
                      <td className="py-3"></td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <p className="font-serif italic text-muted text-xs">
          Accrual basis, cumulative to date — billed revenue − cost − expense −
          inter-billing since inception. Switch to Cash for actual pool movement.
        </p>
      </div>
    )
  }

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
    !ownDepartmentOnly(user, 'dept_pool')
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
  if (!ownDepartmentOnly(user, 'dept_pool')) {
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
  if (!ownDepartmentOnly(user, 'dept_pool')) {
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

  // Finance's view (2026-10-09, the handoff) — as the accrual branch above:
  // the same figures as cards, Balance by bank, then By department.
  if (!ownDepartmentOnly(user, 'dept_pool')) {
    return (
      <DeptPoolCashSheet
        monthTitle={dayjs(period).format('MMMM YYYY').toUpperCase()}
        canNewContract={canDo(user, 'my_billing', 'create', 'dept')}
        rows={visible.map((dept) => {
          const io = inOutByDept.get(dept.id) ?? { in_amt: 0, out_amt: 0 }
          const slug = DEPT_NAME_TO_SLUG[dept.name]
          const href = slug ? `/dept-pool/${slug}` : null
          return {
            id: dept.id,
            name: dept.name,
            href,
            pnlHref: dept.name === 'Marketing' && href ? `${href}?tab=pnl` : null,
            balance: balanceMap.get(dept.id) ?? 0,
            inAmt: io.in_amt,
            outAmt: io.out_amt,
            costing: costingByDept.get(dept.id) ?? 0,
          }
        })}
        venture={ventureCash}
        perBank={perBankBreakdown}
        total={totalDeployed}
      />
    )
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-4 mb-10">
        <div>
          <div className="page-eyebrow">
            <em>I.</em> DEPARTMENTS · POOL OVERVIEW
          </div>
          <h1 className="page-title">Department Pools</h1>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {/* Cash / Accrual switching lives in the sidebar (Dept Pool > Cash / Accrual P&L). */}
          <Link
            href="/dept-pool/submissions"
            className="bg-surface hover:bg-surface-2 border border-hairline text-ink font-serif italic text-sm px-4 py-2 rounded-md transition-colors"
          >
            HR Past Month Submission
          </Link>
          {canDo(user, 'my_billing', 'create', 'dept') ? (
            <Link
              href="/dept-pool/contracts/new"
              className="bg-accent hover:bg-accent-hover text-white font-serif italic text-sm px-5 py-2.5 rounded-md transition-colors"
            >
              New project contract
            </Link>
          ) : null}
        </div>
      </div>

      {/* ───────── Hero totals ───────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 mb-12 pb-12 border-b border-hairline">
        <div className="lg:col-span-7 hero-walnut px-6 py-6 md:px-8 md:py-7">
          <div className="font-serif italic text-accent text-base mb-1">
            Total cash available · all departments
          </div>
          <div className="statement-amount text-ink">
            {formatMoney(totalDeployed)}
          </div>
          <div className="font-mono text-xs text-muted mt-2">
            {visible.length} department{visible.length === 1 ? '' : 's'}{ventureCash ? ' + Venture' : ''} visible · Period{' '}
            {dayjs(period).format('MMMM YYYY')}
          </div>
        </div>
      </div>

      {/* ───────── By department ───────── */}
      <section className="mb-12">
        <h2 className="font-serif text-xl text-ink mb-1">By department</h2>

        {visible.length === 0 ? (
          <div className="border border-hairline rounded-md bg-surface p-6 text-center">
            <p className="font-serif italic text-muted text-sm">
              No departments visible to your role.
            </p>
          </div>
        ) : (
          <BalanceProvider>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-hairline text-xs uppercase tracking-wide text-muted font-sans">
                  <th className="text-left py-3 pr-4 font-medium">Department</th>
                  <th className="text-right py-3 pr-4 font-medium"><BalanceToggle label="Balance" /></th>
                  <th className="text-right py-3 pr-4 font-medium">In (to date)</th>
                  <th className="text-right py-3 pr-4 font-medium">Out (to date)</th>
                  <th className="text-right py-3 pr-4 font-medium">Net (to date)</th>
                  <th className="text-right py-3 pr-4 font-medium">HR Costing Submission</th>
                  <th className="py-3 text-right font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {visible.map((dept) => {
                  const balance = balanceMap.get(dept.id) ?? 0
                  const inOut = inOutByDept.get(dept.id) ?? { in_amt: 0, out_amt: 0 }
                  const net = inOut.in_amt - inOut.out_amt
                  // Director (the special director payout pool) has its own
                  // /director-pool view and does not get a generic detail page.
                  const slugByName: Record<string, string> = {
                    Marketing: 'marketing',
                    HR: 'hr',
                    Finance: 'finance',
                    'Director Office': 'director-office',
                  }
                  const slug = slugByName[dept.name]
                  const href = slug ? `/dept-pool/${slug}` : null
                  return (
                    <tr
                      key={dept.id}
                      className="border-b border-hairline last:border-0"
                    >
                      <td className="py-3 pr-4 font-serif text-md text-ink">
                        {dept.name}
                      </td>
                      <td className="py-3 pr-4 text-right font-mono tabular font-medium text-ink">
                        <BalanceValue text={formatMoney(balance)} />
                      </td>
                      <td className="py-3 pr-4 text-right font-mono tabular text-ledger">
                        {formatMoney(inOut.in_amt)}
                      </td>
                      <td className="py-3 pr-4 text-right font-mono tabular text-graphite">
                        {formatMoney(inOut.out_amt)}
                      </td>
                      <td className="py-3 pr-4 text-right font-mono tabular font-semibold">
                        <span className={net >= 0 ? 'text-ink' : 'text-danger'}>
                          {formatMoney(net)}
                        </span>
                      </td>
                      <td className="py-3 pr-4 text-right font-mono tabular text-graphite">
                        {formatMoney(costingByDept.get(dept.id) ?? 0)}
                      </td>
                      <td className="py-3 text-right space-x-4">
                        {href ? (
                          <Link
                            href={href}
                            className="text-sm text-accent hover:text-accent-hover font-serif italic"
                          >
                            View
                          </Link>
                        ) : null}
                        {dept.name === 'Marketing' && href ? (
                          <Link
                            href={`${href}?tab=pnl`}
                            className="text-sm text-accent hover:text-accent-hover font-serif italic"
                          >
                            P&amp;L
                          </Link>
                        ) : null}
                      </td>
                    </tr>
                  )
                })}
                {ventureCash ? (
                  <tr className="border-t-2 border-hairline">
                    <td className="py-3 pr-4 font-serif text-md text-ink">
                      Venture <span className="font-mono text-xs text-muted">(Office)</span>
                    </td>
                    <td className="py-3 pr-4 text-right font-mono tabular font-medium text-ink">
                      <BalanceValue text={formatMoney(ventureCash.balance)} />
                    </td>
                    <td className="py-3 pr-4 text-right font-mono tabular text-ledger">
                      {formatMoney(ventureCash.in_amt)}
                    </td>
                    <td className="py-3 pr-4 text-right font-mono tabular text-graphite">
                      {formatMoney(ventureCash.out_amt)}
                    </td>
                    <td className="py-3 pr-4 text-right font-mono tabular font-semibold">
                      <span className={ventureCash.in_amt - ventureCash.out_amt >= 0 ? 'text-ink' : 'text-danger'}>
                        {formatMoney(ventureCash.in_amt - ventureCash.out_amt)}
                      </span>
                    </td>
                    <td className="py-3 pr-4 text-right font-mono tabular text-graphite">
                      {formatMoney(0)}
                    </td>
                    <td className="py-3"></td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          </BalanceProvider>
        )}
      </section>

      {perBankBreakdown ? (
        <section className="mb-12">
          <div className="flex items-baseline justify-between mb-1">
            <h2 className="font-serif text-xl text-ink">Per-bank breakdown</h2>
            <span className="font-serif italic text-muted text-xs">
              Derived from journal_lines · cash basis
            </span>
          </div>
          <p className="font-serif italic text-muted text-xs mb-4 max-w-2xl">
            Per-segment cash slice on each HV bank account. Sums down each bank
            column = bank balance; sums across each row = department total
            (matches &ldquo;By department&rdquo;). Inter-billing recharges settle
            as an internal Hong Leong transfer between departments.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-hairline text-xs uppercase tracking-wide text-muted font-sans">
                  <th className="text-left py-3 pr-4 font-medium">Department</th>
                  {perBankBreakdown.banks.map((b) => (
                    <th key={b.code} className="text-right py-3 pr-4 font-medium">
                      {b.name} <span className="font-mono text-muted">({b.code})</span>
                    </th>
                  ))}
                  <th className="text-right py-3 pr-4 font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {perBankBreakdown.rows.map((r) => (
                  <tr key={r.segment} className="border-b border-hairline last:border-0">
                    <td className="py-3 pr-4 font-serif text-md text-ink">{r.label}</td>
                    {perBankBreakdown!.banks.map((b) => {
                      const v = r.perBank[b.code] ?? 0
                      return (
                        <td
                          key={b.code}
                          className={`py-3 pr-4 text-right font-mono tabular ${v < 0 ? 'text-danger' : 'text-ink'}`}
                        >
                          {v === 0 ? '—' : formatMoney(v)}
                        </td>
                      )
                    })}
                    <td className={`py-3 pr-4 text-right font-mono tabular font-semibold ${r.total < 0 ? 'text-danger' : 'text-ink'}`}>
                      {formatMoney(r.total)}
                    </td>
                  </tr>
                ))}
                <tr className="border-t-2 border-hairline">
                  <td className="py-3 pr-4 font-serif text-md text-ink font-semibold">Bank balance</td>
                  {perBankBreakdown.banks.map((b) => (
                    <td key={b.code} className="py-3 pr-4 text-right font-mono tabular font-semibold text-ink">
                      {formatMoney(perBankBreakdown!.totals.perBank[b.code] ?? 0)}
                    </td>
                  ))}
                  <td className="py-3 pr-4 text-right font-mono tabular font-semibold text-num-ink">
                    {formatMoney(perBankBreakdown.totals.grand)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <p className="font-serif italic text-muted text-xs">
        Dept Pools: invoices settled + P&amp;L in, payroll consolidation + expenses out.
        Venture (Office) = every JE tagged segment=corporate hitting a HV bank
        account. Total above = all 6 segments&apos; allocations summed = physical
        bank balance.
      </p>
    </div>
  )
}
