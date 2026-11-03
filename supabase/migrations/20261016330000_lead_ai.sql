-- ============================================================================
-- 20261016330000_lead_ai.sql
-- Lead View › AI Agent, the base (2026-10-16 — the user's brief 2.1: "導入 AI Agent 上傳一個 file（data center）
-- 給他們（裡面包含 promo, photo 等的咨詢），也能設定 AI 講話的靈魂、方式"; then "这个完成后做AI Agent，把基础做好，
-- 细节再调" / "是的"). The AI writes DRAFTS for Customer Service (copilot): nothing it writes reaches a customer
-- until somebody sends it. Answering on its own, photos and files come later.
-- ============================================================================
--
-- 1. Data Center: lead_knowledge — what the agent may say, each a short card (promo, product, FAQ, showroom,
--    policy, note) for one brand or every brand, a promo with its dates. Only what is here may be quoted.
-- 2. The soul: lead_personas — one per brand: the agent's name, its personality and tone, its goal, do's and
--    don'ts, example replies, and its mode (off · copilot).
-- 3. Drafts: lead_ai_drafts — every draft the agent wrote, who asked, and what became of it (sent as written,
--    edited then sent, dismissed): the adoption rate on the AI Agent page.
-- 4. Functions: lead_knowledge / lead_save_knowledge / lead_remove_knowledge (Data Center),
--    lead_personas / lead_save_persona (AI Agent), lead_ai_context (what a draft is written from — the Inbox),
--    lead_ai_try_context (the AI Agent page's try-it), lead_ai_log_draft / lead_ai_draft_outcome (the Inbox).
--    The model is called by the app (src/lib/leads/ai.ts); the key lives in env (ANTHROPIC_API_KEY), never here.
-- 5. Two new pages join the tab registry (mig 20261016330100): /leads/knowledge (lead.knowledge) and /leads/ai
--    (lead.ai) — View, and Edit standing for Lead View · Manage; their writes ask their page. The Inbox's draft
--    functions ask /leads (Create).

-- ── Data Center ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.lead_knowledge (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- NULL = every brand.
  brand_id         uuid REFERENCES public.lead_brands(id),
  kind             text NOT NULL DEFAULT 'faq' CHECK (kind IN ('promo', 'product', 'faq', 'showroom', 'policy', 'note')),
  title            text NOT NULL CHECK (btrim(title) <> '' AND length(title) <= 80),
  body             text NOT NULL CHECK (btrim(body) <> '' AND length(body) <= 4000),
  -- A promo's dates (Asia/Kuala_Lumpur days); outside them the agent does not see it.
  starts_on        date,
  ends_on          date,
  active           boolean NOT NULL DEFAULT true,
  updated_by_name  text NOT NULL DEFAULT '',
  deleted_at       timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lead_knowledge_dates CHECK (starts_on IS NULL OR ends_on IS NULL OR ends_on >= starts_on)
);
CREATE INDEX IF NOT EXISTS lead_knowledge_brand ON public.lead_knowledge (brand_id) WHERE deleted_at IS NULL;
ALTER TABLE public.lead_knowledge ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.lead_knowledge FROM anon, authenticated;
SELECT public.audit_register('lead_knowledge', 'Lead View Data Center', 'Member services', '{leads}', 'all', p_labels => '{title}');

-- ── The soul ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.lead_personas (
  brand_id         uuid PRIMARY KEY REFERENCES public.lead_brands(id),
  agent_name       text NOT NULL DEFAULT '' CHECK (length(agent_name) <= 40),
  -- Who the agent is and how it talks.
  personality      text NOT NULL DEFAULT '' CHECK (length(personality) <= 2000),
  tone             text NOT NULL DEFAULT 'warm' CHECK (tone IN ('warm', 'professional', 'playful', 'concise')),
  goal             text NOT NULL DEFAULT '' CHECK (length(goal) <= 1000),
  dos              text NOT NULL DEFAULT '' CHECK (length(dos) <= 2000),
  donts            text NOT NULL DEFAULT '' CHECK (length(donts) <= 2000),
  -- Replies written the brand's way, for the agent to copy the voice of.
  examples         text NOT NULL DEFAULT '' CHECK (length(examples) <= 4000),
  -- off = no drafts; copilot = drafts for Customer Service to send, edit or dismiss.
  mode             text NOT NULL DEFAULT 'off' CHECK (mode IN ('off', 'copilot')),
  updated_by_name  text NOT NULL DEFAULT '',
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.lead_personas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.lead_personas FROM anon, authenticated;
SELECT public.audit_register('lead_personas', 'Lead View AI agent', 'Member services', '{leads}', 'all', p_labels => '{agent_name}');

-- ── Drafts ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.lead_ai_drafts (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  contact_id  uuid NOT NULL REFERENCES public.lead_contacts(id),
  draft       text NOT NULL CHECK (btrim(draft) <> '' AND length(draft) <= 2000),
  -- The Data Center cards it used ([{ id, title }]) and whether it thinks a person should take over.
  used        jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(used) = 'array'),
  handoff     boolean NOT NULL DEFAULT false,
  note        text NOT NULL DEFAULT '' CHECK (length(note) <= 300),
  model       text NOT NULL DEFAULT '' CHECK (length(model) <= 60),
  by_user     uuid,
  by_name     text NOT NULL DEFAULT '',
  outcome     text NOT NULL DEFAULT 'pending' CHECK (outcome IN ('pending', 'sent', 'edited', 'dismissed')),
  decided_at  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lead_ai_drafts_contact ON public.lead_ai_drafts (contact_id, id);
CREATE INDEX IF NOT EXISTS lead_ai_drafts_created ON public.lead_ai_drafts (created_at);
ALTER TABLE public.lead_ai_drafts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.lead_ai_drafts FROM anon, authenticated;
SELECT public.audit_register('lead_ai_drafts', 'Lead View AI drafts', 'Member services', '{}', 'none',
  p_reason => 'Each draft is its own record: who asked for it, when, and what became of it.');

-- ── Helpers ──────────────────────────────────────────────────────────────────

-- A Data Center card as the screens and the agent read it.
CREATE OR REPLACE FUNCTION public.lead_knowledge_json(k public.lead_knowledge)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT jsonb_build_object('id', k.id, 'brandId', k.brand_id, 'kind', k.kind, 'title', k.title, 'body', k.body,
    'startsOn', k.starts_on, 'endsOn', k.ends_on, 'active', k.active, 'updatedByName', k.updated_by_name, 'updatedAt', k.updated_at)
$fn$;
REVOKE ALL ON FUNCTION public.lead_knowledge_json(public.lead_knowledge) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lead_knowledge_json(public.lead_knowledge) TO service_role;

-- A brand's soul; a brand with none yet gets the starting one (mode off).
CREATE OR REPLACE FUNCTION public.lead_persona_json(p_brand uuid)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT jsonb_build_object(
    'brandId', b.id, 'brandName', b.name,
    'agentName', coalesce(p.agent_name, ''),
    'personality', coalesce(p.personality, ''),
    'tone', coalesce(p.tone, 'warm'),
    'goal', coalesce(p.goal, ''),
    'dos', coalesce(p.dos, ''),
    'donts', coalesce(p.donts, ''),
    'examples', coalesce(p.examples, ''),
    'mode', coalesce(p.mode, 'off'),
    'saved', p.brand_id IS NOT NULL,
    'updatedByName', coalesce(p.updated_by_name, ''),
    'updatedAt', p.updated_at)
    FROM public.lead_brands b
    LEFT JOIN public.lead_personas p ON p.brand_id = b.id
   WHERE b.id = p_brand
$fn$;
REVOKE ALL ON FUNCTION public.lead_persona_json(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lead_persona_json(uuid) TO service_role;

-- The cards the agent may use today for a brand: its own and every brand's, switched on, inside their dates.
CREATE OR REPLACE FUNCTION public.lead_knowledge_today(p_brand uuid)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT coalesce(jsonb_agg(public.lead_knowledge_json(k) ORDER BY k.kind, k.title), '[]'::jsonb)
    FROM public.lead_knowledge k
   WHERE k.deleted_at IS NULL AND k.active
     AND (k.brand_id IS NULL OR k.brand_id = p_brand)
     AND (k.starts_on IS NULL OR k.starts_on <= (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date)
     AND (k.ends_on IS NULL OR k.ends_on >= (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date)
$fn$;
REVOKE ALL ON FUNCTION public.lead_knowledge_today(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lead_knowledge_today(uuid) TO service_role;

-- ── Data Center: read and write ──────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.lead_knowledge()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  PERFORM public.lead_need(ARRAY['leads.view'], 'Lead View needs Lead View · View.');
  RETURN coalesce((
    SELECT jsonb_agg(public.lead_knowledge_json(k) ORDER BY k.brand_id NULLS FIRST, k.kind, k.title)
      FROM public.lead_knowledge k WHERE k.deleted_at IS NULL), '[]'::jsonb);
END
$fn$;

-- A card: new (p_id NULL) or changed. Keys: brandId, kind, title, body, startsOn, endsOn, active.
CREATE OR REPLACE FUNCTION public.lead_save_knowledge(p_id uuid, p_data jsonb)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_brand uuid := nullif(p_data->>'brandId', '')::uuid;
  v_kind text := coalesce(p_data->>'kind', 'faq');
  v_title text := btrim(coalesce(p_data->>'title', ''));
  v_body text := btrim(coalesce(p_data->>'body', ''));
  v_from date := nullif(p_data->>'startsOn', '')::date;
  v_to date := nullif(p_data->>'endsOn', '')::date;
  v_id uuid;
BEGIN
  PERFORM public.lead_need(ARRAY['leads.manage'], 'The Data Center needs Lead View · Manage.');
  IF v_title = '' OR length(v_title) > 80 THEN
    RAISE EXCEPTION 'A card needs a title (80 characters at most).' USING ERRCODE = '22023';
  END IF;
  IF v_body = '' OR length(v_body) > 4000 THEN
    RAISE EXCEPTION 'A card needs its text (4,000 characters at most).' USING ERRCODE = '22023';
  END IF;
  IF v_kind NOT IN ('promo', 'product', 'faq', 'showroom', 'policy', 'note') THEN
    RAISE EXCEPTION 'A card is a promo, a product, an FAQ, a showroom, a policy or a note.' USING ERRCODE = '22023';
  END IF;
  IF v_from IS NOT NULL AND v_to IS NOT NULL AND v_to < v_from THEN
    RAISE EXCEPTION 'The end date is before the start.' USING ERRCODE = '22023';
  END IF;
  IF v_brand IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.lead_brands WHERE id = v_brand AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'That brand is gone.' USING ERRCODE = 'P0002';
  END IF;
  IF p_id IS NULL THEN
    INSERT INTO public.lead_knowledge (brand_id, kind, title, body, starts_on, ends_on, active, updated_by_name)
    VALUES (v_brand, v_kind, v_title, v_body, v_from, v_to, coalesce((p_data->>'active')::boolean, true), public.lead_actor_name())
    RETURNING id INTO v_id;
    RETURN v_id;
  END IF;
  UPDATE public.lead_knowledge SET brand_id = v_brand, kind = v_kind, title = v_title, body = v_body, starts_on = v_from,
         ends_on = v_to, active = coalesce((p_data->>'active')::boolean, active), updated_by_name = public.lead_actor_name(),
         updated_at = now()
   WHERE id = p_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That card is gone.' USING ERRCODE = 'P0002';
  END IF;
  RETURN p_id;
END
$fn$;

CREATE OR REPLACE FUNCTION public.lead_remove_knowledge(p_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  PERFORM public.lead_need(ARRAY['leads.manage'], 'The Data Center needs Lead View · Manage.');
  UPDATE public.lead_knowledge SET deleted_at = now(), updated_at = now(), updated_by_name = public.lead_actor_name()
   WHERE id = p_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That card is gone.' USING ERRCODE = 'P0002';
  END IF;
END
$fn$;

-- ── The soul: read and write ─────────────────────────────────────────────────

-- Every brand's soul, with the last 30 days of drafts: how many, and what became of them.
CREATE OR REPLACE FUNCTION public.lead_personas()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  PERFORM public.lead_need(ARRAY['leads.view'], 'Lead View needs Lead View · View.');
  RETURN coalesce((
    SELECT jsonb_agg(public.lead_persona_json(b.id) || jsonb_build_object(
      'drafts', (SELECT jsonb_build_object(
                   'total', count(*),
                   'sent', count(*) FILTER (WHERE d.outcome = 'sent'),
                   'edited', count(*) FILTER (WHERE d.outcome = 'edited'),
                   'dismissed', count(*) FILTER (WHERE d.outcome = 'dismissed'))
                   FROM public.lead_ai_drafts d JOIN public.lead_contacts c ON c.id = d.contact_id
                  WHERE c.brand_id = b.id AND d.created_at > now() - interval '30 days'))
      ORDER BY b.sort_order, b.created_at)
      FROM public.lead_brands b WHERE b.deleted_at IS NULL), '[]'::jsonb);
END
$fn$;

-- A brand's soul. Keys: agentName, personality, tone, goal, dos, donts, examples, mode.
CREATE OR REPLACE FUNCTION public.lead_save_persona(p_brand uuid, p_data jsonb)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_tone text := coalesce(p_data->>'tone', 'warm');
  v_mode text := coalesce(p_data->>'mode', 'off');
BEGIN
  PERFORM public.lead_need(ARRAY['leads.manage'], 'The AI agent needs Lead View · Manage.');
  IF NOT EXISTS (SELECT 1 FROM public.lead_brands WHERE id = p_brand AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'That brand is gone.' USING ERRCODE = 'P0002';
  END IF;
  IF v_tone NOT IN ('warm', 'professional', 'playful', 'concise') THEN
    RAISE EXCEPTION 'Unknown tone.' USING ERRCODE = '22023';
  END IF;
  IF v_mode NOT IN ('off', 'copilot') THEN
    RAISE EXCEPTION 'The agent is off or a copilot.' USING ERRCODE = '22023';
  END IF;
  IF length(coalesce(p_data->>'agentName', '')) > 40 OR length(coalesce(p_data->>'personality', '')) > 2000
     OR length(coalesce(p_data->>'goal', '')) > 1000 OR length(coalesce(p_data->>'dos', '')) > 2000
     OR length(coalesce(p_data->>'donts', '')) > 2000 OR length(coalesce(p_data->>'examples', '')) > 4000 THEN
    RAISE EXCEPTION 'Something is too long.' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.lead_personas (brand_id, agent_name, personality, tone, goal, dos, donts, examples, mode, updated_by_name)
  VALUES (p_brand, btrim(coalesce(p_data->>'agentName', '')), btrim(coalesce(p_data->>'personality', '')), v_tone,
          btrim(coalesce(p_data->>'goal', '')), btrim(coalesce(p_data->>'dos', '')), btrim(coalesce(p_data->>'donts', '')),
          btrim(coalesce(p_data->>'examples', '')), v_mode, public.lead_actor_name())
  ON CONFLICT (brand_id) DO UPDATE SET agent_name = EXCLUDED.agent_name, personality = EXCLUDED.personality, tone = EXCLUDED.tone,
         goal = EXCLUDED.goal, dos = EXCLUDED.dos, donts = EXCLUDED.donts, examples = EXCLUDED.examples, mode = EXCLUDED.mode,
         updated_by_name = EXCLUDED.updated_by_name, updated_at = now();
END
$fn$;

-- ── What a draft is written from ─────────────────────────────────────────────

-- The Inbox: the conversation's brand soul, the cards for today, the customer card and the last 30 messages.
-- Refused while the brand's agent is off.
CREATE OR REPLACE FUNCTION public.lead_ai_context(p_contact uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  c public.lead_contacts;
  v_persona jsonb;
BEGIN
  PERFORM public.lead_need(ARRAY['leads.create'], 'An AI draft needs Lead View · Create.');
  SELECT * INTO c FROM public.lead_contacts WHERE id = p_contact;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That conversation is gone.' USING ERRCODE = 'P0002';
  END IF;
  v_persona := public.lead_persona_json(c.brand_id);
  IF v_persona->>'mode' IS DISTINCT FROM 'copilot' THEN
    RAISE EXCEPTION 'The AI agent is off for this brand — switch it on in AI Agent.' USING ERRCODE = '22023';
  END IF;
  RETURN jsonb_build_object(
    'persona', v_persona,
    'knowledge', public.lead_knowledge_today(c.brand_id),
    'contact', public.lead_contact_json(c),
    'messages', coalesce((
      SELECT jsonb_agg(jsonb_build_object('direction', m.direction, 'sender', m.sender, 'body', m.body, 'at', m.created_at) ORDER BY m.id)
        FROM (SELECT * FROM public.lead_messages WHERE contact_id = c.id ORDER BY id DESC LIMIT 30) m), '[]'::jsonb),
    'today', (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date);
END
$fn$;

-- The AI Agent page's try-it: a brand's soul (as saved) and its cards for today, whatever its mode.
CREATE OR REPLACE FUNCTION public.lead_ai_try_context(p_brand uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  PERFORM public.lead_need(ARRAY['leads.manage'], 'Trying the AI agent needs Lead View · Manage.');
  IF NOT EXISTS (SELECT 1 FROM public.lead_brands WHERE id = p_brand AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'That brand is gone.' USING ERRCODE = 'P0002';
  END IF;
  RETURN jsonb_build_object('persona', public.lead_persona_json(p_brand), 'knowledge', public.lead_knowledge_today(p_brand),
    'today', (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date);
END
$fn$;

-- ── Drafts ───────────────────────────────────────────────────────────────────

-- Keep a draft the agent wrote; the Inbox shows it until Customer Service sends, edits or dismisses it.
CREATE OR REPLACE FUNCTION public.lead_ai_log_draft(p_contact uuid, p_draft text, p_used jsonb, p_handoff boolean, p_note text, p_model text)
RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_id bigint;
BEGIN
  PERFORM public.lead_need(ARRAY['leads.create'], 'An AI draft needs Lead View · Create.');
  IF NOT EXISTS (SELECT 1 FROM public.lead_contacts WHERE id = p_contact) THEN
    RAISE EXCEPTION 'That conversation is gone.' USING ERRCODE = 'P0002';
  END IF;
  IF btrim(coalesce(p_draft, '')) = '' THEN
    RAISE EXCEPTION 'The agent wrote nothing.' USING ERRCODE = '22023';
  END IF;
  -- An earlier draft nobody used is passed over.
  UPDATE public.lead_ai_drafts SET outcome = 'dismissed', decided_at = now() WHERE contact_id = p_contact AND outcome = 'pending';
  INSERT INTO public.lead_ai_drafts (contact_id, draft, used, handoff, note, model, by_user, by_name)
  VALUES (p_contact, left(btrim(p_draft), 2000),
          CASE WHEN jsonb_typeof(p_used) = 'array' THEN p_used ELSE '[]'::jsonb END,
          coalesce(p_handoff, false), left(coalesce(p_note, ''), 300), left(coalesce(p_model, ''), 60),
          auth.uid(), public.lead_actor_name())
  RETURNING id INTO v_id;
  RETURN v_id;
END
$fn$;

-- What became of a draft: sent as written, edited then sent, or dismissed. Only a pending draft changes.
CREATE OR REPLACE FUNCTION public.lead_ai_draft_outcome(p_id bigint, p_outcome text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  PERFORM public.lead_need(ARRAY['leads.create'], 'An AI draft needs Lead View · Create.');
  IF p_outcome NOT IN ('sent', 'edited', 'dismissed') THEN
    RAISE EXCEPTION 'A draft is sent, edited or dismissed.' USING ERRCODE = '22023';
  END IF;
  UPDATE public.lead_ai_drafts SET outcome = p_outcome, decided_at = now() WHERE id = p_id AND outcome = 'pending';
END
$fn$;

REVOKE ALL ON FUNCTION public.lead_knowledge() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.lead_save_knowledge(uuid, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.lead_remove_knowledge(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.lead_personas() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.lead_save_persona(uuid, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.lead_ai_context(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.lead_ai_try_context(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.lead_ai_log_draft(uuid, text, jsonb, boolean, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.lead_ai_draft_outcome(bigint, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lead_knowledge() TO authenticated;
GRANT EXECUTE ON FUNCTION public.lead_save_knowledge(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.lead_remove_knowledge(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.lead_personas() TO authenticated;
GRANT EXECUTE ON FUNCTION public.lead_save_persona(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.lead_ai_context(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.lead_ai_try_context(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.lead_ai_log_draft(uuid, text, jsonb, boolean, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.lead_ai_draft_outcome(bigint, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
