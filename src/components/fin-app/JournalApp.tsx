'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState, useTransition, type ReactNode } from 'react'
import { flash } from '@/components/hrv/toast'
import { DialogConfirm, DialogMenu, FinDialog } from '@/components/finv/Dialog'
import { drawerStyles as d } from '@/components/finv/Drawer'
import { DrawerGroup as Group, DrawerLine as Line } from '@/components/finv/DrawerParts'
import { f2, rm } from '@/lib/fin-app/page-model'
import type { ExtraSegments, JournalCard, JournalHubModel, JournalRecordModel } from '@/lib/fin-app/journal-model'
import { deleteJournalVoucherInWords } from '@/app/(portal)/reconciliation/journal-entries/actions'
import { openJournalVoucher } from '@/app/(portal)/reconciliation/journal-entries/page-actions'
import AppScreen, { PageHead, type BarButton } from './AppScreen'
import JournalVoucherSheet, { type JvSheetSeed } from './JournalVoucherSheet'
import { canStepBack, setIntent, useStep } from './nav'
import { BankHero, ListBlock, Row, SearchRow, StackCards } from './parts'

// Daily › Journal Entries in the Finance phone app (2026-10-15, part 5c — a
// page the design does not draw, in its style): what was posted this month
// over a card for this month, the manual vouchers and the payroll accruals; a
// card's list (search, then the voucher's words · its day, lines and segment ·
// its amount — no number, the phone lists' rule); a voucher as its page — the
// drawer's dark hero, its lines closing on their totals — with the desktop
// page's steps (Edit · Copy · ⋯ Delete; an accrual's *Fix mistakes*) and
// *+ New entry* in the bar. The sheet posts with the voucher page's own RPCs.

type Step = { kind: 'hub' } | { kind: 'list'; card: JournalCard } | { kind: 'record'; id: string; from: JournalCard | null }

const CARDS: readonly JournalCard[] = ['month', 'manual', 'auto']
const asCard = (v: string | null): JournalCard | null => (v && (CARDS as readonly string[]).includes(v) ? (v as JournalCard) : null)

export function readJournalStep(q: URLSearchParams): Step {
  const id = q.get('id')
  if (id) return { kind: 'record', id, from: asCard(q.get('from')) }
  const card = asCard(q.get('f'))
  return card ? { kind: 'list', card } : { kind: 'hub' }
}
const searchOf = (s: Step) => (s.kind === 'record' ? `id=${encodeURIComponent(s.id)}${s.from ? `&from=${s.from}` : ''}` : s.kind === 'list' ? `f=${s.card}` : '')
const parentOf = (s: Step) => (s.kind === 'record' ? (s.from ? `f=${s.from}` : '') : '')

const TITLE: Record<JournalCard, string> = { month: 'This month', manual: 'Manual vouchers', auto: 'Payroll accruals' }

