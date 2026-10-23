'use client'

import { useEffect, useMemo, useRef, useState, useTransition, type DragEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Chip, HvPage, PageHead, SecLabel } from '@/components/hrv/kit'
import { Drawer } from '@/components/hrv/overlay'
import { flash } from '@/components/hrv/toast'
import {
  addBankFolder, addBankTalent, deleteBankFile, deleteBankFolder, deleteBankItemForever, emptyBankBin, hiringFileLink, moveBankEveryone, moveBankFolder,
  moveBankTalent, removeHiringTalent, renameBankFolder, restoreBankItem, saveBankFile,
} from '@/lib/hiring/actions'
import {
  BANK_NAME, BIN, ROOT, binDaysLeft, binFrom, binLeftLabel, binSections, canonicalAt, crumbs, folderCards, folderNameRefusal, heldIn, holdsPeople,
  moveTargets, parentOf, parsePlace, pathLine, placeExists, placeFiles, placeName, placeOfTalent, searchBank, takesFolders, talentAt, talentsIn,
  type Bank, type BankFile, type BankHit, type BankTree, type BinItem,
} from '@/lib/hiring/bank'
import { HIRING_ACCEPT, extLabel } from '@/lib/hiring/files'
import { NEW_REASON, cameFrom, reasonLabel, startReason } from '@/lib/hiring/reasons'
import { uploadHiringFile } from '@/lib/hiring/upload'
import { dayLabel, talentStatus } from '@/lib/hiring/view'
import type { HiringBankReason, HiringBoard, HiringFile, HiringFileType, HiringTalent } from '@/lib/hiring/types'
import { sizeLabel, type FolderCard } from '@/lib/documentation/drive'
import { FileTile, FolderTile } from '@/app/(portal)/team/documentation/_components/drive/Cards'
import FolderNameWindow from '@/app/(portal)/team/documentation/_components/drive/FolderNameWindow'
import Menu, { type MenuItem } from '@/app/(portal)/team/documentation/_components/drive/Menu'
import MoveWindow from '@/app/(portal)/team/documentation/_components/drive/MoveWindow'
import {
  BinGlyph, ChevronGlyph, CompanyGlyph, DownGlyph, EyeGlyph, FolderGlyph, NewFolderGlyph, PenGlyph, PersonGlyph, RestoreGlyph, SearchGlyph, UploadGlyph,
} from '@/app/(portal)/team/documentation/_components/drive/icons'
import d from '@/app/(portal)/team/documentation/_components/drive/drive.module.css'
import BankTalentTile from './BankTalentTile'
import ReasonPick from './ReasonPick'
import { ReasonSelect, sendReason } from './ReasonSelect'
import { WaitingFiles, sendWaiting, waitingProblem, type Waiting } from './HiringFiles'
import b from './bank.module.css'
import s from './hiring.module.css'

/** What is being moved: a person, a folder with everything in it, or everybody in a department (2026-10-12). */
type Moving = { kind: 'talent'; talent: HiringTalent } | { kind: 'folder'; card: FolderCard } | { kind: 'all'; card: FolderCard }

/** The Move window's glyph for a place of the bank: a company's building, else a folder. */
const kindOfPlace = (at: string): 'company' | 'folder' => (parsePlace(at)?.kind === 'company' ? 'company' : 'folder')

/** Opens a Talent Bank file the way the browser downloads: a short link with its name. */
async function linkTo(f: BankFile, download: boolean): Promise<string | null> {
  const link = await hiringFileLink('bank', f.id, download).catch(() => ({ ok: false as const, reason: 'The file could not be opened. Please try again.' }))
  if (!link.ok) return link.reason
  if (download) window.location.assign(link.url)
  else window.open(link.url, '_blank', 'noopener')
  return null
}

/**
 * Hiring › Talent Bank as a Drive (2026-10-12 — the user: "talent bank need be like google drive as well, can create
 * new file, and name as well … so when save or upload can detect and locate file"; company › department › people,
 * the companies and departments from Admin › Guest Link and from folders HR makes, HR's folders holding people and
 * files). The Data center's Drive (People › Documentation): + New (New folder · Add talent · Upload files), the path
 * back up, a search over the whole bank; folders as compact cards, people as cards, files as cards. A person opens
 * their 460px panel as before (Full page → their own page). The place is the page's address (`?in=`).
 *
 * The Bin (2026-10-13 — the user: "make a bin, then that bin will last for 30 days. file that last for more than
 * 30days in bin, will auto delete"): what is deleted here — a file, a folder, a person, a file off a person — waits
 * there, its days counting down, for Restore or Delete forever; the hourly sweep deletes it after 30 days.
 */
