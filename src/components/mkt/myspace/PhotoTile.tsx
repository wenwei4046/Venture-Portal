'use client'

import { fileRoute } from '@/lib/storage/browser'
import s from './myspace.module.css'

/** My Space's Photo tile (`My Space Bento.dc.html`): a picture of the owner's — theirs alone to see (mine/, mig
 * 20261024007600) — or *Add a photo*; a click picks another. */
export default function PhotoTile({ path, canEdit, sending, onPick }: { path: string | null; canEdit: boolean; sending: boolean; onPick: () => void }) {
  const style = path ? { backgroundImage: `url("${fileRoute('marketing', path)}")` } : undefined
  if (!canEdit) {
    return <div className={s.photo} style={style} role={path ? 'img' : undefined} aria-label={path ? 'Photo' : undefined} />
  }
  return (
    <button type="button" className={s.photo} style={style} disabled={sending} aria-label={path ? 'Change the photo' : 'Add a photo'} onClick={onPick}>
      {sending ? <span className={s.photoEmpty}>Uploading…</span> : path ? null : <span className={s.photoEmpty}>🖼️ Add a photo</span>}
    </button>
  )
}
