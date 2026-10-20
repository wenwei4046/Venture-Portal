import { fireEvent } from '@testing-library/react'
import { vi } from 'vitest'

/**
 * Signing a memo in a test (2026-10-20, components/memos/SignaturePad): happy-dom draws no canvas, so the pad's picture
 * is this PNG data URL (`padPicture()` makes the canvas hand it back), and `sign()` is a stroke across the pad as a
 * finger or a mouse draws one — happy-dom lays the pad out at 0 × 0, so a pixel of the stroke is a pixel of ink.
 */
export const PNG = `data:image/png;base64,iVBORw0KGgo${'A'.repeat(400)}`

/** The canvas hands back PNG (call in a beforeEach; vi.restoreAllMocks undoes it). */
export function padPicture(png: string = PNG) {
  return vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue(png)
}

export function sign(pad: Element, from = { x: 20, y: 120 }, to = { x: 140, y: 110 }) {
  fireEvent.pointerDown(pad, { clientX: from.x, clientY: from.y, pointerId: 1 })
  fireEvent.pointerMove(pad, { clientX: (from.x + to.x) / 2, clientY: (from.y + to.y) / 2, pointerId: 1 })
  fireEvent.pointerMove(pad, { clientX: to.x, clientY: to.y, pointerId: 1 })
  fireEvent.pointerUp(pad, { clientX: to.x, clientY: to.y, pointerId: 1 })
}
