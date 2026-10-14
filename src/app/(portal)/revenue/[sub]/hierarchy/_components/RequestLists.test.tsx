import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SubDeptRequest } from '@/lib/commission/sales-group-requests'
import { REPLACEMENT_BUILTIN_FIELDS, REPLACEMENT_FORM_NAME, type WaitingForm } from '@/lib/commission/waiting-form'

// Sales Groups' Replacement list (2026-10-10, the HR revamp): rows in the
// order the handoff draws them, a drawer of facts and history, and the way to
// Member services where they are decided. The Waiting list has its own file.
// Since round 2 (2026-10-11, README 18.5) the list has the waiting list's
// Upload form and Form settings too, for its own form.

const flash = vi.fn()
vi.mock('@/components/hrv/toast', () => ({ flash: (m: string) => flash(m) }))
const actions = vi.hoisted(() => ({
  uploadWaitingFormTemplate: vi.fn(),
  uploadReplacementFormTemplate: vi.fn(),
  saveWaitingForm: vi.fn(),
  saveReplacementForm: vi.fn(),
  waitingFormTemplateLink: vi.fn(),
  replacementFormTemplateLink: vi.fn(),
  viewFormTemplate: vi.fn(),
  removeFormTemplate: vi.fn(),
}))
vi.mock('../../../waiting-actions', () => actions)

import ReplacementList from './ReplacementList'

const req = (over: Partial<SubDeptRequest>): SubDeptRequest =>
  ({ id: 'r', requestNo: null, kind: 'waiting', status: 'waiting', createdAt: '2026-10-01T00:00:00Z', submittedAt: null, submittedBy: null,
    newPerson: null, contact: null, start: null, signature: null, original: null, destination: null, replacementSource: null,
    effective: null, reason: null, target: null, acceptedAt: null, events: [], ...over })

/** The handoff's v1 (mig 20261011130000): the five built-ins, then "Handover done?". */
const R1: WaitingForm = {
  version: 1,
  requireUpload: false,
  templatePath: null,
  templateName: REPLACEMENT_FORM_NAME,
  createdAt: null,
  fields: [...REPLACEMENT_BUILTIN_FIELDS, { id: 'q_handover', label: 'Handover done?', type: 'yesno', required: false }],
}
const FORM = { ok: true as const, form: R1 }

beforeEach(() => vi.clearAllMocks())
afterEach(cleanup)

describe('ReplacementList', () => {
  const rows = [
    req({ id: 'louis', kind: 'replacement', status: 'submitted', requestNo: 'RQ-2610-009', original: 'LOUIS', replacementSource: 'vacancy',
      destination: 'resignation', effective: '2026-10-31', submittedBy: 'KAR JUN', submittedAt: '2026-10-09T00:00:00Z', reason: 'Resigning at month end' }),
    req({ id: 'marcus', kind: 'replacement', status: 'executed', requestNo: 'RQ-2610-001', original: 'MARCUS', newPerson: 'Ryan Tan', replacementSource: 'new',
      destination: 'member_exit', effective: '2026-10-08', submittedBy: 'KAR JUN', submittedAt: '2026-10-01T00:00:00Z' }),
  ]

  it('lists every replacement with its arrangement and where it stands', () => {
    render(<ReplacementList rows={rows} subDeptName="Fair" form={FORM} subOptions={['Fair', 'IR']} />)
    const [first, second] = screen.getAllByRole('row').slice(1)
    expect(first).toHaveTextContent('MARCUS → Ryan Tan')
    expect(first).toHaveTextContent('Leave this department only')
    expect(first).toHaveTextContent('Completed')
    expect(second).toHaveTextContent('LOUIS → seat released')
    expect(second).toHaveTextContent('31 Oct 2026')
    expect(second).toHaveTextContent('Pending review')
  })

  it('opens the replacement’s facts, and Review in Member services', () => {
    render(<ReplacementList rows={rows} subDeptName="Fair" form={FORM} subOptions={['Fair', 'IR']} />)
    fireEvent.click(screen.getAllByRole('row')[2])
    const drawer = screen.getByRole('dialog')
    expect(drawer).toHaveTextContent('LOUIS → seat released')
    expect(drawer).toHaveTextContent('Release the position without a replacement')
    expect(drawer).toHaveTextContent('Resigning at month end')
    expect(within(drawer).getByRole('link', { name: 'Review' })).toHaveAttribute('href', '/member-admin?request=louis')
  })
})

