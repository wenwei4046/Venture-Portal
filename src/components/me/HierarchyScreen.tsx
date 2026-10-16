'use client'

import { SegmentedControl } from '@/components/ds/Controls'
import { initials } from '@/lib/me/format'
import { deptTiers, lineTiers, type OrgCard } from '@/lib/me/org'
import type { MeOrg, OrgStatus } from '@/lib/me/types'
import { Title } from './kit'

/**
 * Me › Hierarchy (2026-10-17, the handoff's `isHier`): My line — the top, each upline, you, your reports — and
 * Department — its head, its managers (tap one), that manager's team — as tiers of cards joined by connectors on a
 * full-bleed band. A dot says today's status; a tap opens the person.
 */

const DOT: Record<OrgStatus, string> = {
  present: 'var(--ds-success)', late: 'var(--ds-warning)', leave: 'var(--ds-accent)', out: 'var(--ds-border-strong)', none: 'var(--ds-border-strong)',
}
const LINE = 'var(--ds-border-strong)'

function Card({ c, onTap }: { c: OrgCard; onTap: () => void }) {
  const toned = !c.you && c.tone
  const bg = c.you ? 'var(--ds-accent-soft)' : toned ? `var(--me-tone-${c.tone})` : 'var(--ds-surface)'
  const border = c.you ? '1.5px solid var(--ds-accent)' : c.selected ? toned ? '1.5px solid var(--me-tone-ink)' : '1.5px solid var(--ds-ink)'
    : toned ? `1px solid var(--me-tone-${c.tone}-edge)` : '1px solid var(--ds-border)'
  const shadow = c.you ? '0 6px 18px rgb(189 74 25 / .14)' : toned ? '0 4px 14px rgb(63 43 34 / .08), 0 1px 3px rgb(63 43 34 / .05)' : '0 2px 6px rgb(51 36 27 / .05)'
  const av = c.you ? 52 : 42
  return (
    <button type="button" onClick={onTap} style={{
      width: c.you ? 150 : 124, boxSizing: 'border-box', padding: '14px 10px 12px', borderRadius: 16, border, background: bg, boxShadow: shadow, display: 'flex',
      flexDirection: 'column', alignItems: 'center', gap: 8, fontFamily: 'inherit', color: 'var(--ds-ink)', cursor: 'pointer', transition: 'border-color .2s cubic-bezier(.2,.8,.2,1)',
    }}>
      <span style={{ position: 'relative', display: 'block' }}>
        <span style={{
          width: av, height: av, borderRadius: '50%', display: 'grid', placeItems: 'center', fontSize: 13, fontWeight: 600, letterSpacing: '.02em',
          background: c.you ? 'var(--ds-dark)' : toned ? `var(--me-tone-${c.tone}-av)` : 'var(--ds-accent-soft)',
          color: c.you ? 'var(--ds-on-dark)' : toned ? 'rgb(255 255 255)' : 'var(--ds-ink)',
        }}>{initials(c.person.name)}</span>
        <span style={{ position: 'absolute', right: -1, bottom: 1, width: 11, height: 11, borderRadius: '50%', border: `2px solid ${toned ? bg : 'var(--ds-surface)'}`, boxSizing: 'border-box', background: DOT[c.person.status] }} />
      </span>
      <span style={{ fontSize: 12.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.02em', textAlign: 'center', lineHeight: 1.2, color: toned ? 'var(--me-tone-ink)' : 'var(--ds-ink)' }}>{c.person.name}</span>
      <span style={{ fontSize: 11.5, color: toned ? 'rgb(63 43 34 / .7)' : 'var(--ds-ink-2)', textAlign: 'center', lineHeight: 1.3, marginTop: -4 }}>{c.role}</span>
    </button>
  )
}

export function HierarchyScreen({ org, error, tab, setTab, pick, setPick, openPerson }: {
  org: MeOrg | null
  error: string | null
  tab: 'My line' | 'Department'
  setTab: (t: 'My line' | 'Department') => void
  pick: string | null
  setPick: (id: string) => void
  openPerson: (id: string) => void
}) {
  const view = !org ? null : tab === 'My line' ? lineTiers(org) : deptTiers(org, pick)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <Title title="Hierarchy" />
      <SegmentedControl options={['My line', 'Department']} value={tab} onChange={v => setTab(v as 'My line' | 'Department')} block />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontSize: 17, fontWeight: 600 }}>{view?.title ?? (tab === 'My line' ? 'Your line' : 'Department')}</span>
          <span style={{ fontSize: 12.5, color: 'var(--ds-ink-2)' }}>{view?.count ?? ''}</span>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 14px', fontSize: 12, color: 'var(--ds-ink-2)' }}>
          {([['Present', 'var(--ds-success)'], ['Late or flagged', 'var(--ds-warning)'], ['Leave', 'var(--ds-accent)'], ['Not in', 'var(--ds-border-strong)']] as const).map(([l, c]) => (
            <span key={l} style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: c }} />{l}</span>
          ))}
        </div>
      </div>
      <div style={{ margin: '0 -20px', padding: '18px 0 22px', background: 'var(--ds-surface-2)', borderTop: '1px solid var(--ds-border)', borderBottom: '1px solid var(--ds-border)' }}>
        {!view ? (
          <div style={{ padding: '0 20px', fontSize: 13, color: error ? 'var(--ds-danger)' : 'var(--ds-ink-3)' }}>{error ?? 'Reading the hierarchy…'}</div>
        ) : view.tiers.length === 0 ? (
          <div style={{ padding: '0 20px', fontSize: 13, color: 'var(--ds-ink-2)' }}>Nobody to show yet.</div>
        ) : view.tiers.map((t, ti) => {
          const multi = t.cards.length > 1
          const up = ti > 0
          const pad = multi ? 12 : 0
          return (
            <div key={`${t.label}${ti}`} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              {up ? <span style={{ width: 2, height: 12, background: LINE }} /> : null}
              <div style={{ fontSize: 10.5, letterSpacing: '.1em', textTransform: 'uppercase', fontWeight: 600, color: 'var(--ds-ink-3)', padding: '5px 0' }}>{t.label}</div>
              {up ? <span style={{ width: 2, height: multi ? 0 : 10, background: LINE }} /> : null}
              <div className="me-scroll" style={{ width: '100%', overflowX: 'auto' }}>
                <div style={{ display: 'flex', width: 'max-content', margin: '0 auto', padding: '0 16px' }}>
                  {t.cards.map((c, i) => (
                    <div key={c.person.id} style={{ position: 'relative', padding: `${pad}px 5px 0`, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                      <span style={{ position: 'absolute', top: 0, left: 0, right: '50%', height: 2, background: multi && i > 0 ? LINE : 'transparent' }} />
                      <span style={{ position: 'absolute', top: 0, left: '50%', right: 0, height: 2, background: multi && i < t.cards.length - 1 ? LINE : 'transparent' }} />
                      <span style={{ position: 'absolute', top: 0, left: '50%', width: 2, marginLeft: -1, height: pad, background: multi ? LINE : 'transparent' }} />
                      <Card c={c} onTap={() => (c.picks ? setPick(c.person.id) : openPerson(c.person.id))} />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )
        })}
      </div>
      <div style={{ fontSize: 12.5, color: 'var(--ds-ink-2)' }}>{view?.foot ?? ''}</div>
    </div>
  )
}
