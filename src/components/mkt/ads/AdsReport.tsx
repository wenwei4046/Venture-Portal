'use client'

import { useState } from 'react'
import { adsReportPdfUrl, adsRows, EVERY_WORDS, figureOf, reportCards, reportRange, type AdsPage } from '@/lib/marketing/ads'
import { shortDay } from '@/lib/marketing/board'
import { trailTime } from '@/lib/marketing/task'
import AdsFigures, { targetWords } from './AdsFigures'
import AdsPublish from './AdsPublish'
import AdsSetup from './AdsSetup'
import s from './ads.module.css'

// A project's Ads report (2026-10-25 — the user's answer 57: each Ads project picks its own CRM ads; the cadence and the
// figures are the Ads person's; they publish each report to the PIC's link): on a product project's or a task's page.
// Set up by Marketing · Edit (its ads, how often, from when, the figures, the targets); then its periods, the newest
// first — the one running, those over and due, those published (their figures as the PIC reads them).

export default function AdsReport({ project, title, initial, edit, say }: {
  project: string
  title: string
  initial: AdsPage
  edit: boolean
  say: (words: string) => void
}) {
  const [ads, setAds] = useState(initial)
  const [setting, setSetting] = useState(false)
  const [publishing, setPublishing] = useState<number | null>(null)
  const [open, setOpen] = useState<number | null>(null)
  const setup = ads.setup

  if (!setup) {
    if (!edit) return null
    return (
      <div className={s.card} aria-label="Ads report">
        <div className={s.head}>
          <span aria-hidden="true">📈</span>
          <span className={s.title}>Ads report</span>
          <span className={s.grow} />
          <button type="button" className={s.edit} onClick={() => setSetting(true)}>Set up</button>
        </div>
        {setting ? (
          <AdsSetup project={project} page={ads} onSaved={a => { setAds(a); setSetting(false); say('Ads report set up') }} onClose={() => setSetting(false)} />
        ) : null}
      </div>
    )
  }

  const rows = adsRows(setup, ads.reports, ads.today)
  const targets = targetWords(setup.targets)
  const row = rows.find(r => r.no === publishing) ?? null
  return (
    <div className={s.card} aria-label="Ads report">
      <div className={s.head}>
        <span aria-hidden="true">📈</span>
        <span className={s.title}>Ads report</span>
        <span className={s.every}>
          {EVERY_WORDS[setup.every]}{setup.lastNo ? ` · ${setup.lastNo} report${setup.lastNo === 1 ? '' : 's'}` : ''}
        </span>
        <span className={s.grow} />
        {edit ? <button type="button" className={s.edit} onClick={() => setSetting(true)} aria-label="Change the Ads report">Edit</button> : null}
      </div>
      <div className={s.line}>
        {setup.ads.length ? `${setup.ads.length} CRM ad${setup.ads.length === 1 ? '' : 's'}` : 'No CRM ads — figures typed'}
        {' · '}{setup.figures.map(k => figureOf(k).label).join(' · ')}
      </div>
      {targets ? <div className={s.line}>{targets}</div> : null}
      {!ads.link ? <span className={s.chip}>No PIC link yet</span> : null}
      <div className={s.rows}>
        {rows.length ? rows.map(r => (
          <div key={r.no} className={s.row}>
            <div className={s.rowHead}>
              <span className={s.rowName}>Report #{r.no}</span>
              <span className={s.rowRange}>{reportRange(r)}</span>
              <span className={s.grow} />
              {r.report ? (
                <>
                  <span className={`${s.state} ${s.stateDone}`}>Published</span>
                  <a className={s.act} href={adsReportPdfUrl(project, r.no)} aria-label={`Report #${r.no} as a PDF`}>PDF</a>
                  <button type="button" className={s.act} aria-expanded={open === r.no} onClick={() => setOpen(o => (o === r.no ? null : r.no))}>
                    {open === r.no ? 'Hide' : 'Show'}
                  </button>
                  {edit ? <button type="button" className={s.act} onClick={() => setPublishing(r.no)}>Publish again…</button> : null}
                </>
              ) : r.due ? (
                <>
                  <span className={`${s.state} ${s.stateDue}`}>Due</span>
                  {edit ? <button type="button" className={`${s.act} ${s.actOn}`} onClick={() => setPublishing(r.no)}>Publish…</button> : null}
                </>
              ) : (
                <span className={s.state}>Ends {shortDay(r.until)}</span>
              )}
            </div>
            {r.report && open === r.no ? (
              <>
                <AdsFigures cards={reportCards(r.report, setup.figures)} />
                {r.report.note ? <div className={s.note}>{r.report.note}</div> : null}
                <div className={s.by}>
                  {r.report.by} · {trailTime(r.report.updatedAt ?? r.report.at)}{r.report.updatedAt ? ' · published again' : ''}
                </div>
              </>
            ) : null}
          </div>
        )) : <div className={s.line}>Its first report starts {shortDay(setup.startsOn)}</div>}
      </div>
      {setting ? (
        <AdsSetup project={project} page={ads} onSaved={a => { setAds(a); setSetting(false); say('Ads report saved') }} onClose={() => setSetting(false)} />
      ) : null}
      {row ? (
        <AdsPublish project={project} title={title} setup={setup} period={row} report={row.report}
          onDone={a => { setAds(a); setPublishing(null); setOpen(row.no); say(`Report #${row.no} published`) }} onClose={() => setPublishing(null)} />
      ) : null}
    </div>
  )
}

