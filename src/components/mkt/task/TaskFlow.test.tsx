import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { fixtureTask, NOW, P } from '@/lib/marketing/task-flow-fixture'
import type { FlowTask } from '@/lib/marketing/task-flow-view'
import TaskFlow from './TaskFlow'

// 2026-11-13 — the task page's top (Workflow Builder 2a handoff › Task Flow.dc.html): the strip and its focus, the
// banner per viewer, validation at submit, tables, the handoff pick, reassign, the celebration.

function draw(task: FlowTask, me: string | null, isManager = false, extra: Partial<Parameters<typeof TaskFlow>[0]> = {}) {
  const h = {
    onValue: vi.fn(), onRows: vi.fn(), onAddCol: vi.fn(), onDropCol: vi.fn(), onSubmit: vi.fn(), onApprove: vi.fn(), onChanges: vi.fn(),
    onReassign: vi.fn(), onNudge: vi.fn(),
  }
  const r = render(
    <TaskFlow task={task} me={me} isManager={isManager} now={NOW} crumbs={<span>← My Space</span>}
      requirements={{ peek: 'Red Truck Roadshow', body: <span>The whole brief</span> }} {...h} {...extra} />,
  )
  return { ...r, h }
}
const strip = () => screen.getAllByRole('button', { name: /^Stage \d · / })

describe('the strip and the focus', () => {
  it('opens on the viewer’s own stage; a click focuses another — only its sections show', () => {
    draw(fixtureTask(), P.ali)
    expect(strip().map(b => b.getAttribute('aria-pressed'))).toEqual(['false', 'false', 'true', 'false', 'false'])
    expect(screen.getByTestId('tf-panel').textContent).toContain('Stage 3 of 5')
    expect(screen.getByLabelText('Edit')).toBeTruthy()
    fireEvent.click(strip()[3])
    expect(screen.getByText('Nothing to fill in at Thumbnail.')).toBeTruthy()
    fireEvent.click(strip()[0])
    expect(screen.getByLabelText('Script')).toBeTruthy()
    expect(screen.queryByLabelText('Edit')).toBeNull()
  })
  it('the focus goes back to the viewer’s own stage when the task moves on', () => {
    const { rerender, h } = draw(fixtureTask(), P.ali)
    fireEvent.click(strip()[0])
    const moved = fixtureTask({ at: { cur: 4, level: -1, ok: {}, done: false } })
    rerender(<TaskFlow task={moved} me={P.ali} isManager={false} now={NOW} crumbs={null} requirements={{ peek: '', body: null }} {...h} />)
    expect(screen.getByTestId('tf-panel').textContent).toContain('Stage 5 of 5')
  })
  it('Requirements: one line until opened', () => {
    draw(fixtureTask(), P.ali)
    expect(screen.queryByText('The whole brief')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Requirements/ }))
    expect(screen.getByText('The whole brief')).toBeTruthy()
  })
})

describe('the banner and its decisions', () => {
  it('the doer: missing fields stop the submit — a toast lists them, their inputs go red', () => {
    const { h } = draw(fixtureTask(), P.ali)
    expect(screen.getByText('Fill 2 required fields below, then submit.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Submit Edit' }))
    expect(screen.getByRole('status').textContent).toBe('Fill 2 required fields first: Shot list · Clip link, Draft video')
    expect(h.onSubmit).not.toHaveBeenCalled()
    expect(screen.getByRole('textbox', { name: 'Draft video' }).className).toMatch(/bad/)
    expect(screen.getByRole('textbox', { name: 'Clip link row 1' }).className).toMatch(/bad/)
    expect(screen.getByRole('textbox', { name: 'Edit notes' }).className).not.toMatch(/bad/)
  })
  it('filled: a 🔓 next stage asks the doer to pick from its shortlist, then submits with the pick', () => {
    const t = fixtureTask({ values: { 'f-draft': 'https://v' }, rows: { 'f-shots': [{ id: 'r', added: false, cells: { c2: 'https://c' } }] } })
    const { h } = draw(t, P.ali)
    fireEvent.click(screen.getByRole('button', { name: 'Submit Edit' }))
    const dialog = screen.getByRole('dialog', { name: 'Who does Thumbnail?' })
    expect(within(dialog).getAllByRole('button').map(b => b.textContent)).toEqual(['SSitiGRAPHIC4 active', 'HHafizGRAPHIC5 active'])
    expect(within(dialog).getByText('5 active').className).toMatch(/mLoadRed/)
    fireEvent.click(within(dialog).getByText('Hafiz'))
    expect(h.onSubmit).toHaveBeenCalledWith(P.hafiz)
  })
  it('the approver: Request changes / Approve', () => {
    const { h } = draw(fixtureTask({ at: { cur: 4, level: 0, ok: {}, done: false } }), P.rachel)
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }))
    fireEvent.click(screen.getByRole('button', { name: 'Request changes' }))
    expect([h.onApprove.mock.calls.length, h.onChanges.mock.calls.length]).toEqual([1, 1])
  })
  it('the manager: Nudge, and ⇄ Reassign current — the new person picked, the one now ticked', () => {
    const { h } = draw(fixtureTask(), P.rachel, true)
    fireEvent.click(screen.getByRole('button', { name: '🔔 Nudge' }))
    expect(h.onNudge).toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '⇄ Reassign current' }))
    const dialog = screen.getByRole('dialog', { name: 'Reassign Stage 3 · Edit' })
    expect(within(dialog).getByText('Now with Ali. The new person is notified; Ali is told it moved.')).toBeTruthy()
    // Why — optional, at most 300 (mkt_stage_reassign keeps it on the trail).
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Why (optional)' }), { target: { value: ' Ali is on leave ' } })
    expect(within(dialog).getByText('17/300')).toBeTruthy()
    fireEvent.click(within(dialog).getByText('Siti'))
    expect(h.onReassign).toHaveBeenCalledWith(2, P.siti, 'Ali is on leave')
  })
  it('no way to reassign: nothing offered', () => {
    draw(fixtureTask(), P.rachel, true, { onReassign: undefined })
    expect(screen.queryByRole('button', { name: /Reassign/ })).toBeNull()
  })
})

