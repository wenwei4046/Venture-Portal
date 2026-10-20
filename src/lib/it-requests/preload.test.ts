import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ItRequest } from './model'

const calls = vi.hoisted(() => ({
  fetchMyItRequests: vi.fn(), fetchItDesk: vi.fn(), fetchItRequest: vi.fn(), signItFiles: vi.fn(),
}))
vi.mock('./actions', () => calls)
import { preloadItSupport } from './preload'

const request = {
  id: 'request',
  files: [{ id: 'picture', contentType: 'image/png' }, { id: 'document', contentType: 'application/pdf' }],
} as ItRequest

beforeEach(() => {
  vi.clearAllMocks()
  calls.fetchMyItRequests.mockResolvedValue({ ok: true, data: [request] })
  calls.fetchItDesk.mockResolvedValue({ ok: true, data: [request] })
  calls.fetchItRequest.mockResolvedValue({ ok: true, data: request })
  calls.signItFiles.mockResolvedValue({ ok: true, data: { picture: 'signed-picture' } })
})

describe('server-rendered IT support', () => {
  it('opens a request already in the list without reading it again, and signs its images before mounting', async () => {
    const result = await preloadItSupport('request')
    expect(calls.fetchMyItRequests).toHaveBeenCalledOnce()
    expect(calls.fetchItRequest).not.toHaveBeenCalled()
    expect(calls.signItFiles).toHaveBeenCalledWith(['picture'])
    expect(result.initialRequest).toBe(request)
    expect(result.initialFileUrls).toEqual({ picture: 'signed-picture' })
  })

  it('reads the one desk across all apps without loading the account’s own list too', async () => {
    const result = await preloadItSupport(undefined, true)
    expect(result.initialRequests).toEqual([request])
    expect(calls.fetchItDesk).toHaveBeenCalledOnce()
    expect(calls.fetchMyItRequests).not.toHaveBeenCalled()
    expect(calls.fetchItRequest).not.toHaveBeenCalled()
    expect(calls.signItFiles).not.toHaveBeenCalled()
  })

  it('looks up a deep link absent from the list and keeps its detail when image signing fails', async () => {
    calls.fetchMyItRequests.mockResolvedValue({ ok: true, data: [] })
    calls.signItFiles.mockResolvedValue({ ok: false, error: 'Try opening the image again' })
    const result = await preloadItSupport('request')
    expect(calls.fetchItRequest).toHaveBeenCalledWith('request')
    expect(result.initialRequest).toBe(request)
    expect(result.initialFileUrls).toEqual({})
    expect(result.initialError).toBeUndefined()
  })

  it('returns the read’s error with an empty preloaded list so mounting does not repeat the failed read', async () => {
    calls.fetchMyItRequests.mockResolvedValue({ ok: false, error: 'Requests are unavailable' })
    const result = await preloadItSupport()
    expect(result.initialRequests).toEqual([])
    expect(result.initialError).toBe('Requests are unavailable')
    expect(calls.fetchMyItRequests).toHaveBeenCalledOnce()
  })
})
