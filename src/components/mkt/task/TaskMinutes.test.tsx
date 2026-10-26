import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { taskFromRow, type MktTaskPage } from '@/lib/marketing/task'

// 2026-10-25 — ②a-3: a task written with meeting minutes on New Project (the user's answers 52–55) — on its page the minutes
// are its requirements: each attendee signs (the last completing them), its owner or a manager writes on while they are not
// locked. The database's side is tests/member-sql/validate-marketing-task-minutes.mjs.

const actions = vi.hoisted(() => ({
  acceptMktStage: vi.fn(), saveMktWork: vi.fn(), submitMktStage: vi.fn(), decideMktStage: vi.fn(), setMktSeries: vi.fn(), putMktFree: vi.fn(),
  saveMktStageFiles: vi.fn(), addMktOption: vi.fn(), signMktTaskMinutes: vi.fn(), fillMktTaskMinutes: vi.fn(),
  sendMktTaskMinutes: vi.fn(), resendMktTask: vi.fn(), overrideMktTask: vi.fn(),
}))
vi.mock('@/lib/marketing/actions', () => actions)
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ storage: { from: () => ({}) } }) }))
vi.mock('@/lib/storage/browser', () => ({ fileRoute: (b: string, p: string) => `/files/${b}/${p}` }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }))
vi.mock('../audit/read', () => ({ readProjectLog: vi.fn() }))

import TaskPage from './TaskPage'

const RACHEL = 's-rachel'
const SITI = 's-siti'
const team = [
  { id: RACHEL, user: 'u1', full: 'RACHEL TAN', first: 'Rachel', title: 'MARKETING MANAGER', team: 'manager', role: null, color: null, capacity: 5 },
  { id: SITI, user: 'u2', full: 'SITI AMINAH', first: 'Siti', title: 'GRAPHIC DESIGNER', team: 'design', role: null, color: null, capacity: 5 },
]
const FIELDS = [
  { name: 'Project', type: 'Project link', lock: true }, { name: 'Attendees', type: 'People', lock: true },
  { name: 'Agenda', type: 'Long text', req: true, pic: true }, { name: 'Signatures', type: 'Signature' },
]
function page(me: string, minutes: Record<string, unknown> = {}): MktTaskPage {
  return taskFromRow({
    today: '2026-10-26', me, team,
    sub: { id: 'sub', code: 'CAR', name: 'Carres', dot: 'x', emoji: '🛋️', client: false, pic: 'Kelvin' },
    project: { id: 'p1', trackId: 'TSK-CAR-2610-001', kind: 'quick', sub: 'sub', title: 'Raya push', status: 'active', qType: 'social',
      brief: null, owner: RACHEL, cur: 0, startsOn: '2026-10-23', dueOn: '2026-10-28', free: [] },
    stages: [{ project: 'p1', idx: 0, name: 'Design', dept: 'design', owner: SITI, sla: 1, appr: [], spec: { form: [] }, work: {},
      dueOn: '2026-10-27', status: 'todo' }],
    subtasks: [], events: [], series: null, holidays: [],
    minutes: {
      id: 'm1', project: 'p1', title: 'Kickoff', intake: true, status: 'draft', locked: false, rev: 4,
      vals: { Attendees: [RACHEL, SITI], Agenda: 'Raya visuals' }, signed: { [RACHEL]: { at: '2026-10-25T03:00:00Z' } }, notes: 'Siti sends drafts',
      template: { id: 't1', version: 2, name: 'Kickoff', fields: FIELDS, rules: { sign: true, lock: true } },
      ...minutes,
    },
  }) as MktTaskPage
}
const ALL = { edit: true, approve: true, manage: true }
const STAFF = { edit: true, approve: false, manage: false }

beforeEach(() => {
  for (const f of Object.values(actions)) f.mockReset()
})

