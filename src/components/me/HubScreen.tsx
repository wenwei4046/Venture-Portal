'use client'

import type { CSSProperties } from 'react'
import { Button } from '@/components/ds/Button'
import { StatusChip } from '@/components/ds/Data'
import { hm } from '@/lib/me/format'
import type { WaitItem } from '@/lib/me/org'
import { meStatus, requestTitle, requestWhen } from '@/lib/me/requests'
import type { TodayCard } from '@/lib/me/today'
import type { AttRequest } from '@/lib/attendance/types'
import type { MeData } from '@/lib/me/types'
import { Avatar, CameraGlyph, Icon, Label, ListCard, ListItem, NUM, SHADOW } from './kit'

/**
 * Me's hub (2026-10-17, the handoff's `isHub`): who you are (the avatar's camera badge changes your photo), today's
 * card with its clock and the punch, the tiles, what waits for you (an upline), and your latest requests.
 */

export type Screen = 'hub' | 'att' | 'leave' | 'lvhist' | 'pay' | 'profile' | 'hier' | 'docs' | 'req' | 'team'

const TILES: Array<{ label: string; icon: string; go: Screen }> = [
  { label: 'Attendance', icon: 'in', go: 'att' },
  { label: 'Leave', icon: 'calendar', go: 'leave' },
  { label: 'Payslip', icon: 'payroll', go: 'pay' },
  { label: 'Profile', icon: 'user', go: 'profile' },
  { label: 'Hierarchy', icon: 'tree', go: 'hier' },
  { label: 'Submit request', icon: 'approve', go: 'req' },
  { label: 'Documents', icon: 'doc', go: 'docs' },
]

export function HubScreen({ data, name, roleLine, photo, card, nowSec, upline, waiting, onPhoto, onPunch, go, openRequest, openWait }: {
  data: MeData | null
  name: string
  roleLine: string
  photo: string | null
  card: TodayCard | null
  nowSec: number
  upline: boolean
  waiting: WaitItem[]
  onPhoto: () => void
  onPunch: (dir: 'in' | 'out') => void
  go: (s: Screen) => void
  openRequest: (r: AttRequest) => void
  openWait: (w: WaitItem) => void
}) {
  const tiles = upline ? [...TILES, { label: 'My team', icon: 'people', go: 'team' as Screen }] : TILES
  const recent = (data?.requests ?? []).slice(0, 3)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <button type="button" onClick={onPhoto} aria-label="Change profile photo" style={{ position: 'relative', width: 56, height: 56, padding: 0, border: 0, background: 'none', cursor: 'pointer', flex: 'none' }}>
          <Avatar name={name} size={56} tone="dark" photo={photo} />
          <span style={BADGE}><CameraGlyph /></span>
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ margin: 0, fontFamily: 'var(--ds-font-display)', fontSize: 28, fontWeight: 'var(--ds-title-weight)' as CSSProperties['fontWeight'], letterSpacing: 'var(--ds-title-tracking)', lineHeight: 1.1 }}>{name}</h1>
          <p style={{ margin: '5px 0 0', fontSize: 13, color: 'var(--ds-ink-2)' }}>{roleLine}</p>
        </div>
      </div>

      {card ? (
        <div style={{ borderRadius: 16, background: 'var(--ds-dark)', color: 'var(--ds-on-dark)', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
            <span style={{ fontSize: 10.5, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--ds-dark-sub)' }}>Today · {card.chip}</span>
            <span style={{ ...NUM, fontSize: 26, lineHeight: 1.1 }}>{hm(nowSec)}</span>
            <span style={{ fontSize: 12, color: 'var(--ds-dark-sub)' }}>{card.line}</span>
          </div>
          {card.punch ? <Button onClick={() => onPunch(card.punch!)}>{card.punch === 'in' ? 'Clock in' : 'Clock out'}</Button> : null}
        </div>
      ) : null}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 10 }}>
        {tiles.map((t, i) => (
          <button key={t.go} type="button" className="me-tile" onClick={() => go(t.go)} style={{
            border: '1px solid var(--ds-border)', borderRadius: 14, background: 'var(--ds-surface)', boxShadow: SHADOW, padding: '14px 12px 12px', display: 'flex',
            flexDirection: 'column', alignItems: 'flex-start', gap: 12, minHeight: 100, boxSizing: 'border-box', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', color: 'var(--ds-ink)',
          }}>
            <span style={{ width: 38, height: 38, borderRadius: 10, background: `var(--me-tile-${i + 1}-bg)`, color: `var(--me-tile-${i + 1})`, display: 'grid', placeItems: 'center' }}>
              <Icon name={t.icon} size={20} stroke={1.6} />
            </span>
            <span style={{ fontWeight: 500, fontSize: 13.5, lineHeight: 1.25 }}>{t.label}</span>
          </button>
        ))}
      </div>

      {upline ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Label>Waiting for you · {waiting.length}</Label>
          <ListCard>
            {waiting.map(w => (
              <ListItem key={w.id} leading={<Avatar name={w.who} size={36} />} title={w.who} subtitle={`${w.title} · ${w.when}`} meta={w.amount} onClick={() => openWait(w)} />
            ))}
            {waiting.length === 0 ? <div style={{ padding: 16, fontSize: 13, color: 'var(--ds-ink-2)' }}>Nothing waiting.</div> : null}
          </ListCard>
        </div>
      ) : null}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <Label>Request status</Label>
          <a href="#" onClick={e => { e.preventDefault(); go('req') }} style={{ fontSize: 12.5, color: 'var(--ds-link)' }}>All ›</a>
        </div>
        <ListCard>
          {recent.map(r => {
            const [tone, word] = meStatus(r)
            return <ListItem key={r.id} title={requestTitle(r, data?.leaveTypes ?? [])} subtitle={requestWhen(r)} trailing={<StatusChip tone={tone}>{word}</StatusChip>} onClick={() => openRequest(r)} />
          })}
          {recent.length === 0 ? <div style={{ padding: 16, fontSize: 13, color: 'var(--ds-ink-2)' }}>Nothing sent yet.</div> : null}
        </ListCard>
      </div>
    </div>
  )
}

export const BADGE: CSSProperties = {
  position: 'absolute', right: -5, bottom: -5, width: 24, height: 24, borderRadius: '50%', background: 'var(--ds-surface)', border: '1px solid var(--ds-border)',
  // The prototype's own box (no reset): 24px inside its hairline.
  color: 'var(--ds-ink)', display: 'grid', placeItems: 'center', boxShadow: '0 1px 3px rgb(51 36 27 / .12)', boxSizing: 'content-box',
}
