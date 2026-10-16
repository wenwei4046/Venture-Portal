'use client'

import { Button } from '@/components/ds/Button'
import { DescriptionList } from '@/components/ds/Data'
import { STATUS_WORD } from '@/lib/me/org'
import type { OrgPerson } from '@/lib/me/types'
import { BottomSheet, useLast } from './kit'

/** A person on the hierarchy (2026-10-17, the handoff's person sheet): Department · Today · Mobile, Call · Close. */
export function PersonSheet({ person, onClose, onCall }: { person: OrgPerson | null; onClose: () => void; onCall: (p: OrgPerson) => void }) {
  const p = useLast(person)
  if (!p) return null
  return (
    <BottomSheet open={!!person} onClose={onClose} eyebrow={p.department ?? 'HOUZS Venture'} title={p.name} description={p.title ?? ''}
      footer={<><Button variant="secondary" disabled={!p.phone} onClick={() => onCall(p)}>Call</Button><Button onClick={onClose}>Close</Button></>}>
      <DescriptionList labelWidth={90} items={[
        { label: 'Department', value: p.department ?? '—' },
        { label: 'Today', value: STATUS_WORD[p.status] },
        { label: 'Mobile', value: p.phone ?? '—', mono: true },
      ]} />
    </BottomSheet>
  )
}
