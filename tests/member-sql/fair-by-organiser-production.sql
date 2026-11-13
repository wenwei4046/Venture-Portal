-- Production's bodies of the functions 20261114050000_fair_by_organiser is written from or leans on (pg_get_functiondef,
-- read-only, 2026-11-13; md5 of prosrc beside each). Loaded by validate-fair-by-organiser.mjs over stand-in tables.

-- organiser_key(p_name text)
-- md5(prosrc) = 6a72115804ae484dfb23da5896a66798
CREATE OR REPLACE FUNCTION public.organiser_key(p_name text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
    SELECT NULLIF(UPPER(REGEXP_REPLACE(BTRIM(COALESCE(p_name, '')), '\s+', ' ', 'g')), '');
$function$;

-- venue_key(p_venue text)
-- md5(prosrc) = 1b27dcc1fd6d7789ff680541dbadd422
CREATE OR REPLACE FUNCTION public.venue_key(p_venue text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
    SELECT NULLIF(UPPER(REGEXP_REPLACE(BTRIM(COALESCE(p_venue, '')), '\s+', ' ', 'g')), '');
$function$;

-- venue_group_key(p_venue text)
-- md5(prosrc) = 99a1b4065713609a10b86210b4412d94
CREATE OR REPLACE FUNCTION public.venue_group_key(p_venue text)
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
    SELECT COALESCE(
        (SELECT v.canonical_key FROM comm_venues v WHERE v.venue_key = venue_key(p_venue)),
        venue_key(p_venue)
    );
$function$;

-- venue_event_for_order(p_venue text, p_order_date date, p_grace_days integer)
-- md5(prosrc) = 46f054aad656b15b4ec9b349dc4f3059
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
              e.end_date DESC
     LIMIT 1;
$function$;

-- comm_venue_events_canonical()
-- md5(prosrc) = 1c22870f55db78b911eeb7bdaba2e24e
CREATE OR REPLACE FUNCTION public.comm_venue_events_canonical()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
    v_canonical TEXT;
BEGIN
    SELECT v.canonical_key INTO v_canonical
      FROM comm_venues v WHERE v.venue_key = NEW.venue_key;
    IF v_canonical IS NOT NULL THEN
        NEW.venue_key := v_canonical;
    END IF;
    RETURN NEW;
END;
$function$;

-- comm_venue_events_restamp_orders()
-- md5(prosrc) = 08f21ea2811536a6eceeb96b4cd5c3de
CREATE OR REPLACE FUNCTION public.comm_venue_events_restamp_orders()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
    v_places TEXT[] := '{}';
BEGIN
    IF TG_OP <> 'INSERT' THEN v_places := v_places || OLD.venue_key; END IF;
    IF TG_OP <> 'DELETE' THEN v_places := v_places || NEW.venue_key; END IF;

    UPDATE sales_orders o
       SET fair_event_id = venue_event_for_order(o.venue, o.order_date),
           fair_source   = CASE WHEN venue_event_for_order(o.venue, o.order_date) IS NULL
                                THEN NULL ELSE 'venue_match' END
     WHERE venue_group_key(o.venue) = ANY (v_places)
       -- (20260927010000) Neither a person's pin nor the ERP's is re-guessed,
       -- and a month a run has paid keeps what it paid: its bills refuse any
       -- change (guard_commission_order_scope), and one of them must not make
       -- a fair — now opened by an ERP delivery — impossible to save.
       AND COALESCE(o.fair_source, '') NOT IN ('manual', 'erp')
       AND o.fair_event_id IS DISTINCT FROM venue_event_for_order(o.venue, o.order_date)
       AND NOT EXISTS (SELECT 1 FROM sales_import_batches b
                        WHERE b.id = o.batch_id
                          AND commission_order_period_locked(b.sub_department_id, b.period_month));

    RETURN NULL;
END;
$function$;

-- sales_orders_resolve_fair()
-- md5(prosrc) = d285edbaa251793c6177408d8db5173a
CREATE OR REPLACE FUNCTION public.sales_orders_resolve_fair()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
    -- (20260927010000) The ERP's pick is pinned like a person's.
    IF NEW.fair_source IN ('manual', 'erp') THEN
        RETURN NEW;
    END IF;

    NEW.fair_event_id := venue_event_for_order(NEW.venue, NEW.order_date);
    NEW.fair_source   := CASE WHEN NEW.fair_event_id IS NULL THEN NULL ELSE 'venue_match' END;
    RETURN NEW;
END;
$function$;

-- erp_sync_fair(p_fair jsonb)
-- md5(prosrc) = b2a911b1f14e940e0166f57d7dd289dc
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

    -- This project's fair; else the event it is a brand booth of — the same
    -- place on overlapping days, the exact window first.
    SELECT * INTO v_fair FROM comm_venue_events WHERE erp_project_ids @> ARRAY[v_project] LIMIT 1;
    v_found := FOUND;
    IF NOT v_found THEN
        SELECT * INTO v_fair
          FROM comm_venue_events e
         WHERE e.venue_key = v_place
           AND e.start_date IS NOT NULL
           AND DATERANGE(e.start_date, e.end_date, '[]') && DATERANGE(v_start, v_end, '[]')
         ORDER BY (e.start_date = v_start AND e.end_date = v_end) DESC, e.start_date
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
             ORDER BY e.start_date
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
        UPDATE comm_venue_events
           SET erp_project_ids = CASE WHEN erp_project_ids @> ARRAY[v_project] THEN erp_project_ids
                                      ELSE erp_project_ids || v_project END,
               organiser_id = COALESCE(v_org, organiser_id),
               erp_organiser_text = COALESCE(v_org_name, erp_organiser_text),
               source = 'erp',
               updated_at = NOW()
         WHERE id = v_fair.id;
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

-- member_erp_brand_weeks(p_sub_department uuid, p_staff uuid)
-- md5(prosrc) = 183e8d1838a86f90cfd6094a303ed813
CREATE OR REPLACE FUNCTION public.member_erp_brand_weeks(p_sub_department uuid, p_staff uuid DEFAULT NULL::uuid)
 RETURNS TABLE(staff_id uuid, week date, erp_project_id bigint, fair_id uuid, brand text, venue text, venue_key text, organizer text, start_date date, end_date date, booths integer)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
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
$function$;
