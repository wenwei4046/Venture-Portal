// Local PostgreSQL regression for 20261025110000 (2026-10-24 — the user: "finance manager 可以改条款，但是经过principal
// approve 不就可以了？", shown it as filed / approved / applied → "可以"). Treasury · Edit files a deal's terms change for
// the Principal (file_terms_change): a request row and an approval request, the deal untouched. The Principal approves
// it (approve_terms_change) — the amend RPC applies it then, in the same transaction, or nothing is approved — or turns
// it down (reject_terms_change); whoever filed it may withdraw it (withdraw_terms_change). One waits at a time per deal.
// 20261024100000 and 20261025100000 (the amend RPCs it applies through) then the migration are applied VERBATIM over
// stand-in tables; driven as Finance (Edit), as Finance without Edit, as another Finance hand, and as the Principal.
// No live I/O.
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

const PRINCIPAL = '00000000-0000-0000-0000-0000000000aa' // the queue's Approve, every Treasury action
const FINANCE = '00000000-0000-0000-0000-0000000000ab'   // Treasury · View, Create, Edit — the Finance Manager
const OTHER = '00000000-0000-0000-0000-0000000000ac'     // Treasury · Edit too, did not file it
const VIEWER = '00000000-0000-0000-0000-0000000000ad'    // Treasury · View only
const ACTIONS = {
  [PRINCIPAL]: 'approvals.approve,treasury.view,treasury.create,treasury.edit,treasury.approve',
  [FINANCE]: 'treasury.view,treasury.create,treasury.edit',
  [OTHER]: 'treasury.view,treasury.edit',
  [VIEWER]: 'treasury.view',
}
const BI7 = '00000000-0000-4000-8000-000000000007'
const LO7 = '00000000-0000-4000-8000-000000000017'
const DONE = '00000000-0000-4000-8000-000000000099'
const LIANG = '00000000-0000-4000-8000-0000000000d1'
const CONT = '00000000-0000-4000-8000-0000000000c1'

async function as(user) {
  await db.exec('RESET ROLE')
  await q(`select set_config('request.jwt.claim.sub', $1, false), set_config('test.actions', $2, false)`, [user ?? '', ACTIONS[user] ?? ''])
  if (user) await db.exec('SET ROLE authenticated')
}
const file = (args) =>
  q(`select public.file_terms_change(p_record_kind => $1, p_record_id => $2, p_effective_from => $3, p_rate => $4, p_remaining_months => $5,
       p_compound_interest => null, p_no_fixed_term => $6, p_interest_on_original => false, p_interest_keeps_base => $7, p_reason => $8) id`,
    [args.kind, args.id, args.from, args.rate ?? null, args.months ?? null, args.noTerm ?? false, args.keeps ?? false, args.reason ?? null])

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
  create function public.has_scope(p_scopes text[]) returns boolean language sql stable as $$ select true $$;
  create function public.tab_write_guard(p_tabs text[], p_actions text[]) returns void language sql as $$ select $$;
  create function public.terms_months_between(a date, b date) returns integer language sql immutable as $$
    select (extract(year from b)::int - extract(year from a)::int) * 12 + (extract(month from b)::int - extract(month from a)::int)
  $$;
  create table public.permission_table_reads (table_name text primary key, actions text[] not null);
  create function public.permission_reads_guard(p_table text) returns integer language sql as $$ select 1 $$;
  create table public.audit_tables (table_name text primary key, mode text, reason text);
  create function public.audit_register(p_table text, p_label text, p_area text, p_read text[], p_mode text default 'all',
    p_keys text[] default '{}', p_labels text[] default '{}', p_ignore text[] default '{}', p_omit text[] default '{}',
    p_diff boolean default false, p_salary text[] default '{}', p_nric text[] default '{}', p_bank text[] default '{}',
    p_needs text default null, p_actor_column text default null, p_reason text default null) returns text language sql as
    $$ insert into public.audit_tables values (p_table, p_mode, p_reason) on conflict (table_name) do update set mode = excluded.mode returning table_name $$;

  create table public.users (id uuid primary key, name text);
  insert into public.users values ('${PRINCIPAL}', 'Principal'), ('${FINANCE}', 'Finance Manager'), ('${OTHER}', 'Other hand'), ('${VIEWER}', 'Viewer');
  create table public.companies (id uuid primary key, name text, short_code text);
  create table public.directors (id uuid primary key, name text, code text);
  create table public.departments (id uuid primary key, name text);
  insert into public.directors values ('${LIANG}', 'Lim Wei Liang', 'LWL');
  insert into public.companies values ('${CONT}', 'The Cont', 'CONT');

  create table public.fund_sources (
    id uuid primary key, status text not null, amount numeric not null, cost_rate numeric(8,6) not null,
    lock_in_months integer, compound_interest boolean default false, effective_date date, repayment_start_month date,
    maturity_date date, terms_effective_from date, updated_at timestamptz,
    from_company_id uuid, from_director_id uuid, from_department_id uuid, from_freetext_name text, notes text);
  create table public.loans (
    id uuid primary key, status text not null, principal numeric not null, effective_rate numeric(8,6) not null,
    base_rate numeric(8,6) not null default 0, risk_premium numeric(8,6) not null default 0, tenure_months integer,
    compound_interest boolean default false, disbursement_date date, repayment_start_month date,
    terms_effective_from date, repayment_terms text, updated_at timestamptz, company_id uuid);
  create table public.treasury_terms_history (
    id uuid primary key default gen_random_uuid(),
    record_kind text not null check (record_kind in ('loan', 'fund_source')), record_id uuid not null,
    valid_from date not null, valid_to date not null, rate numeric(12, 6) not null, months integer,
    compound_interest boolean not null default false, was_effective_from date, was_maturity_date date,
    reason text, created_by uuid, created_at timestamptz not null default now(), was_repayment_terms text,
    check (valid_to >= valid_from));

  -- The queue, as production's: its types (terms_change not yet one), its statuses.
  create type public.approval_request_type as enum ('new_loan', 'tier_change', 'payment_voucher', 'new_fund_source', 'loan_cancel');
  create type public.approval_status as enum ('pending', 'approved', 'rejected');
  create type public.approval_workflow_state as enum ('submitted', 'under_review', 'needs_info', 'delegated', 'approved', 'rejected', 'expired');
  create table public.approval_requests (
    id uuid primary key default gen_random_uuid(), request_type approval_request_type not null, reference_id uuid not null,
    reference_table text not null, submitted_by uuid not null, description text, amount numeric,
    status approval_status not null default 'pending', workflow_state approval_workflow_state not null default 'submitted',
    approved_by uuid, approved_at timestamptz, notes text, created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(), group_id uuid);
  -- Who may decide one: the queue's Approve (the Principal) — production's approver_may_request, for this test.
  create function public.approver_may_request(p_user uuid, p_approval_id uuid) returns boolean language sql stable as
    $$ select p_user = auth.uid() and public.has_any_action(array['approvals.approve']) $$;

  grant select, insert, update, delete on all tables in schema public to authenticated;
  -- The 7-argument RPCs 20261024100000 drops.
  create function public.amend_fund_source_from(uuid, date, numeric, integer, boolean, text, boolean default false) returns void language sql as $$ select $$;
  create function public.amend_loan_from(uuid, date, numeric, integer, boolean, text, boolean default false) returns void language sql as $$ select $$;

  -- BI#7 as it stands: 60,000 from 5 Apr 2025 at 0.5% × 60, re-stated from January at 0.833% × 51 (below).
  -- LO#7 the same, a loan to The Cont. And a fund source already repaid.
  insert into public.fund_sources (id, status, amount, cost_rate, lock_in_months, effective_date, from_director_id, notes) values
    ('${BI7}', 'active', 60000, 0.005, 60, '2025-04-05', '${LIANG}', '[BI#7]'),
    ('${DONE}', 'repaid', 10000, 0.01, 10, '2025-01-01', '${LIANG}', null);
  insert into public.loans (id, status, principal, effective_rate, base_rate, tenure_months, disbursement_date, repayment_terms, company_id) values
    ('${LO7}', 'active', 60000, 0.005, 0.003, 60, '2025-04-05', '[LO#7] EMI', '${CONT}');
