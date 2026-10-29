// Local PostgreSQL regression for Dept Payment Requests made read-only (2026-10-29, PR ⑥ of
// docs/module-spec-payment-requests.md): the table reads as before, a client writes it no more, Finance's two steps of
// the retired page (Generate PV, Cancel) are gone, and a step that runs as its owner (the approval queue's) still
// writes. The migration runs VERBATIM (twice) against a synthetic surrounding schema. No live I/O.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const db = new PGlite()
const q = async (sql, params = []) => (await db.query(sql, params)).rows
const ROW = '00000000-0000-4000-8000-000000000001'

let checks = 0
const check = (actual, expected, what) => {
  assert.deepEqual(actual, expected, what)
  checks++
}
const reject = async (sql, pattern, what) => {
  await assert.rejects(() => q(sql), pattern, what)
  checks++
}
async function as(role) {
  await db.exec('RESET ROLE')
  if (role) await db.exec(`SET ROLE ${role}`)
}

// The surroundings as production has them: every client right on the table, the functions open to everybody.
await db.exec(`
  CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role;
  GRANT USAGE ON SCHEMA public TO authenticated, anon, service_role;
  CREATE TABLE public.dept_payment_requests (id uuid PRIMARY KEY, status text NOT NULL DEFAULT 'pending_finance_pv', amount numeric NOT NULL DEFAULT 0);
  GRANT ALL ON public.dept_payment_requests TO authenticated, anon, service_role;
  INSERT INTO public.dept_payment_requests (id, amount) VALUES ('${ROW}', 10);
  CREATE FUNCTION public.generate_pv_for_dept_request(p_request_id uuid, p_pay_from_account_id uuid, p_payment_method text) RETURNS uuid
    LANGUAGE sql SECURITY DEFINER AS $$ UPDATE public.dept_payment_requests SET status = 'pv_generated' WHERE id = p_request_id RETURNING id $$;
  CREATE FUNCTION public.cancel_dept_payment_request(p_request_id uuid, p_reason text) RETURNS void
    LANGUAGE sql SECURITY DEFINER AS $$ UPDATE public.dept_payment_requests SET status = 'cancelled' WHERE id = p_request_id $$;
  CREATE FUNCTION public.reject_dept_payment_request(p_approval_id uuid) RETURNS void
    LANGUAGE sql SECURITY DEFINER AS $$ UPDATE public.dept_payment_requests SET status = 'rejected' WHERE id = p_approval_id $$;
  GRANT EXECUTE ON FUNCTION public.generate_pv_for_dept_request(uuid, uuid, text), public.cancel_dept_payment_request(uuid, text),
    public.reject_dept_payment_request(uuid) TO authenticated, anon, service_role;
`)

const text = (await readFile(new URL('../../supabase/migrations/20261029250000_dept_payment_requests_read_only.sql', import.meta.url), 'utf8')).replace(/\r\n/g, '\n')
await db.exec(text)
await db.exec(text) // twice: it runs again without harm

// Read as before.
await as('authenticated')
check((await q('SELECT count(*)::int AS n FROM public.dept_payment_requests'))[0].n, 1, 'a client still reads the table')

// No client writes it.
await reject(`INSERT INTO public.dept_payment_requests (id) VALUES ('00000000-0000-4000-8000-000000000002')`, /permission denied/, 'authenticated cannot insert')
await reject(`UPDATE public.dept_payment_requests SET amount = 1`, /permission denied/, 'authenticated cannot update')
await reject(`DELETE FROM public.dept_payment_requests`, /permission denied/, 'authenticated cannot delete')
await as('anon')
await reject(`INSERT INTO public.dept_payment_requests (id) VALUES ('00000000-0000-4000-8000-000000000003')`, /permission denied/, 'anon cannot insert')

// Finance's two steps of the retired page are gone.
await as(null)
check(
  (await q(`SELECT proname FROM pg_proc WHERE proname IN ('generate_pv_for_dept_request', 'cancel_dept_payment_request')`)).map(r => r.proname),
  [],
  'Generate PV and Cancel are dropped',
)

// A step running as its owner still writes (the approval queue's) for a client who may call it.
await as('authenticated')
await q(`SELECT public.reject_dept_payment_request('${ROW}')`)
check((await q(`SELECT status FROM public.dept_payment_requests WHERE id = '${ROW}'`))[0].status, 'rejected', "the approval queue's step still writes, as its owner")

// Said on the table.
await as(null)
check(
  (await q(`SELECT obj_description('public.dept_payment_requests'::regclass, 'pg_class') AS c`))[0].c,
  "Dept Payment Requests — retired 2026-10-29 (PR ⑥): read-only history. A department's payments are payment_requests.",
  'the table says it is retired',
)

console.log(`dept payment requests read-only: ${checks} checks passed`)
