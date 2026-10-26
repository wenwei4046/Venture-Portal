'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import type { AuditAction, AuditRow } from '@/lib/leads/audit'
import { officeDay } from '@/lib/office-time'
import { LeadIcon } from '@/components/layout/lead-icons'
import s from './audit.module.css'

/**
 * Lead View › Audit log (2026-10-23, the redesign v2 handoff `Audit Log.dc.html`; step 6): search, Module / User /
 * Action (each several at once), a day range, "N of M changes" and Export CSV of the rows shown. A module opens its page.
 */

const RING: Partial<Record<AuditAction, string>> = { Added: 'green', Deleted: 'red' }

export default function AuditView({ rows }: { rows: AuditRow[] }) {
  const [q, setQ] = useState('')
  const [mods, setMods] = useState<string[]>([])
  const [users, setUsers] = useState<string[]>([])
  const [acts, setActs] = useState<string[]>([])
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const withDay = useMemo(() => rows.map(r => {
    const d = officeDay(r.at)
    return { ...r, day: d.format('YYYY-MM-DD'), when: d.format('D MMM HH:mm') }
  }), [rows])
  const ql = q.trim().toLowerCase()
  const shown = withDay.filter(r => (!mods.length || mods.includes(r.module)) && (!users.length || users.includes(r.by)) && (!acts.length || acts.includes(r.action))
    && (!from || r.day >= from) && (!to || r.day <= to) && (!ql || `${r.item} ${r.change}`.toLowerCase().includes(ql)))
  const uniq = (k: 'module' | 'by' | 'action') => [...new Set(withDay.map(r => r[k]))].sort()
  const exportCsv = () => {
    const lines = [['Time', 'User', 'Module', 'Item', 'Action', 'Change'], ...shown.map(r => [r.when, r.by, r.module, r.item, r.action, r.change])]
    const text = '﻿' + lines.map(l => l.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }))
    a.download = 'Audit log.csv'
    document.body.appendChild(a); a.click(); a.remove()
  }
  const dd = (key: string, title: string, opts: string[], sel: string[], setSel: (v: string[]) => void, field: 'module' | 'by' | 'action') => (
    <span className={s.ddWrap}>
      <button type="button" className={s.dd} data-on={sel.length > 0 || undefined} aria-expanded={open === key} onClick={() => setOpen(o => (o === key ? null : key))}>
        <span className={s.ddTitle}>{title}:</span>{sel.length ? sel.join(', ') : 'All'}<LeadIcon name="chevronDown" size={14} />
      </button>
      {open === key ? (
        <>
          <div className={s.scrim} onClick={() => setOpen(null)} aria-hidden="true" />
          <div className={s.menu} role="listbox" aria-label={title}>
            {opts.map(o => {
              const on = sel.includes(o)
              return (
                <button key={o} type="button" role="option" aria-selected={on} className={s.opt} onClick={() => setSel(on ? sel.filter(x => x !== o) : [...sel, o])}>
                  <span className={s.box} data-on={on || undefined}>{on ? '✓' : ''}</span>{o}<span className={s.optCount}>{withDay.filter(r => r[field] === o).length}</span>
                </button>
              )
            })}
            {sel.length ? <button type="button" className={s.clear} onClick={() => setSel([])}>Clear</button> : null}
          </div>
        </>
      ) : null}
    </span>
  )

  return (
    <div className={s.page}>
      <div className={s.head}>
        <div className={s.titles}>
          <span className={s.eyebrow}>SET UP</span>
          <h1 className={s.title}>Audit log</h1>
        </div>
        <button type="button" className={s.export} onClick={exportCsv} disabled={!shown.length}><LeadIcon name="download" size={14} /> Export CSV</button>
      </div>
      <div className={s.card}>
        <div className={s.filters}>
          <label className={s.search}><LeadIcon name="search" size={14} /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Search item or change" aria-label="Search" /></label>
          {dd('mod', 'Module', uniq('module'), mods, setMods, 'module')}
          {dd('user', 'User', uniq('by'), users, setUsers, 'by')}
          {dd('act', 'Action', uniq('action'), acts, setActs, 'action')}
          <span className={s.range}>
            <input type="date" className={s.date} value={from} max={to || undefined} onChange={e => setFrom(e.target.value)} aria-label="From" />to
            <input type="date" className={s.date} value={to} min={from || undefined} onChange={e => setTo(e.target.value)} aria-label="To" />
          </span>
          <span className={s.fill} />
          <span className={s.count}>{shown.length} of {withDay.length} changes</span>
        </div>
        <div className={s.row} data-head=""><span>TIME</span><span>USER</span><span>MODULE</span><span>ITEM</span><span>ACTION</span><span>CHANGE</span></div>
        <div className={s.rows}>
          {shown.map(r => (
            <div key={r.id} className={s.row}>
              <span className={s.time}>{r.when}</span>
              <span>{r.by}</span>
              <Link className={s.mod} href={r.href}>{r.module}</Link>
              <span className={s.item}>{r.item}</span>
              <span className={s.act} data-ring={RING[r.action]}>{r.action}</span>
              <span className={s.change}>{r.change}</span>
            </div>
          ))}
          {!shown.length ? <div className={s.empty}>{withDay.length ? 'No changes match these filters.' : 'No changes yet. Saves on Lead View’s set-up pages show here.'}</div> : null}
        </div>
      </div>
    </div>
  )
}
