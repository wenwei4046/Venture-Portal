'use client'

import { createSubDepartment } from '../../config-actions'
import { ActionForm, Field, SaveButton } from '@/components/RowForm'
import type { CommissionSettingsData } from './types'
import { Select } from '@/components/hrv/select'

/**
 * "Generate New Sub-Department".
 *
 * The Revenue Department splits into sub-departments and each one calculates
 * differently — Fair (the roadshow team) is the first. A new one either
 * follows an existing ruleset, in which case every rule row is copied and
 * `cloned_from_scheme_id` records where from, or starts blank for a bespoke
 * one — blank meaning every switch off and every table empty (2026-09-10),
 * not the column defaults.
 *
 * It reads the UNSCOPED lists on `data` on purpose: the whole point of the
 * form is to reach past the sub-department whose page it is sitting on.
 */
export default function NewSubDepartmentForm({
  data,
  onDone,
}: {
  data: CommissionSettingsData
  onDone: () => void
}) {
  return (
    <ActionForm action={createSubDepartment} onDone={onDone}>
      {({ pending }) => (
        <div className="border border-hairline rounded-card bg-surface p-6 max-w-2xl">
          <h3 className="text-[15px] font-semibold mb-4">New sub-department</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-xs">
              <span className="block mb-1 font-medium">Department</span>
              <Select bare
                name="department_id"
                required
                className="w-full px-3 py-2 bg-paper border border-hairline rounded-control text-sm text-ink"
              >
                {data.commissionDepartments.map(d => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </Select>
            </label>
            <label className="text-xs">
              <span className="block mb-1 font-medium">Name</span>
              <Field name="name" placeholder="e.g. Showroom" required />
            </label>
            <label className="text-xs">
              <span className="block mb-1 font-medium">Short code</span>
              <Field name="code" placeholder="SHOW" />
            </label>
            <label className="text-xs">
              <span className="block mb-1 font-medium">Follow an existing ruleset</span>
              <Select bare
                name="clone_from_scheme_id"
                className="w-full px-3 py-2 bg-paper border border-hairline rounded-control text-sm text-ink"
              >
                <option value="">— start blank: every rule off —</option>
                {data.allSchemes.map(s => {
                  const sub = data.subDepartments.find(d => d.id === s.sub_department_id)
                  return (
                    <option key={s.id} value={s.id}>
                      Copy {sub?.name ?? s.scheme_name}
                    </option>
                  )
                })}
              </Select>
            </label>
          </div>
          <p className="text-xs mt-3 mb-4">
            Copying brings across every rank, item group, KPI item, threshold, Open Bill rate, brand
            and margin band. Starting blank brings nothing: every scheme rule is switched off and
            every table is empty until you write it. Neither brings across people — nobody can hold
            two positions at once. The new sub-department appears in the sidebar under Revenue.
          </p>
          <SaveButton pending={pending} label="Create sub-department" />
        </div>
      )}
    </ActionForm>
  )
}
