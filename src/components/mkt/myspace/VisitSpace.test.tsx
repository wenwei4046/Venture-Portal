import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { visitFromRow, type Visit } from '@/lib/marketing/space'

// 2026-10-24 — ⑦-4: a visit to a teammate's space (`My Space Bento.dc.html` › visiting; the user's answers 37, 38 and
// 40): whose it is and the way home, their look, cover, name and status, the visit's board — their room and pet, the
// trophies, their Notes and Photo, the lobby — nothing of it the visitor's to change. The database's side:
// tests/member-sql/validate-marketing-lobby.mjs.

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => router }))
vi.mock('@/lib/storage/browser', () => ({ fileRoute: (b: string, p: string) => `/files/${b}/${p}` }))
const actions = vi.hoisted(() => ({ sendMktChat: vi.fn() }))
vi.mock('@/lib/marketing/actions', () => actions)
const flash = vi.hoisted(() => vi.fn())
vi.mock('@/components/hrv/toast', () => ({ flash }))

import VisitSpace from './VisitSpace'

const MEI = '00000000-0000-4000-8000-000000000012', ALI = '00000000-0000-4000-8000-000000000013'
const mei = (over: Record<string, unknown> = {}, space: Record<string, unknown> | null = {}): Visit => visitFromRow({
  staff: MEI, first: 'Mei', full: 'MEI LING TAN', title: 'VIDEOGRAPHER', role: null,
  space: space && {
    theme: { bg: 'mint', accent: 'blue', corners: 'round' }, cover: 2, coverPath: null, avatarPath: 'space/a/me.png', status: 'Shooting all day',
    notes: 'Call the Carres PIC', photoPath: 'space/b/beach.jpg', room: { wall: 'sage', floor: 'tile', items: [] },
    pet: { species: 'cat', name: 'Kopi', color: 'original', onboarded: true }, petPath: null, ...space,
  },
  stats: { xp: 260, energy: 49, snacks: 3, workouts: 0, trophyCount: 1, trophies: [{ track: 'TSK-CAR-2610-004', title: 'Price banner', at: '' }] },
  ...over,
}) as Visit
const lobby = [
  { staff: ALI, first: 'Ali', title: 'GRAPHIC DESIGNER', species: 'dog' as const, name: 'Bao', color: 'cocoa' as const, petPath: null, xp: 0, energy: 64, state: 'sleeping' as const },
  { staff: MEI, first: 'Mei', title: 'VIDEOGRAPHER', species: 'cat' as const, name: 'Kopi', color: 'original' as const, petPath: null, xp: 260, energy: 49, state: 'busy' as const },
]
const tile = (id: string) => document.querySelector<HTMLElement>(`[data-tile="${id}"]`)

beforeEach(() => {
  router.push.mockReset()
  actions.sendMktChat.mockReset()
  flash.mockReset()
})

