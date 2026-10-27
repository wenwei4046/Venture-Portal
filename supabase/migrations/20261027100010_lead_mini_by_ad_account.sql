-- Lead View › 2990s mini by the ad's ad account (2026-10-27 — the user: "改成按广告所属的广告账户分：账户名有 Mini 的就是
-- 2990s mini"; .claude/rules/leads/lead-view.md › 2990S MINI BY THE AD ACCOUNT).
--
-- Every 2990s mini ad runs on the 2990s Page from an ad account named "2990's Mini@…", with headlines such as
-- "Chat with us" or "2990's" — so the headline rule ("mini" in the headline) sent almost all of them to 2990s. The
-- webhook now asks Meta which ad account the ad belongs to and hands its name as ad.account; a NEW conversation from an
-- ad whose account name or headline says "mini" is the mini brand's. Conversations already begun stay where they are.
--
-- PRODUCTION's body (md5 ccd998d3be8787fed944ba376ab48600, mig 20261026110000 as applied), one condition swapped,
-- refused unless it is there exactly once.

DO $do$
DECLARE
  v_sig regprocedure := 'public.lead_ingest_messenger(jsonb)'::regprocedure;
  v_src text := (SELECT prosrc FROM pg_proc WHERE oid = 'public.lead_ingest_messenger(jsonb)'::regprocedure);
  v_old text := $$v_head ILIKE '%mini%'$$;
  v_new text := $$(v_head ILIKE '%mini%' OR coalesce(m->'ad'->>'account', '') ILIKE '%mini%')$$;
BEGIN
  IF position(v_new IN v_src) > 0 THEN
    RETURN;  -- already in place
  END IF;
  IF md5(v_src) IS DISTINCT FROM 'ccd998d3be8787fed944ba376ab48600' THEN
    RAISE EXCEPTION 'lead_ingest_messenger: not the body this migration was written against (md5 %) — compare it with production first', md5(v_src);
  END IF;
  IF (length(v_src) - length(replace(v_src, v_old, ''))) / length(v_old) <> 1 THEN
    RAISE EXCEPTION 'lead_ingest_messenger: the mini condition is not there exactly once';
  END IF;
  EXECUTE replace(pg_get_functiondef(v_sig), v_old, v_new);
  IF position(v_new IN (SELECT prosrc FROM pg_proc WHERE oid = v_sig)) = 0 THEN
    RAISE EXCEPTION 'lead_ingest_messenger: the new condition is not in place';
  END IF;
END
$do$;

NOTIFY pgrst, 'reload schema';
