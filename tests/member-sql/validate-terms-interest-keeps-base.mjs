// Local PostgreSQL regression for 20261025100000 (2026-10-24, 「从某月起生效」 · 利息照之前的本金算 — the user, on BI#7:
// "10 月起利息照旧每月 424.83（按 1 月的 51,000 算），不管之后还了多少本金"). A change from a month on may keep the
// interest on the base the terms before it used; the amend RPCs write that onto the history row they file
// (next_interest_keeps_base, describing the segment AFTER it), and refuse a change that asks for both that and the
// original principal. 20261024100000 (the RPCs it replaces) then the migration are applied VERBATIM over stand-in
// tables; driven as the treasury approver, as somebody without Approve, and checked for who may call. No live I/O.
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
const BI7 = '00000000-0000-4000-8000-000000000007'
const LOAN = '00000000-0000-4000-8000-000000000001'
const SIG9 = (name) => `public.${name}(uuid,date,numeric,integer,boolean,text,boolean,boolean,boolean)`

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
  create function public.tab_write_guard(p_tabs text[], p_actions text[]) returns void language sql as $$ select $$;
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
  create table public.treasury_terms_history (
    id uuid primary key default gen_random_uuid(),
    record_kind text not null check (record_kind in ('loan', 'fund_source')), record_id uuid not null,
    valid_from date not null, valid_to date not null, rate numeric(12, 6) not null, months integer,
    compound_interest boolean not null default false, was_effective_from date, was_maturity_date date,
    reason text, created_by uuid, created_at timestamptz not null default now(), was_repayment_terms text,
    check (valid_to >= valid_from));
  grant select, insert, update, delete on all tables in schema public to authenticated;
  -- The 7-argument RPCs 20261024100000 drops.
  create function public.amend_fund_source_from(uuid, date, numeric, integer, boolean, text, boolean default false) returns void language sql as $$ select $$;
  create function public.amend_loan_from(uuid, date, numeric, integer, boolean, text, boolean default false) returns void language sql as $$ select $$;

  -- BI#7 as it stood before the 2026-10-24 change: 60,000 from 5 Apr 2025, 0.5% × 60; a loan the same.
  insert into public.fund_sources (id, status, amount, cost_rate, lock_in_months, effective_date) values
    ('${BI7}', 'active', 60000, 0.005, 60, '2025-04-05');
  insert into public.loans (id, status, principal, effective_rate, tenure_months, disbursement_date, repayment_terms) values
    ('${LOAN}', 'active', 60000, 0.005, 60, '2025-04-05', 'EMI');
