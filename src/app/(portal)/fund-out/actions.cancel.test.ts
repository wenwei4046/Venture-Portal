import { describe } from 'vitest'

/**
 * M2 regression coverage lives in:
 *
 *   1. supabase/migrations/20260101000017_approval_cascade_trigger.sql
 *      — the cancel_loan_and_approval() Postgres function includes its own
 *      role check (`current_user_role() IN ('finance', 'principal')`) and
 *      status guard. Any divergence from that contract will surface as a
 *      Postgres error in the Server Action.
 *
 *   2. Playwright MCP E2E test run during Phase 2 Step 2
 *      — Finance creates a pending loan → clicks Cancel → verifies the loan
 *      disappears from the Fund OUT list (i.e. no orphan pending_approval row).
 *
 * A pure Vitest test cannot meaningfully cover this fix: the whole point of
 * the M2 fix is that it bypasses RLS via SECURITY DEFINER in Postgres. A
 * mocked Supabase client would let us assert that the RPC was called with
 * the right arguments, but not that the RLS bypass actually works. The real
 * test target is the migration file + the E2E verification.
 *
 * This placeholder stays as a breadcrumb for future developers reading the
 * test tree to find the M2 coverage trail.
 */
describe.todo('cancelLoan — M2 regression covered by migration + E2E (see file header)')
