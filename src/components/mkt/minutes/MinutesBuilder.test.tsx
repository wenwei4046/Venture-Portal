import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { minutesFoldersFromRow, minutesTemplatesFromRow, type MinutesTemplate } from '@/lib/marketing/minutes'

// 2026-10-23 — the Minutes Builder (`Minutes Builder.dc.html`); 2026-11-12 — v2 (`docs/design_handoff_minutes_builder_v2/`)
// for the manager who builds the minutes templates: a change saved as it is made — only what changed, on the draft it was
// made on; a field's row opened in place (its name, a hint for staff, its kind — changeable); the project and the
// attendees kept; the type cards; a table's columns and starting rows kept aligned, what the staff may add; the rules
// in their own tab; the changes since the version published, Discard; Duplicate, folders and the right-click menu; the
// live preview beside it, picked both ways, which keeps nothing. The database's side is
// tests/member-sql/validate-marketing-minutes.mjs and validate-marketing-minutes-v2.mjs.

const actions = vi.hoisted(() => ({
  saveMktMinutes: vi.fn(),
  publishMktMinutes: vi.fn(),
  deleteMktMinutes: vi.fn(),
  duplicateMktMinutes: vi.fn(),
  discardMktMinutes: vi.fn(),
  moveMktMinutes: vi.fn(),
  saveMktMinutesFolder: vi.fn(),
  deleteMktMinutesFolder: vi.fn(),
}))
vi.mock('@/lib/marketing/actions', () => actions)
const router = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => router }))

import MinutesBuilder from './MinutesBuilder'

const FIELDS = [
  { id: 'p', name: 'Project (from Projects)', type: 'Project link', req: true, pic: true, lock: true },
  { id: 'd', name: 'Meeting date', type: 'Date', req: true, pic: true, lock: false },
  { id: 'a', name: 'Attendees', type: 'People', req: true, pic: true, lock: true },
  { id: 'o', name: 'Objective', type: 'Long text', req: true, pic: true, lock: false },
  { id: 's', name: 'Shot list', type: 'Table', req: false, pic: false, lock: false, cols: [{ name: 'Shot', type: 'Text' }], rows: [['Wide'], ['']] },
  { id: 'g', name: 'Signatures', type: 'Signature', req: true, pic: true, lock: false },
]
const RULES = { sign: true, pic: true, project: true, file: true, lock: true }
const KICKOFF = {
  id: 't1', name: 'Kickoff', rev: 3, version: 2, changed: false, folder: null, usedBy: ['Reels'], open: 4, openOnLive: 3,
  fields: FIELDS, rules: RULES, published: { name: 'Kickoff', fields: FIELDS, rules: RULES },
}
const list = (...rows: object[]): MinutesTemplate[] => minutesTemplatesFromRow({ templates: rows })

beforeEach(() => {
  for (const f of [...Object.values(actions), ...Object.values(router)]) f.mockReset()
  let rev = 3
  actions.saveMktMinutes.mockImplementation(async (id: string | null) => ({ ok: true, id: id ?? 't9', rev: id ? ++rev : 1, templates: null }))
  actions.moveMktMinutes.mockResolvedValue({ ok: true, moved: true })
})

const builder = (rows: object[] = [KICKOFF], folders: object[] = []) =>
  render(<MinutesBuilder initial={list(...rows)} folders={minutesFoldersFromRow({ folders })} first={null} attendees={['Rachel', 'Siti']} />)
const row = (name: string) => screen.getByRole('button', { name: new RegExp(`^${name} · `) })
const lastPatch = () => actions.saveMktMinutes.mock.calls.at(-1)?.[2]
const saved = async (n: number) => waitFor(() => expect(actions.saveMktMinutes).toHaveBeenCalledTimes(n), { timeout: 3000 })

