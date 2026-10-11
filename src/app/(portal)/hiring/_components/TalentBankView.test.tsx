import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HIRING_BOARD } from '@/test/hiring-board'

const actions = vi.hoisted(() => ({ addHiringFileType: vi.fn(), hiringFileLink: vi.fn(), removeHiringTalent: vi.fn(), saveHiringTalent: vi.fn() }))
const upload = vi.hoisted(() => ({ uploadHiringFile: vi.fn() }))
const { push, flash } = vi.hoisted(() => ({ push: vi.fn(), flash: vi.fn() }))
vi.mock('@/lib/hiring/actions', () => actions)
vi.mock('@/lib/hiring/upload', () => upload)
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))
vi.mock('@/components/hrv/toast', () => ({ flash }))

import TalentBankView from './TalentBankView'

beforeEach(() => {
  for (const fn of Object.values(actions)) fn.mockReset().mockResolvedValue({ ok: true, id: 'x' })
  upload.uploadHiringFile.mockReset().mockImplementation(async (f: File) => ({ ok: true, path: `files/u-${f.name}/${f.name}`, name: f.name }))
  push.mockReset()
  flash.mockReset()
})
afterEach(cleanup)

const tree = () => within(screen.getByRole('region', { name: 'Departments' }))
const names = () => screen.getAllByRole('row').slice(1).map(r => r.querySelector('span span')?.textContent)
const view = (can = { create: true, edit: true }) => render(<TalentBankView board={HIRING_BOARD} can={can} />)

