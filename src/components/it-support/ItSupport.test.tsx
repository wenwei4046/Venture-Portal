import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ItRequest } from '@/lib/it-requests/model'
import ItSupport from './ItSupport'

const api = vi.hoisted(() => ({
  mine: vi.fn(), desk: vi.fn(), one: vi.fn(), submit: vi.fn(), note: vi.fn(), sign: vi.fn(), open: vi.fn(),
  upload: vi.fn(), remove: vi.fn(),
}))
vi.mock('@/lib/it-requests/actions', () => ({
  fetchMyItRequests: api.mine, fetchItDesk: api.desk, fetchItRequest: api.one,
  submitItRequest: api.submit, noteItRequest: api.note, signItFiles: api.sign, openItFile: api.open,
}))
vi.mock('@/lib/it-requests/upload', () => ({ uploadItFile: api.upload, removeItUpload: api.remove }))
vi.mock('@/components/it-requests/ImageAnnotator', () => ({
  default: ({ onSave, onClose }: { onSave: (file: File) => void; onClose: () => void }) => (
    <div role="dialog" aria-label="Annotate screenshot">
      <button onClick={() => { onSave(new File(['marked'], 'shot-marked.png', { type: 'image/png' })); onClose() }}>Save marked copy</button>
    </div>
  ),
}))

const row = (over: Partial<ItRequest> = {}): ItRequest => ({
  id: 'request-1', ref: 'IT-0001', title: 'Screen freezes', details: 'After opening the app.',
  category: 'bug', status: 'new', app: 'hr', device: 'Windows · Chrome',
  createdAt: '2026-10-20T02:15:00Z', updatedAt: '2026-10-20T02:15:00Z', statusAt: null, statusByName: null,
  senderName: 'A colleague', senderTitle: null, mine: true, files: [], notes: [], ...over,
})
const picture = { id: 'file-1', noteId: null, name: 'shot.png', contentType: 'image/png', size: 20, at: '2026-10-20T02:15:00Z' }
const png = () => new File(['pixels'], 'shot.png', { type: 'image/png' })
const attach = (dialog: HTMLElement, file = png()) => fireEvent.change(within(dialog).getByTestId('it-files'), { target: { files: [file] } })
const deferred = <T,>() => {
  let finish!: (value: T) => void
  const promise = new Promise<T>(resolve => { finish = resolve })
  return { promise, finish }
}
type Outcome = { ok: true; data: ItRequest } | { ok: false; error: string }

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('matchMedia', vi.fn(() => ({
    matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(),
  })))
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test-shot')
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
  api.mine.mockResolvedValue({ ok: true, data: [] })
  api.desk.mockResolvedValue({ ok: true, data: [] })
  api.one.mockResolvedValue({ ok: true, data: null })
  api.submit.mockResolvedValue({ ok: true, data: row() })
  api.note.mockResolvedValue({ ok: true, data: row() })
  api.sign.mockResolvedValue({ ok: true, data: { 'file-1': 'https://example.invalid/shot.png' } })
  api.remove.mockResolvedValue(undefined)
  api.upload.mockImplementation(async (file: File) => ({
    ok: true, file: { path: `own/${file.name}`, name: file.name, contentType: file.type, size: file.size },
  }))
})
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

async function createForm() {
  fireEvent.click(screen.getByRole('button', { name: 'Send a request' }))
  const dialog = await screen.findByRole('dialog', { name: 'Send to IT' })
  fireEvent.click(within(dialog).getByRole('button', { name: 'Fix a bug' }))
  fireEvent.change(within(dialog).getByRole('textbox', { name: 'Title' }), { target: { value: 'Screen freezes' } })
  return dialog
}

