// scripts/seed-directors.mjs
//
// Seed 4 directors with weightage, min_payout, PCB category from spec.
// Idempotent: upserts by code.
//
// Usage: node scripts/seed-directors.mjs

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('✗ Missing env vars. Need NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const directors = [
  {
    name: 'Director WL',
    code: 'WL',
    pcb_category: 'KA1',
    children_count: 0,
    weightage: 0.85,
    min_payout: 14400.00,
    status: 'active',
  },
  {
    name: 'Director MK',
    code: 'MK',
    pcb_category: 'KA1',
    children_count: 0,
    weightage: 0.945,
    min_payout: 14400.00,
    status: 'active',
  },
  {
    name: 'Director WS',
    code: 'WS',
    pcb_category: 'KA1',
    children_count: 0,
    weightage: 1.05,
    min_payout: 14400.00,
    status: 'active',
  },
  {
    name: 'Director WW',
    code: 'WW',
    pcb_category: 'KA1',
    children_count: 0,
    weightage: 1.155,
    min_payout: 14400.00,
    status: 'active',
  },
]

async function main() {
  console.log('Seeding directors...\n')

  for (const d of directors) {
    // Check if exists
    const { data: existing } = await supabase
      .from('directors')
      .select('id, code')
      .eq('code', d.code)
      .maybeSingle()

    if (existing) {
      // Update
      const { error } = await supabase
        .from('directors')
        .update(d)
        .eq('id', existing.id)
      if (error) {
        console.error(`✗ ${d.code}: ${error.message}`)
      } else {
        console.log(`✓ ${d.code} updated (${d.name}, weightage ${d.weightage})`)
      }
    } else {
      // Insert
      const { error } = await supabase
        .from('directors')
        .insert(d)
      if (error) {
        console.error(`✗ ${d.code}: ${error.message}`)
      } else {
        console.log(`✓ ${d.code} inserted (${d.name}, weightage ${d.weightage})`)
      }
    }
  }

  // Verify total weightage
  const { data: all } = await supabase
    .from('directors')
    .select('code, weightage')
    .eq('status', 'active')
  const totalW = all?.reduce((sum, d) => sum + Number(d.weightage), 0) ?? 0
  console.log(`\nTotal weightage: ${totalW} (expected: 4.0)`)
  if (Math.abs(totalW - 4.0) > 0.001) {
    console.warn('⚠ Weightage does not sum to 4.0!')
  }
}

main().catch(err => {
  console.error('Fatal:', err)
  process.exit(1)
})
