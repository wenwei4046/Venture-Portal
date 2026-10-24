import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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
  setMktProjectAmount: vi.fn(),
  stopMktProduct: vi.fn(),
  setMktRunDay: vi.fn(),
  pauseMktProduct: vi.fn(),
}))
vi.mock('@/lib/marketing/actions', () => actions)
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }) }))
const readProjectLog = vi.hoisted(() => vi.fn())
vi.mock('../audit/read', () => ({ readProjectLog }))

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

  it('the template asks both PICs (②b-2d-2b): whose approval is in, and whom the minutes wait for', () => {
    const both = { ...ready, status: 'sent', template: { id: 't1', version: 1, name: 'Kickoff', fields: FIELDS,
      rules: { sign: true, pic: true, picAll: true, project: true, file: true, lock: true } } }
    const two = { ...waiting, pic2: 'Hana', whatsapp2: '+60 13-222 1111', link2: 'def456' }
    const { unmount } = render(<ProductProject initial={page(RACHEL, two, both)} can={MANAGER} />)
    expect(screen.queryByText(/approved · waiting for/)).toBeNull()
    unmount()
    render(<ProductProject initial={page(RACHEL, { ...two, picOk: { sent: 1, '2': { name: 'Hana Lee', at: '2026-10-24T06:00:00Z' } } }, both)} can={MANAGER} />)
    expect(screen.getByText('Hana Lee approved · waiting for Kelvin')).toBeTruthy()
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
    // A recurring product (②b-2f): its run day asked first — today's offered.
    fireEvent.click(screen.getByRole('button', { name: 'Plan assignments →' }))
    const ask = screen.getByRole('dialog', { name: 'Its monthly run' })
    expect(within(ask).getByText('Every month on the 24th')).toBeTruthy()
    fireEvent.change(within(ask).getByRole('combobox', { name: 'Run day' }), { target: { value: '5' } })
    expect(within(ask).getByText('Every month on the 5th')).toBeTruthy()
    await act(async () => {
      fireEvent.click(within(ask).getByRole('button', { name: 'Start the work' }))
    })
    await waitFor(() => expect(actions.beginMktProduct).toHaveBeenCalledWith('p1', 5))
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
    expect(screen.getByText('Deliverables made · every month on the 5th')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Plan assignments →' })).toBeNull()
  })

  it('a one-time product starts at once — no run day', async () => {
    const one = { status: 'approved', link: 'abc123', product: { id: 'pr', version: 1, name: 'Post pack', kind: 'one', note: '' } }
    render(<ProductProject initial={page(RACHEL, one, ready)} can={MANAGER} />)
    actions.beginMktProduct.mockResolvedValue({ ok: true, deliverables: 1, page: page(RACHEL, { ...one, status: 'active' }, ready) })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Plan assignments →' }))
    })
    expect(screen.queryByRole('dialog')).toBeNull()
    await waitFor(() => expect(actions.beginMktProduct).toHaveBeenCalledWith('p1'))
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

// 2026-10-24 — ②b-2b: the manager's Billing card (the user's answers 43, 44, 51) — the amount, when it is billed, the
// amount changed, a recurring project stopped. The database's side is tests/member-sql/validate-marketing-billing.mjs.
describe('a product project’s billing, the manager’s', () => {
  const running = { status: 'active', link: 'abc123', linkSentAt: '2026-10-24T05:00:00Z' }
  const billed = (p: ProductProjectPage, bill: Record<string, unknown>) => ({ ...p, bill: { amount: 3000, from: '2026-08-01', until: null, confirmed: 1, last: '2026-09-01', ...bill } } as ProductProjectPage)

  it('shows the amount and when it is billed; the amount changed is saved', async () => {
    render(<ProductProject initial={billed(page(RACHEL, running), {})} can={MANAGER} />)
    const card = screen.getByLabelText('Billing')
    expect(within(card).getByText('Monthly')).toBeTruthy()
    expect(within(card).getByText('RM 3,000.00')).toBeTruthy()
    expect(within(card).getByText('Monthly · from Aug 2026 · confirmed to Sep 2026')).toBeTruthy()
    expect(within(card).getByRole('link', { name: 'Billing →' }).getAttribute('href')).toBe('/marketing/billing?m=2026-09')
    fireEvent.click(within(card).getByRole('button', { name: 'Change amount' }))
    fireEvent.change(within(card).getByRole('textbox', { name: 'Amount' }), { target: { value: '3200' } })
    actions.setMktProjectAmount.mockResolvedValue({ ok: true, page: billed(page(RACHEL, running), { amount: 3200 }) })
    await act(async () => {
      fireEvent.click(within(card).getByRole('button', { name: 'Save' }))
    })
    expect(actions.setMktProjectAmount).toHaveBeenCalledWith('p1', 3200)
    await waitFor(() => expect(within(screen.getByLabelText('Billing')).getByText('RM 3,200.00')).toBeTruthy())
  })

  it('a recurring project stopped: asked first; this month its last billed', async () => {
    render(<ProductProject initial={billed(page(RACHEL, running), {})} can={MANAGER} />)
    fireEvent.click(within(screen.getByLabelText('Billing')).getByRole('button', { name: 'Stop…' }))
    const dialog = screen.getByRole('dialog', { name: /^Stop / })
    expect(within(dialog).getByText('Oct 2026 is its last month billed · work under way carries on')).toBeTruthy()
    actions.stopMktProduct.mockResolvedValue({ ok: true, page: billed(page(RACHEL, { ...running, status: 'done' }), { until: '2026-10-01' }) })
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Stop' }))
    })
    expect(actions.stopMktProduct).toHaveBeenCalledWith('p1')
    const card = await screen.findByLabelText('Billing')
    await waitFor(() => expect(within(card).getByText('Stopped · Aug 2026 – Oct 2026')).toBeTruthy())
    expect(within(card).queryByRole('button', { name: 'Stop…' })).toBeNull()
  })

  it('a one-time project’s amount stays once its billing is confirmed; nobody but the manager sees the card', () => {
    const one = page(RACHEL, { ...running, status: 'done', product: { id: 'pr', version: 1, name: 'Post pack', kind: 'one', note: '' } })
    const { unmount } = render(<ProductProject initial={billed(one, { amount: 500, from: null, last: '2026-10-01' })} can={MANAGER} />)
    const card = screen.getByLabelText('Billing')
    expect(within(card).getByText('Billed once done · confirmed for Oct 2026')).toBeTruthy()
    expect(within(card).queryByRole('button', { name: 'Change amount' })).toBeNull()
    expect(within(card).queryByRole('button', { name: 'Stop…' })).toBeNull()
    unmount()
    render(<ProductProject initial={one} can={{ edit: true, manage: false }} />)
    expect(screen.queryByLabelText('Billing')).toBeNull()
  })
})

