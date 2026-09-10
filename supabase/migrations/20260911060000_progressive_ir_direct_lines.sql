-- Confirmed 2026-09-11: expanded lines receive the same monthly package.
-- Opening another line requires ALL existing groups to qualify in that
-- opening month. An unused offer expires; a slot actually opened is retained.
ALTER TABLE public.comm_direct_line_entitlements
    ADD COLUMN direct_line_limit INTEGER NOT NULL DEFAULT 4 CHECK (direct_line_limit >= 4),
    ADD COLUMN opened_direct_line_limit INTEGER NOT NULL DEFAULT 3 CHECK (opened_direct_line_limit >= 3);

-- Preserve lines already opened before this rule was clarified, counting
-- simultaneous dated occupancy rather than adding successive occupants.
WITH events AS (
    SELECT scheme_id, upline_staff_id AS staff_id, effective_from AS day, 1 AS delta
      FROM public.comm_hierarchy WHERE upline_staff_id IS NOT NULL
    UNION ALL
    SELECT scheme_id, upline_staff_id, effective_to + 1, -1
      FROM public.comm_hierarchy WHERE upline_staff_id IS NOT NULL AND effective_to IS NOT NULL
), per_day AS (
    SELECT scheme_id, staff_id, day, sum(delta) AS delta
      FROM events GROUP BY scheme_id, staff_id, day
), occupied AS (
    SELECT scheme_id, staff_id, sum(delta) OVER (PARTITION BY scheme_id, staff_id ORDER BY day) AS n
      FROM per_day
), peaks AS (
    SELECT scheme_id, staff_id, max(n)::INTEGER AS n FROM occupied GROUP BY scheme_id, staff_id
)
UPDATE public.comm_direct_line_entitlements e
   SET opened_direct_line_limit = greatest(3, p.n)
  FROM peaks p WHERE p.scheme_id = e.scheme_id AND p.staff_id = e.staff_id;

COMMENT ON TABLE public.comm_direct_line_entitlements IS
    'Initial SDL evidence is permanent. direct_line_limit records the highest evidenced offer; opened_direct_line_limit retains actual opened capacity. Opening a further line requires all existing groups to qualify in its opening month. No company title or permission changes.';
COMMENT ON COLUMN public.comm_direct_line_entitlements.direct_line_limit IS
    'Highest historically evidenced opening offer. This does not grant an unused slot in a later month.';
COMMENT ON COLUMN public.comm_direct_line_entitlements.opened_direct_line_limit IS
    'Permanent highwater of populated direct slots, retained after weak months, departures or reopening a run.';

CREATE TABLE public.comm_direct_line_expansion_awards (
    scheme_id UUID NOT NULL,
    staff_id UUID NOT NULL,
    direct_line_limit INTEGER NOT NULL CHECK (direct_line_limit >= 4),
    run_id UUID REFERENCES public.comm_runs(id) ON DELETE SET NULL,
    source_run_id UUID NOT NULL,
    source_period_month DATE NOT NULL,
    earned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    earned_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    group_incentive DECIMAL(15, 2) NOT NULL CHECK (group_incentive > 0),
    group_breakdown JSONB NOT NULL CHECK (jsonb_typeof(group_breakdown) = 'array'),
    PRIMARY KEY (scheme_id, staff_id, direct_line_limit),
    FOREIGN KEY (scheme_id, staff_id)
        REFERENCES public.comm_direct_line_entitlements(scheme_id, staff_id) ON DELETE RESTRICT
);
COMMENT ON TABLE public.comm_direct_line_expansion_awards IS
    'First qualification evidence per offered capacity: 4 from Full Spec, then 5, 6, etc. An unused offer is only usable in a month with applied qualifying evidence; reopening withdraws unused permission. Opened capacity and historical evidence are retained.';
ALTER TABLE public.comm_direct_line_expansion_awards ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.comm_direct_line_expansion_awards FROM anon, authenticated;
GRANT SELECT ON public.comm_direct_line_expansion_awards TO authenticated;
CREATE POLICY comm_direct_line_expansion_awards_read ON public.comm_direct_line_expansion_awards
    FOR SELECT TO authenticated USING ((SELECT has_scope(ARRAY['admin', 'hr'])));

