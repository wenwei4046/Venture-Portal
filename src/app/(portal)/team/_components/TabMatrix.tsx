'use client'

import {
  TAB_ACTIONS,
  TAB_ACTION_LABEL,
  TAB_VIEWS,
  columnTally,
  grantOf,
  hasBox,
  tabsOfView,
  viewCount,
  viewTally,
  type TabAction,
  type TabView,
  type Tally,
} from '@/lib/permission-tabs'
import { AREA_OF_TAB, reachOf, tickedFor, type PersonReach, type ReachArea, type ReachTick } from '@/lib/sub-department-reach'
import s from './tab-matrix.module.css'

/** One person's sub-departments on the rows that carry them (2026-10-16): their reach, their own ticks, a click. */
export interface MatrixReach {
  person: PersonReach
  ticks: readonly ReachTick[]
  onToggle: (area: ReachArea, sub: string) => void
}

/**
 * The handoff's permission matrix (2026-10-11, People › Permissions and the
 * person window): the views on the left with how many of their tabs are
 * seen ("8/8"), the open view's tabs on the right, each with View · Create ·
 * Edit · Approve and an "all". A box a tab does not have is drawn faint and
 * cannot be ticked. With `base` (a person over their title), a box that
 * differs from the title carries a red dot.
 *
 * For whoever may edit, a Select all row tops the table (the user, 2026-10-11):
 * one box per column ticks it on every tab of the view, the last one every box
 * of the view; "–" while only some are. A tab whose View is ticked but whose
 * page would still not open says why under its name (`held`).
 *
 * One person's window (`reach`, 2026-10-16 — the owner: "在 CRM 权限那边，应该
 * 可以让我去打勾，它是按 sub-department 去打勾的"): under a Revenue tab whose View
 * is ticked — Comm Cal, Sales Groups, Rules, the CRM's two — a pill per
 * sub-department, ticked where they reach it (what they handle, every one when
 * they handle none), with the red dot where it was changed for them alone.
 */
