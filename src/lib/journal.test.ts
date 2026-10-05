import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { postJournalEntry } from './journal'

function client(answer: { data: unknown; error: { message: string } | null }) {
  const rpc = vi.fn().mockResolvedValue(answer)
  return { rpc, supabase: { rpc } as unknown as SupabaseClient }
}

const entry = {
  transactionDate: '2026-10-06',
  description: 'Test',
  createdBy: '10000000-0000-4000-8000-000000000001',
  lines: [
    { accountCode: '3000', debit: 100 },
    { accountCode: '4000', credit: 100 },
  ],
}

describe('postJournalEntry', () => {
  // 2026-10-06: post_journal_entry is not a signed-in user's to call — the
  // app posts through the door that checks the name and the scope.
  it('posts through post_journal_entry_as_caller, in the caller’s own name', async () => {
    const { rpc, supabase } = client({ data: 'je-1', error: null })
    await expect(postJournalEntry(supabase, entry)).resolves.toBe('je-1')
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc.mock.calls[0][0]).toBe('post_journal_entry_as_caller')
    expect(rpc.mock.calls[0][1]).toMatchObject({ p_created_by: entry.createdBy, p_transaction_date: '2026-10-06' })
    expect(rpc.mock.calls[0][1]).not.toHaveProperty('p_segment')
  })

  it('refuses an unbalanced entry before the database', async () => {
    const { rpc, supabase } = client({ data: null, error: null })
    await expect(postJournalEntry(supabase, { ...entry, lines: [{ accountCode: '3000', debit: 100 }, { accountCode: '4000', credit: 90 }] }))
      .rejects.toThrow(/unbalanced/)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('says what the database refused', async () => {
    const { supabase } = client({ data: null, error: { message: 'post_journal_entry: a journal is posted in your own name' } })
    await expect(postJournalEntry(supabase, entry)).rejects.toThrow(/posted in your own name/)
  })
})
