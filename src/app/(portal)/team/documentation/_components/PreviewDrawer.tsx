'use client'

import { useEffect, useState } from 'react'
import { Drawer } from '@/components/hrv/overlay'
import { flash } from '@/components/hrv/toast'
import { openDocumentationFile } from '@/lib/documentation/actions'
import {
  LETTER_STATUS, deptLabel, docDay, letterStatus, letterTrail, previewKind, type DocEvent, type Documentation,
} from '@/lib/documentation/model'
import { downloadFile } from './DocumentsTab'
import s from './documentation.module.css'

export type PreviewTarget = { kind: 'document' | 'letter'; id: string }

interface Shown {
  kicker: string
  title: string
  file: string
  fileName: string
  contentType: string | null
  canDownload: boolean
  facts: Array<{ l: string; v: string }>
  events: DocEvent[]
}

function shownOf(data: Documentation, t: PreviewTarget): Shown | null {
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
    canDownload: true,
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
 * itself — a PDF inline, a picture as it is, anything else "No preview for
 * .xlsx files. Download it to open." — and its Audit trail. Opening it is a
 * line on the trail (Viewed); its link is made then and lives five minutes.
 */
export default function PreviewDrawer({ data, target, onClose }: { data: Documentation; target: PreviewTarget | null; onClose: () => void }) {
  const [tab, setTab] = useState<'preview' | 'audit'>('preview')
  const [url, setUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState('')
  const shown = target ? shownOf(data, target) : null
  const kind = shown ? previewKind(shown.fileName, shown.contentType) : 'none'
  const key = target ? `${target.kind}:${target.id}` : ''

  useEffect(() => {
    if (!target) return
    let live = true
    setTab('preview')
    setUrl(null)
    setFailed('')
    void openDocumentationFile(target.kind, target.id, 'view').then(link => {
      if (!live) return
      if (link.ok) setUrl(link.url)
      else setFailed(link.reason)
    })
    return () => {
      live = false
    }
    // One open per file shown.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  async function download() {
    if (!target || !shown) return
    const refused = await downloadFile(target.kind, target.id)
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
              {failed ? (
                <div className={s.vwNone}>{failed}</div>
              ) : kind === 'pdf' && url ? (
                <iframe src={url} title="Preview" className={s.vwFrame} />
              ) : kind === 'image' && url ? (
                // eslint-disable-next-line @next/next/no-img-element -- a short signed link, not a static asset
                <img src={url} alt={shown.fileName} className={s.vwImg} />
              ) : kind === 'none' ? (
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

function FactRow({ l, v }: { l: string; v: string }) {
  return (
    <>
      <span className={s.vwFactLabel}>{l}</span>
      <span>{v}</span>
    </>
  )
}
