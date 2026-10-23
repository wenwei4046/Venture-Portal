'use client'

import { useRef, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import { fileRoute } from '@/lib/storage/browser'
import { flash } from '@/components/hrv/toast'
import { saveMktLibProfile } from '@/lib/marketing/actions'
import {
  brandFace, brandLook, brandPath, LIB_AVATAR_COLORS, LIB_BANNER_COLORS, LIB_FONTS, type Library, type LibProfile, type LibSub,
} from '@/lib/marketing/library'
import s from './library.module.css'

// A subsidiary's brand profile (`Library.dc.html` › *Edit … profile*, ⑥-2) — the manager's: the preview, the profile
// picture (a colour, or a logo uploaded) and the background (a colour, or a cover uploaded), the brand font, the display
// name and the caption; Save profile sends it whole. A picture goes to the bucket at once (brand/<uuid>/<name>); one sent
// here and not saved is taken back out when the dialog closes.

/** A brand picture: an image, and a small one. */
const PICTURE_MAX = 10 * 1024 * 1024
/** What a screen reader calls each colour (the handoff names none), in LIB_AVATAR_COLORS' and LIB_BANNER_COLORS' order. */
const AVATAR_NAMES = ['Walnut', 'Navy', 'Charcoal', 'Olive', 'Teal', 'Rust', 'Plum']
const BANNER_NAMES = ['Sand', 'Mist', 'Stone', 'Sage', 'Peach', 'Blush', 'Charcoal']

export default function BrandProfile({ sub, onClose, onSaved }: { sub: LibSub; onClose: () => void; onSaved: (lib: Library) => void }) {
  const [draft, setDraft] = useState<LibProfile>(sub.profile)
  const [sending, setSending] = useState<'avatarPath' | 'bannerPath' | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  // Pictures sent from this dialog — any not saved are taken back out of the bucket.
  const sent = useRef<string[]>([])
  const pickAvatar = useRef<HTMLInputElement>(null)
  const pickBanner = useRef<HTMLInputElement>(null)
  const look = brandLook({ ...sub, profile: draft })
  const set = (p: Partial<LibProfile>) => { setDraft(d => ({ ...d, ...p })); setError('') }

  const takeBack = async (keep: (string | null)[]) => {
    const drop = sent.current.filter(p => !keep.includes(p))
    sent.current = []
    if (drop.length) await (createClient() as unknown as SupabaseClient).storage.from('marketing').remove(drop).catch(() => undefined)
  }
  const close = () => { void takeBack([]); onClose() }

  const send = async (key: 'avatarPath' | 'bannerPath', list: FileList | null) => {
    const file = list?.[0]
    if (!file || sending) return
    if (!file.type.startsWith('image/')) { setError('A brand picture is an image — PNG, JPG, WebP or GIF.'); return }
    if (file.size > PICTURE_MAX) { setError(`${file.name} is over 10 MB.`); return }
    setSending(key)
    try {
      const path = brandPath(file.name, crypto.randomUUID())
      const put = await (createClient() as unknown as SupabaseClient).storage.from('marketing').upload(path, file, { contentType: file.type })
      if (put.error) { setError(put.error.message || `${file.name} could not be uploaded.`); return }
      sent.current.push(path)
      set({ [key]: path })
    } finally {
      setSending(null)
      for (const r of [pickAvatar, pickBanner]) if (r.current) r.current.value = ''
    }
  }

  const save = async () => {
    if (busy || sending) return
    setBusy(true)
    try {
      const r = await saveMktLibProfile(sub.id, draft)
      if (!r.ok) { setError(r.reason); return }
      await takeBack([draft.avatarPath, draft.bannerPath])
      onSaved(r.library)
      flash('Brand profile saved')
    } finally {
      setBusy(false)
    }
  }

  const fileName = (path: string | null) => (path ? path.slice(path.lastIndexOf('/') + 1) : '')

  return (
    <div className={s.scrim} onClick={close}>
      <div className={`${s.dialog} ${s.dialogWide}`} role="dialog" aria-modal="true" aria-label={`Edit ${sub.name} profile`} onClick={e => e.stopPropagation()}>
        <div className={s.dialogHead}>
          <div className={s.dialogTitle}>Edit {sub.name} profile</div>
          <button type="button" className={s.x} aria-label="Close" onClick={close}>×</button>
        </div>

        <div className={s.preview} data-dark={look.banner.dark ? '' : undefined}
          style={look.banner.img ? { backgroundImage: `url("${fileRoute('marketing', look.banner.img)}")` } : { background: look.banner.bg ?? undefined }}>
          <span className={`${s.previewAvatar}${look.avatar.bg ? ` ${s.avatarColour}` : ''}`} style={look.avatar.bg ? { background: look.avatar.bg } : undefined} aria-hidden="true">
            {look.avatar.img ? <img src={fileRoute('marketing', look.avatar.img)} alt="" /> : look.avatar.text}
          </span>
          <div className={s.ellipsis}>
            <div className={`${s.previewName}${look.font ? ` ${s.brandName}` : ''}`} style={brandFace(look.font)}>{look.name}</div>
            <div className={s.previewCap}>{look.caption}</div>
          </div>
        </div>

        <div className={s.profileGrid}>
          <div className={s.field}>
            <span className={s.profileHead}>Profile picture</span>
            <div className={s.swatches} role="radiogroup" aria-label="Profile picture colour">
              {LIB_AVATAR_COLORS.map((c, i) => (
                <button key={c} type="button" role="radio" aria-checked={!draft.avatarPath && draft.avatar === c} aria-label={AVATAR_NAMES[i]}
                  className={`${s.swatch24} ${!draft.avatarPath && draft.avatar === c ? s.swatchOn : ''}`} style={{ background: c }}
                  onClick={() => set({ avatar: c, avatarPath: null })} />
              ))}
            </div>
            <button type="button" className={s.dashBtn} disabled={!!sending}
              onClick={() => (draft.avatarPath ? set({ avatarPath: null }) : pickAvatar.current?.click())}>
              {sending === 'avatarPath' ? 'Uploading…' : draft.avatarPath ? `✓ ${fileName(draft.avatarPath)} · remove` : '⬆ Upload logo'}
            </button>
            <input ref={pickAvatar} type="file" accept="image/*" hidden onChange={e => void send('avatarPath', e.target.files)} />
          </div>
          <div className={s.field}>
            <span className={s.profileHead}>Background picture</span>
            <div className={s.swatches} role="radiogroup" aria-label="Background colour">
              {LIB_BANNER_COLORS.map((c, i) => (
                <button key={c} type="button" role="radio" aria-checked={!draft.bannerPath && draft.banner === c} aria-label={BANNER_NAMES[i]}
                  className={`${s.swatch24} ${s.swatchEdge} ${!draft.bannerPath && draft.banner === c ? s.swatchOn : ''}`} style={{ background: c }}
                  onClick={() => set({ banner: c, bannerPath: null })} />
              ))}
            </div>
            <button type="button" className={s.dashBtn} disabled={!!sending}
              onClick={() => (draft.bannerPath ? set({ bannerPath: null }) : pickBanner.current?.click())}>
              {sending === 'bannerPath' ? 'Uploading…' : draft.bannerPath ? `✓ ${fileName(draft.bannerPath)} · remove` : '⬆ Upload cover'}
            </button>
            <input ref={pickBanner} type="file" accept="image/*" hidden onChange={e => void send('bannerPath', e.target.files)} />
          </div>
        </div>

        <div className={s.field}>
          <span className={s.profileHead}>Brand font</span>
          <div className={s.fontGrid} role="radiogroup" aria-label="Brand font">
            {LIB_FONTS.map(f => (
              <button key={f} type="button" role="radio" aria-checked={draft.font === f} className={`${s.fontTile} ${draft.font === f ? s.fontTileOn : ''}`}
                onClick={() => set({ font: f })}>
                <span className={s.fontSample} style={brandFace(f)}>{look.name}</span>
                <span className={s.fontName}>{f}</span>
              </button>
            ))}
          </div>
        </div>

        <div className={s.profileGrid}>
          <label className={s.field}>
            <span className={s.profileHead}>Display name</span>
            <input className={s.input} value={draft.name} placeholder={sub.name} maxLength={40} onChange={e => set({ name: e.target.value })} />
          </label>
          <label className={s.field}>
            <span className={s.profileHead}>Caption</span>
            <input className={s.input} value={draft.caption} maxLength={80} onChange={e => set({ caption: e.target.value })} />
          </label>
        </div>

        {error ? <div className={s.err} role="status">{error}</div> : null}
        <div className={`${s.dialogBtns} ${s.dialogFoot}`}>
          <button type="button" className={s.btn} onClick={close}>Cancel</button>
          <button type="button" className={s.btnPrimary} disabled={busy || !!sending} onClick={() => void save()}>Save profile</button>
        </div>
      </div>
    </div>
  )
}
