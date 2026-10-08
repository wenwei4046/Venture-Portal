-- ════════════════════════════════════════════════════════════════════════════
-- My honours follow the month's bills (2026-10-05)
--
-- 20261005060000 kept a CLOSED month's finishes until a close or run of it
-- reopened, a brand week of it changed or the cutover moved past it. A second
-- side review: a cost filled in after everybody closed — Recost — changes the
-- Arena's margin boards but not the kept medals. Fair's commission does not
-- depend on the margin (its incentive and penalty are off), so a Recost moves
-- nobody's close and HR has no reason to reopen. Today every Fair seller has
-- an uncosted bill, so the Margin boards are empty: a September closed before
-- the costs were complete would keep empty margin medals for good while the
-- Arena filled in.
--
-- Rule: a kept month is taken afresh whenever its BILLS change — a line added,
-- re-costed (Recost, the fill-cost trigger, a combo), changed or removed; an
-- order added, moved into or out of the month, re-branded, re-priced, its
-- deposit or its exclusion changed. What still keeps the closing ranks is a
-- change of RULES (cost divisor, cost ratios, margin bands, KPI items): those
-- have no effective date, and a medal is not re-awarded under rules made later.
--
-- Row-level AFTER triggers that do nothing while no month is kept; once one
-- is, each changed row costs one indexed DELETE of a tiny table.
--
-- Rollback:
--   DROP TRIGGER member_honours_order_changed ON sales_orders;
--   DROP TRIGGER member_honours_line_changed ON sales_order_lines;
--   DROP FUNCTION member_honours_forget_order_month(), member_honours_forget_line_month();
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.member_honours_forget_order_month()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM public.member_honour_months) THEN RETURN NULL; END IF;
 IF TG_OP <> 'INSERT' THEN
  DELETE FROM public.member_honour_months m
   USING public.sales_import_batches b
   WHERE b.id = OLD.batch_id AND m.sub_department_id = b.sub_department_id
     AND m.period_month = date_trunc('month', OLD.period_month)::date;
 END IF;
 IF TG_OP <> 'DELETE' THEN
  DELETE FROM public.member_honour_months m
   USING public.sales_import_batches b
   WHERE b.id = NEW.batch_id AND m.sub_department_id = b.sub_department_id
     AND m.period_month = date_trunc('month', NEW.period_month)::date;
 END IF;
 RETURN NULL;
END $function$;
REVOKE ALL ON FUNCTION public.member_honours_forget_order_month() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS member_honours_order_changed ON public.sales_orders;
CREATE TRIGGER member_honours_order_changed AFTER INSERT OR UPDATE OR DELETE ON public.sales_orders
 FOR EACH ROW EXECUTE FUNCTION public.member_honours_forget_order_month();

CREATE OR REPLACE FUNCTION public.member_honours_forget_line_month()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM public.member_honour_months) THEN RETURN NULL; END IF;
 -- A line removed with its order finds no order here; the order's own trigger forgot the month.
 IF TG_OP <> 'INSERT' THEN
  DELETE FROM public.member_honour_months m
   USING public.sales_orders so JOIN public.sales_import_batches b ON b.id = so.batch_id
   WHERE so.id = OLD.order_id AND m.sub_department_id = b.sub_department_id
     AND m.period_month = date_trunc('month', so.period_month)::date;
 END IF;
 IF TG_OP <> 'DELETE' THEN
  DELETE FROM public.member_honour_months m
   USING public.sales_orders so JOIN public.sales_import_batches b ON b.id = so.batch_id
   WHERE so.id = NEW.order_id AND m.sub_department_id = b.sub_department_id
     AND m.period_month = date_trunc('month', so.period_month)::date;
 END IF;
 RETURN NULL;
END $function$;
REVOKE ALL ON FUNCTION public.member_honours_forget_line_month() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS member_honours_line_changed ON public.sales_order_lines;
CREATE TRIGGER member_honours_line_changed AFTER INSERT OR UPDATE OR DELETE ON public.sales_order_lines
 FOR EACH ROW EXECUTE FUNCTION public.member_honours_forget_line_month();

COMMENT ON TABLE public.member_honour_months IS
 'A final month whose finishes are kept in member_honours (2026-10-05). Written once, by the app''s server (service role), the first time My honours is opened after the month is final; forgotten — and taken afresh on the next open — when a close or a run of it is reopened, a brand week of it changes, one of its bills or lines changes (Recost included), or the cutover moves past it. A change of rules does not forget it. A month before the cutover is never kept (23HON) — the app works it out afresh from the Arena.';