describe('fields and tables', () => {
  it('only the doer fills in, before submit — everybody else reads', () => {
    const { unmount, h } = draw(fixtureTask(), P.ali)
    fireEvent.change(screen.getByRole('textbox', { name: 'Edit notes' }), { target: { value: 'tighter' } })
    expect(h.onValue).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'f-notes' }), 'tighter', false)
    expect((screen.getByLabelText('Shoot date') as HTMLInputElement).type).toBe('date')
    unmount()
    draw(fixtureTask(), P.rachel)
    // Rachel's own stage is Final (her approval): Edit is a click away.
    fireEvent.click(strip()[2])
    expect(screen.queryByRole('textbox', { name: 'Edit notes' })).toBeNull()
    expect(screen.getAllByText('Filled at Edit').length).toBeGreaterThan(0)
  })
  it('a table: its columns’ stages, the doer’s tinted; + Add row, + Add column, × on what the doer added', () => {
    const t = fixtureTask()
    t.sections[1].fields[0].cols.push({ id: 'x1', name: 'Music', type: 'Text', stage: 2, req: false, pic: false, added: true })
    t.rows['f-shots'].push({ id: 'n1', added: true, cells: {} })
    const { h } = draw(t, P.ali)
    const table = screen.getByRole('table', { name: 'Shot list' })
    expect(within(table).getAllByRole('columnheader').map(c => c.textContent)).toEqual(['Scene *🎯 Script', 'Shot🎯 Shoot', 'Clip link *🎯 Edit', 'Music🎯 Edit×'])
    expect(within(table).getByRole('textbox', { name: 'Clip link row 1' }).closest('[role="cell"]')?.className).toMatch(/tdMine/)
    expect(within(table).getAllByRole('button', { name: /Remove row/ }).length).toBe(1)
    fireEvent.click(screen.getByRole('button', { name: '+ Add row' }))
    expect(h.onRows.mock.calls[0][1]).toHaveLength(4)
    fireEvent.click(screen.getByRole('button', { name: 'Remove column Music' }))
    expect(h.onDropCol).toHaveBeenCalledWith(expect.objectContaining({ id: 'f-shots' }), 'x1')
    fireEvent.click(screen.getByRole('button', { name: '+ Add column' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Column name' }), { target: { value: 'Voice' } })
    fireEvent.change(screen.getByRole('combobox', { name: 'Column type' }), { target: { value: 'Date' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    expect(h.onAddCol).toHaveBeenCalledWith(expect.objectContaining({ id: 'f-shots' }), 'Voice', 'Date')
    expect(screen.getByText('3 rows · you fill the highlighted columns')).toBeTruthy()
  })
})

describe('the right column and the celebration', () => {
  it('Next up and the latest three of the activity, then all', () => {
    draw(fixtureTask(), P.ali)
    expect(screen.getByTestId('tf-next').textContent).toContain('Ali picks who does Thumbnail')
    expect(screen.getAllByText(/submitted|approved|notified/).length).toBe(3)
    fireEvent.click(screen.getByRole('button', { name: 'Show all 4' }))
    expect(screen.getAllByText(/submitted|approved|notified/).length).toBe(4)
  })
  it('the last approval passed: the celebration with the team’s +60 XP — a click closes it; Replay on the done banner', () => {
    const done = fixtureTask({ at: { cur: 4, level: -1, ok: {}, done: true }, doneAt: '2026-11-13T02:00:00Z' })
    const { rerender, h } = draw(done, P.ali)
    expect(screen.queryByTestId('tf-celebration')).toBeNull()
    rerender(<TaskFlow task={done} me={P.ali} isManager={false} now={NOW} crumbs={null} requirements={{ peek: '', body: null }} celebrate={1} {...h} />)
    const c = screen.getByTestId('tf-celebration')
    expect(c.textContent).toContain('Shipped! 🎆')
    expect(c.textContent).toContain('Mei, Ah Kit, Ali each get +60 XP.')
    fireEvent.click(c)
    expect(screen.queryByTestId('tf-celebration')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Replay celebration' }))
    expect(screen.getByTestId('tf-celebration')).toBeTruthy()
  })
  it('a custom GIF from the bucket', () => {
    const done = fixtureTask({ at: { cur: 4, level: -1, ok: {}, done: true }, finish: { notify: ['all'], after: 'close', picText: '', celebration: 'custom', gifPath: 'workflow/x/y.gif' } })
    const { container } = draw(done, P.ali, false, { celebrate: 5, gif: '/files/marketing/workflow/x/y.gif' })
    expect(container.ownerDocument.querySelector('img')?.getAttribute('src')).toBe('/files/marketing/workflow/x/y.gif')
  })
})
