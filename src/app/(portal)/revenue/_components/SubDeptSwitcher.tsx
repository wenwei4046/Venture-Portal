'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { revenuePath } from '@/lib/revenue'
import { REVENUE_SUB_COOKIE, writeCookie } from '@/lib/hr-view'
import { Chevron } from '@/components/hrv/icons'
import { btn, hv } from '@/components/hrv/kit'
import { Window } from '@/components/hrv/overlay'
import { flash } from '@/components/hrv/toast'
import { newSubDepartment } from '../config-actions'
import type { SwitcherData } from '../_lib/switcher'
import s from './SubDeptSwitcher.module.css'

// The sub-department switcher (2026-10-10, the HR revamp handoff; round 2's
// one-line design 2026-10-11, portal-42): top right of every Revenue page's
// head — "Sub-department | Fair" and a chevron that turns over while the menu
// is open; the menu lists each one with ✓ on the open one, a rule, then
// "+ New sub-department" (what it does is its tooltip now). It replaced the
// sidebar's Fair | IR tree and the Rules page's "Generate new sub-department"
// button. Picking one opens the same page for it and remembers it, so the
// sidebar's links follow.

export type RevenueView = 'cc' | 'sg' | 'rules'

const PAGE_NAME: Record<RevenueView, string> = { cc: 'Commission Calculation', sg: 'Sales Groups', rules: 'Rules' }

function pathFor(slug: string, view: RevenueView): string {
  return view === 'cc' ? revenuePath(slug) : revenuePath(slug, view === 'sg' ? 'hierarchy' : 'rules')
}

export default function SubDeptSwitcher({ data, view }: { data: SwitcherData; view: RevenueView }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const wrap = useRef<HTMLDivElement>(null)

  // The page opened is the sub-department being worked on — remember it for
  // the sidebar's links, whichever way the page was reached.
  useEffect(() => {
    writeCookie(REVENUE_SUB_COOKIE, data.current.slug)
  }, [data.current.slug])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  function pick(slug: string, name: string) {
    setOpen(false)
    if (slug === data.current.slug) return
    writeCookie(REVENUE_SUB_COOKIE, slug)
    router.push(pathFor(slug, view))
    flash(`Switched to ${name} — ${PAGE_NAME[view]} now shows ${name}`)
  }

  return (
    <div className={s.wrap} ref={wrap}>
      <button
        type="button"
        className={s.button}
        data-open={open ? 'true' : 'false'}
        onClick={() => setOpen(o => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className={s.label}>Sub-department</span>
        <span className={s.rule} aria-hidden="true" />
        <span className={s.name}>{data.current.name}</span>
        <span className={s.chev} aria-hidden="true">
          <Chevron />
        </span>
      </button>
      {open ? (
        <div className={s.menu} role="menu">
          {data.subs.map(o => {
            const on = o.slug === data.current.slug
            return (
              <button
                key={o.slug}
                type="button"
                role="menuitemradio"
                aria-checked={on}
                aria-current={on ? 'true' : undefined}
                className={s.item}
                onClick={() => pick(o.slug, o.name)}
              >
                <span>{o.name}</span>
                <span className={s.check}>{on ? '✓' : ''}</span>
              </button>
            )
          })}
          {data.canCreate ? (
            <>
              <div className={s.menuRule} />
              <button
                type="button"
                role="menuitem"
                className={`${s.item} ${s.newItem}`}
                title={`Copy ${data.current.name}'s rules, or start blank`}
                onClick={() => {
                  setOpen(false)
                  setCreating(true)
                }}
              >
                + New sub-department
              </button>
            </>
          ) : null}
        </div>
      ) : null}
      <NewSubDepartmentWindow open={creating} onClose={() => setCreating(false)} data={data} view={view} />
    </div>
  )
}

function NewSubDepartmentWindow({ open, onClose, data, view }: { open: boolean; onClose: () => void; data: SwitcherData; view: RevenueView }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [copy, setCopy] = useState(true)
  const [error, setError] = useState('')
  const canCopy = !!data.current.schemeId

  function submit(fd: FormData) {
    setError('')
    if (copy && data.current.schemeId) fd.set('clone_from_scheme_id', data.current.schemeId)
    if (!fd.get('department_id')) fd.set('department_id', data.departments[0]?.id ?? data.current.departmentId)
    start(async () => {
      const res = await newSubDepartment(fd)
      if (!res.ok) {
        setError(res.reason)
        return
      }
      onClose()
      writeCookie(REVENUE_SUB_COOKIE, res.slug)
      router.push(pathFor(res.slug, view))
      const name = String(fd.get('name') ?? '').trim()
      flash(copy && canCopy ? `${name} created from ${data.current.name}'s rules` : `${name} created — every rule starts switched off`)
    })
  }

  return (
    <Window open={open} onClose={onClose} width={420} scrim={0.22} z={32} label="New sub-department" style={{ borderRadius: 14, border: '1px solid rgb(229 228 223)', boxShadow: '0 16px 48px rgb(43 31 23 / .2)' }}>
      <form action={submit} className={s.form}>
        <div>
          <div className={s.formTitle}>New sub-department</div>
          <div className={s.formSub}>
            Copy {data.current.name}&apos;s rules, or start blank. People are never copied — add them on Sales Groups.
          </div>
        </div>
        <label className={s.field}>
          <span className={s.fieldLabel}>
            <span>Name *</span>
            <span className={s.err}>{error}</span>
          </span>
          <input name="name" required placeholder="e.g. Showroom" className={hv.input} autoFocus />
        </label>
        <label className={s.field}>
          <span className={s.fieldLabel}>
            <span>Short code</span>
          </span>
          <input name="code" placeholder="SHOW" className={`${hv.input} ${hv.mono}`} />
        </label>
        {data.departments.length > 1 ? (
          <label className={s.field}>
            <span className={s.fieldLabel}>
              <span>Department</span>
            </span>
            <select name="department_id" defaultValue={data.current.departmentId} className={hv.select}>
              {data.departments.map(d => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </label>
        ) : null}
        <div className={s.field}>
          <span className={s.fieldLabel}>
            <span>Rules</span>
          </span>
          <div className={s.choices}>
            {canCopy ? (
              <button type="button" className={hv.choice} aria-pressed={copy} onClick={() => setCopy(true)}>
                Copy {data.current.name}&apos;s rules
              </button>
            ) : null}
            <button type="button" className={hv.choice} aria-pressed={!copy || !canCopy} onClick={() => setCopy(false)}>
              Start blank
            </button>
          </div>
        </div>
        <div className={s.formFoot}>
          <button type="button" className={btn('outline')} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className={btn('primary')} disabled={pending} style={{ padding: '8px 16px' }}>
            {pending ? 'Creating…' : 'Create'}
          </button>
        </div>
      </form>
    </Window>
  )
}
