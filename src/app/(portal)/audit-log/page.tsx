import dayjs from 'dayjs'
import { requireRole } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

interface Props {
  searchParams: Promise<{ resource?: string; page?: string }>
}

const PAGE_SIZE = 50

export default async function AuditLogPage({ searchParams }: Props) {
  await requireRole(['principal'])
  const supabase = await createClient()

  const { resource, page: rawPage } = await searchParams
  const page = Math.max(1, parseInt(rawPage ?? '1', 10))
  const offset = (page - 1) * PAGE_SIZE

  let query = supabase
    .from('access_log')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1)

  if (resource) {
    query = query.eq('resource_type', resource)
  }

  const { data: logs, count } = await query
  const totalPages = Math.ceil((count ?? 0) / PAGE_SIZE)

  const resourceTypes = [
    { value: '', label: 'All' },
    { value: 'director_payouts', label: 'Director Payouts' },
    { value: 'director_salary_print', label: 'Director Print' },
    { value: 'hr_staff_costs', label: 'HR Staff Costs' },
  ]

  return (
    <div>
      <div className="mb-10">
        <h1 className="font-serif text-3xl text-ink">Access Audit Log</h1>
        <p className="font-serif italic text-graphite text-base mt-2">
          Tracks who viewed sensitive salary and director data.{' '}
          <em>LHDN + internal governance compliance.</em>
        </p>
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
            No access log entries yet. Entries appear when users view sensitive pages.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-hairline text-xs uppercase tracking-wide text-muted font-sans">
                <th className="text-left py-3 pr-4 font-medium">When</th>
                <th className="text-left py-3 pr-4 font-medium">User</th>
                <th className="text-left py-3 pr-4 font-medium">Role</th>
                <th className="text-left py-3 pr-4 font-medium">Resource</th>
                <th className="text-left py-3 pr-4 font-medium">Action</th>
                <th className="text-left py-3 font-medium">Details</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id} className="border-b border-hairline last:border-0">
                  <td className="py-3 pr-4 font-mono text-xs text-muted whitespace-nowrap">
                    {dayjs(log.created_at).format('D MMM YY HH:mm')}
                  </td>
                  <td className="py-3 pr-4 font-serif text-md text-ink">
                    {log.user_email ?? '—'}
                  </td>
                  <td className="py-3 pr-4">
                    <span className="font-serif italic text-graphite text-sm">
                      {log.user_role ?? '—'}
                    </span>
                  </td>
                  <td className="py-3 pr-4 font-mono text-xs text-ink">
                    {formatResource(log.resource_type)}
                    {log.resource_id ? (
                      <span className="text-muted ml-1">#{log.resource_id.slice(0, 8)}</span>
                    ) : null}
                  </td>
                  <td className="py-3 pr-4 font-serif italic text-sm text-graphite">
                    {log.action}
                  </td>
                  <td className="py-3 font-mono text-xs text-muted max-w-[200px] truncate">
                    {log.metadata && Object.keys(log.metadata as object).length > 0
                      ? JSON.stringify(log.metadata)
                      : '—'}
                  </td>
                </tr>
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
  }
  return labels[type] ?? type
}
