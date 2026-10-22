'use client'

import { useEffect, useMemo, useState } from 'react'
import { DateField } from '@/components/finv/DateField'
import { DialogButton, DialogForm, Field, FinDialog, Hint, Input } from '@/components/finv/Dialog'
import { PartyInput } from '@/components/finv/PartyInput'
import { money, num, poolName } from '@/components/finv/form-words'
import fm from '@/components/finv/form.module.css'
import { Select } from '@/components/hrv/select'
import { typeLabel, type AccountType } from '@/lib/coa'
import { paymentPoolOptions } from '@/lib/payment-pools'
import { buildRepaymentSourceRows, seedRepaymentSourceRows, type RepaymentRole } from '@/lib/repayment-source-rows'
import { halfOverride, storedVoucherFields, voucherEditForm, voucherEditsNothing, type VoucherEditRow } from '@/lib/voucher-edit'
import { openVoucherEdit } from '@/app/(portal)/payments/page-actions'
import { updatePaymentVoucherInWords } from '@/app/(portal)/payments/actions'
import type { VoucherEditData } from '@/app/(portal)/payments/[id]/edit/_lib/edit-read'
import c from '@/app/(portal)/payments/_components/create.module.css'

// A voucher's Edit in the Finance phone app (2026-10-16, part E4b — the
// portal's `/payments/[id]/edit`, a sheet now): every field its form has —
// whom it pays (or is received from), the amount (fixed on a loan repayment),
// the bank and how, the date the GL posts on, a payment's lines (pool,
// account, amount, a GL override; a repayment's principal / interest /
// penalty, their accounts put back by *Reset accounts*), a receipt's pool and
// account, the description and notes. A payroll voucher whose lines are
// recorded keeps everything but its date and notes. Only what changed from
// the voucher as stored is sent (lib/voucher-edit), answered in words.

const METHODS = [
  { value: 'bank_transfer', label: 'Bank transfer' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'cash', label: 'Cash' },
  { value: 'netting', label: 'Netting / offset' },
]
const TYPE_ORDER: AccountType[] = ['expense', 'cost', 'asset', 'fixed_asset', 'liability', 'equity', 'revenue', 'other_income']
const OVERRIDE_TYPES: Array<{ value: AccountType; label: string }> = [
  { value: 'asset', label: 'BS · Asset' },
  { value: 'fixed_asset', label: 'BS · Fixed asset' },
  { value: 'liability', label: 'BS · Liability' },
  { value: 'equity', label: 'BS · Equity' },
  { value: 'revenue', label: 'P&L · Revenue' },
  { value: 'cost', label: 'P&L · Cost' },
  { value: 'other_income', label: 'P&L · Other income' },
  { value: 'expense', label: 'P&L · Expense' },
]
const ROLE_LABEL: Record<RepaymentRole, string> = { principal: 'Principal', interest: 'Interest', penalty: 'Penalty' }

type Row = VoucherEditRow & { role?: RepaymentRole; autoAccount?: boolean }

export default function VoucherEditSheet({
  voucherId,
  label,
  today,
  onClose,
  onDone,
}: {
  /** The voucher edited — open while there is one. */
  voucherId: string | null
  /** "HV-PV-…" — the title's. */
  label: string
  today: string
  onClose: () => void
  onDone: () => void
}) {
  const open = voucherId !== null
  const [read, setRead] = useState<{ id: string; data: VoucherEditData } | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    if (!voucherId || read?.id === voucherId) return
    let live = true
    setRead(null)
    setLoadError(null)
    openVoucherEdit(voucherId).then(
      (res) => {
        if (!live) return
        if (res.ok) setRead({ id: voucherId, data: res.data })
        else setLoadError(res.reason)
      },
      () => live && setLoadError('The voucher could not be read. Close and try again.'),
    )
    return () => {
      live = false
    }
  }, [voucherId, read?.id])

  return (
    <FinDialog open={open} onClose={onClose} title={`Edit ${(read?.id === voucherId ? read?.data.voucher.voucher_no : null) ?? label}`} sub={read ? (read.data.voucher.direction === 'credit' ? 'Official receipt' : 'Payment voucher') : undefined} tall>
      {read ? (
        <EditForm key={read.id} data={read.data} today={today} onClose={onClose} onDone={onDone} />
      ) : (
        <DialogForm
          buttons={
            <DialogButton disabled={false} onClick={onClose}>
              Cancel
            </DialogButton>
          }
        >
          {loadError ? <Hint danger>{loadError}</Hint> : <Hint>Reading the voucher…</Hint>}
        </DialogForm>
      )}
    </FinDialog>
  )
}

