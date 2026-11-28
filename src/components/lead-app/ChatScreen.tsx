'use client'

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type RefObject } from 'react'
import { richPieces } from '@/lib/leads/rich'
import { VoiceNote } from '@/components/member/crm/shared/voice-note'
import { recTime } from '@/components/member/crm/shared/voice'
import { VOICE_OURS, VOICE_THEIRS } from '@/app/(portal)/leads/_components/voice-palette'
import { Ic, type IconName } from './icons'
import { Avatar, ONE_LINE, lv } from './parts'
import type { BubbleVM, StripVM, WallItem } from './vm'
import s from './lead-app.module.css'

export interface MenuItem { label: string; sub: string; icon: IconName; bg: string; fg: string; go: () => void }

const STRIP: Record<StripVM['tone'], { bg: string; fg: string; dot: string }> = {
  rust: { bg: lv('accent-tint'), fg: lv('accent'), dot: lv('accent') },
  green: { bg: lv('pos-tint'), fg: lv('pos'), dot: lv('pos') },
  grey: { bg: lv('surface-sel'), fg: lv('fg-3'), dot: lv('disabled') },
}

/**
 * A chat (the handoff's screen 2 — LeadPhone.dc.html lines 189–239): the head (back, avatar, name and its line, ⋮), the
 * phone strip in its four states, the ⋮ menu, the wall — a day's pill, the bubbles with their time inline — and the
 * composer: the white pill (smiley, the reply box from one line to six, attach, camera) and the rust circle, a mic while
 * the box is empty and Send once it has words.
 *
 * Kept, though the prototype draws only words (the user's rule for Lead View — every feature stays): photos, videos,
 * voice notes and files in their bubbles, Messenger's own notes as grey lines, a template's buttons under its bubble,
 * the message a reply quotes, the Page's reaction, the ticks after the time, and "Not sent".
 *
 * The mic records while it is held (the prototype's "Hold to record a voice note", which it only says): the pill shows
 * the time and how to let go; released, the note goes; slid off the button, it is dropped.
 */
