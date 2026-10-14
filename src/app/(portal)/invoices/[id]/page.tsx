import { notFound } from 'next/navigation'
import type { SupabaseClient } from '@supabase/supabase-js'
import { requirePermission, requirePage } from '@/lib/auth'
import { canDo } from '@/lib/permission-actions'
import { createClient } from '@/lib/supabase/server'
import { officeMonth, officeTime, officeToday } from '@/lib/office-time'
import { billingModeLabel } from '@/lib/invoice-labels'
import { extraBillingModeOptions, primedRegistryRows } from '@/lib/dept-registry'
import { invoiceChangeLine, invoiceTrail, type DatedInvoiceChange, type InvoiceChange } from '@/lib/invoice-audit'
import type { AccountType } from '@/lib/coa'
import ReturnLink from '@/components/layout/ReturnLink'
import { FullAudit, FullCard, FullFact, FullPanelRow, FullTrail, fullDay, fullStyles as s } from '@/components/finv/FullParts'
import {
  dueNote,
  statusText,
  statusTone,
  toHubInvoice,
  type HubCreditNoteLine,
  type InvoiceContext,
  type InvoiceRowIn,
} from '@/app/(portal)/statements/_lib/invoice-model'
import InvoicePageSteps from './_components/InvoicePageSteps'
import CopyInvoice from './_components/CopyInvoice'

// An invoice's full page (2026-10-15, the Finance revamp v2 — D06 of
// `.design/fin-r2/handoff` for the Invoice drawer's *View full page ↗*; the
// prototype draws every record's full page one way, its `fullModel`): *←
// Invoices* and the crumb; *Invoice · {billing mode}*, the number with its
// status, Amount · To · Created by, PDF and Copy; then the numbered cards —
// Line items, Receipts, its credit notes, the description when it says more
// than its lines, the Trail and the Audit log — beside the sticky dark panel:
// the amount, its party, Balance and Billing (the design's side groups), and
// the steps this reader may take. Every figure is the hub's (`toHubInvoice`),
// every step the hub's drawer's, through the same dialogs and actions.

interface Props {
  params: Promise<{ id: string }>
}

const INVOICE_COLUMNS =
  'id, invoice_no, company_id, period_month, billing_mode, total_amount, status, billable_to_type, billable_to_department_id, billable_to_freetext_name, billable_to_freetext_address, billable_to_freetext_phone, billable_to_freetext_email, description, invoice_date, due_date, reference_no, category_code, settlement_voucher_id, contract_id, created_by, created_at'

const f2 = (n: number) => (n < 0 ? '-' : '') + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const rm = (n: number) => `RM ${f2(n)}`
const stamp = (at: string) => officeTime(at).format('DD MMM YYYY · HH:mm')
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
const MONTH = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const monthOf = (iso: string) => `${MONTH[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`

type Audited = InvoiceChange & { id: number; occurred_at: string; actor_id: string | null; actor_name: string | null }

