'use client'

import { HvPage, PageHead } from '@/components/hrv/kit'
import type { AttConfig, AttMonth } from '@/lib/attendance/types'

/** HR › Attendance › Requests — drawn by its own pull request. */
export default function RequestsView(props: { config: AttConfig; month: AttMonth }) {
  void props
  return (
    <HvPage>
      <PageHead eyebrow="Attendance" title="Requests" />
    </HvPage>
  )
}
