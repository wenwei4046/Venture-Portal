import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { taskFromRow, type MktTaskPage } from '@/lib/marketing/task'

// 2026-10-24 — ④-2c on the task page: its posts (the user's answer 15) — each Post day, where it stands, its link once
// posted; once the task is done its owner (the task's, the stage's) or the manager marks it posted with the link, or takes
// the mark back. Against the actions the page calls (the database's side: tests/member-sql/validate-marketing-task-dates.mjs).

const actions = vi.hoisted(() => ({ markMktPost: vi.fn(), unmarkMktPost: vi.fn() }))
vi.mock('@/lib/marketing/actions', () => actions)

import TaskPosts from './TaskPosts'

const MEI = 's-mei'
const ALI = 's-ali'
function page(me: string, status = 'done', posted: Record<string, unknown> = {}): MktTaskPage {
  return taskFromRow({
    today: '2026-11-08',
    me,
    team: [],
    sub: null,
    project: { id: 'p1', trackId: 'MKT-CAR-2611-001-D01', kind: 'deliverable', sub: 'sub', title: 'Image post 1/1', status, owner: MEI, cur: 0, free: [], posted },
    stages: [{ project: 'p1', idx: 0, name: 'Schedule', dept: 'SOCIAL MEDIA SPECIALIST', owner: ALI, sla: 2, appr: [], status: 'done',
      spec: { form: [{ label: 'Post day', type: 'Date', cal: { kind: 'post', pic: true } }, { label: 'Shoot day', type: 'Date', cal: { kind: 'shoot', pic: false } }] },
      work: { vals: { 'Post day': '2026-11-09', 'Shoot day': '2026-11-02' } } }],
    subtasks: [],
    events: [],
    series: null,
    holidays: [],
  }) as MktTaskPage
}
const STAFF = { edit: true, approve: false, manage: false }

let onPage: Mock<(next: MktTaskPage | null) => void>
let say: Mock<(text: string) => void>
beforeEach(() => {
  for (const f of Object.values(actions)) f.mockReset()
  onPage = vi.fn<(next: MktTaskPage | null) => void>()
  say = vi.fn<(text: string) => void>()
})

describe('a task’s posts', () => {
  it('none: nothing drawn', () => {
    const p = page(ALI)
    p.stages[0].work = { ...p.stages[0].work, vals: { 'Shoot day': '2026-11-02' } }
    const { container } = render(<TaskPosts page={p} can={STAFF} onPage={onPage} say={say} />)
    expect(container.textContent).toBe('')
  })

  it('its stage’s owner marks it posted, once done, with an https link — the page as it now stands', async () => {
    render(<TaskPosts page={page(ALI)} can={STAFF} onPage={onPage} say={say} />)
    const list = screen.getByLabelText('Posts')
    expect(within(list).getByText('Post day')).toBeTruthy()
    expect(within(list).getByText('9 Nov')).toBeTruthy()
    expect(within(list).getByText('Scheduled')).toBeTruthy()
    expect(within(list).queryByText('Shoot day')).toBeNull()
    fireEvent.click(within(list).getByRole('button', { name: 'Mark posted…' }))
    const input = within(list).getByRole('textbox', { name: 'Post day link' })
    fireEvent.change(input, { target: { value: 'instagram.com/p/abc' } })
    expect(within(list).getByRole('button', { name: 'Posted' })).toHaveProperty('disabled', true)
    fireEvent.change(input, { target: { value: 'https://instagram.com/p/abc' } })
    const after = page(ALI, 'done', { '0:Post day': { at: '2026-11-10T02:00:00Z', name: 'Ali', link: 'https://instagram.com/p/abc' } })
    actions.markMktPost.mockResolvedValue({ ok: true, page: after })
    await act(async () => {
      fireEvent.click(within(list).getByRole('button', { name: 'Posted' }))
    })
    expect(actions.markMktPost).toHaveBeenCalledWith('p1', 0, 'Post day', 'https://instagram.com/p/abc')
    expect(onPage).toHaveBeenCalledWith(after)
    expect(say).toHaveBeenCalledWith('Post day · posted')
  })

  it('posted: its link and who; its owner takes the mark back — a refusal says why', async () => {
    const posted = page(MEI, 'done', { '0:Post day': { at: '2026-11-10T02:00:00Z', name: 'Ali', link: 'https://www.instagram.com/p/abc' } })
    render(<TaskPosts page={posted} can={STAFF} onPage={onPage} say={say} />)
    const list = screen.getByLabelText('Posts')
    expect(within(list).getByText('Posted')).toBeTruthy()
    expect(within(list).getByRole('link', { name: 'instagram.com/p/abc ↗' }).getAttribute('href')).toBe('https://www.instagram.com/p/abc')
    expect(within(list).getByText(/· Ali/)).toBeTruthy()
    actions.unmarkMktPost.mockResolvedValue({ ok: false, reason: 'Only its owner marks the post.' })
    await act(async () => {
      fireEvent.click(within(list).getByRole('button', { name: 'Take back' }))
    })
    expect(actions.unmarkMktPost).toHaveBeenCalledWith('p1', 0, 'Post day')
    expect(say).toHaveBeenCalledWith('Only its owner marks the post.')
    expect(onPage).not.toHaveBeenCalled()
  })

  it('not done yet: In production, nothing to mark; somebody else: nothing to mark at all', () => {
    const { unmount } = render(<TaskPosts page={page(ALI, 'active')} can={STAFF} onPage={onPage} say={say} />)
    expect(screen.getByText('In production')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Mark posted…' })).toBeNull()
    unmount()
    render(<TaskPosts page={page('s-siti')} can={STAFF} onPage={onPage} say={say} />)
    expect(screen.queryByRole('button', { name: 'Mark posted…' })).toBeNull()
  })
})
