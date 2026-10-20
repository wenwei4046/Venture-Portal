import { useState } from 'react'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BIN, HV, ROOT, deptAt, folderAt, personAt, type Drive } from '@/lib/documentation/drive'
import type { Documentation, PersonLetter } from '@/lib/documentation/model'
import { PNG } from '@/test/signature'

const actions = vi.hoisted(() => ({ fileLetter: vi.fn(), withdrawLetter: vi.fn(), openDocumentationFile: vi.fn(), addLetterType: vi.fn(), setLetterShare: vi.fn(), letterSignature: vi.fn() }))
const drive = vi.hoisted(() => ({
  addDriveFolder: vi.fn(), renameDriveFolder: vi.fn(), deleteDriveFolder: vi.fn(), saveDriveFile: vi.fn(), deleteDriveFile: vi.fn(), openDriveFile: vi.fn(),
  moveDriveFolder: vi.fn(), restoreDriveItem: vi.fn(), deleteDriveItemForever: vi.fn(), emptyDriveBin: vi.fn(),
  moveDriveFile: vi.fn(), copyDriveItem: vi.fn(), setDriveLock: vi.fn(), setDriveShare: vi.fn(),
}))
const upload = vi.hoisted(() => ({ uploadDocumentationFile: vi.fn() }))
const { flash } = vi.hoisted(() => ({ flash: vi.fn() }))
vi.mock('@/lib/documentation/actions', () => actions)
vi.mock('@/lib/documentation/drive-actions', () => drive)
vi.mock('@/lib/documentation/upload', () => upload)
vi.mock('@/components/hrv/toast', () => ({ flash }))

import DataCenterTab from './DataCenterTab'
import PreviewDrawer, { type PreviewTarget } from './PreviewDrawer'

// The Data center as a Drive (2026-10-12 — the user: company → department → the person; "+ New" makes a folder for a
// subsidiary and folders by department inside it). And, as before (2026-10-11, the user's answer E), a letter filed
// to the wrong person is withdrawn from their record — asked twice — and waits greyed under "Show withdrawn", its
// trail a View away, its file never opened again.

const REV = '11111111-1111-4111-8111-111111111111'
const ZACK = '33333333-3333-4333-8333-333333333333'
const CARRES = '55555555-5555-4555-8555-555555555555'

const letter = (over: Partial<PersonLetter>): PersonLetter => ({
  id: 'L1', ref: 'D-101', staffId: ZACK, staffName: 'Zack', typeId: 'offer', typeName: 'Offer letter', fileName: 'Offer_zack.pdf',
  contentType: 'application/pdf', size: 1, filedAt: '2026-10-01T02:00:00Z', filedBy: 'HR Manager', source: 'upload',
  readAt: null, acknowledgedAt: null, withdrawnAt: null, hiddenAt: null, events: [], ...over,
})

const DATA: Documentation = {
  departments: [{ id: REV, name: 'Revenue Department', people: 1 }],
  people: [{ id: ZACK, name: 'Zack', code: 'HV010', title: 'Senior Revenue Specialist', departmentId: REV }],
  documents: [],
  letterTypes: [
    { id: 'offer', name: 'Offer letter', compulsory: true, count: 0 },
    { id: 'warn', name: 'Warning letter', compulsory: false, count: 1 },
  ],
  letters: [
    letter({ id: 'L2', typeId: 'warn', typeName: 'Warning letter', fileName: 'Warning_zack.pdf' }),
    letter({
      withdrawnAt: '2026-10-11T03:00:00Z',
      events: [
        { what: 'Uploaded', at: '2026-10-01T02:00:00Z', who: 'HR Manager', note: '' },
        { what: 'Withdrawn', at: '2026-10-11T03:00:00Z', who: 'HR Manager', note: "No longer on Zack's record or in the Revenue app" },
      ],
    }),
  ],
  publishTypes: [],
  published: [],
}

const DRIVE: Drive = {
  folders: [{ id: CARRES, name: 'Carres', parent: ROOT, createdAt: '2026-10-12T01:00:00Z', createdBy: 'Amy', lock: null, memberView: null, memberSees: null }],
  files: [
    { id: 'F1', ref: 'F-101', fileName: 'SOP.pdf', contentType: 'application/pdf', size: 2_400_000, parent: folderAt(CARRES), uploadedAt: '2026-10-12T02:00:00Z', uploadedBy: 'Amy', deletedAt: null, events: [], lock: null, memberView: null, memberSees: null },
  ],
  bin: [],
  readAt: '',
  canLock: false,
}

