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
import { CRM_BRANDS, type CrmBrand } from '@/lib/crm-brand-ticks'
import { byBrand, OUTLET_HINT, OUTLET_TABS, type OutletChoice } from '@/lib/lead-outlet-ticks'
import s from './tab-matrix.module.css'

/** One person's sub-departments on the rows that carry them (2026-10-16): their reach, their own ticks, a click. */
export interface MatrixReach {
  person: PersonReach
  ticks: readonly ReachTick[]
  onToggle: (area: ReachArea, sub: string) => void
}

/**
 * By management approve (2026-10-29, the claim process's PR ③ — the mockup's "Claim ☑ By management approve"): under
 * each view's Claim row whose View is ticked, one pill — their requests go to their department's Claim & approve first.
 * `mine`: a person's own tick over their title's (the red dot).
 */
export interface MatrixReview {
  on: boolean
  mine?: boolean
  onToggle: () => void
}

/**
 * The CRM's brands (2026-11-17 — the owner: "只有 dc 权限的人可以看到 dc 的客户资讯，ads performance 等", "按人打勾"):
 * under the CRM's two rows whose View is ticked, a pill per brand — their customers, chats and ads. `mine`: taken off
 * (or given back) for this person alone (the red dot).
 */
export interface MatrixBrands {
  on: ReadonlySet<CrmBrand>
  mine: ReadonlySet<CrmBrand>
  onToggle: (brand: CrmBrand) => void
}

/**
 * Lead View's outlets (2026-11-19 — the owner: "在people permission 做这个功能，去设置那个staff 能看到哪个outlet 的讯息，和他们的广告成效"):
 * under the first Lead View row (Inbox, Leads, Insight) whose View is ticked, *All outlets* and a pill per outlet.
 * None ticked = every outlet.
 */
export interface MatrixOutlets {
  all: readonly OutletChoice[]
  ticked: readonly string[]
  onToggle: (id: string) => void
  onAll: () => void
}

const BRAND_HINT = 'Their CRM shows this brand’s customers, chats and ads'

const REVIEW_HINT = 'Their requests are approved by their department’s Claim & approve first, then go to Finance'

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
  review,
  brands,
  outlets,
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
  /** By management approve, under the Claim rows. */
  review?: MatrixReview
  /** One person's CRM brands, under the CRM's rows. */
  brands?: MatrixBrands
  /** One person's Lead View outlets, under the first Lead View row with View. */
  outlets?: MatrixOutlets
  canEdit: boolean
  /** The person window's tighter rail. */
  compact?: boolean
}) {
  const open = TAB_VIEWS.find(v => v.id === view) ?? TAB_VIEWS[0]
  const tabs = tabsOfView(open.id)
  const whole = viewTally(ticks, open.id)
  const outletRow = outlets ? OUTLET_TABS.find(id => tabs.some(t => t.id === id) && ticks.has(grantOf(id, 'view'))) : undefined
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
                {brands && area === 'crm' && ticks.has(grantOf(t.id, 'view')) ? (
                  <span className={s.subs} role="group" aria-label={`${t.label} · brands`}>
                    {CRM_BRANDS.map(b => {
                      const checked = brands.on.has(b.key)
                      return (
                        <button
                          key={b.key}
                          type="button"
                          role="checkbox"
                          aria-checked={checked}
                          aria-label={`${t.label} · ${b.label}`}
                          title={BRAND_HINT}
                          disabled={!canEdit}
                          className={`${s.sub} ${checked ? s.subOn : ''}`}
                          onClick={() => brands.onToggle(b.key)}
                        >
                          <span className={s.subTick} aria-hidden>{checked ? '✓' : ''}</span>
                          {b.label}
                          {brands.mine.has(b.key) ? <span className={s.dot} aria-label="changed for this person" /> : null}
                        </button>
                      )
                    })}
                  </span>
                ) : null}
                {outlets && t.id === outletRow ? <OutletPills outlets={outlets} tab={t.label} canEdit={canEdit} /> : null}
                {review && t.id.endsWith('.my_claims') && ticks.has(grantOf(t.id, 'view')) ? (
                  <span className={s.subs} role="group" aria-label={`${t.label} · routing`}>
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={review.on}
                      aria-label={`${t.label} · By management approve`}
                      title={REVIEW_HINT}
                      disabled={!canEdit}
                      className={`${s.sub} ${review.on ? s.subOn : ''}`}
                      onClick={review.onToggle}
                    >
                      <span className={s.subTick} aria-hidden>{review.on ? '✓' : ''}</span>
                      By management approve
                      {review.mine ? <span className={s.dot} aria-label="changed for this person" /> : null}
                    </button>
                  </span>
                ) : null}
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

/** One person's Lead View outlets: *All outlets* (none ticked), then each brand's outlets. */
function OutletPills({ outlets, tab, canEdit }: { outlets: MatrixOutlets; tab: string; canEdit: boolean }) {
  const pill = (key: string, label: string, checked: boolean, onClick: () => void, mine: boolean) => (
    <button
      key={key}
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={`${tab} · ${label}`}
      title={OUTLET_HINT}
      disabled={!canEdit}
      className={`${s.sub} ${checked ? s.subOn : ''}`}
      onClick={onClick}
    >
      <span className={s.subTick} aria-hidden>{checked ? '✓' : ''}</span>
      {label}
      {mine ? <span className={s.dot} aria-label="changed for this person" /> : null}
    </button>
  )
  return (
    <span className={s.subs} role="group" aria-label={`${tab} · outlets`}>
      {pill('all', 'All outlets', outlets.ticked.length === 0, outlets.onAll, false)}
      {byBrand(outlets.all).flatMap(g => g.outlets.map(o =>
        pill(o.id, g.brand ? `${g.brand} · ${o.name}` : o.name, outlets.ticked.includes(o.id), () => outlets.onToggle(o.id), outlets.ticked.includes(o.id))))}
    </span>
  )
}
