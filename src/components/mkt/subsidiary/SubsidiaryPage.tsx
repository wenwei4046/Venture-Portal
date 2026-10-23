'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { addDays, type MktBoard, type MktSub } from '@/lib/marketing/board'
import { addMonths, calendarEvents, monthCells, monthLabel, monthOf, weekCells, weekLabel, type CalEvent, type CalTone } from '@/lib/marketing/calendar'
import {
  agoLabel, feedLine, filterCount, keyDates, NO_FILTER, passesSub, SUB_STATUSES, SUB_TYPES, subProjects, subStats, timelineBars,
  timelineHeads, timelineLeft, timelineTitle, timelineWindow, type SubFeedEvent, type SubFilter, type SubType,
} from '@/lib/marketing/subsidiary'
import { trailTime } from '@/lib/marketing/task'
import { groupLabel, groupTone, rosterGroups, sameGroup, type MktTone } from '@/lib/marketing/groups'
import s from './subsidiary.module.css'

// A subsidiary's page (`Subsidiary Page.dc.html`, ④-2): who it is and its PIC; where its work stands (five cards);
// its dates by Month, Week or Timeline — coloured by group (a People title), red once passed undone, done faded — with
// HR's holidays as ⚑ key dates and the handoff's filter (type, group, status); ⚡ Recent activity from its projects' trails; and its
// projects with how far each has come. Every item opens its project.

const TONE_CLASS: Record<MktTone, string> = {
  content: s.team_content, social: s.team_social, design: s.team_design, ads: s.team_ads, brand: s.team_brand, manager: s.team_manager, none: s.team_none,
}
const TEAM = (g: string) => TONE_CLASS[groupTone(g)]
const TONE: Record<string, string> = { red: s.red, waiting: s.waiting, done: s.done, draft: s.draft }
const WD = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const KIND_EMOJI = { product: '📦', quick: '⚡', recurring: '🔁' } as const
type View = 'month' | 'week' | 'timeline'

const href = (trackId: string | null) => (trackId ? `/marketing/projects/${encodeURIComponent(trackId)}` : '/marketing/projects')
const evClass = (e: CalEvent) => `${s.item} ${e.tone === 'red' ? s.red : e.team ? TEAM(e.team) : s.draft}${e.tone === 'done' ? ` ${s.faded}` : ''}`
const evEmoji = (e: CalEvent) => (e.recur ? '🔁' : e.quick ? '⚡' : '⏱')

