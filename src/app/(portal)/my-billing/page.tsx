// My Billing — dept-manager workbench (2026-08-20, marketing user features).
// One page for a manager's own segment: KPI cards (本月开单 / 本月实收 / 未收 /
// 合同), a 开单 button (draft only — Finance issues), the invoice list with
// 回款 status, and contract tracking with expiry + invoiced/collected.
// Every read is RLS-scoped to the manager's own segment; the only privileged
// data is the per-invoice receipts/CN sums via dept_invoice_settlements.

import dayjs from 'dayjs'
import { officeMonth, officeTime, officeToday } from '@/lib/office-time'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth'
import { formatMoney } from '@/lib/utils'
import { deptNameToSegment } from '@/lib/billing'
import { fetchDeptCashLines, fetchDeptInvoiceSettlements, monthRange } from '@/lib/dept-receipt-payment'
import { fetchAllRowsAsWritten } from '@/lib/paginate'
import CreateDeptInvoiceButton from './_components/CreateDeptInvoiceButton'
import DraftInvoiceActions from './_components/DraftInvoiceActions'
import Link from 'next/link'
import LedgerRow from '@/components/LedgerRow'

export const dynamic = 'force-dynamic'

const r2 = (n: number) => Math.round(n * 100) / 100

export default async function MyBillingPage() {
  const user = await requirePermission('my_billing')
  const supabase = await createClient()

  if (!user.department_id) {
    return (
      <div className="py-16 text-center">
        <p className="font-serif italic text-2xl text-ink mb-2">My Billing</p>
        <p className="font-serif italic text-graphite">No department assigned. Contact Principal.</p>
      </div>
    )
  }
  const { data: dept } = await supabase
    .from('departments')
    .select('id, name, segment_key')
    .eq('id', user.department_id)
    .single()
  const deptName = dept?.name ?? '—'
  const segment =
    ((dept as { segment_key?: string | null } | null)?.segment_key ?? null) ||
    (deptNameToSegment(deptName) ?? null)

  const thisMonth = officeMonth()
  const { from, to } = monthRange(thisMonth)

  const [{ data: invRows }, { data: sums }, { data: contractRows }, { data: companies }, cashLines] =
    await Promise.all([
      // Every invoice of the segment, and every settlement row (2026-10-08):
      // both are whole-history, and past PostgREST's 1000-row cap the rest
      // would silently drop out of the list and of 未收. The list keeps its
      // own order while it fits (fetchAllRowsAsWritten: drafts carry no
      // number yet, so they tie); a failed read still counts as none.
      fetchAllRowsAsWritten((page) => {
        const q = supabase
          .from('invoices')
          .select(
            'id, invoice_no, company_id, billable_to_freetext_name, period_month, invoice_date, due_date, description, total_amount, status, contract_id, created_by',
          )
          .order('invoice_no', { ascending: false })
        return page ? q.order('id', { ascending: true }).range(page.from, page.to) : q
      }).then((data) => ({ data }), () => ({ data: null })),
      fetchDeptInvoiceSettlements(supabase as never).then((data) => ({ data }), () => ({ data: null })),
      supabase
        .from('service_contracts')
        .select('id, description, amount, status, start_date, end_date, company_id')
        .order('created_at', { ascending: false }),
      supabase.from('companies').select('id, name').eq('is_active', true).order('name'),
      fetchDeptCashLines(supabase as never, { from, to, segment }),
    ])

  const companyMap = new Map(((companies ?? []) as Array<{ id: string; name: string }>).map((c) => [c.id, c.name]))
  const sumById = new Map<string, { receipts: number; credits: number }>()
  for (const s of ((sums ?? []) as unknown as Array<{ invoice_id: string; receipts: number; credits: number }>)) {
    sumById.set(s.invoice_id, { receipts: Number(s.receipts), credits: Number(s.credits) })
  }

  type Inv = {
    id: string
    invoice_no: string | null
    company_id: string | null
    billable_to_freetext_name: string | null
    period_month: string
    invoice_date: string | null
    due_date: string | null
    description: string | null
    total_amount: number
    status: string
    contract_id: string | null
    created_by: string | null
  }
  const invoices = (invRows ?? []) as Inv[]
  const partyOf = (i: Inv) => (i.company_id ? companyMap.get(i.company_id) ?? '—' : i.billable_to_freetext_name ?? '—')
  const outstandingOf = (i: Inv) => {
    if (i.status !== 'issued') return 0
    const s = sumById.get(i.id)
    return r2(Number(i.total_amount) - (s?.receipts ?? 0) - (s?.credits ?? 0))
  }

  // KPI figures
  const issuedFamily = new Set(['issued', 'paid', 'paid_via_netting'])
  const billedThisMonth = invoices
    .filter((i) => issuedFamily.has(i.status) && i.period_month.startsWith(thisMonth))
    .reduce((s, i) => s + Number(i.total_amount), 0)
  const receivedThisMonth = cashLines.reduce((s, l) => s + l.inAmount, 0)
  const totalOutstanding = invoices.reduce((s, i) => s + outstandingOf(i), 0)

  type Contract = {
    id: string
    description: string | null
    amount: number
    status: string
    start_date: string | null
    end_date: string | null
    company_id: string | null
  }
  const contracts = (contractRows ?? []) as Contract[]
  const today = officeToday()
  const expiring = contracts.filter(
    (c) =>
      c.status === 'active' &&
      c.end_date &&
      dayjs(c.end_date).diff(today, 'day') <= 30 &&
      dayjs(c.end_date).diff(today, 'day') >= 0,
  ).length
  const activeContracts = contracts.filter((c) => c.status === 'active').length

  const contractStats = (cid: string) => {
    const related = invoices.filter((i) => i.contract_id === cid)
    const invoiced = related
      .filter((i) => issuedFamily.has(i.status))
      .reduce((s, i) => s + Number(i.total_amount), 0)
    const collected = related.reduce((s, i) => {
      if (i.status === 'paid' || i.status === 'paid_via_netting')
        return s + Number(i.total_amount) - (sumById.get(i.id)?.credits ?? 0)
      if (i.status === 'issued') return s + (sumById.get(i.id)?.receipts ?? 0)
      return s
    }, 0)
    const outstanding = related.reduce((s, i) => s + outstandingOf(i), 0)
    return { invoiced: r2(invoiced), collected: r2(collected), outstanding: r2(outstanding) }
  }

  const contractPickerRows = contracts
    .filter((c) => c.status === 'active')
    .map((c) => ({ id: c.id, description: c.description, company_id: c.company_id }))

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="page-eyebrow">
            <em>·</em> {deptName.toUpperCase()} · BILLING
          </div>
          <h1 className="page-title">My Billing</h1>
        </div>
        <CreateDeptInvoiceButton
          deptName={deptName}
          companies={(companies ?? []) as Array<{ id: string; name: string }>}
          contracts={contractPickerRows}
        />
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
        <div className="border border-hairline rounded-md bg-surface p-5">
          <div className="font-serif italic text-sm text-accent mb-1">本月开单 Billed {officeTime().format('MMM')}</div>
          <div className="statement-amount text-num-ink">{formatMoney(billedThisMonth)}</div>
          <div className="font-mono text-xs text-muted mt-2">issued + paid · period {thisMonth}</div>
        </div>
        <div className="border border-hairline rounded-md bg-surface p-5">
          <div className="font-serif italic text-sm text-accent mb-1">本月实收 Received {officeTime().format('MMM')}</div>
          <div className="statement-amount text-num-ink">{formatMoney(receivedThisMonth)}</div>
          <div className="font-mono text-xs text-muted mt-2">bank-in on {deptName} GL</div>
        </div>
        <div className="border border-hairline rounded-md bg-surface p-5">
          <div className="font-serif italic text-sm text-accent mb-1">未收 To collect</div>
          <div className={`statement-amount ${totalOutstanding > 0 ? 'text-alert' : 'text-num-ink'}`}>
            {formatMoney(totalOutstanding)}
          </div>
          <div className="font-mono text-xs text-muted mt-2">all issued invoices, net of receipts/CN</div>
        </div>
        <div className="border border-hairline rounded-md bg-surface p-5">
          <div className="font-serif italic text-sm text-accent mb-1">合同 Contracts</div>
          <div className="statement-amount text-num-ink">
            {activeContracts}
            {expiring > 0 ? <span className="text-alert text-base font-sans"> · {expiring} 快到期</span> : null}
          </div>
          <div className="font-mono text-xs text-muted mt-2">
            active{expiring > 0 ? ' · expiring ≤30d' : ''} ·{' '}
            <Link href="/reports/receipt-payment" className="text-accent hover:underline">
              Receipt &amp; Payment →
            </Link>
          </div>
        </div>
      </div>

      {/* Invoices */}
      <section className="mb-12">
        <div className="sect-head">
          <h2>Invoices · 回款状态</h2>
          <span className="rule" aria-hidden />
          <span className="count">{invoices.length} TOTAL</span>
        </div>
        {invoices.length === 0 ? (
          <div className="border border-hairline rounded-md bg-surface p-6 text-center">
            <p className="font-serif italic text-muted text-sm">还没有发票。按右上角 + 开单。</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="ledger-table">
              <thead>
                <tr>
                  <th>Invoice #</th>
                  <th className="m-hide">Bill to</th>
                  <th className="m-hide">Period</th>
                  <th className="right">Amount</th>
                  <th className="right m-hide">未收 Bal</th>
                  <th className="m-hide">Status</th>
                  <th className="m-hide">Date</th>
                  <th className="right m-hide">Action</th>
                  <th className="lt-toggle" aria-hidden />
                </tr>
              </thead>
              <tbody>
                {invoices.map((i) => {
                  const bal = outstandingOf(i)
                  const s = sumById.get(i.id)
                  return (
                    <LedgerRow key={i.id}>
                      <td className="font-mono text-xs text-ink">{i.invoice_no ?? i.id.slice(0, 8)}</td>
                      <td className="font-serif text-ink m-hide" data-label="Bill to">{partyOf(i)}</td>
                      <td className="font-mono text-xs text-muted m-hide" data-label="Period">{dayjs(i.period_month).format('MMM YYYY')}</td>
                      <td className="num">{formatMoney(Number(i.total_amount))}</td>
                      <td className="num m-hide" data-label="未收 Bal">
                        {i.status === 'issued' ? (
                          <span className={bal > 0 ? 'text-alert' : ''}>
                            {formatMoney(bal)}
                            {s && (s.receipts > 0 || s.credits > 0) ? (
                              <span className="block font-mono text-[10px] text-muted">
                                {s.receipts > 0 ? `收 ${formatMoney(s.receipts)} ` : ''}
                                {s.credits > 0 ? `CN −${formatMoney(s.credits)}` : ''}
                              </span>
                            ) : null}
                          </span>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                      <td className="m-hide" data-label="Status">
                        <span
                          className={`font-serif italic text-xs ${
                            i.status === 'draft'
                              ? 'text-muted'
                              : i.status === 'issued'
                                ? 'text-alert'
                                : 'text-graphite'
                          }`}
                        >
                          {i.status}
                        </span>
                      </td>
                      <td className="font-mono text-xs text-muted m-hide" data-label="Date">
                        {i.invoice_date ? dayjs(i.invoice_date).format('DD MMM YY') : '—'}
                      </td>
                      <td className="text-right m-hide">
                        {i.status === 'draft' && i.created_by === user.id ? (
                          <DraftInvoiceActions
                            invoice={{
                              id: i.id,
                              invoice_no: i.invoice_no,
                              total_amount: Number(i.total_amount),
                              invoice_date: i.invoice_date,
                              due_date: i.due_date,
                              description: i.description,
                            }}
                          />
                        ) : (
                          <span className="text-muted text-xs">—</span>
                        )}
                      </td>
                    </LedgerRow>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Contracts */}
      <section className="mb-12">
        <div className="sect-head">
          <h2>Contracts · 合同</h2>
          <span className="rule" aria-hidden />
          <span className="count">{contracts.length} TOTAL · {activeContracts} ACTIVE</span>
        </div>
        {contracts.length === 0 ? (
          <div className="border border-hairline rounded-md bg-surface p-6 text-center">
            <p className="font-serif italic text-muted text-sm">
              还没有合同。<Link href="/billing/contracts/new" className="text-accent hover:underline">开新合同 →</Link>
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="ledger-table">
              <thead>
                <tr>
                  <th>Contract</th>
                  <th className="m-hide">Company</th>
                  <th className="right">Contract Amt</th>
                  <th className="m-hide">Term</th>
                  <th className="m-hide">Status</th>
                  <th className="right m-hide">已开单</th>
                  <th className="right m-hide">已收</th>
                  <th className="right m-hide">未收</th>
                  <th className="lt-toggle" aria-hidden />
                </tr>
              </thead>
              <tbody>
                {contracts.map((c) => {
                  const st = contractStats(c.id)
                  const daysLeft = c.end_date ? dayjs(c.end_date).diff(today, 'day') : null
                  const expiringSoon = c.status === 'active' && daysLeft !== null && daysLeft <= 30
                  return (
                    <LedgerRow key={c.id}>
                      <td className="font-serif italic text-graphite text-sm max-w-[240px]">
                        <span title={c.description ?? ''}>
                          {(c.description ?? c.id.slice(0, 8)).slice(0, 48)}
                        </span>
                      </td>
                      <td className="font-serif text-ink m-hide" data-label="Company">
                        {c.company_id ? companyMap.get(c.company_id) ?? '—' : '—'}
                      </td>
                      <td className="num">{formatMoney(Number(c.amount))}</td>
                      <td className="font-mono text-xs text-muted whitespace-nowrap m-hide" data-label="Term">
                        {c.start_date ? dayjs(c.start_date).format('DD MMM YY') : '—'} →{' '}
                        {c.end_date ? dayjs(c.end_date).format('DD MMM YY') : '—'}
                        {expiringSoon ? (
                          <span className={`block text-[10px] ${daysLeft! < 0 ? 'text-danger' : 'text-alert'}`}>
                            {daysLeft! < 0 ? '已过期' : `剩 ${daysLeft} 天`}
                          </span>
                        ) : null}
                      </td>
                      <td className="m-hide" data-label="Status">
                        <span className={`font-serif italic text-xs ${c.status === 'active' ? 'text-graphite' : 'text-muted'}`}>
                          {c.status}
                        </span>
                      </td>
                      <td className="num m-hide" data-label="已开单">{formatMoney(st.invoiced)}</td>
                      <td className="num m-hide" data-label="已收">{formatMoney(st.collected)}</td>
                      <td className="num m-hide" data-label="未收">
                        {st.outstanding > 0 ? (
                          <span className="text-alert">{formatMoney(st.outstanding)}</span>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                    </LedgerRow>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
