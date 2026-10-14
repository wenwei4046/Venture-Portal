import { requirePage, requirePermission } from '@/lib/auth'
import { HvPage, PageHead } from '@/components/hrv/kit'
import { officeToday } from '@/lib/office-time'
import { loadBoard } from '@/lib/attendance/server'
import SettingsView from '../_components/SettingsView'

export const dynamic = 'force-dynamic'

/** HR › Attendance › Settings (2026-10-15, the handoff "Attendance Prototype Design"). Attendance · View reads it. */
export default async function Page() {
  await requirePage('/attendance/settings')
  await requirePermission('attendance')
  const read = await loadBoard(officeToday())
  if (!read.ok) {
    return (
      <HvPage>
        <PageHead eyebrow="Attendance" title="Settings" />
        <div className="sheet-danger">{read.reason}</div>
      </HvPage>
    )
  }
  return <SettingsView {...read.data} />
}
