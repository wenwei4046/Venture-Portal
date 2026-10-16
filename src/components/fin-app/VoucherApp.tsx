'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { DialogMenu, FinDialog, type DialogMenuItem } from '@/components/finv/Dialog'
import { flash } from '@/components/hrv/toast'
import { drawerStyles as d } from '@/components/finv/Drawer'
import { fd } from '@/components/finv/DrawerParts'
import { HUB_HREF, HUB_TITLE } from '@/lib/fin-app/routes'
import { openVoucherPage } from '@/app/(portal)/payments/page-actions'
import { cardLook, hubCards, plural, rm } from '@/app/(portal)/payments/_lib/hub-cards'
import type { HubCardKey, HubLedger, HubRow } from '@/app/(portal)/payments/_lib/hub-ledger'
import type { RequestItem } from '@/app/(portal)/payments/_lib/payments-hub'
import type { VoucherDetail } from '@/app/(portal)/payments/_lib/voucher-detail'
import type { VoucherPageExtras } from '@/app/(portal)/payments/_lib/voucher-page'
import type { CreatePaymentOptions } from '@/app/(portal)/payments/_lib/create-payment-options'
import { VoucherDetailBody, VoucherHero } from '@/app/(portal)/payments/_components/VoucherDetailBody'
import { REFUSED } from '@/app/(portal)/payments/_lib/voucher-refusals'
import { useVoucherSteps } from '@/app/(portal)/payments/_components/voucher-steps'
import CreatePaymentDialog from '@/app/(portal)/payments/_components/CreatePaymentDialog'
import VoucherEditSheet from './VoucherEditSheet'
import AmendDateButton from '@/app/(portal)/payments/_components/AmendDateButton'
import ReassignGlAccountButton from '@/app/(portal)/payments/[id]/_components/ReassignGlAccountButton'
import { CopyVoucherDialog } from '@/app/(portal)/payments/[id]/_components/CopyAsDraft'
import CreateReceiptDialog from '@/app/(portal)/receipts/_components/CreateReceiptDialog'
import LoanRepaymentDialog from '@/app/(portal)/receipts/_components/LoanRepaymentDialog'
import AppScreen, { PageHead, type BarButton } from './AppScreen'
import { useHubTabs } from './hub-tabs'
import { pushIntent, useStep } from './nav'
import { BankHero, ListBlock, Row, SearchRow, StackCards } from './parts'
import s from './fin-app.module.css'

// Daily › Payment and Daily › Receive in the Finance phone app (2026-10-15,
// the Finance revamp v2's phone — M02–M05, M09): the hub (its top tabs, the
// month's total, a stacked card per list, the action bar), a card's list
// (search, then name · description · amount), the payroll batches, and a
// voucher — the drawer's own parts and steps (VoucherDetailBody,
// useVoucherSteps), with what the computer's full page adds, since on a phone
// this screen is the voucher's page. Every list and figure is the desktop
// hub's (`hub-ledger.ts`, `hub-cards.ts`); every window is the desktop's,
// rising as a sheet (FinDialog on the app's surface).

export type VoucherStep =
  | { kind: 'hub' }
  | { kind: 'list'; card: HubCardKey }
  | { kind: 'batches'; batch: string | null }
  | { kind: 'record'; id: string; from: HubCardKey | null }

const f2 = (n: number) => (n < 0 ? '-' : '') + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const CARDS: readonly HubCardKey[] = ['all', 'draft', 'pending_approval', 'approved', 'paid', 'voided', 'payroll']
const asCard = (v: string | null): HubCardKey | null => (v && (CARDS as readonly string[]).includes(v) ? (v as HubCardKey) : null)

export function readVoucherStep(q: URLSearchParams): VoucherStep {
  const id = q.get('id')
  if (id) return { kind: 'record', id, from: asCard(q.get('from')) }
  const card = asCard(q.get('f'))
  if (card === 'payroll') return { kind: 'batches', batch: q.get('b') }
  if (card) return { kind: 'list', card }
  return { kind: 'hub' }
}

/** Where a step lives (its query), and the step above it. */
export function searchOfStep(step: VoucherStep): string {
  if (step.kind === 'record') return `id=${encodeURIComponent(step.id)}${step.from ? `&from=${step.from}` : ''}`
  if (step.kind === 'batches') return `f=payroll${step.batch ? `&b=${encodeURIComponent(step.batch)}` : ''}`
  if (step.kind === 'list') return `f=${step.card}`
  return ''
}
export function parentSearch(step: VoucherStep): string {
  if (step.kind === 'record') return step.from ? `f=${step.from}` : ''
  return ''
}

