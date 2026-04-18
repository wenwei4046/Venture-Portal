import Link from 'next/link'
import { notFound } from 'next/navigation'
import dayjs from 'dayjs'
import { requireRole } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { formatMoney } from '@/lib/utils'
import { submitForApproval, approveVoucher, executeVoucher, voidVoucher } from '../actions'
import VoucherActions from './_components/VoucherActions'

const POOL_LABELS: Record<string, string> = {
  venture_pool: 'Venture Pool',
  dept_pool_director: 'Director Pool',
  dept_pool_marketing: 'Marketing Dept Pool',
  dept_pool_finance: 'Finance Dept Pool',
  dept_pool_hr: 'HR Dept Pool',
  invoice_payout_pool: 'Invoice Payout Pool',
}

interface Props {
  params: Promise<{ id: string }>
}

export default async function PaymentDetailPage({ params }: Props) {
  const user = await requireRole(['principal', 'finance'])
  const { id } = await params
  const supabase = await createClient()

  const { data: voucher, error } = await supabase
    .from('payment_vouchers')
    .select('*, payment_categories(label)')
    .eq('id', id)
    .single()

  if (error || !voucher) notFound()

  // Resolve names
  let payeeCompanyName: string | null = null
  if (voucher.payee_company_id) {
    const { data: c } = await supabase.from('companies').select('name, short_code').eq('id', voucher.payee_company_id).single()
    if (c) payeeCompanyName = `${c.name} (${c.short_code})`
  }

  let bankName: string | null = null
  if (voucher.bank_account_id) {
    const { data: b } = await supabase.from('bank_accounts').select('bank_name, account_number').eq('id', voucher.bank_account_id).single()
    if (b) bankName = `${b.bank_name} — ${b.account_number}`
  }

  let approvedByName: string | null = null
  if (voucher.approved_by) {
    const { data: u } = await supabase.from('users').select('name').eq('id', voucher.approved_by).single()
    if (u) approvedByName = u.name
  }

  let createdByName: string | null = null
  {
    const { data: u } = await supabase.from('users').select('name').eq('id', voucher.created_by).single()
    if (u) createdByName = u.name
  }

  // Attachments
  const { data: attachments } = await supabase
    .from('payment_attachments')
    .select('*')
    .eq('voucher_id', id)
    .order('uploaded_at', { ascending: false })

  // Bank balance for approval check display
  let bankBalance: number | null = null
  if (bankName && voucher.bank_account_id) {
    const { data: bankData } = await supabase
      .from('bank_accounts')
      .select('current_balance')
      .eq('id', voucher.bank_account_id)
      .single()
    if (bankData) bankBalance = Number(bankData.current_balance)
  }

  const isPrincipal = user.role === 'principal'
  const isFinance = user.role === 'finance'

  // Derive display values
  const categoryLabel = (voucher.payment_categories as { label: string } | null)?.label
    ?? (voucher.category_code ? voucher.category_code.replace(/_/g, ' ') : null)

  // Phase 7 Step 16: debit pool labels come from payment_voucher_sources
  // (source_pool column is deprecated). Credit keeps target_pool as before.
  let poolLabel: string | null = null
  if (voucher.direction === 'credit') {
    poolLabel = voucher.target_pool
      ? (POOL_LABELS[voucher.target_pool] ?? voucher.target_pool.replace(/_/g, ' '))
      : null
  } else {
    const { data: pvsRows } = await supabase
      .from('payment_voucher_sources')
      .select('pool, amount')
      .eq('voucher_id', id)
      .order('amount', { ascending: false })
    if (pvsRows && pvsRows.length > 0) {
      poolLabel = pvsRows
        .map((r) => POOL_LABELS[r.pool] ?? r.pool.replace(/_/g, ' '))
        .join(' + ')
    } else if (voucher.source_pool) {
      // Legacy fallback for any row that somehow missed the mig 103 backfill
      poolLabel = POOL_LABELS[voucher.source_pool] ?? voucher.source_pool.replace(/_/g, ' ')
    }
  }

  return (
    <div>
      <Link href="/payments" className="text-sm text-muted hover:text-accent font-sans transition-colors">
        ← Back to Payments
      </Link>

      {/* ── Header ── */}
      <div className="flex items-baseline justify-between mt-3 mb-10">
        <div>
          {categoryLabel ? (
            <p className="font-serif italic text-accent text-base mb-1 capitalize">
              {categoryLabel}
            </p>
          ) : null}
          <h1 className="font-serif text-3xl text-ink">{voucher.voucher_no ?? 'Draft'}</h1>
          <p className="font-mono text-xs text-muted mt-1">
            Created by {createdByName ?? 'Unknown'} on {dayjs(voucher.created_at).format('D MMM YYYY HH:mm')}
          </p>
        </div>
        <StatusBadge status={voucher.status} />
      </div>

      {/* ── Details grid ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 mb-12 pb-12 border-b border-hairline">
        <div className="lg:col-span-5">
          <div className="font-serif italic text-graphite text-sm mb-1">Amount</div>
          <div className="font-serif text-[44px] md:text-hero text-ink leading-none">
            {voucher.direction === 'credit' ? '+' : ''}{formatMoney(Number(voucher.amount))}
          </div>
          <div className="mt-3 space-y-1">
            {bankName ? (
              <div className="font-mono text-xs text-muted">
                {voucher.direction === 'debit' ? 'Pay from:' : 'Receive into:'} {bankName}
              </div>
            ) : null}
            {poolLabel ? (
              <div className="font-mono text-xs text-muted">
                {voucher.direction === 'debit' ? 'Deduct from pool:' : 'Credit to pool:'}{' '}
                <span className="text-ink">{poolLabel}</span>
              </div>
            ) : null}
          </div>
        </div>

        <div className="lg:col-span-7 space-y-4">
          <div>
            <div className="font-serif italic text-graphite text-sm mb-1">
              {voucher.direction === 'debit' ? 'Pay to' : 'Received from'}
            </div>
            <div className="font-serif text-xl text-ink">{voucher.payee_name}</div>
            {payeeCompanyName ? (
              <div className="font-mono text-xs text-muted mt-1">{payeeCompanyName}</div>
            ) : null}
          </div>

          <div>
            <div className="font-serif italic text-graphite text-sm mb-1">Description</div>
            <p className="font-serif text-md text-ink whitespace-pre-wrap">{voucher.description}</p>
          </div>

          {voucher.payment_method ? (
            <div>
              <div className="font-serif italic text-graphite text-sm mb-1">Payment method</div>
              <div className="font-serif text-md text-ink">{voucher.payment_method.replace('_', ' ')}</div>
            </div>
          ) : null}

          {voucher.notes ? (
            <div>
              <div className="font-serif italic text-graphite text-sm mb-1">Notes</div>
              <p className="font-serif italic text-graphite text-sm">{voucher.notes}</p>
            </div>
          ) : null}
        </div>
      </div>

      {/* ── Audit trail ── */}
      <section className="mb-12">
        <h2 className="font-serif text-xl text-ink mb-4">Audit trail</h2>
        <div className="space-y-3 max-w-3xl">
          <TrailItem
            label="Created"
            by={createdByName}
            at={voucher.created_at}
          />
          {voucher.status !== 'draft' ? (
            <TrailItem
              label="Submitted for approval"
              at={voucher.updated_at}
            />
          ) : null}
          {voucher.approved_at ? (
            <TrailItem
              label={voucher.status === 'voided' ? 'Voided' : 'Approved'}
              by={approvedByName}
              at={voucher.approved_at}
            />
          ) : null}
          {voucher.executed_at ? (
            <TrailItem
              label="Executed (paid)"
              at={voucher.executed_at}
              extra={voucher.payment_reference ? `Ref: ${voucher.payment_reference}` : undefined}
            />
          ) : null}
        </div>
      </section>

      {/* ── Attachments ── */}
      <section className="mb-12">
        <h2 className="font-serif text-xl text-ink mb-1">Attachments</h2>
        <p className="font-serif italic text-graphite text-sm mb-4">
          Contracts, invoices, receipts, photos — evidence for the Principal to review.
        </p>
        {(attachments ?? []).length === 0 ? (
          <div className="border border-hairline rounded-md bg-surface p-6 text-center">
            <p className="font-serif italic text-muted text-sm">
              No attachments yet. Upload via Supabase Storage (coming soon).
            </p>
          </div>
        ) : (
          <div className="border border-hairline rounded-md bg-surface divide-y divide-hairline">
            {(attachments ?? []).map((a) => (
              <div key={a.id} className="flex items-center justify-between px-5 py-3">
                <div>
                  <div className="font-serif text-sm text-ink">{a.file_name}</div>
                  <div className="font-mono text-xs text-muted">{a.file_type} · {a.description ?? ''}</div>
                </div>
                <div className="font-mono text-xs text-muted">
                  {dayjs(a.uploaded_at).format('D MMM HH:mm')}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Actions ── */}
      <VoucherActions
        voucherId={voucher.id}
        status={voucher.status}
        amount={Number(voucher.amount)}
        bankBalance={bankBalance}
        bankName={bankName}
        isPrincipal={isPrincipal}
        isFinance={isFinance}
        submitForApproval={submitForApproval}
        approveVoucher={approveVoucher}
        executeVoucher={executeVoucher}
        voidVoucher={voidVoucher}
      />
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    draft: 'text-muted',
    pending_approval: 'text-alert',
    approved: 'text-accent',
    paid: 'text-ledger',
    voided: 'text-danger',
  }
  return (
    <span className={`status-morph font-serif italic text-md ${styles[status] ?? 'text-muted'}`}>
      {status.replace('_', ' ')}
    </span>
  )
}

function TrailItem({ label, by, at, extra }: { label: string; by?: string | null; at: string; extra?: string }) {
  return (
    <div className="flex items-baseline gap-3 text-sm">
      <div className="w-2 h-2 rounded-full bg-accent mt-1.5 shrink-0" />
      <div>
        <span className="font-serif text-ink">{label}</span>
        {by ? <span className="font-serif italic text-graphite"> by {by}</span> : null}
        <span className="font-mono text-xs text-muted ml-2">
          {dayjs(at).format('D MMM YYYY HH:mm')}
        </span>
        {extra ? <span className="font-mono text-xs text-muted ml-2">· {extra}</span> : null}
      </div>
    </div>
  )
}
