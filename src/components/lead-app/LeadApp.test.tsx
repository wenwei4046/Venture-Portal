import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { LeadThread } from '@/lib/leads/types'

const mocks = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn(), copy: vi.fn(async () => true), signOut: vi.fn(async () => ({})), startVoice: vi.fn(async () => null) }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh, push: mocks.push }) }))
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => {
    const channel = { on: () => channel, subscribe: () => channel }
    return { realtime: { setAuth: async () => undefined }, channel: () => channel, removeChannel: async () => undefined, auth: { signOut: mocks.signOut } }
  },
}))
// The live bundle's own Server Actions are never reached: every test hands in its own.
vi.mock('@/lib/leads/actions', () => Object.fromEntries(
  ['readThread', 'replyToLead', 'sendLeadMedia', 'leadMediaLinks', 'markUnread', 'saveLeadCard', 'setContactOutlet', 'handLeadToGroup'].map(k => [k, vi.fn()])))
vi.mock('@/lib/leads/clipboard', () => ({ copyText: mocks.copy }))
vi.mock('@/components/layout/view-as-actions', () => ({ setViewAs: vi.fn() }))
vi.mock('@/components/layout/ViewAsPersonPicker', () => ({ default: () => null }))
vi.mock('@/components/layout/ViewingAsBanner', () => ({ default: ({ name }: { name: string }) => <div>Viewing as {name}</div> }))
vi.mock('@/components/member/app/useBackStep', () => ({ useBackStep: () => undefined }))
vi.mock('@/components/member/crm/shared/voice', () => ({ startVoice: mocks.startVoice, stopVoice: vi.fn(async () => null), cancelVoice: vi.fn(), recTime: () => '0:00' }))
vi.mock('@/components/member/crm/shared/voice-note', () => ({ VoiceNote: () => null }))

import LeadApp, { type LeadAppProps } from './LeadApp'
import type { LeadAppActions } from './live-actions'
import { leadSample } from './sample'

const NOW = '2026-11-27T01:05:00Z'

function fakeActions(threads: Record<string, LeadThread>) {
  const ok = <T,>(data: T) => Promise.resolve({ ok: true as const, data })
  return {
    readThread: vi.fn((id: string) => ok(threads[id] ?? null)),
    replyToLead: vi.fn(() => ok({ id: 99, notSent: null })),
    sendLeadMedia: vi.fn(() => ok({ id: 98, notSent: null })),
    leadMediaLinks: vi.fn(() => ok({})),
    markUnread: vi.fn(() => ok(null)),
    saveLeadCard: vi.fn(() => ok(null)),
    setContactOutlet: vi.fn(() => ok(null)),
    handLeadToGroup: vi.fn(() => ok(null)),
    upload: vi.fn(async () => null),
  } satisfies LeadAppActions
}

function setup(over: Partial<LeadAppProps> = {}) {
  const data = leadSample('2026-11-27')
  const actions = fakeActions(data.threads)
  const props: LeadAppProps = {
    config: data.config, contacts: data.contacts, initialThread: null, initialTab: 'inbox', marked: [], labels: data.labels, outlets: data.outlets,
    canReply: true, canEdit: true, open: { inbox: true, leads: true }, csName: 'Kai Yee', me: { name: 'Kai Yee', sub: 'kaiyee@venture.my · Lead View' },
    home: false, canSwitch: false, viewingAs: null, now: NOW, problem: null, actions, stillClock: true, ...over,
  }
  render(<LeadApp {...props} />)
  return { actions, data }
}

const flush = () => act(async () => { await new Promise(r => setTimeout(r, 0)) })
async function openChat(name: string) {
  fireEvent.click(screen.getAllByText(name)[0])
  await flush()
}
const toast = () => screen.queryByRole('status')?.textContent ?? ''

beforeEach(() => { vi.clearAllMocks(); mocks.copy.mockResolvedValue(true) })