INSERT INTO public.comm_direct_line_expansion_awards (
    scheme_id, staff_id, direct_line_limit, run_id, source_run_id, source_period_month,
    earned_at, earned_by, group_incentive, group_breakdown
)
SELECT scheme_id, staff_id, 4, first_run_id, source_run_id, source_period_month,
       earned_at, earned_by, group_incentive, group_breakdown
  FROM public.comm_direct_line_entitlements;

CREATE FUNCTION public.comm_record_initial_direct_expansion()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
    INSERT INTO public.comm_direct_line_expansion_awards (
        scheme_id, staff_id, direct_line_limit, run_id, source_run_id, source_period_month,
        earned_at, earned_by, group_incentive, group_breakdown
    ) VALUES (
        NEW.scheme_id, NEW.staff_id, 4, NEW.first_run_id, NEW.source_run_id,
        NEW.source_period_month, NEW.earned_at, NEW.earned_by, NEW.group_incentive, NEW.group_breakdown
    );
    RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.comm_record_initial_direct_expansion() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER comm_record_initial_direct_expansion
    AFTER INSERT ON public.comm_direct_line_entitlements
    FOR EACH ROW EXECUTE FUNCTION public.comm_record_initial_direct_expansion();

-- Internal authoritative limit for both a dated membership write and the UI.
-- Never infer current permission from historical awards: an unused offer is
-- available only from this month's applied statement for the exact team.
CREATE FUNCTION public.comm_effective_direct_line_limit(
    p_scheme_id UUID, p_staff_id UUID, p_as_of DATE, p_lock_run BOOLEAN DEFAULT FALSE
) RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
    v_base INTEGER;
    v_opened INTEGER;
    v_count INTEGER;
    v_staff_ids TEXT[];
    v_statement RECORD;
BEGIN
    SELECT direct_line_limit INTO v_base FROM public.comm_schemes WHERE id = p_scheme_id;
    IF v_base IS NULL THEN RETURN NULL; END IF;
    SELECT opened_direct_line_limit INTO v_opened FROM public.comm_direct_line_entitlements
     WHERE scheme_id = p_scheme_id AND staff_id = p_staff_id;
    IF NOT FOUND THEN RETURN v_base; END IF;
    v_opened := greatest(v_base, v_opened);

    SELECT count(*)::INTEGER, array_agg(h.staff_id::TEXT ORDER BY h.staff_id::TEXT)
      INTO v_count, v_staff_ids
      FROM public.comm_hierarchy h
     WHERE h.scheme_id = p_scheme_id AND h.upline_staff_id = p_staff_id
       AND h.effective_from <= p_as_of AND (h.effective_to IS NULL OR h.effective_to >= p_as_of);
    -- Replacing a departed member uses its retained slot; qualification only
    -- grows the number of slots after every already-opened slot is occupied.
    IF v_count < v_opened THEN RETURN v_opened; END IF;

    IF p_lock_run THEN
        -- Membership writes already hold their parent's lock. Never wait on a
        -- run whose applying transaction could be waiting for that same lock.
        -- Read-only UI calls take no locks. A concurrent reopen must finish
        -- before the opening can rely on its applied evidence.
        BEGIN
            PERFORM 1 FROM public.comm_runs r
             WHERE r.scheme_id = p_scheme_id
               AND r.period_month = date_trunc('month', p_as_of)::DATE
               AND r.status IN ('applied', 'locked') FOR SHARE NOWAIT;
        EXCEPTION WHEN lock_not_available THEN
            RAISE EXCEPTION 'The commission month is changing. Refresh before opening another direct line.'
                USING ERRCODE = '55P03';
        END;
    END IF;

    FOR v_statement IN
        SELECT s.full_spec, s.group_breakdown
          FROM public.comm_runs r JOIN public.comm_statements s ON s.run_id = r.id
         WHERE r.scheme_id = p_scheme_id AND r.period_month = date_trunc('month', p_as_of)::DATE
           AND r.status IN ('applied', 'locked') AND r.warnings = '[]'::JSONB
           AND r.computed_at IS NOT NULL AND r.applied_at IS NOT NULL
           AND s.staff_id = p_staff_id AND s.group_incentive > 0
    LOOP
        IF jsonb_array_length(v_statement.group_breakdown) <> v_count
           OR (v_count = 3 AND NOT v_statement.full_spec) THEN CONTINUE; END IF;
        IF (
            SELECT array_agg(g ->> 'directStaffId' ORDER BY g ->> 'directStaffId') = v_staff_ids
               AND count(DISTINCT g ->> 'directStaffId') = v_count
               AND bool_and(COALESCE(
                   g -> 'qualifies' = 'true'::JSONB AND g -> 'valid' = 'true'::JSONB
                   AND g -> 'eligible' = 'true'::JSONB
                   AND g ->> 'directStaffId' <> p_staff_id::TEXT
                   AND CASE WHEN jsonb_typeof(g -> 'incentive') = 'number'
                       THEN (g ->> 'incentive')::NUMERIC > 0 ELSE FALSE END
                   AND CASE WHEN jsonb_typeof(g -> 'totalRevenue') = 'number'
                             AND jsonb_typeof(g -> 'targetRevenue') = 'number'
                       THEN (g ->> 'targetRevenue')::NUMERIC > 0
                        AND (g ->> 'totalRevenue')::NUMERIC >= (g ->> 'targetRevenue')::NUMERIC
                       ELSE FALSE END
                   AND CASE WHEN v_count = 3 THEN
                       CASE WHEN jsonb_typeof(g -> 'secondLayer') = 'array'
                           THEN jsonb_array_length(g -> 'secondLayer') = 3 ELSE FALSE END
                       ELSE TRUE END,
                   FALSE
               ))
              FROM jsonb_array_elements(v_statement.group_breakdown) g
        ) THEN RETURN greatest(v_opened, v_count + 1); END IF;
    END LOOP;
    RETURN v_opened;
