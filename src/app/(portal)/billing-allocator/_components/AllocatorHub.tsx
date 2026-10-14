'use client'

import { useEffect, useMemo, useState, type MouseEvent } from 'react'
import { useRouter } from 'next/navigation'
import { flash } from '@/components/hrv/toast'
import RowMenu, { type RowMenuAnchor, type RowMenuItem } from '@/components/RowMenu'
import { HeadButton, HubCards, HubHead, ItemList, MonthNav, hubStyles as hs, type CardTone, type HubCardItem, type ItemRow } from '@/components/finv/Hub'
import { FinTable, type FinColumn } from '@/components/finv/FinTable'
import { DialogConfirm, DialogMenu, FinDialog } from '@/components/finv/Dialog'
import { fd } from '@/components/finv/DrawerParts'
import type { HrIconName } from '@/components/hrv/icons'
import { allocatorSummary, batchLabel, byCompanyRows, methodLabel, recordLine, splitSummary } from '@/lib/allocator-sheet'
import { deleteAllocTxn, generateAllocatorInvoices, getAllocSnapshot, saveAllocSnapshot, setAllocCompanyEnabled, type SnapshotDetailRow } from '../actions'
import { AllocationDrawer, categoryLabel, recordedOn, type AllocationCan } from './AllocationDrawer'
import AllocationCalc from './AllocationCalc'
import { ImportDialog, SnapshotDialog, StaffDialog, monthLong, splitsText } from './StaffDialogs'
import { CategoryDialog, TemplateDialog } from './SetupDialogs'
import type { AllocatorData, CategoryRow, StaffRow, TemplateRow, TxnRow } from './types'

// The Billing Allocator's hub (2026-10-14, the Finance revamp v2 — D11 of
// `.design/fin-r2/handoff`, the prototype's `bankBilling`): the head (Generate
// invoices, + New allocation), *Allocated · {Month YYYY}* with the month pill
// under it (ours — the records are a month's; the design's phone hub has it),
// the notice of what is still to bill, then a card a list — Records, By
// company, Staff, Setup — beside the list it opens: Records the table (the
// record in the drawer), By company its shares, Staff the people the headcount
// counts, Setup the companies, categories and templates. Every write is the
// allocator's own Server Action, each behind its gate; *+ New allocation* and
// *Correct* open the system's Calculate in the drawer (AllocationCalc).

export type AllocatorCard = 'records' | 'company' | 'staff' | 'setup'

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const f2 = (n: number) => (n < 0 ? '-' : '') + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const rm = (n: number) => `RM ${f2(n)}`
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

const CARD: Record<AllocatorCard, { label: string; tone: CardTone; icon: HrIconName }> = {
  records: { label: 'Records', tone: 'all', icon: 'doc' },
  company: { label: 'By company', tone: 'company', icon: 'org' },
  staff: { label: 'Staff', tone: 'staff', icon: 'staff' },
  setup: { label: 'Setup', tone: 'quiet', icon: 'tree' },
}
const CARD_KEYS = Object.keys(CARD) as AllocatorCard[]

type Dialog =
  | { kind: 'calc'; edit: TxnRow | null }
  | { kind: 'staff'; person: StaffRow | null }
  | { kind: 'snapshot'; period: string; rows: SnapshotDetailRow[]; savedAt: string | null }
  | { kind: 'import' }
  | { kind: 'category'; category: CategoryRow | null }
  | { kind: 'template'; template: TemplateRow | null }
