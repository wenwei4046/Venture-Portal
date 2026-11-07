-- ============================================================================
-- 20261107233000_shares_take_effect_weighted_sales.sql
-- A share takes effect when the colleague accepts; the app's sales are what the commission is (2026-11-07).
-- ============================================================================
--
-- The user, 2026-11-07: "比如说这张单 request share 50% 给别人的话，其实不需要 HR approval … Sally 那边 accept 了
-- 之后，这张单就正常了，不需要 HR approval，所以它的 trail 只有两个" · "原本 1 万块的单分 50% 过去，他就只有 5,000 块
-- 的 Sales Record。当然 Sales Order 那边会显示完整 full figure，但会多一个 remark 特别显示出来，注明算他的 amount 是
-- 5,000 块" · "只要是 drop com 的情况也是一样的 … cut margin 太多 … drop 50%，原本 1 万块的 total sales order 也只是算
-- 5,000 块的 sales。当然 commission 还是一样算 1 万块的 50% … 25% … 2,500". And: the weighted sales are the whole
-- app's and Comm Cal's promotion figures' (the engine's Pass A, lib/commission, the same day); the two requests with HR
-- now take effect at deploy; HR is told (bell + push) whenever a share takes effect, to Cancel share on Comm Cal.
--
-- A. A share takes effect on accept.
--    share_request_take_effect() (new) runs every check revenue_share_request_decide's approve runs — the bill still
--    there, on the same owner, counting; share_request_blocked; each colleague still in the team; no standing close of
--    theirs from the bill's month on — worded for the colleague, and refuses with the reason, writing nothing. Else it
--    writes sales_order_shares as approve does (smaller parts first), marks the request 'approved' as decided by the
--    accepting colleague (no extra event: the trail is sent → accepted), and tells the owner and the colleagues
--    ("<order> · shared", ref share_request) and HR (topic revenue.shares, ref share_taken '<slug>/<YYYY-MM-01>', which
--    the app opens as /revenue/<slug>/<month>?view=requests), each holder's current product rate in HR's line.
--    member_share_order_answer calls it once nobody is left to answer, and RAISES its refusal: nothing changes, the
--    colleague's answer included. The requests with HR now are put through it here; one it refuses stays with HR (a
--    NOTICE), and revenue_share_request_decide stays for that one. Its 'partner' refusal no longer says HR decides.
--    notification_topic_may / notification_topics_sync know revenue.shares (revenue.edit, and Comm Cal's month page
--    open for it); it is given to everybody who holds member.requests today, and may() still decides at send.
--    app_notifications takes ref_kind 'share_taken'; notification_topics takes 'revenue.shares'.
--
-- B. The app's sales are what the commission is.
--    member_order_facts_with_old_bills weighs each holder's part by its commission's multiplier: a standing close's or
--    an applied run's penalised_orders entry for it (staffId, orderId, multiplier — the engine's PenalisedOrder); else 1
--    for a part a standing close paid or a bill released; else, while the scheme cuts commission by margin, for a holder
--    who is no department head, the penalty band the bill's margin falls in (engine.ts penaltyBandFor: the lowest
--    threshold at or above it, among its brand's bands — the brand it is written under, else the one its goods lines
--    sell most — or every brand's with neither); else 1. revenue is the part × that weight; full_revenue (the bill's
--    whole, unshared, unweighted) and weight are new columns; goods_revenue, the margins, kpi_qty and no_sales_cost stay
--    unweighted. Read set-based: the stored multipliers once, the bands once. RETURNS changes, so it is dropped and made
--    again from its own body — member_order_facts, the books and nothing else read it, by name. member_order_facts
--    keeps its columns: its revenue is the weighted one, for everything that reads it.
--    The order books: every entry gets "fullRevenue" (the whole bill's), and "weight" when it is below 1; the
--    department's entry is the whole bill — revenue the parts' weighted sum, its weight theirs (one weight when they
--    share it, else the sum over the whole). revenue stays what is counted; the margins are unchanged.
--    The Arena's fair boards count each holder's part, weighted, reading member_order_facts (the old bills topped up
--    already out) joined back to the bill for its fair and booth: the roster per holder, 'held' the uncleared parts,
--    an unassigned bill counted once; a week's booth is still guessed from the bills a seller wrote.
--
-- Made again from PRODUCTION's bodies (2026-11-07 KL, 20261107230000 live; pg_get_functiondef, md5 of prosrc) — refused
-- if production's body has changed since; a second run changes nothing:
--
--   share_request_take_effect               (new)                            → 06ae489079db169c81a870435a39aecc
--   member_share_order_answer               5da728faa7bf1a9f9756b3d3b0457c13 → 7973666744955b47838e957fb79c15bd
--   revenue_share_request_decide            9b4e77261994128a41802f53666ea135 → b01796bdaa1d718a14c3316db25e6938
--   notification_topic_may                  5bd3decefb4fb753a3ef464573ff0b66 → 0ff1a9b15be23a1b8e2a60f4ac65b842
--   notification_topics_sync                931c63761257d74fbe3b0162f2d71464 → 507c5b4dd216e1b6aba7e7dc682cf72f
--   member_order_facts_with_old_bills       a44fa5e5eb5934a60a8927a886ab69cf → 95f3dd9275fdeed139a02ebea60fd6a8
--   member_order_facts                      987d328c0ec4087e4ce6f3e58346a382 (read as it is)
--   member_order_book_for_staff             dda01c1653e5bccfc6191905c5f4e5bf → dfcd7bd64e1a09c4d859ba7a36439d3c
--   member_principal_department_order_book  06407bc90bc5e9ca1a888bd19a9fc730 → 33e4dcdcf33d2b22a18e99e72b46b0e3
--   member_arena_history_for_staff          44f66cb5dc4526ae177534929043bc5c → 38f1eebe1f89c44dfe5e8fe097b946e0
--   member_arena_booth_history_for_staff    877c601f547dd01fecec83a4799a93bd → 43ddde9e982853d0e6d02ed1d70359de
--
-- CREATE OR REPLACE keeps each one's grants and comment; the dropped one gets its own back (service_role only) and its
-- comment, a sentence longer. The new helper is the DEFINER bodies' and the service role's only.
--
-- PGlite: tests/member-sql/validate-shares-weighted-sales.mjs (production's bodies, md5-checked; the migration
-- verbatim, twice).
--
-- Dry run on production, rolled back (2026-11-07 ~23:05 KL, 20261107230000 live; Fair's scheme, Sep–Nov): the two with
-- HR took effect — HC-SO-2610-015 LOUIS → SHELDON TAN, HC-SO-2611-028 KAR JIUN → SALLY; owner and colleague told, the
-- six HR accounts told (share_taken fair/2026-10-01, fair/2026-11-01). member_order_facts 784 → 786 rows: those two
-- bills in halves, every other row as before; no part weighs below 1 (Fair's penalty is off; nothing is stored). The 26
-- staff books and the department's as before but those two bills, fullRevenue on every entry, the margins the same.
-- The fair boards: HR's shares split between their holders; each holder on the roster — LUCAS CHOOI's August halves
-- now WEI PIN's (+RM 2,720) and ESTHER's (+RM 2,245). The penalty switched on in the transaction would cut Sep–Nov's
-- sales from RM 4,443,417.50 to RM 4,024,016.50 (85 parts).

BEGIN;

-- Production's bodies, or this migration's own once it has run; the new one absent, or this migration's.
DO $$
DECLARE
  r record;
  v_md5 text;
BEGIN
  FOR r IN SELECT * FROM (VALUES
      ('public.member_share_order_answer(uuid, boolean, text)', '5da728faa7bf1a9f9756b3d3b0457c13', '7973666744955b47838e957fb79c15bd'),
      ('public.revenue_share_request_decide(uuid, boolean, text)', '9b4e77261994128a41802f53666ea135', 'b01796bdaa1d718a14c3316db25e6938'),
      ('public.notification_topic_may(uuid, text)', '5bd3decefb4fb753a3ef464573ff0b66', '0ff1a9b15be23a1b8e2a60f4ac65b842'),
      ('public.notification_topics_sync(text[])', '931c63761257d74fbe3b0162f2d71464', '507c5b4dd216e1b6aba7e7dc682cf72f'),
      ('public.member_order_facts_with_old_bills(uuid, date, date)', 'a44fa5e5eb5934a60a8927a886ab69cf', '95f3dd9275fdeed139a02ebea60fd6a8'),
      ('public.member_order_facts(uuid, date, date)', '987d328c0ec4087e4ce6f3e58346a382', '987d328c0ec4087e4ce6f3e58346a382'),
      ('public.member_order_book_for_staff(uuid, uuid, date, date)', 'dda01c1653e5bccfc6191905c5f4e5bf', 'dfcd7bd64e1a09c4d859ba7a36439d3c'),
      ('public.member_principal_department_order_book(uuid, text, text)', '06407bc90bc5e9ca1a888bd19a9fc730', '33e4dcdcf33d2b22a18e99e72b46b0e3'),
      ('public.member_arena_history_for_staff(uuid, uuid)', '44f66cb5dc4526ae177534929043bc5c', '38f1eebe1f89c44dfe5e8fe097b946e0'),
      ('public.member_arena_booth_history_for_staff(uuid, uuid)', '877c601f547dd01fecec83a4799a93bd', '43ddde9e982853d0e6d02ed1d70359de')
    ) AS t(sig, before_md5, after_md5)
  LOOP
    IF to_regprocedure(r.sig) IS NULL THEN
      RAISE EXCEPTION '% is not on this database', r.sig;
    END IF;
    SELECT md5(replace(prosrc, E'\r', '')) INTO v_md5 FROM pg_proc WHERE oid = to_regprocedure(r.sig);
    IF v_md5 IS DISTINCT FROM r.before_md5 AND v_md5 IS DISTINCT FROM r.after_md5 THEN
      RAISE EXCEPTION '% is md5 %, not the body this migration was written from', r.sig, v_md5;
    END IF;
  END LOOP;
  IF to_regprocedure('public.share_request_take_effect(uuid, uuid, text)') IS NOT NULL THEN
    SELECT md5(replace(prosrc, E'\r', '')) INTO v_md5 FROM pg_proc
     WHERE oid = to_regprocedure('public.share_request_take_effect(uuid, uuid, text)');
    IF v_md5 IS DISTINCT FROM '06ae489079db169c81a870435a39aecc' THEN
      RAISE EXCEPTION 'public.share_request_take_effect(uuid, uuid, text) is already here as md5 %, not this migration''s', v_md5;
    END IF;
  END IF;
END $$;

-- The old text, every run of whitespace matching any run, replaced by the new — found exactly once, or refused
-- (20261031210000's).
CREATE OR REPLACE FUNCTION pg_temp.swap_text(p_src text, p_old text, p_new text)
RETURNS text
LANGUAGE plpgsql AS $fn$
DECLARE
  v_pat   text := regexp_replace(regexp_replace(p_old, '([.^$*+?()\[\]{}|\\])', '\\\1', 'g'), '\s+', '\\s+', 'g');
  v_n     integer;
  v_found text;
BEGIN
  SELECT count(*) INTO v_n FROM regexp_matches(p_src, v_pat, 'g');
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'A statement this migration swaps is there % times, not once — production changed since it was written: %', v_n, left(p_old, 80);
  END IF;
  v_found := (regexp_match(p_src, '(' || v_pat || ')'))[1];
  RETURN replace(p_src, v_found, p_new);
END
$fn$;

-- Everything from the start text through the end text (each found exactly once, the end after the start) replaced by
-- the new: a whole run of a body's CTEs, which the md5 guard above already holds to production's.
CREATE OR REPLACE FUNCTION pg_temp.swap_span(p_src text, p_start text, p_end text, p_new text)
RETURNS text
LANGUAGE plpgsql AS $fn$
DECLARE
  v_s   text := regexp_replace(regexp_replace(p_start, '([.^$*+?()\[\]{}|\\])', '\\\1', 'g'), '\s+', '\\s+', 'g');
  v_e   text := regexp_replace(regexp_replace(p_end, '([.^$*+?()\[\]{}|\\])', '\\\1', 'g'), '\s+', '\\s+', 'g');
  v_sf  text;
  v_ef  text;
  v_at  integer;
  v_to  integer;
BEGIN
  IF (SELECT count(*) FROM regexp_matches(p_src, v_s, 'g')) <> 1 OR (SELECT count(*) FROM regexp_matches(p_src, v_e, 'g')) <> 1 THEN
    RAISE EXCEPTION 'A run this migration swaps does not start or end exactly once — production changed since it was written: %', left(p_start, 80);
  END IF;
  v_sf := (regexp_match(p_src, '(' || v_s || ')'))[1];
  v_ef := (regexp_match(p_src, '(' || v_e || ')'))[1];
  v_at := strpos(p_src, v_sf);
  v_to := strpos(p_src, v_ef) + length(v_ef);
  IF v_to <= v_at THEN
    RAISE EXCEPTION 'A run this migration swaps ends before it starts: %', left(p_start, 80);
  END IF;
  RETURN left(p_src, v_at - 1) || p_new || substr(p_src, v_to);
END
$fn$;

-- A function made from its own body (or p_from's) with these statements and runs swapped, unless it is this
-- migration's already (its md5). Each old text starts at its first character: a leading run of whitespace would take
-- the line break before it. p_drop: its RETURNS changes, so it is dropped first.
CREATE OR REPLACE FUNCTION pg_temp.made_with(p_sig text, p_after text, p_swaps text[], p_from text DEFAULT NULL,
                                             p_spans text[] DEFAULT NULL, p_drop boolean DEFAULT false)
RETURNS void
LANGUAGE plpgsql AS $fn$
DECLARE
  v_def text;
  i     integer;
BEGIN
  IF to_regprocedure(p_sig) IS NOT NULL
     AND (SELECT md5(replace(prosrc, E'\r', '')) FROM pg_proc WHERE oid = to_regprocedure(p_sig)) = p_after THEN
    RETURN;  -- made already
  END IF;
  v_def := pg_get_functiondef(to_regprocedure(coalesce(p_from, p_sig)));
  FOR i IN 1 .. coalesce(array_length(p_swaps, 1), 0) / 2 LOOP
    v_def := pg_temp.swap_text(v_def, p_swaps[2 * i - 1], p_swaps[2 * i]);
  END LOOP;
  FOR i IN 1 .. coalesce(array_length(p_spans, 1), 0) / 3 LOOP
    v_def := pg_temp.swap_span(v_def, p_spans[3 * i - 2], p_spans[3 * i - 1], p_spans[3 * i]);
  END LOOP;
  IF p_drop THEN
    EXECUTE 'DROP FUNCTION ' || p_sig;
  END IF;
  EXECUTE v_def;
END
$fn$;

-- ── A. 1. What a notice may point at, and the topic HR is told by ───────────────────────────────────────────────────
DO $$
DECLARE
  v_def text;
BEGIN
  SELECT pg_get_constraintdef(c.oid) INTO v_def FROM pg_constraint c
   WHERE c.conname = 'app_notifications_ref_kind_check' AND c.conrelid = 'public.app_notifications'::regclass;
  IF v_def = 'CHECK ((ref_kind = ANY (ARRAY[''att_request''::text, ''att_today''::text, ''booking''::text, ''crm_contact''::text, ''crm_invite''::text, ''hiring_request''::text, ''hr_staff''::text, ''it_request''::text, ''member_request''::text, ''memo''::text, ''mkt_project''::text, ''payment_request''::text, ''share_request''::text, ''share_taken''::text])))' THEN
    NULL;  -- made already
  ELSIF v_def = 'CHECK ((ref_kind = ANY (ARRAY[''att_request''::text, ''att_today''::text, ''booking''::text, ''crm_contact''::text, ''crm_invite''::text, ''hiring_request''::text, ''hr_staff''::text, ''it_request''::text, ''member_request''::text, ''memo''::text, ''mkt_project''::text, ''payment_request''::text, ''share_request''::text])))' THEN
    ALTER TABLE public.app_notifications DROP CONSTRAINT app_notifications_ref_kind_check;
    -- (20261107233000) share_taken: a share that took effect, '<sub-department slug>/<its month, YYYY-MM-01>' — Comm
    -- Cal's Requests for that month.
    ALTER TABLE public.app_notifications ADD CONSTRAINT app_notifications_ref_kind_check CHECK (ref_kind = ANY (ARRAY[
      'att_request', 'att_today', 'booking', 'crm_contact', 'crm_invite', 'hiring_request', 'hr_staff', 'it_request',
      'member_request', 'memo', 'mkt_project', 'payment_request', 'share_request', 'share_taken']));
  ELSE
    RAISE EXCEPTION 'app_notifications_ref_kind_check is %, not the one this migration was written from', v_def;
  END IF;

  SELECT pg_get_constraintdef(c.oid) INTO v_def FROM pg_constraint c
   WHERE c.conname = 'notification_topics_topic_check' AND c.conrelid = 'public.notification_topics'::regclass;
  IF v_def = 'CHECK ((topic = ANY (ARRAY[''hiring.guest''::text, ''it.requests''::text, ''member.requests''::text, ''people.probation''::text, ''revenue.shares''::text, ''rooms.guest''::text])))' THEN
    NULL;  -- made already
  ELSIF v_def = 'CHECK ((topic = ANY (ARRAY[''hiring.guest''::text, ''it.requests''::text, ''member.requests''::text, ''people.probation''::text, ''rooms.guest''::text])))' THEN
    ALTER TABLE public.notification_topics DROP CONSTRAINT notification_topics_topic_check;
    -- (20261107233000) revenue.shares: a share that took effect, for whoever may change shares on Comm Cal.
    ALTER TABLE public.notification_topics ADD CONSTRAINT notification_topics_topic_check CHECK (topic = ANY (ARRAY[
      'hiring.guest', 'it.requests', 'member.requests', 'people.probation', 'revenue.shares', 'rooms.guest']));
  ELSE
    RAISE EXCEPTION 'notification_topics_topic_check is %, not the one this migration was written from', v_def;
  END IF;
END $$;

SELECT pg_temp.made_with('public.notification_topic_may(uuid, text)', '0ff1a9b15be23a1b8e2a60f4ac65b842', ARRAY[
    $o$p_topic NOT IN ('hiring.guest', 'rooms.guest', 'member.requests', 'it.requests')$o$,
    $n$p_topic NOT IN ('hiring.guest', 'rooms.guest', 'member.requests', 'it.requests', 'revenue.shares')$n$,
    $o$WHEN 'member.requests' THEN public.member_is_manager('member_requests_manage') IS TRUE
        AND public.tab_write_open(ARRAY['/member-admin'], ARRAY['member.manage']) IS TRUE$o$,
    $n$WHEN 'member.requests' THEN public.member_is_manager('member_requests_manage') IS TRUE
        AND public.tab_write_open(ARRAY['/member-admin'], ARRAY['member.manage']) IS TRUE
      -- (20261107233000) A share that took effect: whoever may change shares on Comm Cal.
      WHEN 'revenue.shares' THEN public.has_any_action(ARRAY['revenue.edit']) IS TRUE
        AND public.tab_write_open(ARRAY['/revenue/[sub]/[period]'], ARRAY['revenue.edit']) IS TRUE$n$
  ]);

SELECT pg_temp.made_with('public.notification_topics_sync(text[])', '507c5b4dd216e1b6aba7e7dc682cf72f', ARRAY[
    $o$WHERE t IN ('hiring.guest', 'rooms.guest', 'member.requests', 'people.probation')$o$,
    $n$WHERE t IN ('hiring.guest', 'rooms.guest', 'member.requests', 'people.probation', 'revenue.shares')$n$,
    $o$AND topic IN ('hiring.guest', 'rooms.guest', 'member.requests', 'people.probation')$o$,
    $n$AND topic IN ('hiring.guest', 'rooms.guest', 'member.requests', 'people.probation', 'revenue.shares')$n$
  ]);

-- Everybody told of Revenue app requests today is told of shares too; notification_topic_may still decides at send.
INSERT INTO public.notification_topics (user_id, topic)
SELECT t.user_id, 'revenue.shares' FROM public.notification_topics t WHERE t.topic = 'member.requests'
ON CONFLICT (user_id, topic) DO NOTHING;

-- ── A. 2. A share takes effect ──────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.share_request_take_effect(p_request uuid, p_by uuid, p_by_name text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_r      public.sales_order_share_requests%ROWTYPE;
  v_order  public.sales_orders%ROWTYPE;
  v_reason text;
  v_part   record;
  v_today  date := (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date;
  v_scheme uuid;
  v_line   text;
  v_with   text;
  v_slug   text;
BEGIN
  -- (20261107233000) Handed who decides it: a signed-in caller only ever as themselves.
  IF auth.uid() IS NOT NULL AND p_by IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'A share takes effect as the colleague who accepted it.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_r FROM public.sales_order_share_requests WHERE id = p_request FOR UPDATE;
  IF v_r.id IS NULL THEN
    RETURN 'That share request is not there any more.';
  END IF;
  IF v_r.status NOT IN ('partner', 'hr') THEN
    RETURN 'That share request is settled already.';
  END IF;
  -- Every check revenue_share_request_decide's approve makes, worded for the colleague; a refusal writes nothing.
  SELECT * INTO v_order FROM public.sales_orders WHERE id = v_r.order_id;
  IF v_order.id IS NULL THEN
    RETURN v_r.order_no || ' is not there any more, so it cannot be shared.';
  END IF;
  IF v_order.staff_id IS DISTINCT FROM v_r.owner_staff_id THEN
    RETURN format('%s is %s’s now — it moved since %s asked, so it cannot be shared.', v_order.order_no,
      coalesce((SELECT s.employee_name FROM public.hr_staff_costs s WHERE s.id = v_order.staff_id), 'nobody'), v_r.owner_name);
  END IF;
  IF v_order.cancelled THEN
    RETURN v_order.order_no || ' does not count any more, so it cannot be shared.';
  END IF;
  v_reason := public.share_request_blocked(v_r.order_id);
  IF v_reason IS NOT NULL THEN
    RETURN v_reason;
  END IF;
  FOR v_part IN SELECT y.staff_id, y.staff_name FROM public.sales_order_share_request_parts y WHERE y.request_id = p_request LOOP
    IF NOT EXISTS (SELECT 1 FROM public.share_request_team(v_r.sub_department_id) t WHERE t.staff_id = v_part.staff_id) THEN
      RETURN format('%s is no longer in this sub-department’s team, so no part of %s would be paid to them.',
        v_part.staff_name, v_order.order_no);
    END IF;
    IF EXISTS (SELECT 1 FROM public.comm_salesperson_closes x
                WHERE x.staff_id = v_part.staff_id AND x.sub_department_id = v_r.sub_department_id
                  AND x.period_month >= v_order.period_month AND x.reopened_at IS NULL) THEN
      RETURN format('%s’s %s is closed on Comm Cal — HR reopens it before this share can take effect.', v_part.staff_name,
        to_char(v_order.period_month, 'Mon YYYY'));
    END IF;
  END LOOP;

  -- Smaller parts first, so a part that shrinks makes room before one that grows (the table's guard refuses any moment
  -- the parts would leave the owner nothing) — as approve writes them.
  FOR v_part IN
    SELECT y.staff_id, y.share_pct FROM public.sales_order_share_request_parts y
      LEFT JOIN public.sales_order_shares sh ON sh.order_id = v_r.order_id AND sh.staff_id = y.staff_id
     WHERE y.request_id = p_request
     ORDER BY y.share_pct - coalesce(sh.share_pct, 0), y.staff_id
  LOOP
    INSERT INTO public.sales_order_shares (order_id, staff_id, share_pct)
    VALUES (v_r.order_id, v_part.staff_id, v_part.share_pct)
    ON CONFLICT (order_id, staff_id) DO UPDATE SET share_pct = EXCLUDED.share_pct;
  END LOOP;
  -- Decided by the colleague who accepted; the trail stays sent → accepted.
  UPDATE public.sales_order_share_requests
     SET status = 'approved', updated_at = now(), decided_at = now(), decided_by = p_by, decided_by_name = p_by_name,
         decision_note = NULL
   WHERE id = p_request;

  BEGIN
    SELECT string_agg(h.name || ' ' || regexp_replace(to_char(round(h.pct * 100, 2), 'FM990.00'), '\.?0+$', '') || '%', ' · '
                      ORDER BY h.owner DESC, h.name) INTO v_line
      FROM (SELECT coalesce(s.employee_name, '') AS name,
                   1 - coalesce((SELECT sum(sh.share_pct) FROM public.sales_order_shares sh
                                  WHERE sh.order_id = so.id AND sh.staff_id IS DISTINCT FROM so.staff_id), 0) AS pct, true AS owner
              FROM public.sales_orders so LEFT JOIN public.hr_staff_costs s ON s.id = so.staff_id WHERE so.id = v_r.order_id
            UNION ALL
            SELECT coalesce(s.employee_name, ''), sh.share_pct, false
              FROM public.sales_order_shares sh JOIN public.sales_orders so ON so.id = sh.order_id
              LEFT JOIN public.hr_staff_costs s ON s.id = sh.staff_id
             WHERE sh.order_id = v_r.order_id AND sh.staff_id IS DISTINCT FROM so.staff_id) h;
    PERFORM public.notify_people(
      ARRAY(SELECT s.user_id FROM public.hr_staff_costs s WHERE s.id = v_r.owner_staff_id)
        || ARRAY(SELECT s.user_id FROM public.sales_order_share_request_parts y JOIN public.hr_staff_costs s ON s.id = y.staff_id
                  WHERE y.request_id = p_request),
      'share', v_r.order_no || ' · shared',
      coalesce(p_by_name, 'Your colleague') || ' accepted: ' || coalesce(v_line, '') || '. Each part counts in its holder’s sales and commission.',
      'share_request', p_request::text);

    -- HR: who shared what with whom, at each one's current product rate, and where to cancel it.
    SELECT c.id INTO v_scheme FROM public.comm_schemes c
     WHERE c.sub_department_id = v_r.sub_department_id AND c.is_active
       AND c.effective_from <= v_today AND (c.effective_to IS NULL OR c.effective_to >= v_today)
     ORDER BY c.effective_from DESC, c.created_at DESC, c.id LIMIT 1;
    SELECT string_agg(regexp_replace(to_char(round(y.share_pct * 100, 2), 'FM990.00'), '\.?0+$', '') || '% with ' || y.staff_name
                      || coalesce(' (' || (SELECT regexp_replace(to_char(round(k.product_rate * 100, 2), 'FM990.00'), '\.?0+$', '') || '%'
                                              FROM public.comm_hierarchy h JOIN public.comm_ranks k ON k.id = h.rank_id
                                             WHERE h.scheme_id = v_scheme AND h.staff_id = y.staff_id AND h.effective_from <= v_today
                                               AND (h.effective_to IS NULL OR h.effective_to >= v_today)
                                             ORDER BY h.effective_from DESC, h.created_at DESC, h.id LIMIT 1) || ')', ''),
                      ' and ' ORDER BY y.staff_name, y.staff_id) INTO v_with
      FROM public.sales_order_share_request_parts y WHERE y.request_id = p_request;
    SELECT btrim(regexp_replace(lower(btrim(d.name)), '[^a-z0-9]+', '-', 'g'), '-') INTO v_slug
      FROM public.comm_sub_departments d WHERE d.id = v_r.sub_department_id;
    PERFORM public.notify_topic('revenue.shares', 'share', v_r.order_no || ' · shared',
      v_r.owner_name
        || coalesce(' (' || (SELECT regexp_replace(to_char(round(k.product_rate * 100, 2), 'FM990.00'), '\.?0+$', '') || '%'
                               FROM public.comm_hierarchy h JOIN public.comm_ranks k ON k.id = h.rank_id
                              WHERE h.scheme_id = v_scheme AND h.staff_id = v_r.owner_staff_id AND h.effective_from <= v_today
                                AND (h.effective_to IS NULL OR h.effective_to >= v_today)
                              ORDER BY h.effective_from DESC, h.created_at DESC, h.id LIMIT 1) || ')', '')
        || ' shared ' || coalesce(v_with, 'a part') || ' — ' || v_r.order_no || ', RM '
        || regexp_replace(to_char(v_order.order_total, 'FM999,999,990.00'), '\.00$', '')
        || '. Cancel share on Comm Cal if it should not stand.',
      'share_taken', coalesce(v_slug, v_r.sub_department_id::text) || '/' || to_char(date_trunc('month', v_order.period_month), 'YYYY-MM-DD'));
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'share_request_take_effect: nobody was told of % (%)', v_r.order_no, SQLERRM;
  END;
  RETURN NULL;
END
$function$;

COMMENT ON FUNCTION public.share_request_take_effect(uuid, uuid, text) IS
  $c$A share takes effect (20261107233000): every check revenue_share_request_decide's approve makes, worded for the colleague — a refusal is returned and nothing is written; else the shares written as approve writes them, the request approved as decided by p_by (the colleague who accepted; no event: its trail is sent → accepted), and the owner, the colleagues and HR (topic revenue.shares, ref share_taken '<slug>/<YYYY-MM-01>') told. member_share_order_answer calls it once everybody has accepted; 20261107233000 put the requests with HR through it.$c$;

REVOKE ALL ON FUNCTION public.share_request_take_effect(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.share_request_take_effect(uuid, uuid, text) TO service_role;

SELECT pg_temp.made_with('public.member_share_order_answer(uuid, boolean, text)', '7973666744955b47838e957fb79c15bd', ARRAY[
    $o$v_waiting text;$o$,
    $n$v_waiting text;
  v_reason  text;$n$,
    $o$ELSIF v_waiting IS NULL THEN
    UPDATE public.sales_order_share_requests SET status = 'hr', updated_at = now() WHERE id = p_request;$o$,
    $n$ELSIF v_waiting IS NULL THEN
    -- (20261107233000) Everybody has accepted: the share takes effect now, on every check HR's approval made — or
    -- nothing changes, this answer included.
    v_reason := public.share_request_take_effect(p_request, v_me, v_name);
    IF v_reason IS NOT NULL THEN
      RAISE EXCEPTION '%', v_reason USING ERRCODE = '22023';
    END IF;$n$,
    $o$ELSIF v_waiting IS NULL THEN
      PERFORM public.notify_people(ARRAY[v_owner], 'share', v_r.order_no || ' · accepted — with HR now',
        v_name || ' accepted sharing ' || v_r.order_no || '. HR approves it on Comm Cal.', 'share_request', p_request::text);$o$,
    $n$ELSIF v_waiting IS NULL THEN
      NULL;  -- (20261107233000) share_request_take_effect told the owner, the colleagues and HR.$n$
  ]);

SELECT pg_temp.made_with('public.revenue_share_request_decide(uuid, boolean, text)', 'b01796bdaa1d718a14c3316db25e6938', ARRAY[
    $o$' to accept — HR decides once everybody has.'$o$,
    $n$' to accept — it takes effect once everybody has.'$n$
  ]);

-- ── B. 1. Every bill, flagged and weighed ───────────────────────────────────────────────────────────────────────────
SELECT pg_temp.made_with('public.member_order_facts_with_old_bills(uuid, date, date)', '95f3dd9275fdeed139a02ebea60fd6a8', ARRAY[
    $o$no_sales_cost numeric, old_bill boolean)$o$,
    $n$no_sales_cost numeric, old_bill boolean, full_revenue numeric, weight numeric)$n$
  ], p_spans => ARRAY[
    $o$SELECT s.id,x.staff_id,s.order_no$o$,
    $o$LEFT JOIN given g ON g.order_id=s.id;$o$,
    $n$, stored AS (
  -- (20261107233000) What a standing close or an applied run paid a part at: the multiplier its margin penalty left
  -- (the engine's PenalisedOrder: staffId, orderId, multiplier), a close's before a run's, the newest first. Read once.
  SELECT DISTINCT ON (e.staff_id,e.order_id) e.staff_id,e.order_id,e.multiplier
  FROM (
   SELECT CASE WHEN p->>'staffId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN (p->>'staffId')::uuid END AS staff_id,
    CASE WHEN p->>'orderId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN (p->>'orderId')::uuid END AS order_id,
    CASE WHEN jsonb_typeof(p->'multiplier')='number' THEN (p->>'multiplier')::numeric END AS multiplier,
    0 AS kind,x.period_month AS at
   FROM public.comm_salesperson_closes x JOIN scheme c ON c.sub_department_id=x.sub_department_id
   CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(x.penalised_orders)='array' THEN x.penalised_orders ELSE '[]'::jsonb END) p
   WHERE x.reopened_at IS NULL
   UNION ALL
   SELECT CASE WHEN p->>'staffId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN (p->>'staffId')::uuid END,
    CASE WHEN p->>'orderId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN (p->>'orderId')::uuid END,
    CASE WHEN jsonb_typeof(p->'multiplier')='number' THEN (p->>'multiplier')::numeric END,
    1,r.period_month
   FROM public.comm_runs r JOIN scheme c ON c.sub_department_id=r.sub_department_id
   CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(r.penalised_orders)='array' THEN r.penalised_orders ELSE '[]'::jsonb END) p
   WHERE r.status IN ('applied','locked')
  ) e
  WHERE e.staff_id IS NOT NULL AND e.order_id IS NOT NULL AND e.multiplier IS NOT NULL
  ORDER BY e.staff_id,e.order_id,e.kind,e.at DESC
 ), paid AS (
  -- A part a standing close paid (its order_ids), when nothing is stored of it: paid in full.
  SELECT DISTINCT x.staff_id,o.order_id FROM public.comm_salesperson_closes x JOIN scheme c ON c.sub_department_id=x.sub_department_id
  CROSS JOIN LATERAL unnest(x.order_ids) AS o(order_id) WHERE x.reopened_at IS NULL
 ), released AS (
  -- A bill released (paid by a later run), when nothing is stored of it: paid in full.
  SELECT DISTINCT r.order_no FROM public.comm_order_releases r JOIN scheme c ON c.sub_department_id=r.sub_department_id
 ), bands AS (
  -- The penalty bands, only while the scheme cuts commission by margin (engine.ts penaltyBandFor). Read once.
  SELECT b.id,b.margin_pct,b.commission_multiplier,b.sort_order,br.code
  FROM public.comm_margin_bands b JOIN public.comm_brands br ON br.id=b.brand_id JOIN scheme c ON c.id=b.scheme_id
  WHERE b.kind='penalty' AND c.enable_margin_penalty
 ), line_brand AS (
  -- A bill written under no brand answers to the brand its goods lines sell most (marginBase).
  SELECT DISTINCT ON (z.order_id) z.order_id,z.brand
  FROM (SELECT l.order_id,btrim(l.brand_code) AS brand,sum(l.line_amount) AS rev,min(l.line_no) AS first_line
        FROM split s JOIN public.sales_order_lines l ON l.order_id=s.id
        WHERE nullif(btrim(s.brand_code),'') IS NULL AND nullif(btrim(l.brand_code),'') IS NOT NULL
         AND EXISTS(SELECT 1 FROM bands)
         AND EXISTS(SELECT 1 FROM public.comm_item_groups g WHERE g.scheme_id=p_scheme
          AND upper(btrim(g.item_group))=upper(btrim(l.item_group)) AND g.commissionable)
        GROUP BY l.order_id,btrim(l.brand_code)) z
  ORDER BY z.order_id,z.rev DESC,z.first_line,z.brand
 ), held AS (
  SELECT s.id,x.staff_id,s.order_no,s.order_date,s.period_month,s.recognition,
  coalesce(nullif(btrim(s.brand_code),''),'UNCLASSIFIED') AS brand,s.is_cleared,
  CASE WHEN x.owner THEN s.main-coalesce(g.main,0) ELSE round(s.main*x.part,2) END AS part_revenue,
  CASE WHEN x.owner THEN s.margin_base-coalesce(g.margin_base,0) ELSE round(s.margin_base*x.part,2) END AS goods_revenue,
  CASE WHEN s.margin_base<=0 THEN NULL
   WHEN s.manual_margin_pct IS NOT NULL THEN s.manual_margin_pct
   WHEN s.costed THEN 1-s.team_cost/s.margin_base END AS margin_pct,
  CASE WHEN x.owner THEN s.kpi_qty-coalesce(g.kpi_qty,0) ELSE s.kpi_qty*x.part END AS kpi_qty,
  s.manual_margin_pct IS NOT NULL AS manual,
  CASE WHEN x.owner THEN s.no_sales_cost-coalesce(g.no_sales_cost,0) ELSE round(s.no_sales_cost*x.part,2) END AS no_sales_cost,
  s.old_bill,  -- (20261107230000) an old bill topped up: commission, never sales
  -- (20261107233000) The bill's whole revenue, unshared and unweighted; the brand its penalty bands are read for.
  s.main AS full_revenue,
  coalesce(nullif(btrim(s.brand_code),''),lb.brand) AS band_brand
  FROM split s JOIN parts x ON x.order_id=s.id LEFT JOIN given g ON g.order_id=s.id
  LEFT JOIN line_brand lb ON lb.order_id=s.id
 ), weighed AS (
  -- What a part counts at: what it was paid at, else the penalty its margin falls in now (none for a head), else all.
  SELECT h.*,CASE
    WHEN st.multiplier IS NOT NULL THEN st.multiplier
    WHEN pd.order_id IS NOT NULL OR rl.order_no IS NOT NULL THEN 1
    WHEN h.margin_pct IS NOT NULL AND hd.id IS NULL THEN coalesce(pb.commission_multiplier,1)
    ELSE 1 END AS weight
  FROM held h
  LEFT JOIN stored st ON st.staff_id=h.staff_id AND st.order_id=h.id
  LEFT JOIN paid pd ON pd.staff_id=h.staff_id AND pd.order_id=h.id
  LEFT JOIN released rl ON rl.order_no=h.order_no
  LEFT JOIN (SELECT s.id FROM public.hr_staff_costs s JOIN public.titles t ON t.id=s.title_id WHERE t.is_department_head) hd
   ON hd.id=h.staff_id
  LEFT JOIN LATERAL (SELECT bd.commission_multiplier FROM bands bd
    WHERE (h.band_brand IS NULL OR bd.code=h.band_brand) AND h.margin_pct<=bd.margin_pct+1e-9
    ORDER BY bd.margin_pct,bd.sort_order,bd.id LIMIT 1) pb ON true
 )
 -- (20261107233000) The part counts as its commission is: a RM 10,000 bill shared half, RM 5,000; cut to x0.5, RM 2,500.
 SELECT w.id,w.staff_id,w.order_no,w.order_date,w.period_month,w.recognition,w.brand,w.is_cleared,
  round(w.part_revenue*w.weight,2),w.goods_revenue,w.margin_pct,w.kpi_qty,w.manual,w.no_sales_cost,w.old_bill,
  w.full_revenue,w.weight
 FROM weighed w;$n$
  ], p_drop => true);

REVOKE ALL ON FUNCTION public.member_order_facts_with_old_bills(uuid, date, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.member_order_facts_with_old_bills(uuid, date, date) TO service_role;

COMMENT ON FUNCTION public.member_order_facts_with_old_bills(uuid, date, date) IS
  $c$One private document-facts calculation for Insight, Arena and recent Income orders. Margin is the REVENUE TEAM margin - cost divided by comm_schemes.revenue_cost_divisor, the same basis the engine pays on - because the company's own margin is not the salesperson's to see. A bill of a month before the portal pays (comm_cutovers) is recognised in its own month as settled. Authorization stays in the public/member entry points. no_sales_cost (2026-10-30): a bill with no sales of its own (margin base RM 0 or less) has no margin, but what its goods cost — the holder's part, once every goods line is costed — counts against the month's margin. old_bill (20261107230000): every bill, the old bills topped up too (sales_order_old_bill) — commission, never sales. The order books list them, flagged commissionOnly; everything else reads member_order_facts, which leaves them out. weight (20261107233000): revenue is each holder's part times what its commission is multiplied by — a stored penalty, else 1 for what a close paid or a release, else the penalty band its margin falls in (no head's), else 1; full_revenue is the bill's whole, unshared and unweighted.$c$;

-- ── B. 2. The order books ───────────────────────────────────────────────────────────────────────────────────────────
SELECT pg_temp.made_with('public.member_order_book_for_staff(uuid, uuid, date, date)', 'dfcd7bd64e1a09c4d859ba7a36439d3c', ARRAY[
    $o$|| CASE WHEN f.old_bill THEN jsonb_build_object('commissionOnly',true,'soldBy',nullif(btrim(so.agent_name),'')) ELSE '{}'::jsonb END$o$,
    $n$|| CASE WHEN f.old_bill THEN jsonb_build_object('commissionOnly',true,'soldBy',nullif(btrim(so.agent_name),'')) ELSE '{}'::jsonb END
   -- (20261107233000) The whole bill's revenue; and what this part counts at, when its commission is cut.
   || jsonb_build_object('fullRevenue',f.full_revenue)
   || CASE WHEN f.weight < 1 THEN jsonb_build_object('weight',f.weight) ELSE '{}'::jsonb END$n$
  ]);

SELECT pg_temp.made_with('public.member_principal_department_order_book(uuid, text, text)', '33e4dcdcf33d2b22a18e99e72b46b0e3', ARRAY[
    $o$bool_or(f.old_bill) AS old_bill
  FROM public.member_order_facts_with_old_bills(v_scheme,lower(v_range),upper(v_range)) f$o$,
    $n$bool_or(f.old_bill) AS old_bill,
   -- (20261107233000) The whole bill's revenue; what its parts count at together — the one weight they share, else
   -- what they come to over the whole.
   min(f.full_revenue) AS full_revenue,
   CASE WHEN min(f.weight) = max(f.weight) THEN min(f.weight)
        WHEN min(f.full_revenue) <> 0 THEN round(sum(f.revenue) / min(f.full_revenue), 4)
        ELSE min(f.weight) END AS weight
  FROM public.member_order_facts_with_old_bills(v_scheme,lower(v_range),upper(v_range)) f$n$,
    $o$|| CASE WHEN f.old_bill THEN jsonb_build_object('commissionOnly',true,'soldBy',nullif(btrim(so.agent_name),'')) ELSE '{}'::jsonb END$o$,
    $n$|| CASE WHEN f.old_bill THEN jsonb_build_object('commissionOnly',true,'soldBy',nullif(btrim(so.agent_name),'')) ELSE '{}'::jsonb END
   -- (20261107233000) The whole bill's revenue; and what it counts at, when its parts' commission is cut.
   || jsonb_build_object('fullRevenue',f.full_revenue)
   || CASE WHEN f.weight < 1 THEN jsonb_build_object('weight',f.weight) ELSE '{}'::jsonb END$n$
  ]);

-- ── B. 3. The Arena's fair boards: each holder's part, counted as its commission is ────────────────────────────────
SELECT pg_temp.made_with('public.member_arena_history_for_staff(uuid, uuid)', '38f1eebe1f89c44dfe5e8fe097b946e0', ARRAY[
    $o$-- (20261107230000) The feed window: a bill dated before it, in a month from it on, is an old bill topped up.
  v_floor date := (SELECT f.min_order_date FROM public.erp_feed_settings f WHERE f.sub_department_id = p_sub_department);$o$,
    $n$-- (20261107233000) The bills are member_order_facts' — the old bills topped up out of them already.$n$,
    $o$SELECT count(*) AS orders,coalesce(sum(o.revenue),0) AS sales$o$,
    $n$SELECT count(DISTINCT o.id) AS orders,coalesce(sum(o.revenue),0) AS sales$n$
  ], p_spans => ARRAY[
    $o$), sources AS ($o$,
    $o$WHERE b.has_goods OR k.order_id IS NOT NULL$o$,
    $n$), order_facts AS (
    -- (20261107233000) Each holder's part of each bill, counted as its commission is — member_order_facts' reading:
    -- every bill up to this month, its deposit, its KPI items off, a shared bill in its holders' parts, a part a margin
    -- penalty cuts by as much — for a holder on the roster; its fair is the bill's.
    SELECT f.order_id AS id,f.staff_id,so.fair_event_id,f.cleared,f.revenue
    FROM public.member_order_facts(p_scheme,NULL,NULL) f
    JOIN sales_orders so ON so.id=f.order_id
    WHERE f.staff_id IN (SELECT id FROM roster)$n$
  ]);

SELECT pg_temp.made_with('public.member_arena_booth_history_for_staff(uuid, uuid)', '43ddde9e982853d0e6d02ed1d70359de', ARRAY[
    $o$-- (20261107230000) The feed window: a bill dated before it, in a month from it on, is an old bill topped up.
  v_floor date := (SELECT f.min_order_date FROM public.erp_feed_settings f WHERE f.sub_department_id = p_sub_department);$o$,
    $n$-- (20261107233000) The bills are member_order_facts' — the old bills topped up out of them already.$n$,
    $o$FROM fairs f JOIN order_facts o ON o.fair_event_id=f.id
    WHERE coalesce(o.booth_pick,o.own_brand) IS NOT NULL$o$,
    $n$FROM fairs f JOIN order_facts o ON o.fair_event_id=f.id
    WHERE o.owner AND coalesce(o.booth_pick,o.own_brand) IS NOT NULL$n$,
    $o$WHERE o.booth_pick IS NULL OR o.booth_pick=wb.brand$o$,
    $n$WHERE o.owner AND (o.booth_pick IS NULL OR o.booth_pick=wb.brand)$n$,
    $o$SELECT count(*) AS orders,coalesce(sum(o.revenue),0) AS sales$o$,
    $n$SELECT count(DISTINCT o.id) AS orders,coalesce(sum(o.revenue),0) AS sales$n$
  ], p_spans => ARRAY[
    $o$), sources AS ($o$,
    $o$WHERE b.has_goods OR k.order_id IS NOT NULL$o$,
    $n$), order_facts AS (
    -- (20261107233000) Each holder's part of each bill, counted as its commission is — member_order_facts' reading:
    -- every bill up to this month, its deposit, its KPI items off, a shared bill in its holders' parts, a part a margin
    -- penalty cuts by as much — for a holder on the roster, with the bill's fair, the booth it was picked at and its own
    -- brand. owner: the salesperson it is written on — a week's booth is guessed from the bills a seller wrote.
    SELECT f.order_id AS id,f.staff_id,so.fair_event_id,f.cleared,f.revenue,
      so.staff_id IS NOT DISTINCT FROM f.staff_id AS owner,
      -- The booth the salesperson picked in the ERP, while that pick is the
      -- bill's fair (lib/exhibitions.ts boothOf + brandCodeFor).
      CASE WHEN so.fair_source='erp' AND coalesce(so.raw->'fair'->>'status','')<>'cancelled'
                AND nullif(btrim(so.raw->'fair'->>'brand'),'') IS NOT NULL
           THEN coalesce(erp_sync_brand_code(so.raw->'fair'->>'brand'),
                         upper(regexp_replace(btrim(so.raw->'fair'->>'brand'),'\s+',' ','g'))) END AS booth_pick,
      nullif(btrim(so.brand_code),'') AS own_brand
    FROM public.member_order_facts(p_scheme,NULL,NULL) f
    JOIN sales_orders so ON so.id=f.order_id
    WHERE f.staff_id IN (SELECT id FROM roster)$n$,
    $o$), held_parts AS ($o$,
    $o$LEFT JOIN held_given g ON g.order_id=o.id$o$,
    $n$), order_parts AS (
    -- (20261107233000) Each holder's part already, counted as its commission is (member_order_facts).
    SELECT o.id,o.staff_id,o.fair_event_id,o.booth_pick,o.own_brand,o.cleared,o.revenue
    FROM order_facts o WHERE o.fair_event_id IS NOT NULL$n$
  ]);

COMMENT ON FUNCTION public.member_arena_history_for_staff(uuid, uuid) IS
  $c$Completed-fair results for one Revenue sub-department, from comm_venue_events dates and sales_orders.fair_event_id. Same roster, committed sources, deposit gate and commissionable lines as member_arena_for_staff. Provisional: a sale is not attendance, and unplaced bills are reported rather than spread. Since 20261107233000 its bills are member_order_facts': each holder's part, counted as its commission is (a share's part; a margin penalty's cut); unassignedOrders counts a bill once.$c$;

COMMENT ON FUNCTION public.member_arena_booth_history_for_staff(uuid, uuid) IS
  $c$The Arena's Fair results booth by booth (2026-10-03): one board per (completed fair, booth brand) holding every bill written there — the booth it was picked at, else its seller's booth that week, else its own brand, else the fair's no-brand board. A seller is on every board they wrote at; ONE a week scores (scoring = true): the brand they picked for the week (member_arena_brand_weeks.picks), else the brand they opened the most bills for (confirmed = false; auto-located once locked), at the fair with the most bills for it. offWeekOrders/Sales = what is on a board without scoring; unassignedOrders/Sales = bills on no fair. Since 20261107233000 its bills are member_order_facts': each holder's part, counted as its commission is (a share's part; a margin penalty's cut); a week's booth is still guessed from the bills a seller wrote.$c$;

-- What this migration made is what it was written to make — every mismatch in one refusal.
DO $$
DECLARE
  r record;
  v_md5 text;
  v_bad text := '';
BEGIN
  FOR r IN SELECT * FROM (VALUES
      ('public.share_request_take_effect(uuid, uuid, text)', '06ae489079db169c81a870435a39aecc'),
      ('public.member_share_order_answer(uuid, boolean, text)', '7973666744955b47838e957fb79c15bd'),
      ('public.revenue_share_request_decide(uuid, boolean, text)', 'b01796bdaa1d718a14c3316db25e6938'),
      ('public.notification_topic_may(uuid, text)', '0ff1a9b15be23a1b8e2a60f4ac65b842'),
      ('public.notification_topics_sync(text[])', '507c5b4dd216e1b6aba7e7dc682cf72f'),
      ('public.member_order_facts_with_old_bills(uuid, date, date)', '95f3dd9275fdeed139a02ebea60fd6a8'),
      ('public.member_order_facts(uuid, date, date)', '987d328c0ec4087e4ce6f3e58346a382'),
      ('public.member_order_book_for_staff(uuid, uuid, date, date)', 'dfcd7bd64e1a09c4d859ba7a36439d3c'),
      ('public.member_principal_department_order_book(uuid, text, text)', '33e4dcdcf33d2b22a18e99e72b46b0e3'),
      ('public.member_arena_history_for_staff(uuid, uuid)', '38f1eebe1f89c44dfe5e8fe097b946e0'),
      ('public.member_arena_booth_history_for_staff(uuid, uuid)', '43ddde9e982853d0e6d02ed1d70359de')
    ) AS t(sig, after_md5)
  LOOP
    SELECT md5(replace(prosrc, E'\r', '')) INTO v_md5 FROM pg_proc WHERE oid = to_regprocedure(r.sig);
    IF v_md5 IS DISTINCT FROM r.after_md5 THEN
      v_bad := v_bad || format(' %s ended as md5 %s;', r.sig, v_md5);
    END IF;
  END LOOP;
  IF v_bad <> '' THEN
    RAISE EXCEPTION 'Not the bodies this migration makes:%', v_bad;
  END IF;
END $$;

-- ── A. 3. The requests with HR now take effect, as an accept now makes them ─────────────────────────────────────────
-- Decided by the colleague who accepted last; one the checks refuse stays with HR (revenue_share_request_decide).
DO $$
DECLARE
  r        record;
  v_by     uuid;
  v_name   text;
  v_reason text;
BEGIN
  FOR r IN SELECT q.id, q.order_no FROM public.sales_order_share_requests q WHERE q.status = 'hr' ORDER BY q.created_at, q.id LOOP
    SELECT s.user_id, y.staff_name INTO v_by, v_name
      FROM public.sales_order_share_request_parts y LEFT JOIN public.hr_staff_costs s ON s.id = y.staff_id
     WHERE y.request_id = r.id AND y.answer = 'accepted'
     ORDER BY y.answered_at DESC NULLS LAST, y.staff_id LIMIT 1;
    BEGIN
      v_reason := public.share_request_take_effect(r.id, v_by, v_name);
      IF v_reason IS NOT NULL THEN
        RAISE NOTICE '% stays with HR: %', r.order_no, v_reason;
      ELSE
        RAISE NOTICE '% is shared now', r.order_no;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE '% stays with HR: %', r.order_no, SQLERRM;
    END;
  END LOOP;
END $$;

COMMIT;