export interface VoucherRecord {
  detail: VoucherDetail
  extras: VoucherPageExtras | null
  canCopy: boolean
}

/** A row's own page outside the voucher flow (a loan's repayment, a fund source), in the app where it has one. */
function appPageOf(href: string): string {
  const m = /^\/(fund-out|fund-in)\/([^/?#]+)/.exec(href)
  if (m) return `${m[1] === 'fund-out' ? HUB_HREF['fund-out'] : HUB_HREF['fund-in']}?id=${encodeURIComponent(m[2])}`
  return href
}

export default function VoucherApp({
  hub,
  search,
  ledger,
  record: initialRecord,
  refused: initialRefused,
  canCreate,
  canExport = false,
  create,
  prefix,
  today,
  dept = [],
  payroll = null,
  claims = [],
}: {
  hub: 'payments' | 'receipts'
  /** The address's query as the server read it (a refresh, a link). */
  search: string
  ledger: HubLedger
  /** The voucher the address names, read with the page. */
  record: VoucherRecord | null
  refused: string | null
  canCreate: boolean
  /** Treasury · Export: the vouchers' Excel and PDF, as the route asks (2026-10-16). */
  canExport?: boolean
  /** Payments: Create payment's line, today and lists. */
  create?: { prefix: string; today: string; open: boolean; initial: CreatePaymentOptions | null } | null
  /** Receive: Create receipt's line. */
  prefix?: string
  today: string
  dept?: RequestItem[]
  payroll?: RequestItem[] | null
  claims?: RequestItem[]
}) {
  const router = useRouter()
  const receipts = hub === 'receipts'
  const [step, open, back] = useStep(readVoucherStep, search)
  const { topTabs, swipe } = useHubTabs('daily', hub)

  // ── The voucher a record screen shows ──
  const [record, setRecord] = useState<VoucherRecord | null>(initialRecord)
  const [refused, setRefused] = useState<string | null>(initialRefused)
  const load = useCallback((id: string) => {
    setRefused(null)
    void openVoucherPage(id).then(
      (res) => {
        if (res.ok) setRecord({ detail: res.detail, extras: res.extras, canCopy: res.canCopy })
        else {
          setRecord(null)
          setRefused(REFUSED[res.reason])
        }
      },
      () => {
        setRecord(null)
        setRefused('This voucher could not be read just now. Try again.')
      },
    )
  }, [])
  const recordId = step.kind === 'record' ? step.id : null
  useEffect(() => {
    if (!recordId || record?.detail.id === recordId) return
    setRecord(null)
    load(recordId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordId])

  // ── Windows ──
  const [menu, setMenu] = useState<'dept' | 'payroll' | 'claims' | 'more' | 'export' | null>(null)
  const [making, setMaking] = useState<'payment' | 'receipt' | 'loan' | null>(create?.open ? 'payment' : null)
  const [query, setQuery] = useState<Record<string, string>>({})
  const [openBatches, setOpenBatches] = useState<Set<string>>(() => new Set(step.kind === 'batches' && step.batch ? [step.batch] : []))
  // The full page's own windows, opened from the record's ⋯ (a nonce re-opens one closed before).
  const [extra, setExtra] = useState<{ kind: 'copy' | 'date' | 'gl'; nonce: number } | null>(null)
  // Edit is the app's sheet (part E4b), not the portal's /payments/[id]/edit.
  const [editing, setEditing] = useState<string | null>(null)

  const go = (next: VoucherStep) => open(searchOfStep(next))
  const backTo = () => back(parentSearch(step))

  // ── What a list shows ──
  const title = HUB_TITLE[hub]
  const cards = useMemo(() => hubCards(ledger), [ledger])
  const listRows = (card: HubCardKey): HubRow[] => {
    const q = (query[card] ?? '').trim().toLowerCase()
    return ledger.rows.filter((r) => r.cards.includes(card) && (!q || `${r.no ?? ''} ${r.name} ${r.desc} ${r.cat} ${r.pool}`.toLowerCase().includes(q)))
  }
  const openRow = (r: HubRow, from: HubCardKey) => {
    if (r.kind === 'voucher') go({ kind: 'record', id: r.id, from })
    else if (r.kind === 'batch' && r.batch) {
      setOpenBatches((prev) => new Set(prev).add(r.batch as string))
      go({ kind: 'batches', batch: r.batch })
    } else if (r.href) {
      pushIntent()
      router.push(appPageOf(r.href))
    }
  }

  // ── The hub's own bar ──
  const exportHref = (format: 'xlsx' | 'pdf') => `/payments/export?${new URLSearchParams({ format, direction: receipts ? 'credit' : 'debit' }).toString()}`
  // Payment's says *Payment* (2026-10-16, the user: *Create payment* filled its
  // button edge to edge on the phone and did not sit centred); the sheet it
  // opens is still titled Create payment.
  const createBtn: BarButton | null = canCreate
    ? receipts
      ? { key: 'receipt', label: 'Create receipt', kind: 'primary', onClick: () => setMaking('receipt') }
      : create
        ? { key: 'payment', label: 'Payment', kind: 'primary', onClick: () => setMaking('payment') }
        : null
    : null
  const hubBar: BarButton[] = receipts
    ? [
        ...(createBtn ? [createBtn, { key: 'loan', label: 'Loan repayment', onClick: () => setMaking('loan') } as BarButton] : []),
        ...(canExport ? [{ key: 'more', label: '⋯', kind: 'more', onClick: () => setMenu('export') } as BarButton] : []),
      ]
    : [
        ...(createBtn ? [createBtn] : []),
        { key: 'dept', label: dept.length > 0 ? `Dept · ${dept.length}` : 'Dept', onClick: () => setMenu('dept') },
        ...(payroll ? [{ key: 'payroll', label: payroll.length > 0 ? `Payroll · ${payroll.length}` : 'Payroll', onClick: () => setMenu('payroll') } as BarButton] : []),
        { key: 'more', label: '⋯', kind: 'more', onClick: () => setMenu('more') },
      ]
  // A queue opens on the request pressed (2026-10-16, part E4 — each queue is a page of the app now).
  const requestItems = (items: RequestItem[], page: string, openLabel: string): DialogMenuItem[] => {
    const inApp = page.startsWith('/fin-app/')
    const goTo = (id?: string) => {
      setMenu(null)
      if (inApp) pushIntent()
      router.push(inApp && id ? `${page}?f=waiting&id=${encodeURIComponent(id)}` : page)
    }
    return items.length > 0
      ? items.map((it) => ({ key: it.key, label: it.label, sub: it.sub, onClick: () => goTo(it.key) }))
      : [{ key: 'open', label: openLabel, sub: 'Nothing waiting', onClick: () => goTo() }]
  }

  // ── A record's steps (the drawer's), with the full page's own in its ⋯ ──
  const v = step.kind === 'record' && record?.detail.id === step.id ? record.detail : null
  const extras = v ? record?.extras ?? null : null
  const isPayroll = !!v && (v.reference === 'payroll_disbursement' || v.reference === 'payroll_statutory' || v.reference === 'payroll_payment_request')
  const extraMore: DialogMenuItem[] = v
    ? [
        ...(record?.canCopy ? [{ key: 'copy', label: 'Copy as a new draft', onClick: () => setExtra({ kind: 'copy', nonce: Date.now() }) }] : []),
        ...(v.status === 'paid' && v.paymentDate && v.can.edit && !isPayroll ? [{ key: 'date', label: 'Change date', onClick: () => setExtra({ kind: 'date', nonce: Date.now() }) }] : []),
        ...(extras?.reassign ? [{ key: 'gl', label: 'Change GL account', onClick: () => setExtra({ kind: 'gl', nonce: Date.now() }) }] : []),
      ]
    : []
  const { steps, busy, error, dialogs, openFile, addFiles } = useVoucherSteps(v, {
    onDone: () => {
      router.refresh()
      if (v) load(v.id)
    },
    onFilesChanged: () => {
      if (v) load(v.id)
      router.refresh()
    },
    extraMore,
    inWords: true,
  })
  const recordBar: BarButton[] = steps.map((st) => ({
    key: st.key,
    label: st.label,
    kind: st.kind,
    ...(st.key === 'edit' && v ? { onClick: () => setEditing(v.id) } : { href: st.href, onClick: st.onClick }),
    disabled: busy && st.kind !== 'more',
  }))

  // ── The screens ──
  let screen: ReactNode
  if (step.kind === 'record') {
    const row = ledger.rows.find((r) => r.id === step.id) ?? null
    const fromTitle = step.from ? (step.from === 'all' ? 'All' : cardLook(step.from, receipts).title) : title
    screen = (
      <AppScreen
        screenKey={`${hub}?${searchOfStep(step)}`}
        head={{ kind: 'back', title: v?.no ?? row?.no ?? 'Draft', backLabel: fromTitle, onBack: backTo }}
        actions={v ? [{ key: 'print', label: 'Print', href: `/payments/voucher-doc?id=${v.id}` }] : []}
        bar={v ? recordBar : []}
      >
        {v ? (
          <VoucherDetailBody v={v} error={error} busy={busy} openFile={openFile} addFiles={addFiles} extras={extras} />
        ) : (
          <>
            {row && row.kind === 'voucher' ? <VoucherHero credit={receipts} status={row.status} account={row.cat || null} no={row.no} amount={row.amount} payee={row.name} /> : null}
            <div className={d.loading}>{refused ?? 'Loading…'}</div>
          </>
        )}
      </AppScreen>
    )
  } else if (step.kind === 'batches') {
    const count = `${plural(ledger.batches.length, 'batch', 'batches')} · ${plural(ledger.batches.reduce((n, b) => n + b.count, 0), 'voucher', 'vouchers')}`
    screen = (
      <AppScreen screenKey={`${hub}?f=payroll`} head={{ kind: 'back', title: 'Payroll batches', backLabel: title, onBack: backTo }}>
        <PageHead roman="I." eyebrow="Payments · Payroll" title="Payroll batches" />
        <ListBlock title="Payroll batches" count={count} empty={ledger.batches.length === 0 ? 'No payroll batches.' : null}>
          {ledger.batches.map((b) => {
            const on = openBatches.has(b.key)
            return (
              <div key={b.key} className={s.batch} data-open={on ? 'true' : undefined}>
                <button
                  type="button"
                  className={s.batchRow}
                  aria-expanded={on}
                  onClick={() =>
                    setOpenBatches((prev) => {
                      const next = new Set(prev)
                      if (next.has(b.key)) next.delete(b.key)
                      else next.add(b.key)
                      return next
                    })
                  }
                >
                  <span className={s.batchCaret} aria-hidden="true">
                    ▸
                  </span>
                  <span className={s.rowText}>
                    <span className={s.batchName}>{b.name}</span>
                    <span className={s.batchMeta}>
                      {plural(b.count, 'voucher', 'vouchers')} · {b.statusText}
                      {b.latest ? ` · ${fd(b.latest)}` : ''}
                    </span>
                  </span>
                  <span className={s.batchAmt}>−{f2(b.total)}</span>
                </button>
                {on ? (
                  <div className={s.members}>
                    {b.members.map((m, i) => (
                      <button
                        key={m.id ?? `${b.key}:${i}`}
                        type="button"
                        className={s.member}
                        disabled={!m.id}
                        onClick={m.id ? () => go({ kind: 'record', id: m.id as string, from: 'payroll' }) : undefined}
                      >
                        <span className={s.rowText}>
                          <span className={s.memberWho}>{m.who}</span>
                          <span className={s.memberNo}>{m.no}</span>
                        </span>
                        <span className={s.memberAmt}>{f2(m.amount)}</span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            )
          })}
        </ListBlock>
      </AppScreen>
    )
  } else if (step.kind === 'list') {
    const card = step.card
    const look = cardLook(card, receipts)
    const rows = listRows(card)
    const total = rows.reduce((t, r) => t + r.amount, 0)
    const listBar: BarButton[] = createBtn && (card === 'all' || (!receipts && card === 'draft')) ? [createBtn] : []
    screen = (
      <AppScreen screenKey={`${hub}?f=${card}`} head={{ kind: 'back', title: card === 'all' ? 'All' : look.title, backLabel: title, onBack: backTo }} bar={listBar}>
        <PageHead roman="I." eyebrow={`${receipts ? 'Receive' : 'Payments'} · ${card === 'all' ? 'All' : look.title}`} title={look.title} />
        <SearchRow
          value={query[card] ?? ''}
          onChange={(q) => setQuery((prev) => ({ ...prev, [card]: q }))}
          placeholder={receipts ? 'Search receipt #, from, description…' : 'Search voucher #, payee, description…'}
        />
        <ListBlock
          title={receipts ? 'Official receipts' : 'Payment vouchers'}
          count={`${rows.reduce((n, r) => n + r.items, 0)} · ${rm(total)}`}
          empty={rows.length === 0 ? (ledger.empty ? (receipts ? 'No official receipts yet.' : 'No payment vouchers yet.') : receipts ? 'No receipts here.' : 'No vouchers here.') : null}
        >
          {rows.map((r) => (
            <Row
              key={r.id}
              title={r.name}
              desc={r.desc}
              amount={receipts ? `+${f2(r.amount)}` : rm(r.amount)}
              tone={r.status === 'voided' ? 'void' : receipts ? 'ledger' : null}
              onClick={() => openRow(r, card)}
            />
          ))}
        </ListBlock>
      </AppScreen>
    )
  } else {
    screen = (
      <AppScreen screenKey={HUB_HREF[hub]} head={{ kind: 'bare' }} topTabs={topTabs} bar={hubBar} root onSwipe={swipe}>
        <BankHero value={rm(ledger.hero.amount)} label={ledger.hero.label} />
        <StackCards cards={cards} onOpen={(k) => go(k === 'payroll' ? { kind: 'batches', batch: null } : { kind: 'list', card: k as HubCardKey })} />
      </AppScreen>
    )
  }

  return (
    <>
      {screen}
      {dialogs}

      {/* The hub's windows: what waits for a voucher, the export, the makers. */}
      {receipts ? null : (
        <>
          <FinDialog open={menu === 'dept'} onClose={() => setMenu(null)} title="Dept Requests" sub={dept.length > 0 ? `${dept.length} waiting for a voucher` : undefined}>
            <DialogMenu items={requestItems(dept, '/fin-app/page/dept-requests', 'Open Dept Requests')} />
          </FinDialog>
          {payroll ? (
            <FinDialog open={menu === 'payroll'} onClose={() => setMenu(null)} title="Payroll Requests" sub={payroll.length > 0 ? `${payroll.length} waiting` : undefined}>
              <DialogMenu items={requestItems(payroll, '/fin-app/page/payroll-requests', 'Open Payroll Requests')} />
            </FinDialog>
          ) : null}
          <FinDialog open={menu === 'claims'} onClose={() => setMenu(null)} title="Claim Requests" sub={claims.length > 0 ? `${claims.length} waiting for a voucher` : undefined}>
            <DialogMenu items={requestItems(claims, '/fin-app/page/claim-requests', 'Open Claim Requests')} />
          </FinDialog>
          <FinDialog open={menu === 'more'} onClose={() => setMenu(null)} title="Payments">
            <DialogMenu
              items={[
                { key: 'claims', label: claims.length > 0 ? `Claims · ${claims.length}` : 'Claims', sub: claims.length > 0 ? `${claims.length} waiting for a voucher` : 'Nothing waiting', onClick: () => setMenu('claims') },
                ...(canExport ? [{ key: 'export', label: 'Export', sub: 'Excel or PDF of every voucher', onClick: () => setMenu('export') }] : []),
              ]}
            />
          </FinDialog>
        </>
      )}
      <FinDialog open={menu === 'export'} onClose={() => setMenu(null)} title="Export" sub={receipts ? 'All receipts' : 'All vouchers'}>
        <DialogMenu
          items={[
            { key: 'xlsx', label: 'Excel', onClick: () => { setMenu(null); window.location.assign(exportHref('xlsx')) } },
            { key: 'pdf', label: 'PDF', onClick: () => { setMenu(null); window.open(exportHref('pdf'), '_blank', 'noopener,noreferrer') } },
          ]}
        />
      </FinDialog>

      {create ? <CreatePaymentDialog open={making === 'payment'} onClose={() => setMaking(null)} prefix={create.prefix} today={create.today} initial={create.initial} /> : null}
      <VoucherEditSheet
        voucherId={editing}
        label={v?.no ?? 'draft'}
        today={today}
        onClose={() => setEditing(null)}
        onDone={() => {
          flash('Voucher saved')
          router.refresh()
          if (v) load(v.id)
        }}
      />
      {receipts && canCreate && prefix ? (
        <>
          <CreateReceiptDialog open={making === 'receipt'} onClose={() => setMaking(null)} prefix={prefix} today={today} />
          <LoanRepaymentDialog open={making === 'loan'} onClose={() => setMaking(null)} today={today} />
        </>
      ) : null}

      {v && extra?.kind === 'copy' ? (
        <CopyVoucherDialog
          key={extra.nonce}
          open
          onClose={() => setExtra(null)}
          voucherId={v.id}
          voucherNo={v.no}
          // The copy opens here, its Edit sheet up — as the desktop opens it on its edit page.
          onCopied={(copy) => {
            flash(`${copy.voucherNo} — a new draft`)
            router.refresh()
            go({ kind: 'record', id: copy.id, from: step.kind === 'record' ? step.from : null })
            setEditing(copy.id)
          }}
        />
      ) : null}
      {v && extra?.kind === 'date' && v.paymentDate ? (
        <AmendDateButton key={extra.nonce} autoOpen hideTrigger kind="voucher" id={v.id} currentDate={v.paymentDate} label={v.no ?? 'Draft'} />
      ) : null}
      {v && extra?.kind === 'gl' && extras?.reassign ? (
        <ReassignGlAccountButton key={extra.nonce} autoOpen hideTrigger voucherId={v.id} fromOptions={extras.reassign.from} accountOptions={extras.reassign.options} />
      ) : null}
    </>
  )
}
