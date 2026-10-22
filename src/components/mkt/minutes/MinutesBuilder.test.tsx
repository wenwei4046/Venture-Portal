import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { minutesTemplatesFromRow, type MinutesTemplate } from '@/lib/marketing/minutes'

// 2026-10-23 — the Minutes Builder (`Minutes Builder.dc.html`, ③ of the handoff) for the manager who builds the minutes
// templates: a change is saved as it is made — only what changed, on the draft it was made on; the project and the
// attendees cannot go; a field added before the signatures; a table's columns; the rules; Publish; a new template; the
// Preview, which keeps nothing. The database's side is tests/member-sql/validate-marketing-minutes.mjs.

const actions = vi.hoisted(() => ({
  saveMktMinutes: vi.fn(),
  publishMktMinutes: vi.fn(),
}))
vi.mock('@/lib/marketing/actions', () => actions)

import MinutesBuilder from './MinutesBuilder'

const KICKOFF = {
  id: 't1', name: 'Kickoff', rev: 3, version: 2, changed: false,
  fields: [
    { name: 'Project (from Projects)', type: 'Project link', req: true, pic: true, lock: true },
    { name: 'Meeting date', type: 'Date', req: true, pic: true, lock: false },
    { name: 'Attendees', type: 'People', req: true, pic: true, lock: true },
    { name: 'Objective', type: 'Long text', req: true, pic: true, lock: false },
    { name: 'Shot list', type: 'Table', req: false, pic: false, lock: false, cols: [{ name: 'Shot', type: 'Text' }] },
    { name: 'Signatures', type: 'Signature', req: true, pic: true, lock: false },
  ],
  rules: { sign: true, pic: true, project: true, file: true, lock: true },
}
const list = (...rows: object[]): MinutesTemplate[] => minutesTemplatesFromRow({ templates: rows })

beforeEach(() => {
  for (const f of Object.values(actions)) f.mockReset()
  let rev = 3
  actions.saveMktMinutes.mockImplementation(async (id: string | null) => ({ ok: true, id: id ?? 't9', rev: id ? ++rev : 1, templates: null }))
  window.history.replaceState(null, '', '/marketing/minutes')
})

const builder = (rows: object[] = [KICKOFF]) => render(<MinutesBuilder initial={list(...rows)} first={null} attendees={['Rachel', 'Siti']} />)