describe('shared white IT support', () => {
  it('uses server-preloaded list, deep link and even empty signed links without mount reads', async () => {
    const request = row({ files: [picture] })
    render(<ItSupport app="portal" initialRequests={[request]} initialRequest={request} initialId={request.id} initialFileUrls={{}} />)
    await screen.findByRole('dialog', { name: request.title })
    await act(async () => {})
    expect(api.mine).not.toHaveBeenCalled()
    expect(api.one).not.toHaveBeenCalled()
    expect(api.sign).not.toHaveBeenCalled()
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    fireEvent.click(screen.getByRole('button', { name: /Screen freezes IT-0001/ }))
    await waitFor(() => expect(api.sign).toHaveBeenCalledWith(['file-1']))
  })

  it('loads an HR app visit, filters its own requests, and refreshes on request', async () => {
    api.mine.mockResolvedValue({ ok: true, data: [row()] })
    render(<ItSupport app="hr" />)
    await screen.findByRole('button', { name: /Screen freezes IT-0001/ })
    expect(api.mine).toHaveBeenCalledOnce()
    fireEvent.change(screen.getByRole('combobox', { name: 'Status' }), { target: { value: 'fixed' } })
    expect(screen.getByText('No fixed requests.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Show all' }))
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    await waitFor(() => expect(api.mine).toHaveBeenCalledTimes(2))
    expect(api.desk).not.toHaveBeenCalled()
  })

  it('desk shows the sender and source and saves an authorised status with a note', async () => {
    const request = row({ mine: false, app: 'finance' })
    api.note.mockResolvedValue({ ok: true, data: row({ ...request, status: 'fixed', notes: [{
      id: 'note-1', side: 'it', authorName: 'Principal', body: 'Fixed the screen.', statusFrom: 'new', statusTo: 'fixed',
      at: request.createdAt, mine: true,
    }] }) })
    render(<ItSupport app="portal" desk canEdit initialRequests={[request]} />)
    fireEvent.click(screen.getByRole('button', { name: /Screen freezes IT-0001 · A colleague · Finance/ }))
    const dialog = await screen.findByRole('dialog', { name: request.title })
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Your note' }), { target: { value: 'Fixed the screen.' } })
    fireEvent.change(within(dialog).getByRole('combobox', { name: 'Status' }), { target: { value: 'fixed' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Send' }))
    await waitFor(() => expect(api.note).toHaveBeenCalledWith(expect.objectContaining({ status: 'fixed', body: 'Fixed the screen.' })))
    await within(dialog).findByText('Fixed the screen.')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Done' }))
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    await waitFor(() => expect(api.desk).toHaveBeenCalledOnce())
  })

  it.each([false, true])('an own-support deep link to another sender has no editor (readOnly=%s)', async readOnly => {
    const request = row({ mine: false, files: [picture] })
    render(<ItSupport app="finance" readOnly={readOnly} initialRequests={[]} initialRequest={request} initialFileUrls={{}} />)
    const dialog = await screen.findByRole('dialog', { name: request.title })
    expect(within(dialog).queryByRole('textbox')).toBeNull()
    expect(within(dialog).queryByRole('button', { name: /Annotate/ })).toBeNull()
    expect(within(dialog).queryByRole('combobox')).toBeNull()
  })

  it('sends the app context and uploaded file, then keeps its filed object on close', async () => {
    const view = render(<ItSupport app="finance" initialRequests={[]} />)
    const dialog = await createForm()
    attach(dialog)
    await within(dialog).findByText('1 KB')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Send to IT' }))
    await within(dialog).findByText('Sent to IT')
    expect(api.submit).toHaveBeenCalledWith(expect.objectContaining({
      app: 'finance', title: 'Screen freezes', files: [expect.objectContaining({ path: 'own/shot.png' })],
    }))
    view.unmount()
    expect(api.remove).not.toHaveBeenCalled()
  })

  it('removes a cancelled upload even when the bucket answers after the dialog is closed', async () => {
    const upload = deferred<{ ok: true; file: { path: string; name: string; contentType: string; size: number } }>()
    api.upload.mockReturnValue(upload.promise)
    render(<ItSupport app="hr" initialRequests={[]} />)
    const dialog = await createForm()
    attach(dialog)
    expect(within(dialog).getByRole('button', { name: 'Send to IT' })).toBeDisabled()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    await act(async () => { upload.finish({ ok: true, file: { path: 'own/late.png', name: 'shot.png', contentType: 'image/png', size: 6 } }) })
    expect(api.remove).toHaveBeenCalledExactlyOnceWith('own/late.png')
    expect(api.submit).not.toHaveBeenCalled()
  })

  it.each([true, false])('unmount during submit waits before cleaning uploads (saved=%s)', async saved => {
    const result = deferred<Outcome>()
    api.submit.mockReturnValue(result.promise)
    const view = render(<ItSupport app="hr" initialRequests={[]} />)
    const dialog = await createForm()
    attach(dialog)
    await within(dialog).findByText('1 KB')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Send to IT' }))
    expect(within(dialog).getByRole('button', { name: 'Remove shot.png' })).toBeDisabled()
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeDisabled()
    view.unmount()
    expect(api.remove).not.toHaveBeenCalled()
    await act(async () => { result.finish(saved ? { ok: true, data: row() } : { ok: false, error: 'Please retry.' }) })
    if (saved) expect(api.remove).not.toHaveBeenCalled()
    else expect(api.remove).toHaveBeenCalledExactlyOnceWith('own/shot.png')
  })

  it.each([true, false])('unmount during reply waits before cleaning uploads (saved=%s)', async saved => {
    const result = deferred<Outcome>()
    api.note.mockReturnValue(result.promise)
    const request = row()
    const view = render(<ItSupport app="finance" initialRequests={[request]} initialRequest={request} />)
    const dialog = await screen.findByRole('dialog', { name: request.title })
    attach(dialog)
    await within(dialog).findByText('1 KB')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Send reply' }))
    expect(within(dialog).getByRole('button', { name: 'Remove shot.png' })).toBeDisabled()
    view.unmount()
    expect(api.remove).not.toHaveBeenCalled()
    await act(async () => { result.finish(saved ? { ok: true, data: row() } : { ok: false, error: 'Please retry.' }) })
    if (saved) expect(api.remove).not.toHaveBeenCalled()
    else expect(api.remove).toHaveBeenCalledExactlyOnceWith('own/shot.png')
  })

  it('adds a marked copy to a reply without changing the original or sending it', async () => {
    const request = row({ files: [picture] })
    render(<ItSupport app="finance" initialRequests={[request]} initialRequest={request} initialFileUrls={{ 'file-1': 'https://example.invalid/shot.png' }} />)
    const dialog = await screen.findByRole('dialog', { name: request.title })
    expect(api.sign).not.toHaveBeenCalled()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Annotate shot.png' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Save marked copy' }))
    // The page's preloaded link may have run out (ten minutes): a fresh one is made at the press (2026-10-24).
    expect(api.sign).toHaveBeenCalledExactlyOnceWith(['file-1'])
    await waitFor(() => expect(api.upload).toHaveBeenCalledOnce())
    expect(api.upload.mock.calls[0][0].name).toBe('shot-marked.png')
    expect(api.note).not.toHaveBeenCalled()
    expect(within(dialog).getByRole('button', { name: 'Open shot.png' })).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Done' }))
    expect(api.remove).toHaveBeenCalledExactlyOnceWith('own/shot-marked.png')
  })

  it('offers annotation for an uploaded local preview and keeps both files in the draft', async () => {
    render(<ItSupport app="hr" initialRequests={[]} />)
    const dialog = await createForm()
    attach(dialog)
    await within(dialog).findByText('1 KB')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Annotate shot.png' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Save marked copy' }))
    await waitFor(() => expect(api.upload).toHaveBeenCalledTimes(2))
    expect(within(dialog).getByRole('button', { name: 'Remove shot.png' })).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Remove shot-marked.png' })).toBeInTheDocument()
    expect(api.submit).not.toHaveBeenCalled()
  })
})
