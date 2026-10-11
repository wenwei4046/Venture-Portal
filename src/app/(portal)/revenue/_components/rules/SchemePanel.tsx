'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Toggle } from '@/components/hrv/kit'
import { flash } from '@/components/hrv/toast'
import { saveSchemeRules } from '../../config-actions'
import type { SchemeRow } from '../config/types'
import { SectionTop } from './SectionTop'
import s from './rules.module.css'
import { Select } from '@/components/hrv/select'

// Rules › Scheme rules (2026-10-10, the HR revamp): the eight components as
// switches in the prototype's order, a dot on each one changed since the
// last save, and Save / Saved at the section's top. What a component needs
// besides its switch — Group incentive's three layer settings (the
// prototype's), and the ones this scheme also keeps: how Open Bill pays,
// whether the override base counts KPI revenue, the deposit gate's % — opens
// under its row while it is on. Defaults: the Revenue Team cost basis and the
// default rate mode.

type SwitchKey = 'product' | 'kpi' | 'open_bill' | 'override' | 'margin_penalty' | 'margin_incentive' | 'group' | 'deposit'

const SWITCHES: Array<{ k: SwitchKey; label: string; desc: string }> = [
  { k: 'product', label: 'Product revenue commission', desc: "the salesperson's rate × their commissionable revenue" },
  { k: 'kpi', label: 'KPI item allowance', desc: 'flat RM per unit; that item’s revenue leaves the commission base' },
  { k: 'open_bill', label: 'Open Bill bonus', desc: 'uplift on that bill’s commission' },
  { k: 'override', label: 'Hierarchy override', desc: 'uplines earn on their group’s sales' },
  { k: 'margin_penalty', label: 'Below-margin penalty', desc: 'per bill — also cuts every upline’s override on it' },
  { k: 'margin_incentive', label: 'Monthly margin incentive', desc: 'every brand sold must clear the tier' },
  { k: 'group', label: 'Group incentive package', desc: 'monthly fixed pay per qualifying direct group' },
  { k: 'deposit', label: 'Deposit gate', desc: '% of the order total before any of it pays' },
]

interface Form {
  sw: Record<SwitchKey, boolean>
  groupDepth: string
  overrideDepth: string
  directLimit: string
  basis: 'uplift_on_commission' | 'pct_of_revenue'
  overrideKpi: boolean
  depositPct: string
  divisor: string
  rateMode: 'fixed' | 'variable'
}

const blank = (n: number | null | undefined) => (n === null || n === undefined ? '' : String(n))
const pct = (n: number | null) => (n === null ? '' : String(Math.round(n * 10000) / 100))

function formOf(scheme: SchemeRow): Form {
  return {
    sw: {
      product: scheme.enable_product_revenue,
      kpi: scheme.enable_kpi,
      open_bill: scheme.enable_open_bill,
      override: scheme.enable_override,
      margin_penalty: scheme.enable_margin_penalty,
      margin_incentive: scheme.enable_margin_incentive,
      group: scheme.enable_group_incentive ?? false,
      deposit: scheme.deposit_threshold_pct !== null,
    },
    groupDepth: blank(scheme.group_sales_depth),
    overrideDepth: blank(scheme.override_depth),
    directLimit: blank(scheme.direct_line_limit),
    basis: scheme.open_bill_basis,
    overrideKpi: scheme.override_includes_kpi,
    depositPct: pct(scheme.deposit_threshold_pct),
    divisor: blank(scheme.revenue_cost_divisor === null || scheme.revenue_cost_divisor === undefined ? 1 : Number(scheme.revenue_cost_divisor)),
    rateMode: scheme.default_rate_mode,
  }
}

