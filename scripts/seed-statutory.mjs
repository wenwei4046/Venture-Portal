// scripts/seed-statutory.mjs
//
// Seed all 4 statutory tables: EPF, SOCSO, EIS, PCB
// EPF: from extracted PDF data (scripts/epf-data.json)
// SOCSO: generated from Act 4 First Category rates
// EIS: generated from Act 800 rates
// PCB: generated from Malaysian tax bracket formula (2018 Jadual)
//
// Usage: node scripts/seed-statutory.mjs
// Requires NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env.local

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('✗ Missing env vars. Need NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const EFFECTIVE_FROM = '2024-10-01' // EPF effective date (Oct 2025 schedule)
const SOCSO_EIS_FROM = '2024-01-01' // SOCSO/EIS effective date
const PCB_FROM = '2018-01-01' // PCB Jadual 2018

// ─── EPF Third Schedule Part A ─────────────────────────────────────
async function seedEPF() {
  const raw = JSON.parse(readFileSync(resolve(__dirname, 'epf-data.json'), 'utf8'))
  const rows = raw.map(r => ({
    wage_from: r.wage_from,
    wage_to: r.wage_to,
    employer: r.employer,
    employee: r.employee,
    part: 'A',
    effective_from: EFFECTIVE_FROM,
    effective_to: null,
  }))

  // Clear existing Part A rows for this effective date
  await supabase.from('epf_third_schedule')
    .delete()
    .eq('part', 'A')
    .eq('effective_from', EFFECTIVE_FROM)

  // Insert in batches of 100
  for (let i = 0; i < rows.length; i += 100) {
    const batch = rows.slice(i, i + 100)
    const { error } = await supabase.from('epf_third_schedule').insert(batch)
    if (error) {
      console.error(`✗ EPF batch ${i}: ${error.message}`)
      return 0
    }
  }
  console.log(`✓ EPF Part A: ${rows.length} rows seeded`)
  return rows.length
}

// ─── SOCSO Act 4 First Category ────────────────────────────────────
function generateSOCSO() {
  // SOCSO Act 4 First Category contribution table
  // Based on official PERKESO rates effective 2024
  // ER: ~1.75%, EE: ~0.5% with specific rounded amounts per wage band
  // Ceiling: RM6,000
  const bands = []

  // Wage bands from RM30 to RM6,000
  const specs = [
    // [from, to, er, ee]
    [0.01, 30.00, 0.40, 0.10],
    [30.01, 50.00, 0.70, 0.20],
    [50.01, 70.00, 1.10, 0.30],
    [70.01, 100.00, 1.50, 0.40],
    [100.01, 140.00, 2.10, 0.60],
    [140.01, 200.00, 2.95, 0.85],
    [200.01, 300.00, 4.35, 1.25],
    [300.01, 400.00, 6.15, 1.75],
    [400.01, 500.00, 7.85, 2.25],
    [500.01, 600.00, 9.65, 2.75],
    [600.01, 700.00, 11.35, 3.25],
    [700.01, 800.00, 13.15, 3.75],
    [800.01, 900.00, 14.85, 4.25],
    [900.01, 1000.00, 16.65, 4.75],
    [1000.01, 1100.00, 18.35, 5.25],
    [1100.01, 1200.00, 20.15, 5.75],
    [1200.01, 1300.00, 21.85, 6.25],
    [1300.01, 1400.00, 23.65, 6.75],
    [1400.01, 1500.00, 25.35, 7.25],
    [1500.01, 1600.00, 27.15, 7.75],
    [1600.01, 1700.00, 28.85, 8.25],
    [1700.01, 1800.00, 30.65, 8.75],
    [1800.01, 1900.00, 32.35, 9.25],
    [1900.01, 2000.00, 34.15, 9.75],
    [2000.01, 2100.00, 35.85, 10.25],
    [2100.01, 2200.00, 37.65, 10.75],
    [2200.01, 2300.00, 39.35, 11.25],
    [2300.01, 2400.00, 41.15, 11.75],
    [2400.01, 2500.00, 42.85, 12.25],
    [2500.01, 2600.00, 44.65, 12.75],
    [2600.01, 2700.00, 46.35, 13.25],
    [2700.01, 2800.00, 48.15, 13.75],
    [2800.01, 2900.00, 49.85, 14.25],
    [2900.01, 3000.00, 51.65, 14.75],
    [3000.01, 3100.00, 53.35, 15.25],
    [3100.01, 3200.00, 55.15, 15.75],
    [3200.01, 3300.00, 56.85, 16.25],
    [3300.01, 3400.00, 58.65, 16.75],
    [3400.01, 3500.00, 60.35, 17.25],
    [3500.01, 3600.00, 62.15, 17.75],
    [3600.01, 3700.00, 63.85, 18.25],
    [3700.01, 3800.00, 65.65, 18.75],
    [3800.01, 3900.00, 67.35, 19.25],
    [3900.01, 4000.00, 69.15, 19.75],
    [4000.01, 4100.00, 70.85, 20.25],
    [4100.01, 4200.00, 72.65, 20.75],
    [4200.01, 4300.00, 74.35, 21.25],
    [4300.01, 4400.00, 76.15, 21.75],
    [4400.01, 4500.00, 77.85, 22.25],
    [4500.01, 4600.00, 79.65, 22.75],
    [4600.01, 4700.00, 81.35, 23.25],
    [4700.01, 4800.00, 83.15, 23.75],
    [4800.01, 4900.00, 84.85, 24.25],
    [4900.01, 5000.00, 86.65, 24.75],
    [5000.01, 5100.00, 88.35, 25.25],
    [5100.01, 5200.00, 90.15, 25.75],
    [5200.01, 5300.00, 91.85, 26.25],
    [5300.01, 5400.00, 93.65, 26.75],
    [5400.01, 5500.00, 95.35, 27.25],
    [5500.01, 5600.00, 97.15, 27.75],
    [5600.01, 5700.00, 98.85, 28.25],
    [5700.01, 5800.00, 100.65, 28.75],
    [5800.01, 5900.00, 102.35, 29.25],
    [5900.01, 6000.00, 104.15, 29.75],
  ]

  for (const [wf, wt, er, ee] of specs) {
    bands.push({
      wage_from: wf, wage_to: wt,
      employer: er, employee: ee,
      category: 'first',
      effective_from: SOCSO_EIS_FROM, effective_to: null,
    })
  }
  return bands
}

async function seedSOCSO() {
  const rows = generateSOCSO()

  await supabase.from('socso_act4_schedule')
    .delete()
    .eq('category', 'first')
    .eq('effective_from', SOCSO_EIS_FROM)

  const { error } = await supabase.from('socso_act4_schedule').insert(rows)
  if (error) {
    console.error(`✗ SOCSO: ${error.message}`)
    return 0
  }
  console.log(`✓ SOCSO First Category: ${rows.length} rows seeded`)
  return rows.length
}

// ─── EIS Act 800 ───────────────────────────────────────────────────
function generateEIS() {
  // EIS Act 800 contribution table
  // ER: 0.2%, EE: 0.2%, ceiling RM5,000
  // Wage bands in RM100 increments from RM30 to RM5,000
  const bands = []
  const specs = [
    [0.01, 30.00, 0.05, 0.05],
    [30.01, 50.00, 0.10, 0.10],
    [50.01, 70.00, 0.10, 0.10],
    [70.01, 100.00, 0.20, 0.20],
    [100.01, 140.00, 0.20, 0.20],
    [140.01, 200.00, 0.30, 0.30],
    [200.01, 300.00, 0.50, 0.50],
    [300.01, 400.00, 0.70, 0.70],
    [400.01, 500.00, 0.90, 0.90],
    [500.01, 600.00, 1.10, 1.10],
    [600.01, 700.00, 1.30, 1.30],
    [700.01, 800.00, 1.50, 1.50],
    [800.01, 900.00, 1.70, 1.70],
    [900.01, 1000.00, 1.90, 1.90],
    [1000.01, 1100.00, 2.10, 2.10],
    [1100.01, 1200.00, 2.30, 2.30],
    [1200.01, 1300.00, 2.50, 2.50],
    [1300.01, 1400.00, 2.70, 2.70],
    [1400.01, 1500.00, 2.90, 2.90],
    [1500.01, 1600.00, 3.10, 3.10],
    [1600.01, 1700.00, 3.30, 3.30],
    [1700.01, 1800.00, 3.50, 3.50],
    [1800.01, 1900.00, 3.70, 3.70],
    [1900.01, 2000.00, 3.90, 3.90],
    [2000.01, 2100.00, 4.10, 4.10],
    [2100.01, 2200.00, 4.30, 4.30],
    [2200.01, 2300.00, 4.50, 4.50],
    [2300.01, 2400.00, 4.70, 4.70],
    [2400.01, 2500.00, 4.90, 4.90],
    [2500.01, 2600.00, 5.10, 5.10],
    [2600.01, 2700.00, 5.30, 5.30],
    [2700.01, 2800.00, 5.50, 5.50],
    [2800.01, 2900.00, 5.70, 5.70],
    [2900.01, 3000.00, 5.90, 5.90],
    [3000.01, 3100.00, 6.10, 6.10],
    [3100.01, 3200.00, 6.30, 6.30],
    [3200.01, 3300.00, 6.50, 6.50],
    [3300.01, 3400.00, 6.70, 6.70],
    [3400.01, 3500.00, 6.90, 6.90],
    [3500.01, 3600.00, 7.10, 7.10],
    [3600.01, 3700.00, 7.30, 7.30],
    [3700.01, 3800.00, 7.50, 7.50],
    [3800.01, 3900.00, 7.70, 7.70],
    [3900.01, 4000.00, 7.90, 7.90],
    [4000.01, 4100.00, 8.10, 8.10],
    [4100.01, 4200.00, 8.30, 8.30],
    [4200.01, 4300.00, 8.50, 8.50],
    [4300.01, 4400.00, 8.70, 8.70],
    [4400.01, 4500.00, 8.90, 8.90],
    [4500.01, 4600.00, 9.10, 9.10],
    [4600.01, 4700.00, 9.30, 9.30],
    [4700.01, 4800.00, 9.50, 9.50],
    [4800.01, 4900.00, 9.70, 9.70],
    [4900.01, 5000.00, 9.90, 9.90],
  ]

  for (const [wf, wt, er, ee] of specs) {
    bands.push({
      wage_from: wf, wage_to: wt,
      employer: er, employee: ee,
      effective_from: SOCSO_EIS_FROM, effective_to: null,
    })
  }
  return bands
}

async function seedEIS() {
  const rows = generateEIS()

  await supabase.from('eis_act800_schedule')
    .delete()
    .eq('effective_from', SOCSO_EIS_FROM)

  const { error } = await supabase.from('eis_act800_schedule').insert(rows)
  if (error) {
    console.error(`✗ EIS: ${error.message}`)
    return 0
  }
  console.log(`✓ EIS Act 800: ${rows.length} rows seeded`)
  return rows.length
}

// ─── PCB Jadual (Monthly Tax Deduction) ────────────────────────────
// PCB data extracted from official LHDN Jadual_PCB_2018.pdf (733 pages)
// using scripts/extract-pcb.py → scripts/pcb-data.json
// 702,395 rows covering RM3,141 - RM87,755 across 3 categories × 0-10 children

function loadPCB() {
  const raw = JSON.parse(readFileSync(resolve(__dirname, 'pcb-data.json'), 'utf8'))
  return raw.map(r => ({
    income_from: r.income_from,
    income_to: r.income_to,
    category: r.category,
    children: r.children,
    pcb_amount: r.pcb_amount,
    effective_from: PCB_FROM,
    effective_to: null,
  }))
}

async function seedPCB() {
  const rows = loadPCB()
  console.log(`  Loading ${rows.length} PCB rows from pcb-data.json...`)

  await supabase.from('pcb_jadual')
    .delete()
    .eq('effective_from', PCB_FROM)

  // Insert in batches of 1000
  let inserted = 0
  for (let i = 0; i < rows.length; i += 1000) {
    const batch = rows.slice(i, i + 1000)
    const { error } = await supabase.from('pcb_jadual').insert(batch)
    if (error) {
      console.error(`✗ PCB batch ${i}: ${error.message}`)
      console.error(`  First row: ${JSON.stringify(batch[0])}`)
      return inserted
    }
    inserted += batch.length
    if (inserted % 50000 === 0) {
      console.log(`  PCB progress: ${inserted}/${rows.length} rows...`)
    }
  }
  console.log(`✓ PCB Jadual: ${inserted} rows seeded (RM${rows[0].income_from}-RM${rows[rows.length-1].income_to})`)
  return inserted
}

// ─── Main ──────────────────────────────────────────────────────────
async function main() {
  console.log('Seeding statutory tables...\n')

  const epfCount = await seedEPF()
  const socsoCount = await seedSOCSO()
  const eisCount = await seedEIS()
  const pcbCount = await seedPCB()

  console.log(`\n─── Summary ───`)
  console.log(`EPF Part A:      ${epfCount} rows`)
  console.log(`SOCSO Cat 1:     ${socsoCount} rows`)
  console.log(`EIS Act 800:     ${eisCount} rows`)
  console.log(`PCB Jadual:      ${pcbCount} rows`)
  console.log(`Total:           ${epfCount + socsoCount + eisCount + pcbCount} rows`)
}

main().catch(err => {
  console.error('Fatal:', err)
  process.exit(1)
})
