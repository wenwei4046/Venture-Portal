'use client'

import { useRouter } from 'next/navigation'
import { useMemo, useState, useTransition } from 'react'
import { DialogMenu, FinDialog, type DialogMenuItem } from '@/components/finv/Dialog'
import { HUB_HREF, HUB_TITLE } from '@/lib/fin-app/routes'
import { monthName, type ReportCard, type ReportLine, type ReportModel } from '@/lib/fin-app/report-model'
import AppScreen, { PageHead, type BarButton } from './AppScreen'
import { useHubTabs } from './hub-tabs'
import { pushIntent, useStep } from './nav'
import { BankHero, ItemGroup, StackCards, type ItemLine } from './parts'
import s from './fin-app.module.css'

// The Finance phone app's Report tab (2026-10-15, the Finance revamp v2's
// phone — M15–M16, the prototype's `bankReport` / `listReport`): a report's
// hub — its headline figure under the month (ours: the pill, another month
// the server's to read, `?m=`), the state the page says in a word, a stacked
// card per part — and a card's list, its groups of lines (an invoice or a
// deal opening in the app). The bar is the design's *Export PDF · Export
// Excel* (the desktop page's own files); the ⋯ holds the desktop's other
// files and its Segment. Every figure is the desktop page's (`report-model`).

export type ReportStep = { kind: 'hub' } | { kind: 'list'; card: string }

export interface ReportFile {
  key: string
  label: string
  href: string
  format: 'pdf' | 'xlsx'
}

const join = (...parts: string[]) => parts.filter(Boolean).join('&')

