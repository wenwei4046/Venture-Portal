import { describe, expect, it } from 'vitest'
import { cropRect, editable, editedType, penWidth, textSize, workSize } from './photo-edit'

describe('a photo edited before it is sent (2026-10-28)', () => {
  it('works on a photo at most 2048 px on its longest side', () => {
    expect(workSize(4032, 3024)).toEqual({ w: 2048, h: 1536 })
    expect(workSize(800, 600)).toEqual({ w: 800, h: 600 })
  })
  it('turns a dragged box into the canvas’s pixels, inside it, any corner first', () => {
    expect(cropRect({ x: 50, y: 40 }, { x: 10, y: 10 }, 2, { w: 1000, h: 1000 })).toEqual({ x: 20, y: 20, w: 80, h: 60 })
    expect(cropRect({ x: -5, y: -5 }, { x: 600, y: 600 }, 2, { w: 1000, h: 800 })).toEqual({ x: 0, y: 0, w: 1000, h: 800 })
    expect(cropRect({ x: 1, y: 1 }, { x: 2, y: 2 }, 1, { w: 100, h: 100 })).toBeNull()
  })
  it('sizes pen and words to the photo, sends PNG as PNG and the rest as JPEG', () => {
    expect([penWidth(2048), textSize(2048)]).toEqual([11, 114])
    expect(editedType({ name: 'shot.PNG', type: 'image/png' })).toEqual({ type: 'image/png', name: 'shot.png' })
    expect(editedType({ name: 'IMG_1.heic', type: 'image/heic' })).toEqual({ type: 'image/jpeg', name: 'IMG_1.jpg' })
    expect([editable({ type: 'image/jpeg' }), editable({ type: 'image/gif' }), editable({ type: 'video/mp4' })]).toEqual([true, false, false])
  })
})
