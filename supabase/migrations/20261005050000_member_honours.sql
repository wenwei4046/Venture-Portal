-- ════════════════════════════════════════════════════════════════════════════
-- My honours: every finish of a FINAL month, kept as it was (2026-10-05)
--
-- The Revenue app's My honours counts a member's finishes — their place on
-- the month's Sales, Margin, KPI and Championship boards (total and by brand)
-- and on the weekly fair boards (the booth of their brand week), joint places
-- for everyone tied (user 2026-10-04). A finish is a medal: once a month is
-- final it must not change because a cost ratio or a band moved later
-- (neither has an effective date), so the month's finishes are WRITTEN ONCE:
--
--   member_honour_months  one row per (sub-department, month) whose finishes
--                         are kept — written the first time somebody opens
--                         My honours after the month is final (everybody on
--                         its boards closed, a run applied, or before the
--                         cutover: member_arena_for_staff's `final`)
--   member_honours        everybody's finishes of that month, from the Arena's
--                         own rankings (lib/member/arena.ts, championship.ts)
--
-- The app's server computes them from the Arena it reads under the member's
-- own session and writes them with the service role — so no browser can put
-- a place there. Reopening a close (or a run) makes the month not final
-- again: its finishes are deleted here and taken afresh once it is final.
--
-- No policy: only the service role reads or writes these tables.
--
-- Rollback:
--   DROP TRIGGER member_honours_reopened_close ON comm_salesperson_closes;
--   DROP TRIGGER member_honours_reopened_run ON comm_runs;
--   DROP FUNCTION member_honours_forget_month();
--   DROP TABLE member_honours, member_honour_months;
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.member_honour_months (
 sub_department_id uuid NOT NULL REFERENCES public.comm_sub_departments(id) ON DELETE CASCADE,
 period_month date NOT NULL CHECK (period_month = date_trunc('month', period_month)::date),
 taken_at timestamptz NOT NULL DEFAULT now(),
 finishes integer NOT NULL DEFAULT 0,
 PRIMARY KEY (sub_department_id, period_month)
);
COMMENT ON TABLE public.member_honour_months IS
 'A final month whose finishes are kept in member_honours (2026-10-05). Written once, by the app''s server (service role), the first time My honours is opened after the month is final; deleted when a close or a run of it is reopened.';

CREATE TABLE IF NOT EXISTS public.member_honours (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 sub_department_id uuid NOT NULL,
 period_month date NOT NULL,
 staff_id uuid NOT NULL REFERENCES public.hr_staff_costs(id) ON DELETE CASCADE,
 board text NOT NULL CHECK (board IN ('Sales','Margin','KPI','Championship','Fair')),
 title text NOT NULL CHECK (length(title) BETWEEN 1 AND 160),
 sub text NOT NULL CHECK (length(sub) BETWEEN 1 AND 160),
 place integer NOT NULL CHECK (place >= 1),
 FOREIGN KEY (sub_department_id, period_month) REFERENCES public.member_honour_months(sub_department_id, period_month) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS ix_member_honours_staff ON public.member_honours (staff_id, period_month);
CREATE INDEX IF NOT EXISTS ix_member_honours_month ON public.member_honours (sub_department_id, period_month);
COMMENT ON TABLE public.member_honours IS
 'One finish: a place on a final month''s board (2026-10-05). Ties keep their shared place. Board Fair = the weekly booth of the member''s brand week. Written with its month in member_honour_months; never edited.';

ALTER TABLE public.member_honour_months ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.member_honours ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.member_honour_months, public.member_honours FROM anon, authenticated;

-- A reopened close or run: the month is not final any more — its finishes go.
CREATE OR REPLACE FUNCTION public.member_honours_forget_month()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
 IF OLD.reopened_at IS NULL AND NEW.reopened_at IS NOT NULL THEN
  DELETE FROM public.member_honour_months WHERE sub_department_id=NEW.sub_department_id AND period_month=NEW.period_month;
 END IF;
 RETURN NEW;
END $function$;
REVOKE ALL ON FUNCTION public.member_honours_forget_month() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS member_honours_reopened_close ON public.comm_salesperson_closes;
CREATE TRIGGER member_honours_reopened_close AFTER UPDATE OF reopened_at ON public.comm_salesperson_closes
 FOR EACH ROW EXECUTE FUNCTION public.member_honours_forget_month();
DROP TRIGGER IF EXISTS member_honours_reopened_run ON public.comm_runs;
CREATE TRIGGER member_honours_reopened_run AFTER UPDATE OF reopened_at ON public.comm_runs
 FOR EACH ROW EXECUTE FUNCTION public.member_honours_forget_month();
