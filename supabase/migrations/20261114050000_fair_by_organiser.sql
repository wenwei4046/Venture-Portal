-- ============================================================================
-- 20261114050000_fair_by_organiser.sql
-- Two organisers at one place on the same days are two fairs (2026-11-13).
-- ============================================================================
--
-- 20260927010000 kept the booths of ONE EVENT as one fair: the same place on overlapping days, whoever organised it
-- — and an EXCLUDE forbade two fairs at one place on overlapping days. So 2990s' standing booth at Penang Waterfront
-- (MALL MGMT, 29 Oct – 31 Dec, ERP project 2289) was folded into BIGHOME's three-day fair there (30 Oct – 1 Nov:
-- AKEMI, ZANOTTI, DUNLOP), and the fair's organiser and days then followed whichever booth's bill arrived last:
-- under the booth's it "ends" on 31 December, so BIGHOME's fair is in no Arena result and its week stays open into
-- January; and MEGAHOME's fair there on 27–29 November would be folded into it too, its sellers' brand weeks read in
-- October's. Asked whether fairs at one place on overlapping days under different organisers are different fairs, the
-- user, 2026-11-13: "yes , different with organiser".
--
-- Now:
--   1. comm_venue_events_no_overlap forbids two fairs at one place on overlapping days UNDER ONE ORGANISER (a fair
--      with no organiser named counts as one organiser).
--   2. erp_sync_fair folds a booth only into a fair of its own organiser — or one whose organiser nobody has named,
--      or any when the booth names none. A booth pinned to a fair that is ANOTHER organiser's leaves it when that
--      fair has other booths, or when its own organiser's fair already stands there on its days; alone in its fair,
--      it changes that fair's organiser as before (the ERP corrected it). The bill being delivered follows its
--      booth; the booth's other bills follow as the ERP sends them again.
--   3. venue_event_for_order — the guess for a bill the ERP named no fair for — always answers the same fair when
--      two stand on the day: the SHORTER one (the fair, not the standing booth); on the very same days, the one
--      that was there first (so a guessed bill stays where it was before the split).
--   4. member_erp_brand_weeks places a booth the feed has not pinned yet in a fair of ITS organiser only, so
--      MEGAHOME's sellers on 27–29 November are read in that weekend, not in the standing booth's.
--   5. The fairs that hold booths of more than one organiser today are split, generically: the fair keeps the
--      organiser — and takes the days — of the booth that opened it; every other organiser's booths get a fair of
--      their own (or join that organiser's fair already standing there), and their bills go with them, a month at a
--      time. On production 2026-11-13 these are two: Penang Waterfront (BIGHOME 311 / 2269 / 312 keep it, 47 bills;
--      MALL MGMT 2289 leaves, 36 bills) and Sunway Kluang Mall 5–11 Oct (KAI HAO 2261 keeps it, 9 bills; SOLO 2270
--      leaves, 1 bill). A month a run has paid keeps what it paid (none of these is).
--
-- Three functions from PRODUCTION's bodies (2026-11-13, md5 of prosrc): erp_sync_fair and venue_event_for_order
-- written whole, member_erp_brand_weeks with one statement and its comment swapped; each refused if production's
-- body has changed since. No signature changes, so every grant stays.
--
-- Rollback, in words: put the EXCLUDE back without the organiser (after merging the fairs that now overlap) and
-- re-apply the three bodies 20260927010000 / 20260920050000 / 20261012150000 left.
--
-- PGlite: tests/member-sql/validate-fair-by-organiser.mjs (production's bodies; the migration verbatim, twice).

BEGIN;

CREATE TEMP TABLE fair_by_organiser_fns (proc text PRIMARY KEY, written_from text NOT NULL, makes text NOT NULL) ON COMMIT DROP;
INSERT INTO fair_by_organiser_fns VALUES
  ('public.erp_sync_fair(jsonb)',                        'b2a911b1f14e940e0166f57d7dd289dc', 'e5476e60353346b0f6fad44c536ddb43'),
  ('public.venue_event_for_order(text, date, integer)',  '46f054aad656b15b4ec9b349dc4f3059', 'bffd2197ccf19e21231b00917d51cf61'),
  ('public.member_erp_brand_weeks(uuid, uuid)',          '183e8d1838a86f90cfd6094a303ed813', '7f495826d491eb26487bd3c715928cc0');

-- Each is production's body, or this migration's own once it has run — else nothing is touched.
DO $$
DECLARE
  v_fn  record;
  v_md5 text;
BEGIN
  FOR v_fn IN SELECT * FROM fair_by_organiser_fns ORDER BY proc LOOP
    SELECT md5(replace(prosrc, E'\r', '')) INTO v_md5 FROM pg_proc WHERE oid = to_regprocedure(v_fn.proc);
    IF v_md5 IS NULL THEN
      RAISE EXCEPTION '% is not on this database', v_fn.proc;
    END IF;
    IF v_md5 IS DISTINCT FROM v_fn.written_from AND v_md5 IS DISTINCT FROM v_fn.makes THEN
      RAISE EXCEPTION '% is md5 %, not the body this migration was written from', v_fn.proc, v_md5;
    END IF;
  END LOOP;
END $$;

-- ── 1. One place, overlapping days, ONE ORGANISER: one fair ──────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conrelid = 'public.comm_venue_events'::regclass AND conname = 'comm_venue_events_no_overlap'
                    AND pg_get_constraintdef(oid) LIKE '%organiser_id%') THEN
    ALTER TABLE public.comm_venue_events DROP CONSTRAINT IF EXISTS comm_venue_events_no_overlap;
    ALTER TABLE public.comm_venue_events
      ADD CONSTRAINT comm_venue_events_no_overlap
      EXCLUDE USING gist (venue_key WITH =,
                          (COALESCE(organiser_id, '00000000-0000-0000-0000-000000000000'::uuid)) WITH =,
                          (daterange(start_date, end_date, '[]'::text)) WITH &&)
      WHERE (start_date IS NOT NULL);
  END IF;
END $$;

-- ── 2. The guess for a bill the ERP named no fair for ────────────────────────────────────────────────────────────────
-- Production's body (md5 46f054aa…), whole: its ORDER BY says which of two fairs standing on the day.
CREATE OR REPLACE FUNCTION public.venue_event_for_order(p_venue text, p_order_date date, p_grace_days integer DEFAULT 45)
 RETURNS uuid
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
    SELECT e.id
      FROM comm_venue_events e
     WHERE e.start_date IS NOT NULL
       AND e.venue_key = (SELECT venue_group_key(p_venue))
       AND p_order_date >= e.start_date
       AND p_order_date <= e.end_date + p_grace_days
     ORDER BY (p_order_date <= e.end_date) DESC,
              -- (20261114050000) Two fairs may stand at one place on a day — a different organiser each. Open on
              -- the day, the shorter one is the fair and the longer a standing booth; closed, the one that closed
              -- last, as before. On the very same days, the one that was there first — always the same one.
              CASE WHEN p_order_date <= e.end_date THEN e.end_date - e.start_date END,
              e.end_date DESC,
              e.start_date DESC,
              e.created_at,
              e.id
     LIMIT 1;
$function$;

-- ── 3. The fair the ERP names ────────────────────────────────────────────────────────────────────────────────────────
-- Production's body (md5 b2a911b1…), whole: a booth is a booth of a fair of its own organiser.
CREATE OR REPLACE FUNCTION public.erp_sync_fair(p_fair jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
    v_project  INTEGER;
    v_start    DATE;
    v_end      DATE;
    v_venue    TEXT;
    v_place    TEXT;
    v_org_name TEXT;
    v_org      UUID;
    v_fair     comm_venue_events%ROWTYPE;
    v_found    BOOLEAN;
BEGIN
    IF p_fair IS NULL OR JSONB_TYPEOF(p_fair) <> 'object' THEN
        RETURN NULL;
    END IF;
    -- A booth the office withdrew from is no fair.
    IF LOWER(COALESCE(p_fair->>'status', '')) IN ('cancelled', 'canceled') THEN
        RETURN NULL;
    END IF;

    -- A pick the portal cannot read is no pick: the bill is still a sale, so
    -- it is written without one rather than refused.
    BEGIN
        v_project := (p_fair->>'projectId')::INTEGER;
        v_start   := NULLIF(p_fair->>'startDate', '')::DATE;
        v_end     := COALESCE(NULLIF(p_fair->>'endDate', '')::DATE, v_start);
    EXCEPTION WHEN invalid_text_representation OR invalid_datetime_format
                OR datetime_field_overflow OR numeric_value_out_of_range THEN
        RETURN NULL;
    END;
    v_venue := NULLIF(REGEXP_REPLACE(BTRIM(COALESCE(p_fair->>'venue', '')), '\s+', ' ', 'g'), '');
    IF v_project IS NULL OR v_start IS NULL OR v_venue IS NULL OR v_end < v_start THEN
        RETURN NULL;
    END IF;

    -- The place: the register learns the ERP's name for it, and a merge a
    -- person recorded (canonical_key) still folds it into the place it is.
    INSERT INTO comm_venues (venue_key, display_name)
    VALUES (venue_key(v_venue), v_venue)
    ON CONFLICT (venue_key) DO NOTHING;
    v_place := venue_group_key(v_venue);

    -- The organiser, from the ERP's own register.
    v_org_name := NULLIF(BTRIM(COALESCE(p_fair->>'organizer', '')), '');
    IF v_org_name IS NOT NULL THEN
        SELECT id INTO v_org FROM comm_organisers WHERE organiser_key(name) = organiser_key(v_org_name);
        IF v_org IS NULL THEN
            INSERT INTO comm_organisers (name, notes)
            VALUES (v_org_name, 'Named by the Houzs ERP')
            ON CONFLICT DO NOTHING
            RETURNING id INTO v_org;
            IF v_org IS NULL THEN
                SELECT id INTO v_org FROM comm_organisers WHERE organiser_key(name) = organiser_key(v_org_name);
            END IF;
        END IF;
    END IF;

    -- This project's fair …
    SELECT * INTO v_fair
      FROM comm_venue_events
     WHERE erp_project_ids @> ARRAY[v_project]
     ORDER BY (organiser_id IS NOT DISTINCT FROM v_org) DESC, created_at, id
     LIMIT 1;
    v_found := FOUND;

    -- (20261114050000) … unless that fair is another organiser's. Two organisers at one place on the same days are
    -- two fairs (the user, 2026-11-13: "yes , different with organiser"): pinned to a fair of another organiser
    -- that has other booths — or beside which its own organiser's fair already stands on its days — the booth
    -- leaves it and is placed below as a booth new to the portal. Alone in its fair it stays, and the fair takes
    -- its organiser as before: the ERP corrected it.
    IF v_found AND v_org IS NOT NULL AND v_fair.organiser_id IS NOT NULL AND v_fair.organiser_id <> v_org
       AND (CARDINALITY(v_fair.erp_project_ids) > 1
            OR EXISTS (SELECT 1 FROM comm_venue_events x
                        WHERE x.id <> v_fair.id AND x.venue_key = v_place AND x.organiser_id = v_org
                          AND x.start_date IS NOT NULL
                          AND DATERANGE(x.start_date, x.end_date, '[]') && DATERANGE(v_start, v_end, '[]'))) THEN
        UPDATE comm_venue_events
           SET erp_project_ids = ARRAY_REMOVE(erp_project_ids, v_project), updated_at = NOW()
         WHERE id = v_fair.id;
        v_found := FALSE;
    END IF;

    -- … else the event it is a brand booth of — the same place on overlapping days under its own organiser (one
    -- whose organiser nobody has named, or any when this booth names none), its organiser's own first, then the
    -- exact window.
    IF NOT v_found THEN
        SELECT * INTO v_fair
          FROM comm_venue_events e
         WHERE e.venue_key = v_place
           AND e.start_date IS NOT NULL
           AND DATERANGE(e.start_date, e.end_date, '[]') && DATERANGE(v_start, v_end, '[]')
           AND (v_org IS NULL OR e.organiser_id IS NULL OR e.organiser_id = v_org)
         ORDER BY (e.organiser_id IS NOT DISTINCT FROM v_org) DESC,
                  (e.start_date = v_start AND e.end_date = v_end) DESC, e.start_date, e.id
         LIMIT 1;
        v_found := FOUND;
    END IF;

    IF NOT v_found THEN
        BEGIN
            INSERT INTO comm_venue_events (venue_key, period_month, start_date, end_date, organiser_id,
                                           erp_organiser_text, source, erp_project_ids, notes)
            VALUES (v_place, DATE_TRUNC('month', v_start)::DATE, v_start, v_end, v_org,
                    v_org_name, 'erp', ARRAY[v_project], NULLIF(BTRIM(COALESCE(p_fair->>'name', '')), ''))
            RETURNING * INTO v_fair;
            RETURN v_fair.id;
        EXCEPTION WHEN exclusion_violation THEN
            -- Another booth of the same event opened it a moment ago.
            SELECT * INTO v_fair
              FROM comm_venue_events e
             WHERE e.venue_key = v_place
               AND e.start_date IS NOT NULL
               AND DATERANGE(e.start_date, e.end_date, '[]') && DATERANGE(v_start, v_end, '[]')
               AND (v_org IS NULL OR e.organiser_id IS NULL OR e.organiser_id = v_org)
             ORDER BY (e.organiser_id IS NOT DISTINCT FROM v_org) DESC, e.start_date, e.id
             LIMIT 1;
            IF NOT FOUND THEN
                RETURN NULL;
            END IF;
        END;
    END IF;

    -- A fair the portal knows: the ERP's answer wins. Written only when
    -- something changed — every write re-stamps the bills at that place.
    IF NOT (v_fair.erp_project_ids @> ARRAY[v_project])
       OR v_fair.source <> 'erp'
       OR (v_org IS NOT NULL AND v_fair.organiser_id IS DISTINCT FROM v_org)
       OR (v_org_name IS NOT NULL AND v_fair.erp_organiser_text IS DISTINCT FROM v_org_name) THEN
        BEGIN
            UPDATE comm_venue_events
               SET erp_project_ids = CASE WHEN erp_project_ids @> ARRAY[v_project] THEN erp_project_ids
                                          ELSE erp_project_ids || v_project END,
                   organiser_id = COALESCE(v_org, organiser_id),
                   erp_organiser_text = COALESCE(v_org_name, erp_organiser_text),
                   source = 'erp',
                   updated_at = NOW()
             WHERE id = v_fair.id;
        EXCEPTION WHEN exclusion_violation THEN
            -- (20261114050000) Its organiser's own fair already stands at the place on this fair's days: the
            -- fair keeps the organiser it has, and the booth all the same.
            UPDATE comm_venue_events
               SET erp_project_ids = CASE WHEN erp_project_ids @> ARRAY[v_project] THEN erp_project_ids
                                          ELSE erp_project_ids || v_project END,
                   source = 'erp',
                   updated_at = NOW()
             WHERE id = v_fair.id;
        END;
    END IF;

    -- And its days, unless a neighbouring fair already holds them.
    IF v_fair.start_date IS DISTINCT FROM v_start OR v_fair.end_date IS DISTINCT FROM v_end THEN
        BEGIN
            UPDATE comm_venue_events
               SET start_date = v_start,
                   end_date = v_end,
                   period_month = CASE
                       WHEN period_month IN (DATE_TRUNC('month', v_start)::DATE, DATE_TRUNC('month', v_end)::DATE)
                           THEN period_month
                       ELSE DATE_TRUNC('month', v_start)::DATE END,
                   updated_at = NOW()
             WHERE id = v_fair.id;
        EXCEPTION WHEN exclusion_violation THEN
            NULL;
        END;
    END IF;

    RETURN v_fair.id;
END;
$function$;

-- ── 4. A booth the feed has not pinned yet ───────────────────────────────────────────────────────────────────────────
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

CREATE OR REPLACE FUNCTION pg_temp.remake(p_proc text, p_swaps text[])
RETURNS void
LANGUAGE plpgsql AS $fn$
DECLARE
  v_oid   regprocedure := to_regprocedure(p_proc);
  v_makes text;
  v_def   text;
  i       integer;
BEGIN
  SELECT makes INTO STRICT v_makes FROM fair_by_organiser_fns WHERE proc = p_proc;
  IF (SELECT md5(replace(prosrc, E'\r', '')) FROM pg_proc WHERE oid = v_oid) = v_makes THEN
    RETURN;  -- made already
  END IF;
  v_def := pg_get_functiondef(v_oid);
  FOR i IN 1 .. array_length(p_swaps, 1) / 2 LOOP
    v_def := pg_temp.swap_text(v_def, p_swaps[2 * i - 1], p_swaps[2 * i]);
  END LOOP;
  EXECUTE v_def;
END
$fn$;

SELECT pg_temp.remake('public.member_erp_brand_weeks(uuid, uuid)', ARRAY[
    $o$OR (e.venue_key = b.venue_key AND e.start_date IS NOT NULL AND e.end_date IS NOT NULL
                AND daterange(e.start_date, e.end_date, '[]') && daterange(b.start_date, b.end_date, '[]'))$o$,
    $n$OR (e.venue_key = b.venue_key AND e.start_date IS NOT NULL AND e.end_date IS NOT NULL
                AND daterange(e.start_date, e.end_date, '[]') && daterange(b.start_date, b.end_date, '[]')
                -- (20261114050000) … under the booth's own organiser: another organiser's fair at the place on
                -- those days is another fair, and the booth is read in its own weekend.
                AND (e.organiser_id IS NULL OR organiser_key(b.organizer) IS NULL
                     OR organiser_key(b.organizer) = (SELECT organiser_key(og.name) FROM comm_organisers og
                                                       WHERE og.id = e.organiser_id)))$n$,
    $o$-- project to, else the same place on overlapping days (erp_sync_fair's rule).$o$,
    $n$-- project to, else the same place on overlapping days under the same organiser (erp_sync_fair's rule).$n$
]);

-- ── 5. The fairs that hold more than one organiser's booths are split ────────────────────────────────────────────────
-- What each booth is — its organiser, its days — is the ERP's own list of them (erp_booths, the Sales Attending
-- feed). The fair keeps the organiser of the booth that opened it (the first of its projects the list names an
-- organiser for) and takes that organiser's booths' days; every other organiser's booths leave together.
DO $$
DECLARE
  f         comm_venue_events%ROWTYPE;
  g         record;
  v_keep    text;
  v_leaving integer[];
  v_org     uuid;
  v_new     uuid;
  v_month   date;
BEGIN
  FOR f IN
    SELECT e.*
      FROM comm_venue_events e
     WHERE e.source = 'erp' AND e.start_date IS NOT NULL
       AND (SELECT count(DISTINCT organiser_key(b.organizer))
              FROM erp_booths b
             WHERE b.erp_project_id = ANY (e.erp_project_ids) AND organiser_key(b.organizer) IS NOT NULL) > 1
     ORDER BY e.created_at, e.id
  LOOP
    SELECT organiser_key(b.organizer) INTO v_keep
      FROM erp_booths b
     WHERE b.erp_project_id = ANY (f.erp_project_ids) AND organiser_key(b.organizer) IS NOT NULL
     ORDER BY array_position(f.erp_project_ids, b.erp_project_id::integer)
     LIMIT 1;
    v_leaving := ARRAY(SELECT b.erp_project_id::integer
                         FROM erp_booths b
                        WHERE b.erp_project_id = ANY (f.erp_project_ids)
                          AND organiser_key(b.organizer) IS NOT NULL AND organiser_key(b.organizer) <> v_keep
                        ORDER BY array_position(f.erp_project_ids, b.erp_project_id::integer));

    -- The fair first, under its own booths' organiser and days: it may be standing under a leaving booth's (the
    -- last delivery won), which is the organiser the leaving booths' own fair is about to take.
    SELECT og.id INTO v_org FROM comm_organisers og WHERE organiser_key(og.name) = v_keep ORDER BY og.created_at, og.id LIMIT 1;
    UPDATE comm_venue_events e
       SET organiser_id = COALESCE(v_org, e.organiser_id),
           erp_organiser_text = k.org_name,
           start_date = k.start_date,
           end_date = k.end_date,
           period_month = CASE WHEN e.period_month IN (date_trunc('month', k.start_date)::date, date_trunc('month', k.end_date)::date)
                               THEN e.period_month ELSE date_trunc('month', k.start_date)::date END,
           erp_project_ids = ARRAY(SELECT u.p FROM unnest(f.erp_project_ids) WITH ORDINALITY AS u(p, at)
                                    WHERE NOT (u.p = ANY (v_leaving)) ORDER BY u.at),
           updated_at = now()
      FROM (SELECT (array_agg(b.organizer ORDER BY array_position(f.erp_project_ids, b.erp_project_id::integer)))[1] AS org_name,
                   min(b.start_date) AS start_date, max(b.end_date) AS end_date
              FROM erp_booths b
             WHERE b.erp_project_id = ANY (f.erp_project_ids) AND organiser_key(b.organizer) = v_keep) k
     WHERE e.id = f.id;

    FOR g IN
      SELECT organiser_key(b.organizer) AS okey,
             (array_agg(b.organizer ORDER BY array_position(f.erp_project_ids, b.erp_project_id::integer)))[1] AS org_name,
             (array_agg(b.name ORDER BY array_position(f.erp_project_ids, b.erp_project_id::integer)))[1] AS booth_name,
             min(b.start_date) AS start_date, max(b.end_date) AS end_date,
             array_agg(b.erp_project_id::integer ORDER BY array_position(f.erp_project_ids, b.erp_project_id::integer)) AS projects
        FROM erp_booths b
       WHERE b.erp_project_id = ANY (v_leaving)
       GROUP BY organiser_key(b.organizer)
       ORDER BY min(array_position(f.erp_project_ids, b.erp_project_id::integer))
    LOOP
      SELECT og.id INTO v_org FROM comm_organisers og WHERE organiser_key(og.name) = g.okey ORDER BY og.created_at, og.id LIMIT 1;
      IF v_org IS NULL THEN
        INSERT INTO comm_organisers (name, notes) VALUES (g.org_name, 'Named by the Houzs ERP') RETURNING id INTO v_org;
      END IF;

      -- That organiser's fair already standing there on those days, else one of its own.
      SELECT e.id INTO v_new
        FROM comm_venue_events e
       WHERE e.id <> f.id AND e.venue_key = f.venue_key AND e.organiser_id = v_org AND e.start_date IS NOT NULL
         AND daterange(e.start_date, e.end_date, '[]') && daterange(g.start_date, g.end_date, '[]')
       ORDER BY e.start_date, e.id
       LIMIT 1;
      IF v_new IS NULL THEN
        INSERT INTO comm_venue_events (venue_key, period_month, start_date, end_date, organiser_id,
                                       erp_organiser_text, source, erp_project_ids, notes)
        VALUES (f.venue_key, date_trunc('month', g.start_date)::date, g.start_date, g.end_date, v_org,
                g.org_name, 'erp', g.projects, NULLIF(btrim(COALESCE(g.booth_name, '')), ''))
        RETURNING id INTO v_new;
      ELSE
        UPDATE comm_venue_events e
           SET erp_project_ids = e.erp_project_ids
                                 || ARRAY(SELECT p FROM unnest(g.projects) AS p WHERE NOT (e.erp_project_ids @> ARRAY[p])),
               updated_at = now()
         WHERE e.id = v_new;
      END IF;

      -- Their bills go with them — each names its booth (the ERP's pick, raw.fair.projectId) — a month at a time,
      -- in calendar order, as every writer takes the months' locks. A month a run has paid keeps what it paid.
      FOR v_month IN
        SELECT DISTINCT o.period_month
          FROM sales_orders o
         WHERE o.fair_event_id = f.id AND o.fair_source = 'erp'
           AND (o.raw->'fair'->>'projectId') = ANY (ARRAY(SELECT p::text FROM unnest(g.projects) AS p))
         ORDER BY 1
      LOOP
        UPDATE sales_orders o
           SET fair_event_id = v_new
         WHERE o.fair_event_id = f.id AND o.fair_source = 'erp' AND o.period_month = v_month
           AND (o.raw->'fair'->>'projectId') = ANY (ARRAY(SELECT p::text FROM unnest(g.projects) AS p))
           AND NOT EXISTS (SELECT 1 FROM sales_import_batches b
                            WHERE b.id = o.batch_id
                              AND commission_order_period_locked(b.sub_department_id, b.period_month));
      END LOOP;
    END LOOP;
  END LOOP;
END $$;

-- ── 6. What stands now is what was tested ────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_bad text;
BEGIN
  SELECT string_agg(format('%s is md5 %s', f.proc, md5(replace(p.prosrc, E'\r', ''))), '; ' ORDER BY f.proc) INTO v_bad
    FROM fair_by_organiser_fns f
    JOIN pg_proc p ON p.oid = to_regprocedure(f.proc)
   WHERE md5(replace(p.prosrc, E'\r', '')) IS DISTINCT FROM f.makes;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'Not the bodies this migration makes: %', v_bad;
  END IF;
END $$;

COMMIT;
