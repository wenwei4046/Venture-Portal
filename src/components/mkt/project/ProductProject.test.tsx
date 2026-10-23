import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { productProjectFromRow, type ProductProjectPage } from '@/lib/marketing/project'

// 2026-10-23 — a 📦 product project's page (②b-1, `New Project.dc.html` steps 2–4) for the people who work it: the
// manager writes the intake minutes with the PIC (saved as typed — only what changed), makes the tracking link once
// nothing is missing, resends after the PIC's changes, or starts before approval with a reason; an attendee signs for
// themselves. Marketing has no logins yet, so the page is walked here against the actions it calls
// (lib/marketing/actions.ts; the database's side is tests/member-sql/validate-marketing-product-projects.mjs).

const actions = vi.hoisted(() => ({
  fillMktMinutes: vi.fn(),
  signMktMinutes: vi.fn(),
  sendMktMinutes: vi.fn(),
  overrideMktProject: vi.fn(),
  resendMktProject: vi.fn(),
  beginMktProduct: vi.fn(),
}))
vi.mock('@/lib/marketing/actions', () => actions)
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }) }))

import ProductProject from './ProductProject'

const RACHEL = 's-rachel'
const SITI = 's-siti'
const FIELDS = [
  { name: 'Project', type: 'Project link', req: true, pic: true, lock: true },
  { name: 'Meeting date', type: 'Date', req: true, pic: true, lock: false },
  { name: 'Attendees', type: 'People', req: true, pic: true, lock: true },
  { name: 'Objective', type: 'Long text', req: true, pic: true, lock: false },
  { name: 'Budget note', type: 'Short text', req: false, pic: false, lock: false },
  { name: 'Signatures', type: 'Signature', req: true, pic: true, lock: false },
]

function page(me: string, project: Record<string, unknown> = {}, minutes: Record<string, unknown> = {}, trail: object[] = [], deliverables: object[] = []): ProductProjectPage {
  return productProjectFromRow({
    today: '2026-10-24',
    me,
    team: [{ id: RACHEL, first: 'Rachel', full: 'RACHEL TAN' }, { id: SITI, first: 'Siti', full: 'SITI AMINAH' }],
    sub: { id: 'sub', code: 'CAR', name: 'Carres', dot: 'x', emoji: '🛋️', client: false, pic: 'Kelvin' },
    project: {
      id: 'p1', track: 'MKT-CAR-2610-001', title: 'Carres · Social Media Package A · Oct 2026', status: 'minutes', owner: RACHEL, ownerName: 'Rachel',
      pic: 'Kelvin', whatsapp: '+60 12-345 6789', link: null, linkSentAt: null, picReply: null, override: null,
      product: { id: 'pr', version: 2, name: 'Social Media Package A', kind: 'recurring', note: '' },
      ...project,
    },
    minutes: [{
      id: 'm1', title: 'Kickoff', intake: true, status: 'draft', locked: false, rev: 3,
      vals: { Attendees: [RACHEL, SITI], 'Meeting date': '2026-10-24' }, signed: { [RACHEL]: { at: '2026-10-24T02:00:00Z' } }, notes: '',
      template: { id: 't1', version: 1, name: 'Kickoff', fields: FIELDS, rules: { sign: true, pic: true, project: true, file: true, lock: true } },
      ...minutes,
    }],
    trail: [...trail, { at: '2026-10-24T01:00:00Z', actor: 'Rachel', action: 'created', reason: null }],
    deliverables,
  }) as ProductProjectPage
}
const MANAGER = { edit: true, manage: true }
const ready = { vals: { Attendees: [RACHEL, SITI], 'Meeting date': '2026-10-24', Objective: 'Year-end walk-ins' }, signed: { [RACHEL]: { at: 'x' }, [SITI]: { at: 'y' } } }
const waiting = { status: 'waiting_pic', link: 'abc123', linkSentAt: '2026-10-24T05:00:00Z' }

beforeEach(() => {
  for (const f of Object.values(actions)) f.mockReset()
  let rev = 3
  actions.fillMktMinutes.mockImplementation(async () => ({ ok: true, rev: ++rev, reapproval: false, page: null }))
})

