import dayjs from 'dayjs'
import { requirePermission } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import LedgerRow from '@/components/LedgerRow'

interface Props {
  searchParams: Promise<{ resource?: string; page?: string }>
}

const PAGE_SIZE = 50

export default async function AuditLogPage({ searchParams }: Props) {
  await requirePermission('audit_log')
  const supabase = await createClient()

  const { resource, page: rawPage } = await searchParams
  const page = Math.max(1, parseInt(rawPage ?? '1', 10))
  const offset = (page - 1) * PAGE_SIZE

  let query = supabase
    .from('access_log')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1)

  // Page views arrived on 2026-09-01 and outnumber everything else by an order
  // of magnitude, so the default view is the one this page was built for — the
  // privileged reads. 'page' and 'all' are a click away, and neither is hidden.
  if (resource === 'page') {
    query = query.eq('resource_type', 'page')
  } else if (resource && resource !== 'all') {
    query = query.eq('resource_type', resource)
  } else if (!resource) {
    query = query.neq('resource_type', 'page')
  }

  const { data: logs, count } = await query
  const totalPages = Math.ceil((count ?? 0) / PAGE_SIZE)

  const resourceTypes = [
    { value: '', label: 'Data access' },
    { value: 'page', label: 'Page views' },
    { value: 'all', label: 'Everything' },
    { value: 'director_payouts', label: 'Director Payouts' },
    { value: 'director_salary_print', label: 'Director Print' },
    { value: 'hr_staff_costs', label: 'HR Staff Costs' },
  ]

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="page-eyebrow">
            <em>I.</em> ADMIN · ACCESS AUDIT
          </div>
          <h1 className="page-title">Access Audit Log</h1>
        </div>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-3 mb-6">
        <span className="font-serif italic text-sm text-graphite">Filter:</span>
        {resourceTypes.map((rt) => {
          const active = (resource ?? '') === rt.value
          return (
            <a
              key={rt.value}
              href={rt.value ? `/audit-log?resource=${rt.value}` : '/audit-log'}
              className={
                active
                  ? 'px-3 py-1 rounded-md bg-accent text-white font-serif italic text-sm'
                  : 'px-3 py-1 rounded-md bg-surface text-graphite hover:bg-surface-2 font-serif italic text-sm transition-colors'
              }
            >
              {rt.label}
            </a>
          )
        })}
      </div>

      {/* Count */}
      <p className="font-mono text-xs text-muted mb-4">
        {count ?? 0} total entries · Page {page} of {Math.max(1, totalPages)}
      </p>

      {/* Table */}
      {!logs || logs.length === 0 ? (
        <div className="border border-hairline rounded-md bg-surface p-8 text-center">
          <p className="font-serif italic text-muted text-sm">
            Nothing recorded under this filter yet.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="ledger-table">
            <thead>
              <tr>
                <th>When</th>
                <th className="m-hide">User</th>
                <th className="m-hide">Role</th>
                <th className="m-hide">Resource</th>
                <th>Action</th>
                <th className="m-hide">Details</th>
                <th className="lt-toggle" aria-hidden />
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <LedgerRow key={log.id}>
                  <td className="font-mono text-[11px] text-graphite whitespace-nowrap">
                    {dayjs(log.created_at).format('D MMM YY HH:mm')}
                  </td>
                  <td className="font-serif text-[15px] text-ink m-hide" data-label="User">
                    {log.user_email ?? '—'}
                  </td>
                  <td className="m-hide" data-label="Role">
                    <span className="font-serif italic text-graphite text-sm">
                      {log.user_role ?? '—'}
                    </span>
                  </td>
                  <td className="font-mono text-[12px] text-ink m-hide" data-label="Resource">
                    {formatResource(log.resource_type)}
                    {log.resource_id ? (
                      <span className="text-graphite ml-1">
                        {log.resource_type === 'page'
                          ? log.resource_id
                          : `#${log.resource_id.slice(0, 8)}`}
                      </span>
                    ) : null}
                  </td>
                  <td className="font-serif italic text-sm text-graphite">
                    {log.action}
                  </td>
                  <td className="font-mono text-[11px] text-graphite max-w-[200px] truncate m-hide" data-label="Details">
                    {log.metadata && Object.keys(log.metadata as object).length > 0
                      ? JSON.stringify(log.metadata)
                      : '—'}
                  </td>
                </LedgerRow>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 mt-6">
          {page > 1 && (
            <a
              href={`/audit-log?page=${page - 1}${resource ? `&resource=${resource}` : ''}`}
              className="px-3 py-1 rounded-md bg-surface text-graphite hover:bg-surface-2 font-sans text-sm transition-colors"
            >
              ← Prev
            </a>
          )}
          {page < totalPages && (
            <a
              href={`/audit-log?page=${page + 1}${resource ? `&resource=${resource}` : ''}`}
              className="px-3 py-1 rounded-md bg-surface text-graphite hover:bg-surface-2 font-sans text-sm transition-colors"
            >
              Next →
            </a>
          )}
        </div>
      )}
    </div>
  )
}

function formatResource(type: string): string {
  const labels: Record<string, string> = {
    director_payouts: 'Director Payouts',
    director_salary_print: 'Director Print',
    hr_staff_costs: 'HR Staff Costs',
    page: 'Page',
  }
  return labels[type] ?? type
}
