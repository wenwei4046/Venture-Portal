// Local PostgreSQL regression for 20261024100000 (2026-10-23, 「从某月起生效」 · 利息按原本金算 — the user: HC's
// Conts 60k ran "5月还是用本金*3.5%， 6月就变成还是用本金*3%"). A change from a month on may now say its interest is
// on the original principal; the amend RPCs write that onto the history row they file (next_interest_on_original,
// describing the segment after it, as `reason` does). Stand-in tables carry the columns the two RPCs read; the
// migration is applied VERBATIM and driven as the treasury approver, as somebody without Approve, and checked for
// who may call it. No live I/O.
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

const APPROVER = '00000000-0000-0000-0000-0000000000aa'  // Treasury · Approve
const CLERK = '00000000-0000-0000-0000-0000000000ab'     // Treasury · Create only
const ACTIONS = { [APPROVER]: 'treasury.view,treasury.create,treasury.approve', [CLERK]: 'treasury.view,treasury.create' }
const FS60 = '00000000-0000-4000-8000-000000000060'
const FS58 = '00000000-0000-4000-8000-000000000058'
const LOAN = '00000000-0000-4000-8000-000000000001'

async function as(user) {
  await db.exec('RESET ROLE')
  await q(`select set_config('request.jwt.claim.sub', $1, false), set_config('test.actions', $2, false)`, [user ?? '', ACTIONS[user] ?? ''])
  if (user) await db.exec('SET ROLE authenticated')
}

await db.exec(`
  create role anon; create role authenticated; create role service_role;
  create schema auth;
  grant usage on schema auth to authenticated, anon, service_role;
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create type public.user_role as enum ('principal', 'finance', 'staff');
  create function public.current_user_role() returns user_role language sql stable as $$ select 'finance'::user_role $$;
  create function public.has_any_action(p_actions text[]) returns boolean language sql stable as
    $$ select coalesce(string_to_array(nullif(current_setting('test.actions', true), ''), ',') && p_actions, false) $$;
  -- Production's guard asks the tab to be open; here it only notes it was asked.
  create table public.guard_calls (tabs text[], actions text[]);
  create function public.tab_write_guard(p_tabs text[], p_actions text[]) returns void language sql security definer as
    $$ insert into public.guard_calls values (p_tabs, p_actions) $$;
  create function public.terms_months_between(a date, b date) returns integer language sql immutable as $$
    select (extract(year from b)::int - extract(year from a)::int) * 12 + (extract(month from b)::int - extract(month from a)::int)
  $$;

  create table public.fund_sources (
    id uuid primary key, status text not null, amount numeric not null, cost_rate numeric(8,6) not null,
    lock_in_months integer, compound_interest boolean default false, effective_date date, repayment_start_month date,
    maturity_date date, terms_effective_from date, updated_at timestamptz);
  create table public.loans (
    id uuid primary key, status text not null, principal numeric not null, effective_rate numeric(8,6) not null,
    base_rate numeric(8,6) not null default 0, risk_premium numeric(8,6) not null default 0, tenure_months integer,
    compound_interest boolean default false, disbursement_date date, repayment_start_month date,
    terms_effective_from date, repayment_terms text, updated_at timestamptz);
  -- treasury_terms_history as 20260921010000 + 20260922010000 left it.
  create table public.treasury_terms_history (
    id uuid primary key default gen_random_uuid(),
    record_kind text not null check (record_kind in ('loan', 'fund_source')), record_id uuid not null,
    valid_from date not null, valid_to date not null, rate numeric(12, 6) not null, months integer,
    compound_interest boolean not null default false, was_effective_from date, was_maturity_date date,
    reason text, created_by uuid, created_at timestamptz not null default now(), was_repayment_terms text,
    check (valid_to >= valid_from));
  grant select, insert, update, delete on all tables in schema public to authenticated;

  -- HC's Conts 60k / 58k as production holds them, with the May rate re-stated whole-life to 3.5% first.
  insert into public.fund_sources (id, status, amount, cost_rate, lock_in_months, effective_date, repayment_start_month) values
    ('${FS60}', 'active', 60000, 0.035, 6, '2025-09-02', '2026-05-01'),
    ('${FS58}', 'active', 58000, 0.035, 6, '2026-02-15', '2026-05-01');
  insert into public.loans (id, status, principal, effective_rate, tenure_months, disbursement_date, repayment_start_month, repayment_terms) values
    ('${LOAN}', 'active', 60000, 0.035, 6, '2026-04-02', '2026-05-01', 'EMI');
`)

// Before: the 7-argument RPCs as production has them (only their signatures matter to the drop).
await db.exec(`
  create function public.amend_fund_source_from(uuid, date, numeric, integer, boolean, text, boolean default false) returns void language sql as $$ select $$;
  create function public.amend_loan_from(uuid, date, numeric, integer, boolean, text, boolean default false) returns void language sql as $$ select $$;
`)

await db.exec(await text(new URL('20261024100000_terms_interest_on_original.sql', migrations)))

