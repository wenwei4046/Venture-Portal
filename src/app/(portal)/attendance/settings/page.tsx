import { requirePage, requirePermission } from '@/lib/auth'
import { HvPage, PageHead } from '@/components/hrv/kit'
import { loadConfig } from '@/lib/attendance/server'
import SettingsView from '../_components/SettingsView'

export const dynamic = 'force-dynamic'

/**
 * HR › Attendance › Settings (2026-10-15, the handoff "Attendance Prototype Design"): who clocks, schedules,
 * locations, holidays, leave types, OT rules, approval routes and the clock-in policy. Attendance · View reads
 * it; its windows write with Attendance · Edit (`att_save_setting` / `att_delete_setting`).
 */
export default async function Page() {
  await requirePage('/attendance/settings')
  await requirePermission('attendance')
  const read = await loadConfig()
  if (!read.ok) {
    return (
      <HvPage>
        <PageHead eyebrow="Attendance" title="Settings" />
        <div className="sheet-danger">{read.reason}</div>
      </HvPage>
    )
  }
  return <SettingsView config={read.data} />
}
