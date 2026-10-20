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
  addToWaitingList: vi.fn(),
  failWaitingApplicant: vi.fn(),
  uploadWaitingFormTemplate: vi.fn(),
  saveWaitingForm: vi.fn(),
  waitingFormTemplateLink: vi.fn(),
  replacementFormTemplateLink: vi.fn(),
  viewFormTemplate: vi.fn(),
  removeFormTemplate: vi.fn(),
  uploadSignedForm: vi.fn(),
  viewSignedForm: vi.fn(),
  signedFormDownload: vi.fn(),
  editWaitingApplicant: vi.fn(),
}))
vi.mock('../../../waiting-actions', () => actions)
const convertToHtml = vi.hoisted(() => vi.fn())
vi.mock('mammoth', () => ({ convertToHtml }))

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
  convertToHtml.mockReset()
  for (const fn of Object.values(actions)) fn.mockReset()
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

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

// "+" (2026-10-11, the user: "我点击「加」了过后，我可以直接加人进去这个 waiting
// list 里面"): somebody straight onto the list, at the end. Submitted by is the
// Revenue team, HR's own questions may stay blank, the signed form follows Form
// settings.
describe('"+" — straight onto the list', () => {
  const SUB = '71709f7e-9f7c-4e28-80cf-ce21be336995'
  const STANLEY = '61b4c495-6b7d-442d-a391-31fe4cbe2d6a'
  const ALVIN = '1677f60d-9aad-4a97-a6bd-4bf8b805945f'
  const submitters = [
    { group: 'Fair', people: [{ id: STANLEY, name: 'STANLEY', title: 'Team Leader' }] },
    { group: 'IR', people: [{ id: ALVIN, name: 'ALVIN', title: null }] },
  ]
  const V2: WaitingForm = {
    ...V1,
    version: 2,
    fields: [...V1.fields, { id: 'ic', label: 'IC number', type: 'text', required: true }, { id: 'car', label: 'Has own transport', type: 'yesno', required: false }],
  }
  const WINDOW = "Add somebody to Fair's waiting list"
  const plus = () => screen.getByRole('button', { name: WINDOW })
  const fill = (win: HTMLElement, by = STANLEY) => {
    fireEvent.change(within(win).getByLabelText('New member name'), { target: { value: 'Daniel Lee' } })
    fireEvent.change(within(win).getByLabelText('Phone number'), { target: { value: '016-221 0457' } })
    fireEvent.change(within(win).getByLabelText('Joining date'), { target: { value: '2026-11-02' } })
    fireEvent.change(within(win).getByRole('combobox', { name: /Submitted by/ }), { target: { value: by } })
  }
  const sent = (n = 0) => actions.addToWaitingList.mock.calls[n][0] as FormData
  const added = (n = 0) => JSON.parse(String(sent(n).get('input')))

  it('stands first in the row, only for whoever may add', () => {
    show({ canAdd: true, subDepartmentId: SUB, submitters })
    const row = plus().parentElement!
    expect(row.firstElementChild).toBe(plus())
    expect(within(row).getByText('Form settings')).toBeInTheDocument()
    cleanup()
    show({ subDepartmentId: SUB, submitters })
    expect(screen.queryByRole('button', { name: WINDOW })).toBeNull()
  })

  it('adds the basics and who brought them in; HR’s own questions may stay blank', async () => {
    actions.addToWaitingList.mockResolvedValue({ ok: true, requestNo: 'RQ-2610-005' })
    show({ canAdd: true, subDepartmentId: SUB, submitters, form: { ok: true, form: V2 } })
    fireEvent.click(plus())
    const win = screen.getByRole('dialog', { name: WINDOW })
    // The Revenue team, this sub-department first.
    const by = within(win).getByRole('combobox', { name: /Submitted by/ })
    expect([...by.querySelectorAll('optgroup')].map(g => g.label)).toEqual(['Fair', 'IR'])
    expect(within(win).getByText('Your questions · optional')).toBeInTheDocument()
    expect(within(win).getByText('· optional')).toBeInTheDocument()
    fill(win)
    fireEvent.change(within(win).getByRole('combobox', { name: 'Has own transport' }), { target: { value: 'Yes' } })
    await act(async () => {
      fireEvent.click(within(win).getByRole('button', { name: 'Add to the list' }))
    })
    expect(added()).toEqual({ name: 'Daniel Lee', contact: '016-221 0457', start: '2026-11-02', submittedBy: STANLEY, answers: { car: 'Yes' }, subDepartmentId: SUB })
    expect(sent().get('signedForm')).toBeNull()
    expect(flash).toHaveBeenCalledWith("Daniel Lee is on Fair's waiting list · RQ-2610-005")
    expect(screen.queryByRole('dialog', { name: WINDOW })).toBeNull()
  })

  it('says what is missing before sending anything, and keeps the window with the database’s refusal', async () => {
    actions.addToWaitingList.mockResolvedValue({ ok: false, reason: 'This phone number is already on the waiting list, or waiting for review in Member services' })
    show({ canAdd: true, subDepartmentId: SUB, submitters })
    fireEvent.click(plus())
    const win = screen.getByRole('dialog', { name: WINDOW })
    fireEvent.click(within(win).getByRole('button', { name: 'Add to the list' }))
    expect(within(win).getByRole('alert')).toHaveTextContent('Fill in new member name, phone number, joining date, submitted by.')
    expect(actions.addToWaitingList).not.toHaveBeenCalled()
    fill(win, ALVIN)
    await act(async () => {
      fireEvent.click(within(win).getByRole('button', { name: 'Add to the list' }))
    })
    expect(added().submittedBy).toBe(ALVIN)
    expect(within(win).getByRole('alert')).toHaveTextContent('already on the waiting list')
  })

  it('asks for the signed form while Form settings does, and sends the one attached', async () => {
    actions.addToWaitingList.mockResolvedValue({ ok: true, requestNo: 'RQ-2610-006' })
    show({ canAdd: true, subDepartmentId: SUB, submitters, form: { ok: true, form: { ...V1, requireUpload: true } } })
    fireEvent.click(plus())
    const win = screen.getByRole('dialog', { name: WINDOW })
    expect(within(win).getByText('· required by Form settings')).toBeInTheDocument()
    fill(win)
    fireEvent.click(within(win).getByRole('button', { name: 'Add to the list' }))
    expect(within(win).getByRole('alert')).toHaveTextContent('Upload the signed application form — Form settings asks for it.')
    expect(actions.addToWaitingList).not.toHaveBeenCalled()
    const signed = new File(['%PDF-1.7'], 'Daniel signed.pdf', { type: 'application/pdf' })
    fireEvent.change(within(win).getByLabelText('Attach the signed form'), { target: { files: [signed] } })
    expect(within(win).getByText('Daniel signed.pdf')).toBeInTheDocument()
    await act(async () => {
      fireEvent.click(within(win).getByRole('button', { name: 'Add to the list' }))
    })
    expect(sent().get('signedForm')).toBeInstanceOf(File)
    expect(flash).toHaveBeenCalledWith("Daniel Lee is on Fair's waiting list · RQ-2610-006")
  })

  // 2026-10-20, the user: "want word file as well".
  it('takes a Word file as the signed form too', async () => {
    actions.addToWaitingList.mockResolvedValue({ ok: true, requestNo: 'RQ-2610-007' })
    show({ canAdd: true, subDepartmentId: SUB, submitters })
    fireEvent.click(plus())
    const win = screen.getByRole('dialog', { name: WINDOW })
    expect(win).toHaveTextContent('PDF, Word, PNG or JPG, 3 MB or smaller.')
    const input = within(win).getByLabelText('Attach the signed form')
    expect(input.getAttribute('accept')).toContain('.docx')
    fill(win)
    const letter = new File(['PK'], 'Daniel letter.docx', { type: '' })
    fireEvent.change(input, { target: { files: [letter] } })
    await act(async () => {
      fireEvent.click(within(win).getByRole('button', { name: 'Add to the list' }))
    })
    expect(sent().get('signedForm')).toBe(letter)
  })

  // 2026-10-14, the user: some are ready any time — "just wait us to let them join".
  it('takes Any time ready instead of a day — the date then left empty', async () => {
    actions.addToWaitingList.mockResolvedValue({ ok: true, requestNo: 'RQ-2610-007' })
    show({ canAdd: true, subDepartmentId: SUB, submitters })
    fireEvent.click(plus())
    const win = screen.getByRole('dialog', { name: WINDOW })
    fill(win)
    const date = within(win).getByLabelText('Joining date') as HTMLInputElement
    fireEvent.click(within(win).getByRole('checkbox', { name: 'Any time ready' }))
    expect(date).toBeDisabled()
    expect(date.value).toBe('')
    await act(async () => {
      fireEvent.click(within(win).getByRole('button', { name: 'Add to the list' }))
    })
    expect(added().start).toBe('anytime')
    expect(flash).toHaveBeenCalledWith("Daniel Lee is on Fair's waiting list · RQ-2610-007")
  })

  it('unticked, asks for the day again', () => {
    show({ canAdd: true, subDepartmentId: SUB, submitters })
    fireEvent.click(plus())
    const win = screen.getByRole('dialog', { name: WINDOW })
    fill(win)
    const tick = within(win).getByRole('checkbox', { name: 'Any time ready' })
    fireEvent.click(tick)
    fireEvent.click(tick)
    expect(within(win).getByLabelText('Joining date')).not.toBeDisabled()
    fireEvent.click(within(win).getByRole('button', { name: 'Add to the list' }))
    expect(within(win).getByRole('alert')).toHaveTextContent('Fill in joining date.')
    expect(actions.addToWaitingList).not.toHaveBeenCalled()
  })

  it('shows Any time ready on the list and in the drawer', () => {
    show({ rows: [req({ id: 'ready', requestNo: 'RQ-2610-008', newPerson: 'Joan Quek', contact: '018-776 0020', submittedBy: 'SHAWN', start: 'anytime', acceptedAt: '2026-10-14T07:00:00Z' })] })
    expect(screen.getAllByRole('row')[1]).toHaveTextContent('Any time ready')
    fireEvent.click(screen.getAllByRole('row')[1])
    expect(screen.getByRole('dialog')).toHaveTextContent('Joining dateAny time ready')
  })

  it('opens a row HR added with who added it — never who signed', () => {
    const mine = req({
      id: 'added', requestNo: 'RQ-2610-005', newPerson: 'Daniel Lee', contact: '016-221 0457', submittedBy: 'STANLEY', start: '2026-11-02',
      acceptedAt: '2026-10-11T07:00:00Z',
      events: [{ to: 'waiting', at: '2026-10-11T07:00:00Z', note: 'Added on Sales Groups', by: 'Grace Lim' }],
    })
    show({ rows: [mine] })
    fireEvent.click(screen.getAllByRole('row')[1])
    const drawer = screen.getByRole('dialog')
    expect(drawer).toHaveTextContent('Added byGrace Lim')
    expect(drawer).toHaveTextContent('11 Oct 2026 · added here')
    expect(drawer).toHaveTextContent('Added to the waiting list')
    expect(drawer).not.toHaveTextContent('Signed by')
    expect(drawer).not.toHaveTextContent('Member services')
  })
})

