'use client'

import { useRouter } from 'next/navigation'
import { useMemo, useState, type ReactNode } from 'react'
import { flash } from '@/components/hrv/toast'
import { PAYROLL_CARDS, type PayrollCard, type PayrollRequestLine, type PayrollRequestsModel } from '@/lib/fin-app/payroll-requests-model'
import { f2 } from '@/lib/fin-app/page-model'
import { HUB_HREF } from '@/lib/fin-app/routes'
import type { PayrollBank } from '@/app/(portal)/payments/payroll-requests/_lib/payroll-read'
import { FundSheet, SendBackSheet } from '@/app/(portal)/payments/requests/_components/RequestSheets'
import AppScreen, { PageHead, type BarButton } from './AppScreen'
import { canStepBack, pushIntent, setIntent, useStep } from './nav'
import { BankHero, ItemGroup, Notice, StackCards } from './parts'

// Payments › Payroll Requests in the Finance phone app (2026-10-16, part E4 —
// a page the design does not draw, in its style): what is still to fund,
// each request its own screen — its departments (the pool's balance, what it
// owes, what earlier rounds funded). *Fund* is the desktop's round in the
// kit's sheet — from bank, to bank, the date, each department's share (what
// it still owes by default), the desktop's checks in its words; the voucher
// it makes opens in the app. *Send back to HR* cancels the request and
// reverses its accruals — one way, so it asks first. Statutory payments are
// HR's to make; here they are to see.

type Step = { kind: 'hub' } | { kind: 'list'; card: PayrollCard } | { kind: 'item'; id: string; from: PayrollCard }

const asCard = (v: string | null): PayrollCard | null => (v && (PAYROLL_CARDS as readonly string[]).includes(v) ? (v as PayrollCard) : null)
export function readPayrollStep(q: URLSearchParams): Step {
  const id = q.get('id')
  const card = asCard(q.get('f'))
  if (id) return { kind: 'item', id, from: card ?? 'fund' }
  return card ? { kind: 'list', card } : { kind: 'hub' }
}
const stepQuery = (s: Step) => (s.kind === 'item' ? `f=${s.from}&id=${encodeURIComponent(s.id)}` : s.kind === 'list' ? `f=${s.card}` : '')
const CARD_TITLE: Record<PayrollCard, string> = { fund: 'Awaiting your action', principal: 'Awaiting Principal', statutory: 'Statutory payments' }

