import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FILE_TYPES, HIRING_BOARD, TALENT_REASONS } from '@/test/hiring-board'
import type { HiringBoard } from '@/lib/hiring/types'

const actions = vi.hoisted(() => ({
  addHiringFileType: vi.fn(),
  addHiringSource: vi.fn(),
  removeHiringSource: vi.fn(),
  renameHiringFileType: vi.fn(),
  saveHiringFormFields: vi.fn(),
  setHiringFileTypeActive: vi.fn(),
  setHiringSourceActive: vi.fn(),
  addTalentReason: vi.fn(),
  renameTalentReason: vi.fn(),
  setTalentReasonActive: vi.fn(),
}))
const { flash } = vi.hoisted(() => ({ flash: vi.fn() }))
vi.mock('@/lib/hiring/actions', () => actions)
vi.mock('@/components/hrv/toast', () => ({ flash }))

import FormSettings from './FormSettings'

// Form settings › File types (2026-10-11 — the user: "加改名和停用"; mig 20261011210000).
const board: HiringBoard = {
  ...HIRING_BOARD,
  fileTypes: [...FILE_TYPES.slice(0, 2), { id: 'ft-old', name: 'Old passport', builtin: null, active: false, used: 4 }],
}
const types = () => within(screen.getByRole('region', { name: 'File types' }))

beforeEach(() => {
  for (const fn of Object.values(actions)) fn.mockReset().mockResolvedValue({ ok: true, id: 'x' })
  flash.mockReset()
})
afterEach(cleanup)

