'use client'

import { useRouter } from 'next/navigation'
import { useMemo, useState, useTransition, type ReactNode } from 'react'
import { DialogMenu, FinDialog, type DialogMenuItem } from '@/components/finv/Dialog'
import { joinQuery, type PageGroup, type PageLine, type PageModel, type PagePlace } from '@/lib/fin-app/page-model'
import AppScreen, { PageHead, type BarButton } from './AppScreen'
import type { ReportFile } from './ReportApp'
import { canStepBack, pushIntent, setIntent, useStep } from './nav'
import { BankHero, ItemGroup, StackCards, type ItemLine } from './parts'
import s from './fin-app.module.css'

// A Finance page in the phone app that the design does not draw (2026-10-15,
// part 5): pushed over the tab it was opened from (*‹ Overview*), drawn as the
// app's hubs are — its headline centred, the period between its arrows (the
// server's to read), its state in a word, a stacked card per part — then a
// card's groups of lines, and a line's own screen where it has one (a ledger
// account's entries). The bar is the desktop page's files, for whoever may
// export them (the first two stand in it, the rest and the Segment in its ⋯),
// and whatever the page adds (`bar`).

export type PageStep = { kind: 'hub' } | { kind: 'list'; card: string } | { kind: 'detail'; card: string; line: string }

