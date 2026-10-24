import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { taskFromRow, type MktTaskPage } from '@/lib/marketing/task'

// 2026-10-23 — the task page (`New Task Page.dc.html`, PR ②a) for the people who work it: the stage's owner fills its
// fields in (each saved on its own — only what changed), hands it on once it is filled; the approver approves or sends
// it back with a reason. Marketing has no logins yet, so the page's two working sides are walked here against the
// actions it calls (lib/marketing/actions.ts; the database's side is tests/member-sql/validate-marketing-tasks.mjs).

const actions = vi.hoisted(() => ({
  acceptMktStage: vi.fn(),
  saveMktWork: vi.fn(),
  submitMktStage: vi.fn(),
  decideMktStage: vi.fn(),
  setMktSeries: vi.fn(),
  putMktFree: vi.fn(),
  saveMktStageFiles: vi.fn(),
  addMktOption: vi.fn(),
}))
vi.mock('@/lib/marketing/actions', () => actions)
const bucket = vi.hoisted(() => ({ upload: vi.fn(), remove: vi.fn() }))
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ storage: { from: () => bucket } }) }))
vi.mock('@/lib/storage/browser', () => ({ fileRoute: (b: string, p: string) => `/files/${b}/${p}` }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }))
const readProjectLog = vi.hoisted(() => vi.fn())
vi.mock('../audit/read', () => ({ readProjectLog }))

import TaskPage from './TaskPage'

const RACHEL = 's-rachel'
const SITI = 's-siti'
const team = [
  { id: RACHEL, user: 'u1', full: 'RACHEL TAN', first: 'Rachel', title: 'MARKETING MANAGER', team: 'manager', role: null, color: null, capacity: 5 },
  { id: SITI, user: 'u2', full: 'SITI AMINAH', first: 'Siti', title: 'GRAPHIC DESIGNER', team: 'design', role: null, color: null, capacity: 5 },
]
function page(me: string, redesign: Record<string, unknown>): MktTaskPage {
  return taskFromRow({
    today: '2026-10-26',
    me,
    team,
    sub: { id: 'sub', code: 'CAR', name: 'Carres', dot: 'x', emoji: '🛋️', client: false, pic: 'Kelvin' },
    project: { id: 'p1', trackId: 'TSK-CAR-2610-001', kind: 'quick', sub: 'sub', title: 'Price update', status: 'active', qType: 'social',
      brief: 'Change the price', owner: RACHEL, cur: 1, startsOn: '2026-10-23', dueOn: '2026-10-28', free: [] },
    stages: [
      { project: 'p1', idx: 0, name: 'First draft', dept: 'social', owner: RACHEL, sla: 1, appr: [], spec: { form: [] }, work: { notes: 'Done' },
        dueOn: '2026-10-26', status: 'done' },
      { project: 'p1', idx: 1, name: 'Redesign', dept: 'design', owner: SITI, sla: 1, appr: [{ kind: 'person', staff: RACHEL }],
        spec: { form: [{ label: 'Final artwork', type: 'File' }, { label: 'Logo checked', type: 'Checkbox' }], back: 0 }, work: {},
        dueOn: '2026-10-27', status: 'accepted', apprIdx: 0, ver: 0, ...redesign },
    ],
    subtasks: [],
    events: [],
    series: null,
    holidays: [],
  }) as MktTaskPage
}
const ALL = { edit: true, approve: true, manage: true }

beforeEach(() => {
  for (const f of [...Object.values(actions), bucket.upload, bucket.remove]) f.mockReset()
  actions.saveMktWork.mockResolvedValue({ ok: true, missing: [] })
  bucket.upload.mockResolvedValue({ data: { path: 'x' }, error: null })
  bucket.remove.mockResolvedValue({ data: [], error: null })
})

