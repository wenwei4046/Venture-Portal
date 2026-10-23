import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { libraryFromRow } from '@/lib/marketing/library'

// 2026-10-23 — ⑥-1: the Library (`Library.dc.html`) — the rail, everything, a subsidiary's folders, a folder's files,
// uploads into the bucket, a file's and a folder's menus, Move, the Dustbin, by what the viewer may do. The reckoning is
// lib/marketing/library.test.ts's; the database's side tests/member-sql/validate-marketing-library.mjs.

const actions = vi.hoisted(() => ({
  addMktLibFolder: vi.fn(), addMktLibType: vi.fn(), binMktLib: vi.fn(), deleteMktLib: vi.fn(), fileMktLib: vi.fn(), moveMktLib: vi.fn(),
  saveMktLibProfile: vi.fn(), shareMktLib: vi.fn(), stopMktLibShare: vi.fn(),
}))
vi.mock('@/lib/marketing/actions', () => actions)
const replace = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace, push: vi.fn(), refresh: vi.fn() }) }))
const bucket = vi.hoisted(() => ({ upload: vi.fn(), remove: vi.fn() }))
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ storage: { from: () => bucket } }) }))
vi.mock('@/lib/storage/browser', () => ({
  fileRoute: (b: string, p: string, d?: string) => `/files/${b}/${p}${d ? `?download=${encodeURIComponent(d)}` : ''}`,
}))
const flash = vi.hoisted(() => vi.fn())
vi.mock('@/components/hrv/toast', () => ({ flash }))

import Library from './Library'

const T = { brand: '10000000-0000-4000-8000-000000000001', photos: '10000000-0000-4000-8000-000000000002', raw: '10000000-0000-4000-8000-000000000003', minutes: '10000000-0000-4000-8000-000000000004' }
const CAR = '20000000-0000-4000-8000-000000000001'
const H2990 = '20000000-0000-4000-8000-000000000002'
const F = { brandCar: '30000000-0000-4000-8000-000000000001', photosCar: '30000000-0000-4000-8000-000000000002', rawCar: '30000000-0000-4000-8000-000000000003', brand2990: '30000000-0000-4000-8000-000000000004' }
const lib = libraryFromRow({
  today: '2026-10-23',
  types: [
    { id: T.brand, name: 'Brandbook', color: 'oklch(0.55 0.12 300)', cat: 'Brand', link: false },
    { id: T.photos, name: 'Product photos', color: 'oklch(0.58 0.12 50)', cat: 'Photo', link: false },
    { id: T.raw, name: 'Raw footage', color: 'oklch(0.48 0.04 240)', cat: 'Video', link: true },
    { id: T.minutes, name: 'Meeting minutes', color: 'oklch(0.55 0.01 60)', cat: 'Minutes', link: false },
  ],
  subs: [{ id: CAR, code: 'CAR', name: 'Carres', emoji: '🛋️', dot: 'oklch(0.7 0.12 235)' }, { id: H2990, code: '2990', name: '2990 Home', emoji: '🏡', dot: 'oklch(0.64 0.15 295)' }],
  folders: [
    { id: F.brandCar, sub: CAR, type: T.brand, url: null, at: '2026-10-02T02:00:00Z' },
    { id: F.photosCar, sub: CAR, type: T.photos, url: null, at: '2026-10-15T02:00:00Z' },
    { id: F.rawCar, sub: CAR, type: T.raw, url: 'https://drive.google.com/drive/folders/abc', at: '2026-10-15T02:00:00Z' },
    { id: F.brand2990, sub: H2990, type: T.brand, url: null, at: '2026-10-01T02:00:00Z' },
  ],
  files: [
    { id: 'x3', folder: F.photosCar, name: 'KJ showroom', path: 'library/u3/kj.jpg', size: 1153434, mime: 'image/jpeg', by: 'Ah Kit', at: '2026-10-15T02:00:00Z' },
    { id: 'x2', folder: F.brandCar, name: 'Logo pack', path: 'library/u2/logo.zip', size: 20971520, mime: 'application/zip', by: 'Rachel', at: '2026-10-02T03:00:00Z' },
    { id: 'x1', folder: F.brand2990, name: '2990 brand sheet', path: 'library/u1/sheet.pdf', size: 1887437, mime: 'application/pdf', by: 'Rachel', at: '2026-10-01T03:00:00Z' },
  ],
  trash: [{ kind: 'file', id: 'x9', name: 'Old logo draft', sub: CAR, type: T.brand, size: 100, by: 'Mei', at: '2026-10-16T00:00:00Z' }],
})
const AT = { co: null, folder: null, bin: null, cat: null, q: null }
const fresh = { ok: true as const, library: lib }

