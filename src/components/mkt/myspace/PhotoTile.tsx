'use client'

import type { SpacePicture } from '@/lib/marketing/space'
import { fileRoute } from '@/lib/storage/browser'
import s from './myspace.module.css'

/** My Space's Photo tile (`My Space Bento.dc.html`): a picture of the owner's — a visitor sees it too since ⑦-4 (the
 * user's answer 38; space/, mig 20261025038000) — or *Add a photo*; a click picks another, once no other picture is on
 * its way up. */
export default function PhotoTile({ path, canEdit, sending, onPick }: { path: string | null; canEdit: boolean; sending: SpacePicture | null; onPick: () => void }) {
  const style = path ? { backgroundImage: `url("${fileRoute('marketing', path)}")` } : undefined
  if (!canEdit) {
    return <div className={s.photo} style={style} role={path ? 'img' : undefined} aria-label={path ? 'Photo' : undefined} />
  }
  return (
    <button type="button" className={s.photo} style={style} disabled={sending != null} aria-label={path ? 'Change the photo' : 'Add a photo'} onClick={onPick}>
      {sending === 'photo' ? <span className={s.photoEmpty}>Uploading…</span> : path ? null : <span className={s.photoEmpty}>🖼️ Add a photo</span>}
    </button>
  )
}
