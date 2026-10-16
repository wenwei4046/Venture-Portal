'use client'

import { useMemo, useState, useTransition } from 'react'
import { HvPage, PageHead } from '@/components/hrv/kit'
import { Button } from '@/components/ds/Button'
import { DataTable, type Column } from '@/components/ds/Data'
import { Toast, useFlash } from '@/components/ds/Overlay'
import { DsSelect, TextField } from '@/components/ds/Field'
import { balanceOf, serviceYears, type Balance, type LedgerRow } from '@/lib/attendance/engine'
import type { AttConfig, AttLeaveType, AttLedger, AttPerson } from '@/lib/attendance/types'
import { Avatar, HoverButton, Pill } from './bits'
import { LedgerPanel, type LedgerPick } from './LedgerPanel'
import { downloadCsv } from './BalanceCsv'

/**
 * Attendance › Leave balances (2026-10-15, the handoff's `isBalances`, `HR
 * Attendance.dc.html` lines 384–441): the people on the left with their annual
 * leave left; a person's leave cards, the action bar (Edit days · Use leave)
 * and the picked type's history on the right. A history row opens its entry
 * with its audit trail; the action bar opens the same panel to change the
 * balance (an adjustment row with a reason) or to book days for the person.
 */

type Filter = 'All' | 'Low' | 'Missing'

const fmt = (n: number) => String(Math.round(n * 100) / 100)

export interface PersonBal {
  p: AttPerson
  al: Balance | null
  opening: boolean
}

