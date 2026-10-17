import type { HrIconName } from '@/components/hrv/icons'
import { dayMon } from '@/lib/attendance/engine'
import { levelRows, orgRows, recordsView } from './hr-view'
import { HIRE_FILTERS, HIRE_STATUS, daysToFill, dayLabel, hm, missingFor, positionLabel, shiftDay, type ChipTone, type HrAppData } from './model'

/**
 * HR Mobile's generic pages (2026-10-17, the handoff's `page()` — Hiring's Requests, Insights and Talent Bank,
 * Attendance's Records, the org chart and the levels, Documents and Letters, the room schedule): one template (an
 * intro, a primary button, count tiles, filter pills, titled sections of rows), filled from the portal's own modules.
 * HR Costing, Payroll, Payment and the Audit Log are the desktop's (null: the page that says so). Pure.
 */

export type GenKey = 'hire' | 'hireIns' | 'talent' | 'records' | 'hrc' | 'pay' | 'pmt' | 'hierChart' | 'hierLevels' | 'docDocs' | 'docLetters' | 'roomSched' | 'audit'
export type Tone = 'clay' | 'slate' | 'olive' | 'gold' | 'walnut'
export type ChipT = 'ok' | 'warn' | 'bad' | 'info' | 'mute'

/** The chips' colours (the prototype's `chipC`). */
export const CHIP_C: Readonly<Record<ChipT, [string, string]>> = {
  ok: ['var(--hr2-in-bg)', 'var(--ds-success)'],
  warn: ['var(--hr2-late-bg)', 'rgb(var(--tone-clay-deep))'],
  bad: ['var(--ds-danger-bg)', 'var(--ds-danger)'],
  info: ['rgb(var(--tone-slate))', 'rgb(var(--tone-slate-deep))'],
  mute: ['var(--ds-surface-3)', 'var(--ds-ink-2)'],
}

/** What a row opens. */
export type Open =
  | { k: 'person'; id: string }
  | { k: 'hire'; id: string }
  | { k: 'talent'; id: string }
  | { k: 'booking'; id: string }
  | { k: 'book'; roomId: string }
  | { k: 'letter'; id: string }
  | { k: 'document'; id: string }
  | { k: 'facts'; facts: Array<[string, string]> }

export type Lead = { kind: 'person'; name: string } | { kind: 'icon'; icon: HrIconName; tone: Tone } | { kind: 'ini'; ini: string; tone: Tone }

export interface GenRow {
  key: string
  title: string
  sub?: string
  chip?: string
  ct?: ChipT
  right?: string
  lead: Lead
  indent?: number
  open: Open
}

export interface GenSection {
  title?: string
  n?: string
  rows: GenRow[]
}

export interface GenPage {
  eyebrow: string
  title: string
  intro?: string
  primary?: { label: string; act: 'newHire' | 'book' | 'desk' }
  tiles?: Array<{ n: string; label: string; c: string }>
  pills?: Array<{ k: string; label: string; n: number | string }>
  sections: GenSection[]
  /** What an empty list says. */
  empty: string
}

/** Each page's name and icon — the Home cards' items, the eyebrow over its title. */
export const GEN_META: Readonly<Record<GenKey, { eyebrow: string; label: string; icon: HrIconName }>> = {
  hire: { eyebrow: 'Hiring', label: 'Requests', icon: 'hire' },
  hireIns: { eyebrow: 'Hiring', label: 'Insights', icon: 'report' },
  talent: { eyebrow: 'Hiring', label: 'Talent Bank', icon: 'staff' },
  records: { eyebrow: 'Attendance', label: 'Records', icon: 'report' },
  hrc: { eyebrow: 'HR & Payroll', label: 'HR Costing', icon: 'report' },
  pay: { eyebrow: 'HR & Payroll', label: 'Payroll', icon: 'payroll' },
  pmt: { eyebrow: 'HR & Payroll', label: 'Payment', icon: 'out' },
  hierChart: { eyebrow: 'People Management', label: 'Org chart', icon: 'org' },
  hierLevels: { eyebrow: 'People Management', label: 'Levels', icon: 'tree' },
  docDocs: { eyebrow: 'Documentation', label: 'Documents', icon: 'doc' },
  docLetters: { eyebrow: 'Documentation', label: 'Letters', icon: 'doc' },
  roomSched: { eyebrow: 'Admin', label: 'Room schedule', icon: 'room' },
  audit: { eyebrow: 'Admin', label: 'Audit Log', icon: 'report' },
}

const OL = 'rgb(var(--tone-olive-deep))'
const CL = 'var(--hr2-accent)'
const SL = 'rgb(var(--tone-slate-deep))'
const DG = 'var(--ds-danger)'

const TONE_CT: Readonly<Record<ChipTone, ChipT>> = { alert: 'warn', ledger: 'ok', danger: 'bad', info: 'info', plain: 'mute' }

