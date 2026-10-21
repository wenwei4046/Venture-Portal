// Local PostgreSQL regression for 20261021230000 (2026-10-21, a reversed payment takes its fund-source repayments with
// it — the user, shown HV-PV-202608-0295's Reverse payment leaving HOUZS Century's RM 98,000 fund source repaid:
// "A：一起删+重开").
// Approval writes a fund-source repayment voucher's rows into fund_source_repayments (payment_voucher_id) and
// check_fund_source_fully_repaid flips the source to repaid. Reverse payment deleted those rows through the session —
// and the table's only DELETE policy is fsr_no_delete USING (false): nothing went, nothing said so, the source stayed
// repaid and the corrected voucher was refused. Production's row policies and its two trigger bodies run here
// (fund-source-reversal-production.sql, md5-checked) over stand-in tables with the columns they read; the bug is shown
// first, then the migration is applied VERBATIM and its step is driven as the treasury, as nobody, and as the system.
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

const FINANCE = '00000000-0000-0000-0000-0000000000aa'   // finance@ — Treasury, Void among it
const VIEWER = '00000000-0000-0000-0000-0000000000ab'    // reads the treasury, may not void
const APPROVER = '00000000-0000-0000-0000-0000000000ac'  // the Principal who approved the vouchers
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const ACTIONS = {
  [FINANCE]: 'treasury.view,treasury.create,treasury.edit,treasury.void,treasury.export',
  [VIEWER]: 'treasury.view',
}

// As somebody signed in (their JWT's sub, their actions), or as the system (no JWT: the SQL editor, a migration).
async function as(user) {
  await db.exec('RESET ROLE')
  await q(`select set_config('request.jwt.claim.sub', $1, false), set_config('test.actions', $2, false)`,
    [user ?? '', ACTIONS[user] ?? ''])
  if (user) await db.exec('SET ROLE authenticated')
}
const asSystem = () => as(null)

await db.exec(`
  create role anon; create role authenticated; create role service_role; create role nobody;
  create schema auth;
  grant usage on schema auth to authenticated, anon, service_role;
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create type public.payment_voucher_status as enum ('draft', 'pending_approval', 'approved', 'paid', 'voided');
  create type public.fund_source_status as enum ('pending_approval', 'active', 'matured', 'repaid', 'cancelled');
  create type public.repayment_type as enum ('principal', 'interest', 'penalty', 'netting');

  -- The permission helpers, standing in: the signed-in user's actions are test.actions.
  create function public.has_any_action(p_actions text[]) returns boolean language sql stable as
    $$ select coalesce(string_to_array(nullif(current_setting('test.actions', true), ''), ',') && p_actions, false) $$;
  create function public.has_scope(p_scopes text[]) returns boolean language sql stable as
    $$ select exists (select 1 from unnest(string_to_array(nullif(current_setting('test.actions', true), ''), ',')) a
                      where split_part(a, '.', 1) = any (p_scopes)) $$;
  create function public.may_read(p_table text) returns boolean language sql stable as
    $$ select public.has_any_action(array['reports.export', 'reports.view', 'treasury.create', 'treasury.edit',
                                          'treasury.export', 'treasury.view', 'treasury.void']) $$;
  create function public.may_write(p_table text, p_command text) returns boolean language sql stable as
    $$ select public.has_any_action(array['treasury.create', 'treasury.edit', 'treasury.void']) $$;
  -- A box on the page unticked closes the write (test.tab_closed), as tab_write_guard does.
  create function public.tab_write_guard(p_pages text[], p_wants text[]) returns void language plpgsql as $$
  begin
    if current_setting('test.tab_closed', true) = 'on' then
      raise exception 'Not open to you on this page — a box in your permissions is unticked' using errcode = '42501';
    end if;
  end $$;

  create table public.fund_sources (id uuid primary key, amount numeric(15,2) not null,
    status public.fund_source_status not null default 'active', repaid_at timestamptz, repaid_by uuid);
  create table public.payment_vouchers (id uuid primary key, voucher_no text not null,
    status public.payment_voucher_status not null, fund_source_id uuid references public.fund_sources(id));
  create table public.fund_source_repayments (id uuid primary key default gen_random_uuid(),
    fund_source_id uuid not null references public.fund_sources(id), amount numeric not null,
    payment_type public.repayment_type not null, payment_date date not null, notes text, payment_voucher_id uuid,
    created_by uuid not null, created_at timestamptz not null default now());
  grant select, insert, update, delete on public.fund_sources, public.payment_vouchers, public.fund_source_repayments
    to authenticated;

  -- Production's row policies on the three tables (pg_policies, 2026-10-21).
  alter table public.fund_source_repayments enable row level security;
  create policy fsr_no_delete on public.fund_source_repayments for delete using (false);
  create policy fsr_insert on public.fund_source_repayments for insert with check ((select has_scope(array['treasury'])));
  create policy needs_action_insert on public.fund_source_repayments as restrictive for insert to authenticated
    with check ((select may_write('fund_source_repayments', 'INSERT')));
  create policy fsr_select on public.fund_source_repayments for select using ((select has_scope(array['treasury'])));
  create policy needs_action_select on public.fund_source_repayments as restrictive for select to authenticated
    using ((select may_read('fund_source_repayments')));
  create policy fsr_no_update on public.fund_source_repayments for update using (false);
  alter table public.fund_sources enable row level security;
  create policy fund_sources_no_delete on public.fund_sources for delete using (false);
  create policy fund_sources_pf_select on public.fund_sources for select using ((select has_scope(array['treasury'])));
  create policy fund_sources_finance_update on public.fund_sources for update using ((select has_scope(array['treasury'])));
  alter table public.payment_vouchers enable row level security;
  create policy pv_no_delete on public.payment_vouchers for delete using (false);
  create policy pv_select on public.payment_vouchers for select using ((select has_scope(array['treasury'])));
  create policy pv_update on public.payment_vouchers for update using ((select has_scope(array['treasury'])));
`)

