'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { readMktAdsChoices, saveMktAds } from '@/lib/marketing/actions'
import {
  ADS_EVERY, ADS_FIGURES, adsPatch, draftOf, draftProblems, EVERY_WORDS, lastChoices, type AdsChoice, type AdsDraft, type AdsEvery, type AdsKey, type AdsPage,
} from '@/lib/marketing/ads'
import p from '../project/project.module.css'
import t from '../task/task.module.css'
import s from './ads.module.css'

// An Ads report set up or changed (2026-10-25 — the user: each Ads project picks its own CRM ads; how often "可以自己set";
// which figures "可以自己set 要加哪一个"): the CRM's ads to tick (its name, Page, Meta's status, leads so far; a search),
// how often from which day (both stay once a report is out), the figures in the order ticked, the targets the figures
// are read against; its last report (⑤-3c — none: it reports on; never one before a report already out). Save sends only
// what changed.

const TARGETS: { key: keyof AdsDraft['targets']; label: string; hint: string }[] = [
  { key: 'budget', label: 'Budget (RM)', hint: '6000' },
  { key: 'cpl', label: 'Cost per lead (RM)', hint: '20' },
  { key: 'roas', label: 'Min ROAS', hint: '3' },
  { key: 'apptRate', label: 'Appointment rate (%)', hint: '25' },
]

export default function AdsSetup({ project, page, onSaved, onClose }: {
  project: string
  page: AdsPage
  onSaved: (page: AdsPage) => void
  onClose: () => void
}) {
  const was = page.setup
  const [now, setNow] = useState<AdsDraft>(() => draftOf(was, page.today))
  const [choices, setChoices] = useState<AdsChoice[] | null>(null)
  const [find, setFind] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  // A report is out: how often and from when stay as they are, and its last report is that one or later.
  const out = page.reports.length > 0
  const newest = Math.max(0, ...page.reports.map(r => r.no))
  const lasts = useMemo(() => lastChoices(now.every, now.startsOn, Math.max(newest, now.lastNo ?? 0)), [now.every, now.startsOn, now.lastNo, newest])

  useEffect(() => {
    let live = true
    void readMktAdsChoices().then(r => {
      if (!live) return
      if (r.ok) setChoices(r.choices)
      else {
        setChoices([])
        setError(r.reason)
      }
    })
    return () => { live = false }
  }, [])

  const shown = useMemo(() => {
    const q = find.trim().toLowerCase()
    const list = choices ?? []
    // Every ad picked shows, hidden or not; the rest by the search.
    return list.filter(c => now.ads.includes(c.id) || (!c.hidden && (!q || `${c.name} ${c.page ?? ''} ${c.id}`.toLowerCase().includes(q))))
  }, [choices, find, now.ads])
  const problems = draftProblems(now)
  const patch = adsPatch(was, now)

  const set = (k: keyof AdsDraft['targets'], v: string) => { setError(null); setNow(d => ({ ...d, targets: { ...d.targets, [k]: v } })) }
  const toggleAd = (id: string) => { setError(null); setNow(d => ({ ...d, ads: d.ads.includes(id) ? d.ads.filter(x => x !== id) : [...d.ads, id] })) }
  const toggleFig = (k: AdsKey) => { setError(null); setNow(d => ({ ...d, figures: d.figures.includes(k) ? d.figures.filter(x => x !== k) : [...d.figures, k] })) }
  const save = () =>
    start(async () => {
      if (!patch || problems.length) return
      const r = await saveMktAds(project, patch)
      if (!r.ok) return setError(r.reason)
      onSaved(r.ads)
    })

  return (
    <div className={t.scrim} onClick={() => !pending && onClose()}>
      <div className={`${t.dialog} ${s.wide}`} role="dialog" aria-modal="true" aria-label="Ads report" onClick={e => e.stopPropagation()}>
        <div className={t.dialogTitle}>📈 Ads report</div>
        <div className={s.body}>
          <div className={s.sect}>CRM ads · {now.ads.length} picked</div>
          <input className={`${p.input} ${s.search}`} value={find} onChange={e => setFind(e.target.value)} placeholder="Search ads or Pages" aria-label="Search ads" />
          <div className={s.list} role="group" aria-label="CRM ads">
            {choices === null ? <div className={s.none}>Reading the CRM’s ads…</div> : shown.length ? shown.map(c => (
              <label key={c.id} className={s.pick}>
                <input type="checkbox" checked={now.ads.includes(c.id)} onChange={() => toggleAd(c.id)} />
                <span className={s.pickText}>
                  <span className={s.pickName}>{c.name}</span>
                  <span className={s.pickLine}>
                    {[c.page, c.status ? c.status.toLowerCase().replace(/_/g, ' ') : null, `${c.leads} lead${c.leads === 1 ? '' : 's'}`].filter(Boolean).join(' · ')}
                  </span>
                </span>
              </label>
            )) : <div className={s.none}>No ads</div>}
          </div>

          <div className={s.grid3}>
            <label className={p.dialogField}>
              <span className={p.dialogLabel}>How often</span>
              <select className={p.input} value={now.every} disabled={out} onChange={e => { setError(null); setNow(d => ({ ...d, every: e.target.value as AdsEvery })) }}>
                {ADS_EVERY.map(k => <option key={k} value={k}>{EVERY_WORDS[k]}</option>)}
              </select>
            </label>
            <label className={p.dialogField}>
              <span className={p.dialogLabel}>First report from</span>
              <input className={p.input} type="date" value={now.startsOn} disabled={out} min="2020-01-01" max="2100-12-31"
                onChange={e => { setError(null); setNow(d => ({ ...d, startsOn: e.target.value })) }} />
            </label>
            <label className={p.dialogField}>
              <span className={p.dialogLabel}>Last report</span>
              <select className={p.input} value={now.lastNo ?? ''}
                onChange={e => { setError(null); setNow(d => ({ ...d, lastNo: e.target.value ? Number(e.target.value) : null })) }}>
                <option value="">No end</option>
                {lasts.map(c => <option key={c.no} value={c.no} disabled={c.no < newest}>{c.label}</option>)}
              </select>
            </label>
          </div>

          <div className={s.sect}>Figures · {now.figures.length} of 12</div>
          <div className={s.checks} role="group" aria-label="Figures">
            {ADS_FIGURES.map(f => (
              <label key={f.key} className={s.check}>
                <input type="checkbox" checked={now.figures.includes(f.key)} onChange={() => toggleFig(f.key)} />
                <span>{f.label}</span>
              </label>
            ))}
          </div>

          <div className={s.sect}>Targets</div>
          <div className={s.grid4}>
            {TARGETS.map(x => (
              <label key={x.key} className={p.dialogField}>
                <span className={p.dialogLabel}>{x.label}</span>
                <input className={`${p.input} ${p.mono}`} inputMode="decimal" value={now.targets[x.key]} placeholder={x.hint} onChange={e => set(x.key, e.target.value)} />
              </label>
            ))}
          </div>
        </div>
        {error || problems.length ? <div className={s.err} role="alert">{error ?? problems[0]}</div> : null}
        <div className={t.dialogBtns}>
          <button type="button" className={t.dialogBtn} onClick={onClose} disabled={pending}>Cancel</button>
          <button type="button" className={`${t.dialogBtn} ${t.dialogOk}`} disabled={pending || !patch || problems.length > 0} onClick={save}>
            {pending ? 'Saving…' : was ? 'Save' : 'Set up'}
          </button>
        </div>
      </div>
    </div>
  )
}
