'use client'

import { useState } from 'react'
import { HvPage, PageHead } from '@/components/hrv/kit'
import { useTabParam } from '@/components/hrv/tabs'
import { Button } from '@/components/ds/Button'
import { Toast, useFlash } from '@/components/ds/Overlay'
import type { AttConfig } from '@/lib/attendance/types'
import { HoverButton } from './bits'
import { ClockPanel, HolidaysPanel, LeavePanel, LocationsPanel, OtPanel, PolicyPanel, RoutesPanel, SchedulesPanel, exportRows } from './SettingsPanels'
import { SettingsWindow, type Sm } from './SettingsWindows'

/**
 * HR › Attendance › Settings (2026-10-15, the handoff's `isSettings`): a
 * grouped menu on the left (Who and when · Leave and OT · Rules) and the card
 * of the sub page on the right. Every add button and every card opens the
 * centred window (SettingsWindows). The sub page is `?tab=`.
 * No subtitles (DESIGN.md › No descriptions on the page): the prototype's
 * card ledes and menu second lines are left out.
 */

export const SET_TABS = ['clock', 'sched', 'loc', 'hol', 'leave', 'ot', 'route', 'policy'] as const
export type SetTab = (typeof SET_TABS)[number]

const LABEL: Record<SetTab, string> = {
  clock: 'Who clocks', sched: 'Schedules', loc: 'Locations', hol: 'Holidays', leave: 'Leave types', ot: 'OT rules', route: 'Approval routes', policy: 'Policy',
}
const GROUPS: Array<[string, SetTab[]]> = [['Who and when', ['clock', 'sched', 'loc', 'hol']], ['Leave and OT', ['leave', 'ot', 'route']], ['Rules', ['policy']]]
const ADD: Partial<Record<SetTab, string>> = { clock: '+ Assignment', sched: '+ Schedule', loc: '+ Location', hol: '+ Holiday', leave: '+ Leave type', route: '+ Override' }

export default function SettingsView({ config }: { config: AttConfig }) {
  const [tab, setTab] = useTabParam<SetTab>(SET_TABS, 'clock')
  const [toast, flash] = useFlash()
  const [sm, setSm] = useState<Sm | null>(null)
  const [sched, setSched] = useState<string | null>(null)
  const year = Number(config.today.slice(0, 4))
  const titleOf: Record<SetTab, string> = { ...LABEL, loc: 'Work locations', hol: `Public holidays · ${year}`, policy: 'Clock-in policy' }
  const groupName = GROUPS.find(g => g[1].includes(tab))![0]
  const canEdit = config.canEdit

  const download = () => {
    const { name, lines } = exportRows(tab, config)
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = name
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  }

  const open = (s: Sm) => setSm(s)
  const panelProps = { config, open, flash, canEdit }

  return (
    <HvPage>
      <PageHead eyebrow="Attendance" title="Settings" right={<Button variant="secondary" onClick={download}>Export</Button>} />
      <div style={{ display: 'grid', gridTemplateColumns: '260px minmax(0,1fr)', gap: 20, alignItems: 'start', marginTop: 38 }}>
        <div style={{ border: '1px solid var(--ds-border)', borderRadius: 12, background: 'var(--ds-surface)', padding: 10, display: 'flex', flexDirection: 'column', gap: 12, position: 'sticky', top: 0 }}>
          {GROUPS.map(([title, keys]) => (
            <div key={title} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontSize: 10.5, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--ds-ink-3)', padding: '6px 10px 4px' }}>{title}</span>
              {keys.map(k => {
                const on = tab === k
                return (
                  <HoverButton
                    key={k}
                    onClick={() => setTab(k)}
                    aria-current={on ? 'page' : undefined}
                    style={{ textAlign: 'left', border: 0, borderRadius: 8, padding: '8px 10px', fontFamily: 'inherit', cursor: 'pointer', background: on ? 'rgb(255 245 233)' : 'transparent', boxShadow: on ? 'inset 2px 0 0 var(--hr-accent, rgb(233 154 83))' : 'none', color: 'var(--ds-ink)', display: 'flex', flexDirection: 'column', gap: 1, lineHeight: 'normal' }}
                  >
                    <span style={{ fontSize: 13, fontWeight: on ? 600 : 500 }}>{LABEL[k]}</span>
                  </HoverButton>
                )
              })}
            </div>
          ))}
        </div>
        <div style={{ minWidth: 0, border: '1px solid var(--ds-border)', borderRadius: 12, background: 'var(--ds-surface)', padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
            <div>
              <div style={{ fontSize: 10.5, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--ds-ink-3)' }}>{groupName}</div>
              <div style={{ fontSize: 19, fontWeight: 500, marginTop: 4 }}>{titleOf[tab]}</div>
            </div>
            {ADD[tab] && canEdit ? (
              <Button variant="secondary" size="sm" onClick={() => open({ kind: kindOf(tab), id: null })}>
                {ADD[tab]}
              </Button>
            ) : null}
          </div>
          {tab === 'clock' ? <ClockPanel {...panelProps} /> : null}
          {tab === 'sched' ? <SchedulesPanel {...panelProps} picked={sched} pick={setSched} /> : null}
          {tab === 'loc' ? <LocationsPanel {...panelProps} /> : null}
          {tab === 'hol' ? <HolidaysPanel {...panelProps} year={year} /> : null}
          {tab === 'leave' ? <LeavePanel {...panelProps} /> : null}
          {tab === 'ot' ? <OtPanel {...panelProps} /> : null}
          {tab === 'route' ? <RoutesPanel {...panelProps} /> : null}
          {tab === 'policy' ? <PolicyPanel {...panelProps} /> : null}
        </div>
      </div>
      {sm ? <SettingsWindow key={`${sm.kind}:${sm.id ?? 'new'}:${sm.seed?.day ?? ''}`} sm={sm} config={config} close={() => setSm(null)} flash={flash} canEdit={canEdit} onSchedule={setSched} /> : null}
      <Toast message={toast} />
    </HvPage>
  )
}

function kindOf(tab: SetTab): Sm['kind'] {
  return ({ clock: 'assignment', sched: 'schedule', loc: 'location', hol: 'holiday', leave: 'leave', ot: 'ot', route: 'route', policy: 'ot' } as const)[tab]
}
