import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SubDeptRequest } from '@/lib/commission/sales-group-requests'
import { BUILT_FORM_NAME, type WaitingForm } from '@/lib/commission/waiting-form'
import type { SubDepartmentCapacity } from '@/lib/commission/capacity'

// Sales Groups › Waiting list (2026-10-10, the HR revamp): the applicants HR
// accepted, numbered in that order; above them the form (Upload form, Form
// settings); a row's drawer — facts, history, Fail (asked first) · Close ·
// Transfer (People Management's employee form; waits while the
// sub-department is full).

const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))
const flash = vi.fn()
vi.mock('@/components/hrv/toast', () => ({ flash: (m: string) => flash(m) }))
const actions = vi.hoisted(() => ({
  failWaitingApplicant: vi.fn(),
  uploadWaitingFormTemplate: vi.fn(),
  saveWaitingForm: vi.fn(),
  waitingFormTemplateLink: vi.fn(),
}))
vi.mock('../../../waiting-actions', () => actions)

import WaitingList from './WaitingList'

const req = (over: Partial<SubDeptRequest>): SubDeptRequest =>
  ({ id: 'r', requestNo: null, kind: 'waiting', status: 'waiting', createdAt: '2026-10-01T00:00:00Z', submittedAt: null, submittedBy: null,
    newPerson: null, contact: null, start: null, signature: null, original: null, destination: null, replacementSource: null,
    effective: null, reason: null, target: null, acceptedAt: null, events: [], ...over })

const rows = [
  req({ id: 'daniel', requestNo: 'RQ-2610-004', newPerson: 'Daniel Lee', contact: '016-221 0457', submittedBy: 'STANLEY', start: '2026-10-20', acceptedAt: '2026-10-04T02:00:00Z' }),
  req({
    id: 'amelia', requestNo: 'RQ-2609-012', newPerson: 'Amelia Tan', contact: '012-345 6789', submittedBy: 'CHEA HUAN', start: '2026-09-11',
    signature: 'Amelia Tan', acceptedAt: '2026-09-10T02:00:00Z',
    events: [
      { to: 'submitted', at: '2026-09-09T02:00:00Z', note: null, by: 'CHEA HUAN' },
      { to: 'waiting', at: '2026-09-10T02:00:00Z', note: null, by: 'HR' },
    ],
  }),
  req({ id: 'pending', status: 'submitted', newPerson: 'Siti Aisyah' }),
  req({ id: 'gone', status: 'failed', newPerson: 'Lee Wei', acceptedAt: '2026-09-01T00:00:00Z' }),
]

const V1: WaitingForm = {
  version: 1,
  requireUpload: false,
  templatePath: null,
  templateName: BUILT_FORM_NAME,
  createdAt: null,
  fields: [
    { id: 'newPerson', label: 'New member name', type: 'text', required: true, builtin: true },
    { id: 'contact', label: 'Phone number', type: 'phone', required: true, builtin: true },
    { id: 'target', label: 'Preferred sub-department', type: 'dropdown', required: true, builtin: true },
    { id: 'start', label: 'Preferred start date', type: 'date', required: true, builtin: true },
  ],
}
const ROOM: SubDepartmentCapacity = { capacity: 30, occupied: 28, reserved: 0, free: 2, waiting: 2 }
const FULL: SubDepartmentCapacity = { capacity: 28, occupied: 28, reserved: 0, free: 0, waiting: 2 }

function show(over: Partial<Parameters<typeof WaitingList>[0]> = {}) {
  return render(
    <WaitingList
      rows={rows}
      subDeptName="Fair"
      subSlug="fair"
      form={{ ok: true, form: V1 }}
      capacity={ROOM}
      canTransfer
      subOptions={['Fair', 'IR']}
      {...over}
    />,
  )
}

beforeEach(() => {
  push.mockReset()
  flash.mockReset()
  for (const fn of Object.values(actions)) fn.mockReset()
})
afterEach(cleanup)

describe('the list', () => {
  it('numbers the accepted applicants in the order they were accepted — nobody failed or still pending', () => {
    show()
    const list = screen.getAllByRole('row').slice(1)
    expect(list.map(r => within(r).getAllByRole('cell')[0].textContent)).toEqual(['#1', '#2'])
    expect(list[0]).toHaveTextContent('Amelia Tan')
    expect(list[0]).toHaveTextContent('RQ-2609-012 · 012-345 6789')
    expect(list[0]).toHaveTextContent('11 Sep 2026')
    expect(screen.queryByText('Siti Aisyah')).toBeNull()
    expect(screen.queryByText('Lee Wei')).toBeNull()
  })

  it('says so when nobody is on the list', () => {
    show({ rows: [] })
    expect(screen.getByText("Nobody is on Fair's waiting list.")).toBeInTheDocument()
  })
})

