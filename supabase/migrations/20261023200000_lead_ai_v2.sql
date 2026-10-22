-- Lead View › AI Agent v2, AI corrections and the Data Center's files (2026-10-23, the redesign v2 handoff
-- `Auto Reply.dc.html` ?view=ai | corrections and `Data Center.dc.html` — the user: "照 claude design 最新版本"; step 5).
--
-- AI AGENT: each brand's agent keeps its soul (lead_personas: goal, mode — off | copilot) and gains the handoff's
-- settings in one document (settings: tone and its note, instructions, sales habits, what it avoids, what it does not
-- answer, reply length, when to ask for the phone, its limits, what it learns from). It answers word for word with
-- FIXED ANSWERS (lead_ai_answers) and follows a SALES PLAYBOOK (lead_ai_playbook). It reads the Data Center's files and
-- links chosen for it (lead_ai_sources: on or paused). It is still a copilot: it drafts, a person sends.
--
-- AI CORRECTIONS are the drafts Customer Service changed before sending: the draft is what the AI said, the text sent
-- is the right answer (lead_ai_drafts.sent_text, kept by lead_ai_draft_kept). A correction turns into a fixed answer
-- by the AI Agent page's save. The correction itself never changes.
--
-- DATA CENTER = files (a private storage bucket, lead-data, files/<uuid>/<name>) and links, in a brand's folder or
-- Shared, by category, with dates, a version and on / paused (lead_data_files). The old text cards (lead_knowledge)
-- are General info's job now; their table stays.
--
-- New page /leads/corrections (lead.corrections: View, and Edit = Lead View · Manage), by name. Every table: RLS on,
-- no policy, no grant. The bucket: a Lead View · Manage session uploads under files/, a Lead View · View session reads.

-- ── The agent's settings, fixed answers and playbook ───────────────────────

ALTER TABLE public.lead_personas
  ADD COLUMN IF NOT EXISTS settings jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(settings) = 'object' AND length(settings::text) <= 20000);

CREATE TABLE IF NOT EXISTS public.lead_ai_answers (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id        uuid NOT NULL REFERENCES public.lead_brands(id),
  question        text NOT NULL CHECK (btrim(question) <> '' AND length(question) <= 500),
  answer          text NOT NULL CHECK (btrim(answer) <> '' AND length(answer) <= 2000),
  -- Added by hand, or from a correction in the Inbox (the draft it came from).
  source          text NOT NULL DEFAULT '' CHECK (length(source) <= 200),
  draft_id        bigint REFERENCES public.lead_ai_drafts(id),
  edited_at       timestamptz,
  sort_order      integer NOT NULL DEFAULT 0,
  updated_by_name text NOT NULL DEFAULT '',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.lead_ai_playbook (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id        uuid NOT NULL REFERENCES public.lead_brands(id),
  active          boolean NOT NULL DEFAULT true,
  name            text NOT NULL CHECK (btrim(name) <> '' AND length(name) <= 80),
  words           text NOT NULL DEFAULT '' CHECK (length(words) <= 300),
  approaches      text[] NOT NULL DEFAULT '{}' CHECK (cardinality(approaches) <= 20),
  reply           text NOT NULL DEFAULT '' CHECK (length(reply) <= 2000),
  sort_order      integer NOT NULL DEFAULT 0,
  updated_by_name text NOT NULL DEFAULT '',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- What CS sent instead of a draft — the right answer of a correction.
ALTER TABLE public.lead_ai_drafts
  ADD COLUMN IF NOT EXISTS sent_text text CHECK (sent_text IS NULL OR length(sent_text) <= 2000);

-- ── The Data Center's files ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.lead_data_files (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- NULL = Shared (every brand's agent may read it).
  brand_id        uuid REFERENCES public.lead_brands(id),
  category        text NOT NULL DEFAULT '' CHECK (length(category) <= 40),
  kind            text NOT NULL CHECK (kind IN ('file', 'link')),
  name            text NOT NULL CHECK (btrim(name) <> '' AND length(name) <= 160),
  -- A file: its object in the lead-data bucket. A link: its https address.
  path            text CHECK (path IS NULL OR (path ~ '^files/[0-9a-f-]{36}/' AND length(path) <= 400)),
  url             text CHECK (url IS NULL OR (url ~ '^https://' AND length(url) <= 500)),
  mime            text NOT NULL DEFAULT '' CHECK (length(mime) <= 120),
  size_bytes      bigint NOT NULL DEFAULT 0 CHECK (size_bytes >= 0 AND size_bytes <= 52428800),
  ver             integer NOT NULL DEFAULT 1 CHECK (ver >= 1),
  valid_from      date,
  valid_until     date,
  status          text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused')),
  updated_by_name text NOT NULL DEFAULT '',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz,
  CONSTRAINT lead_data_files_kind CHECK ((kind = 'file') = (path IS NOT NULL) AND (kind = 'link') = (url IS NOT NULL)),
  CONSTRAINT lead_data_files_range CHECK (valid_from IS NULL OR valid_until IS NULL OR valid_from <= valid_until)
);