// 2026-10-24 — ②b-2f: a recurring product's months (the user's answer 12) — its line, its day moved by the manager, its
// deliverables by month. The database's side is tests/member-sql/validate-marketing-product-runs.mjs.
describe('a recurring product project’s months', () => {
  const runs = { day: 5, first: '2026-09-01', made: 2, until: null }
  const d = (id: string, run: number, title: string) => ({ id, trackId: `MKT-CAR-2610-001-${id}`, title, status: 'planning', cur: 0, stages: 2, done: 0, stage: null,
    deliv: { group: 'Graphic design', item: 'Image post', n: 1, of: 1, run } })
  const made = [d('D01', 1, 'Image post 1/1'), d('D02', 2, 'Image post 1/1 · Oct 2026')]

  it('its line and its deliverables by month, the latest first; the manager moves its day', async () => {
    render(<ProductProject initial={page(RACHEL, { status: 'active', runs }, ready, [], made)} can={MANAGER} />)
    const line = screen.getByLabelText('Monthly run')
    expect(within(line).getByText('Every month on the 5th · next 5 Nov 2026')).toBeTruthy()
    const list = screen.getByRole('region', { name: 'Deliverables' })
    expect([...list.querySelectorAll('[class*="delMonthName"]')].map(n => n.textContent)).toEqual(['Oct 2026', 'Sep 2026'])
    expect(within(screen.getByLabelText('Oct 2026')).getByText('Image post 1/1 · Oct 2026')).toBeTruthy()
    fireEvent.click(within(line).getByRole('button', { name: 'Change day' }))
    fireEvent.change(within(line).getByRole('combobox', { name: 'Run day' }), { target: { value: '12' } })
    actions.setMktRunDay.mockResolvedValue({ ok: true, page: page(RACHEL, { status: 'active', runs: { ...runs, day: 12 } }, ready, [], made) })
    await act(async () => {
      fireEvent.click(within(line).getByRole('button', { name: 'Save' }))
    })
    expect(actions.setMktRunDay).toHaveBeenCalledWith('p1', 12)
    await waitFor(() => expect(screen.getByText('Every month on the 12th · next 12 Nov 2026')).toBeTruthy())
  })

  it('stopped: its last month named, its day no longer moved; the staff read it and move nothing', () => {
    const { unmount } = render(<ProductProject initial={page(RACHEL, { status: 'active', runs: { ...runs, made: 2, until: '2026-10-01' } }, ready, [], made)} can={MANAGER} />)
    expect(screen.getByText('Every month on the 5th · ended Oct 2026')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Change day' })).toBeNull()
    unmount()
    render(<ProductProject initial={page(SITI, { status: 'active', runs }, ready, [], made)} can={{ edit: true, manage: false }} />)
    expect(screen.getByText('Every month on the 5th · next 5 Nov 2026')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Change day' })).toBeNull()
  })

  // ②b-2g: paused — asked first, still billed (answer 51) — and resumed from this month.
  it('the manager pauses it, asked first; resumes it — this month’s work made at once', async () => {
    render(<ProductProject initial={page(RACHEL, { status: 'active', runs }, ready, [], made)} can={MANAGER} />)
    const line = screen.getByLabelText('Monthly run')
    fireEvent.click(within(line).getByRole('button', { name: 'Pause…' }))
    const dialog = screen.getByRole('dialog', { name: /^Pause / })
    expect(within(dialog).getByText('No month’s work is made while it is paused · work under way carries on · still billed every month')).toBeTruthy()
    actions.pauseMktProduct.mockResolvedValue({ ok: true, page: page(RACHEL, { status: 'paused', runs }, ready, [], made) })
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Pause' }))
    })
    expect(actions.pauseMktProduct).toHaveBeenCalledWith('p1', true)
    await waitFor(() => expect(within(screen.getByLabelText('Monthly run')).getByText('Paused · every month on the 5th')).toBeTruthy())
    expect(screen.getByRole('status').textContent).toBe('Paused · no month’s work until it is resumed')
    expect(screen.queryByRole('dialog')).toBeNull()
    // Paused: its day still moved; resumed in December, December's work made at once (November left out).
    expect(within(screen.getByLabelText('Monthly run')).getByRole('button', { name: 'Change day' })).toBeTruthy()
    const december = [...made, d('D03', 4, 'Image post 1/1 · Dec 2026')]
    actions.pauseMktProduct.mockResolvedValue({ ok: true, page: page(RACHEL, { status: 'active', runs: { ...runs, made: 4, next: 5 } }, ready, [], december) })
    await act(async () => {
      fireEvent.click(within(screen.getByLabelText('Monthly run')).getByRole('button', { name: 'Resume' }))
    })
    expect(actions.pauseMktProduct).toHaveBeenLastCalledWith('p1', false)
    await waitFor(() => expect(screen.getByText('Every month on the 5th · next 5 Jan 2027')).toBeTruthy())
    expect(screen.getByRole('status').textContent).toBe("Resumed · Dec 2026's work made")
    const list = screen.getByRole('region', { name: 'Deliverables' })
    expect([...list.querySelectorAll('[class*="delMonthName"]')].map(n => n.textContent)).toEqual(['Dec 2026', 'Oct 2026', 'Sep 2026'])
  })

  it('says which is under way: Pausing… in the question, Resuming… on the line — never the other', async () => {
    let answer!: (v: unknown) => void
    actions.pauseMktProduct.mockReturnValue(new Promise(r => { answer = r }))
    render(<ProductProject initial={page(RACHEL, { status: 'active', runs }, ready, [], made)} can={MANAGER} />)
    fireEvent.click(within(screen.getByLabelText('Monthly run')).getByRole('button', { name: 'Pause…' }))
    fireEvent.click(within(screen.getByRole('dialog', { name: /^Pause / })).getByRole('button', { name: 'Pause' }))
    expect(within(screen.getByRole('dialog', { name: /^Pause / })).getByRole('button', { name: 'Pausing…' })).toBeTruthy()
    await act(async () => answer({ ok: true, page: page(RACHEL, { status: 'paused', runs }, ready, [], made) }))
    const line = screen.getByLabelText('Monthly run')
    await waitFor(() => expect(within(line).getByRole('button', { name: 'Resume' })).toBeTruthy())
    expect(within(line).queryByRole('button', { name: 'Resuming…' })).toBeNull()
    actions.pauseMktProduct.mockReturnValue(new Promise(r => { answer = r }))
    fireEvent.click(within(line).getByRole('button', { name: 'Resume' }))
    expect(within(screen.getByLabelText('Monthly run')).getByRole('button', { name: 'Resuming…' })).toBeTruthy()
    await act(async () => answer({ ok: true, page: page(RACHEL, { status: 'active', runs }, ready, [], made) }))
    await waitFor(() => expect(within(screen.getByLabelText('Monthly run')).getByRole('button', { name: 'Pause…' })).toBeTruthy())
  })

  it('a refusal is said; no Pause once stopped, nor for the staff', async () => {
    const first = render(<ProductProject initial={page(RACHEL, { status: 'paused', runs }, ready, [], made)} can={MANAGER} />)
    actions.pauseMktProduct.mockResolvedValue({ ok: false, reason: 'It has stopped — no month is left to resume.' })
    await act(async () => {
      fireEvent.click(within(screen.getByLabelText('Monthly run')).getByRole('button', { name: 'Resume' }))
    })
    expect(screen.getByRole('status').textContent).toBe('It has stopped — no month is left to resume.')
    expect(screen.getByText('Paused · every month on the 5th')).toBeTruthy()
    first.unmount()
    const { unmount } = render(<ProductProject initial={page(RACHEL, { status: 'paused', runs: { ...runs, until: '2026-10-01' } }, ready, [], made)} can={MANAGER} />)
    expect(screen.getByText('Every month on the 5th · ended Oct 2026')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Resume' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Pause…' })).toBeNull()
    unmount()
    render(<ProductProject initial={page(SITI, { status: 'paused', runs }, ready, [], made)} can={{ edit: true, manage: false }} />)
    expect(screen.getByText('Paused · every month on the 5th')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Resume' })).toBeNull()
  })
})

