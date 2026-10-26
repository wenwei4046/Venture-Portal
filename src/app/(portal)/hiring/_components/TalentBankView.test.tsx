import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HIRING_BOARD, TALENT_REASONS } from '@/test/hiring-board'
import type { Bank } from '@/lib/hiring/bank'
import type { HiringBoard } from '@/lib/hiring/types'

const actions = vi.hoisted(() => ({
  addHiringFileType: vi.fn(), hiringFileLink: vi.fn(), removeHiringTalent: vi.fn(), addBankFolder: vi.fn(), renameBankFolder: vi.fn(),
  deleteBankFolder: vi.fn(), moveBankTalent: vi.fn(), addBankTalent: vi.fn(), saveBankFile: vi.fn(), deleteBankFile: vi.fn(),
  moveBankFolder: vi.fn(), moveBankEveryone: vi.fn(), restoreBankItem: vi.fn(), deleteBankItemForever: vi.fn(), emptyBankBin: vi.fn(),
  setTalentReason: vi.fn(), addTalentReason: vi.fn(),
}))
const upload = vi.hoisted(() => ({ uploadHiringFile: vi.fn() }))
const { push, flash } = vi.hoisted(() => ({ push: vi.fn(), flash: vi.fn() }))
vi.mock('@/lib/hiring/actions', () => actions)
vi.mock('@/lib/hiring/upload', () => upload)
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))
vi.mock('@/components/hrv/toast', () => ({ flash }))

import TalentBankView from './TalentBankView'

// Hiring › Talent Bank as a Drive (2026-10-12): company › department › people, the companies and departments from the
// guest link's list and from folders HR makes, HR's folders holding people and files. The handoff's people (talVals),
// placed: Nur Iman in Revenue, Marcus Wong in Revenue › Seniors (a folder HR made), Joyce Tan in HR, Aisyah in Finance.
const CAR = '11111111-1111-4111-8111-111111111111'
const SENIORS = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
const HV_AT = 'company:hv'
const BANK: Bank = {
  hq: ['Revenue', 'HR', 'Finance', 'Marketing', 'IT', 'Director Office'],
  subs: [{ id: CAR, code: 'CAR', name: 'Carres', departments: ['Marketing', 'Sales'], removed: false }],
  folders: [{ id: SENIORS, name: 'Seniors', parent: 'dept:hv:Revenue', createdAt: '2026-10-12T08:00:00Z', createdBy: 'Grace Lim' }],
  files: [{ id: 'bf1', name: 'Walk-in CVs.pdf', contentType: 'application/pdf', size: 2048, parent: 'dept:hv:Finance', addedAt: '2026-10-12T08:00:00Z', addedBy: 'Grace Lim' }],
  places: { 'T-104': 'dept:hv:Revenue', 'T-103': 'dept:hv:HR', 'T-102': `folder:${SENIORS}`, 'T-101': 'dept:hv:Finance' },
  bin: [],
  readAt: '',
}

// The Bin (2026-10-13): a folder HR deleted from Revenue, a person kept in it (named through the Bin), a file from
// Carres › Sales and a file taken off Joyce Tan — each deleted on 12 Oct, gone for good on 11 Nov.
const INTERNS = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1'
const binned = { folderId: null, talentId: null, talentName: '', fileType: '', contentType: null, size: null,
  deletedAt: '2026-10-12T08:00:00Z', deletedBy: 'Grace Lim', expiresAt: '2026-11-11T08:00:00Z' }
const BIN_BANK: Bank = {
  ...BANK,
  bin: [
    { ...binned, id: 'x1', kind: 'folder', name: 'Interns', at: 'dept:hv:Revenue', folderId: INTERNS },
    { ...binned, id: 'x2', kind: 'talent', name: 'Sam Lee', at: `folder:${INTERNS}`, talentId: 'T-200' },
    { ...binned, id: 'x3', kind: 'file', name: 'Old CVs.pdf', at: `dept:${CAR}:Sales`, contentType: 'application/pdf', size: 1024 },
    { ...binned, id: 'x4', kind: 'talent_file', name: 'Joyce_IC.jpg', at: '', talentId: 'T-103', talentName: 'Joyce Tan', fileType: 'IC' },
  ],
}

