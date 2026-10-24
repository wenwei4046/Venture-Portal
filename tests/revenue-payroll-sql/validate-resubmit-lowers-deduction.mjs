// Local PostgreSQL regression for 20261025051700 — a resubmit may lower an employee deduction no PV pays yet
// (2026-10-24; HR: "kris and peter PCB I updated amount Kris - RM647.90 Peter - RM1429.15 … In Payment Statutory page
// still showing Kris PCB amount - RM 1821.90").
//
// Production's payroll_row_delta, payroll_row_money, payroll_row_submitted_money, payroll_money_label,
// payroll_statutory_entitlements / _people / _coverage and payment_cycle (production's payment_cycle_unmasked) run
// VERBATIM (md5 checked) over stand-in tables, then the migration. Checks: September's KRIS and PETER (PCB 1,821.90
// sent, 647.90 / 1,429.15 now, no LHDN PV) are refused before and go after; a PCB a PV still carries stays refused
// and says so, a voided PV no longer counts, an earlier partial PV no bigger than the new figure lets it go; money
// that vanishes (net not up) stays refused; an employee EPF down beside an employer EPF up goes while KWSP paid in
// full stays paid; a fall in gross, and a first submission, are as before; a director's row; the words of every
// refusal; payment_cycle_unmasked names an open resubmit (not a second payroll, not a closed one); sessions can no
// longer call payroll_row_delta; twice changes nothing; a body changed in production since is refused. No live I/O.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const db = new PGlite()
const migrations = new URL('../../supabase/migrations/', import.meta.url)
const q = async (sql, params = []) => (await db.query(sql, params)).rows
const one = async (sql, params = []) => Object.values((await q(sql, params))[0])[0]
const id = v => `00000000-0000-4000-8000-${String(v).padStart(12, '0')}`

let checks = 0
const check = (actual, expected, what) => {
  assert.deepEqual(actual, expected, what)
  checks++
}

const migrationText = async name => (await readFile(new URL(`${name}.sql`, migrations), 'utf8')).replace(/\r\n/g, '\n')
const MIGRATION = await migrationText('20261025051700_resubmit_lowers_unpaid_deduction')

async function productionFunction(migration, name) {
  const sql = await migrationText(migration)
  const match = new RegExp(String.raw`create (?:or replace )?function (?:public\.)?` + name + String.raw`\([\s\S]*?\bas\s+(\$\w*\$)`, 'i').exec(sql)
  assert(match, `Missing production function ${name}`)
  const end = sql.indexOf(`${match[1]};`, match.index + match[0].length)
  assert(end >= 0, `Missing function end ${name}`)
  await db.exec(sql.slice(match.index, end + match[1].length + 1))
}
const md5 = sig => one(`SELECT md5(prosrc) FROM pg_proc WHERE oid = $1::regprocedure`, [sig])

const PERIOD = '2026-09-01'
const RUN = id(900)
const B3 = id(903)
const KEYS = ['gross', 'net', 'epf_er', 'epf_ee', 'socso_er', 'socso_ee', 'eis_er', 'eis_ee', 'pcb', 'withholding_tax', 'skbbk', 'non_statutory_allowance', 'basic_pay_net', 'commission_balance']
const zero = Object.fromEntries(KEYS.map(k => [k, 0]))