export default function JournalApp({
  hub,
  search,
  today,
  canCreate,
  record: initialRecord,
  refused: initialRefused,
  extraSegments = [],
}: {
  hub: JournalHubModel
  /** The registry's departments, for the voucher sheet's Segment. */
  extraSegments?: ExtraSegments
  search: string
  today: string
  canCreate: boolean
  record: JournalRecordModel | null
  refused: string | null
}) {
  const router = useRouter()
  const [step, open, back] = useStep(readJournalStep, search)
  const go = (s: Step) => open(searchOf(s))
  const backTo = () => back(parentOf(step))
  const leave = () => {
    if (canStepBack()) {
      window.history.back()
      return
    }
    setIntent('pop')
    router.replace('/fin-app')
  }

  const [record, setRecord] = useState<JournalRecordModel | null>(initialRecord)
  const [refused, setRefused] = useState<string | null>(initialRefused)
  const load = useCallback((id: string) => {
    setRefused(null)
    void openJournalVoucher(id).then(
      (res) => {
        if (res.ok) setRecord(res.record)
        else {
          setRecord(null)
          setRefused(res.reason)
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
    if (!recordId || record?.id === recordId) return
    setRecord(null)
    load(recordId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordId])

  const [query, setQuery] = useState<Record<string, string>>({})
  const [sheet, setSheet] = useState<JvSheetSeed | null>(null)
  const [menu, setMenu] = useState(false)
  const [asking, setAsking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, startBusy] = useTransition()

  const newEntry: BarButton | null = canCreate ? { key: 'new', label: '+ New entry', kind: 'primary', onClick: () => setSheet({ mode: 'new' }) } : null
  const done = (id: string, said: string) => {
    setSheet(null)
    flash(said)
    router.refresh()
    if (step.kind === 'record' && step.id === id) load(id)
    else go({ kind: 'record', id, from: step.kind === 'list' ? step.card : step.kind === 'record' ? step.from : null })
  }

  let screen: ReactNode
  if (step.kind === 'record') {
    const r = record?.id === step.id ? record : null
    const bar: BarButton[] = !r
      ? []
      : r.auto
        ? r.can.edit
          ? [{ key: 'fix', label: 'Fix mistakes', kind: 'primary', onClick: () => setSheet({ mode: 'edit', id: r.id, no: r.no, date: r.date, description: r.description, segment: r.segment, lines: r.lines.map((l) => ({ account_code: l.account, debit: l.debit || null, credit: l.credit || null, description: l.note })) }) }]
          : []
        : [
            ...(r.can.edit ? [{ key: 'edit', label: 'Edit', kind: 'primary' as const, onClick: () => setSheet({ mode: 'edit', id: r.id, no: r.no, date: r.date, description: r.description, segment: r.segment, lines: r.lines.map((l) => ({ account_code: l.account, debit: l.debit || null, credit: l.credit || null, description: l.note })) }) }] : []),
            ...(r.can.copy ? [{ key: 'copy', label: 'Copy', onClick: () => setSheet({ mode: 'copy', id: r.id }) }] : []),
            ...(r.can.delete ? [{ key: 'more', label: '⋯', kind: 'more' as const, onClick: () => setMenu(true) }] : []),
          ]
    screen = (
      <AppScreen screenKey={`journal?${searchOf(step)}`} head={{ kind: 'back', title: r?.no || 'Voucher', backLabel: step.from ? TITLE[step.from] : 'Journal Entries', onBack: backTo }} bar={bar}>
        {r ? (
          <>
            <div className={d.hero} data-light={r.auto ? 'info' : 'ledger'}>
              <div className={d.heroTop}>
                <span className={d.kicker}>{r.auto ? 'Payroll accrual · auto' : 'Journal voucher'}</span>
                <span className={d.heroChip}>
                  <span className={d.heroDot} />
                  {r.auto ? 'Auto · payroll' : 'Posted'}
                </span>
              </div>
              <div className={d.heroNo}>{r.no}</div>
              <div className={d.heroAmount}>{rm(r.debit)}</div>
              <div className={d.heroTo}>{r.description || '—'}</div>
              <div className={d.heroNote}>
                <span className={d.heroNoteDot} />
                <span>{r.balanced ? 'Balanced · debits = credits' : `Out of balance · ${f2(Math.abs(r.debit - r.credit))}`}</span>
              </div>
            </div>
            <Group n="I." title="When & where">
              <Line label="Date" value={r.dateWords} mono />
              <Line label="Segment" value={r.segmentWords} />
            </Group>
            <Group n="II." title={`Lines · ${r.lines.length}`} foot={{ l: 'Total', v: `Dr ${f2(r.debit)} · Cr ${f2(r.credit)}` }}>
              {r.lines.map((l, i) => (
                <Line key={i} label={l.name ? `${l.account} · ${l.name}` : l.account} value={l.debit > 0 ? `${f2(l.debit)} Dr` : `${f2(l.credit)} Cr`} sub={l.note ?? undefined} mono />
              ))}
            </Group>
          </>
        ) : (
          <div className={d.loading}>{refused ?? 'Loading…'}</div>
        )}
      </AppScreen>
    )
  } else if (step.kind === 'list') {
    const card = step.card
    const q = (query[card] ?? '').trim().toLowerCase()
    const all = hub.lists[card]
    const rows = all.filter((r) => !q || `${r.title} ${r.desc}`.toLowerCase().includes(q))
    screen = (
      <AppScreen screenKey={`journal?f=${card}`} head={{ kind: 'back', title: TITLE[card], backLabel: 'Journal Entries', onBack: backTo }} bar={newEntry && card !== 'auto' ? [newEntry] : []}>
        <PageHead roman="I." eyebrow={`Journal Entries · ${TITLE[card]}`} title={TITLE[card]} />
        <SearchRow value={query[card] ?? ''} onChange={(v) => setQuery((p) => ({ ...p, [card]: v }))} placeholder="Search description, segment…" />
        <ListBlock title="Vouchers" count={`${rows.length} · ${rm(rows.reduce((t, r) => t + r.amount, 0))}`} empty={rows.length === 0 ? (all.length === 0 ? 'No vouchers here yet.' : 'No vouchers match.') : null}>
          {rows.map((r) => (
            <Row key={r.id} title={r.title} desc={r.desc} amount={rm(r.amount)} onClick={() => go({ kind: 'record', id: r.id, from: card })} />
          ))}
        </ListBlock>
      </AppScreen>
    )
  } else {
    screen = (
      <AppScreen screenKey="/fin-app/page/journal" head={{ kind: 'back', title: 'Journal Entries', backLabel: 'Overview', onBack: leave }} bar={newEntry ? [newEntry] : []}>
        <BankHero value={hub.hero.value} label={hub.hero.label} />
        <StackCards cards={hub.cards} onOpen={(k) => go({ kind: 'list', card: k as JournalCard })} />
      </AppScreen>
    )
  }

  const r = step.kind === 'record' && record?.id === step.id ? record : null
  const remove = () => {
    if (!r) return
    setError(null)
    startBusy(async () => {
      try {
        const res = await deleteJournalVoucherInWords(r.id)
        if (!res.ok) return setError(res.reason)
        setAsking(false)
        flash(`${r.no} deleted`)
        router.refresh()
        backTo()
      } catch {
        setError('That did not go through. Try again.')
      }
    })
  }

  return (
    <>
      {screen}
      <JournalVoucherSheet seed={sheet} today={today} extraSegments={extraSegments} onClose={() => setSheet(null)} onDone={done} />
      <FinDialog open={menu} onClose={() => setMenu(false)} title={r?.no ?? 'Voucher'}>
        <DialogMenu items={[{ key: 'delete', label: 'Delete voucher', danger: true, onClick: () => { setMenu(false); setError(null); setAsking(true) } }]} />
      </FinDialog>
      <FinDialog open={asking} onClose={() => !busy && setAsking(false)} title={`Delete ${r?.no || 'this voucher'}?`} locked={busy}>
        <DialogConfirm text="This cannot be undone." confirmLabel={busy ? 'Deleting…' : 'Delete voucher'} danger busy={busy} error={error} onCancel={() => setAsking(false)} onConfirm={remove} />
      </FinDialog>
    </>
  )
}

