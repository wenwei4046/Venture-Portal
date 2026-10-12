-- The Houzs ERP's Sales Attending, mirrored (2026-10-12).
--
-- The user: the ERP now lists, on every project — a brand's booth at a fair —
-- the salespeople attending it (public.project_sales_attendees, the PMS's
-- "Sales Attending"). So a salesperson no longer picks a brand week, and
-- nothing guesses one where the ERP has said where they work: "1 layer is use
-- track by erp houzs, if fail. then go with auto detect, same engine with
-- previous one."
--
-- This file is the mirror and that first layer only; the Arena, the claim
-- form, Insight and the brand-week pages read it from 20261012150000.
--
--   erp_booths                  one row per ERP project: its brand, place, days, status
--   erp_booth_staff             who the ERP lists at it, each with the scm.staff id the
--                               sales-order feed already names (comm_agent_aliases)
--   erp_attendance_deliveries   the last snapshot taken in, per ERP company
--   ingest_erp_sales_attending  the receiver's ONE write (POST /api/erp/v1/sales-attending,
--                               docs/erp-sync/contract.md §10)
--   member_erp_brand_weeks      the ERP layer: each person's booth for a fair weekend
--
-- A delivery is the WHOLE of one company's booths from `since` on: a booth it
-- does not list is gone over there, and so goes here (booths before `since`
-- stay as last told). Nothing here writes a fair, a bill or a pick — the
-- bills' fairs stay the order feed's (erp_sync_fair), and the mirror is read
-- beside them.

CREATE TABLE public.erp_booths (
  erp_project_id bigint PRIMARY KEY,
  company_id     bigint NOT NULL,
  code           text,
  name           text,
  -- The ERP's word for the brand, and the portal brand it is (erp_sync_brand_code,
  -- else the word itself in capitals — a bill's booth is read the same way).
  brand          text,
  brand_code     text,
  venue          text,
  -- venue_group_key(venue): the place as the portal's fairs know it.
  venue_key      text,
  organizer      text,
  start_date     date NOT NULL,
  end_date       date NOT NULL,
  status         text NOT NULL DEFAULT 'confirmed',
  event_type     text,
  snapshot_at    timestamptz NOT NULL,
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT erp_booths_days CHECK (end_date >= start_date)
);
CREATE INDEX idx_erp_booths_company_start ON public.erp_booths (company_id, start_date);

CREATE TABLE public.erp_booth_staff (
  erp_project_id     bigint NOT NULL REFERENCES public.erp_booths(erp_project_id) ON DELETE CASCADE,
  -- public.sales_reps.id — the PMS's roster row.
  erp_sales_rep_id   bigint NOT NULL,
  -- scm.staff.id of the rep's login: the id the order feed sends as the
  -- salesperson, so comm_agent_aliases names the portal person. NULL when the
  -- rep has no login over there.
  erp_salesperson_id text,
  code               text,
  name               text NOT NULL,
  PRIMARY KEY (erp_project_id, erp_sales_rep_id)
);
CREATE INDEX idx_erp_booth_staff_salesperson ON public.erp_booth_staff (erp_salesperson_id)
  WHERE erp_salesperson_id IS NOT NULL;

