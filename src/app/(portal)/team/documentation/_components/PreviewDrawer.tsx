'use client'

import { useEffect, useState } from 'react'
import { Drawer } from '@/components/hrv/overlay'
import { flash } from '@/components/hrv/toast'
import { openDocumentationFile } from '@/lib/documentation/actions'
import { openDriveFile } from '@/lib/documentation/drive-actions'
import { EMPTY_DRIVE, pathLine, type Drive } from '@/lib/documentation/drive'
import {
  LETTER_STATUS, deptLabel, docDay, letterStatus, letterTrail, previewKind, type DocEvent, type Documentation,
} from '@/lib/documentation/model'
import { readSheet } from '@/lib/documentation/read-sheet'
import { SHEET_COLS, SHEET_ROWS, columnLetter, figureColumns, type SheetPreview } from '@/lib/documentation/sheet-view'
import { downloadFile } from './DocumentsTab'
import s from './documentation.module.css'

/** A document, a letter on somebody's record, or a file HR keeps in a Data center folder (`drive`, 2026-10-12). */
export type PreviewTarget = { kind: 'document' | 'letter' | 'drive'; id: string }

interface Shown {
  kicker: string
  title: string
  file: string
  fileName: string
  contentType: string | null
  canDownload: boolean
  /** A deleted document or a withdrawn letter: its file is not opened, only its trail. */
  gone: string | null
  facts: Array<{ l: string; v: string }>
  events: DocEvent[]
}

function shownOf(data: Documentation, t: PreviewTarget, drive: Drive): Shown | null {
  if (t.kind === 'drive') {
    const f = drive.files.find(x => x.id === t.id)
    if (!f) return null
    const where = pathLine(f.parent, data, drive)
    return {
      kicker: `File · ${where}`,
      title: f.fileName,
      file: `${f.fileName} · ${f.ref}`,
      fileName: f.fileName,
      contentType: f.contentType,
      canDownload: !f.deletedAt,
      gone: f.deletedAt ? `Deleted ${docDay(f.deletedAt)}. Its file went with it; its trail stays.` : null,
      facts: [
        { l: 'Folder', v: where },
        { l: 'Uploaded', v: `${docDay(f.uploadedAt)} by ${f.uploadedBy}` },
        { l: 'Status', v: f.deletedAt ? 'Deleted' : 'Kept for HR — sent to nobody' },
      ],
      events: f.events,
    }
  }
  if (t.kind === 'document') {
    const d = data.documents.find(x => x.id === t.id)
    if (!d) return null
    const depts = d.departments.map(deptLabel).join(', ')
    return {
      kicker: `Document · ${depts}`,
      title: d.name,
      file: `${d.fileName} · ${d.ref}`,
      fileName: d.fileName,
      contentType: d.contentType,
      canDownload: !d.deletedAt,
      gone: d.deletedAt ? `Deleted ${docDay(d.deletedAt)}. Its file went with it; its trail stays.` : null,
      facts: [
        { l: 'Shared with', v: depts },
        { l: 'Uploaded', v: `${docDay(d.uploadedAt)} by ${d.uploadedBy}` },
        { l: 'Status', v: d.deletedAt ? 'Deleted' : 'Live in the Revenue app' },
      ],
      events: d.events,
    }
  }
  const l = data.letters.find(x => x.id === t.id)
  if (!l) return null
  const person = data.people.find(p => p.id === l.staffId)
  return {
    kicker: `${l.typeName} · ${l.staffName}`,
    title: l.typeName,
    file: `${l.fileName} · ${l.ref}`,
    fileName: l.fileName,
    contentType: l.contentType,
    canDownload: !l.withdrawnAt,
    gone: l.withdrawnAt ? `Withdrawn ${docDay(l.withdrawnAt)}. No longer on ${l.staffName}'s record or in the Revenue app; its trail stays.` : null,
    facts: [
      { l: 'Person', v: person?.title ? `${l.staffName} · ${person.title}` : l.staffName },
      { l: 'Letter', v: l.typeName },
      { l: 'Filed', v: `${docDay(l.filedAt)} by ${l.filedBy}` },
      { l: 'Status', v: LETTER_STATUS[letterStatus(l)].label },
    ],
    events: letterTrail(l),
  }
}