beforeEach(() => {
  for (const fn of Object.values(actions)) fn.mockReset().mockResolvedValue({ ok: true, id: 'x' })
  upload.uploadHiringFile.mockReset().mockImplementation(async (f: File) => ({ ok: true, path: `files/u-${f.name}/${f.name}`, name: f.name }))
  push.mockReset()
  flash.mockReset()
  window.history.replaceState(null, '', '/hiring/talent')
})
afterEach(cleanup)

const view = (can = { create: true, edit: true }, initialAt?: string, bank: Bank = BANK, board: HiringBoard = HIRING_BOARD) =>
  render(<TalentBankView board={board} bank={bank} bankError={null} can={can} initialAt={initialAt} />)
const openCard = (name: RegExp) => fireEvent.click(screen.getByRole('button', { name }))
const sections = () => [...document.querySelectorAll('[class*="sectHead"]')].map(h => h.textContent)
const path = () => within(screen.getByRole('navigation', { name: 'Folder path' })).getAllByText(/./).map(x => x.textContent).filter(Boolean)
const pressNew = (item: string) => {
  fireEvent.click(screen.getByRole('button', { name: /New$/ }))
  fireEvent.click(screen.getByRole('menuitem', { name: item }))
}

describe('Hiring › Talent Bank as a Drive', () => {
  it('opens on the companies; a company on its departments; a department on its people and folders', () => {
    view()
    expect(sections()).toEqual(['Companies 2'])
    expect(screen.getByRole('button', { name: /^HOUZS Venture/ }).textContent).toContain('6 departments · 4 people')
    openCard(/^HOUZS Venture/)
    expect(sections()).toEqual(['Departments 6'])
    openCard(/^Revenue/)
    expect(path()).toEqual(['Talent Bank', 'HOUZS Venture', 'Revenue'])
    expect(sections()).toEqual(['Folders 1', 'People 1'])
    expect(screen.getByRole('button', { name: /^Nur Iman/ }).textContent).toContain('Interviewing · HR-203 · Revenue Specialist')
    openCard(/^Seniors/)
    expect(screen.getByRole('button', { name: /^Marcus Wong/ })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'HOUZS Venture' }))
    expect(sections()).toEqual(['Departments 6'])
  })

  it('keeps the place in the address, and opens one given there', () => {
    view(undefined, 'dept:hv:finance')
    expect(path()).toEqual(['Talent Bank', 'HOUZS Venture', 'Finance'])
    expect(new URLSearchParams(window.location.search).get('in')).toBe('dept:hv:Finance')
    expect(screen.getByRole('button', { name: /^Aisyah Rahman/ })).toBeInTheDocument()
    expect(screen.getByText('Walk-in CVs.pdf')).toBeInTheDocument()
  })

  it('searches the whole bank; a person found opens where they are kept, with their panel', () => {
    view()
    fireEvent.change(screen.getByPlaceholderText('Search the Talent Bank'), { target: { value: 'acca' } })
    const hit = screen.getByRole('button', { name: /Aisyah Rahman · Account Executive/ })
    expect(hit.textContent).toContain('HOUZS Venture › Finance')
    fireEvent.click(hit)
    expect(path()).toEqual(['Talent Bank', 'HOUZS Venture', 'Finance'])
    expect(within(screen.getByRole('dialog')).getByText('HOUZS Venture › Finance')).toBeInTheDocument()
  })

  it('a person’s ⋮: Open, Move to…, Remove from Talent Bank — asked twice, into the Bin', async () => {
    view(undefined, 'dept:hv:HR')
    fireEvent.click(screen.getByRole('button', { name: 'More actions for Joyce Tan' }))
    expect(screen.getAllByRole('menuitem').map(b => b.textContent)).toEqual(['Open', 'Move to…', 'Remove from Talent Bank'])
    fireEvent.click(screen.getByRole('menuitem', { name: 'Remove from Talent Bank' }))
    expect(actions.removeHiringTalent).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Confirm remove' }))
    await waitFor(() => expect(actions.removeHiringTalent).toHaveBeenCalledWith('T-103'))
    expect(flash).toHaveBeenCalledWith('Joyce Tan moved to the Bin')
  })

  it('Move to… lists every place, the one they are in marked; picked, they go there', async () => {
    view(undefined, 'dept:hv:Revenue')
    fireEvent.click(screen.getByRole('button', { name: 'More actions for Nur Iman' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Move to…' }))
    const win = within(screen.getByRole('dialog', { name: 'Move Nur Iman' }))
    expect(win.getByText('Now in HOUZS Venture › Revenue')).toBeInTheDocument()
    expect(win.getByRole('option', { name: /Revenue.*Here now/ })).toBeDisabled()
    fireEvent.change(win.getByLabelText('Find a place'), { target: { value: 'carres › sales' } })
    expect(win.getAllByRole('option').map(o => o.textContent)).toEqual(['Carres › Sales'])
    fireEvent.click(win.getByRole('option', { name: 'Carres › Sales' }))
    fireEvent.click(win.getByRole('button', { name: 'Move here' }))
    await waitFor(() => expect(actions.moveBankTalent).toHaveBeenCalledWith('T-104', `dept:${CAR}:Sales`))
    expect(flash).toHaveBeenCalledWith('Nur Iman moved to Carres › Sales')
  })

  // 2026-10-12, "change name, and move together".
  it('a folder’s ⋮: Rename, Move to… (with everything in it — never into itself), Move to Bin', async () => {
    view(undefined, 'dept:hv:Revenue')
    fireEvent.click(screen.getByRole('button', { name: 'More actions for Seniors' }))
    expect(screen.getAllByRole('menuitem').map(b => b.textContent)).toEqual(['Rename', 'Move to…', 'Move to Bin'])
    fireEvent.click(screen.getByRole('menuitem', { name: 'Move to…' }))
    const win = within(screen.getByRole('dialog', { name: 'Move Seniors' }))
    expect(win.getByText('Now in HOUZS Venture › Revenue — everything in it goes with it')).toBeInTheDocument()
    const places = win.getAllByRole('option').map(o => o.textContent)
    expect(places[0]).toBe('Talent Bank')
    expect(places).not.toContain('Seniors')
    fireEvent.click(win.getByRole('option', { name: 'Talent Bank' }))
    fireEvent.click(win.getByRole('button', { name: 'Move here' }))
    await waitFor(() => expect(actions.moveBankFolder).toHaveBeenCalledWith(SENIORS, 'root'))
    expect(flash).toHaveBeenCalledWith('Seniors moved to Talent Bank')
  })

  it('a department’s ⋮: Move everyone to… — its people, folders and files together', async () => {
    actions.moveBankEveryone.mockResolvedValue({ ok: true, people: 1, folders: 1, files: 0 })
    view(undefined, HV_AT)
    expect(screen.queryByRole('button', { name: 'More actions for HR' })).not.toBeNull()
    expect(screen.queryByRole('button', { name: 'More actions for Marketing' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'More actions for Revenue' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Move everyone to…' }))
    const win = within(screen.getByRole('dialog', { name: 'Move everyone in Revenue' }))
    expect(win.getByText('1 person, 1 folder — now in HOUZS Venture › Revenue')).toBeInTheDocument()
    expect(win.getAllByRole('option').map(o => o.textContent)).not.toContain('Seniors')
    fireEvent.change(win.getByLabelText('Find a place'), { target: { value: 'carres › sales' } })
    fireEvent.click(win.getByRole('option', { name: 'Carres › Sales' }))
    fireEvent.click(win.getByRole('button', { name: 'Move here' }))
    await waitFor(() => expect(actions.moveBankEveryone).toHaveBeenCalledWith('dept:hv:Revenue', `dept:${CAR}:Sales`))
    expect(flash).toHaveBeenCalledWith('1 person, 1 folder moved to Carres › Sales')
  })

  it('+ New › New folder: a name the place already has is refused, as the database does', async () => {
    view()
    pressNew('New folder')
    const win = within(screen.getByRole('dialog', { name: 'New folder' }))
    fireEvent.change(win.getByRole('textbox'), { target: { value: 'carres' } })
    fireEvent.click(win.getByRole('button', { name: 'Create' }))
    expect(win.getByRole('alert').textContent).toBe('carres is here already.')
    fireEvent.change(win.getByRole('textbox'), { target: { value: 'Ohana' } })
    fireEvent.click(win.getByRole('button', { name: 'Create' }))
    await waitFor(() => expect(actions.addBankFolder).toHaveBeenCalledWith('root', 'Ohana'))
  })

  it('+ New › Add talent only where people are kept, and keeps them there', async () => {
    view()
    fireEvent.click(screen.getByRole('button', { name: /New$/ }))
    expect(screen.getAllByRole('menuitem').map(b => b.textContent)).toEqual(['New folder', 'Upload files'])
    cleanup()
    view(undefined, `dept:${CAR}:Sales`)
    pressNew('Add talent')
    expect(screen.getByText('Carres › Sales')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Save talent' }))
    expect(screen.getByText('Add a name and the position they fit.')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Lee Mei' } })
    fireEvent.change(screen.getByLabelText('Good fit for (position)'), { target: { value: 'Promoter' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save talent' }))
    await waitFor(() => expect(actions.addBankTalent).toHaveBeenCalled())
    const [place, sent] = actions.addBankTalent.mock.calls[0] as [string, FormData]
    expect([place, sent.get('name'), sent.get('position'), sent.get('department')]).toEqual([`dept:${CAR}:Sales`, 'Lee Mei', 'Promoter', null])
    expect(flash).toHaveBeenCalledWith('Lee Mei added to Carres › Sales')
  })

  it('+ Add talent takes files: the first starts as the Résumé, the next must be told what it is', async () => {
    view(undefined, 'dept:hv:Finance')
    pressNew('Add talent')
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Lee Mei' } })
    fireEvent.change(screen.getByLabelText('Good fit for (position)'), { target: { value: 'Driver' } })
    fireEvent.change(screen.getByLabelText('Upload résumé'), { target: { files: [new File(['x'], 'Lee_CV.pdf')] } })
    expect((screen.getByLabelText('What Lee_CV.pdf is') as HTMLSelectElement).value).toBe('ft-resume')
    fireEvent.change(screen.getByLabelText('Add another file'), { target: { files: [new File(['x'], 'Lee_IC.jpg')] } })
    fireEvent.click(screen.getByRole('button', { name: 'Save talent' }))
    expect(screen.getByText('Pick what kind of file it is.')).toBeInTheDocument()
    expect(upload.uploadHiringFile).not.toHaveBeenCalled()
    fireEvent.change(screen.getByLabelText('What Lee_IC.jpg is'), { target: { value: 'ft-ic' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save talent' }))
    await waitFor(() => expect(actions.addBankTalent).toHaveBeenCalled())
    expect(JSON.parse(String((actions.addBankTalent.mock.calls[0][1] as FormData).get('files')))).toEqual([
      { path: 'files/u-Lee_CV.pdf/Lee_CV.pdf', name: 'Lee_CV.pdf', typeId: 'ft-resume' },
      { path: 'files/u-Lee_IC.jpg/Lee_IC.jpg', name: 'Lee_IC.jpg', typeId: 'ft-ic' },
    ])
  })

  it('+ New › Upload files keeps each file in the place; a file’s ⋮ views, downloads and moves it to the Bin', async () => {
    actions.hiringFileLink.mockResolvedValue({ ok: true, url: 'https://x/cvs', name: 'Walk-in CVs.pdf', preview: 'pdf' })
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)
    const { container } = view(undefined, 'dept:hv:Finance')
    const pick = container.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(pick, { target: { files: [new File(['x'], 'Batch.pdf', { type: 'application/pdf' })] } })
    await waitFor(() => expect(actions.saveBankFile).toHaveBeenCalledWith({ place: 'dept:hv:Finance', path: 'files/u-Batch.pdf/Batch.pdf', name: 'Batch.pdf', type: 'application/pdf', size: 1 }))
    fireEvent.click(screen.getByRole('button', { name: 'More actions for Walk-in CVs.pdf' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'View' }))
    await waitFor(() => expect(actions.hiringFileLink).toHaveBeenCalledWith('bank', 'bf1', false))
    expect(open).toHaveBeenCalledWith('https://x/cvs', '_blank', 'noopener')
    fireEvent.click(screen.getByRole('button', { name: 'More actions for Walk-in CVs.pdf' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Move to Bin' }))
    await waitFor(() => expect(actions.deleteBankFile).toHaveBeenCalledWith('bf1'))
    expect(flash).toHaveBeenCalledWith('Walk-in CVs.pdf moved to the Bin')
    open.mockRestore()
  })

  it('the panel says where they are kept, lists their files, and opens their page', async () => {
    view(undefined, 'dept:hv:HR')
    fireEvent.click(screen.getByRole('button', { name: /^Joyce Tan/ }))
    const panel = within(screen.getByRole('dialog'))
    expect(panel.getByText('HOUZS Venture › HR')).toBeInTheDocument()
    expect(panel.getByText('Saved to Talent Bank · 15 Sep 2026 · From HR-201 · request cancelled')).toBeInTheDocument()
    expect(within(panel.getByRole('group', { name: 'Files' })).getByText('Résumé')).toBeInTheDocument()
    fireEvent.click(panel.getByRole('button', { name: 'Full page →' }))
    expect(push).toHaveBeenCalledWith('/hiring/talent/T-103')
  })

  it('without Create or Edit it only reads', () => {
    view({ create: false, edit: false }, 'dept:hv:Revenue')
    expect(screen.queryByRole('button', { name: /New$/ })).toBeNull()
    expect(screen.queryByRole('button', { name: 'More actions for Seniors' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'More actions for Nur Iman' }))
    expect(screen.getAllByRole('menuitem').map(b => b.textContent)).toEqual(['Open'])
  })
})

// 2026-10-24 (IT-0008; the user: "最好的是它可以显示 candidate 是从哪里来的 … 包括 upload 的时候，最好能放一个 drop 掉的原因
// … 做成一个 dropdown"): why somebody is kept, and where they came from.
describe('why somebody is kept in the Talent Bank', () => {
  it('a card says first why they are kept — while a request has them, that they are interviewing; kept before it was asked, as before', () => {
    view(undefined, 'dept:hv:HR')
    expect(screen.getByRole('button', { name: /^Joyce Tan/ }).textContent).toContain('Other · HR Executive')
    cleanup()
    view(undefined, `folder:${SENIORS}`)
    expect(screen.getByRole('button', { name: /^Marcus Wong/ }).textContent).toContain('Failed interview · Senior Revenue Specialist')
    cleanup()
    view(undefined, 'dept:hv:Revenue')
    expect(screen.getByRole('button', { name: /^Nur Iman/ }).textContent).toContain('Interviewing · HR-203 · Revenue Specialist')
    cleanup()
    view(undefined, 'dept:hv:Finance')
    expect(screen.getByRole('button', { name: /^Aisyah Rahman/ }).textContent).toContain('Available · Account Executive')
  })

  it('the panel says why and where they came from; Edit changes why, as it is picked', async () => {
    actions.setTalentReason.mockResolvedValue({ ok: true })
    view(undefined, `folder:${SENIORS}`)
    fireEvent.click(screen.getByRole('button', { name: /^Marcus Wong/ }))
    const panel = within(screen.getByRole('dialog'))
    expect(panel.getByText('HR-198 · Senior Revenue Specialist')).toBeInTheDocument()
    const why = panel.getByLabelText('Why Marcus Wong is kept') as HTMLSelectElement
    expect([why.value, [...why.options].map(o => o.text)]).toEqual(['failed_interview', ['Not shortlisted', 'Failed interview', 'Not right now', 'Declined offer', 'Other']])
    fireEvent.change(why, { target: { value: 'not_right_now' } })
    await waitFor(() => expect(actions.setTalentReason).toHaveBeenCalledWith('T-102', 'not_right_now'))
    expect(flash).toHaveBeenCalledWith('Marcus Wong · Not right now')
  })

  it('somebody added in the bank came from it; kept before the reason was asked, Edit picks one; without Edit it is words', () => {
    view(undefined, 'dept:hv:Finance')
    fireEvent.click(screen.getByRole('button', { name: /^Aisyah Rahman/ }))
    let panel = within(screen.getByRole('dialog'))
    expect(panel.getByText('Added in Talent Bank')).toBeInTheDocument()
    expect((panel.getByLabelText('Why Aisyah Rahman is kept') as HTMLSelectElement).value).toBe('')
    expect(panel.getByRole('option', { name: 'Pick a reason…' })).toBeInTheDocument()
    cleanup()
    view({ create: false, edit: false }, 'dept:hv:HR')
    fireEvent.click(screen.getByRole('button', { name: /^Joyce Tan/ }))
    panel = within(screen.getByRole('dialog'))
    expect(panel.queryByLabelText('Why Joyce Tan is kept')).toBeNull()
    expect(panel.getByText('Other')).toBeInTheDocument()
  })

  it('+ New › Add talent asks why they are kept — Not right now unless another is picked', async () => {
    view(undefined, 'dept:hv:Finance')
    pressNew('Add talent')
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Lee Mei' } })
    fireEvent.change(screen.getByLabelText('Good fit for (position)'), { target: { value: 'Driver' } })
    const why = screen.getByLabelText('Reason *') as HTMLSelectElement
    expect(why.value).toBe('not_right_now')
    fireEvent.change(why, { target: { value: 'failed_interview' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save talent' }))
    await waitFor(() => expect(actions.addBankTalent).toHaveBeenCalled())
    expect((actions.addBankTalent.mock.calls[0][1] as FormData).get('reason')).toBe('failed_interview')
  })

  it('the search finds people by why they are kept', () => {
    view()
    fireEvent.change(screen.getByLabelText('Search the Talent Bank'), { target: { value: 'failed interview' } })
    expect(screen.getByRole('button', { name: /Marcus Wong · Senior Revenue Specialist/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Joyce Tan/ })).toBeNull()
  })
})

// 2026-10-13, the user: "make a bin, then that bin will last for 30 days. file that last for more than 30days in bin,
// will auto delete".
describe('the Talent Bank’s Bin', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-13T08:00:00Z'))
  })
  afterEach(() => {
    vi.useRealTimers()
  })
  const bin = () => fireEvent.click(screen.getByRole('button', { name: /^Bin/ }))

  it('the Bin button counts what is in it; the Bin lists its folders, people and files — where each was, the days left', () => {
    view(undefined, undefined, BIN_BANK)
    expect(screen.getByRole('button', { name: /^Bin/ }).textContent).toBe('Bin4')
    bin()
    expect(path()).toEqual(['Talent Bank', 'Bin'])
    expect(new URLSearchParams(window.location.search).get('in')).toBe('bin')
    expect(sections()).toEqual(['Folders 1', 'People 1', 'Files 2'])
    expect(screen.queryByRole('button', { name: /New$/ })).toBeNull()
    expect(screen.queryByPlaceholderText('Search the Talent Bank')).toBeNull()
    expect(screen.getByRole('button', { name: /^Interns/ }).textContent).toContain('HOUZS Venture › Revenue · 29 days left')
    // Sam Lee was in Interns, itself in the Bin: named through it.
    expect(screen.getByRole('button', { name: /^Sam Lee/ }).textContent).toContain('HOUZS Venture › Revenue › Interns · 29 days left')
    expect(screen.getByText('Carres › Sales')).toBeInTheDocument()
    expect(screen.getByText('IC · Joyce Tan')).toBeInTheDocument()
    expect(screen.getAllByText('29 days left')).toHaveLength(2)
    fireEvent.click(screen.getByRole('button', { name: 'Talent Bank' }))
    expect(sections()).toEqual(['Companies 2'])
  })

  // E2E 2026-10-13: a file put in the Bin after the page was drawn read "31 days left" — the days count from the read.
  it('counts the days from when the bank was read, not from when the page was first drawn', () => {
    view(undefined, 'bin', { ...BIN_BANK, readAt: '2026-10-12T08:00:00Z' })
    expect(screen.getAllByText('30 days left')).toHaveLength(2)
  })

  it('opens from the address, and says to restore what is pressed', () => {
    view(undefined, 'bin', BIN_BANK)
    expect(path()).toEqual(['Talent Bank', 'Bin'])
    fireEvent.click(screen.getByRole('button', { name: /^Interns/ }))
    expect(flash).toHaveBeenCalledWith('Interns is in the Bin — restore it to open it.')
    expect(path()).toEqual(['Talent Bank', 'Bin'])
  })

  it('⋮ › Restore puts it back, and says where', async () => {
    actions.restoreBankItem.mockResolvedValue({ ok: true, label: 'HOUZS Venture › Revenue' })
    view(undefined, 'bin', BIN_BANK)
    fireEvent.click(screen.getByRole('button', { name: 'More actions for Interns' }))
    expect(screen.getAllByRole('menuitem').map(b => b.textContent)).toEqual(['Restore', 'Delete forever'])
    fireEvent.click(screen.getByRole('menuitem', { name: 'Restore' }))
    await waitFor(() => expect(actions.restoreBankItem).toHaveBeenCalledWith('x1'))
    expect(flash).toHaveBeenCalledWith('Interns restored to HOUZS Venture › Revenue')
  })

  it('⋮ › Delete forever is asked twice', async () => {
    actions.deleteBankItemForever.mockResolvedValue({ ok: true })
    view(undefined, 'bin', BIN_BANK)
    fireEvent.click(screen.getByRole('button', { name: 'More actions for Old CVs.pdf' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete forever' }))
    expect(actions.deleteBankItemForever).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Confirm delete forever' }))
    await waitFor(() => expect(actions.deleteBankItemForever).toHaveBeenCalledWith('x3'))
    expect(flash).toHaveBeenCalledWith('Old CVs.pdf deleted forever')
  })

  it('Empty bin is asked twice', async () => {
    actions.emptyBankBin.mockResolvedValue({ ok: true, count: 4 })
    view(undefined, 'bin', BIN_BANK)
    fireEvent.click(screen.getByRole('button', { name: /Empty bin/ }))
    expect(actions.emptyBankBin).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: /Confirm empty bin/ }))
    await waitFor(() => expect(actions.emptyBankBin).toHaveBeenCalled())
    expect(flash).toHaveBeenCalledWith('Bin emptied · 4 items deleted forever')
  })

  it('a refusal is said in the database’s words', async () => {
    actions.restoreBankItem.mockResolvedValue({ ok: false, reason: 'Interns is there already — rename one first.' })
    view(undefined, 'bin', BIN_BANK)
    fireEvent.click(screen.getByRole('button', { name: 'More actions for Interns' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Restore' }))
    await waitFor(() => expect(flash).toHaveBeenCalledWith('Interns is there already — rename one first.'))
  })

  it('an empty Bin says so; without Edit there is nothing to press', () => {
    view(undefined, 'bin')
    expect(screen.getByText('The Bin is empty.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Empty bin/ })).toBeNull()
    cleanup()
    view({ create: false, edit: false }, 'bin', BIN_BANK)
    expect(sections()).toEqual(['Folders 1', 'People 1', 'Files 2'])
    expect(screen.queryByRole('button', { name: 'More actions for Interns' })).toBeNull()
    expect(screen.queryByRole('button', { name: /Empty bin/ })).toBeNull()
  })
})

// 2026-10-24 — asked whether HR should manage the reasons like File types, the user: "1, yes do with same". HR has renamed
// Failed interview, turned Not right now off and added Salary too high (mig 20261025021500).
describe('the reasons are HR’s list', () => {
  const managed: HiringBoard = {
    ...HIRING_BOARD,
    talentReasons: [
      ...TALENT_REASONS.map(r => (r.id === 'failed_interview' ? { ...r, name: 'Interview failed' } : r.id === 'not_right_now' ? { ...r, active: false } : r)),
      { id: 'r-salary', name: 'Salary too high', active: true, used: 0 },
    ],
  }
  const choices = (select: HTMLElement) => [...(select as HTMLSelectElement).options].map(o => o.text)

  it('a reason renamed reads its new name; one turned off leaves the picker, the person kept with it keeps it', () => {
    view(undefined, `folder:${SENIORS}`, BANK, managed)
    expect(screen.getByRole('button', { name: /^Marcus Wong/ }).textContent).toContain('Interview failed · Senior Revenue Specialist')
    fireEvent.click(screen.getByRole('button', { name: /^Marcus Wong/ }))
    expect(choices(within(screen.getByRole('dialog')).getByLabelText('Why Marcus Wong is kept')))
      .toEqual(['Not shortlisted', 'Interview failed', 'Declined offer', 'Other', 'Salary too high'])
    cleanup()
    view(undefined, 'dept:hv:Revenue', BANK, managed)
    fireEvent.click(screen.getByRole('button', { name: /^Nur Iman/ }))
    const hers = within(screen.getByRole('dialog')).getByLabelText('Why Nur Iman is kept') as HTMLSelectElement
    expect([hers.value, choices(hers)]).toEqual(['not_right_now', ['Not shortlisted', 'Interview failed', 'Not right now', 'Declined offer', 'Other', 'Salary too high']])
  })

  it('+ New › Add talent starts on the first that is on, and "+ Add a new reason…" names one — made on Save', async () => {
    actions.addTalentReason.mockResolvedValue({ ok: true, id: 'r-new' })
    view(undefined, 'dept:hv:Finance', BANK, managed)
    pressNew('Add talent')
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Lee Mei' } })
    fireEvent.change(screen.getByLabelText('Good fit for (position)'), { target: { value: 'Driver' } })
    const why = screen.getByLabelText('Reason *') as HTMLSelectElement
    expect([why.value, choices(why)]).toEqual(['not_shortlisted', ['Not shortlisted', 'Interview failed', 'Declined offer', 'Other', 'Salary too high', '+ Add a new reason…']])
    fireEvent.change(why, { target: { value: '__new' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save talent' }))
    expect(screen.getByText('Name the new reason.')).toBeInTheDocument()
    expect(actions.addBankTalent).not.toHaveBeenCalled()
    fireEvent.change(screen.getByLabelText('New reason *'), { target: { value: 'Relocating' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save talent' }))
    await waitFor(() => expect(actions.addBankTalent).toHaveBeenCalled())
    expect(actions.addTalentReason).toHaveBeenCalledWith('Relocating')
    expect((actions.addBankTalent.mock.calls[0][1] as FormData).get('reason')).toBe('r-new')
  })

  it('a new name the list has on already is that reason — nothing is added', async () => {
    view(undefined, 'dept:hv:Finance', BANK, managed)
    pressNew('Add talent')
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Lee Mei' } })
    fireEvent.change(screen.getByLabelText('Good fit for (position)'), { target: { value: 'Driver' } })
    fireEvent.change(screen.getByLabelText('Reason *'), { target: { value: '__new' } })
    fireEvent.change(screen.getByLabelText('New reason *'), { target: { value: ' salary TOO high' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save talent' }))
    await waitFor(() => expect(actions.addBankTalent).toHaveBeenCalled())
    expect(actions.addTalentReason).not.toHaveBeenCalled()
    expect((actions.addBankTalent.mock.calls[0][1] as FormData).get('reason')).toBe('r-salary')
  })

  it('without Edit there is no "+ Add a new reason…"', () => {
    view({ create: true, edit: false }, 'dept:hv:Finance', BANK, managed)
    pressNew('Add talent')
    expect(choices(screen.getByLabelText('Reason *'))).not.toContain('+ Add a new reason…')
  })

  it('the search finds people by HR’s words for why they are kept', () => {
    view(undefined, undefined, BANK, managed)
    fireEvent.change(screen.getByLabelText('Search the Talent Bank'), { target: { value: 'interview failed' } })
    expect(screen.getByRole('button', { name: /Marcus Wong · Senior Revenue Specialist/ })).toBeInTheDocument()
  })
})
