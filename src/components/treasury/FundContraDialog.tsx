'use client'

import { useEffect, useMemo, useState } from 'react'
import { DateField } from '@/components/finv/DateField'
import { DialogButton, DialogForm, Field, FinDialog, Hint, TextArea } from '@/components/finv/Dialog'
import fm from '@/components/finv/form.module.css'
import { Select } from '@/components/hrv/select'
import { contraLines, contraProblem, money, sideTotal, type ContraDeal, type ContraLineDraft, type ContraOptions, type ContraSide } from '@/lib/fund-contra'
import { fileFundContra, openFundContra, withdrawFundContra } from '@/app/(portal)/fund-out/contra-actions'
import c from './contra.module.css'

// Fund contra (2026-11-04 — the user: "我想要这个contra 功能"; mig 20261104230000): Fund OUT loans on one side, Fund IN
// fund sources on the other, each line a principal and / or an interest — one to many, many to one, many to many —
// the two sides equal; notes optional; the date today or before. Submit sends it to the Principal; nothing moves until
// it is approved. Its lists are read when it opens, never with the page.

let nextKey = 0
const blank = (): ContraLineDraft => ({ key: `l${nextKey++}`, id: '', principal: '', interest: '' })

export default function FundContraDialog({
  open,
  onClose,
  onSaved,
  today,
}: {
  open: boolean
  onClose: () => void
  onSaved: (message: string) => void
  /** YYYY-MM-DD, the office's. */
  today: string
}) {
  const [opts, setOpts] = useState<ContraOptions | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [date, setDate] = useState(today)
  const [notes, setNotes] = useState('')
  const [loans, setLoans] = useState<ContraLineDraft[]>(() => [blank()])
  const [sources, setSources] = useState<ContraLineDraft[]>(() => [blank()])
  const [busy, setBusy] = useState(false)
  const [refused, setRefused] = useState<string | null>(null)
  // A contra still waiting (2026-11-05): withdrawn after a second press, its refusal said beside it.
  const [asking, setAsking] = useState<string | null>(null)
  const [withdrawing, setWithdrawing] = useState<string | null>(null)
  const [withdrawError, setWithdrawError] = useState<{ id: string; reason: string } | null>(null)

  useEffect(() => {
    if (!open || opts) return
    let live = true
    openFundContra().then((r) => {
      if (!live) return
      if (r.ok) setOpts(r.options)
      else setLoadError(r.reason)
    })
    return () => {
      live = false
    }
  }, [open, opts])

  const deals = useMemo(() => new Map<string, ContraDeal>([...(opts?.loans ?? []), ...(opts?.sources ?? [])].map((d) => [d.id, d])), [opts])
  const loanLines = contraLines('loan', loans)
  const sourceLines = contraLines('source', sources)
  const problem = opts ? contraProblem({ date, today, loans: loanLines, sources: sourceLines, deals }) : (loadError ?? 'Reading the deals…')
  const loanTotal = sideTotal(loanLines)
  const sourceTotal = sideTotal(sourceLines)

  const reset = () => {
    setDate(today)
    setNotes('')
    setLoans([blank()])
    setSources([blank()])
    setRefused(null)
  }
  const close = () => {
    if (busy) return
    reset()
    onClose()
  }
  const save = async () => {
    if (problem || busy) return
    setBusy(true)
    setRefused(null)
    const r = await fileFundContra({ date, notes, lines: [...loanLines, ...sourceLines] })
    setBusy(false)
    if (!r.ok) {
      setRefused(r.reason)
      return
    }
    reset()
    onSaved(r.message)
    onClose()
  }

  const sideBlock = (side: ContraSide, rows: ContraLineDraft[], set: (f: (prev: ContraLineDraft[]) => ContraLineDraft[]) => void, total: number) => {
    const list = side === 'loan' ? (opts?.loans ?? []) : (opts?.sources ?? [])
    const word = side === 'loan' ? 'loan' : 'fund source'
    const patch = (key: string, p: Partial<ContraLineDraft>) => set((prev) => prev.map((r) => (r.key === key ? { ...r, ...p } : r)))
    return (
      <div className={c.side}>
        <div className={c.sideHead}>
          <span className={c.sideName}>{side === 'loan' ? 'Fund OUT · loans' : 'Fund IN · fund sources'}</span>
          <span className={c.sideNote}>{side === 'loan' ? 'What they owe HV' : 'What HV owes them'}</span>
        </div>
        <div className={c.heads} aria-hidden>
          <span>{side === 'loan' ? 'Loan' : 'Fund source'}</span>
          <span>Principal</span>
          <span>Interest</span>
          <span />
        </div>
        <div className={fm.lines}>
          {rows.map((r, i) => {
            const d = r.id ? deals.get(r.id) : null
            return (
              <div key={r.key} className={fm.lineWrap}>
                <div className={`${fm.lineRow} ${c.row}`}>
                  <Select round={12} className={fm.lineSelect} value={r.id} onChange={(e) => patch(r.key, { id: e.target.value })} aria-label={`${word} ${i + 1}`}>
                    <option value="">{opts ? `Pick a ${word}` : '…'}</option>
                    {list.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.label}
                      </option>
                    ))}
                  </Select>
                  <input className={fm.lineAmount} inputMode="decimal" value={r.principal} onChange={(e) => patch(r.key, { principal: e.target.value })} placeholder="0.00" aria-label={`${word} ${i + 1} principal`} />
                  <input className={fm.lineAmount} inputMode="decimal" value={r.interest} onChange={(e) => patch(r.key, { interest: e.target.value })} placeholder="0.00" aria-label={`${word} ${i + 1} interest`} />
                  {rows.length > 1 ? (
                    <button type="button" className={fm.remove} onClick={() => set((prev) => prev.filter((x) => x.key !== r.key))} aria-label={`Remove ${word} ${i + 1}`}>
                      ×
                    </button>
                  ) : (
                    <span />
                  )}
                </div>
                {d ? <div className={c.owes}>{`Owes RM ${money(d.outstanding)} in principal`}</div> : null}
              </div>
            )
          })}
          <div className={fm.linesFoot}>
            <button type="button" className={fm.addLine} onClick={() => set((prev) => [...prev, blank()])}>
              {`+ Add ${word}`}
            </button>
            <span className={fm.linesTotal} data-off={Math.abs(loanTotal - sourceTotal) >= 0.005 && total > 0 ? 'true' : undefined}>
              {`RM ${money(total)}`}
            </span>
          </div>
        </div>
      </div>
    )
  }

  const withdraw = async (id: string) => {
    if (withdrawing) return
    setWithdrawing(id)
    setWithdrawError(null)
    const r = await withdrawFundContra(id)
    setWithdrawing(null)
    setAsking(null)
    if (!r.ok) {
      setWithdrawError({ id, reason: r.reason })
      return
    }
    setOpts((o) => (o ? { ...o, waiting: o.waiting.filter((w) => w.id !== id) } : o))
    onSaved('Contra withdrawn')
  }

  const waitingBlock =
    opts && opts.waiting.length > 0 ? (
      <div className={c.side}>
        <div className={c.sideHead}>
          <span className={c.sideName}>{`Waiting for the Principal · ${opts.waiting.length}`}</span>
          <span className={c.sideNote}>Withdraw one to change it, then file it again</span>
        </div>
        <div className={fm.lines}>
          {opts.waiting.map((w) => (
            <div key={w.id} className={fm.lineWrap}>
              <div className={c.waiting}>
                <div className={c.waitingText}>
                  <div className={c.waitingWords}>{w.words}</div>
                  <div className={c.owes}>{`${w.filedBy} · dated ${w.date}`}</div>
                  {withdrawError?.id === w.id ? <div className={c.waitingError}>{withdrawError.reason}</div> : null}
                </div>
                {w.canWithdraw ? (
                  asking === w.id ? (
                    <span className={c.waitingAsk}>
                      <button type="button" className={fm.addLine} onClick={() => setAsking(null)} disabled={withdrawing === w.id}>
                        Keep
                      </button>
                      <button type="button" className={`${fm.addLine} ${c.danger}`} onClick={() => void withdraw(w.id)} disabled={withdrawing === w.id}>
                        {withdrawing === w.id ? 'Withdrawing…' : 'Withdraw it'}
                      </button>
                    </span>
                  ) : (
                    <button type="button" className={fm.addLine} onClick={() => setAsking(w.id)}>
                      Withdraw
                    </button>
                  )
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </div>
    ) : null

  const buttons = (
    <>
      <DialogButton disabled={busy} onClick={close}>
        Cancel
      </DialogButton>
      <DialogButton kind="primary" off={!!problem} disabled={busy} onClick={save}>
        Submit for approval
      </DialogButton>
    </>
  )

  return (
    <FinDialog open={open} onClose={close} title="Fund contra" sub="Loans and fund sources knocked off against each other · no bank · needs Principal approval" locked={busy} wide tall>
      <DialogForm buttons={buttons} onSubmit={save}>
        {waitingBlock}
        <Field label="Date">
          <DateField value={date} onChange={setDate} today={today} label="Date" />
        </Field>
        {sideBlock('loan', loans, setLoans, loanTotal)}
        {sideBlock('source', sources, setSources, sourceTotal)}
        <Field label="Notes" htmlFor="fc-notes">
          <TextArea id="fc-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" rows={2} />
        </Field>
        {refused ? <Hint danger>{refused}</Hint> : problem ? <Hint>{problem}</Hint> : <Hint>{`Ready — RM ${money(loanTotal)} each side, to the Principal for approval.`}</Hint>}
      </DialogForm>
    </FinDialog>
  )
}
