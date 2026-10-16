'use client'

import { useEffect, useRef, useState } from 'react'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { Button } from '@/components/ds/Button'
import { drawPage, openPdf } from '@/components/member/crm/shared/pdf'
import { useEscape } from '@/components/hrv/overlay'
import { viewKind, type DocRow } from '@/lib/me/docs'

/**
 * The document viewer (2026-10-17, the handoff's `viewerOpen`): full screen over Me — ×, the title with "PDF · size ·
 * page n of N", Download — and the document itself as white pages on the grey: a PDF drawn page by page by pdf.js
 * (as the CRM's viewer does, so an iPhone shows every page, upright), a picture as it is.
 */
export function Viewer({ doc, url, phone, onClose, onDownload }: {
  doc: DocRow | null
  url: string | null
  phone: boolean
  onClose: () => void
  onDownload: (d: DocRow) => void
}) {
  useEscape(!!doc, onClose)
  const box = useRef<HTMLDivElement | null>(null)
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null)
  const [heights, setHeights] = useState<number[]>([])
  const [width, setWidth] = useState(0)
  const [at, setAt] = useState(1)
  const [failed, setFailed] = useState(false)
  const kind = doc ? viewKind(doc) : 'none'

  useEffect(() => {
    if (!doc || !url || kind !== 'pdf') return
    let on = true
    let opened: PDFDocumentProxy | null = null
    setPdf(null); setFailed(false); setHeights([]); setAt(1)
    openPdf(url).then(async d => {
      opened = d
      if (!on) return
      const w = Math.min(900, (box.current?.clientWidth ?? 360) - 28)
      const hs: number[] = []
      for (let n = 1; n <= d.numPages; n++) { const v = (await d.getPage(n)).getViewport({ scale: 1 }); hs.push((v.height / v.width) * w) }
      if (on) { setWidth(w); setHeights(hs); setPdf(d) }
    }).catch(() => { if (on) setFailed(true) })
    return () => { on = false; void opened?.loadingTask.destroy() }
  }, [doc, url, kind])

  if (!doc) return null
  const pages = kind === 'pdf' ? heights.length || 1 : 1
  const onScroll = () => {
    const el = box.current
    if (!el || !heights.length) return
    let y = el.scrollTop + el.clientHeight / 3
    let n = 1
    for (const h of heights) { y -= h + 14; if (y < 0) break; n++ }
    setAt(Math.min(n, heights.length))
  }
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 45, background: 'var(--ds-surface-3)', display: 'flex', flexDirection: 'column' }}>
      {phone ? <div style={{ height: 'env(safe-area-inset-top, 0px)', flex: 'none', background: 'var(--ds-surface)' }} /> : null}
      <div style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 6, padding: '0 8px', height: 52, background: 'var(--ds-surface)', borderBottom: '1px solid var(--ds-border)' }}>
        <button type="button" onClick={onClose} aria-label="Close" style={{ width: 44, height: 44, border: 0, background: 'none', fontSize: 24, color: 'var(--ds-ink)', cursor: 'pointer' }}>×</button>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontSize: 14.5, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{doc.title}</span>
          <span style={{ fontSize: 11.5, color: 'var(--ds-ink-2)' }}>{doc.ext} · {doc.size} · page {at} of {pages}</span>
        </div>
        <Button size="sm" onClick={() => onDownload(doc)}>Download</Button>
      </div>
      <div ref={box} onScroll={onScroll} style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '18px 14px 28px', touchAction: 'pan-x pan-y pinch-zoom' }}>
        {!url ? <Note>Opening…</Note>
          : kind === 'image' ? (
            <div style={{ background: 'rgb(255 255 255)', borderRadius: 4, boxShadow: '0 2px 10px rgb(51 36 27 / .14)', overflow: 'hidden' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt={doc.title} style={{ display: 'block', width: '100%', height: 'auto' }} />
            </div>
          ) : kind === 'none' ? <Note>This file is not shown here. Use Download to open it.</Note>
          : failed ? <Note>This PDF could not be opened here. Use Download to open it.</Note>
          : !pdf ? <Note>Opening…</Note>
          : heights.map((h, i) => <PdfPage key={i} doc={pdf} n={i + 1} width={width} height={h} root={box} />)}
      </div>
    </div>
  )
}

function Note({ children }: { children: React.ReactNode }) {
  return <p style={{ margin: '40px 0 0', textAlign: 'center', fontSize: 13, color: 'var(--ds-ink-2)' }}>{children}</p>
}

function PdfPage({ doc, n, width, height, root }: { doc: PDFDocumentProxy; n: number; width: number; height: number; root: React.RefObject<HTMLDivElement | null> }) {
  const holder = useRef<HTMLDivElement | null>(null)
  const canvas = useRef<HTMLCanvasElement | null>(null)
  const [drawn, setDrawn] = useState(false)
  useEffect(() => {
    if (drawn || !holder.current) return
    const io = new IntersectionObserver(es => {
      if (!es.some(e => e.isIntersecting) || !canvas.current) return
      io.disconnect()
      void drawPage(doc, n, canvas.current, width).then(() => setDrawn(true)).catch(() => {})
    }, { root: root.current, rootMargin: '800px 0px' })
    io.observe(holder.current)
    return () => io.disconnect()
  }, [doc, n, width, drawn, root])
  return (
    <div ref={holder} style={{ width, height: Math.round(height), margin: '0 auto 14px', background: 'rgb(255 255 255)', borderRadius: 4, boxShadow: '0 2px 10px rgb(51 36 27 / .14)', overflow: 'hidden' }}>
      <canvas ref={canvas} style={{ display: 'block' }} />
    </div>
  )
}
