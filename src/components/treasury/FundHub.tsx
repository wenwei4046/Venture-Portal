'use client'

import { useEffect, useMemo, useState, type MouseEvent, type ReactNode } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { flash } from '@/components/hrv/toast'
import RowMenu, { type RowMenuAnchor, type RowMenuItem } from '@/components/RowMenu'
import { HubCards, HubHead, hubStyles as hs, type HubCardItem } from '@/components/finv/Hub'
import { FinTable, type FinColumn } from '@/components/finv/FinTable'
import { DialogConfirm, FinDialog } from '@/components/finv/Dialog'
import { FinDrawer, drawerStyles as d } from '@/components/finv/Drawer'
import { DrawerGroup as Group, DrawerLine as Line, fd } from '@/components/finv/DrawerParts'
import { officeTime } from '@/lib/office-time'
import {
  IN_CARDS,
  OUT_CARDS,
  cardAmountOf,
  cardLabel,
  fundCards,
  fundHaystack,
  fundLine,
  fundNote,
  fundStatus,
  fundTrail,
  movedInMonth,
  onFundCard,
  ratePct,
  type FundCardKey,
  type FundRecord,
  type FundSide,
} from '@/lib/fund-hub'

// Fund OUT's and Fund IN's hub (2026-10-15, the Finance revamp v2 — D12 of
// `.design/fin-r2/handoff`, the prototype's `bankFund` / `listFund` /
// `detailFund`): the head, *Fund out · {Month YYYY}* — what moved this month —
// then a card a list beside the list it opens, a deal's drawer on a press.
// The cards are the system's own categories in the design's style (the user,
// 2026-10-14): Fund OUT by the loans' status, Fund IN by the source's type,
// and Pending approval. A deal is decided in Approvals, as always; the drawer
// takes the steps the deal's own page takes from the list — Cancel / Withdraw
// before it is approved, Amend terms after — and its own page keeps the rest
// (the schedule, repayments, a cancellation's reason).

const f2 = (n: number) => (n < 0 ? '-' : '') + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const rm = (n: number) => `RM ${f2(n)}`
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
/** "06 Oct 2026 · 09:12" on the office's clock. */
const stamp = (iso: string) => officeTime(iso).format('DD MMM YYYY · HH:mm')

export interface FundCan {
  /** Treasury · Edit — a pending fund source's Edit. */
  edit: boolean
  /** Treasury · Void — Cancel / Withdraw a deal still waiting for approval. */
  void: boolean
  /** Treasury · Approve — Amend terms on a live deal. */
  amend: boolean
}

