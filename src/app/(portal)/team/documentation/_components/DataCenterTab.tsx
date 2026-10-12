'use client'

import { useMemo, useRef, useState, type DragEvent } from 'react'
import { flash } from '@/components/hrv/toast'
import { addDriveFolder, deleteDriveFile, deleteDriveFolder, openDriveFile, renameDriveFolder, saveDriveFile } from '@/lib/documentation/drive-actions'
import {
  ROOT, crumbs, folderCards, folderNameRefusal, parsePlace, personAt, placeExists, placeFiles, placeName,
  searchDrive, sizeLabel, takesFolders, type Drive, type DriveFile, type FolderCard, type SearchHit,
} from '@/lib/documentation/drive'
import { DOC_ACCEPT, dataCenterPeople, docShortDay, plural, type Documentation } from '@/lib/documentation/model'
import { uploadDocumentationFile } from '@/lib/documentation/upload'
import UploadLetterWindow from './UploadLetterWindow'
import type { PreviewTarget } from './PreviewDrawer'
import { FileTile, FolderTile } from './drive/Cards'
import FolderNameWindow from './drive/FolderNameWindow'
import Menu, { type MenuItem } from './drive/Menu'
import PersonFolder from './drive/PersonFolder'
import {
  BinGlyph, ChevronGlyph, CompanyGlyph, DownGlyph, EyeGlyph, FolderGlyph, NewFolderGlyph, PersonGlyph, SearchGlyph, UploadGlyph,
} from './drive/icons'
import s from './drive/drive.module.css'

/** Opens a Data center file the way the browser downloads: a short link with its name. */
async function downloadDrive(id: string): Promise<string | null> {
  const link = await openDriveFile(id, 'download')
  if (!link.ok) return link.reason
  window.location.assign(link.url)
  return null
}

/** What each place says under the path. */
function hintOf(at: string, name: string): string {
  const p = parsePlace(at)
  if (!p) return ''
  if (p.kind === 'root') return 'HOUZS Venture, its departments and its people come from People by themselves. Make a folder here for a subsidiary, and folders by department inside it.'
  if (p.kind === 'company') return 'Each department’s people come from People. Publish & save files every copy into its person’s folder by itself.'
  if (p.kind === 'dept') return `Everybody active in ${name} — each folder is their record.`
  if (p.kind === 'folder') return 'Kept for HR — a file here is a record, sent to nobody.'
  return ''
}

/**
 * Documentation › Data center as a Drive (2026-10-12 — the user: the people column "scroll 得很高"; "参考 Google
 * Drive 的做法 … 可以 create folder 的", company → department → the person; HR is centralized, so a subsidiary
 * gets a folder and folders by department inside it). + New (New folder · Upload files, or Upload a letter in a
 * person's folder), the path back up, a search over the whole Data center; folders as compact cards, files as
 * cards with a big preview. HOUZS Venture, its departments and their people are made by People (lib/documentation/
 * drive.ts); a person's folder is their record — the letters, the missing compulsory ones, Withdraw — as before.
 * Files can be dropped onto a folder HR made. The place is the page's address (`?in=`).
 */
