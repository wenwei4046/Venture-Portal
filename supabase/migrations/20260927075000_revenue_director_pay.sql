-- ════════════════════════════════════════════════════════════════════════════
-- REVENUE DIRECTORS ARE PAID (user, 2026-09-27)
--
-- 2026-09-11 put the Revenue Director above the ladder: no rung, no rank, no
-- membership, no override, and (2026-09-19) their own bills earned nothing.
-- The user, 2026-09-27, keeps the reporting and the no-override and changes
-- the pay:
--
--   "我现在其实要放一个 Revenue Director … Revenue Director 本身选 rank 时，
--    我也可以 pick 我刚刚下的那个新 rank。不过 Revenue Director 的规则比较
--    特别：他可以有 downline，他可以 recruit，但是他没有 overriding，只有
--    自己的 basic；如果自己有做 sales，就只拿自己的 rate 罢了"
--
--   "they have fix pay amount that pay from revenue department … One is a
--    fixed amount. The other is a threshold … if the total sales order
--    revenue reaches a threshold of 2 million, then that triggers an
--    incentive."
--
-- and, asked: the fixed amount is their "base commission" (the Revenue
-- payroll carves the basic out of it like anybody's); the threshold reads the
-- sub-department's month Commissionable value (Comm Cal's card); own bills pay
-- the rank's rate and nothing else; the amounts are set per director.
--
-- So, in the database:
--
--   1. The Revenue Director's title may hold a RUNG on a sub-department's
--      ladder — it names the rank their OWN bills are paid at. Nobody is
--      promoted into it: the rung takes no group target or streak (a rung
--      without a gate cannot be climbed, `gateHolds`), no group package, and
--      it may always recruit. The head still holds no membership
--      (`comm_hierarchy_no_department_head` stands) and no member may be
--      placed at the director's rung.
--   2. `comm_director_pay` — per scheme and director: a fixed amount, and an
--      incentive paid when the month's Commissionable value reaches a
--      threshold. The engine adds both to the director's commission; the
--      close carries it to payroll like anybody's.
--
-- The engine reads both from TypeScript (commission-input.ts); nothing here
-- changes a figure until the page that reads them is deployed.
--
-- Rollback: DROP TABLE comm_director_pay; DROP TRIGGER comm_ranks_director_rung
-- and comm_hierarchy_not_director_rung (and their functions); delete any rung
-- whose title heads its department; recreate comm_ranks_no_department_head
-- from 20260915020000.
-- ════════════════════════════════════════════════════════════════════════════

-- ─── 1. The director's rung ─────────────────────────────────────────────────

DROP TRIGGER IF EXISTS comm_ranks_no_department_head ON public.comm_ranks;
DROP FUNCTION IF EXISTS public.comm_ranks_no_department_head();

CREATE OR REPLACE FUNCTION public.comm_ranks_director_rung()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
    v_name TEXT;
BEGIN
    IF NOT public.title_is_department_head(NEW.title_id) THEN
        RETURN NEW;
    END IF;
    SELECT name INTO v_name FROM public.titles WHERE id = NEW.title_id;
    v_name := coalesce(v_name, 'That title');

    -- Nobody climbs into it: a rung with no gate is out of reach on volume.
    IF NEW.group_sales_threshold IS NOT NULL
       OR NEW.personal_sales_threshold IS NOT NULL
       OR NEW.consecutive_months IS NOT NULL THEN
        RAISE EXCEPTION '% heads the department — its rung only sets the rate of their own bills. Nobody is promoted into it, so it takes no group target or sales streak.',
            v_name USING ERRCODE = '23DIR';
    END IF;

    -- Their own bills pay a percentage; a group package pays no percentage.
    IF coalesce(NEW.group_incentive_amount, 0) > 0
       OR coalesce((SELECT d.group_incentive_amount FROM public.comm_rank_defs d WHERE d.id = NEW.rank_def_id), 0) > 0 THEN
        RAISE EXCEPTION '% is paid a percentage on their own bills — pick a percentage rank, not a group package.',
            v_name USING ERRCODE = '23DIR';
    END IF;

    -- A director may always have people under them.
    NEW.can_recruit := TRUE;
    RETURN NEW;
END;
$fn$;

COMMENT ON FUNCTION public.comm_ranks_director_rung() IS
    'Revenue Director pay (2026-09-27): a title that heads its department may hold a rung — the rate of their own bills — but never a gate or a group package, and it always recruits.';

DROP TRIGGER IF EXISTS comm_ranks_director_rung ON public.comm_ranks;
CREATE TRIGGER comm_ranks_director_rung
    BEFORE INSERT OR UPDATE ON public.comm_ranks
    FOR EACH ROW EXECUTE FUNCTION public.comm_ranks_director_rung();

