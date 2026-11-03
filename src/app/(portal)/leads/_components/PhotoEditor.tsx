'use client'

import { useEffect, useRef, useState } from 'react'
import { LeadIcon } from '@/components/layout/lead-icons'
import { cropRect, editedType, penWidth, textSize, workSize, type Rect } from '@/lib/leads/photo-edit'
import s from './photo-editor.module.css'

type Tool = 'pen' | 'text' | 'crop'
type Snap = { w: number; h: number; data: ImageData }

const COLORS = ['#E5484D', '#FFFFFF', '#111111', '#F5A524', '#3E8BFF']

/**
 * A photo edited before it is sent (2026-10-28 — the user: "在图片发出前可以先编辑再发出"): crop, rotate, draw, add
 * words, undo — on a canvas at most 2048 px on its longest side. Send untouched sends the photo as picked.
 */
export default function PhotoEditor({ file, busy, onCancel, onSend }: {
  file: File
  busy: boolean
  onCancel: () => void
  onSend: (file: File) => void
}) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)
  const [tool, setTool] = useState<Tool | null>(null)
  const [color, setColor] = useState(COLORS[0])
  const [words, setWords] = useState('')
  const [history, setHistory] = useState<Snap[]>([])
  const [drag, setDrag] = useState<{ a: { x: number; y: number }; b: { x: number; y: number } } | null>(null)
  const drawing = useRef(false)

  // The photo, drawn once at its working size.
  useEffect(() => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      const c = canvas.current
      if (!c) return
      const size = workSize(img.naturalWidth, img.naturalHeight)
      c.width = size.w
      c.height = size.h
      c.getContext('2d')?.drawImage(img, 0, 0, size.w, size.h)
      setReady(true)
      URL.revokeObjectURL(url)
    }
    img.onerror = () => { setFailed(true); URL.revokeObjectURL(url) }
    img.src = url
    return () => URL.revokeObjectURL(url)
  }, [file])

  const ctx = () => canvas.current?.getContext('2d') ?? null
  const snap = () => {
    const c = canvas.current, g = ctx()
    if (!c || !g) return
    const s0 = { w: c.width, h: c.height, data: g.getImageData(0, 0, c.width, c.height) }
    setHistory(h => [...h.slice(-9), s0])
  }
  const undo = () => {
    const last = history.at(-1), c = canvas.current
    if (!last || !c) return
    c.width = last.w
    c.height = last.h
    ctx()?.putImageData(last.data, 0, 0)
    setHistory(h => h.slice(0, -1))
  }
  // Where a pointer is: on the screen (for the crop's box) and in the canvas's own pixels.
  const at = (e: React.PointerEvent) => {
    const c = canvas.current!
    const r = c.getBoundingClientRect()
    const screen = { x: e.clientX - r.left, y: e.clientY - r.top }
    const k = c.width / r.width
    return { screen, px: { x: screen.x * k, y: screen.y * k }, k }
  }

  const down = (e: React.PointerEvent) => {
    if (!ready || !tool) return
    const p = at(e)
    if (tool === 'crop') { setDrag({ a: p.screen, b: p.screen }); (e.target as Element).setPointerCapture(e.pointerId); return }
    const g = ctx(), c = canvas.current!
    if (!g) return
    if (tool === 'text') {
      if (!words.trim()) return
      snap()
      const size = textSize(c.width)
      g.font = `600 ${size}px Inter, system-ui, sans-serif`
      g.textBaseline = 'middle'
      g.lineJoin = 'round'
      g.lineWidth = Math.max(2, size / 8)
      g.strokeStyle = color === '#111111' ? '#FFFFFF' : '#111111'
      g.strokeText(words, p.px.x, p.px.y)
      g.fillStyle = color
      g.fillText(words, p.px.x, p.px.y)
      return
    }
    snap()
    drawing.current = true
    ;(e.target as Element).setPointerCapture(e.pointerId)
    g.strokeStyle = color
    g.lineWidth = penWidth(c.width)
    g.lineCap = 'round'
    g.lineJoin = 'round'
    g.beginPath()
    g.moveTo(p.px.x, p.px.y)
    g.lineTo(p.px.x + 0.1, p.px.y + 0.1)
    g.stroke()
  }
  const move = (e: React.PointerEvent) => {
    if (tool === 'crop' && drag) { setDrag({ ...drag, b: at(e).screen }); return }
    if (!drawing.current) return
    const g = ctx(), p = at(e)
    if (!g) return
    g.lineTo(p.px.x, p.px.y)
    g.stroke()
  }
  const up = () => { drawing.current = false }

  const cropBox = (): Rect | null => {
    const c = canvas.current
    if (!drag || !c) return null
    const k = c.width / c.getBoundingClientRect().width
    return cropRect(drag.a, drag.b, k, { w: c.width, h: c.height })
  }
  const applyCrop = () => {
    const r = cropBox(), c = canvas.current, g = ctx()
    if (!r || !c || !g) return
    snap()
    const data = g.getImageData(r.x, r.y, r.w, r.h)
    c.width = r.w
    c.height = r.h
    g.putImageData(data, 0, 0)
    setDrag(null)
    setTool(null)
  }
  const rotate = () => {
    const c = canvas.current, g = ctx()
    if (!c || !g) return
    snap()
    const tmp = document.createElement('canvas')
    tmp.width = c.width
    tmp.height = c.height
    tmp.getContext('2d')?.drawImage(c, 0, 0)
    c.width = tmp.height
    c.height = tmp.width
    g.save()
    g.translate(c.width, 0)
    g.rotate(Math.PI / 2)
    g.drawImage(tmp, 0, 0)
    g.restore()
  }
  const send = () => {
    if (!history.length) { onSend(file); return }
    const out = editedType(file)
    canvas.current?.toBlob(b => { if (b) onSend(new File([b], out.name, { type: out.type })) }, out.type, 0.9)
  }

  // The crop's box on the screen.
  const box = drag ? { left: Math.min(drag.a.x, drag.b.x), top: Math.min(drag.a.y, drag.b.y), width: Math.abs(drag.a.x - drag.b.x), height: Math.abs(drag.a.y - drag.b.y) } : null
  const pick = (t: Tool) => { setTool(x => (x === t ? null : t)); setDrag(null) }

  return (
    <div className={s.scrim} role="dialog" aria-modal="true" aria-label="Edit the photo before sending">
      <div className={s.panel}>
        <div className={s.head}>
          <span className={s.title}>Edit before sending</span>
          <span className={s.name}>{file.name}</span>
          <button type="button" className={s.close} onClick={onCancel} aria-label="Cancel" disabled={busy}><LeadIcon name="x" size={16} /></button>
        </div>

        <div className={s.tools} role="toolbar" aria-label="Edit tools">
          <button type="button" className={s.tool} aria-pressed={tool === 'crop'} onClick={() => pick('crop')} disabled={!ready}><LeadIcon name="crop" size={15} />Crop</button>
          <button type="button" className={s.tool} onClick={rotate} disabled={!ready}><LeadIcon name="rotate" size={15} />Rotate</button>
          <button type="button" className={s.tool} aria-pressed={tool === 'pen'} onClick={() => pick('pen')} disabled={!ready}><LeadIcon name="pen" size={15} />Draw</button>
          <button type="button" className={s.tool} aria-pressed={tool === 'text'} onClick={() => pick('text')} disabled={!ready}><LeadIcon name="type" size={15} />Text</button>
          <span className={s.sep} />
          {COLORS.map(c => (
            <button key={c} type="button" className={s.swatch} style={{ background: c }} aria-label={`Colour ${c}`} aria-pressed={color === c} onClick={() => setColor(c)} />
          ))}
          <span className={s.sep} />
          <button type="button" className={s.tool} onClick={undo} disabled={!history.length}><LeadIcon name="undo" size={15} />Undo</button>
        </div>
        {tool === 'text' ? (
          <div className={s.hint}>
            <input className={s.words} value={words} onChange={e => setWords(e.target.value.slice(0, 80))} placeholder="Type the words, then click the photo where they go" autoFocus />
          </div>
        ) : tool === 'crop' ? (
          <div className={s.hint}>
            Drag over the part to keep.
            <button type="button" className={s.apply} onClick={applyCrop} disabled={!cropBox()}>Apply crop</button>
          </div>
        ) : tool === 'pen' ? <div className={s.hint}>Draw on the photo.</div> : null}

        <div className={s.stage}>
          {failed ? <div className={s.fail}>This photo cannot be edited here — send it as it is.</div> : null}
          <div className={s.frame} data-tool={tool ?? undefined}>
            <canvas ref={canvas} className={s.canvas} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} />
            {box && tool === 'crop' ? <div className={s.crop} style={box} /> : null}
          </div>
        </div>

        <div className={s.foot}>
          <span className={s.note}>{history.length ? 'Edited' : 'Not edited — it goes as picked'}</span>
          <button type="button" className={s.cancel} onClick={onCancel} disabled={busy}>Cancel</button>
          <button type="button" className={s.send} onClick={send} disabled={busy || (!ready && !failed)}>{busy ? 'Sending…' : 'Send'}</button>
        </div>
      </div>
    </div>
  )
}
