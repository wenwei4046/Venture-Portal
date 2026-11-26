-- ════════════════════════════════════════════════════════════════════════════
-- 20261127140600 — Fair's below-margin penalty, on from December 2026's bills (2026-11-27)
-- ════════════════════════════════════════════════════════════════════════════
--
-- The user, turning Fair's margin penalty on with its new ladder for Akemi and Ergotex (20261127140500): Dunlopillo and
-- Zanotti keep their own; "从十二月开始" — November's bills are paid in full, December's are cut. Applied once the app that
-- reads comm_schemes.margin_penalty_from is live: an older app would cut November's bills the moment the switch is on.
--
-- Nothing else is switched: the margin incentive stays off. Rules › Scheme rules shows the switch and its month.
-- Running it twice changes nothing.
-- ════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_scheme uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'comm_schemes' AND column_name = 'margin_penalty_from') THEN
    RAISE EXCEPTION 'comm_schemes.margin_penalty_from is not there — apply 20261127140500 first';
  END IF;
  SELECT s.id INTO v_scheme
    FROM public.comm_schemes s JOIN public.comm_sub_departments d ON d.id = s.sub_department_id
   WHERE (upper(btrim(coalesce(d.code, ''))) = 'FAIR' OR d.name = 'Fair') AND s.is_active AND s.effective_to IS NULL
   ORDER BY s.effective_from DESC LIMIT 1;
  IF v_scheme IS NULL THEN
    RAISE EXCEPTION 'Fair has no active commission scheme';
  END IF;
  UPDATE public.comm_schemes
     SET enable_margin_penalty = true, margin_penalty_from = DATE '2026-12-01', updated_at = now()
   WHERE id = v_scheme
     AND (enable_margin_penalty IS DISTINCT FROM true OR margin_penalty_from IS DISTINCT FROM DATE '2026-12-01');
END $$;
