import { notFound } from 'next/navigation'
import dayjs from 'dayjs'
import type { SupabaseClient } from '@supabase/supabase-js'
import { requirePermission, requirePage } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { officeToday } from '@/lib/office-time'
import { calcBa } from '@/lib/ba'
import { formatMoney, formatMoneyBare } from '@/lib/utils'
import { StatCard, StatCards } from '@/components/sheet/StatCard'
import DetailGroups from '@/components/sheet/DetailGroups'
import ReturnLink from '@/components/layout/ReturnLink'
import { BaStatusChip } from '../_components/BaView'
import { baRef, readBaFacility } from '../_lib/ba-read'
import BaDetailActions, { BaDocuments } from './_components/BaDetailActions'

// A financing's own page (2026-10-09, the user's Claude Design handoff —
// Invoice Financing): the BA reference as the title with its status chip and
// the borrower and bank under it; six cards — the face, what the borrower is
// charged, what HC is owed, HV's margin, when it matures, the interest
// billing; the terms, dates, billing and the borrower's facility in groups;
// the bank's documents; and what Finance can do.

export const dynamic = 'force-dynamic'

export default async function BaPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePage('/ba/[id]')
  await requirePermission('treasury')
  const { id } = await params
  const supabase = (await createClient()) as unknown as SupabaseClient

  // The financing, its borrower's facility and the banks — as the Finance phone app reads them (`_lib/ba-read`).
  const facility = await readBaFacility(supabase, id)
  if (!facility) notFound()
  const { row, shortCode, limit: limitAmount, used, banks } = facility
  const borrower = row.borrower
  const c = calcBa({
    face: row.faceAmount,
    bankAnnualRate: row.bankAnnualRate,
    days: row.tenorDays,
    chargeRateMonthly: row.chargeRateMonthly,
    hcRateMonthly: row.hcRateMonthly,
  })
  const active = row.status === 'active'
  const daysLeft = dayjs(row.maturityDate).diff(officeToday(), 'day')
  const pct = (r: number) => `${(r * 100).toFixed(2)}%`
  const date = (d: string) => dayjs(d).format('D MMM YYYY')
  const billed = !!row.interestInvoice

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
            title: `Facility · ${shortCode ?? borrower}`,
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