describe('Hiring › Form settings › File types', () => {
  it('each type with its files; Résumé is built in — no ✎, no switch', () => {
    render(<FormSettings board={board} onPreview={() => undefined} />)
    expect(types().getByText('9 files')).toBeInTheDocument()
    expect(types().getByText('Built in')).toBeInTheDocument()
    expect(types().queryByRole('button', { name: 'Rename Résumé' })).toBeNull()
    expect(types().queryByRole('button', { name: /^Résumé:/ })).toBeNull()
    expect(types().getByRole('button', { name: 'IC: on' })).toHaveAttribute('aria-pressed', 'true')
    expect(types().getByRole('button', { name: 'Old passport: off' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('On / Off turns a type off, and back on', async () => {
    render(<FormSettings board={board} onPreview={() => undefined} />)
    fireEvent.click(types().getByRole('button', { name: 'IC: on' }))
    await waitFor(() => expect(actions.setHiringFileTypeActive).toHaveBeenCalledWith('ft-ic', false))
    fireEvent.click(types().getByRole('button', { name: 'Old passport: off' }))
    await waitFor(() => expect(actions.setHiringFileTypeActive).toHaveBeenCalledWith('ft-old', true))
  })

  it('✎ renames in place: Enter keeps it once, Esc lets it be', async () => {
    render(<FormSettings board={board} onPreview={() => undefined} />)
    fireEvent.click(types().getByRole('button', { name: 'Rename IC' }))
    const field = types().getByLabelText('New name for IC')
    expect(field).toHaveFocus()
    fireEvent.change(field, { target: { value: 'NRIC' } })
    fireEvent.keyDown(field, { key: 'Enter' })
    await waitFor(() => expect(actions.renameHiringFileType).toHaveBeenCalledWith('ft-ic', 'NRIC'))
    expect(actions.renameHiringFileType).toHaveBeenCalledTimes(1)
    fireEvent.click(types().getByRole('button', { name: 'Rename IC' }))
    fireEvent.change(types().getByLabelText('New name for IC'), { target: { value: 'Never' } })
    fireEvent.keyDown(types().getByLabelText('New name for IC'), { key: 'Escape' })
    expect(types().queryByLabelText('New name for IC')).toBeNull()
    expect(actions.renameHiringFileType).toHaveBeenCalledTimes(1)
  })

  it('says why a rename is refused', async () => {
    actions.renameHiringFileType.mockResolvedValue({ ok: false, reason: 'That type is already there.' })
    render(<FormSettings board={board} onPreview={() => undefined} />)
    fireEvent.click(types().getByRole('button', { name: 'Rename IC' }))
    fireEvent.change(types().getByLabelText('New name for IC'), { target: { value: 'Certificate' } })
    fireEvent.blur(types().getByLabelText('New name for IC'))
    await waitFor(() => expect(flash).toHaveBeenCalledWith('That type is already there.'))
  })

  it('+ Add type names one; a type that is on already is not added twice; one that was off comes back through the database', async () => {
    render(<FormSettings board={board} onPreview={() => undefined} />)
    const field = types().getByLabelText('New file type')
    fireEvent.change(field, { target: { value: ' ic ' } })
    fireEvent.click(types().getByRole('button', { name: '+ Add type' }))
    expect(flash).toHaveBeenCalledWith('That type is already there.')
    expect(actions.addHiringFileType).not.toHaveBeenCalled()
    fireEvent.change(field, { target: { value: 'old passport' } })
    fireEvent.keyDown(field, { key: 'Enter' })
    await waitFor(() => expect(actions.addHiringFileType).toHaveBeenCalledWith('old passport'))
    await waitFor(() => expect((types().getByLabelText('New file type') as HTMLInputElement).value).toBe(''))
  })
})

// Form settings › Talent Bank reasons (2026-10-24 — asked whether HR should manage them like File types, the user:
// "1, yes do with same"; mig 20261024235300).
describe('Hiring › Form settings › Talent Bank reasons', () => {
  const withOff: HiringBoard = {
    ...HIRING_BOARD,
    talentReasons: [...TALENT_REASONS, { id: 'r-moved', name: 'Moved away', active: false, used: 0 }],
  }
  const reasons = () => within(screen.getByRole('region', { name: 'Talent Bank reasons' }))

  it('each reason with the people kept with it — the five it began with renamed and turned off like any other', () => {
    render(<FormSettings board={withOff} onPreview={() => undefined} />)
    expect(reasons().getAllByText('1 person')).toHaveLength(3)
    expect(reasons().getAllByText('0 people')).toHaveLength(3)
    expect(reasons().queryByText('Built in')).toBeNull()
    expect(reasons().getByRole('button', { name: 'Rename Not shortlisted' })).toBeInTheDocument()
    expect(reasons().getByRole('button', { name: 'Not shortlisted: on' })).toHaveAttribute('aria-pressed', 'true')
    expect(reasons().getByRole('button', { name: 'Moved away: off' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('On / Off, ✎ and + Add reason ask the reasons’ own writes', async () => {
    render(<FormSettings board={withOff} onPreview={() => undefined} />)
    fireEvent.click(reasons().getByRole('button', { name: 'Other: on' }))
    await waitFor(() => expect(actions.setTalentReasonActive).toHaveBeenCalledWith('other', false))
    fireEvent.click(reasons().getByRole('button', { name: 'Rename Failed interview' }))
    fireEvent.change(reasons().getByLabelText('New name for Failed interview'), { target: { value: 'Interview failed' } })
    fireEvent.keyDown(reasons().getByLabelText('New name for Failed interview'), { key: 'Enter' })
    await waitFor(() => expect(actions.renameTalentReason).toHaveBeenCalledWith('failed_interview', 'Interview failed'))
    fireEvent.change(reasons().getByLabelText('New reason'), { target: { value: 'Salary too high' } })
    fireEvent.click(reasons().getByRole('button', { name: '+ Add reason' }))
    await waitFor(() => expect(actions.addTalentReason).toHaveBeenCalledWith('Salary too high'))
    expect(actions.addHiringFileType).not.toHaveBeenCalled()
    expect(actions.renameHiringFileType).not.toHaveBeenCalled()
  })

  it('a name it has on already is not added twice; one that was off comes back through the database', async () => {
    render(<FormSettings board={withOff} onPreview={() => undefined} />)
    fireEvent.change(reasons().getByLabelText('New reason'), { target: { value: ' not RIGHT now' } })
    fireEvent.click(reasons().getByRole('button', { name: '+ Add reason' }))
    expect(flash).toHaveBeenCalledWith('That reason is already there.')
    expect(actions.addTalentReason).not.toHaveBeenCalled()
    fireEvent.change(reasons().getByLabelText('New reason'), { target: { value: 'moved away' } })
    fireEvent.keyDown(reasons().getByLabelText('New reason'), { key: 'Enter' })
    await waitFor(() => expect(actions.addTalentReason).toHaveBeenCalledWith('moved away'))
  })

  it('says why the last one on cannot go off', async () => {
    actions.setTalentReasonActive.mockResolvedValue({ ok: false, reason: 'Keep at least one reason on.' })
    render(<FormSettings board={withOff} onPreview={() => undefined} />)
    fireEvent.click(reasons().getByRole('button', { name: 'Other: on' }))
    await waitFor(() => expect(flash).toHaveBeenCalledWith('Keep at least one reason on.'))
  })
})