export default function TalentBankView({
  board,
  bank,
  bankError,
  can,
  initialAt,
}: {
  board: HiringBoard
  bank: Bank
  bankError: string | null
  can: { create: boolean; edit: boolean }
  initialAt?: string
}) {
  const router = useRouter()
  const tree: BankTree = useMemo(() => ({ bank, talents: board.talents }), [bank, board.talents])
  const [at, setAt] = useState(() => canonicalAt(initialAt ?? ROOT, tree))
  const [query, setQuery] = useState('')
  const [making, setMaking] = useState(false)
  const [renaming, setRenaming] = useState<FolderCard | null>(null)
  const [adding, setAdding] = useState(false)
  const [moving, setMoving] = useState<Moving | null>(null)
  const [sel, setSel] = useState<string | null>(null)
  const [armed, setArmed] = useState(false)
  const [dropping, setDropping] = useState(false)
  const [uploading, setUploading] = useState(0)
  const [emptying, setEmptying] = useState(false)
  // The Bin's days count from the server's read — fresh after every write; the page's first draw only when unknown.
  const [drawnAt] = useState(() => Date.now())
  const now = Date.parse(bank.readAt) || drawnAt
  const filePick = useRef<HTMLInputElement>(null)
  const [, start] = useTransition()

  const inBin = at === BIN
  const here = placeExists(at, tree) ? at : ROOT
  const place = parsePlace(here)
  const name = placeName(here, tree)
  const path = crumbs(here, tree)
  const folders = folderCards(here, tree)
  const people = talentsIn(here, tree)
  const files = placeFiles(here, bank)
  const hits = useMemo(() => searchBank(query, tree, board.talentReasons), [query, tree, board.talentReasons])
  const picked = board.talents.find(t => t.id === sel) ?? null
  const takesFiles = can.create && !inBin && takesFolders(here)
  const auto = folders.filter(c => !c.own)
  const own = folders.filter(c => c.own)
  const sections = [
    { title: place?.kind === 'root' ? 'Companies' : 'Departments', cards: auto },
    { title: 'Folders', cards: own },
  ].filter(x => x.cards.length > 0)

  // The place is the page's address: a reload or a shared link opens it again (nothing is fetched). The Bin is `?in=bin`.
  const address = inBin ? BIN : here
  useEffect(() => {
    const url = new URL(window.location.href)
    if (address !== ROOT) url.searchParams.set('in', address)
    else url.searchParams.delete('in')
    if (url.href !== window.location.href) window.history.replaceState(null, '', url.href)
  }, [address])

  function open(next: string) {
    setAt(next)
    setQuery('')
    setEmptying(false)
  }

  function openTalent(t: HiringTalent) {
    setSel(t.id)
    setArmed(false)
  }

  async function makeFolder(folderName: string) {
    const res = await addBankFolder(here, folderName)
    if (res.ok) flash(`${folderName} made in ${name}`)
    return res.ok ? { ok: true as const } : res
  }

  async function rename(card: FolderCard, folderName: string) {
    const p = parsePlace(card.at)
    if (!p) return { ok: false as const, reason: 'That folder is not there any more.' }
    const res = await renameBankFolder(p.id, folderName)
    if (res.ok) flash(`${card.name} is now ${folderName}`)
    return res.ok ? { ok: true as const } : res
  }

  async function removeFolder(card: FolderCard) {
    const p = parsePlace(card.at)
    if (!p) return
    const res = await deleteBankFolder(p.id)
    flash(res.ok ? `${card.name} moved to the Bin` : res.reason)
  }

  const removeTalent = (t: HiringTalent) =>
    start(async () => {
      const out = await removeHiringTalent(t.id)
      if (!out.ok) return flash(out.reason)
      setSel(null)
      setArmed(false)
      flash(out.warning ?? `${t.name} moved to the Bin`)
    })

  async function uploadFiles(list: File[]) {
    if (!list.length || !takesFiles) return
    setUploading(n => n + list.length)
    let saved = 0
    let refused = ''
    for (const file of list) {
      try {
        const up = await uploadHiringFile(file)
        if (!up.ok) {
          refused ||= `${file.name}: ${up.reason}`
          continue
        }
        const res = await saveBankFile({ place: here, path: up.path, name: up.name, type: file.type, size: file.size })
        if (res.ok) saved++
        else refused ||= `${file.name}: ${res.reason}`
      } catch {
        refused ||= `${file.name} could not be uploaded. Please try again.`
      } finally {
        setUploading(n => n - 1)
      }
    }
    const kept = `${saved} ${saved === 1 ? 'file' : 'files'} kept in ${name}`
    flash(refused ? (saved ? `${kept} · ${refused}` : refused) : kept)
  }

  async function removeFile(f: BankFile) {
    const res = await deleteBankFile(f.id)
    flash(res.ok ? res.warning ?? `${f.name} moved to the Bin` : res.reason)
  }

  // ── The Bin ──
  async function restore(item: BinItem) {
    const res = await restoreBankItem(item.id)
    flash(res.ok ? `${item.name} restored to ${res.label}` : res.reason)
  }

  async function deleteForever(item: BinItem) {
    const res = await deleteBankItemForever(item.id)
    flash(res.ok ? res.warning ?? `${item.name} deleted forever` : res.reason)
  }

  async function emptyBin() {
    setEmptying(false)
    const res = await emptyBankBin()
    if (!res.ok) return flash(res.reason)
    flash(res.warning ?? `Bin emptied · ${res.count} ${res.count === 1 ? 'item' : 'items'} deleted forever`)
  }

  async function showFile(f: BankFile, download: boolean) {
    const refused = await linkTo(f, download)
    if (refused) flash(refused)
  }

  function openHit(h: BankHit) {
    if (h.kind === 'place') return open(h.card.at)
    if (h.kind === 'talent') {
      open(placeOfTalent(h.talent, bank))
      return openTalent(h.talent)
    }
    open(h.file.parent)
    void showFile(h.file, false)
  }

  const newItems: Array<MenuItem | 'rule'> = [
    ...(takesFolders(here) ? [{ key: 'folder', label: 'New folder', icon: <NewFolderGlyph />, onSelect: () => setMaking(true) }] : []),
    ...(holdsPeople(here) ? [{ key: 'talent', label: 'Add talent', icon: <PersonGlyph size={16} />, onSelect: () => setAdding(true) }] : []),
    'rule' as const,
    { key: 'files', label: 'Upload files', icon: <UploadGlyph />, onSelect: () => filePick.current?.click() },
  ]

  // A folder HR made: Rename, Move to… (with everything in it), Move to Bin. A department: Move everyone to… while
  // something is right in it. Nothing for a company, nor without Edit.
  const cardItems = (card: FolderCard): Array<MenuItem | 'rule'> => {
    if (!can.edit) return []
    if (card.own) {
      return [
        { key: 'rename', label: 'Rename', icon: <PenGlyph />, onSelect: () => setRenaming(card) },
        { key: 'move', label: 'Move to…', icon: <FolderGlyph size={16} />, onSelect: () => setMoving({ kind: 'folder', card }) },
        'rule',
        { key: 'delete', label: 'Move to Bin', tone: 'danger', icon: <BinGlyph />, onSelect: () => void removeFolder(card) },
      ]
    }
    if (card.kind === 'dept' && heldIn(card.at, tree).line) {
      return [{ key: 'all', label: 'Move everyone to…', icon: <FolderGlyph size={16} />, onSelect: () => setMoving({ kind: 'all', card }) }]
    }
    return []
  }

  const talentItems = (t: HiringTalent): Array<MenuItem | 'rule'> => [
    { key: 'open', label: 'Open', icon: <EyeGlyph />, onSelect: () => openTalent(t) },
    ...(can.edit
      ? [
          { key: 'move', label: 'Move to…', icon: <FolderGlyph size={16} />, onSelect: () => setMoving({ kind: 'talent', talent: t }) },
          'rule' as const,
          { key: 'remove', label: 'Remove from Talent Bank', confirm: 'Confirm remove', tone: 'danger' as const, icon: <BinGlyph />, onSelect: () => removeTalent(t) },
        ]
      : []),
  ]

  const fileItems = (f: BankFile): Array<MenuItem | 'rule'> => [
    { key: 'view', label: 'View', icon: <EyeGlyph />, onSelect: () => void showFile(f, false) },
    { key: 'download', label: 'Download', icon: <DownGlyph />, onSelect: () => void showFile(f, true) },
    ...(can.edit ? ['rule' as const, { key: 'delete', label: 'Move to Bin', tone: 'danger' as const, icon: <BinGlyph />, onSelect: () => void removeFile(f) }] : []),
  ]

  // Something in the Bin: Restore, or Delete forever (asked once more). Without Edit, nothing.
  const binItems = (item: BinItem): Array<MenuItem | 'rule'> =>
    can.edit
      ? [
          { key: 'restore', label: 'Restore', icon: <RestoreGlyph />, onSelect: () => void restore(item) },
          'rule',
          { key: 'forever', label: 'Delete forever', confirm: 'Confirm delete forever', tone: 'danger', icon: <BinGlyph />, onSelect: () => void deleteForever(item) },
        ]
      : []
  const inTheBin = (item: BinItem) => () => flash(`${item.name} is in the Bin — restore it to open it.`)
  const binLine = (item: BinItem) => `${binFrom(item, tree)} · ${binLeftLabel(binDaysLeft(item, now))}`
  const bin = binSections(bank.bin)

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
    <HvPage>
      <PageHead eyebrow="Hiring · Talent Bank" title="Talent Bank" />
      <div
        className={d.drive}
        data-drop={dropping ? 'true' : undefined}
        onDragOver={onDragOver}
        onDragLeave={e => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropping(false)
        }}
        onDrop={onDrop}
      >
        <div className={d.bar}>
          {can.create && !inBin ? (
            <Menu
              label="New"
              side="left"
              items={newItems}
              button={props => (
                <button type="button" className={d.newBtn} {...props}>
                  <span className={d.newPlus} aria-hidden="true">+</span>
                  New
                </button>
              )}
            />
          ) : null}
          <nav className={d.crumbs} aria-label="Folder path">
            {inBin ? (
              <>
                <button type="button" className={d.crumb} onClick={() => open(ROOT)}>{BANK_NAME}</button>
                <span className={d.crumbSep} aria-hidden="true"><ChevronGlyph size={14} /></span>
                <span className={d.crumbHere} aria-current="page">Bin</span>
              </>
            ) : (
              path.map((c, i) =>
                i === path.length - 1 ? (
                  <span key={c.at} className={d.crumbHere} aria-current="page">{c.name}</span>
                ) : (
                  <span key={c.at} style={{ display: 'contents' }}>
                    <button type="button" className={d.crumb} onClick={() => open(c.at)}>{c.name}</button>
                    <span className={d.crumbSep} aria-hidden="true"><ChevronGlyph size={14} /></span>
                  </span>
                ),
              )
            )}
          </nav>
          {inBin ? (
            can.edit && bank.bin.length ? (
              <button
                type="button"
                className={d.emptyBin}
                data-armed={emptying ? 'true' : undefined}
                onClick={() => (emptying ? void emptyBin() : setEmptying(true))}
              >
                <BinGlyph />
                {emptying ? 'Confirm empty bin' : 'Empty bin'}
              </button>
            ) : null
          ) : (
            <>
              <div className={d.searchWrap}>
                <span className={d.searchIcon}><SearchGlyph size={15} /></span>
                <input className={d.search} value={query} placeholder="Search the Talent Bank" aria-label="Search the Talent Bank" onChange={e => setQuery(e.target.value)} />
                {query ? (
                  <button type="button" className={d.searchClear} onClick={() => setQuery('')} aria-label="Clear the search">×</button>
                ) : null}
              </div>
              <button type="button" className={d.binBtn} onClick={() => open(BIN)}>
                <BinGlyph />
                Bin
                {bank.bin.length ? <span className={d.binCount}>{bank.bin.length}</span> : null}
              </button>
            </>
          )}
          <input
            ref={filePick}
            type="file"
            multiple
            accept={HIRING_ACCEPT}
            hidden
            onChange={e => {
              const list = Array.from(e.target.files ?? [])
              e.target.value = ''
              void uploadFiles(list)
            }}
          />
        </div>

        {bankError ? <div className={d.error} role="alert">{bankError}</div> : null}

        {inBin ? (
          bank.bin.length ? (
            <>
              {bin.folders.length ? (
                <div className={d.sect}>
                  <div className={d.sectHead}>
                    Folders <span className={d.sectCount}>{bin.folders.length}</span>
                  </div>
                  <div className={d.grid}>
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
              {bin.people.length ? (
                <div className={d.sect}>
                  <div className={d.sectHead}>
                    People <span className={d.sectCount}>{bin.people.length}</span>
                  </div>
                  <div className={d.grid}>
                    {bin.people.map(item => (
                      <BankTalentTile key={item.id} name={item.name} line={binLine(item)} items={binItems(item)} onOpen={inTheBin(item)} />
                    ))}
                  </div>
                </div>
              ) : null}
              {bin.files.length ? (
                <div className={d.sect}>
                  <div className={d.sectHead}>
                    Files <span className={d.sectCount}>{bin.files.length}</span>
                  </div>
                  <div className={d.grid}>
                    {bin.files.map(item => (
                      <FileTile
                        key={item.id}
                        title={item.name}
                        sub={item.kind === 'talent_file' ? [item.fileType, item.talentName].filter(Boolean).join(' · ') : binFrom(item, tree)}
                        fileName={item.name}
                        contentType={item.contentType}
                        onView={inTheBin(item)}
                        items={binItems(item)}
                        meta={
                          <>
                            <span>{dayLabel(item.deletedAt)} · {item.deletedBy}</span>
                            <span className={d.fileMetaGap} />
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
            <div className={d.empty}>
              <div className={d.emptyTitle}>The Bin is empty.</div>
              What is deleted in the Talent Bank waits here for 30 days, then goes for good.
            </div>
          )
        ) : query.trim() ? (
          <div className={d.sect}>
            <div className={d.sectHead}>
              Found <span className={d.sectCount}>{hits.length}</span>
            </div>
            {hits.length ? (
              <div className={d.results}>
                {hits.map(h => {
                  const key = h.kind === 'place' ? h.card.at : h.kind === 'talent' ? talentAt(h.talent.id) : `file:${h.file.id}`
                  const title = h.kind === 'place' ? h.card.name : h.kind === 'talent' ? `${h.talent.name} · ${h.talent.position}` : h.file.name
                  const kind = h.kind === 'place' ? (h.card.kind === 'company' ? 'Company' : h.card.kind === 'dept' ? 'Department' : 'Folder') : h.kind === 'talent' ? 'Person' : 'File'
                  return (
                    <button key={key} type="button" className={d.hit} onClick={() => openHit(h)}>
                      <span className={d.folderIcon} data-kind={h.kind === 'place' ? h.card.kind : h.kind === 'talent' ? 'person' : 'file'}>
                        {h.kind === 'place' ? (h.card.kind === 'company' ? <CompanyGlyph /> : <FolderGlyph />) : h.kind === 'talent' ? <PersonGlyph /> : <EyeGlyph size={20} />}
                      </span>
                      <span className={d.hitText}>
                        <span className={d.hitName}>{title}</span>
                        <span className={d.hitPath}>{h.path}</span>
                      </span>
                      <span className={d.hitKind}>{kind}</span>
                    </button>
                  )
                })}
              </div>
            ) : (
              <div className={d.empty}>Nothing in the Talent Bank matches “{query.trim()}”.</div>
            )}
          </div>
        ) : (
          <>
            {sections.map(sect => (
              <div key={sect.title} className={d.sect}>
                <div className={d.sectHead}>
                  {sect.title} <span className={d.sectCount}>{sect.cards.length}</span>
                </div>
                <div className={d.grid}>
                  {sect.cards.map(card => (
                    <FolderTile
                      key={card.at}
                      card={card}
                      canEdit={can.edit}
                      onOpen={open}
                      onRename={setRenaming}
                      onDelete={c => void removeFolder(c)}
                      items={cardItems(card)}
                    />
                  ))}
                </div>
              </div>
            ))}
            {people.length ? (
              <div className={d.sect}>
                <div className={d.sectHead}>
                  People <span className={d.sectCount}>{people.length}</span>
                </div>
                <div className={d.grid}>
                  {people.map(t => (
                    <BankTalentTile
                      key={t.id}
                      name={t.name}
                      line={`${personLine(board, t)} · ${t.position}`}
                      items={talentItems(t)}
                      onOpen={() => openTalent(t)}
                    />
                  ))}
                </div>
              </div>
            ) : null}
            {files.length || uploading ? (
              <div className={d.sect}>
                <div className={d.sectHead}>
                  Files <span className={d.sectCount}>{files.length}</span>
                  {uploading ? <span className={d.sectCount}>· uploading {uploading}…</span> : null}
                </div>
                <div className={d.grid}>
                  {files.map(f => (
                    <FileTile
                      key={f.id}
                      title={f.name}
                      fileName={f.name}
                      contentType={f.contentType}
                      onView={() => void showFile(f, false)}
                      items={fileItems(f)}
                      meta={
                        <>
                          <span>{dayLabel(f.addedAt)} · {f.addedBy}</span>
                          <span className={d.fileMetaGap} />
                          <span>{sizeLabel(f.size)}</span>
                        </>
                      }
                    />
                  ))}
                </div>
              </div>
            ) : null}
            {place?.kind !== 'root' && !folders.length && !people.length && !files.length && !uploading ? (
              <div className={d.empty}>
                <div className={d.emptyTitle}>This folder is empty.</div>
                {can.create ? 'Press + New to make a folder, add a talent or upload files — or drop files here.' : 'Nobody has been kept here yet.'}
              </div>
            ) : null}
          </>
        )}
      </div>

      {making ? (
        <FolderNameWindow mode="new" where={`In ${name}`} check={n => folderNameRefusal(n, here, tree)} onSave={makeFolder} onClose={() => setMaking(false)} />
      ) : null}
      {renaming ? (
        <FolderNameWindow
          mode="rename"
          where={renaming.name}
          initial={renaming.name}
          check={n => folderNameRefusal(n, parentOf(renaming.at, tree) ?? ROOT, tree, parsePlace(renaming.at)?.id)}
          onSave={n => rename(renaming, n)}
          onClose={() => setRenaming(null)}
        />
      ) : null}
      {moving ? <MoveFor moving={moving} tree={tree} onClose={() => setMoving(null)} /> : null}

      <AddTalentDrawer
        open={adding}
        place={here}
        placeLabel={pathLine(here, tree)}
        types={board.fileTypes}
        reasons={board.talentReasons}
        canAddType={can.edit}
        onClose={() => setAdding(false)}
      />

      <Drawer
        open={!!picked}
        onClose={() => setSel(null)}
        width={460}
        headStyle={{ padding: '18px 22px' }}
        headGrow
        bodyStyle={{ padding: '18px 22px' }}
        head={
          picked ? (
            <div>
              <div className={s.isKicker}>{picked.no}</div>
              <div className={s.isTitle}>{picked.name}</div>
              <div style={{ marginTop: 8 }}>
                <Chip tone={talentStatus(board, picked).tone} style={{ fontSize: 10.5 }}>
                  {talentStatus(board, picked).label}
                </Chip>
              </div>
            </div>
          ) : null
        }
        footer={
          picked ? (
            <div className={s.tsFoot}>
              {can.edit ? (
                <button
                  type="button"
                  className={`${s.btnDanger} ${s.actWhite} ${s.armBtn}`}
                  data-armed={armed ? 'true' : undefined}
                  onClick={() => (armed ? removeTalent(picked) : setArmed(true))}
                >
                  {armed ? 'Confirm remove' : 'Remove'}
                </button>
              ) : null}
              {can.edit ? (
                <button type="button" className={s.btnPlain} onClick={() => setMoving({ kind: 'talent', talent: picked })}>
                  Move to…
                </button>
              ) : null}
              <button type="button" className={s.btnPlain} onClick={() => setSel(null)}>
                Close
              </button>
              <button type="button" className={s.btnOrange} style={{ padding: '8px 18px' }} onClick={() => router.push(`/hiring/talent/${picked.id}`)}>
                Full page →
              </button>
            </div>
          ) : null
        }
      >
        {picked ? <TalentFacts board={board} talent={picked} keptIn={pathLine(placeOfTalent(picked, bank), tree)} canEdit={can.edit} /> : null}
      </Drawer>
    </HvPage>
  )
}

/**
 * Move to… for what is being moved (2026-10-12, "change name, and move together"): a person anywhere but the bank's
 * top; a folder — with everything in it — anywhere but inside itself, the top included; everybody right in a department
 * anywhere outside it.
 */
function MoveFor({ moving, tree, onClose }: { moving: Moving; tree: BankTree; onClose: () => void }) {
  if (moving.kind === 'talent') {
    const t = moving.talent
    const now = placeOfTalent(t, tree.bank)
    return (
      <MoveWindow
        kindOf={kindOfPlace}
        title={`Move ${t.name}`}
        now={`Now in ${pathLine(now, tree)}`}
        targets={moveTargets(tree)}
        current={now}
        onMove={async at => {
          const res = await moveBankTalent(t.id, at)
          if (res.ok) flash(`${t.name} moved to ${pathLine(at, tree)}`)
          return res.ok ? { ok: true as const } : res
        }}
        onClose={onClose}
      />
    )
  }
  const card = moving.card
  if (moving.kind === 'folder') {
    const parent = parentOf(card.at, tree) ?? ROOT
    return (
      <MoveWindow
        kindOf={kindOfPlace}
        title={`Move ${card.name}`}
        now={`Now in ${pathLine(parent, tree)} — everything in it goes with it`}
        targets={moveTargets(tree, { from: card.at, withRoot: true })}
        current={parent}
        onMove={async at => {
          const res = await moveBankFolder(parsePlace(card.at)?.id ?? '', at)
          if (res.ok) flash(`${card.name} moved to ${pathLine(at, tree)}`)
          return res.ok ? { ok: true as const } : res
        }}
        onClose={onClose}
      />
    )
  }
  const held = heldIn(card.at, tree)
  return (
    <MoveWindow
      kindOf={kindOfPlace}
      title={`Move everyone in ${card.name}`}
      now={`${held.line} — now in ${pathLine(card.at, tree)}`}
      targets={moveTargets(tree, { from: card.at })}
      onMove={async at => {
        const res = await moveBankEveryone(card.at, at)
        if (res.ok) flash(`${held.line} moved to ${pathLine(at, tree)}`)
        return res.ok ? { ok: true as const } : res
      }}
      onClose={onClose}
    />
  )
}

/**
 * What a person's card says first, before what they fit (2026-10-24): why they are kept — "Failed interview" — or, while a
 * request has them, "Interviewing · HR-…"; somebody kept before the reason was asked, where they stand as before. First,
 * because a long position ran it off the card's one line (*Sales Executive (Showro…*, prod E2E 2026-10-24).
 */
function personLine(board: HiringBoard, t: HiringTalent): string {
  const status = talentStatus(board, t)
  return status.request || !t.reason ? status.label : reasonLabel(board.talentReasons, t.reason) || status.label
}

/** A person's panel: what they fit, why they are kept, where they came from and are kept, how to reach them, HR's notes, their files, the latest step. */
function TalentFacts({ board, talent, keptIn, canEdit }: { board: HiringBoard; talent: HiringTalent; keptIn: string; canEdit: boolean }) {
  const [, start] = useTransition()
  const view = (f: HiringFile) =>
    start(async () => {
      const out = await hiringFileLink('file', f.id)
      if (!out.ok) return flash(out.reason)
      window.open(out.url, '_blank', 'noopener')
    })
  return (
    <div className={s.tsBody}>
      <div className={s.facts}>
        <Pair label="Good fit for" value={talent.position} strong />
        <span className={s.factLabel}>Reason</span>
        <span className={s.factValue} data-strong="true">
          <ReasonPick talent={talent} reasons={board.talentReasons} canEdit={canEdit} className={s.select} />
        </span>
        {[
          ['Came from', cameFrom(board, talent), false],
          ['Kept in', keptIn, true],
          ['Phone', talent.phone || '—', false],
          ['Email', talent.email || '—', false],
          ['Saved', dayLabel(talent.savedAt), false],
        ].map(([l, v, strong]) => (
          <Pair key={String(l)} label={String(l)} value={String(v)} strong={!!strong} />
        ))}
      </div>
      <div>
        <SecLabel style={{ marginBottom: 6 }}>HR notes</SecLabel>
        <div className={s.tsNotes}>{talent.notes || 'No notes yet.'}</div>
      </div>
      {talent.files.length ? (
        <div className={s.hfGroup} role="group" aria-label="Files">
          {talent.files.map(f => (
            <div key={f.id} className={s.tsFile}>
              <span className={s.extTile}>{extLabel(f.name)}</span>
              <span className={s.hfMain}>
                <span className={s.hfName}>{f.name}</span>
                <span className={s.hfKind}>{f.type}</span>
              </span>
              <button type="button" className={s.btnGhost} aria-label={`View ${f.name}`} onClick={() => view(f)}>
                View
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className={s.tsFile}>
          <span className={s.extTile}>—</span>
          <span className={s.tsFileName}>No files</span>
        </div>
      )}
      <div>
        <SecLabel style={{ marginBottom: 6 }}>Latest</SecLabel>
        <div className={s.tsLatest}>{latestOf(talent)}</div>
      </div>
    </div>
  )
}

function latestOf(t: HiringTalent): string {
  const e = t.events.at(-1)
  return e ? [e.what, dayLabel(e.at), e.note].filter(Boolean).join(' · ') : '—'
}

function Pair({ label, value, strong }: { label: string; value: string; strong: boolean }) {
  return (
    <>
      <span className={s.factLabel}>{label}</span>
      <span className={s.factValue} data-strong={strong ? 'true' : undefined}>
        {value}
      </span>
    </>
  )
}

/**
 * + New › Add talent (README §13 — the 520px drawer), in the place it is pressed: a name and what they fit are needed;
 * the rest helps — their files too, each with its type. They are kept where the drawer was opened.
 */
function AddTalentDrawer({
  open,
  place,
  placeLabel,
  types,
  reasons,
  canAddType,
  onClose,
}: {
  open: boolean
  place: string
  placeLabel: string
  types: readonly HiringFileType[]
  /** HR's reasons; a new one is named here with the same Edit that names a file type. */
  reasons: readonly HiringBankReason[]
  canAddType: boolean
  onClose: () => void
}) {
  const blank = { name: '', phone: '', email: '', position: '', notes: '' }
  const [form, setForm] = useState(blank)
  // Why they are kept (2026-10-24 — the user: "包括 upload 的时候，最好能放一个 drop 掉的原因 … 做成一个 dropdown").
  const [reason, setReason] = useState(() => startReason(reasons, 'not_right_now'))
  const [newReason, setNewReason] = useState('')
  const [waiting, setWaiting] = useState<Waiting[]>([])
  const [err, setErr] = useState('')
  const [pending, start] = useTransition()
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => {
    setForm(f => ({ ...f, [k]: e.target.value }))
    setErr('')
  }
  const close = () => {
    setForm(blank)
    setReason(startReason(reasons, 'not_right_now'))
    setNewReason('')
    setWaiting([])
    setErr('')
    onClose()
  }
  const save = () => {
    if (!form.name.trim() || !form.position.trim()) return setErr('Add a name and the position they fit.')
    const problem = waitingProblem(waiting)
    if (problem) return setErr(problem)
    if (reason === NEW_REASON && !newReason.trim()) return setErr('Name the new reason.')
    start(async () => {
      const why = await sendReason(reasons, reason, newReason)
      if (!why.ok) return setErr(why.reason)
      const sent = await sendWaiting(waiting, types)
      if (!sent.ok) return setErr(sent.reason)
      const data = new FormData()
      for (const [k, v] of Object.entries(form)) data.set(k, v)
      data.set('reason', why.id)
      data.set('files', JSON.stringify(sent.files))
      const out = await addBankTalent(place, data)
      if (!out.ok) return setErr(out.reason)
      flash(`${form.name.trim()} added to ${placeLabel}`)
      close()
    })
  }
  return (
    <Drawer
      open={open}
      onClose={close}
      width={520}
      headStyle={{ padding: '18px 22px' }}
      headGrow
      bodyStyle={{ padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 12 }}
      head={
        <div>
          <div className={s.drawerTitle}>Add to Talent Bank</div>
          <div className={s.drawerSub}>Someone worth calling back when a role opens.</div>
        </div>
      }
    >
      <div className={b.keptIn}>
        Kept in <span className={b.keptInPath}>{placeLabel}</span>
      </div>
      <div className={s.addGrid}>
        <input className={s.input} value={form.name} placeholder="Name" aria-label="Name" onChange={set('name')} />
        <input className={s.input} value={form.phone} placeholder="Phone" aria-label="Phone" onChange={set('phone')} />
        <input className={s.input} value={form.email} placeholder="Email" aria-label="Email" onChange={set('email')} />
        <input className={s.input} value={form.position} placeholder="Good fit for (position)" aria-label="Good fit for (position)" onChange={set('position')} />
      </div>
      <ReasonSelect
        label="Reason *"
        reasons={reasons}
        value={reason}
        newName={newReason}
        canAdd={canAddType}
        onChange={v => {
          setReason(v)
          setErr('')
        }}
        onNewName={setNewReason}
      />
      <div className={s.hfGroup} role="group" aria-label="Files">
        <WaitingFiles types={types} kept={[]} waiting={waiting} canAddType={canAddType} onChange={next => { setWaiting(next); setErr('') }} />
      </div>
      <textarea className={s.textarea} rows={3} value={form.notes} placeholder="Why keep them — strengths, what to check next time" aria-label="Why keep them" onChange={set('notes')} />
      <div className={s.addFoot}>
        <span className={`${s.err} ${s.grow}`}>{err}</span>
        <button type="button" className={s.btnGhost} onClick={close}>
          Cancel
        </button>
        <button type="button" className={s.btnOrange} onClick={save} disabled={pending}>
          Save talent
        </button>
      </div>
    </Drawer>
  )
}