END;
$$;
REVOKE ALL ON FUNCTION public.comm_effective_direct_line_limit(UUID, UUID, DATE, BOOLEAN) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.comm_effective_direct_line_limits(p_scheme_id UUID)
RETURNS TABLE (staff_id UUID, direct_line_limit INTEGER)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
    IF NOT has_scope(ARRAY['admin', 'hr']) THEN
        RAISE EXCEPTION 'Only Principal or HR may read commission direct-line limits' USING ERRCODE = '42501';
    END IF;
    RETURN QUERY
        SELECT people.id, public.comm_effective_direct_line_limit(
            p_scheme_id, people.id, (NOW() AT TIME ZONE 'Asia/Kuala_Lumpur')::DATE
        ) FROM (
            SELECT h.staff_id AS id FROM public.comm_hierarchy h WHERE h.scheme_id = p_scheme_id
            UNION SELECT e.staff_id FROM public.comm_direct_line_entitlements e WHERE e.scheme_id = p_scheme_id
        ) people;
END;
$$;
REVOKE ALL ON FUNCTION public.comm_effective_direct_line_limits(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.comm_effective_direct_line_limits(UUID) TO authenticated;

CREATE FUNCTION public.comm_extend_direct_line_capacity()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
    v_statement RECORD;
    v_limit INTEGER;
    v_count INTEGER;
BEGIN
    IF NEW.status NOT IN ('applied', 'locked') OR OLD.status <> 'computed'
       OR NEW.computed_at IS NULL OR NEW.applied_at IS NULL
       OR NEW.warnings IS DISTINCT FROM '[]'::JSONB THEN
        RETURN NULL;
    END IF;

    FOR v_statement IN
        SELECT s.staff_id, s.group_incentive, s.group_breakdown
          FROM public.comm_statements s
          JOIN public.comm_direct_line_entitlements e
            ON e.scheme_id = NEW.scheme_id AND e.staff_id = s.staff_id
         WHERE s.run_id = NEW.id AND s.group_incentive > 0
         ORDER BY s.staff_id
    LOOP
        -- Same parent lock as membership writes. Serialise competing applied
        -- months before reading the slots actually opened.
        PERFORM pg_advisory_xact_lock(hashtextextended(
            'comm-direct:' || NEW.scheme_id::TEXT || ':' || v_statement.staff_id::TEXT, 0
        ));
        SELECT opened_direct_line_limit INTO v_limit FROM public.comm_direct_line_entitlements
         WHERE scheme_id = NEW.scheme_id AND staff_id = v_statement.staff_id FOR UPDATE;
        v_count := jsonb_array_length(v_statement.group_breakdown);

        -- Record the first offer for the next slot. The effective-limit helper
        -- independently requires this month's evidence when it is opened.
        IF v_count <> v_limit OR v_count < 4 THEN CONTINUE; END IF;
        -- The current run is visible as applied inside this AFTER trigger.
        -- Reuse the exact dated team match, so stale or substituted direct IDs
        -- cannot create misleading eligibility evidence even without a move.
        IF public.comm_effective_direct_line_limit(
            NEW.scheme_id, v_statement.staff_id,
            (NEW.period_month + INTERVAL '1 month - 1 day')::DATE
        ) <= v_count THEN CONTINUE; END IF;
        IF NOT (
            SELECT count(DISTINCT g ->> 'directStaffId') = v_count
               AND bool_and(COALESCE(
                   g -> 'qualifies' = 'true'::JSONB
                   AND g -> 'valid' = 'true'::JSONB
                   AND g -> 'eligible' = 'true'::JSONB
                   AND COALESCE(g ->> 'directStaffId', '') <> ''
                   AND g ->> 'directStaffId' <> v_statement.staff_id::TEXT
                   AND CASE WHEN jsonb_typeof(g -> 'incentive') = 'number'
                       THEN (g ->> 'incentive')::NUMERIC > 0 ELSE FALSE END
                   AND CASE WHEN jsonb_typeof(g -> 'totalRevenue') = 'number'
                             AND jsonb_typeof(g -> 'targetRevenue') = 'number'
                       THEN (g ->> 'targetRevenue')::NUMERIC > 0
                        AND (g ->> 'totalRevenue')::NUMERIC >= (g ->> 'targetRevenue')::NUMERIC
                       ELSE FALSE END,
                   FALSE
               ))
              FROM jsonb_array_elements(v_statement.group_breakdown) g
        ) THEN CONTINUE; END IF;

        INSERT INTO public.comm_direct_line_expansion_awards (
            scheme_id, staff_id, direct_line_limit, run_id, source_run_id,
            source_period_month, earned_by, group_incentive, group_breakdown
        ) VALUES (
            NEW.scheme_id, v_statement.staff_id, v_count + 1, NEW.id, NEW.id,
            NEW.period_month, NEW.applied_by, v_statement.group_incentive, v_statement.group_breakdown
        ) ON CONFLICT (scheme_id, staff_id, direct_line_limit) DO NOTHING;
        UPDATE public.comm_direct_line_entitlements SET direct_line_limit = greatest(direct_line_limit, v_count + 1)
         WHERE scheme_id = NEW.scheme_id AND staff_id = v_statement.staff_id;
    END LOOP;
    RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.comm_extend_direct_line_capacity() FROM PUBLIC, anon, authenticated;
-- Trigger names order this after the initial Full Spec award on the same run.
CREATE TRIGGER comm_runs_extend_direct_line_capacity
    AFTER UPDATE OF status ON public.comm_runs
    FOR EACH ROW EXECUTE FUNCTION public.comm_extend_direct_line_capacity();

CREATE OR REPLACE FUNCTION public.comm_hierarchy_direct_line_limit()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
    v_limit INTEGER;
    v_peak INTEGER;
    v_point RECORD;
    v_name TEXT;
    v_window DATERANGE;
BEGIN
    IF NEW.upline_staff_id IS NULL THEN RETURN NEW; END IF;
    v_window := daterange(NEW.effective_from, NEW.effective_to, '[]');
    IF TG_OP = 'UPDATE'
       AND NEW.scheme_id = OLD.scheme_id
       AND NEW.staff_id = OLD.staff_id
       AND NEW.upline_staff_id IS NOT DISTINCT FROM OLD.upline_staff_id
       AND v_window <@ daterange(OLD.effective_from, OLD.effective_to, '[]') THEN
        RETURN NEW;
    END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended(
        'comm-direct:' || NEW.scheme_id::TEXT || ':' || NEW.upline_staff_id::TEXT, 0
    ));
    SELECT direct_line_limit INTO v_limit FROM public.comm_schemes WHERE id = NEW.scheme_id;
    IF v_limit IS NULL THEN RETURN NEW; END IF;
    SELECT greatest(v_limit, COALESCE((
        SELECT opened_direct_line_limit FROM public.comm_direct_line_entitlements
         WHERE scheme_id = NEW.scheme_id AND staff_id = NEW.upline_staff_id
    ), v_limit)) INTO v_peak;

    -- Check the month when each extra simultaneous slot would actually open.
    -- A dated row can overlap another row that starts later; permission in
    -- NEW.effective_from's month must not be carried into that later month.
    FOR v_point IN WITH windows AS (
        SELECT daterange(h.effective_from, h.effective_to, '[]') * v_window AS span
          FROM public.comm_hierarchy h
         WHERE h.scheme_id = NEW.scheme_id AND h.upline_staff_id = NEW.upline_staff_id
           AND h.id IS DISTINCT FROM NEW.id
           AND daterange(h.effective_from, h.effective_to, '[]') && v_window
        UNION ALL SELECT v_window
    ), events AS (
        SELECT lower(span) AS day, 1 AS delta FROM windows
        UNION ALL
        SELECT upper(span) AS day, -1 AS delta FROM windows WHERE NOT upper_inf(span)
    ), per_day AS (
        SELECT day, sum(delta) AS delta FROM events GROUP BY day
    ), occupied AS (
        SELECT day, sum(delta) OVER (ORDER BY day)::INTEGER AS n FROM per_day
    ) SELECT day, n FROM occupied ORDER BY day
    LOOP
        IF v_point.n <= v_peak THEN CONTINUE; END IF;
        v_limit := public.comm_effective_direct_line_limit(
            NEW.scheme_id, NEW.upline_staff_id, v_point.day, TRUE
        );
        IF v_point.n > v_limit THEN
            SELECT employee_name INTO v_name FROM public.hr_staff_costs WHERE id = NEW.upline_staff_id;
            RAISE EXCEPTION '% has reached the limit of % direct lines. All groups must qualify in opening month %.',
                COALESCE(v_name, 'That leader'), v_limit, to_char(v_point.day, 'YYYY-MM')
                USING ERRCODE = '23CAP';
        END IF;
        v_peak := v_point.n;
    END LOOP;
    RETURN NEW;