describe('the Minutes Builder', () => {
  it('shows a published template as live, what uses it, its fields; the rules in their own tab', () => {
    builder()
    expect(screen.getByText('v2 · live')).toBeTruthy()
    expect(screen.getByText('Used by Reels · 4 open minutes')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Published ✓' })).toHaveProperty('disabled', true)
    expect(screen.getByText('6 fields · 5 required · 5 visible to PIC')).toBeTruthy()
    expect(screen.getByRole('tab', { name: /Completion rules\s*5 on/ })).toBeTruthy()
    fireEvent.click(screen.getByRole('tab', { name: /Completion rules/ }))
    for (const g of ['Before Complete', 'Linking', 'After Complete']) expect(screen.getByRole('region', { name: g })).toBeTruthy()
    expect(screen.getByRole('switch', { name: 'Every attendee signs' }).getAttribute('aria-checked')).toBe('true')
  })

  it('the project and the attendees stay: never optional, renamed, retyped or removed', () => {
    builder()
    fireEvent.click(screen.getByRole('button', { name: 'Attendees is required' }))
    expect(actions.saveMktMinutes).not.toHaveBeenCalled()
    fireEvent.click(row('Attendees'))
    expect(screen.getByRole('button', { name: 'Remove field' })).toHaveProperty('disabled', true)
    expect(screen.getByDisplayValue('Attendees')).toHaveProperty('readOnly', true)
    expect(screen.getByRole('radio', { name: /Short text/ })).toHaveProperty('disabled', true)
  })

  it('saves a change as it is made — only what changed, on the draft it was made on; the field’s id with it', async () => {
    builder()
    fireEvent.click(screen.getByRole('button', { name: 'The PIC sees Objective' }))
    await saved(1)
    const [id, rev, patch] = actions.saveMktMinutes.mock.calls[0]
    expect([id, rev, Object.keys(patch)]).toEqual(['t1', 3, ['fields']])
    expect(patch.fields[3]).toEqual({ id: 'o', name: 'Objective', type: 'Long text', req: true, pic: false, lock: false })
    expect(await screen.findByText('Draft v3')).toBeTruthy()
    expect(screen.getByText('1 change since v2 · 3 open minutes stay on v2')).toBeTruthy()

    fireEvent.click(screen.getByRole('tab', { name: /Completion rules/ }))
    fireEvent.click(screen.getByRole('switch', { name: 'Lock after complete' }))
    await saved(2)
    expect(actions.saveMktMinutes.mock.calls[1]).toEqual(['t1', 4, { rules: { sign: true, pic: true, picAll: false, project: true, file: true, lock: false } }])
    expect(screen.getByText('2 changes since v2 · 3 open minutes stay on v2')).toBeTruthy()
  })

  it('Both PICs sign off: beneath PIC signs off, only while it is on — turning that off takes it along (the user’s answer 29)', async () => {
    builder()
    fireEvent.click(screen.getByRole('tab', { name: /Completion rules/ }))
    fireEvent.click(screen.getByRole('switch', { name: 'Both PICs sign off' }))
    await saved(1)
    expect(lastPatch()).toEqual({ rules: { sign: true, pic: true, picAll: true, project: true, file: true, lock: true } })
    fireEvent.click(screen.getByRole('switch', { name: 'PIC signs off on the link' }))
    expect(screen.queryByRole('switch', { name: 'Both PICs sign off' })).toBeNull()
    await saved(2)
    expect(lastPatch()).toEqual({ rules: { sign: true, pic: false, picAll: false, project: true, file: true, lock: true } })
  })

  it('a change undone before its save goes sends nothing and says Saved', async () => {
    builder()
    fireEvent.click(screen.getByRole('button', { name: 'Objective is required' }))
    expect(screen.getByText('Saving…')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Objective is required' }))
    await waitFor(() => expect(screen.getByText('Saved')).toBeTruthy(), { timeout: 3000 })
    expect(actions.saveMktMinutes).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Published ✓' })).toBeTruthy()
  })

  it('a field opened in place: its hint for staff is saved and shown under its kind', async () => {
    builder()
    fireEvent.click(row('Objective'))
    fireEvent.change(screen.getByPlaceholderText('Shown under the field name'), { target: { value: 'What the campaign must achieve' } })
    await saved(1)
    expect(lastPatch().fields[3]).toMatchObject({ id: 'o', help: 'What the campaign must achieve' })
    expect(screen.getByText('Long text · What the campaign must achieve')).toBeTruthy()
    fireEvent.click(row('Objective')) // again: closed
    expect(screen.queryByPlaceholderText('Shown under the field name')).toBeNull()
  })

  it('a field’s kind changes after it was made; a kind kept once is not offered twice', async () => {
    builder()
    fireEvent.click(row('Meeting date'))
    expect(screen.getByRole('radio', { name: /Signature/ })).toHaveProperty('disabled', true)
    expect(screen.getByRole('radio', { name: /Project link/ })).toHaveProperty('disabled', true)
    fireEvent.click(screen.getByRole('radio', { name: /Short text/ }))
    await saved(1)
    expect(lastPatch().fields[1]).toEqual({ id: 'd', name: 'Meeting date', type: 'Short text', req: true, pic: true, lock: false })
    fireEvent.click(screen.getByRole('radio', { name: /Table$/ }))
    await saved(2)
    expect(lastPatch().fields[1]).toMatchObject({ type: 'Table', cols: [{ name: 'Item', type: 'Text' }, { name: 'Details', type: 'Text' }, { name: 'Owner', type: 'Person' }],
      rows: [['', '', ''], ['', '', '']], staffRows: true, staffCols: false })
  })

  it('adds a field from the type cards after the one picked; signatures stay last', async () => {
    builder()
    fireEvent.click(row('Objective'))
    fireEvent.click(screen.getByRole('button', { name: '+ Add field' }))
    expect(screen.getByText('Add a field after “Objective”')).toBeTruthy()
    expect(screen.getByRole('button', { name: /Each attendee signs/ })).toHaveProperty('disabled', true)
    fireEvent.click(screen.getByRole('button', { name: /Notes, objectives, decisions/ }))
    await saved(1)
    expect(lastPatch().fields.map((f: { name: string; type: string }) => f.type)).toEqual(['Project link', 'Date', 'People', 'Long text', 'Long text', 'Table', 'Signature'])
    expect(row('Untitled field').getAttribute('aria-expanded')).toBe('true') // the new field, open to be named
    expect(screen.getByText('Fix')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Publish v3' })).toHaveProperty('disabled', true)
  })

  it('a table’s starting rows stay aligned as columns are added, named, moved and removed; what the staff may add', async () => {
    builder()
    fireEvent.click(row('Shot list'))
    fireEvent.click(screen.getByRole('button', { name: 'Add column' }))
    await act(async () => { await new Promise(r => requestAnimationFrame(() => r(null))) })
    fireEvent.change(screen.getByRole('textbox', { name: "What's this column called?" }), { target: { value: 'Due date' } })
    fireEvent.click(screen.getByRole('button', { name: '← Move' }))
    await saved(1)
    expect(lastPatch().fields[4]).toMatchObject({ cols: [{ name: 'Due date', type: 'Date' }, { name: 'Shot', type: 'Text' }], rows: [['', 'Wide'], ['', '']] })
    fireEvent.click(screen.getByRole('button', { name: 'Remove column' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Row 2, Shot' }), { target: { value: 'Close-up' } })
    fireEvent.click(screen.getAllByRole('button', { name: '+ Add row' })[0])
    fireEvent.click(screen.getByRole('switch', { name: 'Staff can add rows' }))
    fireEvent.click(screen.getByRole('switch', { name: 'Staff can add columns' }))
    await saved(2)
    expect(lastPatch().fields[4]).toMatchObject({ cols: [{ name: 'Shot', type: 'Text' }], rows: [['Wide'], ['Close-up'], ['']], staffRows: false, staffCols: true })
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
    expect(screen.getByRole('button', { name: 'Published ✓' })).toBeTruthy()
  })

  it('Discard changes puts the draft back to the version published', async () => {
    builder()
    fireEvent.click(screen.getByRole('button', { name: 'The PIC sees Objective' }))
    await saved(1)
    actions.discardMktMinutes.mockResolvedValue({ ok: true, rev: 5, templates: list({ ...KICKOFF, rev: 5 }) })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Discard changes' }))
    })
    expect(actions.discardMktMinutes).toHaveBeenCalledWith('t1', 4)
    expect(await screen.findByText('Back to v2')).toBeTruthy()
    expect(screen.getByText('v2 · live')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'The PIC sees Objective' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.queryByRole('button', { name: 'Discard changes' })).toBeNull()
  })

  it('a new template: the project, the date, the attendees, the signatures — the type cards open', async () => {
    builder()
    const made = { id: 't9', name: 'New minutes', rev: 1, version: 0, changed: true, rules: { project: true, file: true, lock: true },
      fields: [{ id: 'p', name: 'Project (from Projects)', type: 'Project link', lock: true }, { id: 'a', name: 'Attendees', type: 'People', lock: true }] }
    actions.saveMktMinutes.mockResolvedValue({ ok: true, id: 't9', rev: 1, templates: list(KICKOFF, made) })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '+ New minutes template' }))
    })
    const [id, rev, patch] = actions.saveMktMinutes.mock.calls[0]
    expect([id, rev, patch.name, patch.fields.map((f: { type: string }) => f.type)]).toEqual([null, null, 'New minutes', ['Project link', 'Date', 'People', 'Signature']])
    expect(await screen.findByDisplayValue('New minutes')).toBeTruthy()
    expect(screen.getByText('Not used yet · publish to make it available')).toBeTruthy()
    expect(screen.getByText('Add a field before Signatures')).toBeTruthy()
    expect(router.replace).toHaveBeenCalledWith('/marketing/minutes?t=t9', { scroll: false })
  })

  it('deletes a template never published, asked first; a published one offers no delete (the user’s answer 8)', async () => {
    const draft = { ...KICKOFF, id: 't2', name: 'Brief call', rev: 1, version: 0, changed: true, published: null }
    actions.deleteMktMinutes.mockResolvedValue({ ok: true, templates: list(KICKOFF) })
    render(<MinutesBuilder initial={list(KICKOFF, draft)} first="t2" attendees={['Rachel']} />)
    expect(screen.getByText('Never published')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Delete draft' }))
    await act(async () => {
      fireEvent.click(within(screen.getByRole('group', { name: 'Delete this template?' })).getByRole('button', { name: 'Delete' }))
    })
    expect(actions.deleteMktMinutes).toHaveBeenCalledWith('t2', 1)
    expect(await screen.findByText('Deleted “Brief call”')).toBeTruthy()
    expect(screen.getByText('v2 · live')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Delete draft' })).toBeNull()
  })
})

describe('the rail', () => {
  const FOLDERS = [{ id: 'f1', name: 'Project minutes', parent: null }, { id: 'f2', name: 'Recurring', parent: 'f1' }]
  const SHOOT = { ...KICKOFF, id: 't2', name: 'Shoot briefing', folder: 'f2', version: 0, published: null, usedBy: [] }

  it('folders first, nested, counted; a status dot and tooltip per template; a search lists them flat', () => {
    builder([KICKOFF, SHOOT], FOLDERS)
    const rail = screen.getByRole('navigation', { name: 'Minutes templates' })
    expect(within(rail).getByText('Project minutes')).toBeTruthy()
    expect(within(rail).getByText('Shoot briefing').closest('[title]')?.getAttribute('title')).toBe('Draft · never published\n6 fields · right-click for more')
    expect(within(rail).getByText('Kickoff').closest('[title]')?.getAttribute('title')).toBe('v2 · live\n6 fields · right-click for more')
    fireEvent.click(within(rail).getByText('Project minutes'))
    expect(within(rail).queryByText('Shoot briefing')).toBeNull()
    fireEvent.change(within(rail).getByRole('textbox', { name: 'Search templates' }), { target: { value: 'shoot' } })
    expect(within(rail).getByText('Shoot briefing').closest('[title]')?.getAttribute('title')).toMatch(/^In Recurring\n/)
    fireEvent.change(within(rail).getByRole('textbox', { name: 'Search templates' }), { target: { value: 'zzz' } })
    expect(within(rail).getByText('No templates match')).toBeTruthy()
  })

  it('right-click a template: Duplicate makes a new draft and opens it', async () => {
    builder([KICKOFF, SHOOT], FOLDERS)
    const copy = { ...KICKOFF, id: 't3', name: 'Kickoff copy', version: 0, published: null, rev: 1 }
    actions.duplicateMktMinutes.mockResolvedValue({ ok: true, id: 't3', name: 'Kickoff copy', templates: list(KICKOFF, copy, SHOOT) })
    fireEvent.contextMenu(screen.getAllByText('Kickoff')[0])
    await act(async () => {
      fireEvent.click(screen.getByRole('menuitem', { name: 'Duplicate' }))
    })
    expect(actions.duplicateMktMinutes).toHaveBeenCalledWith('t1')
    expect(await screen.findByDisplayValue('Kickoff copy')).toBeTruthy()
    expect(screen.getByText('Duplicated · the copy is a new draft')).toBeTruthy()
  })

  it('right-click a template: moved to a folder; a published one cannot be deleted', async () => {
    builder([KICKOFF, SHOOT], FOLDERS)
    fireEvent.contextMenu(screen.getAllByText('Kickoff')[0])
    expect(screen.getByRole('menuitem', { name: 'Delete template' })).toHaveProperty('disabled', true)
    await act(async () => {
      fireEvent.click(screen.getByRole('menuitem', { name: 'Recurring' }))
    })
    expect(actions.moveMktMinutes).toHaveBeenCalledWith('t1', 'f2')
    expect(screen.getByText('Moved to Recurring')).toBeTruthy()
  })

  it('a draft is deleted from its menu only on a second click', async () => {
    actions.deleteMktMinutes.mockResolvedValue({ ok: true, templates: list(KICKOFF) })
    builder([KICKOFF, SHOOT], FOLDERS)
    fireEvent.contextMenu(screen.getByText('Shoot briefing'))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete draft' }))
    expect(actions.deleteMktMinutes).not.toHaveBeenCalled()
    await act(async () => {
      fireEvent.click(screen.getByRole('menuitem', { name: 'Click again to delete' }))
    })
    expect(actions.deleteMktMinutes).toHaveBeenCalledWith('t2', 3)
  })

  it('+ Folder makes "New folder" and opens it to be named; a folder deleted moves what was in it up', async () => {
    actions.saveMktMinutesFolder.mockImplementation(async (id: string | null, parent: string | null, name: string) => ({ ok: true, folder: { id: id ?? 'f9', name, parent, sort: 3 } }))
    builder([KICKOFF, SHOOT], FOLDERS)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '+ Folder' }))
    })
    const box = screen.getByRole('textbox', { name: 'Folder name' })
    fireEvent.change(box, { target: { value: 'Clients' } })
    await act(async () => {
      fireEvent.keyDown(box, { key: 'Enter' })
    })
    expect(actions.saveMktMinutesFolder).toHaveBeenLastCalledWith('f9', null, 'Clients')
    expect(screen.getByText('Clients')).toBeTruthy()

    actions.deleteMktMinutesFolder.mockResolvedValue({ ok: true, book: null })
    fireEvent.contextMenu(screen.getByText('Recurring'))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete folder' }))
    expect(screen.getByText('Templates inside move up a level')).toBeTruthy()
    await act(async () => {
      fireEvent.click(screen.getByRole('menuitem', { name: 'Click again to delete' }))
    })
    expect(actions.deleteMktMinutesFolder).toHaveBeenCalledWith('f2')
    expect(screen.queryByText('Recurring')).toBeNull()
    expect(screen.getByText('Shoot briefing')).toBeTruthy() // up into Project minutes
  })
})