export default function PageApp({
  place,
  model,
  search,
  files = [],
  bar: extraBar = [],
  children,
}: {
  place: PagePlace
  model: PageModel
  /** The address's query as the server read it (a refresh, a link). */
  search: string
  files?: ReportFile[]
  /** The page's own steps beside its files (a page's create — drawn first). */
  bar?: BarButton[]
  /** Windows the page's own steps open. */
  children?: ReactNode
}) {
  const router = useRouter()
  const cards = useMemo(() => new Map(model.cards.map((c) => [c.key, c])), [model.cards])
  const read = useMemo(
    () =>
      (q: URLSearchParams): PageStep => {
        const f = q.get('f')
        const card = f ? cards.get(f) : undefined
        if (!card || !f) return { kind: 'hub' }
        const d = q.get('d')
        if (d && card.groups.some((g) => g.lines.some((l) => l.key === d && l.detail))) return { kind: 'detail', card: f, line: d }
        return { kind: 'list', card: f }
      },
    [cards],
  )
  const [step, open, back] = useStep(read, search)
  const [menu, setMenu] = useState<'more' | 'segment' | null>(null)

  // ── What is on show (a period, a segment): the server's to read ──
  const [pending, startMove] = useTransition()
  const [goingTo, setGoingTo] = useState<string | null>(null)
  const stepQuery = (st: PageStep) => (st.kind === 'list' ? `f=${encodeURIComponent(st.card)}` : st.kind === 'detail' ? `f=${encodeURIComponent(st.card)}&d=${encodeURIComponent(st.line)}` : '')
  const move = (keep: string, label?: string) => {
    setMenu(null)
    setGoingTo(label ?? null)
    const q = joinQuery(keep, step.kind === 'hub' ? '' : stepQuery({ kind: 'list', card: step.card }))
    startMove(() => router.replace(`${place.href}${q ? `?${q}` : ''}`, { scroll: false }))
  }

  const leave = () => {
    if (canStepBack()) {
      window.history.back()
      return
    }
    setIntent('pop')
    router.replace('/fin-app')
  }
  const go = (next: PageStep) => open(joinQuery(place.keep, stepQuery(next)))
  const backTo = () => back(joinQuery(place.keep, step.kind === 'detail' ? stepQuery({ kind: 'list', card: step.card }) : ''))

  const fetchFile = (f: ReportFile) => {
    setMenu(null)
    if (f.format === 'pdf') window.open(f.href, '_blank', 'noopener,noreferrer')
    else window.location.assign(f.href)
  }
  const segName = place.segments?.find((x) => x.value === (place.segment ?? ''))?.label ?? null
  const [first, second, ...rest] = files
  const moreItems: DialogMenuItem[] = [
    ...(place.segments && place.segments.length > 1 && segName ? [{ key: 'segment', label: `Segment · ${segName}`, onClick: () => setMenu('segment') }] : []),
    ...rest.map((f) => ({ key: f.key, label: f.label, onClick: () => fetchFile(f) })),
  ]
  // The page's own step leads; then the files — the first two in the bar, or one beside the page's step (the
  // second joins the ⋯ then, so the bar keeps three buttons).
  const own = extraBar.length > 0
  const inBar = own ? [first] : [first, second]
  const menuItems: DialogMenuItem[] = [...(own && second ? [{ key: second.key, label: second.label, onClick: () => fetchFile(second) }] : []), ...moreItems]
  const bar: BarButton[] = [
    ...extraBar,
    ...inBar.filter((f): f is ReportFile => !!f).map((f, i) => ({ key: f.key, label: f.label, kind: !own && i === 0 ? ('primary' as const) : undefined, onClick: () => fetchFile(f) })),
    ...(menuItems.length > 0 ? [{ key: 'more', label: '⋯', kind: 'more' as const, onClick: () => setMenu('more') }] : []),
  ]
  const ofSegment = place.segment && segName ? ` · ${segName}` : ''

  const lineItem = (l: PageLine, card: string): ItemLine => ({
    key: l.key,
    label: l.label,
    sub: l.sub,
    value: l.value,
    tone: l.tone ?? null,
    chip: l.chip ?? null,
    onOpen: l.detail ? () => go({ kind: 'detail', card, line: l.key }) : undefined,
    action: l.open
      ? {
          label: l.open.label ?? 'Open',
          onClick: () => {
            pushIntent()
            router.push(l.open!.href)
          },
        }
      : null,
  })
  const groupsOf = (groups: PageGroup[], card: string) =>
    groups.map((g) => <ItemGroup key={g.key} title={g.title} count={g.count} empty={g.empty} items={g.lines.map((l) => lineItem(l, card))} />)

  let screen: ReactNode
  if (step.kind === 'detail') {
    const card = cards.get(step.card)!
    const line = card.groups.flatMap((g) => g.lines).find((l) => l.key === step.line)!
    screen = (
      <AppScreen screenKey={`${place.href}?f=${step.card}&d=${step.line}`} head={{ kind: 'back', title: line.detail!.title, backLabel: card.label, onBack: backTo }} bar={bar}>
        <PageHead roman={place.roman} eyebrow={`${model.eyebrow}${ofSegment}`} title={line.detail!.title} />
        <div className={pending ? s.pending : undefined}>{groupsOf(line.detail!.groups, step.card)}</div>
      </AppScreen>
    )
  } else if (step.kind === 'list') {
    const card = cards.get(step.card)!
    screen = (
      <AppScreen screenKey={`${place.href}?f=${step.card}`} head={{ kind: 'back', title: card.label, backLabel: place.title, onBack: backTo }} bar={bar}>
        <PageHead roman={place.roman} eyebrow={`${model.eyebrow}${ofSegment}`} title={card.label} />
        <div className={pending ? s.pending : undefined}>{groupsOf(card.groups, step.card)}</div>
      </AppScreen>
    )
  } else {
    const p = place.period
    screen = (
      <AppScreen screenKey={place.href} head={{ kind: 'back', title: place.title, backLabel: 'Overview', onBack: leave }} bar={bar}>
        <BankHero
          value={model.hero.value}
          label={`${model.hero.label}${ofSegment}`}
          chip={model.chip}
          month={
            p
              ? {
                  label: goingTo && pending ? goingTo : p.label,
                  prev: () => p.prev !== null && move(p.prev),
                  next: () => p.next !== null && move(p.next),
                  canPrev: p.prev !== null,
                  canNext: p.next !== null,
                  unit: p.unit,
                }
              : null
          }
        />
        <div className={pending ? s.pending : undefined}>
          <StackCards cards={model.cards} onOpen={(k) => go({ kind: 'list', card: k })} />
        </div>
      </AppScreen>
    )
  }

  return (
    <>
      {screen}
      {children}
      <FinDialog open={menu === 'more'} onClose={() => setMenu(null)} title={place.title}>
        <DialogMenu items={menuItems} />
      </FinDialog>
      {place.segments ? (
        <FinDialog open={menu === 'segment'} onClose={() => setMenu(null)} title="Segment">
          <DialogMenu
            items={place.segments.map((o) => ({
              key: o.value || 'all',
              label: o.value === (place.segment ?? '') ? `${o.label} ✓` : o.label,
              onClick: () => (o.value === (place.segment ?? '') ? setMenu(null) : move(o.keep)),
            }))}
          />
        </FinDialog>
      ) : null}
    </>
  )
}
