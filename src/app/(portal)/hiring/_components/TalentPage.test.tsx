import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HIRING_BOARD } from '@/test/hiring-board'

const actions = vi.hoisted(() => ({
  addHiringFileType: vi.fn(),
  addHiringFiles: vi.fn(),
  hiringFileLink: vi.fn(),
  inviteHiringTalent: vi.fn(),
  removeHiringFile: vi.fn(),
  removeHiringTalent: vi.fn(),
  replaceHiringFile: vi.fn(),
  saveTalentNotes: vi.fn(),
}))
const upload = vi.hoisted(() => ({ uploadHiringFile: vi.fn() }))
const { push, flash } = vi.hoisted(() => ({ push: vi.fn(), flash: vi.fn() }))
vi.mock('@/lib/hiring/actions', () => actions)
vi.mock('@/lib/hiring/upload', () => upload)
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))
vi.mock('@/components/hrv/toast', () => ({ flash }))

import TalentPage from './TalentPage'

const talent = (no: string) => HIRING_BOARD.talents.find(t => t.no === no)!
const pdf = (name: string) => new File(['%PDF'], name, { type: 'application/pdf' })
const pick = (input: HTMLElement, file: File) => fireEvent.change(input, { target: { files: [file] } })

beforeEach(() => {
  for (const fn of Object.values(actions)) fn.mockReset().mockResolvedValue({ ok: true })
  actions.addHiringFileType.mockResolvedValue({ ok: true, id: 'ft-licence' })
  upload.uploadHiringFile.mockReset().mockImplementation(async (f: File) => ({ ok: true, path: `files/u-${f.name}/${f.name}`, name: f.name }))
  push.mockReset()
  flash.mockReset()
})
afterEach(cleanup)

// A talent's own page (Revenue App.dc.html talVals' tv).
describe('Hiring › Talent Bank › a talent', () => {
  it('invites to the open request that fits, by default', async () => {
    render(<TalentPage board={HIRING_BOARD} talent={talent('T-102')} can={{ create: true, edit: true }} />)
    const select = screen.getByLabelText('Open request') as HTMLSelectElement
    expect([...select.options].map(o => o.text)).toEqual([
      'HR-205 · Senior Revenue Specialist · Revenue · IR', 'HR-204 · Account Executive · Finance', 'HR-203 · Revenue Specialist · Revenue · Fair',
    ])
    expect(select.value).toBe('HR-205')
    fireEvent.click(screen.getByRole('button', { name: 'Invite to interview' }))
    await waitFor(() => expect(actions.inviteHiringTalent).toHaveBeenCalledWith('T-102', 'HR-205'))
    expect(flash).toHaveBeenCalledWith('Marcus Wong invited to interview for HR-205')
  })

  it('saves HR notes on leaving the field', async () => {
    render(<TalentPage board={HIRING_BOARD} talent={talent('T-101')} can={{ create: true, edit: true }} />)
    const notes = screen.getByRole('textbox', { name: 'HR notes' })
    fireEvent.change(notes, { target: { value: 'Interviewed again: strong.' } })
    fireEvent.blur(notes)
    await waitFor(() => expect(actions.saveTalentNotes).toHaveBeenCalledWith('T-101', 'Interviewed again: strong.'))
    fireEvent.blur(notes)
    expect(actions.saveTalentNotes).toHaveBeenCalledTimes(1)
  })

  it('asks twice before removing, then goes back to the bank', async () => {
    render(<TalentPage board={HIRING_BOARD} talent={talent('T-103')} can={{ create: true, edit: true }} />)
    fireEvent.click(screen.getByRole('button', { name: 'Remove from Talent Bank' }))
    expect(actions.removeHiringTalent).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Confirm remove' }))
    await waitFor(() => expect(push).toHaveBeenCalledWith('/hiring/talent'))
    expect(actions.removeHiringTalent).toHaveBeenCalledWith('T-103')
    expect(flash).toHaveBeenCalledWith('Joyce Tan moved to the Bin')
  })

  it('reads its history, newest last', () => {
    render(<TalentPage board={HIRING_BOARD} talent={talent('T-104')} can={{ create: false, edit: false }} />)
    expect(screen.getByText('Good fit for Revenue Specialist · Revenue · saved 24 Sep 2026 by Grace Lim')).toBeInTheDocument()
    expect(screen.getByText('Interviewing · HR-203')).toBeInTheDocument()
    expect(screen.getByText('HR-203 · Revenue Specialist')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Invite to interview' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Remove from Talent Bank' })).toBeNull()
  })
})

