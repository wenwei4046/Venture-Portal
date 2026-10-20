'use client'

import type { CSSProperties, ReactNode } from 'react'
import type { HrIconName } from '@/components/hrv/icons'
import { CHIP_C, type GenPage, type GenRow } from '@/lib/hr-app/gen-pages'
import {
  TODAY_ST, avatarOf, type ApproveRow, type BalanceRow, type CloseView, type PersonView, type RequestView, type TodayKey, type TodayRow,
} from '@/lib/hr-app/hr-view'
import {
  CAND_STAGE, MAJOR_EVENTS, MEMBER_KIND, budgetLabel, candChip, hireChip, initials, noticeAgo, noticeTag, requestStatusLabel, requestTitle,
  type CandStage, type HrHire, type HrMemberRequest, type HrTalent,
} from '@/lib/hr-app/model'
import type { Notice } from '@/lib/push/notices'
import { ackedLine, memoDay, memoFileExt, memoParas, memoUnread, memoWaiting, memoWhen, type MyMemo } from '@/lib/memos/model'
import SignaturePad, { SignatureImage } from '@/components/memos/SignaturePad'
import { letterState as myLetterState, personalIn, personalPath, personalUnseen, type MyDocuments } from '@/lib/documentation/personal'
import { docDay } from '@/lib/documentation/model'
import { Avatar, Card, Chip, Empty, Facts, Flow, Icon, MONO, Pills, Primary, Row, SectHead, Tiles, toneOf, type Tone } from './kit'
import s from './hr-app.module.css'

/**
 * HR Mobile's screens (2026-10-17, the handoff `design_handoff_hr_mobile`): the four tabs, their sub screens and the
 * generic page — and the old app's own pages (a hiring request, a talent, notifications, memos, My documents) in the
 * handoff's cards. Each draws what it is handed; the app (HrApp.tsx) holds where you are.
 */

const Chev = () => <span className={s.chev} aria-hidden="true">›</span>

const personLead = (name: string) => {
  const a = avatarOf(name)
  return <Avatar bg={a.bg} fg={a.fg} ini={a.ini} />
}
const iconLead = (icon: HrIconName, tone: Tone) => {
  const t = toneOf(tone)
  return <Avatar bg={t.bg} fg={t.fg}><Icon name={icon} size={16} /></Avatar>
}

// ── Home ────────────────────────────────────────────────────────────────────

export interface HomeItem {
  key: string
  label: string
  icon: HrIconName
  tone: Tone
  badge?: number
  go: () => void
}