export default function DataCenterTab({
  data,
  drive,
  driveError,
  can,
  at,
  onAt,
  onView,
}: {
  data: Documentation
  drive: Drive
  driveError: string | null
  can: { create: boolean; edit: boolean }
  at: string
  onAt: (at: string) => void
  onView: (target: PreviewTarget) => void
}) {
  const [query, setQuery] = useState('')
  const [making, setMaking] = useState(false)
  const [renaming, setRenaming] = useState<FolderCard | null>(null)
  const [letterUpload, setLetterUpload] = useState(false)
  const [showDeleted, setShowDeleted] = useState(false)
  const [dropping, setDropping] = useState(false)
  const [uploading, setUploading] = useState(0)
  const filePick = useRef<HTMLInputElement>(null)

  const here = placeExists(at, data, drive) ? at : ROOT
  const place = parsePlace(here)
  const name = placeName(here, data, drive)
  const path = crumbs(here, data, drive)
  const people = useMemo(() => dataCenterPeople(data), [data])
  const person = place?.kind === 'person' ? people.find(p => p.id === place.id) ?? null : null
  const folders = folderCards(here, data, drive)
  // What People makes, named by what it is (the companies, a company's departments, a department's people), then the
  // folders HR made there.
  const auto = folders.filter(c => !c.own)
  const own = folders.filter(c => c.own)
  const sections = (
    place?.kind === 'root'
      ? [{ title: 'Companies', cards: folders }]
      : [
          { title: place?.kind === 'company' ? 'Departments' : 'People', cards: auto },
          { title: 'Folders', cards: own },
        ]
  ).filter(x => x.cards.length > 0)
  const files = placeFiles(here, drive, showDeleted)
  const deletedHere = drive.files.filter(f => f.parent === here && f.deletedAt).length
  const hits = useMemo(() => searchDrive(query, data, drive), [query, data, drive])
  const takesFiles = can.create && takesFolders(here)

  function open(next: string) {
    onAt(next)
    setQuery('')
    setShowDeleted(false)
  }

  async function makeFolder(folderName: string) {
    const res = await addDriveFolder(here, folderName)
    if (res.ok) flash(`${folderName} made in ${name}`)
    return res
  }

  async function rename(card: FolderCard, folderName: string) {
    const p = parsePlace(card.at)
    if (!p) return { ok: false as const, reason: 'That folder is not there any more.' }
    const res = await renameDriveFolder(p.id, folderName)
    if (res.ok) flash(`${card.name} is now ${folderName}`)
    return res
  }

  async function removeFolder(card: FolderCard) {
    const p = parsePlace(card.at)
    if (!p) return
    const res = await deleteDriveFolder(p.id)
    flash(res.ok ? `${card.name} deleted` : res.reason)
  }

  async function uploadFiles(list: File[]) {
    if (!list.length || !takesFiles) return
    setUploading(n => n + list.length)
    let saved = 0
    let refused = ''
    for (const file of list) {
      try {
        const up = await uploadDocumentationFile('drive', file)
        if (!up.ok) {
          refused ||= `${file.name}: ${up.reason}`
          continue
        }
        const res = await saveDriveFile({ parent: here, path: up.path, fileName: up.fileName, contentType: up.contentType, size: up.size })
        if (res.ok) saved++
        else refused ||= `${file.name}: ${res.reason}`
      } catch {
        refused ||= `${file.name} could not be uploaded. Please try again.`
      } finally {
        setUploading(n => n - 1)
      }
    }
    flash(refused ? (saved ? `${plural(saved, 'file')} saved in ${name} · ${refused}` : refused) : `${plural(saved, 'file')} saved in ${name}`)
  }

  async function removeFile(f: DriveFile) {
    const res = await deleteDriveFile(f.id)
    flash(res.ok ? `${f.fileName} deleted` : res.reason)
  }

  async function download(f: DriveFile) {
    const refused = await downloadDrive(f.id)
    flash(refused ?? `Downloads ${f.fileName}`)
  }

  function openHit(h: SearchHit) {
    if (h.kind === 'place') return open(h.card.at)
    if (h.kind === 'file') {
      open(h.file.parent)
      return onView({ kind: 'drive', id: h.file.id })
    }
    open(personAt(h.letter.staffId))
    onView({ kind: 'letter', id: h.letter.id })
  }

  const newItems: Array<MenuItem | 'rule'> = person
    ? [{ key: 'letter', label: 'Upload a letter', icon: <UploadGlyph />, onSelect: () => setLetterUpload(true) }]
    : [
        { key: 'folder', label: 'New folder', icon: <NewFolderGlyph />, onSelect: () => setMaking(true) },
        'rule',
        { key: 'files', label: 'Upload files', icon: <UploadGlyph />, onSelect: () => filePick.current?.click() },
      ]

  const fileItems = (f: DriveFile): Array<MenuItem | 'rule'> => {
    if (f.deletedAt) return [{ key: 'view', label: 'View', icon: <EyeGlyph />, onSelect: () => onView({ kind: 'drive', id: f.id }) }]
    const items: Array<MenuItem | 'rule'> = [
      { key: 'view', label: 'View', icon: <EyeGlyph />, onSelect: () => onView({ kind: 'drive', id: f.id }) },
      { key: 'download', label: 'Download', icon: <DownGlyph />, onSelect: () => void download(f) },
    ]
    if (can.edit) items.push('rule', { key: 'delete', label: 'Delete', confirm: 'Confirm delete', tone: 'danger', icon: <BinGlyph />, onSelect: () => void removeFile(f) })
    return items
  }

  const onDragOver = (e: DragEvent) => {
    if (!takesFiles || !e.dataTransfer.types.includes('Files')) return
    e.preventDefault()
    setDropping(true)
  }
  const onDrop = (e: DragEvent) => {
    if (!takesFiles) return
    e.preventDefault()
    setDropping(false)
    void uploadFiles(Array.from(e.dataTransfer.files))
  }

  return (
    <div
      className={s.drive}
      data-drop={dropping ? 'true' : undefined}
      onDragOver={onDragOver}
      onDragLeave={e => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropping(false)
      }}
      onDrop={onDrop}
    >
      <div className={s.bar}>
        {can.create ? (
          <Menu
            label="New"
            side="left"
            items={newItems}
            button={props => (
              <button type="button" className={s.newBtn} {...props}>
                <span className={s.newPlus} aria-hidden="true">+</span>
                New
              </button>
            )}
          />
        ) : null}
        <nav className={s.crumbs} aria-label="Folder path">
          {path.map((c, i) =>
            i === path.length - 1 ? (
              <span key={c.at} className={s.crumbHere} aria-current="page">{c.name}</span>
            ) : (
              <span key={c.at} style={{ display: 'contents' }}>
                <button type="button" className={s.crumb} onClick={() => open(c.at)}>{c.name}</button>
                <span className={s.crumbSep} aria-hidden="true"><ChevronGlyph size={14} /></span>
              </span>
            ),
          )}
        </nav>
        <div className={s.searchWrap}>
          <span className={s.searchIcon}><SearchGlyph size={15} /></span>
          <input
            className={s.search}
            value={query}
            placeholder="Search the Data center"
            aria-label="Search the Data center"
            onChange={e => setQuery(e.target.value)}
          />
          {query ? (
            <button type="button" className={s.searchClear} onClick={() => setQuery('')} aria-label="Clear the search">×</button>
          ) : null}
        </div>
        <input
          ref={filePick}
          type="file"
          multiple
          accept={DOC_ACCEPT}
          hidden
          onChange={e => {
            const list = Array.from(e.target.files ?? [])
            e.target.value = ''
            void uploadFiles(list)
          }}
        />
      </div>

      {driveError ? <div className={s.error} role="alert">{driveError}</div> : null}

      {query.trim() ? (
        <div className={s.sect}>
          <div className={s.sectHead}>
            Found <span className={s.sectCount}>{hits.length}</span>
          </div>
          {hits.length ? (
            <div className={s.results}>
              {hits.map(h => {
                const key = h.kind === 'place' ? h.card.at : h.kind === 'file' ? `file:${h.file.id}` : `letter:${h.letter.id}`
                const title = h.kind === 'place' ? h.card.name : h.kind === 'file' ? h.file.fileName : `${h.letter.typeName} · ${h.letter.fileName}`
                const kind = h.kind === 'place' ? (h.card.kind === 'person' ? 'Person' : h.card.kind === 'dept' ? 'Department' : 'Folder') : h.kind === 'file' ? 'File' : 'Letter'
                return (
                  <button key={key} type="button" className={s.hit} onClick={() => openHit(h)}>
                    <span className={s.folderIcon} data-kind={h.kind === 'place' ? h.card.kind : 'file'}>
                      {h.kind === 'place' ? (h.card.kind === 'person' ? <PersonGlyph /> : h.card.kind === 'company' ? <CompanyGlyph /> : <FolderGlyph />) : <EyeGlyph size={20} />}
                    </span>
                    <span className={s.hitText}>
                      <span className={s.hitName}>{title}</span>
                      <span className={s.hitPath}>{h.path}</span>
                    </span>
                    <span className={s.hitKind}>{kind}</span>
                  </button>
                )
              })}
            </div>
          ) : (
            <div className={s.empty}>Nothing in the Data center matches “{query.trim()}”.</div>
          )}
        </div>
      ) : person ? (
        <PersonFolder data={data} person={person} can={can} onView={id => onView({ kind: 'letter', id })} onUpload={() => setLetterUpload(true)} />
      ) : (
        <>
          {hintOf(here, name) ? <div className={s.hint}>{hintOf(here, name)}</div> : null}
          {sections.map(sect => (
            <div key={sect.title} className={s.sect}>
              <div className={s.sectHead}>
                {sect.title} <span className={s.sectCount}>{sect.cards.length}</span>
              </div>
              <div className={s.grid}>
                {sect.cards.map(card => (
                  <FolderTile key={card.at} card={card} canEdit={can.edit} onOpen={open} onRename={setRenaming} onDelete={c => void removeFolder(c)} />
                ))}
              </div>
            </div>
          ))}
          {files.length || uploading ? (
            <div className={s.sect}>
              <div className={s.sectHead}>
                Files <span className={s.sectCount}>{files.filter(f => !f.deletedAt).length}</span>
                {uploading ? <span className={s.sectCount}>· uploading {uploading}…</span> : null}
              </div>
              <div className={s.grid}>
                {files.map(f => (
                  <FileTile
                    key={f.id}
                    gone={!!f.deletedAt}
                    title={f.fileName}
                    fileName={f.fileName}
                    contentType={f.contentType}
                    onView={() => onView({ kind: 'drive', id: f.id })}
                    items={fileItems(f)}
                    meta={
                      f.deletedAt ? (
                        <span className={s.gone}>Deleted · {docShortDay(f.deletedAt)}</span>
                      ) : (
                        <>
                          <span>{docShortDay(f.uploadedAt)} · {f.uploadedBy}</span>
                          <span className={s.fileMetaGap} />
                          <span>{sizeLabel(f.size)}</span>
                        </>
                      )
                    }
                  />
                ))}
              </div>
            </div>
          ) : null}
          {deletedHere ? (
            <button type="button" className={s.toggle} onClick={() => setShowDeleted(v => !v)}>
              {showDeleted ? 'Hide' : 'Show'} deleted ({deletedHere})
            </button>
          ) : null}
          {!folders.length && !files.length && !uploading ? (
            <div className={s.empty}>
              <div className={s.emptyTitle}>This folder is empty.</div>
              {can.create ? 'Press + New to make a folder or upload files — or drop files here.' : 'Nothing has been kept here yet.'}
            </div>
          ) : null}
        </>
      )}

      {making ? (
        <FolderNameWindow
          mode="new"
          where={`In ${name}`}
          check={n => folderNameRefusal(n, here, data, drive)}
          onSave={makeFolder}
          onClose={() => setMaking(false)}
        />
      ) : null}
      {renaming ? (
        <FolderNameWindow
          mode="rename"
          where={renaming.name}
          initial={renaming.name}
          check={n => folderNameRefusal(n, here, data, drive, parsePlace(renaming.at)?.id)}
          onSave={n => rename(renaming, n)}
          onClose={() => setRenaming(null)}
        />
      ) : null}
      {person && letterUpload ? (
        <UploadLetterWindow person={{ id: person.id, name: person.name }} types={data.letterTypes} onClose={() => setLetterUpload(false)} />
      ) : null}
    </div>
  )
}