describe('a product project, for the manager who writes its minutes', () => {
  it('saves what is typed — only what changed, on the minutes it was typed on', async () => {
    render(<ProductProject initial={page(RACHEL)} can={MANAGER} />)
    fireEvent.change(screen.getByRole('textbox', { name: 'Objective' }), { target: { value: 'Year-end walk-ins' } })
    expect(screen.getByText('Saving…')).toBeTruthy()
    await waitFor(() => expect(actions.fillMktMinutes).toHaveBeenCalledTimes(1), { timeout: 3000 })
    expect(actions.fillMktMinutes.mock.calls[0]).toEqual(['m1', 'p1', 3, { vals: { Objective: 'Year-end walk-ins' } }])
    expect(await screen.findByText('Saved')).toBeTruthy()

    fireEvent.change(screen.getByRole('textbox', { name: /PIC name/ }), { target: { value: 'Kelvin Tan' } })
    await waitFor(() => expect(actions.fillMktMinutes).toHaveBeenCalledTimes(2), { timeout: 3000 })
    expect(actions.fillMktMinutes.mock.calls[1]).toEqual(['m1', 'p1', 4, { pic: 'Kelvin Tan' }])
  })

  it('makes the tracking link only once nothing is missing — and says what is', async () => {
    render(<ProductProject initial={page(RACHEL)} can={MANAGER} />)
    expect(screen.getByText('4/5')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Generate tracking link' })).toHaveProperty('disabled', true)
    expect(screen.getByRole('tooltip').textContent).toBe('Still missing• Objective is empty• Waiting for Siti to sign')
    expect(screen.getByText('2 left')).toBeTruthy()
  })

  it('sends the minutes: the link to copy and share on WhatsApp, waiting for the PIC', async () => {
    render(<ProductProject initial={page(RACHEL, {}, ready)} can={MANAGER} />)
    expect(screen.getByText('5/5')).toBeTruthy()
    actions.sendMktMinutes.mockResolvedValue({ ok: true, page: page(RACHEL, waiting, { ...ready, status: 'sent', rev: 4 }) })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Generate tracking link' }))
    })
    await waitFor(() => expect(actions.sendMktMinutes).toHaveBeenCalledWith('m1', 'p1', 3))
    expect(await screen.findByText('Tracking link ready · share it with Kelvin')).toBeTruthy()
    expect(screen.getByText(/\/t\/abc123$/)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Share via WhatsApp' }).getAttribute('href')).toMatch(/^https:\/\/wa\.me\/60123456789\?text=Hi%20Kelvin/)
    expect(screen.getByText('Waiting for PIC')).toBeTruthy()
    expect(screen.getByText('Sent 24 Oct 13:00')).toBeTruthy()
  })

  it('resends after the changes the PIC asked for, which it shows', async () => {
    const changes = { status: 'changes', link: 'abc123', picReply: { decision: 'changes', name: 'Kelvin', reason: 'Add Penang', at: '2026-10-25T07:12:00Z' } }
    render(<ProductProject initial={page(RACHEL, changes, ready)} can={MANAGER} />)
    expect(screen.getByText('Changes requested by Kelvin (PIC)')).toBeTruthy()
    expect(screen.getByText('“Add Penang”')).toBeTruthy()
    actions.resendMktProject.mockResolvedValue({ ok: true, page: page(RACHEL, waiting, ready) })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Resend to Kelvin' }))
    })
    await waitFor(() => expect(actions.resendMktProject).toHaveBeenCalledWith('p1'))
    expect(await screen.findByText('Resent to Kelvin')).toBeTruthy()
  })

  it('a second PIC: their fields when asked for, their WhatsApp before the link goes, then a link each (the user’s answer 29)', async () => {
    render(<ProductProject initial={page(RACHEL, {}, ready)} can={MANAGER} />)
    expect(screen.queryByRole('textbox', { name: /^Second PIC\W*$/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '+ Second PIC' }))
    fireEvent.change(screen.getByRole('textbox', { name: /^Second PIC\W*$/ }), { target: { value: 'Hana' } })
    await waitFor(() => expect(actions.fillMktMinutes).toHaveBeenCalledTimes(1), { timeout: 3000 })
    expect(actions.fillMktMinutes.mock.calls[0]).toEqual(['m1', 'p1', 3, { pic2: 'Hana' }])
    expect(await screen.findByText('5/6')).toBeTruthy()
    expect(screen.getByRole('tooltip').textContent).toBe('Still missing• Add the second PIC’s WhatsApp')

    fireEvent.change(screen.getByRole('textbox', { name: /^Second PIC WhatsApp/ }), { target: { value: '+60 13-222 1111' } })
    await waitFor(() => expect(actions.fillMktMinutes).toHaveBeenCalledTimes(2), { timeout: 3000 })
    expect(actions.fillMktMinutes.mock.calls[1]).toEqual(['m1', 'p1', 4, { whatsapp2: '+60 13-222 1111' }])
    expect(await screen.findByText('6/6')).toBeTruthy()

    actions.sendMktMinutes.mockResolvedValue({ ok: true,
      page: page(RACHEL, { ...waiting, pic2: 'Hana', whatsapp2: '+60 13-222 1111', link2: 'def456' }, { ...ready, status: 'sent', rev: 6 }) })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Generate tracking link' }))
    })
    expect(await screen.findByText('Tracking link ready · share it with Kelvin and Hana')).toBeTruthy()
    expect([screen.getByText(/\/t\/abc123$/), screen.getByText(/\/t\/def456$/)].every(Boolean)).toBe(true)
    const shares = screen.getAllByRole('link', { name: 'Share via WhatsApp' }).map(a => a.getAttribute('href') ?? '')
    expect(shares[0]).toMatch(/^https:\/\/wa\.me\/60123456789\?text=Hi%20Kelvin%2C.*abc123$/)
    expect(shares[1]).toMatch(/^https:\/\/wa\.me\/60132221111\?text=Hi%20Hana%2C.*def456$/)
  })

  it('starts before the PIC approves only with a reason, kept on the page', async () => {
    render(<ProductProject initial={page(RACHEL, waiting, ready)} can={MANAGER} />)
    fireEvent.click(screen.getByRole('button', { name: 'Start before approval…' }))
    const go = screen.getByRole('button', { name: 'Start anyway' })
    fireEvent.change(screen.getByRole('textbox', { name: 'Reason (required)' }), { target: { value: 'now' } })
    expect(go).toHaveProperty('disabled', true)
    fireEvent.change(screen.getByRole('textbox', { name: 'Reason (required)' }), { target: { value: 'Launch is Monday' } })
    actions.overrideMktProject.mockResolvedValue({ ok: true, page: page(RACHEL, { ...waiting, override: { by: 'Rachel', at: 'x', reason: 'Launch is Monday' } }, ready) })
    await act(async () => {
      fireEvent.click(go)
    })
    await waitFor(() => expect(actions.overrideMktProject).toHaveBeenCalledWith('p1', 'Launch is Monday'))
    expect(await screen.findByText('Override · started before PIC approval')).toBeTruthy()
    expect(screen.getByText('Rachel: “Launch is Monday”')).toBeTruthy()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('approved: Plan assignments starts the work — its deliverables listed, each to plan (②b-2a)', async () => {
    const approved = { status: 'approved', link: 'abc123', picReply: { decision: 'approved', name: 'Kelvin Tan', reason: '', at: '2026-10-25T08:05:00Z' } }
    render(<ProductProject initial={page(RACHEL, approved, ready)} can={MANAGER} />)
    expect(screen.getByText('Approved by Kelvin Tan via link · 25 Oct 16:05')).toBeTruthy()
    expect(screen.queryByRole('region', { name: 'Deliverables' })).toBeNull()
    const made = [
      { id: 'd1', trackId: 'MKT-CAR-2610-001-D01', title: 'Image post 1/2', status: 'planning', cur: 0, deliv: { group: 'Graphic design', item: 'Image post', n: 1, of: 2 },
        workflow: 'Image post · Standard', stages: 3, done: 0, stage: { idx: 0, name: 'Design', status: 'planned', owner: null } },
      { id: 'd2', trackId: 'MKT-CAR-2610-001-D02', title: 'Image post 2/2', status: 'active', cur: 1, deliv: { group: 'Graphic design', item: 'Image post', n: 2, of: 2 },
        workflow: 'Image post · Standard', startsOn: '2026-10-24', stages: 3, done: 1, stage: { idx: 1, name: 'Caption', status: 'accepted', owner: SITI, dueOn: '2026-10-28' } },
      { id: 'd3', trackId: 'MKT-CAR-2610-001-D03', title: 'Reel', status: 'done', cur: 1, deliv: { group: 'Video', item: 'Reel', n: 1, of: 1 },
        workflow: 'Reel · Locked', stages: 2, done: 2, stage: { idx: 1, name: 'Edit', status: 'done', owner: RACHEL } },
    ]
    actions.beginMktProduct.mockResolvedValue({ ok: true, deliverables: 3, page: page(RACHEL, { ...approved, status: 'active' }, ready, [], made) })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Plan assignments →' }))
    })
    await waitFor(() => expect(actions.beginMktProduct).toHaveBeenCalledWith('p1'))
    const list = await screen.findByRole('region', { name: 'Deliverables' })
    expect(list.textContent).toContain('1/3 done')
    expect(list.textContent).toContain('1 to plan')
    const rows = [...list.querySelectorAll('[class*="delRow"]')].map(r => r.textContent)
    expect(rows).toEqual([
      'D01Image post 1/2Image post · StandardNot plannedPlan',
      'D02Image post 2/2Image post · StandardStage 2 of 3 · Caption · SitiEdit plan',
      'D03ReelReel · LockedDone',
    ])
    expect(screen.getByRole('link', { name: 'Plan' }).getAttribute('href')).toBe('/marketing/projects/MKT-CAR-2610-001-D01?plan=1')
    expect(screen.getByText('Deliverables made · plan each one')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Plan assignments →' })).toBeNull()
  })

  it('the staff read the deliverables, and plan none', () => {
    const made = [{ id: 'd1', trackId: 'MKT-CAR-2610-001-D01', title: 'Reel', status: 'planning', stages: 2, done: 0, stage: null }]
    render(<ProductProject initial={page(SITI, { status: 'active' }, ready, [], made)} can={{ edit: true, manage: false }} />)
    expect(screen.getByRole('region', { name: 'Deliverables' }).textContent).toContain('Not planned')
    expect(screen.queryByRole('link', { name: 'Plan' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Plan assignments →' })).toBeNull()
  })

  it('a change the PIC sees after they approved goes back to them, and says so', async () => {
    const approved = { status: 'approved', link: 'abc123' }
    render(<ProductProject initial={page(RACHEL, approved, ready)} can={MANAGER} />)
    const back = page(RACHEL, waiting, ready, [{ at: '2026-10-25T09:00:00Z', actor: 'Rachel', action: 'edited after approval', reason: 'Objective' }])
    actions.fillMktMinutes.mockResolvedValue({ ok: true, rev: 4, reapproval: true, page: back })
    fireEvent.change(screen.getByRole('textbox', { name: 'Objective' }), { target: { value: 'Year-end walk-ins, Penang too' } })
    expect(await screen.findByText('Changed after approval · back to Kelvin', {}, { timeout: 3000 })).toBeTruthy()
    expect(screen.getByText('Edited after approval — needs PIC re-approval.')).toBeTruthy()
  })

  it('never over another’s save: it stops and asks for a reload', async () => {
    actions.fillMktMinutes.mockResolvedValue({ ok: false, reason: 'Siti changed these minutes since you opened them — reload to see them.' })
    render(<ProductProject initial={page(RACHEL)} can={MANAGER} />)
    fireEvent.change(screen.getByRole('textbox', { name: 'Objective' }), { target: { value: 'Walk-ins' } })
    expect(await screen.findByRole('alert', {}, { timeout: 3000 })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Reload' })).toBeTruthy()
    expect(screen.getByRole('textbox', { name: 'Objective' })).toHaveProperty('readOnly', true)
  })
})

describe('a product project, for an attendee', () => {
  it('reads the minutes and signs for themselves', async () => {
    render(<ProductProject initial={page(SITI)} can={{ edit: true, manage: false }} />)
    expect(screen.getByRole('textbox', { name: 'Objective' })).toHaveProperty('readOnly', true)
    expect(screen.queryByRole('button', { name: 'Generate tracking link' })).toBeNull()
    actions.signMktMinutes.mockResolvedValue({ ok: true, page: page(SITI, {}, { signed: { [RACHEL]: { at: 'x' }, [SITI]: { at: 'y' } } }) })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Sign' }))
    })
    await waitFor(() => expect(actions.signMktMinutes).toHaveBeenCalledWith('m1', 'p1'))
    expect(await screen.findAllByText('Signed')).toHaveLength(3)
    expect(actions.fillMktMinutes).not.toHaveBeenCalled()
  })
})
