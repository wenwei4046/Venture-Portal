'use client'

import type { ReactNode } from 'react'
import { fileExt } from '@/lib/documentation/model'
import { fileTone, type FolderCard } from '@/lib/documentation/drive'
import Menu, { type MenuItem } from './Menu'
import { BinGlyph, CompanyGlyph, FolderGlyph, PenGlyph, PersonGlyph, ToneGlyph } from './icons'
import s from './drive.module.css'

/**
 * A folder of the Data center (2026-10-12): the compact card of the user's Drive screenshot — its glyph (a company,
 * a department's folder, a person), the name, what is in it, a red "!" where a compulsory letter is missing; a folder
 * HR made has a ⋮ with Rename and Delete for Documentation · Edit. A press opens it.
 */
export function FolderTile({
  card,
  canEdit,
  onOpen,
  onRename,
  onDelete,
}: {
  card: FolderCard
  canEdit: boolean
  onOpen: (at: string) => void
  onRename: (card: FolderCard) => void
  onDelete: (card: FolderCard) => void
}) {
  const Glyph = card.kind === 'company' ? CompanyGlyph : card.kind === 'person' ? PersonGlyph : FolderGlyph
  return (
    <div className={s.folder} data-kind={card.kind}>
      <button type="button" className={s.folderOpen} onClick={() => onOpen(card.at)}>
        <span className={s.folderIcon} data-kind={card.kind}>
          <Glyph />
        </span>
        <span className={s.folderText}>
          <span className={s.folderName}>{card.name}</span>
          <span className={s.folderLine}>{card.line}</span>
        </span>
      </button>
      {card.missing ? (
        <span className={s.bang} title={card.missingWhy} aria-label={card.missingWhy}>
          {card.kind === 'person' ? '!' : card.missing}
        </span>
      ) : null}
      {card.own && canEdit ? (
        <Menu
          label={`More actions for ${card.name}`}
          items={[
            { key: 'rename', label: 'Rename', icon: <PenGlyph />, onSelect: () => onRename(card) },
            { key: 'delete', label: 'Delete', confirm: 'Confirm delete', tone: 'danger', icon: <BinGlyph />, onSelect: () => onDelete(card) },
          ]}
        />
      ) : null}
    </div>
  )
}

/**
 * A file of the Data center — a letter on a person's record, or a file HR keeps in a folder: its kind's badge and its
 * name over a big preview (a folded page wearing the extension in the kind's colour — no thumbnail: a file is opened
 * only by a press, which its trail records), a line under it, and a ⋮. A press on the preview opens it.
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
}: {
  title: string
  sub?: string
  fileName: string
  contentType: string | null
  meta: ReactNode
  gone?: boolean
  items: Array<MenuItem | 'rule'>
  onView: () => void
}) {
  const tone = fileTone(fileName, contentType)
  return (
    <div className={s.file} data-gone={gone ? 'true' : undefined}>
      <div className={s.fileTop}>
        <span className={`${s.fileBadge} ${s.tone}`} data-tone={tone} aria-hidden="true">
          <ToneGlyph tone={tone} />
        </span>
        <span className={s.fileTitle}>
          <span className={s.fileName} title={title}>{title}</span>
          {sub ? <span className={s.fileSub} title={sub}>{sub}</span> : null}
        </span>
        {items.length ? <Menu label={`More actions for ${title}`} items={items} /> : null}
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