// 2026-10-20, the user, on JOAN QUEK XIAO's drawer: "i want here can be view for the letter they submit, then can
// be upload as well, the file". The drawer holds the applicant's signed form: View, and Upload / Replace for
// Member services · Edit.
// 2026-10-20 — the user, circling the space beside the drawer's ×: "要能够按 Edit：这个 Edit 本身是让 HR 可以去改资料的";
// and "submitted by … 应该要能选到 Revenue department 的全部人，不管什么 title".
describe('Edit, in an applicant’s drawer', () => {
  const SHAWN = '61b4c495-6b7d-442d-a391-31fe4cbe2d6a'
  const KRIS = '7b6f1f0e-2a8d-4b1a-9a52-5c8a1e2b3c4d'
  const submitters = [
    { group: 'Fair', people: [{ id: SHAWN, name: 'SHAWN', title: 'Team Leader' }] },
    { group: 'Revenue Department', people: [{ id: KRIS, name: 'KRIS', title: 'Revenue Director' }] },
  ]
  const joan = (over: Partial<SubDeptRequest> = {}) =>
    req({
      id: 'joan', requestNo: 'RQ-2610-002', newPerson: 'JOAN QUEK XIAO', contact: '018-776-0020', submittedBy: 'SHAWN', submittedById: SHAWN,
      start: 'anytime', acceptedAt: '2026-10-20T04:41:25Z',
      events: [{ to: 'waiting', at: '2026-10-20T04:41:25Z', note: 'Added on Sales Groups', by: 'LI SEAN' }],
      ...over,
    })
  const open = (canAdd = true, row = joan()) => {
    const view = show({ rows: [row], canAdd, submitters })
    fireEvent.click(screen.getAllByRole('row')[1])
    return { view, drawer: screen.getByRole('dialog') }
  }
  const save = (drawer: HTMLElement) => within(drawer).getByRole('button', { name: 'Save changes' })

  it('is offered beside the × to whoever may use "+", and to nobody else', () => {
    const { drawer } = open(false)
    expect(within(drawer).queryByRole('button', { name: /Edit/ })).toBeNull()
    cleanup()
    const second = open(true).drawer
    expect(within(second).getByRole('button', { name: /Edit/ })).toBeInTheDocument()
  })

  it('opens the fields "+" asks, as the applicant is — Save waits for a change', () => {
    const { drawer } = open()
    fireEvent.click(within(drawer).getByRole('button', { name: /Edit/ }))
    expect((within(drawer).getByLabelText('New member name') as HTMLInputElement).value).toBe('JOAN QUEK XIAO')
    expect((within(drawer).getByLabelText('Mobile number') as HTMLInputElement).value).toBe('018-776-0020')
    expect(within(drawer).getByLabelText('Joining date')).toBeDisabled()
    expect(within(drawer).getByRole('checkbox', { name: 'Any time ready' })).toBeChecked()
    expect((within(drawer).getByRole('combobox', { name: /Submitted by/ }) as HTMLSelectElement).value).toBe(SHAWN)
    expect(drawer).toHaveTextContent('Revenue · Fair')
    expect(save(drawer)).toBeDisabled()
    expect(drawer).toHaveTextContent('No changes yet')
    expect(within(drawer).queryByRole('button', { name: 'Transfer' })).toBeNull()
  })

  it('offers the whole department for Submitted by — a Revenue Director too', () => {
    const { drawer } = open()
    fireEvent.click(within(drawer).getByRole('button', { name: /Edit/ }))
    const by = within(drawer).getByRole('combobox', { name: /Submitted by/ }) as HTMLSelectElement
    expect([...by.querySelectorAll('optgroup')].map(g => g.label)).toEqual(['Fair', 'Revenue Department'])
    expect([...by.options].map(o => o.textContent)).toEqual(['SHAWN · Team Leader', 'KRIS · Revenue Director'])
  })

  it('sends only what changed, says Saving… and closes once the fresh rows are in', async () => {
    actions.editWaitingApplicant.mockResolvedValue({ ok: true })
    const { view, drawer } = open()
    fireEvent.click(within(drawer).getByRole('button', { name: /Edit/ }))
    fireEvent.change(within(drawer).getByLabelText('Mobile number'), { target: { value: ' 018-776-0021 ' } })
    fireEvent.change(within(drawer).getByRole('combobox', { name: /Submitted by/ }), { target: { value: KRIS } })
    expect(within(drawer).getByLabelText('Mobile number').getAttribute('data-dirty')).toBe('true')
    expect(within(drawer).getByLabelText('New member name').getAttribute('data-dirty')).toBeNull()
    expect(drawer).toHaveTextContent('2 changes')
    await act(async () => {
      fireEvent.click(save(drawer))
    })
    expect(actions.editWaitingApplicant).toHaveBeenCalledExactlyOnceWith('joan', { contact: '018-776-0021', submittedBy: KRIS })
    expect(flash).toHaveBeenCalledWith('JOAN QUEK XIAO — details saved')
    expect(within(drawer).getByRole('button', { name: 'Saving…' })).toBeDisabled()
    view.rerender(
      <WaitingList
        rows={[joan({ contact: '018-776-0021', submittedBy: 'KRIS', submittedById: KRIS })]}
        subDeptName="Fair"
        subSlug="fair"
        form={{ ok: true, form: V1 }}
        capacity={ROOM}
        canTransfer
        subOptions={['Fair', 'IR']}
        canAdd
        submitters={submitters}
      />,
    )
    const fresh = screen.getByRole('dialog')
    expect(within(fresh).queryByLabelText('Mobile number')).toBeNull()
    expect(fresh).toHaveTextContent('018-776-0021')
    expect(fresh).toHaveTextContent('KRIS')
    expect(within(fresh).getByRole('button', { name: /Edit/ })).toBeInTheDocument()
  })

  it('sends a day for Any time ready unticked, and back to Any time ready ticked', async () => {
    actions.editWaitingApplicant.mockResolvedValue({ ok: true })
    const { drawer } = open()
    fireEvent.click(within(drawer).getByRole('button', { name: /Edit/ }))
    fireEvent.click(within(drawer).getByRole('checkbox', { name: 'Any time ready' }))
    expect(within(drawer).getByLabelText('Joining date')).not.toBeDisabled()
    fireEvent.change(within(drawer).getByLabelText('Joining date'), { target: { value: '2026-12-01' } })
    await act(async () => {
      fireEvent.click(save(drawer))
    })
    expect(actions.editWaitingApplicant).toHaveBeenCalledExactlyOnceWith('joan', { start: '2026-12-01' })
  })

  it('keeps the edit open with the refusal in words, and Cancel puts the facts back', async () => {
    actions.editWaitingApplicant.mockResolvedValue({ ok: false, reason: 'This phone number is already on the waiting list, or waiting for review in Member services' })
    const { drawer } = open()
    fireEvent.click(within(drawer).getByRole('button', { name: /Edit/ }))
    fireEvent.change(within(drawer).getByLabelText('Mobile number'), { target: { value: '019-464-6349' } })
    await act(async () => {
      fireEvent.click(save(drawer))
    })
    expect(within(drawer).getByRole('alert')).toHaveTextContent('already on the waiting list')
    expect((within(drawer).getByLabelText('Mobile number') as HTMLInputElement).value).toBe('019-464-6349')
    fireEvent.click(within(drawer).getByRole('button', { name: 'Cancel' }))
    expect(within(drawer).queryByLabelText('Mobile number')).toBeNull()
    expect(drawer).toHaveTextContent('018-776-0020')
  })

  it('refuses a blank name before anything is sent', async () => {
    const { drawer } = open()
    fireEvent.click(within(drawer).getByRole('button', { name: /Edit/ }))
    fireEvent.change(within(drawer).getByLabelText('New member name'), { target: { value: '  ' } })
    await act(async () => {
      fireEvent.click(save(drawer))
    })
    expect(actions.editWaitingApplicant).not.toHaveBeenCalled()
    expect(within(drawer).getByRole('alert')).toHaveTextContent('Fill in new member name.')
  })

  it('keeps a submitter no longer in the department among the choices, by name', () => {
    const { drawer } = open(true, joan({ submittedBy: 'GONE', submittedById: '11111111-2222-4333-8444-555555555555' }))
    fireEvent.click(within(drawer).getByRole('button', { name: /Edit/ }))
    const by = within(drawer).getByRole('combobox', { name: /Submitted by/ }) as HTMLSelectElement
    expect(by.value).toBe('11111111-2222-4333-8444-555555555555')
    expect(by.options[0].textContent).toBe('GONE')
  })
})

