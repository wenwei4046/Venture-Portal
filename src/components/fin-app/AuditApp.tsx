'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState, useTransition } from 'react'
import { DateField } from '@/components/finv/DateField'
import { DialogButton, DialogForm, Field, FinDialog } from '@/components/finv/Dialog'
import fm from '@/components/finv/form.module.css'
import { Select } from '@/components/hrv/select'
import { AUDIT_AREAS, type AuditTableLine, type ChangeFilters } from '@/lib/audit/changes'
import { AUDIT_HREF, auditKeep, auditListHref } from '@/lib/fin-app/audit-model'
import type { PageModel } from '@/lib/fin-app/page-model'
import type { BarButton } from './AppScreen'
import PageApp from './PageApp'

// Profile › Admin › Audit Log in the Finance phone app (2026-10-15, part E3):
// the page frame of the app's undrawn pages (`PageApp`) over Audit Log ›
// Changes, back to Profile, with the desktop page's own controls in the bar —
// *Filter* (its Area, Record, Who, From and To, in the kit's sheet; a filtered
// view is an address, as the desktop's) and *Older* / *Newest* through its
// pages of a hundred changes. What it reads is the server's.

const PROFILE = { label: 'Profile', href: '/fin-app/profile' }

export default function AuditApp({
  model,
  search,
  filters,
  lines,
  actors,
  today,
  olderBefore,
}: {
  model: PageModel
  search: string
  filters: ChangeFilters
  lines: AuditTableLine[]
  actors: Array<{ id: string; name: string }>
  today: string
  /** The oldest change on this page, when older ones stand beyond it. */
  olderBefore: number | null
}) {
  const router = useRouter()
  const [filtering, setFiltering] = useState(false)
  const [moving, startMove] = useTransition()
  const go = (keep: string) => {
    setFiltering(false)
    startMove(() => router.replace(auditListHref(keep), { scroll: false }))
  }
  const bar: BarButton[] = [
    { key: 'filter', label: 'Filter', kind: 'primary', disabled: moving, onClick: () => setFiltering(true) },
    ...(filters.before ? [{ key: 'newest', label: 'Newest', disabled: moving, onClick: () => go(auditKeep(filters, { before: null })) }] : []),
    ...(olderBefore != null ? [{ key: 'older', label: 'Older', disabled: moving, onClick: () => go(auditKeep(filters, { before: olderBefore })) }] : []),
  ]
  return (
    <PageApp place={{ href: AUDIT_HREF, title: 'Audit Log', roman: '', keep: auditKeep(filters) }} model={model} search={search} bar={bar} home={PROFILE}>
      <FilterSheet
        open={filtering}
        onClose={() => setFiltering(false)}
        filters={filters}
        lines={lines}
        actors={actors}
        today={today}
        busy={moving}
        // A record's history keeps its record, as the desktop form's hidden field; Clear drops everything.
        onShow={(f) => go(auditKeep({ ...f, row: filters.row, before: null }))}
        onClear={() => go('')}
      />
    </PageApp>
  )
}

type Picked = Pick<ChangeFilters, 'area' | 'table' | 'who' | 'from' | 'to'>

/** The desktop page's filters in the kit's sheet: only the areas and records the reader's permissions open. */
export function FilterSheet({
  open,
  onClose,
  filters,
  lines,
  actors,
  today,
  busy,
  onShow,
  onClear,
}: {
  open: boolean
  onClose: () => void
  filters: ChangeFilters
  lines: AuditTableLine[]
  actors: Array<{ id: string; name: string }>
  today: string
  busy: boolean
  onShow: (f: Picked) => void
  onClear: () => void
}) {
  const recorded = lines.filter((l) => l.mode !== 'none')
  const areas = AUDIT_AREAS.filter((a) => recorded.some((l) => l.area === a))
  const [area, setArea] = useState('')
  const [table, setTable] = useState('')
  const [who, setWho] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  // Each opening starts from the filters on show.
  useEffect(() => {
    if (!open) return
    setArea(filters.area ?? '')
    setTable(filters.table ?? '')
    setWho(filters.who ?? '')
    setFrom(filters.from ?? '')
    setTo(filters.to ?? '')
  }, [open, filters])
  const show = () =>
    onShow({
      area: (area || null) as ChangeFilters['area'],
      table: table || null,
      who: who || null,
      from: from || null,
      to: to || null,
    })
  return (
    <FinDialog open={open} onClose={onClose} title="Filter changes" locked={busy}>
      <DialogForm
        onSubmit={show}
        buttons={
          <>
            <DialogButton onClick={onClear} disabled={busy}>
              Clear
            </DialogButton>
            <DialogButton kind="primary" type="submit" disabled={busy}>
              {busy ? 'Showing…' : 'Show'}
            </DialogButton>
          </>
        }
      >
        <Field label="Area" htmlFor="audit-area">
          <Select id="audit-area" round={12} className={fm.select} value={area} onChange={(e) => setArea(e.target.value)}>
            <option value="">Every area</option>
            {areas.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Record" htmlFor="audit-table">
          <Select id="audit-table" round={12} className={fm.select} value={table} onChange={(e) => setTable(e.target.value)}>
            <option value="">Every record</option>
            {areas.map((a) => (
              <optgroup key={a} label={a}>
                {recorded
                  .filter((l) => l.area === a)
                  .map((l) => (
                    <option key={l.table_name} value={l.table_name}>
                      {l.label}
                    </option>
                  ))}
              </optgroup>
            ))}
          </Select>
        </Field>
        <Field label="Who" htmlFor="audit-who">
          <Select id="audit-who" round={12} className={fm.select} value={who} onChange={(e) => setWho(e.target.value)}>
            <option value="">Anybody</option>
            <option value="system">System — ERP feed, server, migrations</option>
            {actors.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        </Field>
        <div className={fm.duo}>
          <Field label="From" htmlFor="audit-from">
            <DateField id="audit-from" value={from} onChange={setFrom} today={today} emptyText="Any day" onClear={() => setFrom('')} />
          </Field>
          <Field label="To" htmlFor="audit-to">
            <DateField id="audit-to" value={to} onChange={setTo} today={today} emptyText="Any day" onClear={() => setTo('')} />
          </Field>
        </div>
      </DialogForm>
    </FinDialog>
  )
}
