import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'

// 2026-10-23 — ⑥-4: a task's files from the Library — each opened from the Library; + Attach from Library (the task's
// subsidiary's folders, ticked, those on the task already ticked); × takes one off.

const actions = vi.hoisted(() => ({ attachMktTaskFiles: vi.fn(), detachMktTaskFile: vi.fn() }))
vi.mock('@/lib/marketing/actions', () => actions)
const rpc = vi.hoisted(() => vi.fn())
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ rpc }) }))
vi.mock('@/lib/storage/browser', () => ({ fileRoute: (b: string, p: string) => `/files/${b}/${p}` }))
const flash = vi.hoisted(() => vi.fn())
vi.mock('@/components/hrv/toast', () => ({ flash }))

import TaskLibrary from './TaskLibrary'

const CAR = '20000000-0000-4000-8000-000000000001'
const HK = '20000000-0000-4000-8000-000000000002'
const T = '10000000-0000-4000-8000-000000000001'
const LINK = '10000000-0000-4000-8000-000000000002'
const F1 = '30000000-0000-4000-8000-000000000001'
const F2 = '30000000-0000-4000-8000-000000000002'
const F3 = '30000000-0000-4000-8000-000000000003'
const X1 = '40000000-0000-4000-8000-000000000001'
const X2 = '40000000-0000-4000-8000-000000000002'
const X3 = '40000000-0000-4000-8000-000000000003'
const PROJECT = '50000000-0000-4000-8000-000000000001'
const onTask = { id: X1, name: 'Brief', path: `library/${X1}/brief.pdf`, size: 2048, mime: 'application/pdf', folder: 'Brandbook', by: 'Mei', at: '2026-10-24T01:00:00Z' }
const libRow = {
  types: [{ id: T, name: 'Brandbook', color: 'x', cat: 'Brand', link: false }, { id: LINK, name: 'Raw footage', color: 'x', cat: 'Video', link: true }],
  subs: [{ id: CAR, code: 'CAR', name: 'Carres' }, { id: HK, code: 'HK', name: 'Hookka' }],
  folders: [{ id: F1, sub: CAR, type: T, url: null }, { id: F2, sub: CAR, type: LINK, url: 'https://drive.google.com/x' }, { id: F3, sub: HK, type: T, url: null }],
  files: [
    { id: X1, folder: F1, name: 'Brief', path: `library/${X1}/brief.pdf`, size: 2048, mime: 'application/pdf' },
    { id: X2, folder: F1, name: 'Logo', path: `library/${X2}/logo.png`, size: 4096, mime: 'image/png' },
    { id: X3, folder: F3, name: 'Hookka sheet', path: `library/${X3}/sheet.pdf`, size: 9, mime: 'application/pdf' },
  ],
}

beforeEach(() => {
  Object.values(actions).forEach(f => f.mockReset())
  rpc.mockReset().mockResolvedValue({ data: libRow, error: null })
  flash.mockReset()
})

describe('a task’s Library files', () => {
  it('opens each from the Library; × takes it off', async () => {
    actions.detachMktTaskFile.mockResolvedValueOnce({ ok: true, files: [] })
    render(<TaskLibrary project={PROJECT} sub={CAR} open initial={[onTask]} canEdit />)
    expect(screen.getByRole('link', { name: /Brief/ }).getAttribute('href')).toBe(`/files/marketing/library/${X1}/brief.pdf`)
    expect(screen.getByText('Brandbook · 2 KB')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Take Brief off the task' }))
    // The answer is awaited after the call: wait for what it does, not for the call (2026-10-23 — it raced on CI).
    await waitFor(() => {
      expect(flash).toHaveBeenCalledWith('Took "Brief" off the task')
      expect(screen.getByText('No files from the Library')).toBeTruthy()
    })
    expect(actions.detachMktTaskFile).toHaveBeenCalledWith(PROJECT, X1)
  })

  it('attaches from the Library: its own subsidiary’s files folders, those on the task ticked already', async () => {
    actions.attachMktTaskFiles.mockResolvedValueOnce({ ok: true, attached: 1, files: [onTask, { ...onTask, id: X2, name: 'Logo', path: `library/${X2}/logo.png` }] })
    render(<TaskLibrary project={PROJECT} sub={CAR} open initial={[onTask]} canEdit />)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '+ Attach from Library' })) })
    const dlg = screen.getByRole('dialog', { name: 'Attach from Library' })
    expect(within(dlg).getAllByRole('checkbox').map(c => `${(c as HTMLInputElement).checked}:${(c as HTMLInputElement).disabled}`)).toEqual(['true:true', 'false:false'])
    expect(within(dlg).queryByText('Hookka sheet')).toBeNull()
    expect(within(dlg).queryByText(/Raw footage/)).toBeNull()
    fireEvent.click(within(dlg).getAllByRole('checkbox')[1])
    fireEvent.click(within(dlg).getByRole('button', { name: 'Attach 1 file' }))
    await waitFor(() => {
      expect(flash).toHaveBeenCalledWith('Attached 1 file from the Library')
      expect(screen.queryByRole('dialog')).toBeNull()
    })
    expect(actions.attachMktTaskFiles).toHaveBeenCalledWith(PROJECT, [X2])
    expect(screen.getByRole('link', { name: /Logo/ })).toBeTruthy()
  })

  it('offers nothing to write on a closed task or to somebody who only views', () => {
    const { unmount } = render(<TaskLibrary project={PROJECT} sub={CAR} open={false} initial={[onTask]} canEdit />)
    expect(screen.queryByRole('button', { name: '+ Attach from Library' })).toBeNull()
    unmount()
    render(<TaskLibrary project={PROJECT} sub={CAR} open initial={[onTask]} canEdit={false} />)
    expect(screen.queryByRole('button', { name: '+ Attach from Library' })).toBeNull()
    expect(screen.queryByRole('button', { name: /off the task/ })).toBeNull()
  })
})
