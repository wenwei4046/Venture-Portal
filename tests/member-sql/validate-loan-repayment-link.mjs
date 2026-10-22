// Local PostgreSQL regression for 20261021200000 (2026-10-21, a loan repayment knows its own journal entry — the user,
// shown two identical repayments' Void reversing the first one's entry: "选 A").
// void_loan_repayment found a repayment's entry by its loan, amount, day and type and took the OLDEST match: of two
// identical repayments (The Cont, 2 Oct — the second keyed again on 21 Oct, its interest on 3063 where the first's was
// on 5027) Void on the second reversed the FIRST's entry and took the bank down by the first's bank. Production's own
// bodies run here (loan-repayment-production.sql, md5-checked) over stand-in tables with the columns they read; the
// migration is applied VERBATIM; then the void and both amends are driven on repayments with and without a link. No
// live I/O.
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

const FINANCE = '00000000-0000-0000-0000-0000000000aa'
const CONT = '00000000-0000-0000-0000-00000000c001'   // The Cont's 60k loan
const CARRES = '00000000-0000-0000-0000-00000000c002'
const HONG_LEONG = '00000000-0000-0000-0000-0000000000b1'   // GL 3000
const ALLIANCE = '00000000-0000-0000-0000-0000000000b2'     // GL 3010

await db.exec(`
  create role anon; create role authenticated; create role service_role;
  create schema auth;
  create function auth.uid() returns uuid language sql stable as $$ select '${FINANCE}'::uuid $$;
  create type public.user_role as enum ('principal', 'finance', 'hr', 'dept_manager', 'revenue_member', 'staff');
  create type public.gl_segment as enum ('treasury', 'marketing', 'hr', 'finance', 'director_office', 'corporate', 'unallocated', 'director', 'revenue_department', 'it');
  create type public.loan_status as enum ('pending_approval', 'active', 'fully_repaid', 'cancelled');
  create type public.repayment_type as enum ('principal', 'interest', 'penalty', 'netting');
  create function public.current_user_role() returns public.user_role language sql stable as $$ select 'finance'::public.user_role $$;
  create function public.tab_write_guard(text[], text[]) returns void language plpgsql as $$ begin end $$;
  create function public.has_any_action(text[]) returns boolean language sql stable as $$ select true $$;
  create function public.is_period_locked(date) returns boolean language sql stable as $$ select false $$;
  create table public.loans (id uuid primary key, principal numeric(15,2) not null,
    status public.loan_status not null default 'active', updated_at timestamptz);
  create table public.journal_entries (id uuid primary key default gen_random_uuid(), entry_no varchar,
    transaction_date date not null, period_month date not null, description text not null, reference_type text,
    reference_id uuid, total_amount numeric(15,2) not null, is_reversed boolean not null default false, reversed_by_id uuid,
    created_by uuid not null, created_at timestamptz not null default clock_timestamp(),
    segment public.gl_segment not null default 'unallocated');
  create table public.journal_lines (id uuid primary key default gen_random_uuid(),
    entry_id uuid not null references public.journal_entries(id), account_code text not null, debit numeric(15,2),
    credit numeric(15,2), description text);
  create table public.repayments (id uuid primary key default gen_random_uuid(), loan_id uuid not null references public.loans(id),
    amount numeric(15,2) not null, payment_type public.repayment_type not null, payment_date date not null, reference_id uuid,
    notes text, created_by uuid not null, created_at timestamptz not null default clock_timestamp());
  create table public.bank_accounts (id uuid primary key, gl_account_code text, current_balance numeric(15,2) not null, updated_at timestamptz);
  create table public.venture_pool (id uuid primary key default gen_random_uuid(), transaction_type text not null,
    amount numeric(15,2) not null, description text, reference_table text, reference_id uuid, created_by uuid);
  create table public.period_locks (period_month date, is_locked boolean);
  create table public.bank_recon_matches (journal_line_id uuid);
  create table public.bank_recon_lines (matched_journal_line_id uuid);
  create table public.audit_tables (table_name text primary key, ignore_columns text[] not null default '{}');
  insert into public.audit_tables (table_name) values ('repayments'), ('journal_entries');
`)

