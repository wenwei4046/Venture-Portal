import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HIRING_BOARD } from '@/test/hiring-board'
import type { HiringBoard, HiringRequest } from '@/lib/hiring/types'

const actions = vi.hoisted(() => ({
  addHiringFileType: vi.fn(),
  hiringFileLink: vi.fn(),
  inviteHiringTalent: vi.fn(),
  saveCandidateFields: vi.fn(),
  saveHiringCandidate: vi.fn(),
  saveHiringTalent: vi.fn(),
  setCandidateStage: vi.fn(),
}))
const upload = vi.hoisted(() => ({ uploadHiringFile: vi.fn() }))
const { push, flash } = vi.hoisted(() => ({ push: vi.fn(), flash: vi.fn() }))
vi.mock('@/lib/hiring/actions', () => actions)
vi.mock('@/lib/hiring/upload', () => upload)
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))
vi.mock('@/components/hrv/toast', () => ({ flash }))

import Candidates from './Candidates'

// Daniel Lee on HR-203 keeps his résumé and, here, his IC too (mig 20261011160000: several files, each with a type).
const IC = { id: 'f-ic', typeId: 'ft-ic', type: 'IC', resume: false, name: 'Daniel_IC.jpg', addedAt: '2026-10-10T04:00:00.000Z', addedBy: 'Grace Lim' }
const base = HIRING_BOARD.requests.find(r => r.id === 'HR-203')!
const request: HiringRequest = {
  ...base,
  candidates: base.candidates.map(c => (c.name === 'Daniel Lee' ? { ...c, files: [...c.files, IC] } : c)),
}
const board: HiringBoard = { ...HIRING_BOARD, requests: HIRING_BOARD.requests.map(r => (r.id === request.id ? request : r)) }
const daniel = request.candidates.find(c => c.name === 'Daniel Lee')!
const pdf = (name: string) => new File(['%PDF'], name, { type: 'application/pdf' })

const show = (can = { create: true, edit: true, approve: true }) => render(<Candidates board={board} request={request} can={can} talentPage />)

beforeEach(() => {
  for (const fn of Object.values(actions)) fn.mockReset().mockResolvedValue({ ok: true })
  // 'none': happy-dom would really fetch a framed PDF's link.
  actions.hiringFileLink.mockImplementation(async (_kind: string, id: string) => ({ ok: true, url: `https://x/${id}`, name: id, preview: 'none' }))
  upload.uploadHiringFile.mockReset().mockImplementation(async (f: File) => ({ ok: true, path: `files/u-${f.name}/${f.name}`, name: f.name }))
  push.mockReset()
  flash.mockReset()
})
afterEach(cleanup)

