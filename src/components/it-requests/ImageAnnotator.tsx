'use client'

import { useEffect, useId, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { createPortal } from 'react-dom'
import {
  ANNOTATION_TEXT_LIMIT, annotationPoint, annotationSize, drawAnnotations, markedFileName, strokeAnnotation, textAnnotation,
  type AnnotationPoint, type AnnotationSize, type AnnotationTool, type ImageAnnotation,
} from '@/lib/it-requests/annotation'
import s from './image-annotator.module.css'

export interface ImageAnnotatorProps {
  src: string
  fileName: string
  theme?: 'revenue' | 'portal'
  /** The host uploads this new file and adds it to its draft; the original is never changed. */
  onSave: (file: File) => Promise<void> | void
  onClose: () => void
}

type Stroke = { pointerId: number; tool: Exclude<AnnotationTool, 'text'>; points: AnnotationPoint[] }
const TOOLS: Array<[AnnotationTool, string]> = [['circle', 'Circle'], ['arrow', 'Arrow'], ['pen', 'Pen'], ['text', 'Text']]

/** Draw on a copy of either a local upload preview or a signed screenshot URL. */
export default function ImageAnnotator({ src, fileName, theme = 'portal', onSave, onClose }: ImageAnnotatorProps) {
  const titleId = useId()
  const hintId = useId()
  const panel = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const stroke = useRef<Stroke | null>(null)
  const locked = useRef(false)
  const alive = useRef(true)
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  const [picture, setPicture] = useState<{ image: HTMLImageElement; size: AnnotationSize } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [marks, setMarks] = useState<ImageAnnotation[]>([])
  const [preview, setPreview] = useState<ImageAnnotation | null>(null)
  const [tool, setTool] = useState<AnnotationTool>('circle')
  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    alive.current = true
    return () => { alive.current = false }
  }, [])

  useEffect(() => {
    let current = true
    setLoading(true)
    setPicture(null)
    setMarks([])
    setPreview(null)
    setError('')
    stroke.current = null
    const image = new Image()
    image.crossOrigin = 'anonymous'
    image.onload = () => {
      if (!current) return
      const size = annotationSize(image.naturalWidth, image.naturalHeight)
      setLoading(false)
      if (!size) { setError('This image could not be read. Try another screenshot.'); return }
      setPicture({ image, size })
    }
    image.onerror = () => {
      if (!current) return
      setLoading(false)
      setError('The image could not be opened. Close this window and open it again to refresh its link.')
    }
    image.src = src
    return () => { current = false; image.onload = null; image.onerror = null }
  }, [src])

  // Capture Escape before a host sheet sees it. Keep focus inside this window and return it on close.
  useEffect(() => {
    const before = document.activeElement instanceof HTMLElement ? document.activeElement : null
    panel.current?.focus()
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopImmediatePropagation()
        if (!locked.current) closeRef.current()
      } else if (event.key === 'Tab') {
        const controls = panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), [tabindex="0"]')
        if (!controls?.length) { event.preventDefault(); return }
        const first = controls[0], last = controls[controls.length - 1]
        if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) {
          event.preventDefault(); last.focus()
        } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === panel.current)) {
          event.preventDefault(); first.focus()
        }
      }
    }
    window.addEventListener('keydown', key, true)
    return () => { window.removeEventListener('keydown', key, true); before?.focus() }
  }, [])

  const paint = (target: HTMLCanvasElement, all: readonly ImageAnnotation[]) => {
    if (!picture) return false
    const ctx = target.getContext('2d')
    if (!ctx) return false
    ctx.clearRect(0, 0, picture.size.width, picture.size.height)
    ctx.drawImage(picture.image, 0, 0, picture.size.width, picture.size.height)
    const style = getComputedStyle(canvas.current ?? target)
    drawAnnotations(ctx, all, picture.size, style.color, style.fontFamily)
    return true
  }

  useEffect(() => {
    if (picture && canvas.current && !paint(canvas.current, preview ? [...marks, preview] : marks)) {
      setError('Drawing is not available in this browser. Try another browser.')
    }
    // The preview and the exported copy use the same source image and marks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picture, marks, preview])

  const point = (event: ReactPointerEvent<HTMLCanvasElement>) =>
    picture ? annotationPoint(event.clientX, event.clientY, event.currentTarget.getBoundingClientRect(), picture.size) : { x: 0, y: 0 }

  const cancelStroke = () => { stroke.current = null; setPreview(null) }
  const down = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!picture || locked.current || stroke.current || event.button !== 0) return
    event.preventDefault()
    setError('')
    const at = point(event)
    if (tool === 'text') {
      const mark = textAnnotation(at, text)
      if (mark) setMarks(previous => [...previous, mark])
      else setError('Type the text first, then tap where it belongs on the image.')
      return
    }
    stroke.current = { pointerId: event.pointerId, tool, points: [at] }
    try { event.currentTarget.setPointerCapture(event.pointerId) } catch { /* A cancelled touch may already be gone. */ }
  }
  const move = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const active = stroke.current
    if (!active || active.pointerId !== event.pointerId || locked.current) return
    event.preventDefault()
    const at = point(event)
    active.points = active.tool === 'pen' ? [...active.points.slice(-7999), at] : [active.points[0], at]
    setPreview(strokeAnnotation(active.tool, active.points))
  }
  const up = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const active = stroke.current
    if (!active || active.pointerId !== event.pointerId) return
    const at = point(event)
    const mark = strokeAnnotation(active.tool, active.tool === 'pen' ? [...active.points, at] : [active.points[0], at])
    cancelStroke()
    if (mark) setMarks(previous => [...previous, mark])
    try { event.currentTarget.releasePointerCapture(event.pointerId) } catch { /* The browser may release it first. */ }
  }

  const save = async () => {
    if (!picture || !marks.length || locked.current) return
    locked.current = true
    setSaving(true)
    setError('')
    cancelStroke()
    try {
      const copy = document.createElement('canvas')
      copy.width = picture.size.width
      copy.height = picture.size.height
      if (!paint(copy, marks)) throw new Error('Drawing is not available in this browser.')
      const blob = await new Promise<Blob>((resolve, reject) => {
        copy.toBlob(result => result ? resolve(result) : reject(new Error('The marked copy could not be made. Please try again.')), 'image/png')
      })
      // Encoding can finish after navigation removed this draft; do not start a new upload then.
      if (!alive.current) return
      await onSave(new File([blob], markedFileName(fileName), { type: 'image/png' }))
      if (alive.current) closeRef.current()
    } catch (failure) {
      if (alive.current) setError(failure instanceof DOMException && failure.name === 'SecurityError'
        ? 'This image cannot be saved from its link. Close this window and attach the original screenshot again.'
        : failure instanceof Error && failure.message ? failure.message : 'The marked copy could not be saved. Please try again.')
    } finally {
      locked.current = false
      if (alive.current) setSaving(false)
    }
  }

  if (typeof document === 'undefined') return null
  return createPortal(
    <div className={s.overlay} data-image-annotator data-revenue-app={theme === 'revenue' ? '' : undefined} data-annotation-theme={theme}
      onPointerDown={event => event.stopPropagation()} onClick={event => event.stopPropagation()}>
      <div ref={panel} className={s.panel} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={hintId} tabIndex={-1}>
        <header className={s.head}>
          <div><h2 id={titleId} className={s.title}>Mark up screenshot</h2><p className={s.file}>{fileName}</p></div>
          <button type="button" className={s.close} aria-label="Close annotation" disabled={saving} onClick={onClose}>×</button>
        </header>
        <div className={s.tools} role="toolbar" aria-label="Annotation tools">
          {TOOLS.map(([key, label]) => <button key={key} type="button" className={s.tool} aria-pressed={tool === key} disabled={saving}
            onClick={() => { cancelStroke(); setTool(key); setError('') }}>{label}</button>)}
          <span className={s.spacer} />
          <button type="button" className={s.tool} disabled={saving || !marks.length} onClick={() => { cancelStroke(); setMarks(previous => previous.slice(0, -1)) }}>Undo</button>
          <button type="button" className={s.tool} disabled={saving || !marks.length} onClick={() => { cancelStroke(); setMarks([]) }}>Clear marks</button>
        </div>
        {tool === 'text' ? <label className={s.textLabel}>Text
          <input autoFocus className={s.input} maxLength={ANNOTATION_TEXT_LIMIT} value={text} disabled={saving} onChange={event => setText(event.target.value)} placeholder="Type, then tap on the screenshot" />
        </label> : null}
        <p id={hintId} className={s.hint}>{tool === 'text' ? 'Tap the image to place your text.' : 'Drag on the image to mark it.'} The original stays unchanged.</p>
        <div className={s.stage}>
          {loading ? <p role="status" className={s.message}>Opening the screenshot…</p> : null}
          {picture ? <canvas ref={canvas} className={s.canvas} width={picture.size.width} height={picture.size.height} aria-label="Screenshot annotation canvas"
            onPointerDown={down} onPointerMove={move} onPointerUp={up}
            onPointerCancel={event => { if (stroke.current?.pointerId === event.pointerId) cancelStroke() }}
            onLostPointerCapture={event => { if (stroke.current?.pointerId === event.pointerId) cancelStroke() }} /> : null}
        </div>
        {error ? <p role="alert" className={s.error}>{error}</p> : null}
        <footer className={s.foot}>
          <button type="button" className={s.secondary} disabled={saving} onClick={onClose}>Cancel</button>
          <button type="button" className={s.primary} disabled={saving || loading || !picture || !marks.length} onClick={() => void save()}>
            {saving ? 'Saving…' : 'Save marked copy'}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  )
}