// 2026-10-24 — ④-2b: a campaign (the user's answer 13) — its run in the header, its intake's *Campaign period* written.
describe('a campaign', () => {
  const PERIOD = { name: 'Campaign period', type: 'Campaign period', req: true, pic: true, lock: false }
  const withPeriod = (vals: Record<string, unknown>) => ({
    ...ready, vals: { ...ready.vals, ...vals },
    template: { id: 't1', version: 1, name: 'Kickoff', fields: [...FIELDS.slice(0, 4), PERIOD, ...FIELDS.slice(4)], rules: { sign: true, pic: true, project: true, file: true, lock: true } },
  })

  it('its run in the header: before it, then live', () => {
    const { unmount } = render(<ProductProject initial={page(RACHEL, { status: 'active', campaign: { from: '2026-11-09', until: '2026-11-12' } }, ready)} can={MANAGER} />)
    expect(screen.getByLabelText('Campaign').textContent).toBe('📢 Runs 9 – 12 Nov 2026 · in 16 days')
    unmount()
    render(<ProductProject initial={page(RACHEL, { status: 'active', campaign: { from: '2026-10-20', until: '2026-10-30' } }, ready)} can={MANAGER} />)
    expect(screen.getByLabelText('Campaign').textContent).toBe('📢 Live · 20 – 30 Oct 2026 · ends 30 Oct')
  })

  it('no run, no line', () => {
    render(<ProductProject initial={page(RACHEL, { status: 'active' }, ready)} can={MANAGER} />)
    expect(screen.queryByLabelText('Campaign')).toBeNull()
  })

  it('the intake’s Campaign period: its two days, the last not before the first — only what changed saved', async () => {
    render(<ProductProject initial={page(RACHEL, {}, withPeriod({ 'Campaign period': { from: '2026-11-09', to: null } }))} can={MANAGER} />)
    const from = screen.getByLabelText('Campaign period from') as HTMLInputElement
    const to = screen.getByLabelText('Campaign period to') as HTMLInputElement
    expect([from.value, to.value, to.getAttribute('min')]).toEqual(['2026-11-09', '', '2026-11-09'])
    expect(screen.getByText(/Campaign period is empty/)).toBeTruthy()
    expect(screen.queryByLabelText('Campaign')).toBeNull()
    fireEvent.change(to, { target: { value: '2026-11-12' } })
    // The header follows it as typed.
    expect(screen.getByLabelText('Campaign').textContent).toBe('📢 Runs 9 – 12 Nov 2026 · in 16 days')
    await waitFor(() => expect(actions.fillMktMinutes).toHaveBeenCalledTimes(1), { timeout: 3000 })
    expect(actions.fillMktMinutes.mock.calls[0]).toEqual(['m1', 'p1', 3, { vals: { 'Campaign period': { from: '2026-11-09', to: '2026-11-12' } } }])
    expect(screen.queryByText(/Campaign period is empty/)).toBeNull()
  })
})

