'use client'

import { useEffect, useState } from 'react'
import { CloseButton, Drawer } from '@/components/hrv/overlay'
import { flash } from '@/components/hrv/toast'
import { templateView, wordPage, type MemberFormKind } from '@/lib/commission/waiting-form'
import { replacementFormTemplateLink, viewFormTemplate, waitingFormTemplateLink } from '../../../waiting-actions'
import w from './waiting.module.css'

const LIST: Readonly<Record<MemberFormKind, string>> = { waiting: 'Waiting list', replacement: 'Replacement list' }

/**
 * View, on the uploaded form's right-click menu (2026-10-14, the user: "right
 * click 然后按 view"): HR's file in a 640px drawer, as Documentation's preview
 * draws a file — a PDF in the browser's own viewer, a picture as it is, a Word
 * .docx read here in the browser (mammoth) and an HTML form as its page, both
 * in a frame where nothing runs. An old .doc cannot be drawn: Download.
 *
 * Mounted only while open; its link is made at the press and lives five minutes.
 */
export default function FormFileViewer({ kind, name: shownName, onClose }: { kind: MemberFormKind; name: string; onClose: () => void }) {
  const [file, setFile] = useState<{ url: string; name: string } | null>(null)
  const [page, setPage] = useState<string | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const name = file?.name ?? shownName
  const view = templateView(name)

  useEffect(() => {
    let live = true
    const stop = new AbortController()
    void (async () => {
      const link = await viewFormTemplate(kind)
      if (!live) return
      if (!link.ok) {
        setFailed(link.reason)
        return
      }
      setFile({ url: link.url, name: link.name })
      const drawn = templateView(link.name)
      if (drawn !== 'word' && drawn !== 'html') return
      try {
        const res = await fetch(link.url, { signal: stop.signal })
        if (!res.ok) throw new Error(String(res.status))
        if (drawn === 'html') {
          const html = await res.text()
          if (live) setPage(html)
          return
        }
        const mammoth = await import('mammoth')
        const read = await mammoth.convertToHtml({ arrayBuffer: await res.arrayBuffer() })
        if (live) setPage(wordPage(read.value, link.name))
      } catch {
        if (live) setFailed('This file could not be opened here. Download it to open.')
      }
    })()
    return () => {
      live = false
      stop.abort()
    }
  }, [kind])

  async function download() {
    const link = kind === 'replacement' ? await replacementFormTemplateLink() : await waitingFormTemplateLink()
    if (!link.ok) {
      flash(link.reason)
      return
    }
    window.location.assign(link.url)
    flash(`Downloads ${link.name}`)
  }

  const ext = name.includes('.') ? `.${name.split('.').pop()!.toLowerCase()}` : 'these'

  return (
    <Drawer open onClose={onClose} width={640} bare label={name}>
      <div className={w.viewHead}>
        <div className={w.viewWho}>
          <div className={w.viewKicker}>{LIST[kind]} · Uploaded form</div>
          <div className={w.viewTitle}>{name}</div>
        </div>
        <button type="button" className={w.viewDownload} onClick={() => void download()}>
          Download
        </button>
        <CloseButton onClick={onClose} />
      </div>
      <div className={w.viewBody}>
        {failed ? (
          <div className={w.viewNone} role="alert">{failed}</div>
        ) : !file || ((view === 'word' || view === 'html') && page === null) ? (
          <div className={w.viewNone} role="status">Opening…</div>
        ) : view === 'pdf' ? (
          <iframe src={file.url} title={name} className={w.viewFrame} />
        ) : view === 'image' ? (
          // eslint-disable-next-line @next/next/no-img-element -- a short signed link, not a static asset
          <img src={file.url} alt={name} className={w.viewImg} />
        ) : view === 'word' || view === 'html' ? (
          // sandbox="": the file's page is drawn; nothing in it runs or reaches the portal.
          <iframe sandbox="" srcDoc={page ?? ''} title={name} className={w.viewFrame} />
        ) : (
          <div className={w.viewNone}>
            No preview for {ext} files.
            <br />
            Download it to open.
          </div>
        )}
      </div>
    </Drawer>
  )
}
