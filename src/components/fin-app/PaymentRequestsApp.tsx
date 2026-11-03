'use client'

import { useRouter } from 'next/navigation'
import { useMemo, useState, type ReactNode } from 'react'
import { flash } from '@/components/hrv/toast'
import { HUB_HREF } from '@/lib/fin-app/routes'
import { f2, plural, rm } from '@/lib/fin-app/page-model'
import type { PayrollRequestLine } from '@/lib/fin-app/payroll-requests-model'
import { combineTag } from '@/lib/payment-requests/model'
import type { PaymentRequestsRead } from '@/app/(portal)/payments/requests/_lib/requests-read'
import { ALL_CARD, requestCards, requestHero, rowsOf, tickable, whyNot, type PaymentRequestRow } from '@/app/(portal)/payments/requests/_lib/requests-model'
import { useRequestView } from '@/app/(portal)/payments/requests/_components/RequestDrawer'
import { useRequestPvs } from '@/app/(portal)/payments/requests/_components/use-request-pvs'
import {
  FundSheet,
  RaiseSheet,
  RejectRequestSheet,
  RejectRequestsSheet,
  ReturnClaimSheet,
  SendBackSheet,
  type RaiseTarget,
} from '@/app/(portal)/payments/requests/_components/RequestSheets'
import AppScreen, { PageHead, type BarButton, type BulkBar } from './AppScreen'
import { canStepBack, pushIntent, setIntent, useStep } from './nav'
import { BankHero, ListBlock, Notice, Row, SearchRow, StackCards } from './parts'

// Payments › Payment request in the Finance phone app (2026-10-29, PR ⑥ of docs/module-spec-payment-requests.md — the
// user picked a *Requests · N* button on Payment's bar, and ticks on the phone too): the desktop's read
// (`readPaymentRequests`) in the app's kit. The hub — what waits for Finance, a card for All, Payroll, Statutory and
// every department; a card's list (search, and Select to tick the staff requests waiting for their PV — the dark bar
// then holds Reject and Create PV); a request's own screen — what the desktop's drawer shows (`useRequestView`) with its
// steps on the bar. A statutory voucher opens in the app's Payments. Every window is the desktop's, rising as a sheet.

type Step = { kind: 'hub' } | { kind: 'list'; card: string } | { kind: 'item'; key: string; from: string }

export function readPaymentRequestStep(q: URLSearchParams): Step {
  const key = q.get('id')
  const card = q.get('f')
  if (key) return { kind: 'item', key, from: card || ALL_CARD }
  return card ? { kind: 'list', card } : { kind: 'hub' }
}
const stepQuery = (s: Step) =>
  s.kind === 'item' ? `f=${encodeURIComponent(s.from)}&id=${encodeURIComponent(s.key)}` : s.kind === 'list' ? `f=${encodeURIComponent(s.card)}` : ''

