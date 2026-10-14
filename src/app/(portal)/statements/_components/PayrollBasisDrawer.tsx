'use client'

import { FinDrawer, drawerStyles as d } from '@/components/finv/Drawer'
import { DrawerGroup as Group, DrawerLine as Line } from '@/components/finv/DrawerParts'
import DepartmentModeSwitch from '@/components/department/DepartmentModeSwitch'
import type { DepartmentMode } from '@/lib/department-mode'
import { officeTime } from '@/lib/office-time'
import type { PayrollBasisModel } from '../_lib/invoice-model'

// The payroll basis (2026-10-14, the Finance revamp v2 — D10). Service Billing
// carried it folded above the invoices: what each department's payroll costs
// beside what its invoices bill, the Director Salary Submission per
// subsidiary, the Staff Billing Allocation, and Finance's own cost-center /
// centralized switch (user 2026-09-30: Finance's switch on Service Billing).
// The design's hub has no place for it, so it opens from Payroll ▾ in the
// drawer's groups — every figure the fold had, kept (ours).

const ROMAN = ['I.', 'II.', 'III.', 'IV.', 'V.', 'VI.', 'VII.', 'VIII.', 'IX.', 'X.', 'XI.', 'XII.']
const f2 = (n: number) => (n < 0 ? '-' : '') + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const rm = (n: number) => `RM ${f2(n)}`

export default function PayrollBasisDrawer({
  open,
  onClose,
  month,
  basis,
  department,
}: {
  open: boolean
  onClose: () => void
  /** "October 2026". */
  month: string
  basis: PayrollBasisModel
  department: DepartmentMode | null
}) {
  return (
    <FinDrawer open={open} onClose={onClose} label={`Payroll basis · ${month}`} title={`Payroll basis · ${month}`}>
      <PayrollBasisBody basis={basis} department={department} />
    </FinDrawer>
  )
}

/** The drawer's groups — the Finance phone app draws them as a screen of their own. */
export function PayrollBasisBody({ basis, department }: { basis: PayrollBasisModel; department: DepartmentMode | null }) {
  let n = 0
  const next = () => ROMAN[n++] ?? ''
  const dir = basis.director
  const parts = (pairs: Array<[string, number | null]>) =>
    pairs
      .filter(([, v]) => v != null)
      .map(([l, v]) => `${l} ${f2(v as number)}`)
      .join(' · ')

  return (
    <>
      <Group n={next()} title="Status">
        <Line label="Payroll basis" value={basis.status} sub={basis.note} />
      </Group>
      <Group n={next()} title="Billed / from payroll" empty={basis.lines.length === 0 ? 'Nothing from payroll yet.' : undefined}>
        {basis.lines.map((l) => (
          <Line key={l.key} label={l.label} value={l.value} mono={l.value !== 'pending'} />
        ))}
      </Group>

      {dir ? (
        <>
          <Group n={next()} title="Director salary submission">
            <Line label="Submitted" value={dir.submittedAt ? officeTime(dir.submittedAt).format('DD MMM YYYY · HH:mm') : '—'} mono />
            <Line label="Directors" value={String(dir.count)} mono />
            <Line label="Payroll gross" value={rm(dir.gross)} mono />
            <Line label="Billed as CTC" value={rm(dir.billed)} mono />
          </Group>
          {dir.rows.length > 0 ? (
            <Group n={next()} title="Director salary by subsidiary" foot={{ l: 'Total', v: rm(dir.rows.reduce((s, r) => s + r.total, 0)) }}>
              {dir.rows.map((r) => (
                <Line
                  key={r.code}
                  label={r.code}
                  value={rm(r.total)}
                  mono
                  sub={[r.name, parts([['Basic', r.basic], ['KPI', r.kpi], ['Allowance', r.allowance], ['EPF ER', r.epfEr], ['SOCSO ER', r.socsoEr], ['EIS ER', r.eisEr]])].filter(Boolean).join(' · ')}
                />
              ))}
            </Group>
          ) : null}
        </>
      ) : null}

      {basis.allocation.map((a) => (
        <Group key={a.department} n={next()} title={`Staff billing allocation · ${a.department}`} foot={{ l: 'Billable total', v: rm(a.billable) }}>
          {a.rows.map((r) => (
            <Line
              key={r.code}
              label={r.code}
              value={rm(r.amount)}
              mono
              sub={[r.name, parts([['Salary', r.salary], ['Allowance', r.allowance], ['EPF', r.epf], ['SOCSO', r.socso], ['EIS', r.eis]])].join(' · ')}
            />
          ))}
          {a.own ? <Line label="HV — own share" value={rm(a.own.amount)} mono sub="Not billed" /> : null}
        </Group>
      ))}

      {department ? (
        <Group n={next()} title={`${department.name} department`}>
          <div className={d.line}>
            <DepartmentModeSwitch department={department} variant="cell" />
          </div>
        </Group>
      ) : null}
    </>
  )
}