await db.exec(await text(new URL('./fund-source-reversal-production.sql', import.meta.url)))
const md5 = async name => (await q(`select md5(prosrc) m from pg_proc where proname = $1`, [name]))[0].m
check(await md5('block_repayment_on_inactive_fund_source'), '5026355d3d289fc38705a345382e905e',
  "production's block_repayment_on_inactive_fund_source, as it was read")
check(await md5('check_fund_source_fully_repaid'), 'aad80bc4e1aba2cf3f8febfda63354b8',
  "production's check_fund_source_fully_repaid, as it was read")
await db.exec(`
  create trigger trg_block_inactive_fund_source_repayment before insert on public.fund_source_repayments
    for each row execute function block_repayment_on_inactive_fund_source();
  create trigger trg_fund_source_repayment_check after insert on public.fund_source_repayments
    for each row execute function check_fund_source_fully_repaid();
`)

// ── The book ────────────────────────────────────────────────────────────────────────────────────────────────────
// A: HOUZS Century's RM 98,000 (89b09736…), repaid in full by HV-PV-202608-0295 — 1,960 interest + 98,000 principal.
// B: a 60,000 deal two instalments in (20,000 + interest each), still active.
// C: 30,000 netted in full, then 5,000 more principal paid on a voucher; repaid.
// D: 10,000 — a voucher of interest, then a voucher of the whole principal; repaid.
const [A, B, C, D] = [id(1), id(2), id(3), id(4)]
const PV = { a: id(11), b1: id(12), b2: id(13), c: id(14), dInterest: id(15), dPrincipal: id(16), redo: id(17), draft: id(18) }
await asSystem()
await q(`insert into fund_sources (id, amount) values ($1, 98000), ($2, 60000), ($3, 30000), ($4, 10000)`, [A, B, C, D])
await q(`insert into payment_vouchers (id, voucher_no, status, fund_source_id) values
  ($1, 'HV-PV-202608-0295', 'paid', $9), ($2, 'HV-PV-202607-0149', 'paid', $10), ($3, 'HV-PV-202608-0312', 'paid', $10),
  ($4, 'HV-PV-202609-0001', 'paid', $11), ($5, 'HV-PV-202609-0002', 'paid', $12), ($6, 'HV-PV-202609-0003', 'paid', $12),
  ($7, 'HV-PV-202610-0901', 'paid', $9), ($8, 'HV-PV-202610-0902', 'draft', $9)`,
  [PV.a, PV.b1, PV.b2, PV.c, PV.dInterest, PV.dPrincipal, PV.redo, PV.draft, A, B, C, D])

// What approve_single_voucher writes (it runs as its owner): interest, penalty, then principal, each with the voucher.
const approve = async (voucher, source, { principal = 0, interest = 0, date = '2026-08-20' }) => {
  for (const [type, amount] of [['interest', interest], ['principal', principal]]) {
    if (amount > 0) {
      await q(`insert into fund_source_repayments (fund_source_id, amount, payment_type, payment_date, notes, payment_voucher_id, created_by)
               values ($1, $2, $3, $4, 'Auto-synced from voucher', $5, $6)`, [source, amount, type, date, voucher, APPROVER])
    }
  }
}
await approve(PV.a, A, { interest: 1960, principal: 98000 })
await approve(PV.b1, B, { interest: 1200, principal: 20000, date: '2026-07-14' })
await approve(PV.b2, B, { interest: 1000, principal: 20000, date: '2026-08-28' })
await q(`insert into fund_source_repayments (fund_source_id, amount, payment_type, payment_date, notes, created_by)
         values ($1, 30000, 'netting', '2026-08-07', 'Netted against an invoice', $2)`, [C, APPROVER])