`)

await db.exec(await text(new URL('20261024100000_terms_interest_on_original.sql', migrations)))
await db.exec(await text(new URL('20261025100000_terms_interest_keeps_base.sql', migrations)))
// January's re-statement, as production holds it.
await as(PRINCIPAL)
await q(`select public.amend_fund_source_from($1, '2026-01-01', 0.00833, 51, null, 'Recalculate Interest')`, [BI7])
await q(`select public.amend_loan_from($1, '2026-01-01', 0.00833, 51, null, null)`, [LO7])
await as(null)

await db.exec(await text(new URL('20261025110000_terms_change_requests.sql', migrations)))

// ── What the migration leaves ──
check((await q(`select enumlabel from pg_enum e join pg_type t on t.oid = e.enumtypid where t.typname = 'approval_request_type' and enumlabel = 'terms_change'`)).length, 1,
  'terms_change is a request type')
for (const sig of ['file_terms_change(text,uuid,date,numeric,integer,boolean,boolean,boolean,boolean,text)', 'approve_terms_change(uuid,text)', 'reject_terms_change(uuid,text)', 'withdraw_terms_change(uuid)']) {
  const [g] = await q(`select has_function_privilege('anon', $1, 'execute') anon, has_function_privilege('authenticated', $1, 'execute') auth,
                              has_function_privilege('service_role', $1, 'execute') svc, p.prosecdef definer
                         from pg_proc p where p.oid = $1::regprocedure`, [`public.${sig}`])
  check(g, { anon: false, auth: true, svc: true, definer: true }, `${sig}: DEFINER, signed-in and service only`)
}
const [priv] = await q(`select has_table_privilege('authenticated', 'treasury_terms_requests', 'select') sel,
                               has_table_privilege('authenticated', 'treasury_terms_requests', 'insert') ins,
                               has_table_privilege('authenticated', 'treasury_terms_requests', 'update') upd,
                               has_table_privilege('anon', 'treasury_terms_requests', 'select') anon,
                               (select relrowsecurity from pg_class where relname = 'treasury_terms_requests') rls`)
check(priv, { sel: true, ins: false, upd: false, anon: false, rls: true }, 'the requests: read by the signed in under row security, written only by the RPCs')
check(await q(`select actions from permission_table_reads where table_name = 'treasury_terms_requests'`), [{ actions: ['treasury.approve', 'treasury.edit', 'treasury.view'] }],
  'its reads ask for the action (permission_table_reads)')
check(await q(`select mode from audit_tables where table_name = 'treasury_terms_requests'`), [{ mode: 'none' }], 'registered with the audit, not recorded twice')

// ── Finance files BI#7's October change: no fixed term, the interest kept on January's 51,000 ──
await as(FINANCE)
const [{ id: req1 }] = await file({ kind: 'fund_source', id: BI7, from: '2026-10-15', noTerm: true, keeps: true, reason: '10月起无固定期限，利息照1月的51,000算' })
await as(null)
check(await q(`select status, to_char(effective_from, 'YYYY-MM-DD') ef, rate, remaining_months, no_fixed_term, interest_keeps_base, created_by::text by,
                      approval_id is not null linked from treasury_terms_requests where id = $1`, [req1]),
  [{ status: 'pending', ef: '2026-10-01', rate: null, remaining_months: null, no_fixed_term: true, interest_keeps_base: true, by: FINANCE, linked: true }],
  'the request: pending, from the month start, what was asked')
check(await q(`select a.request_type::text t, a.reference_table, a.reference_id::text ref, a.submitted_by::text by, a.status::text st, a.workflow_state::text ws,
                      a.amount::text amount, a.description from approval_requests a join treasury_terms_requests r on r.approval_id = a.id where r.id = $1`, [req1]),
  [{ t: 'terms_change', reference_table: 'fund_sources', ref: BI7, by: FINANCE, st: 'pending', ws: 'submitted', amount: '60000',
     description: 'Change terms · Lim Wei Liang [BI#7] · RM 60,000.00 · from 2026-10 · no fixed term · interest on the principal it was on before' }],
  'its approval request: the deal, who filed it, the queue’s title')
check(await q(`select cost_rate::text, lock_in_months, to_char(terms_effective_from, 'YYYY-MM') tef from fund_sources where id = $1`, [BI7]),
  [{ cost_rate: '0.008330', lock_in_months: 51, tef: '2026-01' }], 'filed, the deal is as it was')
check((await q(`select count(*)::int n from treasury_terms_history where record_id = $1`, [BI7]))[0].n, 1, 'no history row yet')

// One waiting at a time; a month after the current terms'; Treasury · Edit; an active deal.
await as(FINANCE)
await refuses(`select public.file_terms_change('fund_source', $1, '2026-11-01')`, [BI7], /already waiting/, 'a second one while one waits is refused')
await refuses(`select public.file_terms_change('loan', $1, '2026-01-01')`, [LO7], /must be after the month the current terms took effect \(2026-01\)/, 'a month not after the current terms’ is refused')
await refuses(`select public.file_terms_change('fund_source', $1, '2026-11-01')`, [DONE], /Only an active deal/, 'a repaid deal is refused')
await refuses(`select public.file_terms_change('loan', $1, '2026-11-01', null, null, null, false, true, true)`, [LO7], /one, not both/, 'both interest bases are refused')
await refuses(`select public.file_terms_change('loan', $1, '2026-11-01', 1.2)`, [LO7], /Rate must be between/, 'a rate of 120% is refused')
await refuses(`select public.file_terms_change('loan', $1, '2026-11-01', 0.002)`, [LO7], /Rate 0\.200% is below the loan's base rate 0\.300%/,
  'a loan’s rate under its base rate is refused at filing, as the amend would refuse it at approval')
await as(VIEWER)
await refuses(`select public.file_terms_change('loan', $1, '2026-11-01', 0.004)`, [LO7], /needs Treasury · Edit/, 'without Treasury · Edit nobody files')
// Finance cannot decide it — nor write the tables round the RPCs.
await as(FINANCE)
const [{ approval_id: ap1 }] = await q(`select approval_id from treasury_terms_requests where id = $1`, [req1])
await refuses(`select public.approve_terms_change($1)`, [ap1], /may not decide this request/, 'Finance does not approve its own filing')
await refuses(`select public.reject_terms_change($1)`, [ap1], /may not decide this request/, 'nor reject it')
await refuses(`insert into treasury_terms_requests (record_kind, record_id, effective_from) values ('loan', $1, '2026-12-01')`, [LO7], /permission denied/, 'the table is not written straight')
await as(null)

// ── The Principal approves it: applied by the amend, both rows approved ──
await as(PRINCIPAL)
await q(`select public.approve_terms_change($1, 'ok')`, [ap1])
await as(null)
check(await q(`select to_char(valid_from, 'YYYY-MM') vf, to_char(valid_to, 'YYYY-MM') vt, rate::text, months, next_interest_keeps_base kept, created_by::text by, reason
                 from treasury_terms_history where record_id = $1 order by valid_from`, [BI7]),
  [
    { vf: '2025-05', vt: '2025-12', rate: '0.005000', months: 60, kept: false, by: PRINCIPAL, reason: 'Recalculate Interest' },
    { vf: '2026-01', vt: '2026-09', rate: '0.008330', months: 51, kept: true, by: PRINCIPAL, reason: '10月起无固定期限，利息照1月的51,000算 （提交：Finance Manager）' },
  ],
  'approved: January’s terms closed in September, October keeps their base — filed by Finance, applied as the Principal')
check(await q(`select cost_rate::text, lock_in_months, to_char(terms_effective_from, 'YYYY-MM') tef from fund_sources where id = $1`, [BI7]),
  [{ cost_rate: '0.008330', lock_in_months: null, tef: '2026-10' }], 'BI#7: no fixed term from October')
check(await q(`select a.status::text st, a.workflow_state::text ws, a.approved_by::text by, a.approved_at is not null at, a.notes,
                      r.status rs, r.decided_by::text rby, r.decision_note from approval_requests a join treasury_terms_requests r on r.approval_id = a.id where r.id = $1`, [req1]),
  [{ st: 'approved', ws: 'approved', by: PRINCIPAL, at: true, notes: 'ok', rs: 'approved', rby: PRINCIPAL, decision_note: 'ok' }], 'both rows approved, by the Principal')
await as(PRINCIPAL)
await refuses(`select public.approve_terms_change($1)`, [ap1], /already decided/, 'approved once only')
await as(null)
// A fund source has no base rate: a low rate is filed (then taken back).
await as(FINANCE)
const [{ id: low }] = await file({ kind: 'fund_source', id: BI7, from: '2026-11-01', rate: 0.002 })
await q(`select public.withdraw_terms_change($1)`, [low])
await as(null)
check((await q(`select rate::text, status from treasury_terms_requests where id = $1`, [low]))[0], { rate: '0.002000', status: 'withdrawn' }, 'a fund source’s low rate is filed — no base rate to ask')

// ── LO#7: filed, turned down — the loan untouched ──
await as(FINANCE)
const [{ id: req2 }] = await file({ kind: 'loan', id: LO7, from: '2026-11-01', rate: 0.04, months: 12, reason: '4% from November' })
await as(null)
check((await q(`select a.description from approval_requests a join treasury_terms_requests r on r.approval_id = a.id where r.id = $1`, [req2]))[0].description,
  'Change terms · The Cont [LO#7] · RM 60,000.00 · from 2026-11 · 4.000%/mo · 12 months left', 'a loan’s title: the borrower, its tag, the ask')
const [{ approval_id: ap2 }] = await q(`select approval_id from treasury_terms_requests where id = $1`, [req2])
await as(PRINCIPAL)
await q(`select public.reject_terms_change($1, 'Not yet — wait for the new agreement')`, [ap2])
await as(null)
check(await q(`select a.status::text st, a.workflow_state::text ws, a.notes, r.status rs, r.decision_note from approval_requests a join treasury_terms_requests r on r.approval_id = a.id where r.id = $1`, [req2]),
  [{ st: 'rejected', ws: 'rejected', notes: 'Not yet — wait for the new agreement', rs: 'rejected', decision_note: 'Not yet — wait for the new agreement' }], 'turned down: both rows, the Principal’s words kept')
check(await q(`select effective_rate::text, tenure_months, to_char(terms_effective_from, 'YYYY-MM') tef from loans where id = $1`, [LO7]),
  [{ effective_rate: '0.008330', tenure_months: 51, tef: '2026-01' }], 'turned down, the loan is as it was')

// ── Withdrawn by whoever filed it — not by another hand ──
await as(FINANCE)
const [{ id: req3 }] = await file({ kind: 'loan', id: LO7, from: '2026-11-01', rate: 0.04 })
await as(OTHER)
await refuses(`select public.withdraw_terms_change($1)`, [req3], /only whoever filed it/, 'another Finance hand may not withdraw it')
await as(FINANCE)
await q(`select public.withdraw_terms_change($1)`, [req3])
await as(null)
check(await q(`select r.status rs, a.status::text st, a.notes from treasury_terms_requests r join approval_requests a on a.id = r.approval_id where r.id = $1`, [req3]),
  [{ rs: 'withdrawn', st: 'rejected', notes: 'Withdrawn by whoever filed it' }], 'withdrawn: the request, its approval closed')
await as(FINANCE)
await refuses(`select public.withdraw_terms_change($1)`, [req3], /no longer waiting/, 'withdrawn once only')
const [{ id: req4 }] = await file({ kind: 'loan', id: LO7, from: '2026-11-01', rate: 0.004 })
await as(null)
check((await q(`select status from treasury_terms_requests where id = $1`, [req4]))[0].status, 'pending', 'once withdrawn, another may be filed')

// ── The deal changed since: approving refuses, and nothing is approved ──
await as(PRINCIPAL)
await q(`select public.amend_loan_from($1, '2026-12-01', 0.005, null, null, 'the Principal, directly')`, [LO7])
const [{ approval_id: ap4 }] = await q(`select approval_id from treasury_terms_requests where id = $1`, [req4])
await refuses(`select public.approve_terms_change($1)`, [ap4], /must be after the month the current terms took effect \(2026-12\)/, 'a change the deal has moved past is refused')
await as(null)
check(await q(`select r.status rs, a.status::text st from treasury_terms_requests r join approval_requests a on a.id = r.approval_id where r.id = $1`, [req4]),
  [{ rs: 'pending', st: 'pending' }], 'refused, both rows still wait — the Principal turns it down instead')
check((await q(`select count(*)::int n from treasury_terms_history where record_id = $1`, [LO7]))[0].n, 2, 'and the refused approval wrote nothing')
// The Principal may withdraw it too.
await as(PRINCIPAL)
await q(`select public.withdraw_terms_change($1)`, [req4])
await as(null)
check(await q(`select r.status rs, a.notes from treasury_terms_requests r join approval_requests a on a.id = r.approval_id where r.id = $1`, [req4]),
  [{ rs: 'withdrawn', notes: 'Withdrawn by the Principal' }], 'the Principal may withdraw one — and its approval says so')

// ── 20261027140000: Finance files the whole terms too (2026-10-27, the mockup terms-first-month-mockup.html — "照这个样稿做：
// 名字用 “From the first instalment” 和 “From a later month”，Finance 提交时不改 Repayment start"). Chai Meng Keat's 5,000
// received 26 Mar 2026 at 0%, no fixed term: 0.833% asked from the first instalment. The whole-terms amends as production
// holds them (amend_fund_source / amend_loan), then the migration VERBATIM.
const MKD = '00000000-0000-4000-8000-0000000000d2'
const MK = '00000000-0000-4000-8000-000000000035'
await db.exec(`
  alter table public.fund_sources add column if not exists repayment_date date;
  insert into public.directors values ('${MKD}', 'Chai Meng Keat', 'MK');
  insert into public.fund_sources (id, status, amount, cost_rate, lock_in_months, effective_date, from_director_id) values
    ('${MK}', 'active', 5000, 0, null, '2026-03-26', '${MKD}');
  create function public.amend_fund_source(p_fund_source_id uuid, p_payload jsonb) returns void
  language plpgsql security definer set search_path = public as $$
  begin
    PERFORM public.tab_write_guard(ARRAY['/fund-in'], ARRAY['treasury.approve']);
    IF auth.uid() IS NOT NULL AND NOT public.has_any_action(ARRAY['treasury.approve']) THEN RAISE EXCEPTION 'amend_fund_source: needs Treasury · Approve' USING ERRCODE = '42501';
    end if;
    if not exists (select 1 from fund_sources where id = p_fund_source_id and status = 'active') then
      raise exception 'Fund source % is not active', p_fund_source_id;
    end if;
    update fund_sources set
      cost_rate         = coalesce((p_payload->>'cost_rate')::numeric, cost_rate),
      lock_in_months    = case when p_payload ? 'lock_in_months' then nullif(p_payload->>'lock_in_months', '')::int else lock_in_months end,
      repayment_date    = coalesce((p_payload->>'repayment_date')::date, repayment_date),
      maturity_date     = coalesce((p_payload->>'repayment_date')::date, maturity_date),
      compound_interest = coalesce((p_payload->>'compound_interest')::boolean, compound_interest),
      notes             = coalesce(p_payload->>'notes', notes),
      updated_at        = now()
    where id = p_fund_source_id;
  end $$;
  create function public.amend_loan(p_loan_id uuid, p_payload jsonb) returns void
  language plpgsql security definer set search_path = public as $$
  begin
    PERFORM public.tab_write_guard(ARRAY['/fund-out'], ARRAY['treasury.approve']);
    IF auth.uid() IS NOT NULL AND NOT public.has_any_action(ARRAY['treasury.approve']) THEN RAISE EXCEPTION 'amend_loan: needs Treasury · Approve' USING ERRCODE = '42501';
    end if;
    if not exists (select 1 from loans where id = p_loan_id and status = 'active') then
      raise exception 'Loan % is not active', p_loan_id;
    end if;
    update loans set
      effective_rate    = coalesce((p_payload->>'effective_rate')::numeric, effective_rate),
      risk_premium      = coalesce((p_payload->>'effective_rate')::numeric - base_rate, risk_premium),
      tenure_months     = coalesce((p_payload->>'tenure_months')::int, tenure_months),
      disbursement_date = coalesce((p_payload->>'disbursement_date')::date, disbursement_date),
      repayment_terms   = coalesce(p_payload->>'repayment_terms', repayment_terms),
      compound_interest = coalesce((p_payload->>'compound_interest')::boolean, compound_interest),
      updated_at        = now()
    where id = p_loan_id;
  end $$;
