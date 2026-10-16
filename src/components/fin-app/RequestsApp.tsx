'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState, useTransition, type ReactNode } from 'react'
import { flash } from '@/components/hrv/toast'
import { DialogButton, DialogConfirm, DialogForm, Field, FinDialog, Hint } from '@/components/finv/Dialog'
import fm from '@/components/finv/form.module.css'
import { Select } from '@/components/hrv/select'
import { CLAIM_PAYMENT_METHODS } from '@/lib/claim-requests'
import { REQUEST_CARDS, bankOption, type RequestCard, type RequestLine, type RequestsModel } from '@/lib/fin-app/requests-model'
import { HUB_HREF } from '@/lib/fin-app/routes'
import { raiseClaimVoucher } from '@/app/(portal)/payments/claim-requests/actions'
import { cancelDeptRequestInWords, generateDeptRequestPvInWords } from '@/app/(portal)/payments/dept-requests/actions'
import AppScreen, { PageHead, type BarButton } from './AppScreen'
import { canStepBack, pushIntent, setIntent, useStep } from './nav'
import { BankHero, ItemGroup, Notice, StackCards } from './parts'

// Payments' request queues in the Finance phone app (2026-10-16, part E4):
// Claim requests and Dept Payment Requests — what waits for Finance's voucher
// and what is with the Principal, a request its own screen. *Raise voucher* /
// *Generate PV* is the desktop's form in the kit's sheet (the bank it pays
// from, how); a Dept request's *Cancel request* refunds the pool it reserved
// and voids a pending voucher — one way, so it asks first. A voucher already
// raised opens in the app's Payments. Each write is the page's own action,
// answered in words.

export type RequestsKind = 'claim' | 'dept'

type Step = { kind: 'hub' } | { kind: 'list'; card: RequestCard } | { kind: 'item'; id: string; from: RequestCard }

const asCard = (v: string | null): RequestCard | null => (v && (REQUEST_CARDS as readonly string[]).includes(v) ? (v as RequestCard) : null)
export function readRequestStep(q: URLSearchParams): Step {
  const id = q.get('id')
  const card = asCard(q.get('f'))
  if (id) return { kind: 'item', id, from: card ?? 'waiting' }
  return card ? { kind: 'list', card } : { kind: 'hub' }
}
const stepQuery = (s: Step) => (s.kind === 'item' ? `f=${s.from}&id=${encodeURIComponent(s.id)}` : s.kind === 'list' ? `f=${s.card}` : '')

const TITLE: Record<RequestsKind, string> = { claim: 'Claim requests', dept: 'Dept Payment Requests' }
const CARD_TITLE: Record<RequestCard, string> = { waiting: 'Waiting for a voucher', principal: 'With the Principal' }
const DEPT_METHODS = [
  { value: 'bank_transfer', label: 'Bank transfer' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'cash', label: 'Cash' },
]

export default function RequestsApp({
  kind,
  model,
  banks,
  search,
  can,
}: {
  kind: RequestsKind
  model: RequestsModel
  banks: Array<{ id: string; bank_name: string; current_balance: number }>
  search: string
  can: { raise: boolean; cancel: boolean }
}) {
  const router = useRouter()
  const [step, open, back] = useStep(readRequestStep, search)
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
  const byId = useMemo(() => new Map([...model.waiting, ...model.principal].map((l) => [l.id, l])), [model])
  const [raising, setRaising] = useState<RequestLine | null>(null)
  const [cancelling, setCancelling] = useState<RequestLine | null>(null)
  const openVoucher = (id: string) => {
    pushIntent()
    router.push(`${HUB_HREF.payments}?id=${encodeURIComponent(id)}`)
  }
  const done = (words: string) => {
    flash(words)
    router.refresh()
    if (step.kind === 'item') backTo()
  }

  const title = TITLE[kind]
  let screen: ReactNode
  if (step.kind === 'item') {
    const r = byId.get(step.id) ?? null
    const waiting = !!r && model.waiting.some((x) => x.id === r.id)
    const bar: BarButton[] = r
      ? waiting
        ? [
            ...(can.raise ? [{ key: 'raise', label: kind === 'claim' ? 'Raise voucher' : 'Generate PV', kind: 'primary' as const, onClick: () => setRaising(r) }] : []),
            ...(kind === 'dept' && can.cancel ? [{ key: 'cancel', label: 'Cancel request', onClick: () => setCancelling(r) }] : []),
          ]
        : r.voucherId
          ? [{ key: 'voucher', label: 'Open voucher', kind: 'primary' as const, onClick: () => openVoucher(r.voucherId!) }]
          : []
      : []
    screen = (
      <AppScreen screenKey={`requests?id=${step.id}`} head={{ kind: 'back', title: r?.label ?? 'Request', backLabel: CARD_TITLE[step.from], onBack: backTo }} bar={bar}>
        <PageHead roman="I." eyebrow={`Payments · ${title}`} title={r?.label ?? 'Request'} />
        {r ? <ItemGroup title={CARD_TITLE[waiting ? 'waiting' : 'principal']} count="" items={r.facts} /> : <Notice>This request is not waiting any more.</Notice>}
      </AppScreen>
    )
  } else if (step.kind === 'list') {
    const card = step.card
    const lines = card === 'waiting' ? model.waiting : model.principal
    screen = (
      <AppScreen screenKey={`requests?f=${card}`} head={{ kind: 'back', title: CARD_TITLE[card], backLabel: title, onBack: backTo }}>
        <PageHead roman="I." eyebrow={`Payments · ${title}`} title={CARD_TITLE[card]} />
        <ItemGroup
          title={title}
          count={String(lines.length)}
          empty={card === 'waiting' ? 'Nothing waiting.' : 'Nothing with the Principal.'}
          items={lines.map((l) => ({ key: l.id, label: l.label, sub: l.sub, value: l.value, onOpen: () => go({ kind: 'item', id: l.id, from: card }) }))}
        />
      </AppScreen>
    )
  } else {
    screen = (
      <AppScreen screenKey={`requests-${kind}`} head={{ kind: 'back', title, backLabel: 'Payments', onBack: leave }}>
        <BankHero value={model.hero.value} label={model.hero.label} chip={model.chip} />
        <StackCards cards={model.cards} onOpen={(k) => go({ kind: 'list', card: k as RequestCard })} />
      </AppScreen>
    )
  }

  return (
    <>
      {screen}
      <RaiseSheet
        kind={kind}
        request={raising}
        banks={banks}
        onClose={() => setRaising(null)}
        onDone={() => {
          setRaising(null)
          done(kind === 'claim' ? 'Voucher raised — with the Principal' : 'PV generated — with the Principal')
        }}
      />
      <CancelSheet
        request={cancelling}
        onClose={() => setCancelling(null)}
        onDone={() => {
          setCancelling(null)
          done('Request cancelled — the pool is refunded')
        }}
      />
    </>
  )
}