describe('the Inbox', () => {
  it('opens on Waiting: the four waiting chats, their unread on the tab', () => {
    setup()
    expect(screen.getByRole('button', { name: /Waiting\s*4/ })).toHaveAttribute('aria-pressed', 'true')
    for (const n of ['Nurul Huda', 'Low Tze Yen', 'Aisyah Rahman', 'Jason Lim']) expect(screen.getAllByText(n).length).toBeGreaterThan(0)
    expect(screen.queryByText('Michelle Wong')).toBeNull()
    const inbox = screen.getByRole('button', { name: /Inbox/ })
    expect(within(inbox).getByText('7')).toBeInTheDocument()
  })
  it('a brand picked narrows the list', async () => {
    setup()
    fireEvent.click(screen.getByRole('button', { name: /All brands/ }))
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Brands' })).getByRole('button', { name: /Carress/ }))
    expect(screen.getByRole('button', { name: /^Carress/ })).toBeInTheDocument()
    expect(screen.getAllByText('Aisyah Rahman').length).toBeGreaterThan(0)
    expect(screen.queryAllByText('Nurul Huda').filter(e => !e.closest('[aria-hidden="true"]'))).toHaveLength(0)
  })
  it('shows only the tabs whose desktop page opens', () => {
    setup({ open: { inbox: true, leads: false } })
    expect(screen.queryByRole('button', { name: 'Leads' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Profile' })).toBeInTheDocument()
  })
})

describe('a chat', () => {
  it('reads the thread when it opens and draws its bubbles', async () => {
    const { actions } = setup()
    await openChat('Nurul Huda')
    expect(actions.readThread).toHaveBeenCalledWith('nh')
    const bubbles = [...document.querySelectorAll('[data-msg]')].map(b => b.textContent ?? '')
    expect(bubbles).toHaveLength(4)
    expect(bubbles[3]).toContain('Sabtu ni boleh datang tengok?')
    expect(bubbles[1]).toContain('Sent by Welcome template ·')
  })
  it('sends the reply on Enter; an empty box asks to hold the mic', async () => {
    const { actions } = setup()
    await openChat('Nurul Huda')
    const box = screen.getByRole('textbox', { name: 'Reply' })
    fireEvent.change(box, { target: { value: 'Boleh, jumpa Sabtu!' } })
    fireEvent.keyDown(box, { key: 'Enter' })
    await flush()
    expect(actions.replyToLead).toHaveBeenCalledWith('nh', 'Boleh, jumpa Sabtu!')
    expect(mocks.refresh).toHaveBeenCalled()
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Hold to record a voice note' }), { button: 0 })
    fireEvent.pointerUp(screen.getByRole('button', { name: 'Hold to record a voice note' }))
    await flush()
    expect(toast()).toBe('Hold to record a voice note')
  })
  it('confirms a phone found in the chat', async () => {
    const { actions } = setup()
    await openChat('Nurul Huda')
    fireEvent.click(screen.getAllByRole('button', { name: 'Confirm' })[0])
    await flush()
    expect(actions.saveLeadCard).toHaveBeenCalledWith('nh', { phone: '0123384721' })
    expect(toast()).toBe('Number confirmed')
  })
  it('hands a confirmed phone to the sales group: WhatsApp opened in the tap, then recorded', async () => {
    const opened = vi.spyOn(window, 'open').mockReturnValue(null)
    const { actions } = setup()
    await openChat('Jason Lim')
    fireEvent.click(screen.getByRole('button', { name: 'Hand over' }))
    expect(opened).toHaveBeenCalledWith(expect.stringMatching(/^https:\/\/wa\.me\/\?text=/), '_blank', 'noopener,noreferrer')
    await flush()
    expect(actions.handLeadToGroup).toHaveBeenCalledWith('jl')
    expect(toast()).toBe('Handed to 2990s sales · WhatsApp opened')
  })
  it('with no phone, Hand over copies the details for the sales group and records nothing', async () => {
    const { actions } = setup()
    await openChat('Low Tze Yen')
    fireEvent.click(screen.getByRole('button', { name: 'More' }))
    fireEvent.click(screen.getByRole('menuitem', { name: /Hand over/ }))
    await flush()
    expect(mocks.copy).toHaveBeenCalled()
    expect(actions.handLeadToGroup).not.toHaveBeenCalled()
    expect(toast()).toBe('No phone yet — details copied for the sales group')
  })
  it('marks a chat unread to answer later', async () => {
    const { actions } = setup()
    await openChat('Aisyah Rahman')
    fireEvent.click(screen.getByRole('button', { name: 'More' }))
    fireEvent.click(screen.getByRole('menuitem', { name: /Mark unread/ }))
    await flush()
    expect(actions.markUnread).toHaveBeenCalledWith('ar')
    expect(toast()).toBe('Marked unread')
  })
  it('is read-only for whoever may not reply', async () => {
    setup({ canReply: false })
    await openChat('Nurul Huda')
    expect(screen.queryByRole('textbox', { name: 'Reply' })).toBeNull()
    expect(screen.getByText('View only — you can’t reply to customers')).toBeInTheDocument()
  })
})

describe('customer info', () => {
  it('saves only the fields changed', async () => {
    const { actions } = setup()
    await openChat('Jason Lim')
    fireEvent.click(screen.getByRole('button', { name: 'More' }))
    fireEvent.click(screen.getByRole('menuitem', { name: /Customer info/ }))
    const sheet = screen.getByRole('dialog', { name: 'Customer info' })
    fireEvent.click(within(sheet).getByRole('button', { name: 'Edit' }))
    fireEvent.change(within(sheet).getByRole('textbox', { name: 'Interest' }), { target: { value: 'L-shape sofa, grey' } })
    fireEvent.click(within(sheet).getByRole('button', { name: 'Save' }))
    await flush()
    expect(actions.saveLeadCard).toHaveBeenCalledWith('jl', { interest: 'L-shape sofa, grey' })
    expect(within(sheet).getByRole('button', { name: 'Edit' })).toBeInTheDocument()
  })
})

describe('Leads', () => {
  it('lists everybody by the stage they stand at, filtered by a stage chip', () => {
    setup()
    fireEvent.click(screen.getByRole('button', { name: 'Leads' }))
    fireEvent.click(screen.getByRole('button', { name: /^Not handed yet/ }))
    for (const n of ['Nurul Huda', 'Jason Lim', 'Siti Khadijah']) expect(screen.getAllByText(n).length).toBeGreaterThan(0)
    expect(screen.queryAllByText('Daniel Tan').filter(e => !e.closest('[aria-hidden="true"]'))).toHaveLength(0)
  })
})