await approve(PV.c, C, { principal: 5000, date: '2026-09-01' })
await q(`update fund_sources set status = 'repaid', repaid_at = now(), repaid_by = $2 where id = $1`, [C, APPROVER]) // the netting flow's own
await approve(PV.dInterest, D, { interest: 300, date: '2026-09-02' })
await approve(PV.dPrincipal, D, { principal: 10000, date: '2026-09-03' })

const source = async sid => (await q(`select status::text, repaid_at is not null as dated, repaid_by from fund_sources where id = $1`, [sid]))[0]
const rowsOf = async voucher => (await q(
  `select payment_type::text as type, amount::numeric(15,2)::text as amount from fund_source_repayments
    where payment_voucher_id = $1 order by payment_type::text`, [voucher]))
const covered = async sid => (await q(
  `select coalesce(sum(amount) filter (where payment_type in ('principal', 'netting')), 0)::numeric(15,2)::text as paid
     from fund_source_repayments where fund_source_id = $1`, [sid]))[0].paid
const voidVoucher = async voucher => { await asSystem(); await q(`update payment_vouchers set status = 'voided' where id = $1`, [voucher]) }

check(await source(A), { status: 'repaid', dated: true, repaid_by: APPROVER }, "HV-PV-202608-0295's principal closed HOUZS Century's source")
check([(await source(B)).status, (await source(C)).status, (await source(D)).status], ['active', 'repaid', 'repaid'], 'the other three as the book has them')

// ── Before: the session's DELETE, as reversePaidPayment sent it — refused for everybody, without a word ───────────
await as(FINANCE)
const deleted = await q(`delete from fund_source_repayments where payment_voucher_id = $1 returning id`, [PV.a])
check(deleted.length, 0, "the treasury's own DELETE removes nothing — fsr_no_delete USING (false)")
await asSystem()
check(await rowsOf(PV.a), [{ type: 'interest', amount: '1960.00' }, { type: 'principal', amount: '98000.00' }],
  '…both rows stay, and no error said so')
check((await source(A)).status, 'repaid', '…so the source still reads repaid')
await db.exec('begin')
await refuses(`insert into fund_source_repayments (fund_source_id, amount, payment_type, payment_date, payment_voucher_id, created_by)
  values ($1, 98000, 'principal', '2026-10-21', $2, $3)`, [A, PV.redo, APPROVER],
  /Cannot record repayment on fund source with status repaid/, '…and the corrected voucher’s repayment is refused')
await db.exec('rollback')

// ── The migration ───────────────────────────────────────────────────────────────────────────────────────────────
const MIGRATION = await text(new URL('20261021230000_voucher_reversal_fund_source_repayments.sql', migrations))
await db.exec(MIGRATION)
const fn = (await q(`select prosrc, prosecdef, proconfig from pg_proc where proname = 'reverse_voucher_fund_source_repayments'`))[0]
const GUARD = "PERFORM public.tab_write_guard(ARRAY['/payments', '/payments/[id]', '/receipts'], ARRAY['treasury.void']);"
check([fn.prosecdef, fn.proconfig, fn.prosrc.split(GUARD).length - 1], [true, ['search_path=public'], 1],
  'a SECURITY DEFINER step, its search path set, asking the pages its siblings ask — once')
const STEP_MD5 = await md5('reverse_voucher_fund_source_repayments')
check(STEP_MD5, '57373b5f95da3e8895a00bf34552f532', 'the body production runs once it is applied (its dry-run says the same)')
check((await q(`select has_function_privilege('authenticated', $1, 'execute') a, has_function_privilege('service_role', $1, 'execute') s,
  has_function_privilege('anon', $1, 'execute') n, has_function_privilege('nobody', $1, 'execute') p`,
  ['public.reverse_voucher_fund_source_repayments(uuid)']))[0], { a: true, s: true, n: false, p: false },
  'the app’s session calls it; anon and PUBLIC do not')

// ── Only a voided voucher qualifies ─────────────────────────────────────────────────────────────────────────────
await as(FINANCE)
await refuses(`select reverse_voucher_fund_source_repayments($1)`, [PV.a], /voucher is paid, only voided vouchers qualify/,
  'a live paid voucher keeps its rows — nobody strips them off its source')
