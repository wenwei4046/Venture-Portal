import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ImageAnnotator from './ImageAnnotator'

class Screenshot {
  static instances: Screenshot[] = []
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  crossOrigin: string | null = null
  naturalWidth = 4000
  naturalHeight = 2000
  src = ''
  constructor() { Screenshot.instances.push(this) }
}

const context = {
  clearRect: vi.fn(), drawImage: vi.fn(), save: vi.fn(), restore: vi.fn(),
  beginPath: vi.fn(), ellipse: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn(),
  fillText: vi.fn(), measureText: vi.fn(() => ({ width: 80 })),
}

beforeEach(() => {
  vi.clearAllMocks()
  Screenshot.instances = []
  vi.stubGlobal('Image', Screenshot)
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D)
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(callback => callback(new Blob(['marked pixels'], { type: 'image/png' })))
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

function loaded(props: Partial<Parameters<typeof ImageAnnotator>[0]> = {}) {
  const onSave = vi.fn(), onClose = vi.fn()
  render(<ImageAnnotator src="https://storage.example/signed-original.png" fileName="original.jpg" onSave={onSave} onClose={onClose} {...props} />)
  act(() => Screenshot.instances.at(-1)!.onload?.())
  const canvas = screen.getByLabelText('Screenshot annotation canvas') as HTMLCanvasElement
  vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 600, height: 300, right: 600, bottom: 300, x: 0, y: 0, toJSON: () => ({}) })
  return { canvas, onSave, onClose }
}

function draw(canvas: HTMLCanvasElement, pointerType = 'mouse') {
  fireEvent.pointerDown(canvas, { pointerId: 1, pointerType, button: 0, clientX: 40, clientY: 40 })
  fireEvent.pointerMove(canvas, { pointerId: 1, pointerType, clientX: 160, clientY: 100 })
  fireEvent.pointerUp(canvas, { pointerId: 1, pointerType, clientX: 160, clientY: 100 })
}

describe('ImageAnnotator', () => {
  it('loads a CORS image and saves a bounded new PNG after a mouse circle without changing the source', async () => {
    const { canvas, onSave, onClose } = loaded({ theme: 'revenue' })
    expect(Screenshot.instances[0].crossOrigin).toBe('anonymous')
    expect(canvas.width).toBe(2400)
    expect(canvas.height).toBe(1200)
    expect(canvas.closest('[data-image-annotator]')).toHaveAttribute('data-revenue-app')
    expect(screen.getByRole('button', { name: 'Save marked copy' })).toBeDisabled()
    draw(canvas)
    expect(context.ellipse).toHaveBeenCalledWith(400, 280, 240, 120, 0, 0, Math.PI * 2)
    fireEvent.click(screen.getByRole('button', { name: 'Save marked copy' }))
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))
    const saved = onSave.mock.calls[0][0] as File
    expect(saved.name).toBe('original-marked.png')
    expect(saved.type).toBe('image/png')
    expect(Screenshot.instances[0].src).toBe('https://storage.example/signed-original.png')
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
  })

  it('discards a cancelled touch and allows a fresh pen stroke, then undo removes it', () => {
    const { canvas } = loaded()
    fireEvent.click(screen.getByRole('button', { name: 'Pen' }))
    fireEvent.pointerDown(canvas, { pointerId: 2, pointerType: 'touch', button: 0, clientX: 20, clientY: 30 })
    fireEvent.pointerMove(canvas, { pointerId: 2, pointerType: 'touch', clientX: 80, clientY: 60 })
    fireEvent.pointerCancel(canvas, { pointerId: 2, pointerType: 'touch' })
    fireEvent.pointerUp(canvas, { pointerId: 2, pointerType: 'touch', clientX: 100, clientY: 70 })
    expect(screen.getByRole('button', { name: 'Save marked copy' })).toBeDisabled()
    draw(canvas, 'touch')
    expect(screen.getByRole('button', { name: 'Save marked copy' })).toBeEnabled()
    expect(context.lineTo).toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(screen.getByRole('button', { name: 'Save marked copy' })).toBeDisabled()
  })

  it('places literal text and arrows and can clear the marked copy', () => {
    const { canvas } = loaded()
    fireEvent.click(screen.getByRole('button', { name: 'Text' }))
    fireEvent.pointerDown(canvas, { pointerId: 1, button: 0, clientX: 20, clientY: 20 })
    expect(screen.getByRole('alert')).toHaveTextContent('Type the text first')
    fireEvent.change(screen.getByRole('textbox', { name: 'Text' }), { target: { value: 'Wrong amount <here>' } })
    fireEvent.pointerDown(canvas, { pointerId: 1, button: 0, clientX: 20, clientY: 20 })
    expect(context.fillText).toHaveBeenCalledWith('Wrong amount <here>', 80, 80)
    fireEvent.click(screen.getByRole('button', { name: 'Arrow' }))
    draw(canvas)
    expect(context.lineTo).toHaveBeenCalledWith(640, 400)
    fireEvent.click(screen.getByRole('button', { name: 'Clear marks' }))
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Save marked copy' })).toBeDisabled()
  })

  it('locks save and cancellation while the host uploads, and preserves marks when upload fails', async () => {
    let fail!: (reason: Error) => void
    const onSave = vi.fn(() => new Promise<void>((_resolve, reject) => { fail = reject }))
    const { canvas, onClose } = loaded({ onSave })
    draw(canvas)
    fireEvent.click(screen.getByRole('button', { name: 'Save marked copy' }))
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Pen' })).toBeDisabled()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()
    await act(async () => { fail(new Error('Upload failed. Please retry.')) })
    expect(screen.getByRole('alert')).toHaveTextContent('Upload failed. Please retry.')
    expect(screen.getByRole('button', { name: 'Save marked copy' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Undo' })).toBeEnabled()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('shows a useful cross-origin export error without calling the host or losing the editor', async () => {
    const { canvas, onSave, onClose } = loaded()
    draw(canvas)
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(() => { throw new DOMException('Tainted canvas', 'SecurityError') })
    fireEvent.click(screen.getByRole('button', { name: 'Save marked copy' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('attach the original screenshot again')
    expect(onSave).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Save marked copy' })).toBeEnabled()
  })

  it('does not begin an upload if navigation unmounts the editor while PNG encoding finishes', async () => {
    let finish!: BlobCallback
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(callback => { finish = callback })
    const { canvas, onSave, onClose } = loaded()
    draw(canvas)
    fireEvent.click(screen.getByRole('button', { name: 'Save marked copy' }))
    cleanup()
    await act(async () => { finish(new Blob(['encoded later'], { type: 'image/png' })) })
    expect(onSave).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('owns Escape without closing the parent sheet and restores focus when unmounted', () => {
    const trigger = document.createElement('button')
    document.body.append(trigger)
    trigger.focus()
    const parentEscape = vi.fn()
    window.addEventListener('keydown', parentEscape)
    const { onClose } = loaded()
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(parentEscape).not.toHaveBeenCalled()
    cleanup()
    expect(document.activeElement).toBe(trigger)
    trigger.remove()
    window.removeEventListener('keydown', parentEscape)
  })

  it('reports expired or unreadable images and leaves cancellation available', () => {
    const onClose = vi.fn()
    render(<ImageAnnotator src="expired" fileName="original.png" onSave={vi.fn()} onClose={onClose} />)
    act(() => Screenshot.instances[0].onerror?.())
    expect(screen.getByRole('alert')).toHaveTextContent('refresh its link')
    expect(screen.getByRole('button', { name: 'Save marked copy' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