CREATE TABLE IF NOT EXISTS public.lead_ai_sources (
  brand_id        uuid NOT NULL REFERENCES public.lead_brands(id),
  file_id         uuid NOT NULL REFERENCES public.lead_data_files(id),
  paused          boolean NOT NULL DEFAULT false,
  added_by_name   text NOT NULL DEFAULT '',
  added_at        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (brand_id, file_id)
);

ALTER TABLE public.lead_ai_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_ai_playbook ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_data_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_ai_sources ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.lead_ai_answers, public.lead_ai_playbook, public.lead_data_files, public.lead_ai_sources FROM anon, authenticated;

SELECT public.audit_register('lead_ai_answers', 'Lead View AI fixed answers', 'Member services', '{leads}', 'all', p_labels => '{question}');
SELECT public.audit_register('lead_ai_playbook', 'Lead View AI sales playbook', 'Member services', '{leads}', 'all', p_labels => '{name}');
SELECT public.audit_register('lead_data_files', 'Lead View Data Center files', 'Member services', '{leads}', 'all', p_labels => '{name}');
SELECT public.audit_register('lead_ai_sources', 'Lead View AI sources', 'Member services', '{leads}', 'all');

-- The bucket: private; a Lead View · Manage session uploads under files/, a Lead View · View session reads (signed
-- links, and the server's read for the agent).
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('lead-data', 'lead-data', false, 52428800)
ON CONFLICT (id) DO NOTHING;
CREATE POLICY lead_data_upload ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'lead-data' AND (storage.foldername(name))[1] = 'files'
    AND (SELECT public.has_any_action(ARRAY['leads.manage'])));
CREATE POLICY lead_data_read ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'lead-data' AND (SELECT public.has_any_action(ARRAY['leads.view'])));

-- ── Readers ─────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.lead_data_file_json(f public.lead_data_files)
RETURNS jsonb
LANGUAGE sql STABLE
SET search_path = public
AS $fn$
  SELECT jsonb_build_object('id', f.id, 'brandId', f.brand_id, 'category', f.category, 'kind', f.kind, 'name', f.name, 'path', f.path,
    'url', f.url, 'mime', f.mime, 'sizeBytes', f.size_bytes, 'ver', f.ver, 'validFrom', f.valid_from, 'validUntil', f.valid_until,
    'status', f.status, 'updatedByName', f.updated_by_name, 'updatedAt', f.updated_at,
    'usedBy', coalesce((SELECT jsonb_agg(jsonb_build_object('brandId', s.brand_id, 'paused', s.paused)) FROM public.lead_ai_sources s WHERE s.file_id = f.id), '[]'::jsonb));
$fn$;
REVOKE ALL ON FUNCTION public.lead_data_file_json(public.lead_data_files) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lead_data_file_json(public.lead_data_files) TO service_role;

-- The Data Center: every file and link, with the agents that read it.
CREATE OR REPLACE FUNCTION public.lead_data_files()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  PERFORM public.lead_need(ARRAY['leads.view'], 'Lead View needs Lead View · View.');
  RETURN coalesce((SELECT jsonb_agg(public.lead_data_file_json(f) ORDER BY f.updated_at DESC)
                     FROM public.lead_data_files f WHERE f.deleted_at IS NULL), '[]'::jsonb);
END
$fn$;

