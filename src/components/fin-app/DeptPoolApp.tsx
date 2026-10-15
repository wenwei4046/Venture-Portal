'use client'

import { useRouter } from 'next/navigation'
import { useMemo, useState, useTransition, type ReactNode } from 'react'
import { flash } from '@/components/hrv/toast'
import { DialogConfirm, FinDialog } from '@/components/finv/Dialog'
import { DEPT_POOL_CARDS, type DeptPoolCard, type DeptPoolHubModel } from '@/lib/fin-app/dept-pool-model'
import { f2 } from '@/lib/fin-app/page-model'
import { executeHrCostingInWords } from '@/app/(portal)/dept-pool/hr-actions'
import AppScreen, { PageHead, type BarButton } from './AppScreen'
import { canStepBack, pushIntent, setIntent, useStep } from './nav'
import { BankHero, ItemGroup, Notice, StackCards, type ItemLine } from './parts'
import s from './fin-app.module.css'

// Department › Dept Pool in the Finance phone app (2026-10-15, part E3 — a page
// the design does not draw, in its style): the total balance (or the net
// margin, on the Accrual P&L basis) over the desktop page's parts — By
// department (a balance hidden until *Show balances*, as the desktop's column),
// Balance by bank, the HR costing submissions (*Mark executed* on a ready one,
// asked first — nothing in the app takes it back; a submission's departments
// its own screen); a department opens its own page in the app. The basis
// switches in the bar, the server's to read.

type Step = { kind: 'hub' } | { kind: 'list'; card: DeptPoolCard } | { kind: 'detail'; id: string }

const asCard = (v: string | null): DeptPoolCard | null => (v && (DEPT_POOL_CARDS as readonly string[]).includes(v) ? (v as DeptPoolCard) : null)

export function readPoolStep(q: URLSearchParams): Step {
  const d = q.get('d')
  if (q.get('f') === 'hr' && d) return { kind: 'detail', id: d }
  const card = asCard(q.get('f'))
  return card ? { kind: 'list', card } : { kind: 'hub' }
}
const TITLE: Record<DeptPoolCard, string> = { depts: 'By department', banks: 'Balance by bank', hr: 'HR costing' }