const ext = (file: string) => (file.split('.').pop() || 'file').toUpperCase().slice(0, 4)
const size = (n: number | null) => (n == null ? '' : n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`)
const iso = (s: string | undefined | null) => (s ? s.slice(0, 10) : '')

/** Where a letter stands with its person: acknowledged, read, or sent. */
export function letterState(l: { ackAt?: string | null; readAt?: string | null }): [string, ChipT] {
  return l.ackAt ? ['Acknowledged', 'ok'] : l.readAt ? ['Read', 'info'] : ['Sent', 'warn']
}

/** One generic page for its key, its filter (the pill picked) and the day (Room schedule). Null: a desktop page. */
export function genPage(key: GenKey, d: HrAppData, filter: string | null, day: string): GenPage | null {
  const meta = GEN_META[key]
  const base = { eyebrow: meta.eyebrow, title: meta.label }

  if (key === 'hire') {
    const F = filter ?? 'all'
    const shown = d.hires.filter(h => F === 'all' || (HIRE_FILTERS.find(f => f.key === F)?.statuses ?? []).includes(h.status))
    return {
      ...base,
      primary: d.may.hireCreate ? { label: '+ New hiring request', act: 'newHire' } : undefined,
      pills: [{ k: 'all', label: 'All', n: d.hires.length }, ...HIRE_FILTERS.map(f => ({ k: f.key, label: f.label, n: d.hires.filter(h => f.statuses.includes(h.status)).length }))],
      sections: [{
        rows: shown.map(h => {
          const [label, tone] = HIRE_STATUS[h.status] ?? ['—', 'plain']
          return {
            key: h.id, title: positionLabel(h), sub: `${h.company || h.dept} · asked by ${h.requester}`, chip: label, ct: TONE_CT[tone],
            right: `${h.candidates.length} cand.`, lead: { kind: 'icon', icon: 'hire', tone: 'clay' }, open: { k: 'hire', id: h.id },
          }
        }),
      }],
      empty: 'No requests here.',
    }
  }

  if (key === 'hireIns') {
    const open = d.hires.filter(h => h.status === 'submitted' || h.status === 'needs_info' || h.status === 'acknowledged').length
    const filled = daysToFill(d.hires)
    const avg = filled.length ? Math.round(filled.reduce((s, x) => s + x.days, 0) / filled.length) : null
    const depts = [...new Set(d.hires.map(h => h.dept || '—'))]
    const cands = d.hires.flatMap(h => h.candidates)
    const sources = [...new Set(cands.map(c => c.source).filter((x): x is string => !!x))]
    return {
      ...base,
      tiles: [{ n: String(open), label: 'Open roles', c: CL }, { n: avg == null ? '—' : `${avg} d`, label: 'Time to hire', c: OL }, { n: String(filled.length), label: 'Filled', c: SL }],
      sections: [
        {
          title: 'By department',
          rows: depts.map(dept => {
            const hs = d.hires.filter(h => (h.dept || '—') === dept)
            const fd = filled.filter(x => (x.hire.dept || '—') === dept)
            const n = hs.reduce((s, h) => s + h.candidates.length, 0)
            const avgD = fd.length ? Math.round(fd.reduce((s, x) => s + x.days, 0) / fd.length) : null
            return {
              key: dept, title: dept, sub: `${n} candidate${n === 1 ? '' : 's'}`, right: avgD == null ? '—' : `${avgD} d`, lead: { kind: 'icon', icon: 'report', tone: 'clay' },
              open: { k: 'facts', facts: [['Requests', String(hs.length)], ['Candidates', String(n)], ['Avg. time to hire', avgD == null ? '—' : `${avgD} days`]] },
            }
          }),
        },
        {
          title: 'Where candidates come from',
          rows: sources.map(src => {
            const n = cands.filter(c => c.source === src).length
            return { key: src, title: src, right: `${Math.round((n / Math.max(1, cands.length)) * 100)}%`, lead: { kind: 'icon', icon: 'link', tone: 'gold' }, open: { k: 'facts', facts: [['Candidates', String(n)]] } }
          }),
        },
      ].filter(s => s.rows.length > 0) as GenSection[],
      empty: 'No request yet.',
    }
  }

  if (key === 'talent') {
    return {
      ...base,
      intro: 'People who applied before and are worth asking again.',
      sections: [{
        rows: d.talents.map(t => ({ key: t.id, title: t.name, sub: `${t.position} · ${t.dept}`, right: t.when, lead: { kind: 'person', name: t.name }, open: { k: 'talent', id: t.id } })),
      }],
      empty: 'Nobody kept on file yet.',
    }
  }

  if (key === 'records') {
    if (!d.att) return null
    const v = recordsView(d.att)
    const m = d.att.month.month
    return {
      eyebrow: 'Attendance', title: `Records · ${dayLabel(m, { month: 'long' })}`,
      tiles: v.tiles.map(([n, label], i) => ({ n, label, c: [OL, CL, DG][i] })),
      sections: [{ rows: v.rows.map(r => ({ key: r.id, title: r.name, sub: r.sub, right: r.right, lead: { kind: 'person', name: r.name }, open: { k: 'person', id: r.id } })) }],
      empty: 'Nobody clocks this month yet.',
    }
  }

  if (key === 'hierChart') {
    if (!d.att) return null
    return {
      ...base,
      sections: [{
        rows: orgRows(d.att.config.people).map(({ person, depth }) => ({
          key: person.id, title: person.name, sub: person.title ?? 'No title', indent: Math.min(depth, 4), right: depth ? '' : 'Top',
          lead: { kind: 'person', name: person.name }, open: { k: 'person', id: person.id },
        })),
      }],
      empty: 'Nobody on the chart yet.',
    }
  }

  if (key === 'hierLevels') {
    if (!d.att) return null
    const tones: Tone[] = ['olive', 'slate', 'gold', 'clay', 'walnut']
    return {
      ...base,
      sections: [{
        rows: levelRows(d.att.config).map((l, i) => ({
          key: String(l.rank), title: `L${l.rank} · ${l.name}`, sub: `${l.people} ${l.people === 1 ? 'person' : 'people'}`, lead: { kind: 'ini', ini: `L${l.rank}`, tone: tones[i % 5] },
          open: { k: 'facts', facts: [['Rank', String(l.rank)], ['People', String(l.people)]] },
        })),
      }],
      empty: 'No levels yet.',
    }
  }

  if (key === 'docDocs') {
    const F = filter ?? 'co'
    const docs = d.documents ?? []
    // The old app's Data center (2026-10-11): who has a compulsory letter not on file.
    const missing = d.staff.map(p => ({ p, m: missingFor(d, p.id) })).filter(x => x.m.length)
    return {
      ...base,
      pills: [
        { k: 'co', label: 'Company', n: docs.length }, { k: 'me', label: 'Personal', n: d.letters.length },
        ...(missing.length ? [{ k: 'miss', label: 'Missing', n: missing.length }] : []),
      ],
      sections: [{
        rows: F === 'co'
          ? docs.map(x => ({ key: x.id, title: x.name, sub: [ext(x.file), size(x.size), x.depts.join(', ')].filter(Boolean).join(' · '), right: dayMon(iso(x.at)), lead: { kind: 'icon', icon: 'doc', tone: 'olive' }, open: { k: 'document', id: x.id } }))
          : F === 'miss'
            ? missing.map(({ p, m }) => ({
              key: p.id, title: p.name, sub: `${m.join(', ')} missing`, chip: 'Missing', ct: 'bad', lead: { kind: 'person', name: p.name },
              open: { k: 'facts', facts: [['Title', p.title || '—'], ['Department', p.dept || '—'], ['Missing', m.join(', ')]] },
            }))
            : lettersRows(d),
      }],
      empty: F === 'co' ? 'No company documents yet.' : F === 'miss' ? 'Nothing missing.' : 'No letters on file.',
    }
  }

  if (key === 'docLetters') {
    return { ...base, primary: { label: '+ New letter', act: 'desk' }, sections: [{ rows: lettersRows(d) }], empty: 'No letters on file.' }
  }

  if (key === 'roomSched') {
    const days = Array.from({ length: 7 }, (_, i) => shiftDay(d.today, i))
    return {
      eyebrow: 'Admin', title: day === d.today ? 'Room schedule · today' : `Room schedule · ${dayLabel(day, { weekday: 'short', day: 'numeric', month: 'short' })}`,
      primary: d.may.book && d.rooms.length ? { label: 'Book a room', act: 'book' } : undefined,
      pills: days.map(x => ({ k: x, label: x === d.today ? 'Today' : dayLabel(x, { weekday: 'short', day: 'numeric' }), n: d.bookings.filter(b => b.date === x).length || '' })),
      sections: d.rooms.map(r => {
        const its = d.bookings.filter(b => b.roomId === r.id && b.date === day).sort((a, b) => a.from - b.from)
        const rows: GenRow[] = its.map(b => ({
          key: b.id, title: `${hm(b.from)}–${hm(b.to)}`, sub: b.title, right: b.guest ? b.company ?? '' : b.byName, lead: { kind: 'icon', icon: 'room', tone: 'walnut' }, open: { k: 'booking', id: b.id },
        }))
        if (!rows.length) rows.push({ key: `${r.id}-free`, title: 'Free all day', sub: `${r.seats} seats`, chip: 'Free', ct: 'ok', lead: { kind: 'icon', icon: 'room', tone: 'walnut' }, open: { k: 'book', roomId: r.id } })
        return { title: r.name, n: `${r.seats} seats`, rows }
      }),
      empty: 'No meeting rooms yet.',
    }
  }

  return null
}

function lettersRows(d: HrAppData): GenRow[] {
  return [...d.letters]
    .sort((a, b) => ((a.filedAt ?? '') < (b.filedAt ?? '') ? 1 : -1))
    .map(l => {
      const [chip, ct] = letterState(l)
      const who = l.staffName ?? d.staff.find(p => p.id === l.staffId)?.name ?? ''
      return {
        key: l.id, title: l.typeName, sub: [who, l.filedAt ? `filed ${dayMon(iso(l.filedAt))}` : ''].filter(Boolean).join(' · '), chip, ct,
        lead: { kind: 'icon', icon: 'doc', tone: 'olive' }, open: { k: 'letter', id: l.id },
      }
    })
}