export default function ReportApp({
  model,
  search,
  month,
  segment,
  files,
}: {
  model: ReportModel
  /** The address's query as the server read it (a refresh, a link). */
  search: string
  /** The month on show (`YYYY-MM`) and the office's: no later month to go to. */
  month: { ym: string; thisMonth: string }
  /** The segment asked for and the choices — the GL statements', for whoever reads them company-wide. */
  segment: { value: string; options: Array<{ value: string; label: string }> } | null
  /** The desktop page's files: the first two stand in the bar (the design's), the rest in its ⋯. */
  files: ReportFile[]
}) {
  const router = useRouter()
  const hub = model.hub
  const cardKeys = useMemo(() => new Set(model.cards.map((c) => c.key)), [model.cards])
  const read = useMemo(
    () =>
      (q: URLSearchParams): ReportStep => {
        const f = q.get('f')
        return f && cardKeys.has(f) ? { kind: 'list', card: f } : { kind: 'hub' }
      },
    [cardKeys],
  )
  const [step, open, back] = useStep(read, search)
  const { topTabs, swipe } = useHubTabs('report', hub)
  const [menu, setMenu] = useState<'more' | 'segment' | null>(null)

  // ── The month and segment on show: the server's to read ──
  const [pending, startMove] = useTransition()
  const [goingTo, setGoingTo] = useState<string | null>(null)
  const keep = (ym: string, seg: string) => join(ym === month.thisMonth ? '' : `m=${ym}`, seg ? `s=${encodeURIComponent(seg)}` : '')
  const here = keep(month.ym, segment?.value ?? '')
  const move = (ym: string, seg: string) => {
    setGoingTo(ym)
    const q = join(keep(ym, seg), step.kind === 'list' ? `f=${step.card}` : '')
    startMove(() => router.replace(`${HUB_HREF[hub]}${q ? `?${q}` : ''}`, { scroll: false }))
  }
  const shift = (n: number) => {
    const [y, m] = month.ym.split('-').map(Number)
    const t = new Date(Date.UTC(y, m - 1 + n, 1))
    return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}`
  }
  const shownMonth = goingTo && pending ? goingTo : month.ym

  const go = (next: ReportStep) => open(join(here, next.kind === 'list' ? `f=${next.card}` : ''))
  const backTo = () => back(here)

  /** A line's own record, in the app: an invoice, a loan, a fund source. */
  const openLine = (l: ReportLine) => {
    if (!l.open) return
    pushIntent()
    router.push(`${HUB_HREF[l.open.hub]}?id=${encodeURIComponent(l.open.id)}`)
  }
  const fetchFile = (f: ReportFile) => {
    setMenu(null)
    if (f.format === 'pdf') window.open(f.href, '_blank', 'noopener,noreferrer')
    else window.location.assign(f.href)
  }

  // ── The bar: the design's two files, our ⋯ ──
  const [first, second, ...rest] = files
  const segName = segment ? (segment.options.find((o) => o.value === segment.value) ?? segment.options[0])?.label : null
  // A segment's figures say whose they are, under the headline and over a list (the desktop's section head does).
  const ofSegment = segment?.value && segName ? ` · ${segName}` : ''
  const moreItems: DialogMenuItem[] = [
    ...(segment && segName ? [{ key: 'segment', label: `Segment · ${segName}`, onClick: () => setMenu('segment') }] : []),
    ...rest.map((f) => ({ key: f.key, label: f.label, onClick: () => fetchFile(f) })),
  ]
  const bar: BarButton[] = [
    ...(first ? [{ key: first.key, label: first.label, kind: 'primary' as const, onClick: () => fetchFile(first) }] : []),
    ...(second ? [{ key: second.key, label: second.label, onClick: () => fetchFile(second) }] : []),
    ...(moreItems.length > 0 ? [{ key: 'more', label: '⋯', kind: 'more' as const, onClick: () => setMenu('more') }] : []),
  ]

  const card: ReportCard | null = step.kind === 'list' ? (model.cards.find((c) => c.key === step.card) ?? null) : null
  const screen =
    step.kind === 'list' && card ? (
      <AppScreen screenKey={`${hub}?f=${card.key}`} head={{ kind: 'back', title: card.label, backLabel: HUB_TITLE[hub], onBack: backTo }} bar={bar}>
        <PageHead roman="III." eyebrow={`${model.eyebrow}${ofSegment}`} title={card.label} />
        <div className={pending ? s.pending : undefined}>
          {card.groups.map((g) => (
            <ItemGroup
              key={g.key}
              title={g.title}
              count={g.count}
              empty={g.empty}
              items={g.lines.map(
                (l): ItemLine => ({
                  key: l.key,
                  label: l.label,
                  sub: l.sub,
                  value: l.value,
                  tone: l.tone ?? null,
                  action: l.open ? { label: 'Open', onClick: () => openLine(l) } : null,
                }),
              )}
            />
          ))}
        </div>
      </AppScreen>
    ) : (
      <AppScreen screenKey={HUB_HREF[hub]} head={{ kind: 'bare' }} topTabs={topTabs} bar={bar} root onSwipe={swipe}>
        <BankHero
          value={model.hero.value}
          label={`${model.hero.label}${ofSegment}`}
          month={{ label: monthName(shownMonth), prev: () => move(shift(-1), segment?.value ?? ''), next: () => move(shift(1), segment?.value ?? ''), canNext: month.ym < month.thisMonth }}
          chip={model.chip}
        />
        <div className={pending ? s.pending : undefined}>
          <StackCards cards={model.cards} onOpen={(k) => go({ kind: 'list', card: k })} />
        </div>
      </AppScreen>
    )

  return (
    <>
      {screen}
      <FinDialog open={menu === 'more'} onClose={() => setMenu(null)} title={HUB_TITLE[hub]}>
        <DialogMenu items={moreItems} />
      </FinDialog>
      {segment ? (
        <FinDialog open={menu === 'segment'} onClose={() => setMenu(null)} title="Segment">
          <DialogMenu
            items={segment.options.map((o) => ({
              key: o.value || 'all',
              label: o.value === segment.value ? `${o.label} ✓` : o.label,
              onClick: () => {
                setMenu(null)
                if (o.value !== segment.value) move(month.ym, o.value)
              },
            }))}
          />
        </FinDialog>
      ) : null}
    </>
  )
}
