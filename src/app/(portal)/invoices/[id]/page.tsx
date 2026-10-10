import Link from 'next/link'
import { notFound } from 'next/navigation'
import dayjs from 'dayjs'
import { requirePermission } from '@/lib/auth'
import { canDo } from '@/lib/permission-actions'
import { createClient } from '@/lib/supabase/server'
import { formatMoney } from '@/lib/utils'
import { officeToday } from '@/lib/office-time'
import { billingModeLabel, invoiceParty } from '@/lib/invoice-labels'
import { extraBillingModeOptions, primedRegistryRows } from '@/lib/dept-registry'
import type { AccountType } from '@/lib/coa'
import { StatCard, StatCards } from '@/components/sheet/StatCard'
import DetailGroups, { type DetailGroup } from '@/components/sheet/DetailGroups'
import ReturnLink from '@/components/layout/ReturnLink'
import InvoicePageActions from './_components/InvoicePageActions'
import CopyInvoiceLink from './_components/CopyInvoiceLink'

// An invoice's own page (2026-10-09, the user's Claude Design handoff — the
// Finance revamp). Until now an invoice opened as a popup over Service
// Billing; the handoff gives it a page: the number as the title with its
// status chip and the billing mode in the eyebrow, four cards — the total,
// what is received, what remains, when it is due — the details in groups, the
// description, the invoice items (what is billed) kept apart from the contra
// items (the credit notes against it) and from the receipts, and what Finance
// can do to it in its present status. "← Back to Service Billing" is Back when
// the list is where the reader came from, so the list keeps its place.

interface Props {
  params: Promise<{ id: string }>
}

const r2 = (n: number) => Math.round(n * 100) / 100

