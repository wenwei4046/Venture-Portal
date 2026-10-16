'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { flash } from '@/components/hrv/toast'
import { DialogMenu, FinDialog, type DialogMenuItem } from '@/components/finv/Dialog'
import { drawerStyles as d } from '@/components/finv/Drawer'
import { APPROVALS_TAB_HREF, HUB_HREF } from '@/lib/fin-app/routes'
import { plural, rm, type ApprovalCardKey, type ApprovalHubModel, type ApprovalMember, type ApprovalRecordModel, type ApprovalRow, type AppRecordRef } from '@/lib/fin-app/approval-model'
import { openApprovalRequest } from '@/app/(portal)/approvals/page-actions'
import { useApprovalDecisions, type DecisionAsk } from '@/app/(portal)/approvals/_components/decisions'
import { ApprovalHero, RequestBody, heroStatus } from '@/app/(portal)/approvals/_components/RequestParts'
import { getAttachmentSignedUrl } from '@/app/(portal)/payments/actions'
import AppScreen, { PageHead, type BarButton, type BulkBar } from './AppScreen'
import { canStepBack, pushIntent, setIntent, useStep } from './nav'
import { BankHero, ListBlock, RecordItems, Row, SearchRow, StackCards, type ItemLine } from './parts'
import s from './fin-app.module.css'

// Daily › Approvals in the Finance phone app (2026-10-15, part 5 — a page the
// design does not draw, in the app's style): the queue as a hub (what waits
// in total, the oldest wait in a word, a card per list), a card's list (search,
// then *Select* — tick what is yours to decide, the dark bar approves it, the
// head's ⋯ rejects it), a combined approval (its vouchers decided one by one
// where nothing else rides along), and a request — what the desktop's request
// page shows, in the drawer's hand. Every decision is the desktop queue's own
// Server Action, its gate naming /approvals; every figure the desktop's
// (`approval-model`).

export type ApprovalStep =
  | { kind: 'hub' }
  | { kind: 'list'; card: ApprovalCardKey }
  | { kind: 'group'; group: string; from: ApprovalCardKey | null }
  | { kind: 'record'; id: string; from: ApprovalCardKey | null; group: string | null }

const CARDS: readonly ApprovalCardKey[] = ['pending', 'exec', 'decided']
const asCard = (v: string | null): ApprovalCardKey | null => (v && (CARDS as readonly string[]).includes(v) ? (v as ApprovalCardKey) : null)

export function readApprovalStep(q: URLSearchParams): ApprovalStep {
  const id = q.get('id')
  const g = q.get('g')
  if (id) return { kind: 'record', id, from: asCard(q.get('from')), group: g }
  if (g) return { kind: 'group', group: g, from: asCard(q.get('from')) }
  const card = asCard(q.get('f'))
  return card ? { kind: 'list', card } : { kind: 'hub' }
}

const join = (...parts: string[]) => parts.filter(Boolean).join('&')

export function searchOfStep(step: ApprovalStep): string {
  if (step.kind === 'record') return join(`id=${encodeURIComponent(step.id)}`, step.group ? `g=${encodeURIComponent(step.group)}` : '', step.from ? `from=${step.from}` : '')
  if (step.kind === 'group') return join(`g=${encodeURIComponent(step.group)}`, step.from ? `from=${step.from}` : '')
  if (step.kind === 'list') return `f=${step.card}`
  return ''
}

export function parentSearch(step: ApprovalStep): string {
  if (step.kind === 'record' && step.group) return searchOfStep({ kind: 'group', group: step.group, from: step.from })
  if (step.kind === 'record' || step.kind === 'group') return step.from ? `f=${step.from}` : ''
  return ''
}

const LIST_TITLE: Record<ApprovalCardKey, string> = { pending: 'Pending', exec: 'Submitted by the executive', decided: 'Decided · 30 days' }
const BACK_LABEL: Record<ApprovalCardKey, string> = { pending: 'Pending', exec: 'Executive', decided: 'Decided' }
const HERE = '/fin-app/page/approvals'

/** A record of its own in the app. */
const hrefOf = (r: AppRecordRef) => `${HUB_HREF[r.hub]}?id=${encodeURIComponent(r.id)}`

