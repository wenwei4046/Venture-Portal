'use client'

import { useEffect, useMemo, useState, type MouseEvent } from 'react'
import { useRouter } from 'next/navigation'
import RowMenu, { type RowMenuAnchor, type RowMenuItem } from '@/components/RowMenu'
import { HeadButton, HubCards, HubHead, ItemList, MonthNav, hubStyles as hs, type ItemRow } from '@/components/finv/Hub'
import { FinTable, type FinColumn } from '@/components/finv/FinTable'
import { fd } from '@/components/finv/DrawerParts'
import { batchLabel, methodLabel, recordLine, splitSummary } from '@/lib/allocator-sheet'
import { AllocationDrawer, categoryLabel, recordedOn, type AllocationCan } from './AllocationDrawer'
import AllocationCalc from './AllocationCalc'
import { monthLong, splitsText } from './StaffDialogs'
import { ALLOCATOR_CARD, useAllocatorWork, type AllocatorCard } from './allocator-work'
import type { AllocatorData, StaffRow, TxnRow } from './types'

// The Billing Allocator's hub (2026-10-14, the Finance revamp v2 — D11 of
// `.design/fin-r2/handoff`, the prototype's `bankBilling`): the head (Generate
// invoices, + New allocation), *Allocated · {Month YYYY}* with the month pill
// under it (ours — the records are a month's; the design's phone hub has it),
// the notice of what is still to bill, then a card a list — Records, By
// company, Staff, Setup — beside the list it opens: Records the table (the
// record in the drawer), By company its shares, Staff the people the headcount
// counts, Setup the companies, categories and templates. Every write is the
// allocator's own Server Action, each behind its gate (`useAllocatorWork`,
// which the Finance phone app's Billing screens share); *+ New allocation* and
// *Correct* open the system's Calculate in the drawer (AllocationCalc).

export type { AllocatorCard }

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const f2 = (n: number) => (n < 0 ? '-' : '') + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const rm = (n: number) => `RM ${f2(n)}`
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

