-- Direct-line capacity and the earned SDL commission expansion.
-- SDL here is an earned fourth-direct entitlement, not a company title or
-- permission grant. First applied evidence is permanent, including on reopen;
-- correcting an erroneous applied award requires explicit admin remediation.

CREATE TABLE public.comm_direct_line_entitlements (
    scheme_id UUID NOT NULL REFERENCES public.comm_schemes(id) ON DELETE RESTRICT,
    staff_id UUID NOT NULL REFERENCES public.hr_staff_costs(id) ON DELETE RESTRICT,
    first_run_id UUID REFERENCES public.comm_runs(id) ON DELETE SET NULL,
    source_run_id UUID NOT NULL,
    source_period_month DATE NOT NULL,
    earned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    earned_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    group_incentive DECIMAL(15, 2) NOT NULL CHECK (group_incentive > 0),
    group_breakdown JSONB NOT NULL CHECK (jsonb_typeof(group_breakdown) = 'array'),
    PRIMARY KEY (scheme_id, staff_id)
);

COMMENT ON TABLE public.comm_direct_line_entitlements IS
    'Permanent fourth-direct SDL expansion earned from a Full Spec applied run. First evidence is retained when source statements are recomputed or the run is reopened. Never changes company titles or user permissions. Erroneous awards require explicit audited admin correction.';
COMMENT ON COLUMN public.comm_direct_line_entitlements.source_run_id IS
    'Immutable source identifier retained even if the source run is removed; first_run_id is the navigable nullable FK.';

ALTER TABLE public.comm_direct_line_entitlements ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.comm_direct_line_entitlements FROM anon, authenticated;
GRANT SELECT ON public.comm_direct_line_entitlements TO authenticated;
CREATE POLICY comm_direct_line_entitlements_read ON public.comm_direct_line_entitlements
    FOR SELECT TO authenticated
    USING ((SELECT has_scope(ARRAY['admin', 'hr'])));

CREATE OR REPLACE FUNCTION public.comm_award_direct_line_expansion()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
    IF NEW.status NOT IN ('applied', 'locked') OR OLD.status <> 'computed'
       OR NEW.computed_at IS NULL OR NEW.applied_at IS NULL
       OR NEW.warnings IS DISTINCT FROM '[]'::JSONB THEN
        RETURN NULL;
    END IF;

    -- Qualification must be paid and reviewed. A draft/computed preview never
    -- grants capacity. Validate the three-by-three evidence shape as well as
    -- the engine's boolean; later config/hierarchy edits do not rewrite it.
    INSERT INTO public.comm_direct_line_entitlements (
        scheme_id, staff_id, first_run_id, source_run_id, source_period_month,
        earned_by, group_incentive, group_breakdown
    )
    SELECT NEW.scheme_id, s.staff_id, NEW.id, NEW.id, NEW.period_month,
           NEW.applied_by, s.group_incentive, s.group_breakdown
      FROM public.comm_statements s
     WHERE s.run_id = NEW.id AND s.full_spec AND s.group_incentive > 0
       AND jsonb_typeof(s.group_breakdown) = 'array'
       AND CASE WHEN jsonb_typeof(s.group_breakdown) = 'array'
           THEN jsonb_array_length(s.group_breakdown) = 3 ELSE FALSE END
       AND (
           SELECT count(DISTINCT g ->> 'directStaffId') = 3
              AND bool_and(COALESCE(
                  g -> 'qualifies' = 'true'::JSONB
                  AND g -> 'valid' = 'true'::JSONB
                  AND g -> 'eligible' = 'true'::JSONB
                  AND COALESCE(g ->> 'directStaffId', '') <> ''
                  AND g ->> 'directStaffId' <> s.staff_id::TEXT
                  AND CASE WHEN jsonb_typeof(g -> 'secondLayer') = 'array'
                      THEN jsonb_array_length(g -> 'secondLayer') = 3 ELSE FALSE END,
                  FALSE
              ))
             FROM jsonb_array_elements(
                 CASE WHEN jsonb_typeof(s.group_breakdown) = 'array'
                      THEN s.group_breakdown ELSE '[]'::JSONB END
             ) g
       )
       AND (
           SELECT count(DISTINCT m ->> 'staffId') = 9
              AND bool_and(COALESCE(
                  m ->> 'staffId' <> '' AND m ->> 'staffId' <> s.staff_id::TEXT
                  AND NOT EXISTS (
                      SELECT 1 FROM jsonb_array_elements(s.group_breakdown) d
                       WHERE d ->> 'directStaffId' = m ->> 'staffId'
                  ), FALSE
              ))
             FROM jsonb_array_elements(s.group_breakdown) g
             CROSS JOIN LATERAL jsonb_array_elements(
                 CASE WHEN jsonb_typeof(g -> 'secondLayer') = 'array'
                      THEN g -> 'secondLayer' ELSE '[]'::JSONB END
             ) m
       )
    ON CONFLICT (scheme_id, staff_id) DO NOTHING;
    RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.comm_award_direct_line_expansion() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER comm_runs_award_direct_line_expansion
    AFTER UPDATE OF status ON public.comm_runs
    FOR EACH ROW EXECUTE FUNCTION public.comm_award_direct_line_expansion();