await refuses(`select reverse_voucher_fund_source_repayments($1)`, [PV.draft], /voucher is draft, only voided vouchers qualify/, 'nor a draft')
await refuses(`select reverse_voucher_fund_source_repayments($1)`, [id(99)], /voucher .* not found/, 'an unknown voucher is said so')
await asSystem()
check(await rowsOf(PV.a), [{ type: 'interest', amount: '1960.00' }, { type: 'principal', amount: '98000.00' }], '…nothing removed')

// ── HV-PV-202608-0295 reversed: its rows go, HOUZS Century's source reopens, the redo goes through ──────────────
await voidVoucher(PV.a)
await as(VIEWER)
await refuses(`select reverse_voucher_fund_source_repayments($1)`, [PV.a], /needs Treasury · Void/, 'Treasury · View alone may not')
await as(id(77))
await refuses(`select reverse_voucher_fund_source_repayments($1)`, [PV.a], /needs Treasury · Void/, 'a sign-in with no actions at all may not')
await as(FINANCE)
await q(`select set_config('test.tab_closed', 'on', false)`)
await refuses(`select reverse_voucher_fund_source_repayments($1)`, [PV.a], /Not open to you on this page/, 'a box unticked on the page closes it')
await q(`select set_config('test.tab_closed', 'off', false)`)
check(await rowsOf(PV.a), [{ type: 'interest', amount: '1960.00' }, { type: 'principal', amount: '98000.00' }], '…each refusal removing nothing')

check((await q(`select reverse_voucher_fund_source_repayments($1) n`, [PV.a]))[0].n, 2, 'the treasury removes the voucher’s two rows')
await asSystem()
check(await rowsOf(PV.a), [], '…none is left on the source')
check(await source(A), { status: 'active', dated: false, repaid_by: null }, '…and HOUZS Century’s source is open again, owed 98,000')
check(await covered(A), '0.00', '…nothing of its principal paid')
await as(FINANCE)
check((await q(`select reverse_voucher_fund_source_repayments($1) n`, [PV.a]))[0].n, 0, 'run again, it removes nothing')
await asSystem()
check((await source(A)).status, 'active', '…and changes nothing')
await approve(PV.redo, A, { interest: 1960, principal: 98000, date: '2026-10-21' })
check((await source(A)).status, 'repaid', 'the corrected voucher’s approval is taken, and repays the source again')

// ── B: an instalment reversed on a source still owed — only its rows go ─────────────────────────────────────────
await voidVoucher(PV.b2)
await as(FINANCE)
check((await q(`select reverse_voucher_fund_source_repayments($1) n`, [PV.b2]))[0].n, 2, 'the second instalment’s two rows go')
await asSystem()
check([await rowsOf(PV.b2), await rowsOf(PV.b1)], [[], [{ type: 'interest', amount: '1200.00' }, { type: 'principal', amount: '20000.00' }]],
  '…the first instalment’s stay')
check([(await source(B)).status, await covered(B)], ['active', '20000.00'], '…the source stays active, 40,000 owed')

// ── C: what is left still covers it — it stays repaid ──────────────────────────────────────────────────────────
await voidVoucher(PV.c)
await as(FINANCE)
check((await q(`select reverse_voucher_fund_source_repayments($1) n`, [PV.c]))[0].n, 1, 'the extra principal goes')
await asSystem()
check([(await source(C)).status, (await source(C)).dated, await covered(C)], ['repaid', true, '30000.00'],
  '…the netting still covers the source, so it stays repaid')

// ── D: an interest voucher reversed takes no principal — the status is not its to change ───────────────────────
await voidVoucher(PV.dInterest)
await as(FINANCE)
check((await q(`select reverse_voucher_fund_source_repayments($1) n`, [PV.dInterest]))[0].n, 1, 'the interest row goes')
await asSystem()
check([(await source(D)).status, await rowsOf(PV.dPrincipal)], ['repaid', [{ type: 'principal', amount: '10000.00' }]],
  '…the principal and the repaid status stay')

// ── The system (no sign-in) runs it as before; the session still deletes nothing itself ─────────────────────────
await voidVoucher(PV.dPrincipal)
check((await q(`select reverse_voucher_fund_source_repayments($1) n`, [PV.dPrincipal]))[0].n, 1, 'the system may run the step')
check((await source(D)).status, 'active', '…and the principal gone, D is open again')
await as(FINANCE)
check((await q(`delete from fund_source_repayments where payment_voucher_id = $1 returning id`, [PV.b1])).length, 0,
  'fsr_no_delete stays — a session still removes no repayment row itself')
await asSystem()

// ── A second run of the migration changes nothing ───────────────────────────────────────────────────────────────
await db.exec(MIGRATION)
check(await md5('reverse_voucher_fund_source_repayments'), STEP_MD5, 'a second run leaves the same body')

console.log(`validate-fund-source-reversal: ${checks} checks passed (step md5 ${STEP_MD5})`)