export default function DeptPoolApp({ model, search, canExecuteHr }: { model: DeptPoolHubModel; search: string; canExecuteHr: boolean }) {
  const router = useRouter()
  const keep = model.basis === 'accrual' ? 'basis=accrual' : ''
  const join = (...p: string[]) => p.filter(Boolean).join('&')
  const [step, open, back] = useStep(readPoolStep, search)
  const go = (st: Step) => open(join(keep, st.kind === 'list' ? `f=${st.card}` : st.kind === 'detail' ? `f=hr&d=${encodeURIComponent(st.id)}` : ''))
  const backTo = () => back(join(keep, step.kind === 'detail' ? 'f=hr' : ''))
  const leave = () => {
    if (canStepBack()) {
      window.history.back()
      return
    }
    setIntent('pop')
    router.replace('/fin-app')
  }

  // ── The basis on show: the server's to read ──
  const [moving, startMove] = useTransition()
  const switchBasis = () => {
    const next = model.basis === 'cash' ? 'basis=accrual' : ''
    startMove(() => router.replace(`/fin-app/page/dp${next ? `?${next}` : ''}`, { scroll: false }))
  }
  const basisBtn: BarButton = { key: 'basis', label: model.basis === 'cash' ? 'Accrual P&L' : 'Cash', disabled: moving, onClick: switchBasis }

  const [shown, setShown] = useState(false)
  // Mark executed goes one way (nothing here sets a submission back), so it is
  // asked first (2026-10-15, the user: a thumb lands on the bar's first button
  // by mistake). The refusal stays in the question.
  const [asking, setAsking] = useState<string | null>(null)
  const [askError, setAskError] = useState<string | null>(null)
  const [busy, startBusy] = useTransition()
  const ask = (id: string) => {
    setAskError(null)
    setAsking(id)
  }
  const execute = () => {
    if (!asking) return
    const id = asking
    setAskError(null)
    startBusy(async () => {
      try {
        const res = await executeHrCostingInWords(id)
        if (!res.ok) return setAskError(res.reason)
        setAsking(null)
        flash('Marked executed')
        router.refresh()
      } catch {
        setAskError('That did not go through. Try again.')
      }
    })
  }
  const openDept = (slug: string) => {
    pushIntent()
    router.push(`/fin-app/page/dp-${encodeURIComponent(slug)}`)
  }

  const submissions = useMemo(() => new Map((model.submissions ?? []).map((x) => [x.id, x])), [model.submissions])

  let screen: ReactNode
  if (step.kind === 'detail') {
    const sub = submissions.get(step.id)
    screen = (
      <AppScreen
        screenKey={`dp?d=${step.id}`}
        head={{ kind: 'back', title: sub?.label ?? 'Submission', backLabel: 'HR costing', onBack: backTo }}
        bar={sub && sub.ready && canExecuteHr ? [{ key: 'exec', label: 'Mark executed', kind: 'primary', disabled: busy, onClick: () => ask(sub.id) }] : []}
      >
        <PageHead roman="IV." eyebrow="Dept Pool · HR costing" title={sub?.label ?? 'Submission'} />
        {sub ? (
          <ItemGroup
            title={`${sub.state.text} · ${sub.sub}`}
            count={`RM ${sub.value}`}
            items={sub.parts.map((p) => ({ key: p.key, label: p.label, sub: p.sub, value: p.value }))}
            empty="Empty submission."
          />
        ) : (
          <Notice>This submission is not there any more.</Notice>
        )}
      </AppScreen>
    )
  } else if (step.kind === 'list') {
    const card = step.card
    let body: ReactNode = null
    let bar: BarButton[] = [basisBtn]
    if (card === 'depts') {
      const cash = model.basis === 'cash'
      if (cash) bar = [{ key: 'reveal', label: shown ? 'Hide balances' : 'Show balances', kind: 'primary', onClick: () => setShown((v) => !v) }, basisBtn]
      const items: ItemLine[] = model.depts.map((d) => ({
        key: d.key,
        label: d.name,
        sub: d.sub,
        value: cash ? (shown ? `${(d.balance ?? 0) < 0 ? '−' : ''}${f2(Math.abs(d.balance ?? 0))}` : '••••••') : (d.value ?? undefined),
        tone: d.tone,
        chip: d.chip,
        onOpen: d.slug ? () => openDept(d.slug!) : undefined,
      }))
      body = <ItemGroup title={cash ? 'Cash · to date' : 'Accrual · to date'} count={cash ? (shown ? model.hero.value : `${items.length}`) : model.hero.value} items={items} empty="No departments visible to your role." />
    } else if (card === 'banks' && model.banks) {
      body = <ItemGroup title="Each department's slice" count={model.banks.totals} items={model.banks.lines.map((l) => ({ key: l.key, label: l.label, sub: l.sub, value: l.value, tone: l.tone }))} />
    } else if (card === 'hr' && model.submissions) {
      body = (
        <ItemGroup
          title="Submissions"
          count={String(model.submissions.length)}
          empty="No submissions yet."
          items={model.submissions.map((x) => ({
            key: x.id,
            label: x.label,
            sub: x.sub,
            value: x.value,
            chip: x.state,
            onOpen: () => go({ kind: 'detail', id: x.id }),
            action: x.ready && canExecuteHr ? { label: 'Mark executed', off: busy, onClick: () => ask(x.id) } : null,
          }))}
        />
      )
    }
    screen = (
      <AppScreen screenKey={`dp?f=${card}`} head={{ kind: 'back', title: TITLE[card], backLabel: 'Dept Pool', onBack: backTo }} bar={bar}>
        <PageHead roman="IV." eyebrow={`Dept Pool · ${model.basis === 'cash' ? 'Cash' : 'Accrual P&L'}`} title={TITLE[card]} />
        <div className={moving ? s.pending : undefined}>{body}</div>
      </AppScreen>
    )
  } else {
    screen = (
      <AppScreen screenKey="/fin-app/page/dp" head={{ kind: 'back', title: 'Dept Pool', backLabel: 'Overview', onBack: leave }} bar={[basisBtn]}>
        <BankHero value={model.hero.value} label={model.hero.label} chip={model.chip} />
        <div className={moving ? s.pending : undefined}>
          <StackCards cards={model.cards} onOpen={(k) => go({ kind: 'list', card: k as DeptPoolCard })} />
        </div>
      </AppScreen>
    )
  }
  const asked = asking ? submissions.get(asking) : undefined
  return (
    <>
      {screen}
      <FinDialog
        open={asking !== null}
        onClose={() => !busy && setAsking(null)}
        title={`Mark ${asked?.label ?? 'this submission'} executed?`}
        sub={asked ? `HR costing · RM ${asked.value}` : undefined}
        locked={busy}
      >
        <DialogConfirm
          text="This cannot be undone."
          confirmLabel={busy ? 'Marking…' : 'Mark executed'}
          busy={busy}
          error={askError}
          onCancel={() => setAsking(null)}
          onConfirm={execute}
        />
      </FinDialog>
    </>
  )
}
