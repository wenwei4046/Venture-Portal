import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HIRING_BOARD } from '@/test/hiring-board'
import type { Bank } from '@/lib/hiring/bank'

const actions = vi.hoisted(() => ({
  addHiringFileType: vi.fn(), hiringFileLink: vi.fn(), removeHiringTalent: vi.fn(), addBankFolder: vi.fn(), renameBankFolder: vi.fn(),
  deleteBankFolder: vi.fn(), moveBankTalent: vi.fn(), addBankTalent: vi.fn(), saveBankFile: vi.fn(), deleteBankFile: vi.fn(),
  moveBankFolder: vi.fn(), moveBankEveryone: vi.fn(),
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
}

beforeEach(() => {
  for (const fn of Object.values(actions)) fn.mockReset().mockResolvedValue({ ok: true, id: 'x' })
  upload.uploadHiringFile.mockReset().mockImplementation(async (f: File) => ({ ok: true, path: `files/u-${f.name}/${f.name}`, name: f.name }))
  push.mockReset()
  flash.mockReset()
  window.history.replaceState(null, '', '/hiring/talent')
})
afterEach(cleanup)

const view = (can = { create: true, edit: true }, initialAt?: string) =>
  render(<TalentBankView board={HIRING_BOARD} bank={BANK} bankError={null} can={can} initialAt={initialAt} />)
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
    expect(screen.getByRole('button', { name: /^Nur Iman/ }).textContent).toContain('Revenue Specialist · Interviewing · HR-203')
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

  it('a person’s ⋮: Open, Move to…, Remove from Talent Bank — asked twice', async () => {
    view(undefined, 'dept:hv:HR')
    fireEvent.click(screen.getByRole('button', { name: 'More actions for Joyce Tan' }))
    expect(screen.getAllByRole('menuitem').map(b => b.textContent)).toEqual(['Open', 'Move to…', 'Remove from Talent Bank'])
    fireEvent.click(screen.getByRole('menuitem', { name: 'Remove from Talent Bank' }))
    expect(actions.removeHiringTalent).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Confirm remove' }))
    await waitFor(() => expect(actions.removeHiringTalent).toHaveBeenCalledWith('T-103'))
    expect(flash).toHaveBeenCalledWith('Joyce Tan removed from the Talent Bank')
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
  it('a folder’s ⋮: Rename, Move to… (with everything in it — never into itself), Delete', async () => {
    view(undefined, 'dept:hv:Revenue')
    fireEvent.click(screen.getByRole('button', { name: 'More actions for Seniors' }))
    expect(screen.getAllByRole('menuitem').map(b => b.textContent)).toEqual(['Rename', 'Move to…', 'Delete'])
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

  it('+ New › Upload files keeps each file in the place; a file’s ⋮ views, downloads and deletes it', async () => {
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
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Confirm delete' }))
    await waitFor(() => expect(actions.deleteBankFile).toHaveBeenCalledWith('bf1'))
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