`)
await db.exec(await text(new URL('20261027140000_terms_change_whole_deal.sql', migrations)))

check((await q(`select count(*)::int n from pg_proc where proname = 'file_terms_change'`))[0].n, 1, 'one file_terms_change: the old signature is gone')
const SIG11 = 'file_terms_change(text,uuid,date,numeric,integer,boolean,boolean,boolean,boolean,text,boolean)'
const [g11] = await q(`select has_function_privilege('anon', $1, 'execute') anon, has_function_privilege('authenticated', $1, 'execute') auth,
                              has_function_privilege('service_role', $1, 'execute') svc, p.prosecdef definer
                         from pg_proc p where p.oid = $1::regprocedure`, [`public.${SIG11}`])
check(g11, { anon: false, auth: true, svc: true, definer: true }, `${SIG11}: DEFINER, signed-in and service only`)

const whole = (args) =>
  q(`select public.file_terms_change(p_record_kind => $1, p_record_id => $2, p_effective_from => $3, p_rate => $4, p_remaining_months => $5,
       p_compound_interest => null, p_no_fixed_term => $6, p_interest_keeps_base => $7, p_reason => $8, p_whole => true) id`,
    [args.kind, args.id, args.from ?? '2026-10-27', args.rate ?? null, args.months ?? null, args.noTerm ?? false, args.keeps ?? false, args.reason ?? null])

await as(FINANCE)
const [{ id: w1 }] = await whole({ kind: 'fund_source', id: MK, rate: 0.00833, noTerm: true, reason: '0.833% agreed from the start' })
await as(null)
check(await q(`select status, whole_deal, to_char(effective_from, 'YYYY-MM-DD') ef, rate::text, remaining_months, no_fixed_term from treasury_terms_requests where id = $1`, [w1]),
  [{ status: 'pending', whole_deal: true, ef: '2026-04-01', rate: '0.008330', remaining_months: null, no_fixed_term: true }],
  'the whole terms filed: from the first instalment — the month after the money came — whatever date was sent')
check((await q(`select a.description from approval_requests a join treasury_terms_requests r on r.approval_id = a.id where r.id = $1`, [w1]))[0].description,
  'Change terms · Chai Meng Keat · RM 5,000.00 · whole deal from 2026-04 · 0.833%/mo · no fixed term', 'its title says the whole deal')
check(await q(`select cost_rate::text, lock_in_months from fund_sources where id = $1`, [MK]), [{ cost_rate: '0.000000', lock_in_months: null }], 'filed, the deal is as it was')

await as(FINANCE)
await refuses(`select public.file_terms_change(p_record_kind => 'fund_source', p_record_id => $1, p_effective_from => '2026-10-27', p_interest_keeps_base => true, p_whole => true)`,
  [BI7], /chosen with a change from a later month/, 'the interest’s base belongs to a later month, not the whole terms')
await refuses(`select public.file_terms_change(p_record_kind => 'loan', p_record_id => $1, p_effective_from => '2026-10-27', p_no_fixed_term => true, p_whole => true)`,
  [LO7], /fixed term ends with a change from a later month/, 'a loan’s fixed term is not ended by the whole terms')
await as(null)

const [{ approval_id: wa1 }] = await q(`select approval_id from treasury_terms_requests where id = $1`, [w1])
await as(PRINCIPAL)
await q(`select public.approve_terms_change($1)`, [wa1])
await as(null)
check(await q(`select cost_rate::text, lock_in_months, terms_effective_from from fund_sources where id = $1`, [MK]),
  [{ cost_rate: '0.008330', lock_in_months: null, terms_effective_from: null }], 'approved: the whole terms at 0.833%, no fixed term — nothing split off')
check((await q(`select count(*)::int n from treasury_terms_history where record_id = $1`, [MK]))[0].n, 0, 'and no history row: the terms in force themselves changed')
check(await q(`select r.status rs, a.status::text st, a.approved_by::text by from treasury_terms_requests r join approval_requests a on a.id = r.approval_id where r.id = $1`, [w1]),
  [{ rs: 'approved', st: 'approved', by: PRINCIPAL }], 'both rows approved, by the Principal')

// LO#7, changed from December by the Principal above: its whole terms run from December — 0.6% over 24 months asked.
await as(FINANCE)
const [{ id: w2 }] = await whole({ kind: 'loan', id: LO7, rate: 0.006, months: 24 })
await as(null)
check(await q(`select to_char(effective_from, 'YYYY-MM') ef, remaining_months from treasury_terms_requests where id = $1`, [w2]), [{ ef: '2026-12', remaining_months: 24 }],
  'a loan changed before: the whole terms from when they began')
check((await q(`select a.description from approval_requests a join treasury_terms_requests r on r.approval_id = a.id where r.id = $1`, [w2]))[0].description,
  'Change terms · The Cont [LO#7] · RM 60,000.00 · whole deal from 2026-12 · 0.600%/mo · 24 months', 'a loan’s whole terms in its title')
const [{ approval_id: wa2 }] = await q(`select approval_id from treasury_terms_requests where id = $1`, [w2])
await as(PRINCIPAL)
await q(`select public.approve_terms_change($1)`, [wa2])
await as(null)
check(await q(`select effective_rate::text, risk_premium::text, tenure_months, to_char(terms_effective_from, 'YYYY-MM') tef from loans where id = $1`, [LO7]),
  [{ effective_rate: '0.006000', risk_premium: '0.003000', tenure_months: 24, tef: '2026-12' }], 'approved: LO#7’s terms in force at 0.6% over 24 months, its base rate kept')
check((await q(`select count(*)::int n from treasury_terms_history where record_id = $1`, [LO7]))[0].n, 2, 'its history as it was')

// A later month still files as before.
await as(FINANCE)
const [{ id: w3 }] = await file({ kind: 'fund_source', id: BI7, from: '2027-01-01', rate: 0.01 })
await as(null)
check(await q(`select whole_deal, to_char(effective_from, 'YYYY-MM') ef from treasury_terms_requests where id = $1`, [w3]), [{ whole_deal: false, ef: '2027-01' }],
  'a later month: not the whole terms, its own month')

// ── 20261027210000: Repayment type (2026-10-27 — the user: "本金支持每月固定金额或分几期，Amend terms 和新的 fund in /
// fund out 都一样" → the mockups → "照这个样稿做"). A fixed principal a month: its months clear what is owed when the terms
// start, the last taking the rest; one request carries BI#7's two changes — 0.833% from January at 1,000 a month, no
// fixed term from October with the interest kept on January's 51,000. The repayments the owed amount is read from are
// stand-ins; the migration VERBATIM.
const BX = '00000000-0000-4000-8000-0000000000b7'
const LX = '00000000-0000-4000-8000-0000000000b8'
await db.exec(`
  create type public.repayment_type as enum ('principal', 'interest', 'penalty', 'netting');
  create table public.fund_source_repayments (id uuid primary key default gen_random_uuid(), fund_source_id uuid, amount numeric, payment_type repayment_type, payment_date date);
  create table public.repayments (id uuid primary key default gen_random_uuid(), loan_id uuid, amount numeric, payment_type repayment_type, payment_date date);
  grant select on public.fund_source_repayments, public.repayments to authenticated;
  -- A BI#7 before either change: 60,000 from 5 Apr 2025 at 0.5% over 60, 1,000 repaid each month to September 2026.
  insert into public.fund_sources (id, status, amount, cost_rate, lock_in_months, effective_date, from_director_id, notes) values
    ('${BX}', 'active', 60000, 0.005, 60, '2025-04-05', '${LIANG}', '[BI#77]');
  insert into public.fund_source_repayments (fund_source_id, amount, payment_type, payment_date)
    select '${BX}', 1000, 'principal', d::date from generate_series('2025-04-20'::date, '2026-09-20'::date, interval '1 month') d;
  -- A loan of 58,000 from 15 Feb 2026 over 6 months, 10,000 repaid in March and April.
  insert into public.loans (id, status, principal, effective_rate, base_rate, risk_premium, tenure_months, disbursement_date, repayment_terms, company_id) values
    ('${LX}', 'active', 58000, 0.04, 0.003, 0.037, 6, '2026-02-15', '[LO#33] EMI', '${CONT}');
  insert into public.repayments (loan_id, amount, payment_type, payment_date) values
    ('${LX}', 10000, 'principal', '2026-03-15'), ('${LX}', 10000, 'principal', '2026-04-15'), ('${LX}', 2320, 'interest', '2026-03-15');
