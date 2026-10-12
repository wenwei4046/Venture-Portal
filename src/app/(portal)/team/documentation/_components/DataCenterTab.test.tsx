import { useState } from 'react'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BIN, HV, ROOT, deptAt, folderAt, personAt, type Drive } from '@/lib/documentation/drive'
import type { Documentation, PersonLetter } from '@/lib/documentation/model'

const actions = vi.hoisted(() => ({ fileLetter: vi.fn(), withdrawLetter: vi.fn(), openDocumentationFile: vi.fn(), addLetterType: vi.fn() }))
const drive = vi.hoisted(() => ({
  addDriveFolder: vi.fn(), renameDriveFolder: vi.fn(), deleteDriveFolder: vi.fn(), saveDriveFile: vi.fn(), deleteDriveFile: vi.fn(), openDriveFile: vi.fn(),
  moveDriveFolder: vi.fn(), restoreDriveItem: vi.fn(), deleteDriveItemForever: vi.fn(), emptyDriveBin: vi.fn(),
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
  readAt: null, acknowledgedAt: null, withdrawnAt: null, events: [], ...over,
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
  folders: [{ id: CARRES, name: 'Carres', parent: ROOT, createdAt: '2026-10-12T01:00:00Z', createdBy: 'Amy' }],
  files: [
    { id: 'F1', ref: 'F-101', fileName: 'SOP.pdf', contentType: 'application/pdf', size: 2_400_000, parent: folderAt(CARRES), uploadedAt: '2026-10-12T02:00:00Z', uploadedBy: 'Amy', deletedAt: null, events: [] },
  ],
  bin: [],
  readAt: '',
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
    expect(screen.getAllByRole('menuitem').map(m => m.textContent)).toEqual(['Rename', 'Move to…', 'Move to Bin'])
    fireEvent.click(screen.getByRole('menuitem', { name: 'Move to Bin' }))
    await waitFor(() => expect(drive.deleteDriveFolder).toHaveBeenCalledWith(CARRES))
    expect(flash).toHaveBeenCalledWith('Carres moved to the Bin')
  })

  it('a folder’s Move to… lists every place but itself and the people; picked, it goes there with everything in it', async () => {
    drive.moveDriveFolder.mockResolvedValue({ ok: true })
    render(<Drive />)
    fireEvent.click(screen.getByRole('button', { name: 'More actions for Carres' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Move to…' }))
    const win = within(screen.getByRole('dialog', { name: 'Move Carres' }))
    expect(win.getByText('Now in Data center — everything in it goes with it')).toBeInTheDocument()
    expect(win.getAllByRole('option').map(o => o.textContent)).toEqual(['Data centerHere now', 'HOUZS Venture', 'Revenue'])
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
    expect(screen.getAllByRole('menuitem').map(m => m.textContent)).toEqual(['View', 'Download', 'Move to Bin'])
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
    expect(record().getByText(/every copy Publish & save makes for Zack, land in this folder by themselves/)).toBeInTheDocument()
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

  it('+ New in a person’s folder uploads a letter, never a folder', () => {
    view()
    fireEvent.click(screen.getByRole('button', { name: 'New' }))
    expect(screen.getAllByRole('menuitem').map(m => m.textContent)).toEqual(['Upload a letter'])
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

  it('of a Data center file opens it through its own link and names its folder', async () => {
    render(<PreviewDrawer data={DATA} drive={DRIVE} target={{ kind: 'drive', id: 'F1' }} onClose={vi.fn()} />)
    await waitFor(() => expect(drive.openDriveFile).toHaveBeenCalledWith('F1', 'view'))
    expect(actions.openDocumentationFile).not.toHaveBeenCalled()
    expect(screen.getByText('File · Carres')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('tab', { name: /Audit trail/ }))
    expect(screen.getByText('Folder').nextElementSibling).toHaveTextContent('Carres')
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