describe('a task’s meeting minutes on its page', () => {
  it('its requirements: from the template and whose, each field as written, whom they wait for to sign — nothing written beside them', () => {
    render(<TaskPage initial={page(SITI)} can={STAFF} />)
    expect(screen.getByText('FROM MEETING MINUTES · KICKOFF · RACHEL')).toBeTruthy()
    expect((screen.getByRole('textbox', { name: 'Agenda' }) as HTMLTextAreaElement).value).toBe('Raya visuals')
    expect(screen.getByText('Waiting for Siti to sign')).toBeTruthy()
    expect(screen.getByText('Siti sends drafts')).toBeTruthy()
    expect(screen.queryByText('No extra details.')).toBeNull()
  })

  it('an attendee signs, as themselves — the last signature completes them', async () => {
    render(<TaskPage initial={page(SITI)} can={STAFF} />)
    expect((screen.getByRole('textbox', { name: 'Agenda' }) as HTMLTextAreaElement).readOnly).toBe(true)
    actions.signMktTaskMinutes.mockResolvedValue({ ok: true, page: page(SITI, { status: 'completed', locked: true, rev: 5,
      signed: { [RACHEL]: { at: '2026-10-25T03:00:00Z' }, [SITI]: { at: '2026-10-26T02:00:00Z' } }, completedAt: '2026-10-26T02:00:00Z' }) })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Sign' }))
    })
    await waitFor(() => expect(screen.getByText('Complete · locked')).toBeTruthy())
    expect(actions.signMktTaskMinutes).toHaveBeenCalledWith('m1', 'p1')
    expect(screen.getByRole('status').textContent).toBe('Signed · the minutes are complete')
    expect(screen.getByText('🔒 Locked')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Sign' })).toBeNull()
  })

  it('its owner writes on, saved as typed — only what changed, on the minutes the page last saw', async () => {
    actions.fillMktTaskMinutes.mockResolvedValue({ ok: true, rev: 5 })
    render(<TaskPage initial={page(RACHEL)} can={STAFF} />)
    fireEvent.change(screen.getByRole('textbox', { name: 'Agenda' }), { target: { value: 'Raya visuals and banners' } })
    expect(screen.getByText('Saving…')).toBeTruthy()
    await waitFor(() => expect(actions.fillMktTaskMinutes).toHaveBeenCalledTimes(1), { timeout: 3000 })
    expect(actions.fillMktTaskMinutes).toHaveBeenCalledWith('m1', 'p1', 4, { vals: { Agenda: 'Raya visuals and banners' } })
    expect(await screen.findByText('Saved')).toBeTruthy()
    fireEvent.change(screen.getByRole('textbox', { name: 'Meeting notes' }), { target: { value: 'Due Friday' } })
    await waitFor(() => expect(actions.fillMktTaskMinutes).toHaveBeenCalledTimes(2), { timeout: 3000 })
    expect(actions.fillMktTaskMinutes.mock.calls[1]).toEqual(['m1', 'p1', 5, { notes: 'Due Friday' }])
  })

  it('somebody else on the team reads them; a manager writes too; locked, nobody does', () => {
    const { unmount } = render(<TaskPage initial={page(SITI)} can={STAFF} />)
    expect((screen.getByRole('textbox', { name: 'Agenda' }) as HTMLTextAreaElement).readOnly).toBe(true)
    expect(screen.queryByText('Saved')).toBeNull()
    unmount()
    const m = render(<TaskPage initial={page(SITI)} can={ALL} />)
    expect((screen.getByRole('textbox', { name: 'Agenda' }) as HTMLTextAreaElement).readOnly).toBe(false)
    m.unmount()
    render(<TaskPage initial={page(RACHEL, { status: 'completed', locked: true })} can={ALL} />)
    expect((screen.getByRole('textbox', { name: 'Agenda' }) as HTMLTextAreaElement).readOnly).toBe(true)
    expect(screen.getByText('Complete · locked')).toBeTruthy()
  })

  it('another’s save since: not saved, Reload — and nothing more is sent', async () => {
    actions.fillMktTaskMinutes.mockResolvedValue({ ok: false, reason: 'Ali changed these minutes since you opened them — reload to see them.' })
    render(<TaskPage initial={page(RACHEL)} can={STAFF} />)
    fireEvent.change(screen.getByRole('textbox', { name: 'Agenda' }), { target: { value: 'Mine' } })
    expect(await screen.findByRole('alert', {}, { timeout: 3000 })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Reload' })).toBeTruthy()
    expect((screen.getByRole('textbox', { name: 'Agenda' }) as HTMLTextAreaElement).readOnly).toBe(true)
    fireEvent.change(screen.getByRole('textbox', { name: 'Meeting notes' }), { target: { value: 'More' } })
    await new Promise(r => setTimeout(r, 900))
    expect(actions.fillMktTaskMinutes).toHaveBeenCalledTimes(1)
  })
})