export default function ChatScreen({ open, name, ini, sub, strip, wall, links, menu, menuOpen, onToggleMenu, onCloseMenu, onBack, onInfo,
  onConfirm, onNotPhone, onHand, draft, onDraft, onSend, onMicDown, onMicUp, onMicCancel, rec, onPickFile, onPickCamera, onEmoji, canReply, busy, listRef, boxRef }: {
  open: boolean
  name: string
  ini: string
  sub: string
  strip: StripVM
  wall: WallItem[]
  /** Signed links to the files Customer Service sent (lead-media), by path. */
  links: Record<string, string>
  menu: MenuItem[]
  menuOpen: boolean
  onToggleMenu: () => void
  onCloseMenu: () => void
  onBack: () => void
  onInfo: () => void
  onConfirm: () => void
  onNotPhone: () => void
  onHand: () => void
  draft: string
  onDraft: (text: string) => void
  onSend: () => void
  /** The mic pressed (the box empty), released over it, or slid off it. */
  onMicDown: () => void
  onMicUp: () => void
  onMicCancel: () => void
  /** Recording since (ms), or null. */
  rec: number | null
  onPickFile: (file: File) => void
  onPickCamera: (file: File) => void
  onEmoji: () => void
  canReply: boolean
  busy: boolean
  listRef: RefObject<HTMLDivElement | null>
  boxRef: RefObject<HTMLTextAreaElement | null>
}) {
  const tone = STRIP[strip.tone]
  const filePick = useRef<HTMLInputElement>(null)
  const camPick = useRef<HTMLInputElement>(null)
  // The reply box is as tall as its words: one line (52) to six (154), measured as the CRM's composer measures it.
  const [boxH, setBoxH] = useState(52)
  useLayoutEffect(() => {
    const ta = boxRef.current
    if (!ta) return
    const was = ta.style.height
    ta.style.height = '0px'
    const h = Math.min(154, Math.max(52, ta.scrollHeight))
    ta.style.height = was
    setBoxH(h)
  }, [draft, boxRef])
  const words = !!draft.trim()
  const keyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); onSend() }
  }
  // The recording's clock, four times a second while the mic is held.
  const [, tick] = useState(0)
  useEffect(() => {
    if (rec === null) return
    const t = window.setInterval(() => tick(x => x + 1), 250)
    return () => window.clearInterval(t)
  }, [rec])

  return (
    <div aria-hidden={!open} inert={!open}
      style={{ position: 'absolute', inset: 0, zIndex: 20, display: 'flex', flexDirection: 'column', paddingTop: 'var(--lv-top)', background: lv('surface'),
        transform: `translateX(${open ? '0' : '100%'})`, transition: 'transform .32s cubic-bezier(.2,.8,.2,1)' }}>
      <div style={{ flex: 'none', position: 'relative', background: lv('surface'), borderBottom: `1px solid ${lv('line')}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '2px 16px 12px' }}>
          <button type="button" onClick={onBack} aria-label="Back to the Inbox" style={{ flex: 'none', width: 40, height: 40, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: lv('fg') }}>
            <Ic name="chevronLeft" size={24} />
          </button>
          <Avatar ini={ini} size={40} font={14} />
          <button type="button" onClick={onInfo} style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, textAlign: 'left', color: lv('fg') }}>
            <strong style={{ ...ONE_LINE, fontSize: 15, fontWeight: 600 }}>{name}</strong>
            <span style={{ ...ONE_LINE, fontSize: 11.2, color: lv('fg-3') }}>{sub}</span>
          </button>
          <button type="button" onClick={onToggleMenu} aria-label="More" aria-expanded={menuOpen}
            style={{ flex: 'none', width: 40, height: 40, borderRadius: '50%', background: lv('surface-sel'), display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 3 }}>
            {[0, 1, 2].map(i => <span key={i} style={{ width: 3.6, height: 3.6, borderRadius: '50%', background: lv('fg') }} />)}
          </button>
        </div>
        <div style={{ minHeight: 44, padding: '0 8px 0 16px', display: 'flex', alignItems: 'center', gap: 8, borderTop: `1px solid ${lv('line')}`, background: tone.bg, fontSize: 13, whiteSpace: 'nowrap' }}>
          <span style={{ width: 7, height: 7, flex: 'none', borderRadius: '50%', background: tone.dot }} />
          <span style={{ ...ONE_LINE, flex: 1, minWidth: 0, fontWeight: 500, color: tone.fg }}>{strip.text}</span>
          {strip.confirm ? (
            <>
              <button type="button" onClick={onNotPhone} disabled={busy} style={{ flex: 'none', height: 44, padding: '0 8px', display: 'flex', alignItems: 'center', fontWeight: 500, color: lv('fg-3') }}>Not a phone</button>
              <button type="button" onClick={onConfirm} disabled={busy} style={{ flex: 'none', height: 32, padding: '0 14px', borderRadius: 16, display: 'flex', alignItems: 'center', fontWeight: 600, background: lv('accent'), color: lv('surface') }}>Confirm</button>
            </>
          ) : null}
          {strip.hand ? (
            <button type="button" onClick={onHand} disabled={busy} style={{ flex: 'none', height: 32, padding: '0 14px', borderRadius: 16, display: 'flex', alignItems: 'center', fontWeight: 600, background: lv('pos'), color: lv('surface') }}>Hand over</button>
          ) : null}
        </div>
        {menuOpen ? (
          <div role="menu" style={{ position: 'absolute', top: 50, right: 16, zIndex: 7, width: 264, padding: 6, borderRadius: 20, background: lv('surface'), border: `1px solid ${lv('line-2')}`,
            boxShadow: `0 16px 36px ${lv('fg', 0.16)}, 0 2px 6px ${lv('fg', 0.06)}`, display: 'flex', flexDirection: 'column', gap: 2 }}>
            {menu.map(it => (
              <button key={it.label} type="button" role="menuitem" onClick={it.go} className={s.menuItem}
                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 10px', borderRadius: 14, textAlign: 'left', color: lv('fg') }}>
                <span style={{ flex: 'none', width: 36, height: 36, borderRadius: 11, background: it.bg, color: it.fg, display: 'grid', placeItems: 'center' }}><Ic name={it.icon} size={18} stroke={1.8} /></span>
                <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <strong style={{ fontSize: 13, fontWeight: 650 }}>{it.label}</strong>
                  <small style={{ ...ONE_LINE, fontSize: 10.5, color: lv('fg-3') }}>{it.sub}</small>
                </span>
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div ref={listRef} onClick={onCloseMenu} style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', padding: '16px 16px 10px', background: lv('surface-hover') }}>
        <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {wall.map(w => w.type === 'day' ? (
            <span key={w.key} style={{ alignSelf: 'center', margin: '6px 0 2px', padding: '4px 10px', borderRadius: 12, background: lv('surface', 0.7), color: lv('fg-3'), fontSize: 11.2, fontWeight: 500, letterSpacing: '.08em', textTransform: 'uppercase' }}>{w.label}</span>
          ) : w.type === 'note' ? (
            <span key={w.key} style={{ alignSelf: 'center', maxWidth: '86%', textAlign: 'center', fontSize: 11.2, lineHeight: 1.45, color: lv('fg-3') }}>{w.text} · {w.at}</span>
          ) : <Bubble key={w.id} m={w} links={links} />)}
        </div>
      </div>

      <div style={{ flex: 'none', display: 'flex', flexDirection: 'column', background: lv('surface-hover') }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, padding: '8px 12px calc(10px + var(--safe-bottom))' }}>
          {canReply ? (
            <>
              <span style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'flex-end', minHeight: 52, padding: '0 4px', borderRadius: 26, background: lv('surface'), boxShadow: `0 1px 2px ${lv('fg', 0.14)}` }}>
                {rec !== null ? (
                  <span role="status" style={{ flex: 1, minWidth: 0, height: 52, display: 'flex', alignItems: 'center', gap: 10, padding: '0 14px', fontSize: 15, color: lv('fg') }}>
                    <span aria-hidden="true" className={s.recDot} style={{ flex: 'none', width: 10, height: 10, borderRadius: '50%', background: lv('accent') }} />
                    <strong style={{ flex: 'none', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{recTime(rec)}</strong>
                    <span style={{ ...ONE_LINE, flex: 1, minWidth: 0, fontSize: 13, color: lv('fg-3') }}>Release to send · slide away to cancel</span>
                  </span>
                ) : (
                  <>
                    <button type="button" onClick={onEmoji} aria-label="Emoji" style={{ flex: 'none', width: 38, height: 52, display: 'grid', placeItems: 'center', color: lv('fg-3') }}><Ic name="smiley" size={25} stroke={1.65} /></button>
                    <textarea ref={boxRef} value={draft} onChange={e => onDraft(e.target.value)} onKeyDown={keyDown} placeholder={`Reply to ${name.trim().split(/\s+/)[0] || 'the customer'}…`} rows={1}
                      className={s.box} aria-label="Reply"
                      style={{ flex: 1, minWidth: 0, height: boxH, maxHeight: 154, margin: 0, padding: '15px 2px', border: 0, outline: 'none', resize: 'none', background: 'transparent', font: 'inherit', fontSize: 16, lineHeight: '22px', color: lv('fg') }} />
                    <button type="button" onClick={() => filePick.current?.click()} aria-label="Attach a file" style={{ flex: 'none', width: 40, height: 52, display: 'grid', placeItems: 'center', color: lv('fg-3') }}><Ic name="attach" size={25} stroke={1.8} style={{ transform: 'rotate(-45deg)' }} /></button>
                    <button type="button" onClick={() => camPick.current?.click()} aria-label="Camera" style={{ flex: 'none', width: 40, height: 52, display: 'grid', placeItems: 'center', color: lv('fg-3') }}><Ic name="camera" size={26} stroke={1.8} /></button>
                  </>
                )}
              </span>
              {words ? (
                <button type="button" onClick={onSend} aria-label="Send" disabled={busy}
                  style={{ flex: 'none', width: 52, height: 52, borderRadius: '50%', display: 'grid', placeItems: 'center', background: lv('accent'), color: lv('surface'), boxShadow: `0 3px 9px ${lv('accent', 0.18)}` }}>
                  <Ic name="sendMain" size={24} stroke={1.75} />
                </button>
              ) : (
                <button type="button" aria-label="Hold to record a voice note" className={s.mic}
                  onPointerDown={e => {
                    if (e.button !== 0) return
                    // A touch is captured by the button it starts on, so it would never "leave" it: let go, and sliding off cancels.
                    try { e.currentTarget.releasePointerCapture(e.pointerId) } catch { /* not captured */ }
                    onMicDown()
                  }}
                  onPointerUp={onMicUp} onPointerCancel={onMicCancel} onPointerLeave={onMicCancel}
                  onContextMenu={e => e.preventDefault()}
                  style={{ flex: 'none', width: 52, height: 52, borderRadius: '50%', display: 'grid', placeItems: 'center', background: lv('accent'), color: lv('surface'), boxShadow: `0 3px 9px ${lv('accent', 0.18)}`,
                    transform: rec !== null ? 'scale(1.12)' : 'none', transition: 'transform .15s' }}>
                  <Ic name="mic" size={24} stroke={1.75} />
                </button>
              )}
              <input ref={filePick} type="file" hidden onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onPickFile(f) }} />
              <input ref={camPick} type="file" hidden accept="image/*,video/*" capture="environment" onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onPickCamera(f) }} />
            </>
          ) : (
            <span style={{ flex: 1, minHeight: 52, padding: '0 18px', borderRadius: 26, display: 'flex', alignItems: 'center', background: lv('surface'), boxShadow: `0 1px 2px ${lv('fg', 0.14)}`, fontSize: 14, color: lv('fg-3') }}>
              View only — you can’t reply to customers
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

const TICK: Record<string, CSSProperties> = { sent: { color: lv('fg-3') }, delivered: { color: lv('fg-3') }, read: { color: lv('read') } }

/** One bubble: ours khaki on the right, the customer's white on the left; the time inline, floated right. */
function Bubble({ m, links }: { m: BubbleVM; links: Record<string, string> }) {
  const side = m.mine ? 'flex-end' : 'flex-start'
  return (
    <div data-msg="" style={{ alignSelf: side, maxWidth: '80%', display: 'flex', flexDirection: 'column', alignItems: side, gap: 4, opacity: m.pending ? 0.6 : 1 }}>
      <div style={{ maxWidth: '100%', display: 'flow-root', padding: '6px 9px 7px 11px', borderRadius: m.mine ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
        boxShadow: `0 1px 1px ${lv('fg', 0.1)}`, background: m.mine ? lv('sel') : lv('surface'), border: `1px solid ${m.mine ? lv('sel-edge') : lv('line')}` }}>
        {m.quote ? (
          <span style={{ display: 'block', margin: '2px 0 6px', padding: '4px 8px', borderLeft: `3px solid ${lv('fg-4')}`, borderRadius: 6, background: lv('fg', 0.04), fontSize: 12.5, lineHeight: 1.4, color: lv('fg-2') }}>
            <strong style={{ display: 'block', fontSize: 11.5, fontWeight: 600 }}>↩ {m.quote.who}</strong>
            <span style={{ ...ONE_LINE, display: 'block' }}>{m.quote.text}</span>
          </span>
        ) : null}
        {m.media ? <Media m={m} links={links} /> : null}
        {m.text ? (
          <p className={s.bubbleText} style={{ display: 'inline', margin: 0, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontSize: 15, lineHeight: 1.45 }}>
            {richPieces(m.text).map((p, i) => (p.bold ? <strong key={i}>{p.text}</strong> : p.italic ? <em key={i}>{p.text}</em> : <span key={i}>{p.text}</span>))}
          </p>
        ) : null}
        <span style={{ display: 'inline-flex', float: 'right', marginLeft: 12, marginBottom: -5, alignItems: 'center', gap: 3, marginTop: 8, fontSize: 9.5, color: lv('fg-3') }}>
          {m.by ? <span style={{ fontStyle: 'italic', opacity: 0.85 }}>{m.by}</span> : null}
          {m.at}
          {m.receipt === 'failed' ? <span style={{ color: lv('accent'), fontWeight: 600 }}>· Not sent</span>
            : m.receipt === 'recorded' ? <span>· Saved</span>
            : m.receipt ? <span style={TICK[m.receipt]} aria-label={m.receipt}>{m.receipt === 'sent' ? '✓' : '✓✓'}</span> : null}
        </span>
      </div>
      {m.buttons.length ? (
        <span style={{ display: 'flex', flexDirection: 'column', alignItems: side, gap: 4 }}>
          {m.buttons.map(b => <span key={b} style={{ padding: '6px 12px', borderRadius: 15, border: `1px solid ${lv('line')}`, background: lv('surface'), fontSize: 13, color: lv('accent') }}>{b}</span>)}
        </span>
      ) : null}
      {m.reaction ? <span style={{ marginTop: -10, padding: '1px 5px', borderRadius: 10, background: lv('surface'), border: `1px solid ${lv('line')}`, fontSize: 13 }}>{m.reaction}</span> : null}
    </div>
  )
}

/** A message's photo, video, voice note or file, as Messenger shows it. */
function Media({ m, links }: { m: BubbleVM; links: Record<string, string> }) {
  const [gone, setGone] = useState(false)
  const media = m.media!
  const link = media.path ? links[media.path] : media.url ?? undefined
  const what = media.kind === 'image' ? 'Photo' : media.kind === 'video' ? 'Video' : media.kind === 'audio' ? 'Voice message' : 'File'
  const wait = (t: string) => <span style={{ display: 'block', padding: '6px 0', fontSize: 13, color: lv('fg-3') }}>{what} · {t}</span>
  if (!link) return wait('loading…')
  if (gone) return wait('no longer available')
  const block: CSSProperties = { display: 'block', maxWidth: '100%', borderRadius: 10, marginBottom: m.text ? 4 : 0 }
  if (media.kind === 'image') {
    // A short-lived signed link (or Meta's): nothing for next/image to optimise.
    // eslint-disable-next-line @next/next/no-img-element
    return <a href={link} target="_blank" rel="noopener noreferrer"><img src={link} alt={what} onError={() => setGone(true)} style={{ ...block, maxHeight: 320, objectFit: 'cover' }} /></a>
  }
  if (media.kind === 'video') return <video src={link} controls playsInline preload="metadata" onError={() => setGone(true)} style={{ ...block, maxHeight: 320 }} />
  if (media.kind === 'audio') return <span style={{ display: 'block', marginBottom: m.text ? 4 : 0 }}><VoiceNote src={link} palette={m.mine ? VOICE_OURS : VOICE_THEIRS} onError={() => setGone(true)} /></span>
  return (
    <a href={link} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', fontSize: 14, color: lv('fg'), textDecoration: 'none' }}>
      <Ic name="file" size={18} />
      <span style={{ ...ONE_LINE, minWidth: 0 }}>{media.name}</span>
    </a>
  )
}