let next = 0
/** A staff row of September: what batch #3 sent (null = never sent) and what it says now. */
async function staff(name, sent, now, extra = {}) {
  const n = ++next
  const row = id(100 + n)
  const s = { ...zero, ...sent }
  const w = { ...zero, ...now }
  await q(`INSERT INTO hr_staff_costs (id, employee_name, employee_code, department_id) VALUES ($1, $2, $3, $4)`,
    [id(200 + n), name, `HV${String(n).padStart(3, '0')}`, id(50)])
  await q(`INSERT INTO hr_monthly_payroll (id, staff_id, period_month, status, source, payout_split_version, gross, net, epf_er, epf_ee,
      socso_er, socso_ee, eis_er, eis_ee, pcb, withholding_tax, skbbk_amount, non_statutory_allowance, basic_pay_net, commission_balance,
      topup_opened_at, topup_kind)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)`,
  [row, id(200 + n), PERIOD, extra.status ?? 'draft', extra.source ?? 'commission', extra.split ?? 2, w.gross, w.net, w.epf_er, w.epf_ee,
    w.socso_er, w.socso_ee, w.eis_er, w.eis_ee, w.pcb, w.withholding_tax, w.skbbk, w.non_statutory_allowance, w.basic_pay_net,
    w.commission_balance, extra.kind === null ? null : '2026-10-19T07:26:44Z', extra.kind === undefined ? 'resubmit' : extra.kind])
  if (sent) {
    await q(`INSERT INTO payroll_batch_lines (batch_id, period_month, scope, row_id, gross, net, epf_er, epf_ee, socso_er, socso_ee,
        eis_er, eis_ee, pcb, withholding_tax, skbbk, non_statutory_allowance, basic_pay_net, commission_balance)
      VALUES ($1, $2, 'staff', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
    [B3, PERIOD, row, s.gross, s.net, s.epf_er, s.epf_ee, s.socso_er, s.socso_ee, s.eis_er, s.eis_ee, s.pcb, s.withholding_tax,
      s.skbbk, s.non_statutory_allowance, s.basic_pay_net, s.commission_balance])
  }
  return row
}

let pvs = 0
/** A statutory PV carrying `amount` of one person's scheme. */
async function pv(scope, row, scheme, amount, status) {
  const v = id(700 + ++pvs)
  const payee = { KWSP: 'KWSP', SOCSO: 'PERKESO (SOCSO)', EIS: 'PERKESO (EIS)', PCB: 'LHDN', SKBBK: 'SKBBK' }[scheme]
  await q(`INSERT INTO payment_vouchers (id, status, reference_type, reference_id, payee_name, amount) VALUES ($1, $2, 'payroll_statutory', $3, $4, $5)`,
    [v, status, RUN, payee, amount])
  await q(`INSERT INTO payroll_statutory_voucher_lines (voucher_id, scope, payroll_row_id, period_month, scheme, amount) VALUES ($1, $2, $3, $4, $5, $6)`,
    [v, scope, row, PERIOD, scheme, amount])
  return v
}

const delta = async (row, scope = 'staff') => {
  const d = await one(`SELECT public.payroll_row_delta($1, $2) AS d`, [scope, row])
  return { falls: d.falls, lowered: d.lowered ?? null, rises: d.rises, pcb: Number(d.pcb), net: Number(d.net) }
}
// What the four callers say: '%''s resubmit can only add to what was sent — % went down'.
const refusal = async row => one(`SELECT string_agg(public.payroll_money_label(k), ', ') AS words
  FROM jsonb_array_elements_text(public.payroll_row_delta('staff', $1)->'falls') k`, [row])

try {
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
      AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    CREATE FUNCTION has_perm(text) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT auth.uid() IS NOT NULL $$;

    CREATE TABLE departments (id uuid PRIMARY KEY, name text NOT NULL);
    CREATE TABLE hr_staff_costs (id uuid PRIMARY KEY, employee_name text NOT NULL, employee_code text, department_id uuid,
      bank_name_2 text, bank_account_no_2 text);
    CREATE TABLE hr_monthly_payroll (
      id uuid PRIMARY KEY, staff_id uuid NOT NULL, period_month date NOT NULL, status text NOT NULL, source text NOT NULL,
      payout_split_version smallint, gross numeric(15,2), net numeric(15,2), epf_er numeric(15,2), epf_ee numeric(15,2),
      socso_er numeric(15,2), socso_ee numeric(15,2), eis_er numeric(15,2), eis_ee numeric(15,2), pcb numeric(15,2),
      withholding_tax numeric(15,2), skbbk_amount numeric(15,2), non_statutory_allowance numeric(15,2),
      basic_pay_net numeric(15,2), commission_balance numeric(15,2), topup_opened_at timestamptz, topup_kind text);
    CREATE TABLE director_monthly_payroll (
      id uuid PRIMARY KEY, director_id uuid, period_month date NOT NULL, status text NOT NULL, employee_name text, employee_code text,
      gross numeric(15,2), net numeric(15,2), epf_er numeric(15,2), epf_ee numeric(15,2), socso_er numeric(15,2), socso_ee numeric(15,2),
      eis_er numeric(15,2), eis_ee numeric(15,2), pcb numeric(15,2), skbbk_amount numeric(15,2), non_statutory_allowance numeric(15,2),
      topup_opened_at timestamptz, topup_kind text);
    CREATE TABLE payroll_runs (id uuid PRIMARY KEY, period_month date NOT NULL, status text NOT NULL);
    CREATE TABLE payroll_batches (id uuid PRIMARY KEY, run_id uuid NOT NULL, batch_no integer NOT NULL, status text NOT NULL,
      total_amount numeric(15,2) NOT NULL DEFAULT 0, legacy boolean NOT NULL DEFAULT false);
    CREATE TABLE payroll_batch_lines (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), batch_id uuid NOT NULL, period_month date NOT NULL,
      scope text NOT NULL, row_id uuid NOT NULL, gross numeric(15,2), net numeric(15,2), epf_er numeric(15,2), epf_ee numeric(15,2),
      socso_er numeric(15,2), socso_ee numeric(15,2), eis_er numeric(15,2), eis_ee numeric(15,2), pcb numeric(15,2),
      withholding_tax numeric(15,2), skbbk numeric(15,2), non_statutory_allowance numeric(15,2), basic_pay_net numeric(15,2),
      commission_balance numeric(15,2));
    CREATE TABLE payroll_payment_requests (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), batch_id uuid, payroll_run_id uuid,
      period_month date, status text NOT NULL);
    CREATE TABLE payment_vouchers (id uuid PRIMARY KEY, voucher_no text, status text NOT NULL, reference_type text, reference_id uuid,
      payee_name text, amount numeric(15,2), payment_date date, created_at timestamptz DEFAULT now(), approved_at timestamptz);
    CREATE TABLE payroll_statutory_voucher_lines (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), voucher_id uuid NOT NULL, scope text NOT NULL,
      payroll_row_id uuid NOT NULL, period_month date NOT NULL, scheme text NOT NULL, amount numeric(15,2) NOT NULL);
    CREATE TABLE payroll_voucher_lines (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), voucher_id uuid, payroll_row_id uuid, scope text,
      salary_component text, recipient_account text, bank_name text, bank_account_no text);
    CREATE TABLE approval_requests (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), reference_id uuid, reference_table text, group_id uuid);

    -- Stand-ins for what this file does not change: the legacy (line-less) PVs, and the cycle's layers below the one it swaps.
    CREATE FUNCTION payroll_statutory_legacy_scopes(uuid, date, text) RETURNS text[] LANGUAGE sql STABLE AS $$ SELECT '{}'::text[] $$;
    CREATE TABLE cycle_people (row_id uuid, scope text, name text);
    CREATE FUNCTION payment_cycle_before_salary_components(p_period date) RETURNS jsonb LANGUAGE sql STABLE AS $$
      SELECT jsonb_build_object('period', p_period, 'people', coalesce(jsonb_agg(jsonb_build_object(
        'row_id', row_id, 'scope', scope, 'name', name, 'dept_name', 'Revenue Department') ORDER BY name), '[]'::jsonb)) FROM cycle_people $$;
    CREATE FUNCTION payroll_salary_entitlements(p_period date)
      RETURNS TABLE(scope text, row_id uuid, component text, submitted numeric, funded numeric, covered numeric, paid numeric)
      LANGUAGE sql STABLE AS $$ SELECT NULL::text, NULL::uuid, NULL::text, 0::numeric, 0::numeric, 0::numeric, 0::numeric WHERE false $$;
    CREATE FUNCTION payroll_salary_coverage(p_period date)
      RETURNS TABLE(scope text, row_id uuid, component text, amount numeric, voucher_id uuid)
      LANGUAGE sql STABLE AS $$ SELECT NULL::text, NULL::uuid, NULL::text, 0::numeric, NULL::uuid WHERE false $$;
  `)
  for (const name of ['payroll_row_money', 'payroll_row_submitted_money', 'payroll_row_delta', 'payroll_money_label',
    'payroll_statutory_entitlements', 'payroll_statutory_people', 'payment_cycle']) {
    await productionFunction('20260927061000_unified_payroll', name)
  }
  await productionFunction('20260926110000_payment_calendar_claims_speed', 'payroll_statutory_coverage')
  await db.exec(`
    ALTER FUNCTION public.payment_cycle(date) RENAME TO payment_cycle_unmasked;
    REVOKE ALL ON FUNCTION public.payment_cycle_unmasked(date) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.payroll_row_delta(text, uuid) TO authenticated;
  `)
  check(await md5('public.payroll_row_delta(text,uuid)'), '0b162c0dd0cc485775c0007b981762ea', 'payroll_row_delta is production’s')
  check(await md5('public.payroll_money_label(text)'), '6a9916ebb8e578a9c993883f7f07fe90', 'payroll_money_label is production’s')
  check(await md5('public.payment_cycle_unmasked(date)'), 'cf21b5c3c5580735dcf7af4112f3deb3', 'payment_cycle_unmasked is production’s')
  check(await md5('public.payroll_row_money(text,uuid)'), 'dcc3c51aacc1a9933da2ff2a89d99378', 'payroll_row_money is production’s')
  check(await md5('public.payroll_row_submitted_money(text,uuid)'), '92dd65d10578aeca9408646a03c8158c', 'payroll_row_submitted_money is production’s')
  check(await md5('public.payroll_statutory_entitlements(date)'), 'a50b8453224bc743f775d1c4df52144c', 'payroll_statutory_entitlements is production’s')
  check(await md5('public.payroll_statutory_coverage(date)'), '5e68c5880e0878015fc6df5bb7629efd', 'payroll_statutory_coverage is production’s')
  check(await md5('public.payroll_statutory_people(date)'), '1fc13ce42cd5c0f6ad5c4413991d1be8', 'payroll_statutory_people is production’s')

  // September: run, batch #3 funded (its request completed).
  await q(`INSERT INTO departments VALUES ($1, 'Revenue Department')`, [id(50)])
  await q(`INSERT INTO payroll_runs VALUES ($1, $2, 'approved')`, [RUN, PERIOD])
  await q(`INSERT INTO payroll_batches (id, run_id, batch_no, status, total_amount) VALUES ($1, $2, 3, 'submitted', 73000)`, [B3, RUN])
  await q(`INSERT INTO payroll_payment_requests (batch_id, payroll_run_id, period_month, status) VALUES ($1, $2, $3, 'completed')`, [B3, RUN, PERIOD])

  // KRIS and PETER, as production holds them: batch #3 sent PCB 1,821.90 each; HR typed 647.90 and 1,429.15 on 22 Oct.
  const revenue = (pcb, net, basic) => ({ gross: 36443.95, net, epf_er: 1440, epf_ee: 1320, socso_er: 104.15, socso_ee: 29.75,
    eis_er: 11.9, eis_ee: 11.9, pcb, skbbk: 44.65, basic_pay_net: basic, commission_balance: 24399.3 })
  const KRIS = await staff('KRIS', revenue(1821.9, 33215.75, 8816.45), revenue(647.9, 34389.75, 9990.45))
  const peterSent = { ...revenue(1821.9, 26215.75, 8816.45), gross: 33443.95, commission_balance: 17399.3 }
  const PETER = await staff('PETER', peterSent, { ...peterSent, pcb: 1429.15, net: 26608.5, basic_pay_net: 9209.2 })
  // KWSP, SOCSO, EIS and SKBBK went on 15 Oct; no LHDN PV carries either PCB.
  for (const row of [KRIS, PETER]) {
    await pv('staff', row, 'KWSP', 2760, 'paid'); await pv('staff', row, 'SOCSO', 133.9, 'paid')
    await pv('staff', row, 'EIS', 23.8, 'paid'); await pv('staff', row, 'SKBBK', 44.65, 'paid')
  }
  // ALI: an LHDN PV (pending) carries the 300 sent; BEA: PCB down, net not up; CHE: an earlier PV paid 150 of the 300.
  const hq = (pcb, net) => ({ gross: 5000, net, epf_er: 650, epf_ee: 550, pcb })
  const ALI = await staff('ALI', hq(300, 4150), hq(200, 4250), { source: 'carried_forward', split: null })
  const aliPv = await pv('staff', ALI, 'PCB', 300, 'pending_approval')
  const BEA = await staff('BEA', hq(300, 4150), hq(200, 4150), { source: 'carried_forward', split: null })
  const CHE = await staff('CHE', hq(300, 4150), hq(200, 4250), { source: 'carried_forward', split: null })
  await pv('staff', CHE, 'PCB', 150, 'paid')
  // DAN: employee EPF −100, employer EPF +100 — KWSP owes what it was paid. EVA: employee EPF −50 alone, KWSP paid in full.
  const DAN = await staff('DAN', { gross: 5000, net: 4450, epf_er: 650, epf_ee: 550 }, { gross: 5000, net: 4550, epf_er: 750, epf_ee: 450 }, { source: 'carried_forward', split: null })
  await pv('staff', DAN, 'KWSP', 1200, 'paid')
  const EVA = await staff('EVA', { gross: 5000, net: 4450, epf_er: 650, epf_ee: 550 }, { gross: 5000, net: 4500, epf_er: 650, epf_ee: 500 }, { source: 'carried_forward', split: null })
  await pv('staff', EVA, 'KWSP', 1200, 'paid')
  // FAY: gross down. GUS: never sent, a negative PCB on the grid. SAM: a second payroll, open. LIM: sent, nothing open.
  const FAY = await staff('FAY', hq(300, 4150), { ...hq(200, 4050), gross: 4800 }, { source: 'carried_forward', split: null })
  const GUS = await staff('GUS', null, hq(-50, 4500), { source: 'carried_forward', split: null, kind: null })
  const SAM = await staff('SAM', hq(300, 4150), hq(300, 4150), { source: 'carried_forward', split: null, kind: 'second_payroll' })
  const LIM = await staff('LIM', hq(300, 4150), hq(300, 4150), { source: 'carried_forward', split: null, kind: null, status: 'submitted' })
  // A director: PCB 2,029.15 sent, 1,800.00 now, net up by the same.
  const DIR = id(400)
  await q(`INSERT INTO director_monthly_payroll (id, director_id, period_month, status, employee_name, employee_code, gross, net, epf_er, epf_ee,
      socso_er, socso_ee, eis_er, eis_ee, pcb, skbbk_amount, non_statutory_allowance, topup_opened_at, topup_kind)
    VALUES ($1, $2, $3, 'draft', 'LOO', 'D01', 14400, 10929.70, 1728, 1584, 0, 0, 0, 0, 1800, 0, 0, now(), 'resubmit')`, [DIR, id(401), PERIOD])
  await q(`INSERT INTO payroll_batch_lines (batch_id, period_month, scope, row_id, gross, net, epf_er, epf_ee, socso_er, socso_ee, eis_er, eis_ee,
      pcb, withholding_tax, skbbk, non_statutory_allowance, basic_pay_net, commission_balance)
    VALUES ($1, $2, 'directors', $3, 14400, 10700.55, 1728, 1584, 0, 0, 0, 0, 2029.15, 0, 0, 0, 0, 0)`, [B3, PERIOD, DIR])

  // ── Production refuses all of it ───────────────────────────────────────────
  check(await delta(KRIS), { falls: ['pcb'], lowered: null, rises: true, pcb: -1174, net: 1174 }, 'production: KRIS’s PCB 1,821.90 → 647.90 is a fall')
  check((await delta(PETER)).falls, ['pcb'], 'production: so is PETER’s')
  check(await refusal(KRIS), 'PCB', 'production: "KRIS’s resubmit can only add to what was sent — PCB went down"')

  await db.exec(MIGRATION)
  check(await md5('public.payroll_row_delta(text,uuid)'), '6046bc9c7b4df19976a7f8d40a6d307a', 'payroll_row_delta is the migration’s')
  check(await md5('public.payroll_money_label(text)'), 'bb24731c0b18ffd5473b366884fb4613', 'payroll_money_label is the migration’s')
  check(await md5('public.payment_cycle_unmasked(date)'), '534b03b7c47070dd7f745b1641a788a9', 'payment_cycle_unmasked is the migration’s')

  // ── KRIS and PETER go ──────────────────────────────────────────────────────
  check(await delta(KRIS), { falls: [], lowered: ['pcb'], rises: true, pcb: -1174, net: 1174 }, 'KRIS: PCB down 1,174.00 and net up 1,174.00, no LHDN PV — it goes')
  check(await delta(PETER), { falls: [], lowered: ['pcb'], rises: true, pcb: -392.75, net: 392.75 }, 'PETER: down 392.75, net up as much')
  check(await refusal(KRIS), null, 'nothing to refuse')
  check(await one(`SELECT public.payroll_row_delta('staff', $1)->>'basic_pay_net'`, [KRIS]), '1174.00', 'KRIS: the net basic carries it')

  // ── A PV in the way ────────────────────────────────────────────────────────
  check((await delta(ALI)).falls, ['pcb_on_pv'], 'ALI: an LHDN PV still carries the 300 sent — refused')
  check(await refusal(ALI), 'PCB (a PV already pays it)', '…and the refusal says why: "ALI’s resubmit can only add to what was sent — PCB (a PV already pays it) went down"')
  await q(`UPDATE payment_vouchers SET status = 'voided' WHERE id = $1`, [aliPv])
  check(await delta(ALI), { falls: [], lowered: ['pcb'], rises: true, pcb: -100, net: 100 }, 'ALI: the PV voided — it goes')
  check(await delta(CHE), { falls: [], lowered: ['pcb'], rises: true, pcb: -100, net: 100 }, 'CHE: an earlier PV paid 150, no more than the 200 now — it goes')

  // ── The money stays the employee's ────────────────────────────────────────
  check((await delta(BEA)).falls, ['pcb'], 'BEA: PCB down but net not up — the money would vanish, refused')
  check(await delta(DAN), { falls: [], lowered: ['epf_ee'], rises: true, pcb: 0, net: 100 }, 'DAN: employee EPF −100, employer +100 — KWSP owes what it was paid, it goes')
  check((await delta(EVA)).falls, ['epf_ee_on_pv'], 'EVA: employee EPF −50 while KWSP was paid in full — refused')
  check(await refusal(EVA), 'EPF (employee) (a PV already pays it)', '…named')

  // ── As before ──────────────────────────────────────────────────────────────
  check((await delta(FAY)).falls, ['gross', 'net', 'pcb'], 'FAY: gross down — refused as ever, and her PCB with it (net went down too)')
  check(await refusal(FAY), 'gross, net pay, PCB', '…in production’s words')
  check((await delta(GUS)).falls, ['pcb'], 'GUS: never sent — the callers do not ask, and nothing is looked up')
  check(await delta(SAM), { falls: [], lowered: [], rises: false, pcb: 0, net: 0 }, 'SAM: unchanged')
  check(await delta(DIR, 'directors'), { falls: [], lowered: ['pcb'], rises: true, pcb: -229.15, net: 229.15 }, 'a director: PCB 2,029.15 → 1,800.00, net up — it goes')
  check(await one(`SELECT public.payroll_money_label('commission_balance')`), 'commission balance', 'the old words are kept')

  // ── HR › Payment knows whose resubmit is open ──────────────────────────────
  await q(`INSERT INTO cycle_people VALUES ($1, 'staff', 'KRIS'), ($2, 'staff', 'PETER'), ($3, 'staff', 'SAM'), ($4, 'staff', 'LIM'), ($5, 'directors', 'LOO')`,
    [KRIS, PETER, SAM, LIM, DIR])
  await db.exec(`SELECT set_config('request.jwt.claim.sub', '${id(1)}', false)`)
  const cycle = await one(`SELECT public.payment_cycle_unmasked($1::date) AS c`, [PERIOD])
  check(Object.fromEntries(cycle.people.map(p => [p.name, p.resubmit_open])), { KRIS: true, LIM: false, LOO: true, PETER: true, SAM: false },
    'resubmit_open: KRIS, PETER and the director LOO — not a second payroll, not a row with nothing open')
  check(cycle.people.find(p => p.name === 'KRIS').source, 'commission', 'the rest of the person is as before')
  await db.exec(`SELECT set_config('request.jwt.claim.sub', '', false)`)

  // ── Who may call it ────────────────────────────────────────────────────────
  check(await one(`SELECT has_function_privilege('authenticated', 'public.payroll_row_delta(text,uuid)', 'EXECUTE')`), false,
    'a session can no longer read a row’s pay through payroll_row_delta')
  check(await one(`SELECT has_function_privilege('service_role', 'public.payroll_row_delta(text,uuid)', 'EXECUTE')`), true, 'the service role can')
  check(await one(`SELECT has_function_privilege('authenticated', 'public.payment_cycle_unmasked(date)', 'EXECUTE')`), false, 'payment_cycle_unmasked stays closed')

  // ── Twice changes nothing ──────────────────────────────────────────────────
  await db.exec(MIGRATION)
  check(await md5('public.payment_cycle_unmasked(date)'), '534b03b7c47070dd7f745b1641a788a9', 'a second run swaps nothing twice')
  check(await delta(KRIS), { falls: [], lowered: ['pcb'], rises: true, pcb: -1174, net: 1174 }, '…and KRIS still goes')

  // ── A body changed in production since is refused, and left as it was ─────
  await db.exec(`CREATE OR REPLACE FUNCTION public.payroll_money_label(p_key text) RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT p_key $$`)
  const drifted = await md5('public.payroll_money_label(text)')
  await assert.rejects(() => db.exec(MIGRATION), /payroll_money_label changed in production since this migration was written/)
  checks++
  await db.exec('ROLLBACK')  // the file's own transaction, aborted
  check(await md5('public.payroll_money_label(text)'), drifted, 'the refused run left the drifted body alone')
  check(await md5('public.payroll_row_delta(text,uuid)'), '6046bc9c7b4df19976a7f8d40a6d307a', '…and everything else as it was')

  console.log(`validate-resubmit-lowers-deduction: ${checks} checks passed`)
} finally {
  await db.close()
}