beforeEach(() => {
  for (const fn of [...Object.values(actions), ...Object.values(drive), ...Object.values(upload)]) fn.mockReset()
  actions.withdrawLetter.mockResolvedValue({ ok: true, person: 'Zack', type: 'Warning letter' })
  actions.openDocumentationFile.mockResolvedValue({ ok: false, reason: 'not in this test' })
  drive.openDriveFile.mockResolvedValue({ ok: false, reason: 'not in this test' })
  drive.addDriveFolder.mockResolvedValue({ ok: true, id: 'new' })
  drive.deleteDriveFolder.mockResolvedValue({ ok: true })
  drive.saveDriveFile.mockResolvedValue({ ok: true, id: 'F9' })
  upload.uploadDocumentationFile.mockResolvedValue({ ok: true, path: 'drive/x/Rates.xlsx', fileName: 'Rates.xlsx', contentType: null, size: 5 })
  flash.mockReset()
})
afterEach(cleanup)

/** The tab as the page holds it: the place is the page's state. */
function Drive({
  start = ROOT,
  can = { create: true, edit: true },
  onView = vi.fn(),
  drive: d = DRIVE,
}: {
  start?: string
  can?: { create: boolean; edit: boolean }
  onView?: (t: PreviewTarget) => void
  drive?: Drive
}) {
  const [at, setAt] = useState(start)
  return <DataCenterTab data={DATA} drive={d} driveError={null} can={can} at={at} onAt={setAt} onView={onView} />
}
const path = () => screen.getByRole('navigation', { name: 'Folder path' })
const here = () => within(path()).getByText((_, el) => el?.getAttribute('aria-current') === 'page')

