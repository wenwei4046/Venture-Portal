'use client'

import type { MktSub } from '@/lib/marketing/board'
import { openLine, type AppMe } from '@/lib/mkt-app/model'
import s from '../mkt-app.module.css'

// More (the handoff's phone layout, not the sidebar): the profile card with today's punch, four big tiles — Calendar,
// Claim, Library, Meeting Rooms — the subsidiaries in a row, MANAGER TOOLS for a manager, and the settings card.

export type MoreTone = 'sand' | 'mist' | 'peach' | 'cream'

export interface MoreTile {
  key: string
  emoji: string
  label: string
  sub: string
  tone: MoreTone
  count: number
  go: () => void
}

export interface MoreRow {
  key: string
  emoji: string
  label: string
  sub?: string
  value?: string
  tone?: MoreTone
  count?: number
  danger?: boolean
  go: () => void
}

export interface MoreTabProps {
  me: AppMe
  avatar: string | null
  /** Me's Today (lib/me/today.ts) — none without a People record. */
  punch: { line: string; button: string | null; primary: boolean } | null
  onProfile: (() => void) | null
  onPunch: () => void
  tiles: MoreTile[]
  subs: { sub: MktSub; open: number; late: number }[]
  onSub: ((code: string | null) => void) | null
  manager: MoreRow[] | null
  foot: MoreRow[]
}

const TONE = { sand: s['tone-sand'], mist: s['tone-mist'], peach: s['tone-peach'], cream: s['tone-cream'] }

export default function MoreTab(p: MoreTabProps) {
  return (
    <div className={s.tabPage}>
      <div className={s.scroll}>
        <div className={s.more}>
          <h1 className={s.moreTitle}>More</h1>

          <div className={s.group}>
            <button type="button" className={s.profileRow} onClick={p.onProfile ?? undefined} disabled={!p.onProfile}>
              <span className={s.avatar52} style={{ background: p.me.avatarBg }}>{p.avatar ? <img src={p.avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : p.me.letter}</span>
              <span className={s.grow}>
                <span className={s.profileName} style={{ display: 'block' }}>{p.me.full}</span>
                <span className={s.profileSub} style={{ display: 'block' }}>{p.me.role ? `${p.me.role} · ` : ''}HOUZS Marketing</span>
              </span>
              {p.onProfile ? <span className={s.chev18}>›</span> : null}
            </button>
            {p.punch ? (
              <div className={s.punchRow}>
                <span style={{ fontSize: 16 }}>🕘</span>
                <span className={s.punchLine}>{p.punch.line}</span>
                {p.punch.button ? (
                  <button type="button" className={s.punchBtn} data-primary={p.punch.primary ? 'true' : 'false'} onClick={p.onPunch}>{p.punch.button}</button>
                ) : null}
              </div>
            ) : null}
          </div>

          {p.tiles.length ? (
            <div className={s.grid2}>
              {p.tiles.map(t => (
                <button key={t.key} type="button" className={s.bigTile} onClick={t.go}>
                  <span className={`${s.bigIcon} ${TONE[t.tone]}`}>{t.emoji}</span>
                  <span>
                    <span className={s.bigLabel} style={{ display: 'block' }}>{t.label}</span>
                    {t.sub ? <span className={s.bigSub} style={{ display: 'block' }}>{t.sub}</span> : null}
                  </span>
                  {t.count ? <span className={s.bigCount}>{t.count}</span> : null}
                </button>
              ))}
            </div>
          ) : null}

          {p.onSub && p.subs.length ? (
            <div className={s.subsBlock}>
              <div className={s.subsHead}>
                <span className={`${s.label} ${s.grow}`}>Subsidiaries</span>
                <button type="button" className={s.linkSm} onClick={() => p.onSub?.(null)}>All ›</button>
              </div>
              <div className={s.subsRow}>
                {p.subs.map(b => (
                  <button key={b.sub.id} type="button" className={s.subCard} onClick={() => p.onSub?.(b.sub.code)}>
                    <span className={s.subTile}>{b.sub.emoji}<span className={s.subTileDot} style={{ background: b.sub.dot }} /></span>
                    <span className={s.subName}>{b.sub.name}</span>
                    <span className={s.subMeta}>{openLine(b.open)}</span>
                    {b.late ? <span className={s.subLate}>{b.late}</span> : null}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {p.manager?.length ? (
            <div className={s.subsBlock}>
              <span className={s.label}>Manager tools</span>
              <div className={s.group}>
                {p.manager.map((r, i) => (
                  <button key={r.key} type="button" className={`${s.mgrRow}${i ? ` ${s.ruled}` : ''}`} onClick={r.go}>
                    <span className={`${s.mgrIcon} ${TONE[r.tone ?? 'sand']}`}>{r.emoji}</span>
                    <span className={s.grow}>
                      <span className={s.mgrLabel} style={{ display: 'block' }}>{r.label}</span>
                      {r.sub ? <span className={s.mgrSub} style={{ display: 'block' }}>{r.sub}</span> : null}
                    </span>
                    {r.count ? <span className={s.unread} style={{ minWidth: 22, height: 22, borderRadius: 11, fontSize: 11.5 }}>{r.count}</span> : null}
                    <span className={s.chev18}>›</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <div className={s.group}>
            {p.foot.map((r, i) => (
              <button key={r.key} type="button" className={`${s.footRow}${i ? ` ${s.ruled}` : ''}`} data-danger={r.danger ? 'true' : 'false'} onClick={r.go}>
                <span className={s.footIcon}>{r.emoji}</span>
                <span className={s.footLabel}>{r.label}</span>
                {r.value ? <span className={s.footValue}>{r.value}</span> : null}
                <span className={s.chev18}>›</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
