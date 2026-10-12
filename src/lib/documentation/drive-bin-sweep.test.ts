import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { DATA_CENTER_BIN_PER_RUN, sweepDataCenterBin } from './drive-bin-sweep'

type Answer = { data: unknown; error: unknown }

// The hourly sweep's Data center job (mig 20261013183000): the Bin lets go what waited 30 days, the bucket deletes
// their files, their trail says so — counted, never named.
function client(purge: Answer | 'throws', removed: Answer | 'throws' = { data: [], error: null }) {
  const remove = vi.fn(async () => {
    if (removed === 'throws') throw new Error('network')
    return removed
  })
  const from = vi.fn(() => ({ remove }))
  const rpc = vi.fn(async (fn: string) => {
    if (fn === 'hr_drive_bin_files_gone') return { data: 1, error: null }
    if (purge === 'throws') throw new Error('network')
    return purge
  })
  return { db: { rpc, storage: { from } } as unknown as SupabaseClient, rpc, from, remove }
}

describe('sweepDataCenterBin', () => {
  it('lets go what waited 30 days, deletes its files from hr-documents, then says so on their trail', async () => {
    const c = client({ data: { count: 3, paths: ['drive/a/IC.pdf', 'drive/b/CV.pdf'] }, error: null }, { data: [{ name: 'a' }, { name: 'b' }], error: null })
    expect(await sweepDataCenterBin(c.db)).toEqual({ expired: 3, deleted: 2 })
    expect(c.rpc).toHaveBeenCalledWith('hr_drive_bin_purge', { p_limit: DATA_CENTER_BIN_PER_RUN })
    expect(c.from).toHaveBeenCalledWith('hr-documents')
    expect(c.remove).toHaveBeenCalledWith(['drive/a/IC.pdf', 'drive/b/CV.pdf'])
    expect(c.rpc).toHaveBeenLastCalledWith('hr_drive_bin_files_gone', { p_paths: ['drive/a/IC.pdf', 'drive/b/CV.pdf'] })
  })

  it('a folder or nothing: no files to delete, no trail to write', async () => {
    const c = client({ data: { count: 1, paths: [] }, error: null })
    expect(await sweepDataCenterBin(c.db)).toEqual({ expired: 1, deleted: 0 })
    expect(c.remove).not.toHaveBeenCalled()
    expect(c.rpc).toHaveBeenCalledTimes(1)
  })

  it('a bucket that deletes nothing writes no "File deleted" — the files stay leftovers for HR’s next write', async () => {
    const refused = client({ data: { count: 1, paths: ['drive/a/IC.pdf'] }, error: null }, { data: null, error: { message: 'no' } })
    expect(await sweepDataCenterBin(refused.db)).toEqual({ expired: 1, deleted: 0 })
    expect(refused.rpc).toHaveBeenCalledTimes(1)
    const down = client({ data: { count: 1, paths: ['drive/a/IC.pdf'] }, error: null }, 'throws')
    expect(await sweepDataCenterBin(down.db)).toEqual({ expired: 1, deleted: 0 })
  })

  it('a purge that cannot run is a failed sweep, said as null', async () => {
    expect(await sweepDataCenterBin(client({ data: null, error: { code: '42501' } }).db)).toBeNull()
    expect(await sweepDataCenterBin(client('throws').db)).toBeNull()
    expect(await sweepDataCenterBin(client({ data: 'x', error: null }).db)).toBeNull()
  })
})
