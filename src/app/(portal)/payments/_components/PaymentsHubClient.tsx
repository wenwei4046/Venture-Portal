'use client'

import { useMemo, useState, useEffect, type MouseEvent } from 'react'
import { useRouter } from 'next/navigation'
import type { HrIconName } from '@/components/hrv/icons'
import RowMenu, { type RowMenuAnchor, type RowMenuItem } from '@/components/RowMenu'
import { BatchList, HeadButton, HubCards, HubHead, hubStyles as hs, type CardTone, type ChipTone } from '@/components/finv/Hub'
import { FinTable, type FinColumn } from '@/components/finv/FinTable'
import { DialogMenu, FinDialog, type DialogMenuItem } from '@/components/finv/Dialog'
import AmendDateButton from './AmendDateButton'
import AmendRepaymentButton from './AmendRepaymentButton'
import { VoucherDrawer, fd } from './VoucherDrawer'
import { statusWord, type HubCardKey, type HubLedger, type HubRow } from '../_lib/hub-ledger'

// Payments' hub (2026-10-14, the Finance revamp v2 — D02–D05 of
// `.design/fin-r2/handoff`): the head (Create payment, Dept · N, Payroll · N,
// and ours kept — Claims · N, Export ▾), the cards beside the list, the
// table with its column tools, the payroll batches, and the drawer a row
// opens. The rows come once from the server; a card or a search answers at
// once, and the URL keeps the card (?status=) for a link or a refresh.

export interface RequestItem {
  key: string
  label: string
  sub: string
}

const f2 = (n: number) => (n < 0 ? '-' : '') + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const rm = (n: number) => `RM ${f2(n)}`

const CARD: Record<HubCardKey, { label: string; tone: CardTone; icon: HrIconName; title: string }> = {
  all: { label: 'All vouchers', tone: 'all', icon: 'doc', title: 'All vouchers' },
  draft: { label: 'Draft', tone: 'draft', icon: 'doc', title: 'Draft' },
  pending_approval: { label: 'Pending approval', tone: 'pending_approval', icon: 'calendar', title: 'Pending approval' },
  approved: { label: 'Approved', tone: 'approved', icon: 'approve', title: 'Approved' },
  paid: { label: 'Paid', tone: 'paid', icon: 'payroll', title: 'Paid' },
  voided: { label: 'Voided', tone: 'quiet', icon: 'fileAlert', title: 'Voided' },
  payroll: { label: 'Payroll batches', tone: 'payroll', icon: 'payroll', title: 'Payroll batches' },
}
const CHIP: Record<string, ChipTone> = { draft: 'def', pending_approval: 'wait', approved: 'accent', paid: 'ledger', voided: 'info', mixed: 'def' }
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

const COLUMNS: FinColumn<HubRow>[] = [
  { key: 'name', label: 'Name', kind: 'name', fixed: true, width: 180, min: 120, value: (r) => r.name.toLowerCase(), text: (r) => r.name },
  { key: 'desc', label: 'Description', kind: 'desc', fixed: true, width: 200, min: 120, value: (r) => r.desc.toLowerCase(), text: (r) => r.desc || '—' },
  { key: 'no', label: 'Ref #', kind: 'no', width: 170, value: (r) => r.no ?? '', text: (r) => r.no ?? '—' },
  { key: 'date', label: 'Date', kind: 'date', width: 112, value: (r) => r.date, text: (r) => fd(r.date) },
  { key: 'cat', label: 'Category', kind: 'text', width: 130, value: (r) => r.cat.toLowerCase(), text: (r) => r.cat },
  { key: 'pool', label: 'Pool', kind: 'text', width: 120, value: (r) => r.pool.toLowerCase(), text: (r) => r.pool },
  {
    key: 'status',
    label: 'Status',
    kind: 'chip',
    width: 112,
    value: (r) => r.status,
    text: (r) => statusWord(r.status),
    chip: (r) => ({ text: statusWord(r.status), tone: CHIP[r.status] ?? 'def' }),
  },
  { key: 'amount', label: 'Amount', kind: 'amount', fixed: true, width: 130, value: (r) => r.amount, text: (r) => rm(r.amount) },
]

