'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import { fileRoute } from '@/lib/storage/browser'
import { COVERS } from '@/lib/marketing/space'
import s from './myspace.module.css'

// My Space's cover (`My Space Bento.dc.html`): one of four gradients or a picture, with *🖼️ Change cover* — the four
// presets (the one shown ringed in the accent) and *⬆ Upload a cover image* — and the avatar over its lower edge: a
// picture, or the first letter on the team's colour; a click picks another.

export interface SpaceCoverProps {
  cover: number
  coverPath: string | null
  avatarPath: string | null
  letter: string
  avatarBg: string
  canEdit: boolean
  /** A picture on its way up. */
  sending: 'cover' | 'avatar' | 'photo' | null
  popOpen: boolean
  onPop: (open: boolean) => void
  onPreset: (cover: number) => void
  onPick: (kind: 'cover' | 'avatar') => void
  /** The pet, sitting beside the avatar (⑦-2). */
  pet?: ReactNode
}

export default function SpaceCover(p: SpaceCoverProps) {
  const pop = useRef<HTMLDivElement>(null)
  const toggle = useRef<HTMLButtonElement>(null)
  const { popOpen, onPop } = p

  // The popover closes on a click elsewhere, or Escape.
  useEffect(() => {
    if (!popOpen) return
    const away = (e: PointerEvent) => {
      const t = e.target as Node
      if (!pop.current?.contains(t) && !toggle.current?.contains(t)) onPop(false)
    }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onPop(false) }
    document.addEventListener('pointerdown', away)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('pointerdown', away)
      document.removeEventListener('keydown', esc)
    }
  }, [popOpen, onPop])

  const picture = p.coverPath ? { backgroundImage: `url("${fileRoute('marketing', p.coverPath)}")` } : undefined
  const face = p.avatarPath ? <img src={fileRoute('marketing', p.avatarPath)} alt="" /> : p.letter
  return (
    <div className={s.cover} data-cover={p.coverPath ? undefined : String(p.cover)} data-picture={p.coverPath ? '' : undefined} style={picture}>
      {p.canEdit ? (
        <div className={s.coverBtns}>
          <button ref={toggle} type="button" className={s.coverBtn} aria-expanded={popOpen} aria-haspopup="dialog" disabled={p.sending === 'cover'}
            onClick={() => onPop(!popOpen)}>
            {p.sending === 'cover' ? 'Uploading…' : '🖼️ Change cover'}
          </button>
        </div>
      ) : null}
      {p.canEdit && popOpen ? (
        <div ref={pop} className={s.coverPop} role="dialog" aria-label="Change cover">
          <div className={s.coverOpts} role="radiogroup" aria-label="Cover">
            {Array.from({ length: COVERS }, (_, i) => (
              <button key={i} type="button" role="radio" aria-checked={!p.coverPath && p.cover === i} aria-label={`Cover ${i + 1}`}
                className={s.coverOpt} data-cover={String(i)} onClick={() => p.onPreset(i)} />
            ))}
          </div>
          <button type="button" className={s.dashBtn} onClick={() => p.onPick('cover')}>⬆ Upload a cover image</button>
        </div>
      ) : null}
      {p.canEdit ? (
        <button type="button" className={s.avatar} style={{ background: p.avatarBg }} title="Change profile picture" aria-label="Change profile picture"
          disabled={p.sending === 'avatar'} onClick={() => p.onPick('avatar')}>
          {face}
        </button>
      ) : (
        <div className={s.avatar} style={{ background: p.avatarBg }} aria-hidden="true">{face}</div>
      )}
      {p.pet ? <div className={s.coverPet}>{p.pet}</div> : null}
    </div>
  )
}
