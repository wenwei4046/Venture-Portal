// Local PostgreSQL regression for 20261020234000 (2026-10-20, a typed bill-to's address in six parts — the user:
// "所有关联到 address 的，都要跟着我刚才上面讲的 format 给他们去填"). amend_issued_invoice touches the ledger, the
// statements and the audit trail, so it is not run here: what is under test is the migration itself, VERBATIM, over
// production's own body (address-invoice-production.sql, md5-checked) — the column and its CHECK on a stand-in invoices
// table; the one statement swapped in, exactly once, with every other line of production's body as it was; a second
// run changing nothing. Its behaviour on the live schema was dry-run on production before it was applied. No live I/O.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const db = new PGlite()
const migrations = new URL('../../supabase/migrations/', import.meta.url)
const q = async (sql, params = []) => (await db.query(sql, params)).rows
const text = async url => (await readFile(url, 'utf8')).replace(/\r\n/g, '\n')
let checks = 0
const check = (actual, expected, what) => { assert.deepEqual(actual, expected, what); checks++ }
const refuses = async (sql, params, pattern, what) => {
  await assert.rejects(q(sql, params), err => pattern.test(String(err.message)), what)
  checks++
}

// The body names tables, types and helpers PGlite has none of; it is read, not run.
await db.exec(`
  set check_function_bodies = off;
  create table public.invoices (id uuid primary key default gen_random_uuid(), billable_to_freetext_address text);
`)
await db.exec(await text(new URL('./address-invoice-production.sql', import.meta.url)))
const body = async () => (await q(`select prosrc from pg_proc where proname = 'amend_issued_invoice'`))[0].prosrc
const md5 = async () => (await q(`select md5(prosrc) m from pg_proc where proname = 'amend_issued_invoice'`))[0].m
const before = await body()
check(await md5(), 'ec915120610b637b13d571a728ca2a75', "production's amend_issued_invoice, as it was read")

const MIGRATION = await text(new URL('20261020234000_address_invoice_bill_to.sql', migrations))
await db.exec(MIGRATION)
const after = await body()
const PARTS = `billable_to_freetext_address_parts = CASE WHEN jsonb_typeof(p_header->'billable_to_freetext_address_parts') = 'object'`
check(after.split(PARTS).length - 1, 1, 'the parts are set from the header, once')
check(after.indexOf(PARTS) > after.indexOf(`billable_to_freetext_address = NULLIF(p_header->>'billable_to_freetext_address', ''),`), true,
  '…right after the one line it puts beside them')
const added = `\n        billable_to_freetext_address_parts = CASE WHEN jsonb_typeof(p_header->'billable_to_freetext_address_parts') = 'object'\n                                                  THEN p_header->'billable_to_freetext_address_parts' END,`
check(after.replace(added, ''), before, 'nothing else in the body changed')

const swapped = await md5()
check(swapped, '1384f41374083afc029cd0891b18f325', 'the body production runs since it was applied (its dry-run said the same)')
await db.exec(MIGRATION)
check(await md5(), swapped, 'a second run changes nothing')

// The column takes an address held whole, or none.
await q(`insert into public.invoices (billable_to_freetext_address, billable_to_freetext_address_parts) values ($1, $2::jsonb)`,
  ['No 83, Jalan Jambu 3, 11060 Paya Terubong, Pulau Pinang, Malaysia',
    JSON.stringify({ line1: 'No 83, Jalan Jambu 3', line2: '', postcode: '11060', city: 'Paya Terubong', state: 'Pulau Pinang', country: 'Malaysia' })])
await q(`insert into public.invoices (billable_to_freetext_address) values ('Rygis Private Gym, Jalan Tun Razak')`)
check((await q(`select count(*)::int n from public.invoices where billable_to_freetext_address_parts is null`))[0].n, 1, 'an invoice billed before keeps no parts')
await refuses(`insert into public.invoices (billable_to_freetext_address_parts) values ('["not", "an", "object"]'::jsonb)`, [],
  /invoices_freetext_address_parts_check/, 'anything but an object is refused')

console.log(`validate-address-invoice: ${checks} checks passed`)