describe('a stage’s own files (②b-2e)', () => {
  const ART = (path: string) => ({ path, name: 'art.png', size: 2048, mime: 'image/png', field: 'Final artwork', by: 'Siti', at: '2026-10-25T03:00:00Z' })
  it('a File field takes a file: sent to the bucket under stage/ first, then saved with the work — and taken off', async () => {
    const { container } = render(<TaskPage initial={page(SITI, {})} can={ALL} />)
    const file = new File(['png'], 'art.png', { type: 'image/png' })
    actions.saveMktStageFiles.mockImplementation(async (_p: string, files: { path: string }[]) =>
      ({ ok: true, page: page(SITI, { work: { files: files.map(f => ART(f.path)) } }) }))
    await act(async () => {
      fireEvent.change(container.querySelector('input[aria-label="Upload files for Final artwork"]') as HTMLInputElement, { target: { files: [file] } })
    })
    await waitFor(() => expect(actions.saveMktStageFiles).toHaveBeenCalled())
    const [path, sent] = bucket.upload.mock.calls[0]
    expect([/^stage\/[0-9a-f-]{36}\/art\.png$/.test(path), sent]).toEqual([true, file])
    expect(actions.saveMktStageFiles).toHaveBeenCalledWith('p1', [{ path, name: 'art.png', field: 'Final artwork' }])
    expect(await screen.findByText('📎 art.png')).toBeTruthy()
    expect(screen.getByText('2 KB · Uploaded by Siti · 25 Oct')).toBeTruthy()
    expect(screen.getByText('Fill in Logo checked')).toBeTruthy()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Remove art.png' }))
    })
    await waitFor(() => expect(actions.saveMktStageFiles).toHaveBeenLastCalledWith('p1', []))
    expect(bucket.remove).not.toHaveBeenCalled()
  })

  it('refused: the file just sent is taken back, and the reason said', async () => {
    const { container } = render(<TaskPage initial={page(SITI, {})} can={ALL} />)
    actions.saveMktStageFiles.mockResolvedValue({ ok: false, reason: 'Accept the stage first — or it is with its approver now.' })
    await act(async () => {
      fireEvent.change(container.querySelector('input[aria-label="Upload files for Final artwork"]') as HTMLInputElement, { target: { files: [new File(['x'], 'a.png')] } })
    })
    expect(await screen.findByText('Accept the stage first — or it is with its approver now.')).toBeTruthy()
    expect(bucket.remove).toHaveBeenCalledWith([bucket.upload.mock.calls[0][0]])
  })

  it('read only: the files as cards, no drop zone, no ×', () => {
    render(<TaskPage initial={page(RACHEL, { status: 'review', ver: 1, work: { files: [ART('stage/k/art.png')] } })} can={ALL} />)
    expect((screen.getByText('📎 art.png').closest('a') as HTMLAnchorElement).getAttribute('href')).toBe('/files/marketing/stage/k/art.png')
    expect(screen.queryByText('Drop the file here')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Remove art.png' })).toBeNull()
  })
})