// 2026-10-25 — ④-4c (the user's answer 23): a product project opened from inside another, and one opened from it.
describe('opened from another project', () => {
  it('says which, a link to it — and offers Marketing · Create to open a project from this one', () => {
    const SRC = { id: 'p0', trackId: 'TSK-CAR-2610-004', title: 'Banner for the fair', kind: 'quick', status: 'done', owner: 'Mei' }
    const { unmount } = render(<ProductProject initial={page(RACHEL, { source: SRC })} can={{ ...MANAGER, create: true }} />)
    const from = screen.getByRole('link', { name: '↳ Opened from TSK-CAR-2610-004' })
    expect([from.getAttribute('href'), from.getAttribute('title')]).toEqual(['/marketing/projects/TSK-CAR-2610-004', 'Banner for the fair'])
    expect(screen.getByRole('link', { name: '+ Open a project from here' }).getAttribute('href')).toBe('/marketing/new?from=MKT-CAR-2610-001')
    unmount()
    render(<ProductProject initial={page(RACHEL)} can={MANAGER} />)
    expect(screen.queryByRole('link', { name: /Opened from/ })).toBeNull()
    expect(screen.queryByRole('link', { name: '+ Open a project from here' })).toBeNull()
  })
})

// 2026-10-25 — ④-4d (the user's answers 22, 23): the product project's Map — its intake on the map — beside its Formal log.
describe('its map', () => {
  it('Map opens the sheet on the intake: Created, the minutes being written, the PIC and the work ahead', async () => {
    readProjectLog.mockResolvedValue(null)
    render(<ProductProject initial={page(RACHEL)} can={MANAGER} />)
    fireEvent.click(screen.getByRole('button', { name: 'Map' }))
    const sheet = screen.getByRole('dialog', { name: 'Task map' })
    await waitFor(() => expect(readProjectLog).toHaveBeenCalledWith('p1'))
    // The log could not be read: drawn from the page's own trail.
    expect(await within(sheet).findByText('Now at Meeting minutes · Kickoff')).toBeTruthy()
    expect(within(sheet).getByRole('button', { name: 'Kelvin approves the minutes · Planned' })).toBeTruthy()
    fireEvent.click(within(sheet).getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog', { name: 'Task map' })).toBeNull()
  })
})