export default function FundHub({
  side,
  records,
  month,
  today,
  head,
  initialCard,
  can,
  canSetDefault,
  onWithdraw,
}: {
  side: FundSide
  records: FundRecord[]
  /** The office's month, `YYYY-MM` — the hero's. */
  month: string
  /** The office's day — a fund source's maturity is read against it. */
  today: string
  /** The head's buttons (Create fund out · Loan aging · Export CSV / Record fund in). */
  head: ReactNode
  initialCard: FundCardKey
  can: FundCan
  /** Finance and the Principal may make their arrangement everyone's default. */
  canSetDefault: boolean
  /** Cancel (a loan) or Withdraw (a fund source) one still waiting for approval — the page's own action. */
  onWithdraw: (id: string) => Promise<{ error: string } | undefined>
}) {
  const router = useRouter()
  const out = side === 'out'
  const base = out ? '/fund-out' : '/fund-in'
  const keys = out ? OUT_CARDS : IN_CARDS
  const [card, setCard] = useState<FundCardKey>(keys.includes(initialCard) ? initialCard : 'all')
  const [query, setQuery] = useState('')
  const [drawerId, setDrawerId] = useState<string | null>(null)
  const [rowMenu, setRowMenu] = useState<{ r: FundRecord; anchor: RowMenuAnchor } | null>(null)
  const [ask, setAsk] = useState<FundRecord | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // The card in the address (?status=, the old tabs' — an Overdue link still lands on it), so a refresh or a link keeps it.
  useEffect(() => {
    const url = new URL(window.location.href)
    if (card === 'all') url.searchParams.delete('status')
    else url.searchParams.set('status', card)
    if (url.toString() !== window.location.href) window.history.replaceState(window.history.state, '', url.toString())
  }, [card])

  const [y, m] = month.split('-').map(Number)
  const cards: HubCardItem[] = useMemo(() => fundCards(side, records), [side, records])

  const q = query.trim().toLowerCase()
  const rows = useMemo(
    () =>
      records
        .filter((r) => onFundCard(r, card) && (!q || fundHaystack(r).includes(q)))
        .sort((a, b) => (b.date ?? b.createdAt.slice(0, 10)).localeCompare(a.date ?? a.createdAt.slice(0, 10))),
    [records, card, q],
  )
  const status = (r: FundRecord) => fundStatus(r, today)
  // The design's Name · Description · Amount, and its COLS['fund-out'] to tick on — Date, Type, Status (it has no
  // numbers to give Ref #); Outstanding and Rate are ours, the old list's.
  const columns: FinColumn<FundRecord>[] = [
    { key: 'name', label: 'Name', kind: 'name', fixed: true, width: 180, min: 120, value: (r) => r.party.toLowerCase(), text: (r) => r.party },
    { key: 'desc', label: 'Description', kind: 'desc', fixed: true, width: 200, min: 120, value: (r) => fundLine(r).toLowerCase(), text: (r) => fundLine(r) },
    { key: 'date', label: 'Date', kind: 'date', width: 112, value: (r) => r.date ?? '', text: (r) => fd(r.date) },
    { key: 'type', label: 'Type', kind: 'text', width: 130, value: (r) => r.typeLabel, text: (r) => r.typeLabel },
    { key: 'status', label: 'Status', kind: 'chip', width: 130, value: (r) => status(r).text, text: (r) => status(r).text, chip: (r) => status(r) },
    { key: 'outstanding', label: 'Outstanding', kind: 'amount', width: 140, value: (r) => r.outstanding ?? -1, text: (r) => (r.outstanding == null ? '—' : rm(r.outstanding)) },
    { key: 'rate', label: 'Rate', kind: 'no', width: 110, value: (r) => r.rate, text: (r) => `${ratePct(r.rate)} /mo` },
    {
      key: 'amount',
      label: 'Amount',
      kind: 'amount',
      fixed: true,
      width: 140,
      value: (r) => r.amount,
      text: (r) => `${out ? '−' : '+'}${rm(r.amount)}`,
      tone: (r) => (r.status === 'cancelled' ? null : out ? 'danger' : 'ledger'),
    },
  ]

  // ── The steps ──
  const closeAsk = () => {
    if (busy) return
    setAsk(null)
    setError(null)
  }
  const confirmWithdraw = async () => {
    if (!ask || busy) return
    setBusy(true)
    setError(null)
    try {
      const res = await onWithdraw(ask.id)
      if (res?.error) {
        setError(res.error)
        return
      }
      flash(out ? `Loan to ${ask.party} cancelled` : `Fund source from ${ask.party} withdrawn`)
      setAsk(null)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That did not go through. Try again.')
    } finally {
      setBusy(false)
    }
  }
  const printable = (r: FundRecord) => r.status !== 'cancelled'
  const amendable = (r: FundRecord) => can.amend && r.status === 'active'
  const rowMenuItems = (r: FundRecord): RowMenuItem[] => {
    const items: RowMenuItem[] = [
      { key: 'open', label: 'Open', onSelect: () => setDrawerId(r.id) },
      { key: 'new-tab', label: 'Open in new tab', onSelect: () => window.open(`${base}/${r.id}`, '_blank', 'noopener,noreferrer') },
    ]
    if (printable(r)) items.push({ key: 'print', label: 'Print schedule', onSelect: () => window.open(`${base}/${r.id}?print=1`, '_blank', 'noopener,noreferrer') })
    if (amendable(r)) items.push({ key: 'amend', label: 'Amend terms', onSelect: () => router.push(`${base}/${r.id}/edit`) })
    return items
  }
  const onRowContextMenu = (r: FundRecord, e: MouseEvent<HTMLElement>) => {
    e.preventDefault()
    setRowMenu({ r, anchor: { x: e.clientX, y: e.clientY } })
  }

  const drawn = drawerId ? (records.find((r) => r.id === drawerId) ?? null) : null
  const listTitle = cardLabel(side, card)
  return (
    <div className={hs.root} data-fin-kit="">
      <HubHead roman="II." eyebrow={out ? 'Fund · Fund OUT' : 'Fund · Fund IN'} title={out ? 'Fund OUT' : 'Fund IN'} actions={head} />

      <div className={hs.hub}>
        <HubCards
          heroLabel={`${out ? 'Fund out' : 'Fund in'} · ${MONTHS[m - 1]} ${y}`}
          heroValue={rm(movedInMonth(records, month))}
          cards={cards}
          active={card}
          onSelect={(k) => setCard(k as FundCardKey)}
        />
        <FinTable
          layoutId={out ? 'fin.fund-out' : 'fin.fund-in'}
          title={listTitle}
          rows={rows}
          rowKey={(r) => r.id}
          columns={columns}
          amountOf={cardAmountOf(card)}
          faint={(r) => r.status === 'cancelled'}
          search={{ value: query, onChange: setQuery, placeholder: 'Search company, description…' }}
          activeKey={drawerId}
          onRowClick={(r) => setDrawerId(r.id)}
          onRowContextMenu={onRowContextMenu}
          emptyText={records.length === 0 ? (out ? 'No loans yet.' : 'No fund sources yet.') : 'Nothing here yet.'}
          canSetDefault={canSetDefault}
        />
      </div>

      <FundDrawer
        r={drawn}
        open={!!drawerId}
        onClose={() => setDrawerId(null)}
        today={today}
        base={base}
        can={can}
        busy={busy}
        onWithdraw={(r) => {
          setError(null)
          setAsk(r)
        }}
      />

      <FinDialog open={!!ask} onClose={closeAsk} title={ask ? (out ? `Cancel the loan to ${ask.party}?` : `Withdraw the fund source from ${ask.party}?`) : ''} locked={busy}>
        <DialogConfirm
          text={
            ask
              ? out
                ? `It never went out — the ${rm(ask.amount)} loan is cancelled and its approval request closes.`
                : `It was never booked — the ${rm(ask.amount)} fund source is cancelled and its approval request closes.`
              : ''
          }
          confirmLabel={busy ? 'Working…' : out ? 'Cancel loan' : 'Withdraw'}
          danger
          busy={busy}
          error={error}
          onCancel={closeAsk}
          onConfirm={() => void confirmWithdraw()}
        />
      </FinDialog>

      {rowMenu ? (
        <RowMenu title={`${rowMenu.r.party} · ${status(rowMenu.r).text}`} anchor={rowMenu.anchor} items={rowMenuItems(rowMenu.r)} onClose={() => setRowMenu(null)} />
      ) : null}
    </div>
  )
}

