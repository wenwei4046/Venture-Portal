import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { DEFAULT_LAYOUT, DEFAULT_THEME, KINDS, spaceFromRow, type Space } from '@/lib/marketing/space'
import type { PlateColumn } from '@/lib/marketing/my-space'

// 2026-10-23 — ⑦-1: My Space's own side (`My Space Bento.dc.html`): the board laid out by its owner (Edit layout — the
// drawer, a tile added or taken off, dragged by its face, moved by the arrow keys), the look, the cover, the avatar,
// the status, Notes and Photo — each saved as it changes, only that part; a refusal said and put back; what a viewer
// who may not change it sees. The reckoning is lib/marketing/space.test.ts's; the database's
// tests/member-sql/validate-marketing-spaces.mjs.

const actions = vi.hoisted(() => ({ saveMktSpace: vi.fn(), acceptMktStage: vi.fn() }))
vi.mock('@/lib/marketing/actions', () => actions)
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }) }))
const bucket = vi.hoisted(() => ({ upload: vi.fn(), remove: vi.fn() }))
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ storage: { from: () => bucket } }) }))
vi.mock('@/lib/storage/browser', () => ({ fileRoute: (b: string, p: string) => `/files/${b}/${p}` }))
const flash = vi.hoisted(() => vi.fn())
vi.mock('@/components/hrv/toast', () => ({ flash }))

import MySpace, { type MySpaceProps } from './MySpace'

const column = (key: PlateColumn['key'], title: string, emoji: string): PlateColumn => ({ key, title, emoji, cards: [], anyRed: false })
const props = (over: Partial<MySpaceProps> = {}): MySpaceProps => ({
  name: 'Mei Ling', role: 'Videographer', letter: 'M', avatarBg: 'var(--mk-team-content-bg)', greeting: 'Good morning', first: 'Mei',
  plateLine: 'your plate is clear',
  columns: [column('turn', 'My turn', '👉'), column('delegated', 'Delegated by me', '📤'), column('waiting', 'Waiting on others', '⏳')],
  week: [], plans: [], canEdit: true, space: spaceFromRow(null), ...over,
})
/** What the database answers a save: the space with what was sent. */
const answer = (patch: Record<string, unknown>, base: Space = spaceFromRow(null)) =>
  ({ ok: true, space: { ...base, ...patch, saved: true } })
const tile = (id: string) => document.querySelector<HTMLElement>(`[data-tile="${id}"]`)
const root = () => document.querySelector<HTMLElement>('[data-bg]')

beforeEach(() => {
  vi.clearAllMocks()
  actions.saveMktSpace.mockImplementation(async (patch: Record<string, unknown>) => answer(patch))
  bucket.upload.mockResolvedValue({ data: { path: 'x' }, error: null })
  bucket.remove.mockResolvedValue({ data: [], error: null })
})
afterEach(() => vi.restoreAllMocks())

describe('My Space as its owner left it', () => {
  it('before the first save: the board as the page stood, the look its keys — each tile 12 px within its place', () => {
    render(<MySpace {...props()} />)
    expect([root()?.dataset.bg, root()?.dataset.accent, root()?.dataset.corners]).toEqual(['linen', 'orange', 'soft'])
    expect(['turn', 'waiting', 'delegated', 'week'].map(id => !!tile(id))).toEqual([true, true, true, true])
    const turn = tile('turn') as HTMLElement
    expect([turn.style.left, turn.style.top, turn.style.width, turn.style.height]).toEqual(['0.000%', '0px', 'calc(50.000% - 12px)', '352px'])
    expect(tile('week')?.style.top).toBe('182px')
    expect(screen.getByText(/Good morning, Mei/)).toBeTruthy()
    expect(screen.queryByRole('complementary', { name: 'Edit layout' })).toBeNull()
  })

  it('a page drawn again by the server never takes back what was changed', () => {
    const { rerender } = render(<MySpace {...props()} />)
    fireEvent.change(screen.getByRole('textbox', { name: 'Status' }), { target: { value: 'Shooting all day' } })
    rerender(<MySpace {...props({ space: spaceFromRow({ layout: [], status: 'Old words' }) })} />)
    expect((screen.getByRole('textbox', { name: 'Status' }) as HTMLInputElement).value).toBe('Shooting all day')
  })
})

