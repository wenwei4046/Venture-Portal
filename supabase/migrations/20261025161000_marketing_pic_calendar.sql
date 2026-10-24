-- ============================================================================
-- 20261025161000_marketing_pic_calendar.sql
-- Marketing ⑤-2 (2026-10-24) — the PIC's own calendar (`PIC Calendar.dc.html` of the Claude Design handoff; the
-- prototype's "Calendar link (Carres · Kelvin)" at houzs.link/cal/carres): a subsidiary's marketing calendar, read-only,
-- shared with one of its PICs on a link of its own — /cal/<code>, a stranger's page as the PIC's link /t/<code> is.
-- ============================================================================
--
-- mkt_subsidiaries + cal_code, cal_wa (the first PIC's calendar link, and the WhatsApp number it was made for) and
--   cal2_code, cal2_wa (the second PIC's). The code is the only key — 32 random hex, never guessable, never written to
--   the audit trail (omitted from it, and a change of it alone not recorded). It opens only while that PIC is still
--   the subsidiary's: named, on the number it was made for (its digits, a leading 0 read as Malaysia's 60). The PIC
--   changed, the link closes; named again on that number, it opens again.
-- New:
--   mkt_wa_key(text)                    a WhatsApp number as the PIC's key across projects — each PIC link is sent to
--                                       that number. NULL under 8 digits. Only the DEFINER functions below call it.
--   mkt_sub_cal_link(sub, slot, renew)  Marketing · Manage: that PIC's calendar link — made when there is none (or its
--                                       PIC changed since), the same one otherwise; renew makes a new one and the old
--                                       one closes. Needs the PIC named, with a WhatsApp number.
--   mkt_pic_calendar(code)              anon's by name, as the PIC's link's are: what /cal/<code> draws, from the first
--                                       of last month to the end of the third month ahead; NULL when the code is
--                                       nobody's. It reads only the subsidiary's 📦 product projects sent to THIS PIC
--                                       (named on them as either PIC, by the number — never one still in its minutes,
--                                       never a cancelled one) and their deliverables planned:
--     dates      each Date field marked for the PIC's calendar (the canvas's "the PIC's calendar", ④-2c), once filled —
--                its kind, the field, the task and its product, a post's mark (when, its link), done or not
--     approvals  each stage of theirs with a PIC level still ahead, or waiting for them now — its deadline (the
--                stage's due day) — never one this PIC approved already on a level asking both
--     minutes    a product's intake minutes waiting for them, since when
--     campaigns  the projects' campaign periods (④-2b) in the window
--     holidays   HR's (Selangor's, as the board's), the ⚑ key dates
--   Every item carries the PIC's own link of its project — never the other PIC's, never a WhatsApp number, never a
--   staff id or name, never a field's value but a date the canvas put on their calendar.
-- PGlite: tests/member-sql/validate-marketing-pic-calendar.mjs.

ALTER TABLE public.mkt_subsidiaries ADD COLUMN IF NOT EXISTS cal_code text UNIQUE CHECK (cal_code ~ '^[0-9a-f]{32}$');
ALTER TABLE public.mkt_subsidiaries ADD COLUMN IF NOT EXISTS cal_wa text CHECK (length(cal_wa) <= 40);
ALTER TABLE public.mkt_subsidiaries ADD COLUMN IF NOT EXISTS cal2_code text UNIQUE CHECK (cal2_code ~ '^[0-9a-f]{32}$');
ALTER TABLE public.mkt_subsidiaries ADD COLUMN IF NOT EXISTS cal2_wa text CHECK (length(cal2_wa) <= 40);

-- The codes never reach the audit trail (a Library share link's way, mig 20261024007300): omitted from every record, and
-- a change of them alone is no record.
SELECT public.audit_register('mkt_subsidiaries', 'Marketing subsidiaries & clients', 'Marketing', '{marketing}', 'all',
  p_keys => '{code}', p_labels => '{name}',
  p_ignore => '{cal_code,cal_wa,cal2_code,cal2_wa}', p_omit => '{cal_code,cal_wa,cal2_code,cal2_wa}');

-- ── A WhatsApp number as the PIC's key ────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.mkt_wa_key(p_number text)
RETURNS text
LANGUAGE plpgsql IMMUTABLE
SET search_path = public
AS $fn$
DECLARE
  v_digits text := regexp_replace(coalesce(p_number, ''), '[^0-9]', '', 'g');
BEGIN
  IF length(v_digits) < 8 THEN
    RETURN NULL;
  END IF;
  -- 012-345 6789 and +60 12-345 6789 are the same phone.
  RETURN regexp_replace(v_digits, '^0', '60');
END
$fn$;
REVOKE ALL ON FUNCTION public.mkt_wa_key(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mkt_wa_key(text) TO service_role;

-- ── A PIC's calendar link, the manager's ──────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.mkt_sub_cal_link(p_sub uuid, p_slot integer, p_renew boolean DEFAULT false)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_s    public.mkt_subsidiaries;
  v_name text;
  v_wa   text;
  v_code text;
BEGIN
  PERFORM public.mkt_need(ARRAY['marketing.manage'], 'Only Marketing''s managers share a PIC''s calendar.');
  IF p_slot IS NULL OR p_slot NOT IN (1, 2) THEN
    RAISE EXCEPTION 'Pick its first PIC or its second.' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_s FROM public.mkt_subsidiaries WHERE id = p_sub AND active FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That subsidiary is not there.' USING ERRCODE = 'P0002';
  END IF;
  v_name := nullif(btrim(coalesce(CASE p_slot WHEN 1 THEN v_s.pic_name ELSE v_s.pic2_name END, '')), '');
  IF v_name IS NULL THEN
    RAISE EXCEPTION '%', CASE p_slot WHEN 1 THEN 'Add its PIC first.' ELSE 'Add its second PIC first.' END USING ERRCODE = '22023';
  END IF;
  v_wa := public.mkt_wa_key(CASE p_slot WHEN 1 THEN v_s.pic_whatsapp ELSE v_s.pic2_whatsapp END);
  IF v_wa IS NULL THEN
    RAISE EXCEPTION 'Add %''s WhatsApp number first — the calendar shows what was sent to it.', v_name USING ERRCODE = '22023';
  END IF;
  v_code := CASE p_slot WHEN 1 THEN v_s.cal_code ELSE v_s.cal2_code END;
  IF NOT coalesce(p_renew, false) AND v_code IS NOT NULL
     AND (CASE p_slot WHEN 1 THEN v_s.cal_wa ELSE v_s.cal2_wa END) IS NOT DISTINCT FROM v_wa THEN
    RETURN v_code;
  END IF;
  v_code := replace(gen_random_uuid()::text, '-', '');
  IF p_slot = 1 THEN
    UPDATE public.mkt_subsidiaries SET cal_code = v_code, cal_wa = v_wa WHERE id = v_s.id;
  ELSE
    UPDATE public.mkt_subsidiaries SET cal2_code = v_code, cal2_wa = v_wa WHERE id = v_s.id;
  END IF;
  RETURN v_code;
END
$fn$;
REVOKE ALL ON FUNCTION public.mkt_sub_cal_link(uuid, integer, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mkt_sub_cal_link(uuid, integer, boolean) TO authenticated;

-- ── What the PIC's calendar reads ─────────────────────────────────────────────────────────────────────────────
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
       WHERE p.subsidiary_id = v_s.id AND p.kind = 'product' AND p.status NOT IN ('minutes', 'cancelled')
         AND (public.mkt_wa_key(p.pic_whatsapp) = v_wa
              OR (nullif(btrim(coalesce(p.pic2_name, '')), '') IS NOT NULL AND public.mkt_wa_key(p.pic2_whatsapp) = v_wa))
    ),
    -- …and their deliverables planned, each with its product's link.
    tasks AS (
      SELECT m.id AS project, m.title AS product, m.title, m.status, m.posted, m.you, m.code, m.two FROM mine m
      UNION ALL
      SELECT d.id, m.title, d.title, d.status, d.posted, m.you, m.code, m.two
        FROM mine m JOIN public.mkt_projects d ON d.parent_id = m.id
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
                 WHERE x.deleted_at IS NULL AND x.day BETWEEN v_from AND v_to AND public.mkt_holiday_ok(x.states)) h), '[]'::jsonb))
  );
END
$fn$;
REVOKE ALL ON FUNCTION public.mkt_pic_calendar(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mkt_pic_calendar(text) TO anon, authenticated;
