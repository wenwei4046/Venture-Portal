-- 20261025235500_marketing_key_dates.sql
-- 2026-10-25 — Marketing: a subsidiary's own key dates. The user's answer 14 ("Key dates are each company's own") and,
-- asked who keeps them and whether one may come back each year: "Marketing 全员，可每年重复" — everybody in Marketing adds
-- and changes them, and one may repeat every year. HR's holidays stay on the calendar as they are.
--   The dates   mkt_key_dates — a subsidiary's (or Marketing's own client's): its day; its name (≤ 80 characters); the
--               words on its flag (≤ 16; none: its name, which the flag clips); once, or every year from its day on (a
--               29 Feb falls on 28 Feb in a year without one — the page's reckoning). 200 a subsidiary at most. Who changed
--               what is the audit trail's (read key marketing).
--   Read        mkt_key_dates(sub) — Marketing · View: the subsidiary's, by day.
--   Changed     mkt_key_date_save(sub, id, patch) — Marketing · Edit: a new one (id null) in full, or one of the
--               subsidiary's — only what was changed is sent. mkt_key_date_delete(sub, id) — Marketing · Edit; one already
--               gone is no error. Each answers the subsidiary's list as it now stands.
--   The PIC     mkt_pic_calendar(code) — production's body (md5 8e5d5e0c…), one statement changed: beside HR's holidays,
--               the subsidiary's key dates that may fall in its window (the handoff's PIC Calendar draws both as ⚑).
-- PGlite: tests/member-sql/validate-marketing-key-dates.mjs.

CREATE TABLE IF NOT EXISTS public.mkt_key_dates (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sub_id     uuid NOT NULL REFERENCES public.mkt_subsidiaries(id) ON DELETE CASCADE,
  day        date NOT NULL CHECK (day BETWEEN DATE '2000-01-01' AND DATE '2100-12-31'),
  name       text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 80),
  short      text CHECK (short IS NULL OR length(btrim(short)) BETWEEN 1 AND 16),
  yearly     boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES public.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.users(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS mkt_key_dates_sub ON public.mkt_key_dates (sub_id, day);
ALTER TABLE public.mkt_key_dates ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mkt_key_dates FROM anon, authenticated;
SELECT public.audit_register('mkt_key_dates', 'Marketing key dates', 'Marketing', '{marketing}', 'all',
  p_keys => '{id}', p_labels => '{name}', p_ignore => '{updated_at,updated_by}');

-- ── A subsidiary's key dates, by day — what the three below answer ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.mkt_key_date_list(p_sub uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object('id', k.id, 'day', k.day, 'name', k.name, 'short', k.short, 'yearly', k.yearly)
                     ORDER BY k.day, k.name, k.id)
      FROM public.mkt_key_dates k
     WHERE k.sub_id = p_sub), '[]'::jsonb);
END
$fn$;

