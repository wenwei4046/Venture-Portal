import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HIRING_BOARD, TALENT_REASONS } from '@/test/hiring-board'
import type { HiringBoard, HiringRequest } from '@/lib/hiring/types'

const actions = vi.hoisted(() => ({
  addHiringFileType: vi.fn(),
  hiringFileLink: vi.fn(),
  inviteHiringTalent: vi.fn(),
  saveCandidateFields: vi.fn(),
  saveHiringCandidate: vi.fn(),
  saveHiringTalent: vi.fn(),
  setCandidateStage: vi.fn(),
  addTalentReason: vi.fn(),
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

// IT-0008 (2026-10-24): "after the candidate is failed with interview or not shortlisted, the candidate will be
// dissapear within the table ish view, where instead of entirely dissapear the candidate will be placed within the
// Talent Bank". HR-202 had Siti Aisyah hired and Nur Iman not selected (kept in the bank: Not right now).
describe('Hiring › a request › Not selected goes to the Talent Bank', () => {
  const filled = HIRING_BOARD.requests.find(r => r.id === 'HR-202')!

  it('the list counts and shows the ones still in the running; the not selected fold at its foot, each with why', () => {
    render(<Candidates board={HIRING_BOARD} request={filled} can={{ create: true, edit: true, approve: true }} talentPage />)
    expect(screen.getByText('Candidates · 1')).toBeInTheDocument()
    expect(screen.getByText('Siti Aisyah')).toBeInTheDocument()
    expect(screen.queryByText('Nur Iman')).toBeNull()
    const fold = screen.getByRole('button', { name: /Not selected · 1/ })
    expect(fold).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(fold)
    expect(fold).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('Nur Iman')).toBeInTheDocument()
    expect(screen.getByText('Not right now')).toBeInTheDocument()
    // Their ⋯ opens them in the bank — or brings them back.
    fireEvent.click(screen.getByRole('button', { name: 'More for Nur Iman' }))
    fireEvent.click(screen.getByRole('menuitem', { name: /Open in Talent Bank/ }))
    expect(push).toHaveBeenCalledWith('/hiring/talent/T-104')
  })

  it('Change status ▸ Not selected asks why — the one their stage says first — and keeps them in the bank', async () => {
    show()
    fireEvent.click(screen.getByRole('button', { name: 'More for Daniel Lee' }))
    fireEvent.click(screen.getByRole('menuitem', { name: /Change status/ }))
    fireEvent.click(screen.getByRole('menuitemradio', { name: /Not selected/ }))
    expect(actions.setCandidateStage).not.toHaveBeenCalled()
    const why = within(screen.getByRole('group', { name: 'Why not selected' }))
    expect(why.getAllByRole('menuitem').map(b => b.textContent)).toEqual(['Failed interview', 'Not shortlisted', 'Not right now', 'Declined offer', 'Other'])
    fireEvent.click(why.getByRole('menuitem', { name: 'Not right now' }))
    await waitFor(() => expect(actions.setCandidateStage).toHaveBeenCalledWith(daniel.id, 'rejected', 'not_right_now'))
    expect(flash).toHaveBeenCalledWith('Daniel Lee → Not selected · kept in Talent Bank')
  })

  it('any other status is set at once, as before', async () => {
    show()
    fireEvent.click(screen.getByRole('button', { name: 'More for Daniel Lee' }))
    fireEvent.click(screen.getByRole('menuitem', { name: /Change status/ }))
    fireEvent.click(screen.getByRole('menuitemradio', { name: /Offered/ }))
    await waitFor(() => expect(actions.setCandidateStage).toHaveBeenCalledWith(daniel.id, 'offered', undefined))
    expect(flash).toHaveBeenCalledWith('Daniel Lee → Offered')
  })

  it('Edit details › Status Not selected asks why too, and sends it', async () => {
    show()
    fireEvent.click(screen.getByRole('button', { name: 'More for Daniel Lee' }))
    fireEvent.click(screen.getByRole('menuitem', { name: /Edit details/ }))
    const win = within(screen.getByRole('dialog', { name: 'Edit candidate' }))
    expect(win.queryByLabelText('Why not selected')).toBeNull()
    fireEvent.change(win.getByLabelText('Status'), { target: { value: 'rejected' } })
    const why = win.getByLabelText('Why not selected') as HTMLSelectElement
    expect(why.value).toBe('failed_interview')
    fireEvent.change(why, { target: { value: 'declined_offer' } })
    fireEvent.click(win.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(actions.saveHiringCandidate).toHaveBeenCalled())
    const form = actions.saveHiringCandidate.mock.calls[0][0] as FormData
    expect([form.get('stage'), form.get('reason')]).toEqual(['rejected', 'declined_offer'])
    expect(flash).toHaveBeenCalledWith('Daniel Lee saved · kept in Talent Bank')
  })
})

// 2026-10-24 — asked whether HR should manage the reasons like File types, the user: "1, yes do with same". HR has renamed
// Failed interview and Not right now, turned Not shortlisted off and added Salary too high (mig 20261024235300).
describe('Hiring › a request › the reasons are HR’s list', () => {
  const reasons = [
    ...TALENT_REASONS.map(r =>
      r.id === 'failed_interview' ? { ...r, name: 'Interview failed' } : r.id === 'not_right_now' ? { ...r, name: 'Maybe next year' } : r.id === 'not_shortlisted' ? { ...r, active: false } : r),
    { id: 'r-salary', name: 'Salary too high', active: true, used: 0 },
  ]
  const managed: HiringBoard = { ...board, talentReasons: reasons }
  const showManaged = (b: HiringBoard = managed, r: HiringRequest = request) =>
    render(<Candidates board={b} request={r} can={{ create: true, edit: true, approve: true }} talentPage />)

  it('Not selected ▸ why? offers the ones that are on, in HR’s words, the stage’s first', async () => {
    showManaged()
    fireEvent.click(screen.getByRole('button', { name: 'More for Daniel Lee' }))
    fireEvent.click(screen.getByRole('menuitem', { name: /Change status/ }))
    fireEvent.click(screen.getByRole('menuitemradio', { name: /Not selected/ }))
    const why = within(screen.getByRole('group', { name: 'Why not selected' }))
    expect(why.getAllByRole('menuitem').map(b => b.textContent)).toEqual(['Interview failed', 'Maybe next year', 'Declined offer', 'Other', 'Salary too high'])
    fireEvent.click(why.getByRole('menuitem', { name: 'Salary too high' }))
    await waitFor(() => expect(actions.setCandidateStage).toHaveBeenCalledWith(daniel.id, 'rejected', 'r-salary'))
  })

  it('the not selected fold says why in HR’s words', () => {
    showManaged({ ...HIRING_BOARD, talentReasons: reasons }, HIRING_BOARD.requests.find(r => r.id === 'HR-202')!)
    fireEvent.click(screen.getByRole('button', { name: /Not selected · 1/ }))
    expect(screen.getByText('Maybe next year')).toBeInTheDocument()
  })

  it('Edit details › Not selected: "+ Add a new reason…" names one, made on Save', async () => {
    actions.addTalentReason.mockResolvedValue({ ok: true, id: 'r-new' })
    showManaged()
    fireEvent.click(screen.getByRole('button', { name: 'More for Daniel Lee' }))
    fireEvent.click(screen.getByRole('menuitem', { name: /Edit details/ }))
    const win = within(screen.getByRole('dialog', { name: 'Edit candidate' }))
    fireEvent.change(win.getByLabelText('Status'), { target: { value: 'rejected' } })
    const why = win.getByLabelText('Why not selected') as HTMLSelectElement
    expect([why.value, [...why.options].map(o => o.text)]).toEqual(['failed_interview', ['Interview failed', 'Maybe next year', 'Declined offer', 'Other', 'Salary too high', '+ Add a new reason…']])
    fireEvent.change(why, { target: { value: '__new' } })
    fireEvent.click(win.getByRole('button', { name: 'Save' }))
    expect(flash).toHaveBeenCalledWith('Name the new reason.')
    expect(actions.saveHiringCandidate).not.toHaveBeenCalled()
    fireEvent.change(win.getByLabelText('New reason *'), { target: { value: 'Relocating' } })
    fireEvent.click(win.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(actions.saveHiringCandidate).toHaveBeenCalled())
    expect(actions.addTalentReason).toHaveBeenCalledWith('Relocating')
    expect((actions.saveHiringCandidate.mock.calls[0][0] as FormData).get('reason')).toBe('r-new')
  })

  it('Move to Talent Bank… starts on Not right now while it is on; a new reason is named there too', async () => {
    actions.addTalentReason.mockResolvedValue({ ok: true, id: 'r-new' })
    showManaged()
    fireEvent.click(screen.getByRole('button', { name: 'More for Daniel Lee' }))
    fireEvent.click(screen.getByRole('menuitem', { name: /Move to Talent Bank/ }))
    const win = within(screen.getByRole('dialog', { name: 'Move to Talent Bank' }))
    const why = win.getByLabelText('Reason *') as HTMLSelectElement
    expect(why.value).toBe('not_right_now')
    fireEvent.change(why, { target: { value: '__new' } })
    fireEvent.change(win.getByLabelText('New reason *'), { target: { value: 'Relocating' } })
    fireEvent.click(win.getByRole('button', { name: 'Save to Talent Bank' }))
    await waitFor(() => expect(actions.saveHiringTalent).toHaveBeenCalled())
    expect(actions.addTalentReason).toHaveBeenCalledWith('Relocating')
    expect((actions.saveHiringTalent.mock.calls[0][0] as FormData).get('reason')).toBe('r-new')
  })

  it('without Edit, a form offers no "+ Add a new reason…"', () => {
    render(<Candidates board={managed} request={request} can={{ create: true, edit: false, approve: true }} talentPage />)
    fireEvent.click(screen.getByRole('button', { name: 'More for Daniel Lee' }))
    fireEvent.click(screen.getByRole('menuitem', { name: /Move to Talent Bank/ }))
    const why = within(screen.getByRole('dialog', { name: 'Move to Talent Bank' })).getByLabelText('Reason *') as HTMLSelectElement
    expect([...why.options].map(o => o.text)).not.toContain('+ Add a new reason…')
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
