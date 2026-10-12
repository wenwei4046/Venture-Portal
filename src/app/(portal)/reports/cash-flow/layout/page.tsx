// Cash Flow STATEMENT layout editor (user 2026-07-30: 借贷/还款 一个 section,
// 日常开销 一个 section, 顺序自己排). Two independent ordered section lists —
// one for 现金流入, one for 现金流出 — each driven by the same drag-and-drop
// ReportLayoutEditor the monthly reports use. Accounts are assigned as leaves;
// the COA parent/child tree is rebuilt inside each section at render time.
//
// The account list offered per side comes from the CURRENT month's actual
// movement, so you only ever arrange accounts that really appear.

import dayjs from 'dayjs'
import { officeMonth } from '@/lib/office-time'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { requirePermission, requirePage } from '@/lib/auth'
import { buildCashFlow, fetchAllJournalLines, fetchCoaAccounts, monthPeriod } from '@/lib/gl-reports'
import { interBillTransferAccount, payrollCustodyAccount } from '@/lib/inter-billing-cash-flow'
import { defaultSideLayout } from '@/lib/cash-flow-sections'
import { ancestorChain, readReportLayout, type ReportLayout } from '@/lib/report-layouts'
import ReportLayoutEditor, { type GroupMeta } from '../../_components/ReportLayoutEditor'

export const dynamic = 'force-dynamic'

interface Props {
  searchParams: Promise<{ period?: string }>
}

export default async function CashFlowStatementLayoutPage({ searchParams }: Props) {
  await requirePage('/reports/cash-flow/layout')
  await requirePermission('reports')
  const supabase = await createClient()

  const params = await searchParams
  const period = /^\d{4}-\d{2}$/.test(params.period ?? '') ? params.period! : officeMonth()

  const [lines, accounts, { data: banks }, inSaved, outSaved] = await Promise.all([
    fetchAllJournalLines(supabase),
    fetchCoaAccounts(supabase),
    supabase.rpc('bank_gl_codes' as never),
    readReportLayout(supabase, 'cash_flow_in'),
    readReportLayout(supabase, 'cash_flow_out'),
  ])
  const bankCodes = new Set((banks ?? []) as unknown as string[])
  // The bridge's two synthetic accounts — constants. Its LINES were never used
  // here (the consolidated view has none), so the bridge is no longer read for
  // them (2026-10-08: it was two more round trips after the journal read).
  const coa = [...accounts, interBillTransferAccount, payrollCustodyAccount]

  // Consolidated view = no bridge lines (matches the statement).
  const cf = buildCashFlow(
    lines,
    coa,
    { current: monthPeriod(period), previous: monthPeriod(period) },
    bankCodes,
  )

  const nameOf = new Map(coa.map((a) => [a.code, a.name]))
  const parentOf = new Map(coa.map((a) => [a.code, a.parent_code]))
  // Leaves carry their COA parents (nearest first) and every parent present on
  // the side is offered as a ▣ 整组 chip — listing it files the whole subtree
  // (lib/report-layouts placeLeavesInLayout), so e.g. one 3020 chip keeps all
  // the loan debtors together and catches the next new one (2026-09-18).
  const metaFor = (leaves: { code: string }[]) => {
    const accounts = leaves.map((l) => ({
      code: l.code,
      name: nameOf.get(l.code) ?? l.code,
      ancestors: ancestorChain(l.code, (c) => parentOf.get(c)),
    }))
    const size = new Map<string, number>()
    for (const a of accounts) for (const anc of a.ancestors) size.set(anc, (size.get(anc) ?? 0) + 1)
    const groups: GroupMeta[] = [...size.entries()]
      .sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }))
      .map(([code, n]) => ({ code, name: nameOf.get(code) ?? code, size: n }))
    return { accounts, groups }
  }
  const inMeta = metaFor(cf.inflowLeaves)
  const outMeta = metaFor(cf.outflowLeaves)

  const initialFor = (saved: unknown, leaves: Parameters<typeof defaultSideLayout>[0]) => {
    const s = (saved ?? null) as ReportLayout | null
    return s && Array.isArray(s.categories) && s.categories.length > 0
      ? s
      : defaultSideLayout(leaves, coa)
  }

  return (
    <div>
      <Link
        href="/reports/cash-flow"
        className="text-sm text-muted hover:text-accent font-sans transition-colors"
      >
        ← Back to Cash Flow Statement
      </Link>

      <div className="page-head">
        <div>
          <div className="page-eyebrow">
            <em>III.</em> REPORTS · CASH FLOW STATEMENT · EDIT LAYOUT
          </div>
          <h1 className="page-title">Cash Flow 版面</h1>
        </div>
      </div>

      <section className="mb-12">
        <div className="sect-head">
          <h2>现金流入 · Money in</h2>
          <span className="rule" aria-hidden />
          <span className="count">{cf.inflowLeaves.length} ACCOUNTS</span>
        </div>
        <ReportLayoutEditor
          reportKey="cash_flow_in"
          accounts={inMeta.accounts}
          groups={inMeta.groups}
          initial={initialFor(inSaved, cf.inflowLeaves)}
        />
      </section>

      <section className="mb-12">
        <div className="sect-head">
          <h2>现金流出 · Money out</h2>
          <span className="rule" aria-hidden />
          <span className="count">{cf.outflowLeaves.length} ACCOUNTS</span>
        </div>
        <ReportLayoutEditor
          reportKey="cash_flow_out"
          accounts={outMeta.accounts}
          groups={outMeta.groups}
          initial={initialFor(outSaved, cf.outflowLeaves)}
        />
      </section>

      <p className="font-serif italic text-muted text-xs max-w-3xl">
        账目清单取自 {dayjs(`${period}-01`).format('MMMM YYYY')} 有动过的账。
        新的账目以后自动落在「其他」,想归位再回来拖一次就行。
      </p>
    </div>
  )
}