describe('the Minutes Builder', () => {
  it('shows a published template as live, its fields and its rules', () => {
    builder()
    expect(screen.getByText('v2 · live')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Published ✓' })).toHaveProperty('disabled', true)
    expect(screen.getByText('6 fields · 5 required · 5 visible to PIC')).toBeTruthy()
    expect(screen.getByRole('switch', { name: 'Every attendee signs' }).getAttribute('aria-checked')).toBe('true')
  })

  it('the project and the attendees cannot go, nor stop being required', () => {
    builder()
    const removes = screen.getAllByRole('button', { name: 'Remove field' })
    expect(removes[0]).toHaveProperty('disabled', true)
    expect(removes[2]).toHaveProperty('disabled', true)
    expect(screen.getByRole('switch', { name: 'Attendees is required' })).toHaveProperty('disabled', true)
  })

  it('saves a change as it is made — only what changed, on the draft it was made on', async () => {
    builder()
    fireEvent.click(screen.getByRole('button', { name: 'The PIC sees Objective' }))
    await waitFor(() => expect(actions.saveMktMinutes).toHaveBeenCalledTimes(1), { timeout: 3000 })
    const [id, rev, patch] = actions.saveMktMinutes.mock.calls[0]
    expect([id, rev, Object.keys(patch)]).toEqual(['t1', 3, ['fields']])
    expect(patch.fields[3]).toEqual({ name: 'Objective', type: 'Long text', req: true, pic: false, lock: false })
    expect(await screen.findByText('Draft v3')).toBeTruthy()

    fireEvent.click(screen.getByRole('switch', { name: 'Lock after complete' }))
    await waitFor(() => expect(actions.saveMktMinutes).toHaveBeenCalledTimes(2), { timeout: 3000 })
    expect(actions.saveMktMinutes.mock.calls[1]).toEqual(['t1', 4, { rules: { sign: true, pic: true, project: true, file: true, lock: false } }])
  })

  it('adds a field before the signatures, and a table’s column by its settings', async () => {
    builder()
    fireEvent.change(screen.getByRole('textbox', { name: 'New field name' }), { target: { value: 'Decisions' } })
    fireEvent.click(screen.getByRole('button', { name: 'Long text' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add field' }))
    const names = screen.getAllByRole('textbox', { name: 'Field name' }).map(i => (i as HTMLInputElement).value)
    expect(names.slice(-2)).toEqual(['Decisions', 'Signatures'])

    fireEvent.click(screen.getByRole('button', { name: 'Add column' }))
    fireEvent.change(screen.getByRole('textbox', { name: "What's this column called?" }), { target: { value: 'Due date' } })
    await waitFor(() => expect(actions.saveMktMinutes).toHaveBeenCalled(), { timeout: 3000 })
    const patch = actions.saveMktMinutes.mock.calls.at(-1)?.[2]
    expect(patch.fields.find((f: { name: string }) => f.name === 'Shot list').cols).toEqual([{ name: 'Shot', type: 'Text' }, { name: 'Due date', type: 'Date' }])
    expect(patch.fields.map((f: { name: string }) => f.name).slice(-2)).toEqual(['Decisions', 'Signatures'])
  })

  it('publishes the draft as saved', async () => {
    builder()
    fireEvent.click(screen.getByRole('button', { name: 'The PIC sees Objective' }))
    actions.publishMktMinutes.mockResolvedValue({ ok: true, version: 3 })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Publish v3' }))
    })
    await waitFor(() => expect(actions.publishMktMinutes).toHaveBeenCalledWith('t1', 4))
    expect(await screen.findByText('Kickoff v3 published · new minutes use it from now')).toBeTruthy()
    expect(screen.getByText('v3 · live')).toBeTruthy()
  })

  it('a new template: the project, the date, the attendees, the signatures', async () => {
    builder()
    const made = { id: 't9', name: 'New minutes', rev: 1, version: 0, changed: true, rules: { project: true, file: true, lock: true },
      fields: [
        { name: 'Project (from Projects)', type: 'Project link', req: true, pic: true, lock: true },
        { name: 'Meeting date', type: 'Date', req: true, pic: true, lock: false },
        { name: 'Attendees', type: 'People', req: true, pic: true, lock: true },
        { name: 'Signatures', type: 'Signature', req: true, pic: true, lock: false },
      ] }
    actions.saveMktMinutes.mockResolvedValue({ ok: true, id: 't9', rev: 1, templates: list(KICKOFF, made) })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '+ New minutes template' }))
    })
    const [id, rev, patch] = actions.saveMktMinutes.mock.calls[0]
    expect([id, rev, patch.name, patch.fields.map((f: { type: string }) => f.type)]).toEqual([null, null, 'New minutes', ['Project link', 'Date', 'People', 'Signature']])
    expect(await screen.findByDisplayValue('New minutes')).toBeTruthy()
    expect(window.location.search).toBe('?t=t9')
  })

  it('the Preview tries the template and keeps nothing: Complete waits for what is required and the signatures', () => {
    builder()
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }))
    expect(screen.getByText('Draft · can’t complete yet')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Complete' })).toHaveProperty('disabled', true)
    fireEvent.change(screen.getByRole('textbox', { name: 'Objective' }), { target: { value: 'Year-end walk-ins' } })
    fireEvent.change(screen.getByLabelText('Meeting date'), { target: { value: '2026-11-12' } })
    for (const n of ['Rachel', 'Siti']) fireEvent.click(screen.getByRole('button', { name: new RegExp(`${n}\\s*Click to sign`) }))
    expect(screen.getByText('Every attendee signs · 2 of 2 signed')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'PIC on the link' }))
    expect(screen.queryByText('Shot list')).toBeNull() // the PIC does not see it
    fireEvent.click(screen.getByRole('button', { name: 'Approve minutes' }))
    fireEvent.click(screen.getByRole('button', { name: 'Staff filling in' }))
    expect(screen.getByText('Ready to complete')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Complete' }))
    expect(within(screen.getByRole('button', { name: /Locked/ })).getByText(/new version needed to edit/)).toBeTruthy()
    expect(actions.saveMktMinutes).not.toHaveBeenCalled()
  })
})
