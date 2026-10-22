'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import type { MktBoard } from '@/lib/marketing/board'
import {
  NO_FILTER, countPool, dueLabel, filterTasks, flowLanes, flowOptions, peopleCards, trackCounts,
  type TrackFilter, type TrackPeriod, type TrackStatus, type TrackTask, type TrackTone,
} from '@/lib/marketing/tracking'
import s from './tracking.module.css'

// The Tracking Dashboard (`Tracking Dashboard.dc.html`): By people / By workflow; This week · This month · Custom
// (the figures of what was finished), a subsidiary, a workflow, a person; five cards that filter by state. A task opens
// its project.

const TONE: Record<TrackTone, { box: string; fg: string; slot: string }> = {
  red: { box: s.tRed, fg: s.fgRed, slot: s.sRed },
  waiting: { box: s.tWaiting, fg: s.fgWaiting, slot: s.sWaiting },
  risk: { box: s.tRisk, fg: s.fgRisk, slot: s.sRisk },
  ok: { box: s.tOk, fg: s.fgOk, slot: s.sOk },
}
const TEAM_BG: Record<string, string> = {
  manager: 'var(--mk-team-manager-bg)', content: 'var(--mk-team-content-bg)', social: 'var(--mk-team-social-bg)',
  design: 'var(--mk-team-design-bg)', ads: 'var(--mk-team-ads-bg)', brand: 'var(--mk-team-brand-bg)',
}
const STATS: { key: TrackStatus; label: string; dot: string; fg: string }[] = [
  { key: 'All', label: 'Ongoing', dot: 'rgb(var(--mk-brown))', fg: 'rgb(var(--mk-ink))' },
  { key: 'attention', label: 'Needs you', dot: 'rgb(var(--mk-red-dot))', fg: 'rgb(var(--mk-red-deep))' },
  { key: 'red', label: 'Overdue', dot: 'rgb(var(--mk-red-dot))', fg: 'rgb(var(--mk-red-deep))' },
  { key: 'risk', label: 'At risk', dot: 'rgb(var(--mk-risk-dot))', fg: 'rgb(var(--mk-risk))' },
  { key: 'ok', label: 'On track', dot: 'rgb(var(--mk-done-dot))', fg: 'rgb(var(--mk-done))' },
]
const href = (t: TrackTask) => `/marketing/projects/${t.projectId}`
const initial = (n: string) => n.trim().charAt(0).toUpperCase() || '·'