export default function TabMatrix({
  ticks,
  base,
  view,
  onView,
  onToggle,
  onRow,
  onColumn,
  onAll,
  held,
  reach,
  canEdit,
  compact = false,
}: {
  ticks: ReadonlySet<string>
  /** The title's ticks, when this is one person's: their changed boxes get a red dot. */
  base?: ReadonlySet<string>
  view: TabView
  onView: (view: TabView) => void
  onToggle: (tabId: string, action: TabAction) => void
  onRow: (tabId: string) => void
  /** Select all over one column of the open view. */
  onColumn: (action: TabAction) => void
  /** Select all over every box of the open view. */
  onAll: () => void
  /** Tab id → why its ticked View opens nothing yet. */
  held?: ReadonlyMap<string, string>
  /** One person's sub-departments, on the Revenue rows that carry them. */
  reach?: MatrixReach
  canEdit: boolean
  /** The person window's tighter rail. */
  compact?: boolean
}) {
  const open = TAB_VIEWS.find(v => v.id === view) ?? TAB_VIEWS[0]
  const tabs = tabsOfView(open.id)
  const whole = viewTally(ticks, open.id)
  return (
    <div className={`${s.grid} ${compact ? s.gridCompact : ''}`}>
      <div className={s.rail} role="tablist" aria-label="Views">
        {TAB_VIEWS.map(v => {
          const { seen, of } = viewCount(v.id, ticks)
          const on = v.id === open.id
          return (
            <button key={v.id} type="button" role="tab" aria-selected={on} className={`${s.railItem} ${compact ? s.railCompact : ''} ${on ? s.railOn : ''}`}
              onClick={() => onView(v.id)}>
              <span>{v.label}</span>
              <span className={s.railCount}>{seen}/{of}</span>
            </button>
          )
        })}
      </div>
      <div className={s.table} role="table" aria-label={`${open.label} tabs`}>
        <div className={`${s.row} ${s.head}`} role="row">
          <span className={s.tabCell} role="columnheader">{open.label} · tab</span>
          {TAB_ACTIONS.map(a => <span key={a} className={s.headBox} role="columnheader">{TAB_ACTION_LABEL[a]}</span>)}
          <span className={s.headBox} role="columnheader">All</span>
        </div>
        {canEdit ? (
          <div className={`${s.row} ${s.allRow}`} role="row">
            <span className={s.tabCell} role="rowheader">Select all</span>
            {TAB_ACTIONS.map(a => {
              const { tally, boxes } = columnTally(ticks, open.id, a)
              return (
                <span key={a} className={s.boxCell} role="cell">
                  <TallyBox tally={tally} disabled={boxes === 0} label={`Select all · ${TAB_ACTION_LABEL[a]}`} onClick={() => onColumn(a)} />
                </span>
              )
            })}
            <span className={s.boxCell} role="cell">
              <TallyBox tally={whole} label={`Select all · every box in ${open.label}`} onClick={onAll} />
            </span>
          </div>
        ) : null}
        {tabs.map(t => {
          const boxes = TAB_ACTIONS.filter(a => hasBox(t, a))
          const allOn = boxes.every(a => ticks.has(grantOf(t.id, a)))
          const why = held?.get(t.id)
          const area = AREA_OF_TAB[t.id]
          const subs = reach && area && ticks.has(grantOf(t.id, 'view')) && reach.person.subs.length > 0 ? area : null
          return (
            <div key={t.id} className={s.row} role="row">
              <span className={s.tabCell} role="rowheader">
                {t.label}
                {why ? <span className={s.held}>{why}</span> : null}
                {subs ? <SubDepartmentPills reach={reach!} area={subs} tab={t.label} canEdit={canEdit} /> : null}
              </span>
              {TAB_ACTIONS.map(a => {
                const g = grantOf(t.id, a)
                const exists = hasBox(t, a)
                const on = exists && ticks.has(g)
                const changed = !!base && exists && on !== base.has(g)
                return (
                  <span key={a} className={s.boxCell} role="cell">
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={on}
                      aria-label={`${t.label} · ${TAB_ACTION_LABEL[a]}`}
                      title={exists ? t.hints?.[a] : undefined}
                      disabled={!canEdit || !exists}
                      className={`${s.box} ${on ? s.boxOn : ''} ${exists ? '' : s.boxNone}`}
                      onClick={() => onToggle(t.id, a)}
                    >
                      {on ? '✓' : ''}
                      {changed ? <span className={s.dot} aria-label="changed for this person" /> : null}
                    </button>
                  </span>
                )
              })}
              <span className={s.boxCell} role="cell">
                {canEdit ? (
                  <button type="button" className={s.all} onClick={() => onRow(t.id)}>{allOn ? 'none' : 'all'}</button>
                ) : null}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/** The sub-departments under one Revenue tab: ticked where they reach it, the red dot where it is theirs alone. */
function SubDepartmentPills({ reach, area, tab, canEdit }: { reach: MatrixReach; area: ReachArea; tab: string; canEdit: boolean }) {
  const on = reachOf(reach.person, reach.ticks, area)
  return (
    <span className={s.subs} role="group" aria-label={`${tab} · sub-departments`}>
      {reach.person.subs.map(sub => {
        const checked = on.has(sub.id)
        return (
          <button
            key={sub.id}
            type="button"
            role="checkbox"
            aria-checked={checked}
            aria-label={`${tab} · ${sub.name}`}
            disabled={!canEdit}
            className={`${s.sub} ${checked ? s.subOn : ''}`}
            onClick={() => reach.onToggle(area, sub.id)}
          >
            <span className={s.subTick} aria-hidden>{checked ? '✓' : ''}</span>
            {sub.name}
            {tickedFor(reach.ticks, area, sub.id) ? <span className={s.dot} aria-label="changed for this person" /> : null}
          </button>
        )
      })}
    </span>
  )
}

/** A Select all box: ✓ when every box under it is ticked, – when some are. */
function TallyBox({ tally, disabled = false, label, onClick }: { tally: Tally; disabled?: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={tally === 'all' ? true : tally === 'some' ? 'mixed' : false}
      aria-label={label}
      disabled={disabled}
      className={`${s.box} ${tally === 'all' ? s.boxOn : ''} ${tally === 'some' ? s.boxSome : ''} ${disabled ? s.boxNone : ''}`}
      onClick={onClick}
    >
      {tally === 'all' ? '✓' : tally === 'some' ? '–' : ''}
    </button>
  )
}