-- A brand's agent beyond its soul: settings, fixed answers, playbook and the sources it reads (with their files).
CREATE OR REPLACE FUNCTION public.lead_ai_more(p_brand uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  PERFORM public.lead_need(ARRAY['leads.view'], 'Lead View needs Lead View · View.');
  RETURN jsonb_build_object(
    'brandId', p_brand,
    'settings', coalesce((SELECT p.settings FROM public.lead_personas p WHERE p.brand_id = p_brand), '{}'::jsonb),
    'answers', coalesce((SELECT jsonb_agg(jsonb_build_object('id', a.id, 'question', a.question, 'answer', a.answer, 'source', a.source,
                 'draftId', a.draft_id, 'editedAt', a.edited_at) ORDER BY a.sort_order, a.created_at)
                 FROM public.lead_ai_answers a WHERE a.brand_id = p_brand), '[]'::jsonb),
    'playbook', coalesce((SELECT jsonb_agg(jsonb_build_object('id', b.id, 'active', b.active, 'name', b.name, 'words', b.words,
                 'approaches', to_jsonb(b.approaches), 'reply', b.reply) ORDER BY b.sort_order, b.created_at)
                 FROM public.lead_ai_playbook b WHERE b.brand_id = p_brand), '[]'::jsonb),
    'sources', coalesce((SELECT jsonb_agg(jsonb_build_object('fileId', s.file_id, 'paused', s.paused, 'addedAt', s.added_at,
                 'addedByName', s.added_by_name, 'file', public.lead_data_file_json(f)) ORDER BY s.added_at)
                 FROM public.lead_ai_sources s JOIN public.lead_data_files f ON f.id = s.file_id
                WHERE s.brand_id = p_brand AND f.deleted_at IS NULL), '[]'::jsonb));
END
$fn$;

-- AI corrections: a brand's drafts CS changed before sending, the last p_days days (NULL = all), newest first — with
-- the customer's message it answered and the fixed answer made from it, if any.
CREATE OR REPLACE FUNCTION public.lead_ai_corrections(p_brand uuid, p_days integer)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  PERFORM public.lead_need(ARRAY['leads.view'], 'Lead View needs Lead View · View.');
  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object('id', d.id, 'at', d.decided_at, 'by', d.by_name, 'wrong', d.draft, 'right', d.sent_text,
      'contactId', c.id, 'conversation', c.name,
      'question', (SELECT m.body FROM public.lead_messages m WHERE m.contact_id = d.contact_id AND m.direction = 'in' AND m.created_at <= d.created_at ORDER BY m.id DESC LIMIT 1),
      'answerId', (SELECT a.id FROM public.lead_ai_answers a WHERE a.draft_id = d.id LIMIT 1)) ORDER BY d.decided_at DESC)
      FROM public.lead_ai_drafts d JOIN public.lead_contacts c ON c.id = d.contact_id
     WHERE c.brand_id = p_brand AND d.outcome = 'edited' AND d.sent_text IS NOT NULL
       AND (p_days IS NULL OR d.decided_at > now() - make_interval(days => p_days))), '[]'::jsonb);
END
$fn$;

-- ── Writers ─────────────────────────────────────────────────────────────────

-- The AI Agent page's Save for one brand: its settings, and its fixed answers, playbook and sources as they stand
-- (left out = removed; a fixed answer edited after it came from a correction is stamped).
CREATE OR REPLACE FUNCTION public.lead_save_ai(p_brand uuid, p_data jsonb)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  r jsonb;
  v_actor text;
  v_ord integer := 0;
  v_keep uuid[] := '{}';
  v_id uuid;