export default async function InvoicePage({ params }: Props) {
  const user = await requirePermission('billing')
  const { id } = await params
  const supabase = await createClient()

  const { data: inv, error } = await supabase
    .from('invoices')
    .select(
      'id, invoice_no, company_id, period_month, billing_mode, total_amount, status, billable_to_type, billable_to_department_id, billable_to_freetext_name, billable_to_freetext_address, billable_to_freetext_phone, billable_to_freetext_email, description, invoice_date, due_date, reference_no, category_code, created_at, settlement_voucher_id',
    )
    .eq('id', id)
    .single()
  if (error || !inv) notFound()

  const [{ data: lineRows }, { data: receiptRows }, { data: cnRows }, { data: cos }, { data: depts }, { data: coa }, { data: banks }, { data: batchVoucher }] =
    await Promise.all([
      supabase.from('invoice_lines').select('id, line_no, description, amount, category_code').eq('invoice_id', id).order('line_no'),
      // Receipts recorded against it (a part payment, a single settle).
      supabase
        .from('payment_vouchers')
        .select('id, voucher_no, payment_date, amount')
        .eq('invoice_id', id)
        .eq('direction', 'credit')
        .neq('status', 'voided')
        .order('payment_date'),
      supabase.from('credit_notes').select('id, credit_note_no, amount, reason, status, created_at').eq('invoice_id', id).order('created_at', { ascending: false }),
      supabase.from('companies').select('id, name, short_code, is_active'),
      supabase.from('departments').select('id, name').order('name'),
      supabase.from('chart_of_accounts').select('code, name, type, parent_code').eq('is_active', true).order('code'),
      supabase.from('bank_accounts').select('id, bank_name, account_number, is_primary').eq('status', 'active').order('is_primary', { ascending: false }),
      // A consolidated receipt that settled it with others points no invoice_id
      // back; the invoice points at it.
      inv.settlement_voucher_id
        ? supabase.from('payment_vouchers').select('id, voucher_no, payment_date, amount').eq('id', inv.settlement_voucher_id).maybeSingle()
        : Promise.resolve({ data: null as { id: string; voucher_no: string | null; payment_date: string | null; amount: number } | null }),
    ])

  const companyRows = (cos ?? []) as Array<{ id: string; name: string; short_code: string | null; is_active?: boolean | null }>
  const companyMap = new Map(companyRows.map((c) => [c.id, { name: c.name, code: c.short_code }]))
  const departmentMap = new Map(((depts ?? []) as Array<{ id: string; name: string }>).map((d) => [d.id, d.name]))
  const accounts = (coa ?? []) as Array<{ code: string; name: string; type: string; parent_code: string | null }>
  const accountName = new Map(accounts.map((a) => [a.code, a.name]))
  const extraModes = extraBillingModeOptions(primedRegistryRows())

  const total = Number(inv.total_amount)
  const status = inv.status as string
  const isDraft = status === 'draft'
  const isIssued = status === 'issued'
  const isPaid = status === 'paid' || status === 'paid_via_netting'
  const isVoided = status === 'voided'
  const party = invoiceParty(inv, companyMap, departmentMap)
  const mode = billingModeLabel(inv.billing_mode, extraModes)
  const period = dayjs(inv.period_month).format('YYYY-MM')
  const listHref = `/statements?period=${period}`
  const here = `/invoices/${inv.id}`

  // What it bills: its lines, or — a simple invoice — the invoice itself.
  const storedLines = ((lineRows ?? []) as Array<{ id: string; description: string | null; amount: number; category_code: string | null }>).map((l) => ({
    id: l.id,
    description: l.description,
    amount: Number(l.amount),
    category_code: l.category_code,
  }))
  const lines =
    storedLines.length > 0
      ? storedLines
      : [{ id: 'invoice', description: (inv.description ?? '').trim().split(/\r?\n/)[0] || 'Invoice amount', amount: total, category_code: inv.category_code }]
  const categoryCell = (code: string | null) => (code ? `${code} · ${accountName.get(code) ?? code}` : null)
  const glCategory = inv.category_code
    ? `${accountName.get(inv.category_code) ?? inv.category_code} · ${inv.category_code}`
    : Array.from(new Set(storedLines.map((l) => l.category_code).filter((c): c is string => !!c)))
        .map((c) => accountName.get(c) ?? c)
        .join(' + ') || '—'

  // Contra: the credit notes against it. Approved ones reduce what it collects.
  const creditNotes = ((cnRows ?? []) as Array<{ id: string; credit_note_no: string | null; amount: number; reason: string | null; status: string }>).map((c) => ({
    ...c,
    amount: Number(c.amount),
  }))
  const credited = r2(creditNotes.filter((c) => c.status === 'approved').reduce((s, c) => s + c.amount, 0))

  // Money in. A consolidated receipt covers other invoices too: this
  // invoice's part of it is what it still owed when it was settled.
  const direct = ((receiptRows ?? []) as Array<{ id: string; voucher_no: string | null; payment_date: string | null; amount: number }>).map((r) => ({
    id: r.id,
    no: r.voucher_no,
    date: r.payment_date,
    amount: Number(r.amount),
    batchTotal: null as number | null,
  }))
  const directReceived = r2(direct.reduce((s, r) => s + r.amount, 0))
  const receipts = [...direct]
  if (batchVoucher && !direct.some((r) => r.no && r.no === batchVoucher.voucher_no)) {
    receipts.push({
      id: batchVoucher.id,
      no: batchVoucher.voucher_no,
      date: batchVoucher.payment_date,
      amount: isPaid ? r2(Math.max(0, total - credited - directReceived)) : 0,
      batchTotal: Number(batchVoucher.amount),
    })
  }
  const received = isPaid ? r2(Math.max(directReceived, total - credited)) : directReceived
  const remaining = isIssued ? r2(Math.max(0, total - directReceived - credited)) : isDraft ? total : 0

  const today = officeToday()
  const dueIn = inv.due_date ? dayjs(inv.due_date).diff(dayjs(today), 'day') : null
  const dueNote = isPaid
    ? 'Paid'
    : isDraft
      ? 'Draft'
      : isVoided
        ? 'Voided'
        : dueIn === null
          ? 'No due date'
          : dueIn > 1
            ? `${dueIn} days left`
            : dueIn === 1
              ? '1 day left'
              : dueIn === 0
                ? 'Due today'
                : `${-dueIn} ${dueIn === -1 ? 'day' : 'days'} past due`

  const can = {
    edit: canDo(user, 'billing', 'edit'),
    create: canDo(user, 'billing', 'create'),
    void: canDo(user, 'billing', 'void'),
    export: canDo(user, 'billing', 'export'),
    // Refunds and a department pool's settle are raised as vouchers.
    voucher: canDo(user, 'treasury', 'create'),
  }
  const hasActions = !isVoided && (can.edit || can.create || can.void || can.voucher)
  const date = (d: string | null | undefined) => (d ? dayjs(d).format('D MMM YYYY') : '—')
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
  const contact = [inv.billable_to_freetext_phone, inv.billable_to_freetext_email].filter(Boolean).join(' · ')

  const groups: DetailGroup[] = [
    {
      title: 'Billing',
      items: [
        { label: 'Billed to', value: `${party.name} · ${party.kind}`, text: true },
        { label: 'Billing mode', value: mode, text: true },
        { label: 'GL category', value: glCategory, text: true },
        { label: 'Reference no', value: inv.reference_no || '—' },
      ],
    },
    {
      title: 'Dates',
      items: [
        { label: 'Invoice date', value: date(inv.invoice_date) },
        { label: 'Due date', value: date(inv.due_date) },
        { label: 'Period', value: dayjs(inv.period_month).format('MMMM YYYY'), text: true },
      ],
    },
  ]
  if (inv.billable_to_freetext_address || contact) {
    groups.push({
      title: 'Contact',
      items: [
        ...(inv.billable_to_freetext_address ? [{ label: 'Address', value: inv.billable_to_freetext_address, text: true }] : []),
        ...(contact ? [{ label: 'Phone · Email', value: contact, text: true }] : []),
      ],
    })
  }

  const chipTone = isIssued ? ' alert' : isPaid ? ' ledger' : isVoided ? ' danger' : ''

  return (
    <div>
      <div className="mb-3">
        <ReturnLink href={listHref} alsoFrom={['/statements']} className="text-[13px] text-graphite hover:text-ink font-sans transition-colors">
          ← Back to Service Billing
        </ReturnLink>
      </div>

      {/* ───────── Header ───────── */}
      <div className="page-head">
        <div className="min-w-0">
          <div className="page-eyebrow">
            <em>I.</em> INVOICE · {mode.toUpperCase()}
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="page-title">{inv.invoice_no ?? 'Draft'}</h1>
            <span className={`chip lg${chipTone}`}>
              <i className="dot" />
              {status.replace(/_/g, ' ')}
            </span>
          </div>
          <p className="font-sans text-xs text-graphite mt-2">
            {party.name} · {party.kind}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {can.export ? (
            <Link href={`/billing/invoice-doc?id=${inv.id}`} target="_blank" rel="noopener noreferrer" className="btn-quiet-sheet">
              PDF
            </Link>
          ) : null}
          {can.create ? <CopyInvoiceLink id={inv.id} invoiceNo={inv.invoice_no} /> : null}
        </div>
      </div>

      {/* ───────── Cards ───────── */}
      <StatCards label="Invoice">
        <StatCard tone="primary" label="Total amount" value={formatMoney(total)} icon="coin" note={plural(lines.length, 'line', 'lines')} />
        <StatCard
          tone={received > 0 ? 'ledger' : 'default'}
          label="Received"
          value={formatMoney(received)}
          icon="bank"
          note={receipts[0]?.no ?? (status === 'paid_via_netting' ? 'Settled by netting' : 'Nothing received')}
        />
        <StatCard
          tone={isIssued && remaining > 0 ? 'wait' : 'default'}
          label="Remaining"
          value={formatMoney(remaining)}
          icon="clock"
          note={isIssued ? (remaining > 0 ? 'To settle' : 'Nothing left to collect') : isPaid ? 'Settled' : isDraft ? 'Not issued yet' : 'Voided'}
        />
        <StatCard label="Due" value={date(inv.due_date)} icon="calendar" note={dueNote} />
      </StatCards>

      {/* ───────── Details ───────── */}
      <DetailGroups title="Details" count="BILLING · DATES" groups={groups} />

      <section className="mb-9" aria-label="Description">
        <div className="sect-head">
          <h2>Description</h2>
          <span className="rule" aria-hidden />
        </div>
        <div className="fin-notice">
          {inv.description?.trim() ? inv.description : <span className="text-muted">— no description on this invoice —</span>}
        </div>
      </section>

      {/* ───────── Invoice items (billable) ───────── */}
      <section className="mb-9">
        <div className="sect-head">
          <h2>Invoice items</h2>
          <span className="rule" aria-hidden />
          <span className="count">{plural(lines.length, 'LINE', 'LINES')} · BILLABLE</span>
        </div>
        <div className="overflow-x-auto">
          <table className="ledger-table w-full">
            <thead>
              <tr>
                <th>Description</th>
                <th className="m-hide">Category</th>
                <th className="text-right right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={l.id}>
                  <td>{l.description?.trim() || <span className="text-muted">line {i + 1}</span>}</td>
                  <td className="m-hide text-graphite">{categoryCell(l.category_code) ?? <span className="text-muted">—</span>}</td>
                  <td className="num">{formatMoney(l.amount)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={2}>Total</td>
                <td className="num">{formatMoney(total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      {/* ───────── Contra items (credit notes) ───────── */}
      {!isDraft || creditNotes.length > 0 ? (
        <section className="mb-9">
          <div className="sect-head">
            <h2>Contra items</h2>
            <span className="rule" aria-hidden />
            <span className="count">
              {plural(creditNotes.length, 'CREDIT NOTE', 'CREDIT NOTES')}
              {credited > 0 ? ` · ${formatMoney(-credited)}` : ''}
            </span>
          </div>
          {creditNotes.length === 0 ? (
            <div className="border border-hairline rounded-md bg-surface p-5 text-center">
              <p className="font-sans text-sm text-graphite">No credit notes against this invoice.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="ledger-table w-full">
                <thead>
                  <tr>
                    <th>CN #</th>
                    <th>Status</th>
                    <th className="m-hide">Reason</th>
                    <th className="text-right right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {creditNotes.map((c) => (
                    <tr key={c.id}>
                      <td className="font-sans text-[12px] font-medium text-ink whitespace-nowrap">{c.credit_note_no ?? 'Draft'}</td>
                      <td>
                        <span className={`chip${c.status === 'approved' ? ' ledger' : c.status === 'voided' ? ' danger' : c.status === 'draft' ? ' alert' : ''}`}>
                          <i className="dot" />
                          {c.status}
                        </span>
                      </td>
                      <td className="m-hide text-graphite">{c.reason || <span className="text-muted">—</span>}</td>
                      <td className="num neg">{formatMoney(-c.amount)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={3}>Subtotal contra · approved</td>
                    <td className="num neg">{formatMoney(-credited)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </section>
      ) : null}

      {/* ───────── Receipts ───────── */}
      {!isDraft || receipts.length > 0 ? (
        <section className="mb-9">
          <div className="sect-head">
            <h2>Receipts</h2>
            <span className="rule" aria-hidden />
            <span className="count">{plural(receipts.length, 'RECEIPT', 'RECEIPTS')}</span>
          </div>
          {receipts.length === 0 ? (
            <div className="border border-hairline rounded-md bg-surface p-5 text-center">
              <p className="font-sans text-sm text-graphite">No money received against this invoice yet.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="ledger-table w-full">
                <thead>
                  <tr>
                    <th>Receipt #</th>
                    <th>Date</th>
                    <th className="text-right right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {receipts.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <span className="block font-sans text-[12px] font-medium text-ink whitespace-nowrap">{r.no ?? '—'}</span>
                        {r.batchTotal !== null ? (
                          <span className="block font-sans text-[11px] text-muted">consolidated receipt · {formatMoney(r.batchTotal)} in all</span>
                        ) : null}
                      </td>
                      <td className="text-graphite whitespace-nowrap">{date(r.date)}</td>
                      <td className="num text-ledger">{formatMoney(r.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}

      {/* ───────── Actions ───────── */}
      {hasActions ? (
        <section className="mb-6">
          <div className="sect-head">
            <h2>Actions</h2>
            <span className="rule" aria-hidden />
            <span className="count">FINANCE</span>
          </div>
          <InvoicePageActions
            invoice={{
              id: inv.id,
              invoiceNo: inv.invoice_no,
              status,
              billableToType: inv.billable_to_type,
              totalAmount: total,
            }}
            editInitial={{
              total_amount: total,
              category_code: inv.category_code ?? null,
              description: inv.description ?? null,
              invoice_date: inv.invoice_date ?? null,
              due_date: inv.due_date ?? null,
              reference_no: inv.reference_no ?? null,
              billing_mode: inv.billing_mode ?? null,
              billable_to_type: inv.billable_to_type ?? null,
              company_id: inv.company_id ?? null,
              billable_to_department_id: inv.billable_to_department_id ?? null,
              billable_to_freetext_name: inv.billable_to_freetext_name ?? null,
              billable_to_freetext_address: inv.billable_to_freetext_address ?? null,
              billable_to_freetext_phone: inv.billable_to_freetext_phone ?? null,
              billable_to_freetext_email: inv.billable_to_freetext_email ?? null,
              period_month: inv.period_month ?? null,
            }}
            lines={storedLines.map((l) => ({ description: l.description, amount: l.amount, category_code: l.category_code }))}
            remaining={remaining}
            settled={isPaid || directReceived > 0}
            voidable={isIssued && directReceived <= 0 && credited <= 0}
            payeeLabel={party.name}
            listHref={listHref}
            here={here}
            today={today}
            categories={accounts.map((a) => ({ code: a.code, label: a.name, type: a.type as AccountType, parent_code: a.parent_code }))}
            companies={companyRows.filter((c) => c.is_active !== false).map((c) => ({ id: c.id, name: c.name }))}
            departments={Array.from(departmentMap, ([did, name]) => ({ id: did, name }))}
            extraModes={extraModes}
            banks={((banks ?? []) as Array<{ id: string; bank_name: string; account_number: string | null }>).map((b) => ({
              id: b.id,
              label: b.account_number ? `${b.bank_name} ··${b.account_number.slice(-4)}` : b.bank_name,
            }))}
            can={can}
          />
        </section>
      ) : null}
    </div>
  )
}