await db.exec(await text(new URL('./loan-repayment-production.sql', import.meta.url)))
const body = async name => (await q(`select prosrc from pg_proc where proname = $1`, [name]))[0].prosrc
const md5 = async name => (await q(`select md5(prosrc) m from pg_proc where proname = $1`, [name]))[0].m
check(await md5('void_loan_repayment'), 'cda958dad8ea18a9d4aadf430bf333b6', "production's void_loan_repayment, as it was read")
check(await md5('amend_loan_repayment'), '8d5f89e59fed19b247aaf29a02534f02', "production's amend_loan_repayment, as it was read")
check(await md5('amend_loan_repayment_date'), 'b67c36e4b0c13a79960dcfe68a9d302e', "production's amend_loan_repayment_date, as it was read")
check(await md5('post_journal_entry'), 'a682bcdec54abfaf1fef97955fe86d53', "production's post_journal_entry, as it was read")
const before = {
  void: await body('void_loan_repayment'),
  amount: await body('amend_loan_repayment'),
  date: await body('amend_loan_repayment_date'),
}

await q(`insert into loans (id, principal) values ($1, 60000), ($2, 30000)`, [CONT, CARRES])
await q(`insert into bank_accounts (id, gl_account_code, current_balance) values ($1, '3000', 100000), ($2, '3010', 50000)`, [HONG_LEONG, ALLIANCE])

// What recordRepayment wrote: the repayment row and its journal entry, Dr the bank / Cr the account — the entry's
// reference is the LOAN. `posts: false` = a row with no entry of its own (the [LO#] imports, an entry that failed).
// `link: true` = the row written with the entry it posted (the app since 2026-10-21; the column exists after the migration).
const record = async ({ loan = CONT, type = 'interest', amount = 2400, date = '2026-10-02', credit = '5027', bank = '3000', posts = true, link = false }) => {
  let entryId = null
  if (posts) {
    const lines = [
      { account_code: bank, debit: amount, description: `Bank — ${type} received` },
      { account_code: credit, credit: amount, description: `${type} repayment offset` },
    ]
    ;[{ id: entryId }] = await q(`select post_journal_entry($1::date, $2, 'repayment', $3::uuid, $4::uuid, $5::jsonb, 'treasury') as id`,
      [date, `Loan ${type} repayment — ${loan}`, loan, FINANCE, JSON.stringify(lines)])
  }
  const [{ id }] = link
    ? await q(`insert into repayments (loan_id, amount, payment_type, payment_date, created_by, journal_entry_id) values ($1, $2, $3, $4, $5, $6) returning id`,
      [loan, amount, type, date, FINANCE, entryId])
    : await q(`insert into repayments (loan_id, amount, payment_type, payment_date, created_by) values ($1, $2, $3, $4, $5) returning id`,
      [loan, amount, type, date, FINANCE])
  return { id, entry: entryId }
}
const entry = async id => (await q(`select is_reversed, reversed_by_id is not null as has_reversal, total_amount::numeric(15,2)::text as total, transaction_date::text as day from journal_entries where id = $1`, [id]))[0]
const balance = async bank => (await q(`select current_balance::text as b from bank_accounts where id = $1`, [bank]))[0].b
const exists = async id => (await q(`select count(*)::int n from repayments where id = $1`, [id]))[0].n === 1
const reversalOf = async id => (await q(
  `select l.account_code, l.debit::text as debit, l.credit::text as credit from journal_lines l
     join journal_entries o on o.reversed_by_id = l.entry_id where o.id = $1 order by l.account_code`, [id]))