describe('Hiring › a request › candidates’ files', () => {
  it('one résumé: the button says résumé; several files: it says files, and the drawer opens on the résumé', async () => {
    show()
    expect(screen.getByRole('button', { name: 'View Nur Iman\'s résumé' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'View Daniel Lee\'s files' }))
    const drawer = within(screen.getByRole('dialog'))
    await waitFor(() => expect(actions.hiringFileLink).toHaveBeenCalledWith('file', 'f-C-1'))
    expect(drawer.getByText('Résumé · Daniel_Lee_CV.pdf', { selector: 'div' })).toBeInTheDocument()
    const pills = drawer.getByRole('group', { name: 'Files' })
    expect(within(pills).getAllByRole('button').map(b => [b.textContent, b.getAttribute('aria-pressed')])).toEqual([
      ['Résumé · Daniel_Lee_CV.pdf', 'true'], ['IC · Daniel_IC.jpg', 'false'],
    ])
    fireEvent.click(within(pills).getByRole('button', { name: 'IC · Daniel_IC.jpg' }))
    await waitFor(() => expect(actions.hiringFileLink).toHaveBeenCalledWith('file', 'f-ic'))
    const assign = vi.fn()
    vi.stubGlobal('location', { ...window.location, assign })
    fireEvent.click(drawer.getByRole('button', { name: 'Download' }))
    await waitFor(() => expect(actions.hiringFileLink).toHaveBeenCalledWith('file', 'f-ic', true))
    expect(assign).toHaveBeenCalledWith('https://x/f-ic')
    vi.unstubAllGlobals()
  })

  it('⋯ Download résumé downloads the newest résumé, on the trail', async () => {
    const assign = vi.fn()
    vi.stubGlobal('location', { ...window.location, assign })
    show()
    fireEvent.click(screen.getByRole('button', { name: 'More for Daniel Lee' }))
    fireEvent.click(screen.getByRole('menuitem', { name: /Download résumé/ }))
    await waitFor(() => expect(actions.hiringFileLink).toHaveBeenCalledWith('candidate', daniel.id, true))
    vi.unstubAllGlobals()
  })

  it('Edit details: a file on record is removed on Save (Undo keeps it); a new one waits for its type', async () => {
    show()
    fireEvent.click(screen.getByRole('button', { name: 'More for Daniel Lee' }))
    fireEvent.click(screen.getByRole('menuitem', { name: /Edit details/ }))
    const win = within(screen.getByRole('dialog', { name: 'Edit candidate' }))
    const files = within(win.getByRole('group', { name: 'Files' }))
    expect(files.getByText('Daniel_Lee_CV.pdf')).toBeInTheDocument()
    fireEvent.click(files.getByRole('button', { name: 'Remove Daniel_IC.jpg' }))
    expect(files.getByText('IC · removed on Save')).toBeInTheDocument()
    fireEvent.click(files.getByRole('button', { name: 'Keep Daniel_IC.jpg' }))
    expect(files.queryByText('IC · removed on Save')).toBeNull()
    fireEvent.click(files.getByRole('button', { name: 'Remove Daniel_IC.jpg' }))
    // He has a résumé: a new file starts with no type.
    fireEvent.change(files.getByLabelText('Add another file'), { target: { files: [pdf('Daniel_Cert.pdf')] } })
    expect((files.getByLabelText('What Daniel_Cert.pdf is') as HTMLSelectElement).value).toBe('')
    fireEvent.click(win.getByRole('button', { name: 'Save' }))
    expect(flash).toHaveBeenCalledWith('Pick what kind of file it is.')
    expect(actions.saveHiringCandidate).not.toHaveBeenCalled()
    fireEvent.change(files.getByLabelText('What Daniel_Cert.pdf is'), { target: { value: 'ft-cert' } })
    fireEvent.click(win.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(actions.saveHiringCandidate).toHaveBeenCalled())
    const form = actions.saveHiringCandidate.mock.calls[0][0] as FormData
    expect(form.get('candidate')).toBe(daniel.id)
    expect(JSON.parse(String(form.get('files')))).toEqual([{ path: 'files/u-Daniel_Cert.pdf/Daniel_Cert.pdf', name: 'Daniel_Cert.pdf', typeId: 'ft-cert' }])
    expect(JSON.parse(String(form.get('remove')))).toEqual(['f-ic'])
    expect(flash).toHaveBeenCalledWith('Daniel Lee saved')
  })

  it('Add candidate: the first file is the résumé; without Edit no new type can be named', async () => {
    show({ create: true, edit: false, approve: false })
    fireEvent.click(screen.getByRole('button', { name: 'Add a candidate' }))
    fireEvent.click(screen.getByRole('menuitem', { name: /New candidate/ }))
    const win = within(screen.getByRole('dialog', { name: 'Add candidate' }))
    fireEvent.change(win.getByLabelText('Upload résumé'), { target: { files: [pdf('Ali_CV.pdf')] } })
    const type = win.getByLabelText('What Ali_CV.pdf is') as HTMLSelectElement
    expect(type.value).toBe('ft-resume')
    expect([...type.options].map(o => o.text)).not.toContain('+ Add a new file type…')
    fireEvent.change(win.getAllByRole('textbox')[0], { target: { value: 'Ali Hassan' } })
    fireEvent.click(win.getByRole('button', { name: 'Add candidate' }))
    await waitFor(() => expect(actions.saveHiringCandidate).toHaveBeenCalled())
    const form = actions.saveHiringCandidate.mock.calls[0][0] as FormData
    expect([form.get('candidate'), form.get('remove'), form.get('name')]).toEqual([null, null, 'Ali Hassan'])
    expect(JSON.parse(String(form.get('files')))).toEqual([{ path: 'files/u-Ali_CV.pdf/Ali_CV.pdf', name: 'Ali_CV.pdf', typeId: 'ft-resume' }])
  })

  it('an upload refused stops the save and says why', async () => {
    upload.uploadHiringFile.mockResolvedValue({ ok: false, reason: 'A file is a PDF, a Word document or an image.' })
    show()
    fireEvent.click(screen.getByRole('button', { name: 'Add a candidate' }))
    fireEvent.click(screen.getByRole('menuitem', { name: /New candidate/ }))
    const win = within(screen.getByRole('dialog', { name: 'Add candidate' }))
    fireEvent.change(win.getAllByRole('textbox')[0], { target: { value: 'Ali Hassan' } })
    fireEvent.change(win.getByLabelText('Upload résumé'), { target: { files: [pdf('notes.zip')] } })
    fireEvent.click(win.getByRole('button', { name: 'Add candidate' }))
    await waitFor(() => expect(flash).toHaveBeenCalledWith('A file is a PDF, a Word document or an image.'))
    expect(actions.saveHiringCandidate).not.toHaveBeenCalled()
  })
})

// The user (2026-10-12): at the foot of a request the + menu ran off the page, and the page would not
// scroll to it. happy-dom lays nothing out, so every box sits at 700–730 of a 760px window and a menu
// 80px tall sits 6px under it — or, turned over, 6px above (`menu-place.ts`, unit-tested there).
describe('Hiring › a request › menus at the foot of the page', () => {
  const rect = (top: number, height: number) =>
    ({ top, bottom: top + height, height, left: 0, right: 220, width: 220, x: 0, y: top, toJSON: () => ({}) }) as DOMRect
  const tall = window.innerHeight
  beforeEach(() => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      if (this.getAttribute('role') !== 'menu') return rect(700, 30)
      return this.dataset.up === 'true' ? rect(700 - 6 - 80, 80) : rect(736, 80)
    })
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 760 })
  })
  afterEach(() => {
    vi.restoreAllMocks()
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: tall })
  })

  it('+ opens New candidate · Pick from Talent Bank above the button', () => {
    show()
    fireEvent.click(screen.getByRole('button', { name: 'Add a candidate' }))
    expect(screen.getByRole('menu')).toHaveAttribute('data-up', 'true')
    expect(within(screen.getByRole('menu')).getAllByRole('menuitem').map(b => b.textContent)).toEqual(['＋New candidate', '⇣Pick from Talent Bank'])
  })

  it("a candidate's ⋯ does the same, and still does once Change status opens under it", () => {
    show()
    fireEvent.click(screen.getByRole('button', { name: 'More for Daniel Lee' }))
    expect(screen.getByRole('menu')).toHaveAttribute('data-up', 'true')
    fireEvent.click(screen.getByRole('menuitem', { name: /Change status/ }))
    expect(screen.getByRole('menu')).toHaveAttribute('data-up', 'true')
  })
})