BEGIN
  PERFORM public.lead_need(ARRAY['leads.manage'], 'The AI agent needs Lead View · Manage.');
  v_actor := public.lead_actor_name();
  IF NOT EXISTS (SELECT 1 FROM public.lead_brands WHERE id = p_brand AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'That brand is gone.' USING ERRCODE = 'P0002';
  END IF;
  IF jsonb_typeof(p_data->'settings') <> 'object' OR length((p_data->'settings')::text) > 20000
     OR jsonb_typeof(p_data->'answers') <> 'array' OR jsonb_array_length(p_data->'answers') > 300
     OR jsonb_typeof(p_data->'playbook') <> 'array' OR jsonb_array_length(p_data->'playbook') > 100
     OR jsonb_typeof(p_data->'sources') <> 'array' OR jsonb_array_length(p_data->'sources') > 200 THEN
    RAISE EXCEPTION 'The agent''s settings are not in the right shape.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.lead_personas AS p (brand_id, settings, goal, updated_by_name)
  VALUES (p_brand, p_data->'settings', left(coalesce(p_data->'settings'->>'goal', ''), 1000), v_actor)
  ON CONFLICT (brand_id) DO UPDATE SET settings = EXCLUDED.settings, goal = EXCLUDED.goal, updated_by_name = v_actor, updated_at = now()
   WHERE (p.settings, p.goal) IS DISTINCT FROM (EXCLUDED.settings, EXCLUDED.goal);

  -- Fixed answers.
  FOR r IN SELECT * FROM jsonb_array_elements(p_data->'answers') LOOP
    v_ord := v_ord + 1;
    IF btrim(coalesce(r->>'question', '')) = '' OR btrim(coalesce(r->>'answer', '')) = '' THEN
      RAISE EXCEPTION 'A fixed answer needs what the customer asks and the reply.' USING ERRCODE = '22023';
    END IF;
    v_id := CASE WHEN r->>'id' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN (r->>'id')::uuid END;
    IF v_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.lead_ai_answers WHERE id = v_id AND brand_id = p_brand) THEN
      UPDATE public.lead_ai_answers a SET question = left(btrim(r->>'question'), 500), answer = left(btrim(r->>'answer'), 2000), sort_order = v_ord,
             edited_at = CASE WHEN a.answer <> left(btrim(r->>'answer'), 2000) AND a.draft_id IS NOT NULL THEN now() ELSE a.edited_at END,
             updated_by_name = v_actor, updated_at = now()
       WHERE a.id = v_id AND (a.question, a.answer, a.sort_order) IS DISTINCT FROM (left(btrim(r->>'question'), 500), left(btrim(r->>'answer'), 2000), v_ord);
    ELSE
      INSERT INTO public.lead_ai_answers (brand_id, question, answer, source, draft_id, sort_order, updated_by_name)
      VALUES (p_brand, left(btrim(r->>'question'), 500), left(btrim(r->>'answer'), 2000),
              CASE WHEN (r->>'draftId') ~ '^[0-9]{1,18}$' THEN 'From a correction in the Inbox · ' || v_actor ELSE 'Added by ' || v_actor END,
              CASE WHEN (r->>'draftId') ~ '^[0-9]{1,18}$' AND EXISTS (SELECT 1 FROM public.lead_ai_drafts WHERE id = (r->>'draftId')::bigint) THEN (r->>'draftId')::bigint END,
              v_ord, v_actor)
      RETURNING id INTO v_id;
    END IF;
    v_keep := v_keep || v_id;
  END LOOP;
  DELETE FROM public.lead_ai_answers WHERE brand_id = p_brand AND NOT id = ANY (v_keep);

  -- The playbook.
  v_ord := 0;
  v_keep := '{}';
  FOR r IN SELECT * FROM jsonb_array_elements(p_data->'playbook') LOOP
    v_ord := v_ord + 1;
    IF btrim(coalesce(r->>'name', '')) = '' THEN
      RAISE EXCEPTION 'A playbook situation needs a name.' USING ERRCODE = '22023';
    END IF;
    v_id := CASE WHEN r->>'id' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN (r->>'id')::uuid END;
    IF v_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.lead_ai_playbook WHERE id = v_id AND brand_id = p_brand) THEN
      UPDATE public.lead_ai_playbook b SET active = coalesce((r->>'active')::boolean, true), name = left(btrim(r->>'name'), 80),
             words = left(coalesce(r->>'words', ''), 300), approaches = ARRAY(SELECT left(x, 80) FROM jsonb_array_elements_text(coalesce(r->'approaches', '[]'::jsonb)) x LIMIT 20),
             reply = left(coalesce(r->>'reply', ''), 2000), sort_order = v_ord, updated_by_name = v_actor, updated_at = now()
       WHERE b.id = v_id;
    ELSE
      INSERT INTO public.lead_ai_playbook (brand_id, active, name, words, approaches, reply, sort_order, updated_by_name)
      VALUES (p_brand, coalesce((r->>'active')::boolean, true), left(btrim(r->>'name'), 80), left(coalesce(r->>'words', ''), 300),
              ARRAY(SELECT left(x, 80) FROM jsonb_array_elements_text(coalesce(r->'approaches', '[]'::jsonb)) x LIMIT 20),
              left(coalesce(r->>'reply', ''), 2000), v_ord, v_actor)
      RETURNING id INTO v_id;
    END IF;
    v_keep := v_keep || v_id;
  END LOOP;
  DELETE FROM public.lead_ai_playbook WHERE brand_id = p_brand AND NOT id = ANY (v_keep);

  -- Sources: files of its brand's folder or Shared, on or paused.
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_data->'sources') x
              WHERE NOT EXISTS (SELECT 1 FROM public.lead_data_files f WHERE f.id::text = x->>'fileId' AND f.deleted_at IS NULL
                                  AND (f.brand_id IS NULL OR f.brand_id = p_brand))) THEN
    RAISE EXCEPTION 'An agent reads files from its brand''s folder or Shared.' USING ERRCODE = '22023';
  END IF;
  DELETE FROM public.lead_ai_sources s WHERE s.brand_id = p_brand
     AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_data->'sources') x WHERE x->>'fileId' = s.file_id::text);
  INSERT INTO public.lead_ai_sources AS s (brand_id, file_id, paused, added_by_name)
  SELECT p_brand, (x->>'fileId')::uuid, coalesce((x->>'paused')::boolean, false), v_actor FROM jsonb_array_elements(p_data->'sources') x
  ON CONFLICT (brand_id, file_id) DO UPDATE SET paused = EXCLUDED.paused WHERE s.paused IS DISTINCT FROM EXCLUDED.paused;