CREATE TABLE public.erp_attendance_deliveries (
  company_id  bigint PRIMARY KEY,
  snapshot_at timestamptz NOT NULL,
  since       date NOT NULL,
  booths      integer NOT NULL,
  attendees   integer NOT NULL,
  applied_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.erp_booths ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_booth_staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_attendance_deliveries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.erp_booths, public.erp_booth_staff, public.erp_attendance_deliveries FROM anon, authenticated;

SELECT public.audit_register('erp_booths', 'ERP booths (Sales Attending)', 'Revenue', '{}', 'none',
  p_reason => 'The ERP''s projects, mirrored: written only by the feed (ingest_erp_sales_attending). Each delivery is logged in erp_sync_events.');
SELECT public.audit_register('erp_booth_staff', 'ERP Sales Attending', 'Revenue', '{}', 'none',
  p_reason => 'Who the ERP lists at each booth, mirrored: written only by the feed (ingest_erp_sales_attending). Each delivery is logged in erp_sync_events.');
SELECT public.audit_register('erp_attendance_deliveries', 'ERP Sales Attending deliveries', 'Revenue', '{}', 'none',
  p_reason => 'One row a company: the last Sales Attending snapshot taken in.');

-- ── The receiver's one write ─────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.ingest_erp_sales_attending(p_batch jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_company    bigint;
  v_since      date;
  v_snapshot   timestamptz;
  v_last       timestamptz;
  v_booth      jsonb;
  v_person     jsonb;
  v_project    bigint;
  v_start      date;
  v_end        date;
  v_brand      text;
  v_seen       bigint[] := '{}';
  v_booths     integer := 0;
  v_people     integer := 0;
  v_unreadable integer := 0;
  v_retired    integer := 0;
  v_before     jsonb;
  v_after      jsonb;
  v_months     date[];
  v_unmatched  text[];
BEGIN
  IF p_batch IS NULL OR jsonb_typeof(p_batch) <> 'object' THEN
    RAISE EXCEPTION 'A Sales Attending delivery is one object' USING ERRCODE = '22023';
  END IF;
  BEGIN
    v_company  := (p_batch->>'companyId')::bigint;
    v_since    := (p_batch->>'since')::date;
    v_snapshot := coalesce(nullif(p_batch->>'snapshotAt', '')::timestamptz, now());
  EXCEPTION WHEN invalid_text_representation OR invalid_datetime_format OR datetime_field_overflow
              OR numeric_value_out_of_range THEN
    RAISE EXCEPTION 'companyId, since and snapshotAt must be a number, a date and a time' USING ERRCODE = '22023';
  END;
  IF v_company IS NULL OR v_since IS NULL THEN
    RAISE EXCEPTION 'A delivery names its companyId and the day it starts from (since)' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_batch->'booths') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'booths must be a list' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p_batch->'booths') > 5000 THEN
    RAISE EXCEPTION 'At most 5,000 booths in one delivery' USING ERRCODE = '22023';
  END IF;

  -- One company's snapshot at a time, and the newest kept: two pushes can
  -- overlap, and an older one landing second changes nothing.
  PERFORM pg_advisory_xact_lock(hashtext('erp_sales_attending:' || v_company::text));
  SELECT d.snapshot_at INTO v_last FROM erp_attendance_deliveries d WHERE d.company_id = v_company;
  IF v_last IS NOT NULL AND v_snapshot < v_last THEN
    RETURN jsonb_build_object('outcome', 'stale', 'snapshotAt', v_snapshot, 'kept', v_last);
  END IF;

  -- What each booth said before, to know afterwards which months it moves.
  SELECT coalesce(jsonb_object_agg(b.erp_project_id::text, jsonb_build_object(
           'fp', md5(concat_ws('|', b.brand_code, b.start_date, b.end_date, b.status,
                 (SELECT string_agg(s.erp_sales_rep_id || ':' || coalesce(s.erp_salesperson_id, ''), ',' ORDER BY s.erp_sales_rep_id)
                    FROM erp_booth_staff s WHERE s.erp_project_id = b.erp_project_id))),
           's', b.start_date, 'e', b.end_date)), '{}'::jsonb)
    INTO v_before FROM erp_booths b WHERE b.company_id = v_company;

  FOR v_booth IN SELECT value FROM jsonb_array_elements(p_batch->'booths') LOOP
    CONTINUE WHEN jsonb_typeof(v_booth) <> 'object';
    IF coalesce(v_booth->>'projectId', '') !~ '^\d{1,18}$' THEN
      v_unreadable := v_unreadable + 1;
      CONTINUE;
    END IF;
    v_project := (v_booth->>'projectId')::bigint;
    CONTINUE WHEN v_project = ANY(v_seen);
    -- Seen: even a booth whose days cannot be read is not retired below.
    v_seen := v_seen || v_project;
    BEGIN
      v_start := nullif(v_booth->>'startDate', '')::date;
      v_end   := coalesce(nullif(v_booth->>'endDate', '')::date, v_start);
    EXCEPTION WHEN invalid_text_representation OR invalid_datetime_format OR datetime_field_overflow THEN
      v_unreadable := v_unreadable + 1;
      CONTINUE;
    END;
    IF v_start IS NULL OR v_end < v_start THEN
      v_unreadable := v_unreadable + 1;
      CONTINUE;
    END IF;

    v_brand := nullif(regexp_replace(btrim(coalesce(v_booth->>'brand', '')), '\s+', ' ', 'g'), '');
    INSERT INTO erp_booths AS b (erp_project_id, company_id, code, name, brand, brand_code, venue, venue_key,
                                 organizer, start_date, end_date, status, event_type, snapshot_at, updated_at)
    VALUES (v_project, v_company,
            nullif(btrim(coalesce(v_booth->>'code', '')), ''),
            nullif(btrim(coalesce(v_booth->>'name', '')), ''),
            v_brand,
            CASE WHEN v_brand IS NOT NULL THEN coalesce(erp_sync_brand_code(v_brand), upper(v_brand)) END,
            nullif(regexp_replace(btrim(coalesce(v_booth->>'venue', '')), '\s+', ' ', 'g'), ''),
            venue_group_key(v_booth->>'venue'),
            nullif(btrim(coalesce(v_booth->>'organizer', '')), ''),
            v_start, v_end,
            coalesce(nullif(lower(btrim(coalesce(v_booth->>'status', ''))), ''), 'confirmed'),
            nullif(btrim(coalesce(v_booth->>'eventType', '')), ''),
            v_snapshot, now())
    ON CONFLICT (erp_project_id) DO UPDATE SET
      company_id = excluded.company_id, code = excluded.code, name = excluded.name, brand = excluded.brand,
      brand_code = excluded.brand_code, venue = excluded.venue, venue_key = excluded.venue_key,
      organizer = excluded.organizer, start_date = excluded.start_date, end_date = excluded.end_date,
      status = excluded.status, event_type = excluded.event_type, snapshot_at = excluded.snapshot_at,
      updated_at = now();
    v_booths := v_booths + 1;

    -- Who is listed: exactly the delivery's list.
    DELETE FROM erp_booth_staff WHERE erp_project_id = v_project;
    IF jsonb_typeof(v_booth->'attendees') = 'array' THEN
      FOR v_person IN SELECT value FROM jsonb_array_elements(v_booth->'attendees') LOOP
        CONTINUE WHEN jsonb_typeof(v_person) <> 'object'
          OR coalesce(v_person->>'salesRepId', '') !~ '^\d{1,18}$'
          OR nullif(btrim(coalesce(v_person->>'name', '')), '') IS NULL;
        INSERT INTO erp_booth_staff (erp_project_id, erp_sales_rep_id, erp_salesperson_id, code, name)
        VALUES (v_project, (v_person->>'salesRepId')::bigint,
                CASE WHEN coalesce(v_person->>'salespersonId', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                     THEN lower(v_person->>'salespersonId') END,
                nullif(btrim(coalesce(v_person->>'code', '')), ''),
                btrim(v_person->>'name'))
        ON CONFLICT (erp_project_id, erp_sales_rep_id) DO NOTHING;
        IF FOUND THEN
          v_people := v_people + 1;
        END IF;
      END LOOP;
    END IF;
  END LOOP;

  -- The whole of the company's booths from `since`: one it no longer lists is gone.
  WITH gone AS (
    DELETE FROM erp_booths b
     WHERE b.company_id = v_company AND b.start_date >= v_since AND NOT (b.erp_project_id = ANY(v_seen))
    RETURNING 1)
  SELECT count(*) INTO v_retired FROM gone;

  INSERT INTO erp_attendance_deliveries AS d (company_id, snapshot_at, since, booths, attendees, applied_at)
  VALUES (v_company, v_snapshot, v_since, v_booths, v_people, now())
  ON CONFLICT (company_id) DO UPDATE SET snapshot_at = excluded.snapshot_at, since = excluded.since,
    booths = excluded.booths, attendees = excluded.attendees, applied_at = now();

  -- A month whose booths changed is no longer settled for My honours: its kept
  -- finishes are forgotten and taken afresh on the next open (as a brand week
  -- changed by hand was before, member_honours_forget_brand_week).
  SELECT coalesce(jsonb_object_agg(b.erp_project_id::text, jsonb_build_object(
           'fp', md5(concat_ws('|', b.brand_code, b.start_date, b.end_date, b.status,
                 (SELECT string_agg(s.erp_sales_rep_id || ':' || coalesce(s.erp_salesperson_id, ''), ',' ORDER BY s.erp_sales_rep_id)
                    FROM erp_booth_staff s WHERE s.erp_project_id = b.erp_project_id))),
           's', b.start_date, 'e', b.end_date)), '{}'::jsonb)
    INTO v_after FROM erp_booths b WHERE b.company_id = v_company;
  SELECT array_agg(DISTINCT m) INTO v_months
    FROM (SELECT k, v_before->k AS was, v_after->k AS now_
            FROM (SELECT jsonb_object_keys(v_before) AS k UNION SELECT jsonb_object_keys(v_after)) keys) x
    CROSS JOIN LATERAL (VALUES (date_trunc('month', (x.was->>'s')::date)::date), (date_trunc('month', (x.was->>'e')::date)::date),
                               (date_trunc('month', (x.now_->>'s')::date)::date), (date_trunc('month', (x.now_->>'e')::date)::date)) mm(m)
   WHERE (x.was->>'fp') IS DISTINCT FROM (x.now_->>'fp') AND m IS NOT NULL;
  IF v_months IS NOT NULL THEN
    DELETE FROM member_honour_months WHERE period_month = ANY(v_months);
  END IF;

  -- Whom the ERP lists that the portal cannot name yet: no sales order of
  -- theirs has come in, or they have no login over there.
  SELECT coalesce(array_agg(DISTINCT s.name ORDER BY s.name), '{}') INTO v_unmatched
    FROM erp_booth_staff s
   WHERE s.erp_project_id = ANY(v_seen)
     AND NOT EXISTS (SELECT 1 FROM comm_agent_aliases a WHERE a.erp_salesperson_id = s.erp_salesperson_id);

  RETURN jsonb_build_object('outcome', 'applied', 'booths', v_booths, 'attendees', v_people,
    'retired', v_retired, 'unreadable', v_unreadable, 'monthsMoved', coalesce(cardinality(v_months), 0),
    'unmatched', to_jsonb(v_unmatched));
END
$fn$;

COMMENT ON FUNCTION public.ingest_erp_sales_attending(jsonb) IS
  'The ERP Sales Attending receiver''s one write (POST /api/erp/v1/sales-attending): the whole of a company''s booths from since, with who is listed at each. Service role only.';
REVOKE ALL ON FUNCTION public.ingest_erp_sales_attending(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ingest_erp_sales_attending(jsonb) TO service_role;

-- ── The first layer: where the ERP says somebody works a fair weekend ──────────

CREATE OR REPLACE FUNCTION public.member_erp_brand_weeks(p_sub_department uuid, p_staff uuid DEFAULT NULL)
RETURNS TABLE(staff_id uuid, week date, erp_project_id bigint, fair_id uuid, brand text, venue text,
              venue_key text, organizer text, start_date date, end_date date, booths integer)
LANGUAGE sql
STABLE
SET search_path = public
AS $fn$
  WITH listed AS (
    -- Every booth the ERP lists a portal person at — by the scm.staff id the
    -- order feed already matched to them — a cancelled booth aside.
    SELECT a.staff_id, b.erp_project_id, b.brand_code, b.venue AS erp_venue, b.venue_key AS erp_venue_key,
           b.organizer, b.start_date, b.end_date,
           f.id AS fair_id, f.start_date AS fair_start, f.venue_key AS fair_venue_key,
           coalesce(nullif(btrim(v.display_name), ''), f.venue_key) AS fair_venue
      FROM erp_booth_staff s
      JOIN comm_agent_aliases a ON a.erp_salesperson_id = s.erp_salesperson_id
      JOIN erp_booths b ON b.erp_project_id = s.erp_project_id
      -- The portal's fair for the booth: the one the order feed pinned the
      -- project to, else the same place on overlapping days (erp_sync_fair's rule).
      LEFT JOIN LATERAL (
        SELECT e.id, e.start_date, e.venue_key
          FROM comm_venue_events e
         WHERE e.erp_project_ids @> ARRAY[b.erp_project_id::integer]
            OR (e.venue_key = b.venue_key AND e.start_date IS NOT NULL AND e.end_date IS NOT NULL
                AND daterange(e.start_date, e.end_date, '[]') && daterange(b.start_date, b.end_date, '[]'))
         ORDER BY (e.erp_project_ids @> ARRAY[b.erp_project_id::integer]) DESC,
                  (e.start_date = b.start_date AND e.end_date = b.end_date) DESC, e.start_date, e.id
         LIMIT 1) f ON true
      LEFT JOIN comm_venues v ON v.venue_key = f.venue_key
     WHERE lower(b.status) NOT IN ('cancelled', 'canceled')
       AND (p_staff IS NULL OR a.staff_id = p_staff)
  ), weighed AS (
    SELECT l.*,
      -- A fair belongs to the weekend it opens in, named by its Friday — the Arena's weeks.
      (date_trunc('week', coalesce(l.fair_start, l.start_date)::timestamp)::date + 4) AS wk,
      -- Listed at two booths that weekend: the one they wrote the most bills at
      -- (the second layer's own measure), each bill read at the booth it names.
      (SELECT count(DISTINCT so.order_no)
         FROM sales_orders so
         JOIN sales_import_batches ib ON ib.id = so.batch_id
        CROSS JOIN LATERAL (
          -- The booth the bill names (member_arena_booth_history_for_staff's booth_pick).
          SELECT CASE WHEN so.fair_source = 'erp' AND coalesce(so.raw->'fair'->>'status', '') <> 'cancelled'
                           AND nullif(btrim(so.raw->'fair'->>'brand'), '') IS NOT NULL
                      THEN coalesce(erp_sync_brand_code(so.raw->'fair'->>'brand'),
                                    upper(regexp_replace(btrim(so.raw->'fair'->>'brand'), '\s+', ' ', 'g'))) END AS booth
        ) bp
        WHERE l.fair_id IS NOT NULL AND so.fair_event_id = l.fair_id AND so.staff_id = l.staff_id
          AND NOT so.cancelled AND ib.sub_department_id = p_sub_department AND ib.status = 'committed'
          AND (bp.booth IS NULL OR bp.booth = l.brand_code)) AS bills
      FROM listed l
  )
  SELECT DISTINCT ON (w.staff_id, w.wk)
         w.staff_id, w.wk, w.erp_project_id, w.fair_id, w.brand_code,
         coalesce(w.fair_venue, w.erp_venue), coalesce(w.fair_venue_key, w.erp_venue_key),
         w.organizer, w.start_date, w.end_date,
         (count(*) OVER (PARTITION BY w.staff_id, w.wk))::integer
    FROM weighed w
   ORDER BY w.staff_id, w.wk, w.bills DESC, w.start_date, w.erp_project_id
$fn$;

COMMENT ON FUNCTION public.member_erp_brand_weeks(uuid, uuid) IS
  'The first layer of a brand week (2026-10-12): the booth the ERP''s Sales Attending lists each portal person at, per fair weekend (the Friday of the week its fair opens in); two booths that weekend → the one they wrote the most bills at. Read by the Arena, the claim form and Insight; only DEFINER functions call it.';
REVOKE ALL ON FUNCTION public.member_erp_brand_weeks(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.member_erp_brand_weeks(uuid, uuid) TO service_role;

NOTIFY pgrst, 'reload schema';
