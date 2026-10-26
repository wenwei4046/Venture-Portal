'use client'

import { useMemo, useState, useTransition } from 'react'
import { correctMktLogRecord } from '@/lib/marketing/actions'
import {
  AUDIT_EXPORTS, auditChips, auditCount, auditExportHref, auditFileName, auditGroups, auditRows, correctionOk, NO_AUDIT_FILTER, passesAudit,
  toggleAudit, type AuditFilter, type AuditRow, type ProjectLog,
} from '@/lib/marketing/audit'
import s from './audit.module.css'

// The formal log (`Audit Trail.dc.html`, ④-3): Filter (by person, action, stage — each with its count) and its chips,
// Clear all, "n of m records"; every record numbered, oldest first, read-only. **Export** (④-3b — the user's answers
// 18 and 21: anybody in Marketing): the rows shown as a formal document, as the table, as the handoff's CSV. A record
// corrected — the manager's (answer 19): a record of its own, *correction of #n*; the record itself never changes.

const HEADS = ['#', 'Time', 'Actor', 'Action', 'From → To', 'Reason', 'Version']
const DOT: Record<string, string> = { green: s.dotGreen, red: s.dotRed, amber: s.dotAmber, grey: s.dotGrey }

export default function AuditLog({ log, project, manage = false, onLog }: {
  log: ProjectLog
  /** The project's id — its exports' address. */
  project: string
  /** Marketing · Manage: a record may be corrected. */
  manage?: boolean
  /** The log again after a correction. */
  onLog?: (log: ProjectLog) => void
}) {
  const all = useMemo(() => auditRows(log), [log])
  const [f, setF] = useState<AuditFilter>(NO_AUDIT_FILTER)
  const [open, setOpen] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [fixing, setFixing] = useState<AuditRow | null>(null)
  const [words, setWords] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const rows = all.filter(r => passesAudit(r, f))
  const chips = auditChips(f)

  const fix = (r: AuditRow) => {
    setFixing(r)
    setWords('')
    setError(null)
  }
  const save = () =>
    start(async () => {
      if (!fixing) return
      setError(null)
      const r = await correctMktLogRecord(project, fixing.id, words)
      if (!r.ok) return setError(r.reason)
      if (r.log) onLog?.(r.log)
      setFixing(null)
      setWords('')
    })

  return (
    <div className={s.log}>
      <div className={s.toolbar}>
        <button type="button" className={`${s.filterBtn}${open || chips.length ? ` ${s.filterOn}` : ''}`} aria-expanded={open}
          onClick={() => { setOpen(o => !o); setExporting(false) }}>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
            <line x1="1" y1="3" x2="11" y2="3" /><line x1="3" y1="6" x2="9" y2="6" /><line x1="5" y1="9" x2="7" y2="9" />
          </svg>
          <span>Filter</span>
          {chips.length ? <span className={s.filterCount}>{chips.length}</span> : null}
        </button>
        {chips.map(c => (
          <span key={`${c.key}:${c.value}`} className={s.chip}>
            <span className={s.chipGroup}>{c.group}:</span>
            <span className={s.chipValue}>{c.value}</span>
            <button type="button" className={s.chipX} aria-label={`Remove ${c.group}: ${c.value}`} onClick={() => setF(x => toggleAudit(x, c.key, c.value))}>×</button>
          </span>
        ))}
        {chips.length ? <button type="button" className={s.clear} onClick={() => setF(NO_AUDIT_FILTER)}>Clear all</button> : null}
        <span className={s.grow} />
        <span className={s.count}>{auditCount(rows.length, all.length)}</span>
        <div className={s.exportWrap}>
          <button type="button" className={s.filterBtn} aria-expanded={exporting} aria-haspopup="menu" onClick={() => { setExporting(x => !x); setOpen(false) }}>
            <span>Export</span><span className={s.caret} aria-hidden="true">▼</span>
          </button>
          {exporting ? (
            <div className={s.exportPop} role="menu" aria-label="Export">
              {AUDIT_EXPORTS.map(x => (
                <a key={x.key} role="menuitem" className={s.exportItem} href={auditExportHref(project, x.key, f)} download={auditFileName(log.track, x.key)}
                  onClick={() => setExporting(false)}>
                  {x.label}
                </a>
              ))}
            </div>
          ) : null}
        </div>
        {open ? (
          <div className={s.pop} role="group" aria-label="Filter the log">
            {auditGroups(all, f).map(g => (
              <div key={g.key} className={s.group}>
                <div className={s.groupHead}>{g.title}</div>
                {g.opts.map(o => (
                  <button key={o.value} type="button" role="checkbox" aria-checked={o.on} className={s.opt} onClick={() => setF(x => toggleAudit(x, g.key, o.value))}>
                    <span className={`${s.box}${o.on ? ` ${s.boxOn}` : ''}`} aria-hidden="true">{o.on ? '✓' : ''}</span>
                    <span className={s.optLabel}>{o.value}</span>
                    <span className={s.optN}>{o.n}</span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        ) : null}
      </div>

      {fixing ? (
        <div className={s.fix} role="group" aria-label={`Correct record #${fixing.no}`}>
          <div className={s.fixHead}>Correct #{fixing.no} · {fixing.action}{fixing.stage !== '—' ? ` · ${fixing.stage}` : ''} · {fixing.time}</div>
          <textarea className={s.fixText} value={words} maxLength={500} rows={3} aria-label="What was wrong, and what is right"
            placeholder="What was wrong, and what is right" onChange={e => { setWords(e.target.value); setError(null) }} autoFocus />
          <div className={s.fixFoot}>
            <span className={s.fixCount}>{words.trim().length}/500</span>
            {error ? <span className={s.fixError} role="alert">{error}</span> : null}
            <span className={s.grow} />
            <button type="button" className={s.fixBtn} onClick={() => setFixing(null)} disabled={pending}>Cancel</button>
            <button type="button" className={`${s.fixBtn} ${s.fixOk}`} onClick={save} disabled={pending || !correctionOk(words)}>
              {pending ? 'Adding…' : 'Add correction'}
            </button>
          </div>
        </div>
      ) : null}

      <div className={s.table} role="table" aria-label="Formal log">
        <div className={`${s.tr} ${s.th}`} role="row">
          {HEADS.map(h => <span key={h} role="columnheader">{h}</span>)}
        </div>
        {rows.map(r => (
          <div key={r.no} className={`${s.tr}${r.corrects ? ` ${s.corr}` : ''}`} role="row">
            <span className={s.no} role="cell">{r.no}</span>
            <span className={s.time} role="cell">{r.time}</span>
            <span className={s.actor} role="cell">{r.actor}</span>
            <span className={s.action} role="cell">
              <span className={`${s.dot} ${DOT[r.tone]}`} aria-hidden="true" />
              <span className={s.actionCol}>
                <span className={s.actionText}>{r.action}</span>
                {r.corrects ? <span className={s.corrOf}>correction of #{r.corrects}</span> : null}
                {r.correctedIn.length ? <span className={s.corrOf}>corrected in {r.correctedIn.map(n => `#${n}`).join(', ')}</span> : null}
                {manage ? <button type="button" className={s.correct} aria-label={`Correct record #${r.no}`} onClick={() => fix(r)}>Correct</button> : null}
              </span>
            </span>
            <span className={`${s.soft}${r.fromTo === '—' ? ` ${s.empty}` : ''}`} role="cell">{r.fromTo}</span>
            <span className={`${s.soft}${r.reason === '—' ? ` ${s.empty}` : ''}`} role="cell">{r.reason}</span>
            <span className={`${s.version}${r.version === '—' ? ` ${s.empty}` : ''}`} role="cell">{r.version}</span>
          </div>
        ))}
        {rows.length ? null : <div className={s.none}>{all.length ? 'No records match these filters' : 'No records yet'}</div>}
      </div>
      <div className={s.foot}>
        <svg width="11" height="12" viewBox="0 0 11 12" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true">
          <rect x="1" y="5" width="9" height="6" rx="1.5" /><path d="M3 5V3.5a2.5 2.5 0 0 1 5 0V5" />
        </svg>
        <span>Read-only</span>
      </div>
    </div>
  )
}