`)

await db.exec(await text(new URL('20261024100000_terms_interest_on_original.sql', migrations)))
await db.exec(await text(new URL('20261025100000_terms_interest_keeps_base.sql', migrations)))

check((await q(`select p.oid::regprocedure::text s from pg_proc p where p.proname in ('amend_fund_source_from', 'amend_loan_from') order by 1`)).map(r => r.s),
  ['amend_fund_source_from(uuid,date,numeric,integer,boolean,text,boolean,boolean,boolean)', 'amend_loan_from(uuid,date,numeric,integer,boolean,text,boolean,boolean,boolean)'],
  'one 9-argument RPC each; the 8-argument ones are gone')
for (const name of ['amend_fund_source_from', 'amend_loan_from']) {
  const [g] = await q(`select has_function_privilege('anon', $1, 'execute') anon, has_function_privilege('authenticated', $1, 'execute') auth,
                              has_function_privilege('service_role', $1, 'execute') svc, p.prosecdef definer
                         from pg_proc p where p.oid = $1::regprocedure`, [SIG9(name)])
  check(g, { anon: false, auth: true, svc: true, definer: true }, `${name}: DEFINER, signed-in and service only`)
}
const [col] = await q(`select data_type, is_nullable, column_default from information_schema.columns where table_name = 'treasury_terms_history' and column_name = 'next_interest_keeps_base'`)
check(col, { data_type: 'boolean', is_nullable: 'NO', column_default: 'false' }, 'the flag column: boolean, not null, false by default')

// BI#7 as the user wants it: January re-bases at 0.833%, 51 months left (1,000 a month); October drops the term
// and keeps the interest on January's base.
await as(APPROVER)
await q(`select public.amend_fund_source_from($1, '2026-01-01', 0.00833, 51, null, 'Recalculate Interest')`, [BI7])
await q(`select public.amend_fund_source_from(p_fund_source_id => $1, p_effective_from => '2026-10-01', p_cost_rate => null, p_remaining_months => null,
                 p_compound_interest => null, p_reason => '10月起无固定期限，利息照1月的51,000算', p_no_fixed_term => true, p_interest_keeps_base => true)`, [BI7])
await as(null)
check(await q(`select to_char(valid_from, 'YYYY-MM') vf, to_char(valid_to, 'YYYY-MM') vt, rate::text, months, next_interest_on_original orig, next_interest_keeps_base kept
                 from treasury_terms_history where record_id = $1 order by valid_from`, [BI7]),
  [
    { vf: '2025-05', vt: '2025-12', rate: '0.005000', months: 60, orig: false, kept: false },
    { vf: '2026-01', vt: '2026-09', rate: '0.008330', months: 51, orig: false, kept: true },
  ],
  'BI#7: 2025 at 0.5% × 60, then 0.833% × 51 — and October keeps the interest on its base')
check(await q(`select cost_rate::text, lock_in_months, to_char(terms_effective_from, 'YYYY-MM') tef, maturity_date from fund_sources where id = $1`, [BI7]),
  [{ cost_rate: '0.008330', lock_in_months: null, tef: '2026-10', maturity_date: null }],
  'BI#7: no fixed term from October, the rate as it was')

// One choice, never both.
await as(APPROVER)
await refuses(`select public.amend_fund_source_from($1, '2026-11-01', null, null, null, null, false, true, true)`, [BI7], /one, not both/, 'a fund source change asking for both is refused')
await refuses(`select public.amend_loan_from($1, '2026-06-01', null, null, null, null, false, true, true)`, [LOAN], /one, not both/, 'a loan change asking for both is refused')
// A loan says it the same way.
await q(`select public.amend_loan_from($1, '2026-01-01', 0.00833, 51, null, null)`, [LOAN])
await q(`select public.amend_loan_from($1, '2026-10-01', null, null, null, null, true, false, true)`, [LOAN])
await as(null)
check(await q(`select to_char(valid_from, 'YYYY-MM') vf, next_interest_keeps_base kept from treasury_terms_history where record_id = $1 order by valid_from`, [LOAN]),
  [{ vf: '2025-05', kept: false }, { vf: '2026-01', kept: true }], 'a loan: the flag on the row its October change files')
check(await q(`select tenure_months, to_char(terms_effective_from, 'YYYY-MM') tef, repayment_terms from loans where id = $1`, [LOAN]),
  // tenure_months is NOT NULL on loans: it keeps the months left (51 − 9); the 未定 marker is what says "no fixed term".
  [{ tenure_months: 42, tef: '2026-10', repayment_terms: 'EMI · 未定还款(自 2026-10 起)' }], 'a loan: no fixed term from October, as before')

// Without Treasury · Approve, nothing.
await as(CLERK)
await refuses(`select public.amend_fund_source_from($1, '2026-11-01', 0.01, null, null, null, false, false, true)`, [BI7], /needs Treasury · Approve/, 'Create only is refused (fund source)')
await refuses(`select public.amend_loan_from($1, '2026-11-01', 0.01, null, null, null, false, false, true)`, [LOAN], /needs Treasury · Approve/, 'Create only is refused (loan)')
await as(null)
check((await q(`select count(*)::int n from treasury_terms_history`))[0].n, 4, 'the refused calls wrote nothing')

console.log(`validate-terms-interest-keeps-base: ${checks} checks passed`)
