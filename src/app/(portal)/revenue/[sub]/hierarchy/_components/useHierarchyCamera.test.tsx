import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getViewportForBounds } from '@xyflow/react'
import { useHierarchyCamera } from './useHierarchyCamera'

const adapters = vi.hoisted(() => ({
  view: { x: 40, y: 20, zoom: 0.8 },
  getViewport: vi.fn<() => { x: number; y: number; zoom: number }>(),
  setViewport: vi.fn<(viewport: { x: number; y: number; zoom: number }, options?: { duration?: number }) => Promise<boolean>>(),
}))

vi.mock('@xyflow/react', async importOriginal => ({
  ...await importOriginal<typeof import('@xyflow/react')>(),
  useReactFlow: () => ({ getViewport: adapters.getViewport, setViewport: adapters.setViewport }),
}))

type Camera = ReturnType<typeof useHierarchyCamera>
let camera: Camera | null = null

function Harness() {
  camera = useHierarchyCamera()
  return <div ref={camera.canvas} data-testid="camera-canvas" />
}

function setup() {
  render(<Harness />)
  Object.defineProperties(screen.getByTestId('camera-canvas'), {
    clientWidth: { configurable: true, value: 1000 },
    clientHeight: { configurable: true, value: 600 },
  })
  expect(camera).not.toBeNull()
  return camera!
}

const before = { x: 100, y: 100, width: 200, height: 160 }
const after = { x: 600, y: 140, width: 280, height: 200 }

beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  camera = null
  adapters.view = { x: 40, y: 20, zoom: 0.8 }
  adapters.getViewport.mockImplementation(() => ({ ...adapters.view }))
  adapters.setViewport.mockImplementation(async viewport => {
    adapters.view = { ...viewport }
    return true
  })
  vi.spyOn(window, 'matchMedia').mockImplementation(query => ({
    matches: false, media: query, onchange: null,
    addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(),
    removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
  }))
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('useHierarchyCamera', () => {
  it('leaves the camera alone when the arranged bounds fit inside the current viewport', () => {
    const api = setup()
    act(() => api.makeRoom(before, api.generation.current))
    expect(adapters.setViewport).not.toHaveBeenCalled()
  })

  it('brings overflowing bounds into view over 400 ms without zooming in', () => {
    const api = setup()
    const originalZoom = adapters.view.zoom
    const spread = { x: 1400, y: 1000, width: 1500, height: 900 }
    act(() => api.makeRoom(spread, api.generation.current))
    expect(adapters.setViewport).toHaveBeenCalledOnce()
    const [viewport, options] = adapters.setViewport.mock.calls[0]
    expect(options?.duration).toBe(400)
    expect(viewport.zoom).toBeLessThanOrEqual(originalZoom)
    expect(viewport.zoom).toBeGreaterThanOrEqual(0.15)
    // The real React Flow calculation, not a stub, must place the bounds on-screen.
    expect(spread.x * viewport.zoom + viewport.x).toBeGreaterThanOrEqual(0)
    expect(spread.y * viewport.zoom + viewport.y).toBeGreaterThanOrEqual(0)
    expect((spread.x + spread.width) * viewport.zoom + viewport.x).toBeLessThanOrEqual(1000)
    expect((spread.y + spread.height) * viewport.zoom + viewport.y).toBeLessThanOrEqual(600)
  })

  it('cancels deferred focus when a new gesture interrupts, including a late response with the old token', () => {
    const api = setup()
    const oldToken = api.generation.current
    act(() => api.followTransfer(before, after, oldToken))
    act(() => vi.advanceTimersByTime(300))
    expect(adapters.setViewport).not.toHaveBeenCalled()
    act(() => api.interrupt())
    expect(adapters.setViewport).toHaveBeenCalledExactlyOnceWith({ x: 40, y: 20, zoom: 0.8 }, { duration: 0 })
    adapters.setViewport.mockClear()
    act(() => {
      api.followTransfer(before, after, oldToken)
      vi.advanceTimersByTime(1000)
    })
    expect(adapters.setViewport).not.toHaveBeenCalled()
  })

  it('does not let a stale transfer cancel a newer transfer’s scheduled focus', () => {
    const api = setup()
    const oldToken = api.generation.current
    act(() => api.interrupt())
    adapters.setViewport.mockClear()
    const currentToken = api.generation.current
    act(() => api.followTransfer(before, after, currentToken))
    act(() => vi.advanceTimersByTime(200))
    act(() => api.followTransfer(before, { x: -1000, y: -1000, width: 200, height: 160 }, oldToken))
    act(() => vi.advanceTimersByTime(339))
    expect(adapters.setViewport).not.toHaveBeenCalled()
    act(() => vi.advanceTimersByTime(1))
    expect(adapters.setViewport).toHaveBeenCalledExactlyOnceWith(
      getViewportForBounds(after, 1000, 600, 0.15, 1.05, 0.15), { duration: 400 },
    )
    act(() => vi.advanceTimersByTime(1000))
    expect(adapters.setViewport).toHaveBeenCalledOnce()
  })

  it('uses immediate camera updates when reduced motion is enabled', () => {
    vi.mocked(window.matchMedia).mockReturnValue({ ...window.matchMedia('(prefers-reduced-motion: reduce)'), matches: true })
    const api = setup()
    const spread = { x: 1800, y: 900, width: 1200, height: 900 }
    act(() => api.makeRoom(spread, api.generation.current))
    expect(adapters.setViewport).toHaveBeenLastCalledWith(expect.any(Object), { duration: 0 })
    adapters.setViewport.mockClear()
    act(() => {
      api.followTransfer(before, after, api.generation.current)
      vi.advanceTimersByTime(0)
    })
    expect(adapters.setViewport).toHaveBeenCalled()
    for (const [, options] of adapters.setViewport.mock.calls) expect(options?.duration).toBe(0)
  })
})
