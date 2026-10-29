'use client'

import { useEffect, useMemo, useState, type MouseEvent } from 'react'
import { useRouter } from 'next/navigation'
import { flash } from '@/components/hrv/toast'
import RowMenu, { type RowMenuAnchor, type RowMenuItem } from '@/components/RowMenu'
import { HubCards, HubHead, hubStyles as hs } from '@/components/finv/Hub'
import { FinTable, type FinColumn } from '@/components/finv/FinTable'
import { fd } from '@/components/finv/DrawerParts'
import type { PayrollRequestLine } from '@/lib/fin-app/payroll-requests-model'
import { f2, rm } from '@/lib/fin-app/page-model'
import { VoucherDrawer } from '../../_components/VoucherDrawer'
import type { PaymentRequestsRead } from '../_lib/requests-read'
import { ALL_CARD, requestCards, requestHero, rowsOf, stageChip, type PaymentRequestRow } from '../_lib/requests-model'
import { RequestDrawer } from './RequestDrawer'
import { FundSheet, RaiseSheet, ReturnClaimSheet, SendBackSheet, type RaiseTarget } from './RequestSheets'

// Payments › Payment request (2026-10-29, PR ①): Payment voucher's hub, its parts as they are — the head, the cards
// beside the list (All, Payroll, every department: the agreed tabs, as the hub's filters), the table with its column
// tools (resize, move, Columns, sort, filter, everyone's default), the drawer a row opens and its right-click menu. The
// card is kept in the URL (?card=) for a link or a refresh.

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

  const steps = {
    fund: (r: PaymentRequestRow) => r.payroll && setFunding(r.payroll),
    sendBack: (r: PaymentRequestRow) => r.payroll && setSending(r.payroll),
    createPv: (r: PaymentRequestRow) => setRaising({ id: r.id, label: r.from, value: f2(r.amount) }),
    returnToHr: (r: PaymentRequestRow) => setReturning({ id: r.id, label: r.from, sub: [r.ref, rm(r.amount)].filter(Boolean).join(' · ') }),
    openVoucher: (id: string) => setVoucher(id),
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
        <HubCards heroLabel={hero.label} heroValue={hero.value} cards={cards} active={active.key} onSelect={setCard} />
        <FinTable
          layoutId="fin.payment_requests"
          title={active.key === ALL_CARD ? 'All requests' : active.label}
          rows={shown}
          rowKey={(r) => r.key}
          columns={COLUMNS}
          amountOf={(r) => r.amount}
          search={{ value: query, onChange: setQuery, placeholder: 'Search name, what, reference…' }}
          activeKey={open}
          onRowClick={(r) => setOpen(r.key)}
          onRowContextMenu={onRowContextMenu}
          emptyText={data.rows.length === 0 ? 'Nothing is waiting for Finance.' : 'No requests here.'}
          canSetDefault={data.canSetDefault}
          defaultShown={DEFAULT_SHOWN}
        />
      </div>

      <RequestDrawer row={openRow} onClose={() => setOpen(null)} can={data.can} steps={steps} />
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
      {rowMenuNode}
    </div>
  )
}
