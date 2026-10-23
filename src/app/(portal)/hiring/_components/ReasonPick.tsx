'use client'

import { useTransition } from 'react'
import { Select } from '@/components/hrv/select'
import { flash } from '@/components/hrv/toast'
import { setTalentReason } from '@/lib/hiring/actions'
import { REASONS, reasonLabel } from '@/lib/hiring/reasons'
import type { HiringTalent, TalentReason } from '@/lib/hiring/types'

/**
 * Why somebody is kept in the Talent Bank (2026-10-24): for Hiring · Edit a choice of the five, saved as it changes (their
 * History says from what to what); for the rest, the words. The panel and their own page draw it.
 */
export default function ReasonPick({ talent, canEdit, className }: { talent: HiringTalent; canEdit: boolean; className?: string }) {
  const [pending, start] = useTransition()
  if (!canEdit) return <>{reasonLabel(talent.reason) || '—'}</>
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
          flash(out.ok ? `${talent.name} · ${reasonLabel(next)}` : out.reason)
        })
      }}
    >
      {talent.reason ? null : <option value="">Pick a reason…</option>}
      {REASONS.map(x => (
        <option key={x.id} value={x.id}>
          {x.label}
        </option>
      ))}
    </Select>
  )
}