export default function ApprovalsApp({
  tab = false,
  hub,
  search,
  record: initialRecord,
  refused: initialRefused,
}: {
  /** The Principal's own Approvals tab (2026-10-17, `/fin-app/approvals`): the hub is the tab's root, the tab bar under it. */
  tab?: boolean
  hub: ApprovalHubModel
  /** The address's query as the server read it (a refresh, a link). */
  search: string
  /** The request the address names, read with the page. */
  record: ApprovalRecordModel | null
  refused: string | null
}) {
  const router = useRouter()
  const [step, open, back] = useStep(readApprovalStep, search)
  const go = (next: ApprovalStep) => open(searchOfStep(next))
  const backTo = () => back(parentSearch(step))
  /** Back from the hub: the screen it was opened from, else the Overview. */
  const leave = () => {
    if (canStepBack()) {
      window.history.back()
      return
    }
    setIntent('pop')
    router.replace('/fin-app')
  }

  // ── What was decided here waits for the server's next read before it leaves the lists ──
  const [gone, setGone] = useState<Set<string>>(new Set())
  useEffect(() => setGone(new Set()), [hub])
  const pending = useMemo(() => hub.pending.filter((r) => !gone.has(r.key)), [hub.pending, gone])

  // ── The request a record screen shows ──
  const [record, setRecord] = useState<ApprovalRecordModel | null>(initialRecord)
  const [refused, setRefused] = useState<string | null>(initialRefused)
  const load = useCallback((id: string) => {
    setRefused(null)
    void openApprovalRequest(id).then(
      (res) => {
        if (res.ok) setRecord(res.record)
        else {
          setRecord(null)
          setRefused(res.reason)
        }
      },
      () => {
        setRecord(null)
        setRefused('This request could not be read just now. Try again.')
      },
    )
  }, [])
  const recordId = step.kind === 'record' ? step.id : null
  useEffect(() => {
    if (!recordId || record?.id === recordId) return
    setRecord(null)
    load(recordId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordId])

  // ── A list's search and Select ──
  const listCard = step.kind === 'list' ? step.card : null
  const [query, setQuery] = useState<Record<string, string>>({})
  const [selecting, setSelecting] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  useEffect(() => {
    setSelecting(false)
    setSelected(new Set())
  }, [listCard])

  // ── A combined approval's vouchers, each approved unless unticked (the desktop's batch window) ──
  const groupKey = step.kind === 'group' ? step.group : null
  const [approveSet, setApproveSet] = useState<Set<string> | null>(null)
  useEffect(() => setApproveSet(null), [groupKey])

  // ── Windows ──
  const [menu, setMenu] = useState<'bulk' | 'record' | 'group' | null>(null)
  // The decisions themselves are the queue's own (approvals/_components/decisions.tsx — the computer's hub decides the same way).
  const decisions = useApprovalDecisions({
    onDecided: ({ ask, keys }) => {
      setGone((prev) => new Set([...prev, ...keys]))
      if (ask.kind === 'split') {
        if (step.kind === 'group') backTo()
      } else if (ask.scope === 'bulk') {
        setSelected(new Set())
        setSelecting(false)
      } else backTo()
    },
    onPartly: (keys) => {
      setGone((prev) => new Set([...prev, ...keys]))
      setSelected((prev) => new Set([...prev].filter((k) => !keys.includes(k))))
    },
  })
  const openAsk = (a: DecisionAsk) => {
    setMenu(null)
    decisions.ask(a)
  }

  const openRecord = (ref: AppRecordRef) => {
    setMenu(null)
    pushIntent()
    router.push(hrefOf(ref))
  }
  const openHref = (href: string) => {
    setMenu(null)
    pushIntent()
    router.push(href)
  }
  const openFile = (fileId: string) => {
    void getAttachmentSignedUrl(fileId).then(
      ({ url }) => window.open(url, '_blank', 'noopener,noreferrer'),
      () => flash('That file could not be opened just now.'),
    )
  }

  // ── The screens ──
  let screen: ReactNode
  if (step.kind === 'record') {
    const r = record?.id === step.id ? record : null
    const fromTitle = step.group ? 'Combined' : step.from ? BACK_LABEL[step.from] : 'Approvals'
    const pendingOne = !!r && r.status === 'pending'
    const links: DialogMenuItem[] = r
      ? [
          ...(r.voucher ? [{ key: 'voucher', label: 'Open the voucher', onClick: () => openRecord({ hub: 'payments', id: r.voucher!.id }) }] : []),
          ...(r.voucher?.upstream ? [{ key: 'upstream', label: `Open the ${r.voucher.upstream.label.toLowerCase()}`, onClick: () => openHref(r.voucher!.upstream!.href) }] : []),
          ...(r.loan ? [{ key: 'loan', label: 'Open the loan', onClick: () => openRecord(r.loan!.open) }] : []),
          ...(r.open ? [{ key: 'open', label: r.open.hub === 'fund-in' ? 'Open the fund source' : r.open.hub === 'fund-out' ? 'Open the loan' : 'Open the voucher', onClick: () => openRecord(r.open!) }] : []),
          ...(r.groupId && !step.group ? [{ key: 'group', label: 'Open the combined request', onClick: () => go({ kind: 'group', group: r.groupId as string, from: step.from }) }] : []),
        ]
      : []
    let bar: BarButton[] = []
    if (r && pendingOne && r.may && !r.groupId) {
      bar = [
        {
          key: 'approve',
          label: 'Approve',
          kind: 'primary',
          off: !!r.voucher?.short,
          onClick: () => (r.voucher?.short ? flash('Approve disabled: bank balance is below the voucher amount') : openAsk({ kind: 'approve', scope: 'one', record: r })),
        },
        { key: 'reject', label: 'Reject', onClick: () => openAsk({ kind: 'reject', scope: 'one', record: r }) },
        ...(links.length > 0 ? [{ key: 'more', label: '⋯', kind: 'more' as const, onClick: () => setMenu('record') }] : []),
      ]
    } else if (r && links.length > 0) {
      const [first, ...rest] = links
      bar = [
        { key: first.key, label: first.label, onClick: first.onClick },
        ...(rest.length > 0 ? [{ key: 'more', label: '⋯', kind: 'more' as const, onClick: () => setMenu('record') }] : []),
      ]
    }
    const menuLinks = bar.some((b) => b.key === 'approve') ? links : links.slice(1)
    screen = (
      <AppScreen screenKey={`approvals?${searchOfStep(step)}`} head={{ kind: 'back', title: r?.no ?? r?.typeLabel ?? 'Request', backLabel: fromTitle, onBack: backTo }} bar={bar}>
        {r ? <RequestBody r={r} openFile={openFile} /> : <div className={d.loading}>{refused ?? 'Loading…'}</div>}
        <FinDialog open={menu === 'record'} onClose={() => setMenu(null)} title={r?.no ?? r?.typeLabel ?? 'Request'}>
          <DialogMenu items={menuLinks} />
        </FinDialog>
      </AppScreen>
    )
  } else if (step.kind === 'group') {
    const row = [...hub.pending, ...hub.decided].find((x) => x.groupId === step.group) ?? null
    const live = !!row && row.decision === null && hub.pending.some((x) => x.key === row.key) && !gone.has(row.key)
    const mine = live && !row.why
    const vouchers = row ? row.members.filter((m) => m.isVoucher) : []
    const others = row ? row.members.filter((m) => !m.isVoucher) : []
    const approving = approveSet ?? new Set(vouchers.map((m) => m.id))
    const split = mine && row.splittable
    const toggle = (m: ApprovalMember) =>
      setApproveSet(() => {
        const next = new Set(approving)
        if (next.has(m.id)) next.delete(m.id)
        else next.add(m.id)
        return next
      })
    const memberLine = (m: ApprovalMember): ItemLine => {
      const on = approving.has(m.id)
      return {
        key: m.id,
        label: m.label,
        sub: m.sub || undefined,
        value: m.amount === null ? '—' : rm(m.amount),
        tone: split && !on ? 'muted' : null,
        chip: split
          ? on
            ? { text: 'Approve', tone: 'ledger' }
            : { text: 'Reject', tone: 'danger' }
          : m.decision
            ? m.decision === 'approved'
              ? { text: 'Approved', tone: 'ledger' }
              : { text: 'Rejected', tone: 'danger' }
            : null,
        onOpen: split ? () => toggle(m) : !live ? () => go({ kind: 'record', id: m.id, group: step.group, from: step.from }) : undefined,
        action: m.open ? { label: 'Open', onClick: () => openRecord(m.open!) } : null,
      }
    }
    const nApprove = vouchers.filter((m) => approving.has(m.id)).length
    const nReject = vouchers.length - nApprove
    const splitLabel = nReject === 0 ? `Approve all ${nApprove}` : nApprove === 0 ? `Reject all ${nReject}` : `Approve ${nApprove}, reject ${nReject}`
    const bar: BarButton[] = !row || !mine
      ? []
      : split
        ? [
            {
              key: 'decide',
              label: splitLabel,
              kind: nApprove === 0 ? 'danger' : 'primary',
              onClick: () =>
                openAsk({
                  kind: 'split',
                  row,
                  approve: vouchers.filter((m) => approving.has(m.id)).map((m) => m.id),
                  reject: vouchers.filter((m) => !approving.has(m.id)).map((m) => m.id),
                }),
            },
            ...(vouchers.length > 1 ? [{ key: 'more', label: '⋯', kind: 'more' as const, onClick: () => setMenu('group') }] : []),
          ]
        : [
            { key: 'approve', label: 'Approve', kind: 'primary', onClick: () => openAsk({ kind: 'approve', scope: 'group', row }) },
            { key: 'reject', label: 'Reject', onClick: () => openAsk({ kind: 'reject', scope: 'group', row }) },
          ]
    const status = !row ? null : row.decision ? heroStatus(row.decision, true) : !live ? heroStatus('partly', true) : heroStatus('pending', mine)
    screen = (
      <AppScreen screenKey={`approvals?${searchOfStep(step)}`} head={{ kind: 'back', title: 'Combined', backLabel: step.from ? BACK_LABEL[step.from] : 'Approvals', onBack: backTo }} bar={bar}>
        {row && status ? (
          <>
            <ApprovalHero
              kicker={`Combined · ${row.members.length}`}
              status={status}
              no={row.no}
              amount={row.hasAmount ? rm(row.amount) : '—'}
              to={row.title}
              note={live ? (row.why ?? 'Waiting for your decision.') : `Sent by ${row.sentBy}${row.on ? ` · decided ${row.on}` : ''}`}
            />
            <RecordItems roman="I." title="Vouchers" count={String(vouchers.length)} items={vouchers.map(memberLine)} empty="No vouchers in this request." />
            {others.length > 0 ? <RecordItems roman="II." title="Approved together" items={others.map(memberLine)} /> : null}
          </>
        ) : (
          <div className={d.loading}>This request is not on the list any more.</div>
        )}
        <FinDialog open={menu === 'group'} onClose={() => setMenu(null)} title="Combined">
          <DialogMenu
            items={[
              { key: 'all', label: 'Tick all to approve', onClick: () => { setMenu(null); setApproveSet(new Set(vouchers.map((m) => m.id))) } },
              { key: 'none', label: 'Tick all to reject', danger: true, onClick: () => { setMenu(null); setApproveSet(new Set()) } },
            ]}
          />
        </FinDialog>
      </AppScreen>
    )
  } else if (step.kind === 'list') {
    const card = step.card
    const base = card === 'decided' ? hub.decided : card === 'exec' ? pending.filter((r) => r.executive) : pending
    const q = (query[card] ?? '').trim().toLowerCase()
    const rows = base.filter((r) => !q || `${r.no ?? ''} ${r.title} ${r.desc}`.toLowerCase().includes(q))
    const total = rows.reduce((t, r) => t + r.amount, 0)
    const mayTick = card !== 'decided' && base.some((r) => !r.why)
    const ticked = rows.filter((r) => selected.has(r.key))
    const tickedTotal = ticked.reduce((t, r) => t + r.amount, 0)
    const toggle = (r: ApprovalRow) => {
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
    const openRow = (r: ApprovalRow) => (r.kind === 'group' && r.groupId ? go({ kind: 'group', group: r.groupId, from: card }) : r.id ? go({ kind: 'record', id: r.id, from: card, group: null }) : undefined)
    const bulk: BulkBar | null =
      selecting && ticked.length > 0
        ? {
            text: `${ticked.length} selected · ${rm(tickedTotal)}`,
            sub: ticked.some((r) => r.kind === 'group') ? `${ticked.filter((r) => r.kind === 'group').length} combined — decided whole` : '',
            label: `Approve ${ticked.length} →`,
            onClear: () => setSelected(new Set()),
            onGo: () => openAsk({ kind: 'approve', scope: 'bulk', rows: ticked }),
          }
        : null
    const decidable = rows.filter((r) => !r.why)
    const count = card === 'decided' ? `${plural(rows.reduce((n, r) => n + r.items, 0), 'decision', 'decisions')}` : `${rows.length} · ${rm(total)}`
    screen = (
      <AppScreen
        screenKey={`approvals?f=${card}`}
        head={{ kind: 'back', title: card === 'exec' ? 'Executive' : LIST_TITLE[card].split(' · ')[0], backLabel: 'Approvals', onBack: backTo }}
        // The dark bar approves what is ticked (the design's one step); rejecting it and ticking every row are the head's ⋯.
        actions={selecting ? [{ key: 'bulk', label: '⋯', onClick: () => setMenu('bulk') }] : []}
        bar={!selecting && mayTick ? [{ key: 'select', label: 'Select to decide', kind: 'primary', onClick: () => setSelecting(true) }] : []}
        bulk={bulk}
      >
        <PageHead roman="I." eyebrow={`Approvals · ${LIST_TITLE[card].split(' · ')[0]}`} title={LIST_TITLE[card]} />
        <SearchRow
          value={query[card] ?? ''}
          onChange={(v) => setQuery((prev) => ({ ...prev, [card]: v }))}
          placeholder="Search description, type, who…"
          select={
            mayTick
              ? {
                  on: selecting,
                  toggle: () => {
                    setSelecting((v) => !v)
                    setSelected(new Set())
                  },
                }
              : null
          }
        />
        <ListBlock
          title={card === 'decided' ? 'Decided' : 'Waiting for approval'}
          count={count}
          empty={rows.length === 0 ? (base.length === 0 ? (card === 'decided' ? 'Nothing decided in the last 30 days.' : 'All caught up — nothing waiting.') : 'No requests here.') : null}
        >
          {rows.map((r) => (
            <Row
              key={r.key}
              title={r.title}
              desc={r.desc}
              amount={r.hasAmount ? rm(r.amount) : '—'}
              tone={r.decision === 'rejected' ? 'void' : null}
              tick={selecting ? { on: selected.has(r.key), can: !r.why } : null}
              onClick={selecting ? () => toggle(r) : () => openRow(r)}
            />
          ))}
        </ListBlock>
        <FinDialog open={menu === 'bulk'} onClose={() => setMenu(null)} title={ticked.length > 0 ? `${ticked.length} selected` : 'Select'}>
          <DialogMenu
            items={[
              { key: 'all', label: `Select all · ${decidable.length}`, onClick: () => { setMenu(null); setSelected(new Set(decidable.map((r) => r.key))) } },
              ...(ticked.length > 0 ? [{ key: 'reject', label: `Reject ${ticked.length}…`, danger: true, onClick: () => openAsk({ kind: 'reject', scope: 'bulk', rows: ticked }) }] : []),
            ]}
          />
        </FinDialog>
      </AppScreen>
    )
  } else {
    screen = (
      <AppScreen
        screenKey={tab ? APPROVALS_TAB_HREF : HERE}
        head={tab ? { kind: 'root', title: 'Approvals' } : { kind: 'back', title: 'Approvals', backLabel: 'Overview', onBack: leave }}
        root={tab}
      >
        <BankHero value={hub.hero.value} label={hub.hero.label} chip={hub.hero.chip} />
        <StackCards cards={hub.cards} onOpen={(k) => go({ kind: 'list', card: k as ApprovalCardKey })} />
      </AppScreen>
    )
  }

  return (
    <>
      {screen}
      {decisions.dialog}
    </>
  )
}