export default function TrackingDashboard({ board, tasks }: { board: MktBoard; tasks: TrackTask[] }) {
  const [layout, setLayout] = useState<'people' | 'flow'>('people')
  const [f, setF] = useState<TrackFilter>(NO_FILTER)
  const [range, setRange] = useState({ from: board.today, to: board.today })
  const set = (patch: Partial<TrackFilter>) => setF(x => ({ ...x, ...patch }))
  const pool = useMemo(() => countPool(tasks, f), [tasks, f])
  const shown = useMemo(() => filterTasks(tasks, f), [tasks, f])
  const counts = trackCounts(pool)
  const people = useMemo(() => peopleCards(board, pool, shown, f), [board, pool, shown, f])
  const lanes = useMemo(() => flowLanes(shown), [shown])
  const flows = useMemo(() => flowOptions(tasks), [tasks])
  const teamOf = new Map(board.team.map(p => [p.id, p]))
  const avBg = (id: string | null) => (id && teamOf.get(id)?.team ? TEAM_BG[teamOf.get(id)?.team as string] : 'var(--mk-team-manager-bg)')
  const filtered = f.sub !== 'All' || f.flow !== 'All' || f.person !== 'All' || f.status !== 'All'
  const period = (p: TrackPeriod['kind']) => set({ period: p === 'custom' ? { kind: 'custom', ...range } : { kind: p } })

  return (
    <div className={s.page}>
      <div className={s.head}>
        <span className={s.headIcon} aria-hidden="true">📊</span>
        <span className={s.title}>Tracking Dashboard</span>
        <span className={s.grow} />
        <span className={s.kicker}>Layout</span>
        <div className={s.seg} role="radiogroup" aria-label="Layout">
          {([['people', '👥 By people'], ['flow', '🔀 By workflow']] as const).map(([k, label]) => (
            <button key={k} type="button" role="radio" aria-checked={layout === k} className={`${s.segBtn}${layout === k ? ` ${s.segOn}` : ''}`} onClick={() => setLayout(k)}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className={s.filters}>
        <div className={s.seg} role="radiogroup" aria-label="Period">
          {([['week', 'This week'], ['month', 'This month'], ['custom', 'Custom']] as const).map(([k, label]) => (
            <button key={k} type="button" role="radio" aria-checked={f.period.kind === k} className={`${s.segBtn} ${s.segSmall}${f.period.kind === k ? ` ${s.segOn}` : ''}`} onClick={() => period(k)}>
              {label}
            </button>
          ))}
        </div>
        {f.period.kind === 'custom' ? (
          <>
            <input type="date" className={s.date} value={range.from} aria-label="From" onChange={e => {
              const next = { ...range, from: e.target.value }
              setRange(next)
              if (next.from && next.to) set({ period: { kind: 'custom', ...next } })
            }} />
            <input type="date" className={s.date} value={range.to} aria-label="To" onChange={e => {
              const next = { ...range, to: e.target.value }
              setRange(next)
              if (next.from && next.to) set({ period: { kind: 'custom', ...next } })
            }} />
          </>
        ) : null}
        <select className={s.select} value={f.sub} onChange={e => set({ sub: e.target.value })} aria-label="Subsidiary">
          <option value="All">All subsidiaries</option>
          {board.subs.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
        </select>
        <select className={s.select} value={f.flow} onChange={e => set({ flow: e.target.value })} aria-label="Workflow">
          <option value="All">All workflows</option>
          {flows.map(x => <option key={x.key} value={x.key}>{x.name}</option>)}
        </select>
        <select className={s.select} value={f.person} onChange={e => set({ person: e.target.value })} aria-label="Person">
          <option value="All">All people</option>
          {board.team.map(p => <option key={p.id} value={p.id}>{p.first || p.full}</option>)}
        </select>
        {filtered ? (
          <button type="button" className={s.clear} onClick={() => set({ sub: 'All', flow: 'All', person: 'All', status: 'All' })}>Clear filters</button>
        ) : null}
      </div>

      <div className={s.stats}>
        {STATS.map(c => (
          <button key={c.key} type="button" className={`${s.stat}${f.status === c.key && c.key !== 'All' ? ` ${s.statOn}` : ''}`} onClick={() => set({ status: f.status === c.key ? 'All' : c.key })} aria-pressed={f.status === c.key}>
            <span className={s.statLabel}><span className={s.statDot} style={{ background: c.dot }} aria-hidden="true" />{c.label}</span>
            <span className={s.statN} style={{ color: c.fg }}>{counts[c.key]}</span>
          </button>
        ))}
      </div>

      {layout === 'people' ? (
        <>
          <div className={s.sect}><span className={s.sectTitle}>People</span></div>
          {people.length ? (
            <div className={s.people}>
              {people.map(p => {
                const [now, ...rest] = p.shown
                const slots = Array.from({ length: Math.max(p.capacity, p.load.length) }, (_, i) => p.load[i])
                return (
                  <div key={p.id} className={`${s.person}${p.red ? ` ${s.personRed}` : ''}`}>
                    <div className={s.pTop}>
                      <span className={s.av} style={{ background: avBg(p.id) }} aria-hidden="true">{initial(p.name)}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className={s.pName}>{p.name}</div>
                        <div className={s.pRole}>{p.role}</div>
                      </div>
                      {p.red ? <span className={`${s.pPill} ${s.pPillRed}`}><span className={`${s.statDot} ${s.sRed}`} style={{ width: 6, height: 6 }} />{p.red} overdue</span> : null}
                      {p.waiting ? <span className={`${s.pPill} ${s.pPillWait}`}><span className={`${s.statDot} ${s.sWaiting}`} style={{ width: 6, height: 6 }} />{p.waiting} waiting</span> : null}
                    </div>
                    <div>
                      <div className={s.loadHead}>
                        <span>Load</span>
                        <span className={p.loadTone === 'over' ? s.loadOver : p.loadTone === 'full' ? s.loadFull : p.loadTone === 'free' ? s.loadFree : s.loadSome}>{p.loadLabel}</span>
                      </div>
                      <div className={s.slots}>
                        {slots.map((t, i) => <span key={i} className={`${s.slot}${t ? ` ${TONE[t.tone].slot}` : ''}`} />)}
                      </div>
                    </div>
                    {now ? (
                      <Link href={href(now)} className={`${s.now} ${TONE[now.tone].box}`}>
                        <span className={s.nowHead}>
                          <span className={s.nowKicker}>Now on</span>
                          <span className={s.grow} />
                          <span className={s.mono}>{now.trackId}</span>
                        </span>
                        <span className={s.nowTitle}>{now.title}</span>
                        <span className={s.nowSub}>
                          <span className={s.subDot} style={{ background: now.sub?.dot }} aria-hidden="true" />
                          {now.sub?.name ?? '—'} · {now.flowName}
                        </span>
                        <span className={s.segs}>
                          {now.stages.map((n, i) => (
                            <span key={i} title={n} className={`${s.segBar}${i < now.cur ? ` ${s.segDone}` : i === now.cur ? ` ${TONE[now.tone].slot}` : ''}`} />
                          ))}
                        </span>
                        <span className={s.nowStage}>
                          <span className={s.nowStageName}>Stage {now.cur + 1}/{now.stages.length} · {now.stageName}</span>
                          <span className={s.muted}>· {now.days} days on this stage</span>
                        </span>
                        {now.why ? <span className={`${s.why} ${TONE[now.tone].fg}`}>{now.why}</span> : null}
                      </Link>
                    ) : null}
                    {p.load.length === 0 ? <div className={s.free}>Free · can take new work</div> : null}
                    {rest.length ? (
                      <div>
                        <div className={s.restHead}>Also on · {rest.length}</div>
                        {rest.map(t => (
                          <Link key={t.projectId} href={href(t)} className={s.rest}>
                            <span className={`${s.restDot} ${TONE[t.tone].slot}`} aria-hidden="true" />
                            <span style={{ minWidth: 0 }}>
                              <span className={s.restTitle} style={{ display: 'block' }}>{t.title}</span>
                              <span className={s.restStage} style={{ display: 'block' }}>{t.flowName} · {t.stageName}</span>
                            </span>
                            <span className={`${s.restDue}${t.tone === 'red' ? ` ${s.daysLate}` : ''}`}>{dueLabel(t.due)}</span>
                          </Link>
                        ))}
                      </div>
                    ) : null}
                    <div className={s.pFoot}>
                      <span>On time {p.onTime === null ? '—' : `${p.onTime}%`}</span>
                      <span>·</span>
                      <span>Avg {p.avgDays === null ? '—' : p.avgDays} d/stage</span>
                      <span className={s.grow} />
                      <button type="button" className={s.pBtn} onClick={() => set({ person: f.person === p.id ? 'All' : p.id })}>
                        {f.person === p.id ? 'Show everyone' : `Only ${p.name}`}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className={s.none}>Nobody matches these filters.</div>
          )}
        </>
      ) : (
        <div className={s.flowWrap}>
          <div className={s.loadBox}>
            <div className={s.loadBoxTitle}>People load</div>
            <div className={s.loadGrid}>
              {board.team
                .map(p => ({ p, mine: shown.filter(t => t.owner === p.id) }))
                .sort((a, b) => b.mine.length - a.mine.length)
                .map(({ p, mine }) => (
                  <button key={p.id} type="button" className={`${s.loadRow}${f.person === p.id ? ` ${s.loadRowOn}` : ''}`} onClick={() => set({ person: f.person === p.id ? 'All' : p.id })}>
                    <span className={s.avSmall} style={{ background: avBg(p.id) }} aria-hidden="true">{initial(p.first || p.full)}</span>
                    <span style={{ minWidth: 0 }}>
                      <span className={s.loadName} style={{ display: 'block' }}>{p.first || p.full}</span>
                      <span className={s.slotsThin}>
                        {Array.from({ length: Math.max(p.capacity, mine.length) }, (_, i) => mine[i]).map((t, i) => (
                          <span key={i} className={`${s.slot}${t ? ` ${TONE[t.tone].slot}` : ''}`} />
                        ))}
                      </span>
                    </span>
                    <span className={`${s.loadCount} ${mine.length > p.capacity ? s.loadOver : mine.length === p.capacity ? s.loadFull : mine.length === 0 ? s.loadFree : s.loadSome}`}>{mine.length}</span>
                  </button>
                ))}
            </div>
          </div>
          <div className={s.sect} style={{ margin: 0 }}><span className={s.sectTitle}>Ongoing workflows</span></div>
          {lanes.length ? (
            lanes.map(l => (
              <div key={l.key} className={s.lane}>
                <div className={s.laneHead}>
                  <span className={s.laneIcon} aria-hidden="true">{l.icon}</span>
                  <span className={s.laneName}>{l.name}</span>
                  <span className={s.laneMeta}>{l.count} ongoing{l.red ? ` · ${l.red} overdue` : ''}</span>
                  <span className={s.grow} />
                  <span className={s.prog} title="Average progress"><span className={s.progFill} style={{ width: `${l.pct}%`, display: 'block' }} /></span>
                  <span className={s.progPct}>{l.pct}%</span>
                </div>
                <div className={s.laneScroll}>
                  <div className={s.laneGrid} style={{ gridTemplateColumns: `repeat(${l.columns.length}, minmax(140px, 1fr))` }}>
                    {l.columns.map((c, i) => (
                      <div key={i} className={`${s.col}${c.slow ? ` ${s.colSlow}` : ''}`}>
                        <div className={s.colHead}>
                          <span className={s.colName}>{c.name}</span>
                          <span className={s.colCount}>{c.tasks.length}</span>
                          <span className={s.grow} />
                          {c.slow ? <span className={s.turtle} title="Slowest stage">🐢 {c.avg}d</span> : c.tasks.length ? <span className={s.avgLabel}>{c.avg}d avg</span> : null}
                        </div>
                        {c.tasks.map(t => (
                          <Link key={t.projectId} href={href(t)} title={t.title} className={`${s.chip} ${TONE[t.tone].box}`}>
                            <span className={s.chipTop}>
                              <span className={`${s.restDot} ${TONE[t.tone].slot}`} aria-hidden="true" />
                              <span className={s.chipTitle}>{t.title}</span>
                            </span>
                            <span className={s.chipLine}>
                              <span className={s.avTiny} style={{ background: avBg(t.owner) }} aria-hidden="true">{initial(t.ownerName)}</span>
                              <span className={s.ellipsis}>{t.ownerName}</span>
                              <span className={s.grow} />
                              <span className={t.days >= 4 ? s.daysLate : s.muted}>{t.days}d</span>
                            </span>
                            {t.why ? <span className={`${s.chipWhy} ${TONE[t.tone].fg}`}>{t.why}</span> : null}
                          </Link>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className={s.none}>No ongoing tasks match these filters.</div>
          )}
        </div>
      )}
    </div>
  )
}
