'use client'

import NewSubDepartmentForm from './config/NewSubDepartmentForm'
import type { CommissionSettingsData } from './config/types'

/**
 * What `/revenue` shows before the department has been set up at all.
 *
 * Every other page under `/revenue` is addressed by sub-department, so with
 * none in existence there is nowhere for the sidebar to point and nothing to
 * scope a rule to. This is the one screen that can appear without one.
 */
export default function FirstSubDepartment({ data }: { data: CommissionSettingsData }) {
  return (
    <div>
      <div className="page-head">
        <div>
          <div className="page-eyebrow">
            <em>I.</em> REVENUE · SETUP
          </div>
          <h1 className="page-title">Revenue Department</h1>
          <p className="font-serif italic text-graphite text-base mt-3 max-w-2xl">
            The department splits into sub-departments and each one calculates differently —{' '}
            <em>Fair</em>, the roadshow team, is the first. Every rule, rank and salesperson belongs
            to one of them, so the first one has to exist before anything else can.
          </p>
        </div>
      </div>

      <NewSubDepartmentForm data={data} onDone={() => {}} />
    </div>
  )
}