export default function BalancesView({ config, ledger }: { config: AttConfig; ledger: AttLedger }) {
  const today = config.today
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<Filter>('All')
  // One department at a time (2026-10-16, the user: "i need can be select by department, might be drop down") —
  // Records' own dropdown; the pills count inside it.
  const [dept, setDept] = useState('all')
  const [personId, setPersonId] = useState<string | null>(null)
  const [typeCode, setTypeCode] = useState<string | null>(null)
  const [pick, setPick] = useState<LedgerPick | null>(null)
  const [toast, flash] = useFlash()
  const [, startTransition] = useTransition()

  const alType = config.leaveTypes.find(t => t.code === 'AL') ?? null
  const all: PersonBal[] = useMemo(
    () =>
      config.people.map(p => ({
        p,
        al: alType ? balanceOf(p, alType, config, ledger, today) : null,
        opening: ledger.entries.some(e => e.staffId === p.id && e.code === 'AL' && e.kind === 'opening'),
      })),
    [config, ledger, today, alType],
  )
  const inDept = all.filter(x => dept === 'all' || x.p.departmentId === dept)
  const low = inDept.filter(x => x.al?.left != null && x.al.left <= 2)
  const miss = inDept.filter(x => !x.opening)
  const ql = q.trim().toLowerCase()
  const list = (filter === 'Low' ? low : filter === 'Missing' ? miss : inDept).filter(x => !ql || x.p.name.toLowerCase().includes(ql))

  const bal = all.find(x => x.p.id === personId) ?? null
  const types = bal ? config.leaveTypes.map(t => ({ t, b: balanceOf(bal.p, t, config, ledger, today) })) : []
  const cur = types.find(x => x.t.code === (typeCode ?? alType?.code ?? types[0]?.t.code)) ?? types[0] ?? null

  const yrs = (p: AttPerson) => serviceYears(p.hireDate, today)
  const exportCsv = () =>
    downloadCsv(`Leave_balances_${today}.csv`, [
      ['Name', 'Department', 'Annual leave left', 'Annual leave total', 'Opening entered'],
      ...list.map(x => [x.p.name, x.p.department ?? '', x.al?.left != null ? fmt(x.al.left) : '', x.al?.of != null ? fmt(x.al.of) : '', x.opening ? 'yes' : 'no']),
    ])

  return (
    <HvPage>
      <PageHead eyebrow="Attendance" title="Leave balances" right={<Button variant="secondary" onClick={exportCsv}>Export</Button>} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 18 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '350px minmax(0,1fr)', gap: 20, alignItems: 'start' }}>
          <div style={{ border: '1px solid var(--ds-border)', borderRadius: 12, padding: 14, display: 'flex', flexDirection: 'column', gap: 12, background: 'var(--ds-surface)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 15, fontWeight: 500 }}>People</span>
              <span style={{ fontSize: 12, color: 'var(--ds-ink-3)' }}>Annual leave left</span>
            </div>
            <TextField value={q} onChange={setQ} placeholder="Search name" />
            <DsSelect
              value={dept}
              onChange={setDept}
              ariaLabel="Department"
              options={[{ value: 'all', label: 'All departments' }, ...config.departments.map(d => ({ value: d.id, label: d.name }))]}
            />
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <Pill label="All" n={inDept.length} on={filter === 'All'} onClick={() => setFilter('All')} />
              <Pill label="2 days or less" n={low.length} on={filter === 'Low'} onClick={() => setFilter('Low')} />
              <Pill label="No opening" n={miss.length} on={filter === 'Missing'} onClick={() => setFilter('Missing')} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 560, overflowY: 'auto', overflowX: 'hidden', scrollbarGutter: 'stable', paddingRight: 6 }}>
              {list.map(({ p, al, opening }) => {
                const on = personId === p.id
                const total = al?.of ?? 0
                const left = al?.left ?? null
                const lowP = left != null && left <= 2
                const y = yrs(p)
                return (
                  <HoverButton
                    key={p.id}
                    onClick={() => {
                      setPersonId(p.id)
                      setPick(null)
                    }}
                    style={{ width: '100%', boxSizing: 'border-box', minWidth: 0, display: 'flex', alignItems: 'center', gap: 10, padding: '9px 8px', border: 0, borderRadius: 8, background: on ? 'rgb(255 245 233)' : 'transparent', boxShadow: on ? 'inset 2px 0 0 rgb(233 154 83)' : 'none', textAlign: 'left', fontFamily: 'inherit', color: 'var(--ds-ink)', cursor: 'pointer' }}
                  >
                    <Avatar name={p.name} size={30} />
                    <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 5 }}>
                      <span style={{ display: 'flex', justifyContent: 'space-between', gap: 8, minWidth: 0, width: '100%' }}>
                        <span style={{ flex: '1 1 auto', minWidth: 0, fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</span>
                        <span style={{ flex: 'none', whiteSpace: 'nowrap', fontFamily: 'var(--font-mono)', fontSize: 12, color: lowP ? 'rgb(var(--tone-clay-deep))' : 'var(--ds-ink)' }}>
                          {left != null ? `${fmt(left)} / ${fmt(total)}` : '—'}
                        </span>
                      </span>
                      <span style={{ display: 'block', height: 4, borderRadius: 4, background: 'var(--ds-surface-3)', overflow: 'hidden' }}>
                        <span style={{ display: 'block', height: '100%', width: `${left != null && total ? Math.max(0, Math.min(100, (left / total) * 100)) : 0}%`, background: lowP ? 'rgb(233 154 83)' : 'rgb(var(--tone-slate-deep))', borderRadius: 4 }} />
                      </span>
                      <span style={{ fontSize: 11.5, color: 'var(--ds-ink-3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {[p.department ?? '—', y != null ? `${y} y` : null].filter(Boolean).join(' · ')}
                        {opening ? '' : ' · no opening balance'}
                      </span>
                    </span>
                  </HoverButton>
                )
              })}
            </div>
          </div>
          <div style={{ border: '1px solid var(--ds-border)', borderRadius: 12, background: 'var(--ds-surface)' }}>
            {!bal ? (
              <div style={{ padding: '80px 20px', textAlign: 'center', fontSize: 13, color: 'var(--ds-ink-2)' }}>Pick a person on the left.</div>
            ) : (
              <PersonBalances
                bal={bal}
                types={types}
                cur={cur}
                year={ledger.year}
                config={config}
                onType={code => {
                  setTypeCode(code)
                  setPick(null)
                }}
                onRow={row => setPick({ mode: 'view', row })}
                onEdit={() => setPick({ mode: 'edit', row: null })}
                onUse={() => setPick({ mode: 'use', row: null })}
                selectedRow={pick?.row?.id ?? null}
              />
            )}
          </div>
        </div>
      </div>
      {bal && cur ? (
        <LedgerPanel
          pick={pick}
          person={bal.p}
          type={cur.t}
          bal={cur.b}
          config={config}
          ledger={ledger}
          onMode={mode => setPick(p => (p ? { ...p, mode } : p))}
          onClose={() => setPick(null)}
          onDone={(m: string) => {
            setPick(null)
            startTransition(() => flash(m))
          }}
          onError={(m: string) => flash(m)}
        />
      ) : null}
      <Toast message={toast} />
    </HvPage>
  )
}

