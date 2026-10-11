// Local PostgreSQL regression for plan C's database side (2026-10-11 — the user's
// answer C, "现在就做完整的"): 20261011220000 gives the database the tab registry
// and tab_write_open / tab_write_guard; 20261011220100 puts the guard at the top of
// each DEFINER write a narrowing gate stands in front of. Both run VERBATIM — the
// second's helper over a stand-in function, since the real ones are production's.
// What is under test: the database answers what the app's actionsOnPages answers
// (tab-write-open.json — src/lib/tab-write-open.test.ts asks the app the same);
// tab_box_closed_in is tab_box_closed handed the tabs (tab-box-closed.json); the
// guard goes in once, first, and changes nothing else; it refuses a box closed on
// the function's pages, lets the rest through, and stands aside one step inside
// another function. No live I/O.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const db = new PGlite()
const migrations = new URL('../../supabase/migrations/', import.meta.url)
const q = async (sql, params = []) => (await db.query(sql, params)).rows
const one = async (sql, params = []) => Object.values((await q(sql, params))[0])[0]

let checks = 0
const check = (actual, expected, what) => {
  assert.deepEqual(actual, expected, what)
  checks++
}
const reject = async (sql, params, pattern, what) => {
  await assert.rejects(() => q(sql, params), pattern, what)
  checks++
}

/** Sign in holding these actions ({ cell: reach }), with these tabs (current_tabs()'s answer). */
async function as(actions, stored) {
  const held = Object.entries(actions).map(([cell, reach]) => `${cell}:${reach}`).join(',')
  await db.exec(`SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', false),
                        set_config('test.actions', '${held}', false),
                        set_config('test.tabs', '${stored === null ? '' : JSON.stringify(stored).replace(/'/g, "''")}', false)`)
}