-- A member is never placed at the director's rung: it pays 12% with override
-- on the ladder's top, which is the director's, not a salesperson's.
CREATE OR REPLACE FUNCTION public.comm_hierarchy_not_director_rung()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
    v_title UUID;
    v_name  TEXT;
BEGIN
    IF NEW.rank_id IS NULL THEN
        RETURN NEW;
    END IF;
    SELECT r.title_id INTO v_title FROM public.comm_ranks r WHERE r.id = NEW.rank_id;
    IF public.title_is_department_head(v_title) THEN
        SELECT name INTO v_name FROM public.titles WHERE id = v_title;
        RAISE EXCEPTION 'That rank is the % rung — only a director is paid at it, and a director holds no member position.',
            coalesce(v_name, 'department head''s') USING ERRCODE = '23DIR';
    END IF;
    RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS comm_hierarchy_not_director_rung ON public.comm_hierarchy;
CREATE TRIGGER comm_hierarchy_not_director_rung
    BEFORE INSERT OR UPDATE OF rank_id ON public.comm_hierarchy
    FOR EACH ROW EXECUTE FUNCTION public.comm_hierarchy_not_director_rung();

COMMENT ON COLUMN public.titles.is_department_head IS
    'Heads its department (2026-09-11). Holds no membership and earns no override; inside a commission department every reporting line may end at it. Since 2026-09-27 it may hold a gate-less rung on a ladder — the rate of their own bills — and is paid the Directors tab''s amounts (comm_director_pay). Revenue Director.';

-- ─── 2. What each director is paid ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.comm_director_pay (
    scheme_id        UUID NOT NULL REFERENCES public.comm_schemes(id) ON DELETE CASCADE,
    staff_id         UUID NOT NULL REFERENCES public.hr_staff_costs(id) ON DELETE CASCADE,
    -- Their base commission: into gross commission every month, like anybody's
    -- commission — the Revenue payroll carves the basic out of it.
    fixed_amount     NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (fixed_amount >= 0),
    -- The month's Commissionable value (Comm Cal's card) at which the
    -- incentive is paid. NULL = no incentive.
    sales_threshold  NUMERIC(15,2) CHECK (sales_threshold IS NULL OR sales_threshold > 0),
    incentive_amount NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (incentive_amount >= 0),
    updated_by       UUID REFERENCES public.users(id) ON DELETE SET NULL,
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (scheme_id, staff_id),
    CONSTRAINT comm_director_pay_incentive_needs_threshold
        CHECK (incentive_amount = 0 OR sales_threshold IS NOT NULL)
);

COMMENT ON TABLE public.comm_director_pay IS
    'Revenue Director pay (2026-09-27), per scheme and director: a fixed amount (their base commission) and an incentive paid when the month''s Commissionable value reaches the threshold. Added to the director''s commission by the engine; set on Rules › Directors.';

-- Only somebody who directs the scheme's sub-department.
CREATE OR REPLACE FUNCTION public.comm_director_pay_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
    IF NOT EXISTS (
        SELECT 1
          FROM public.comm_schemes s
          JOIN public.comm_sub_department_directors d ON d.sub_department_id = s.sub_department_id
         WHERE s.id = NEW.scheme_id AND d.staff_id = NEW.staff_id
    ) THEN
        RAISE EXCEPTION 'Only a director of this sub-department is paid here — add them under Staff Hierarchy › Team › Reports to first.'
            USING ERRCODE = '23DIR';
    END IF;
    NEW.updated_at := now();
    NEW.updated_by := coalesce(auth.uid(), NEW.updated_by);
    RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS comm_director_pay_guard ON public.comm_director_pay;
CREATE TRIGGER comm_director_pay_guard
    BEFORE INSERT OR UPDATE ON public.comm_director_pay
    FOR EACH ROW EXECUTE FUNCTION public.comm_director_pay_guard();

-- Individual pay: HR and the Principal, like the rest of Revenue's rules.
ALTER TABLE public.comm_director_pay ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS comm_director_pay_hr_all ON public.comm_director_pay;
CREATE POLICY comm_director_pay_hr_all
    ON public.comm_director_pay
    FOR ALL TO authenticated
    USING ((SELECT has_scope(ARRAY['hr'])))
    WITH CHECK ((SELECT has_scope(ARRAY['hr'])));

DROP POLICY IF EXISTS comm_director_pay_principal_all ON public.comm_director_pay;
CREATE POLICY comm_director_pay_principal_all
    ON public.comm_director_pay
    FOR ALL TO authenticated
    USING ((SELECT has_scope(ARRAY['admin'])))
    WITH CHECK ((SELECT has_scope(ARRAY['admin'])));

REVOKE ALL ON public.comm_director_pay FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.comm_director_pay TO authenticated;

NOTIFY pgrst, 'reload schema';