describe('an applicant’s signed form', () => {
  const joan = (over: Partial<SubDeptRequest> = {}) =>
    req({
      id: 'joan', requestNo: 'RQ-2610-002', newPerson: 'JOAN QUEK XIAO', contact: '018-776-0020', submittedBy: 'SHAWN', start: 'anytime',
      acceptedAt: '2026-10-20T04:41:25Z',
      events: [{ to: 'waiting', at: '2026-10-20T04:41:25Z', note: 'Added on Sales Groups', by: 'LI SEAN' }],
      ...over,
    })
  const ON_FILE = { name: 'Joan Quek application.pdf', type: 'application/pdf', at: '2026-10-20T06:00:00Z', by: 'LI SEAN' }
  const open = (row = joan(), canAdd = true) => {
    show({ rows: [row], canAdd })
    fireEvent.click(screen.getAllByRole('row')[1])
    return screen.getByRole('dialog')
  }
  const pdf = (name = 'Joan Quek application.pdf', size = 0) => {
    const file = new File([new Uint8Array([37, 80, 68, 70, 45])], name, { type: 'application/pdf' })
    if (size) Object.defineProperty(file, 'size', { value: size })
    return file
  }

  it('shows the form on file — its icon, its name, when and who — and View draws it', async () => {
    actions.viewSignedForm.mockResolvedValue({ ok: true, url: 'data:application/pdf;base64,JVBERi0xLjQK', name: ON_FILE.name, type: 'application/pdf' })
    const drawer = open(joan({ signedForm: ON_FILE }))
    expect(within(drawer).getByText('Signed form')).toBeInTheDocument()
    expect(drawer).toHaveTextContent('Joan Quek application.pdf')
    expect(drawer).toHaveTextContent('20 Oct 2026 · LI SEAN')
    expect(drawer.querySelector('[data-kind="pdf"]')).not.toBeNull()
    await act(async () => {
      fireEvent.click(within(drawer).getByRole('button', { name: 'View' }))
    })
    expect(actions.viewSignedForm).toHaveBeenCalledExactlyOnceWith('joan')
    const viewer = screen.getByRole('dialog', { name: 'Joan Quek application.pdf' })
    expect(viewer).toHaveTextContent('JOAN QUEK XIAO · Signed form')
    expect(viewer.querySelector('iframe')).toHaveAttribute('src', 'data:application/pdf;base64,JVBERi0xLjQK')
  })

  // 2026-10-20, the user: "want word file as well".
  it('shows a Word letter as Word, and View reads it here in a frame where nothing runs', async () => {
    const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    actions.viewSignedForm.mockResolvedValue({ ok: true, url: 'https://files.test/sign/joan.docx?token=t', name: 'Joan letter.docx', type: DOCX })
    const fetched = vi.fn(async () => new Response(new Uint8Array([80, 75, 3, 4, 1, 2])))
    vi.stubGlobal('fetch', fetched)
    convertToHtml.mockResolvedValue({ value: '<p>WAITING LIST APPLICATION — JOAN QUEK XIAO</p>', messages: [] })
    const drawer = open(joan({ signedForm: { ...ON_FILE, name: 'Joan letter.docx', type: DOCX } }))
    expect(drawer.querySelector('[data-kind="word"]')).not.toBeNull()
    await act(async () => {
      fireEvent.click(within(drawer).getByRole('button', { name: 'View' }))
    })
    const viewer = screen.getByRole('dialog', { name: 'Joan letter.docx' })
    await waitFor(() => expect(viewer.querySelector('iframe')).not.toBeNull())
    expect(fetched).toHaveBeenCalledWith('https://files.test/sign/joan.docx?token=t', expect.anything())
    const frame = viewer.querySelector('iframe')!
    expect(frame).toHaveAttribute('sandbox', '')
    expect(frame.getAttribute('srcdoc')).toContain('WAITING LIST APPLICATION — JOAN QUEK XIAO')
  })

  it('an old .doc is Download only', async () => {
    actions.viewSignedForm.mockResolvedValue({ ok: true, url: 'https://files.test/sign/joan.doc?token=t', name: 'Joan letter.doc', type: 'application/msword' })
    const drawer = open(joan({ signedForm: { ...ON_FILE, name: 'Joan letter.doc', type: 'application/msword' } }))
    expect(drawer.querySelector('[data-kind="word"]')).not.toBeNull()
    await act(async () => {
      fireEvent.click(within(drawer).getByRole('button', { name: 'View' }))
    })
    const viewer = screen.getByRole('dialog', { name: 'Joan letter.doc' })
    expect(viewer).toHaveTextContent('No preview for .doc files.Download it to open.')
    expect(within(viewer).getByRole('button', { name: 'Download' })).toBeInTheDocument()
  })

  it('draws a picture whose name says nothing of its kind, by the type the bucket kept', async () => {
    actions.viewSignedForm.mockResolvedValue({ ok: true, url: 'https://files.test/sign/joan?token=t', name: 'Joan', type: 'image/jpeg' })
    const drawer = open(joan({ signedForm: { ...ON_FILE, name: 'Joan', type: 'image/jpeg' } }))
    expect(drawer.querySelector('[data-kind="image"]')).not.toBeNull()
    await act(async () => {
      fireEvent.click(within(drawer).getByRole('button', { name: 'View' }))
    })
    expect(screen.getByRole('img', { name: 'Joan' })).toHaveAttribute('src', 'https://files.test/sign/joan?token=t')
  })

  it('Download hands the file over; a refusal says why', async () => {
    actions.viewSignedForm.mockResolvedValue({ ok: true, url: 'data:application/pdf;base64,JVBERi0xLjQK', name: ON_FILE.name, type: 'application/pdf' })
    actions.signedFormDownload.mockResolvedValue({ ok: false, reason: 'No signed form is on file for them.' })
    const drawer = open(joan({ signedForm: ON_FILE }))
    await act(async () => {
      fireEvent.click(within(drawer).getByRole('button', { name: 'View' }))
    })
    await act(async () => {
      fireEvent.click(within(screen.getByRole('dialog', { name: ON_FILE.name })).getByRole('button', { name: 'Download' }))
    })
    expect(actions.signedFormDownload).toHaveBeenCalledExactlyOnceWith('joan')
    expect(flash).toHaveBeenCalledWith('No signed form is on file for them.')
  })

  it('with none on file, uploads one — and the drawer shows it at once', async () => {
    actions.uploadSignedForm.mockResolvedValue({ ok: true, form: ON_FILE })
    const drawer = open()
    expect(drawer).toHaveTextContent('Upload the signed form')
    expect(drawer).toHaveTextContent('PDF, Word, PNG or JPG · 3 MB or smaller')
    expect(within(drawer).getByLabelText("Upload JOAN QUEK XIAO's signed form").getAttribute('accept')).toBe('.pdf,.png,.jpg,.jpeg,.doc,.docx')
    const file = pdf()
    await act(async () => {
      fireEvent.change(within(drawer).getByLabelText("Upload JOAN QUEK XIAO's signed form"), { target: { files: [file] } })
    })
    const sent = actions.uploadSignedForm.mock.calls[0][0] as FormData
    expect([sent.get('requestId'), sent.get('file')]).toEqual(['joan', file])
    expect(flash).toHaveBeenCalledWith('Signed form uploaded for JOAN QUEK XIAO')
    expect(drawer).toHaveTextContent('Joan Quek application.pdf')
    expect(drawer).toHaveTextContent('20 Oct 2026 · LI SEAN')
    expect(within(drawer).getByRole('button', { name: 'View' })).toBeInTheDocument()
    expect(within(drawer).getByLabelText("Replace JOAN QUEK XIAO's signed form")).toBeInTheDocument()
  })

  it('takes a file dropped on it', async () => {
    actions.uploadSignedForm.mockResolvedValue({ ok: true, form: ON_FILE })
    const drawer = open()
    const file = pdf()
    await act(async () => {
      fireEvent.drop(within(drawer).getByText('Upload the signed form'), { dataTransfer: { files: [file] } })
    })
    expect((actions.uploadSignedForm.mock.calls[0][0] as FormData).get('file')).toBe(file)
  })

  it('Replace sends another in its place', async () => {
    actions.uploadSignedForm.mockResolvedValue({ ok: true, form: { ...ON_FILE, name: 'Joan clearer.png', type: 'image/png', by: 'HR' } })
    const drawer = open(joan({ signedForm: ON_FILE }))
    await act(async () => {
      fireEvent.change(within(drawer).getByLabelText("Replace JOAN QUEK XIAO's signed form"), { target: { files: [pdf('Joan clearer.png')] } })
    })
    expect(flash).toHaveBeenCalledWith("JOAN QUEK XIAO's signed form replaced — Joan clearer.png")
    expect(drawer).toHaveTextContent('Joan clearer.png')
    expect(drawer).toHaveTextContent('20 Oct 2026 · HR')
  })

  it('says what is wrong before sending, and keeps the database’s refusal in the drawer', async () => {
    const drawer = open()
    await act(async () => {
      fireEvent.change(within(drawer).getByLabelText("Upload JOAN QUEK XIAO's signed form"), { target: { files: [pdf('Joan.pdf', 3 * 1024 * 1024 + 1)] } })
    })
    expect(within(drawer).getByRole('alert')).toHaveTextContent('The signed form must be 3 MB or smaller.')
    expect(actions.uploadSignedForm).not.toHaveBeenCalled()

    actions.uploadSignedForm.mockResolvedValue({ ok: false, reason: 'This applicant is no longer on the waiting list. Reload the page.' })
    await act(async () => {
      fireEvent.change(within(drawer).getByLabelText("Upload JOAN QUEK XIAO's signed form"), { target: { files: [pdf()] } })
    })
    expect(within(drawer).getByRole('alert')).toHaveTextContent('This applicant is no longer on the waiting list. Reload the page.')
    expect(drawer).toHaveTextContent('Upload the signed form')
    expect(flash).not.toHaveBeenCalled()
  })

  it('without Member services · Edit: View only, and none on file says so', () => {
    let drawer = open(joan({ signedForm: ON_FILE }), false)
    expect(within(drawer).getByRole('button', { name: 'View' })).toBeInTheDocument()
    expect(within(drawer).queryByLabelText(/Replace/)).toBeNull()
    cleanup()
    drawer = open(joan(), false)
    expect(drawer).toHaveTextContent('No signed form on file.')
    expect(within(drawer).queryByLabelText(/Upload/)).toBeNull()
  })

  it('names the upload in the action history', () => {
    const drawer = open(
      joan({
        signedForm: ON_FILE,
        events: [
          { to: 'waiting', at: '2026-10-20T04:41:25Z', note: 'Added on Sales Groups', by: 'LI SEAN' },
          { to: 'waiting', at: '2026-10-20T06:00:00Z', note: 'Signed form uploaded · Joan Quek application.pdf', by: 'LI SEAN' },
        ],
      }),
    )
    expect(drawer).toHaveTextContent('Added to the waiting list')
    expect(drawer).toHaveTextContent('Signed form uploaded20 OctLI SEANJoan Quek application.pdf')
    // Still the one who added them, and accepted when they were.
    expect(drawer).toHaveTextContent('Added byLI SEAN')
    expect(drawer).toHaveTextContent('20 Oct 2026 · added here')
  })
})