function EditForm({ data, today, onClose, onDone }: { data: VoucherEditData; today: string; onClose: () => void; onDone: () => void }) {
  const { voucher, initialSources, fundSourceAccount, initialCreditAccountCode, companies, bankAccounts, glAccounts } = data
  const debit = voucher.direction === 'debit'
  const locked = data.statutoryDetailsLocked || data.salaryDetailsLocked
  const amountLocked = !!voucher.repayment_breakdown && !!(voucher.fund_source_id || voucher.loan_id)
  const split =
    debit && voucher.fund_source_id && voucher.repayment_breakdown
      ? { principal: Number(voucher.repayment_breakdown.principal ?? 0), interest: Number(voucher.repayment_breakdown.interest ?? 0), penalty: Number(voucher.repayment_breakdown.penalty ?? 0) }
      : null
  const codes = useMemo(() => new Set(glAccounts.map((g) => g.code)), [glAccounts])
  const hasAccount = (code: string) => codes.has(code)

  // The pools: Create payment's list, and whatever pool a saved row already names.
  const pools = useMemo(() => {
    const list = paymentPoolOptions(data.extraPools)
    for (const key of [...initialSources.map((s) => s.pool), voucher.target_pool ?? '']) {
      if (key && !list.some((p) => p.value === key)) list.push({ value: key, label: key.replace(/_/g, ' ') })
    }
    return list
  }, [data.extraPools, initialSources, voucher.target_pool])
  // Header accounts (another's parent) take no postings — unless a saved line already names one.
  const accounts = useMemo(() => {
    const headers = new Set(glAccounts.map((g) => g.parent_code).filter((x): x is string => !!x))
    const keep = new Set([...initialSources.map((s) => s.account_code), initialCreditAccountCode ?? ''])
    return glAccounts.filter((g) => !headers.has(g.code) || keep.has(g.code))
  }, [glAccounts, initialSources, initialCreditAccountCode])

  const stored = storedVoucherFields(voucher, initialSources, initialCreditAccountCode)
  const [amount, setAmount] = useState(voucher.amount.toFixed(2))
  const [payee, setPayee] = useState(voucher.payee_name)
  const [companyId, setCompanyId] = useState(voucher.payee_company_id ?? '')
  const [bankId, setBankId] = useState(voucher.bank_account_id ?? '')
  const [method, setMethod] = useState(voucher.payment_method ?? 'bank_transfer')
  // A voucher saved without a date opens on today, so the hole is not saved back.
  const [date, setDate] = useState(voucher.payment_date ?? today)
  const [desc, setDesc] = useState(voucher.description)
  const [notes, setNotes] = useState(voucher.notes ?? '')
  const [pool, setPool] = useState(voucher.target_pool ?? '')
  const [account, setAccount] = useState(initialCreditAccountCode ?? '')
  const [rows, setRows] = useState<Row[]>(() =>
    split ? seedRepaymentSourceRows(initialSources, split, fundSourceAccount, hasAccount) : initialSources.length > 0 ? initialSources : [{ pool: '', amount: '', account_code: '' }],
  )
  const [overrides, setOverrides] = useState<boolean[]>(() => rows.map((r) => !!r.override_account_type))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const setRow = (i: number, patch: Partial<Row>) => {
    setError(null)
    setRows((prev) => prev.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  }
  const toggleOverride = (i: number) => {
    const on = !overrides[i]
    setOverrides((prev) => prev.map((v, j) => (j === i ? on : v)))
    const acct = glAccounts.find((g) => g.code === rows[i].account_code)
    setRow(i, on ? { override_account_type: acct?.type ?? 'expense', override_gl_account_code: acct?.code ?? '', override_reason: '' } : { override_account_type: '', override_gl_account_code: '', override_reason: '' })
  }

  const total = num(amount)
  const lineSum = Math.round(rows.reduce((s, r) => s + num(r.amount), 0) * 100) / 100
  const offBy = debit && total > 0 ? Math.round((total - lineSum) * 100) / 100 : 0
  const now = { amount, payeeName: payee, payeeCompanyId: companyId, bankAccountId: bankId, description: desc, paymentMethod: method, paymentDate: date, notes, targetPool: pool, accountCode: account, rows }
  const sent = locked ? voucherEditForm(voucher.id, voucher.direction, stored, { ...stored, paymentDate: date, notes }) : voucherEditForm(voucher.id, voucher.direction, stored, now)
  const half = debit && !locked ? halfOverride(rows) : null
  const problem = !date
    ? 'Pick the payment date.'
    : locked
      ? null
      : !(total > 0)
        ? 'An amount is needed.'
        : !payee.trim() && !companyId
          ? 'Say whom it is.'
          : !desc.trim()
            ? 'A description is needed.'
            : debit && !bankId
              ? 'A payment needs the bank it goes from.'
              : debit && Math.abs(offBy) > 0.005
                ? `The lines come to RM ${money(lineSum)} — RM ${money(Math.abs(offBy))} ${offBy > 0 ? 'short of' : 'over'} the amount.`
                : half !== null
                  ? `Line ${half + 1}: an override needs its type, its GL and the reason — or none of them.`
                  : !debit && !pool
                    ? 'Pick the pool it is received into.'
                    : null
  const nothing = voucherEditsNothing(sent)

  const save = async () => {
    if (problem || nothing || busy) return
    setBusy(true)
    setError(null)
    try {
      const res = await updatePaymentVoucherInWords(sent)
      if (!res.ok) {
        setError(res.reason)
        return
      }
      onClose()
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The voucher could not be saved.')
    } finally {
      setBusy(false)
    }
  }

  const accountOptions = TYPE_ORDER.map((t) => {
    const of = accounts.filter((a) => a.type === t)
    return of.length === 0 ? null : (
      <optgroup key={t} label={typeLabel(t)}>
        {of.map((a) => (
          <option key={a.code} value={a.code} data-search={a.code}>
            {`${a.code} · ${a.name}`}
          </option>
        ))}
      </optgroup>
    )
  })
  const poolOptions = pools.map((p) => (
    <option key={p.value} value={p.value}>
      {poolName(p.label)}
    </option>
  ))
  const buttons = (
    <>
      <DialogButton disabled={busy} onClick={onClose}>
        Cancel
      </DialogButton>
      <DialogButton kind="primary" off={!!problem || nothing} disabled={busy} onClick={() => void save()}>
        {busy ? 'Saving…' : locked ? 'Save date and notes' : 'Save changes'}
      </DialogButton>
    </>
  )

  if (locked) {
    const bank = bankAccounts.find((b) => b.id === voucher.bank_account_id)
    return (
      <DialogForm onSubmit={() => void save()} buttons={buttons}>
        <div className={fm.summary}>
          <div className={fm.summaryRow} data-head="true">
            <span className={fm.summaryLabel}>{data.salaryDetailsLocked ? 'Recorded salary payments' : 'Recorded statutory contributions'}</span>
            <span className={fm.summaryValue}>fixed</span>
          </div>
          <div className={fm.summaryRow}>
            <span className={fm.summaryLabel}>Pay to</span>
            <span className={fm.summaryValue}>{voucher.payee_name}</span>
          </div>
          <div className={fm.summaryRow}>
            <span className={fm.summaryLabel}>Pay from</span>
            <span className={fm.summaryValue}>{bank ? `${bank.bank_name} · ${bank.account_number}` : 'Recorded on voucher'}</span>
          </div>
          {initialSources.map((s, i) => (
            <div key={i} className={fm.summaryRow}>
              <span className={fm.summaryLabel}>{`${poolName(pools.find((p) => p.value === s.pool)?.label ?? s.pool)} · ${s.account_code}`}</span>
              <span className={fm.summaryValue}>{money(Number(s.amount))}</span>
            </div>
          ))}
          <div className={fm.summaryTotal}>
            <span className={fm.summaryTotalLabel}>Amount</span>
            <span className={fm.summaryTotalValue}>RM {money(voucher.amount)}</span>
          </div>
        </div>
        <Field label="Payment date">
          <DateField value={date} onChange={setDate} today={today} label="Payment date" />
        </Field>
        <Field label="Notes" htmlFor="ve-notes">
          <Input id="ve-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        {error ? <Hint danger>{error}</Hint> : null}
      </DialogForm>
    )
  }

  return (
    <DialogForm onSubmit={() => void save()} buttons={buttons}>
      <Field label={debit ? 'Pay to' : 'Received from'} htmlFor="ve-payee">
        <PartyInput
          id="ve-payee"
          placeholder="Payee name"
          value={payee}
          companies={companies}
          companyId={companyId}
          onChange={(name, id) => {
            setError(null)
            setPayee(name)
            setCompanyId(id)
          }}
        />
      </Field>
      <Field label="Amount RM" htmlFor="ve-amount">
        <Input id="ve-amount" mono align="right" inputMode="decimal" value={amount} readOnly={amountLocked} className={amountLocked ? fm.fixed : undefined} onChange={(e) => setAmount(e.target.value)} />
      </Field>

      {debit ? (
        <Field label={split ? 'Lines' : 'Deduct from pools'}>
          <div className={fm.lines}>
            {rows.map((r, i) => (
              <div key={i} className={fm.lineWrap}>
                <div className={c.line} data-repay={r.role ? 'true' : undefined}>
                  {r.role ? <span className={c.role}>{ROLE_LABEL[r.role]}</span> : null}
                  <Select round={12} className={fm.lineSelect} value={r.pool} onChange={(e) => setRow(i, { pool: e.target.value })} aria-label={`Line ${i + 1} pool`}>
                    <option value="">Pool</option>
                    {poolOptions}
                  </Select>
                  <Select round={12} className={fm.lineSelect} value={r.account_code} onChange={(e) => setRow(i, { account_code: e.target.value, autoAccount: false })} aria-label={`Line ${i + 1} account`}>
                    <option value="">Account</option>
                    {accountOptions}
                  </Select>
                  <input className={fm.lineAmount} inputMode="decimal" value={r.amount} readOnly={!!r.role} onChange={(e) => setRow(i, { amount: e.target.value })} placeholder="0.00" aria-label={`Line ${i + 1} amount`} />
                  {r.role ? null : rows.length > 1 ? (
                    <button
                      type="button"
                      className={fm.remove}
                      onClick={() => {
                        setRows((prev) => prev.filter((_, j) => j !== i))
                        setOverrides((prev) => prev.filter((_, j) => j !== i))
                      }}
                      aria-label={`Remove line ${i + 1}`}
                    >
                      ×
                    </button>
                  ) : (
                    <span />
                  )}
                </div>
                <div className={c.wordsUnder}>
                  <input
                    className={fm.lineText}
                    value={r.description ?? ''}
                    onChange={(e) => setRow(i, { description: e.target.value })}
                    placeholder="What this line is for"
                    aria-label={`Line ${i + 1} description`}
                  />
                </div>
                {overrides[i] ? (
                  <div className={c.override}>
                    <Select
                      round={12}
                      className={fm.lineSelect}
                      value={r.override_account_type ?? ''}
                      onChange={(e) => setRow(i, { override_account_type: e.target.value, override_gl_account_code: '' })}
                      aria-label={`Line ${i + 1} override type`}
                    >
                      {OVERRIDE_TYPES.map((t) => (
                        <option key={t.value} value={t.value}>
                          {t.label}
                        </option>
                      ))}
                    </Select>
                    <Select round={12} className={fm.lineSelect} value={r.override_gl_account_code ?? ''} onChange={(e) => setRow(i, { override_gl_account_code: e.target.value })} aria-label={`Line ${i + 1} override GL`}>
                      <option value="">GL account</option>
                      {glAccounts
                        .filter((g) => g.type === r.override_account_type)
                        .map((g) => (
                          <option key={g.code} value={g.code} data-search={g.code}>
                            {`${g.code} · ${g.name}`}
                          </option>
                        ))}
                    </Select>
                    <input className={fm.lineText} value={r.override_reason ?? ''} onChange={(e) => setRow(i, { override_reason: e.target.value })} placeholder="Reason" aria-label={`Line ${i + 1} override reason`} />
                  </div>
                ) : null}
              </div>
            ))}
            <div className={fm.linesFoot}>
              {split ? (
                <button
                  type="button"
                  className={fm.addLine}
                  onClick={() => setRows((prev) => buildRepaymentSourceRows(prev.map((r) => ({ ...r, autoAccount: true })), split, fundSourceAccount, hasAccount))}
                >
                  Reset accounts
                </button>
              ) : (
                <button
                  type="button"
                  className={fm.addLine}
                  onClick={() => {
                    setRows((prev) => [...prev, { pool: '', amount: '', account_code: '' }])
                    setOverrides((prev) => [...prev, false])
                  }}
                >
                  + Add line
                </button>
              )}
              <span className={fm.linesTotal} data-off={Math.abs(offBy) > 0.005 ? 'true' : undefined}>
                RM {money(lineSum)}
              </span>
            </div>
          </div>
        </Field>
      ) : (
        <div className={fm.duo}>
          <Field label="Into pool" htmlFor="ve-pool">
            <Select id="ve-pool" round={12} className={fm.select} value={pool} onChange={(e) => setPool(e.target.value)}>
              <option value="">Choose a pool</option>
              {poolOptions}
            </Select>
          </Field>
          <Field label="Account" htmlFor="ve-account">
            <Select id="ve-account" round={12} className={fm.select} value={account} onChange={(e) => setAccount(e.target.value)}>
              <option value="">Choose an account</option>
              {accountOptions}
            </Select>
          </Field>
        </div>
      )}

      <div className={fm.duo}>
        <Field label={debit ? 'From bank' : 'Into bank'} htmlFor="ve-bank">
          <Select id="ve-bank" round={12} className={fm.select} value={bankId} onChange={(e) => setBankId(e.target.value)}>
            <option value="">—</option>
            {bankAccounts.map((b) => (
              <option key={b.id} value={b.id}>
                {`${b.bank_name} — ${b.account_number}`}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Method" htmlFor="ve-method">
          <Select id="ve-method" round={12} className={fm.select} value={method} onChange={(e) => setMethod(e.target.value)}>
            {METHODS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="Payment date">
        <DateField value={date} onChange={setDate} today={today} label="Payment date" />
      </Field>
      <Field label="Description" htmlFor="ve-desc">
        <Input id="ve-desc" value={desc} onChange={(e) => setDesc(e.target.value)} />
      </Field>
      <Field label="Notes" htmlFor="ve-notes">
        <Input id="ve-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="For Finance only" />
      </Field>
      {debit ? (
        <div className={fm.more} role="group" aria-label="GL override">
          {rows.map((r, i) =>
            r.account_code ? (
              <button key={i} type="button" className={fm.moreBtn} aria-pressed={!!overrides[i]} onClick={() => toggleOverride(i)}>
                {rows.length > 1 ? `Override line ${i + 1}` : 'GL override'}
              </button>
            ) : null,
          )}
        </div>
      ) : null}
      {error ? <Hint danger>{error}</Hint> : problem ? <Hint>{problem}</Hint> : null}
    </DialogForm>
  )
}