END;
$$;

-- Consume capacity only for a row that was actually written. A BEFORE trigger
-- may run even when INSERT ... ON CONFLICT DO NOTHING ultimately inserts none.
CREATE FUNCTION public.comm_retain_opened_direct_capacity()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
    v_peak INTEGER;
BEGIN
    IF NEW.upline_staff_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.comm_direct_line_entitlements
         WHERE scheme_id = NEW.scheme_id AND staff_id = NEW.upline_staff_id
    ) THEN RETURN NULL; END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended(
        'comm-direct:' || NEW.scheme_id::TEXT || ':' || NEW.upline_staff_id::TEXT, 0
    ));
    WITH windows AS (
        SELECT daterange(h.effective_from, h.effective_to, '[]') AS span
          FROM public.comm_hierarchy h
         WHERE h.scheme_id = NEW.scheme_id AND h.upline_staff_id = NEW.upline_staff_id
    ), events AS (
        SELECT lower(span) AS day, 1 AS delta FROM windows
        UNION ALL
        SELECT upper(span) AS day, -1 AS delta FROM windows WHERE NOT upper_inf(span)
    ), per_day AS (
        SELECT day, sum(delta) AS delta FROM events GROUP BY day
    ), occupied AS (
        SELECT sum(delta) OVER (ORDER BY day) AS n FROM per_day
    ) SELECT COALESCE(max(n), 0)::INTEGER INTO v_peak FROM occupied;
    UPDATE public.comm_direct_line_entitlements
       SET opened_direct_line_limit = greatest(opened_direct_line_limit, v_peak)
     WHERE scheme_id = NEW.scheme_id AND staff_id = NEW.upline_staff_id;
    RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.comm_retain_opened_direct_capacity() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER comm_hierarchy_retain_opened_direct_capacity
    AFTER INSERT OR UPDATE ON public.comm_hierarchy
    FOR EACH ROW EXECUTE FUNCTION public.comm_retain_opened_direct_capacity();
