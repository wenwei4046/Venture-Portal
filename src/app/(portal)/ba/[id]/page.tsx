import { notFound } from 'next/navigation'
import dayjs from 'dayjs'
import type { SupabaseClient } from '@supabase/supabase-js'
import { requirePermission } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { officeToday } from '@/lib/office-time'
import { calcBa } from '@/lib/ba'
import { formatMoney, formatMoneyBare } from '@/lib/utils'
import { StatCard, StatCards } from '@/components/sheet/StatCard'
import DetailGroups from '@/components/sheet/DetailGroups'
import ReturnLink from '@/components/layout/ReturnLink'
import { BaStatusChip, type BaRow } from '../_components/BaView'
import BaDetailActions, { BaDocuments } from './_components/BaDetailActions'

// A financing's own page (2026-10-09, the user's Claude Design handoff —
// Invoice Financing): the BA reference as the title with its status chip and
// the borrower and bank under it; six cards — the face, what the borrower is
// charged, what HC is owed, HV's margin, when it matures, the interest
// billing; the terms, dates, billing and the borrower's facility in groups;
// the bank's documents; and what Finance can do.

export const dynamic = 'force-dynamic'

const baRef = (id: string) => `BA-${id.slice(0, 8)}`

export default async function BaPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission('treasury')
  const { id } = await params
  const supabase = (await createClient()) as unknown as SupabaseClient

  const { data: b } = await supabase.from('ba_facilities').select('*').eq('id', id).maybeSingle()
  if (!b) notFound()
  const ba = b as Record<string, unknown>
  const companyId = (ba.borrower_company_id as string | null) ?? null

  const [{ data: company }, { data: limit }, { data: siblings }, { data: invoice }, { data: pv }, { data: attachments }, { data: bankRows }] = await Promise.all([
    companyId ? supabase.from('companies').select('name, short_code').eq('id', companyId).maybeSingle() : Promise.resolve({ data: null }),
    companyId ? supabase.from('ba_limits').select('limit_amount').eq('company_id', companyId).maybeSingle() : Promise.resolve({ data: null }),
    // The borrower's active financings: what its limit has in use.
    companyId
      ? supabase.from('ba_facilities').select('id, face_amount').eq('borrower_company_id', companyId).eq('status', 'active')
      : Promise.resolve({ data: [] }),
    supabase.from('invoices').select('invoice_no, status').eq('reference_no', baRef(id)).neq('status', 'voided').maybeSingle(),
    supabase
      .from('payment_vouchers')
      .select('voucher_no, status')
      .eq('reference_type', 'ba_interest')
      .eq('reference_id', id)
      .in('status', ['draft', 'pending_approval', 'approved', 'paid'])
      .maybeSingle(),
    supabase.from('ba_attachments').select('id, ba_id, file_name').eq('ba_id', id).order('created_at'),
    supabase.from('bank_accounts').select('id, bank_name, account_number, is_primary').eq('status', 'active').order('is_primary', { ascending: false }),
  ])

  const co = company as { name: string; short_code: string | null } | null
  const borrower = co ? (co.short_code ? `${co.name} (${co.short_code})` : co.name) : ((ba.borrower_name as string | null) ?? '—')
  const row: BaRow = {
    id,
    baNo: (ba.ba_no as string | null) ?? null,
    bankName: (ba.bank_name as string | null) ?? null,
    faceAmount: Number(ba.face_amount),
    bankAnnualRate: Number(ba.bank_annual_rate),
    startDate: ba.start_date as string,
    tenorDays: Number(ba.tenor_days),
    maturityDate: ba.maturity_date as string,
    chargeRateMonthly: Number(ba.charge_rate_monthly),
    hcRateMonthly: Number(ba.hc_rate_monthly),
    borrower,
    borrowerCompanyId: companyId,
    status: ba.status as BaRow['status'],
    notes: (ba.notes as string | null) ?? null,
    interestInvoice: invoice ? { no: (invoice as { invoice_no: string | null }).invoice_no, status: (invoice as { status: string }).status } : null,
    interestPv: pv ? { no: (pv as { voucher_no: string | null }).voucher_no, status: (pv as { status: string }).status } : null,
    attachments: ((attachments ?? []) as Array<{ id: string; file_name: string }>).map((a) => ({ id: a.id, name: a.file_name })),
  }
  const c = calcBa({
    face: row.faceAmount,
    bankAnnualRate: row.bankAnnualRate,
    days: row.tenorDays,
    chargeRateMonthly: row.chargeRateMonthly,
    hcRateMonthly: row.hcRateMonthly,
  })
  const limitAmount = Number((limit as { limit_amount: number } | null)?.limit_amount ?? 0)
  const used = ((siblings ?? []) as Array<{ face_amount: number }>).reduce((s, x) => s + Number(x.face_amount), 0)
  const active = row.status === 'active'
  const daysLeft = dayjs(row.maturityDate).diff(officeToday(), 'day')
  const pct = (r: number) => `${(r * 100).toFixed(2)}%`
  const date = (d: string) => dayjs(d).format('D MMM YYYY')
  const billed = !!row.interestInvoice
  const banks = ((bankRows ?? []) as Array<{ id: string; bank_name: string; account_number: string | null }>).map((x) => ({
    id: x.id,
    label: `${x.bank_name}${x.account_number ? ` — ${x.account_number}` : ''}`,
  }))

  return (
    <div>
      <div className="mb-3">
        <ReturnLink href="/ba" className="text-[13px] text-graphite hover:text-ink font-sans transition-colors">
          ← Back to Invoice Financing
        </ReturnLink>
      </div>

      <div className="page-head">
        <div className="min-w-0">
          <div className="page-eyebrow">
            <em>I.</em> TREASURY · INVOICE FINANCING
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="page-title">{row.baNo ?? baRef(id)}</h1>
            <BaStatusChip row={row} large />
          </div>
          <p className="font-sans text-xs text-graphite mt-2">
            {borrower}
            {row.bankName ? ` · ${row.bankName}` : ''}
          </p>
        </div>
      </div>

      <StatCards label="Financing">
        <StatCard tone="primary" label="Face amount" value={formatMoney(row.faceAmount)} icon="bank" note={row.bankName ?? '—'} />
        <StatCard tone="ledger" label="Charge borrower" value={formatMoney(c.chargeToBorrower)} icon="send" note={`${pct(row.chargeRateMonthly)} /mo · ${row.tenorDays} days · bill 5028`} />
        <StatCard tone="danger" label="Owe HC" value={formatMoney(c.oweToHc)} icon="wallet" note={`${pct(row.hcRateMonthly)} /mo · ${row.tenorDays} days · pay 6001`} />
        <StatCard label="HV margin" value={formatMoney(c.margin)} icon="trend" note="Charge − owe HC" />
        <StatCard
          tone={active && daysLeft <= 14 ? 'wait' : 'default'}
          label="Matures"
          value={date(row.maturityDate)}
          icon="calendar"
          note={!active ? (row.status === 'settled' ? 'Settled' : 'Cancelled') : daysLeft < 0 ? `Overdue ${-daysLeft}d` : `${daysLeft} days left`}
        />
        <StatCard
          tone={billed ? 'ledger' : 'wait'}
          label="Interest billing"
          value={billed ? 'Billed' : 'To bill'}
          icon="receipt"
          note={row.interestInvoice?.no ?? 'Not invoiced yet'}
        />
      </StatCards>

      <DetailGroups
        title="Details"
        count="TERMS · DATES · BILLING"
        groups={[
          {
            title: 'Terms',
            items: [
              { label: 'Borrower', value: borrower, text: true },
              { label: 'Bank', value: row.bankName ?? '—', text: true },
              { label: 'Face amount', value: formatMoneyBare(row.faceAmount) },
              { label: 'Bank rate', value: `${pct(row.bankAnnualRate)} p.a. (ref)` },
              { label: 'Charge', value: `${pct(row.chargeRateMonthly)} /mo` },
              { label: 'To HC', value: `${pct(row.hcRateMonthly)} /mo` },
            ],
          },
          {
            title: 'Dates',
            items: [
              { label: 'Start date', value: date(row.startDate) },
              { label: 'Maturity', value: date(row.maturityDate) },
              { label: 'Days', value: String(row.tenorDays) },
            ],
          },
          {
            title: 'Billing',
            items: [
              { label: 'Interest billing', value: billed ? 'Billed' : 'To bill', text: true },
              { label: 'Invoice', value: row.interestInvoice?.no ?? '—' },
              { label: 'Charge borrower', value: formatMoneyBare(c.chargeToBorrower) },
              { label: 'Owe HC', value: formatMoneyBare(c.oweToHc) },
              { label: 'Bank interest (ref)', value: `${formatMoneyBare(c.bankInterest)} · HC's cost` },
            ],
          },
          {
            title: `Facility · ${co?.short_code ?? borrower}`,
            items: [
              { label: 'Limit', value: limitAmount > 0 ? formatMoneyBare(limitAmount) : 'No limit set', text: limitAmount <= 0 },
              { label: 'Active (used)', value: formatMoneyBare(used) },
              { label: 'Available', value: limitAmount > 0 ? formatMoneyBare(limitAmount - used) : '—' },
              { label: 'Of limit', value: limitAmount > 0 ? `${Math.round((used / limitAmount) * 100)}%` : '—' },
            ],
          },
          ...(row.notes ? [{ title: 'Notes', items: [{ label: 'Notes', value: row.notes, text: true }] }] : []),
        ]}
      />

      <section className="mb-9" aria-label="Documents">
        <div className="sect-head">
          <h2>Documents</h2>
          <span className="rule" aria-hidden />
          <span className="count">
            {row.attachments.length} {row.attachments.length === 1 ? 'FILE' : 'FILES'}
          </span>
        </div>
        <div className="fin-notice">
          <BaDocuments row={row} />
        </div>
      </section>

      <section className="mb-6">
        <div className="sect-head">
          <h2>Actions</h2>
          <span className="rule" aria-hidden />
          <span className="count">{active ? 'FINANCE' : 'CLOSED'}</span>
        </div>
        <BaDetailActions row={row} banks={banks} />
      </section>
    </div>
  )
}