const sigs = await q(`select p.oid::regprocedure::text s from pg_proc p where p.proname in ('amend_fund_source_from', 'amend_loan_from') order by 1`)
check(sigs.map(r => r.s), [
  'amend_fund_source_from(uuid,date,numeric,integer,boolean,text,boolean,boolean)',
  'amend_loan_from(uuid,date,numeric,integer,boolean,text,boolean,boolean)',
], 'the 7-argument RPCs are gone; one 8-argument RPC each')
for (const f of ['amend_fund_source_from(uuid,date,numeric,integer,boolean,text,boolean,boolean)', 'amend_loan_from(uuid,date,numeric,integer,boolean,text,boolean,boolean)']) {
  const [g] = await q(`select has_function_privilege('anon', $1, 'execute') anon, has_function_privilege('authenticated', $1, 'execute') auth,
                              has_function_privilege('service_role', $1, 'execute') svc, p.prosecdef definer
                         from pg_proc p where p.oid = $1::regprocedure`, [f])
  check(g, { anon: false, auth: true, svc: true, definer: true }, `${f}: DEFINER, signed-in and service only`)
}
const [col] = await q(`select data_type, is_nullable, column_default from information_schema.columns where table_name = 'treasury_terms_history' and column_name = 'next_interest_on_original'`)
check(col, { data_type: 'boolean', is_nullable: 'NO', column_default: 'false' }, 'the flag column: boolean, not null, false by default')

// The 60k: 3% from June, interest on the original principal.
await as(APPROVER)
await q(`select public.amend_fund_source_from($1, '2026-06-15', 0.03, null, null, ' 6月起3%，按原本金 ', false, true)`, [FS60])
await as(null)
check(await q(`select to_char(valid_from, 'YYYY-MM') vf, to_char(valid_to, 'YYYY-MM') vt, rate::text, months, reason, next_interest_on_original flag
                 from treasury_terms_history where record_id = $1`, [FS60]),
  [{ vf: '2026-05', vt: '2026-05', rate: '0.035000', months: 6, reason: '6月起3%，按原本金', flag: true }],
  '60k: May closed at 3.5% × 6, and the row says the segment after it is on the original principal')
check(await q(`select cost_rate::text, lock_in_months, to_char(terms_effective_from, 'YYYY-MM-DD') tef from fund_sources where id = $1`, [FS60]),
  [{ cost_rate: '0.030000', lock_in_months: 5, tef: '2026-06-01' }],
  '60k: 3% from June, the 5 months left to October')
check((await q(`select tabs, actions from guard_calls`)).at(-1), { tabs: ['/fund-in'], actions: ['treasury.approve'] }, 'the Fund IN tab is asked to be open')

// The 58k through the form's own call (the app always sends the flag) and a change that leaves it off.
await as(APPROVER)
await q(`select public.amend_fund_source_from(p_fund_source_id => $1, p_effective_from => '2026-06-01', p_cost_rate => 0.03,
                 p_remaining_months => null, p_compound_interest => null, p_reason => null, p_no_fixed_term => false, p_interest_on_original => true)`, [FS58])
await q(`select public.amend_fund_source_from($1, '2026-08-01', 0.025, null, null, null)`, [FS58])
await as(null)
check(await q(`select to_char(valid_from, 'YYYY-MM') vf, to_char(valid_to, 'YYYY-MM') vt, rate::text, months, next_interest_on_original flag
                 from treasury_terms_history where record_id = $1 order by valid_from`, [FS58]),
  [
    { vf: '2026-05', vt: '2026-05', rate: '0.035000', months: 6, flag: true },
    { vf: '2026-06', vt: '2026-07', rate: '0.030000', months: 5, flag: false },
  ],
  '58k: each change writes its own flag — left out, the next segment re-bases as before')
check(await q(`select lock_in_months, to_char(terms_effective_from, 'YYYY-MM') tef from fund_sources where id = $1`, [FS58]),
  [{ lock_in_months: 3, tef: '2026-08' }], '58k: the second change runs to October as before')

// A loan says it the same way.
await as(APPROVER)
await q(`select public.amend_loan_from($1, '2026-06-01', 0.03, null, null, null, false, true)`, [LOAN])
await as(null)
check(await q(`select record_kind, to_char(valid_to, 'YYYY-MM') vt, rate::text, next_interest_on_original flag from treasury_terms_history where record_id = $1`, [LOAN]),
  [{ record_kind: 'loan', vt: '2026-05', rate: '0.035000', flag: true }], 'a loan: the flag on its history row')
check(await q(`select effective_rate::text, tenure_months, to_char(terms_effective_from, 'YYYY-MM') tef from loans where id = $1`, [LOAN]),
  [{ effective_rate: '0.030000', tenure_months: 5, tef: '2026-06' }], 'a loan: 3% from June, 5 months left')

// Without Treasury · Approve, nothing.
await as(CLERK)
await refuses(`select public.amend_fund_source_from($1, '2026-09-01', 0.02, null, null, null, false, true)`, [FS60], /needs Treasury · Approve/, 'Create only is refused (fund source)')
await refuses(`select public.amend_loan_from($1, '2026-09-01', 0.03, null, null, null, false, true)`, [LOAN], /needs Treasury · Approve/, 'Create only is refused (loan)')
await as(null)
check((await q(`select count(*)::int n from treasury_terms_history`))[0].n, 4, 'the refused calls wrote nothing')

console.log(`validate-terms-interest-on-original: ${checks} checks passed`)
