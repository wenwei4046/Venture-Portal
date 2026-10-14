'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState, useTransition, type ReactNode } from 'react'
import { drawerStyles as d } from '@/components/finv/Drawer'
import { fd } from '@/components/finv/DrawerParts'
import { HUB_HREF } from '@/lib/fin-app/routes'
import { methodLabel, recordLine, splitSummary } from '@/lib/allocator-sheet'
import { openAllocationPage } from '@/app/(portal)/billing-allocator/page-actions'
import type { PageAllocation } from '@/app/(portal)/billing-allocator/[id]/_components/AllocationPage'
import { AllocationDetailBody, allocationSteps, recordedOn, type AllocationCan } from '@/app/(portal)/billing-allocator/_components/AllocationDrawer'
import { useAllocationCalc } from '@/app/(portal)/billing-allocator/_components/AllocationCalc'
import { ALLOCATOR_CARD, useAllocatorWork, type AllocatorCard } from '@/app/(portal)/billing-allocator/_components/allocator-work'
import { monthLong, splitsText } from '@/app/(portal)/billing-allocator/_components/StaffDialogs'
import type { AllocatorData, StaffRow, TxnRow } from '@/app/(portal)/billing-allocator/_components/types'
import AppScreen, { PageHead, type BarButton } from './AppScreen'
import { useHubTabs } from './hub-tabs'
import { pushIntent, useStep } from './nav'
import { BankHero, ItemGroup, ListBlock, Notice, Row, SearchRow, StackCards, type ItemLine } from './parts'
import { DialogMenu, FinDialog } from '@/components/finv/Dialog'
import s from './fin-app.module.css'

// Daily › Billing in the Finance phone app (2026-10-15, the Finance revamp v2's
// phone — M12): the hub (its top tabs, *Allocated · {month}* under its month
// pill, the notice of what is still to bill, a stacked card per list,
// *Generate invoices · + New allocation*), Records, By company, Staff and
// Setup, an allocation — the drawer's parts with what the full page adds, since
// on a phone this screen is the allocation's page — and Calculate, a screen of
// its own (the prototype's `vCalc`). Every figure is the desktop hub's
// (`loadAllocatorData`), every step and window the desktop's
// (`useAllocatorWork`, `useAllocationCalc`), its windows rising as sheets.

export type AllocatorStep =
  | { kind: 'hub' }
  | { kind: 'list'; card: AllocatorCard }
  | { kind: 'calc'; edit: string | null }
  | { kind: 'record'; id: string; from: AllocatorCard | null }

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const f2 = (n: number) => (n < 0 ? '-' : '') + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const rm = (n: number) => `RM ${f2(n)}`
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
const CARDS: readonly string[] = ['records', 'company', 'staff', 'setup']
const asCard = (v: string | null): AllocatorCard | null => (v && CARDS.includes(v) ? (v as AllocatorCard) : null)

export function readAllocatorStep(q: URLSearchParams): AllocatorStep {
  const id = q.get('id')
  if (id) return { kind: 'record', id, from: asCard(q.get('from')) }
  const f = q.get('f')
  if (f === 'calc') return { kind: 'calc', edit: q.get('edit') }
  const card = asCard(f)
  if (card) return { kind: 'list', card }
  return { kind: 'hub' }
}

/** Where a step lives (its query, the month's beside it), and the step above it. */
export function searchOfStep(step: AllocatorStep): string {
  if (step.kind === 'record') return `id=${encodeURIComponent(step.id)}${step.from ? `&from=${step.from}` : ''}`
  if (step.kind === 'calc') return `f=calc${step.edit ? `&edit=${encodeURIComponent(step.edit)}` : ''}`
  if (step.kind === 'list') return `f=${step.card}`
  return ''
}
export function parentSearch(step: AllocatorStep): string {
  if (step.kind === 'record') return step.from ? `f=${step.from}` : ''
  if (step.kind === 'calc') return step.edit ? `id=${encodeURIComponent(step.edit)}&from=records` : ''
  return ''
}