export function HomeScreen({ first, summary, quick, cats, memos, openMemo }: {
  first: string
  summary: string
  quick: HomeItem[]
  cats: Array<{ label: string; roman: string; tone: Tone; items: HomeItem[] }>
  /** Their memos still to acknowledge (the old Home's "Waiting for you", 2026-10-12): drawn only while there are some. */
  memos: MyMemo[]
  openMemo: (id: string) => void
}) {
  return (
    <div className={s.home}>
      <div>
        <div className={s.hello} role="heading" aria-level={1}>Good {greeting()}, {first}.</div>
        <div className={s.rule} />
        <div className={s.summary}>{summary}</div>
      </div>
      {memos.length ? (
        <div className={s.group}>
          <SectHead label="Waiting for you" count={memos.length} />
          <Card>
            {memos.map((m, i) => (
              <Row key={m.id} first={i === 0} onClick={() => openMemo(m.id)} title={m.title} sub={`From ${m.sender} · please acknowledge`} right={<Chev />}
                lead={<Avatar bg="rgb(var(--tone-olive))" fg="rgb(var(--tone-olive-deep))" font={9.5}>MEMO</Avatar>} />
            ))}
          </Card>
        </div>
      ) : null}
      <div className={s.group}>
        <SectHead label="Quick actions" />
        <div className={s.grid4}>
          {quick.map(q => {
            const t = toneOf(q.tone)
            return (
              <button key={q.key} type="button" className={s.quick} onClick={q.go}>
                <span className={s.quickTile} style={{ background: t.bg, color: t.fg }}>
                  <Icon name={q.icon} size={18} />
                  {q.badge ? <span className={s.badge}>{q.badge}</span> : null}
                </span>
                <span className={s.quickLabel}>{q.label}</span>
              </button>
            )
          })}
        </div>
      </div>
      {cats.map(c => {
        const t = toneOf(c.tone)
        return (
          <div key={c.label} className={s.group}>
            <SectHead label={c.label} roman={c.roman} romanFg={t.fg} count={`${c.items.length} page${c.items.length > 1 ? 's' : ''}`} />
            <div className={`${s.grid4} ${s.grid4Cat}`}>
              {c.items.map(it => (
                <button key={it.key} type="button" className={s.cat} onClick={it.go}>
                  <span className={s.catTile} style={{ background: t.bg, color: t.fg }}>
                    <Icon name={it.icon} size={17} />
                    {it.badge ? <span className={s.badge}>{it.badge}</span> : null}
                  </span>
                  <span className={s.catLabel}>{it.label}</span>
                </button>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

/** "morning" — by the office's clock (UTC+8), as the portal greets. */
function greeting(): string {
  const h = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kuala_Lumpur', hour: '2-digit', hourCycle: 'h23' }).format(new Date()))
  return h < 12 ? 'morning' : h < 18 ? 'afternoon' : 'evening'
}

// ── Today ───────────────────────────────────────────────────────────────────

export function TodayScreen({ rows, counts, filter, setFilter, open, closed }: {
  rows: TodayRow[]
  counts: Record<TodayKey, number>
  filter: TodayKey | 'all'
  setFilter: (k: TodayKey | 'all') => void
  open: (id: string) => void
  closed: string | null
}) {
  if (closed) return <div className={s.main}><Card><Empty>{closed}</Empty></Card></div>
  const shown = rows.filter(r => filter === 'all' || r.state === filter)
  return (
    <div className={s.main}>
      <Tiles cols={4} size={22} items={(['present', 'late', 'notin', 'leave'] as const).map(k => ({
        n: String(counts[k]), label: TODAY_ST[k].word, c: TODAY_ST[k].bar, on: filter === k, onClick: () => setFilter(filter === k ? 'all' : k),
      }))} />
      <Card>
        {shown.map((p, i) => (
          <Row key={p.id} first={i === 0} lead={personLead(p.name)} title={p.name} sub={p.sub} onClick={() => open(p.id)}
            right={<Chip text={p.chip} bg={TODAY_ST[p.state].bg} fg={TODAY_ST[p.state].fg} />} />
        ))}
        {shown.length === 0 ? <Empty>{rows.length ? 'Nobody here.' : 'Nobody clocks today.'}</Empty> : null}
      </Card>
    </div>
  )
}

// ── Approve ─────────────────────────────────────────────────────────────────

export type ApproveTab = 'hr' | 'upline' | 'decided' | 'members'

export function ApproveScreen({ tab, setTab, counts, rows, members, membersOn, open, openMember, closed }: {
  tab: ApproveTab
  setTab: (t: ApproveTab) => void
  counts: Record<'hr' | 'upline' | 'decided', number>
  rows: ApproveRow[]
  members: HrMemberRequest[]
  membersOn: boolean
  open: (id: string) => void
  openMember: (id: string) => void
  closed: string | null
}) {
  const pending = members.filter(r => r.status === 'submitted' || r.status === 'needs_info')
  return (
    <div className={s.main}>
      <Pills fill value={tab} onPick={setTab} items={[
        { k: 'hr' as const, label: 'Pending', n: counts.hr },
        { k: 'upline' as const, label: 'At upline', n: counts.upline },
        { k: 'decided' as const, label: 'Decided', n: counts.decided },
        // Not in the handoff (the user, 2026-10-17 — "keep all"): Member services' requests, the old Review.
        ...(membersOn ? [{ k: 'members' as const, label: 'Members', n: pending.length }] : []),
      ]} />
      <Card>
        {tab === 'members'
          ? pending.map((r, i) => (
            <Row key={r.id} first={i === 0} minH={60} pad="12px 14px" lead={personLead(r.byName)} title={requestTitle(r) || MEMBER_KIND[r.kind]}
              sub={`${MEMBER_KIND[r.kind]} · ${r.sub} · ${r.byName}`} onClick={() => openMember(r.id)}
              right={<span className={s.rightCol}><span style={{ fontSize: 11, fontWeight: 600, color: 'rgb(var(--tone-clay-deep))' }}>{requestStatusLabel(r.status)}</span><span style={{ ...MONO, fontSize: 11, color: 'var(--ds-ink-3)' }}>{r.code}</span></span>} />
          ))
          : closed ? null : rows.map((r, i) => (
            <Row key={r.id} first={i === 0} minH={60} pad="12px 14px" lead={personLead(r.who)} title={r.who} sub={`${r.kind} · ${r.when}`} onClick={() => open(r.id)}
              right={<span className={s.rightCol}><span style={{ fontSize: 11, fontWeight: 600, color: r.stFg }}>{r.st}</span><span style={{ ...MONO, fontSize: 11, color: 'var(--ds-ink-3)' }}>{r.since}</span></span>} />
          ))}
        {tab === 'members' ? (pending.length === 0 ? <Empty>Nothing here.</Empty> : null) : closed ? <Empty>{closed}</Empty> : rows.length === 0 ? <Empty>Nothing here.</Empty> : null}
      </Card>
    </div>
  )
}

/** A request's page: who, what, the facts, the changes, the approval flow, the note. */
export function RequestScreen({ who, kind, when, v, note, setNote, canDecide }: {
  who: string
  kind: string
  when: string
  v: RequestView
  note: string
  setNote: (x: string) => void
  canDecide: boolean
}) {
  const a = avatarOf(who)
  return (
    <div className={s.sub} style={{ paddingBottom: 24 }}>
      <div className={s.reqHead}>
        <Avatar bg={a.bg} fg={a.fg} ini={a.ini} size={44} radius={11} font={14} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className={s.reqWho}>{who}</div>
          <div className={s.reqKind}>{kind} · {when}</div>
        </div>
        <Chip text={v.st} bg={v.stBg} fg={v.stFg} />
      </div>
      <Facts items={v.facts.map(([k, x]) => ({ k, v: x }))} />
      {v.changes.length ? (
        <div className={s.facts}>
          {v.changes.map((c, i) => (
            <div key={c.f + i} className={s.change} style={{ borderTop: i ? '1px solid var(--ds-border)' : 0 }}>
              <span className={s.changeF}>{c.f}</span>
              <span className={s.changeV}><span className={s.struck}>{c.from}</span> → {c.to}</span>
            </div>
          ))}
        </div>
      ) : null}
      <div className={s.flowCard}>
        <div className={s.flowTitle}>Approval flow</div>
        <Flow nodes={v.nodes.map((n, i) => ({ key: String(i), state: n.state, head: n.text, label: n.label, labelFg: n.fg, at: n.at }))} />
      </div>
      {canDecide ? (
        <label className={s.noteField}>
          <span className={s.noteLabel}>Note</span>
          <textarea className={s.textarea} rows={2} value={note} onChange={e => setNote(e.target.value)} />
          <span className={s.noteHint}>Needed to reject. The requester sees it.</span>
        </label>
      ) : null}
    </div>
  )
}

/** A member's request (Member services — the old Review's page, in the handoff's cards). */
export function MemberScreen({ r, note, setNote, canDecide }: { r: HrMemberRequest; note: string; setNote: (x: string) => void; canDecide: boolean }) {
  const facts = ([
    ['Reference', r.code], ['Sub-department', r.sub], ['Submitted by', r.byName],
    ...(r.kind === 'waiting'
      ? [['Applicant', r.newPerson], ['Mobile', r.contact], ['Joining', r.start]]
      : r.kind === 'claim'
        ? [['Category', r.category], ['Location', r.location], ['Amount', r.amount ? `RM ${r.amount}` : '']]
        : [['Leaving', r.originalName], ['Effective', r.effective], ['Reason', r.reason]]),
  ] as Array<[string, string | null | undefined]>).filter(([, x]) => x).map(([k, x]) => ({ k, v: x as string }))
  const a = avatarOf(r.byName)
  return (
    <div className={s.sub}>
      <div className={s.reqHead}>
        <Avatar bg={a.bg} fg={a.fg} ini={a.ini} size={44} radius={11} font={14} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className={s.reqWho}>{requestTitle(r) || MEMBER_KIND[r.kind]}</div>
          <div className={s.reqKind}>{MEMBER_KIND[r.kind]} · {r.sub}</div>
        </div>
        <Chip text={requestStatusLabel(r.status)} bg="var(--hr2-late-bg)" fg="rgb(var(--tone-clay-deep))" />
      </div>
      <Facts items={facts} />
      {r.kind === 'replacement' ? <div className={s.meta}>Replacements need a person and an effective date. Finish them in Member services on the desktop.</div> : null}
      {canDecide ? (
        <label className={s.noteField}>
          <span className={s.noteLabel}>Note</span>
          <textarea className={s.textarea} rows={2} value={note} onChange={e => setNote(e.target.value)} />
          <span className={s.noteHint}>Needed to reject. The member sees it.</span>
        </label>
      ) : null}
    </div>
  )
}

// ── People ──────────────────────────────────────────────────────────────────

export function PeopleScreen({ q, setQ, groups, open }: {
  q: string
  setQ: (x: string) => void
  groups: Array<{ name: string; n: number; people: Array<{ id: string; name: string; title: string }> }>
  open: (id: string) => void
}) {
  return (
    <div className={s.main} style={{ gap: 12 }}>
      <input className={s.input} style={{ height: 44 }} placeholder="Search name or title" value={q} onChange={e => setQ(e.target.value)} aria-label="Search name or title" />
      {groups.map(g => (
        <div key={g.name} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span className={s.sectLabel} style={{ padding: '0 4px' }}>{g.name} · {g.n}</span>
          <Card>
            {g.people.map((p, i) => <Row key={p.id} first={i === 0} lead={personLead(p.name)} title={p.name} sub={p.title} right={<Chev />} onClick={() => open(p.id)} />)}
          </Card>
        </div>
      ))}
      {groups.length === 0 ? <Card><Empty>Nobody here.</Empty></Card> : null}
    </div>
  )
}

export function PersonScreen({ v, onCall, onMessage, onRecords }: { v: PersonView; onCall: () => void; onMessage: () => void; onRecords: () => void }) {
  const a = avatarOf(v.name)
  return (
    <div className={s.sub} style={{ padding: '20px 16px 24px' }}>
      <div className={s.personHead}>
        <Avatar bg={a.bg} fg={a.fg} ini={a.ini} size={72} radius={18} font={24} />
        <div className={s.personName}>{v.name}</div>
        <div className={s.personLine}>{v.title} · {v.dept}</div>
        <Chip text={v.chip.label} bg={v.chip.bg} fg={v.chip.fg} pad="3px 10px" />
      </div>
      <div className={s.actions3}>
        <button type="button" className={s.act} onClick={onCall}>Call</button>
        <button type="button" className={s.act} onClick={onMessage}>Message</button>
        <button type="button" className={s.act} onClick={onRecords}>Records</button>
      </div>
      <Facts pad="11px 0" items={v.facts} />
      {v.leave.length ? (
        <div className={s.leaveGrid}>
          {v.leave.map(t => (
            <div key={t.code} className={s.leaveCard}>
              <div className={s.leaveTop}><span className={s.leaveName}>{t.name}</span><span className={s.leaveCode} style={MONO}>{t.code}</span></div>
              <div className={s.leaveFig}><span style={{ ...MONO, fontSize: 22 }}>{t.left}</span><span className={s.leaveOf}>/ {t.of}</span></div>
              <span className={s.bar}><span className={s.barFill} style={{ width: t.pct, background: t.bar }} /></span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}

export function BalancesScreen({ rows, filter, setFilter, open, closed }: {
  rows: BalanceRow[]
  filter: 'all' | 'low'
  setFilter: (f: 'all' | 'low') => void
  open: (id: string) => void
  closed: string | null
}) {
  const low = rows.filter(r => r.low)
  const shown = filter === 'low' ? low : rows
  return (
    <div className={s.sub} style={{ gap: 12 }}>
      <Pills value={filter} onPick={setFilter} height={36} items={[{ k: 'all' as const, label: 'All', n: rows.length }, { k: 'low' as const, label: '2 days or less', n: low.length }]} />
      <Card>
        {shown.map((p, i) => {
          const a = avatarOf(p.name)
          return (
            <button key={p.id} type="button" className={s.row} onClick={() => open(p.id)} style={{ minHeight: 60, padding: '10px 14px', borderTop: i ? '1px solid var(--ds-border)' : 0 }}>
              <Avatar bg={a.bg} fg={a.fg} ini={a.ini} />
              <span className={s.rowText} style={{ gap: 5 }}>
                <span style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <span className={s.rowTitle}>{p.name}</span>
                  <span style={{ ...MONO, flex: 'none', fontSize: 12.5, color: p.low ? 'rgb(var(--tone-clay-deep))' : 'var(--ds-ink)' }}>{p.left}</span>
                </span>
                <span className={s.bar}><span className={s.barFill} style={{ width: p.pct, background: p.low ? 'var(--hr2-accent)' : 'rgb(var(--tone-slate-deep))' }} /></span>
              </span>
            </button>
          )
        })}
        {closed ? <Empty>{closed}</Empty> : shown.length === 0 ? <Empty>Nothing here.</Empty> : null}
      </Card>
    </div>
  )
}

export function CloseScreen({ v, closed }: { v: CloseView | null; closed: string | null }) {
  return (
    <div className={s.sub}>
      {v ? (
        <>
          <div className={s.closeCard}>
            <span className={s.sectLabel}>Closing</span>
            <span className={s.closeMonth}>{v.month}</span>
            <span className={s.closeDue}>{v.due}</span>
          </div>
          <div className={s.flowCard}>
            <Flow nodes={v.steps.map((n, i) => ({
              key: n.label, state: n.state, glyph: n.state === 'next' ? String(i + 1) : '', head: n.label, label: n.note, labelWeight: 400,
              labelFg: n.state === 'done' ? 'var(--ds-success)' : n.state === 'current' ? 'rgb(var(--tone-clay-deep))' : 'var(--ds-ink-3)',
            }))} />
          </div>
        </>
      ) : <Card><Empty>{closed ?? 'Month close could not be read.'}</Empty></Card>}
      <div className={s.footnote}>Deciding days and closing the month happen on desktop.</div>
    </div>
  )
}

// ── Generic pages ───────────────────────────────────────────────────────────

export function GenScreen({ g, filter, setFilter, onPrimary, openRow }: {
  g: GenPage
  filter: string | null
  setFilter: (k: string) => void
  onPrimary: () => void
  openRow: (r: GenRow) => void
}) {
  const F = filter ?? g.pills?.[0]?.k ?? ''
  const rows = g.sections.reduce((n, sec) => n + sec.rows.length, 0)
  return (
    <div className={s.sub} style={{ paddingBottom: 28 }}>
      {g.intro ? <div className={s.intro}>{g.intro}</div> : null}
      {g.primary ? <Primary onClick={onPrimary}>{g.primary.label}</Primary> : null}
      {g.tiles ? <Tiles items={g.tiles} /> : null}
      {g.pills ? <Pills value={F} onPick={setFilter} height={36} items={g.pills} /> : null}
      {g.sections.map((sec, si) => (
        <div key={sec.title ?? si} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {sec.title ? <SectHead label={sec.title} count={sec.n ?? ''} /> : null}
          <Card>
            {sec.rows.map((r, i) => {
              const lead = r.lead.kind === 'person' ? personLead(r.lead.name)
                : r.lead.kind === 'icon' ? iconLead(r.lead.icon, r.lead.tone)
                  : (() => { const t = toneOf(r.lead.tone); return <Avatar bg={t.bg} fg={t.fg} ini={r.lead.ini} /> })()
              const cc = CHIP_C[r.ct ?? 'mute']
              return (
                <Row key={r.key} first={i === 0} minH={58} pad={`10px 14px 10px ${14 + (r.indent ?? 0) * 22}px`} lead={lead} title={r.title} sub={r.sub} onClick={() => openRow(r)}
                  right={r.chip || r.right ? (
                    <span className={s.rightCol}>
                      {r.chip ? <Chip text={r.chip} bg={cc[0]} fg={cc[1]} pad="2px 8px" size={11} /> : null}
                      {r.right ? <span className={s.rightMono} style={MONO}>{r.right}</span> : null}
                    </span>
                  ) : undefined} />
              )
            })}
          </Card>
        </div>
      ))}
      {rows === 0 ? <Card><Empty>{g.empty}</Empty></Card> : null}
    </div>
  )
}

/** A page the phone leaves to the desktop (the handoff's `isPage`). */
export function DeskScreen({ title, icon, text = 'This page works best on a bigger screen. Open it on the desktop portal.' }: { title: string; icon: HrIconName; text?: string }) {
  return (
    <div className={s.desk}>
      <span className={s.deskTile}><Icon name={icon} size={24} /></span>
      <div className={s.deskTitle}>{title}</div>
      <div className={s.deskText}>{text}</div>
    </div>
  )
}

// ── Hiring: a request, a talent ─────────────────────────────────────────────

export function HireScreen({ hr, mayEdit, mayCreate, onStage, onAdd }: {
  hr: HrHire
  mayEdit: boolean
  mayCreate: boolean
  onStage: (cid: string, name: string, cur: CandStage) => void
  onAdd: () => void
}) {
  const ch = hireChip(hr.status)
  const facts = ([
    ['Department', hr.dept], ['Requested by', hr.requester], ['Owner', hr.ownerName ?? 'No owner yet'], ['Employment', hr.employment], ['Reason', hr.reason],
    ['Age', hr.age], ['Gender', hr.gender],
    ...(hr.status === 'filled' ? [['Hired', hr.hired], ['Hired through', hr.source], ['Cost', hr.cost ? `RM ${hr.cost}` : '—']] : []),
  ] as Array<[string, string | null | undefined]>).filter(([, v]) => v).map(([k, v]) => ({ k, v: v as string }))
  const longs = ([['Job description', hr.jd], ['Special notes', hr.notes]] as Array<[string, string | undefined]>).filter(([, v]) => v)
  return (
    <div className={s.sub}>
      <div className={s.reqHead}>
        <Avatar bg="rgb(var(--tone-clay))" fg="rgb(var(--tone-clay-deep))" size={44} radius={11}><Icon name="hire" size={18} /></Avatar>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className={s.reqWho}>{hr.position}{hr.headcount > 1 ? ` × ${hr.headcount}` : ''}</div>
          <div className={s.reqKind}>From {hr.company || hr.requester} · {hr.when}</div>
        </div>
        <Chip text={ch.label} bg={ch.bg} fg={ch.fg} />
      </div>
      <Tiles items={[{ n: budgetLabel(hr.budget), label: 'Budget', c: 'var(--hr2-accent)' }, { n: String(hr.headcount || 1), label: 'Headcount', c: 'rgb(var(--tone-olive-deep))' }, { n: (hr.start || '—').replace('Within ', '≤ '), label: 'Start', c: 'rgb(var(--tone-slate-deep))' }]} size={14} />
      <Facts items={facts} />
      {longs.map(([k, v]) => (
        <div key={k} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <SectHead label={k} />
          <div className={s.facts}><div className={s.longText}>{v}</div></div>
        </div>
      ))}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <SectHead label="Candidates" count={hr.candidates.length} />
        <Card>
          {hr.candidates.map((c, i) => {
            const cc = candChip(c.stage)
            return (
              <Row key={c.id} first={i === 0} lead={<Avatar bg={cc.bg} fg={cc.fg} ini={initials(c.name)} />} title={c.name} sub={[c.source, c.phone, c.note].filter(Boolean).join(' · ')}
                onClick={mayEdit ? () => onStage(c.id, c.name, c.stage) : undefined}
                right={<span className={s.stageBtn} style={{ background: cc.bg, color: cc.fg }}>{cc.label}{mayEdit ? ' ▾' : ''}</span>} />
            )
          })}
          {hr.candidates.length === 0 ? <Empty>No candidates yet.</Empty> : null}
        </Card>
        {mayCreate ? <button type="button" className={`${s.act}`} onClick={onAdd}>+ Add a candidate</button> : null}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <SectHead label="Audit trail" />
        <div className={s.facts}>
          {[...hr.events].reverse().map((e, i) => {
            const major = MAJOR_EVENTS.includes(e.what)
            return (
              <div key={i} className={s.trailRow} style={{ borderTop: i ? '1px solid var(--ds-border)' : 0 }}>
                <span className={s.trailDot} style={{ background: major ? 'var(--hr2-accent)' : 'var(--ds-border)' }} />
                <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                  <span className={s.trailWhat}>{e.what}</span>
                  <span className={s.trailWho}>{e.who} · {e.when}</span>
                  {e.note ? <span className={s.trailNote}>{e.note}</span> : null}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export const STAGES = Object.keys(CAND_STAGE) as CandStage[]

export function TalentScreen({ t, notes, setNotes, saveNotes, mayEdit }: { t: HrTalent; notes: string; setNotes: (x: string) => void; saveNotes: () => void; mayEdit: boolean }) {
  const facts = ([['Good fit for', t.position], ['Department', t.dept], ['Phone', t.phone], ['Email', t.email], ['Saved from', t.from || 'Added directly'], ['Saved', t.when]] as Array<[string, string | null | undefined]>)
    .filter(([, v]) => v).map(([k, v]) => ({ k, v: v as string }))
  const a = avatarOf(t.name)
  return (
    <div className={s.sub}>
      <div className={s.personHead}>
        <Avatar bg={a.bg} fg={a.fg} ini={a.ini} size={72} radius={18} font={24} />
        <div className={s.personName}>{t.name}</div>
        <div className={s.personLine}>{t.position} · {t.dept}</div>
      </div>
      <Facts items={facts} />
      <label className={s.noteField}>
        <span className={s.noteLabel}>HR notes</span>
        <textarea className={s.textarea} rows={5} readOnly={!mayEdit} value={notes} onChange={e => setNotes(e.target.value)} onBlur={saveNotes} />
      </label>
    </div>
  )
}

// ── Notifications, memos, My documents (the old app's, in the handoff's cards) ──

export function NoticesScreen({ items, fresh, open }: { items: Notice[]; fresh: ReadonlySet<string>; open: (n: Notice) => void }) {
  const now = new Date()
  if (!items.length) return <div className={s.sub}><Card><Empty>No notifications yet.</Empty></Card></div>
  const groups: Array<[string, Notice[]]> = [['New', items.filter(n => fresh.has(n.id))], ['Earlier', items.filter(n => !fresh.has(n.id))]]
  return (
    <div className={s.sub}>
      {groups.filter(([, list]) => list.length > 0).map(([label, list]) => (
        <div key={label} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <SectHead label={label} count={list.length} />
          <Card>
            {list.map((n, i) => {
              const t = noticeTag(n)
              return (
                <Row key={n.id} first={i === 0} minH={58} onClick={() => open(n)} title={n.title} sub={[n.body, noticeAgo(n.at, now)].filter(Boolean).join(' · ')}
                  lead={<Avatar bg={t.bg} fg={t.fg} font={9.5}>{t.tag}</Avatar>} right={<Chev />} />
              )
            })}
          </Card>
        </div>
      ))}
    </div>
  )
}

export function MemosScreen({ memos, open }: { memos: MyMemo[]; open: (id: string) => void }) {
  return (
    <div className={s.sub}>
      <Card>
        {memos.map((m, i) => (
          <Row key={m.id} first={i === 0} minH={60} onClick={() => open(m.id)}
            lead={<Avatar bg="rgb(var(--tone-olive))" fg="rgb(var(--tone-olive-deep))" font={9.5}>{m.kind === 'Memo' ? 'MEMO' : m.kind.toUpperCase().slice(0, 5)}</Avatar>}
            title={<span style={memoUnread(m) ? { fontWeight: 700 } : undefined}>{m.title}</span>}
            sub={memoWaiting(m) ? `From ${m.sender} · needs your acknowledgement` : m.acknowledgedAt ? ackedLine(m.acknowledgedAt) : `From ${m.sender}`}
            right={<span className={s.rightMono} style={MONO}>{memoDay(m.publishedAt)}</span>} />
        ))}
        {memos.length === 0 ? <Empty>No memos for you yet.</Empty> : null}
      </Card>
    </div>
  )
}

/**
 * One memo, read in full. Since 2026-10-20 (the user: "签完之后再来点那个 Acknowledge button") one waiting for them
 * carries the signature pad (`signing`) above the bar's Acknowledge, which waits for it; one they acknowledged shows the
 * signature they gave (`signature`).
 */
export function MemoScreen({ m, openFile, signing = null, signature = null }: {
  m: MyMemo | null
  openFile: (id: string) => void
  signing?: { value: string | null; onChange: (png: string | null) => void; busy: boolean } | null
  signature?: string | null
}) {
  if (!m) return <div className={s.sub}><Card><Empty>This memo was taken back.</Empty></Card></div>
  const waiting = memoWaiting(m)
  return (
    <div className={s.sub}>
      <div className={s.reqHead}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className={s.reqWho}>{m.title}</div>
          <div className={s.reqKind}>From {m.sender} · {memoWhen(m.publishedAt)}</div>
        </div>
        <Chip text={waiting ? 'Needs your acknowledgement' : m.acknowledgedAt ? 'Acknowledged' : 'Read'} bg={waiting ? 'var(--hr2-late-bg)' : 'var(--hr2-in-bg)'} fg={waiting ? 'rgb(var(--tone-clay-deep))' : 'var(--ds-success)'} />
      </div>
      {memoParas(m.body).length ? <div className={s.facts}>{memoParas(m.body).map((p, i) => <p key={i} className={s.longText} style={{ margin: 0 }}>{p}</p>)}</div> : null}
      {m.attachment ? (
        <Card>
          <Row first lead={<Avatar bg="rgb(var(--tone-olive))" fg="rgb(var(--tone-olive-deep))" font={9.5}>{memoFileExt(m.attachment.name)}</Avatar>} title={m.attachment.name}
            right={<span className={s.stageBtn} style={{ background: 'var(--hr2-pill-on)', color: 'rgb(var(--tone-clay-deep))' }}>View</span>} onClick={() => openFile(m.id)} />
        </Card>
      ) : null}
      {signing ? (
        <div className={s.memoSign}>
          <div className={s.memoSignLabel}>Your signature</div>
          <SignaturePad value={signing.value} onChange={signing.onChange} disabled={signing.busy} className={s.memoPad} />
          <div className={s.meta}>{signing.value ? 'Your signature, name and time are recorded for HR.' : 'Sign above, then tap Acknowledge.'}</div>
        </div>
      ) : null}
      {m.acknowledgedAt ? <div className={s.meta}>✓ {ackedLine(m.acknowledgedAt)}</div> : null}
      {m.acknowledgedAt && signature ? <SignatureImage src={signature} alt="Your signature" className={s.memoSigned} /> : null}
    </div>
  )
}

export function MyDocsScreen({ docs, folder, tab, setTab, openFolder, open }: {
  docs: MyDocuments | null
  folder: string | null
  tab: 'company' | 'personal'
  setTab: (t: 'company' | 'personal') => void
  openFolder: (id: string) => void
  open: (kind: 'document' | 'drive' | 'letter', id: string) => void
}) {
  if (!docs) return <div className={s.sub}><Card><Empty>Your documents could not be read.</Empty></Card></div>
  const held = personalIn(docs.personal, folder)
  const fileRow = (i: number, key: string, ext: string, name: string, line: string, onView: () => void) => (
    <Row key={key} first={i === 0} minH={58} onClick={onView} lead={<Avatar bg="rgb(var(--tone-olive))" fg="rgb(var(--tone-olive-deep))" font={9.5}>{ext || 'FILE'}</Avatar>} title={name} sub={line}
      right={<span className={s.stageBtn} style={{ background: 'var(--hr2-pill-on)', color: 'rgb(var(--tone-clay-deep))' }}>View</span>} />
  )
  const personal: ReactNode[] = []
  let n = 0
  for (const l of held.letters) personal.push(fileRow(n++, l.id, l.ext, l.typeName, `${l.name} · ${docDay(l.at)}${myLetterState(l) === 'new' ? ' · New' : ''}`, () => open('letter', l.id)))
  for (const f of held.folders) {
    personal.push(<Row key={f.id} first={n++ === 0} minH={58} onClick={() => openFolder(f.id)} lead={iconLead('doc', 'olive')} title={f.name}
      sub={`${f.files === 1 ? '1 file' : `${f.files} files`}${f.unseen ? ` · ${f.unseen} new` : ''}`} right={<Chev />} />)
  }
  for (const f of held.files) personal.push(fileRow(n++, f.id, f.ext, f.name, `Added ${docDay(f.at)}${f.seen ? '' : ' · New'}`, () => open('drive', f.id)))
  return (
    <div className={s.sub}>
      {folder === null ? (
        <Pills value={tab} onPick={setTab} height={36} items={[
          { k: 'company' as const, label: 'Company', n: docs.company.filter(x => !x.seen).length ? `${docs.company.filter(x => !x.seen).length} new` : '' },
          { k: 'personal' as const, label: 'Personal', n: personalUnseen(docs.personal) ? `${personalUnseen(docs.personal)} new` : '' },
        ]} />
      ) : <div className={s.meta}>{personalPath(docs.personal, folder).map(x => x.name).join(' › ')}</div>}
      <Card>
        {tab === 'company' && folder === null
          ? docs.company.map((doc, i) => fileRow(i, doc.id, doc.ext, doc.name, `Added ${docDay(doc.uploadedAt)}${doc.seen ? '' : ' · New'}`, () => open('document', doc.id)))
          : personal}
        {(tab === 'company' && folder === null ? docs.company.length === 0 : personal.length === 0)
          ? <Empty>{tab === 'company' && folder === null ? 'Nothing shared with your department yet.' : folder ? 'This folder is empty.' : 'Nothing of yours is shared with you yet.'}</Empty>
          : null}
      </Card>
    </div>
  )
}

/** An account row in Me › Profile (the old More's): an icon tile, the title, its line. */
export function accountRowStyle(): CSSProperties {
  return { display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '12px 14px', textAlign: 'left' }
}
