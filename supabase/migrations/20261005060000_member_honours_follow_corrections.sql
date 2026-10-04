-- ════════════════════════════════════════════════════════════════════════════
-- My honours follow the corrections a month can still take (2026-10-05)
--
-- 20261005050000 kept a month's finishes the first time My honours was opened
-- after the month was final, and forgot them only when a close or a run of it
-- was reopened. Two holes (side review, 2026-10-05):
--
--  1. A month BEFORE the cutover (comm_cutovers.first_paid_month — Fair's
--     June–August, paid from the claim forms) is final by rule but never
--     closes in the portal, so nothing could ever forget it — and it still
--     moves: HR corrects its brand weeks on People › Member services › Brand
--     weeks (closed weeks included), and a cost filled in + Recost re-prices
--     its bills. A test on 2026-10-05 had already kept Fair's June, July and
--     August. Such a month is now NEVER kept: the app works it out afresh from
--     the Arena on every open (loadMemberHonours, lib/member/server.ts), so it
--     reads exactly what the Arena's boards read. The rows already kept go,
--     and a guard refuses one from now on (23HON).
--  2. A brand week decides the one booth a member scores at each week, and HR
--     may change a week after its month is final. Any change to a member's
--     brand-week picks now forgets that month's kept finishes; the next open
--     takes them afresh.
--
-- Moving the cutover later turns the months it passes into "before the
-- cutover": their kept finishes go too.
--
-- Rollback:
--   DROP TRIGGER member_honour_months_guard ON member_honour_months;
--   DROP TRIGGER member_honours_brand_week_changed ON member_arena_brand_weeks;
--   DROP TRIGGER member_honours_cutover_moved ON comm_cutovers;
--   DROP FUNCTION member_honour_months_guard(), member_honours_forget_brand_week(),
--     member_honours_forget_before_cutover();
--   (nothing to restore: a month's finishes are taken afresh when next opened)
-- ════════════════════════════════════════════════════════════════════════════

-- 1. A month before the cutover is never kept.
DELETE FROM public.member_honour_months m
 USING public.comm_cutovers c
 WHERE c.sub_department_id = m.sub_department_id
   AND m.period_month < c.first_paid_month;

CREATE OR REPLACE FUNCTION public.member_honour_months_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
 IF EXISTS (SELECT 1 FROM public.comm_cutovers c
             WHERE c.sub_department_id = NEW.sub_department_id
               AND NEW.period_month < c.first_paid_month) THEN
  RAISE EXCEPTION 'Honours for % are worked out afresh, never kept: it was paid before the portal paid.',
   to_char(NEW.period_month, 'Mon YYYY') USING ERRCODE = '23HON';
 END IF;
 RETURN NEW;
END $function$;
REVOKE ALL ON FUNCTION public.member_honour_months_guard() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS member_honour_months_guard ON public.member_honour_months;
CREATE TRIGGER member_honour_months_guard BEFORE INSERT OR UPDATE ON public.member_honour_months
 FOR EACH ROW EXECUTE FUNCTION public.member_honour_months_guard();

CREATE OR REPLACE FUNCTION public.member_honours_forget_before_cutover()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
 DELETE FROM public.member_honour_months
  WHERE sub_department_id = NEW.sub_department_id AND period_month < NEW.first_paid_month;
 RETURN NULL;
END $function$;
REVOKE ALL ON FUNCTION public.member_honours_forget_before_cutover() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS member_honours_cutover_moved ON public.comm_cutovers;
CREATE TRIGGER member_honours_cutover_moved AFTER INSERT OR UPDATE OF first_paid_month ON public.comm_cutovers
 FOR EACH ROW EXECUTE FUNCTION public.member_honours_forget_before_cutover();

-- 2. A changed brand week: that month's finishes are taken afresh.
CREATE OR REPLACE FUNCTION public.member_honours_forget_brand_week()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
 IF TG_OP = 'INSERT' THEN
  DELETE FROM public.member_honour_months
   WHERE sub_department_id = NEW.sub_department_id AND period_month = NEW.period_month;
 ELSIF TG_OP = 'DELETE' THEN
  DELETE FROM public.member_honour_months
   WHERE sub_department_id = OLD.sub_department_id AND period_month = OLD.period_month;
 ELSIF OLD.picks IS DISTINCT FROM NEW.picks
    OR OLD.sub_department_id IS DISTINCT FROM NEW.sub_department_id
    OR OLD.period_month IS DISTINCT FROM NEW.period_month THEN
  DELETE FROM public.member_honour_months
   WHERE (sub_department_id = OLD.sub_department_id AND period_month = OLD.period_month)
      OR (sub_department_id = NEW.sub_department_id AND period_month = NEW.period_month);
 END IF;
 RETURN NULL;
END $function$;
REVOKE ALL ON FUNCTION public.member_honours_forget_brand_week() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS member_honours_brand_week_changed ON public.member_arena_brand_weeks;
CREATE TRIGGER member_honours_brand_week_changed AFTER INSERT OR UPDATE OR DELETE ON public.member_arena_brand_weeks
 FOR EACH ROW EXECUTE FUNCTION public.member_honours_forget_brand_week();

COMMENT ON TABLE public.member_honour_months IS
 'A final month whose finishes are kept in member_honours (2026-10-05). Written once, by the app''s server (service role), the first time My honours is opened after the month is final; forgotten when a close or a run of it is reopened, when a brand week of it changes, or when the cutover moves past it. A month before the cutover is never kept (23HON) — the app works it out afresh from the Arena.';