// ── Before: production's void takes the oldest match — the bug ──────────────────────────────────────────────────
const first = await record({ credit: '5027' })    // Finance Manager, 2 Oct — interest to 5027 Loan Interest
const second = await record({ credit: '3063' })   // keyed again on 21 Oct — interest to 3063 Interest in Suspense
const solo = await record({ loan: CARRES, amount: 900, date: '2026-09-14' })
const imported = await record({ loan: CARRES, amount: 450, date: '2026-05-14', posts: false })   // an [LO#] import

await db.exec('begin')
await q(`select void_loan_repayment($1)`, [second.id])
check((await entry(first.entry)).is_reversed, true, "production's body: Void on the second reverses the FIRST's entry")
check((await entry(second.entry)).is_reversed, false, "…and leaves the second's own entry live")
await db.exec('rollback')

// ── The migration ───────────────────────────────────────────────────────────────────────────────────────────────
const MIGRATION = await text(new URL('20261021200000_repayment_journal_entry_link.sql', migrations))
await db.exec(MIGRATION)

const HELPER = '(SELECT public.loan_repayment_journal_entry(p_repayment_id))'
const swapped = {
  void: [`SELECT je.id, je.entry_no, je.segment, je.description INTO v_je
    FROM journal_entries je
    WHERE je.reference_type = 'repayment'
      AND je.reference_id = v_rep.loan_id
      AND je.total_amount = v_rep.amount
      AND je.transaction_date = v_rep.payment_date
      AND je.is_reversed = false
      AND je.description LIKE 'Loan ' || v_rep.payment_type || ' repayment%'
    ORDER BY je.created_at
    LIMIT 1;`, `SELECT je.id, je.entry_no, je.segment, je.description INTO v_je
    FROM journal_entries je
    WHERE je.id = ${HELPER};`],
  amount: [`SELECT je.id INTO STRICT v_je_id
          FROM journal_entries je
         WHERE je.reference_type = 'repayment'
           AND je.reference_id = v_r.loan_id
           AND NOT je.is_reversed
           AND je.transaction_date = v_r.payment_date
           AND je.total_amount = v_old
           AND je.description ILIKE 'Loan ' || v_r.payment_type || ' repayment%';`, `SELECT je.id INTO STRICT v_je_id
          FROM journal_entries je
         WHERE je.id = ${HELPER};`],
  date: [`SELECT je.id INTO STRICT v_je_id
          FROM journal_entries je
         WHERE je.reference_type = 'repayment'
           AND je.reference_id = v_r.loan_id
           AND NOT je.is_reversed
           AND je.transaction_date = v_old
           AND je.total_amount = v_r.amount
           AND je.description ILIKE 'Loan ' || v_r.payment_type || ' repayment%';`, `SELECT je.id INTO STRICT v_je_id
          FROM journal_entries je
         WHERE je.id = ${HELPER};`],
}
const NAMES = { void: 'void_loan_repayment', amount: 'amend_loan_repayment', date: 'amend_loan_repayment_date' }
for (const [k, [oldStatement, newStatement]] of Object.entries(swapped)) {
  const after = await body(NAMES[k])
  check(after.split(newStatement).length - 1, 1, `${NAMES[k]}: the entry is the repayment's own, found once`)
  check(after.includes(oldStatement), false, `${NAMES[k]}: the old match is gone`)
  check(after.replace(newStatement, oldStatement), before[k], `${NAMES[k]}: nothing else in the body changed`)
}
const swappedMd5 = {
  void: await md5('void_loan_repayment'),
  amount: await md5('amend_loan_repayment'),
  date: await md5('amend_loan_repayment_date'),
}
check(swappedMd5, {
  void: '2a7cbe6d3f4d07a63e2ea7ed642eaa51',
  amount: 'd5a79c9a08ba422135e3f687b72ef7ee',
  date: '6b69c3bb7c8fb5f780b896b9eae744b4',
}, 'the bodies production runs once it is applied (its dry-run says the same)')