describe('the live preview', () => {
  const preview = () => screen.getByRole('complementary', { name: 'Live preview' })

  it('picked both ways: a field clicked in the preview opens in the builder', () => {
    builder()
    fireEvent.click(within(preview()).getByText('Objective'))
    expect(row('Objective').getAttribute('aria-expanded')).toBe('true')
    expect(preview().querySelector('[data-field="o"]')?.className).toMatch(/pfOn/)
  })

  it('tries the template and keeps nothing: Complete waits for what is required and the signatures', () => {
    builder()
    const pv = within(preview())
    expect(pv.getByText('Can’t complete yet')).toBeTruthy()
    expect(pv.getByRole('button', { name: 'Complete' })).toHaveProperty('disabled', true)
    fireEvent.change(pv.getByRole('textbox', { name: 'Objective' }), { target: { value: 'Year-end walk-ins' } })
    fireEvent.change(pv.getByLabelText('Meeting date'), { target: { value: '2026-11-12' } })
    for (const n of ['Rachel', 'Siti']) fireEvent.click(pv.getByRole('button', { name: new RegExp(`${n}\\s*Click to sign`) }))
    expect(pv.getByText('Every attendee signs · 2 of 2 signed')).toBeTruthy()
    fireEvent.click(pv.getByRole('button', { name: 'PIC on the link' }))
    expect(pv.queryByText('Shot list')).toBeNull() // the PIC does not see it
    fireEvent.click(pv.getByRole('button', { name: 'Approve minutes' }))
    fireEvent.click(pv.getByRole('button', { name: 'Staff filling in' }))
    expect(pv.getByText('Ready to complete')).toBeTruthy()
    fireEvent.click(pv.getByRole('button', { name: 'Complete' }))
    expect(pv.getByRole('button', { name: /Locked · new version needed to edit/ })).toBeTruthy()
    expect(actions.saveMktMinutes).not.toHaveBeenCalled()
  })

  it('a table starts with its starting rows; rows and columns as the template lets the staff add them; the hint under the label', () => {
    const withTable = { ...KICKOFF, fields: FIELDS.map(f => (f.id === 's' ? { ...f, pic: true, help: 'One shot a line', staffRows: false, staffCols: true } : f)) }
    builder([withTable])
    const pv = within(preview())
    expect((pv.getByRole('textbox', { name: 'Shot list row 1, Shot' }) as HTMLInputElement).value).toBe('Wide')
    // 2026-11-12, the user: its rows numbered as the builder numbers them; no placeholder project title over the minutes.
    expect([...preview().querySelectorAll('[data-field="s"] tbody tr')].map(tr => tr.firstElementChild?.textContent)).toEqual(['1', '2'])
    expect(pv.queryByText('Subsidiary · Project')).toBeNull()
    expect(pv.getByText('One shot a line')).toBeTruthy()
    expect(pv.queryByRole('button', { name: '+ Add row' })).toBeNull()
    fireEvent.click(pv.getByRole('button', { name: '+ Column' }))
    expect(pv.getByRole('textbox', { name: 'Column 2 name' })).toBeTruthy()
  })

  // 2026-11-12 — the user: "在 field 加一个 Title, 放到这个位置": the Title field heads the minutes in the preview.
  it('a Title field heads the minutes: its name, faint, until something is typed in it', () => {
    builder([{ ...KICKOFF, fields: [{ id: 'ti', name: 'Meeting title', type: 'Title', pic: true }, ...FIELDS] }])
    const pv = within(preview())
    expect(pv.getByText('Meeting title', { selector: '[class*=sheetTitle]' }).className).toMatch(/sheetTitleEmpty/)
    fireEvent.change(pv.getByRole('textbox', { name: 'Meeting title' }), { target: { value: 'Year-end kickoff' } })
    expect(pv.getByText('Year-end kickoff', { selector: '[class*=sheetTitle]' }).className).not.toMatch(/sheetTitleEmpty/)
    expect(actions.saveMktMinutes).not.toHaveBeenCalled()
  })

  it('with no Title field, nothing heads the minutes', () => {
    builder()
    expect(preview().querySelector('[class*=sheetTitle]')).toBeNull()
  })
})
