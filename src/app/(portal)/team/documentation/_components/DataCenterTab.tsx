'use client'

import { useMemo, useRef, useState, type DragEvent } from 'react'
import { flash } from '@/components/hrv/toast'
import {
  addDriveFolder, deleteDriveFile, deleteDriveFolder, deleteDriveItemForever, emptyDriveBin, moveDriveFolder, openDriveFile, renameDriveFolder,
  restoreDriveItem, saveDriveFile,
} from '@/lib/documentation/drive-actions'
import {
  BIN, HV, ROOT, binDaysLeft, binFrom, binLeftLabel, binSections, crumbs, folderCards, folderNameRefusal, moveTargets, parentOf, parsePlace,
  pathLine, personAt, placeExists, placeFiles, placeName, searchDrive, sizeLabel, takesFolders, type Drive, type DriveBinItem, type DriveFile,
  type FolderCard, type SearchHit,
} from '@/lib/documentation/drive'
import { DOC_ACCEPT, dataCenterPeople, docShortDay, plural, type Documentation } from '@/lib/documentation/model'
import { uploadDocumentationFile } from '@/lib/documentation/upload'
import UploadLetterWindow from './UploadLetterWindow'
import type { PreviewTarget } from './PreviewDrawer'
import { FileTile, FolderTile } from './drive/Cards'
import FolderNameWindow from './drive/FolderNameWindow'
import Menu, { type MenuItem } from './drive/Menu'
import MoveWindow from './drive/MoveWindow'
import PersonFolder from './drive/PersonFolder'
import {
  BinGlyph, ChevronGlyph, CompanyGlyph, DownGlyph, EyeGlyph, FolderGlyph, NewFolderGlyph, PenGlyph, PersonGlyph, RestoreGlyph, SearchGlyph,
  UploadGlyph,
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
/**
 * Documentation › Data center as a Drive (2026-10-12 — the user: the people column "scroll 得很高"; "参考 Google
 * Drive 的做法 … 可以 create folder 的", company → department → the person; HR is centralized, so a subsidiary
 * gets a folder and folders by department inside it). + New (New folder · Upload files, or Upload a letter in a
 * person's folder), the path back up, a search over the whole Data center; folders as compact cards, files as
 * cards with a big preview. HOUZS Venture, its departments and their people are made by People (lib/documentation/
 * drive.ts); a person's folder is their record — the letters, the missing compulsory ones, Withdraw — as before.
 * Files can be dropped onto a folder HR made. The place is the page's address (`?in=`).
 *
 * The Talent Bank's rules since 2026-10-13 (the user: "Data center 也加 Bin 和 Move to…"): what HR deletes — a file
 * it keeps, an empty folder it made — waits in the Bin (`?in=bin`) 30 days, its days counting down, for Restore or
 * Delete forever; a folder HR made moves with Move to…, everything in it going along.
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
  const [moving, setMoving] = useState<FolderCard | null>(null)
  const [emptying, setEmptying] = useState(false)
  // The Bin's days count from the server's read — fresh after every write; the page's first draw only when unknown.
  const [drawnAt] = useState(() => Date.now())
  const now = Date.parse(drive.readAt) || drawnAt
  const filePick = useRef<HTMLInputElement>(null)

  const inBin = at === BIN
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
  const takesFiles = can.create && !inBin && takesFolders(here)
  const bin = binSections(drive.bin)

  function open(next: string) {
    onAt(next)
    setQuery('')
    setShowDeleted(false)
    setEmptying(false)
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
    flash(res.ok ? `${card.name} moved to the Bin` : res.reason)
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
    flash(res.ok ? `${f.fileName} moved to the Bin` : res.reason)
  }

  // ── The Bin ──
  async function restore(item: DriveBinItem) {
    const res = await restoreDriveItem(item.id)
    flash(res.ok ? `${item.name} restored to ${res.label}` : res.reason)
  }

  async function deleteForever(item: DriveBinItem) {
    const res = await deleteDriveItemForever(item.id)
    flash(res.ok ? `${item.name} deleted forever` : res.reason)
  }

  async function emptyBin() {
    setEmptying(false)
    const res = await emptyDriveBin()
    flash(res.ok ? `Bin emptied · ${plural(res.count, 'item')} deleted forever` : res.reason)
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
    if (can.edit) items.push('rule', { key: 'delete', label: 'Move to Bin', tone: 'danger', icon: <BinGlyph />, onSelect: () => void removeFile(f) })
    return items
  }

  // A folder HR made: Rename, Move to… (with everything in it), Move to Bin. What People makes has no menu.
  const folderItems = (card: FolderCard): Array<MenuItem | 'rule'> =>
    card.own && can.edit
      ? [
          { key: 'rename', label: 'Rename', icon: <PenGlyph />, onSelect: () => setRenaming(card) },
          { key: 'move', label: 'Move to…', icon: <FolderGlyph size={16} />, onSelect: () => setMoving(card) },
          'rule',
          { key: 'delete', label: 'Move to Bin', tone: 'danger', icon: <BinGlyph />, onSelect: () => void removeFolder(card) },
        ]
      : []

  // Something in the Bin: Restore, or Delete forever (asked once more). Without Edit, nothing.
  const binItems = (item: DriveBinItem): Array<MenuItem | 'rule'> =>
    can.edit
      ? [
          { key: 'restore', label: 'Restore', icon: <RestoreGlyph />, onSelect: () => void restore(item) },
          'rule',
          { key: 'forever', label: 'Delete forever', confirm: 'Confirm delete forever', tone: 'danger', icon: <BinGlyph />, onSelect: () => void deleteForever(item) },
        ]
      : []
  const inTheBin = (item: DriveBinItem) => () => flash(`${item.name} is in the Bin — restore it to open it.`)
  const binLine = (item: DriveBinItem) => `${binFrom(item, data, drive)} · ${binLeftLabel(binDaysLeft(item, now))}`

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
        {can.create && !inBin ? (
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
          {inBin ? (
            <>
              <button type="button" className={s.crumb} onClick={() => open(ROOT)}>Data center</button>
              <span className={s.crumbSep} aria-hidden="true"><ChevronGlyph size={14} /></span>
              <span className={s.crumbHere} aria-current="page">Bin</span>
            </>
          ) : (
            path.map((c, i) =>
              i === path.length - 1 ? (
                <span key={c.at} className={s.crumbHere} aria-current="page">{c.name}</span>
              ) : (
                <span key={c.at} style={{ display: 'contents' }}>
                  <button type="button" className={s.crumb} onClick={() => open(c.at)}>{c.name}</button>
                  <span className={s.crumbSep} aria-hidden="true"><ChevronGlyph size={14} /></span>
                </span>
              ),
            )
          )}
        </nav>
        {inBin ? (
          can.edit && drive.bin.length ? (
            <button
              type="button"
              className={s.emptyBin}
              data-armed={emptying ? 'true' : undefined}
              onClick={() => (emptying ? void emptyBin() : setEmptying(true))}
            >
              <BinGlyph />
              {emptying ? 'Confirm empty bin' : 'Empty bin'}
            </button>
          ) : null
        ) : (
          <>
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
            <button type="button" className={s.binBtn} onClick={() => open(BIN)}>
              <BinGlyph />
              Bin
              {drive.bin.length ? <span className={s.binCount}>{drive.bin.length}</span> : null}
            </button>
          </>
        )}
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

      {inBin ? (
        drive.bin.length ? (
          <>
            {bin.folders.length ? (
              <div className={s.sect}>
                <div className={s.sectHead}>
                  Folders <span className={s.sectCount}>{bin.folders.length}</span>
                </div>
                <div className={s.grid}>
                  {bin.folders.map(item => (
                    <FolderTile
                      key={item.id}
                      card={{ at: `${BIN}:${item.id}`, kind: 'folder', name: item.name, line: binLine(item), missing: 0, missingWhy: '', own: true }}
                      canEdit={false}
                      onOpen={inTheBin(item)}
                      onRename={() => undefined}
                      onDelete={() => undefined}
                      items={binItems(item)}
                    />
                  ))}
                </div>
              </div>
            ) : null}
            {bin.files.length ? (
              <div className={s.sect}>
                <div className={s.sectHead}>
                  Files <span className={s.sectCount}>{bin.files.length}</span>
                </div>
                <div className={s.grid}>
                  {bin.files.map(item => (
                    <FileTile
                      key={item.id}
                      title={item.name}
                      sub={binFrom(item, data, drive)}
                      fileName={item.name}
                      contentType={item.contentType}
                      onView={inTheBin(item)}
                      items={binItems(item)}
                      meta={
                        <>
                          <span>{docShortDay(item.deletedAt)} · {item.deletedBy}</span>
                          <span className={s.fileMetaGap} />
                          <span>{binLeftLabel(binDaysLeft(item, now))}</span>
                        </>
                      }
                    />
                  ))}
                </div>
              </div>
            ) : null}
          </>
        ) : (
          <div className={s.empty}>
            <div className={s.emptyTitle}>The Bin is empty.</div>
            What is deleted in the Data center waits here for 30 days, then goes for good.
          </div>
        )
      ) : query.trim() ? (
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
          {sections.map(sect => (
            <div key={sect.title} className={s.sect}>
              <div className={s.sectHead}>
                {sect.title} <span className={s.sectCount}>{sect.cards.length}</span>
              </div>
              <div className={s.grid}>
                {sect.cards.map(card => (
                  <FolderTile
                    key={card.at}
                    card={card}
                    canEdit={can.edit}
                    onOpen={open}
                    onRename={setRenaming}
                    onDelete={c => void removeFolder(c)}
                    items={folderItems(card)}
                  />
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
      {moving ? (
        <MoveWindow
          title={`Move ${moving.name}`}
          now={`Now in ${pathLine(parentOf(moving.at, data, drive) ?? ROOT, data, drive)} — everything in it goes with it`}
          targets={moveTargets(data, drive, moving.at)}
          current={parentOf(moving.at, data, drive) ?? ROOT}
          kindOf={at => (at === HV ? 'company' : 'folder')}
          onMove={async to => {
            const res = await moveDriveFolder(parsePlace(moving.at)?.id ?? '', to)
            if (res.ok) flash(`${moving.name} moved to ${pathLine(to, data, drive)}`)
            return res
          }}
          onClose={() => setMoving(null)}
        />
      ) : null}
    </div>
  )
}