describe('a visit', () => {
  it('whose space, the way home; their look, cover, avatar, name, status and pet — nothing to change', () => {
    render(<VisitSpace visit={mei()} state="busy" letter="M" avatarBg="var(--mk-team-content-bg)" lobby={lobby} me={ALI} canChat={false} />)
    expect(screen.getByText("👀 You're visiting Mei's space")).toBeTruthy()
    expect(screen.getByRole('link', { name: '← Back to mine' }).getAttribute('href')).toBe('/marketing')
    const root = document.querySelector<HTMLElement>('[data-bg]') as HTMLElement
    expect([root.dataset.bg, root.dataset.accent, root.dataset.corners]).toEqual(['mint', 'blue', 'round'])
    expect(screen.getByText('MEI LING TAN')).toBeTruthy()
    expect(screen.getByText('· VIDEOGRAPHER')).toBeTruthy()
    expect(screen.getByText('“Shooting all day”')).toBeTruthy()
    expect(screen.getByText('· Kopi Lv 3 · 💻 Working')).toBeTruthy()
    for (const name of [/Edit layout/, /Change cover/, /Decorate/, 'Change profile picture', /^Feed/, /^Exercise/]) {
      expect(screen.queryByRole('button', { name })).toBeNull()
    }
    expect(screen.queryByRole('textbox', { name: 'Status' })).toBeNull()
    expect(screen.queryByRole('link', { name: /Message Mei/ })).toBeNull() // somebody who does not chat
  })

  it('somebody who chats (⑦-3): Message opens their chat on one’s own space; Wave sends them a 👋', async () => {
    render(<VisitSpace visit={mei()} state="busy" letter="M" avatarBg="x" lobby={lobby} me={ALI} canChat />)
    expect(screen.getByRole('link', { name: '💬 Message Mei' }).getAttribute('href')).toBe(`/marketing?chat=${MEI}`)
    actions.sendMktChat.mockResolvedValueOnce({ ok: true, message: { id: 9, from: ALI, first: 'Ali', body: '👋', project: null, at: '' } })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '👋 Wave' })) })
    expect(actions.sendMktChat).toHaveBeenCalledWith(MEI, '👋')
    expect(flash).toHaveBeenCalledWith('You waved at Mei')
    actions.sendMktChat.mockResolvedValueOnce({ ok: false, reason: 'Chatting is not open to your account.' })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '👋 Wave' })) })
    expect(flash).toHaveBeenLastCalledWith('Chatting is not open to your account.')
  })

  it('the visit’s board: their room and pet, the trophies, their Notes and Photo (answer 38), the lobby', () => {
    render(<VisitSpace visit={mei()} state="busy" letter="M" avatarBg="x" lobby={lobby} me={ALI} canChat={false} />)
    expect([...document.querySelectorAll<HTMLElement>('[data-tile]')].map(t => t.dataset.tile).sort()).toEqual(['lobby', 'notes', 'pet', 'photo', 'room', 'trophies'])
    expect(screen.getByText("🏠 Mei's room")).toBeTruthy()
    expect(document.querySelector('[data-room]')?.getAttribute('data-wall')).toBe('sage')
    expect(within(tile('pet') as HTMLElement).getByText('Lv 3')).toBeTruthy()
    expect(within(tile('trophies') as HTMLElement).getByRole('img', { name: 'TSK-CAR-2610-004 · Price banner' })).toBeTruthy()
    const notes = within(tile('notes') as HTMLElement).getByRole('textbox', { name: 'Notes' }) as HTMLTextAreaElement
    expect([notes.value, notes.readOnly]).toEqual(['Call the Carres PIC', true])
    expect((within(tile('photo') as HTMLElement).getByRole('img', { name: 'Photo' }) as HTMLElement).style.backgroundImage).toContain('/files/marketing/space/b/beach.jpg')
  })

  it('no photo: the Notes twice as wide; never opened My Space: no pet, no notes yet — the design’s room', () => {
    render(<VisitSpace visit={mei({}, { photoPath: null })} state="busy" letter="M" avatarBg="x" lobby={lobby} me={ALI} canChat={false} />)
    expect(tile('photo')).toBeNull()
    expect(tile('notes')?.style.width).toBe('calc(50.000% - 12px)')
    document.body.innerHTML = ''
    render(<VisitSpace visit={mei({ first: 'SIA', full: 'SIA JOSIAH' }, null)} state="sleeping" letter="S" avatarBg="x" lobby={lobby} me={ALI} canChat={false} />)
    expect(within(tile('pet') as HTMLElement).getByText('🐾 No pet')).toBeTruthy()
    expect((within(tile('notes') as HTMLElement).getByRole('textbox', { name: 'Notes' }) as HTMLTextAreaElement).placeholder).toBe('No notes yet')
    expect(document.querySelector('[data-room]')?.getAttribute('data-wall')).toBe('peach')
  })

  it('the lobby: another teammate’s pet opens their space; one’s own goes home', () => {
    render(<VisitSpace visit={mei()} state="busy" letter="M" avatarBg="x" lobby={lobby} me={ALI} canChat={false} />)
    const lob = within(tile('lobby') as HTMLElement)
    expect(lob.getAllByText(/^(Ali \(you\)|Mei)$/).map(e => e.textContent)).toEqual(['Ali (you)', 'Mei'])
    fireEvent.click(lob.getByRole('button', { name: "Visit Mei's space" }))
    expect(router.push).toHaveBeenLastCalledWith(`/marketing?visit=${MEI}`)
    fireEvent.click(lob.getByRole('button', { name: 'Back to my space' }))
    expect(router.push).toHaveBeenLastCalledWith('/marketing')
  })
})