try {
  await db.exec(`
    CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    -- The account's tabs, as current_tabs() answers them.
    CREATE FUNCTION public.current_tabs() RETURNS jsonb LANGUAGE sql STABLE AS
      $$ SELECT nullif(current_setting('test.tabs', true), '')::jsonb $$;
    -- The permission check: a wanted 'fn.action[:reach]' held at least that far.
    CREATE FUNCTION public.has_any_action(p_wants text[]) RETURNS boolean LANGUAGE sql STABLE AS $$
      SELECT EXISTS (
        SELECT 1 FROM unnest(p_wants) w, unnest(string_to_array(nullif(current_setting('test.actions', true), ''), ',')) h
         WHERE split_part(h, ':', 1) = split_part(w, ':', 1)
           AND array_position(ARRAY['own', 'dept', 'all'], split_part(h, ':', 2))
               >= array_position(ARRAY['own', 'dept', 'all'], coalesce(nullif(split_part(w, ':', 2), ''), 'all')))
    $$;
    CREATE FUNCTION public.audit_register(p_table text, p_label text, p_area text, p_read text[], p_mode text DEFAULT 'all',
      p_keys text[] DEFAULT '{}', p_labels text[] DEFAULT '{}', p_ignore text[] DEFAULT '{}', p_omit text[] DEFAULT '{}',
      p_diff boolean DEFAULT false, p_salary text[] DEFAULT '{}', p_nric text[] DEFAULT '{}', p_bank text[] DEFAULT '{}',
      p_needs text DEFAULT NULL, p_actor_column text DEFAULT NULL, p_reason text DEFAULT NULL)
      RETURNS text LANGUAGE sql AS $$ SELECT p_table $$;
  `)
  const tabsSql = (await readFile(new URL('20261011220000_tabs_in_the_database.sql', migrations), 'utf8')).replace(/\r\n/g, '\n')
  await db.exec(tabsSql)
  check(Number(await one(`SELECT count(*) FROM public.permission_page_tabs`)) > 150, true, 'the pages are seeded')
  check(Number(await one(`SELECT count(*) FROM public.permission_tab_cells`)) > 200, true, 'the boxes are seeded')
  await db.exec(tabsSql)
  check(Number(await one(`SELECT count(*) FROM public.permission_tab_cells WHERE cell = 'treasury.create'`)), 9,
    'run again, it seeds the same rows (Treasury · Create: Payments, Receipt, Daily bank, Fund IN, Fund OUT, BA, Overdue, Repayment schedule, Statements)')

  // ── tab_box_closed_in is tab_box_closed, handed the tabs ──
  for (const f of JSON.parse(await readFile(new URL('./tab-box-closed.json', import.meta.url), 'utf8'))) {
    const v = f.stored === null ? null : JSON.stringify(f.stored)
    check(await q(`SELECT public.tab_box_closed_in($1::jsonb, 'rev.rooms', 'view') AS view,
                          public.tab_box_closed_in($1::jsonb, 'rev.rooms', 'create') AS create`, [v]),
      [{ view: f.view, create: f.create }], `tab_box_closed_in — ${f.what}`)
  }

  // ── tab_write_open answers what the app answers ──
  for (const f of JSON.parse(await readFile(new URL('./tab-write-open.json', import.meta.url), 'utf8'))) {
    await as(f.actions, f.stored)
    if (f.sites) {
      const sites = f.sites.map(g => `${g.pages.join(',')}|${g.wants.join(',')}`)
      check(await one(`SELECT public.tab_writes_open($1::text[])`, [sites]), f.open, `tab_writes_open — ${f.what}`)
    } else {
      check(await one(`SELECT public.tab_write_open($1::text[], $2::text[])`, [f.pages, f.wants]), f.open, `tab_write_open — ${f.what}`)
    }
  }

  // ── The guard goes in once, first, and changes nothing else ──
  const guardsSql = (await readFile(new URL('20261011220100_definer_writes_ask_their_pages.sql', migrations), 'utf8')).replace(/\r\n/g, '\n')
  const helpers = guardsSql.match(/CREATE OR REPLACE FUNCTION pg_temp\.\w+[\s\S]*?\$g\$;/g) ?? []
  check(helpers.length, 3, 'the migration defines pg_temp.tab_guard_put, tab_guard and tab_guard_sites')
  check((guardsSql.match(/SELECT pg_temp\.tab_guard(_sites)?\(/g) ?? []).length > 70, true, 'and guards the writes with them')
  for (const h of helpers) await db.exec(h)
  await db.exec(`
    CREATE FUNCTION public.demo_terms(p_record_kind text, p_note text DEFAULT NULL)
    RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
    DECLARE
      v_said text := 'made';
    BEGIN
      -- its own check
      IF NOT public.has_any_action(ARRAY['treasury.approve']) THEN
        RAISE EXCEPTION 'Treasury · Approve is required' USING ERRCODE = '42501';
      END IF;
      RETURN v_said || coalesce(' ' || p_note, '');
    END
    $$;
    CREATE FUNCTION public.demo_outer() RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
    BEGIN
      RETURN public.demo_terms('loan', 'inside');
    END
    $$;
  `)
  const before = await one(`SELECT prosrc FROM pg_proc WHERE proname = 'demo_terms'`)
  const guard = `SELECT pg_temp.tab_guard('public.demo_terms(text, text)',
    $$CASE WHEN p_record_kind = 'loan' THEN ARRAY['/fund-out'] ELSE ARRAY['/fund-in'] END$$, ARRAY['treasury.approve'])`
  await db.exec(guard)
  const after = await one(`SELECT prosrc FROM pg_proc WHERE proname = 'demo_terms'`)
  const line = `PERFORM public.tab_write_guard(CASE WHEN p_record_kind = 'loan' THEN ARRAY['/fund-out'] ELSE ARRAY['/fund-in'] END, ARRAY['treasury.approve']);`
  check(after.split(line).length - 1, 1, 'the guard is in the body once')
  check(after.replace(`\n  ${line}`, ''), before, 'and nothing else changed')
  check(after.indexOf(line) < after.indexOf('its own check'), true, 'it is asked first, right after BEGIN')
  check(await one(`SELECT prosecdef FROM pg_proc WHERE proname = 'demo_terms'`), true, 'the function is still SECURITY DEFINER')
  await db.exec(guard)
  check(await one(`SELECT prosrc FROM pg_proc WHERE proname = 'demo_terms'`), after, 'asked again, it changes nothing')
  await reject(`SELECT pg_temp.tab_guard('public.demo_terms(text, text)', $$ARRAY['/payments']$$, ARRAY['treasury.approve'])`, [],
    /already asks other pages/, 'other pages over a guard already there are refused (swap_check changes a guard)')

  // ── It refuses a box closed on the function's pages, and only that ──
  const finance = { ticks: ['fin.payments.view', 'fin.payments.approve', 'fin.fund_out.view', 'fin.fund_in.view', 'fin.fund_in.approve'], boxes: [], cells: false }
  await as({ 'treasury.approve': 'all' }, finance)
  await reject(`SELECT public.demo_terms('loan')`, [], /a box in your permissions is unticked/, 'Fund OUT’s Approve unticked: a loan’s terms are closed')
  check(await one(`SELECT public.demo_terms('fund_source')`), 'made', 'Fund IN’s ticked: a fund source’s are open')
  check(await one(`SELECT public.demo_outer()`), 'made inside', 'one step inside another function, the guard stands aside')
  await reject(`DO $$ BEGIN PERFORM public.demo_terms('loan'); END $$`, [], /a box in your permissions is unticked/,
    'a DO block is nobody’s caller: asked from one, it is still the call itself')
  await as({ 'treasury.approve': 'all' }, { ...finance, boxes: [{ tab: 'fin.fund_out', action: 'approve', granted: true }] })
  check(await one(`SELECT public.demo_terms('loan')`), 'made', 'their own box gives Fund OUT’s Approve back')
  await as({ 'treasury.approve': 'all' }, null)
  check(await one(`SELECT public.demo_terms('loan')`), 'made', 'nobody unticked anything for them: nothing changes')
  await as({}, finance)
  await reject(`SELECT public.demo_terms('fund_source')`, [], /Treasury · Approve is required/, 'not holding it at all: the function’s own check refuses, as before')
  await db.exec(`SELECT set_config('request.jwt.claim.sub', '', false), set_config('test.tabs', '', false), set_config('test.actions', 'treasury.approve:all', false)`)
  check(await one(`SELECT public.demo_terms('loan')`), 'made', 'no signed-in caller (the service role, the database): no tabs, nothing closed')

  // ── A write reached through gates that ask different things: open while any lets it through ──
  await db.exec(`
    CREATE FUNCTION public.demo_bump(p_delta numeric) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
    BEGIN
      IF NOT public.has_any_action(ARRAY['billing.create', 'treasury.create']) THEN
        RAISE EXCEPTION 'Billing or Treasury · Create is required' USING ERRCODE = '42501';
      END IF;
      RETURN 'bumped ' || p_delta;
    END
    $$;
  `)
  await db.exec(`SELECT pg_temp.tab_guard_sites('public.demo_bump(numeric)', ARRAY['/invoices/[id]|billing.create', '/payments|treasury.create'])`)
  check((await one(`SELECT prosrc FROM pg_proc WHERE proname = 'demo_bump'`)).includes(
    `PERFORM public.tab_write_guard_sites(ARRAY['/invoices/[id]|billing.create', '/payments|treasury.create']);`), true, 'each gate is in the guard')
  const invoiceShut = { ticks: ['fin.invoice.view', 'fin.billing_allocator.view', 'fin.billing_allocator.create', 'fin.payments.view', 'fin.payments.create'], boxes: [], cells: false }
  await as({ 'billing.create': 'all', 'treasury.create': 'all' }, invoiceShut)
  check(await one(`SELECT public.demo_bump(5)`), 'bumped 5', 'Invoice’s Create unticked, Payments’ ticked: open through Payments')
  await as({ 'billing.create': 'all', 'treasury.create': 'all' }, { ...invoiceShut, boxes: [{ tab: 'fin.payments', action: 'create', granted: false }] })
  await reject(`SELECT public.demo_bump(5)`, [], /a box in your permissions is unticked/, 'both unticked: closed')
  await as({ 'billing.create': 'all' }, { ...invoiceShut, ticks: invoiceShut.ticks.filter(t => t !== 'fin.payments.create') })
  await reject(`SELECT public.demo_bump(5)`, [], /a box in your permissions is unticked/, 'a gate whose action they lack opens nothing for the other')

  // ── The Revenue app's requests ask their page's Create box (mig 20261011220200) ──
  const roomsSql = (await readFile(new URL('20261011150000_rooms_on_behalf_and_app_ticks.sql', migrations), 'utf8')).replace(/\r\n/g, '\n')
  const boxClosed = /CREATE OR REPLACE FUNCTION public\.tab_box_closed\(p_tab text, p_action text\)[\s\S]*?\$fn\$;/.exec(roomsSql)
  assert.ok(boxClosed, 'tab_box_closed is in mig 20261011150000')
  await db.exec(boxClosed[0])
  await db.exec(`
    CREATE TABLE public.member_requests(id uuid PRIMARY KEY, kind text NOT NULL);
    INSERT INTO public.member_requests VALUES ('00000000-0000-4000-8000-0000000000c1', 'claim'), ('00000000-0000-4000-8000-0000000000a1', 'waiting');
    CREATE FUNCTION public.member_prepare_request(p_kind text, p_sub_department uuid, p_detail jsonb, p_idempotency uuid, p_revision uuid)
    RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
    DECLARE
      v_staff uuid := NULL;
    BEGIN
      RETURN 'drafted ' || p_kind;
    END
    $$;
    CREATE FUNCTION public.member_submit_request(p_request uuid)
    RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
    DECLARE
      r public.member_requests%ROWTYPE;
    BEGIN
      SELECT * INTO r FROM public.member_requests WHERE id = p_request;
      RETURN 'sent ' || r.kind;
    END
    $$;
    CREATE FUNCTION public.member_cancel_request(p_request uuid)
    RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
    DECLARE
      r public.member_requests%ROWTYPE;
    BEGIN
      SELECT * INTO r FROM public.member_requests WHERE id = p_request;
      RETURN 'withdrawn ' || r.kind;
    END
    $$;
  `)
  const sendsSql = (await readFile(new URL('20261011220200_member_sends_ask_their_tab.sql', migrations), 'utf8')).replace(/\r\n/g, '\n')
  await db.exec(sendsSql)
  await db.exec(sendsSql)
  check(Number(await one(`SELECT count(*) FROM pg_proc WHERE prosrc LIKE '%PERFORM public.member_send_guard(%'`)), 3, 'three sends ask, once each — run twice')
  const CLAIM = '00000000-0000-4000-8000-0000000000c1'
  const WAITING = '00000000-0000-4000-8000-0000000000a1'
  const draft = kind => one(`SELECT public.member_prepare_request($1, NULL, '{}'::jsonb, gen_random_uuid(), NULL)`, [kind])
  // Requests' Create unticked, Waiting list & replacements' ticked.
  await as({ 'revenue_app.create': 'own' }, { ticks: ['rev.requests.view', 'rev.track.view', 'rev.track.create'], boxes: [], cells: false })
  await reject(`SELECT public.member_prepare_request('claim', NULL, '{}'::jsonb, gen_random_uuid(), NULL)`, [],
    /Sending a claim is not open to your account\./, 'Requests’ Create unticked: no claim is drafted')
  await reject(`SELECT public.member_submit_request($1)`, [CLAIM], /Sending a claim is not open to your account\./, 'nor sent')
  await reject(`SELECT public.member_cancel_request($1)`, [CLAIM], /Sending a claim is not open to your account\./, 'nor withdrawn')
  check(await draft('waiting'), 'drafted waiting', 'a waiting list is Waiting list & replacements’ to send')
  check(await one(`SELECT public.member_submit_request($1)`, [WAITING]), 'sent waiting', 'and is sent (the guard reads the request’s kind past the function’s own r)')
  // Waiting list & replacements' Create unticked.
  await as({ 'revenue_app.create': 'own' }, { ticks: ['rev.requests.view', 'rev.requests.create', 'rev.track.view'], boxes: [], cells: false })
  await reject(`SELECT public.member_prepare_request('replacement', NULL, '{}'::jsonb, gen_random_uuid(), NULL)`, [],
    /Sending a waiting list or a replacement is not open to your account\./, 'a replacement is closed with its page')
  check(await draft('claim'), 'drafted claim', 'while a claim is open')
  await as({ 'revenue_app.create': 'own' }, null)
  check(await one(`SELECT public.member_cancel_request($1)`, [CLAIM]), 'withdrawn claim', 'nobody unticked anything for them: as before')

  console.log(`tab writes: ${checks} checks passed`)
} finally {
  await db.close()
}
