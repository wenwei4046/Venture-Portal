'use client'

import { useEffect, useMemo, useState } from 'react'
import { DialogButton, DialogForm, Field, FinDialog, Hint } from '@/components/finv/Dialog'
import { Select } from '@/components/hrv/select'
import { postIisMonth, previewIisMonth, type IisMonthPreview } from '@/app/(portal)/fund-out/iis-actions'
import c from './iis.module.css'

// Month-end interest (interest in suspense, 2026-11-13; mig 20261113140000): pick a month, see each deal's entry —
// what still goes into suspense, the interest received / paid taken out to 5027 / 6000 — then Post. Only what is new
// is posted, so a month run twice adds nothing.

const money = (n: number) => n.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const ymAdd = (ym: string, k: number) => {
  const [y, m] = ym.split('-').map(Number)
  const t = y * 12 + (m - 1) + k
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`
}
const monthName = (ym: string) => new Date(`${ym}-01T00:00:00Z`).toLocaleDateString('en-MY', { month: 'short', year: 'numeric', timeZone: 'UTC' })

export default function IisMonthDialog({
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
  const months = useMemo(() => [0, -1, -2].map((k) => ymAdd(today.slice(0, 7), k)), [today])
  const [ym, setYm] = useState(months[0])
  const [preview, setPreview] = useState<IisMonthPreview | null>(null)
  const [refused, setRefused] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    let live = true
    setPreview(null)
    setRefused(null)
    previewIisMonth(ym).then((r) => {
      if (!live) return
      if (r.ok) setPreview(r.preview)
      else setRefused(r.reason)
    })
    return () => {
      live = false
    }
  }, [open, ym])

  const total = (k: 'accrual' | 'recognition') => (preview?.rows ?? []).reduce((t, r) => t + r[k], 0)
  const close = () => {
    if (busy) return
    onClose()
  }
  const save = async () => {
    if (busy || !preview || preview.rows.length === 0) return
    setBusy(true)
    setRefused(null)
    const r = await postIisMonth(ym)
    setBusy(false)
    if (!r.ok) {
      setRefused(r.reason)
      return
    }
    onSaved(`${monthName(ym)} interest posted · ${r.posted} ${r.posted === 1 ? 'entry' : 'entries'}`)
    onClose()
  }

  const nothing = !!preview && preview.rows.length === 0
  const buttons = (
    <>
      <DialogButton disabled={busy} onClick={close}>
        Cancel
      </DialogButton>
      <DialogButton kind="primary" off={!preview || nothing} disabled={busy} onClick={save}>
        {busy ? 'Posting…' : 'Post'}
      </DialogButton>
    </>
  )

  return (
    <FinDialog open={open} onClose={close} title="Month-end interest" sub="Interest in suspense · one entry a deal · only what is new" locked={busy} wide>
      <DialogForm buttons={buttons} onSubmit={save}>
        <Field label="Month" htmlFor="iis-month">
          <Select id="iis-month" round={12} value={ym} onChange={(e) => setYm(e.target.value)} disabled={busy}>
            {months.map((m) => (
              <option key={m} value={m}>
                {monthName(m)}
              </option>
            ))}
          </Select>
        </Field>
        {preview ? (
          nothing ? (
            <p className={c.empty}>Nothing new to post for {monthName(ym)}.</p>
          ) : (
            <div className={c.wrap}>
              <table className={c.table}>
                <thead>
                  <tr>
                    <th>Deal</th>
                    <th className={c.num}>Into suspense</th>
                    <th className={c.num}>Out to P&amp;L</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((r) => (
                    <tr key={`${r.kind}:${r.id}`}>
                      <td>
                        {r.label}
                        <span style={{ color: 'rgb(var(--hvs-muted))' }}>{r.kind === 'loan' ? ' · Fund OUT' : ' · Fund IN'}</span>
                      </td>
                      <td className={c.num}>{r.accrual ? money(r.accrual) : '—'}</td>
                      <td className={c.num}>{r.recognition ? money(r.recognition) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td>Total (RM)</td>
                    <td className={c.num}>{money(total('accrual'))}</td>
                    <td className={c.num}>{money(total('recognition'))}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )
        ) : refused ? null : (
          <p className={c.empty}>Working it out…</p>
        )}
        {preview && !nothing ? <Hint>Dated {preview.date}. Interest received goes to 5027, interest paid to 6000.</Hint> : null}
        {refused ? <Hint danger>{refused}</Hint> : null}
      </DialogForm>
    </FinDialog>
  )
}
