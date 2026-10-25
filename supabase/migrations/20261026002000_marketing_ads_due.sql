-- 20261026002000_marketing_ads_due.sql
-- 2026-10-25 — Marketing ⑤-3d: a notice when an Ads report's period is due. Asked whether an Ads report should tell when a
-- period is due, the user: "can do". Once a period's last day is over and its report is not out, the hourly sweep
-- (/api/member-queue — as a recurring product's months) tells, from 9:00 the office's time (never a phone at midnight),
-- once a period:
--   which   the newest period over — to its last report (⑤-3c, mig 20261026001000); never a cancelled project's.
--   whom    the project's owner — else (the Principal made it) whoever's stage it is at, as the Calendar names its Report
--           day — and whoever published its latest report, else whoever set it up, by their People record: mkt_notify
--           writes for those with a login (2026-10-25: nobody on Marketing's roster has one yet).
--   what    *Ads report #2 is due* · *<title> · 11 – 24 Oct* — the bell and the phone open the project.
--   once    mkt_ads.told_until — the last day of the newest period told, or found published; a later period tells again.
--   mkt_ads_due(p_now) — the service role's alone: how many periods it told.
-- PGlite: tests/member-sql/validate-marketing-ads-due.mjs.

ALTER TABLE public.mkt_ads ADD COLUMN IF NOT EXISTS told_until date;

CREATE OR REPLACE FUNCTION public.mkt_ads_due(p_now timestamptz DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_local timestamp := coalesce(p_now, now()) AT TIME ZONE 'Asia/Kuala_Lumpur';
  v_today date := (coalesce(p_now, now()) AT TIME ZONE 'Asia/Kuala_Lumpur')::date;
  v_n     integer := 0;
  v_no    integer;
  v_days  date[];
  v_range text;
  v_who   uuid[];
  v_s     uuid;
  r       record;
BEGIN
  -- From 9:00 the office's time: never a phone at midnight.
  IF extract(hour FROM v_local) < 9 THEN
    RETURN 0;
  END IF;
  FOR r IN
    SELECT a.project_id, a.every, a.starts_on, a.last_no, a.told_until, a.created_by, p.title, p.owner_staff, p.cur
      FROM public.mkt_ads a
      JOIN public.mkt_projects p ON p.id = a.project_id
     WHERE p.status <> 'cancelled' AND a.starts_on < v_today
     ORDER BY a.project_id
     FOR UPDATE OF a SKIP LOCKED
  LOOP
    -- The newest period over — its last day before today (mkt_ads_period's days) — to its last report.
    IF r.every = '1m' THEN
      v_no := greatest(0, (extract(year FROM age(v_today, r.starts_on)) * 12 + extract(month FROM age(v_today, r.starts_on)))::integer - 1);
      WHILE (r.starts_on + make_interval(months => v_no + 1))::date <= v_today LOOP
        v_no := v_no + 1;
      END LOOP;
    ELSE
      v_no := (v_today - r.starts_on) / (CASE r.every WHEN '1w' THEN 7 WHEN '2w' THEN 14 ELSE 28 END);
    END IF;
    v_no := least(v_no, coalesce(r.last_no, v_no));
    CONTINUE WHEN v_no < 1;
    v_days := public.mkt_ads_period(r.every, r.starts_on, v_no);
    -- Told already — or found published — for it, or for a later one.
    CONTINUE WHEN r.told_until IS NOT NULL AND v_days[2] <= r.told_until;
    UPDATE public.mkt_ads SET told_until = v_days[2] WHERE project_id = r.project_id;
    CONTINUE WHEN EXISTS (SELECT 1 FROM public.mkt_ads_reports x WHERE x.project_id = r.project_id AND x.no = v_no);
    -- Its owner — else whoever's stage it is at; and whoever published its latest report — else set it up.
    v_who := ARRAY(
      SELECT DISTINCT w FROM unnest(ARRAY[
        coalesce(r.owner_staff, (SELECT s.owner_staff FROM public.mkt_stages s WHERE s.project_id = r.project_id
                                  ORDER BY (s.idx = r.cur) DESC, s.idx LIMIT 1)),
        (SELECT h.id FROM public.hr_staff_costs h
          WHERE h.user_id = coalesce((SELECT x.published_by FROM public.mkt_ads_reports x WHERE x.project_id = r.project_id
                                       ORDER BY x.no DESC LIMIT 1), r.created_by)
            AND h.status = 'active'
          ORDER BY h.created_at, h.id LIMIT 1)]) w
       WHERE w IS NOT NULL);
    -- "6 – 19 Oct", "20 Oct – 2 Nov", "29 Dec 2026 – 11 Jan 2027" (lib/marketing/ads.ts › reportRange).
    v_range := CASE
      WHEN extract(year FROM v_days[1]) <> extract(year FROM v_days[2])
        THEN to_char(v_days[1], 'FMDD Mon YYYY') || ' – ' || to_char(v_days[2], 'FMDD Mon YYYY')
      WHEN extract(month FROM v_days[1]) <> extract(month FROM v_days[2])
        THEN to_char(v_days[1], 'FMDD Mon') || ' – ' || to_char(v_days[2], 'FMDD Mon')
      ELSE to_char(v_days[1], 'FMDD') || ' – ' || to_char(v_days[2], 'FMDD Mon') END;
    CONTINUE WHEN cardinality(v_who) = 0;
    FOREACH v_s IN ARRAY v_who LOOP
      PERFORM public.mkt_notify(v_s, r.project_id, 'Ads report #' || v_no || ' is due', left(r.title, 300) || ' · ' || v_range, 'ads_due');
    END LOOP;
    v_n := v_n + 1;
  END LOOP;
  RETURN v_n;
END
$fn$;
COMMENT ON FUNCTION public.mkt_ads_due(timestamptz) IS
  'The hourly sweep (2026-10-25, ⑤-3d): each Ads report whose newest period is over and not out — told once, from 9:00 the office''s time, to its owner (else whoever''s stage it is at) and whoever published its latest report (else set it up). The service role''s alone.';

REVOKE ALL ON FUNCTION public.mkt_ads_due(timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mkt_ads_due(timestamptz) TO service_role;

NOTIFY pgrst, 'reload schema';
