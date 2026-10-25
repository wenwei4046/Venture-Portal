-- 20261025235800_marketing_ads_reports.sql
-- 2026-10-25 — Marketing: a project's Ads report, from the CRM. The user's answer 57 ("可以接crm 那边了 那边有一个proformance
-- 的 base 你看有什么能够sync 过来") and, asked how: each Ads project picks its own CRM ads; the report's cadence "可以自己set";
-- its figures "可以自己set 要加哪一个"; the Ads person publishes it to the PIC's link; an ad not in the CRM keeps typed figures.
--   The setup     mkt_ads — one a project (a 📦 product project, or a quick task or recurring series of the type Ads): the CRM ads it reads
--                 (crm_ad_names' ids, ≤ 40), its cadence (every week, 2 weeks, 4 weeks or month) from its first day, the
--                 figures it shows (1–12, in order), its targets (budget, cost per lead, ROAS, appointment rate). The cadence
--                 and the first day stay once a report is out.
--   A report      mkt_ads_reports — a period published: its number, its days (the cadence's), each figure's value as
--                 published (worked out from the CRM and Meta, or typed), the targets as they stood, a note; published
--                 again, it is replaced (its first publishing kept).
--   Read          mkt_ads_page(project) — Marketing · View: the setup, the reports, whether it has a PIC link.
--   The CRM       mkt_ads_choices() — Marketing · Edit: the CRM's ads to pick (name, Page, Meta's status, leads so far);
--                 mkt_ads_crm(project, from, until) — Marketing · Edit: what the CRM counts for its ads over those days, as
--                 its Ads Performance does — leads (contacts the ads brought, by the day they came), appointments (those
--                 leads with a visit not cancelled), showed up (visits attended), won, the won amount. Counts only — never
--                 a customer. Meta's figures are the server's (the token never leaves it).
--   Written       mkt_ads_save(project, patch) — Marketing · Edit, only what changed; mkt_ads_publish(project, no, values,
--                 note) — Marketing · Edit, a period that has ended. Each on the project's trail; each answers the page.
-- PGlite: tests/member-sql/validate-marketing-ads-reports.mjs.

CREATE TABLE IF NOT EXISTS public.mkt_ads (
  project_id uuid PRIMARY KEY REFERENCES public.mkt_projects(id) ON DELETE CASCADE,
  ads        text[] NOT NULL DEFAULT '{}' CHECK (cardinality(ads) <= 40),
  every      text NOT NULL DEFAULT '2w' CHECK (every IN ('1w', '2w', '4w', '1m')),
  starts_on  date NOT NULL,
  figures    text[] NOT NULL CHECK (cardinality(figures) BETWEEN 1 AND 12),
  targets    jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(targets) = 'object'),
  created_by uuid REFERENCES public.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.users(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.mkt_ads ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mkt_ads FROM anon, authenticated;
SELECT public.audit_register('mkt_ads', 'Marketing Ads report setups', 'Marketing', '{}', 'none',
  p_reason => 'Set up and changed only through mkt_ads_save, which writes the project''s trail (mkt_events)');

CREATE TABLE IF NOT EXISTS public.mkt_ads_reports (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   uuid NOT NULL REFERENCES public.mkt_projects(id) ON DELETE CASCADE,
  no           integer NOT NULL CHECK (no BETWEEN 1 AND 1000),
  from_day     date NOT NULL,
  until_day    date NOT NULL CHECK (until_day >= from_day),
  vals         jsonb NOT NULL CHECK (jsonb_typeof(vals) = 'object'),
  targets      jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(targets) = 'object'),
  note         text CHECK (note IS NULL OR length(note) <= 500),
  published_by uuid REFERENCES public.users(id),
  by_name      text NOT NULL DEFAULT '',
  published_at timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz,
  UNIQUE (project_id, no)
);
ALTER TABLE public.mkt_ads_reports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mkt_ads_reports FROM anon, authenticated;
SELECT public.audit_register('mkt_ads_reports', 'Marketing Ads reports', 'Marketing', '{}', 'none',
  p_reason => 'Published only through mkt_ads_publish, which writes the project''s trail (mkt_events) — a report is its own record');

-- ── Helpers the functions below call ────────────────────────────────────────────────────────────────────────────
-- A project that may carry an Ads report: a product project, or a quick task or recurring series of the type Ads (New
-- Project's *Ads*) — never a deliverable or a run. Refuses otherwise.
CREATE OR REPLACE FUNCTION public.mkt_ads_project(p_project uuid)
RETURNS public.mkt_projects
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_p public.mkt_projects;
BEGIN
  SELECT * INTO v_p FROM public.mkt_projects WHERE id = p_project;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That project is not there.' USING ERRCODE = 'P0002';
  END IF;
  IF NOT (v_p.kind = 'product' OR (v_p.kind IN ('quick', 'recurring') AND v_p.series_id IS NULL AND v_p.q_type = 'ads')) THEN
    RAISE EXCEPTION 'An Ads report is a product project''s, or an Ads task''s or series''.' USING ERRCODE = '22023';
  END IF;
  RETURN v_p;
END
$fn$;

-- A report's days: the n-th period of a cadence from its first day (a month's from the same day, the 31st on a shorter
-- month's last).
CREATE OR REPLACE FUNCTION public.mkt_ads_period(p_every text, p_start date, p_no integer)
RETURNS date[]
LANGUAGE plpgsql IMMUTABLE
SET search_path = public
AS $fn$
DECLARE
  v_days integer := CASE p_every WHEN '1w' THEN 7 WHEN '2w' THEN 14 WHEN '4w' THEN 28 END;
BEGIN
  IF p_every = '1m' THEN
    RETURN ARRAY[(p_start + make_interval(months => p_no - 1))::date, (p_start + make_interval(months => p_no))::date - 1];
  END IF;
  RETURN ARRAY[p_start + (p_no - 1) * v_days, p_start + p_no * v_days - 1];
END
$fn$;

-- The page's part: the setup, its reports, whether the PIC has a link to read them on.
CREATE OR REPLACE FUNCTION public.mkt_ads_view(p_project uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_p public.mkt_projects;
  v_a public.mkt_ads;
BEGIN
  SELECT * INTO v_p FROM public.mkt_projects WHERE id = p_project;
  SELECT * INTO v_a FROM public.mkt_ads WHERE project_id = p_project;
  RETURN jsonb_build_object(
    'today', (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date,
    'link', v_p.link_code IS NOT NULL,
    'setup', CASE WHEN v_a.project_id IS NULL THEN NULL ELSE jsonb_build_object(
      'ads', to_jsonb(v_a.ads), 'every', v_a.every, 'startsOn', v_a.starts_on, 'figures', to_jsonb(v_a.figures),
      'targets', v_a.targets) END,
    'reports', coalesce((
      SELECT jsonb_agg(jsonb_build_object('no', r.no, 'from', r.from_day, 'until', r.until_day, 'values', r.vals,
                                          'targets', r.targets, 'note', r.note, 'by', r.by_name, 'at', r.published_at,
                                          'updatedAt', r.updated_at) ORDER BY r.no DESC)
        FROM public.mkt_ads_reports r WHERE r.project_id = p_project), '[]'::jsonb));
END
$fn$;

-- ── Read: Marketing · View ──────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.mkt_ads_page(p_project uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  PERFORM public.mkt_need(ARRAY['marketing.view'], 'Marketing is not open to your account.');
  PERFORM public.mkt_ads_project(p_project);
  RETURN public.mkt_ads_view(p_project);
END
$fn$;

-- ── The CRM's ads to pick: Marketing · Edit ──────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.mkt_ads_choices()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  PERFORM public.mkt_need(ARRAY['marketing.edit'], 'Ads reports are not open to your account.');
  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object('id', x.id, 'name', x.name, 'page', x.page, 'status', x.status, 'leads', x.leads,
                                        'hidden', x.hidden)
                     ORDER BY x.hidden, coalesce(x.status = 'ACTIVE', false) DESC, x.leads DESC, x.name, x.id)
      FROM (
        SELECT i.id, n.name, n.page_name AS page, n.meta_status AS status, n.hidden_at IS NOT NULL AS hidden,
               coalesce(l.n, 0)::integer AS leads
          FROM (SELECT ad_source_id AS id FROM public.crm_ad_names
                UNION SELECT DISTINCT ad_source_id FROM public.crm_contacts WHERE ad_source_id IS NOT NULL) i
          LEFT JOIN public.crm_ad_names n ON n.ad_source_id = i.id
          LEFT JOIN (SELECT ad_source_id, count(*) AS n FROM public.crm_contacts WHERE ad_source_id IS NOT NULL GROUP BY 1) l
                 ON l.ad_source_id = i.id
         WHERE i.id ~ '^\d{5,32}$'
         ORDER BY n.hidden_at IS NOT NULL, coalesce(n.meta_status = 'ACTIVE', false) DESC, coalesce(l.n, 0) DESC, i.id
         LIMIT 300) x), '[]'::jsonb);
END
$fn$;

-- ── What the CRM counts for the project's ads over some days: Marketing · Edit — counts only ──────────────────────
CREATE OR REPLACE FUNCTION public.mkt_ads_crm(p_project uuid, p_from date, p_until date)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_a public.mkt_ads;
BEGIN
  PERFORM public.mkt_need(ARRAY['marketing.edit'], 'Ads reports are not open to your account.');
  PERFORM public.mkt_ads_project(p_project);
  SELECT * INTO v_a FROM public.mkt_ads WHERE project_id = p_project;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Set up its Ads report first.' USING ERRCODE = 'P0002';
  END IF;
  IF p_from IS NULL OR p_until IS NULL OR p_until < p_from OR p_until - p_from > 400 THEN
    RAISE EXCEPTION 'Pick the report''s days — at most a year.' USING ERRCODE = '22023';
  END IF;
  RETURN (
    WITH leads AS (
      SELECT c.id, c.ad_source_id, c.status, c.won_amount
        FROM public.crm_contacts c
       WHERE c.ad_source_id = ANY (v_a.ads)
         AND (c.created_at AT TIME ZONE 'Asia/Kuala_Lumpur')::date BETWEEN p_from AND p_until
    ),
    visits AS (
      SELECT a.contact_id, a.state FROM public.crm_appointments a
       WHERE a.contact_id IN (SELECT id FROM leads) AND a.state IS DISTINCT FROM 'cancelled'
    )
    SELECT jsonb_build_object(
      'leads', (SELECT count(*) FROM leads),
      'appt', (SELECT count(DISTINCT contact_id) FROM visits),
      'showup', (SELECT count(*) FROM visits WHERE state = 'attended'),
      'won', (SELECT count(*) FROM leads WHERE status = 'won'),
      'wonAmount', (SELECT coalesce(sum(won_amount), 0) FROM leads WHERE status = 'won'),
      'perAd', coalesce((SELECT jsonb_object_agg(x.ad, x.n) FROM (SELECT ad_source_id AS ad, count(*) AS n FROM leads GROUP BY 1) x), '{}'::jsonb)));
END
$fn$;

-- ── Set up or changed: Marketing · Edit — only what changed is sent ───────────────────────────────────────────────
-- p_patch: { ads: [id], every, startsOn, figures: [key], targets: { budget, cpl, roas, apptRate } }.
CREATE OR REPLACE FUNCTION public.mkt_ads_save(p_project uuid, p_patch jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  KEYS    CONSTANT text[] := ARRAY['spendToDate', 'spend', 'leads', 'cpl', 'appt', 'apptRate', 'cpa', 'showup', 'showRate', 'won',
                                   'winRate', 'wonAmount', 'roas', 'impr', 'reach', 'clicks', 'ctr', 'msgconv', 'cpmsg'];
  v_patch jsonb := coalesce(p_patch, '{}'::jsonb);
  v_a     public.mkt_ads;
  v_new   boolean;
  v_out   boolean;
  v_t     jsonb;
  v_k     text;
  v_x     jsonb;
  v_n     numeric;
  v_ids   text[];
  v_figs  text[];
  v_what  text[] := '{}';
BEGIN
  PERFORM public.mkt_need(ARRAY['marketing.edit'], 'Ads reports are not open to your account.');
  PERFORM public.mkt_ads_project(p_project);
  IF jsonb_typeof(v_patch) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Nothing to save.' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_a FROM public.mkt_ads WHERE project_id = p_project FOR UPDATE;
  v_new := NOT FOUND;
  IF v_new THEN
    v_a.project_id := p_project;
    v_a.ads := '{}';
    v_a.every := '2w';
    v_a.starts_on := (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date;
    v_a.figures := ARRAY['spendToDate', 'cpl', 'appt', 'roas'];
    v_a.targets := '{}'::jsonb;
  END IF;
  v_out := EXISTS (SELECT 1 FROM public.mkt_ads_reports WHERE project_id = p_project);

  IF v_patch ? 'ads' THEN
    IF jsonb_typeof(v_patch -> 'ads') IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'Pick the ads from the list.' USING ERRCODE = '22023';
    END IF;
    SELECT coalesce(array_agg(DISTINCT x ORDER BY x), '{}') INTO v_ids FROM jsonb_array_elements_text(v_patch -> 'ads') x;
    IF EXISTS (SELECT 1 FROM unnest(v_ids) x WHERE x !~ '^\d{5,32}$') THEN
      RAISE EXCEPTION 'Pick the ads from the list.' USING ERRCODE = '22023';
    END IF;
    IF cardinality(v_ids) > 40 THEN
      RAISE EXCEPTION 'An Ads report reads 40 ads at most.' USING ERRCODE = '22023';
    END IF;
    v_a.ads := v_ids;
    v_what := array_append(v_what, 'ads');
  END IF;
  IF v_patch ? 'every' THEN
    IF coalesce(v_patch ->> 'every', '') NOT IN ('1w', '2w', '4w', '1m') THEN
      RAISE EXCEPTION 'Pick how often it reports.' USING ERRCODE = '22023';
    END IF;
    IF v_out AND v_patch ->> 'every' IS DISTINCT FROM v_a.every THEN
      RAISE EXCEPTION 'Its first report is out — how often it reports stays as it is.' USING ERRCODE = '22023';
    END IF;
    v_a.every := v_patch ->> 'every';
    v_what := array_append(v_what, 'every');
  END IF;
  IF v_patch ? 'startsOn' THEN
    BEGIN
      v_a.starts_on := (v_patch ->> 'startsOn')::date;
    EXCEPTION WHEN others THEN
      v_a.starts_on := NULL;
    END;
    IF v_a.starts_on IS NULL OR v_a.starts_on NOT BETWEEN DATE '2020-01-01' AND DATE '2100-12-31' THEN
      RAISE EXCEPTION 'Pick the first report''s first day.' USING ERRCODE = '22023';
    END IF;
    IF v_out AND v_a.starts_on IS DISTINCT FROM (SELECT starts_on FROM public.mkt_ads WHERE project_id = p_project) THEN
      RAISE EXCEPTION 'Its first report is out — its first day stays as it is.' USING ERRCODE = '22023';
    END IF;
    v_what := array_append(v_what, 'startsOn');
  END IF;
  IF v_patch ? 'figures' THEN
    IF jsonb_typeof(v_patch -> 'figures') IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'Pick the figures it shows.' USING ERRCODE = '22023';
    END IF;
    SELECT coalesce(array_agg(x ORDER BY o), '{}') INTO v_figs
      FROM (SELECT x, min(o) AS o FROM jsonb_array_elements_text(v_patch -> 'figures') WITH ORDINALITY t(x, o) GROUP BY x) d;
    IF cardinality(v_figs) < 1 OR cardinality(v_figs) > 12 OR EXISTS (SELECT 1 FROM unnest(v_figs) x WHERE x <> ALL (KEYS)) THEN
      RAISE EXCEPTION 'Pick 1 to 12 figures from the list.' USING ERRCODE = '22023';
    END IF;
    v_a.figures := v_figs;
    v_what := array_append(v_what, 'figures');
  END IF;
  IF v_patch ? 'targets' THEN
    v_t := v_patch -> 'targets';
    IF jsonb_typeof(v_t) IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'Its targets are numbers.' USING ERRCODE = '22023';
    END IF;
    FOR v_k, v_x IN SELECT key, value FROM jsonb_each(v_t) LOOP
      IF v_k NOT IN ('budget', 'cpl', 'roas', 'apptRate') THEN
        RAISE EXCEPTION 'Its targets are a budget, a cost per lead, a ROAS and an appointment rate.' USING ERRCODE = '22023';
      END IF;
      IF jsonb_typeof(v_x) = 'null' THEN
        v_a.targets := v_a.targets - v_k;
        CONTINUE;
      END IF;
      IF jsonb_typeof(v_x) IS DISTINCT FROM 'number' THEN
        RAISE EXCEPTION 'Its targets are numbers.' USING ERRCODE = '22023';
      END IF;
      v_n := (v_x #>> '{}')::numeric;
      IF v_n < 0 OR v_n > 1e9 OR (v_k = 'apptRate' AND v_n > 100) THEN
        RAISE EXCEPTION 'A target is a number from 0 — an appointment rate at most 100%%.' USING ERRCODE = '22023';
      END IF;
      v_a.targets := v_a.targets || jsonb_build_object(v_k, round(v_n, 2));
    END LOOP;
    v_what := array_append(v_what, 'targets');
  END IF;

  IF v_new THEN
    INSERT INTO public.mkt_ads (project_id, ads, every, starts_on, figures, targets, created_by, updated_by)
    VALUES (p_project, v_a.ads, v_a.every, v_a.starts_on, v_a.figures, v_a.targets, auth.uid(), auth.uid());
    PERFORM public.mkt_log(p_project, 'ads set up', p_data => jsonb_build_object('every', v_a.every, 'startsOn', v_a.starts_on,
      'ads', cardinality(v_a.ads)));
  ELSIF cardinality(v_what) > 0 THEN
    UPDATE public.mkt_ads
       SET ads = v_a.ads, every = v_a.every, starts_on = v_a.starts_on, figures = v_a.figures, targets = v_a.targets,
           updated_by = auth.uid(), updated_at = now()
     WHERE project_id = p_project;
    PERFORM public.mkt_log(p_project, 'ads changed', p_data => jsonb_build_object('what', to_jsonb(v_what)));
  END IF;
  RETURN public.mkt_ads_view(p_project);
END
$fn$;

-- ── Published: Marketing · Edit — a period that has ended; published again, it is replaced ───────────────────────
-- p_values: { <figure>: number | null } — the setup's figures only, each its value as the Ads person publishes it.
CREATE OR REPLACE FUNCTION public.mkt_ads_publish(p_project uuid, p_no integer, p_values jsonb, p_note text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_a     public.mkt_ads;
  v_days  date[];
  v_today date := (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date;
  v_vals  jsonb := '{}'::jsonb;
  v_k     text;
  v_x     jsonb;
  v_note  text := nullif(btrim(coalesce(p_note, '')), '');
  v_again boolean;
BEGIN
  PERFORM public.mkt_need(ARRAY['marketing.edit'], 'Ads reports are not open to your account.');
  PERFORM public.mkt_ads_project(p_project);
  SELECT * INTO v_a FROM public.mkt_ads WHERE project_id = p_project;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Set up its Ads report first.' USING ERRCODE = 'P0002';
  END IF;
  IF p_no IS NULL OR p_no < 1 OR p_no > 1000 THEN
    RAISE EXCEPTION 'That report is not one of its periods.' USING ERRCODE = '22023';
  END IF;
  v_days := public.mkt_ads_period(v_a.every, v_a.starts_on, p_no);
  IF v_days[2] >= v_today THEN
    RAISE EXCEPTION 'Report #% covers % – % — it is published once its last day is over.', p_no,
      to_char(v_days[1], 'FMDD Mon'), to_char(v_days[2], 'FMDD Mon YYYY') USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_values) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Nothing to publish.' USING ERRCODE = '22023';
  END IF;
  FOR v_k, v_x IN SELECT key, value FROM jsonb_each(p_values) LOOP
    IF v_k <> ALL (v_a.figures) THEN
      RAISE EXCEPTION 'A report shows the figures its setup picked — % is not one.', v_k USING ERRCODE = '22023';
    END IF;
    IF jsonb_typeof(v_x) = 'null' THEN
      v_vals := v_vals || jsonb_build_object(v_k, NULL);
    ELSIF jsonb_typeof(v_x) = 'number' AND (v_x #>> '{}')::numeric BETWEEN 0 AND 1e12 THEN
      v_vals := v_vals || jsonb_build_object(v_k, round((v_x #>> '{}')::numeric, 4));
    ELSE
      RAISE EXCEPTION 'Each figure is a number from 0 — or left empty.' USING ERRCODE = '22023';
    END IF;
  END LOOP;
  IF length(v_note) > 500 THEN
    RAISE EXCEPTION 'A report''s note is 500 characters at most.' USING ERRCODE = '22023';
  END IF;

  v_again := EXISTS (SELECT 1 FROM public.mkt_ads_reports WHERE project_id = p_project AND no = p_no);
  INSERT INTO public.mkt_ads_reports AS r (project_id, no, from_day, until_day, vals, targets, note, published_by, by_name)
  VALUES (p_project, p_no, v_days[1], v_days[2], v_vals, v_a.targets, v_note, auth.uid(), public.mkt_actor())
  ON CONFLICT (project_id, no) DO UPDATE
     SET from_day = excluded.from_day, until_day = excluded.until_day, vals = excluded.vals, targets = excluded.targets,
         note = excluded.note, published_by = excluded.published_by, by_name = excluded.by_name, updated_at = now();
  PERFORM public.mkt_log(p_project, CASE WHEN v_again THEN 'ads report again' ELSE 'ads report' END,
    p_data => jsonb_build_object('no', p_no, 'from', v_days[1], 'until', v_days[2]));
  RETURN public.mkt_ads_view(p_project);
END
$fn$;

REVOKE ALL ON FUNCTION public.mkt_ads_project(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mkt_ads_period(text, date, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mkt_ads_view(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mkt_ads_project(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.mkt_ads_period(text, date, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.mkt_ads_view(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.mkt_ads_page(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mkt_ads_choices() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mkt_ads_crm(uuid, date, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mkt_ads_save(uuid, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mkt_ads_publish(uuid, integer, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mkt_ads_page(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mkt_ads_choices() TO authenticated;
GRANT EXECUTE ON FUNCTION public.mkt_ads_crm(uuid, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mkt_ads_save(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mkt_ads_publish(uuid, integer, jsonb, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
