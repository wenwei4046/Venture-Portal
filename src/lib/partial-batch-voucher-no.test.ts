import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// 2026-11-01: Approve all on a combined request (34 vouchers) answered
// "column reference "voucher_no" is ambiguous" — approve_voucher_batch_partial
// RETURNS TABLE(voucher_id, voucher_no, outcome), so a bare `voucher_no` in its
// body is both the OUT variable and payment_vouchers' column.
const DIR = join(process.cwd(), 'supabase', 'migrations')
const files = readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort()
const FIX = '20261101015500_partial_batch_voucher_no_ambiguity.sql'

describe('approve_voucher_batch_partial names payment_vouchers.voucher_no', () => {
  it('the fix swaps the bare RETURNING for the qualified one, once', () => {
    const sql = readFileSync(join(DIR, FIX), 'utf8')
    expect(sql).toContain("'public.approve_voucher_batch_partial(uuid,uuid[],uuid[],uuid,text,text)'::regprocedure")
    expect(sql).toContain('$q$RETURNING id, voucher_no, voucher_type,$q$')
    expect(sql).toContain('$q$RETURNING id, payment_vouchers.voucher_no, voucher_type,$q$')
  })

  it('no later migration writes the function with a bare voucher_no in RETURNING', () => {
    const later = files.filter((f) => f > FIX)
    for (const f of later) {
      const sql = readFileSync(join(DIR, f), 'utf8')
      if (!/FUNCTION\s+(public\.)?approve_voucher_batch_partial\s*\(/i.test(sql)) continue
      expect(sql, f).not.toMatch(/RETURNING\s+id,\s+voucher_no\b/)
    }
  })
})
