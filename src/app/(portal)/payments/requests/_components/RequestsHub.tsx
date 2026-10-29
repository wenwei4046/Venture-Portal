'use client'

import { useEffect, useMemo, useState, type MouseEvent } from 'react'
import { useRouter } from 'next/navigation'
import { flash } from '@/components/hrv/toast'
import RowMenu, { type RowMenuAnchor, type RowMenuItem } from '@/components/RowMenu'
import { HubCards, HubHead, hubStyles as hs } from '@/components/finv/Hub'
import { FinTable, type FinColumn } from '@/components/finv/FinTable'
import { fd } from '@/components/finv/DrawerParts'
import type { PayrollRequestLine } from '@/lib/fin-app/payroll-requests-model'
import { f2, plural, rm } from '@/lib/fin-app/page-model'
import { bulkGroups, combineTag, samePayeeOpen, voucherStart, type RequestVoucherStart } from '@/lib/payment-requests/model'
import { VoucherDrawer } from '../../_components/VoucherDrawer'
import CreatePaymentDialog from '../../_components/CreatePaymentDialog'
import { createPaymentForRequests } from '../../actions'
import { openRequestsForPv, openRequestsForPvs } from '../actions'
import type { PaymentRequestsRead } from '../_lib/requests-read'
import { ALL_CARD, requestCards, requestHero, rowsOf, stageChip, type PaymentRequestRow } from '../_lib/requests-model'
import CreatePaymentsDialog, { type CreatePaymentsStart } from './CreatePaymentsDialog'
import { RequestDrawer } from './RequestDrawer'
import { FundSheet, RaiseSheet, RejectRequestSheet, RejectRequestsSheet, ReturnClaimSheet, SendBackSheet, type RaiseTarget } from './RequestSheets'
import rq from './requests.module.css'

// Payments › Payment request (2026-10-29, PR ①): Payment voucher's hub, its parts as they are — the head, the cards
// beside the list (All, Payroll, every department: the agreed tabs, as the hub's filters), the table with its column
// tools (resize, move, Columns, sort, filter, everyone's default), the drawer a row opens and its right-click menu. The
// card is kept in the URL (?card=) for a link or a refresh. PR ④: the staff requests waiting for a PV are ticked —
// their boxes always there, a row still opening its drawer — and the toolbar's Reject and Create PV work them at once.

export const COLUMNS: FinColumn<PaymentRequestRow>[] = [
  { key: 'sent', label: 'Sent', kind: 'date', width: 112, value: (r) => r.sent, text: (r) => (r.sent ? fd(r.sent) : '—') },
  { key: 'name', label: 'From', kind: 'name', fixed: true, width: 170, min: 120, value: (r) => r.from.toLowerCase(), text: (r) => r.from },
  { key: 'desc', label: 'What', kind: 'desc', fixed: true, width: 220, min: 120, value: (r) => r.what.toLowerCase(), text: (r) => r.what },
  { key: 'dept', label: 'Department', kind: 'text', width: 140, value: (r) => r.department.toLowerCase(), text: (r) => r.department },
  { key: 'payTo', label: 'Pay to', kind: 'text', width: 110, value: (r) => r.payTo, text: (r) => r.payTo },
  { key: 'whoPays', label: 'Who pays', kind: 'text', width: 160, value: (r) => r.whoPays.toLowerCase(), text: (r) => r.whoPays },
  { key: 'ref', label: 'Ref #', kind: 'no', width: 150, value: (r) => r.ref, text: (r) => r.ref || '—' },
  { key: 'status', label: 'Status', kind: 'chip', width: 150, value: (r) => stageChip(r).text, text: (r) => stageChip(r).text, chip: (r) => stageChip(r) },
  { key: 'amount', label: 'Amount', kind: 'amount', fixed: true, width: 130, value: (r) => r.amount, text: (r) => rm(r.amount) },
]
/** On show until the account arranges its own: the agreed list's Sent · From · What · Pay to · Who pays · RM, and Status. */
const DEFAULT_SHOWN = ['sent', 'payTo', 'whoPays', 'status'] as const

// Several at once (2026-10-29, PR ④): a staff request waiting for its PV is ticked; payroll and a Revenue claim are
// worked one by one, and a press on their box says so.
const tickable = (r: PaymentRequestRow) => r.source === 'request' && r.stage === 'finance' && r.request?.status === 'with_finance' && !r.request.pvId
const whyNot = (r: PaymentRequestRow) =>
  r.source === 'payroll'
    ? 'Payroll is funded one by one — open it to Generate PV.'
    : r.source === 'claim'
      ? 'A Revenue claim is paid on its own — open it to Create PV.'
      : 'Only a request waiting for its PV can be ticked.'

