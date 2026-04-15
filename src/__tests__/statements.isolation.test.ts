import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Phase 7 Step 11 — Statements must never write to any money ledger.
// issueStatement and markStatementPaid are display-only transitions; all
// actual money movement happens through payment_voucher / loan flows.
//
// This is a source-code invariant check: the actions file must not mention
// any pool/ledger table name inside the isolation-critical functions.
// If this test fails, someone added a pool write that would double-count
// or silently shift balances. Revert and route the write through a voucher.

describe('Phase 7 Step 11 — statements actions stay display-only', () => {
  const source = readFileSync(
    join(process.cwd(), 'src/app/(portal)/statements/actions.ts'),
    'utf8'
  )

  // Split on the function headers so we only inspect the two isolation-critical
  // bodies, not generateStatements (which legitimately writes to
  // monthly_statement_lines, its own table).
  function extractFunctionBody(funcName: string) {
    const idx = source.indexOf(`export async function ${funcName}`)
    if (idx < 0) throw new Error(`${funcName} not found`)
    const nextExport = source.indexOf('export async function', idx + 1)
    const raw = source.slice(idx, nextExport === -1 ? source.length : nextExport)
    // Strip line comments so explanatory comments don't trip the scanner.
    return raw
      .split('\n')
      .filter((l) => !l.trim().startsWith('//'))
      .join('\n')
  }

  const forbidden = [
    'hv_operating_fund',
    'dept_pools',
    'invoice_payout_pool',
    'payment_vouchers',
    'bank_accounts',
  ]

  for (const funcName of ['issueStatement', 'markStatementPaid']) {
    it(`${funcName} writes no pool/ledger tables`, () => {
      const body = extractFunctionBody(funcName)
      for (const tbl of forbidden) {
        // Only flag actual table access (.from('<tbl>')), not string mentions.
        const pattern = `.from('${tbl}')`
        expect(
          body.includes(pattern),
          `${funcName} must not access ${tbl} — display-only transitions only`
        ).toBe(false)
      }
    })
  }
})