// ②a-4 — the PIC approves a task's minutes (the user's answers 52, 53): its first stage waits for them; the manager may start
// before approval. The database's side is tests/member-sql/validate-marketing-task-pic.mjs.
const CODE = 'a'.repeat(32)
function waiting(me: string, status: string, pm: Record<string, unknown> = {}, minutes: Record<string, unknown> = {}): MktTaskPage {
  return taskFromRow({
    today: '2026-10-26', me, team, sub: { id: 'sub', code: 'CAR', name: 'Carres', dot: 'x', emoji: '🛋️', client: false, pic: 'Kelvin' },
    project: { id: 'p1', trackId: 'TSK-CAR-2610-001', kind: 'quick', sub: 'sub', title: 'Raya push', status, qType: 'social', brief: null, owner: RACHEL,
      cur: 0, startsOn: status === 'active' ? '2026-10-26' : null, dueOn: status === 'active' ? '2026-10-27' : null, free: [], pic: 'Kelvin Tan',
      picMinutes: { status, pic: 'Kelvin Tan', whatsapp: '012-345 6789', pic2: '', whatsapp2: '', link: status === 'minutes' ? null : CODE, link2: null,
        sentAt: status === 'minutes' ? null : '2026-10-26T01:00:00Z', reply: null, override: null, ok: null, edited: null, ...pm } },
    stages: [{ project: 'p1', idx: 0, name: 'Design', dept: 'design', owner: SITI, sla: 1, appr: [], spec: { form: [] }, work: {},
      dueOn: status === 'active' ? '2026-10-27' : null, status: status === 'active' ? 'todo' : 'planned' }],
    subtasks: [], events: [], series: null, holidays: [],
    minutes: {
      id: 'm1', project: 'p1', title: 'Kickoff', intake: true, status: 'draft', locked: false, rev: 4,
      vals: { Attendees: [RACHEL, SITI], Agenda: 'Raya visuals' }, signed: { [RACHEL]: { at: '2026-10-25T03:00:00Z' } }, notes: 'Siti sends drafts',
      template: { id: 't1', version: 2, name: 'Kickoff', fields: FIELDS, rules: { sign: true, lock: true } },
      ...minutes,
    },
  }) as MktTaskPage
}
const SIGNED = { signed: { [RACHEL]: { at: '2026-10-25T03:00:00Z' }, [SITI]: { at: '2026-10-25T04:00:00Z' } } }