CREATE OR REPLACE FUNCTION public.comm_hierarchy_direct_line_limit()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
    v_limit INTEGER;
    v_peak INTEGER;
    v_name TEXT;
    v_window DATERANGE;
BEGIN
    IF NEW.upline_staff_id IS NULL THEN RETURN NEW; END IF;
    v_window := daterange(NEW.effective_from, NEW.effective_to, '[]');

    -- Editing a rank/title or shortening a line does not take another slot.
    -- This also preserves existing rows if a configured cap is later lowered.
    IF TG_OP = 'UPDATE'
       AND NEW.scheme_id = OLD.scheme_id
       AND NEW.staff_id = OLD.staff_id
       AND NEW.upline_staff_id IS NOT DISTINCT FROM OLD.upline_staff_id
       AND v_window <@ daterange(OLD.effective_from, OLD.effective_to, '[]') THEN
        RETURN NEW;
    END IF;

    -- Every writer of the same parent's capacity waits for the same lock,
    -- including home reports_to sync and direct membership inserts. This
    -- VOLATILE trigger reads a fresh snapshot after the wait at READ COMMITTED.
    PERFORM pg_advisory_xact_lock(hashtextextended(
        'comm-direct:' || NEW.scheme_id::TEXT || ':' || NEW.upline_staff_id::TEXT, 0
    ));
    SELECT direct_line_limit INTO v_limit FROM public.comm_schemes WHERE id = NEW.scheme_id;
    IF v_limit IS NULL THEN RETURN NEW; END IF;
    IF EXISTS (
        SELECT 1 FROM public.comm_direct_line_entitlements
         WHERE scheme_id = NEW.scheme_id AND staff_id = NEW.upline_staff_id
    ) THEN
        v_limit := greatest(v_limit, 4);
    END IF;

    -- Peak simultaneous occupancy, including the proposed membership. Counting
    -- every row intersecting an open-ended range would incorrectly add up
    -- successive historical occupants of the same available slot.
    WITH windows AS (
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
        SELECT sum(delta) OVER (ORDER BY day) AS n FROM per_day
    ) SELECT COALESCE(max(n), 0)::INTEGER INTO v_peak FROM occupied;

    IF v_peak > v_limit THEN
        SELECT employee_name INTO v_name FROM public.hr_staff_costs WHERE id = NEW.upline_staff_id;
        RAISE EXCEPTION '% has reached the limit of % direct lines.', COALESCE(v_name, 'That leader'), v_limit
            USING ERRCODE = '23CAP';
    END IF;
    RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.comm_hierarchy_direct_line_limit() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER comm_hierarchy_direct_line_limit
    BEFORE INSERT OR UPDATE ON public.comm_hierarchy
    FOR EACH ROW EXECUTE FUNCTION public.comm_hierarchy_direct_line_limit();

-- Atomic effective-dated replacement. RLS remains the caller's RLS. A refused
-- insert rolls back its preceding close, so a racing move cannot orphan the
-- mover's membership while an application attempts a compensating HTTP write.
CREATE OR REPLACE FUNCTION public.comm_replace_membership_position(
    p_position_id UUID,
    p_upline_staff_id UUID,
    p_rank_id UUID,
    p_title_id UUID,
    p_rate_mode public.comm_rate_mode,
    p_actor UUID
) RETURNS UUID
LANGUAGE plpgsql SECURITY INVOKER SET search_path TO 'public'
AS $$
DECLARE
    v_position public.comm_hierarchy%ROWTYPE;
    v_from DATE := public.comm_period_start();
    v_id UUID;
BEGIN
    IF p_actor IS DISTINCT FROM auth.uid() THEN
        RAISE EXCEPTION 'The membership actor must be the signed-in user' USING ERRCODE = '42501';
    END IF;
    SELECT * INTO v_position FROM public.comm_hierarchy
     WHERE id = p_position_id AND effective_to IS NULL FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'That membership changed or is no longer visible. Refresh before trying again.'
            USING ERRCODE = '23MEM';
    END IF;
    IF v_position.effective_from >= v_from THEN
        UPDATE public.comm_hierarchy
           SET upline_staff_id = p_upline_staff_id, rank_id = p_rank_id,
               title_id = p_title_id, rate_mode = p_rate_mode
         WHERE id = v_position.id RETURNING id INTO v_id;
    ELSE
        UPDATE public.comm_hierarchy SET effective_to = v_from - 1
         WHERE id = v_position.id;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'That membership is not writable by this account' USING ERRCODE = '42501';
        END IF;
        INSERT INTO public.comm_hierarchy (
            scheme_id, staff_id, upline_staff_id, rank_id, title_id, rate_mode, effective_from, created_by
        ) VALUES (
            v_position.scheme_id, v_position.staff_id, p_upline_staff_id, p_rank_id,
            p_title_id, p_rate_mode, v_from, p_actor
        ) RETURNING id INTO v_id;
    END IF;
    IF v_id IS NULL THEN
        RAISE EXCEPTION 'That membership is not writable by this account' USING ERRCODE = '42501';
    END IF;
    RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.comm_replace_membership_position(UUID, UUID, UUID, UUID, public.comm_rate_mode, UUID)
    FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.comm_replace_membership_position(UUID, UUID, UUID, UUID, public.comm_rate_mode, UUID)
    TO authenticated;