export default function PaymentRequestsApp({ data, search }: { data: PaymentRequestsRead; search: string }) {
  const router = useRouter()
  const [step, open, back] = useStep(readPaymentRequestStep, search)
  const go = (s: Step) => open(stepQuery(s))
  const backTo = () => back(step.kind === 'item' ? `f=${encodeURIComponent(step.from)}` : '')
  const leave = () => {
    if (canStepBack()) {
      window.history.back()
      return
    }
    setIntent('pop')
    router.replace(HUB_HREF.payments)
  }

  const cards = useMemo(() => requestCards(data.rows, data.departments, data.seesPayroll), [data])
  const cardLabel = (card: string) => (card === ALL_CARD ? 'All requests' : (cards.find((c) => c.key === card)?.label ?? 'Requests'))
  const hero = requestHero(data.rows)
  const byKey = useMemo(() => new Map(data.rows.map((r) => [r.key, r])), [data.rows])
  const staffRequests = useMemo(() => data.rows.flatMap((r) => (r.request ? [r.request] : [])), [data.rows])

  // ── Ticks (the phone's Select, as Invoice's) ──
  const [query, setQuery] = useState('')
  const [selecting, setSelecting] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const stopSelecting = () => {
    setSelecting(false)
    setSelected(new Set())
  }

  // ── The windows ──
  const [funding, setFunding] = useState<PayrollRequestLine | null>(null)
  const [sending, setSending] = useState<PayrollRequestLine | null>(null)
  const [raising, setRaising] = useState<RaiseTarget | null>(null)
  const [returning, setReturning] = useState<{ id: string; label: string; sub: string } | null>(null)
  const [rejecting, setRejecting] = useState<{ id: string; label: string; sub: string } | null>(null)
  const [rejectingMany, setRejectingMany] = useState<Array<{ id: string; label: string }> | null>(null)
  const [stepError, setStepError] = useState<string | null>(null)

  const openVoucher = (id: string) => {
    pushIntent()
    router.push(`${HUB_HREF.payments}?id=${encodeURIComponent(id)}`)
  }
  const done = (words: string) => {
    flash(words)
    stopSelecting()
    router.refresh()
    if (step.kind === 'item') backTo()
  }
  const pvs = useRequestPvs({
    staffRequests,
    today: data.today,
    onMadeOne: (made) => {
      stopSelecting()
      router.refresh()
      openVoucher(made.id)
    },
    onMadeMany: () => {
      stopSelecting()
      router.refresh()
    },
  })

  const steps = {
    fund: (r: PaymentRequestRow) => r.payroll && setFunding(r.payroll),
    sendBack: (r: PaymentRequestRow) => r.payroll && setSending(r.payroll),
    createPv: (r: PaymentRequestRow) => setRaising({ id: r.id, label: r.from, value: f2(r.amount) }),
    returnToHr: (r: PaymentRequestRow) => setReturning({ id: r.id, label: r.from, sub: [r.ref, rm(r.amount)].filter(Boolean).join(' · ') }),
    openVoucher,
    rejectRequest: (r: PaymentRequestRow) => setRejecting({ id: r.id, label: r.ref || r.from, sub: [r.from, rm(r.amount)].join(' · ') }),
    createRequestPv: (r: PaymentRequestRow) => {
      if (!r.request) return
      setStepError(null)
      void pvs.createOne(r.request).then((why) => why && setStepError(why))
    },
  }

  // The request the item screen shows — what the desktop's drawer shows, its steps on the bar.
  const item = step.kind === 'item' ? (byKey.get(step.key) ?? null) : null
  const view = useRequestView(item, data.can, steps, stepError)

  const openRow = (r: PaymentRequestRow, from: string) => {
    setStepError(null)
    if (r.source === 'statutory' && r.voucherId) openVoucher(r.voucherId)
    else go({ kind: 'item', key: r.key, from })
  }
  const toggle = (r: PaymentRequestRow) => {
    if (!tickable(r)) return flash(whyNot(r))
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(r.key)) next.delete(r.key)
      else next.add(r.key)
      return next
    })
  }

  let screen: ReactNode
  if (step.kind === 'item') {
    const bar: BarButton[] = view.actions.map((a) => ({ key: a.key, label: a.label, kind: a.kind, onClick: a.onClick }))
    screen = (
      <AppScreen screenKey={`payment-requests?id=${step.key}`} head={{ kind: 'back', title: item?.from ?? 'Request', backLabel: cardLabel(step.from), onBack: backTo }} bar={bar}>
        <PageHead roman="I." eyebrow={`Payment request · ${cardLabel(step.from)}`} title={item?.from ?? 'Request'} />
        {item ? view.body : <Notice>This request is not waiting any more.</Notice>}
      </AppScreen>
    )
  } else if (step.kind === 'list') {
    const card = step.card
    const q = query.trim().toLowerCase()
    const rows = rowsOf(data.rows, card).filter((r) => !q || `${r.from} ${r.fromSub} ${r.what} ${r.ref} ${r.department} ${r.whoPays}`.toLowerCase().includes(q))
    const acts = data.can.pay || data.can.sendBack
    const mayTick = acts && rows.some(tickable)
    const ticked = rows.filter((r) => selected.has(r.key) && tickable(r))
    const total = rows.reduce((t, r) => t + r.amount, 0)
    const bulk: BulkBar | null =
      selecting && ticked.length > 0
        ? {
            text: `${ticked.length} selected · ${rm(ticked.reduce((t, r) => t + r.amount, 0))}`,
            sub: 'One PV a payee',
            label: data.can.pay ? (pvs.opening ? 'Reading…' : 'Create PV →') : null,
            off: pvs.opening,
            onGo: () => void pvs.createFor(ticked.flatMap((r) => (r.request ? [r.request] : []))).then((why) => why && flash(why)),
            onClear: () => setSelected(new Set()),
            alt: data.can.sendBack ? { label: 'Reject', onClick: () => setRejectingMany(ticked.map((r) => ({ id: r.id, label: r.ref ? `${r.from} (${r.ref})` : r.from }))) } : null,
          }
        : null
    screen = (
      <AppScreen
        screenKey={`payment-requests?f=${card}`}
        head={{ kind: 'back', title: cardLabel(card), backLabel: 'Payment request', onBack: backTo }}
        bulk={bulk}
      >
        <PageHead roman="I." eyebrow={`Payment request · ${cardLabel(card)}`} title={cardLabel(card)} />
        <SearchRow
          value={query}
          onChange={setQuery}
          placeholder="Search name, what, reference…"
          select={mayTick ? { on: selecting, toggle: () => (selecting ? stopSelecting() : setSelecting(true)) } : null}
        />
        <ListBlock
          title={cardLabel(card)}
          count={`${plural(rows.length, card === 'statutory' ? 'voucher' : 'request', card === 'statutory' ? 'vouchers' : 'requests')} · ${rm(total)}`}
          empty={rows.length === 0 ? (data.rows.length === 0 ? 'Nothing is waiting for Finance.' : 'No requests here.') : null}
        >
          {rows.map((r) => {
            const tag = r.request ? combineTag(staffRequests, r.request) : null
            return (
              <Row
                key={r.key}
                title={r.from}
                desc={[r.what, tag].filter(Boolean).join(' · ')}
                amount={rm(r.amount)}
                tick={selecting ? { on: selected.has(r.key), can: tickable(r) } : null}
                onClick={selecting ? () => toggle(r) : () => openRow(r, card)}
              />
            )
          })}
        </ListBlock>
      </AppScreen>
    )
  } else {
    screen = (
      <AppScreen screenKey="payment-requests" head={{ kind: 'back', title: 'Payment request', backLabel: 'Payments', onBack: leave }}>
        <BankHero value={hero.value} label={hero.label} />
        <StackCards
          cards={cards}
          onOpen={(k) => {
            stopSelecting()
            setQuery('')
            go({ kind: 'list', card: k })
          }}
        />
      </AppScreen>
    )
  }

  return (
    <>
      {screen}
      {pvs.windows}
      <FundSheet
        request={funding}
        banks={data.banks}
        today={data.today}
        onClose={() => setFunding(null)}
        onDone={(voucherId) => {
          setFunding(null)
          done('PV generated — with the Principal')
          openVoucher(voucherId)
        }}
      />
      <SendBackSheet
        request={sending}
        onClose={() => setSending(null)}
        onDone={(label) => {
          setSending(null)
          done(`${label} sent back to HR`)
        }}
      />
      <RaiseSheet
        label="Create PV"
        request={raising}
        banks={data.banks}
        onClose={() => setRaising(null)}
        onDone={() => {
          setRaising(null)
          done('PV created — with the Principal')
        }}
      />
      <ReturnClaimSheet
        claim={returning}
        onClose={() => setReturning(null)}
        onDone={() => {
          setReturning(null)
          done('Returned to HR')
        }}
      />
      <RejectRequestSheet
        request={rejecting}
        onClose={() => setRejecting(null)}
        onDone={() => {
          setRejecting(null)
          done('Rejected — back with the requester')
        }}
      />
      <RejectRequestsSheet
        requests={rejectingMany}
        onClose={() => setRejectingMany(null)}
        onPartly={() => router.refresh()}
        onDone={(n) => {
          setRejectingMany(null)
          done(`${plural(n, 'request', 'requests')} rejected — back with ${n === 1 ? 'the requester' : 'their requesters'}`)
        }}
      />
    </>
  )
}