describe('the words', () => {
  it('the status: saved once they stop typing — only it', async () => {
    render(<MySpace {...props()} />)
    fireEvent.change(screen.getByRole('textbox', { name: 'Status' }), { target: { value: 'Shoot' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Status' }), { target: { value: 'Shooting all day' } })
    expect(actions.saveMktSpace).not.toHaveBeenCalled()
    await waitFor(() => expect(actions.saveMktSpace).toHaveBeenCalledWith({ status: 'Shooting all day' }), { timeout: 2000 })
    expect(actions.saveMktSpace).toHaveBeenCalledTimes(1)
  })

  it('notes: saved at once as they leave the box', async () => {
    render(<MySpace {...props({ space: spaceFromRow({ layout: [...DEFAULT_LAYOUT, { id: 'notes', x: 0, y: 364, w: 0.25, h: 182 }] }) })} />)
    const box = screen.getByRole('textbox', { name: 'Notes' })
    fireEvent.change(box, { target: { value: 'Call the Carres PIC' } })
    fireEvent.blur(box)
    await waitFor(() => expect(actions.saveMktSpace).toHaveBeenCalledWith({ notes: 'Call the Carres PIC' }))
  })
})

describe('Edit layout', () => {
  const open = () => {
    fireEvent.click(screen.getByRole('button', { name: /Edit layout/ }))
    return screen.getByRole('complementary', { name: 'Edit layout' })
  }

  it('the drawer: a tile added under the rest — saved with every kind the board has offered', async () => {
    render(<MySpace {...props()} />)
    const drawer = open()
    expect(screen.getByRole('button', { name: /Edit layout/ }).getAttribute('aria-pressed')).toBe('true')
    expect(within(drawer).getAllByRole('button').slice(0, 2).map(b => b.textContent)).toEqual(['📝Notes', '🖼️Photo'])
    fireEvent.click(within(drawer).getByRole('button', { name: /Notes/ }))
    expect(tile('notes')?.style.top).toBe('364px')
    await waitFor(() => expect(actions.saveMktSpace).toHaveBeenCalled(), { timeout: 2000 })
    const sent = actions.saveMktSpace.mock.calls[0][0]
    expect(sent.layout.map((t: { id: string }) => t.id)).toEqual(['turn', 'waiting', 'delegated', 'week', 'notes'])
    expect(sent.tilesKnown).toEqual([...KINDS].sort())
  })

  it('✕ takes a tile off; My turn and Waiting stay (🔒)', async () => {
    render(<MySpace {...props()} />)
    open()
    expect(screen.getAllByRole('img', { name: 'Always on your space' })).toHaveLength(2)
    expect(screen.queryByRole('button', { name: 'Remove My turn' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Remove This week' }))
    expect(tile('week')).toBeNull()
    await waitFor(() => expect(actions.saveMktSpace).toHaveBeenCalled(), { timeout: 2000 })
    expect(actions.saveMktSpace.mock.calls[0][0].layout.map((t: { id: string }) => t.id)).toEqual(['turn', 'waiting', 'delegated'])
  })

  it('dragged by its face: moved, drawn over the rest, saved when let go', async () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ width: 1000, height: 500, top: 0, left: 0, right: 1000, bottom: 500, x: 0, y: 0, toJSON: () => ({}) } as DOMRect)
    render(<MySpace {...props()} />)
    open()
    const face = screen.getByRole('button', { name: /^My turn: move/ })
    fireEvent.pointerDown(face, { button: 0, clientX: 100, clientY: 100 })
    expect(tile('turn')?.style.zIndex).toBe('500')
    act(() => { window.dispatchEvent(new MouseEvent('pointermove', { clientX: 200, clientY: 140 })) })
    act(() => { window.dispatchEvent(new MouseEvent('pointerup', {})) })
    expect([tile('turn')?.style.left, tile('turn')?.style.top]).toEqual(['10.000%', '40px'])
    await waitFor(() => expect(actions.saveMktSpace).toHaveBeenCalled(), { timeout: 2000 })
    const sent = actions.saveMktSpace.mock.calls[0][0].layout
    expect(sent.at(-1)).toEqual({ id: 'turn', x: 0.1, y: 40, w: 0.5, h: 364 })
    expect(sent.map((t: { id: string }) => t.id)).toEqual(['waiting', 'delegated', 'week', 'turn'])
  })

  it('the arrow keys move a tile; with Shift they size it', async () => {
    render(<MySpace {...props()} />)
    open()
    const face = screen.getByRole('button', { name: /^Delegated: move/ })
    fireEvent.keyDown(face, { key: 'ArrowLeft' })
    fireEvent.keyDown(face, { key: 'ArrowDown', shiftKey: true })
    await waitFor(() => expect(actions.saveMktSpace).toHaveBeenCalled(), { timeout: 2000 })
    const delegated = actions.saveMktSpace.mock.calls[0][0].layout.find((t: { id: string }) => t.id === 'delegated')
    expect(delegated).toEqual({ id: 'delegated', x: 0.74, y: 0, w: 0.25, h: 194 })
  })

  it('the look — background, accent, corners — saved as keys at once; Reset puts back the board and the look', async () => {
    render(<MySpace {...props()} />)
    const drawer = open()
    fireEvent.click(within(drawer).getByRole('radio', { name: 'Mint' }))
    expect(root()?.dataset.bg).toBe('mint')
    await waitFor(() => expect(actions.saveMktSpace).toHaveBeenCalledWith({ theme: { bg: 'mint', accent: 'orange', corners: 'soft' } }))
    fireEvent.click(within(drawer).getByRole('radio', { name: 'Blue' }))
    fireEvent.click(within(drawer).getByRole('radio', { name: 'Round' }))
    await waitFor(() => expect(actions.saveMktSpace).toHaveBeenLastCalledWith({ theme: { bg: 'mint', accent: 'blue', corners: 'round' } }))
    expect([root()?.dataset.accent, root()?.dataset.corners]).toEqual(['blue', 'round'])
    fireEvent.click(within(drawer).getByRole('button', { name: 'Reset layout and theme' }))
    await waitFor(() => expect(actions.saveMktSpace).toHaveBeenLastCalledWith({ layout: DEFAULT_LAYOUT, theme: DEFAULT_THEME, tilesKnown: [...KINDS].sort() }))
    expect(root()?.dataset.bg).toBe('linen')
    fireEvent.click(within(drawer).getByRole('button', { name: 'Done' }))
    expect(screen.queryByRole('complementary', { name: 'Edit layout' })).toBeNull()
  })

  it('a refused save is said, and what it changed put back', async () => {
    actions.saveMktSpace.mockResolvedValueOnce({ ok: false, reason: 'Changing your space is not open to your account.' })
    render(<MySpace {...props()} />)
    fireEvent.click(within(open()).getByRole('radio', { name: 'Sand' }))
    expect(root()?.dataset.bg).toBe('sand')
    await waitFor(() => expect(flash).toHaveBeenCalledWith('Changing your space is not open to your account.'))
    await waitFor(() => expect(root()?.dataset.bg).toBe('linen'))
  })
})

describe('the cover and the pictures', () => {
  const pick = (file: File) => fireEvent.change(document.querySelector('input[type=file]') as HTMLInputElement, { target: { files: [file] } })
  const png = (name: string) => new File(['png'], name, { type: 'image/png' })

  it('a preset cover: the four, the one shown ringed — chosen, the picture taken off', async () => {
    render(<MySpace {...props({ space: spaceFromRow({ layout: [], cover: 1, coverPath: 'space/00000000-0000-4000-8000-000000000001/beach.jpg' }) })} />)
    const cover = document.querySelector<HTMLElement>('[data-picture]') as HTMLElement
    expect(cover.style.backgroundImage).toContain('/files/marketing/space/00000000-0000-4000-8000-000000000001/beach.jpg')
    fireEvent.click(screen.getByRole('button', { name: /Change cover/ }))
    const dlg = screen.getByRole('dialog', { name: 'Change cover' })
    expect(within(dlg).getAllByRole('radio').map(r => r.getAttribute('aria-checked'))).toEqual(['false', 'false', 'false', 'false'])
    fireEvent.click(within(dlg).getByRole('radio', { name: 'Cover 3' }))
    expect(screen.queryByRole('dialog', { name: 'Change cover' })).toBeNull()
    await waitFor(() => expect(actions.saveMktSpace).toHaveBeenCalledWith({ cover: 2, coverPath: null }))
    expect(document.querySelector('[data-cover="2"]')).toBeTruthy()
  })

  it('the avatar sent under space/, the photo under mine/ — each saved, then drawn', async () => {
    render(<MySpace {...props({ space: spaceFromRow({ layout: [...DEFAULT_LAYOUT, { id: 'photo', x: 0, y: 364, w: 0.25, h: 182 }] }) })} />)
    fireEvent.click(screen.getByRole('button', { name: 'Change profile picture' }))
    pick(png('Me (1).PNG'))
    await waitFor(() => expect(actions.saveMktSpace).toHaveBeenCalledTimes(1))
    const avatar = bucket.upload.mock.calls[0][0] as string
    expect(avatar).toMatch(/^space\/[0-9a-f-]{36}\/Me-1\.png$/)
    expect(actions.saveMktSpace).toHaveBeenCalledWith({ avatarPath: avatar })
    await waitFor(() => expect(screen.getByRole('button', { name: 'Change profile picture' }).querySelector('img')?.getAttribute('src')).toBe(`/files/marketing/${avatar}`))

    fireEvent.click(screen.getByRole('button', { name: 'Add a photo' }))
    pick(png('beach.png'))
    await waitFor(() => expect(actions.saveMktSpace).toHaveBeenCalledTimes(2))
    const photo = bucket.upload.mock.calls[1][0] as string
    expect(photo).toMatch(/^mine\/[0-9a-f-]{36}\/beach\.png$/)
    expect(actions.saveMktSpace).toHaveBeenLastCalledWith({ photoPath: photo })
    await waitFor(() => expect(screen.getByRole('button', { name: 'Change the photo' }).style.backgroundImage).toContain(`/files/marketing/${photo}`))
  })

  it('not an image: said, nothing sent; a save refused: the picture taken back out of the bucket', async () => {
    render(<MySpace {...props()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Change profile picture' }))
    pick(new File(['%PDF'], 'cv.pdf', { type: 'application/pdf' }))
    expect(flash).toHaveBeenCalledWith('A picture here is an image — PNG, JPG, WebP or GIF.')
    expect(bucket.upload).not.toHaveBeenCalled()

    actions.saveMktSpace.mockResolvedValueOnce({ ok: false, reason: 'That picture has not arrived — upload it again.' })
    fireEvent.click(screen.getByRole('button', { name: 'Change profile picture' }))
    pick(png('me.png'))
    await waitFor(() => expect(bucket.remove).toHaveBeenCalledWith([bucket.upload.mock.calls[0][0]]))
    expect(flash).toHaveBeenCalledWith('That picture has not arrived — upload it again.')
    expect(screen.getByRole('button', { name: 'Change profile picture' }).querySelector('img')).toBeNull()
  })
})

describe('someone who may only look', () => {
  it('no Edit layout, no box for the status (their words in quotes), no picture to change, notes read-only', () => {
    const space = spaceFromRow({ layout: [...DEFAULT_LAYOUT, { id: 'notes', x: 0, y: 364, w: 0.25, h: 182 }], status: 'Shooting all day', notes: 'Call PIC' })
    render(<MySpace {...props({ canEdit: false, space })} />)
    expect(screen.queryByRole('button', { name: /Edit layout/ })).toBeNull()
    expect(screen.queryByRole('textbox', { name: 'Status' })).toBeNull()
    expect(screen.getByText('“Shooting all day”')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Change cover/ })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Change profile picture' })).toBeNull()
    expect((screen.getByRole('textbox', { name: 'Notes' }) as HTMLTextAreaElement).readOnly).toBe(true)
    expect(document.querySelector('input[type=file]')).toBeNull()
  })
})
