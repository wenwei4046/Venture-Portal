'use client'

import { useEffect, useMemo, useState } from 'react'
import { DateField } from '@/components/finv/DateField'
import { DialogButton, DialogForm, Field, FinDialog, Hint, Input } from '@/components/finv/Dialog'
import fm from '@/components/finv/form.module.css'
import { Select } from '@/components/hrv/select'
import { typeLabel, type AccountType } from '@/lib/coa'
import { jvCheck, jvState, segmentChoices, type ExtraSegments, type JvLineDraft } from '@/lib/fin-app/journal-model'
import { postJournalVoucherInWords, saveJournalVoucherInWords } from '@/app/(portal)/reconciliation/journal-entries/actions'
import { openJournalSheet } from '@/app/(portal)/reconciliation/journal-entries/page-actions'
import type { JvAccount } from '@/app/(portal)/reconciliation/journal-entries/_lib/jv-read'

// A journal voucher on the phone (2026-10-15, part 5c): the desktop voucher
// form's fields and rule — Date, Description, Segment, at least two lines each
// an account and a debit or a credit, debits equal to credits — in the kit's
// sheet: a line is its account over its debit and credit, its note under them.
// New, a copy (the source's words and lines, dated today) or an edit. The
// accounts are read when the sheet opens; posting is the voucher page's own
// RPC, answered in words.

const TYPE_ORDER: AccountType[] = ['asset', 'fixed_asset', 'liability', 'equity', 'revenue', 'cost', 'other_income', 'expense']

let seq = 0
const blank = (): JvLineDraft => ({ key: `jv${++seq}`, account: '', debit: '', credit: '', note: '' })
const draftOf = (l: { account_code: string; debit: number | null; credit: number | null; description: string | null }): JvLineDraft => ({
  key: `jv${++seq}`,
  account: l.account_code,
  debit: l.debit ? String(l.debit) : '',
  credit: l.credit ? String(l.credit) : '',
  note: l.description ?? '',
})

export interface JvSheetSeed {
  mode: 'new' | 'copy' | 'edit'
  /** Edit: the voucher. Copy: the voucher copied (its words and lines are read with the accounts). */
  id?: string
  /** Edit: its number, under the sheet's title. */
  no?: string
  date?: string
  description?: string
  segment?: string
  lines?: Array<{ account_code: string; debit: number | null; credit: number | null; description: string | null }>
}