// The backfill: a repayment whose one live entry is nobody else's is linked; twins and a row with no entry are not.
const linkOf = async id => (await q(`select journal_entry_id from repayments where id = $1`, [id]))[0].journal_entry_id
check(await linkOf(solo.id), solo.entry, 'the backfill links a repayment to its one entry')
check([await linkOf(first.id), await linkOf(second.id)], [null, null], 'twins are not guessed — neither is linked')
check(await linkOf(imported.id), null, 'an import with no entry of its own stays unlinked')
check((await q(`select ignore_columns from audit_tables where table_name = 'repayments'`))[0].ignore_columns, ['journal_entry_id'],
  "a link's later update is bookkeeping — the backfill adds no line to a loan's audit log")

await db.exec(MIGRATION)
check({ void: await md5('void_loan_repayment'), amount: await md5('amend_loan_repayment'), date: await md5('amend_loan_repayment_date') },
  swappedMd5, 'a second run changes no body')
check((await q(`select ignore_columns from audit_tables where table_name = 'repayments'`))[0].ignore_columns, ['journal_entry_id'],
  '…and adds the column to the audit list once')
check(await linkOf(solo.id), solo.entry, '…and links nothing twice')

check((await q(`select has_function_privilege('authenticated', 'public.loan_repayment_journal_entry(uuid)', 'execute') a,
  has_function_privilege('anon', 'public.loan_repayment_journal_entry(uuid)', 'execute') b,
  has_function_privilege('service_role', 'public.loan_repayment_journal_entry(uuid)', 'execute') c`))[0],
  { a: false, b: false, c: true }, 'the helper is the three functions’ — no signed-in session calls it')

// ── Twins with no link: refused, nothing changed ────────────────────────────────────────────────────────────────
const bankBefore = await balance(HONG_LEONG)
await refuses(`select void_loan_repayment($1)`, [second.id], /Several journal entries match this repayment/, 'Void on an unlinked twin is refused')
await refuses(`select amend_loan_repayment($1, 2500, 'typo')`, [second.id], /Several journal entries match this repayment/, 'so is its amount amend')
await refuses(`select amend_loan_repayment_date($1, '2026-01-15', 'typo')`, [second.id], /Several journal entries match this repayment/, 'and its date amend')
check([(await entry(first.entry)).is_reversed, (await entry(second.entry)).is_reversed, await exists(second.id), await balance(HONG_LEONG)],
  [false, false, true, bankBefore], '…with nothing reversed, removed or moved')

// ── Twins each linked to its own entry (the app since 2026-10-21) ───────────────────────────────────────────────
const third = await record({ loan: CARRES, amount: 1200, date: '2026-10-07', credit: '5027', bank: '3000', link: true })
const fourth = await record({ loan: CARRES, amount: 1200, date: '2026-10-07', credit: '3063', bank: '3010', link: true })
const [hlBefore, alBefore] = [await balance(HONG_LEONG), await balance(ALLIANCE)]
const voided = (await q(`select void_loan_repayment($1) r`, [fourth.id]))[0].r
check(voided.je_reversed, true, 'Void on the second of linked twins reverses an entry')
check([(await entry(fourth.entry)).is_reversed, (await entry(fourth.entry)).has_reversal], [true, true], '…its OWN entry')
check((await entry(third.entry)).is_reversed, false, "…and never the first's")
check(await reversalOf(fourth.entry), [
  { account_code: '3010', debit: null, credit: '1200.00' },
  { account_code: '3063', debit: '1200.00', credit: null },
], "…on its own accounts: 3063 back, out of the bank it came into")
check([await balance(HONG_LEONG), await balance(ALLIANCE)], [hlBefore, (Number(alBefore) - 1200).toFixed(2)],
  "the bank its own entry debited goes down — the first's bank is untouched")
check([await exists(fourth.id), await exists(third.id)], [false, true], 'the second leaves the list; the first stays')

