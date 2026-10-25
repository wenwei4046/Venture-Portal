'use client'

import { useCallback, useEffect, useState, useTransition } from 'react'
import { publishMktAds, readMktAdsFigures } from '@/lib/marketing/actions'
import {
  adsCard, adsValues, figureOf, reportRange, typedValues, valueText, type AdsKey, type AdsPage, type AdsPeriod, type AdsReport,
  type AdsSetup,
} from '@/lib/marketing/ads'
import p from '../project/project.module.css'
import t from '../task/task.module.css'
import AdsFigures from './AdsFigures'
import s from './ads.module.css'

// A period published to the PIC's link (2026-10-25 — the user: the Ads person publishes it; an ad not in the CRM keeps
// typed figures): each figure worked out from what the CRM counts and what Meta's Ads Manager says for its days — read
// when the window opens (a report published already starts from its own) — and typed over where the Ads person knows
// better; its cards as the PIC will read them; a note. Published again, it is replaced.

type Typed = Partial<Record<AdsKey, string>>

export default function AdsPublish({ project, title, setup, period, report, onDone, onClose }: {
  project: string
  title: string
  setup: AdsSetup
  period: AdsPeriod
  report: AdsReport | null
  onDone: (page: AdsPage) => void
  onClose: () => void
}) {
  const fromReport = (r: AdsReport): Typed => Object.fromEntries(setup.figures.map(k => [k, valueText(k, r.values[k])]))
  const [typed, setTyped] = useState<Typed>(() => (report ? fromReport(report) : {}))
  const [note, setNote] = useState(report?.note ?? '')
  // What was read: Meta's ads read of those picked; Meta not connected; the CRM's and Meta's not read yet.
  const [meta, setMeta] = useState<{ read: number; of: number; off: boolean } | null>(null)
  const [reading, setReading] = useState(!report)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const read = useCallback(async () => {
    setReading(true)
    setError(null)
    const r = await readMktAdsFigures(project, period.no)
    setReading(false)
    if (!r.ok) return setError(r.reason)
    const values = adsValues(r.crm, r.meta, r.toDate)
    setTyped(Object.fromEntries(setup.figures.map(k => [k, valueText(k, values[k])])))
    setMeta({ read: r.metaRead, of: r.metaOf, off: r.metaOff })
  }, [project, period.no, setup.figures])
  useEffect(() => {
    if (!report) void read()
  }, [report, read])

  const values = typedValues(setup.figures, typed)
  const cards = values ? setup.figures.map(k => adsCard(k, values, setup.targets)) : []
  const publish = () =>
    start(async () => {
      if (!values) return
      const r = await publishMktAds(project, period.no, values, note)
      if (!r.ok) return setError(r.reason)
      onDone(r.ads)
    })

  return (
    <div className={t.scrim} onClick={() => !pending && onClose()}>
      <div className={`${t.dialog} ${s.wide}`} role="dialog" aria-modal="true" aria-label={`Report #${period.no}`} onClick={e => e.stopPropagation()}>
        <div className={t.dialogTitle}>Report #{period.no} · {reportRange(period)}</div>
        <div className={s.body}>
          <div className={s.line}>{title}</div>
          {reading ? <div className={s.meta}>Reading the CRM and Meta…</div> : meta ? (
            <div className={`${s.meta}${meta.off || (meta.of > 0 && meta.read < meta.of) ? ` ${s.metaOff}` : ''}`}>
              {meta.off ? 'Meta is not connected here — type its figures'
                : meta.of === 0 ? 'No CRM ads picked — type its figures'
                : `Meta: ${meta.read} of ${meta.of} ad${meta.of === 1 ? '' : 's'} read`}
            </div>
          ) : null}
          {setup.figures.map(k => (
            <label key={k} className={s.pubRow}>
              <span className={p.dialogLabel}>{figureOf(k).label}</span>
              <input className={`${p.input} ${s.pubInput}`} inputMode="decimal" value={typed[k] ?? ''} placeholder="—" disabled={reading}
                onChange={e => { setError(null); setTyped(v => ({ ...v, [k]: e.target.value })) }} />
            </label>
          ))}
          {cards.length ? (
            <>
              <div className={s.sect}>As the PIC will read it</div>
              <AdsFigures cards={cards} />
            </>
          ) : null}
          <label className={p.dialogField}>
            <span className={p.dialogLabel}>Note</span>
            <textarea className={p.textarea} rows={3} maxLength={500} value={note} onChange={e => setNote(e.target.value)} />
          </label>
        </div>
        {error || !values ? <div className={s.err} role="alert">{error ?? 'Each figure is a number from 0 — or left empty.'}</div> : null}
        <div className={t.dialogBtns}>
          {report ? (
            <button type="button" className={`${t.dialogBtn} ${s.left}`} onClick={() => void read()} disabled={pending || reading}>Read again</button>
          ) : null}
          <button type="button" className={t.dialogBtn} onClick={onClose} disabled={pending}>Cancel</button>
          <button type="button" className={`${t.dialogBtn} ${t.dialogOk}`} disabled={pending || reading || !values} onClick={publish}>
            {pending ? 'Publishing…' : report ? 'Publish again' : 'Publish'}
          </button>
        </div>
      </div>
    </div>
  )
}