export default function JournalVoucherSheet({
  seed,
  today,
  extraSegments = [],
  onClose,
  onDone,
}: {
  seed: JvSheetSeed | null
  today: string
  /** The registry's departments (a voucher of IT posts to IT). */
  extraSegments?: ExtraSegments
  onClose: () => void
  onDone: (id: string, said: string) => void
}) {
  const [accounts, setAccounts] = useState<JvAccount[] | null>(null)
  const [readError, setReadError] = useState<string | null>(null)
  const [date, setDate] = useState(today)
  const [description, setDescription] = useState('')
  const [segment, setSegment] = useState('unallocated')
  const [lines, setLines] = useState<JvLineDraft[]>([blank(), blank()])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [tried, setTried] = useState(false)

  // Opened: the accounts (and a copy's source) are read now, never with every visit to the page.
  useEffect(() => {
    if (!seed) return
    setError(null)
    setTried(false)
    setReadError(null)
    setDate(seed.mode === 'edit' && seed.date ? seed.date : today)
    setDescription(seed.description ?? '')
    setSegment(seed.segment ?? 'unallocated')
    setLines(seed.lines && seed.lines.length > 0 ? seed.lines.map(draftOf) : [blank(), blank()])
    let live = true
    void openJournalSheet(seed.mode === 'copy' && seed.id ? seed.id : null).then(
      (res) => {
        if (!live) return
        if (!res.ok) return setReadError(res.reason)
        setAccounts(res.accounts)
        if (res.prefill) {
          setDescription(res.prefill.description)
          setSegment(res.prefill.segment)
          setLines(res.prefill.lines.length > 0 ? res.prefill.lines.map(draftOf) : [blank(), blank()])
        }
      },
      () => live && setReadError('The accounts could not be read just now. Try again.'),
    )
    return () => {
      live = false
    }
  }, [seed, today])

  // Only the accounts that take postings: a header (another account's parent) is no line's account.
  const leaves = useMemo(() => {
    if (!accounts) return []
    const parents = new Set(accounts.map((a) => a.parent_code).filter(Boolean))
    return accounts.filter((a) => !parents.has(a.code))
  }, [accounts])
  const options = TYPE_ORDER.map((t) => {
    const of = leaves.filter((a) => a.type === t)
    return of.length === 0 ? null : (
      <optgroup key={t} label={typeLabel(t)}>
        {of.map((a) => (
          <option key={a.code} value={a.code} data-search={a.code}>
            {a.code} · {a.name}
          </option>
        ))}
      </optgroup>
    )
  })

  const check = jvCheck(description, lines)
  const set = (key: string, patch: Partial<JvLineDraft>) => setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)))

  const post = async () => {
    setTried(true)
    if (!seed || !check.ok || busy) return
    setBusy(true)
    setError(null)
    const input = {
      transaction_date: date,
      description: description.trim(),
      segment,
      lines: check.filled.map((l) => ({ account_code: l.account, debit: parseFloat(l.debit) || 0, credit: parseFloat(l.credit) || 0, description: l.note.trim() || undefined })),
    }
    try {
      const res = seed.mode === 'edit' && seed.id ? await saveJournalVoucherInWords(seed.id, input) : await postJournalVoucherInWords(input)
      if (!res.ok) return setError(res.reason)
      onDone(res.id, seed.mode === 'edit' ? 'Voucher saved' : 'Voucher posted')
    } catch {
      setError('That did not go through. Try again.')
    } finally {
      setBusy(false)
    }
  }

  const title = seed?.mode === 'edit' ? 'Edit voucher' : seed?.mode === 'copy' ? 'Copy voucher' : 'New journal voucher'
  return (
    <FinDialog open={!!seed} onClose={onClose} title={title} sub={seed?.mode === 'edit' ? seed.no : 'Manual journal voucher'} locked={busy} tall>
      <DialogForm
        onSubmit={post}
        buttons={
          <>
            <DialogButton onClick={onClose} disabled={busy}>
              Cancel
            </DialogButton>
            <DialogButton type="submit" kind="primary" off={!check.ok} disabled={busy}>
              {busy ? 'Saving…' : seed?.mode === 'edit' ? 'Save changes' : 'Post entry'}
            </DialogButton>
          </>
        }
      >
        <Field label="Date" htmlFor="jv-date">
          <DateField id="jv-date" value={date} onChange={setDate} today={today} />
        </Field>
        <Field label="Description" htmlFor="jv-desc">
          <Input id="jv-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Reclassify prepaid insurance to expense" />
        </Field>
        <Field label="Segment" htmlFor="jv-seg">
          <Select id="jv-seg" round={12} className={fm.select} value={segment} onChange={(e) => setSegment(e.target.value)}>
            {segmentChoices(extraSegments, segment).map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Lines">
          <div className={fm.lines}>
            {lines.map((l, i) => (
              <div key={l.key} className={fm.lineWrap}>
                <div className={fm.lineRow} data-shape="jv-account">
                  <Select round={12} className={fm.lineSelect} value={l.account} onChange={(e) => set(l.key, { account: e.target.value })} aria-label={`Line ${i + 1} account`}>
                    <option value="">{accounts ? 'Account' : 'Reading accounts…'}</option>
                    {options}
                  </Select>
                  <button type="button" className={fm.remove} onClick={() => setLines((prev) => (prev.length > 2 ? prev.filter((x) => x.key !== l.key) : prev))} disabled={lines.length <= 2} aria-label={`Remove line ${i + 1}`}>
                    ×
                  </button>
                </div>
                <div className={fm.lineRow} data-shape="jv-amounts">
                  <input
                    className={fm.lineAmount}
                    inputMode="decimal"
                    value={l.debit}
                    disabled={!!l.credit}
                    onChange={(e) => set(l.key, e.target.value ? { debit: e.target.value, credit: '' } : { debit: '' })}
                    placeholder="Debit"
                    aria-label={`Line ${i + 1} debit`}
                  />
                  <input
                    className={fm.lineAmount}
                    inputMode="decimal"
                    value={l.credit}
                    disabled={!!l.debit}
                    onChange={(e) => set(l.key, e.target.value ? { credit: e.target.value, debit: '' } : { credit: '' })}
                    placeholder="Credit"
                    aria-label={`Line ${i + 1} credit`}
                  />
                </div>
                <div className={fm.lineRow} data-shape="jv-note">
                  <input className={fm.lineText} value={l.note} onChange={(e) => set(l.key, { note: e.target.value })} placeholder="Line note (optional)" aria-label={`Line ${i + 1} note`} />
                </div>
              </div>
            ))}
            <div className={fm.linesFoot}>
              <button type="button" className={fm.addLine} onClick={() => setLines((prev) => [...prev, blank()])}>
                + Add line
              </button>
              <span className={fm.linesTotal} data-off={check.balanced ? undefined : 'true'}>
                Dr {check.debit.toFixed(2)} · Cr {check.credit.toFixed(2)}
              </span>
            </div>
          </div>
        </Field>
        {readError ? <Hint danger>{readError}</Hint> : null}
        {error ? <Hint danger>{error}</Hint> : !check.ok && tried ? <Hint danger>{jvState(check, description)}</Hint> : <Hint>{jvState(check, description)}</Hint>}
      </DialogForm>
    </FinDialog>
  )
}