/** The voucher for one request: the bank it is paid from and how, then the Principal's queue. */
function RaiseSheet({
  kind,
  request,
  banks,
  onClose,
  onDone,
}: {
  kind: RequestsKind
  request: RequestLine | null
  banks: Array<{ id: string; bank_name: string; current_balance: number }>
  onClose: () => void
  onDone: () => void
}) {
  const [bankId, setBankId] = useState('')
  const [method, setMethod] = useState('bank_transfer')
  const [error, setError] = useState<string | null>(null)
  const [busy, start] = useTransition()
  useEffect(() => {
    if (!request) return
    setBankId('')
    setMethod('bank_transfer')
    setError(null)
  }, [request])
  const close = () => !busy && onClose()
  const methods = kind === 'claim' ? CLAIM_PAYMENT_METHODS : DEPT_METHODS
  const raise = () => {
    if (!request) return
    if (!bankId) return setError('Choose the bank account to pay from.')
    setError(null)
    start(async () => {
      try {
        const res =
          kind === 'claim'
            ? await raiseClaimVoucher({ claimId: request.id, bankId, method })
            : await generateDeptRequestPvInWords({ requestId: request.id, payFromAccountId: bankId, paymentMethod: method })
        if (!res.ok) return setError(res.reason)
        onDone()
      } catch {
        setError('That did not go through. Try again.')
      }
    })
  }
  const label = kind === 'claim' ? 'Raise voucher' : 'Generate PV'
  return (
    <FinDialog open={request !== null} onClose={close} title={`${label} · ${request?.label ?? ''}`} sub={request ? `RM ${request.value}` : undefined} locked={busy}>
      <DialogForm
        onSubmit={raise}
        buttons={
          <>
            <DialogButton onClick={close} disabled={busy}>
              Cancel
            </DialogButton>
            <DialogButton kind="primary" type="submit" off={!bankId} disabled={busy}>
              {busy ? (kind === 'claim' ? 'Raising…' : 'Generating…') : label}
            </DialogButton>
          </>
        }
      >
        <Field label="Pay from" htmlFor="req-bank">
          <Select id="req-bank" round={12} className={fm.select} value={bankId} onChange={(e) => setBankId(e.target.value)}>
            <option value="">— Pay from —</option>
            {banks.map((b) => (
              <option key={b.id} value={b.id}>
                {bankOption(b)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Method" htmlFor="req-method">
          <Select id="req-method" round={12} className={fm.select} value={method} onChange={(e) => setMethod(e.target.value)}>
            {methods.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </Select>
        </Field>
        {error ? <Hint danger>{error}</Hint> : null}
      </DialogForm>
    </FinDialog>
  )
}

/** Cancel a Dept request: the pool it reserved is refunded, a pending voucher voided — asked first. */
function CancelSheet({ request, onClose, onDone }: { request: RequestLine | null; onClose: () => void; onDone: () => void }) {
  const [error, setError] = useState<string | null>(null)
  const [busy, start] = useTransition()
  useEffect(() => {
    if (request) setError(null)
  }, [request])
  const close = () => !busy && onClose()
  const confirm = () => {
    if (!request) return
    setError(null)
    start(async () => {
      try {
        const res = await cancelDeptRequestInWords(request.id, 'Cancelled by Finance from the phone app')
        if (!res.ok) return setError(res.reason)
        onDone()
      } catch {
        setError('That did not go through. Try again.')
      }
    })
  }
  return (
    <FinDialog open={request !== null} onClose={close} title={`Cancel ${request?.label ?? 'this request'}?`} sub={request ? `RM ${request.value}` : undefined} locked={busy}>
      <DialogConfirm
        text="The pool it reserved is refunded and a pending voucher voided. This cannot be undone."
        confirmLabel={busy ? 'Cancelling…' : 'Cancel request'}
        danger
        busy={busy}
        error={error}
        onCancel={close}
        onConfirm={confirm}
      />
    </FinDialog>
  )
}