export default function PaymentsHubClient({
  ledger,
  canCreate,
  canSetDefault,
  dept,
  payroll,
  claims,
}: {
  ledger: HubLedger
  canCreate: boolean
  canSetDefault: boolean
  dept: RequestItem[]
  /** null without Payroll payouts: Payroll Requests is not theirs to open. */
  payroll: RequestItem[] | null
  claims: RequestItem[]
}) {
  const router = useRouter()
  const [card, setCard] = useState<HubCardKey>(ledger.initialCard)
  const [query, setQuery] = useState(ledger.initialQuery)
  const [openBatches, setOpenBatches] = useState<Set<string>>(new Set())
  const [drawer, setDrawer] = useState<string | null>(null)
  const [menu, setMenu] = useState<'dept' | 'payroll' | 'claims' | 'export' | null>(null)
  const [rowMenu, setRowMenu] = useState<{ row: HubRow; anchor: RowMenuAnchor } | null>(null)
  const [redate, setRedate] = useState<{ row: HubRow; nonce: number } | null>(null)
  const [amend, setAmend] = useState<{ row: HubRow; nonce: number } | null>(null)

  // The card in the URL, so a refresh or a link lands on it (no navigation: the list is here).
  useEffect(() => {
    const url = new URL(window.location.href)
    if (card === 'all') url.searchParams.delete('status')
    else url.searchParams.set('status', card)
    if (url.toString() !== window.location.href) window.history.replaceState(window.history.state, '', url.toString())
  }, [card])

  const q = query.trim().toLowerCase()
  const rows = useMemo(
    () =>
      ledger.rows.filter(
        (r) =>
          r.cards.includes(card) &&
          (!q || `${r.no ?? ''} ${r.name} ${r.desc} ${r.cat} ${r.pool}`.toLowerCase().includes(q)),
      ),
    [ledger.rows, card, q],
  )

  const cards = ledger.cards.map((c) => ({
    key: c.key,
    tone: CARD[c.key].tone,
    icon: CARD[c.key].icon,
    label: CARD[c.key].label,
    sub:
      c.key === 'payroll'
        ? `${plural(c.count, 'batch', 'batches')} · ${plural(ledger.batches.reduce((n, b) => n + b.count, 0), 'voucher', 'vouchers')}`
        : plural(c.count, 'voucher', 'vouchers'),
    value: rm(c.amount),
  }))

  const openRow = (r: HubRow) => {
    if (r.kind === 'voucher') setDrawer(r.id)
    else if (r.kind === 'batch' && r.batch) {
      setCard('payroll')
      setOpenBatches((prev) => new Set(prev).add(r.batch!))
    } else if (r.href) router.push(r.href)
  }
  const hrefOf = (r: HubRow) => (r.kind === 'voucher' ? `/payments/${r.id}` : r.href)
  const onRowContextMenu = (r: HubRow, e: MouseEvent<HTMLElement>) => {
    if (r.kind === 'batch') return
    e.preventDefault()
    setRowMenu({ row: r, anchor: { x: e.clientX, y: e.clientY } })
  }
  let rowMenuNode = null
  if (rowMenu) {
    const r = rowMenu.row
    const href = hrefOf(r)
    const items: RowMenuItem[] = [{ key: 'open', label: 'Open', onSelect: () => openRow(r) }]
    if (href) items.push({ key: 'new-tab', label: 'Open in new tab', onSelect: () => window.open(href, '_blank', 'noopener,noreferrer') })
    const extra: RowMenuItem[] = [
      ...(r.amendDate ? [{ key: 'redate', label: 'Change date', hint: 'when the date was keyed wrong', onSelect: () => setRedate({ row: r, nonce: Date.now() }) }] : []),
      ...(r.amendAmount ? [{ key: 'amend', label: 'Change amount', hint: 'loan repayment rows', onSelect: () => setAmend({ row: r, nonce: Date.now() }) }] : []),
    ]
    if (extra.length > 0) items.push('sep', ...extra)
    rowMenuNode = <RowMenu title={`${r.no ?? r.cat} · ${statusWord(r.status)}`} anchor={rowMenu.anchor} items={items} onClose={() => setRowMenu(null)} />
  }

  const toggleBatch = (key: string) =>
    setOpenBatches((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  const batchCount = `${plural(ledger.batches.length, 'batch', 'batches')} · ${plural(ledger.batches.reduce((n, b) => n + b.count, 0), 'voucher', 'vouchers')}`

  // ── The head ──
  const exportHref = (format: 'xlsx' | 'pdf') => {
    const p = new URLSearchParams({ format, direction: 'debit' })
    if (card !== 'all') p.set('status', card)
    if (q) p.set('q', query.trim())
    return `/payments/export?${p.toString()}`
  }
  const requestMenu = (items: RequestItem[], page: string, open: string, none: string): DialogMenuItem[] =>
    items.length > 0
      ? items.map((it) => ({ key: it.key, label: it.label, sub: it.sub, onClick: () => { setMenu(null); router.push(page) } }))
      : [{ key: 'open', label: open, sub: none, onClick: () => { setMenu(null); router.push(page) } }]

  return (
    <div className={hs.root} data-fin-kit="">
      <HubHead
        roman="I."
        eyebrow="Daily · Payments"
        title="Payments"
        actions={
          <>
            {canCreate ? (
              <HeadButton primary href="/payments/new">
                Create payment
              </HeadButton>
            ) : null}
            <HeadButton onClick={() => setMenu('dept')}>{dept.length > 0 ? `Dept · ${dept.length}` : 'Dept'}</HeadButton>
            {payroll ? <HeadButton onClick={() => setMenu('payroll')}>{payroll.length > 0 ? `Payroll · ${payroll.length}` : 'Payroll'}</HeadButton> : null}
            <HeadButton onClick={() => setMenu('claims')}>{claims.length > 0 ? `Claims · ${claims.length}` : 'Claims'}</HeadButton>
            <HeadButton onClick={() => setMenu('export')}>Export ▾</HeadButton>
          </>
        }
      />

      <div className={hs.hub}>
        <HubCards heroLabel={ledger.hero.label} heroValue={rm(ledger.hero.amount)} cards={cards} active={card} onSelect={(k) => setCard(k as HubCardKey)} />
        {card === 'payroll' ? (
          <FinTable
            layoutId="fin.payments"
            title={CARD.payroll.title}
            rows={[] as HubRow[]}
            rowKey={(r) => r.id}
            columns={COLUMNS}
            amountOf={(r) => r.amount}
            onRowClick={openRow}
            emptyText="No payroll batches."
            countText={batchCount}
          >
            {ledger.batches.length === 0 ? (
              <div className={hs.empty}>No payroll batches.</div>
            ) : (
              <BatchList
                count={batchCount}
                open={openBatches}
                onToggle={toggleBatch}
                batches={ledger.batches.map((b) => ({
                  key: b.key,
                  name: b.name,
                  meta: `${plural(b.count, 'voucher', 'vouchers')} · ${b.statusText}${b.latest ? ` · ${fd(b.latest)}` : ''}`,
                  amount: `−${f2(b.total)}`,
                  members: b.members.map((m, i) => ({
                    key: m.id ?? `${b.key}:${i}`,
                    who: m.who,
                    no: m.no,
                    amount: f2(m.amount),
                    onOpen: m.id ? () => setDrawer(m.id) : undefined,
                  })),
                }))}
              />
            )}
          </FinTable>
        ) : (
          <FinTable
            layoutId="fin.payments"
            title={CARD[card].title}
            rows={rows}
            rowKey={(r) => r.id}
            columns={COLUMNS}
            amountOf={(r) => r.amount}
            faint={(r) => r.status === 'voided'}
            search={{ value: query, onChange: setQuery, placeholder: 'Search voucher #, payee, description…' }}
            activeKey={drawer}
            onRowClick={openRow}
            onRowContextMenu={onRowContextMenu}
            emptyText={ledger.empty ? 'No payment vouchers yet.' : 'No vouchers here.'}
            canSetDefault={canSetDefault}
          />
        )}
      </div>

      <VoucherDrawer id={drawer} onClose={() => setDrawer(null)} onChanged={() => router.refresh()} />

      <FinDialog open={menu === 'dept'} onClose={() => setMenu(null)} title="Dept Requests" sub={dept.length > 0 ? `${dept.length} waiting for a voucher` : undefined}>
        <DialogMenu items={requestMenu(dept, '/payments/dept-requests', 'Open Dept Requests', 'Nothing waiting')} />
      </FinDialog>
      {payroll ? (
        <FinDialog open={menu === 'payroll'} onClose={() => setMenu(null)} title="Payroll Requests" sub={payroll.length > 0 ? `${payroll.length} waiting` : undefined}>
          <DialogMenu items={requestMenu(payroll, '/payments/payroll-requests', 'Open Payroll Requests', 'Nothing waiting')} />
        </FinDialog>
      ) : null}
      <FinDialog open={menu === 'claims'} onClose={() => setMenu(null)} title="Claim Requests" sub={claims.length > 0 ? `${claims.length} waiting for a voucher` : undefined}>
        <DialogMenu items={requestMenu(claims, '/payments/claim-requests', 'Open Claim Requests', 'Nothing waiting')} />
      </FinDialog>
      <FinDialog open={menu === 'export'} onClose={() => setMenu(null)} title="Export" sub={`${CARD[card].title}${q ? ` · “${query.trim()}”` : ''}`}>
        <DialogMenu
          items={[
            { key: 'xlsx', label: 'Excel', onClick: () => { setMenu(null); window.location.assign(exportHref('xlsx')) } },
            { key: 'pdf', label: 'PDF', onClick: () => { setMenu(null); window.open(exportHref('pdf'), '_blank', 'noopener,noreferrer') } },
          ]}
        />
      </FinDialog>

      {rowMenuNode}
      {redate?.row.amendDate ? (
        <AmendDateButton
          key={`${redate.row.id}:${redate.nonce}`}
          autoOpen
          hideTrigger
          kind={redate.row.amendDate.kind}
          id={redate.row.amendDate.id}
          currentDate={redate.row.amendDate.date}
          label={redate.row.no ?? `${redate.row.cat} · ${redate.row.name}`}
        />
      ) : null}
      {amend ? (
        <AmendRepaymentButton
          key={`${amend.row.id}:${amend.nonce}`}
          autoOpen
          hideTrigger
          repaymentId={amend.row.id.slice(4)}
          currentAmount={amend.row.amount}
          label={amend.row.cat}
        />
      ) : null}
    </div>
  )
}