beforeEach(() => {
  Object.values(actions).forEach(f => f.mockReset().mockResolvedValue(fresh))
  replace.mockReset()
  flash.mockReset()
  bucket.upload.mockReset().mockResolvedValue({ data: {}, error: null })
  bucket.remove.mockReset().mockResolvedValue({ data: [], error: null })
})

const rail = () => screen.getByRole('navigation', { name: 'Library' })
const fileNames = () => Array.from(document.querySelectorAll('[class*="fileName"]')).map(n => n.textContent)

describe('the Library', () => {
  it('opens on everything: the rail’s counts, a card per subsidiary, the newest files', () => {
    render(<Library initial={lib} can={{ edit: true, manage: false }} at={AT} />)
    expect(within(rail()).getAllByRole('button').slice(0, 3).map(b => b.textContent)).toEqual(['•All companies3', '🛋️Carres2', '🏡2990 Home1'])
    expect(screen.getByRole('button', { name: /Carres.*3 folders · 2 files/ })).toBeTruthy()
    expect(screen.getByText('Recently added · all companies')).toBeTruthy()
    expect(fileNames()).toEqual(['KJ showroom', 'Logo pack', '2990 brand sheet'])
  })

  it('opens a subsidiary — its folders, a link folder where it points — and adds a folder of a type it has not', async () => {
    render(<Library initial={lib} can={{ edit: true, manage: false }} at={AT} />)
    fireEvent.click(within(rail()).getByRole('button', { name: /Carres/ }))
    expect(replace).toHaveBeenCalledWith('/marketing/library?co=CAR', { scroll: false })
    expect(screen.getByText('Folders · 3')).toBeTruthy()
    expect(screen.getByRole('link', { name: /Raw footage/ }).getAttribute('href')).toBe('https://drive.google.com/drive/folders/abc')
    fireEvent.click(screen.getByRole('button', { name: 'Add folder' }))
    const pop = screen.getByRole('dialog', { name: 'Add folder to Carres' })
    expect(within(pop).getAllByRole('button').map(b => `${b.textContent}${(b as HTMLButtonElement).disabled ? ' (off)' : ''}`))
      .toEqual(['Brandbookalready here (off)', 'Product photosalready here (off)', 'Raw footagealready here (off)', 'Meeting minutes'])
    expect(within(pop).queryByLabelText('New folder type name')).toBeNull()
    fireEvent.click(within(pop).getByRole('button', { name: /Meeting minutes/ }))
    await waitFor(() => expect(actions.addMktLibFolder).toHaveBeenCalledWith(CAR, T.minutes, null))
    expect(flash).toHaveBeenCalledWith('Folder "Meeting minutes" added to Carres')
  })

  it('lets the manager make a folder type for every subsidiary', async () => {
    render(<Library initial={lib} can={{ edit: true, manage: true }} at={{ ...AT, co: 'CAR' }} />)
    fireEvent.click(screen.getByRole('button', { name: 'Add folder' }))
    fireEvent.change(screen.getByLabelText('New folder type name'), { target: { value: 'Moodboards' } })
    fireEvent.change(screen.getByLabelText('Its files\' category'), { target: { value: 'Photo' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))
    await waitFor(() => expect(actions.addMktLibType).toHaveBeenCalledWith('Moodboards', 'oklch(0.55 0.12 300)', 'Photo'))
  })

  it('opens a folder — its files; a file’s menu: Download, Move to…, Move to Dustbin', async () => {
    render(<Library initial={lib} can={{ edit: true, manage: false }} at={{ ...AT, folder: F.brandCar }} />)
    expect(fileNames()).toEqual(['Logo pack'])
    expect(screen.getByRole('button', { name: '⬆ Upload' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Logo pack — more' }))
    const menu = screen.getByRole('menu')
    expect(within(menu).getByRole('menuitem', { name: /Download/ }).getAttribute('href')).toBe('/files/marketing/library/u2/logo.zip?download=Logo%20pack.zip')
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Move to…' }))
    const move = screen.getByRole('dialog', { name: 'Move "Logo pack"' })
    expect(within(move).getAllByRole('button').slice(1).map(b => `${b.textContent}${(b as HTMLButtonElement).disabled ? ' (off)' : ''}`))
      .toEqual(['🛋️Carres / Brandbook1 file (off)', '🛋️Carres / Product photos1 file', '🏡2990 Home / Brandbook1 file'])
    fireEvent.click(within(move).getByRole('button', { name: /2990 Home \/ Brandbook/ }))
    await waitFor(() => expect(actions.moveMktLib).toHaveBeenCalledWith('file', 'x2', F.brand2990))
    fireEvent.click(screen.getByRole('button', { name: 'Logo pack — more' }))
    fireEvent.click(within(screen.getByRole('menu')).getByRole('menuitem', { name: /Move to Dustbin/ }))
    await waitFor(() => expect(actions.binMktLib).toHaveBeenCalledWith('file', 'x2'))
  })

  it('uploads into the folder: over 2 GB refused, each file filed — one refused taken back out of the bucket', async () => {
    actions.fileMktLib.mockResolvedValueOnce({ ok: false, reason: 'That folder is not there.' })
    render(<Library initial={lib} can={{ edit: true, manage: false }} at={{ ...AT, folder: F.brandCar }} />)
    const input = document.querySelector('input[type=file]') as HTMLInputElement
    const small = new File(['%PDF'], 'Brief v2.pdf', { type: 'application/pdf' })
    const big = new File(['x'], 'Rushes.mp4', { type: 'video/mp4' })
    Object.defineProperty(big, 'size', { value: 2 * 1024 * 1024 * 1024 + 1 })
    await act(async () => { fireEvent.change(input, { target: { files: [small, big] } }) })
    await waitFor(() => expect(bucket.remove).toHaveBeenCalled())
    const [path] = bucket.upload.mock.calls[0]
    expect(path).toMatch(/^library\/[0-9a-f-]{36}\/Brief-v2\.pdf$/)
    expect(bucket.upload).toHaveBeenCalledTimes(1)
    expect(actions.fileMktLib).toHaveBeenCalledWith(F.brandCar, 'Brief v2', path)
    expect(bucket.remove).toHaveBeenCalledWith([path])
    expect(flash.mock.calls.map(c => c[0])).toEqual(['That folder is not there.', 'Rushes.mp4 is over 2 GB — add it as a link folder.'])
  })

  it('says it is uploading, then where the file went — the handoff’s words', async () => {
    let arrive: (v: unknown) => void = () => undefined
    bucket.upload.mockReturnValueOnce(new Promise(r => { arrive = r }))
    render(<Library initial={lib} can={{ edit: true, manage: false }} at={{ ...AT, folder: F.brandCar }} />)
    const input = document.querySelector('input[type=file]') as HTMLInputElement
    await act(async () => { fireEvent.change(input, { target: { files: [new File(['%PDF'], 'Brief.pdf', { type: 'application/pdf' })] } }) })
    expect((screen.getByRole('button', { name: 'Uploading…' }) as HTMLButtonElement).disabled).toBe(true)
    await act(async () => { arrive({ data: {}, error: null }) })
    await waitFor(() => expect(flash).toHaveBeenCalledWith('Uploaded to Carres / Brandbook'))
    expect(screen.getByRole('button', { name: '⬆ Upload' })).toBeTruthy()
    expect(bucket.remove).not.toHaveBeenCalled()
  })

  it('keeps the Dustbin: Restore for those who edit, Delete now for the manager', async () => {
    const { unmount } = render(<Library initial={lib} can={{ edit: true, manage: false }} at={{ ...AT, bin: '1' }} />)
    expect(screen.getByText('Old logo draft')).toBeTruthy()
    expect(screen.getByText('Carres / Brandbook')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Delete now' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Restore' }))
    await waitFor(() => expect(actions.binMktLib).toHaveBeenCalledWith('file', 'x9', true))
    unmount()
    render(<Library initial={lib} can={{ edit: true, manage: true }} at={{ ...AT, bin: '1' }} />)
    fireEvent.click(screen.getByRole('button', { name: 'Delete now' }))
    await waitFor(() => expect(actions.deleteMktLib).toHaveBeenCalledWith('file', 'x9'))
  })

  it('narrows by category and searches every folder', () => {
    render(<Library initial={lib} can={{ edit: true, manage: false }} at={AT} />)
    fireEvent.click(within(rail()).getByRole('button', { name: /^Brand\b/ }))
    expect(fileNames()).toEqual(['Logo pack', '2990 brand sheet'])
    fireEvent.change(screen.getByLabelText('Search every folder'), { target: { value: 'sheet' } })
    expect(screen.getByText('Search results · 1')).toBeTruthy()
    expect(fileNames()).toEqual(['2990 brand sheet'])
  })

  it('offers nothing to write to somebody who only views', () => {
    render(<Library initial={lib} can={{ edit: false, manage: false }} at={{ ...AT, co: 'CAR' }} />)
    expect(screen.queryByRole('button', { name: /\+ New/ })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Add folder' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Logo pack — more' }))
    expect(within(screen.getByRole('menu')).getAllByRole('menuitem').map(m => m.textContent)).toEqual(['Download20.0 MB'])
    expect(screen.queryByRole('button', { name: 'Edit brand profile' })).toBeNull()
  })
})

