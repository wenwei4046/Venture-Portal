import { afterEach, describe, expect, it, vi } from 'vitest'
import JSZip from 'jszip'
import type { LibFile } from '@/lib/marketing/library'

// 2026-10-25 — gap 79: a folder's Download as ZIP, made in the browser — each file fetched afresh from its own link, put
// in by its listed name, the ZIP saved as <name>.zip.

vi.mock('@/lib/storage/browser', () => ({ fileRoute: (b: string, p: string) => `/files/${b}/${p}` }))

import { saveZip } from './zip'

const file = (id: string, name: string, path: string): LibFile => ({ id, folder: 'f1', name, path, size: 3, mime: '', by: 'Rachel', at: '' })
const FILES = [file('a', 'Logo pack', 'library/u1/logo.zip'), file('b', 'KJ showroom', 'library/u2/kj.jpg')]

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('a folder’s ZIP, made in the browser', () => {
  it('fetches each file afresh, puts it in by its name, and saves <name>.zip', async () => {
    const asked: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      asked.push(`${url} ${init?.cache}`)
      return new Response(`bytes of ${url}`)
    }))
    let made: Blob | null = null
    vi.spyOn(URL, 'createObjectURL').mockImplementation(b => { made = b as Blob; return 'blob:the-zip' })
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    const saved: string[] = []
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { saved.push(`${this.download} ${this.getAttribute('href')}`) })
    const steps: string[] = []
    await saveZip(FILES, 'Carres · Brandbook', (done, all) => steps.push(`${done}/${all}`))
    expect(asked).toEqual(['/files/marketing/library/u1/logo.zip no-store', '/files/marketing/library/u2/kj.jpg no-store'])
    expect(steps).toEqual(['1/2', '2/2'])
    expect(saved).toEqual(['Carres · Brandbook.zip blob:the-zip'])
    expect(document.querySelector('a[download]')).toBeNull()
    const z = await JSZip.loadAsync(await (made as unknown as Blob).arrayBuffer())
    expect(Object.keys(z.files)).toEqual(['Logo pack.zip', 'KJ showroom.jpg'])
    expect(await z.file('KJ showroom.jpg')!.async('string')).toBe('bytes of /files/marketing/library/u2/kj.jpg')
  })

  it('stops at a file it cannot fetch — nothing saved', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => new Response('', { status: url.endsWith('kj.jpg') ? 404 : 200 })))
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    await expect(saveZip(FILES, 'Carres · Brandbook', () => {})).rejects.toThrow('KJ showroom: HTTP 404')
    expect(click).not.toHaveBeenCalled()
  })
})