-- ── Read: Marketing · View ───────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.mkt_key_dates(p_sub uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  PERFORM public.mkt_need(ARRAY['marketing.view'], 'Marketing is not open to your account.');
  RETURN public.mkt_key_date_list(p_sub);
END
$fn$;

-- ── Added or changed: Marketing · Edit (everybody in Marketing — the user's answer) ─────────────────────────────
-- p_patch: { day, name, short, yearly } — a new one's in full (day and name needed), else only what was changed, so a
-- login open on two PCs never writes back what the other has just saved.
CREATE OR REPLACE FUNCTION public.mkt_key_date_save(p_sub uuid, p_id uuid, p_patch jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_k     public.mkt_key_dates;
  v_patch jsonb := coalesce(p_patch, '{}'::jsonb);
BEGIN
  PERFORM public.mkt_need(ARRAY['marketing.edit'], 'Changing key dates is not open to your account.');
  IF jsonb_typeof(v_patch) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Nothing to save.' USING ERRCODE = '22023';
  END IF;
  PERFORM 1 FROM public.mkt_subsidiaries WHERE id = p_sub AND active;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That subsidiary is not there.' USING ERRCODE = 'P0002';
  END IF;
  IF p_id IS NULL THEN
    v_k.name := '';
    v_k.yearly := false;
  ELSE
    SELECT * INTO v_k FROM public.mkt_key_dates WHERE id = p_id AND sub_id = p_sub FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'That key date is not there any more.' USING ERRCODE = 'P0002';
    END IF;
  END IF;
  IF v_patch ? 'day' THEN
    BEGIN
      v_k.day := (v_patch ->> 'day')::date;
    EXCEPTION WHEN others THEN
      v_k.day := NULL;
    END;
  END IF;
  IF v_patch ? 'name' THEN
    v_k.name := btrim(coalesce(v_patch ->> 'name', ''));
  END IF;
  IF v_patch ? 'short' THEN
    v_k.short := nullif(btrim(coalesce(v_patch ->> 'short', '')), '');
  END IF;
  IF v_patch ? 'yearly' THEN
    IF jsonb_typeof(v_patch -> 'yearly') IS DISTINCT FROM 'boolean' THEN
      RAISE EXCEPTION 'Every year is a yes or a no.' USING ERRCODE = '22023';
    END IF;
    v_k.yearly := (v_patch -> 'yearly')::boolean;
  END IF;
  IF v_k.day IS NULL OR v_k.day NOT BETWEEN DATE '2000-01-01' AND DATE '2100-12-31' THEN
    RAISE EXCEPTION 'Pick the key date''s day.' USING ERRCODE = '22023';
  END IF;
  IF coalesce(v_k.name, '') = '' THEN
    RAISE EXCEPTION 'Name the key date.' USING ERRCODE = '22023';
  END IF;
  IF length(v_k.name) > 80 THEN
    RAISE EXCEPTION 'A key date''s name is 80 characters at most.' USING ERRCODE = '22023';
  END IF;
  IF length(v_k.short) > 16 THEN
    RAISE EXCEPTION 'The words on its flag are 16 characters at most.' USING ERRCODE = '22023';
  END IF;
  IF p_id IS NULL THEN
    -- One subsidiary's new key dates one at a time, so the count holds.
    PERFORM pg_advisory_xact_lock(hashtext('mkt_key_dates:' || p_sub::text));
    IF (SELECT count(*) FROM public.mkt_key_dates WHERE sub_id = p_sub) >= 200 THEN
      RAISE EXCEPTION 'A subsidiary keeps 200 key dates at most — delete one to add another.' USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.mkt_key_dates (sub_id, day, name, short, yearly, created_by, updated_by)
    VALUES (p_sub, v_k.day, v_k.name, v_k.short, v_k.yearly, auth.uid(), auth.uid());
  ELSE
    UPDATE public.mkt_key_dates
       SET day = v_k.day, name = v_k.name, short = v_k.short, yearly = v_k.yearly, updated_by = auth.uid(), updated_at = now()
     WHERE id = p_id;
  END IF;
  RETURN public.mkt_key_date_list(p_sub);
END
$fn$;

-- ── Deleted: Marketing · Edit — one already gone is no error ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.mkt_key_date_delete(p_sub uuid, p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  PERFORM public.mkt_need(ARRAY['marketing.edit'], 'Changing key dates is not open to your account.');
  DELETE FROM public.mkt_key_dates WHERE id = p_id AND sub_id = p_sub;
  RETURN public.mkt_key_date_list(p_sub);
END
$fn$;

REVOKE ALL ON FUNCTION public.mkt_key_date_list(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mkt_key_date_list(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.mkt_key_dates(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mkt_key_date_save(uuid, uuid, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mkt_key_date_delete(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mkt_key_dates(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mkt_key_date_save(uuid, uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mkt_key_date_delete(uuid, uuid) TO authenticated;

-- ── The PIC's calendar: the subsidiary's key dates beside HR's holidays ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.mkt_pic_calendar(p_code text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_code  text := lower(btrim(coalesce(p_code, '')));
  v_today date := (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date;
  v_first date;
  v_from  date;
  v_to    date;
  v_s     public.mkt_subsidiaries;
  v_slot  integer;
  v_name  text;
  v_wa    text;
BEGIN
  IF v_code !~ '^[0-9a-f]{32}$' THEN
    RETURN NULL;
  END IF;
  SELECT * INTO v_s FROM public.mkt_subsidiaries WHERE (cal_code = v_code OR cal2_code = v_code) AND active;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  v_slot := CASE WHEN v_s.cal_code = v_code THEN 1 ELSE 2 END;
  v_name := nullif(btrim(coalesce(CASE v_slot WHEN 1 THEN v_s.pic_name ELSE v_s.pic2_name END, '')), '');
  v_wa := public.mkt_wa_key(CASE v_slot WHEN 1 THEN v_s.pic_whatsapp ELSE v_s.pic2_whatsapp END);
  -- Open only while its PIC is still the subsidiary's: named, on the number it was made for.
  IF v_name IS NULL OR v_wa IS NULL OR v_wa IS DISTINCT FROM (CASE v_slot WHEN 1 THEN v_s.cal_wa ELSE v_s.cal2_wa END) THEN
    RETURN NULL;
  END IF;
  v_first := v_today - (extract(day FROM v_today)::integer - 1);
  v_from := (v_first - interval '1 month')::date;
  v_to := (v_first + interval '4 months')::date - 1;

  RETURN (
    -- The subsidiary's product projects sent to this PIC: which of their PICs it is, and its own link.
    WITH mine AS (
      SELECT p.id, p.title, p.status, p.campaign_from, p.campaign_until, p.link_sent_at, p.pic_ok, p.posted,
             CASE WHEN public.mkt_wa_key(p.pic_whatsapp) = v_wa THEN 1 ELSE 2 END AS you,
             CASE WHEN public.mkt_wa_key(p.pic_whatsapp) = v_wa THEN p.link_code ELSE p.link2_code END AS code,
             nullif(btrim(coalesce(p.pic2_name, '')), '') IS NOT NULL AS two
        FROM public.mkt_projects p
       WHERE p.subsidiary_id = v_s.id AND p.status NOT IN ('minutes', 'cancelled')
         -- …and its tasks with a link (②a-5): their stages' approvals and dates, a series' runs'.
         AND (p.kind = 'product' OR (p.kind IN ('quick', 'recurring') AND p.series_id IS NULL AND p.link_code IS NOT NULL))
         AND (public.mkt_wa_key(p.pic_whatsapp) = v_wa
              OR (nullif(btrim(coalesce(p.pic2_name, '')), '') IS NOT NULL AND public.mkt_wa_key(p.pic2_whatsapp) = v_wa))
    ),
    -- …and their deliverables planned, each with its product's link — a series' runs, with the series' (②a-5).
    tasks AS (
      SELECT m.id AS project, m.title AS product, m.title, m.status, m.posted, m.you, m.code, m.two FROM mine m
      UNION ALL
      SELECT d.id, m.title, d.title, d.status, d.posted, m.you, m.code, m.two
        FROM mine m JOIN public.mkt_projects d ON d.parent_id = m.id OR d.series_id = m.id
       WHERE d.status NOT IN ('planning', 'cancelled')
    )
    SELECT jsonb_build_object(
      'today', v_today, 'from', v_from, 'to', v_to,
      'sub', jsonb_build_object('name', v_s.name, 'dot', v_s.dot),
      'pic', v_name,
      -- Each date the canvas puts on the PIC's calendar, once filled; a post's mark — when, its link.
      'dates', coalesce((
        SELECT jsonb_agg(jsonb_build_object(
                 'day', s.work -> 'vals' ->> (f ->> 'label'), 'kind', f -> 'cal' ->> 'kind', 'field', f ->> 'label',
                 'title', t.title, 'product', t.product, 'code', t.code, 'done', t.status = 'done',
                 'posted', CASE WHEN jsonb_typeof(t.posted -> (s.idx::text || ':' || (f ->> 'label'))) = 'object'
                                THEN jsonb_build_object('at', t.posted -> (s.idx::text || ':' || (f ->> 'label')) ->> 'at',
                                                        'link', t.posted -> (s.idx::text || ':' || (f ->> 'label')) ->> 'link') END)
               ORDER BY s.work -> 'vals' ->> (f ->> 'label'), t.title, s.idx, f ->> 'label')
          FROM tasks t
          JOIN public.mkt_stages s ON s.project_id = t.project
          CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(s.spec -> 'form') = 'array' THEN s.spec -> 'form' ELSE '[]'::jsonb END) f
         WHERE f ->> 'type' = 'Date' AND jsonb_typeof(f -> 'cal') = 'object' AND (f -> 'cal' -> 'pic') = 'true'::jsonb
           AND coalesce(s.work -> 'vals' ->> (f ->> 'label'), '') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
           AND s.work -> 'vals' ->> (f ->> 'label') BETWEEN v_from::text AND v_to::text), '[]'::jsonb),
      -- Each stage with a PIC level still ahead (or waiting for them now), by its deadline — never one this PIC approved
      -- already on a level asking both.
      'approvals', coalesce((
        SELECT jsonb_agg(jsonb_build_object(
                 'day', s.due_on, 'title', t.title, 'product', t.product, 'stage', s.name, 'code', t.code,
                 'waiting', s.status = 'review' AND l.lvl = s.appr_idx)
               ORDER BY s.due_on, t.title, s.idx)
          FROM tasks t
          JOIN public.mkt_stages s ON s.project_id = t.project
          CROSS JOIN LATERAL (
            SELECT min(a.o)::integer - 1 AS lvl
              FROM jsonb_array_elements(CASE WHEN jsonb_typeof(s.appr) = 'array' THEN s.appr ELSE '[]'::jsonb END) WITH ORDINALITY AS a(v, o)
             WHERE a.v ->> 'kind' = 'pic' AND a.o - 1 >= CASE WHEN s.status = 'review' THEN coalesce(s.appr_idx, 0) ELSE 0 END) l
         WHERE t.status NOT IN ('done', 'paused') AND s.status <> 'done' AND l.lvl IS NOT NULL AND s.due_on IS NOT NULL
           AND NOT (s.status = 'review' AND l.lvl = s.appr_idx AND t.two
                    AND coalesce(s.appr -> s.appr_idx ->> 'all' = 'true', false)
                    AND coalesce(s.pic_ok ->> 'ver' = s.ver::text AND s.pic_ok ->> 'lvl' = s.appr_idx::text AND s.pic_ok ? t.you::text, false))
           AND (s.due_on BETWEEN v_from AND v_to OR (s.status = 'review' AND l.lvl = s.appr_idx))), '[]'::jsonb),
      -- A product's intake minutes waiting for them — never once their approval of this sending is in.
      'minutes', coalesce((
        SELECT jsonb_agg(jsonb_build_object('title', m.title, 'code', m.code, 'sentAt', m.link_sent_at) ORDER BY m.link_sent_at, m.title)
          FROM mine m
         WHERE m.status = 'waiting_pic'
           AND NOT coalesce(m.pic_ok ->> 'sent' = (extract(epoch FROM m.link_sent_at))::text AND m.pic_ok ? m.you::text, false)), '[]'::jsonb),
      'campaigns', coalesce((
        SELECT jsonb_agg(jsonb_build_object('title', m.title, 'from', m.campaign_from, 'until', m.campaign_until, 'code', m.code)
                         ORDER BY m.campaign_from, m.campaign_until, m.title)
          FROM mine m
         WHERE m.campaign_from IS NOT NULL AND m.campaign_until IS NOT NULL
           AND m.campaign_from <= v_to AND m.campaign_until >= v_from), '[]'::jsonb),
      'holidays', coalesce((
        SELECT jsonb_agg(jsonb_build_object('day', h.day, 'name', h.name) ORDER BY h.day, h.name)
          FROM (SELECT DISTINCT x.day, x.name FROM public.att_holidays x
                 WHERE x.deleted_at IS NULL AND x.day BETWEEN v_from AND v_to AND public.mkt_holiday_ok(x.states)) h), '[]'::jsonb),
      -- The subsidiary's own key dates (2026-10-25): those falling in the window — once, or every year from their day on.
      'keyDates', coalesce((
        SELECT jsonb_agg(jsonb_build_object('day', k.day, 'name', k.name, 'short', k.short, 'yearly', k.yearly)
                         ORDER BY k.day, k.name, k.id)
          FROM public.mkt_key_dates k
         WHERE k.sub_id = v_s.id AND (k.day BETWEEN v_from AND v_to OR (k.yearly AND k.day <= v_to))), '[]'::jsonb))
  );
END
$fn$;

NOTIFY pgrst, 'reload schema';