// 2026-10-24 — ⑥-2: a subsidiary's brand profile (the manager's ✎) and its Schedule.
describe('a brand in the Library', () => {
  const LOGO = 'brand/00000000-0000-4000-8000-000000000009/carres-logo.png'
  const dressed = {
    ...lib,
    subs: lib.subs.map(x => (x.id === CAR
      ? { ...x, profile: { ...x.profile, avatar: 'rgb(44 82 130)', banner: 'rgb(40 34 30)', font: 'Playfair' as const, name: 'Carres Living', caption: 'Sofa & living' } }
      : x)),
  }
  const schedules = { [CAR]: [{ id: 's:p1:1', day: '2026-11-05', label: 'Thu 5 Nov', title: 'Year-End Video · Shoot', trackId: 'MKT-CAR-2610-001' }] }

  it('wears it on its card and its banner; its next dates link to their projects', () => {
    const { unmount } = render(<Library initial={dressed} schedules={schedules} can={{ edit: true, manage: false }} at={AT} />)
    const card = screen.getByRole('button', { name: /Carres Living/ })
    expect(card.textContent).toContain('Sofa & living')
    expect((card.querySelector('[class*="cardName"]') as HTMLElement).style.fontFamily).toContain('--font-mk-playfair')
    unmount()
    render(<Library initial={dressed} schedules={schedules} can={{ edit: true, manage: false }} at={{ ...AT, co: 'CAR' }} />)
    const banner = document.querySelector('[class*="banner"][data-dark]') as HTMLElement
    expect(banner.textContent).toContain('Carres Living')
    expect(banner.querySelector('[class*="bannerAvatar"]')?.textContent).toBe('C')
    expect(screen.queryByRole('button', { name: 'Edit brand profile' })).toBeNull()
    expect(screen.getByRole('link', { name: /Thu 5 Nov.*Year-End Video · Shoot/ }).getAttribute('href')).toBe('/marketing/projects/MKT-CAR-2610-001')
  })

  it('lets the manager edit it: colours, a logo uploaded, a font, the words — saved whole', async () => {
    actions.saveMktLibProfile.mockResolvedValueOnce({ ok: true, library: dressed })
    render(<Library initial={lib} can={{ edit: true, manage: true }} at={{ ...AT, co: 'CAR' }} />)
    fireEvent.click(screen.getByRole('button', { name: 'Edit brand profile' }))
    const dlg = screen.getByRole('dialog', { name: 'Edit Carres profile' })
    fireEvent.click(within(within(dlg).getByRole('radiogroup', { name: 'Background colour' })).getByRole('radio', { name: 'Blush' }))
    fireEvent.click(within(dlg).getByRole('radio', { name: /DM Serif/ }))
    fireEvent.change(within(dlg).getByLabelText('Display name'), { target: { value: 'Carres Living' } })
    fireEvent.change(within(dlg).getByLabelText('Caption'), { target: { value: 'Sofa & living' } })
    const inputs = dlg.querySelectorAll('input[type=file]')
    await act(async () => { fireEvent.change(inputs[0], { target: { files: [new File(['png'], 'Logo.png', { type: 'image/png' })] } }) })
    const [logo] = bucket.upload.mock.calls[0]
    expect(logo).toMatch(/^brand\/[0-9a-f-]{36}\/Logo\.png$/)
    expect(within(dlg).getByRole('button', { name: '✓ Logo.png · remove' })).toBeTruthy()
    await act(async () => { fireEvent.change(inputs[1], { target: { files: [new File(['%PDF'], 'cover.pdf', { type: 'application/pdf' })] } }) })
    expect(within(dlg).getByRole('status').textContent).toBe('A brand picture is an image — PNG, JPG, WebP or GIF.')
    fireEvent.click(within(dlg).getByRole('button', { name: 'Save profile' }))
    await waitFor(() => expect(flash).toHaveBeenCalledWith('Brand profile saved'))
    expect(actions.saveMktLibProfile).toHaveBeenCalledWith(CAR, {
      avatar: null, avatarPath: logo, banner: 'rgb(240 228 236)', bannerPath: null, font: 'DM Serif', name: 'Carres Living', caption: 'Sofa & living',
    })
    expect(bucket.remove).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog', { name: 'Edit Carres profile' })).toBeNull()
  })

  it('takes back a picture sent and not saved', async () => {
    render(<Library initial={lib} can={{ edit: true, manage: true }} at={{ ...AT, co: 'CAR' }} />)
    fireEvent.click(screen.getByRole('button', { name: 'Edit brand profile' }))
    const dlg = screen.getByRole('dialog', { name: 'Edit Carres profile' })
    await act(async () => { fireEvent.change(dlg.querySelectorAll('input[type=file]')[1], { target: { files: [new File(['jpg'], 'cover.jpg', { type: 'image/jpeg' })] } }) })
    const [cover] = bucket.upload.mock.calls[0]
    fireEvent.click(within(dlg).getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(bucket.remove).toHaveBeenCalledWith([cover]))
    expect(actions.saveMktLibProfile).not.toHaveBeenCalled()
  })
})