describe('the PIC approving a task’s minutes', () => {
  it('waiting: nobody’s turn — what is missing before they go to the PIC; its owner sends them, the link made', async () => {
    const { unmount } = render(<TaskPage initial={waiting(RACHEL, 'minutes')} can={STAFF} />)
    expect(screen.getAllByText('Waiting for Siti to sign').length).toBeGreaterThan(0)
    expect(screen.getByText('Starts once Kelvin Tan (PIC) approves the minutes')).toBeTruthy()
    expect(screen.queryByText('Stage 1 · Design')).toBeNull()
    expect((screen.getByRole('textbox', { name: /PIC name/ }) as HTMLInputElement).value).toBe('Kelvin Tan')
    expect((screen.getByRole('button', { name: 'Generate tracking link' }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText('1 left')).toBeTruthy()
    unmount()
    actions.sendMktTaskMinutes.mockResolvedValue({ ok: true, page: waiting(RACHEL, 'waiting_pic', {}, { ...SIGNED, status: 'sent', rev: 5 }) })
    render(<TaskPage initial={waiting(RACHEL, 'minutes', {}, SIGNED)} can={STAFF} />)
    // The page's own pill and the requirements' say it.
    expect(screen.getAllByText('Not sent to the PIC yet')).toHaveLength(2)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Generate tracking link' }))
    })
    await waitFor(() => expect(actions.sendMktTaskMinutes).toHaveBeenCalledWith('m1', 'p1', 4))
    expect(await screen.findByText(new RegExp(`/t/${CODE}$`))).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Share via WhatsApp' }).getAttribute('href')).toMatch(/^https:\/\/wa\.me\/60123456789\?text=/)
    expect(screen.getAllByText('Waiting for Kelvin Tan (PIC)').length).toBeGreaterThan(0)
    expect(screen.getByRole('status').textContent).toBe('Tracking link ready · share it with Kelvin Tan (PIC)')
  })

  it('somebody else on the team sends nothing; the PIC fields are saved with the minutes by its owner', async () => {
    const { unmount } = render(<TaskPage initial={waiting(SITI, 'minutes', {}, SIGNED)} can={STAFF} />)
    expect(screen.queryByRole('button', { name: 'Generate tracking link' })).toBeNull()
    expect((screen.getByRole('textbox', { name: /PIC WhatsApp/ }) as HTMLInputElement).readOnly).toBe(true)
    unmount()
    actions.fillMktTaskMinutes.mockResolvedValue({ ok: true, rev: 5, reapproval: false, page: null })
    render(<TaskPage initial={waiting(RACHEL, 'minutes', {}, SIGNED)} can={STAFF} />)
    fireEvent.change(screen.getByRole('textbox', { name: /PIC WhatsApp/ }), { target: { value: '012-000 1111' } })
    await waitFor(() => expect(actions.fillMktTaskMinutes).toHaveBeenCalledTimes(1), { timeout: 3000 })
    expect(actions.fillMktTaskMinutes).toHaveBeenCalledWith('m1', 'p1', 4, { whatsapp: '012-000 1111' })
  })

  it('sent back with changes: the red banner in their words — its owner resends', async () => {
    actions.resendMktTask.mockResolvedValue({ ok: true, page: waiting(RACHEL, 'waiting_pic', {}, { ...SIGNED, status: 'sent' }) })
    render(<TaskPage initial={waiting(RACHEL, 'changes', { reply: { decision: 'changes', name: 'Kelvin Tan', reason: 'Use the green banner', at: '2026-10-26T02:00:00Z', pic: 1 } },
      { ...SIGNED, status: 'sent' })} can={STAFF} />)
    expect(screen.getByText('Changes requested by Kelvin Tan (PIC): "Use the green banner"')).toBeTruthy()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Resend to Kelvin Tan' }))
    })
    await waitFor(() => expect(actions.resendMktTask).toHaveBeenCalledWith('p1'))
    expect(screen.getByRole('status').textContent).toBe('Resent to Kelvin Tan (PIC)')
  })

  it('the manager starts it before approval — a reason asked; nobody else may', async () => {
    const { unmount } = render(<TaskPage initial={waiting(RACHEL, 'waiting_pic', {}, { ...SIGNED, status: 'sent' })} can={STAFF} />)
    expect(screen.queryByRole('button', { name: 'Start before approval…' })).toBeNull()
    unmount()
    actions.overrideMktTask.mockResolvedValue({ ok: true, page: waiting(RACHEL, 'active', { override: { by: 'Rachel', at: null, reason: 'Kelvin confirmed by phone' } },
      { ...SIGNED, status: 'sent' }) })
    render(<TaskPage initial={waiting(RACHEL, 'waiting_pic', {}, { ...SIGNED, status: 'sent' })} can={ALL} />)
    fireEvent.click(screen.getByRole('button', { name: 'Start before approval…' }))
    const dialog = screen.getByRole('dialog', { name: 'Start before PIC approval' })
    expect((screen.getByRole('button', { name: 'Start anyway' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(dialog.querySelector('textarea')!, { target: { value: 'Kelvin confirmed by phone' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Start anyway' }))
    })
    await waitFor(() => expect(actions.overrideMktTask).toHaveBeenCalledWith('p1', 'Kelvin confirmed by phone'))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(screen.getByText('Override · started before PIC approval')).toBeTruthy()
    expect(screen.getByText('Started before PIC approval')).toBeTruthy()
  })

  it('approved: the work under way, whose approval it was', () => {
    render(<TaskPage initial={waiting(SITI, 'active', { reply: { decision: 'approved', name: 'Kelvin Tan', reason: '', at: '2026-10-26T02:00:00Z', pic: 1 } },
      { ...SIGNED, status: 'completed', locked: true, completedAt: '2026-10-26T02:00:00Z' })} can={STAFF} />)
    expect(screen.getByText('Approved by Kelvin Tan via link · locked')).toBeTruthy()
    expect(screen.getByText(/^Approved by Kelvin Tan via link · 26 Oct/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Accept' })).toBeTruthy()
  })
})