/**
 * A deal in the drawer (the prototype's `detailFund`): the dark hero — *Fund out · Loan out*, the amount, to or
 * from whom, where it stands — then I Transfer to / Received from, II When & where, III Booking, the trail, and
 * at its foot the steps this reader may take in the state it is in.
 */
function FundDrawer({
  r,
  open,
  onClose,
  today,
  base,
  can,
  busy,
  onWithdraw,
}: {
  r: FundRecord | null
  open: boolean
  onClose: () => void
  today: string
  base: string
  can: FundCan
  busy: boolean
  onWithdraw: (r: FundRecord) => void
}) {
  const out = r?.side === 'out'
  const bar: ReactNode[] = (r ? fundSteps(r, can) : []).map((st) =>
    st.href ? (
      <Link key={st.key} href={st.href} className={d.barBtn} data-kind={st.kind === 'secondary' ? undefined : st.kind}>
        {st.label}
      </Link>
    ) : (
      <button key={st.key} type="button" className={d.barBtn} data-kind={st.kind === 'secondary' ? undefined : st.kind} disabled={busy} onClick={() => r && onWithdraw(r)}>
        {st.label}
      </button>
    ),
  )

  return (
    <FinDrawer
      open={open}
      onClose={onClose}
      label={r ? `${out ? 'Fund out' : 'Fund in'} · ${r.party}` : 'Fund'}
      title={r?.party ?? ''}
      headActions={
        r ? (
          <>
            <Link href={`${base}/${r.id}`} className={d.headBtn}>
              View full page ↗
            </Link>
            {r.status !== 'cancelled' ? (
              <a href={`${base}/${r.id}?print=1`} target="_blank" rel="noopener noreferrer" className={d.headBtn}>
                Print
              </a>
            ) : null}
          </>
        ) : null
      }
      bar={bar.length > 0 ? bar : null}
    >
      {!r ? <div className={d.loading}>This is not on the list any more.</div> : <FundDetailBody r={r} today={today} />}
    </FinDrawer>
  )
}

export type FundStepKey = 'decide' | 'edit' | 'withdraw' | 'amend'

/**
 * What this reader may do to a deal from its drawer (the prototype's `detailFund` bar, the system's steps): one
 * still waiting — Open in Approvals (whoever decides it), a fund source's Edit, Cancel loan / Withdraw; a live
 * one — Amend terms. The rest is its own page's.
 */
export function fundSteps(r: FundRecord, can: FundCan): Array<{ key: FundStepKey; label: string; kind: 'primary' | 'secondary' | 'danger'; href?: string }> {
  const out = r.side === 'out'
  const base = out ? '/fund-out' : '/fund-in'
  if (r.status === 'pending_approval') {
    return [
      ...(r.approval && r.decidable ? [{ key: 'decide' as const, label: 'Open in Approvals', kind: 'primary' as const, href: `/approvals/${r.approval.id}` }] : []),
      ...(!out && can.edit ? [{ key: 'edit' as const, label: 'Edit', kind: 'secondary' as const, href: `${base}/${r.id}/edit` }] : []),
      ...(can.void ? [{ key: 'withdraw' as const, label: out ? 'Cancel loan' : 'Withdraw', kind: 'danger' as const }] : []),
    ]
  }
  if (can.amend && r.status === 'active') return [{ key: 'amend', label: 'Amend terms', kind: 'secondary', href: `${base}/${r.id}/edit` }]
  return []
}

