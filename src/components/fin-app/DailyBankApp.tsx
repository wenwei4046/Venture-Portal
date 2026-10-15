'use client'

import { useRouter } from 'next/navigation'
import { useMemo, useState, useTransition } from 'react'
import { dayWords, shiftDay, type DailyBankModel } from '@/lib/fin-app/daily-bank-model'
import AppScreen, { PageHead, type BarButton } from './AppScreen'
import { canStepBack, setIntent, useStep } from './nav'
import { BankHero, ItemGroup, StackCards, type ItemLine } from './parts'
import s from './fin-app.module.css'

// Daily › Daily Bank in the Finance phone app (2026-10-15, part 5 — a page the
// design does not draw, in the app's style): the day's total available under
// the day between its arrows (ours: the desktop's ← →, another day the
// server's to read, `?date=`), a card per bank, what came in, what waits on
// the Principal, what the day opened with; a card's list, its groups of lines.
// The bar is the desktop's PDF (for whoever may export) and Today.

const HERE = '/fin-app/page/daily-bank'

export default function DailyBankApp({ model, search, today, canExport }: { model: DailyBankModel; search: string; today: string; canExport: boolean }) {
  const router = useRouter()
  const keys = useMemo(() => new Set(Object.keys(model.lists)), [model.lists])
  const read = useMemo(
    () =>
      (q: URLSearchParams): { kind: 'hub' } | { kind: 'list'; card: string } => {
        const f = q.get('f')
        return f && keys.has(f) ? { kind: 'list', card: f } : { kind: 'hub' }
      },
    [keys],
  )
  const [step, open, back] = useStep(read, search)

  // ── The day on show: the server's to read ──
  const [pending, startMove] = useTransition()
  const [goingTo, setGoingTo] = useState<string | null>(null)
  const dayQuery = (d: string) => (d === today ? '' : `date=${d}`)
  const here = dayQuery(model.date)
  const move = (d: string) => {
    setGoingTo(d)
    const q = [dayQuery(d), step.kind === 'list' ? `f=${encodeURIComponent(step.card)}` : ''].filter(Boolean).join('&')
    startMove(() => router.replace(`${HERE}${q ? `?${q}` : ''}`, { scroll: false }))
  }
  const shown = goingTo && pending ? goingTo : model.date
  const shownLabel = `${shown === today ? 'Today · ' : ''}${dayWords(shown)}`

  const leave = () => {
    if (canStepBack()) {
      window.history.back()
      return
    }
    setIntent('pop')
    router.replace('/fin-app')
  }
  const go = (card: string) => open([here, `f=${encodeURIComponent(card)}`].filter(Boolean).join('&'))
  const backTo = () => back(here)

  const bar: BarButton[] = [
    ...(canExport ? [{ key: 'pdf', label: 'Export PDF', kind: 'primary' as const, onClick: () => window.open(`/daily-bank/export?date=${model.date}`, '_blank', 'noopener,noreferrer') }] : []),
    ...(model.isToday ? [] : [{ key: 'today', label: 'Today', onClick: () => move(today) }]),
  ]

  if (step.kind === 'list') {
    const list = model.lists[step.card]
    return (
      <AppScreen screenKey={`daily-bank?f=${step.card}`} head={{ kind: 'back', title: list.title, backLabel: 'Daily Bank', onBack: backTo }} bar={bar}>
        <PageHead roman="I." eyebrow={`Daily Bank · ${model.dayLabel}`} title={list.title} />
        <div className={pending ? s.pending : undefined}>
          {list.groups.map((g) => (
            <ItemGroup
              key={g.key}
              title={g.title}
              count={g.count}
              empty={g.empty}
              items={g.lines.map((l): ItemLine => ({ key: l.key, label: l.label, sub: l.sub, value: l.value, tone: l.tone ?? null }))}
            />
          ))}
        </div>
      </AppScreen>
    )
  }
  return (
    <AppScreen screenKey={HERE} head={{ kind: 'back', title: 'Daily Bank', backLabel: 'Overview', onBack: leave }} bar={bar}>
      <BankHero
        value={model.hero.value}
        label={model.hero.label}
        month={{ label: shownLabel, prev: () => move(shiftDay(shown, -1)), next: () => move(shiftDay(shown, 1)), canNext: shown < today, unit: 'day' }}
      />
      <div className={pending ? s.pending : undefined}>
        <StackCards cards={model.cards} onOpen={go} />
      </div>
    </AppScreen>
  )
}