// ── A backfilled repayment voids on its own entry; one with no entry still leaves without one ───────────────────
check((await q(`select void_loan_repayment($1) r`, [solo.id]))[0].r.je_reversed, true, 'a backfilled repayment voids on its entry')
check((await entry(solo.entry)).is_reversed, true, '…that entry')
check((await q(`select void_loan_repayment($1) r`, [imported.id]))[0].r.je_reversed, false, 'an import with no entry is removed, nothing reversed — as before')
check(await exists(imported.id), false, '…and leaves the list')

// ── An unlinked repayment never takes an entry another repayment is linked to ───────────────────────────────────
const linked = await record({ loan: CARRES, amount: 300, date: '2026-10-09', link: true })
const orphan = await record({ loan: CARRES, amount: 300, date: '2026-10-09', posts: false })   // its own entry failed to post
check((await q(`select void_loan_repayment($1) r`, [orphan.id]))[0].r.je_reversed, false, "an unlinked row with no entry of its own reverses nobody else's")
check((await entry(linked.entry)).is_reversed, false, "…the linked repayment's entry stays live")
check((await q(`select void_loan_repayment($1) r`, [linked.id]))[0].r.je_reversed, true, '…and still voids on it')

// ── A link to an entry that is not the repayment's own is refused ───────────────────────────────────────────────
const [{ id: manual }] = await q(`select post_journal_entry('2026-10-10', 'Manual JV', 'manual_jv', null, $1::uuid,
  '[{"account_code":"3000","debit":500},{"account_code":"6100","credit":500}]'::jsonb) as id`, [FINANCE])
const [{ id: forged }] = await q(`insert into repayments (loan_id, amount, payment_type, payment_date, created_by, journal_entry_id)
  values ($1, 500, 'interest', '2026-10-10', $2, $3) returning id`, [CARRES, FINANCE, manual])
await refuses(`select void_loan_repayment($1)`, [forged], /is not its own/, 'Void refuses a link to an entry that is not the repayment’s')
check([(await entry(manual)).is_reversed, await exists(forged)], [false, true], '…reversing nothing')
await refuses(`select amend_loan_repayment($1, 600, 'typo')`, [forged], /is not its own/, 'so does the amount amend')

// ── The amends follow the link ──────────────────────────────────────────────────────────────────────────────────
const seventh = await record({ amount: 2400, date: '2026-03-02', credit: '5027', link: true })
const eighth = await record({ amount: 2400, date: '2026-03-02', credit: '5027', link: true })
await q(`select amend_loan_repayment($1, 2500, 'keyed 2,400')`, [eighth.id])
check([(await entry(eighth.entry)).total, (await entry(seventh.entry)).total], ['2500.00', '2400.00'], "the amount amend changes the repayment's own entry, not its twin's")
await q(`select amend_loan_repayment_date($1, '2026-03-03', 'keyed the 2nd')`, [seventh.id])
check([(await entry(seventh.entry)).day, (await entry(eighth.entry)).day], ['2026-03-03', '2026-03-02'], "the date amend moves the repayment's own entry, not its twin's")
check((await q(`select void_loan_repayment($1) r`, [eighth.id]))[0].r.je_reversed, true, 'an amended repayment still voids on its entry')
check((await entry(eighth.entry)).is_reversed, true, '…the amended one')

// ── One entry, one repayment; a link must be an entry ───────────────────────────────────────────────────────────
await refuses(`insert into repayments (loan_id, amount, payment_type, payment_date, created_by, journal_entry_id) values ($1, 2400, 'interest', '2026-03-03', $2, $3)`,
  [CONT, FINANCE, seventh.entry], /repayments_journal_entry_id_key/, 'two repayments cannot claim one entry')
await refuses(`insert into repayments (loan_id, amount, payment_type, payment_date, created_by, journal_entry_id) values ($1, 2400, 'interest', '2026-03-03', $2, gen_random_uuid())`,
  [CONT, FINANCE], /foreign key/, 'a link must be an entry')

console.log(`validate-loan-repayment-link: ${checks} checks passed`)