describe('an applicant’s drawer', () => {
  it('shows the facts, the action history and what Transfer does', () => {
    show()
    fireEvent.click(screen.getAllByRole('row')[1])
    const drawer = screen.getByRole('dialog')
    // Round 2 (README 18.5): the head is the name and the request number only.
    expect(drawer).not.toHaveTextContent(/of 2 on Fair/)
    expect(drawer).toHaveTextContent('Revenue · Fair')
    expect(drawer).toHaveTextContent('Accepted onto the waiting list')
    expect(drawer).toHaveTextContent('Only the employee details — NRIC, bank account — are left.')
  })

  it('Transfer opens People Management’s employee form for this applicant', () => {
    show()
    fireEvent.click(screen.getAllByRole('row')[1])
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Transfer' }))
    expect(push).toHaveBeenCalledWith('/team/people/new?waiting=amelia')
  })

  it('Transfer waits while Fair is full, and says where the limit is raised', () => {
    show({ capacity: FULL })
    fireEvent.click(screen.getAllByRole('row')[1])
    const drawer = screen.getByRole('dialog')
    expect(within(drawer).getByRole('button', { name: 'Transfer' })).toBeDisabled()
    expect(drawer).toHaveTextContent('Fair is full — 28 of 28 places are taken.')
    expect(within(drawer).getByRole('link', { name: 'Raise the limit on Rules › Capacity' })).toHaveAttribute('href', '/revenue/fair/rules?tab=capacity')
  })

  it('Transfer needs People › Create', () => {
    show({ canTransfer: false })
    fireEvent.click(screen.getAllByRole('row')[1])
    expect(within(screen.getByRole('dialog')).getByRole('button', { name: 'Transfer' })).toBeDisabled()
  })

  it('Fail asks first, then takes them off the list and the next moves up', async () => {
    actions.failWaitingApplicant.mockResolvedValue({ ok: true })
    show()
    fireEvent.click(screen.getAllByRole('row')[1])
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Fail' }))
    expect(actions.failWaitingApplicant).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog')).toHaveTextContent('Take Amelia Tan off the waiting list?')
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Keep' }))
    expect(within(screen.getByRole('dialog')).getByRole('button', { name: 'Transfer' })).toBeInTheDocument()
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Fail' }))
    await act(async () => {
      fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Fail' }))
    })
    expect(actions.failWaitingApplicant).toHaveBeenCalledWith('amelia')
    expect(flash).toHaveBeenCalledWith('Amelia Tan removed from the waiting list — the next in line moves up')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('keeps the drawer open with the refusal when Fail is refused', async () => {
    actions.failWaitingApplicant.mockResolvedValue({ ok: false, reason: 'Only somebody on the waiting list can be failed' })
    show()
    fireEvent.click(screen.getAllByRole('row')[1])
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Fail' }))
    await act(async () => {
      fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Fail' }))
    })
    expect(within(screen.getByRole('dialog')).getByRole('alert')).toHaveTextContent('Only somebody on the waiting list can be failed')
  })
})

describe('Upload form', () => {
  it('uploads HR’s own form and names it on the button', async () => {
    actions.uploadWaitingFormTemplate.mockResolvedValue({ ok: true, form: { ...V1, version: 2, templatePath: 'templates/x/Form.pdf', templateName: 'Form.pdf' } })
    show()
    const input = screen.getByLabelText('Upload form') as HTMLInputElement
    await act(async () => {
      fireEvent.change(input, { target: { files: [new File(['%PDF'], 'Form.pdf', { type: 'application/pdf' })] } })
    })
    expect(actions.uploadWaitingFormTemplate).toHaveBeenCalledTimes(1)
    expect((actions.uploadWaitingFormTemplate.mock.calls[0][0] as FormData).get('file')).toBeInstanceOf(File)
    expect(screen.getByText('Form: Form.pdf')).toBeInTheDocument()
    expect(flash).toHaveBeenCalledWith('Form uploaded — the waiting-list application is now Form.pdf')
  })

  it('refuses what the bucket would refuse, before sending it', async () => {
    show()
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Upload form'), { target: { files: [new File(['GIF'], 'scan.gif', { type: 'image/gif' })] } })
    })
    expect(actions.uploadWaitingFormTemplate).not.toHaveBeenCalled()
    expect(flash).toHaveBeenCalledWith('Upload a PDF, Word, HTML, PNG or JPEG file.')
  })
})