export default function AllocatorHub({
  data,
  can,
  canSetDefault,
  thisMonth,
  initialCard,
  editId,
}: {
  data: AllocatorData
  can: AllocationCan
  /** Finance and the Principal may make their arrangement everyone's default. */
  canSetDefault: boolean
  /** The office's month, `YYYY-MM`. */
  thisMonth: string
  initialCard: AllocatorCard
  /** `?edit=` — a record's own page sent it back to be corrected (2026-10-09). */
  editId?: string
}) {
  const router = useRouter()
  const month = data.period
  const [yy, mm] = month.split('-').map(Number)
  const monthName = monthLong(month)
  const monthShort = `${MON[mm - 1]} ${yy}`
  const shift = (n: number) => {
    const t = new Date(Date.UTC(yy, mm - 1 + n, 1))
    return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}`
  }

  // A record arriving from its own page (?edit=) opens Calculate with it loaded — unless the month does not hold it, or it is billed.
  const arriving = editId ? (data.txns.find((t) => t.id === editId && !t.locked) ?? null) : null
  const [card, setCard] = useState<AllocatorCard>(initialCard)
  // Another month keeps the list on show.
  const go = (ym: string) => router.push(`/billing-allocator?period=${ym}${card === 'records' ? '' : `&card=${card}`}`)
  const [query, setQuery] = useState('')
  const [staffQuery, setStaffQuery] = useState('')
  const [drawerId, setDrawerId] = useState<string | null>(null)
  // Calculate (the drawer) stays mounted while it plays out (open: false); the next one, a new nonce, starts afresh.
  const [calc, setCalc] = useState<{ edit: TxnRow | null; nonce: number; open: boolean } | null>(() => (arriving && can.edit ? { edit: arriving, nonce: 1, open: true } : null))
  const [rowMenu, setRowMenu] = useState<{ txn: TxnRow; anchor: RowMenuAnchor } | null>(null)

  const work = useAllocatorWork({
    data,
    onGone: () => setDrawerId(null),
    onOpenInvoice: (id) => router.push(`/invoices/${id}`),
  })
  const { summary, shares, enabled, busy, open } = work

  // The card in the address, so a refresh or a link lands on it; ?edit= dropped once read, so Back does not open the correction again.
  useEffect(() => {
    const url = new URL(window.location.href)
    if (card === 'records') url.searchParams.delete('card')
    else url.searchParams.set('card', card)
    url.searchParams.delete('edit')
    if (url.toString() !== window.location.href) window.history.replaceState(window.history.state, '', url.toString())
  }, [card])

  const openCalc = (edit: TxnRow | null) => setCalc({ edit, nonce: Date.now(), open: true })
  const correct = (t: TxnRow) => {
    setDrawerId(null)
    setRowMenu(null)
    work.closeMenus()
    openCalc(t)
  }

  // ── Records ──
  const q = query.trim().toLowerCase()
  const rows = useMemo(
    () => data.txns.filter((t) => !q || `${t.txnNo} ${t.description} ${splitSummary(t)} ${t.categoryName}`.toLowerCase().includes(q)),
    [data.txns, q],
  )
  const catOf = (t: TxnRow) => data.categories.find((c) => c.id === t.categoryId)
  // The design's Name · Description · Amount, and its COLS.billing to tick on (Category and Split are ours, kept).
  const columns: FinColumn<TxnRow>[] = [
    { key: 'name', label: 'Name', kind: 'name', fixed: true, width: 180, min: 120, value: (t) => t.description.toLowerCase(), text: (t) => t.description },
    { key: 'desc', label: 'Description', kind: 'desc', fixed: true, width: 200, min: 120, value: (t) => recordLine(t).toLowerCase(), text: (t) => recordLine(t) },
    { key: 'no', label: 'Txn', kind: 'no', width: 170, value: (t) => t.txnNo, text: (t) => t.txnNo },
    { key: 'date', label: 'Date', kind: 'date', width: 112, value: (t) => recordedOn(t) ?? '', text: (t) => fd(recordedOn(t)) },
    { key: 'method', label: 'Method', kind: 'text', width: 110, value: (t) => t.method, text: (t) => methodLabel(t.method) },
    { key: 'batch', label: 'Batch', kind: 'text', width: 130, value: (t) => batchLabel(t), text: (t) => batchLabel(t) },
    { key: 'cat', label: 'Category', kind: 'text', width: 130, value: (t) => t.categoryName.toLowerCase(), text: (t) => (catOf(t) ? categoryLabel(catOf(t)) : '—') },
    { key: 'split', label: 'Split', kind: 'text', width: 220, value: (t) => splitSummary(t), text: (t) => splitSummary(t) },
    {
      key: 'status',
      label: 'Status',
      kind: 'chip',
      width: 112,
      value: (t) => (t.locked ? 'billed' : 'to bill'),
      text: (t) => (t.locked ? 'billed' : 'to bill'),
      chip: (t) => ({ text: t.locked ? 'billed' : 'to bill', tone: t.locked ? 'ledger' : 'alert' }),
    },
    { key: 'amount', label: 'Amount', kind: 'amount', fixed: true, width: 130, value: (t) => t.amount, text: (t) => rm(t.amount) },
  ]
  const lockedWhy = (t: TxnRow) => `Billed under ${t.billedRef} — delete or void its invoices on Invoice first`
  const rowMenuItems = (t: TxnRow): RowMenuItem[] => {
    const items: RowMenuItem[] = [
      { key: 'open', label: 'Open', onSelect: () => setDrawerId(t.id) },
      { key: 'new-tab', label: 'Open in new tab', onSelect: () => window.open(`/billing-allocator/${t.id}`, '_blank', 'noopener,noreferrer') },
    ]
    if (can.edit) {
      items.push(
        'sep',
        { key: 'correct', label: 'Correct', hint: t.locked ? lockedWhy(t) : 'Load it into Calculate; saving overwrites it', disabled: t.locked, onSelect: () => correct(t) },
        'sep',
        { key: 'delete', label: 'Delete allocation', danger: true, hint: t.locked ? lockedWhy(t) : undefined, disabled: t.locked, onSelect: () => work.askDelete(t) },
      )
    }
    return items
  }
  const onRowContextMenu = (t: TxnRow, e: MouseEvent<HTMLElement>) => {
    e.preventDefault()
    setRowMenu({ txn: t, anchor: { x: e.clientX, y: e.clientY } })
  }

  // ── By company: each company's share of the month, what is billed, what is still to bill ──
  const companyItems: ItemRow[] = shares.map((r) => ({
    key: r.id ?? 'own',
    label: r.label,
    sub: `billed ${f2(r.billed)} · ${r.invoices.map((i) => i.invoiceNo).join(' · ') || 'none yet'}`,
    value: r.toBill > 0.005 ? `to bill ${f2(r.toBill)}` : f2(r.share),
    valueTone: r.toBill > 0.005 ? 'alert' : 'ledger',
  }))

  // ── Staff ──
  const sq = staffQuery.trim().toLowerCase()
  const staffLabel = (s: StaffRow) => splitsText(s.splits.map((x) => ({ label: x.targetId === null ? 'HV own' : x.label.replace(/ \(dept\)$/, ''), pct: x.pct })))
  const staffItems: ItemRow[] = [...data.staff]
    .filter((s) => !sq || `${s.name} ${s.department} ${staffLabel(s)}`.toLowerCase().includes(sq))
    .sort((x, y) => (y.createdAt || '').localeCompare(x.createdAt || '') || x.name.localeCompare(y.name))
    .map((s) => ({
      key: s.id,
      label: s.department ? `${s.name} · ${s.department}` : s.name,
      sub: `${staffLabel(s)} · added ${fd(s.createdAt ? recordedOn({ createdAt: s.createdAt }) : null)}`,
      value: s.status,
      valueTone: s.status === 'active' ? 'ledger' : 'muted',
      action: can.edit ? { label: 'Edit', onClick: () => open({ kind: 'staff', person: s }) } : null,
    }))

  // ── Setup ──
  const companyRows: ItemRow[] = data.companySettings.map((c) => ({
    key: c.id,
    label: c.name ?? c.label,
    sub: c.code || c.label,
    value: c.enabled ? 'enabled' : 'off',
    valueTone: c.enabled ? 'ledger' : 'muted',
    action: can.edit
      ? {
          label: c.enabled ? 'Turn off' : 'Turn on',
          disabled: busy,
          title: c.enabled ? 'Take it out of the allocation' : 'Bring it back into the allocation',
          onClick: () => work.toggleCompany(c),
        }
      : null,
  }))
  const categoryRows: ItemRow[] = data.categories.map((c) => ({
    key: c.id,
    label: c.name,
    sub: c.coaCode ? `${c.coaCode} · ${data.coaAccounts.find((x) => x.code === c.coaCode)?.name ?? ''}`.replace(/ · $/, '') : 'the invoice’s default account',
    action: can.edit ? { label: 'Edit', onClick: () => open({ kind: 'category', category: c }) } : null,
  }))
  const templateRows: ItemRow[] = data.templates.map((t) => {
    const cat = data.categories.find((c) => c.id === t.categoryId)
    return {
      key: t.id,
      label: t.name,
      sub: [methodLabel(t.method), cat?.name ?? 'no category', t.status !== 'active' ? 'inactive' : ''].filter(Boolean).join(' · '),
      value: f2(t.amount),
      action: can.edit ? { label: 'Edit', onClick: () => open({ kind: 'template', template: t }) } : null,
    }
  })

  const drawerTxn = drawerId ? (data.txns.find((t) => t.id === drawerId) ?? null) : null

  // ── The toolbar's own buttons ──
  const tools =
    card === 'staff' && can.edit ? (
      <>
        <button type="button" className={hs.toolBtn} onClick={() => open({ kind: 'staff', person: null })}>
          + Add staff
        </button>
        <button type="button" className={hs.toolBtn} disabled={busy} onClick={work.saveSnapshot}>
          {work.snapshotLabel}
        </button>
        {data.hrPeriods.length > 0 ? (
          <button type="button" className={hs.toolBtn} onClick={() => open({ kind: 'import' })}>
            Import from HR
          </button>
        ) : null}
        {data.snapshotPeriods.length > 0 ? (
          <button type="button" className={hs.toolBtn} onClick={work.openSnapshots}>
            Snapshots <span className={hs.toolN}>· {data.snapshotPeriods.length}</span>
          </button>
        ) : null}
      </>
    ) : card === 'staff' && data.snapshotPeriods.length > 0 ? (
      <button type="button" className={hs.toolBtn} onClick={work.openSnapshots}>
        Snapshots <span className={hs.toolN}>· {data.snapshotPeriods.length}</span>
      </button>
    ) : card === 'setup' && can.edit ? (
      <>
        <button type="button" className={hs.toolBtn} onClick={() => open({ kind: 'category', category: null })}>
          + Add category
        </button>
        <button type="button" className={hs.toolBtn} onClick={() => open({ kind: 'template', template: null })}>
          + Add template
        </button>
      </>
    ) : null

  const listTitle = ALLOCATOR_CARD[card].label
  return (
    <div className={hs.root} data-fin-kit="">
      <HubHead
        roman="I."
        eyebrow="Daily · Billing Allocator"
        title="Billing Allocator"
        actions={
          can.create ? (
            <>
              {summary.toBillCount > 0 ? (
                <HeadButton primary onClick={work.askGenerate}>
                  Generate invoices
                </HeadButton>
              ) : null}
              <HeadButton primary={summary.toBillCount === 0} onClick={() => openCalc(null)}>
                + New allocation
              </HeadButton>
            </>
          ) : null
        }
      />

      <div className={hs.hub}>
        <HubCards
          heroLabel={`Allocated · ${monthName}`}
          heroValue={rm(summary.allocated)}
          heroExtra={<MonthNav label={monthName} onPrev={() => go(shift(-1))} onNext={() => go(shift(1))} month={month} thisMonth={thisMonth} onPick={go} />}
          notice={work.notice ?? undefined}
          cards={work.cards}
          active={card}
          onSelect={(k) => setCard(k as AllocatorCard)}
        />
        {card === 'records' ? (
          <FinTable
            layoutId="fin.allocations"
            title={listTitle}
            rows={rows}
            rowKey={(t) => t.id}
            columns={columns}
            amountOf={(t) => t.amount}
            search={{ value: query, onChange: setQuery, placeholder: 'Search txn / description…' }}
            countLabel={(n) => `${plural(n, 'expense', 'expenses')} · ${monthShort}`}
            activeKey={drawerId}
            onRowClick={(t) => setDrawerId(t.id)}
            onRowContextMenu={onRowContextMenu}
            emptyText={data.txns.length === 0 ? `No allocations for ${monthName} yet.` : 'No allocations match.'}
            canSetDefault={canSetDefault}
          />
        ) : (
          <FinTable
            layoutId="fin.allocations"
            title={listTitle}
            rows={[] as TxnRow[]}
            rowKey={(t) => t.id}
            columns={columns}
            amountOf={(t) => t.amount}
            onRowClick={() => {}}
            emptyText=""
            search={card === 'staff' ? { value: staffQuery, onChange: setStaffQuery, placeholder: 'Search name / department / company…' } : null}
            countText={
              card === 'company'
                ? plural(shares.length, 'company', 'companies')
                : card === 'staff'
                  ? plural(data.staff.length, 'person', 'people')
                  : `${plural(data.templates.length, 'template', 'templates')} · ${plural(data.categories.length, 'category', 'categories')}`
            }
            tools={tools}
          >
            {card === 'company' ? (
              <ItemList title="Share by company" count={plural(shares.length, 'company', 'companies')} items={companyItems} empty={`Nothing allocated in ${monthName} yet.`} />
            ) : card === 'staff' ? (
              <ItemList
                title="Staff"
                count={sq ? `${staffItems.length} of ${data.staff.length}` : plural(data.staff.length, 'person', 'people')}
                items={staffItems}
                empty={sq ? 'Nobody matches.' : 'The list is empty — add the people Headcount counts.'}
              />
            ) : (
              <>
                <ItemList title="Companies" count={`${enabled} / ${data.companySettings.length} enabled`} items={companyRows} empty="No active companies." />
                <ItemList title="Categories" count={String(data.categories.length)} items={categoryRows} empty="No categories yet." />
                <ItemList title="Templates" count={String(data.templates.length)} items={templateRows} empty="No templates yet." />
              </>
            )}
          </FinTable>
        )}
      </div>

      <AllocationDrawer
        txn={drawerTxn}
        open={!!drawerId}
        onClose={() => {
          setDrawerId(null)
          work.setError(null)
        }}
        invoices={work.invoicesOf(drawerTxn)}
        categories={data.categories}
        can={can}
        busy={busy}
        error={work.shownError}
        onGenerate={work.askGenerate}
        onCorrect={correct}
        onMore={work.openMore}
        onInvoices={work.openInvoices}
      />

      {work.dialogs}

      {rowMenu ? (
        <RowMenu title={`${rowMenu.txn.txnNo} · ${rowMenu.txn.locked ? 'billed' : 'to bill'}`} anchor={rowMenu.anchor} items={rowMenuItems(rowMenu.txn)} onClose={() => setRowMenu(null)} />
      ) : null}

      {calc ? (
        <AllocationCalc
          key={calc.nonce}
          open={calc.open}
          onClose={() => setCalc((c) => (c ? { ...c, open: false } : c))}
          onSaved={(message) => {
            setCard('records')
            work.done(message)
          }}
          data={data}
          edit={calc.edit}
        />
      ) : null}
    </div>
  )
}
