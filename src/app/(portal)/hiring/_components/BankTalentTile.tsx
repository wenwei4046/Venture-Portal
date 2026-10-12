'use client'

import Menu, { type MenuItem } from '@/app/(portal)/team/documentation/_components/drive/Menu'
import { PersonGlyph } from '@/app/(portal)/team/documentation/_components/drive/icons'
import s from '@/app/(portal)/team/documentation/_components/drive/drive.module.css'

/**
 * A person in the Talent Bank's Drive (2026-10-12): the Data center's person card — the glyph, their name, what they
 * fit and where they stand (Available / Interviewing · HR-…), a ⋮ with Open, Move to… and Remove. A press opens
 * their panel.
 */
export default function BankTalentTile({
  name,
  line,
  items,
  onOpen,
}: {
  name: string
  line: string
  items: Array<MenuItem | 'rule'>
  onOpen: () => void
}) {
  return (
    <div className={s.folder} data-kind="person">
      <button type="button" className={s.folderOpen} onClick={onOpen}>
        <span className={s.folderIcon} data-kind="person">
          <PersonGlyph />
        </span>
        <span className={s.folderText}>
          <span className={s.folderName}>{name}</span>
          <span className={s.folderLine}>{line}</span>
        </span>
      </button>
      {items.length ? <Menu label={`More actions for ${name}`} items={items} /> : null}
    </div>
  )
}