// 2026-10-24 — ⑥-3: a file's or a folder's guest link.
describe('a guest link', () => {
  const CODE = '0123456789abcdef0123456789abcdef'
  const shared = { ...lib, shares: [{ kind: 'file' as const, id: 'x2', code: CODE, download: true, expiry: '7d' as const, expires: '2026-10-31T02:22:00Z' }] }

  it('is made only when asked — 7 days and download by default', async () => {
    actions.shareMktLib.mockResolvedValueOnce({ ok: true, library: shared })
    render(<Library initial={lib} can={{ edit: true, manage: false }} at={{ ...AT, folder: F.brandCar }} />)
    fireEvent.click(screen.getByRole('button', { name: 'Logo pack — more' }))
    fireEvent.click(within(screen.getByRole('menu')).getByRole('menuitem', { name: /Share link/ }))
    const dlg = screen.getByRole('dialog', { name: 'Share "Logo pack"' })
    expect(within(dlg).queryByLabelText('Guest link')).toBeNull()
    expect(within(dlg).getByRole('radio', { name: '7 days' }).getAttribute('aria-checked')).toBe('true')
    expect(within(dlg).getByRole('switch', { name: 'Allow download' }).getAttribute('aria-checked')).toBe('true')
    fireEvent.click(within(dlg).getByRole('button', { name: 'Create link' }))
    await waitFor(() => expect(actions.shareMktLib).toHaveBeenCalledWith('file', 'x2', '7d', true))
    expect((within(dlg).getByLabelText('Guest link') as HTMLInputElement).value).toBe(`${window.location.origin}/l/${CODE}`)
    expect(within(dlg).getByText('Expires Sat 31 Oct, 10:22')).toBeTruthy()
    expect(flash).toHaveBeenCalledWith('Link created')
  })

  it('once live, changes at once; Stop link closes it', async () => {
    actions.stopMktLibShare.mockResolvedValueOnce({ ok: true, library: lib })
    actions.shareMktLib.mockResolvedValue({ ok: true, library: shared })
    render(<Library initial={shared} can={{ edit: true, manage: false }} at={{ ...AT, folder: F.brandCar }} />)
    fireEvent.click(screen.getByRole('button', { name: 'Logo pack — more' }))
    expect(within(screen.getByRole('menu')).getByRole('menuitem', { name: /Share link/ }).textContent).toContain('live')
    fireEvent.click(within(screen.getByRole('menu')).getByRole('menuitem', { name: /Share link/ }))
    const dlg = screen.getByRole('dialog', { name: 'Share "Logo pack"' })
    fireEvent.click(within(dlg).getByRole('radio', { name: '30 days' }))
    await waitFor(() => expect(actions.shareMktLib).toHaveBeenCalledWith('file', 'x2', '30d', true))
    fireEvent.click(within(dlg).getByRole('switch', { name: 'Allow download' }))
    await waitFor(() => expect(actions.shareMktLib).toHaveBeenCalledWith('file', 'x2', '30d', false))
    fireEvent.click(within(dlg).getByRole('button', { name: 'Stop link' }))
    await waitFor(() => expect(actions.stopMktLibShare).toHaveBeenCalledWith('file', 'x2'))
    expect(flash).toHaveBeenCalledWith('Link stopped')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('is never offered for a link folder', () => {
    render(<Library initial={lib} can={{ edit: true, manage: false }} at={{ ...AT, co: 'CAR' }} />)
    fireEvent.click(screen.getByRole('button', { name: 'Raw footage — more' }))
    expect(within(screen.getByRole('menu')).queryByRole('menuitem', { name: /Share link/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Brandbook — more' }))
    expect(within(screen.getByRole('menu')).getByRole('menuitem', { name: /Share link/ })).toBeTruthy()
  })
})
