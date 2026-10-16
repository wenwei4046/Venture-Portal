'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState, useTransition, type ReactNode } from 'react'
import { flash } from '@/components/hrv/toast'
import { DateField } from '@/components/finv/DateField'
import { DialogButton, DialogConfirm, DialogForm, Field, FinDialog, Hint, Input } from '@/components/finv/Dialog'
import fm from '@/components/finv/form.module.css'
import { Select } from '@/components/hrv/select'
import { poolLabel, summariseRound, type RoundLine } from '@/lib/payroll-funding'
import { PAYROLL_CARDS, type PayrollCard, type PayrollRequestLine, type PayrollRequestsModel } from '@/lib/fin-app/payroll-requests-model'
import { f2 } from '@/lib/fin-app/page-model'
import { HUB_HREF } from '@/lib/fin-app/routes'
import type { PayrollBank } from '@/app/(portal)/payments/payroll-requests/_lib/payroll-read'
import { generatePvFromRequestInWords, sendBackPayrollInWords } from '@/app/(portal)/payments/payroll-requests/actions'
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

/** The desktop's default destination: the Alliance payroll account (GL 3010), else the first bank that is not the source. */
function defaultDest(banks: PayrollBank[], source: string): string {
  return banks.find((b) => b.gl_account_code === '3010')?.id ?? banks.find((b) => b.id !== source)?.id ?? ''
}

