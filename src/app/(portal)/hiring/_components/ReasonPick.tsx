'use client'

import { useTransition } from 'react'
import { Select } from '@/components/hrv/select'
import { flash } from '@/components/hrv/toast'
import { setTalentReason } from '@/lib/hiring/actions'
import { pickable, reasonLabel } from '@/lib/hiring/reasons'
import type { HiringBankReason, HiringTalent, TalentReason } from '@/lib/hiring/types'

/**
 * Why somebody is kept in the Talent Bank (2026-10-24): for Hiring · Edit a choice of HR's list — the reasons that are
 * on, and theirs though it was turned off since — saved as it changes (their History says from what to what); for the
 * rest, the words. The panel and their own page draw it.
 */
export default function ReasonPick({
  talent,
  reasons,
  canEdit,
  className,
}: {
  talent: HiringTalent
  reasons: readonly HiringBankReason[]
  canEdit: boolean
  className?: string
}) {
  const [pending, start] = useTransition()
  if (!canEdit) return <>{reasonLabel(reasons, talent.reason) || '—'}</>
  return (
    <Select
      bare
      className={className}
      value={talent.reason ?? ''}
      disabled={pending}
      aria-label={`Why ${talent.name} is kept`}
      onChange={e => {
        const next = e.target.value as TalentReason
        start(async () => {
          const out = await setTalentReason(talent.id, next)
          flash(out.ok ? `${talent.name} · ${reasonLabel(reasons, next)}` : out.reason)
        })
      }}
    >
      {talent.reason ? null : <option value="">Pick a reason…</option>}
      {pickable(reasons, talent.reason).map(x => (
        <option key={x.id} value={x.id}>
          {x.name}
        </option>
      ))}
    </Select>
  )
}