// The handoff's Talent Bank (Revenue App.dc.html talVals).
describe('Hiring › Talent Bank', () => {
  it('everybody, then a department, then a position under it', () => {
    view()
    expect(names()).toEqual(['Nur Iman', 'Joyce Tan', 'Marcus Wong', 'Aisyah Rahman'])
    expect(screen.getByText('4 people')).toBeInTheDocument()
    fireEvent.click(tree().getByRole('button', { name: /Revenue/ }))
    expect(names()).toEqual(['Nur Iman', 'Marcus Wong'])
    fireEvent.click(tree().getByRole('button', { name: /^Senior Revenue Specialist/ }))
    expect(names()).toEqual(['Marcus Wong'])
    expect(screen.getByText('Revenue · 1 person')).toBeInTheDocument()
  })

  it('searches names, positions and notes', () => {
    view()
    fireEvent.change(screen.getByPlaceholderText('Search name or notes'), { target: { value: 'acca' } })
    expect(names()).toEqual(['Aisyah Rahman'])
    expect(tree().getByRole('button', { name: /All talent/ }).textContent).toBe('All talent1')
  })

  it('says who is interviewing for an open request', () => {
    view()
    expect(screen.getByText('Interviewing · HR-203')).toBeInTheDocument()
    expect(screen.getAllByText('Available')).toHaveLength(3)
  })

  it('right-click: Open, or Remove from Talent Bank', async () => {
    view()
    fireEvent.contextMenu(screen.getByText('Joyce Tan').closest('[role="row"]')!)
    expect(screen.getAllByRole('menuitem').map(b => b.textContent)).toEqual(['Open', 'Remove from Talent Bank'])
    fireEvent.click(screen.getByRole('menuitem', { name: 'Remove from Talent Bank' }))
    await waitFor(() => expect(actions.removeHiringTalent).toHaveBeenCalledWith('T-103'))
    expect(flash).toHaveBeenCalledWith('Joyce Tan removed from the Talent Bank')
  })

  it('the panel asks twice before removing, and opens the full page', async () => {
    view()
    fireEvent.click(screen.getByText('Joyce Tan'))
    const panel = screen.getByRole('dialog')
    expect(within(panel).getByText('Saved to Talent Bank · 15 Sep 2026 · From HR-201 · request cancelled')).toBeInTheDocument()
    fireEvent.click(within(panel).getByRole('button', { name: 'Remove' }))
    expect(actions.removeHiringTalent).not.toHaveBeenCalled()
    fireEvent.click(within(panel).getByRole('button', { name: 'Confirm remove' }))
    await waitFor(() => expect(actions.removeHiringTalent).toHaveBeenCalledWith('T-103'))
  })

  it('+ Add talent needs a name and what they fit', async () => {
    view()
    fireEvent.click(screen.getByRole('button', { name: '+ Add talent' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save talent' }))
    expect(screen.getByText('Add a name and the position they fit.')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Lee Mei' } })
    fireEvent.change(screen.getByLabelText('Good fit for (position)'), { target: { value: 'Driver' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save talent' }))
    await waitFor(() => expect(actions.saveHiringTalent).toHaveBeenCalled())
    const sent = actions.saveHiringTalent.mock.calls[0][0] as FormData
    expect([sent.get('name'), sent.get('position'), sent.get('department')]).toEqual(['Lee Mei', 'Driver', 'Revenue'])
  })

  // Several files each, each with a type (2026-10-11, mig 20261011160000).
  it('the panel lists their files with their types; View opens one in a new tab', async () => {
    actions.hiringFileLink.mockResolvedValue({ ok: true, url: 'https://x/joyce', name: 'Joyce_Tan_CV.pdf', preview: 'pdf' })
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)
    view()
    fireEvent.click(screen.getByText('Joyce Tan'))
    const panel = within(screen.getByRole('dialog'))
    const files = within(panel.getByRole('group', { name: 'Files' }))
    expect(files.getByText('Joyce_Tan_CV.pdf')).toBeInTheDocument()
    expect(files.getByText('Résumé')).toBeInTheDocument()
    fireEvent.click(files.getByRole('button', { name: 'View Joyce_Tan_CV.pdf' }))
    await waitFor(() => expect(actions.hiringFileLink).toHaveBeenCalledWith('file', 'f-T-103'))
    expect(open).toHaveBeenCalledWith('https://x/joyce', '_blank', 'noopener')
    open.mockRestore()
  })

  it('+ Add talent takes files: the first starts as the Résumé, the next must be told what it is', async () => {
    view()
    fireEvent.click(screen.getByRole('button', { name: '+ Add talent' }))
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Lee Mei' } })
    fireEvent.change(screen.getByLabelText('Good fit for (position)'), { target: { value: 'Driver' } })
    fireEvent.change(screen.getByLabelText('Upload résumé'), { target: { files: [new File(['x'], 'Lee_CV.pdf')] } })
    expect((screen.getByLabelText('What Lee_CV.pdf is') as HTMLSelectElement).value).toBe('ft-resume')
    fireEvent.change(screen.getByLabelText('Add another file'), { target: { files: [new File(['x'], 'Lee_IC.jpg')] } })
    expect((screen.getByLabelText('What Lee_IC.jpg is') as HTMLSelectElement).value).toBe('')
    fireEvent.click(screen.getByRole('button', { name: 'Save talent' }))
    expect(screen.getByText('Pick what kind of file it is.')).toBeInTheDocument()
    expect(upload.uploadHiringFile).not.toHaveBeenCalled()
    fireEvent.change(screen.getByLabelText('What Lee_IC.jpg is'), { target: { value: 'ft-ic' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save talent' }))
    await waitFor(() => expect(actions.saveHiringTalent).toHaveBeenCalled())
    const sent = actions.saveHiringTalent.mock.calls[0][0] as FormData
    expect(JSON.parse(String(sent.get('files')))).toEqual([
      { path: 'files/u-Lee_CV.pdf/Lee_CV.pdf', name: 'Lee_CV.pdf', typeId: 'ft-resume' },
      { path: 'files/u-Lee_IC.jpg/Lee_IC.jpg', name: 'Lee_IC.jpg', typeId: 'ft-ic' },
    ])
  })

  it('a file left out never goes up', async () => {
    view()
    fireEvent.click(screen.getByRole('button', { name: '+ Add talent' }))
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Lee Mei' } })
    fireEvent.change(screen.getByLabelText('Good fit for (position)'), { target: { value: 'Driver' } })
    fireEvent.change(screen.getByLabelText('Upload résumé'), { target: { files: [new File(['x'], 'Wrong.pdf')] } })
    fireEvent.click(screen.getByRole('button', { name: 'Leave out Wrong.pdf' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save talent' }))
    await waitFor(() => expect(actions.saveHiringTalent).toHaveBeenCalled())
    expect(upload.uploadHiringFile).not.toHaveBeenCalled()
    expect(JSON.parse(String((actions.saveHiringTalent.mock.calls[0][0] as FormData).get('files')))).toEqual([])
  })

  it('without Create or Edit it only reads', () => {
    view({ create: false, edit: false })
    expect(screen.queryByRole('button', { name: '+ Add talent' })).toBeNull()
    fireEvent.contextMenu(screen.getByText('Joyce Tan').closest('[role="row"]')!)
    expect(screen.getAllByRole('menuitem').map(b => b.textContent)).toEqual(['Open'])
  })

  // The parity audit (2026-10-11): a department's positions sat 4px high (a wrapper swallowed the tree's gap), and
  // an opened department with nobody in it drew nothing where the prototype draws its (empty) block.
  it('a department and its positions stand in the tree itself; an opened empty department keeps its block', () => {
    view()
    const region = screen.getByRole('region', { name: 'Departments' })
    const revenue = within(region).getByRole('button', { name: /^Revenue/ })
    expect(revenue.parentElement).toBe(region)
    fireEvent.click(revenue)
    const kids = revenue.nextElementSibling as HTMLElement
    expect(kids.parentElement).toBe(region)
    expect(within(kids).getAllByRole('button').map(b => b.textContent)).toEqual(['Revenue Specialist1', 'Senior Revenue Specialist1'])
    fireEvent.change(screen.getByPlaceholderText('Search name or notes'), { target: { value: 'zzz' } })
    const empty = revenue.nextElementSibling as HTMLElement
    expect(empty.tagName).toBe('DIV')
    expect(empty.childElementCount).toBe(0)
  })
})
