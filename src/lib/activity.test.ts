import { describe, it, expect } from 'vitest'
import { describeActivity, describePagePath, type ActivityRow } from './activity'
import { navLabelByPath } from '@/components/layout/nav-config'

const L = navLabelByPath

describe('describePagePath', () => {
  it('names a top-level page the way the sidebar does', () => {
    expect(describePagePath('/approvals', L)).toEqual({ target: 'Approvals', detail: null })
  })

  it('resolves a detail page through its list', () => {
    const { target, detail } = describePagePath(
      '/approvals/3a0f9d1f-1688-4c2a-bdbf-d49deab6e073',
      L,
    )
    expect(target).toBe('Approvals')
    expect(detail).toBe('detail 3a0f9d1f')
  })

  it('prefers the deepest matching entry, not the first', () => {
    // Both /reconciliation and /reconciliation/journal-entries are nav entries.
    expect(describePagePath('/reconciliation/journal-entries', L).target).toContain(
      'Journal Entries',
    )
  })

  it('carries the group label for a grouped child', () => {
    expect(describePagePath('/team/people', L).target).toBe('Team · People Management')
  })

  it('names the readable segments of a deeper path', () => {
    const { target, detail } = describePagePath('/team/people/new', L)
    expect(target).toBe('Team · People Management')
    expect(detail).toBe('New')
  })

  it('treats a period segment as an id, not a page name', () => {
    expect(describePagePath('/hr-costing/commission/2026-08', L).detail).toBe('detail 2026-08')
  })

  it('ignores a query string', () => {
    expect(describePagePath('/dept-pool?basis=accrual', L).target).toBe('Dept Pool · Cash')
  })

  it('falls back to the last segment for a path under no nav entry', () => {
    expect(describePagePath('/some/unlisted-thing', L)).toEqual({
      target: 'Unlisted Thing',
      detail: null,
    })
  })
})

describe('describeActivity', () => {
  const base: ActivityRow = {
    resource_type: 'page',
    resource_id: '/payments',
    action: 'view',
    metadata: null,
    created_at: '2026-09-01T08:00:00Z',
  }

  it('reads a page view as a sentence', () => {
    expect(describeActivity(base, L)).toEqual({
      verb: 'Opened',
      target: 'Payments',
      detail: null,
    })
  })

  it('keeps the pre-existing privileged-read rows readable', () => {
    expect(
      describeActivity({ ...base, resource_type: 'hr_staff_costs', resource_id: null }, L),
    ).toEqual({ verb: 'Opened', target: 'Staff directory', detail: null })
  })

  it('maps a known action to its verb', () => {
    expect(describeActivity({ ...base, action: 'export' }, L).verb).toBe('Exported')
  })

  it('title-cases an action it has no verb for', () => {
    expect(describeActivity({ ...base, action: 'reopen' }, L).verb).toBe('Reopen')
  })

  it('does not read back the resource name the action already carries', () => {
    // Logged as update_payment_voucher on a payment_voucher row, which read
    // "UPDATE PAYMENT VOUCHER Payment voucher" before the suffix was stripped.
    expect(
      describeActivity(
        {
          ...base,
          resource_type: 'payment_voucher',
          action: 'update_payment_voucher',
          resource_id: '4d39ab31-1111-2222-3333-444455556666',
        },
        L,
      ),
    ).toEqual({ verb: 'Edited', target: 'Payment voucher', detail: '4d39ab31' })
  })

  it('shortens a uuid but leaves a period alone', () => {
    const row = {
      ...base,
      resource_type: 'director_salary_submission',
      action: 'reopen_to_draft',
      resource_id: '2026-06-01',
    }
    expect(describeActivity(row, L)).toEqual({
      verb: 'Reopen To Draft',
      target: 'Director Salary Submission',
      detail: '2026-06-01',
    })
  })

  it('falls back to a readable name for an unknown resource type', () => {
    expect(
      describeActivity({ ...base, resource_type: 'loan_schedule', resource_id: null }, L).target,
    ).toBe('Loan Schedule')
  })
})