function toFormData(scheme: SchemeRow, f: Form): FormData {
  const fd = new FormData()
  fd.set('scheme_id', scheme.id)
  const on = (name: string, v: boolean) => {
    if (v) fd.set(name, 'on')
  }
  on('enable_product_revenue', f.sw.product)
  on('enable_kpi', f.sw.kpi)
  on('enable_open_bill', f.sw.open_bill)
  on('enable_override', f.sw.override)
  on('enable_margin_penalty', f.sw.margin_penalty)
  on('enable_margin_incentive', f.sw.margin_incentive)
  on('enable_group_incentive', f.sw.group)
  on('deposit_gate_on', f.sw.deposit)
  on('override_includes_kpi', f.overrideKpi)
  fd.set('group_sales_depth', f.groupDepth.trim())
  fd.set('override_depth', f.overrideDepth.trim())
  fd.set('direct_line_limit', f.directLimit.trim())
  fd.set('open_bill_basis', f.basis)
  fd.set('deposit_threshold_pct', f.depositPct.trim())
  fd.set('revenue_cost_divisor', f.divisor.trim())
  fd.set('default_rate_mode', f.rateMode)
  return fd
}

export default function SchemePanel({ scheme, subName, canManage }: { scheme: SchemeRow; subName: string; canManage: boolean }) {
  const router = useRouter()
  const saved = formOf(scheme)
  const savedKey = JSON.stringify(saved)
  const [f, setF] = useState<Form>(saved)
  const [error, setError] = useState('')
  const [pending, start] = useTransition()
  const dirty = JSON.stringify(f) !== savedKey
  // What was saved comes back as the new "saved" — the form follows it.
  const [seen, setSeen] = useState(savedKey)
  if (seen !== savedKey) {
    setSeen(savedKey)
    setF(saved)
  }

  function toggle(k: SwitchKey) {
    if (!canManage) return
    setF(prev => {
      const next = { ...prev, sw: { ...prev.sw, [k]: !prev.sw[k] } }
      // A package needs two sales layers, two override layers and three directs.
      if (k === 'group' && next.sw.group) {
        next.groupDepth = next.groupDepth || '2'
        next.overrideDepth = next.overrideDepth || '2'
        next.directLimit = next.directLimit || '3'
      }
      // Switched off again, its settings go back to what is saved: they are
      // out of sight now, and override layers bind a percentage scheme too.
      if (k === 'group' && !next.sw.group) {
        next.groupDepth = saved.groupDepth
        next.overrideDepth = saved.overrideDepth
        next.directLimit = saved.directLimit
      }
      return next
    })
    setError('')
  }

  function save() {
    if (!dirty || pending) return
    setError('')
    start(async () => {
      const res = await saveSchemeRules(toFormData(scheme, f))
      if (!res.ok) {
        setError(res.reason)
        return
      }
      router.refresh()
      flash('Scheme rules saved — the tab list follows the switches')
    })
  }

  const param = (label: string, sub: string, input: React.ReactNode) => (
    <div className={s.param}>
      <div className={s.paramLabel}>{label}</div>
      {input}
      <div className={s.paramSub}>{sub}</div>
    </div>
  )
  const num = (value: string, set: (v: string) => void, aria: string, step = '1') => (
    <input
      className={s.paramValue}
      type="number"
      step={step}
      value={value}
      onChange={e => set(e.target.value)}
      disabled={!canManage}
      aria-label={aria}
    />
  )

  return (
    <>
      <SectionTop
        title="Scheme rules"
        desc={`Which components ${subName} pays. A switched-off component is skipped by the engine, and the item-rule tabs it reads come and go with it.`}
        action={
          canManage ? (
            <button type="button" className={s.save} data-dirty={dirty ? 'true' : 'false'} onClick={save} disabled={pending} aria-disabled={!dirty}>
              {pending ? 'Saving…' : dirty ? 'Save' : 'Saved'}
            </button>
          ) : null
        }
      />
      {error ? <p className={s.saveError} role="alert">{error}</p> : null}
      <div className={s.secLabel}>Components</div>
      <div className={s.box} style={{ marginBottom: 22 }}>
        {SWITCHES.map(sw => {
          const on = f.sw[sw.k]
          const desc = sw.k === 'open_bill' && f.basis === 'pct_of_revenue' ? '% of that bill’s revenue' : sw.desc
          return (
            <div className={s.swRow} key={sw.k}>
              <button
                type="button"
                className={s.swLine}
                onClick={() => toggle(sw.k)}
                disabled={!canManage}
                role="switch"
                aria-checked={on}
                aria-label={sw.label}
              >
                <Toggle on={on} shadow />
                <span className={s.swLabel} data-on={on ? 'true' : 'false'}>
                  {sw.label}
                  {on !== saved.sw[sw.k] ? <span className={s.dirtyDot} aria-label="changed" /> : null}
                </span>
                <span className={s.swDesc}>{desc}</span>
              </button>
              {on && sw.k === 'group' ? (
                <div className={s.params}>
                  {param('Group sales layers', 'directs and their directs', num(f.groupDepth, v => setF(p => ({ ...p, groupDepth: v })), 'Group sales layers'))}
                  {param('Override layers', 'at most two layers', num(f.overrideDepth, v => setF(p => ({ ...p, overrideDepth: v })), 'Override layers'))}
                  {param('Direct-line limit', 'a fourth line with Full Spec', num(f.directLimit, v => setF(p => ({ ...p, directLimit: v })), 'Direct-line limit'))}
                </div>
              ) : null}
              {on && sw.k === 'open_bill' ? (
                <div className={s.params}>
                  {param(
                    'Paid as',
                    'the Open Bill rates tab sets each rank',
                    <Select
                      plain
                      className={s.paramValue}
                      value={f.basis}
                      onChange={e => setF(p => ({ ...p, basis: e.target.value as Form['basis'] }))}
                      disabled={!canManage}
                      aria-label="Open Bill basis"
                    >
                      <option value="uplift_on_commission">uplift on that bill’s commission</option>
                      <option value="pct_of_revenue">% of that bill’s revenue</option>
                    </Select>,
                  )}
                </div>
              ) : null}
              {on && sw.k === 'override' ? (
                <div className={s.params}>
                  {param(
                    'Override base',
                    'KPI items’ revenue counts toward an upline’s override',
                    <button
                      type="button"
                      className={s.paramToggle}
                      disabled={!canManage}
                      role="switch"
                      aria-checked={f.overrideKpi}
                      aria-label="Override base includes KPI revenue"
                      onClick={() => setF(p => ({ ...p, overrideKpi: !p.overrideKpi }))}
                    >
                      <Toggle on={f.overrideKpi} shadow />
                      {f.overrideKpi ? 'Includes KPI revenue' : 'Leaves KPI revenue out'}
                    </button>,
                  )}
                </div>
              ) : null}
              {on && sw.k === 'deposit' ? (
                <div className={s.params}>
                  {param('Deposit needed', '% of the order total', num(f.depositPct, v => setF(p => ({ ...p, depositPct: v })), 'Deposit threshold percent', '0.01'))}
                </div>
              ) : null}
            </div>
          )
        })}
      </div>
      <div className={s.secLabel}>Defaults</div>
      <div className={s.box}>
        <div className={s.defRow}>
          <span className={s.defName}>Revenue Team cost basis</span>
          <span>
            unit cost ÷{' '}
            <input
              className={s.divisor}
              type="number"
              step="0.01"
              value={f.divisor}
              onChange={e => setF(p => ({ ...p, divisor: e.target.value }))}
              disabled={!canManage}
              aria-label="Revenue cost divisor"
            />
            <span className={s.quietNote}>0.7 turns RM 1,000 into RM 1,428.57</span>
          </span>
        </div>
        <div className={s.defRow}>
          <span className={s.defName}>Default rate mode</span>
          <span>
            <span className={s.modeWrap}>
              <Select
                plain
                className={s.modeSelect}
                value={f.rateMode}
                onChange={e => setF(p => ({ ...p, rateMode: e.target.value as Form['rateMode'] }))}
                disabled={!canManage}
                aria-label="Default rate mode"
              >
                <option value="variable">Scheme target — recomputed monthly</option>
                <option value="fixed">Manual — whatever rank they are moved to</option>
              </Select>
              <span className={s.modeCaret} aria-hidden="true">▾</span>
            </span>
          </span>
        </div>
      </div>
    </>
  )
}
