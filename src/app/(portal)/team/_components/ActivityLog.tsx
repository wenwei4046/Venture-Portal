import dayjs from 'dayjs'
import { createClient } from '@/lib/supabase/server'
import { navLabelByPath } from '@/components/layout/nav-config'
import { listSubDepartments } from '../../revenue/_lib/sub-departments'
import { describeActivity, type ActivityRow } from '@/lib/activity'

/**
 * What this account has been doing, newest first.
 *
 * `access_log` is readable by the Principal and by the account itself (its own
 * RLS), so callers gate on that before rendering — an HR reader would
 * otherwise get an empty panel and read it as "they did nothing".
 */
export default async function ActivityLog({
  userId,
  limit = 40,
}: {
  userId: string
  limit?: number
}) {
  const supabase = await createClient()

  // The Revenue group's children are database rows, so the label map needs
  // them too — otherwise a visit to /revenue/fair reads as "Fair" the bare
  // segment rather than "Revenue · Fair".
  const [{ data }, subDepts] = await Promise.all([
    supabase
      .from('access_log')
      .select('resource_type, resource_id, action, metadata, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit),
    listSubDepartments(),
  ])

  const labels = navLabelByPath({
    revenueSubDepts: subDepts.map(s => ({ slug: s.slug, name: s.name })),
  })
  const rows = (data ?? []) as ActivityRow[]

  return (
    <section className="mt-10">
      <div className="sect-head">
        <h2>Activity</h2>
        <span className="rule" aria-hidden />
        <span className="count">
          {rows.length === limit ? `LAST ${limit}` : `${rows.length} ENTRIES`}
        </span>
      </div>

      {rows.length === 0 ? (
        <div className="py-10 text-center border border-hairline rounded-card bg-surface">
          <p className="font-serif italic text-muted text-sm">
            Nothing recorded yet. Page visits are logged from the moment they
            next sign in.
          </p>
        </div>
      ) : (
        <ol className="border-t border-hairline">
          {rows.map((row, i) => {
            const line = describeActivity(row, labels)
            const at = dayjs(row.created_at)
            return (
              <li
                key={`${row.created_at}-${i}`}
                className="py-2.5 border-b border-hairline last:border-0 flex items-baseline justify-between gap-4"
              >
                <div className="min-w-0">
                  <span className="font-sans text-xs uppercase tracking-wide text-graphite mr-2">
                    {line.verb}
                  </span>
                  <span className="font-serif text-md text-ink">{line.target}</span>
                  {line.detail ? (
                    <span className="font-mono text-[11px] text-muted ml-2">{line.detail}</span>
                  ) : null}
                </div>
                <time
                  dateTime={row.created_at}
                  className="font-mono text-xs text-muted shrink-0"
                  title={at.format('D MMM YYYY HH:mm:ss')}
                >
                  {at.format('D MMM HH:mm')}
                </time>
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}