export default function SubsidiaryPage({ board, sub, feed }: { board: MktBoard; sub: MktSub; feed: SubFeedEvent[] }) {
  const [view, setView] = useState<View>('month')
  const [month, setMonth] = useState(() => monthOf(board.today))
  const [week, setWeek] = useState(board.today)
  const [keyOn, setKeyOn] = useState(false)
  const [filterOpen, setFilterOpen] = useState(false)
  const [filter, setFilter] = useState<SubFilter>(NO_FILTER)
  // Relative times ("3h ago") only once the page is in the browser — the server's clock and the browser's differ.
  const [now, setNow] = useState<number | null>(null)
  useEffect(() => setNow(Date.now()), [])

  const all = useMemo(() => calendarEvents(board).filter(e => e.sub?.id === sub.id), [board, sub.id])
  const events = all.filter(e => passesSub(e, filter))
  const stats = subStats(board, sub.id, all)
  const rows = subProjects(board, sub.id)
  const flags = keyOn ? keyDates(board) : []
  const flagsOn = (day: string) => flags.filter(f => f.day === day)
  const tw = timelineWindow(board.today)
  const heads = timelineHeads(tw)
  const bars = timelineBars(board, rows.filter(r => !filter.teams.length || filter.teams.some(g => sameGroup(g, r.team))), tw)
  // The groups to filter by: the roster's titles (2026-10-24 — the user: each title is a group).
  const groups = rosterGroups(board.team)
  const n = filterCount(filter)

  const toggle = <K extends keyof SubFilter>(k: K, v: SubFilter[K][number]) =>
    setFilter(f => {
      const cur = f[k] as readonly string[]
      return { ...f, [k]: cur.includes(v as string) ? cur.filter(x => x !== v) : [...cur, v] }
    })
  const title = view === 'month' ? monthLabel(month) : view === 'week' ? weekLabel(week) : timelineTitle(tw)
  const step = (d: number) => (view === 'month' ? setMonth(m => addMonths(m, d)) : setWeek(w => addDays(w, d * 7)))

  return (
    <div className={s.page}>
      <div className={s.head}>
        <div className={s.tile} style={{ background: `color-mix(in oklch, ${sub.dot} 14%, rgb(var(--mk-white)))` }} aria-hidden="true">{sub.emoji}</div>
        <div className={s.headText}>
          <div className={s.nameRow}>
            <h1 className={s.name}>{sub.name}</h1>
            <span className={s.dot} style={{ background: sub.dot }} aria-hidden="true" />
            {sub.client ? <span className={s.clientChip}>Client</span> : null}
          </div>
          <div className={s.picRow}>
            <span>PIC</span>
            {sub.pic ? (
              <>
                <span className={s.pic}><span className={s.picAv} aria-hidden="true">{sub.pic.slice(0, 1).toUpperCase()}</span>{sub.pic}</span>
                <span>· approves via 🔗 link</span>
              </>
            ) : <span className={s.none}>—</span>}
          </div>
        </div>
      </div>

      <div className={s.stats}>
        {stats.map(st => (
          <div key={st.key} className={`${s.stat}${st.red ? ` ${s.statRed}` : ''}`}>
            <div className={s.statLabel}><span aria-hidden="true">{st.emoji}</span>{st.label}</div>
            <div className={s.statValueRow}><span className={s.statValue}>{st.value}</span>{st.sub ? <span className={s.statSub}>{st.sub}</span> : null}</div>
          </div>
        ))}
      </div>

      <div className={s.body}>
        <div className={s.main}>
          <div className={s.toolbar}>
            <span className={s.title}>{title}</span>
            {view !== 'timeline' ? (
              <div className={s.navs}>
                <button type="button" className={s.navBtn} aria-label={view === 'month' ? 'Previous month' : 'Previous week'} onClick={() => step(-1)}>‹</button>
                <button type="button" className={s.navBtn} aria-label={view === 'month' ? 'Next month' : 'Next week'} onClick={() => step(1)}>›</button>
              </div>
            ) : null}
            <span className={s.grow} />
            <button type="button" className={`${s.keyBtn}${keyOn ? ` ${s.keyOn}` : ''}`} role="switch" aria-checked={keyOn} onClick={() => setKeyOn(v => !v)}>
              <span className={s.track} aria-hidden="true"><span className={s.knob} /></span>⚑ Key dates
            </button>
            <button type="button" className={`${s.filterBtn}${filterOpen || n ? ` ${s.filterOn}` : ''}`} aria-expanded={filterOpen} onClick={() => setFilterOpen(v => !v)}>
              Filter{n ? <span className={s.filterCount}>{n}</span> : null}
            </button>
            <div className={s.views} role="tablist" aria-label="View">
              {(['month', 'week', 'timeline'] as const).map(v => (
                <button key={v} type="button" role="tab" aria-selected={view === v} className={`${s.viewBtn}${view === v ? ` ${s.viewOn}` : ''}`} onClick={() => setView(v)}>
                  {v === 'month' ? 'Month' : v === 'week' ? 'Week' : 'Timeline'}
                </button>
              ))}
            </div>
            {filterOpen ? (
              <div className={s.pop} role="dialog" aria-label="Filter">
                <div>
                  <div className={s.popHead}>Type</div>
                  <div className={s.chips}>
                    {SUB_TYPES.map(t => (
                      <button key={t.key} type="button" aria-pressed={filter.types.includes(t.key)} className={`${s.chip}${filter.types.includes(t.key) ? ` ${s.chipOn}` : ''}`} onClick={() => toggle('types', t.key as SubType)}>
                        <span aria-hidden="true">{t.icon}</span>{t.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <div className={s.popHead}>Group</div>
                  <div className={s.chips}>
                    {groups.map(t => (
                      <button key={t} type="button" aria-pressed={filter.teams.includes(t)} className={`${s.chip}${filter.teams.includes(t) ? ` ${s.chipOn}` : ''}`} onClick={() => toggle('teams', t)}>
                        <span className={`${s.chipDot} ${TEAM(t)}`} aria-hidden="true" />{groupLabel(t)}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <div className={s.popHead}>Status</div>
                  <div className={s.chips}>
                    {SUB_STATUSES.map(t => (
                      <button key={t.key} type="button" aria-pressed={filter.statuses.includes(t.key)} className={`${s.chip}${filter.statuses.includes(t.key) ? ` ${s.chipOn}` : ''}`} onClick={() => toggle('statuses', t.key as CalTone)}>
                        <span className={`${s.chipDot} ${s[`dot_${t.key}`]}`} aria-hidden="true" />{t.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          {view === 'month' ? (
            <div className={s.month}>
              <div className={s.wdRow}>{WD.map(w => <div key={w} className={s.wd}>{w}</div>)}</div>
              <div className={s.grid}>
                {monthCells(month, events, board.today).map(c => (
                  <div key={c.day} className={`${s.cell}${c.out ? ` ${s.cellOut}` : ''}`}>
                    <div className={s.cellTop}>
                      {flagsOn(c.day).map(f => <span key={f.name} className={s.flag} title={f.name}>⚑ {f.short}</span>)}
                      <span className={s.grow} />
                      <span className={`${s.dayN}${c.today ? ` ${s.dayToday}` : ''}`}>{c.n === 1 ? `${c.n} ${monthLabel(c.day).slice(0, 3)}` : c.n}</span>
                    </div>
                    {[...c.events].sort((a, b) => Number(b.tone === 'red') - Number(a.tone === 'red')).map(e => (
                      <Link key={e.id} href={href(e.trackId)} className={evClass(e)} title={`${e.title} · ${e.line2} · ${e.label}`}>
                        <span className={s.itemEmoji} aria-hidden="true">{evEmoji(e)}</span>
                        <span className={s.itemTitle}>{e.title}</span>
                      </Link>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {view === 'week' ? (
            <div className={s.week}>
              {weekCells(week, events, board.today).map((c, i) => (
                <div key={c.day} className={`${s.wcol}${c.today ? ` ${s.wcolToday}` : ''}`}>
                  <div className={s.wcolHead}>
                    <span className={s.wcolWd}>{WD[i]}</span>
                    <span className={`${s.wcolN}${c.today ? ` ${s.wcolNToday}` : ''}`}>{c.n}</span>
                    {flagsOn(c.day).map(f => <span key={f.name} className={s.flag} title={f.name}>⚑ {f.name}</span>)}
                  </div>
                  <div className={s.wcolBody}>
                    {[...c.events].sort((a, b) => Number(b.tone === 'red') - Number(a.tone === 'red')).map(e => (
                      <Link key={e.id} href={href(e.trackId)} className={`${evClass(e)} ${s.witem}`}>
                        <span className={s.witemKind}><span aria-hidden="true">{evEmoji(e)}</span>{e.recur ? 'Run opens' : 'Stage due'}</span>
                        <span className={s.witemTitle}>{e.title}</span>
                        <span className={s.witemLine}>{e.line2}</span>
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          {view === 'timeline' ? (
            <div className={s.tl}>
              <div className={s.tlGrid}>
                <div className={s.tlCorner}>Project</div>
                <div className={`${s.tlHead}${keyOn ? ` ${s.tlHeadTall}` : ''}`}>
                  {heads.months.map(m => <div key={`${m.name}${m.left}`} className={s.tlMonth} style={{ left: `${m.left}%` }}>{m.name}</div>)}
                  {heads.weeks.map(w => <div key={w.left} className={`${s.tlWeek}${w.left === 0 ? ` ${s.tlWeekFirst}` : ''}`} style={{ left: `${w.left}%` }}>{w.n}</div>)}
                  {flags.filter(f => f.day >= tw.start && f.day < addDays(tw.start, tw.days)).map(f => (
                    <div key={f.day + f.name} className={`${s.flag} ${s.tlFlag}`} style={{ left: `${timelineLeft(tw, f.day)}%` }} title={f.name}>⚑ {f.short}</div>
                  ))}
                </div>
                {bars.length ? bars.map(b => (
                  <div key={b.id} className={s.tlRow}>
                    <div className={s.tlLabel}><span className={s.tlLabelText}>{b.title}</span></div>
                    <div className={s.tlTrack}>
                      <Link href={href(b.trackId)} className={`${s.tlBar} ${b.tone === 'red' ? s.red : b.team ? TEAM(b.team) : s.draft}${b.tone === 'done' ? ` ${s.faded}` : ''}`}
                        style={{ left: `${b.left}%`, width: `${b.width}%` }} title={`${b.title} · ${b.range}`}>
                        {b.label}
                      </Link>
                      <span className={s.today} style={{ left: `${timelineLeft(tw, board.today)}%` }} aria-hidden="true" />
                    </div>
                  </div>
                )) : (
                  <>
                    <div className={s.tlLabel} />
                    <div className={`${s.tlTrack} ${s.tlEmpty}`}>No projects in these weeks</div>
                  </>
                )}
              </div>
            </div>
          ) : null}

          <div className={s.legend}>
            <span><span aria-hidden="true">⏱</span> Stage due date</span>
            <span><span aria-hidden="true">⚡</span> Quick task</span>
            <span><span aria-hidden="true">🔁</span> Recurring run</span>
            <span><span aria-hidden="true">⚑</span> Key date</span>
          </div>
        </div>

        <aside className={s.feed} aria-label="Recent activity">
          <div className={s.feedHead}><span aria-hidden="true">⚡</span>Recent activity</div>
          {feed.length ? feed.map(e => {
            const l = feedLine(e)
            return (
              <Link key={l.key} href={l.href} className={s.feedItem}>
                <span className={s.feedEmoji} aria-hidden="true">{l.emoji}</span>
                <span className={s.feedText}>
                  <span className={s.feedLine}>{l.text}</span>
                  <span className={s.feedWhen}>{now !== null ? agoLabel(e.at, now, board.today) : trailTime(e.at)} · {e.project.title}</span>
                </span>
              </Link>
            )
          }) : <div className={s.feedNone}>Nothing yet</div>}
        </aside>
      </div>

      <div className={s.projects}>
        <div className={s.projectsHead}><span aria-hidden="true">📁</span><span className={s.projectsTitle}>Projects</span><span className={s.projectsCount}>{rows.length}</span></div>
        <div className={s.table} role="table" aria-label="Projects">
          <div className={`${s.tr} ${s.th}`} role="row">
            <span role="columnheader">Project</span><span role="columnheader">Status</span><span role="columnheader">Progress</span>
            <span role="columnheader">Owner</span><span role="columnheader">Due</span>
          </div>
          {rows.length ? rows.map(r => {
            const pctDone = r.total ? Math.round((r.done / r.total) * 100) : 0
            return (
              <Link key={r.id} href={href(r.trackId)} className={`${s.tr}${r.tone === 'red' ? ` ${s.trRed}` : ''}`} role="row">
                <span className={s.tdProject} role="cell">
                  <span aria-hidden="true">{KIND_EMOJI[r.kind]}</span>
                  <span className={s.tdTitle}>{r.title}</span>
                  {r.team ? <span className={`${s.teamChip} ${TEAM(r.team)}`} title={r.team}>{groupLabel(r.team)}</span> : null}
                </span>
                <span role="cell"><span className={`${s.pill} ${TONE[r.tone]}`}><span className={s.pillDot} aria-hidden="true" />{r.label}</span></span>
                <span className={s.tdProgress} role="cell">
                  <span className={s.bar}><span className={`${s.barFill}${r.tone === 'red' ? ` ${s.barRed}` : r.tone === 'done' ? ` ${s.barDone}` : ''}`} style={{ width: `${pctDone}%` }} /></span>
                  <span className={s.barText}>{r.total ? `${r.done}/${r.total}` : '—'}</span>
                </span>
                <span className={s.tdOwner} role="cell">
                  {r.owner !== '—' ? <span className={s.ownerAv} aria-hidden="true">{r.owner.slice(0, 1)}</span> : null}{r.owner}
                </span>
                <span className={`${s.tdDue}${r.tone === 'red' ? ` ${s.dueRed}` : ''}`} role="cell">{r.dueLabel}</span>
              </Link>
            )
          }) : <div className={s.tableNone}>No projects yet</div>}
        </div>
      </div>
    </div>
  )
}