/**
 * Documentation's preview (README §10, the handoff's 640px drawer): the file
 * itself — a PDF inline, a picture as it is, a spreadsheet as a sheet, anything
 * else "No preview for .docx files. Download it to open." — and its Audit
 * trail. Opening it is a line on the trail (Viewed); its link is made then and
 * lives five minutes.
 */
export default function PreviewDrawer({
  data,
  drive = EMPTY_DRIVE,
  target,
  onClose,
}: {
  data: Documentation
  /** The Data center's own folders and files (2026-10-12) — for a `drive` target. */
  drive?: Drive
  target: PreviewTarget | null
  onClose: () => void
}) {
  const [tab, setTab] = useState<'preview' | 'audit'>('preview')
  const [url, setUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState('')
  // A spreadsheet, read from its link in the browser (null: not read yet, or it could not be).
  const [sheet, setSheet] = useState<SheetPreview | null>(null)
  const [sheetFailed, setSheetFailed] = useState(false)
  const shown = target ? shownOf(data, target, drive) : null
  const kind = shown ? previewKind(shown.fileName, shown.contentType) : 'none'
  const key = target ? `${target.kind}:${target.id}` : ''
  const gone = shown?.gone ?? null

  useEffect(() => {
    if (!target) return
    let live = true
    const stop = new AbortController()
    setTab(gone ? 'audit' : 'preview')
    setUrl(null)
    setFailed('')
    setSheet(null)
    setSheetFailed(false)
    // Deleted or withdrawn: there is no file to open (and no "Viewed" to write), only the trail.
    if (gone) return
    const opening = target.kind === 'drive' ? openDriveFile(target.id, 'view') : openDocumentationFile(target.kind, target.id, 'view')
    void opening.then(async link => {
      if (!live) return
      if (!link.ok) { setFailed(link.reason); return }
      setUrl(link.url)
      if (kind !== 'sheet') return
      try {
        // Read in a worker of its own, which loads Excel's reader (lib/documentation/read-sheet.ts).
        const res = await fetch(link.url, { signal: stop.signal })
        if (!res.ok) throw new Error(String(res.status))
        const read = await readSheet(await res.arrayBuffer(), stop.signal)
        if (live) setSheet(read)
      } catch {
        if (live) setSheetFailed(true)
      }
    })
    return () => {
      live = false
      stop.abort()
    }
    // One open per file shown.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  async function download() {
    if (!target || !shown) return
    let refused: string | null
    if (target.kind === 'drive') {
      const link = await openDriveFile(target.id, 'download')
      refused = link.ok ? null : link.reason
      if (link.ok) window.location.assign(link.url)
    } else {
      refused = await downloadFile(target.kind, target.id)
    }
    flash(refused ?? `Downloads ${shown.fileName}`)
  }

  const ext = shown ? `.${shown.fileName.slice(shown.fileName.lastIndexOf('.') + 1).toLowerCase()}` : ''

  return (
    <Drawer open={!!shown} onClose={onClose} width={640} bare label={shown?.title ?? 'Preview'}>
      {shown ? (
        <>
          <div className={s.vwHead}>
            <div className={s.vwWho}>
              <div className={s.vwKicker}>{shown.kicker}</div>
              <div className={s.vwTitle}>{shown.title}</div>
              <div className={s.vwFile}>{shown.file}</div>
            </div>
            {shown.canDownload ? (
              <button type="button" className={s.vwDownload} onClick={() => void download()}>Download</button>
            ) : null}
            <button type="button" className={s.close} onClick={onClose} aria-label="Close">×</button>
          </div>
          <div className={s.vwTabs} role="tablist" aria-label="Preview">
            <button type="button" role="tab" className={s.vwTab} aria-selected={tab === 'preview'} onClick={() => setTab('preview')}>
              Preview
            </button>
            <button type="button" role="tab" className={s.vwTab} aria-selected={tab === 'audit'} onClick={() => setTab('audit')}>
              Audit trail
              <span className={s.vwTabCount}>{shown.events.length}</span>
            </button>
          </div>
          {tab === 'preview' ? (
            <div className={s.vwPreview}>
              {gone ? (
                <div className={s.vwNone}>{gone}</div>
              ) : failed ? (
                <div className={s.vwNone}>{failed}</div>
              ) : kind === 'pdf' && url ? (
                <iframe src={url} title="Preview" className={s.vwFrame} />
              ) : kind === 'image' && url ? (
                // eslint-disable-next-line @next/next/no-img-element -- a short signed link, not a static asset
                <img src={url} alt={shown.fileName} className={s.vwImg} />
              ) : kind === 'sheet' && sheet && sheet.columns > 0 ? (
                <SheetView sheet={sheet} />
              ) : kind === 'none' || (kind === 'sheet' && (sheetFailed || (sheet && sheet.columns === 0))) ? (
                <div className={s.vwNone}>
                  No preview for {ext} files.
                  <br />
                  Download it to open.
                </div>
              ) : null}
            </div>
          ) : (
            <div className={s.vwAudit}>
              <div className={s.vwFacts}>
                {shown.facts.map(f => (
                  <FactRow key={f.l} l={f.l} v={f.v} />
                ))}
              </div>
              <div className={s.vwTrailLabel}>Audit trail</div>
              {shown.events.map((e, i) => (
                <div key={i} className={s.ev}>
                  <div className={s.evRail} aria-hidden="true">
                    <span className={s.evDot} />
                    <span className={s.evLine} />
                  </div>
                  <div className={s.evBody}>
                    <div className={s.evTop}>
                      <span className={s.evWhat}>{e.what}</span>
                      <span className={s.evWhen}>{docDay(e.at)}</span>
                    </div>
                    <div className={s.evWho}>{e.who}</div>
                    {e.note ? <div className={s.evNote}>{e.note}</div> : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      ) : null}
    </Drawer>
  )
}

/**
 * The handoff's sheet (`vw.isSheet`): a white page, the column letters on a
 * grey band, each row its number down the side, the first row the header in
 * 600 on a warm white; figures sit right in figures' type.
 */
export function SheetView({ sheet }: { sheet: SheetPreview }) {
  const last = sheet.columns - 1
  const figures = figureColumns(sheet.rows)
  // The handoff's proportions: the first column of words twice the rest, a column of figures 100px. A wide sheet
  // scrolls sideways inside its page, every row as wide as the rest.
  const lead = figures.findIndex(f => !f)
  const tracks = figures.map((f, j) => (f ? '100px' : j === lead ? 'minmax(160px, 2fr)' : 'minmax(96px, 1fr)'))
  const minWidth = 36 + figures.reduce((w, f, j) => w + (f ? 100 : j === lead ? 160 : 96), 0)
  const cols = { gridTemplateColumns: `36px ${tracks.join(' ')}`, minWidth }
  return (
    <>
      <div className={s.vwSheet} role="table" aria-label="Sheet preview">
        <div className={s.vwSheetHead} role="row" style={cols}>
          <span className={s.vwSheetCorner} role="columnheader" />
          {sheet.rows[0].map((_, j) => (
            <span key={j} role="columnheader" className={`${s.vwSheetCol} ${j === last ? s.vwSheetEnd : ''}`}>{columnLetter(j)}</span>
          ))}
        </div>
        {sheet.rows.map((row, i) => (
          <div key={i} role="row" className={`${s.vwSheetRow} ${i === 0 ? s.vwSheetFirst : ''}`} style={cols}>
            <span className={s.vwSheetNum} role="rowheader">{i + 1}</span>
            {row.map((cell, j) => (
              <span key={j} role="cell" className={`${s.vwSheetCell} ${figures[j] ? s.vwSheetFigure : ''} ${j === last ? s.vwSheetEnd : ''}`}>{cell}</span>
            ))}
          </div>
        ))}
      </div>
      {sheet.more ? <div className={s.vwSheetMore}>The first {SHEET_ROWS} rows and {SHEET_COLS} columns. Download it for the rest.</div> : null}
    </>
  )
}

function FactRow({ l, v }: { l: string; v: string }) {
  return (
    <>
      <span className={s.vwFactLabel}>{l}</span>
      <span>{v}</span>
    </>
  )
}
