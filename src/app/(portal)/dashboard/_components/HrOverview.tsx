import { officeClock } from '@/lib/office-clock'
import { firstName } from '@/lib/finance-view'
import { canDo } from '@/lib/permission-actions'
import { canAccessAttendance, canAccessDocumentation, canAccessHRCosting, canAccessHiring, canOpenPeople } from '@/lib/roles'
import { HvPage, PageHead } from '@/components/hrv/kit'
import { Button } from '@/components/ds/Button'
import { hrNavSections, visibleHrNav, type HrNavTone, type HrRevenueSubs } from '@/components/layout/hr-nav'
import type { HrIconName } from '@/components/hrv/icons'
import type { User } from '@/types'
import type { HrOverviewData } from '../_lib/hr-overview'
import { OvCatRow, OvQuickTile } from './HrOverviewTiles'

// HR's Overview (2026-10-15, the Attendance handoff — `HR Attendance.dc.html`
// isOverview): the greeting as the page's title, one line of where things
// stand, Review requests / Add person, eight quick actions and a card per
// section of HR's sidebar, each row's count where it has one.

const QUICK: ReadonlyArray<{ key: string; label: string; icon: HrIconName; tone: HrNavTone; visible: (u: User) => boolean }> = [
  { key: 'today', label: 'Today', icon: 'in', tone: 'olive', visible: canAccessAttendance },
  { key: 'requests', label: 'Approve', icon: 'approve', tone: 'olive', visible: canAccessAttendance },
  { key: 'balances', label: 'Leave', icon: 'calendar', tone: 'olive', visible: canAccessAttendance },
  { key: 'close', label: 'Month close', icon: 'lock', tone: 'olive', visible: canAccessAttendance },
  { key: 'hire', label: 'Hiring', icon: 'hire', tone: 'clay', visible: canAccessHiring },
  { key: 'pay', label: 'Payroll', icon: 'payroll', tone: 'clay', visible: canAccessHRCosting },
  { key: 'pplPeople', label: 'People', icon: 'staff', tone: 'olive', visible: canOpenPeople },
  { key: 'docDocs', label: 'Documents', icon: 'doc', tone: 'olive', visible: canAccessDocumentation },
]

export default function HrOverview({ user, data, revenueSub }: { user: User; data: HrOverviewData; revenueSub: string | null | HrRevenueSubs }) {
  const clock = officeClock()
  const { summary, badges } = data
  const sections = visibleHrNav(hrNavSections(revenueSub), user).filter(sec => sec.label !== null)
  const hrefOf: Record<string, string> = Object.fromEntries(sections.flatMap(sec => sec.items.map(i => [i.key, i.href] as const)))
  const name = firstName(user.name, 'HR')
  const right = (
    <div style={{ display: 'flex', gap: 8 }}>
      {canAccessAttendance(user) ? (
        <Button href="/attendance/requests">Review requests</Button>
      ) : null}
      {canDo(user, 'team', 'create') ? (
        <Button href="/team/people/new" variant="secondary">Add person</Button>
      ) : null}
    </div>
  )

  return (
    <HvPage>
      <PageHead eyebrow="Overview" title={`${clock.greeting}, ${name}.`} subtitle={summary ? <span suppressHydrationWarning>{summary.replace(/\.$/, '')}.</span> : undefined} right={right} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 10.5, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--ds-ink-3)', flex: 'none' }}>Quick actions</span>
            <span style={{ flex: 1, height: 1, background: 'var(--ds-border)' }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8,minmax(0,1fr))', gap: 10 }}>
            {QUICK.filter(q => q.visible(user) && hrefOf[q.key]).map(q => (
              <OvQuickTile key={q.key} href={hrefOf[q.key]} label={q.label} icon={q.icon} tone={q.tone} badge={badges[q.key] ?? 0} />
            ))}
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,minmax(0,1fr))', gap: 12, alignItems: 'start' }}>
          {sections.map(sec => (
            <div key={sec.label} style={{ border: '1px solid var(--ds-border)', borderRadius: 12, background: 'var(--ds-surface)', padding: '14px 14px 8px', display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '0 2px 4px' }}>
                <span style={{ fontSize: 10.5, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--ds-ink-3)' }}>
                  <span style={{ color: `rgb(var(--tone-${sec.tone}-deep))` }}>{sec.roman}</span> {sec.label}
                </span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ds-ink-3)' }}>
                  {sec.items.length} {sec.items.length === 1 ? 'page' : 'pages'}
                </span>
              </div>
              {sec.items.map(item => (
                <OvCatRow key={item.key} href={item.href} label={item.label} icon={item.icon} tone={sec.tone} badge={badges[item.key] ?? 0} />
              ))}
            </div>
          ))}
        </div>
      </div>
    </HvPage>
  )
}