END
$fn$;

-- What became of a draft, with what was sent: sent as written, edited then sent (a correction), or dismissed.
CREATE OR REPLACE FUNCTION public.lead_ai_draft_kept(p_id bigint, p_outcome text, p_sent text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  PERFORM public.lead_need(ARRAY['leads.create'], 'An AI draft needs Lead View · Create.');
  IF p_outcome NOT IN ('sent', 'edited', 'dismissed') THEN
    RAISE EXCEPTION 'A draft is sent, edited or dismissed.' USING ERRCODE = '22023';
  END IF;
  UPDATE public.lead_ai_drafts SET outcome = p_outcome, decided_at = now(),
         sent_text = CASE WHEN p_outcome = 'dismissed' THEN NULL ELSE left(NULLIF(btrim(coalesce(p_sent, '')), ''), 2000) END
   WHERE id = p_id AND outcome = 'pending';
END
$fn$;

-- A file (after its upload) or a link: new (p_id NULL) or changed; a new file on an old one makes its next version.
CREATE OR REPLACE FUNCTION public.lead_save_data_file(p_id uuid, p_data jsonb)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_kind text := coalesce(p_data->>'kind', 'file');
  v_name text := btrim(coalesce(p_data->>'name', ''));
  v_brand uuid := CASE WHEN p_data->>'brandId' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN (p_data->>'brandId')::uuid END;
  v_path text := NULLIF(p_data->>'path', '');
  v_url text := NULLIF(btrim(coalesce(p_data->>'url', '')), '');
  v_from date := NULLIF(p_data->>'validFrom', '')::date;
  v_until date := NULLIF(p_data->>'validUntil', '')::date;
  v_id uuid;
  f public.lead_data_files;
BEGIN
  PERFORM public.lead_need(ARRAY['leads.manage'], 'The Data Center needs Lead View · Manage.');
  IF v_name = '' OR length(v_name) > 160 THEN
    RAISE EXCEPTION 'A file needs a name (160 characters at most).' USING ERRCODE = '22023';
  END IF;
  IF v_kind NOT IN ('file', 'link') OR (v_kind = 'link' AND (v_url IS NULL OR v_url !~ '^https://')) THEN
    RAISE EXCEPTION 'A link is an https address.' USING ERRCODE = '22023';
  END IF;
  IF v_path IS NOT NULL AND (v_path !~ '^files/[0-9a-f-]{36}/' OR NOT EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id = 'lead-data' AND o.name = v_path)) THEN
    RAISE EXCEPTION 'The file did not finish uploading — try again.' USING ERRCODE = '22023';
  END IF;
  IF v_from IS NOT NULL AND v_until IS NOT NULL AND v_from > v_until THEN
    RAISE EXCEPTION 'A file ends before it starts.' USING ERRCODE = '22023';
  END IF;
  IF v_brand IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.lead_brands WHERE id = v_brand AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'That brand is gone.' USING ERRCODE = 'P0002';
  END IF;
  IF p_id IS NULL THEN
    IF v_kind = 'file' AND v_path IS NULL THEN
      RAISE EXCEPTION 'Upload the file first.' USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.lead_data_files (brand_id, category, kind, name, path, url, mime, size_bytes, valid_from, valid_until, status, updated_by_name)
    VALUES (v_brand, left(coalesce(p_data->>'category', ''), 40), v_kind, v_name, CASE WHEN v_kind = 'file' THEN v_path END, CASE WHEN v_kind = 'link' THEN v_url END,
            left(coalesce(p_data->>'mime', ''), 120), greatest(0, least(52428800, coalesce((p_data->>'sizeBytes')::bigint, 0))), v_from, v_until,
            CASE WHEN p_data->>'status' = 'paused' THEN 'paused' ELSE 'active' END, public.lead_actor_name())
    RETURNING id INTO v_id;
    RETURN v_id;
  END IF;
  SELECT * INTO f FROM public.lead_data_files WHERE id = p_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That file is gone.' USING ERRCODE = 'P0002';
  END IF;
  UPDATE public.lead_data_files SET brand_id = v_brand, category = left(coalesce(p_data->>'category', ''), 40), name = v_name,
         path = CASE WHEN f.kind = 'file' THEN coalesce(v_path, f.path) END,
         url = CASE WHEN f.kind = 'link' THEN coalesce(v_url, f.url) END,
         mime = CASE WHEN v_path IS NOT NULL AND v_path <> coalesce(f.path, '') THEN left(coalesce(p_data->>'mime', ''), 120) ELSE f.mime END,
         size_bytes = CASE WHEN v_path IS NOT NULL AND v_path <> coalesce(f.path, '') THEN greatest(0, least(52428800, coalesce((p_data->>'sizeBytes')::bigint, 0))) ELSE f.size_bytes END,
         ver = CASE WHEN v_path IS NOT NULL AND v_path <> coalesce(f.path, '') THEN f.ver + 1 ELSE f.ver END,
         valid_from = v_from, valid_until = v_until, status = CASE WHEN p_data->>'status' = 'paused' THEN 'paused' ELSE 'active' END,
         updated_by_name = public.lead_actor_name(), updated_at = now()
   WHERE id = p_id;
  -- A file moved out of a brand's folder leaves that brand's agent.
  DELETE FROM public.lead_ai_sources s WHERE s.file_id = p_id AND v_brand IS NOT NULL AND s.brand_id <> v_brand;
  RETURN p_id;
