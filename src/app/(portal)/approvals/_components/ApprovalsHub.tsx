'use client'

import { useEffect, useMemo, useState, type MouseEvent } from 'react'
import RowMenu, { type RowMenuAnchor, type RowMenuItem } from '@/components/RowMenu'
import { flash } from '@/components/hrv/toast'
import { BulkBar, BulkButton, Chip, HubCards, HubHead, hubStyles as hs, type ChipTone } from '@/components/finv/Hub'
import { FinTable, type FinColumn } from '@/components/finv/FinTable'
import { officeTime } from '@/lib/office-time'
import { plural, portalHrefOf, rm } from '@/lib/fin-app/approval-model'
import { matches, rowsOf, type ApprovalHub, type ApprovalHubCard, type HubRow } from '../_lib/hub-model'
import { useApprovalDecisions } from './decisions'
import { ApprovalDrawer } from './ApprovalDrawer'
import a from './approvals.module.css'

// Approvals on the computer (2026-10-17 — the user, on the Principal's own view taking Finance's view: "make sure
// the approve tab is fullfill as well, cause usually i use that"). Finance's hub (D02–D05's parts): the total that
// waits with the oldest wait, a card per list — Pending (black, the README's), Submitted by the executive, Decided ·
// 30 days — the table with its columns, filters and arrangement, *Select* to tick what is yours to decide and the
// dark bar to approve or reject it, and the drawer a row opens (one request, or a combined approval's vouchers each
// decided its own way). Every figure is the queue's (`_lib/hub-model` on the phone app's model), every decision the
// queue's own Server Action (decisions.tsx). The card is the address's (?card=), for a refresh or a link.

const f2 = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const when = (iso: string | null) => (iso ? officeTime(iso).format('DD MMM YYYY') : '—')

/** A row's state as a chip: waiting (yours or not), or how it was decided. */
function stateOf(r: HubRow): { text: string; tone: ChipTone } {
  if (r.decision === 'approved') return { text: 'Approved', tone: 'ledger' }
  if (r.decision === 'rejected') return { text: 'Rejected', tone: 'danger' }
  if (r.kind === 'group' && r.decision === null && r.members.some((m) => m.decision)) return { text: 'Partly', tone: 'accent' }
  return r.why ? { text: 'Awaiting sign-off', tone: 'alert' } : { text: 'Waiting', tone: 'wait' }
}

function columnsFor(card: ApprovalHubCard): FinColumn<HubRow>[] {
  return [
    { key: 'name', label: 'Name', kind: 'name', fixed: true, width: 180, min: 120, value: (r) => r.name.toLowerCase(), text: (r) => r.name || '—' },
    { key: 'desc', label: 'Request', kind: 'desc', fixed: true, width: 200, min: 120, value: (r) => (r.kind === 'group' ? r.type : r.title).toLowerCase(), text: (r) => (r.kind === 'group' ? r.type : r.title) },
    { key: 'no', label: 'Ref #', kind: 'no', width: 170, value: (r) => r.no ?? '', text: (r) => r.no ?? '—' },
    { key: 'type', label: 'Type', kind: 'text', width: 150, value: (r) => r.type.toLowerCase(), text: (r) => r.type },
    { key: 'by', label: 'By', kind: 'text', width: 140, value: (r) => r.sentBy.toLowerCase(), text: (r) => r.sentBy },
    { key: 'at', label: card === 'decided' ? 'Decided' : 'Submitted', kind: 'date', width: 126, value: (r) => r.at ?? '', text: (r) => when(r.at) },
    { key: 'pool', label: 'Pool', kind: 'text', width: 130, value: (r) => r.pool.toLowerCase(), text: (r) => r.pool || '—' },
    { key: 'cat', label: 'Category', kind: 'text', width: 140, value: (r) => r.category.toLowerCase(), text: (r) => r.category || '—' },
    { key: 'payBy', label: 'Pay by', kind: 'text', width: 150, value: (r) => r.payBy.toLowerCase(), text: (r) => r.payBy || '—' },
    { key: 'files', label: 'Files', kind: 'text', width: 90, value: (r) => r.files, text: (r) => (r.files > 0 ? plural(r.files, 'file', 'files') : '—') },
    { key: 'state', label: 'Status', kind: 'chip', width: 136, value: (r) => stateOf(r).text, text: (r) => stateOf(r).text, chip: (r) => stateOf(r) },
    { key: 'amount', label: 'Amount', kind: 'amount', fixed: true, width: 130, value: (r) => r.amount, text: (r) => (r.hasAmount ? rm(r.amount) : '—') },
  ]
}

