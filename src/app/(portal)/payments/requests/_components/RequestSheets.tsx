'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { DateField } from '@/components/finv/DateField'
import { DialogButton, DialogConfirm, DialogForm, Field, FinDialog, Hint, Input, TextArea } from '@/components/finv/Dialog'
import fm from '@/components/finv/form.module.css'
import { Select } from '@/components/hrv/select'
import { CLAIM_PAYMENT_METHODS } from '@/lib/claim-requests'
import { poolLabel, summariseRound, type RoundLine } from '@/lib/payroll-funding'
import type { PayrollRequestLine } from '@/lib/fin-app/payroll-requests-model'
import { f2 } from '@/lib/fin-app/page-model'
import { bankOption } from '@/lib/fin-app/requests-model'
import type { PayrollBank } from '@/app/(portal)/payments/payroll-requests/_lib/payroll-read'
import { generatePvFromRequestInWords, sendBackPayrollInWords } from '@/app/(portal)/payments/payroll-requests/actions'
import { raiseClaimVoucher } from '@/app/(portal)/payments/claim-requests/actions'
import { generateDeptRequestPvInWords } from '@/app/(portal)/payments/dept-requests/actions'
import { returnMemberClaim } from '../actions'

// The windows a request is worked in (2026-10-29 — Payments › Payment request, and the Finance phone app's request
// pages, which drew them first, 2026-10-16): a payroll's funding round and its send back to HR, a claim's voucher,
// and a member's claim returned to HR. Each write is its page's own action, answered in words.

/** The desktop's default destination: the Alliance payroll account (GL 3010), else the first bank that is not the source. */
export function defaultDest(banks: PayrollBank[], source: string): string {
  return banks.find((b) => b.gl_account_code === '3010')?.id ?? banks.find((b) => b.id !== source)?.id ?? ''
}

/** One funding round: the banks, the date and each department's share — the desktop form's checks, in its words. */
export function FundSheet({ request, banks, today, onClose, onDone }: { request: PayrollRequestLine | null; banks: PayrollBank[]; today: string; onClose: () => void; onDone: (voucherId: string) => void }) {
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
export function SendBackSheet({ request, onClose, onDone }: { request: PayrollRequestLine | null; onClose: () => void; onDone: (label: string) => void }) {
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

const DEPT_METHODS = [
  { value: 'bank_transfer', label: 'Bank transfer' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'cash', label: 'Cash' },
]

const BUSY_WORD: Record<string, string> = { 'Raise voucher': 'Raising…', 'Generate PV': 'Generating…' }

/** What a voucher is raised for: the request, its name and its amount as the list shows them. */
export interface RaiseTarget {
  id: string
  label: string
  value: string
}

/** The voucher for one request: the bank it is paid from and how, then the Principal's queue. */
export function RaiseSheet({
  kind,
  request,
  banks,
  label = kind === 'claim' ? 'Raise voucher' : 'Generate PV',
  onClose,
  onDone,
}: {
  kind: 'claim' | 'dept'
  request: RaiseTarget | null
  banks: Array<{ id: string; bank_name: string; current_balance: number }>
  /** The window's word for it — Payment request says *Create PV*. */
  label?: string
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
              {busy ? (BUSY_WORD[label] ?? 'Creating…') : label}
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

/**
 * Return to HR (2026-10-29): a member's claim HR approved for payment goes back to HR's Member services, with the
 * reason — HR's to read, not the member's ("HR sees it (not LUCAS)").
 */
export function ReturnClaimSheet({ claim, onClose, onDone }: { claim: { id: string; label: string; sub: string } | null; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, start] = useTransition()
  useEffect(() => {
    if (!claim) return
    setReason('')
    setError(null)
  }, [claim])
  const close = () => !busy && onClose()
  const confirm = () => {
    if (!claim) return
    if (!reason.trim()) return setError('Say why the claim goes back to HR.')
    setError(null)
    start(async () => {
      try {
        const res = await returnMemberClaim(claim.id, reason)
        if (!res.ok) return setError(res.reason)
        onDone()
      } catch {
        setError('That did not go through. Try again.')
      }
    })
  }
  return (
    <FinDialog open={claim !== null} onClose={close} title={`Return ${claim?.label ?? 'this claim'} to HR?`} sub={claim?.sub} locked={busy}>
      <DialogConfirm
        text="The claim goes back to HR’s Member services to decide again — approve, reject, or ask the member. HR sees your reason; the member does not."
        confirmLabel={busy ? 'Returning…' : 'Return to HR'}
        danger
        busy={busy}
        off={!reason.trim()}
        error={error}
        onCancel={close}
        onConfirm={confirm}
      >
        <TextArea
          rows={3}
          value={reason}
          onChange={(e) => {
            setReason(e.target.value)
            if (e.target.value.trim()) setError(null)
          }}
          placeholder="Reason (required) — HR sees it"
          aria-label="Reason"
          maxLength={500}
        />
      </DialogConfirm>
    </FinDialog>
  )
}
