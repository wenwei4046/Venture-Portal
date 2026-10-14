import { notFound } from 'next/navigation'
import { requirePermission, requirePage } from '@/lib/auth'
import { canDo } from '@/lib/permission-actions'
import { createClient } from '@/lib/supabase/server'
import { officeMonth, officeToday } from '@/lib/office-time'
import ReturnLink from '@/components/layout/ReturnLink'
import { FullAudit, FullCard, FullFact, FullPanelRow, FullTrail, fullDay, fullStyles as s } from '@/components/finv/FullParts'
import { dueNote, statusText, statusTone } from '@/app/(portal)/statements/_lib/invoice-model'
import InvoicePageSteps from './_components/InvoicePageSteps'
import CopyInvoice from './_components/CopyInvoice'
import { loadInvoicePage } from './_lib/invoice-page'

// An invoice's full page (2026-10-15, the Finance revamp v2 — D06 of
// `.design/fin-r2/handoff` for the Invoice drawer's *View full page ↗*; the
// prototype draws every record's full page one way, its `fullModel`): *←
// Invoices* and the crumb; *Invoice · {billing mode}*, the number with its
// status, Amount · To · Created by, PDF and Copy; then the numbered cards —
// Line items, Receipts, its credit notes, the description when it says more
// than its lines, the Trail and the Audit log — beside the sticky dark panel:
// the amount, its party, Balance and Billing (the design's side groups), and
// the steps this reader may take. Every figure is the hub's (`toHubInvoice`),
// every step the hub's drawer's, through the same dialogs and actions. The
// reads are `loadInvoicePage`'s — the Finance phone app's record reads them too.

interface Props {
  params: Promise<{ id: string }>
}

const f2 = (n: number) => (n < 0 ? '-' : '') + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const rm = (n: number) => `RM ${f2(n)}`
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
const MONTH = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const monthOf = (iso: string) => `${MONTH[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`

export default async function InvoicePage({ params }: Props) {
  await requirePage('/invoices/[id]')
  const user = await requirePermission('billing')
  const { id } = await params
  const supabase = await createClient()

  const page = await loadInvoicePage(supabase, id)
  if (!page) notFound()
  const { invoice: h, trail: steps, audit } = page
  const no = h.no ?? 'Draft'
  const today = officeToday()
  const party = `${h.party.name} · ${h.party.kind}`
  const listHref = `/statements?period=${h.periodMonth.slice(0, 7)}-01`
  const tone = statusTone(h.status)
  const chip = statusText(h.status)

  const can = {
    create: canDo(user, 'billing', 'create'),
    edit: canDo(user, 'billing', 'edit'),
    void: canDo(user, 'billing', 'void'),
    approveCn: canDo(user, 'treasury', 'approve'),
    voucher: canDo(user, 'treasury', 'create'),
    listExport: canDo(user, 'treasury', 'export'),
    docExport: canDo(user, 'billing', 'export'),
  }
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
            <FullFact label="Created by" value={`${page.createdBy ?? 'Unknown'} · ${page.createdAt}`} />
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

          {page.said ? (
            <FullCard n={++n} title="Description">
              <p className={s.prose}>{page.said}</p>
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
          {page.offMonth ? <FullPanelRow label="Period" value={monthOf(h.periodMonth)} /> : null}
          {page.address ? <FullPanelRow label="Address" value={page.address} /> : null}
          {page.contact ? <FullPanelRow label="Contact" value={page.contact} /> : null}

          <InvoicePageSteps
            invoice={h}
            can={can}
            today={today}
            banks={page.banks}
            companies={page.companies}
            departments={page.departments}
            categories={page.categories}
            extraModes={page.extraModes}
            listHref={listHref}
            here={`/invoices/${h.id}`}
          />
        </aside>
      </div>
    </div>
  )
}
