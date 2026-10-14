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

// The uploaded form's right-click menu (2026-10-14, the user: "right click 然后按 view，同时也可以按
// remove。因为如果我 upload 错的话，我需要 remove 掉" — and the file with it).
describe('the uploaded form’s right-click menu', () => {
  const DOCX = 'templates/0b3fb828/Revenue_Team_Waiting_List_Form.docx'
  const uploaded = (name = 'Revenue_Team_Waiting_List_Form.docx', path = DOCX): WaitingForm => ({ ...V1, version: 2, templatePath: path, templateName: name })
  const chip = (name = 'Revenue_Team_Waiting_List_Form.docx') => screen.getByText(`Form: ${name}`).closest('label')!
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
    expect(screen.queryByText(/^Form: /)).toBeNull()
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
