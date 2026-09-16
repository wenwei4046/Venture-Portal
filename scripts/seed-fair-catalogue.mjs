// Seed the Fair member catalogue from a prepared JSON file (2026-09-12).
//
//   node scripts/seed-fair-catalogue.mjs <rows.json> [--apply]
//
// Each row: { item_code, product_name, brand_code|null, item_group, unit_cost|null,
//             cost_grid|null, is_active, category, size, color, gift, available }
//
// Writes comm_products (matched on the normalised item code, updated in place)
// and member_product_options (one row per product). Without --apply it only
// reports what it would do. Reads the service-role key from .env.local, as the
// other seed scripts do — the key never appears in this file.
//
// The rows themselves (supplier costs) are NOT committed to the repository:
// build the file from the ERP snapshot and the Supplier Price List, keep it
// outside the tree.

import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'

const [, , file, flag] = process.argv
if (!file) {
  console.error('usage: node scripts/seed-fair-catalogue.mjs <rows.json> [--apply]')
  process.exit(1)
}
const apply = flag === '--apply'

const env = Object.fromEntries(
  fs
    .readFileSync('.env.local', 'utf8')
    .split('\n')
    .filter(l => l.includes('='))
    .map(l => {
      const idx = l.indexOf('=')
      return [l.slice(0, idx).trim(), l.slice(idx + 1).trim()]
    }),
)
if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing from .env.local')
  process.exit(1)
}
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

const norm = s => String(s ?? '').trim().toUpperCase().replace(/\s+/g, ' ')
const rows = JSON.parse(fs.readFileSync(file, 'utf8'))
if (!Array.isArray(rows) || rows.length === 0) throw new Error('No rows in ' + file)

for (const r of rows) {
  if (!r.item_code || typeof r.item_code !== 'string') throw new Error('Row without item_code: ' + JSON.stringify(r))
  if (r.cost_grid !== null && r.cost_grid !== undefined && !Array.isArray(r.cost_grid)) throw new Error(r.item_code + ': cost_grid must be an array or null')
  if (r.unit_cost !== null && r.unit_cost !== undefined && !(Number(r.unit_cost) >= 0)) throw new Error(r.item_code + ': bad unit_cost')
  if (!r.category) throw new Error(r.item_code + ': category is required')
}
const dupes = rows.map(r => norm(r.item_code)).filter((c, i, a) => a.indexOf(c) !== i)
if (dupes.length) throw new Error('Duplicate item codes in file: ' + [...new Set(dupes)].slice(0, 5).join(', '))

// ── who owns the writes ──────────────────────────────────────────────────
const { data: principal } = await supabase.from('users').select('id').eq('role', 'principal').eq('is_active', true).order('created_at').limit(1).maybeSingle()
const updatedBy = principal?.id ?? null

// ── existing products, by normalised code ────────────────────────────────
// PostgREST caps a read at 1,000 rows: page, or a second run would try to
// insert every product past the first thousand again.
const existing = []
for (let from = 0; ; from += 1000) {
  const { data, error: readError } = await supabase.from('comm_products').select('id, item_code').order('id').range(from, from + 999)
  if (readError) throw new Error(readError.message)
  existing.push(...(data ?? []))
  if (!data || data.length < 1000) break
}
const byCode = new Map(existing.map(p => [norm(p.item_code), p.id]))

const now = new Date().toISOString()
const productRow = r => ({
  item_code: r.item_code.trim(),
  product_name: r.product_name?.trim() || null,
  brand_code: r.brand_code ? String(r.brand_code).trim().toUpperCase() : null,
  item_group: r.item_group ? String(r.item_group).trim().toUpperCase() : null,
  unit_cost: r.unit_cost === null || r.unit_cost === undefined || r.unit_cost === '' ? null : Number(r.unit_cost),
  cost_grid: Array.isArray(r.cost_grid) && r.cost_grid.length ? r.cost_grid : null,
  is_active: r.is_active !== false,
  updated_by: updatedBy,
  updated_at: now,
})

const inserts = rows.filter(r => !byCode.has(norm(r.item_code)))
const updates = rows.filter(r => byCode.has(norm(r.item_code)))
console.log(`${rows.length} rows: ${inserts.length} new products, ${updates.length} existing products to update`)
console.log(`  with a flat cost ${rows.filter(r => r.unit_cost !== null && r.unit_cost !== undefined && r.unit_cost !== '').length}, with a grid ${rows.filter(r => Array.isArray(r.cost_grid) && r.cost_grid.length).length}, available ${rows.filter(r => r.available !== false).length}`)
if (!apply) {
  console.log('dry run — pass --apply to write')
  process.exit(0)
}

// ── comm_products ────────────────────────────────────────────────────────
for (let i = 0; i < inserts.length; i += 200) {
  const batch = inserts.slice(i, i + 200).map(productRow)
  const { data, error } = await supabase.from('comm_products').insert(batch).select('id, item_code')
  if (error) throw new Error(`insert failed at ${i}: ${error.message}`)
  for (const p of data) byCode.set(norm(p.item_code), p.id)
  console.log(`  inserted ${Math.min(i + 200, inserts.length)}/${inserts.length}`)
}
for (const [i, r] of updates.entries()) {
  const { error } = await supabase.from('comm_products').update(productRow(r)).eq('id', byCode.get(norm(r.item_code)))
  if (error) throw new Error(`update failed for ${r.item_code}: ${error.message}`)
  if ((i + 1) % 100 === 0) console.log(`  updated ${i + 1}/${updates.length}`)
}

// ── member_product_options ───────────────────────────────────────────────
const options = rows.map(r => ({
  product_id: byCode.get(norm(r.item_code)),
  category: String(r.category),
  size: r.size ? String(r.size) : '',
  color: r.color ? String(r.color) : '',
  gift: r.gift === true,
  available: r.available !== false,
  updated_at: now,
  updated_by: updatedBy,
}))
for (let i = 0; i < options.length; i += 200) {
  const { error } = await supabase.from('member_product_options').upsert(options.slice(i, i + 200), { onConflict: 'product_id' })
  if (error) throw new Error(`options upsert failed at ${i}: ${error.message}`)
  console.log(`  options ${Math.min(i + 200, options.length)}/${options.length}`)
}
console.log('done')
