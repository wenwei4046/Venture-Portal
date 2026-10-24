import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { chatListFromRow, type ChatThread } from '@/lib/marketing/chat'

// 2026-10-24 — ⑦-3: My Space's chat tile (`My Space Bento.dc.html`; the user's answers 35, 36, 37 and 39): the tabs and
// their dots, the direct chats — unread first — a chat opened and read, a message sent with Enter, a task attached, the
// lobby read by everybody and written by the team; a read mark only on the person's own move. The database's side:
// tests/member-sql/validate-marketing-chat.mjs; the wording, lib/marketing/chat.test.ts.

const actions = vi.hoisted(() => ({ readMktChat: vi.fn(), sendMktChat: vi.fn() }))
vi.mock('@/lib/marketing/actions', () => actions)
const reads = vi.hoisted(() => ({ readChatThread: vi.fn(), readChatListNow: vi.fn() }))
vi.mock('./chat-read', () => reads)
const flash = vi.hoisted(() => vi.fn())
vi.mock('@/components/hrv/toast', () => ({ flash }))
vi.mock('@/lib/storage/browser', () => ({ fileRoute: (b: string, p: string) => `/files/${b}/${p}` }))

import ChatTile from './ChatTile'

const MEI = '00000000-0000-4000-8000-000000000012', ALI = '00000000-0000-4000-8000-000000000013', SITI = '00000000-0000-4000-8000-000000000015'
const AT = '2026-10-24T01:12:00Z'
const m = (id: number, from: string, first: string, body: string | null, project: { id: string; track: string; title: string } | null = null) =>
  ({ id, from, first, body, project, at: AT })
const BANNER = { id: '00000000-0000-4000-8000-000000000701', track: 'TSK-CAR-2610-004', title: 'Price banner' }
const listFor = (me: string | null, over: Record<string, unknown> = {}) => chatListFromRow({
  me,
  lobby: { last: m(4, MEI, 'Mei', 'Who has the moodboard?'), unread: !!me },
  dms: me ? [
    { staff: SITI, first: 'Siti', title: 'GRAPHIC DESIGNER', last: null, unread: false },
    { staff: MEI, first: 'Mei', title: 'VIDEOGRAPHER', last: m(3, MEI, 'Mei', 'Can you check the banner?'), unread: true },
  ] : [],
  ...over,
})
const thread = (w: string, messages: ReturnType<typeof m>[], more = false): ChatThread => ({ with: w, messages, more })

beforeEach(() => {
  vi.clearAllMocks()
  actions.readMktChat.mockResolvedValue({ ok: true })
  reads.readChatListNow.mockResolvedValue(null)
})

