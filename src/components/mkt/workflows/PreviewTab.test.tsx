import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import type { PreviewDraft } from '@/lib/marketing/task-flow-sample'
import PreviewTab from './PreviewTab'

// 2026-11-13 — the Builder's ▶ Preview: the task page drawn from the draft (nothing saved), seen as each person on it,
// the manager or the PIC; every decision played as the database plays it.

const people = [
  { id: 'r', first: 'Rachel', group: 'MARKETING MANAGER' },
  { id: 'a', first: 'Ali', group: 'EDITOR' },
  { id: 's', first: 'Siti', group: 'GRAPHIC' },
]
const draft: PreviewDraft = {
  category: 'Reels video', tname: 'Full production', version: 3, promise: 10,
  stages: [
    { sid: 'script', name: 'Script', who: { mode: 'assign', cands: [] }, sla: 2, appr: [], back: null, picText: 'Writing' },
    { sid: 'edit', name: 'Edit', who: { mode: 'assign', cands: [] }, sla: 2, appr: [{ ids: ['pic'], rule: 'any' }], back: null, picText: 'Ready for you' },
  ],
  canvas: { sections: [{ id: 'x', emoji: '🎯', title: 'Edit', stage: 'edit', fields: [{ id: 'f', label: 'Cut', type: 'Text', stage: 'edit', req: true, pic: true }] }] },
}

describe('the ▶ Preview', () => {
  it('draws the sample from the draft as whoever’s turn it is; the doer fills in and submits', () => {
    render(<PreviewTab draft={draft} people={people} />)
    expect(screen.getByText('Reels video · Full production v3')).toBeTruthy()
    expect(screen.getByRole('button', { name: /Siti/, pressed: true })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Submit Edit' }))
    expect(screen.getByRole('status').textContent).toBe('Fill 1 required field first: Cut')
    fireEvent.change(screen.getByRole('textbox', { name: 'Cut' }), { target: { value: 'v1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Submit Edit' }))
    expect(screen.getByTestId('tf-status').textContent).toBe('Waiting for approval')
  })
  it('as the PIC: the link view — Approve finishes it, the celebration plays', () => {
    render(<PreviewTab draft={draft} people={people} />)
    fireEvent.change(screen.getByRole('textbox', { name: 'Cut' }), { target: { value: 'v1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Submit Edit' }))
    fireEvent.click(screen.getByRole('button', { name: /PIC link/ }))
    const status = screen.getByTestId('pic-status')
    expect(within(status).getByText('Your approval is needed')).toBeTruthy()
    expect(screen.getByText('v1')).toBeTruthy()
    fireEvent.click(within(status).getByRole('button', { name: 'Approve' }))
    expect(screen.getByTestId('tf-celebration')).toBeTruthy()
    expect(screen.getByText('Your reels video is ready')).toBeTruthy()
  })
  it('as the manager: the manager’s banner; ⏩ +1 day turns the stage late; Reset starts again', () => {
    render(<PreviewTab draft={draft} people={people} />)
    fireEvent.click(screen.getByRole('button', { name: /MM/ }))
    expect(screen.getByText('You manage this task · now with Siti')).toBeTruthy()
    for (let i = 0; i < 5; i += 1) fireEvent.click(screen.getByRole('button', { name: '⏩ +1 day' }))
    expect(screen.getByTestId('tf-status').textContent).toMatch(/overdue/)
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }))
    expect(screen.getByTestId('tf-status').textContent).not.toMatch(/overdue/)
  })
  it('▶ acts as whoever’s turn it is', () => {
    render(<PreviewTab draft={{ ...draft, canvas: { sections: [] } }} people={people} />)
    fireEvent.click(screen.getByRole('button', { name: '▶ Act as whoever’s turn' }))
    expect(screen.getByTestId('tf-status').textContent).toBe('Waiting for approval')
    fireEvent.click(screen.getByRole('button', { name: '▶ Act as whoever’s turn' }))
    expect(within(screen.getByTestId('pic-status')).getByText('Your reels video is ready')).toBeTruthy()
  })
})
