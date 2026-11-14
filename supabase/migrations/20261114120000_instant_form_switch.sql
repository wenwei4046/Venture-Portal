-- A Page's Instant Form leads get a switch of their own (2026-11-14 — the owner: "如果我现在不想要让messanger 的客户进来crm",
-- then, told that unlinking The Conts' Page would also stop its Instant Form leads: "分成两个开关").
--
-- Until now one row decided both: crm_channels (kind 'page', the Page's id, linked false) kept a Page's Messenger chats
-- AND its lead-form leads out of the CRM (crm_ingest_messenger and crm_ingest_lead both ask it). Now:
--   * kind 'page' — the Page's Messenger: chats, and a Messenger lead ad's answers (they arrive in a Messenger chat).
--   * kind 'form' — NEW: the Page's Instant Form leads (the form on Facebook; the customer is a WhatsApp contact).
-- Both are set through crm_set_channel (CRM · Manage), as before; no row = linked, as before.
--
-- Nothing changes for anybody today: every Page unlinked before this migration (on production: Dream Crafter Design,
-- 2026-10-27) also gets its Instant Form switch off, so what it kept out it still keeps out.
--
-- Production's bodies, checked 2026-11-14: crm_ingest_lead md5 b7328bc2f2dca7a4931ce5b1893a7f7b, crm_set_channel md5
-- 2710c4218e9ca2ed9447589249d6047b. Each is swapped in place (pg_get_functiondef + replace, refused unless its anchor is
-- there exactly once) — nothing else in either body moves.

ALTER TABLE public.crm_channels DROP CONSTRAINT IF EXISTS crm_channels_kind_check;
ALTER TABLE public.crm_channels ADD CONSTRAINT crm_channels_kind_check CHECK (kind IN ('page', 'wa', 'ig', 'ads', 'form'));

DO $migration$
DECLARE
  v_def text;
  v_old_lead constant text := $q$kind = 'page' and external_id = l->>'pageId' and not linked$q$;
  v_new_lead constant text := $q$kind = case when l->>'kind' = 'instant' then 'form' else 'page' end and external_id = l->>'pageId' and not linked$q$;
  v_old_set constant text := $q$p_kind not in ('page', 'wa', 'ig', 'ads')$q$;
  v_new_set constant text := $q$p_kind not in ('page', 'wa', 'ig', 'ads', 'form')$q$;
BEGIN
  SELECT pg_get_functiondef('public.crm_ingest_lead(jsonb,jsonb)'::regprocedure) INTO v_def;
  IF (length(v_def) - length(replace(v_def, v_old_lead, ''))) / length(v_old_lead) <> 1 THEN
    RAISE EXCEPTION 'crm_ingest_lead: the Page check is not there exactly once — compare it with production first';
  END IF;
  EXECUTE replace(v_def, v_old_lead, v_new_lead);

  SELECT pg_get_functiondef('public.crm_set_channel(text,text,text,boolean,boolean)'::regprocedure) INTO v_def;
  IF (length(v_def) - length(replace(v_def, v_old_set, ''))) / length(v_old_set) <> 1 THEN
    RAISE EXCEPTION 'crm_set_channel: the kind check is not there exactly once — compare it with production first';
  END IF;
  EXECUTE replace(v_def, v_old_set, v_new_set);
END $migration$;

-- What a Page kept out, it keeps out.
INSERT INTO public.crm_channels (kind, external_id, name, linked, is_default)
SELECT 'form', external_id, name, false, false FROM public.crm_channels WHERE kind = 'page' AND NOT linked
ON CONFLICT (kind, external_id) DO NOTHING;