export default function PayrollRequestsApp({
  model,
  banks,
  today,
  search,
  can,
}: {
  model: PayrollRequestsModel
  banks: PayrollBank[]
  today: string
  search: string
  can: { fund: boolean; sendBack: boolean }
}) {
  const router = useRouter()
  const [step, open, back] = useStep(readPayrollStep, search)
  const go = (s: Step) => open(stepQuery(s))
  const backTo = () => back(step.kind === 'item' ? `f=${step.from}` : '')
  const leave = () => {
    if (canStepBack()) {
      window.history.back()
      return
    }
    setIntent('pop')
    router.replace(HUB_HREF.payments)
  }
  const byId = useMemo(() => new Map([...model.fund, ...model.principal].map((l) => [l.id, l])), [model])
  const [funding, setFunding] = useState<PayrollRequestLine | null>(null)
  const [sending, setSending] = useState<PayrollRequestLine | null>(null)
  const openVoucher = (id: string) => {
    pushIntent()
    router.push(`${HUB_HREF.payments}?id=${encodeURIComponent(id)}`)
  }

  let screen: ReactNode
  if (step.kind === 'item') {
    const r = byId.get(step.id) ?? null
    const toFund = !!r && r.remaining > 0.005
    const bar: BarButton[] = r && toFund
      ? [
          ...(can.fund ? [{ key: 'fund', label: 'Fund', kind: 'primary' as const, onClick: () => setFunding(r) }] : []),
          ...(can.sendBack && r.canSendBack ? [{ key: 'back', label: 'Send back to HR', onClick: () => setSending(r) }] : []),
        ]
      : []
    screen = (
      <AppScreen screenKey={`payroll-requests?id=${step.id}`} head={{ kind: 'back', title: r?.label ?? 'Request', backLabel: CARD_TITLE[step.from], onBack: backTo }} bar={bar}>
        <PageHead roman="I." eyebrow="Payments · Payroll Requests" title={r?.label ?? 'Request'} />
        {r ? (
          <>
            <ItemGroup
              title={toFund ? 'To fund' : 'Fully funded'}
              count=""
              items={[
                { key: 'by', label: 'Requested', sub: r.requested },
                { key: 'total', label: 'Request', value: `RM ${f2(r.amount)}` },
                ...(r.committed > 0.005 ? [{ key: 'done', label: 'Funded so far', value: `RM ${f2(r.committed)}` }] : []),
                ...(toFund ? [{ key: 'left', label: 'Still to fund', value: `RM ${f2(r.remaining)}` }] : []),
              ]}
            />
            {r.pools.length > 0 ? (
              <ItemGroup
                title="Departments"
                count={String(r.pools.length)}
                items={r.pools.map((p) => ({
                  key: p.pool_key,
                  label: p.label,
                  sub: `Balance ${f2(p.pool_balance)} · owes ${f2(p.required)}${p.committed > 0.005 ? ` · funded ${f2(p.committed)}` : ''}`,
                  value: f2(p.remaining),
                  tone: p.pool_balance < 0 ? ('out' as const) : null,
                }))}
              />
            ) : null}
            {r.pendingPvs.length > 0 ? (
              <ItemGroup
                title="Awaiting the Principal"
                count={String(r.pendingPvs.length)}
                items={r.pendingPvs.map((p) => ({ key: p.id, label: p.voucherNo, value: f2(p.amount), onOpen: () => openVoucher(p.id) }))}
              />
            ) : null}
          </>
        ) : (
          <Notice>This request is not waiting any more.</Notice>
        )}
      </AppScreen>
    )
  } else if (step.kind === 'list') {
    const card = step.card
    let body: ReactNode
    if (card === 'statutory') {
      body = model.statutory.map((p) => (
        <ItemGroup
          key={p.key}
          title={p.title}
          count={String(p.lines.length)}
          empty="Not generated yet — HR makes these on HR Costing › Payment."
          items={p.lines.map((l) => ({ key: l.id, label: l.label, sub: l.sub, value: l.value, onOpen: () => openVoucher(l.id) }))}
        />
      ))
    } else {
      const lines = card === 'fund' ? model.fund : model.principal
      body = (
        <ItemGroup
          title="Payroll Requests"
          count={String(lines.length)}
          empty={card === 'fund' ? 'All caught up.' : 'Nothing awaiting the Principal.'}
          items={lines.map((l) => ({ key: l.id, label: l.label, sub: l.sub, value: l.value, onOpen: () => go({ kind: 'item', id: l.id, from: card }) }))}
        />
      )
    }
    screen = (
      <AppScreen screenKey={`payroll-requests?f=${card}`} head={{ kind: 'back', title: CARD_TITLE[card], backLabel: 'Payroll Requests', onBack: backTo }}>
        <PageHead roman="I." eyebrow="Payments · Payroll Requests" title={CARD_TITLE[card]} />
        {body}
      </AppScreen>
    )
  } else {
    screen = (
      <AppScreen screenKey="payroll-requests" head={{ kind: 'back', title: 'Payroll Requests', backLabel: 'Payments', onBack: leave }}>
        <BankHero value={model.hero.value} label={model.hero.label} chip={model.chip} />
        <StackCards cards={model.cards} onOpen={(k) => go({ kind: 'list', card: k as PayrollCard })} />
      </AppScreen>
    )
  }

  return (
    <>
      {screen}
      <FundSheet
        request={funding}
        banks={banks}
        today={today}
        onClose={() => setFunding(null)}
        onDone={(voucherId) => {
          setFunding(null)
          flash('PV generated — with the Principal')
          router.refresh()
          openVoucher(voucherId)
        }}
      />
      <SendBackSheet
        request={sending}
        onClose={() => setSending(null)}
        onDone={(label) => {
          setSending(null)
          flash(`${label} sent back to HR`)
          router.refresh()
          backTo()
        }}
      />
    </>
  )
}
