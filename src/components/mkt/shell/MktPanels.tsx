'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { readNotices } from '@/lib/push/actions'
import { noticeUrl } from '@/lib/push/notices'
import { LOOK_FONTS, LOOK_SIZES, DEFAULT_LOOK, type Look, type LookSize } from '@/lib/marketing/look'
import { noticeAge, type MktNotice } from '@/lib/marketing/shell'
import { lookFamily } from '../fonts'
import { readMktNotices } from './useMktShell'
import s from './shell.module.css'

// The shell's two panels (`Marketing Shell.dc.html`): the bell's Notifications — Marketing's own notices, newest first,
// Mark all as read — and Settings › Appearance: the font size, the face and the density, drawn as chosen at once.

export function NoticesPanel({ onClose, onRead }: { onClose: () => void; onRead: () => void }) {
  const [items, setItems] = useState<MktNotice[] | null>(null)
  const [now] = useState(() => new Date())
  useEffect(() => {
    let live = true
    void readMktNotices().then(list => {
      if (live) setItems(list ?? [])
    })
    return () => {
      live = false
    }
  }, [])
  const unread = (items ?? []).filter(n => !n.read)

  const markAll = async () => {
    const ids = unread.map(n => n.id)
    if (!ids.length) return
    const done = await readNotices(ids)
    if (done.ok) {
      setItems(list => list?.map(n => ({ ...n, read: true })) ?? list)
      onRead()
    }
  }

  return (
    <div className={`${s.panel} ${s.notices}`} role="dialog" aria-label="Notifications">
      <div className={s.noticesHead}>
        <span className={s.noticesTitle}>Notifications</span>
        {unread.length ? (
          <button type="button" className={s.linkish} onClick={() => void markAll()}>
            Mark all as read
          </button>
        ) : null}
      </div>
      {items === null ? (
        <div className={s.noticesEmpty}>
          <div className={s.noticesEmptySub}>…</div>
        </div>
      ) : items.length ? (
        <div className={s.noticeList}>
          {items.map(n => (
            <Link
              key={n.id}
              href={n.ref ? noticeUrl({ refKind: 'mkt_project', refId: n.ref }, 'hr') : '/marketing'}
              className={`${s.notice}${n.read ? '' : ` ${s.noticeUnread}`}`}
              onClick={() => {
                if (!n.read) void readNotices([n.id]).then(r => (r.ok ? onRead() : undefined))
                onClose()
              }}
            >
              <span className={s.noticeIcon} aria-hidden="true">🎬</span>
              <span className={s.noticeText}>
                <span className={s.noticeTitle}>{n.title}</span>
                <span className={s.noticeMeta}>
                  {n.body ? <span>{n.body}</span> : null}
                  {n.body ? <span>·</span> : null}
                  <span>{noticeAge(n.at, now)}</span>
                </span>
              </span>
              {n.read ? null : <span className={s.noticeDot} aria-label="Unread" />}
            </Link>
          ))}
        </div>
      ) : (
        <div className={s.noticesEmpty}>
          <div className={s.noticesEmptyArt} aria-hidden="true">🎈</div>
          <div className={s.noticesEmptyTitle}>You&apos;re all caught up</div>
        </div>
      )}
    </div>
  )
}

const SIZE_KEYS = Object.keys(LOOK_SIZES) as LookSize[]

export function AppearancePanel({
  look,
  onLook,
  onClose,
  left,
}: {
  look: Look
  onLook: (look: Look) => void
  onClose: () => void
  /** 10px in from the window, 74 while the sidebar is folded (the handoff's). */
  left: number
}) {
  const seg = (on: boolean) => `${s.segBtn}${on ? ` ${s.segOn}` : ''}`
  return (
    <div className={`${s.panel} ${s.look}`} style={{ left }} role="dialog" aria-label="Appearance">
      <div className={s.lookHead}>
        <span className={s.lookTitle}>Appearance</span>
        <button type="button" className={s.lookClose} onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>
      <div className={s.lookGroup}>
        <div className={s.lookLine}>
          <span className={s.lookLabel}>Font size</span>
          <span className={s.lookValue}>{LOOK_SIZES[look.size]}px</span>
        </div>
        <div className={s.seg} role="radiogroup" aria-label="Font size">
          {SIZE_KEYS.map(k => (
            <button key={k} type="button" role="radio" aria-checked={look.size === k} className={seg(look.size === k)} onClick={() => onLook({ ...look, size: k })}>
              {k}
            </button>
          ))}
        </div>
      </div>
      <div className={s.lookGroup}>
        <span className={s.lookLabel}>Font</span>
        <div className={s.fonts} role="radiogroup" aria-label="Font">
          {LOOK_FONTS.map(f => (
            <button
              key={f}
              type="button"
              role="radio"
              aria-checked={look.font === f}
              className={`${s.fontBtn}${look.font === f ? ` ${s.fontOn}` : ''}`}
              onClick={() => onLook({ ...look, font: f })}
            >
              <span className={s.fontAa} style={{ fontFamily: lookFamily(f) }}>Aa</span>
              <span className={s.fontName}>{f}</span>
            </button>
          ))}
        </div>
      </div>
      <div className={s.lookGroup}>
        <span className={s.lookLabel}>Density</span>
        <div className={s.seg} role="radiogroup" aria-label="Density">
          {(['compact', 'comfortable'] as const).map(d => (
            <button key={d} type="button" role="radio" aria-checked={look.density === d} className={seg(look.density === d)} onClick={() => onLook({ ...look, density: d })}>
              {d === 'compact' ? 'Compact' : 'Comfortable'}
            </button>
          ))}
        </div>
      </div>
      <div className={s.lookFoot}>
        <span />
        <button type="button" className={s.lookReset} onClick={() => onLook(DEFAULT_LOOK)}>
          Reset
        </button>
      </div>
    </div>
  )
}