describe('Form settings', () => {
  it('opens on the saved version; Save with nothing changed sends nothing', async () => {
    show()
    fireEvent.click(screen.getByRole('button', { name: 'Form settings' }))
    const drawer = screen.getByRole('dialog')
    expect(drawer).toHaveTextContent('Waiting list · v1')
    expect(drawer).toHaveTextContent('Options: Fair · IR (from the sub-departments)')
    expect(within(drawer).getByRole('switch', { name: 'New member name required' })).toBeDisabled()
    await act(async () => {
      fireEvent.click(within(drawer).getByRole('button', { name: 'Save as v2' }))
    })
    expect(actions.saveWaitingForm).not.toHaveBeenCalled()
    expect(flash).toHaveBeenCalledWith('Nothing changed — the form is still v1')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('adds a dropdown question with its options and saves it as the next version', async () => {
    actions.saveWaitingForm.mockImplementation(async (draft: { fields: WaitingForm['fields']; requireUpload: boolean }) => ({ ok: true, form: { ...V1, version: 2, ...draft } }))
    show()
    fireEvent.click(screen.getByRole('button', { name: 'Form settings' }))
    const drawer = screen.getByRole('dialog')
    fireEvent.click(within(drawer).getByRole('button', { name: '+ Add question' }))
    fireEvent.change(within(drawer).getByRole('textbox', { name: 'Question 5' }), { target: { value: 'How did they hear about us' } })
    fireEvent.click(within(drawer).getAllByRole('button', { name: 'Dropdown' })[0])
    expect(drawer).toHaveTextContent('Option 1')
    fireEvent.change(within(drawer).getByRole('textbox', { name: 'New option for How did they hear about us' }), { target: { value: 'Roadshow' } })
    fireEvent.click(within(drawer).getByRole('button', { name: 'Add' }))
    fireEvent.click(within(drawer).getByRole('button', { name: 'Remove Option 1' }))
    fireEvent.click(within(drawer).getByRole('switch', { name: 'Members must upload the signed form with the request' }))
    await act(async () => {
      fireEvent.click(within(drawer).getByRole('button', { name: 'Save as v2' }))
    })
    const draft = actions.saveWaitingForm.mock.calls[0][0]
    expect(draft.requireUpload).toBe(true)
    expect(draft.useBuiltForm).toBe(false)
    expect(draft.fields[4]).toMatchObject({ label: 'How did they hear about us', type: 'dropdown', required: false, options: ['Roadshow'] })
    expect(flash).toHaveBeenCalledWith('Waiting-list form saved as v2')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('moves a question with ▲ ▼ and says what is wrong before sending', () => {
    show()
    fireEvent.click(screen.getByRole('button', { name: 'Form settings' }))
    const drawer = screen.getByRole('dialog')
    fireEvent.click(within(drawer).getByRole('button', { name: 'Move Phone number up' }))
    const labels = within(drawer).getAllByRole('group').filter(g => g.getAttribute('aria-label') && !g.getAttribute('aria-label')!.endsWith('kind')).map(g => g.getAttribute('aria-label'))
    expect(labels.slice(0, 2)).toEqual(['Phone number', 'New member name'])
    fireEvent.click(within(drawer).getByRole('button', { name: '+ Add question' }))
    fireEvent.change(within(drawer).getByRole('textbox', { name: 'Question 5' }), { target: { value: 'Heard' } })
    fireEvent.click(within(drawer).getAllByRole('button', { name: 'Dropdown' })[0])
    fireEvent.click(within(drawer).getByRole('button', { name: 'Remove Option 1' }))
    fireEvent.click(within(drawer).getByRole('button', { name: 'Save as v2' }))
    expect(actions.saveWaitingForm).not.toHaveBeenCalled()
    expect(within(drawer).getByRole('alert')).toHaveTextContent('“Heard” needs from 1 to 30 different options')
  })

  it('downloads the black-and-white form built from the questions', async () => {
    const created: Blob[] = []
    const createObjectURL = vi.fn((b: Blob) => {
      created.push(b)
      return 'blob:form'
    })
    Object.defineProperty(URL, 'createObjectURL', { value: createObjectURL, configurable: true })
    Object.defineProperty(URL, 'revokeObjectURL', { value: vi.fn(), configurable: true })
    show()
    fireEvent.click(screen.getByRole('button', { name: 'Form settings' }))
    await act(async () => {
      fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Download' }))
    })
    expect(created).toHaveLength(1)
    expect(await created[0].text()).toContain('Revenue Department · Fair · Form v1')
    expect(actions.waitingFormTemplateLink).not.toHaveBeenCalled()
  })
})