`)
// One waits per deal: BI#7's January-next-year request goes back first.
await as(FINANCE)
await q(`select public.withdraw_terms_change($1)`, [w3])
await as(null)
await db.exec(await text(new URL('20261027210000_repayment_type.sql', migrations)))

check((await q(`select count(*)::int n from pg_proc where proname in ('file_terms_change', 'amend_fund_source_from', 'amend_loan_from')`))[0].n, 3,
  'one of each: the old signatures are gone')
for (const sig of ['file_terms_change(text,uuid,date,numeric,integer,boolean,boolean,boolean,boolean,text,boolean,numeric,date)',
  'amend_fund_source_from(uuid,date,numeric,integer,boolean,text,boolean,boolean,boolean,numeric)', 'amend_loan_from(uuid,date,numeric,integer,boolean,text,boolean,boolean,boolean,numeric)']) {
  const [g] = await q(`select has_function_privilege('anon', $1, 'execute') anon, has_function_privilege('authenticated', $1, 'execute') auth, p.prosecdef definer
                         from pg_proc p where p.oid = $1::regprocedure`, [`public.${sig}`])
  check(g, { anon: false, auth: true, definer: true }, `${sig}: DEFINER, signed-in only`)
}
check((await q(`select has_function_privilege('authenticated', 'public.terms_principal_owed(text,uuid,date)', 'execute') auth`))[0].auth, false,
  'what is owed is read inside the amends only')

// ── BI#7 as one request, filed by Finance ──
const fileOne = (args) =>
  q(`select public.file_terms_change(p_record_kind => $1, p_record_id => $2, p_effective_from => $3, p_rate => $4, p_remaining_months => $5,
       p_no_fixed_term => $6, p_reason => $7, p_whole => $8, p_principal_per_month => $9, p_open_from => $10) id`,
    [args.kind, args.id, args.from ?? '2026-10-27', args.rate ?? null, args.months ?? null, args.noTerm ?? false, args.reason ?? null, args.whole ?? false, args.ppm ?? null, args.open ?? null])
await as(FINANCE)
await refuses(`select public.file_terms_change(p_record_kind => 'fund_source', p_record_id => $1, p_effective_from => '2026-01-01', p_remaining_months => 12, p_principal_per_month => 1000)`,
  [BX], /one of them/, 'an amount a month with months is refused')
await refuses(`select public.file_terms_change(p_record_kind => 'fund_source', p_record_id => $1, p_effective_from => '2026-01-01', p_no_fixed_term => true, p_principal_per_month => 1000)`,
  [BX], /one of them/, 'an amount a month with no fixed term is refused')
await refuses(`select public.file_terms_change(p_record_kind => 'fund_source', p_record_id => $1, p_effective_from => '2026-01-01', p_principal_per_month => 100)`,
  [BX], /At RM 100\.00 a month the RM 51,000\.00 owed takes 510 months — the most is 120/, 'an amount that takes past 120 months is refused, in figures')
await refuses(`select public.file_terms_change(p_record_kind => 'fund_source', p_record_id => $1, p_effective_from => '2026-01-01', p_principal_per_month => 1000, p_open_from => '2026-01-01')`,
  [BX], /has to come after the month the terms start \(2026-01\)/, 'the fixed term ends after the terms start, not with them')
await refuses(`select public.file_terms_change(p_record_kind => 'fund_source', p_record_id => $1, p_effective_from => '2026-01-01', p_no_fixed_term => true, p_open_from => '2026-10-01')`,
  [BX], /for terms that have one until then/, 'no fixed term from a later month needs a fixed term until then')
const [{ id: one }] = await fileOne({ kind: 'fund_source', id: BX, from: '2026-01-15', rate: 0.00833, ppm: 1000, open: '2026-10-20', reason: '0.833% from January, 1,000 a month until September' })
await as(null)
check(await q(`select to_char(effective_from, 'YYYY-MM-DD') ef, principal_per_month::text ppm, to_char(open_from, 'YYYY-MM-DD') open, remaining_months, no_fixed_term from treasury_terms_requests where id = $1`, [one]),
  [{ ef: '2026-01-01', ppm: '1000.00', open: '2026-10-01', remaining_months: null, no_fixed_term: false }], 'filed: the amount a month, and the month its fixed term ends, at month starts')
check((await q(`select a.description from approval_requests a join treasury_terms_requests r on r.approval_id = a.id where r.id = $1`, [one]))[0].description,
  'Change terms · Lim Wei Liang [BI#77] · RM 60,000.00 · from 2026-01 · 0.833%/mo · RM 1,000.00 a month · no fixed term from 2026-10', 'its title says both')
const [{ approval_id: oneAp }] = await q(`select approval_id from treasury_terms_requests where id = $1`, [one])
await as(PRINCIPAL)
await q(`select public.approve_terms_change($1)`, [oneAp])
await as(null)
check(await q(`select to_char(valid_from, 'YYYY-MM') vf, to_char(valid_to, 'YYYY-MM') vt, rate::text, months, principal_per_month::text ppm, next_interest_keeps_base kept
                 from treasury_terms_history where record_id = $1 order by valid_from`, [BX]),
  [
    { vf: '2025-05', vt: '2025-12', rate: '0.005000', months: 60, ppm: null, kept: false },
    { vf: '2026-01', vt: '2026-09', rate: '0.008330', months: 51, ppm: '1000.00', kept: true },
  ],
  'approved: January’s terms at 1,000 a month over the 51 months 51,000 takes, closed in September; October keeps their base')
check(await q(`select cost_rate::text, lock_in_months, principal_per_month, to_char(terms_effective_from, 'YYYY-MM') tef from fund_sources where id = $1`, [BX]),
  [{ cost_rate: '0.008330', lock_in_months: null, principal_per_month: null, tef: '2026-10' }], 'and from October no fixed term — the very deal the two changes made by hand')

// ── Applied at once (the Principal): a later month at an amount, kept, given way to months, undone ──
await as(PRINCIPAL)
await q(`select public.amend_loan_from($1, '2026-05-01', null, null, null, 'ten thousand a month', false, false, false, 10000)`, [LX])
check(await q(`select tenure_months, principal_per_month::text ppm, to_char(terms_effective_from, 'YYYY-MM') tef from loans where id = $1`, [LX]),
  [{ tenure_months: 4, ppm: '10000.00', tef: '2026-05' }], 'LO#33 from May at 10,000 a month: 38,000 owed takes 4 months — the interest paid is not principal')
await q(`select public.amend_loan_from($1, '2026-07-01', 0.05, null, null, 'the rate alone')`, [LX])
check(await q(`select tenure_months, principal_per_month::text ppm, effective_rate::text from loans where id = $1`, [LX]),
  [{ tenure_months: 4, ppm: '10000.00', effective_rate: '0.050000' }], 'a rate alone keeps the amount a month, its months counted again off what is owed')
check((await q(`select principal_per_month::text ppm from treasury_terms_history where record_id = $1 order by valid_from desc limit 1`, [LX]))[0].ppm, '10000.00',
  'the history keeps May’s amount a month')
await q(`select public.amend_loan_from($1, '2026-08-01', null, 3, null, 'three months')`, [LX])
check(await q(`select tenure_months, principal_per_month from loans where id = $1`, [LX]), [{ tenure_months: 3, principal_per_month: null }],
  'months asked: equal parts again, the amount a month gone')
await q(`select public.revert_terms_change('loan', $1)`, [LX])
check(await q(`select tenure_months, principal_per_month::text ppm, to_char(terms_effective_from, 'YYYY-MM') tef from loans where id = $1`, [LX]),
  [{ tenure_months: 4, ppm: '10000.00', tef: '2026-07' }], 'undone: the amount a month comes back with the rest')
await refuses(`select public.amend_loan_from($1, '2026-09-01', null, 6, null, null, false, false, false, 5000)`, [LX], /one of them/,
  'the amend refuses an amount a month with months too')

// The whole terms at an amount a month: the months off what the terms began on.
await q(`select public.amend_fund_source($1, '{"principal_per_month": 1250}')`, [MK])
check(await q(`select lock_in_months, principal_per_month::text ppm from fund_sources where id = $1`, [MK]), [{ lock_in_months: 4, ppm: '1250.00' }],
  'Chai Meng Keat’s 5,000 at 1,250 a month: 4 months')
await q(`select public.amend_fund_source($1, '{"lock_in_months": 10}')`, [MK])
check(await q(`select lock_in_months, principal_per_month from fund_sources where id = $1`, [MK]), [{ lock_in_months: 10, principal_per_month: null }],
  'months over the whole terms: the amount a month gone')
await refuses(`select public.amend_fund_source($1, '{"principal_per_month": 1000, "lock_in_months": 5}')`, [MK], /one of them/, 'not both at once')
await as(null)

// Filed whole at an amount a month, its fixed term ended later — approved through both amends.
await as(FINANCE)
const [{ id: two }] = await fileOne({ kind: 'fund_source', id: MK, whole: true, rate: 0.01, ppm: 500, open: '2026-07-01' })
await as(null)
check(await q(`select to_char(effective_from, 'YYYY-MM') ef, principal_per_month::text ppm, to_char(open_from, 'YYYY-MM') open from treasury_terms_requests where id = $1`, [two]),
  [{ ef: '2026-04', ppm: '500.00', open: '2026-07' }], 'the whole terms from the first instalment at 500 a month, no fixed term from July')
const [{ approval_id: twoAp }] = await q(`select approval_id from treasury_terms_requests where id = $1`, [two])
await as(PRINCIPAL)
await q(`select public.approve_terms_change($1)`, [twoAp])
await as(null)
check(await q(`select to_char(valid_from, 'YYYY-MM') vf, to_char(valid_to, 'YYYY-MM') vt, rate::text, months, principal_per_month::text ppm, next_interest_keeps_base kept
                 from treasury_terms_history where record_id = $1`, [MK]),
  [{ vf: '2026-04', vt: '2026-06', rate: '0.010000', months: 10, ppm: '500.00', kept: true }], 'approved: the whole terms at 500 a month to June, the interest kept from July')
check(await q(`select cost_rate::text, lock_in_months, principal_per_month, to_char(terms_effective_from, 'YYYY-MM') tef from fund_sources where id = $1`, [MK]),
  [{ cost_rate: '0.010000', lock_in_months: null, principal_per_month: null, tef: '2026-07' }], 'no fixed term from July')

console.log(`validate-terms-change-requests: ${checks} checks passed`)