export default function RequestsHub({ data }: { data: PaymentRequestsRead }) {
  const router = useRouter()
  const cards = useMemo(() => requestCards(data.rows, data.departments, data.seesPayroll), [data])
  const [card, setCard] = useState(ALL_CARD)
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const [voucher, setVoucher] = useState<string | null>(null)
  const [rowMenu, setRowMenu] = useState<{ row: PaymentRequestRow; anchor: RowMenuAnchor } | null>(null)
  const [funding, setFunding] = useState<PayrollRequestLine | null>(null)
  const [sending, setSending] = useState<PayrollRequestLine | null>(null)
  const [raising, setRaising] = useState<RaiseTarget | null>(null)
  const [returning, setReturning] = useState<{ id: string; label: string; sub: string } | null>(null)
  const [rejecting, setRejecting] = useState<{ id: string; label: string; sub: string } | null>(null)
  // Create PV from staff requests: what the window starts from — asked first (still with Finance, one payee into one account).
  const [pv, setPv] = useState<{ key: string; start: RequestVoucherStart } | null>(null)
  const [pvOpen, setPvOpen] = useState(false)
  const [pvError, setPvError] = useState<string | null>(null)
  // Several at once: the ticked rows, Create payments' start (read again first), the ones a Reject… sends back.
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulk, setBulk] = useState<{ key: string; start: CreatePaymentsStart } | null>(null)
  const [bulkOpen, setBulkOpen] = useState(false)
  const [opening, setOpening] = useState(false)
  const [rejectingMany, setRejectingMany] = useState<Array<{ id: string; label: string }> | null>(null)

  // The card a link or a refresh lands on (?card=), once the cards are known; then kept in the URL as it changes.
  useEffect(() => {
    const asked = new URL(window.location.href).searchParams.get('card')
    if (asked && cards.some((c) => c.key === asked)) setCard(asked)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const url = new URL(window.location.href)
    if (card === ALL_CARD) url.searchParams.delete('card')
    else url.searchParams.set('card', card)
    if (url.toString() !== window.location.href) window.history.replaceState(window.history.state, '', url.toString())
  }, [card])

  const q = query.trim().toLowerCase()
  const shown = useMemo(
    () => rowsOf(data.rows, card).filter((r) => !q || `${r.from} ${r.fromSub} ${r.what} ${r.ref} ${r.department} ${r.whoPays}`.toLowerCase().includes(q)),
    [data.rows, card, q],
  )
  const hero = requestHero(data.rows)
  const active = cards.find((c) => c.key === card) ?? cards[0]
  const openRow = data.rows.find((r) => r.key === open) ?? null

  // The same person's requests with no PV yet go into one PV, until Finance makes it (the user: "自动合成认的是我有没有开pv");
  // each split's Bill back? is answered in the window, with the voucher ("我开pv 时就要确定是不是要开单了").
  const staffRequests = useMemo(() => data.rows.flatMap((r) => (r.request ? [r.request] : [])), [data.rows])
  const createRequestPv = async (r: PaymentRequestRow) => {
    if (!r.request) return
    setPvError(null)
    try {
      const res = await openRequestsForPv(samePayeeOpen(staffRequests, r.request).map((x) => x.id))
      if (!res.ok) {
        setOpen(r.key)
        return setPvError(res.reason)
      }
      setPv({ key: res.requests.map((x) => x.id).join(','), start: voucherStart(res.requests) })
      setPvOpen(true)
    } catch {
      setOpen(r.key)
      setPvError('The requests could not be read. Try again.')
    }
  }

  // A payee's open requests carry "2 → 1 PV" after the name — they go into one PV.
  const columns = useMemo(() => {
    const tags = new Map(data.rows.flatMap((r) => (r.request ? [[r.key, combineTag(staffRequests, r.request)] as const] : [])))
    return COLUMNS.map((c) => (c.key === 'name' ? { ...c, tag: (r: PaymentRequestRow) => tags.get(r.key) ?? null } : c))
  }, [data.rows, staffRequests])

  const acts = data.can.pay || data.can.sendBack
  const ticked = shown.filter((r) => selected.has(r.key) && tickable(r))
  const tickedSum = ticked.reduce((t, r) => t + r.amount, 0)
  const toggle = (r: PaymentRequestRow) => {
    if (!tickable(r)) return flash(whyNot(r))
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(r.key)) next.delete(r.key)
      else next.add(r.key)
      return next
    })
  }
  const toggleAll = (rows: PaymentRequestRow[]) =>
    setSelected((prev) => (rows.length > 0 && rows.every((r) => prev.has(r.key)) ? new Set() : new Set(rows.map((r) => r.key))))

  // Create PV for the ticked: one payee's in today's Create PV window; several payees' in Create payments — each PV's
  // requests read again first, the payee's others with no PV yet put in with them.
  const createForTicked = async () => {
    const requests = ticked.flatMap((r) => (r.request ? [r.request] : []))
    const groups = bulkGroups(requests, staffRequests, true)
    if (groups.length === 0 || opening) return
    if (groups.length === 1) return void createRequestPv(ticked[0])
    if (groups.length > 20) return flash('Up to 20 PVs at once — tick fewer.')
    setOpening(true)
    try {
      const res = await openRequestsForPvs(groups.map((g) => g.map((x) => x.id)))
      if (!res.ok) return flash(res.reason)
      setBulk({ key: groups.map((g) => g.map((x) => x.id).join(',')).join('|'), start: { groups: res.groups, ticked: requests.map((x) => x.id), canBillBack: res.canBillBack } })
      setBulkOpen(true)
    } catch {
      flash('The requests could not be read. Try again.')
    } finally {
      setOpening(false)
    }
  }

  const steps = {
    fund: (r: PaymentRequestRow) => r.payroll && setFunding(r.payroll),
    sendBack: (r: PaymentRequestRow) => r.payroll && setSending(r.payroll),
    createPv: (r: PaymentRequestRow) => setRaising({ id: r.id, label: r.from, value: f2(r.amount) }),
    returnToHr: (r: PaymentRequestRow) => setReturning({ id: r.id, label: r.from, sub: [r.ref, rm(r.amount)].filter(Boolean).join(' · ') }),
    openVoucher: (id: string) => setVoucher(id),
    rejectRequest: (r: PaymentRequestRow) => setRejecting({ id: r.id, label: r.ref || r.from, sub: [r.from, rm(r.amount)].join(' · ') }),
    createRequestPv: (r: PaymentRequestRow) => void createRequestPv(r),
  }
  const waiting = (r: PaymentRequestRow) => r.stage === 'finance'

  const onRowContextMenu = (r: PaymentRequestRow, e: MouseEvent<HTMLElement>) => {
    e.preventDefault()
    setRowMenu({ row: r, anchor: { x: e.clientX, y: e.clientY } })
  }
  let rowMenuNode = null
  if (rowMenu) {
    const r = rowMenu.row
    const items: RowMenuItem[] = [{ key: 'open', label: 'Open', onSelect: () => setOpen(r.key) }]
    const more: RowMenuItem[] = []
    if (r.payroll) {
      if (waiting(r) && data.can.pay) more.push({ key: 'fund', label: 'Generate PV…', onSelect: () => steps.fund(r) })
      if (waiting(r) && data.can.sendBack && r.payroll.canSendBack) more.push({ key: 'back', label: 'Send back to HR…', danger: true, onSelect: () => steps.sendBack(r) })
    } else if (r.claim) {
      if (waiting(r) && data.can.pay) more.push({ key: 'pv', label: 'Create PV', onSelect: () => steps.createPv(r) })
      if (waiting(r) && data.can.sendBack && r.claim.claimType === 'benefit') more.push({ key: 'return', label: 'Return to HR…', danger: true, onSelect: () => steps.returnToHr(r) })
      if (r.voucherId) more.push({ key: 'voucher', label: 'Open voucher', onSelect: () => steps.openVoucher(r.voucherId!) })
    } else if (r.request) {
      if (waiting(r) && data.can.pay) more.push({ key: 'pv', label: 'Create PV', onSelect: () => steps.createRequestPv(r) })
      if (waiting(r) && data.can.sendBack) more.push({ key: 'reject', label: 'Reject…', danger: true, onSelect: () => steps.rejectRequest(r) })
      if (r.voucherId) more.push({ key: 'voucher', label: 'Open voucher', onSelect: () => steps.openVoucher(r.voucherId!) })
    }
    if (more.length > 0) items.push('sep', ...more)
    rowMenuNode = <RowMenu title={`${r.from} · ${stageChip(r).text}`} anchor={rowMenu.anchor} items={items} onClose={() => setRowMenu(null)} />
  }

  const done = (words: string) => {
    flash(words)
    setOpen(null)
    router.refresh()
  }

  return (
    <div className={hs.root} data-fin-kit="">
      <HubHead roman="I." eyebrow="Daily · Payments" title="Payment request" />

      <div className={hs.hub}>
        <HubCards
          heroLabel={hero.label}
          heroValue={hero.value}
          cards={cards}
          active={active.key}
          onSelect={(k) => {
            setCard(k)
            setSelected(new Set())
          }}
        />
        <FinTable
          layoutId="fin.payment_requests"
          title={active.key === ALL_CARD ? 'All requests' : active.label}
          rows={shown}
          rowKey={(r) => r.key}
          columns={columns}
          amountOf={(r) => r.amount}
          search={{ value: query, onChange: setQuery, placeholder: 'Search name, what, reference…' }}
          activeKey={open}
          onRowClick={(r) => {
            setPvError(null)
            setOpen(r.key)
          }}
          onRowContextMenu={onRowContextMenu}
          emptyText={data.rows.length === 0 ? 'Nothing is waiting for Finance.' : 'No requests here.'}
          canSetDefault={data.canSetDefault}
          defaultShown={DEFAULT_SHOWN}
          select={acts ? { on: true, boxOnly: true, isSelected: (r) => selected.has(r.key), canSelect: tickable, onToggle: toggle, onToggleAll: toggleAll } : null}
          tools={
            acts ? (
              <span className={rq.several} data-on={ticked.length > 0 ? 'true' : undefined} role="group" aria-label="Several at once">
                <span className={rq.severalWords}>{ticked.length > 0 ? `${ticked.length} selected · ${rm(tickedSum)}` : 'Tick requests to act on several'}</span>
                {data.can.sendBack ? (
                  <button
                    type="button"
                    className={rq.severalBtn}
                    data-kind="danger"
                    disabled={ticked.length === 0 || opening}
                    aria-label="Reject the ticked"
                    onClick={() => setRejectingMany(ticked.map((r) => ({ id: r.id, label: r.ref ? `${r.from} (${r.ref})` : r.from })))}
                  >
                    Reject
                  </button>
                ) : null}
                {data.can.pay ? (
                  <button type="button" className={rq.severalBtn} data-kind="primary" disabled={ticked.length === 0 || opening} aria-label="Create PV for the ticked" onClick={() => void createForTicked()}>
                    {opening ? 'Reading…' : 'Create PV'}
                  </button>
                ) : null}
              </span>
            ) : null
          }
        />
      </div>

      <RequestDrawer row={openRow} onClose={() => setOpen(null)} can={data.can} steps={steps} stepError={pvError} />
      <VoucherDrawer id={voucher} onClose={() => setVoucher(null)} onChanged={() => router.refresh()} />

      <FundSheet
        request={funding}
        banks={data.banks}
        today={data.today}
        onClose={() => setFunding(null)}
        onDone={(voucherId) => {
          setFunding(null)
          done('PV generated — with the Principal')
          setVoucher(voucherId)
        }}
      />
      <SendBackSheet
        request={sending}
        onClose={() => setSending(null)}
        onDone={(label) => {
          setSending(null)
          done(`${label} sent back to HR`)
        }}
      />
      <RaiseSheet
        kind="claim"
        label="Create PV"
        request={raising}
        banks={data.banks}
        onClose={() => setRaising(null)}
        onDone={() => {
          setRaising(null)
          done('PV created — with the Principal')
        }}
      />
      <ReturnClaimSheet
        claim={returning}
        onClose={() => setReturning(null)}
        onDone={() => {
          setReturning(null)
          done('Returned to HR')
        }}
      />
      <RejectRequestSheet
        request={rejecting}
        onClose={() => setRejecting(null)}
        onDone={() => {
          setRejecting(null)
          done('Rejected — back with the requester')
        }}
      />
      {pv ? (
        <CreatePaymentDialog
          key={pv.key}
          open={pvOpen}
          onClose={() => setPvOpen(false)}
          prefix={`HV-PV-${data.today.slice(0, 7).replace('-', '')}`}
          today={data.today}
          preset={{ title: 'Create PV', payee: pv.start.payee, description: pv.start.description, requests: pv.start }}
          create={createPaymentForRequests}
          onSaved={(made) => {
            setPvOpen(false)
            setOpen(null)
            setSelected(new Set())
            router.refresh()
            setVoucher(made.id)
          }}
        />
      ) : null}
      {bulk ? (
        <CreatePaymentsDialog
          key={bulk.key}
          open={bulkOpen}
          start={bulk.start}
          prefix={`HV-PV-${data.today.slice(0, 7).replace('-', '')}`}
          today={data.today}
          onClose={() => setBulkOpen(false)}
          onDone={() => {
            setSelected(new Set())
            setOpen(null)
            router.refresh()
          }}
        />
      ) : null}
      <RejectRequestsSheet
        requests={rejectingMany}
        onClose={() => setRejectingMany(null)}
        onPartly={() => router.refresh()}
        onDone={(n) => {
          setRejectingMany(null)
          setSelected(new Set())
          done(`${plural(n, 'request', 'requests')} rejected — back with ${n === 1 ? 'the requester' : 'their requesters'}`)
        }}
      />
      {rowMenuNode}
    </div>
  )
}
