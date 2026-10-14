'use client'

import { useRef, type MouseEvent, type ReactNode } from 'react'
import { fileExt } from '@/lib/documentation/model'
import { fileTone, lockWords, type DriveLock, type FolderCard } from '@/lib/documentation/drive'
import Menu, { type MenuHandle, type MenuItem } from './Menu'
import { BinGlyph, CompanyGlyph, FolderGlyph, LockGlyph, PenGlyph, PersonGlyph, SharedGlyph, ToneGlyph } from './icons'
import s from './drive.module.css'

/**
 * What a card is (2026-10-14): View only me's lock — "Only Alvin and above" — and, in a person's folder, a tick of a
 * person when they see it ("PETER can view").
 */
export function Badges({ lock, sharedWith }: { lock?: DriveLock | null; sharedWith?: string | null }) {
  if (!lock && !sharedWith) return null
  return (
    <span className={s.badges}>
      {lock ? (
        <span className={s.badge} data-kind="lock" title={`View only me · ${lockWords(lock)}`} aria-label={`View only me · ${lockWords(lock)}`}>
          <LockGlyph size={13} />
        </span>
      ) : null}
      {sharedWith ? (
        <span className={s.badge} data-kind="shared" title={`${sharedWith} can view`} aria-label={`${sharedWith} can view`}>
          <SharedGlyph size={13} />
        </span>
      ) : null}
    </span>
  )
}

/** A right-click opens the card's own menu where the pointer is (2026-10-14) — when it has one. */
function useContextMenu(items: Array<MenuItem | 'rule'>) {
  const handle = useRef<MenuHandle>(null)
  const onContextMenu = (e: MouseEvent) => {
    if (!items.length) return
    e.preventDefault()
    handle.current?.openAt(e.clientX, e.clientY)
  }
  return { handle, onContextMenu }
}

/**
 * A folder of the Data center (2026-10-12): the compact card of the user's Drive screenshot — its glyph (a company,
 * a department's folder, a person), the name, what is in it, a red "!" where a compulsory letter is missing; a folder
 * HR made has a ⋮ with Rename and Delete for Documentation · Edit. A press opens it. `items` gives a card a ⋮ of its
 * own instead (the Talent Bank's Drive: a folder's Move to…, a department's Move everyone to…). Since 2026-10-14 a
 * right-click opens the same menu, and a folder HR made wears its lock and its share (`sharedWith`: the person it is
 * shared with, when they see it).
 */
export function FolderTile({
  card,
  canEdit,
  onOpen,
  onRename,
  onDelete,
  items,
  sharedWith,
}: {
  card: FolderCard
  canEdit: boolean
  onOpen: (at: string) => void
  onRename: (card: FolderCard) => void
  onDelete: (card: FolderCard) => void
  items?: Array<MenuItem | 'rule'>
  sharedWith?: string | null
}) {
  const Glyph = card.kind === 'company' ? CompanyGlyph : card.kind === 'person' ? PersonGlyph : FolderGlyph
  const menu: Array<MenuItem | 'rule'> =
    items ??
    (card.own && canEdit
      ? [
          { key: 'rename', label: 'Rename', icon: <PenGlyph />, onSelect: () => onRename(card) },
          { key: 'delete', label: 'Delete', confirm: 'Confirm delete', tone: 'danger', icon: <BinGlyph />, onSelect: () => onDelete(card) },
        ]
      : [])
  const context = useContextMenu(menu)
  return (
    <div className={s.folder} data-kind={card.kind} onContextMenu={context.onContextMenu}>
      <button type="button" className={s.folderOpen} onClick={() => onOpen(card.at)}>
        <span className={s.folderIcon} data-kind={card.kind}>
          <Glyph />
        </span>
        <span className={s.folderText}>
          <span className={s.folderName}>{card.name}</span>
          <span className={s.folderLine}>{card.line}</span>
        </span>
      </button>
      <Badges lock={card.lock} sharedWith={sharedWith} />
      {card.missing ? (
        <span className={s.bang} title={card.missingWhy} aria-label={card.missingWhy}>
          {card.kind === 'person' ? '!' : card.missing}
        </span>
      ) : null}
      {menu.length ? <Menu label={`More actions for ${card.name}`} items={menu} handle={context.handle} /> : null}
    </div>
  )
}

/**
 * A file of the Data center — a letter on a person's record, or a file HR keeps in a folder: its kind's badge and its
 * name over a big preview (a folded page wearing the extension in the kind's colour — no thumbnail: a file is opened
 * only by a press, which its trail records), a line under it, and a ⋮ — which a right-click opens too (2026-10-14).
 * A press on the preview opens it.
 */
export function FileTile({
  title,
  sub,
  fileName,
  contentType,
  meta,
  gone = false,
  items,
  onView,
  lock,
  sharedWith,
}: {
  title: string
  sub?: string
  fileName: string
  contentType: string | null
  meta: ReactNode
  gone?: boolean
  items: Array<MenuItem | 'rule'>
  onView: () => void
  lock?: DriveLock | null
  sharedWith?: string | null
}) {
  const tone = fileTone(fileName, contentType)
  const context = useContextMenu(items)
  return (
    <div className={s.file} data-gone={gone ? 'true' : undefined} onContextMenu={context.onContextMenu}>
      <div className={s.fileTop}>
        <span className={`${s.fileBadge} ${s.tone}`} data-tone={tone} aria-hidden="true">
          <ToneGlyph tone={tone} />
        </span>
        <span className={s.fileTitle}>
          <span className={s.fileName} title={title}>{title}</span>
          {sub ? <span className={s.fileSub} title={sub}>{sub}</span> : null}
        </span>
        <Badges lock={lock} sharedWith={sharedWith} />
        {items.length ? <Menu label={`More actions for ${title}`} items={items} handle={context.handle} /> : null}
      </div>
      <button type="button" className={s.filePreview} onClick={onView} aria-label={`View ${title}`}>
        <span className={s.sheet} aria-hidden="true">
          <span className={s.sheetFold} />
          <span className={`${s.sheetLine} ${s.sheetLine1}`} />
          <span className={`${s.sheetLine} ${s.sheetLine2}`} />
          <span className={`${s.sheetLine} ${s.sheetLine3}`} />
          <span className={`${s.sheetExt} ${s.tone}`} data-tone={tone}>{fileExt(fileName) || 'FILE'}</span>
        </span>
      </button>
      <div className={s.fileMeta}>{meta}</div>
    </div>
  )
}