END
$fn$;

-- A file or link gone from the Data Center and from every agent (its stored object stays for the record).
CREATE OR REPLACE FUNCTION public.lead_remove_data_file(p_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  PERFORM public.lead_need(ARRAY['leads.manage'], 'The Data Center needs Lead View · Manage.');
  DELETE FROM public.lead_ai_sources WHERE file_id = p_id;
  UPDATE public.lead_data_files SET deleted_at = now(), updated_by_name = public.lead_actor_name() WHERE id = p_id AND deleted_at IS NULL;
END
$fn$;

REVOKE ALL ON FUNCTION public.lead_data_files() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.lead_ai_more(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.lead_ai_corrections(uuid, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.lead_save_ai(uuid, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.lead_ai_draft_kept(bigint, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.lead_save_data_file(uuid, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.lead_remove_data_file(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lead_data_files() TO authenticated;
GRANT EXECUTE ON FUNCTION public.lead_ai_more(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.lead_ai_corrections(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.lead_save_ai(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.lead_ai_draft_kept(bigint, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.lead_save_data_file(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.lead_remove_data_file(uuid) TO authenticated;

-- ── The new page, by name ───────────────────────────────────────────────────

INSERT INTO public.permission_page_tabs (page, tab_id) VALUES
  ('/leads/corrections', 'lead.corrections')
ON CONFLICT DO NOTHING;

INSERT INTO public.permission_tab_cells (tab_id, action, cell) VALUES
  ('lead.corrections', 'view', 'leads.view'),
  ('lead.corrections', 'edit', 'leads.manage')
ON CONFLICT DO NOTHING;

NOTIFY pgrst, 'reload schema';