// 2026-10-25 — ③d-2: a choice (the user's answer 9) — a Select a dropdown of its own options, a Multi-select its shared
// list's to tick, a missing one added on the spot. The database's side is tests/member-sql/validate-marketing-option-lists.mjs.
describe('a choice on the stage’s work (③d-2)', () => {
  const FORM = { spec: { form: [{ label: 'Location', type: 'Multi-select', list: 'Locations' }, { label: 'Mood', type: 'Select', opts: ['Bright', 'Calm'] }] }, work: {} }
  const LISTS = { Locations: ['Showroom', 'LRT'] }
  const chip = (name: string) => screen.getByRole('button', { name })

  it('a Select picks from its own options; a Multi-select ticks its list’s — each saved on its own, in the list’s order', async () => {
    render(<TaskPage initial={page(SITI, FORM)} can={ALL} lists={LISTS} />)
    const mood = screen.getByRole('combobox', { name: 'Mood' }) as HTMLSelectElement
    expect([...mood.options].map(o => o.text)).toEqual(['Pick one…', 'Bright', 'Calm'])
    fireEvent.change(mood, { target: { value: 'Calm' } })
    await waitFor(() => expect(actions.saveMktWork).toHaveBeenCalledWith('p1', { vals: { Mood: 'Calm' } }))
    expect(screen.getByRole('group', { name: 'Location' }).textContent).toBe('ShowroomLRT+ Add an option…')
    fireEvent.click(chip('LRT'))
    await waitFor(() => expect(actions.saveMktWork).toHaveBeenLastCalledWith('p1', { vals: { Location: ['LRT'] } }))
    fireEvent.click(chip('Showroom'))
    await waitFor(() => expect(actions.saveMktWork).toHaveBeenLastCalledWith('p1', { vals: { Location: ['Showroom', 'LRT'] } }))
    expect([chip('Showroom').getAttribute('aria-pressed'), chip('LRT').getAttribute('aria-pressed')]).toEqual(['true', 'true'])
    fireEvent.click(chip('Showroom'))
    fireEvent.click(chip('LRT'))
    await waitFor(() => expect(actions.saveMktWork).toHaveBeenLastCalledWith('p1', { vals: { Location: null } }))
    expect(screen.getByText('Fill in Location')).toBeTruthy()
  })

  it('+ Add an option… puts a missing one on the list and picks it; one there in other letters is picked as spelt; a refusal is said', async () => {
    render(<TaskPage initial={page(SITI, FORM)} can={ALL} lists={LISTS} />)
    fireEvent.click(chip('+ Add an option…'))
    fireEvent.change(screen.getByRole('textbox', { name: 'New option for Location' }), { target: { value: '  Studio   A ' } })
    actions.addMktOption.mockResolvedValue({ ok: true, list: 'Locations', opts: ['Showroom', 'LRT', 'Studio A'], option: 'Studio A' })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    })
    expect(actions.addMktOption).toHaveBeenCalledWith('Locations', 'Studio A')
    await waitFor(() => expect(actions.saveMktWork).toHaveBeenLastCalledWith('p1', { vals: { Location: ['Studio A'] } }))
    expect(chip('Studio A').getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('status').textContent).toBe('Studio A · added to Locations')
    // There already in other letters: picked, nothing added.
    fireEvent.click(chip('+ Add an option…'))
    fireEvent.change(screen.getByRole('textbox', { name: 'New option for Location' }), { target: { value: 'lrt' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    })
    expect(actions.addMktOption).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(actions.saveMktWork).toHaveBeenLastCalledWith('p1', { vals: { Location: ['LRT', 'Studio A'] } }))
    // Refused: said, nothing picked.
    fireEvent.click(chip('+ Add an option…'))
    fireEvent.change(screen.getByRole('textbox', { name: 'New option for Location' }), { target: { value: 'Rooftop' } })
    actions.addMktOption.mockResolvedValue({ ok: false, reason: 'Adding an option is not open to your account.' })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    })
    expect(screen.getByRole('status').textContent).toBe('Adding an option is not open to your account.')
    expect(actions.saveMktWork).toHaveBeenCalledTimes(2)
  })

  it('a Select naming a list offers + Add an option… in its dropdown; an answer typed before stays offered', async () => {
    const form = { spec: { form: [{ label: 'Location', type: 'Select', list: 'Locations' }] }, work: { vals: { Location: 'Old studio' } } }
    render(<TaskPage initial={page(SITI, form)} can={ALL} lists={LISTS} />)
    const loc = screen.getByRole('combobox', { name: 'Location' }) as HTMLSelectElement
    expect([[...loc.options].map(o => o.text), loc.value]).toEqual([['Pick one…', 'Showroom', 'LRT', 'Old studio', '+ Add an option…'], 'Old studio'])
    fireEvent.change(loc, { target: { value: ' + add ' } })
    expect(screen.getByRole('textbox', { name: 'New option for Location' })).toBeTruthy()
    expect(actions.saveMktWork).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('textbox', { name: 'New option for Location' })).toBeNull()
  })

  it('read only: the answer in words', () => {
    render(<TaskPage initial={page(RACHEL, { ...FORM, status: 'review', ver: 1, work: { vals: { Location: ['Showroom', 'LRT'], Mood: 'Calm' } } })} can={ALL} lists={LISTS} />)
    expect([(screen.getByRole('textbox', { name: 'Location' }) as HTMLInputElement).value, (screen.getByRole('textbox', { name: 'Mood' }) as HTMLInputElement).value])
      .toEqual(['Showroom, LRT', 'Calm'])
    expect(screen.queryByRole('group', { name: 'Location' })).toBeNull()
  })
})