/** One funding round: the banks, the date and each department's share — the desktop form's checks, in its words. */
function FundSheet({ request, banks, today, onClose, onDone }: { request: PayrollRequestLine | null; banks: PayrollBank[]; today: string; onClose: () => void; onDone: (voucherId: string) => void }) {
  const [bankId, setBankId] = useState('')
  const [destId, setDestId] = useState('')
  const [date, setDate] = useState(today)
  const [amounts, setAmounts] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [busy, start] = useTransition()
  useEffect(() => {
    if (!request) return
    const first = banks[0]?.id ?? ''
    setBankId(first)
    setDestId(defaultDest(banks, first))
    setDate(today)
    // Each department defaults to what it still owes.
    setAmounts(Object.fromEntries(request.pools.map((p) => [p.pool_key, p.remaining.toFixed(2)])))
    setError(null)
  }, [request, banks, today])

  const lines: RoundLine[] = useMemo(
    () =>
      (request?.pools ?? []).map((p) => ({
        pool_key: p.pool_key,
        dept_name: p.dept_name,
        required: p.required,
        pool_balance: p.pool_balance,
        committed: p.committed,
        input: Number(amounts[p.pool_key] ?? '0') || 0,
      })),
    [request, amounts],
  )
  const summary = useMemo(() => summariseRound(lines, request?.amount ?? 0, request?.committed ?? 0), [lines, request])
  const source = banks.find((b) => b.id === bankId)
  const dest = banks.find((b) => b.id === destId)
  const sameBank = !!bankId && bankId === destId
  const bankShort = !!source && summary.sumInput > source.current_balance + 0.005
  const canSubmit = summary.canSubmit && !!bankId && !!destId && !bankShort && /^\d{4}-\d{2}-\d{2}$/.test(date)
  const close = () => !busy && onClose()

  const generate = () => {
    if (!request || !canSubmit) return
    setError(null)
    const sources = lines.filter((l) => l.input > 0).map((l) => ({ pool: l.pool_key, amount: Number(l.input.toFixed(2)) }))
    start(async () => {
      try {
        const res = await generatePvFromRequestInWords(request.id, bankId, destId, sources, date)
        if (!res.ok) return setError(res.reason)
        onDone(res.voucherId)
      } catch {
        setError('That did not go through. Try again.')
      }
    })
  }

  return (
    <FinDialog open={request !== null} onClose={close} title={`Fund ${request?.label ?? ''}`} sub={request ? `Still to fund · RM ${f2(request.remaining)}` : undefined} locked={busy}>
      <DialogForm
        onSubmit={generate}
        buttons={
          <>
            <DialogButton onClick={close} disabled={busy}>
              Cancel
            </DialogButton>
            <DialogButton kind="primary" type="submit" off={!canSubmit} disabled={busy}>
              {busy ? 'Generating…' : 'Generate PV'}
            </DialogButton>
          </>
        }
      >
        <div className={fm.duo}>
          <Field label="From bank" htmlFor="pr-from">
            <Select id="pr-from" round={12} className={fm.select} value={bankId} onChange={(e) => setBankId(e.target.value)}>
              {banks.length === 0 ? <option value="">No active banks</option> : null}
              {banks.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.bank_name} · RM {f2(b.current_balance)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="To bank" htmlFor="pr-to">
            <Select id="pr-to" round={12} className={fm.select} value={destId} onChange={(e) => setDestId(e.target.value)}>
              {banks.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.bank_name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Date" htmlFor="pr-date">
          <DateField id="pr-date" value={date} onChange={setDate} today={today} />
        </Field>
        {lines.map((l) => {
          const over = summary.overCommitRows.some((r) => r.pool_key === l.pool_key)
          const done = l.required - l.committed < 0.005
          return (
            <Field key={l.pool_key} label={`${poolLabel(l.pool_key, l.dept_name)} · owes ${f2(Math.max(0, l.required - l.committed))}`} htmlFor={`pr-${l.pool_key}`}>
              <Input
                id={`pr-${l.pool_key}`}
                mono
                align="right"
                inputMode="decimal"
                disabled={done}
                aria-invalid={over || undefined}
                value={amounts[l.pool_key] ?? ''}
                onChange={(e) => setAmounts((a) => ({ ...a, [l.pool_key]: e.target.value.replace(/[^\d.]/g, '') }))}
              />
            </Field>
          )
        })}
        <Hint>
          {summary.remainingAfter > 0.005 ? `After this: RM ${f2(summary.remainingAfter)} still to fund — fund the rest later.` : 'This fully funds the payroll.'}
        </Hint>
        {summary.overCommitRows.length > 0 ? (
          <Hint danger>Can’t fund more than a department still owes: {summary.overCommitRows.map((r) => poolLabel(r.pool_key, r.dept_name)).join(', ')}.</Hint>
        ) : null}
        {summary.sumInput > summary.remainingBefore + 0.005 ? (
          <Hint danger>
            This round (RM {f2(summary.sumInput)}) exceeds the outstanding RM {f2(summary.remainingBefore)}.
          </Hint>
        ) : null}
        {summary.overCommitRows.length === 0 && summary.overdrawRows.length > 0 ? (
          <Hint>{summary.overdrawRows.map((r) => poolLabel(r.pool_key, r.dept_name)).join(', ')} will go negative (预支) — allowed; billing tops the pool up later.</Hint>
        ) : null}
        {sameBank && source ? <Hint>Same bank — no real transfer; {source.bank_name}’s balance stays.</Hint> : null}
        {bankShort && source ? (
          <Hint danger>
            {source.bank_name} holds RM {f2(source.current_balance)} but this round {sameBank ? 'parks' : 'moves'} RM {f2(summary.sumInput)}
            {sameBank ? ' for payroll' : ` to ${dest?.bank_name ?? 'the destination bank'}`} — fund a smaller round now and the rest when cash arrives.
          </Hint>
        ) : null}
        {error ? <Hint danger>{error}</Hint> : null}
      </DialogForm>
    </FinDialog>
  )
}

/** Send back to HR: the request is cancelled and its accruals reversed — asked first. */
function SendBackSheet({ request, onClose, onDone }: { request: PayrollRequestLine | null; onClose: () => void; onDone: (label: string) => void }) {
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
        const res = await sendBackPayrollInWords(request.batchId, request.period)
        if (!res.ok) return setError(res.reason)
        onDone(request.label)
      } catch {
        setError('That did not go through. Try again.')
      }
    })
  }
  return (
    <FinDialog open={request !== null} onClose={close} title={`Send ${request?.label ?? 'this payroll'} back to HR?`} sub={request?.sub} locked={busy}>
      <DialogConfirm
        text="The request is cancelled, its payroll accruals reversed, and its people go back to Completed for HR to change and submit again. This cannot be undone."
        confirmLabel={busy ? 'Sending back…' : 'Send back'}
        danger
        busy={busy}
        error={error}
        onCancel={close}
        onConfirm={confirm}
      />
    </FinDialog>
  )
}