describe('Upload form', () => {
  it('uploads HR’s own form and shows it as its file’s icon — the name in the tooltip, never on the button', async () => {
    actions.uploadWaitingFormTemplate.mockResolvedValue({ ok: true, form: { ...V1, version: 2, templatePath: 'templates/x/Form.pdf', templateName: 'Form.pdf' } })
    show()
    const input = screen.getByLabelText('Upload form') as HTMLInputElement
    await act(async () => {
      fireEvent.change(input, { target: { files: [new File(['%PDF'], 'Form.pdf', { type: 'application/pdf' })] } })
    })
    expect(actions.uploadWaitingFormTemplate).toHaveBeenCalledTimes(1)
    expect((actions.uploadWaitingFormTemplate.mock.calls[0][0] as FormData).get('file')).toBeInstanceOf(File)
    // 2026-10-15, the user: "我不要它直接显示文字，那样很难看".
    const chip = screen.getByLabelText('Form: Form.pdf').closest('label')!
    expect(chip).toHaveAttribute('title', 'Form.pdf')
    expect(chip).toHaveAttribute('data-icon', 'true')
    expect(chip).toHaveTextContent(/^PDF$/)
    expect(screen.queryByText(/Form\.pdf/)).toBeNull()
    expect(flash).toHaveBeenCalledWith('Form uploaded — the waiting-list application is now Form.pdf')
  })

  it('wears the icon of each kind the bucket takes', () => {
    const icon = (name: string) => {
      cleanup()
      show({ form: { ok: true, form: { ...V1, version: 2, templatePath: `templates/x/${name}`, templateName: name } } })
      const badge = screen.getByLabelText(`Form: ${name}`).closest('label')!.querySelector('[data-kind]')!
      return [badge.getAttribute('data-kind'), badge.textContent]
    }
    expect(icon('Revenue_Team_Waiting_List_Form_04.09.2026 (2).docx')).toEqual(['word', 'W'])
    expect(icon('Old form.doc')).toEqual(['word', 'W'])
    expect(icon('Form.pdf')).toEqual(['pdf', 'PDF'])
    expect(icon('Form.html')).toEqual(['html', '</>'])
    expect(icon('scan.JPG')).toEqual(['image', ''])
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

// The uploaded form's right-click menu (2026-10-14, the user: "right click 然后按 view，同时也可以按
// remove。因为如果我 upload 错的话，我需要 remove 掉" — and the file with it).
describe('the uploaded form’s right-click menu', () => {
  const DOCX = 'templates/0b3fb828/Revenue_Team_Waiting_List_Form.docx'
  const uploaded = (name = 'Revenue_Team_Waiting_List_Form.docx', path = DOCX): WaitingForm => ({ ...V1, version: 2, templatePath: path, templateName: name })
  const chip = (name = 'Revenue_Team_Waiting_List_Form.docx') => screen.getByLabelText(`Form: ${name}`).closest('label')!
  const openMenu = (name?: string) => fireEvent.contextMenu(chip(name))

  it('opens on the uploaded form with its name, View and Remove…', () => {
    show({ form: { ok: true, form: uploaded() } })
    expect(openMenu()).toBe(false) // the browser's own menu stays shut
    const menu = screen.getByRole('menu', { name: 'Uploaded form Revenue_Team_Waiting_List_Form.docx' })
    expect(menu).toHaveTextContent('Revenue_Team_Waiting_List_Form.docx')
    expect(within(menu).getAllByRole('menuitem').map(b => b.textContent)).toEqual(['View', 'Remove…'])
  })

  it('has no menu while nothing is uploaded, and Shift + right-click keeps the browser’s', () => {
    show()
    expect(fireEvent.contextMenu(screen.getByText('Upload form').closest('label')!)).toBe(true)
    expect(screen.queryByRole('menu')).toBeNull()
    cleanup()
    show({ form: { ok: true, form: uploaded() } })
    expect(fireEvent.contextMenu(chip(), { shiftKey: true })).toBe(true)
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('asks before Remove; Cancel goes back to the menu', () => {
    show({ form: { ok: true, form: uploaded() } })
    openMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Remove…' }))
    const ask = screen.getByRole('dialog', { name: 'Remove Revenue_Team_Waiting_List_Form.docx' })
    expect(ask).toHaveTextContent('Remove this form?')
    expect(ask).toHaveTextContent('Members download the built form until another is uploaded. Revenue_Team_Waiting_List_Form.docx is deleted.')
    fireEvent.click(within(ask).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByRole('menu')).toBeInTheDocument()
    expect(actions.removeFormTemplate).not.toHaveBeenCalled()
  })

  it('Remove takes the file off the form and out of the bucket, and the button reads Upload form again', async () => {
    actions.removeFormTemplate.mockResolvedValue({ ok: true, form: { ...V1, version: 3 }, fileDeleted: true })
    show({ form: { ok: true, form: uploaded() } })
    openMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Remove…' }))
    await act(async () => {
      fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Remove' }))
    })
    expect(actions.removeFormTemplate).toHaveBeenCalledExactlyOnceWith('waiting', DOCX)
    expect(screen.queryByRole('menu')).toBeNull()
    expect(screen.getByText('Upload form')).toBeInTheDocument()
    expect(screen.queryByLabelText(/^Form: /)).toBeNull()
    expect(flash).toHaveBeenCalledWith('Revenue_Team_Waiting_List_Form.docx removed — members download the built form')
  })

  it('says so when the form is off but its file stayed in the bucket', async () => {
    actions.removeFormTemplate.mockResolvedValue({ ok: true, form: { ...V1, version: 3 }, fileDeleted: false })
    show({ form: { ok: true, form: uploaded() } })
    openMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Remove…' }))
    await act(async () => {
      fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Remove' }))
    })
    expect(flash).toHaveBeenCalledWith(
      'Revenue_Team_Waiting_List_Form.docx is off the form — members download the built form, but the file could not be deleted',
    )
  })

  it('a refused Remove says why in the menu and keeps the form', async () => {
    actions.removeFormTemplate.mockResolvedValue({ ok: false, reason: 'Another form was uploaded in the meantime. Reload the page.' })
    show({ form: { ok: true, form: uploaded() } })
    openMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Remove…' }))
    await act(async () => {
      fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Remove' }))
    })
    expect(within(screen.getByRole('dialog')).getByRole('alert')).toHaveTextContent('Another form was uploaded in the meantime. Reload the page.')
    expect(chip()).toBeInTheDocument()
    expect(flash).not.toHaveBeenCalled()
  })

  it('View opens a PDF in the browser’s own viewer', async () => {
    // A data: link, so the test frame loads nothing from the network.
    actions.viewFormTemplate.mockResolvedValue({ ok: true, url: 'data:application/pdf;base64,JVBERi0xLjQK', name: 'Form.pdf' })
    show({ form: { ok: true, form: uploaded('Form.pdf', 'templates/x/Form.pdf') } })
    openMenu('Form.pdf')
    await act(async () => {
      fireEvent.click(screen.getByRole('menuitem', { name: 'View' }))
    })
    expect(screen.queryByRole('menu')).toBeNull()
    expect(actions.viewFormTemplate).toHaveBeenCalledExactlyOnceWith('waiting')
    const drawer = screen.getByRole('dialog', { name: 'Form.pdf' })
    expect(drawer).toHaveTextContent('Waiting list · Uploaded form')
    expect(drawer.querySelector('iframe')).toHaveAttribute('src', 'data:application/pdf;base64,JVBERi0xLjQK')
  })

  it('View reads a Word file here and draws it in a frame where nothing runs', async () => {
    actions.viewFormTemplate.mockResolvedValue({ ok: true, url: 'https://files.test/sign/form.docx?token=t', name: 'Revenue_Team_Waiting_List_Form.docx' })
    const fetched = vi.fn(async () => new Response(new Uint8Array([80, 75, 3, 4])))
    vi.stubGlobal('fetch', fetched)
    convertToHtml.mockResolvedValue({ value: '<p>REVENUE TEAM WAITING LIST FORM</p><table><tr><td>Name</td></tr></table>', messages: [] })
    show({ form: { ok: true, form: uploaded() } })
    openMenu()
    await act(async () => {
      fireEvent.click(screen.getByRole('menuitem', { name: 'View' }))
    })
    const drawer = screen.getByRole('dialog', { name: 'Revenue_Team_Waiting_List_Form.docx' })
    await waitFor(() => expect(drawer.querySelector('iframe')).not.toBeNull())
    expect(fetched).toHaveBeenCalledWith('https://files.test/sign/form.docx?token=t', expect.anything())
    expect((convertToHtml.mock.calls[0][0] as { arrayBuffer: ArrayBuffer }).arrayBuffer.byteLength).toBe(4)
    const frame = drawer.querySelector('iframe')!
    expect(frame).toHaveAttribute('sandbox', '')
    expect(frame.getAttribute('srcdoc')).toContain('<p>REVENUE TEAM WAITING LIST FORM</p><table><tr><td>Name</td></tr></table>')
  })

  it('an old .doc cannot be drawn: Download', async () => {
    actions.viewFormTemplate.mockResolvedValue({ ok: true, url: 'https://files.test/sign/form.doc?token=t', name: 'Form.doc' })
    actions.waitingFormTemplateLink.mockResolvedValue({ ok: false, reason: 'The form could not be opened. Please try again.' })
    show({ form: { ok: true, form: uploaded('Form.doc', 'templates/x/Form.doc') } })
    openMenu('Form.doc')
    await act(async () => {
      fireEvent.click(screen.getByRole('menuitem', { name: 'View' }))
    })
    const drawer = screen.getByRole('dialog', { name: 'Form.doc' })
    expect(drawer).toHaveTextContent('No preview for .doc files.Download it to open.')
    expect(drawer.querySelector('iframe')).toBeNull()
    await act(async () => {
      fireEvent.click(within(drawer).getByRole('button', { name: 'Download' }))
    })
    expect(actions.waitingFormTemplateLink).toHaveBeenCalledTimes(1)
    expect(flash).toHaveBeenCalledWith('The form could not be opened. Please try again.')
  })

  it('says why when the file cannot be opened', async () => {
    actions.viewFormTemplate.mockResolvedValue({ ok: false, reason: 'No form has been uploaded — the built form is the one members download.' })
    show({ form: { ok: true, form: uploaded() } })
    openMenu()
    await act(async () => {
      fireEvent.click(screen.getByRole('menuitem', { name: 'View' }))
    })
    expect(within(screen.getByRole('dialog')).getByRole('alert')).toHaveTextContent('No form has been uploaded — the built form is the one members download.')
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