describe('the task page, for the people who work it', () => {
  it('the owner fills the fields in — each saved alone — and hands the stage on once they are', async () => {
    render(<TaskPage initial={page(SITI, {})} can={ALL} />)
    const submit = screen.getByRole('button', { name: 'Submit for approval' })
    expect(submit).toHaveProperty('disabled', true)
    expect(screen.getByText('Fill in Final artwork, Logo checked')).toBeTruthy()

    const link = screen.getByPlaceholderText('or a link — https://…')
    fireEvent.change(link, { target: { value: 'https://drive.google.com/a' } })
    fireEvent.blur(link)
    await waitFor(() => expect(actions.saveMktWork).toHaveBeenCalledWith('p1', { vals: { 'Final artwork': 'https://drive.google.com/a' } }))

    fireEvent.click(screen.getByRole('button', { name: 'Logo checked' }))
    await waitFor(() => expect(actions.saveMktWork).toHaveBeenLastCalledWith('p1', { vals: { 'Logo checked': true } }))
    expect(screen.getByText('Ready')).toBeTruthy()

    // Blurring again with nothing changed sends nothing.
    fireEvent.blur(link)
    expect(actions.saveMktWork).toHaveBeenCalledTimes(2)

    actions.submitMktStage.mockResolvedValue({ ok: true, page: page(SITI, { status: 'review', ver: 1, work: { vals: { 'Final artwork': 'https://drive.google.com/a', 'Logo checked': true } } }) })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Submit for approval' }))
    })
    await waitFor(() => expect(actions.submitMktStage).toHaveBeenCalledWith('p1'))
    expect(await screen.findByText('Submitted · sent to Rachel')).toBeTruthy()
    expect(screen.getAllByText('Waiting for Rachel').length).toBe(2) // the status and the note
    expect(screen.queryByRole('button', { name: 'Submit for approval' })).toBeNull()
  })

  it('the approver sends it back with a reason — to the stage the builder named', async () => {
    render(<TaskPage initial={page(RACHEL, { status: 'review', ver: 1 })} can={ALL} />)
    expect(screen.getByText('Siti submitted Redesign v1 for your approval')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Request changes' }))
    expect(screen.getByText('Redesign v1 · back to First draft (Rachel)')).toBeTruthy()
    const send = screen.getByRole('button', { name: 'Send back' })
    expect(send).toHaveProperty('disabled', true)
    fireEvent.change(screen.getByPlaceholderText('What should change? (required)'), { target: { value: 'Bigger logo' } })
    actions.decideMktStage.mockResolvedValue({ ok: true, page: page(RACHEL, { status: 'planned' }) })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Send back' }))
    })
    await waitFor(() => expect(actions.decideMktStage).toHaveBeenCalledWith('p1', false, 'Bigger logo'))
    expect(await screen.findByText('Sent back')).toBeTruthy()
  })

  it('a refusal is said in words, and the page stays as it was', async () => {
    render(<TaskPage initial={page(RACHEL, { status: 'review', ver: 1 })} can={ALL} />)
    actions.decideMktStage.mockResolvedValue({ ok: false, reason: 'This approval is not yours.' })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Approve' }))
    })
    expect(await screen.findByText('This approval is not yours.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Approve' })).toBeTruthy()
  })

  it('somebody else sees where it stands and does nothing', () => {
    render(<TaskPage initial={page('s-other', {})} can={{ edit: true, approve: false, manage: false }} />)
    expect(screen.queryByRole('button', { name: /Accept|Submit|Approve|Complete/ })).toBeNull()
    expect(screen.getByText('Now with Siti')).toBeTruthy()
    expect(screen.queryByText('+ Checklist')).toBeNull()
  })

  it('opens the formal log from the trail’s head (④-3), read for this task', async () => {
    readProjectLog.mockResolvedValueOnce({ track: 'TSK-CAR-2610-001', title: 'Price update', kind: 'quick', rows: [] })
    render(<TaskPage initial={page('s-other', {})} can={{ edit: false, approve: false, manage: false }} />)
    fireEvent.click(screen.getByRole('button', { name: 'Formal log' }))
    expect(screen.getByRole('dialog', { name: 'Audit trail' })).toBeTruthy()
    await waitFor(() => expect(screen.getByText('No records yet')).toBeTruthy())
    expect(readProjectLog).toHaveBeenCalledWith('p1')
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog', { name: 'Audit trail' })).toBeNull()
  })
})

describe('a deliverable on its task page (②b-2a)', () => {
  const deliverable = (status: string, extra: Record<string, unknown> = {}) => taskFromRow({
    today: '2026-10-26', me: RACHEL, team,
    sub: { id: 'sub', code: 'CAR', name: 'Carres', dot: 'x', emoji: '🛋️', client: false, pic: 'Kelvin' },
    project: { id: 'd1', trackId: 'MKT-CAR-2610-001-D02', kind: 'deliverable', sub: 'sub', title: 'Image post 2/2', status, cur: 0,
      parent: { id: 'p1', trackId: 'MKT-CAR-2610-001', title: 'Carres · Social Pack', status: 'active' },
      deliv: { group: 'Graphic design', item: 'Image post', n: 2, of: 2 }, locked: false, free: [], ...extra },
    stages: [{ project: 'd1', idx: 0, name: 'Design', dept: 'GRAPHIC DESIGNER', mode: 'assign', sla: 2, appr: [], spec: { form: [] }, work: {}, status: 'planned' }],
    events: [], holidays: [],
  }) as MktTaskPage

  it('names its product, says it is not planned, and offers the manager its plan', () => {
    render(<TaskPage initial={deliverable('planning')} can={{ edit: true, approve: true, manage: true }} />)
    expect(screen.getByRole('link', { name: '📦 Carres · Social Pack' }).getAttribute('href')).toBe('/marketing/projects/MKT-CAR-2610-001')
    expect(screen.getAllByText('Not planned yet').length).toBeGreaterThan(0)
    expect(screen.getByText('📦 Deliverable · 2 of 2')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Plan it →' }).getAttribute('href')).toBe('/marketing/projects/MKT-CAR-2610-001-D02?plan=1')
  })

  it('planned: the manager reopens its plan; the staff never see it', () => {
    const { unmount } = render(<TaskPage initial={deliverable('active', { startsOn: '2026-11-02' })} can={{ edit: true, approve: true, manage: true }} />)
    expect(screen.getByRole('link', { name: 'Assignment plan' })).toBeTruthy()
    unmount()
    render(<TaskPage initial={deliverable('planning')} can={{ edit: true, approve: false, manage: false }} />)
    expect(screen.queryByRole('link', { name: /Plan it|Assignment plan/ })).toBeNull()
  })
})