describe('the Replacement list’s own form (round 2, README 18.5)', () => {
  const show = (form: { ok: true; form: WaitingForm } | { ok: false; reason: string } = FORM) =>
    render(<ReplacementList rows={[]} subDeptName="Fair" form={form} subOptions={['Fair', 'IR']} />)

  it('has the waiting list’s Upload form and Form settings above it', () => {
    show()
    expect(screen.getByText('Upload form').closest('label')).toHaveAttribute('title', 'Upload the replacement form Revenue members download')
    expect(screen.getByRole('button', { name: 'Form settings' })).toBeEnabled()
  })

  it('says why the tools wait when the form could not be read', () => {
    show({ ok: false, reason: 'The replacement form needs member request access.' })
    expect(screen.getByRole('button', { name: 'Form settings' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Form settings' })).toHaveAttribute('title', 'The replacement form needs member request access.')
  })

  it('uploads HR’s replacement form as its own', async () => {
    actions.uploadReplacementFormTemplate.mockResolvedValue({ ok: true, form: { ...R1, version: 2, templatePath: 'templates/x/Replacement.pdf', templateName: 'Replacement.pdf' } })
    show()
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Upload form'), { target: { files: [new File(['%PDF'], 'Replacement.pdf', { type: 'application/pdf' })] } })
    })
    expect(actions.uploadReplacementFormTemplate).toHaveBeenCalledTimes(1)
    expect(actions.uploadWaitingFormTemplate).not.toHaveBeenCalled()
    expect(screen.getByText('Form: Replacement.pdf')).toBeInTheDocument()
    expect(flash).toHaveBeenCalledWith('Replacement form uploaded — Revenue members now download Replacement.pdf')
  })

  it('opens Form settings on the five built-ins, locked, and HR’s own after them', () => {
    show()
    fireEvent.click(screen.getByRole('button', { name: 'Form settings' }))
    const drawer = screen.getByRole('dialog')
    expect(drawer).toHaveTextContent('Replacement list · v1')
    expect(drawer).toHaveTextContent('What the Revenue team fills in when they submit a replacement.')
    for (const label of ['Member leaving', 'Arrangement', 'Replaced by', 'Effective date', 'Reason']) {
      expect(within(drawer).getByRole('switch', { name: `${label} required` })).toBeDisabled()
      expect(within(drawer).queryByRole('button', { name: `Remove ${label}` })).toBeNull()
    }
    expect(drawer).toHaveTextContent('Options: Leave this department only · Leave the company · Transfer to another department')
    expect(within(drawer).getByRole('textbox', { name: 'Question 6' })).toHaveValue('Handover done?')
  })

  it('adds a question and saves the replacement form as the next version', async () => {
    actions.saveReplacementForm.mockImplementation(async (draft: { fields: WaitingForm['fields']; requireUpload: boolean }) => ({ ok: true, form: { ...R1, version: 2, ...draft } }))
    show()
    fireEvent.click(screen.getByRole('button', { name: 'Form settings' }))
    const drawer = screen.getByRole('dialog')
    fireEvent.click(within(drawer).getByRole('button', { name: '+ Add question' }))
    fireEvent.change(within(drawer).getByRole('textbox', { name: 'Question 7' }), { target: { value: 'Keys handed over?' } })
    fireEvent.click(within(drawer).getByRole('switch', { name: 'Keys handed over? required' }))
    fireEvent.click(within(drawer).getByRole('switch', { name: 'Members must upload the signed form with the request' }))
    await act(async () => {
      fireEvent.click(within(drawer).getByRole('button', { name: 'Save as v2' }))
    })
    expect(actions.saveWaitingForm).not.toHaveBeenCalled()
    const draft = actions.saveReplacementForm.mock.calls[0][0]
    expect(draft.requireUpload).toBe(true)
    expect(draft.fields.map((f: { id: string }) => f.id).slice(0, 6)).toEqual(['original', 'destination', 'source', 'effective', 'reason', 'q_handover'])
    expect(draft.fields[6]).toMatchObject({ label: 'Keys handed over?', type: 'text', required: true })
    expect(flash).toHaveBeenCalledWith('Replacement form saved as v2 — the Revenue app uses it from now on')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('downloads the black-and-white replacement form built from its questions', async () => {
    const created: Blob[] = []
    Object.defineProperty(URL, 'createObjectURL', { value: vi.fn((b: Blob) => (created.push(b), 'blob:form')), configurable: true })
    Object.defineProperty(URL, 'revokeObjectURL', { value: vi.fn(), configurable: true })
    show()
    fireEvent.click(screen.getByRole('button', { name: 'Form settings' }))
    await act(async () => {
      fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Download' }))
    })
    const html = await created[0].text()
    expect(html).toContain('HOUZS Venture · Replacement form')
    expect(html).toContain('Member leaving — signature')
    expect(html).toContain('&#9744; Leave the company')
    expect(html).toContain('Handover done?')
    expect(actions.replacementFormTemplateLink).not.toHaveBeenCalled()
  })

  // The uploaded form's right-click menu (2026-10-14): the same View and Remove, on its own form.
  it('right-click › View and Remove act on the replacement list’s own form', async () => {
    const PATH = 'templates/x/Replacement.pdf'
    actions.viewFormTemplate.mockResolvedValue({ ok: false, reason: 'The form could not be opened. Please try again.' })
    actions.removeFormTemplate.mockResolvedValue({ ok: true, form: { ...R1, version: 3 }, fileDeleted: true })
    show({ ok: true, form: { ...R1, version: 2, templatePath: PATH, templateName: 'Replacement.pdf' } })
    fireEvent.contextMenu(screen.getByText('Form: Replacement.pdf').closest('label')!)
    await act(async () => {
      fireEvent.click(screen.getByRole('menuitem', { name: 'View' }))
    })
    expect(actions.viewFormTemplate).toHaveBeenCalledExactlyOnceWith('replacement')
    const drawer = screen.getByRole('dialog', { name: 'Replacement.pdf' })
    expect(drawer).toHaveTextContent('Replacement list · Uploaded form')
    fireEvent.click(within(drawer).getByRole('button', { name: 'Close' }))
    fireEvent.contextMenu(screen.getByText('Form: Replacement.pdf').closest('label')!)
    fireEvent.click(screen.getByRole('menuitem', { name: 'Remove…' }))
    await act(async () => {
      fireEvent.click(within(screen.getByRole('dialog', { name: 'Remove Replacement.pdf' })).getByRole('button', { name: 'Remove' }))
    })
    expect(actions.removeFormTemplate).toHaveBeenCalledExactlyOnceWith('replacement', PATH)
    expect(screen.getByText('Upload form').closest('label')).toHaveAttribute('title', 'Upload the replacement form Revenue members download')
    expect(flash).toHaveBeenCalledWith('Replacement.pdf removed — members download the built form')
  })
})
