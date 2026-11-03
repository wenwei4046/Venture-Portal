'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import type { AuditRow } from '@/lib/leads/audit'
import { officeDay } from '@/lib/office-time'
import { LeadIcon } from '@/components/layout/lead-icons'
import { initials } from './ui/bits'
import Popover from './ui/Popover'
import s from './audit.module.css'

/**
 * Lead View v2 › Audit log (2026-11-02, the v2 handoff §7.15): the module pills (All and the drawn six, then any other
 * module a change came from), "N changes", Export CSV of what is shown, and one card of rows — time, user with their
 * initials, module (opening its page), item, action with its dot, change. Kept though not drawn (the user's point 2):
 * search, User and Action (several at once) and a day range, behind the filter button beside the count.
 */

const DRAWN = ['General info', 'Data Center', 'Reply template', 'AI Agent', 'Working hours', 'Campaigns']

export default function AuditView({ rows }: { rows: AuditRow[] }) {
  const [mod, setMod] = useState('All')
  const [q, setQ] = useState('')
  const [users, setUsers] = useState<string[]>([])
  const [acts, setActs] = useState<string[]>([])
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [open, setOpen] = useState(false)
  const withDay = useMemo(() => rows.map(r => {
    const d = officeDay(r.at)
    return { ...r, day: d.format('YYYY-MM-DD'), when: d.format('D MMM HH:mm') }
  }), [rows])
  const mods = ['All', ...DRAWN, ...[...new Set(withDay.map(r => r.module))].filter(m => !DRAWN.includes(m)).sort()]
  const ql = q.trim().toLowerCase()
  const shown = withDay.filter(r => (mod === 'All' || r.module === mod) && (!users.length || users.includes(r.by)) && (!acts.length || acts.includes(r.action))
    && (!from || r.day >= from) && (!to || r.day <= to) && (!ql || `${r.item} ${r.change}`.toLowerCase().includes(ql)))
  const filtered = !!(ql || users.length || acts.length || from || to)
  const uniq = (k: 'by' | 'action') => [...new Set(withDay.map(r => r[k]))].sort()
  const toggle = (list: string[], set: (v: string[]) => void, v: string) => set(list.includes(v) ? list.filter(x => x !== v) : [...list, v])
  const exportCsv = () => {
    const lines = [['Time', 'User', 'Module', 'Item', 'Action', 'Change'], ...shown.map(r => [r.when, r.by, r.module, r.item, r.action, r.change])]
    const text = '﻿' + lines.map(l => l.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }))
    a.download = 'Audit log.csv'
    document.body.appendChild(a); a.click(); a.remove()
  }

  return (
    <div className={s.wrap}>
      <div className={s.bar}>
        {mods.map(m => <button key={m} type="button" className={s.mod} aria-pressed={mod === m} onClick={() => setMod(m)}>{m}</button>)}
        <div className={s.gap} />
        <span className={s.count}>{shown.length} {shown.length === 1 ? 'change' : 'changes'}</span>
        <span className={s.filterWrap}>
          <button type="button" className={s.ghost} data-on={filtered || undefined} aria-expanded={open} aria-label="Filter" title="Search, user, action, dates" onClick={() => setOpen(o => !o)}>
            <LeadIcon name="sliders-horizontal" size={14} />
          </button>
          <Popover open={open} onClose={() => setOpen(false)} className={s.filters} label="Filter">
            <label className={s.search}><LeadIcon name="search" size={14} /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Search item or change" aria-label="Search item or change" /></label>
            <div className={s.fSect}>
              <span className={s.fKicker}>USER</span>
              <div className={s.chips}>{uniq('by').map(u => <button key={u} type="button" className={s.chip} aria-pressed={users.includes(u)} onClick={() => toggle(users, setUsers, u)}>{u}</button>)}</div>
            </div>
            <div className={s.fSect}>
              <span className={s.fKicker}>ACTION</span>
              <div className={s.chips}>{uniq('action').map(x => <button key={x} type="button" className={s.chip} aria-pressed={acts.includes(x)} onClick={() => toggle(acts, setActs, x)}>{x}</button>)}</div>
            </div>
            <div className={s.fSect}>
              <span className={s.fKicker}>DAYS</span>
              <span className={s.range}>
                <input type="date" className={s.date} value={from} max={to || undefined} onChange={e => setFrom(e.target.value)} aria-label="From" />to
                <input type="date" className={s.date} value={to} min={from || undefined} onChange={e => setTo(e.target.value)} aria-label="To" />
              </span>
            </div>
            {filtered ? <button type="button" className={s.clear} onClick={() => { setQ(''); setUsers([]); setActs([]); setFrom(''); setTo('') }}>Clear</button> : null}
          </Popover>
        </span>
        <button type="button" className={s.ghost} onClick={exportCsv} disabled={!shown.length}><LeadIcon name="download" size={14} />Export CSV</button>
      </div>
      <section className={s.card}>
        <div className={`${s.row} ${s.head}`}><span>Time</span><span>User</span><span>Module</span><span>Item</span><span>Action</span><span>Change</span></div>
        <div className={s.rows}>
          {shown.map(r => (
            <div key={r.id} className={s.row}>
              <span className={s.time}>{r.when}</span>
              <span className={s.user}><span className={s.ini}>{initials(r.by)}</span><span>{r.by}</span></span>
              <Link className={s.modLink} href={r.href}>{r.module}</Link>
              <span className={s.item}>{r.item}</span>
              <span className={s.act} data-a={r.action}>{r.action}</span>
              <span className={s.change}>{r.change}</span>
            </div>
          ))}
          {!shown.length ? <div className={s.empty}>{withDay.length ? 'No changes match.' : 'No changes yet. Saves on Lead View’s set-up pages show here.'}</div> : null}
        </div>
      </section>
    </div>
  )
}
