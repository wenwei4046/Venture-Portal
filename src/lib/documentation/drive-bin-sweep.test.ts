import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { DATA_CENTER_BIN_PER_RUN, DATA_CENTER_ORPHANS_PER_RUN, sweepDataCenterBin, sweepDataCenterOrphans } from './drive-bin-sweep'

type Answer = { data: unknown; error: unknown }

// The hourly sweep's Data center job (mig 20261013183000): the Bin lets go what waited 30 days, the bucket deletes
// their files, their trail says so — counted, never named.
function client(purge: Answer | 'throws', removed: Answer | 'throws' = { data: [], error: null }, orphans: Answer = { data: [], error: null }) {
  const remove = vi.fn(async () => {
    if (removed === 'throws') throw new Error('network')
    return removed
  })
  const from = vi.fn(() => ({ remove }))
  const rpc = vi.fn(async (fn: string) => {
    if (fn === 'hr_drive_bin_files_gone') return { data: 1, error: null }
    if (fn === 'hr_drive_orphans') return orphans
    if (purge === 'throws') throw new Error('network')
    return purge
  })
  return { db: { rpc, storage: { from } } as unknown as SupabaseClient, rpc, from, remove }
}

describe('sweepDataCenterBin', () => {
  it('lets go what waited 30 days, deletes its files from hr-documents, then says so on their trail', async () => {
    const c = client({ data: { count: 3, paths: ['drive/a/IC.pdf', 'drive/b/CV.pdf'] }, error: null }, { data: [{ name: 'a' }, { name: 'b' }], error: null })
    expect(await sweepDataCenterBin(c.db)).toEqual({ expired: 3, deleted: 2, orphans: 0 })
    expect(c.rpc).toHaveBeenCalledWith('hr_drive_bin_purge', { p_limit: DATA_CENTER_BIN_PER_RUN })
    expect(c.from).toHaveBeenCalledWith('hr-documents')
    expect(c.remove).toHaveBeenCalledWith(['drive/a/IC.pdf', 'drive/b/CV.pdf'])
    expect(c.rpc).toHaveBeenCalledWith('hr_drive_bin_files_gone', { p_paths: ['drive/a/IC.pdf', 'drive/b/CV.pdf'] })
  })

  it('a folder or nothing: no files to delete, no trail to write', async () => {
    const c = client({ data: { count: 1, paths: [] }, error: null })
    expect(await sweepDataCenterBin(c.db)).toEqual({ expired: 1, deleted: 0, orphans: 0 })
    expect(c.remove).not.toHaveBeenCalled()
    expect(c.rpc).not.toHaveBeenCalledWith('hr_drive_bin_files_gone', expect.anything())
  })

  it('a bucket that deletes nothing writes no "File deleted" — the files stay leftovers for HR’s next write', async () => {
    const refused = client({ data: { count: 1, paths: ['drive/a/IC.pdf'] }, error: null }, { data: null, error: { message: 'no' } })
    expect(await sweepDataCenterBin(refused.db)).toEqual({ expired: 1, deleted: 0, orphans: 0 })
    expect(refused.rpc).not.toHaveBeenCalledWith('hr_drive_bin_files_gone', expect.anything())
    const down = client({ data: { count: 1, paths: ['drive/a/IC.pdf'] }, error: null }, 'throws')
    expect(await sweepDataCenterBin(down.db)).toEqual({ expired: 1, deleted: 0, orphans: 0 })
  })

  it('a purge that cannot run is a failed sweep, said as null', async () => {
    expect(await sweepDataCenterBin(client({ data: null, error: { code: '42501' } }).db)).toBeNull()
    expect(await sweepDataCenterBin(client('throws').db)).toBeNull()
    expect(await sweepDataCenterBin(client({ data: 'x', error: null }).db)).toBeNull()
  })

  // 2026-10-14 (the review of View only me): an object nobody recorded is its uploader’s alone — the sweep takes it a
  // day later, never anything outside drive/.
  it('removes day-old objects no Data center file names, and counts them', async () => {
    const c = client({ data: { count: 0, paths: [] }, error: null }, { data: [{ name: 'x' }], error: null },
      { data: ['drive/c/Copy.pdf', 'letters/x/not-ours.pdf'], error: null })
    expect(await sweepDataCenterBin(c.db)).toEqual({ expired: 0, deleted: 0, orphans: 1 })
    expect(c.rpc).toHaveBeenCalledWith('hr_drive_orphans', { p_limit: DATA_CENTER_ORPHANS_PER_RUN })
    expect(c.remove).toHaveBeenCalledWith(['drive/c/Copy.pdf'])
    expect(await sweepDataCenterOrphans(client({ data: { count: 0, paths: [] }, error: null }, undefined, { data: null, error: { code: 'x' } }).db)).toBe(0)
  })
})
