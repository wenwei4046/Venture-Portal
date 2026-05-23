// Apply two production DB corrections via the service-role key (MCP supabase
// is offline). Reads .env.local for the URL + key.
//   1) bank_accounts.current_balance := Bank Reconciliation (HL 9,005.67,
//      Alliance 922.47) — the dashboard reads this table directly.
//   2) journal_entries.transaction_date for all manual_jv entries -> 2026-04-30,
//      so May 2026 Income Statement / Cash Flow shows only post-opening
//      activity (the opening was originally dated 2026-05-20, which inflated
//      "May" with cumulative opening figures).
// Run: node scripts/apply-corrections-2026-05-23.mjs
import { readFile } from 'node:fs/promises'
import { createClient } from '@supabase/supabase-js'

const env = await readFile('.env.local', 'utf8')
const getVar = (k) => env.match(new RegExp(`^${k}=(.*)$`, 'm'))?.[1]?.trim()
const url = getVar('NEXT_PUBLIC_SUPABASE_URL')
const key = getVar('SUPABASE_SERVICE_ROLE_KEY')
if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}
const supabase = createClient(url, key, { auth: { persistSession: false } })

console.log('== 1) Update bank_accounts.current_balance ==')
const { data: hl, error: hlErr } = await supabase
  .from('bank_accounts')
  .update({ current_balance: 9005.67 })
  .ilike('bank_name', '%Hong Leong%')
  .select('bank_name, current_balance')
if (hlErr) { console.error('HL error:', hlErr); process.exit(1) }
console.log(' Hong Leong ->', hl)
const { data: al, error: alErr } = await supabase
  .from('bank_accounts')
  .update({ current_balance: 922.47 })
  .ilike('bank_name', '%Alliance%')
  .select('bank_name, current_balance')
if (alErr) { console.error('Alliance error:', alErr); process.exit(1) }
console.log(' Alliance   ->', al)

console.log('\n== 2) Backdate manual_jv journal_entries to 2026-04-30 ==')
const { data: jeUp, error: jeErr } = await supabase
  .from('journal_entries')
  .update({ transaction_date: '2026-04-30' })
  .eq('reference_type', 'manual_jv')
  .select('id, entry_no, transaction_date, description')
if (jeErr) { console.error('JE error:', jeErr); process.exit(1) }
console.log(` Updated ${jeUp.length} entries:`)
for (const e of jeUp) console.log(`  ${e.entry_no}  ${e.transaction_date}  ${e.description}`)

console.log('\nDone.')