// Their files (2026-10-11 — several, each with a file type; mig 20261011160000).
describe('Hiring › Talent Bank › a talent’s files', () => {
  const files = () => within(screen.getByRole('region', { name: 'Files' }))

  it('lists each file with its type; Open downloads it through a link made at the press', async () => {
    actions.hiringFileLink.mockResolvedValue({ ok: true, url: 'https://x/cv', name: 'Marcus_Wong_Resume.pdf', preview: 'pdf' })
    const assign = vi.fn()
    vi.stubGlobal('location', { ...window.location, assign })
    render(<TalentPage board={HIRING_BOARD} talent={talent('T-102')} can={{ create: true, edit: true }} />)
    expect(files().getByText('Marcus_Wong_Resume.pdf')).toBeInTheDocument()
    expect(files().getByText('Résumé')).toBeInTheDocument()
    fireEvent.click(files().getByRole('button', { name: 'Open' }))
    await waitFor(() => expect(actions.hiringFileLink).toHaveBeenCalledWith('file', 'f-T-102', true))
    expect(assign).toHaveBeenCalledWith('https://x/cv')
    vi.unstubAllGlobals()
  })

  it('Remove is asked twice and takes the file off — into the Talent Bank’s Bin', async () => {
    render(<TalentPage board={HIRING_BOARD} talent={talent('T-102')} can={{ create: true, edit: true }} />)
    fireEvent.click(files().getByRole('button', { name: 'Remove' }))
    expect(actions.removeHiringFile).not.toHaveBeenCalled()
    fireEvent.click(files().getByRole('button', { name: 'Confirm remove' }))
    await waitFor(() => expect(actions.removeHiringFile).toHaveBeenCalledWith('f-T-102'))
    expect(flash).toHaveBeenCalledWith('Marcus_Wong_Resume.pdf moved to the Bin')
  })

  it('says so when the bucket kept a removed file', async () => {
    actions.removeHiringFile.mockResolvedValue({ ok: true, warning: 'Saved, but the removed file is still in storage.' })
    render(<TalentPage board={HIRING_BOARD} talent={talent('T-102')} can={{ create: true, edit: true }} />)
    fireEvent.click(files().getByRole('button', { name: 'Remove' }))
    fireEvent.click(files().getByRole('button', { name: 'Confirm remove' }))
    await waitFor(() => expect(flash).toHaveBeenCalledWith('Saved, but the removed file is still in storage.'))
  })

  it('Replace puts a new upload in the file’s place', async () => {
    render(<TalentPage board={HIRING_BOARD} talent={talent('T-102')} can={{ create: true, edit: true }} />)
    pick(screen.getByLabelText('Replace Marcus_Wong_Resume.pdf'), pdf('Marcus_2026.pdf'))
    await waitFor(() => expect(actions.replaceHiringFile).toHaveBeenCalledWith('f-T-102', { path: 'files/u-Marcus_2026.pdf/Marcus_2026.pdf', name: 'Marcus_2026.pdf' }))
    expect(flash).toHaveBeenCalledWith('Résumé replaced')
  })

  it('+ Add file: the type first — not the Résumé when they have one — then the file, filed at once', async () => {
    render(<TalentPage board={HIRING_BOARD} talent={talent('T-102')} can={{ create: true, edit: true }} />)
    fireEvent.click(files().getByRole('button', { name: '+ Add file' }))
    const type = files().getByLabelText('What the file is') as HTMLSelectElement
    expect(type.value).toBe('')
    expect([...type.options].map(o => o.text)).toEqual(['Choose type…', 'Résumé', 'IC', 'Certificate', '+ Add a new file type…'])
    pick(files().getByLabelText('Choose the file'), pdf('ic.pdf'))
    expect(flash).toHaveBeenCalledWith('Pick what kind of file it is.')
    expect(upload.uploadHiringFile).not.toHaveBeenCalled()
    fireEvent.change(type, { target: { value: 'ft-ic' } })
    pick(files().getByLabelText('Choose the file'), pdf('ic.pdf'))
    await waitFor(() => expect(actions.addHiringFiles).toHaveBeenCalledWith('talent', 'T-102', [{ path: 'files/u-ic.pdf/ic.pdf', name: 'ic.pdf', typeId: 'ft-ic' }]))
    expect(flash).toHaveBeenCalledWith('ic.pdf added')
    expect(files().queryByLabelText('What the file is')).toBeNull()
  })

  it('a new file type is named first, then the file is filed under it', async () => {
    render(<TalentPage board={HIRING_BOARD} talent={talent('T-102')} can={{ create: true, edit: true }} />)
    fireEvent.click(files().getByRole('button', { name: '+ Add file' }))
    fireEvent.change(files().getByLabelText('What the file is'), { target: { value: '__new' } })
    pick(files().getByLabelText('Choose the file'), pdf('licence.pdf'))
    expect(flash).toHaveBeenCalledWith('Name the new file type.')
    fireEvent.change(files().getByLabelText('New file type'), { target: { value: 'Driving licence' } })
    pick(files().getByLabelText('Choose the file'), pdf('licence.pdf'))
    await waitFor(() => expect(actions.addHiringFiles).toHaveBeenCalledWith('talent', 'T-102', [{ path: 'files/u-licence.pdf/licence.pdf', name: 'licence.pdf', typeId: 'ft-licence' }]))
    expect(actions.addHiringFileType).toHaveBeenCalledWith('Driving licence')
  })

  it('Create adds files but neither replaces nor removes, nor names a type; View only opens', () => {
    const { unmount } = render(<TalentPage board={HIRING_BOARD} talent={talent('T-102')} can={{ create: true, edit: false }} />)
    expect(files().queryByRole('button', { name: 'Remove' })).toBeNull()
    expect(screen.queryByLabelText('Replace Marcus_Wong_Resume.pdf')).toBeNull()
    fireEvent.click(files().getByRole('button', { name: '+ Add file' }))
    expect([...(files().getByLabelText('What the file is') as HTMLSelectElement).options].map(o => o.text)).not.toContain('+ Add a new file type…')
    unmount()
    render(<TalentPage board={HIRING_BOARD} talent={talent('T-102')} can={{ create: false, edit: false }} />)
    expect(files().queryByRole('button', { name: '+ Add file' })).toBeNull()
    expect(files().getByRole('button', { name: 'Open' })).toBeInTheDocument()
  })

  it('a type turned off leaves the picker; named again, the database turns it back on (mig 20261011210000)', async () => {
    const withOff = { ...HIRING_BOARD, fileTypes: [...HIRING_BOARD.fileTypes, { id: 'ft-old', name: 'Old passport', builtin: null, active: false, used: 2 }] }
    render(<TalentPage board={withOff} talent={talent('T-102')} can={{ create: true, edit: true }} />)
    fireEvent.click(files().getByRole('button', { name: '+ Add file' }))
    const type = files().getByLabelText('What the file is') as HTMLSelectElement
    expect([...type.options].map(o => o.text)).not.toContain('Old passport')
    fireEvent.change(type, { target: { value: '__new' } })
    fireEvent.change(files().getByLabelText('New file type'), { target: { value: 'old passport' } })
    pick(files().getByLabelText('Choose the file'), pdf('passport.pdf'))
    await waitFor(() => expect(actions.addHiringFileType).toHaveBeenCalledWith('old passport'))
  })

  it('no file yet says so', () => {
    render(<TalentPage board={HIRING_BOARD} talent={{ ...talent('T-101'), files: [] }} can={{ create: true, edit: true }} />)
    expect(files().getByText('No files yet.')).toBeInTheDocument()
  })
})
