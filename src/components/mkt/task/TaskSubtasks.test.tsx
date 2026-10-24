import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { taskFromRow, type MktTaskPage } from '@/lib/marketing/task'

// 2026-10-24 — ②b-2c on the task page (`Task Page.dc.html`): the stage's owner splits it (✂️ Split into subtasks — whom,
// by when, what), reviews a delivery (Return needs a reason; Approve) and takes one back; the assignee delivers — the
// files picked go to the bucket first, then the delivery; refused, the files just sent are taken back. Against the
// actions the page calls (the database's side: tests/member-sql/validate-marketing-subtasks.mjs).

const actions = vi.hoisted(() => ({
  addMktSubtask: vi.fn(),
  deliverMktSubtask: vi.fn(),
  reviewMktSubtask: vi.fn(),
  removeMktSubtask: vi.fn(),
}))
vi.mock('@/lib/marketing/actions', () => actions)
const bucket = vi.hoisted(() => ({ upload: vi.fn(), remove: vi.fn() }))
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ storage: { from: () => bucket } }) }))
vi.mock('@/lib/storage/browser', () => ({ fileRoute: (b: string, p: string) => `/files/${b}/${p}` }))

import TaskSubtasks from './TaskSubtasks'

const MEI = 's-mei'
const SITI = 's-siti'
const team = [
  { id: MEI, user: 'u1', full: 'MEI LING', first: 'Mei', title: 'VIDEOGRAPHER', team: null, role: null, color: null, capacity: 5 },
  { id: SITI, user: 'u2', full: 'SITI AMINAH', first: 'Siti', title: 'GRAPHIC DESIGNER', team: null, role: null, color: null, capacity: 5 },
]
const SRT = { path: 'subtask/aaa/subtitles.srt', name: 'subtitles.srt', size: 2048, mime: 'application/x-subrip' }
function page(me: string, subtasks: Record<string, unknown>[]): MktTaskPage {
  return taskFromRow({
    today: '2026-10-23',
    me,
    team,
    sub: { id: 'sub', code: 'CAR', name: 'Carres', dot: 'x', emoji: '🛋️', client: false, pic: 'Kelvin' },
    project: { id: 'p1', trackId: 'MKT-CAR-2610-007-D01', kind: 'deliverable', sub: 'sub', title: 'Red Truck Reels', status: 'active', owner: MEI, cur: 0,
      startsOn: '2026-10-21', dueOn: '2026-10-27', free: [] },
    stages: [{ project: 'p1', idx: 0, name: 'Edit', dept: 'VIDEOGRAPHER', owner: MEI, sla: 2, appr: [], split: true, spec: { form: [] }, work: {},
      dueOn: '2026-10-25', status: 'accepted' }],
    subtasks,
    events: [],
    series: null,
    holidays: [],
  }) as MktTaskPage
}
const STAFF = { edit: true, approve: false, manage: false }
const PEOPLE = [{ id: SITI, first: 'Siti', hint: 'GRAPHIC DESIGNER · 4 active', group: 'GRAPHIC DESIGNER' }]
const sub = (over: Record<string, unknown>) => ({ id: 't1', project: 'p1', stage: 0, title: 'Subtitles BM + EN', assignee: SITI, dueOn: '2026-10-24', status: 'working', returns: 0, ...over })

let onPage: Mock<(next: MktTaskPage | null) => void>
let say: Mock<(text: string) => void>
beforeEach(() => {
  for (const f of [...Object.values(actions), bucket.upload, bucket.remove]) f.mockReset()
  bucket.upload.mockResolvedValue({ data: { path: 'x' }, error: null })
  bucket.remove.mockResolvedValue({ data: [], error: null })
  onPage = vi.fn<(next: MktTaskPage | null) => void>()
  say = vi.fn<(text: string) => void>()
})

