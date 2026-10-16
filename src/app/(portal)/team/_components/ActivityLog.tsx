import { officeTime } from '@/lib/office-time'
import { createClient } from '@/lib/supabase/server'
import { navLabelByPath } from '@/components/layout/nav-config'
import { listSubDepartments } from '../../revenue/_lib/sub-departments'
import { describeActivity, type ActivityRow } from '@/lib/activity'
import PersonWell from './PersonWell'
import w from './person-well.module.css'

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

  // A well of the person's page since 2026-10-16 (the 360), the count at its title's end.
  return (
    <PersonWell title="Activity" icon="calendar" count={rows.length === limit ? `LAST ${limit}` : `${rows.length} ENTRIES`}>
      {rows.length === 0 ? (
        <p className={w.note}>Nothing recorded yet. Page visits are logged from the moment they next sign in.</p>
      ) : (
        // One line per visit or read, newest first, in the sheet's table —
        // the same three columns as the person card's Activity tab.
        <div className="table-scroll">
          <table className="ledger-table">
            <thead>
              <tr>
                <th className="w-[112px]">When</th>
                <th className="w-[104px]">Action</th>
                <th>Where</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => {
                const line = describeActivity(row, labels)
                const at = officeTime(row.created_at)
                return (
                  <tr key={`${row.created_at}-${i}`}>
                    <td className="whitespace-nowrap">
                      <time
                        dateTime={row.created_at}
                        className="font-mono text-[11px]"
                        title={at.format('D MMM YYYY HH:mm:ss')}
                      >
                        {at.format('D MMM HH:mm')}
                      </time>
                    </td>
                    <td className="text-[10.5px] font-medium uppercase tracking-[0.06em]">
                      {line.verb}
                    </td>
                    <td>
                      {line.target}
                      {line.detail ? (
                        <span className="font-mono text-[11px] ml-2">{line.detail}</span>
                      ) : null}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </PersonWell>
  )
}
