#!/usr/bin/env node
/**
 * Loads the ERP's sales orders, by paper number, into the portal's `erp_order_papers` (mig 20261031030000 — Whose
 * sale?). The check that holds a new bill whose paper is on another salesperson's order reads the portal's own bills,
 * and these: the orders the portal never had as bills — AutoCount's, keyed before the feed began, still being looked
 * after by somebody else — and whose sale each was.
 *
 *   node scripts/load-erp-order-papers.mjs            read the ERP, write the portal, say what changed
 *   node scripts/load-erp-order-papers.mjs --dry-run  read the ERP, say what it would write, write nothing
 *
 * Both databases through the Supabase CLI, signed in as the person running it (`npx supabase login`): no key is in this
 * file or read by it. The ERP (anogrigyjbduyzclzjgn) is only ever SELECTed from — never written. The portal's table is
 * replaced whole in one transaction: every order upserted, every order the ERP no longer has removed.
 *
 * Whose sale an order was: its salesperson BEFORE anybody moved it — the first `salespersonId` change in the ERP's own
 * audit log says who it was (2026-09-09: 362 orders of salespeople who had left were moved to SHAWN, and moved back the
 * next day) — else its salesperson now. `shared_with` is the ERP's Shared with (`collaborator_staff_ids`): who may work
 * the order, never a part of its sale.
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const ERP = 'anogrigyjbduyzclzjgn'
const PORTAL = 'gixpptmfuryskbwkmiwz'
const DRY = process.argv.includes('--dry-run')
const dir = mkdtempSync(join(tmpdir(), 'erp-order-papers-'))

/** Runs one SQL file through the CLI on a project; JSON rows back when asked. */
function query(ref, sql, json = true) {
  const file = join(dir, `${ref}.sql`)
  writeFileSync(file, sql)
  const args = ['supabase', 'db', 'query', '--linked', '--project-ref', ref, '--agent=no', ...(json ? ['-o', 'json'] : []), '-f', file]
  const out = execFileSync('npx', args, {
    encoding: 'utf8', maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'inherit'], shell: process.platform === 'win32',
  })
  if (!json) return out
  const start = out.indexOf('[')
  if (start < 0) throw new Error(`No rows came back from ${ref}:\n${out.slice(0, 400)}`)
  return JSON.parse(out.slice(start))
}

// ── 1. The ERP's orders (SELECT only) ──────────────────────────────────────────────────────────────────────────────
const ERP_SQL = `
WITH first_move AS (
  SELECT DISTINCT ON (a.so_doc_no) a.so_doc_no, NULLIF(BTRIM(e->>'from'), '') AS original_sp
    FROM scm.mfg_so_audit_log a
   CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(a.field_changes) = 'array' THEN a.field_changes ELSE '[]'::jsonb END) e
   WHERE a.company_id = 1 AND e->>'field' = 'salespersonId' AND NULLIF(BTRIM(e->>'from'), '') IS NOT NULL
   ORDER BY a.so_doc_no, a.created_at
)
SELECT so.doc_no,
       COALESCE(NULLIF(BTRIM(so.customer_so_no), ''), NULLIF(BTRIM(so.ref), '')) AS ref_no,
       so.so_date::text AS so_date,
       so.created_at AS erp_created_at,
       COALESCE(fm.original_sp, so.salesperson_id::text) AS erp_salesperson_id,
       COALESCE(NULLIF(BTRIM(st.name), ''), NULLIF(BTRIM(so.agent), '')) AS salesperson_name,
       st.active AS salesperson_active,
       COALESCE(ARRAY(SELECT x::text FROM unnest(so.collaborator_staff_ids) x), '{}') AS shared_with,
       so.status::text AS status,
       ROUND(COALESCE(so.local_total_sen, 0) / 100.0, 2) AS total
  FROM scm.mfg_sales_orders so
  LEFT JOIN first_move fm ON fm.so_doc_no = so.doc_no
  LEFT JOIN scm.staff st ON st.id::text = COALESCE(fm.original_sp, so.salesperson_id::text)
 WHERE so.company_id = 1
 ORDER BY so.doc_no`
const orders = query(ERP, ERP_SQL)
const moved = orders.filter(o => o.erp_salesperson_id && o.shared_with.length >= 0).length
console.log(`ERP: ${orders.length} orders (${orders.filter(o => o.ref_no).length} with a Ref No., ${moved} with a salesperson)`)

// ── 2. The portal's copy (one transaction) ─────────────────────────────────────────────────────────────────────────
const lit = v => (v === null || v === undefined ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`)
const arr = a => (Array.isArray(a) && a.length ? `ARRAY[${a.map(lit).join(', ')}]::text[]` : `'{}'::text[]`)
const bool = v => (v === true ? 'TRUE' : v === false ? 'FALSE' : 'NULL')
const stamp = new Date().toISOString()
const rows = orders.map(o => `(${[
  lit(o.doc_no), lit(o.ref_no), o.so_date ? `${lit(o.so_date)}::date` : 'NULL', o.erp_created_at ? `${lit(o.erp_created_at)}::timestamptz` : 'NULL',
  lit(o.erp_salesperson_id), lit(o.salesperson_name), bool(o.salesperson_active), arr(o.shared_with), lit(o.status),
  Number.isFinite(Number(o.total)) ? String(Number(o.total)) : 'NULL', `${lit(stamp)}::timestamptz`,
].join(', ')})`)
const chunks = []
for (let i = 0; i < rows.length; i += 500) {
  chunks.push(`INSERT INTO public.erp_order_papers (doc_no, ref_no, so_date, erp_created_at, erp_salesperson_id, salesperson_name,
  salesperson_active, shared_with, status, total, loaded_at)
VALUES
${rows.slice(i, i + 500).join(',\n')}
ON CONFLICT (doc_no) DO UPDATE SET ref_no = EXCLUDED.ref_no, so_date = EXCLUDED.so_date, erp_created_at = EXCLUDED.erp_created_at,
  erp_salesperson_id = EXCLUDED.erp_salesperson_id, salesperson_name = EXCLUDED.salesperson_name,
  salesperson_active = EXCLUDED.salesperson_active, shared_with = EXCLUDED.shared_with, status = EXCLUDED.status,
  total = EXCLUDED.total, loaded_at = EXCLUDED.loaded_at;`)
}
const PORTAL_SQL = `
BEGIN;
SELECT count(*) AS before FROM public.erp_order_papers;
${chunks.join('\n')}
DELETE FROM public.erp_order_papers WHERE loaded_at < ${lit(stamp)}::timestamptz;
SELECT count(*) AS orders,
       count(*) FILTER (WHERE cardinality(papers) > 0 AND papers <> ARRAY[doc_no]) AS with_papers,
       count(*) FILTER (WHERE salesperson_active IS FALSE) AS sold_by_somebody_who_left,
       count(*) FILTER (WHERE cardinality(shared_with) > 0) AS shared_with_somebody
  FROM public.erp_order_papers;
${DRY ? 'ROLLBACK;' : 'COMMIT;'}`

try {
  const result = query(PORTAL, PORTAL_SQL)
  console.log(`${DRY ? 'Dry run — nothing kept' : 'Portal'}:`, JSON.stringify(result))
} finally {
  rmSync(dir, { recursive: true, force: true })
}
