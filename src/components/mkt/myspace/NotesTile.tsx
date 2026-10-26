'use client'

import s from './myspace.module.css'

/** My Space's Notes tile (`My Space Bento.dc.html`): the owner's own jottings — saved as they stop typing, and as they
 * leave the box; on a visit, theirs to read (⑦-4 — the user's answer 38). */
export default function NotesTile({ text, canEdit, onChange, onDone, placeholder = 'Jot something down' }: {
  text: string; canEdit: boolean; onChange: (text: string) => void; onDone: () => void; placeholder?: string
}) {
  return (
    <div className={s.notes}>
      <div className={s.notesHead}>📝 Notes</div>
      <textarea
        className={s.notesText}
        value={text}
        readOnly={!canEdit}
        maxLength={4000}
        placeholder={placeholder}
        aria-label="Notes"
        onChange={e => onChange(e.target.value)}
        onBlur={onDone}
      />
    </div>
  )
}