const monthQuery = (ym: string, thisMonth: string) => (ym === thisMonth ? '' : `m=${ym}`)
const join = (...parts: string[]) => parts.filter(Boolean).join('&')

export default function AllocatorApp({
  data,
  can,
  search,
  thisMonth,
  record: initialRecord,
  refused: initialRefused,
}: {
  data: AllocatorData
  can: AllocationCan
  /** The address's query as the server read it (a refresh, a link). */
  search: string
  /** The office's month, `YYYY-MM`. */
  thisMonth: string
  /** The allocation the address names, read with the page. */
  record: PageAllocation | null
  refused: string | null
}) {
  const router = useRouter()
  const [step, open, back] = useStep(readAllocatorStep, search)
  const { topTabs, swipe } = useHubTabs('daily', 'billing')

  // ── The month on show ──
  const month = data.period
  const [yy, mm] = month.split('-').map(Number)
  const monthName = monthLong(month)
  const monthShort = `${MON[mm - 1]} ${yy}`
  const mq = monthQuery(month, thisMonth)
  const shift = (n: number) => {
    const t = new Date(Date.UTC(yy, mm - 1 + n, 1))
    return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}`
  }
  const [pending, startMonth] = useTransition()
  const [goingTo, setGoingTo] = useState<string | null>(null)
  const goMonth = (ym: string) => {
    setGoingTo(ym)
    const q = join(monthQuery(ym, thisMonth), step.kind === 'list' ? searchOfStep(step) : '')
    startMonth(() => router.replace(`${HUB_HREF.billing}${q ? `?${q}` : ''}`, { scroll: false }))
  }
  const shownMonth = goingTo && pending ? goingTo : month

  const go = (next: AllocatorStep) => open(join(mq, searchOfStep(next)))
  const backTo = () => back(join(mq, parentSearch(step)))

  // ── The allocation a record screen shows: the hub's, and the page read for it ──
  const [page, setPage] = useState<PageAllocation | null>(initialRecord)
  const [refused, setRefused] = useState<string | null>(initialRefused)
  const load = useCallback((id: string) => {
    setRefused(null)
    void openAllocationPage(id).then(
      (res) => {
        if (res.ok) setPage(res.page)
        else {
          setPage(null)
          setRefused(res.reason)
        }
      },
      () => {
        setPage(null)
        setRefused('This allocation could not be read just now. Try again.')
      },
    )
  }, [])
  const recordId = step.kind === 'record' ? step.id : null
  useEffect(() => {
    if (!recordId || page?.id === recordId) return
    setPage(null)
    load(recordId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordId])
  // A step taken refreshes the month — the open allocation's page is read again with it.
  const shownData = useRef(data)
  useEffect(() => {
    if (shownData.current === data) return
    shownData.current = data
    if (recordId) load(recordId)
  }, [data, recordId, load])

  /** An invoice of a billed allocation: the app's own invoice screen, on its month. */
  const openInvoice = (id: string) => {
    pushIntent()
    router.push(`${HUB_HREF.invoices}?${join(mq, `id=${encodeURIComponent(id)}`)}`)
  }
  const work = useAllocatorWork({ data, onGone: () => (step.kind === 'record' ? backTo() : undefined), onOpenInvoice: openInvoice })
  const { summary, shares, enabled, busy } = work

  const [staffQuery, setStaffQuery] = useState('')
  const [recordQuery, setRecordQuery] = useState('')
  const [staffMenu, setStaffMenu] = useState(false)

  // ── The screens ──
  let screen: ReactNode
  if (step.kind === 'calc') {
    const edit = step.edit ? (data.txns.find((t) => t.id === step.edit && !t.locked) ?? null) : null
    screen = <CalcScreen key={`calc:${edit?.id ?? 'new'}`} data={data} edit={edit} onBack={backTo} onSaved={work.done} />
  } else if (step.kind === 'record') {
    const t = data.txns.find((x) => x.id === step.id) ?? null
    const fromTitle = step.from ? ALLOCATOR_CARD[step.from].label : 'Billing Allocator'
    const invoices = work.invoicesOf(t)
    const pageFor = page && page.id === step.id ? page : null
    const bar: BarButton[] = t
      ? allocationSteps(t, invoices, can).map((st) => ({
          key: st.key,
          label: st.label,
          kind: st.kind === 'secondary' ? undefined : st.kind,
          disabled: busy && st.key !== 'invoices' && st.key !== 'invoice',
          onClick: () => {
            if (st.key === 'invoice') openInvoice(invoices[0].id)
            else if (st.key === 'invoices') work.openInvoices(t)
            else if (st.key === 'generate') work.askGenerate()
            else if (st.key === 'correct') go({ kind: 'calc', edit: t.id })
            else work.openMore(t)
          },
        }))
      : []
    screen = (
      <AppScreen screenKey={`billing?${searchOfStep(step)}`} head={{ kind: 'back', title: t?.txnNo ?? 'Allocation', backLabel: fromTitle, onBack: backTo }} bar={bar}>
        {t ? (
          <>
            <AllocationDetailBody
              t={t}
              invoices={invoices}
              categories={data.categories}
              error={work.shownError}
              extras={pageFor ? { createdBy: pageFor.createdBy, createdAt: pageFor.createdAt, audit: pageFor.audit } : null}
            />
            {!pageFor ? <div className={d.loading}>{refused ?? 'Loading…'}</div> : null}
          </>
        ) : (
          <div className={d.loading}>This allocation is not on {monthName}’s list any more.</div>
        )}
      </AppScreen>
    )
  } else if (step.kind === 'list') {
    const card = step.card
    const title = ALLOCATOR_CARD[card].label
    let body: ReactNode
    let bar: BarButton[] = []
    if (card === 'records') {
      const q = recordQuery.trim().toLowerCase()
      const rows = data.txns.filter((t) => !q || `${t.txnNo} ${t.description} ${splitSummary(t)} ${t.categoryName}`.toLowerCase().includes(q))
      body = (
        <>
          <SearchRow value={recordQuery} onChange={setRecordQuery} placeholder="Search txn / description…" />
          <ListBlock
            title="Allocations"
            count={`${plural(data.txns.length, 'expense', 'expenses')} · ${monthShort}`}
            empty={rows.length === 0 ? (data.txns.length === 0 ? `No allocations for ${monthName} yet.` : 'No allocations match.') : null}
          >
            {rows.map((t: TxnRow) => (
              <Row key={t.id} title={t.description} desc={recordLine(t)} amount={rm(t.amount)} onClick={() => go({ kind: 'record', id: t.id, from: 'records' })} />
            ))}
          </ListBlock>
        </>
      )
      if (can.create) bar = [{ key: 'new', label: '+ New allocation', kind: 'primary', onClick: () => go({ kind: 'calc', edit: null }) }]
    } else if (card === 'company') {
      const items: ItemLine[] = shares.map((r) => ({
        key: r.id ?? 'own',
        label: r.label,
        sub: `billed ${f2(r.billed)} · ${r.invoices.map((i) => i.invoiceNo).join(' · ') || 'none yet'}`,
        value: r.toBill > 0.005 ? `to bill ${f2(r.toBill)}` : f2(r.share),
        tone: r.toBill > 0.005 ? 'alert' : 'ledger',
      }))
      body = <ItemGroup title="Share by company" count={plural(shares.length, 'company', 'companies')} items={items} empty={`Nothing allocated in ${monthName} yet.`} />
    } else if (card === 'staff') {
      const sq = staffQuery.trim().toLowerCase()
      const staffLabel = (p: StaffRow) => splitsText(p.splits.map((x) => ({ label: x.targetId === null ? 'HV own' : x.label.replace(/ \(dept\)$/, ''), pct: x.pct })))
      const items: ItemLine[] = [...data.staff]
        .filter((p) => !sq || `${p.name} ${p.department} ${staffLabel(p)}`.toLowerCase().includes(sq))
        .sort((x, y) => (y.createdAt || '').localeCompare(x.createdAt || '') || x.name.localeCompare(y.name))
        .map((p) => ({
          key: p.id,
          label: p.department ? `${p.name} · ${p.department}` : p.name,
          sub: `${staffLabel(p)} · added ${fd(p.createdAt ? recordedOn({ createdAt: p.createdAt }) : null)}`,
          chip: { text: p.status, tone: p.status === 'active' ? 'ledger' : 'info' },
          action: can.edit ? { label: 'Edit', onClick: () => work.open({ kind: 'staff', person: p }) } : null,
        }))
      body = (
        <>
          <SearchRow value={staffQuery} onChange={setStaffQuery} placeholder="Search name / department / company…" />
          <ItemGroup
            title="Staff"
            count={sq ? `${items.length} of ${data.staff.length}` : plural(data.staff.length, 'person', 'people')}
            items={items}
            empty={sq ? 'Nobody matches.' : 'The list is empty — add the people Headcount counts.'}
          />
        </>
      )
      // The design's + Add staff; the hub's snapshot, import and snapshots in its ⋯ (ours).
      const more = can.edit || data.snapshotPeriods.length > 0
      bar = [
        ...(can.edit ? [{ key: 'add', label: '+ Add staff', kind: 'primary' as const, onClick: () => work.open({ kind: 'staff', person: null }) }] : []),
        ...(more ? [{ key: 'more', label: '⋯', kind: 'more' as const, onClick: () => setStaffMenu(true) }] : []),
      ]
    } else {
      const companyItems: ItemLine[] = data.companySettings.map((c) => ({
        key: c.id,
        label: c.name ?? c.label,
        sub: c.code || c.label,
        chip: { text: c.enabled ? 'enabled' : 'off', tone: c.enabled ? 'ledger' : 'def' },
        action: can.edit ? { label: c.enabled ? 'Turn off' : 'Turn on', off: busy, onClick: () => (busy ? undefined : work.toggleCompany(c)) } : null,
      }))
      const categoryItems: ItemLine[] = data.categories.map((c) => ({
        key: c.id,
        label: c.name,
        sub: c.coaCode ? `${c.coaCode} · ${data.coaAccounts.find((x) => x.code === c.coaCode)?.name ?? ''}`.replace(/ · $/, '') : 'the invoice’s default account',
        action: can.edit ? { label: 'Edit', onClick: () => work.open({ kind: 'category', category: c }) } : null,
      }))
      const templateItems: ItemLine[] = data.templates.map((t) => {
        const cat = data.categories.find((c) => c.id === t.categoryId)
        return {
          key: t.id,
          label: t.name,
          sub: [methodLabel(t.method), cat?.name ?? 'no category', t.status !== 'active' ? 'inactive' : ''].filter(Boolean).join(' · '),
          value: f2(t.amount),
          action: can.edit ? { label: 'Edit', onClick: () => work.open({ kind: 'template', template: t }) } : null,
        }
      })
      body = (
        <>
          <ItemGroup title="Companies" count={`${enabled} / ${data.companySettings.length} enabled`} items={companyItems} empty="No active companies." />
          <ItemGroup title="Categories" count={String(data.categories.length)} items={categoryItems} empty="No categories yet." />
          <ItemGroup title="Templates" count={String(data.templates.length)} items={templateItems} empty="No templates yet." />
        </>
      )
      if (can.edit)
        bar = [
          { key: 'cat', label: '+ Add category', onClick: () => work.open({ kind: 'category', category: null }) },
          { key: 'tpl', label: '+ Add template', onClick: () => work.open({ kind: 'template', template: null }) },
        ]
    }
    const eyebrow = card === 'staff' || card === 'setup' ? 'Billing Allocator · Settings' : `Billing Allocator · ${monthShort}`
    screen = (
      <AppScreen screenKey={`billing?f=${card}`} head={{ kind: 'back', title, backLabel: 'Billing Allocator', onBack: backTo }} bar={bar}>
        <PageHead roman="I." eyebrow={eyebrow} title={title} />
        <div className={pending ? s.pending : undefined}>{body}</div>
      </AppScreen>
    )
  } else {
    const hubBar: BarButton[] = can.create
      ? [
          ...(summary.toBillCount > 0 ? [{ key: 'generate', label: 'Generate invoices', kind: 'primary' as const, onClick: work.askGenerate }] : []),
          { key: 'new', label: '+ New allocation', kind: summary.toBillCount > 0 ? undefined : ('primary' as const), onClick: () => go({ kind: 'calc', edit: null }) },
        ]
      : []
    screen = (
      <AppScreen screenKey={HUB_HREF.billing} head={{ kind: 'bare' }} topTabs={topTabs} bar={hubBar} root onSwipe={swipe}>
        <BankHero
          value={rm(summary.allocated)}
          label={`Allocated · ${monthName}`}
          month={{ label: monthLong(shownMonth), prev: () => goMonth(shift(-1)), next: () => goMonth(shift(1)) }}
        />
        <div className={pending ? s.pending : undefined}>
          {work.notice ? <Notice>{work.notice}</Notice> : null}
          <StackCards cards={work.cards} onOpen={(k) => go({ kind: 'list', card: k as AllocatorCard })} />
        </div>
      </AppScreen>
    )
  }

  return (
    <>
      {screen}
      {work.dialogs}
      <FinDialog open={staffMenu} onClose={() => setStaffMenu(false)} title="Staff">
        <DialogMenu
          items={[
            ...(can.edit
              ? [
                  { key: 'snap', label: work.snapshotLabel, sub: `The list as it stands, kept for ${monthName}`, disabled: busy, onClick: () => { setStaffMenu(false); work.saveSnapshot() } },
                  ...(data.hrPeriods.length > 0 ? [{ key: 'import', label: 'Import from HR', onClick: () => { setStaffMenu(false); work.open({ kind: 'import' }) } }] : []),
                ]
              : []),
            ...(data.snapshotPeriods.length > 0
              ? [{ key: 'snapshots', label: `Snapshots · ${data.snapshotPeriods.length}`, sub: 'Each month’s list as it was saved', onClick: () => { setStaffMenu(false); work.openSnapshots() } }]
              : []),
          ]}
        />
      </FinDialog>
    </>
  )
}

/** Calculate, a screen of its own (the prototype's `vCalc`): its fields and preview, *+ Add expense · Save allocation* at its foot. */
function CalcScreen({ data, edit, onBack, onSaved }: { data: AllocatorData; edit: TxnRow | null; onBack: () => void; onSaved: (message: string) => void }) {
  const calc = useAllocationCalc({ onClose: onBack, onSaved, data, edit })
  const bar: BarButton[] = calc.steps.map((st) => ({
    key: st.key,
    label: st.label,
    kind: st.primary ? 'primary' : undefined,
    off: st.off,
    disabled: calc.busy,
    onClick: st.onClick,
  }))
  return (
    <AppScreen screenKey={edit ? `billing?f=calc&edit=${edit.id}` : 'billing?f=calc'} head={{ kind: 'back', title: calc.title, backLabel: edit ? edit.txnNo : 'Billing Allocator', onBack }} bar={bar}>
      <PageHead roman="I." eyebrow="Billing Allocator · Calculate" title={calc.title} />
      {calc.body}
    </AppScreen>
  )
}
