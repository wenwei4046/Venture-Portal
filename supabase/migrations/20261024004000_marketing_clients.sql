-- ============================================================================
-- 20261024004000_marketing_clients.sql
-- Marketing ④-1 — Marketing's own clients: "+ Add subsidiary" (the Claude Design handoff "HOUZS Marketing Module
-- Setup", `New Project.dc.html` and `Marketing Shell.dc.html`; the user, 2026-10-23: "会，marketing 自己的客户名单" —
-- Marketing's own client list, never Finance's `companies`).
-- ============================================================================
--
-- A client is a row of mkt_subsidiaries with no company (mig 20261023214100 made room for them): its name, its PIC's
-- name (optional), the handoff's grey dot, no emoji. Its CODE is the Track ID's middle part (MKT-<code>-2610-001), so
-- nobody types it and it never changes: the handoff's — the name's first four letters and digits, upper-cased, OTH when
-- there are fewer than two — and, when that is taken, the same with a number (ACME → ACME2 → ACME3). A name on the list
-- already (a group company's too, whatever the case) is refused.
--   mkt_sub_add(name, pic)   Marketing · Manage (the manager tools hold "clients") — the client, as New Project
--                            draws a subsidiary
-- PGlite: tests/member-sql/validate-marketing-clients.mjs.

CREATE OR REPLACE FUNCTION public.mkt_sub_add(p_name text, p_pic text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_name text := regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g');
  v_pic  text := nullif(regexp_replace(btrim(coalesce(p_pic, '')), '\s+', ' ', 'g'), '');
  v_base text;
  v_code text;
  v_n    integer := 1;
  v_s    public.mkt_subsidiaries;
BEGIN
  PERFORM public.mkt_need(ARRAY['marketing.manage'], 'Adding a client is the manager''s.');
  IF length(v_name) NOT BETWEEN 1 AND 80 THEN
    RAISE EXCEPTION 'Name the company or client — at most 80 characters.' USING ERRCODE = '22023';
  END IF;
  IF length(v_pic) > 80 THEN
    RAISE EXCEPTION 'A PIC''s name of at most 80 characters.' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('mkt_sub_add'));
  IF EXISTS (SELECT 1 FROM public.mkt_subsidiaries x WHERE lower(x.name) = lower(v_name) AND x.active) THEN
    RAISE EXCEPTION '% is on the list already.', v_name USING ERRCODE = '23505';
  END IF;
  v_base := left(upper(regexp_replace(v_name, '[^A-Za-z0-9]', '', 'g')), 4);
  IF length(v_base) < 2 THEN
    v_base := 'OTH';
  END IF;
  v_code := v_base;
  WHILE EXISTS (SELECT 1 FROM public.mkt_subsidiaries x WHERE x.code = v_code) LOOP
    v_n := v_n + 1;
    IF v_n > 999 THEN
      RAISE EXCEPTION 'No code is left for "%".', v_name USING ERRCODE = '54000';
    END IF;
    v_code := left(v_base, 6 - length(v_n::text)) || v_n::text;
  END LOOP;
  INSERT INTO public.mkt_subsidiaries (code, name, pic_name, created_by)
  VALUES (v_code, v_name, v_pic, auth.uid())
  RETURNING * INTO v_s;
  RETURN jsonb_build_object('id', v_s.id, 'code', v_s.code, 'name', v_s.name, 'dot', v_s.dot, 'emoji', v_s.emoji,
                            'client', true, 'pic', v_s.pic_name);
END
$fn$;

REVOKE ALL ON FUNCTION public.mkt_sub_add(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mkt_sub_add(text, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