describe('Documentation › Data center as a Drive', () => {
  it('opens on the companies: HOUZS Venture by itself, then the folders HR made', () => {
    render(<Drive />)
    expect(here()).toHaveTextContent('Data center')
    expect(screen.getByRole('button', { name: /HOUZS Venture/ })).toHaveTextContent('1 department · 1 person')
    expect(screen.getByRole('button', { name: /^Carres/ })).toHaveTextContent('1 file')
  })

  it('walks HOUZS Venture › a department › a person, and back up by the path', () => {
    render(<Drive />)
    fireEvent.click(screen.getByRole('button', { name: /HOUZS Venture/ }))
    expect(here()).toHaveTextContent('HOUZS Venture')
    expect(screen.getByText('Departments')).toBeInTheDocument()
    expect(screen.getByLabelText('1 person missing a compulsory letter')).toHaveTextContent('1')
    fireEvent.click(screen.getByRole('button', { name: /^Revenue/ }))
    expect(screen.getByText('People')).toBeInTheDocument()
    expect(screen.getByLabelText('Offer letter missing')).toHaveTextContent('!')
    fireEvent.click(screen.getByRole('button', { name: /^Zack/ }))
    expect(within(path()).getAllByRole('button').map(b => b.textContent)).toEqual(['Data center', 'HOUZS Venture', 'Revenue'])
    expect(screen.getByRole('region', { name: 'Zack' })).toBeInTheDocument()
    fireEvent.click(within(path()).getByRole('button', { name: 'HOUZS Venture' }))
    expect(here()).toHaveTextContent('HOUZS Venture')
  })

  it('+ New › New folder makes one where you are', async () => {
    render(<Drive start={HV} />)
    fireEvent.click(screen.getByRole('button', { name: 'New' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'New folder' }))
    const win = screen.getByRole('dialog', { name: 'New folder' })
    expect(within(win).getByText('In HOUZS Venture')).toBeInTheDocument()
    fireEvent.change(within(win).getByLabelText('Folder name'), { target: { value: 'Revenue' } })
    fireEvent.click(within(win).getByRole('button', { name: 'Create' }))
    expect(within(win).getByRole('alert')).toHaveTextContent('Revenue is here already.')
    expect(drive.addDriveFolder).not.toHaveBeenCalled()
    fireEvent.change(within(win).getByLabelText('Folder name'), { target: { value: 'Policies' } })
    fireEvent.click(within(win).getByRole('button', { name: 'Create' }))
    await waitFor(() => expect(drive.addDriveFolder).toHaveBeenCalledWith(HV, 'Policies'))
    expect(flash).toHaveBeenCalledWith('Policies made in HOUZS Venture')
  })

  // 2026-10-13 (the Talent Bank's rules): a folder moves with everything in it, and goes to the Bin — not asked twice,
  // it comes back.
  it('a folder HR made has Rename, Move to… and Move to Bin; one made by itself has no menu', async () => {
    render(<Drive />)
    expect(screen.queryByRole('button', { name: 'More actions for HOUZS Venture' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'More actions for Carres' }))
    expect(screen.getAllByRole('menuitem').map(m => m.textContent)).toEqual(['Rename', 'Move to…', 'Copy to…', 'Duplicate', 'Move to Bin'])
    fireEvent.click(screen.getByRole('menuitem', { name: 'Move to Bin' }))
    await waitFor(() => expect(drive.deleteDriveFolder).toHaveBeenCalledWith(CARRES))
    expect(flash).toHaveBeenCalledWith('Carres moved to the Bin')
  })

  it('a folder’s Move to… lists every place but itself — a person’s folder too (2026-10-14); picked, it goes there with everything in it', async () => {
    drive.moveDriveFolder.mockResolvedValue({ ok: true })
    render(<Drive />)
    fireEvent.click(screen.getByRole('button', { name: 'More actions for Carres' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Move to…' }))
    const win = within(screen.getByRole('dialog', { name: 'Move Carres' }))
    expect(win.getByText('Now in Data center — everything in it goes with it')).toBeInTheDocument()
    expect(win.getAllByRole('option').map(o => o.textContent)).toEqual(['Data centerHere now', 'HOUZS Venture', 'Revenue', 'Zack'])
    expect(win.getByRole('option', { name: /Data center/ })).toBeDisabled()
    fireEvent.click(win.getByRole('option', { name: 'Revenue' }))
    fireEvent.click(win.getByRole('button', { name: 'Move here' }))
    await waitFor(() => expect(drive.moveDriveFolder).toHaveBeenCalledWith(CARRES, deptAt(REV)))
    expect(flash).toHaveBeenCalledWith('Carres moved to HOUZS Venture › Revenue')
  })

  it('a file’s ⋮ moves it to the Bin at once', async () => {
    drive.deleteDriveFile.mockResolvedValue({ ok: true })
    render(<Drive start={folderAt(CARRES)} />)
    fireEvent.click(screen.getByRole('button', { name: 'More actions for SOP.pdf' }))
    expect(screen.getAllByRole('menuitem').map(m => m.textContent)).toEqual(['View', 'Download', 'Move to…', 'Copy to…', 'Duplicate', 'Move to Bin'])
    fireEvent.click(screen.getByRole('menuitem', { name: 'Move to Bin' }))
    await waitFor(() => expect(drive.deleteDriveFile).toHaveBeenCalledWith('F1'))
    expect(flash).toHaveBeenCalledWith('SOP.pdf moved to the Bin')
  })

  it('without Documentation · Edit nothing is renamed or deleted; without Create there is no + New', () => {
    render(<Drive can={{ create: false, edit: false }} />)
    expect(screen.queryByRole('button', { name: 'More actions for Carres' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'New' })).toBeNull()
  })

  it('a folder HR made holds files: a press views one, + New › Upload files puts more in it', async () => {
    const onView = vi.fn()
    render(<Drive start={folderAt(CARRES)} onView={onView} />)
    fireEvent.click(screen.getByRole('button', { name: 'View SOP.pdf' }))
    expect(onView).toHaveBeenCalledWith({ kind: 'drive', id: 'F1' })
    expect(screen.getByText('2.3 MB')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'New' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Upload files' }))
    const input = document.querySelector('input[type="file"][multiple]') as HTMLInputElement
    fireEvent.change(input, { target: { files: [new File(['x'], 'Rates.xlsx')] } })
    await waitFor(() => expect(drive.saveDriveFile).toHaveBeenCalledWith({ parent: folderAt(CARRES), path: 'drive/x/Rates.xlsx', fileName: 'Rates.xlsx', contentType: null, size: 5 }))
    expect(upload.uploadDocumentationFile).toHaveBeenCalledWith('drive', expect.any(File))
    expect(flash).toHaveBeenCalledWith('1 file saved in Carres')
  })

  it('search finds anything in the Data center and opens where it is', () => {
    render(<Drive />)
    fireEvent.change(screen.getByLabelText('Search the Data center'), { target: { value: 'zack' } })
    fireEvent.click(screen.getAllByRole('button', { name: /Zack/ })[0])
    expect(screen.getByRole('region', { name: 'Zack' })).toBeInTheDocument()
  })
})

describe('a person’s folder: their record, as before', () => {
  const record = () => within(screen.getByRole('region', { name: 'Zack' }))
  const view = (can = { create: true, edit: true }, onView = vi.fn()) => render(<Drive start={personAt(ZACK)} can={can} onView={onView} />)

  it('shows the letters still on file; the withdrawn one counts for nothing — its compulsory type is missing again', () => {
    view()
    expect(record().getByText('Offer letter missing')).toBeInTheDocument()
    expect(record().getByText(/1 letter on file/)).toBeInTheDocument()
    expect(record().getAllByText('Warning letter')).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Show withdrawn (1)' })).toBeInTheDocument()
    // No description under the name (2026-10-14, DESIGN.md › No descriptions on the page).
    expect(record().queryByText(/land in this folder by themselves/)).toBeNull()
  })

  it('asks once more, then withdraws and says who no longer sees it', async () => {
    view()
    fireEvent.click(record().getByRole('button', { name: 'More actions for Warning letter' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Withdraw' }))
    expect(actions.withdrawLetter).not.toHaveBeenCalled()
    const armed = screen.getByRole('menuitem', { name: 'Confirm withdraw' })
    expect(armed).toHaveAttribute('data-armed', 'true')
    fireEvent.click(armed)
    await waitFor(() => expect(actions.withdrawLetter).toHaveBeenCalledWith('L2'))
    expect(flash).toHaveBeenCalledWith('Warning letter withdrawn · Zack no longer sees it')
  })

  it('says the refusal in words when it cannot', async () => {
    actions.withdrawLetter.mockResolvedValue({ ok: false, reason: 'That letter is already withdrawn.' })
    view()
    fireEvent.click(record().getByRole('button', { name: 'More actions for Warning letter' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Withdraw' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Confirm withdraw' }))
    await waitFor(() => expect(flash).toHaveBeenCalledWith('That letter is already withdrawn.'))
  })

  it('without Documentation · Edit there is nothing to withdraw', () => {
    view({ create: true, edit: false })
    fireEvent.click(record().getByRole('button', { name: 'More actions for Warning letter' }))
    expect(screen.getAllByRole('menuitem').map(m => m.textContent)).toEqual(['View', 'Download'])
  })

  it('a withdrawn letter waits greyed under “Show withdrawn”, View only', () => {
    const onView = vi.fn()
    view(undefined, onView)
    fireEvent.click(screen.getByRole('button', { name: 'Show withdrawn (1)' }))
    const card = record().getByText('Withdrawn · 11 Oct').closest('[data-gone]')!
    expect(card).toHaveAttribute('data-gone', 'true')
    fireEvent.click(within(card as HTMLElement).getByRole('button', { name: 'More actions for Offer letter' }))
    expect(screen.getAllByRole('menuitem').map(m => m.textContent)).toEqual(['View'])
    fireEvent.click(within(card as HTMLElement).getByRole('button', { name: 'View Offer letter' }))
    expect(onView).toHaveBeenCalledWith({ kind: 'letter', id: 'L1' })
    expect(screen.getByRole('button', { name: 'Hide withdrawn (1)' })).toBeInTheDocument()
  })

  it('+ New in a person’s folder uploads a letter — or, since 2026-10-14, makes a folder or keeps files there', () => {
    view()
    fireEvent.click(screen.getByRole('button', { name: 'New' }))
    expect(screen.getAllByRole('menuitem').map(m => m.textContent)).toEqual(['Upload a letter', 'New folder', 'Upload files'])
    fireEvent.click(screen.getByRole('menuitem', { name: 'Upload a letter' }))
    expect(screen.getByRole('dialog', { name: 'Upload a letter' })).toBeInTheDocument()
  })
})

describe('the preview', () => {
  it('of a withdrawn letter opens on its trail, never its file', () => {
    render(<PreviewDrawer data={DATA} target={{ kind: 'letter', id: 'L1' }} onClose={vi.fn()} />)
    expect(actions.openDocumentationFile).not.toHaveBeenCalled()
    expect(screen.getByRole('tab', { name: /Audit trail/ })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText('Status').nextElementSibling).toHaveTextContent('Withdrawn')
    expect(screen.queryByRole('button', { name: 'Download' })).toBeNull()
    fireEvent.click(screen.getByRole('tab', { name: 'Preview' }))
    expect(screen.getByText(/No longer on Zack's record or in the Revenue app; its trail stays\./)).toBeInTheDocument()
  })

  it('of a letter still on file opens its file as before', async () => {
    render(<PreviewDrawer data={DATA} target={{ kind: 'letter', id: 'L2' }} onClose={vi.fn()} />)
    await waitFor(() => expect(actions.openDocumentationFile).toHaveBeenCalledWith('letter', 'L2', 'view'))
    expect(screen.getByRole('tab', { name: 'Preview' })).toHaveAttribute('aria-selected', 'true')
  })

  // 2026-10-20 — a memo is acknowledged with the person's own signature: a letter they acknowledged shows it on its trail.
  it('of a letter its person acknowledged shows the signature they gave; one not acknowledged asks for none', async () => {
    actions.letterSignature.mockResolvedValue({ ok: true, signature: PNG, acknowledgedAt: '2026-10-20T03:00:00Z' })
    const signedData = { ...DATA, letters: [letter({ id: 'L3', readAt: '2026-10-20T02:59:00Z', acknowledgedAt: '2026-10-20T03:00:00Z' }), ...DATA.letters] }
    render(<PreviewDrawer data={signedData} target={{ kind: 'letter', id: 'L3' }} onClose={vi.fn()} />)
    await waitFor(() => expect(actions.letterSignature).toHaveBeenCalledWith('L3'))
    fireEvent.click(screen.getByRole('tab', { name: /Audit trail/ }))
    expect(await screen.findByRole('img', { name: "Zack's signature" })).toHaveAttribute('src', PNG)
    expect(screen.getByText('Signed when acknowledged')).toBeInTheDocument()
    cleanup()
    actions.letterSignature.mockClear()
    render(<PreviewDrawer data={DATA} target={{ kind: 'letter', id: 'L2' }} onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole('tab', { name: /Audit trail/ }))
    expect(actions.letterSignature).not.toHaveBeenCalled()
    expect(screen.queryByText('Signed when acknowledged')).toBeNull()
  })

  it('of a Data center file opens it through its own link and names its folder', async () => {
    render(<PreviewDrawer data={DATA} drive={DRIVE} target={{ kind: 'drive', id: 'F1' }} onClose={vi.fn()} />)
    await waitFor(() => expect(drive.openDriveFile).toHaveBeenCalledWith('F1', 'view'))
    expect(actions.openDocumentationFile).not.toHaveBeenCalled()
    expect(screen.getByText('File · Carres')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('tab', { name: /Audit trail/ }))
    expect(screen.getByText('Folder').nextElementSibling).toHaveTextContent('Carres')
  })
})

// A person's own (2026-10-14 — the user: "documentation 我要分成两种：company / personal"; right-click a folder of a
// person's data so they may view it; a document kept from them; move, copy, duplicate; "view only me").
describe('a person’s own, View only me, Move / Copy', () => {
  const CONTRACTS = '88888888-8888-4888-8888-888888888888'
  const item = { lock: null, memberView: null, memberSees: null }
  const PERSONAL: Drive = {
    ...DRIVE,
    canLock: true,
    folders: [
      ...DRIVE.folders,
      { id: CONTRACTS, name: 'Contracts', parent: personAt(ZACK), createdAt: '2026-10-14T01:00:00Z', createdBy: 'Alvin', ...item, memberView: true, memberSees: true },
    ],
    files: [
      ...DRIVE.files,
      { id: 'F2', ref: 'F-102', fileName: 'Offer.pdf', contentType: 'application/pdf', size: 900, parent: folderAt(CONTRACTS), uploadedAt: '2026-10-14T02:00:00Z', uploadedBy: 'Alvin', deletedAt: null, events: [], ...item, memberSees: true },
      { id: 'F3', ref: 'F-103', fileName: 'Notes.pdf', contentType: 'application/pdf', size: 900, parent: personAt(ZACK), uploadedAt: '2026-10-14T02:00:00Z', uploadedBy: 'Alvin', deletedAt: null, events: [], ...item, memberSees: false, lock: { by: 'Alvin', mine: false, at: '2026-10-14T03:00:00Z' } },
    ],
  }
  const view = (start: string, can = { create: true, edit: true }) => render(<Drive start={start} drive={PERSONAL} can={can} />)

  beforeEach(() => {
    drive.setDriveShare.mockResolvedValue({ ok: true, person: 'Zack', sees: false })
    drive.setDriveLock.mockResolvedValue({ ok: true, on: true, wasShared: true })
    drive.copyDriveItem.mockResolvedValue({ ok: true, name: 'Copy of SOP.pdf', files: 1, skipped: 0 })
    drive.moveDriveFile.mockResolvedValue({ ok: true })
    actions.setLetterShare.mockResolvedValue({ ok: true, person: 'Zack', type: 'Warning letter', sees: false })
  })

  it('a person’s folder holds their record, then the folders and files HR keeps for them — each wearing who sees it', () => {
    view(personAt(ZACK))
    expect(screen.getByRole('region', { name: 'Zack' })).toBeInTheDocument()
    const contracts = screen.getByRole('button', { name: /^Contracts/ }).closest('[data-kind]') as HTMLElement
    expect(within(contracts).getByLabelText('Zack can view')).toBeInTheDocument()
    expect(screen.getByLabelText('View only me · Only Alvin and above')).toBeInTheDocument()
  })

  it('a folder’s ⋮ shares it with its person — ticked while they see it — and keeps it back', async () => {
    view(personAt(ZACK))
    fireEvent.click(screen.getByRole('button', { name: 'More actions for Contracts' }))
    const share = screen.getByRole('menuitemcheckbox', { name: 'Zack can view' })
    expect(share).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('menuitemcheckbox', { name: 'View only me' })).toHaveAttribute('aria-checked', 'false')
    fireEvent.click(share)
    await waitFor(() => expect(drive.setDriveShare).toHaveBeenCalledWith('folder', CONTRACTS, false))
    expect(flash).toHaveBeenCalledWith('Contracts kept from Zack')
  })

  it('a file locked by somebody else is theirs to unlock too, once shown: “View only Alvin and above”, ticked', async () => {
    drive.setDriveLock.mockResolvedValue({ ok: true, on: false, wasShared: false })
    view(personAt(ZACK))
    fireEvent.click(screen.getByRole('button', { name: 'More actions for Notes.pdf' }))
    const lock = screen.getByRole('menuitemcheckbox', { name: 'View only Alvin and above' })
    expect(lock).toHaveAttribute('aria-checked', 'true')
    fireEvent.click(lock)
    await waitFor(() => expect(drive.setDriveLock).toHaveBeenCalledWith('file', 'F3', false))
    expect(flash).toHaveBeenCalledWith('Notes.pdf · everyone in HR sees it again')
  })

  it('View only me on something shared says its person no longer sees it', async () => {
    view(folderAt(CONTRACTS))
    fireEvent.click(screen.getByRole('button', { name: 'More actions for Offer.pdf' }))
    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: 'View only me' }))
    await waitFor(() => expect(drive.setDriveLock).toHaveBeenCalledWith('file', 'F2', true))
    expect(flash).toHaveBeenCalledWith('Offer.pdf · View only me · Zack no longer sees it')
  })

  it('outside a person’s folder there is nobody to share with; a login that may not lock is not offered View only me', () => {
    render(<Drive start={folderAt(CARRES)} drive={DRIVE} />)
    fireEvent.click(screen.getByRole('button', { name: 'More actions for SOP.pdf' }))
    expect(screen.queryAllByRole('menuitemcheckbox')).toEqual([])
  })

  it('a letter’s ⋮ has “Zack can view”, ticked while he sees it; unticked it is kept from him, still on the record', async () => {
    view(personAt(ZACK))
    fireEvent.click(screen.getByRole('button', { name: 'More actions for Warning letter' }))
    const share = screen.getByRole('menuitemcheckbox', { name: 'Zack can view' })
    expect(share).toHaveAttribute('aria-checked', 'true')
    fireEvent.click(share)
    await waitFor(() => expect(actions.setLetterShare).toHaveBeenCalledWith('L2', false))
    expect(flash).toHaveBeenCalledWith('Warning letter kept from Zack · still on the record')
  })

  it('a letter kept from its person says Hidden, and its tick is off', () => {
    const hidden = { ...DATA, letters: DATA.letters.map(l => (l.id === 'L2' ? { ...l, hiddenAt: '2026-10-14T05:00:00Z' } : l)) }
    render(<DataCenterTab data={hidden} drive={PERSONAL} driveError={null} can={{ create: true, edit: true }} at={personAt(ZACK)} onAt={vi.fn()} onView={vi.fn()} />)
    expect(screen.getByTitle('Kept from Zack — still on the record')).toHaveTextContent('Hidden')
    fireEvent.click(screen.getByRole('button', { name: 'More actions for Warning letter' }))
    expect(screen.getByRole('menuitemcheckbox', { name: 'Zack can view' })).toHaveAttribute('aria-checked', 'false')
  })

  it('a right-click opens a card’s menu where the pointer is', () => {
    view(personAt(ZACK))
    const card = screen.getByRole('button', { name: /^Contracts/ }).closest('[data-kind]') as HTMLElement
    fireEvent.contextMenu(card, { clientX: 300, clientY: 200 })
    const menu = screen.getByRole('menu', { name: 'More actions for Contracts' })
    expect(menu).toHaveAttribute('data-at', 'point')
    expect(within(menu).getAllByRole('menuitem').map(m => m.textContent)).toEqual(['Rename', 'Move to…', 'Copy to…', 'Duplicate', 'Move to Bin'])
  })

  it('a card with no menu keeps the browser’s own right-click', () => {
    view(HV)
    const card = screen.getByRole('button', { name: /^Revenue/ }).closest('[data-kind]') as HTMLElement
    expect(fireEvent.contextMenu(card)).toBe(true)
  })

  it('Duplicate copies a file into its own place as “Copy of …”', async () => {
    render(<Drive start={folderAt(CARRES)} drive={DRIVE} />)
    fireEvent.click(screen.getByRole('button', { name: 'More actions for SOP.pdf' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Duplicate' }))
    await waitFor(() => expect(drive.copyDriveItem).toHaveBeenCalledWith({ kind: 'file', id: 'F1', parent: folderAt(CARRES), name: 'Copy of SOP.pdf' }))
    expect(flash).toHaveBeenLastCalledWith('Copy of SOP.pdf made in Carres')
  })

  it('a folder’s Duplicate leaves its name to the database (“Copy of …”, then “(2)”)', async () => {
    drive.copyDriveItem.mockResolvedValue({ ok: true, name: 'Copy of Contracts', files: 1, skipped: 0 })
    view(personAt(ZACK))
    fireEvent.click(screen.getByRole('button', { name: 'More actions for Contracts' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Duplicate' }))
    await waitFor(() => expect(drive.copyDriveItem).toHaveBeenCalledWith({ kind: 'folder', id: CONTRACTS, parent: personAt(ZACK), name: null }))
    expect(flash).toHaveBeenLastCalledWith('Copy of Contracts made in HOUZS Venture › Revenue › Zack')
  })

  it('Copy to… picks a place — any, its own too — and copies there under its own name', async () => {
    drive.copyDriveItem.mockResolvedValue({ ok: true, name: 'SOP.pdf', files: 1, skipped: 0 })
    render(<Drive start={folderAt(CARRES)} drive={DRIVE} />)
    fireEvent.click(screen.getByRole('button', { name: 'More actions for SOP.pdf' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Copy to…' }))
    const win = within(screen.getByRole('dialog', { name: 'Copy SOP.pdf' }))
    expect(win.getByRole('option', { name: 'Carres' })).not.toBeDisabled()
    fireEvent.click(win.getByRole('option', { name: 'Zack' }))
    fireEvent.click(win.getByRole('button', { name: 'Copy here' }))
    await waitFor(() => expect(drive.copyDriveItem).toHaveBeenCalledWith({ kind: 'file', id: 'F1', parent: personAt(ZACK), name: 'SOP.pdf' }))
    expect(flash).toHaveBeenLastCalledWith('SOP.pdf copied to HOUZS Venture › Revenue › Zack')
  })

  it('a folder’s Copy to… keeps its name where the place has none of it, else leaves “Copy of …” to the database', async () => {
    view(personAt(ZACK))
    fireEvent.click(screen.getByRole('button', { name: 'More actions for Contracts' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Copy to…' }))
    let win = within(screen.getByRole('dialog', { name: 'Copy Contracts' }))
    fireEvent.click(win.getByRole('option', { name: 'Carres' }))
    fireEvent.click(win.getByRole('button', { name: 'Copy here' }))
    await waitFor(() => expect(drive.copyDriveItem).toHaveBeenCalledWith({ kind: 'folder', id: CONTRACTS, parent: folderAt(CARRES), name: 'Contracts' }))
    drive.copyDriveItem.mockClear()
    fireEvent.click(screen.getByRole('button', { name: 'More actions for Contracts' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Copy to…' }))
    win = within(screen.getByRole('dialog', { name: 'Copy Contracts' }))
    fireEvent.click(win.getByRole('option', { name: 'Zack' }))
    fireEvent.click(win.getByRole('button', { name: 'Copy here' }))
    await waitFor(() => expect(drive.copyDriveItem).toHaveBeenCalledWith({ kind: 'folder', id: CONTRACTS, parent: personAt(ZACK), name: null }))
  })

  it('a share the database refuses says why; one that does not reach its person says they still do not see it', async () => {
    const why = 'Notes.pdf is inside Cases, which is View only me — share Cases with Zack first.'
    drive.setDriveShare.mockResolvedValue({ ok: false, reason: why })
    view(personAt(ZACK))
    fireEvent.click(screen.getByRole('button', { name: 'More actions for Notes.pdf' }))
    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: 'Zack can view' }))
    await waitFor(() => expect(drive.setDriveShare).toHaveBeenCalledWith('file', 'F3', true))
    await waitFor(() => expect(flash).toHaveBeenLastCalledWith(why))
    drive.setDriveShare.mockResolvedValue({ ok: true, person: 'Zack', sees: false })
    fireEvent.click(screen.getByRole('button', { name: 'More actions for Notes.pdf' }))
    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: 'Zack can view' }))
    await waitFor(() => expect(flash).toHaveBeenLastCalledWith('Notes.pdf is still kept from Zack'))
  })

  it('a file moves with Move to… — into a person’s folder too', async () => {
    render(<Drive start={folderAt(CARRES)} drive={DRIVE} />)
    fireEvent.click(screen.getByRole('button', { name: 'More actions for SOP.pdf' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Move to…' }))
    const win = within(screen.getByRole('dialog', { name: 'Move SOP.pdf' }))
    expect(win.getByText('Now in Carres')).toBeInTheDocument()
    expect(win.getByRole('option', { name: /Carres/ })).toBeDisabled()
    fireEvent.click(win.getByRole('option', { name: 'Zack' }))
    fireEvent.click(win.getByRole('button', { name: 'Move here' }))
    await waitFor(() => expect(drive.moveDriveFile).toHaveBeenCalledWith('F1', personAt(ZACK)))
  })

  it('without Edit no setting, no move; without Create no copy', () => {
    view(personAt(ZACK), { create: false, edit: false })
    expect(screen.queryByRole('button', { name: 'More actions for Contracts' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'More actions for Notes.pdf' }))
    expect(screen.getAllByRole('menuitem').map(m => m.textContent)).toEqual(['View', 'Download'])
    expect(screen.queryAllByRole('menuitemcheckbox')).toEqual([])
  })
})

// A department's address the page can be opened on (`?in=dept:<id>`).
it('opens on a department named in the address', () => {
  render(<Drive start={deptAt(REV)} />)
  expect(here()).toHaveTextContent('Revenue')
})

// The Bin (2026-10-13 — the user: "Data center 也加 Bin 和 Move to…", as the Talent Bank's): a folder HR deleted at the
// top, a file that was in it — named through the Bin — and one from Carres; each deleted on 12 Oct, gone on 11 Nov.
describe('the Data center’s Bin', () => {
  const OLD = '66666666-6666-4666-8666-666666666666'
  const when = { ref: '', contentType: null, size: null, deletedAt: '2026-10-12T08:00:00Z', deletedBy: 'Amy', expiresAt: '2026-11-11T08:00:00Z' }
  const BINNED: Drive = {
    ...DRIVE,
    bin: [
      { ...when, id: 'b1', kind: 'folder', name: 'Old', at: ROOT, folderId: OLD, fileId: null },
      { ...when, id: 'b2', kind: 'file', name: 'Draft.pdf', at: folderAt(OLD), folderId: null, fileId: 'F7', contentType: 'application/pdf' },
      { ...when, id: 'b3', kind: 'file', name: 'Rates.xlsx', at: folderAt(CARRES), folderId: null, fileId: 'F8' },
    ],
  }
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-13T08:00:00Z'))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('the Bin pill counts what is in it; the Bin lists its folders and files — where each was, the days left', () => {
    render(<Drive drive={BINNED} />)
    expect(screen.getByRole('button', { name: /^Bin/ })).toHaveTextContent('Bin3')
    fireEvent.click(screen.getByRole('button', { name: /^Bin/ }))
    expect(within(path()).getAllByText(/./).map(x => x.textContent).filter(Boolean)).toEqual(['Data center', 'Bin'])
    expect([...document.querySelectorAll('[class*="sectHead"]')].map(h => h.textContent)).toEqual(['Folders 1', 'Files 2'])
    expect(screen.queryByRole('button', { name: 'New' })).toBeNull()
    expect(screen.queryByPlaceholderText('Search the Data center')).toBeNull()
    expect(screen.getByRole('button', { name: /^Old/ })).toHaveTextContent('Data center · 29 days left')
    // Draft.pdf was in Old, itself in the Bin: named through it.
    expect(screen.getByText('Old', { selector: '[class*="fileSub"]' })).toBeInTheDocument()
    expect(screen.getByText('Carres', { selector: '[class*="fileSub"]' })).toBeInTheDocument()
    expect(screen.getAllByText('29 days left')).toHaveLength(2)
    fireEvent.click(screen.getByRole('button', { name: /^Old/ }))
    expect(flash).toHaveBeenCalledWith('Old is in the Bin — restore it to open it.')
  })

  it('counts the days from when the Data center was read', () => {
    render(<Drive start={BIN} drive={{ ...BINNED, readAt: '2026-10-12T08:00:00Z' }} />)
    expect(screen.getAllByText('30 days left')).toHaveLength(2)
  })

  it('⋮ › Restore puts it back and says where; Delete forever and Empty bin are asked twice', async () => {
    drive.restoreDriveItem.mockResolvedValue({ ok: true, label: 'Carres' })
    drive.deleteDriveItemForever.mockResolvedValue({ ok: true })
    drive.emptyDriveBin.mockResolvedValue({ ok: true, count: 3 })
    render(<Drive start={BIN} drive={BINNED} />)
    fireEvent.click(screen.getByRole('button', { name: 'More actions for Rates.xlsx' }))
    expect(screen.getAllByRole('menuitem').map(m => m.textContent)).toEqual(['Restore', 'Delete forever'])
    fireEvent.click(screen.getByRole('menuitem', { name: 'Restore' }))
    await waitFor(() => expect(drive.restoreDriveItem).toHaveBeenCalledWith('b3'))
    expect(flash).toHaveBeenCalledWith('Rates.xlsx restored to Carres')
    fireEvent.click(screen.getByRole('button', { name: 'More actions for Draft.pdf' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete forever' }))
    expect(drive.deleteDriveItemForever).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Confirm delete forever' }))
    await waitFor(() => expect(drive.deleteDriveItemForever).toHaveBeenCalledWith('b2'))
    expect(flash).toHaveBeenCalledWith('Draft.pdf deleted forever')
    fireEvent.click(screen.getByRole('button', { name: /Empty bin/ }))
    expect(drive.emptyDriveBin).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: /Confirm empty bin/ }))
    await waitFor(() => expect(drive.emptyDriveBin).toHaveBeenCalled())
    expect(flash).toHaveBeenCalledWith('Bin emptied · 3 items deleted forever')
  })

  it('a refusal is said in the database’s words', async () => {
    drive.restoreDriveItem.mockResolvedValue({ ok: false, reason: 'Old is there already — rename one first.' })
    render(<Drive start={BIN} drive={BINNED} />)
    fireEvent.click(screen.getByRole('button', { name: 'More actions for Old' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Restore' }))
    await waitFor(() => expect(flash).toHaveBeenCalledWith('Old is there already — rename one first.'))
  })

  it('an empty Bin says so; without Edit there is nothing to press', () => {
    render(<Drive start={BIN} />)
    expect(screen.getByText('The Bin is empty.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Empty bin/ })).toBeNull()
    cleanup()
    render(<Drive start={BIN} drive={BINNED} can={{ create: false, edit: false }} />)
    expect(screen.queryByRole('button', { name: 'More actions for Old' })).toBeNull()
    expect(screen.queryByRole('button', { name: /Empty bin/ })).toBeNull()
  })
})