const DEFAULT_SHOWN: Record<'waiting' | 'decided', readonly string[]> = {
  waiting: ['at'],
  decided: ['state'],
}

export default function ApprovalsHub({
  hub,
  initialCard,
  initialOpen = null,
  canSetDefault,
}: {
  hub: ApprovalHub
  initialCard: ApprovalHubCard
  /** A row to open at once (`?group_id=` — Payroll's "Open Approvals →"), when it is on the lists. */
  initialOpen?: string | null
  canSetDefault: boolean
}) {
  const opening = initialOpen && [...hub.pending, ...hub.decided].some((r) => r.key === initialOpen) ? initialOpen : null
  const [card, setCard] = useState<ApprovalHubCard>(opening && hub.decided.some((r) => r.key === opening) ? 'decided' : initialCard)
  const [query, setQuery] = useState('')
  // What was decided here waits for the server's next read before it leaves the cards; the lists drop it at once.
  const [gone, setGone] = useState<Set<string>>(new Set())
  useEffect(() => setGone(new Set()), [hub])
  const [selecting, setSelecting] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [drawerKey, setDrawerKey] = useState<string | null>(opening)
  const [shownKey, setShownKey] = useState<string | null>(opening)
  const [rowMenu, setRowMenu] = useState<{ row: HubRow; anchor: RowMenuAnchor } | null>(null)

  // The card in the address, so a refresh or a link lands on it (the list is here: no navigation); a
  // ?group_id= has done its work once its drawer opened.
  useEffect(() => {
    const url = new URL(window.location.href)
    url.searchParams.delete('group_id')
    if (card === 'pending') url.searchParams.delete('card')
    else url.searchParams.set('card', card)
    if (url.toString() !== window.location.href) window.history.replaceState(window.history.state, '', url.toString())
  }, [card])

  const all = useMemo(() => new Map([...hub.pending, ...hub.decided].map((r) => [r.key, r])), [hub])
  const rows = useMemo(() => rowsOf(hub, card, gone).filter((r) => matches(r, query)), [hub, card, gone, query])
  const waitingCard = card !== 'decided'
  const mayTick = waitingCard && rowsOf(hub, card, gone).some((r) => !r.why)
  const ticked = rows.filter((r) => selected.has(r.key))
  const tickedTotal = Math.round(ticked.reduce((t, r) => t + r.amount, 0) * 100) / 100
  const combined = ticked.filter((r) => r.kind === 'group').length

  const pickCard = (k: ApprovalHubCard) => {
    setCard(k)
    setSelecting(false)
    setSelected(new Set())
  }
  const openRow = (r: HubRow) => {
    setDrawerKey(r.key)
    setShownKey(r.key)
  }
  const closeDrawer = () => setDrawerKey(null)

  const decisions = useApprovalDecisions({
    onDecided: ({ ask, keys }) => {
      setGone((prev) => new Set([...prev, ...keys]))
      if (ask.kind !== 'split' && ask.scope === 'bulk') {
        setSelected(new Set())
        setSelecting(false)
      } else closeDrawer()
    },
    onPartly: (keys) => {
      setGone((prev) => new Set([...prev, ...keys]))
      setSelected((prev) => new Set([...prev].filter((k) => !keys.includes(k))))
    },
  })

  const toggle = (r: HubRow) => {
    if (r.why) {
      flash(r.why)
      return
    }
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(r.key)) next.delete(r.key)
      else next.add(r.key)
      return next
    })
  }
  const toggleAll = (on: HubRow[]) =>
    setSelected((prev) => {
      const keys = on.map((r) => r.key)
      return keys.every((k) => prev.has(k)) ? new Set([...prev].filter((k) => !keys.includes(k))) : new Set([...prev, ...keys])
    })

  const onRowContextMenu = (r: HubRow, e: MouseEvent<HTMLElement>) => {
    e.preventDefault()
    setRowMenu({ row: r, anchor: { x: e.clientX, y: e.clientY } })
  }
  let rowMenuNode = null
  if (rowMenu) {
    const r = rowMenu.row
    const items: RowMenuItem[] = [{ key: 'open', label: 'Open', onSelect: () => openRow(r) }]
    if (r.kind === 'single' && r.id) items.push({ key: 'page', label: 'Open full page in new tab', onSelect: () => window.open(`/approvals/${r.id}`, '_blank', 'noopener,noreferrer') })
    const record = r.kind === 'single' ? r.members[0]?.open : null
    if (record) items.push({ key: 'record', label: record.hub === 'payments' ? 'Open the voucher' : record.hub === 'fund-out' ? 'Open the loan' : 'Open the fund source', onSelect: () => window.open(portalHrefOf(record), '_blank', 'noopener,noreferrer') })
    if (waitingCard && !r.why && r.decision === null && !gone.has(r.key)) {
      items.push('sep', {
        key: 'tick',
        label: selected.has(r.key) ? 'Untick' : 'Tick to decide',
        onSelect: () => {
          setSelecting(true)
          toggle(r)
        },
      })
    }
    rowMenuNode = <RowMenu title={`${r.no ?? r.type} · ${stateOf(r).text}`} anchor={rowMenu.anchor} items={items} onClose={() => setRowMenu(null)} />
  }

  const drawerRow = shownKey ? (all.get(shownKey) ?? null) : null
  const drawerLive = !!drawerRow && hub.pending.some((r) => r.key === drawerRow.key) && !gone.has(drawerRow.key)
  const groupKeyOf = (groupId: string) => `g:${groupId}`

  return (
    <div className={hs.root} data-fin-kit="">
      <HubHead roman="I." eyebrow="Daily · Approvals" title="Approvals" />

      <div className={hs.hub}>
        <HubCards
          heroLabel={hub.hero.label}
          heroValue={hub.hero.value}
          heroExtra={
            hub.hero.chip ? (
              <div className={a.heroChip}>
                <Chip tone={hub.hero.chip.tone === 'alert' ? 'alert' : 'def'}>{hub.hero.chip.text}</Chip>
              </div>
            ) : null
          }
          cards={hub.cards}
          active={card}
          onSelect={(k) => pickCard(k as ApprovalHubCard)}
          wide
        />
        <FinTable
          key={card === 'decided' ? 'decided' : 'waiting'}
          layoutId={card === 'decided' ? 'fin.approvals.decided' : 'fin.approvals'}
          title="Approvals"
          rows={rows}
          rowKey={(r) => r.key}
          columns={columnsFor(card)}
          defaultShown={card === 'decided' ? DEFAULT_SHOWN.decided : DEFAULT_SHOWN.waiting}
          amountOf={(r) => r.amount}
          itemsOf={card === 'decided' ? (r) => r.items : undefined}
          faint={(r) => r.decision === 'rejected'}
          search={{ value: query, onChange: setQuery, placeholder: 'Search ref #, payee, request, who…' }}
          countLabel={card === 'decided' ? (n) => plural(n, 'decision', 'decisions') : (n, sum) => `${n} · RM ${f2(sum)}`}
          tools={
            mayTick ? (
              <button
                type="button"
                className={hs.toolBtn}
                data-on={selecting ? 'true' : undefined}
                onClick={() => {
                  setSelecting((v) => !v)
                  setSelected(new Set())
                }}
              >
                {selecting ? 'Done' : 'Select'}
              </button>
            ) : null
          }
          select={selecting ? { on: true, isSelected: (r) => selected.has(r.key), canSelect: (r) => !r.why, onToggle: toggle, onToggleAll: toggleAll } : null}
          activeKey={drawerKey}
          onRowClick={openRow}
          onRowContextMenu={onRowContextMenu}
          emptyText={card === 'decided' ? 'Nothing decided in the last 30 days.' : hub.pending.length === 0 ? 'All caught up — nothing waiting.' : 'No requests here.'}
          canSetDefault={canSetDefault}
        />
      </div>

      {selecting && ticked.length > 0 ? (
        <BulkBar text={`${ticked.length} selected · ${rm(tickedTotal)}`} sub={combined > 0 ? `${plural(combined, 'combined request', 'combined requests')} — decided whole` : 'Approving pays each voucher at once'}>
          <BulkButton onClick={() => setSelected(new Set())}>Clear</BulkButton>
          <BulkButton disabled={decisions.busy} onClick={() => decisions.ask({ kind: 'reject', scope: 'bulk', rows: ticked })}>
            Reject…
          </BulkButton>
          <BulkButton primary disabled={decisions.busy} onClick={() => decisions.ask({ kind: 'approve', scope: 'bulk', rows: ticked })}>
            {`Approve ${ticked.length} →`}
          </BulkButton>
        </BulkBar>
      ) : null}

      <ApprovalDrawer
        row={drawerRow}
        open={!!drawerKey}
        live={drawerLive}
        busy={decisions.busy}
        onClose={closeDrawer}
        onAsk={decisions.ask}
        onOpenGroup={(groupId) => (all.has(groupKeyOf(groupId)) ? openRow(all.get(groupKeyOf(groupId))!) : flash('Its combined request is not on these lists.'))}
      />
      {decisions.dialog}
      {rowMenuNode}
    </div>
  )
}
