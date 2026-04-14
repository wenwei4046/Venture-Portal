// scripts/seed-hr-staff.mjs
//
// Phase 2 Step 2 — seeds HR staff costs + pool allocations + staff allocations
// for the current period. Used by Phase 2 Step 3 (HR cost summary), Step 5
// (invoice generation), and Step 7 (dept pool NP).
//
// Idempotent:
//   - hr_staff_costs: skip if (employee_name, department_id) already exists
//   - hr_pool_allocation: upsert on (department_id, company_id, period_month)
//   - hr_staff_allocation: upsert on (staff_id, company_id, period_month)
//
// Usage:
//   node --env-file=.env.local scripts/seed-hr-staff.mjs
//
// Requires NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env.local

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('✗ Missing env vars. Expected NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// Period month — first of the current month. Matches what the invoice
// generation RPC will use in Phase 2 Step 5.
const PERIOD = '2026-04-01'

// Staff by department. Numbers are illustrative placeholders for dev testing;
// the invoice generation tests in Step 5 read these exact values.
const HR_STAFF = [
  // HR department (3 staff) — totals: basic 18,000 / allowance 2,500
  { dept: 'HR', name: 'HR Lead',       basic: 7000, allow: 1000, epf: 910,  socso: 122, eis: 14 },
  { dept: 'HR', name: 'HR Officer',    basic: 6000, allow: 800,  epf: 780,  socso: 105, eis: 12 },
  { dept: 'HR', name: 'HR Assistant',  basic: 5000, allow: 700,  epf: 650,  socso: 87,  eis: 10 },

  // Finance department (3 staff)
  { dept: 'Finance', name: 'Finance Manager', basic: 10000, allow: 1500, epf: 1300, socso: 175, eis: 20 },
  { dept: 'Finance', name: 'Accountant',      basic: 7500,  allow: 1000, epf: 975,  socso: 131, eis: 15 },
  { dept: 'Finance', name: 'AP Clerk',        basic: 6500,  allow: 800,  epf: 845,  socso: 114, eis: 13 },

  // Marketing department (3 staff)
  { dept: 'Marketing', name: 'Mkt Lead',     basic: 5000, allow: 500, epf: 650, socso: 87, eis: 10 },
  { dept: 'Marketing', name: 'Mkt Designer', basic: 3000, allow: 300, epf: 390, socso: 52, eis: 6  },
  { dept: 'Marketing', name: 'Mkt Intern',   basic: 1500, allow: 200, epf: 195, socso: 26, eis: 3  },
]

// HR pool allocation: dept's total cost is split across subsidiaries.
// Only HR + Finance are cost-to-cost pool billed. Marketing is project-billed.
const POOL_ALLOCATION = {
  HR:      [ { company: 'HC', split: 0.5 }, { company: 'CONTS', split: 0.2 }, { company: 'CAR', split: 0.3 } ],
  Finance: [ { company: 'HC', split: 0.5 }, { company: 'CONTS', split: 0.3 }, { company: 'CAR', split: 0.2 } ],
}

// Finance staff individual attribution across subsidiaries (for Finance
// Attribution billing mode).
const STAFF_ATTRIBUTION = {
  'Finance Manager': [ { company: 'HC', pct: 0.4 }, { company: 'CONTS', pct: 0.3 }, { company: 'CAR', pct: 0.3 } ],
  'Accountant':      [ { company: 'HC', pct: 0.5 }, { company: 'CONTS', pct: 0.25 }, { company: 'CAR', pct: 0.25 } ],
  'AP Clerk':        [ { company: 'HC', pct: 0.6 }, { company: 'CONTS', pct: 0.2 }, { company: 'CAR', pct: 0.2 } ],
}

async function main() {
  console.log('═'.repeat(60))
  console.log('Seeding Phase 2 HR staff + allocations (period', PERIOD + ')')
  console.log('═'.repeat(60))
  console.log('')

  // Lookup departments + companies + HR user
  const { data: depts, error: deptsErr } = await supabase
    .from('departments')
    .select('id, name')

  if (deptsErr) throw new Error(`Failed to query departments: ${deptsErr.message}`)

  const deptByName = Object.fromEntries(depts.map((d) => [d.name, d.id]))
  for (const name of ['HR', 'Finance', 'Marketing']) {
    if (!deptByName[name]) throw new Error(`Department "${name}" not found — run seed:principal first`)
  }

  const { data: companies, error: cErr } = await supabase
    .from('companies')
    .select('id, short_code')
    .eq('is_active', true)

  if (cErr) throw new Error(`Failed to query companies: ${cErr.message}`)

  const companyByCode = Object.fromEntries(companies.map((c) => [c.short_code, c.id]))
  for (const code of ['HC', 'CONTS', 'CAR']) {
    if (!companyByCode[code]) throw new Error(`Company "${code}" not found`)
  }

  const { data: hrUser, error: hrErr } = await supabase
    .from('users')
    .select('id, email')
    .eq('role', 'hr')
    .eq('is_active', true)
    .limit(1)
    .maybeSingle()

  if (hrErr) throw new Error(`Failed to query hr user: ${hrErr.message}`)
  if (!hrUser) throw new Error('No active HR user found — run seed:users first')

  console.log(`✓ Found 3 departments, ${Object.keys(companyByCode).length} companies, HR user ${hrUser.email}`)
  console.log('')

  // ─── Seed hr_staff_costs (skip if exists) ───────────────────────────────
  console.log('→ hr_staff_costs')
  const seededStaff = {}  // name → id

  for (const spec of HR_STAFF) {
    const departmentId = deptByName[spec.dept]
    const { data: existing } = await supabase
      .from('hr_staff_costs')
      .select('id')
      .eq('employee_name', spec.name)
      .eq('department_id', departmentId)
      .maybeSingle()

    if (existing) {
      seededStaff[spec.name] = existing.id
      console.log(`  • ${spec.name} (${spec.dept}) — already exists`)
      continue
    }

    const totalCtc = spec.basic + spec.allow + spec.epf + spec.socso + spec.eis

    const { data: inserted, error: insertErr } = await supabase
      .from('hr_staff_costs')
      .insert({
        employee_name: spec.name,
        department_id: departmentId,
        basic_salary: spec.basic,
        allowances: spec.allow,
        epf_er: spec.epf,
        socso_er: spec.socso,
        eis_er: spec.eis,
        total_ctc: totalCtc,
        status: 'active',
        created_by: hrUser.id,
      })
      .select('id')
      .single()

    if (insertErr) {
      console.error(`  ✗ ${spec.name}: ${insertErr.message}`)
      continue
    }

    seededStaff[spec.name] = inserted.id
    console.log(`  ✓ ${spec.name} (${spec.dept}) — basic ${spec.basic}, ctc ${totalCtc}${spec.mgmt ? ' [mgmt]' : ''}`)
  }
  console.log('')

  // ─── Seed hr_pool_allocation (upsert) ───────────────────────────────────
  console.log('→ hr_pool_allocation')
  for (const [deptName, splits] of Object.entries(POOL_ALLOCATION)) {
    const deptId = deptByName[deptName]
    for (const split of splits) {
      const { error: upsertErr } = await supabase
        .from('hr_pool_allocation')
        .upsert({
          department_id: deptId,
          company_id: companyByCode[split.company],
          period_month: PERIOD,
          split_pct: split.split,
          created_by: hrUser.id,
        }, {
          onConflict: 'department_id,company_id,period_month',
        })

      if (upsertErr) {
        console.error(`  ✗ ${deptName}/${split.company}: ${upsertErr.message}`)
      } else {
        console.log(`  ✓ ${deptName} → ${split.company}: ${(split.split * 100).toFixed(0)}%`)
      }
    }
  }
  console.log('')

  // ─── Seed hr_staff_allocation (upsert) ──────────────────────────────────
  console.log('→ hr_staff_allocation (Finance only)')
  for (const [staffName, attribution] of Object.entries(STAFF_ATTRIBUTION)) {
    const staffId = seededStaff[staffName]
    if (!staffId) {
      console.error(`  ✗ ${staffName}: not found in seeded staff`)
      continue
    }

    for (const a of attribution) {
      const { error: upsertErr } = await supabase
        .from('hr_staff_allocation')
        .upsert({
          staff_id: staffId,
          company_id: companyByCode[a.company],
          period_month: PERIOD,
          allocation_pct: a.pct,
          created_by: hrUser.id,
        }, {
          onConflict: 'staff_id,company_id,period_month',
        })

      if (upsertErr) {
        console.error(`  ✗ ${staffName}/${a.company}: ${upsertErr.message}`)
      } else {
        console.log(`  ✓ ${staffName} → ${a.company}: ${(a.pct * 100).toFixed(0)}%`)
      }
    }
  }
  console.log('')

  console.log('═'.repeat(60))
  console.log('✓ Seed complete')
  console.log('═'.repeat(60))
  console.log('')
  console.log('Staff summary by department:')
  const byDept = HR_STAFF.reduce((acc, s) => {
    if (!acc[s.dept]) acc[s.dept] = { count: 0, basic: 0, allow: 0, stat: 0 }
    acc[s.dept].count += 1
    acc[s.dept].basic += s.basic
    acc[s.dept].allow += s.allow
    acc[s.dept].stat  += s.epf + s.socso + s.eis
    return acc
  }, {})

  for (const [dept, totals] of Object.entries(byDept)) {
    console.log(`  ${dept.padEnd(10)} ${totals.count} staff | basic ${totals.basic} | allow ${totals.allow} | stat ${totals.stat}`)
  }
  console.log('')
}

main().catch((err) => {
  console.error('Unexpected error:', err)
  process.exit(1)
})