/**
 * A deal as the drawer draws it (the prototype's `detailFund`): the dark hero — *Fund out · Loan out*, the amount,
 * to or from whom, where it stands — then I Transfer to / Received from, II When & where, III Booking, and the
 * trail. The Finance phone app's record draws it too, with the full page's own parts (`more`, before the trail)
 * and its audit log (after it).
 */
export function FundDetailBody({
  r,
  today,
  more,
  audit,
}: {
  r: FundRecord
  today: string
  /** The full page's own groups — the schedule, the repayments, the terms, the settings (the phone's record). */
  more?: ReactNode
  /** The audit log — what the reader's permissions open. */
  audit?: Array<{ at: string; who: string; what: string }> | null
}) {
  const out = r.side === 'out'
  const st = fundStatus(r, today)
  // The deal's switches, said only when on (its own page keeps them): compound interest, minimum pay.
  const interest = [r.compound ? 'Compound' : null, r.minPayInterest ? 'Minimum pay' : null].filter(Boolean).join(' · ')
  const steps = fundTrail(r)
  return (
    <>
      <div className={d.hero} data-light={st.tone}>
        <div className={d.heroTop}>
          <span className={d.kicker}>
            {out ? 'Fund out' : 'Fund in'} · {r.typeLabel}
          </span>
          <span className={d.heroChip}>
            <span className={d.heroDot} />
            {st.text}
          </span>
        </div>
        <div className={d.heroAmount}>
          {out ? '−' : '+'}
          {rm(r.amount)}
        </div>
        <div className={d.heroTo}>
          {out ? 'To' : 'From'} {r.party}
        </div>
        <div className={d.heroNote}>
          <span className={d.heroNoteDot} />
          <span>{fundNote(r)}</span>
        </div>
      </div>

      <Group n="I." title={out ? 'Transfer to' : 'Received from'}>
        <Line label={out ? 'Recipient' : 'Payer'} value={r.party} />
        <Line label="Type" value={r.typeLabel} />
        {r.fundingSource ? <Line label="Funding source" value={`SC ${r.fundingSource}`} /> : null}
        {r.notes ? <Line label={out ? 'Terms' : 'Notes'} value={r.notes} /> : null}
      </Group>
      <Group n="II." title="When & where">
        <Line label="Date" value={fd(r.date)} mono />
        <Line label="Maturity" value={r.maturity ? fd(r.maturity) : 'No fixed term'} mono={!!r.maturity} />
        {r.bank ? <Line label="Into bank" value={r.bank.name} sub={r.bank.number} /> : null}
      </Group>
      <Group n="III." title="Booking">
        {r.account ? <Line label="Account" value={r.account.name} sub={r.account.code} /> : null}
        <Line label="Amount" value={rm(r.amount)} mono />
        <Line label="Rate" value={`${ratePct(r.rate)} /mo`} sub={r.months == null ? 'no fixed term' : plural(r.months, 'month', 'months')} mono />
        {interest ? <Line label="Interest" value={interest} /> : null}
        {r.outstanding != null ? <Line label="Outstanding" value={rm(r.outstanding)} sub={r.repaid > 0 ? `${rm(r.repaid)} repaid` : undefined} mono /> : null}
        {r.overdue ? <Line label="Overdue" value={rm(r.overdue.amount)} sub={`since ${fd(r.overdue.since)} · ${plural(r.overdue.days, 'day', 'days')}`} mono /> : null}
      </Group>
      {more}

      <div className={d.label}>Trail</div>
      <div className={d.trail}>
        {steps.map((s, i) => (
          <div key={i} className={d.step} data-state={s.state}>
            <div className={d.stepRail}>
              <span className={d.stepDot} />
              <span className={d.stepLine} data-on={steps[i + 1] && steps[i + 1].state !== 'todo' ? 'true' : undefined} />
            </div>
            <div className={d.stepText}>
              <div className={d.stepLabel}>{s.label}</div>
              <div className={d.stepBy}>{[s.by, s.at ? stamp(s.at) : s.on ? fd(s.on) : null].filter(Boolean).join(' ')}</div>
            </div>
          </div>
        ))}
      </div>

      {audit ? (
        <>
          <div className={d.label}>
            Audit log · {audit.length} {audit.length === 1 ? 'event' : 'events'}
          </div>
          <div className={d.audit}>
            {audit.length === 0 ? (
              <div className={d.groupEmpty}>No change on record.</div>
            ) : (
              audit.map((a, i) => (
                <div key={i} className={d.auditRow}>
                  <span className={d.auditWhat}>{a.what}</span>
                  <span className={d.auditMeta}>
                    {a.who} · {a.at}
                  </span>
                </div>
              ))
            )}
          </div>
        </>
      ) : null}
    </>
  )
}