describe('a stage’s subtasks — its owner', () => {
  it('✂️ Split into subtasks: whom, a deadline on or before the stage’s, the deliverable', async () => {
    actions.addMktSubtask.mockResolvedValue({ ok: true, page: page(MEI, [sub({})]) })
    render(<TaskSubtasks part="list" page={page(MEI, [])} can={STAFF} people={PEOPLE} onPage={onPage} say={say} />)
    fireEvent.click(screen.getByRole('button', { name: '✂️ Split into subtasks' }))
    const dialog = screen.getByRole('dialog', { name: 'Split into subtasks' })
    expect(within(dialog).getByText('Edit · stage deadline 25 Oct')).toBeTruthy()
    const create = within(dialog).getByRole('button', { name: 'Create subtask' }) as HTMLButtonElement
    expect(create.disabled).toBe(true)
    fireEvent.click(within(dialog).getByRole('radio', { name: /Siti/ }))
    fireEvent.change(within(dialog).getByPlaceholderText('e.g. Price-tag motion graphics'), { target: { value: 'Subtitles BM + EN' } })
    fireEvent.change(dialog.querySelector('input[type="date"]') as HTMLInputElement, { target: { value: '2026-10-26' } })
    expect(within(dialog).getByText('Must be on or before 25 Oct — the Edit stage deadline.')).toBeTruthy()
    expect(create.disabled).toBe(true)
    fireEvent.change(dialog.querySelector('input[type="date"]') as HTMLInputElement, { target: { value: '2026-10-24' } })
    fireEvent.click(create)
    await waitFor(() => expect(actions.addMktSubtask).toHaveBeenCalledWith('p1', 'Subtitles BM + EN', SITI, '2026-10-24'))
    await waitFor(() => expect(onPage).toHaveBeenCalled())
    expect(say).toHaveBeenCalledWith('Subtask sent to Siti')
  })

  it('Review delivery: the files and links delivered; Return asks a reason, Approve does not', async () => {
    const ready = page(MEI, [sub({ status: 'ready', delivery: { v: 1, files: [SRT], links: [{ url: 'https://drive.google.com/x', label: 'Drive' }], note: 'BM + EN in one', at: '2026-10-23T03:00:00Z' } })])
    actions.reviewMktSubtask.mockResolvedValue({ ok: true, page: ready })
    render(<TaskSubtasks part="list" page={ready} can={STAFF} people={PEOPLE} onPage={onPage} say={say} />)
    fireEvent.click(screen.getByRole('button', { name: 'Review delivery' }))
    const dialog = screen.getByRole('dialog', { name: 'Review delivery' })
    expect(within(dialog).getByText('Subtitles BM + EN · from Siti · v1')).toBeTruthy()
    expect((within(dialog).getByText('subtitles.srt').closest('a') as HTMLAnchorElement).getAttribute('href')).toBe('/files/marketing/subtask/aaa/subtitles.srt')
    expect(within(dialog).getByText('2 KB · from Siti · 23 Oct')).toBeTruthy()
    expect(within(dialog).getByText('Drive')).toBeTruthy()
    expect(within(dialog).getByText('BM + EN in one')).toBeTruthy()
    const ret = within(dialog).getByRole('button', { name: 'Return' }) as HTMLButtonElement
    expect(ret.disabled).toBe(true)
    fireEvent.change(within(dialog).getByPlaceholderText('What needs to change?'), { target: { value: 'Fix the timing at 0:42' } })
    fireEvent.click(ret)
    await waitFor(() => expect(actions.reviewMktSubtask).toHaveBeenCalledWith('p1', 't1', false, 'Fix the timing at 0:42'))
    await waitFor(() => expect(say).toHaveBeenCalledWith('Returned to Siti'))
  })

  it('Take back asks first', async () => {
    actions.removeMktSubtask.mockResolvedValue({ ok: true, page: page(MEI, []) })
    render(<TaskSubtasks part="list" page={page(MEI, [sub({})])} can={STAFF} people={PEOPLE} onPage={onPage} say={say} />)
    fireEvent.click(screen.getByRole('button', { name: 'Take back' }))
    expect(screen.getByText('Take it back?')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Keep' }))
    expect(actions.removeMktSubtask).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Take back' }))
    fireEvent.click(screen.getAllByRole('button', { name: 'Take back' })[0])
    await waitFor(() => expect(actions.removeMktSubtask).toHaveBeenCalledWith('p1', 't1'))
  })

  it('the red line once a delivery has been returned three times', () => {
    render(<TaskSubtasks part="list" page={page(MEI, [sub({ status: 'revising', returns: 3 })])} can={STAFF} people={PEOPLE} onPage={onPage} say={say} />)
    expect(screen.getByRole('alert').textContent).toBe('Siti\'s delivery has been returned 3 times.')
    expect(screen.getByText('Returned 3 times')).toBeTruthy()
  })
})

describe('a stage’s subtasks — its assignee', () => {
  it('delivers: the files picked go to the bucket first, then the delivery with them, its links and note', async () => {
    actions.deliverMktSubtask.mockResolvedValue({ ok: true, page: page(SITI, [sub({ status: 'ready' })]) })
    const { container } = render(<TaskSubtasks part="deliver" page={page(SITI, [sub({})])} can={STAFF} onPage={onPage} say={say} />)
    const box = screen.getByRole('group', { name: 'Deliver Subtitles BM + EN' })
    const deliver = within(box).getByRole('button', { name: 'Deliver v1' }) as HTMLButtonElement
    expect(deliver.disabled).toBe(true)
    const file = new File(['1\n00:00:01,000 --> 00:00:02,000\nHai'], 'subtitles BM.srt', { type: 'application/x-subrip' })
    fireEvent.change(container.querySelector('input[type="file"]') as HTMLInputElement, { target: { files: [file] } })
    expect(within(box).getByText('subtitles BM.srt')).toBeTruthy()
    fireEvent.change(within(box).getByRole('textbox', { name: 'A link for Subtitles BM + EN' }), { target: { value: 'https://canva.com/d/1' } })
    fireEvent.click(within(box).getByRole('button', { name: '+ Add link' }))
    fireEvent.change(within(box).getByRole('textbox', { name: 'A note for Subtitles BM + EN' }), { target: { value: 'BM and EN' } })
    fireEvent.click(deliver)
    await waitFor(() => expect(actions.deliverMktSubtask).toHaveBeenCalled())
    const [path, sent] = bucket.upload.mock.calls[0]
    expect([/^subtask\/[0-9a-f-]{36}\/subtitles-BM\.srt$/.test(path), sent]).toEqual([true, file])
    expect(actions.deliverMktSubtask).toHaveBeenCalledWith('p1', 't1', 'BM and EN', [{ url: 'https://canva.com/d/1', label: '' }], [{ path, name: 'subtitles BM.srt' }])
    expect(bucket.remove).not.toHaveBeenCalled()
    await waitFor(() => expect(say).toHaveBeenCalledWith('Delivered · Mei reviews it next'))
  })

  it('…returned: the last version’s files kept unless taken off; refused — the files just sent are taken back', async () => {
    actions.deliverMktSubtask.mockResolvedValue({ ok: false, reason: 'Its stage is not open for deliveries now.' })
    const revising = page(SITI, [sub({ status: 'revising', returns: 1, delivery: { v: 1, files: [SRT], links: [], note: 'v1 note', at: null } })])
    const { container } = render(<TaskSubtasks part="deliver" page={revising} can={STAFF} onPage={onPage} say={say} />)
    const box = screen.getByRole('group', { name: 'Deliver Subtitles BM + EN' })
    expect((within(box).getByRole('textbox', { name: 'A note for Subtitles BM + EN' }) as HTMLTextAreaElement).value).toBe('v1 note')
    expect(within(box).getByText('subtitles.srt')).toBeTruthy()
    fireEvent.change(container.querySelector('input[type="file"]') as HTMLInputElement, { target: { files: [new File(['x'], 'v2.srt')] } })
    fireEvent.click(within(box).getByRole('button', { name: 'Deliver v2' }))
    await waitFor(() => expect(say).toHaveBeenCalledWith('Its stage is not open for deliveries now.'))
    const [path] = bucket.upload.mock.calls[0]
    expect(actions.deliverMktSubtask.mock.calls[0][4]).toEqual([{ path: SRT.path, name: 'subtitles.srt' }, { path, name: 'v2.srt' }])
    expect(bucket.remove).toHaveBeenCalledWith([path])
    expect(onPage).not.toHaveBeenCalled()
  })

  it('a file over 2 GB is refused before anything is sent', () => {
    const { container } = render(<TaskSubtasks part="deliver" page={page(SITI, [sub({})])} can={STAFF} onPage={onPage} say={say} />)
    const big = new File(['x'], 'raw.mov')
    Object.defineProperty(big, 'size', { value: 3 * 1024 ** 3 })
    fireEvent.change(container.querySelector('input[type="file"]') as HTMLInputElement, { target: { files: [big] } })
    expect(say).toHaveBeenCalledWith('raw.mov is over 2 GB — add it as a link.')
    expect(screen.queryByText('raw.mov')).toBeNull()
  })

  it('nothing to deliver for somebody else, or once it is delivered', () => {
    const { container } = render(<TaskSubtasks part="deliver" page={page(MEI, [sub({})])} can={STAFF} onPage={onPage} say={say} />)
    expect(container.textContent).toBe('')
    const ready = render(<TaskSubtasks part="deliver" page={page(SITI, [sub({ status: 'ready' })])} can={STAFF} onPage={onPage} say={say} />)
    expect(ready.container.textContent).toBe('')
  })
})