function PersonBalances({
  bal,
  types,
  cur,
  year,
  config,
  onType,
  onRow,
  onEdit,
  onUse,
  selectedRow,
}: {
  bal: PersonBal
  types: Array<{ t: AttLeaveType; b: Balance }>
  cur: { t: AttLeaveType; b: Balance } | null
  year: number
  config: AttConfig
  onType: (code: string) => void
  onRow: (row: LedgerRow) => void
  onEdit: () => void
  onUse: () => void
  selectedRow: string | null
}) {
  const p = bal.p
  const y = serviceYears(p.hireDate, config.today)
  const sub = [p.title, p.department, y != null ? `${y} years' service` : null].filter(Boolean).join(' · ')
  const sick = (t: AttLeaveType) => t.code === 'SL' || t.code === 'HL'
  const cols: Column<LedgerRow & Record<string, unknown>>[] = [
    { key: 'dateLabel', label: 'Date', width: '135px', mono: true },
    { key: 'entry', label: 'Entry', width: 'minmax(0,1.4fr)' },
    { key: 'days', label: 'Days', width: '70px', mono: true, render: r => (r.pending ? `(${fmt(Math.abs(r.days))})` : `${r.days >= 0 ? '+' : '−'}${fmt(Math.abs(r.days))}`) },
    { key: 'left', label: 'Left', width: '70px', mono: true, render: r => (r.left == null ? '—' : fmt(r.left)) },
    { key: 'by', label: 'By', width: '120px' },
  ]
  const left = cur?.b.left
  const unpaid = !!cur && (cur.t.unpaid || (cur.t.drawsFrom ? !!config.leaveTypes.find(t => t.code === cur.t.drawsFrom)?.unpaid : false))
  return (
    <div style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <Avatar name={p.name} size={42} />
          <div>
            <div style={{ fontSize: 19, fontWeight: 500 }}>{p.name}</div>
            <div style={{ fontSize: 13, color: 'var(--ds-ink-2)', marginTop: 2 }}>{sub}</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }} />
      </div>
      {types.length ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,minmax(0,1fr))', gap: 10 }}>
          {types.map(({ t, b }) => {
            const on = cur?.t.code === t.code
            const noBal = b.left == null
            const of = b.of
            const drawn = t.drawsFrom ? config.leaveTypes.find(x => x.code === t.drawsFrom) : null
            const note = t.unpaid ? 'Goes to payroll' : !b.covered ? 'Not covered' : drawn ? `Taken from ${drawn.name.toLowerCase()}` : t.accrues ? `${fmt(b.used)} used · ${fmt(b.pending)} pending · ${fmt(b.entitlement ?? 0)}/yr` : `${fmt(b.used)} used`
            const tagBg = sick(t) ? 'var(--ds-info-bg)' : t.unpaid ? 'var(--ds-surface-3)' : 'rgb(var(--tone-slate))'
            const tagFg = sick(t) ? 'var(--ds-info)' : t.unpaid ? 'var(--ds-ink-2)' : 'rgb(var(--tone-slate-deep))'
            return (
              <HoverButton
                key={t.code}
                onClick={() => onType(t.code)}
                hover={{ borderColor: 'rgb(233 154 83)' }}
                style={{ textAlign: 'left', fontFamily: 'inherit', color: 'var(--ds-ink)', cursor: 'pointer', border: `1px solid ${on ? 'rgb(233 154 83)' : 'var(--ds-border)'}`, boxShadow: on ? '0 0 0 1px rgb(233 154 83)' : 'none', background: on ? 'rgb(255 248 240)' : 'var(--ds-surface)', borderRadius: 10, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 12.5, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.name}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, padding: '1px 6px', borderRadius: 5, background: tagBg, color: tagFg }}>{t.code}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                  <span style={{ fontSize: 24, fontWeight: 500, fontFamily: 'var(--font-mono)' }}>{noBal ? '—' : fmt(b.left!)}</span>
                  <span style={{ fontSize: 12, color: 'var(--ds-ink-3)' }}>{noBal || of == null ? '' : `/ ${fmt(of)}`}</span>
                </div>
                <span style={{ display: 'block', height: 4, borderRadius: 4, background: 'var(--ds-surface-3)', overflow: 'hidden' }}>
                  <span style={{ display: 'block', height: '100%', width: `${!noBal && of ? Math.max(0, Math.min(100, (b.left! / of) * 100)) : 0}%`, background: sick(t) ? 'var(--ds-info)' : 'rgb(var(--tone-slate-deep))' }} />
                </span>
                <span style={{ fontSize: 11.5, color: 'var(--ds-ink-2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{note}</span>
              </HoverButton>
            )
          })}
        </div>
      ) : null}
      {cur ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontSize: 10.5, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--ds-ink-3)' }}>
              {`${cur.t.name} history · ${year} · ${left == null ? '—' : fmt(left)} left`}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '10px 12px', border: '1px solid var(--ds-border)', borderRadius: 10, background: 'var(--ds-surface-2)' }}>
            <span style={{ fontSize: 12.5, color: 'var(--ds-ink-2)' }}>
              {unpaid ? `Unpaid has no balance · book days for ${p.name}` : `${left == null ? '—' : fmt(left)} ${cur.t.name.toLowerCase()} left · change the balance or book days for ${p.name}`}
            </span>
            <div style={{ display: 'flex', gap: 8, flex: 'none' }}>
              <Button variant="secondary" size="sm" disabled={unpaid || !config.canEdit || left == null} onClick={onEdit}>Edit days</Button>
              <Button size="sm" disabled={!config.canCreate} onClick={onUse}>Use leave</Button>
            </div>
          </div>
          <DataTable
            columns={cols}
            rows={cur.b.rows as Array<LedgerRow & Record<string, unknown>>}
            onRowClick={r => onRow(r)}
            selectedKey={selectedRow}
            empty={null}
            style={cur.b.rows.length ? undefined : { display: 'none' }}
          />
          {cur.b.rows.length === 0 ? (
            <div style={{ padding: 14, textAlign: 'center', fontSize: 13, color: 'var(--ds-ink-2)', border: '1px dashed var(--ds-border)', borderRadius: 10 }}>Nothing taken this year.</div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
