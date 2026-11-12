'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { readNotices } from '@/lib/push/actions'
import { noticeUrl } from '@/lib/push/notices'
import { LOOK_FONTS, LOOK_SIZES, DEFAULT_LOOK, type Look, type LookSize } from '@/lib/marketing/look'
import { noticeAge, type MktNotice } from '@/lib/marketing/shell'
import { lookFamily } from '../fonts'
import { readMktNotices, readQuoteStates, type QuoteState } from './useMktShell'
import s from './shell.module.css'

// The shell's two panels (`Marketing Shell.dc.html`): the bell's Notifications — Marketing's own notices, newest first,
// Mark all as read — and Settings › Appearance: the font size, the face and the density, drawn as chosen at once.

export function NoticesPanel({ onClose, onRead }: { onClose: () => void; onRead: () => void }) {
  const [items, setItems] = useState<MktNotice[] | null>(null)
  const router = useRouter()
  const [quotes, setQuotes] = useState<Record<string, QuoteState>>({})
  const [now] = useState(() => new Date())
  useEffect(() => {
    let live = true
    void readMktNotices().then(list => {
      if (!live) return
      setItems(list ?? [])
      // An accepted quotation's notice asks whether its work is assigned yet (the Product Builder's Assign tasks).
      const ids = [...new Set((list ?? []).filter(n => n.refKind === 'mkt_quote' && n.ref).map(n => n.ref as string))]
      if (ids.length) void readQuoteStates(ids).then(st => { if (live) setQuotes(st) })
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
          {items.map(n => {
            const quote = n.refKind === 'mkt_quote' && n.ref ? quotes[n.ref] ?? null : null
            const read = () => {
              if (!n.read) void readNotices([n.id]).then(r => (r.ok ? onRead() : undefined))
              onClose()
            }
            return (
              <Link
                key={n.id}
                href={n.ref ? noticeUrl({ refKind: n.refKind, refId: n.ref }, 'hr') : '/marketing'}
                className={`${s.notice}${n.read ? '' : ` ${s.noticeUnread}`}`}
                onClick={read}
              >
                <span className={`${s.noticeIcon}${n.refKind === 'mkt_quote' ? ` ${s.noticeIconOk}` : ''}`} aria-hidden="true">
                  {n.refKind === 'payment_request' ? '🧾' : n.refKind === 'mkt_quote' ? '✅' : '🎬'}
                </span>
                <span className={s.noticeText}>
                  <span className={s.noticeTitle}>{n.title}</span>
                  {n.refKind === 'mkt_quote' ? (
                    <span className={s.noticeMeta}>
                      <span>{noticeAge(n.at, now)}</span>
                      {n.body ? <span>·</span> : null}
                      {n.body ? <span>{n.body}</span> : null}
                    </span>
                  ) : (
                    <span className={s.noticeMeta}>
                      {n.body ? <span>{n.body}</span> : null}
                      {n.body ? <span>·</span> : null}
                      <span>{noticeAge(n.at, now)}</span>
                    </span>
                  )}
                  {quote && quote.status === 'accepted' && quote.tasks == null && n.ref ? (
                    <button
                      type="button"
                      className={s.noticeAssign}
                      onClick={e => {
                        e.preventDefault()
                        e.stopPropagation()
                        read()
                        router.push(`/marketing/products?q=${encodeURIComponent(n.ref as string)}&assign=1`)
                      }}
                    >
                      Assign tasks
                    </button>
                  ) : null}
                  {quote?.tasks != null ? <span className={s.noticeDone}>✓ {quote.tasks} tasks assigned</span> : null}
                </span>
                {n.read ? null : <span className={s.noticeDot} aria-label="Unread" />}
              </Link>
            )
          })}
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