type Ask = { kind: 'generate' } | { kind: 'delete'; txn: TxnRow }

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
  // A dialog (or the Calculate drawer) stays mounted while it plays out (open: false); the next one, a new nonce, starts afresh.
  const [dialog, setDialog] = useState<(Dialog & { nonce: number; open: boolean }) | null>(() => (arriving && can.edit ? { kind: 'calc', edit: arriving, nonce: 1, open: true } : null))
  const [ask, setAsk] = useState<Ask | null>(null)
  const [menu, setMenu] = useState<'more' | 'invoices' | 'snapshots' | null>(null)
  const [menuFor, setMenuFor] = useState<TxnRow | null>(null)
  const [rowMenu, setRowMenu] = useState<{ txn: TxnRow; anchor: RowMenuAnchor } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // The card in the address, so a refresh or a link lands on it; ?edit= dropped once read, so Back does not open the correction again.
  useEffect(() => {
    const url = new URL(window.location.href)
    if (card === 'records') url.searchParams.delete('card')
    else url.searchParams.set('card', card)
    url.searchParams.delete('edit')
    if (url.toString() !== window.location.href) window.history.replaceState(window.history.state, '', url.toString())
  }, [card])

  const summary = allocatorSummary(data.txns, data.invoices)
  const shares = useMemo(() => byCompanyRows(data.txns, data.invoices).filter((r) => !r.own), [data.txns, data.invoices])
  const withBalance = shares.filter((r) => r.toBill > 0.005).length
  const active = data.staff.filter((s) => s.status === 'active').length
  const enabled = data.companySettings.filter((c) => c.enabled).length

  const cards: HubCardItem[] = CARD_KEYS.map((k) => {
    const look = CARD[k]
    const [sub, value] =
      k === 'records'
        ? [`${plural(summary.txnCount, 'expense', 'expenses')} · ${summary.toBillCount} to bill`, `${rm(summary.toBill)} to bill`]
        : k === 'company'
          ? [`${plural(shares.length, 'company', 'companies')} · ${withBalance} with a balance`, `${rm(summary.billed)} billed`]
          : k === 'staff'
            ? [plural(data.staff.length, 'person', 'people'), `${active} active`]
            : [`${plural(data.templates.length, 'template', 'templates')} · ${plural(data.categories.length, 'category', 'categories')}`, `${enabled} / ${data.companySettings.length} companies`]
    return { key: k, tone: look.tone, icon: look.icon, label: look.label, sub, value }
  })

  // ── Doing things ──
  const done = (message: string) => {
    flash(message)
    router.refresh()
  }
  // A refusal is said where the step was asked — in its confirm, or (a list's own button) as the toast.
  async function run(call: () => Promise<{ error?: string }>, message: string, inToast = false): Promise<boolean> {
    setBusy(true)
    setError(null)
    const refuse = (reason: string) => (inToast ? flash(reason) : setError(reason))
    try {
      const res = await call()
      if (res.error) {
        refuse(res.error)
        return false
      }
      done(message)
      return true
    } catch (err) {
      refuse(err instanceof Error ? err.message : 'That did not go through. Try again.')
      return false
    } finally {
      setBusy(false)
    }
  }
  const open = (d: Dialog) => setDialog({ ...d, nonce: Date.now(), open: true })
  const closeDialog = () => setDialog((d) => (d ? { ...d, open: false } : d))
  const correct = (t: TxnRow) => {
    setDrawerId(null)
    setRowMenu(null)
    setMenu(null)
    open({ kind: 'calc', edit: t })
  }
  const closeAsk = () => {
    if (busy) return
    setAsk(null)
    setError(null)
  }
  const confirmAsk = async () => {
    if (!ask || busy) return
    if (ask.kind === 'generate') {
      setBusy(true)
      setError(null)
      try {
        const res = await generateAllocatorInvoices(month)
        if (res.error) {
          setError(res.error)
          return
        }
        const first = res.created[0]?.invoiceNo ?? null
        flash(
          res.created.length === 0
            ? 'Nothing to bill'
            : `${res.created.length === 1 ? 'Invoice' : 'Invoices'} generated · ${first ?? 'a draft'}${res.created.length > 1 ? ` + ${res.created.length - 1} more` : ''}`,
        )
        setAsk(null)
        router.refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'That did not go through. Try again.')
      } finally {
        setBusy(false)
      }
      return
    }
    const txn = ask.txn
    const ok = await run(() => deleteAllocTxn(txn.id), 'Allocation deleted')
    if (ok) {
      setAsk(null)
      setDrawerId(null)
    }
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
        { key: 'delete', label: 'Delete allocation', danger: true, hint: t.locked ? lockedWhy(t) : undefined, disabled: t.locked, onSelect: () => setAsk({ kind: 'delete', txn: t }) },
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
  const labelOfTarget = (id: string | null) =>
    id === null
      ? 'HV own'
      : (data.companySettings.find((c) => c.id === id)?.label ?? data.departments.find((dp) => dp.id === id)?.label.replace(/ \(dept\)$/, '') ?? '?')

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
          onClick: () =>
            void run(() => setAllocCompanyEnabled(c.id, !c.enabled), c.enabled ? `${c.name ?? c.label} taken out of the allocation` : `${c.name ?? c.label} back in the allocation`, true),
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

  // ── The confirms ──
  const askTitle = ask?.kind === 'generate' ? 'Generate invoices?' : ask ? `Delete ${ask.txn.txnNo}?` : ''
  const askText =
    ask?.kind === 'generate'
      ? `Bills ${rm(summary.toBill)} across ${plural(summary.toBillTargets, 'company', 'companies')} as one draft invoice each. ${plural(summary.toBillCount, 'allocation becomes', 'allocations become')} billed.`
      : 'Removes the allocation before any invoice is made.'

  const drawerTxn = drawerId ? (data.txns.find((t) => t.id === drawerId) ?? null) : null
  const invoicesOf = (t: TxnRow | null) => (t?.locked && t.billedRef ? data.invoices.filter((i) => i.ref === t.billedRef) : [])

  // ── The toolbar's own buttons ──
  const tools =
    card === 'staff' && can.edit ? (
      <>
        <button type="button" className={hs.toolBtn} onClick={() => open({ kind: 'staff', person: null })}>
          + Add staff
        </button>
        <button
          type="button"
          className={hs.toolBtn}
          disabled={busy}
          onClick={() => void run(() => saveAllocSnapshot(month), `${monthName} snapshot saved · ${plural(data.staff.length, 'person', 'people')}`, true)}
        >
          Save {MON[mm - 1]} snapshot
        </button>
        {data.hrPeriods.length > 0 ? (
          <button type="button" className={hs.toolBtn} onClick={() => open({ kind: 'import' })}>
            Import from HR
          </button>
        ) : null}
        {data.snapshotPeriods.length > 0 ? (
          <button type="button" className={hs.toolBtn} onClick={() => setMenu('snapshots')}>
            Snapshots <span className={hs.toolN}>· {data.snapshotPeriods.length}</span>
          </button>
        ) : null}
      </>
    ) : card === 'staff' && data.snapshotPeriods.length > 0 ? (
      <button type="button" className={hs.toolBtn} onClick={() => setMenu('snapshots')}>
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

  const openSnapshot = async (period: string) => {
    setMenu(null)
    setBusy(true)
    try {
      const res = await getAllocSnapshot(period)
      if (res.error) {
        flash(res.error)
        return
      }
      open({ kind: 'snapshot', period, rows: res.rows, savedAt: res.savedAt })
    } catch {
      flash('The snapshot did not load. Try again.')
    } finally {
      setBusy(false)
    }
  }

  const listTitle = CARD[card].label
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
                <HeadButton
                  primary
                  onClick={() => {
                    setError(null)
                    setAsk({ kind: 'generate' })
                  }}
                >
                  Generate invoices
                </HeadButton>
              ) : null}
              <HeadButton primary={summary.toBillCount === 0} onClick={() => open({ kind: 'calc', edit: null })}>
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
          notice={
            summary.toBill > 0.005
              ? `To bill ${rm(summary.toBill)} across ${plural(summary.toBillTargets, 'company', 'companies')} — Generate invoices bills every company’s share in one go.`
              : undefined
          }
          cards={cards}
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
          setError(null)
        }}
        invoices={invoicesOf(drawerTxn)}
        categories={data.categories}
        can={can}
        busy={busy}
        error={ask ? null : error}
        onGenerate={() => {
          setError(null)
          setAsk({ kind: 'generate' })
        }}
        onCorrect={correct}
        onMore={(t) => {
          setMenuFor(t)
          setMenu('more')
        }}
        onInvoices={(t) => {
          setMenuFor(t)
          setMenu('invoices')
        }}
      />

      <FinDialog open={menu === 'more'} onClose={() => setMenu(null)} title={menuFor?.txnNo ?? ''}>
        <DialogMenu
          items={
            menuFor
              ? [
                  {
                    key: 'delete',
                    label: 'Delete allocation',
                    danger: true,
                    onClick: () => {
                      setMenu(null)
                      setError(null)
                      setAsk({ kind: 'delete', txn: menuFor })
                    },
                  },
                ]
              : []
          }
        />
      </FinDialog>
      <FinDialog open={menu === 'invoices'} onClose={() => setMenu(null)} title={menuFor ? `${menuFor.txnNo} · its invoices` : ''} sub={menuFor ? batchLabel(menuFor) : undefined}>
        <DialogMenu
          items={invoicesOf(menuFor).map((i) => ({
            key: i.id,
            label: i.invoiceNo,
            sub: `${i.companyLabel.replace(/ \(dept\)$/, '')} · ${i.status === 'paid_via_netting' ? 'paid via netting' : i.status}`,
            onClick: () => {
              setMenu(null)
              router.push(`/invoices/${i.id}`)
            },
          }))}
        />
      </FinDialog>
      <FinDialog open={menu === 'snapshots'} onClose={() => setMenu(null)} title="Snapshots" sub="Each month’s list as it was saved">
        <DialogMenu
          items={data.snapshotPeriods.map((p) => ({
            key: p,
            label: `${monthLong(p)} snapshot`,
            onClick: () => void openSnapshot(p),
          }))}
        />
      </FinDialog>
      <FinDialog open={!!ask} onClose={closeAsk} title={askTitle} locked={busy}>
        <DialogConfirm
          text={askText}
          confirmLabel={busy ? 'Working…' : ask?.kind === 'generate' ? 'Generate invoices' : 'Delete'}
          danger={ask?.kind === 'delete'}
          busy={busy}
          error={ask ? error : null}
          onCancel={closeAsk}
          onConfirm={() => void confirmAsk()}
        />
      </FinDialog>

      {rowMenu ? (
        <RowMenu title={`${rowMenu.txn.txnNo} · ${rowMenu.txn.locked ? 'billed' : 'to bill'}`} anchor={rowMenu.anchor} items={rowMenuItems(rowMenu.txn)} onClose={() => setRowMenu(null)} />
      ) : null}

      {dialog?.kind === 'calc' ? (
        <AllocationCalc
          key={dialog.nonce}
          open={dialog.open}
          onClose={closeDialog}
          onSaved={(message) => {
            setCard('records')
            done(message)
          }}
          data={data}
          edit={dialog.edit}
        />
      ) : dialog?.kind === 'staff' ? (
        <StaffDialog key={dialog.nonce} open={dialog.open} onClose={closeDialog} onDone={done} data={data} person={dialog.person} />
      ) : dialog?.kind === 'snapshot' ? (
        <SnapshotDialog key={dialog.nonce} open={dialog.open} onClose={closeDialog} period={dialog.period} rows={dialog.rows} savedAt={dialog.savedAt} labelOf={labelOfTarget} />
      ) : dialog?.kind === 'import' ? (
        <ImportDialog key={dialog.nonce} open={dialog.open} onClose={closeDialog} onDone={done} hrPeriods={data.hrPeriods} />
      ) : dialog?.kind === 'category' ? (
        <CategoryDialog key={dialog.nonce} open={dialog.open} onClose={closeDialog} onDone={done} data={data} category={dialog.category} />
      ) : dialog?.kind === 'template' ? (
        <TemplateDialog key={dialog.nonce} open={dialog.open} onClose={closeDialog} onDone={done} data={data} template={dialog.template} />
      ) : null}
    </div>
  )
}