describe('one’s chats', () => {
  it('the tabs and their dots; the chats, unread first; a chat opened, read — and marked, the person having opened it', async () => {
    render(<ChatTile list={listFor(ALI)} canSpeak tasks={[BANNER]} />)
    const tabs = screen.getByRole('tablist', { name: 'Chats' })
    expect(within(tabs).getAllByRole('tab').map(t => [t.textContent, t.getAttribute('aria-selected')])).toEqual([['💬 My chats', 'true'], ['🏛️ Lobby', 'false']])
    expect(within(within(tabs).getByRole('tab', { name: /Lobby/ })).getByLabelText('Unread')).toBeTruthy()
    expect(screen.getAllByRole('button', { name: /^(Mei|Siti)/ }).map(b => b.getAttribute('aria-label'))).toEqual(['Mei · unread', 'Siti'])
    expect(screen.getByText('Can you check the banner?')).toBeTruthy()
    expect(screen.getByText('No messages yet')).toBeTruthy()

    reads.readChatThread.mockResolvedValueOnce(thread(MEI, [m(2, ALI, 'Ali', 'Morning'), m(3, MEI, 'Mei', 'Can you check the banner?', BANNER)]))
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Mei · unread' })) })
    expect(reads.readChatThread).toHaveBeenCalledWith(MEI)
    const log = screen.getByRole('log', { name: 'Messages with Mei' })
    expect(within(log).getAllByText(/^(You|Mei) · /).map(e => e.textContent?.split(' · ')[0])).toEqual(['You', 'Mei'])
    expect(within(log).getByRole('link', { name: /Price banner/ }).getAttribute('href')).toBe('/marketing/projects/TSK-CAR-2610-004')
    expect(actions.readMktChat).toHaveBeenCalledWith(MEI, 3)
    expect(screen.getByRole('textbox', { name: 'Message' }).getAttribute('placeholder')).toBe('Message Mei')
    fireEvent.click(screen.getByRole('button', { name: 'All chats' }))
    expect(screen.getByRole('button', { name: 'Mei' })).toBeTruthy() // read: no longer unread
  })

  it('a message sent with Enter; a task attached; a refusal said', async () => {
    render(<ChatTile list={listFor(ALI)} canSpeak tasks={[BANNER]} />)
    reads.readChatThread.mockResolvedValue(thread(MEI, [m(3, MEI, 'Mei', 'Can you check the banner?')]))
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Mei · unread' })) })
    const box = screen.getByRole('textbox', { name: 'Message' })
    actions.sendMktChat.mockResolvedValueOnce({ ok: true, message: m(5, ALI, 'Ali', 'On it') })
    fireEvent.change(box, { target: { value: '  On   it ' } })
    await act(async () => { fireEvent.keyDown(box, { key: 'Enter' }) })
    expect(actions.sendMktChat).toHaveBeenCalledWith(MEI, 'On it', null)
    expect((box as HTMLInputElement).value).toBe('')
    expect(within(screen.getByRole('log')).getByText('On it')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Attach a task' }))
    fireEvent.click(within(screen.getByRole('listbox', { name: 'Attach a task' })).getByRole('option', { name: /Price banner/ }))
    expect(screen.getByText('📎 Price banner')).toBeTruthy()
    actions.sendMktChat.mockResolvedValueOnce({ ok: true, message: m(6, ALI, 'Ali', null, BANNER) })
    await act(async () => { fireEvent.keyDown(box, { key: 'Enter' }) })
    expect(actions.sendMktChat).toHaveBeenLastCalledWith(MEI, null, BANNER.id)
    expect(screen.queryByText('📎 Price banner')).toBeNull()

    actions.sendMktChat.mockResolvedValueOnce({ ok: false, reason: 'A message goes to the lobby or to somebody on Marketing’s roster.' })
    fireEvent.change(box, { target: { value: 'Still there?' } })
    await act(async () => { fireEvent.keyDown(box, { key: 'Enter' }) })
    expect(flash).toHaveBeenCalledWith('A message goes to the lobby or to somebody on Marketing’s roster.')
    expect((box as HTMLInputElement).value).toBe('Still there?')
  })
})

describe('the lobby', () => {
  it('the team writes there; everybody sees it', async () => {
    render(<ChatTile list={listFor(ALI)} canSpeak tasks={[]} />)
    reads.readChatThread.mockResolvedValueOnce(thread('lobby', [m(4, MEI, 'Mei', 'Who has the moodboard?')]))
    await act(async () => { fireEvent.click(screen.getByRole('tab', { name: /Lobby/ })) })
    expect(reads.readChatThread).toHaveBeenCalledWith('lobby')
    expect(screen.getByText('Everyone sees this')).toBeTruthy()
    expect(screen.getByRole('textbox', { name: 'Message' }).getAttribute('placeholder')).toBe('Message the lobby')
    expect(actions.readMktChat).toHaveBeenCalledWith('lobby', 4)
  })

  it('off the roster: the lobby alone, read — never written, never marked', async () => {
    reads.readChatThread.mockResolvedValueOnce(thread('lobby', [m(4, MEI, 'Mei', 'Who has the moodboard?')]))
    await act(async () => { render(<ChatTile list={listFor(null)} canSpeak={false} tasks={[]} />) })
    expect(screen.getAllByRole('tab').map(t => t.textContent)).toEqual(['🏛️ Lobby'])
    expect(within(screen.getByRole('log', { name: 'The lobby' })).getByText('Who has the moodboard?')).toBeTruthy()
    expect(screen.queryByRole('textbox', { name: 'Message' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Attach a task' })).toBeNull()
    fireEvent.pointerDown(screen.getByRole('log'))
    expect(actions.readMktChat).not.toHaveBeenCalled()
  })
})

describe('a chat opened by a visit, and older messages', () => {
  it('a visit’s Message opens the chat with them — read, not marked until the person moves in it', async () => {
    reads.readChatThread.mockResolvedValueOnce(thread(MEI, [m(3, MEI, 'Mei', 'Can you check the banner?')]))
    await act(async () => { render(<ChatTile list={listFor(ALI)} canSpeak tasks={[]} openWith={MEI} />) })
    expect(reads.readChatThread).toHaveBeenCalledWith(MEI)
    expect(screen.getByRole('log', { name: 'Messages with Mei' })).toBeTruthy()
    expect(actions.readMktChat).not.toHaveBeenCalled()
    fireEvent.pointerDown(screen.getByRole('log'))
    expect(actions.readMktChat).toHaveBeenCalledWith(MEI, 3)
  })

  it('fifty at a time: Earlier messages reads the ones before', async () => {
    reads.readChatThread.mockResolvedValueOnce(thread(MEI, [m(60, MEI, 'Mei', 'newer')], true))
    await act(async () => { render(<ChatTile list={listFor(ALI)} canSpeak tasks={[]} openWith={MEI} />) })
    reads.readChatThread.mockResolvedValueOnce(thread(MEI, [m(10, ALI, 'Ali', 'older')], false))
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Earlier messages' })) })
    expect(reads.readChatThread).toHaveBeenLastCalledWith(MEI, 60)
    await waitFor(() => expect(within(screen.getByRole('log')).getAllByText(/^(older|newer)$/).map(e => e.textContent)).toEqual(['older', 'newer']))
    expect(screen.queryByRole('button', { name: 'Earlier messages' })).toBeNull()
  })
})
