/** Screenshot marks are kept separately from the original until a new PNG is exported. */
export type AnnotationTool = 'circle' | 'arrow' | 'pen' | 'text'
export interface AnnotationPoint { x: number; y: number }
export interface AnnotationSize { width: number; height: number }
export type ImageAnnotation =
  | { kind: 'circle' | 'arrow'; from: AnnotationPoint; to: AnnotationPoint }
  | { kind: 'pen'; points: AnnotationPoint[] }
  | { kind: 'text'; at: AnnotationPoint; text: string }

/** Keep large phone screenshots useful without allocating a full-resolution camera canvas. */
export const ANNOTATION_MAX_DIMENSION = 2400
export const ANNOTATION_TEXT_LIMIT = 160

export function annotationSize(width: number, height: number): AnnotationSize | null {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null
  const scale = Math.min(1, ANNOTATION_MAX_DIMENSION / Math.max(width, height))
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}

/** Pointer coordinates follow the displayed image, even when it is scaled down on a phone. */
export function annotationPoint(
  x: number, y: number,
  rect: { left: number; top: number; width: number; height: number },
  size: AnnotationSize,
): AnnotationPoint {
  const clamp = (value: number, max: number) => Math.max(0, Math.min(max, value))
  return {
    x: clamp((x - rect.left) * size.width / Math.max(1, rect.width), size.width),
    y: clamp((y - rect.top) * size.height / Math.max(1, rect.height), size.height),
  }
}

/** A tap alone is not a circle, an arrow or a pen stroke. */
export function strokeAnnotation(tool: Exclude<AnnotationTool, 'text'>, points: AnnotationPoint[]): ImageAnnotation | null {
  if (points.length < 2) return null
  const from = points[0], to = points[points.length - 1]
  if (tool === 'pen') {
    const distance = points.slice(1).reduce((sum, p, i) => sum + Math.hypot(p.x - points[i].x, p.y - points[i].y), 0)
    return distance >= 3 ? { kind: 'pen', points: points.map(p => ({ ...p })) } : null
  }
  if (Math.hypot(to.x - from.x, to.y - from.y) < 5) return null
  return { kind: tool, from: { ...from }, to: { ...to } }
}

export function textAnnotation(at: AnnotationPoint, text: string): ImageAnnotation | null {
  const value = text.trim().slice(0, ANNOTATION_TEXT_LIMIT)
  return value ? { kind: 'text', at: { ...at }, text: value } : null
}

export function markedFileName(name: string): string {
  const leaf = name.split(/[\\/]/).pop() ?? ''
  const stem = leaf.replace(/\.[^.]*$/, '').replace(/[\u0000-\u001f<>:"|?*]/g, '').trim().slice(0, 140)
  return `${stem || 'screenshot'}-marked.png`
}

/** The same painter is used by the preview and the exported copy. */
export function drawAnnotations(
  ctx: CanvasRenderingContext2D, marks: readonly ImageAnnotation[], size: AnnotationSize,
  color: string, fontFamily: string,
): void {
  const width = Math.max(3, Math.max(size.width, size.height) / 320)
  const fontSize = Math.max(20, Math.max(size.width, size.height) / 35)
  ctx.save()
  ctx.strokeStyle = color
  ctx.fillStyle = color
  ctx.lineWidth = width
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  for (const mark of marks) {
    if (mark.kind === 'text') {
      ctx.font = `600 ${fontSize}px ${fontFamily}`
      ctx.textBaseline = 'top'
      const textWidth = ctx.measureText(mark.text).width
      ctx.fillText(mark.text, Math.max(0, Math.min(mark.at.x, size.width - textWidth)), Math.max(0, Math.min(mark.at.y, size.height - fontSize)))
      continue
    }
    ctx.beginPath()
    if (mark.kind === 'pen') {
      ctx.moveTo(mark.points[0].x, mark.points[0].y)
      for (const point of mark.points.slice(1)) ctx.lineTo(point.x, point.y)
    } else if (mark.kind === 'circle') {
      ctx.ellipse((mark.from.x + mark.to.x) / 2, (mark.from.y + mark.to.y) / 2,
        Math.max(1, Math.abs(mark.to.x - mark.from.x) / 2), Math.max(1, Math.abs(mark.to.y - mark.from.y) / 2), 0, 0, Math.PI * 2)
    } else {
      const angle = Math.atan2(mark.to.y - mark.from.y, mark.to.x - mark.from.x)
      const length = Math.hypot(mark.to.x - mark.from.x, mark.to.y - mark.from.y)
      const head = Math.min(Math.max(14, width * 4), length * .45)
      ctx.moveTo(mark.from.x, mark.from.y)
      ctx.lineTo(mark.to.x, mark.to.y)
      ctx.moveTo(mark.to.x - head * Math.cos(angle - Math.PI / 6), mark.to.y - head * Math.sin(angle - Math.PI / 6))
      ctx.lineTo(mark.to.x, mark.to.y)
      ctx.lineTo(mark.to.x - head * Math.cos(angle + Math.PI / 6), mark.to.y - head * Math.sin(angle + Math.PI / 6))
    }
    ctx.stroke()
  }
  ctx.restore()
}