export default async function InvoicePage({ params }: Props) {
  await requirePage('/invoices/[id]')
  const user = await requirePermission('billing')
  const { id } = await params
  const supabase = await createClient()

  const { data: row, error } = await supabase.from('invoices').select(INVOICE_COLUMNS).eq('id', id).single()
  if (error || !row) notFound()
  const inv = row as unknown as InvoiceRowIn & { created_by: string | null; created_at: string }

  // audit_changes postdates database.types.ts — asked through the untyped client.
  const db = supabase as unknown as SupabaseClient
  const [
    { data: lineRows },
    { data: receiptRows },
    { data: cnRows },
    { data: cos },
    { data: depts },
    { data: coa },
    { data: banks },
    { data: batchVoucher },
    { data: creator },
    ownAudit,
  ] = await Promise.all([
    supabase.from('invoice_lines').select('description, amount, category_code').eq('invoice_id', id).order('line_no'),
    // Receipts recorded against it (a part payment, a single settle).
    supabase
      .from('payment_vouchers')
      .select('voucher_no, payment_date, amount')
      .eq('invoice_id', id)
      .eq('direction', 'credit')
      .neq('status', 'voided')
      .order('payment_date'),
    supabase.from('credit_notes').select('id, credit_note_no, amount, reason, status, created_at').eq('invoice_id', id).order('created_at', { ascending: false }),
    // Every company and department: an invoice keeps its party's name after it goes inactive (or internal).
    supabase.from('companies').select('id, name, short_code, is_active').order('short_code'),
    supabase.from('departments').select('id, name, is_internal').order('name'),
    supabase.from('chart_of_accounts').select('code, name, type, parent_code').eq('is_active', true).order('code'),
    supabase.from('bank_accounts').select('id, bank_name, account_number, is_primary').eq('status', 'active').order('is_primary', { ascending: false }),
    // A consolidated receipt that settled it with others points no invoice_id back; the invoice points at it.
    inv.settlement_voucher_id
      ? supabase.from('payment_vouchers').select('voucher_no, payment_date, amount').eq('id', inv.settlement_voucher_id).maybeSingle()
      : Promise.resolve({ data: null as { voucher_no: string | null; payment_date: string | null; amount: number } | null }),
    inv.created_by ? supabase.from('users').select('name').eq('id', inv.created_by).maybeSingle() : Promise.resolve({ data: null as { name: string | null } | null }),
    // The audit log: the invoice's own changes (what this reader's permissions open).
    db.rpc('audit_changes', { p_tables: ['invoices'], p_row: id, p_limit: 60 }).then((r) => r),
  ])
  const creditNoteRows = ((cnRows ?? []) as Array<{ id: string; credit_note_no: string | null; amount: number; reason: string | null; status: string }>).map(
    (c): HubCreditNoteLine => ({ id: c.id, no: c.credit_note_no, amount: Number(c.amount), status: c.status, reason: c.reason }),
  )
  // …and its credit notes' (up to twelve).
  const cnAudit = await Promise.all(
    creditNoteRows.slice(0, 12).map((c) => db.rpc('audit_changes', { p_tables: ['credit_notes'], p_row: c.id, p_limit: 5 }).then((r) => r)),
  )

  // ── The invoice as the hub reads it ──
  const companyRows = (cos ?? []) as Array<{ id: string; name: string; short_code: string | null; is_active: boolean | null }>
  const departmentRows = (depts ?? []) as Array<{ id: string; name: string; is_internal: boolean | null }>
  const accountRows = (coa ?? []) as Array<{ code: string; name: string; type: string; parent_code: string | null }>
  const extraModes = extraBillingModeOptions(primedRegistryRows())
  const ctx: InvoiceContext = {
    companies: new Map(companyRows.map((c) => [c.id, { name: c.name, code: c.short_code }])),
    departments: new Map(departmentRows.map((d) => [d.id, d.name])),
    accounts: new Map(accountRows.map((a) => [a.code, a.name])),
    extraModes,
    lines: new Map([[id, ((lineRows ?? []) as Array<{ description: string | null; amount: number; category_code: string | null }>).map((l) => ({ ...l, amount: Number(l.amount) }))]]),
    receipts: new Map([[id, (receiptRows ?? []) as Array<{ voucher_no: string | null; payment_date: string | null; amount: number }>]]),
    settlements: new Map(batchVoucher && inv.settlement_voucher_id ? [[inv.settlement_voucher_id, { ...batchVoucher, amount: Number(batchVoucher.amount) }]] : []),
    creditNotes: new Map([[id, creditNoteRows]]),
  }
  const h = toHubInvoice(inv, ctx)
  const no = h.no ?? 'Draft'
  const today = officeToday()
  const party = `${h.party.name} · ${h.party.kind}`
  const listHref = `/statements?period=${h.periodMonth.slice(0, 7)}-01`
  const tone = statusTone(h.status)
  const chip = statusText(h.status)

  // ── The trail and the audit log, read off the same changes ──
  const changes = [ownAudit, ...cnAudit]
    .flatMap((r) => (r.error ? [] : ((r.data ?? []) as unknown as Audited[])))
    .sort((a, b) => (a.occurred_at < b.occurred_at ? 1 : a.occurred_at > b.occurred_at ? -1 : b.id - a.id))
  const who = (c: Audited) => c.actor_name ?? (c.actor_id ? 'Removed account' : 'System')
  const mode = (m: string) => billingModeLabel(m, extraModes)
  const audit = changes.map((c) => ({ at: stamp(c.occurred_at), who: who(c), what: invoiceChangeLine(c, mode) }))
  const steps = invoiceTrail(
    {
      status: h.status,
      createdBy: creator?.name ?? null,
      createdAt: inv.created_at,
      invoiceDate: h.date,
      lastReceipt: h.receipts.reduce<string | null>((last, r) => (r.date && (!last || r.date > last) ? r.date : last), null),
    },
    changes.map((c): DatedInvoiceChange => ({ ...c, at: c.occurred_at, who: c.actor_name ?? null })),
    stamp,
  )

  const can = {
    create: canDo(user, 'billing', 'create'),
    edit: canDo(user, 'billing', 'edit'),
    void: canDo(user, 'billing', 'void'),
    approveCn: canDo(user, 'treasury', 'approve'),
    voucher: canDo(user, 'treasury', 'create'),
    listExport: canDo(user, 'treasury', 'export'),
    docExport: canDo(user, 'billing', 'export'),
  }

  // The description, when it says more than the lines already do.
  const said = h.description && !(h.lines.length === 1 && h.lines[0].description === h.description) ? h.description : null
  const contact = [inv.billable_to_freetext_phone, inv.billable_to_freetext_email].filter(Boolean).join(' · ')
  const offMonth = !h.date || h.date.slice(0, 7) !== h.periodMonth.slice(0, 7)
  // An invoice keeps its company in Edit's list though the company has since gone inactive.
  const companies = companyRows
    .filter((c) => c.is_active !== false || c.id === inv.company_id)
    .map((c) => ({ id: c.id, name: c.name, short_code: c.short_code ?? '' }))
  let n = 0

  return (
    <div className={s.root} data-fin-kit="">
      <div className={s.crumbRow}>
        <ReturnLink href={listHref} alsoFrom={['/statements']} className={s.back}>
          ← Invoices
        </ReturnLink>
        <span className={s.crumb}>Daily · Invoices · {no}</span>
      </div>

      <div className={s.head}>
        <div className={s.headText}>
          <div className={s.kicker}>Invoice · {h.mode}</div>
          <div className={s.numberRow}>
            <h1 className={s.number}>{no}</h1>
            <span className={s.pill} data-tone={tone}>
              <span className={s.pillDot} />
              {chip}
            </span>
          </div>
          <div className={s.facts}>
            <FullFact label="Amount" value={rm(h.total)} mono />
            <FullFact label="To" value={party} />
            <FullFact label="Created by" value={`${creator?.name ?? 'Unknown'} · ${stamp(inv.created_at)}`} />
          </div>
        </div>
        <div className={s.topActs}>
          {can.docExport ? (
            <a href={`/billing/invoice-doc?id=${h.id}`} target="_blank" rel="noopener noreferrer" className={s.topBtn}>
              PDF
            </a>
          ) : null}
          {can.create ? <CopyInvoice id={h.id} no={h.no} thisMonth={officeMonth()} /> : null}
        </div>
      </div>

      <div className={s.body}>
        <div className={s.cards}>
          <FullCard n={++n} title="Line items" aside={plural(h.lines.length, 'line', 'lines')}>
            <div className={s.table}>
              <div className={s.tHead}>
                <span className={`${s.tCol} ${s.tWide}`}>Item</span>
                <span className={s.tCol}>Account</span>
                <span className={s.tNum}>Amount</span>
              </div>
              {h.lines.map((l, i) => (
                <div key={i} className={s.tRow}>
                  <span className={`${s.tCol} ${s.tWide}`} title={l.description || undefined}>
                    {l.description || `Line ${i + 1}`}
                  </span>
                  <span className={s.tCol} data-sub="true" title={l.account && l.code ? `${l.account} · ${l.code}` : undefined}>
                    {l.code ? `${l.code} · ${l.account ?? l.code}` : '—'}
                  </span>
                  <span className={s.tNum}>{rm(l.amount)}</span>
                </div>
              ))}
              <div className={s.tFoot}>
                <span className={s.tCol}>Total</span>
                <span className={s.tNum}>{rm(h.total)}</span>
              </div>
            </div>
          </FullCard>

          <FullCard n={++n} title="Receipts" aside={plural(h.receipts.length, 'receipt', 'receipts')}>
            {h.receipts.length === 0 ? (
              <p className={s.none}>
                {h.status === 'paid_via_netting'
                  ? 'Settled by netting — no receipt.'
                  : h.status === 'voided'
                    ? 'Nothing was received against it.'
                    : 'No money received against this invoice yet.'}
              </p>
            ) : (
              <div className={s.table}>
                <div className={s.tHead}>
                  <span className={s.tCol}>Receipt</span>
                  <span className={`${s.tCol} ${s.tWide}`}>Date</span>
                  <span className={s.tNum}>Amount</span>
                </div>
                {h.receipts.map((r, i) => (
                  <div key={i} className={s.tRow}>
                    <span className={s.tCol}>{r.no ?? '—'}</span>
                    <span className={`${s.tCol} ${s.tWide}`} data-sub="true">
                      {r.batchTotal !== null ? `${fullDay(r.date)} · one receipt for ${rm(r.batchTotal)} in all` : fullDay(r.date)}
                    </span>
                    <span className={s.tNum} data-tone="ledger">
                      +{rm(r.amount)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </FullCard>

          {h.creditNotes.length > 0 ? (
            <FullCard n={++n} title="Credit notes" aside={plural(h.creditNotes.length, 'credit note', 'credit notes')}>
              <div className={s.table}>
                <div className={s.tHead}>
                  <span className={s.tCol}>Credit note</span>
                  <span className={`${s.tCol} ${s.tWide}`}>Status · Reason</span>
                  <span className={s.tNum}>Amount</span>
                </div>
                {h.creditNotes.map((c) => (
                  <div key={c.id} className={s.tRow}>
                    <span className={s.tCol}>{c.no ?? 'Draft'}</span>
                    <span className={`${s.tCol} ${s.tWide}`} data-sub="true" title={c.reason ?? undefined}>
                      {[c.status, c.reason].filter(Boolean).join(' · ')}
                    </span>
                    <span className={s.tNum}>−{rm(c.amount)}</span>
                  </div>
                ))}
                <div className={s.tFoot}>
                  <span className={s.tCol}>Approved</span>
                  <span className={s.tNum}>−{rm(h.credited)}</span>
                </div>
              </div>
            </FullCard>
          ) : null}

          {said ? (
            <FullCard n={++n} title="Description">
              <p className={s.prose}>{said}</p>
            </FullCard>
          ) : null}

          <FullCard n={++n} title="Trail" aside={`${steps.filter((t) => t.state !== 'todo').length} / ${steps.length} steps`}>
            <FullTrail steps={steps} />
          </FullCard>

          <FullCard n={++n} title="Audit log" aside={plural(audit.length, 'EVENT', 'EVENTS')}>
            <FullAudit rows={audit} />
          </FullCard>
        </div>

        <aside className={s.panel} data-light={tone}>
          <div className={s.pTop}>
            <span className={s.pLabel}>Invoice</span>
            <span className={s.pChip}>
              <span className={s.pChipDot} />
              {chip}
            </span>
          </div>
          <div className={s.pAmount}>{rm(h.total)}</div>
          <p className={s.pTo}>{party}</p>

          <div className={s.pGroup}>Balance</div>
          <FullPanelRow label="Received" value={rm(h.received)} mono />
          <FullPanelRow label="Remaining" value={rm(h.remaining)} mono />
          <FullPanelRow label="Due" value={fullDay(h.due)} sub={dueNote(h, today)} mono={!!h.due} />

          <div className={s.pGroup}>Billing</div>
          <FullPanelRow label="Billed to" value={h.party.name} sub={h.party.kind} />
          <FullPanelRow label="Billing mode" value={h.mode} />
          <FullPanelRow label="GL category" value={h.gl?.name ?? '—'} sub={h.gl?.code} />
          <FullPanelRow label="Reference no" value={h.reference || '—'} mono={!!h.reference} />
          <FullPanelRow label="Invoice date" value={fullDay(h.date)} mono={!!h.date} />
          {offMonth ? <FullPanelRow label="Period" value={monthOf(h.periodMonth)} /> : null}
          {inv.billable_to_freetext_address ? <FullPanelRow label="Address" value={inv.billable_to_freetext_address} /> : null}
          {contact ? <FullPanelRow label="Contact" value={contact} /> : null}

          <InvoicePageSteps
            invoice={h}
            can={can}
            today={today}
            banks={((banks ?? []) as Array<{ id: string; bank_name: string; account_number: string | null }>).map((b) => ({
              id: b.id,
              label: b.account_number ? `${b.bank_name} — ${b.account_number}` : b.bank_name,
            }))}
            companies={companies}
            departments={departmentRows.filter((d) => !d.is_internal).map((d) => ({ id: d.id, name: d.name }))}
            categories={accountRows.map((a) => ({ code: a.code, label: a.name, type: a.type as AccountType, parent_code: a.parent_code ?? null }))}
            extraModes={extraModes}
            listHref={listHref}
            here={`/invoices/${h.id}`}
          />
        </aside>
      </div>
    </div>
  )
}
