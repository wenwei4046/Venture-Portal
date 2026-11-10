-- Lead View v3 › AI Agent (2026-11-10 — the handoff docs/design_handoff_lead_view_v3 § 5; the user: "Yes, build it" to
-- the plan: How to reach the goal, Also hand over when, Knowledge's read line and per-question instructions, Outlets,
-- Memory in four parts, and every source fed to the AI in the order How it learns sets).
--
-- What lives in the brand's settings (lead_personas.settings, saved as before): howGoal, handNote, the reading order
-- and its switches, the custom sources, the learning direction and How it learns. What gets tables:
--
--   lead_ai_memory          one line the AI keeps in mind: fixed (Fixed memory), collected (Collected: to review /
--                           in use / off, 👍 👎), goal (From goal results' lines), outlet (Knowledge › Outlets, one
--                           outlet's chats only)
--   lead_ai_memory_uses     which conversations a line was used in (a draft sent or edited, or the AI's own answer) —
--                           the "58% reached · 212 chats" figures
--   lead_ai_file_questions  Knowledge › ASKED ABOUT: a question per file or folder, the instruction for it, and the
--                           questions people added
--   lead_ai_suggestions     From goal results' suggestions (change line N / add a line / add for an outlet) — written
--                           by the learning run, which is not built yet; decided on the page
--
-- REACHED THE GOAL (the user's yes to the plan): a conversation counts once the AI's line was used in it; it reached
-- the goal when the customer gave a phone or booked an appointment within 7 days of that first use; it counts in the
-- rate once it reached the goal or the 7 days are over. A line shows its rate from How it learns' Minimum chats (5).
--
-- lead_ai_more and lead_save_ai are PRODUCTION's bodies (md5 93242106… / 4de5189e…), one swap each, exactly once.

CREATE TABLE IF NOT EXISTS public.lead_ai_memory (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id      uuid NOT NULL REFERENCES public.lead_brands(id) ON DELETE CASCADE,
  kind          text NOT NULL CHECK (kind IN ('fixed', 'collected', 'goal', 'outlet')),
  outlet_id     uuid REFERENCES public.lead_outlets(id) ON DELETE CASCADE,
  body          text NOT NULL CHECK (length(body) BETWEEN 1 AND 1000),
  status        text NOT NULL DEFAULT 'on' CHECK (status IN ('review', 'on', 'off')),
  dir           text CHECK (dir IN ('up', 'down')),
  source        text NOT NULL DEFAULT '',
  cases         integer NOT NULL DEFAULT 0,
  sort_order    integer NOT NULL DEFAULT 0,
  added_by_name text NOT NULL DEFAULT '',
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  last_used_at  timestamptz,
  CHECK ((kind = 'outlet') = (outlet_id IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS lead_ai_memory_brand ON public.lead_ai_memory (brand_id, kind, sort_order);

CREATE TABLE IF NOT EXISTS public.lead_ai_memory_uses (
  memory_id  uuid NOT NULL REFERENCES public.lead_ai_memory(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES public.lead_contacts(id) ON DELETE CASCADE,
  first_at   timestamptz NOT NULL DEFAULT now(),
  last_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (memory_id, contact_id)
);

CREATE TABLE IF NOT EXISTS public.lead_ai_file_questions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id    uuid NOT NULL REFERENCES public.lead_brands(id) ON DELETE CASCADE,
  kind        text NOT NULL CHECK (kind IN ('file', 'folder')),
  ref         uuid NOT NULL,
  question    text NOT NULL CHECK (length(question) BETWEEN 1 AND 300),
  instruction text NOT NULL DEFAULT '' CHECK (length(instruction) <= 1000),
  custom      boolean NOT NULL DEFAULT false,
  sort_order  integer NOT NULL DEFAULT 0,
  updated_by_name text NOT NULL DEFAULT '',
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (brand_id, kind, ref, question)
);

CREATE TABLE IF NOT EXISTS public.lead_ai_suggestions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id    uuid NOT NULL REFERENCES public.lead_brands(id) ON DELETE CASCADE,
  kind        text NOT NULL CHECK (kind IN ('edit', 'add', 'outlet')),
  memory_id   uuid REFERENCES public.lead_ai_memory(id) ON DELETE CASCADE,
  outlet_id   uuid REFERENCES public.lead_outlets(id) ON DELETE CASCADE,
  body        text NOT NULL CHECK (length(body) BETWEEN 1 AND 1000),
  why         text NOT NULL DEFAULT '',
  chats       integer NOT NULL DEFAULT 0,
  status      text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'used', 'dismissed')),
  decided_by_name text NOT NULL DEFAULT '',
  decided_at  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.lead_ai_memory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_ai_memory_uses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_ai_file_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_ai_suggestions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.lead_ai_memory, public.lead_ai_memory_uses, public.lead_ai_file_questions, public.lead_ai_suggestions
  FROM PUBLIC, anon, authenticated;
SELECT public.audit_register('lead_ai_memory', 'Lead View AI memory', 'Member services', '{leads}', 'all', p_labels => '{body}');
SELECT public.audit_register('lead_ai_file_questions', 'Lead View AI file questions', 'Member services', '{leads}', 'all', p_labels => '{question}');
SELECT public.audit_register('lead_ai_suggestions', 'Lead View AI suggestions', 'Member services', '{leads}', 'all', p_labels => '{body}');
SELECT public.audit_register('lead_ai_memory_uses', 'Lead View AI memory uses', 'Member services', '{}', 'none',
  p_reason => 'A counter of which conversations a memory line was used in; the conversations keep their own timeline.');

-- A draft sent as written or edited counts as a use of every memory line it named (`mem-<id>` in its `used`).
CREATE OR REPLACE FUNCTION public.lead_ai_memory_from_draft()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF jsonb_typeof(NEW.used) = 'array' THEN
    INSERT INTO public.lead_ai_memory_uses AS u (memory_id, contact_id)
    SELECT DISTINCT m.id, NEW.contact_id
      FROM jsonb_array_elements(NEW.used) e
      JOIN public.lead_ai_memory m ON 'mem-' || m.id::text = e->>'id'
    ON CONFLICT (memory_id, contact_id) DO UPDATE SET last_at = now();
    UPDATE public.lead_ai_memory m SET last_used_at = now()
     WHERE EXISTS (SELECT 1 FROM jsonb_array_elements(NEW.used) e WHERE e->>'id' = 'mem-' || m.id::text);
  END IF;
  RETURN NEW;
END
$$;
REVOKE ALL ON FUNCTION public.lead_ai_memory_from_draft() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS lead_ai_drafts_memory ON public.lead_ai_drafts;
CREATE TRIGGER lead_ai_drafts_memory AFTER UPDATE OF outcome ON public.lead_ai_drafts
  FOR EACH ROW WHEN (NEW.outcome IN ('sent', 'edited') AND OLD.outcome IS DISTINCT FROM NEW.outcome)
  EXECUTE FUNCTION public.lead_ai_memory_from_draft();

-- The AI's own answer (the webhook, or a person handing a chat to the AI): the lines it named.
CREATE OR REPLACE FUNCTION public.lead_ai_memory_used(p_contact uuid, p_ids uuid[])
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.lead_need(ARRAY['leads.create', 'leads.manage'], 'The AI Agent''s answer needs Lead View · Create.');
  INSERT INTO public.lead_ai_memory_uses AS u (memory_id, contact_id)
  SELECT m.id, c.id FROM public.lead_contacts c
    JOIN public.lead_ai_memory m ON m.brand_id = c.brand_id AND m.id = ANY (coalesce(p_ids, '{}'))
   WHERE c.id = p_contact
  ON CONFLICT (memory_id, contact_id) DO UPDATE SET last_at = now();
  UPDATE public.lead_ai_memory SET last_used_at = now() WHERE id = ANY (coalesce(p_ids, '{}'));
END
$$;
REVOKE ALL ON FUNCTION public.lead_ai_memory_used(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lead_ai_memory_used(uuid, uuid[]) TO authenticated, service_role;

-- Earlier chats with this customer: the other conversations with the same phone (other pages and brands too, inside
-- the caller's brands), the last 12 messages of each, three conversations at most.
CREATE OR REPLACE FUNCTION public.lead_ai_earlier(p_contact uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_phone text;
BEGIN
  PERFORM public.lead_need(ARRAY['leads.view'], 'Lead View needs Lead View · View.');
  SELECT nullif(btrim(c.phone), '') INTO v_phone FROM public.lead_contacts c WHERE c.id = p_contact;
  IF v_phone IS NULL THEN RETURN '[]'::jsonb; END IF;
  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object('brand', b.name, 'channel', o.channel, 'lastAt', o.last_at,
             'messages', coalesce((SELECT jsonb_agg(jsonb_build_object('in', m.direction = 'in', 'body', left(m.body, 500)) ORDER BY m.created_at)
                                     FROM (SELECT * FROM public.lead_messages x WHERE x.contact_id = o.id ORDER BY x.created_at DESC LIMIT 12) m), '[]'::jsonb))
           ORDER BY o.last_at DESC)
      FROM (SELECT * FROM public.lead_contacts c
             WHERE c.id <> p_contact AND c.phone = v_phone
               AND (public.lead_my_brands() IS NULL OR c.brand_id = ANY (public.lead_my_brands()))
             ORDER BY c.last_at DESC LIMIT 3) o
      JOIN public.lead_brands b ON b.id = o.brand_id), '[]'::jsonb);
END
$$;
REVOKE ALL ON FUNCTION public.lead_ai_earlier(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lead_ai_earlier(uuid) TO authenticated, service_role;

-- What lead_ai_more adds: the memory with each line's figures, the file questions, the open suggestions, and what
-- customers asked when the AI used a file (the last 30 days, three per file).
CREATE OR REPLACE FUNCTION public.lead_ai_memory_json(p_brand uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_forget integer;
BEGIN
  SELECT CASE p.settings->'learn'->>'forget' WHEN '30' THEN 30 WHEN '90' THEN 90 END INTO v_forget
    FROM public.lead_personas p WHERE p.brand_id = p_brand;
  RETURN jsonb_build_object(
    'memory', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', m.id, 'kind', m.kind, 'outletId', m.outlet_id, 'body', m.body,
               -- Forget unused lessons: a collected line in use but unused for the days set reads as off.
               'status', CASE WHEN m.kind = 'collected' AND m.status = 'on' AND v_forget IS NOT NULL
                                   AND coalesce(m.last_used_at, m.updated_at) < now() - make_interval(days => v_forget) THEN 'off' ELSE m.status END,
               'dir', m.dir, 'source', m.source, 'cases', m.cases, 'addedByName', m.added_by_name, 'createdAt', m.created_at,
               'chats', coalesce(s.chats, 0), 'reached', coalesce(s.reached, 0))
             ORDER BY m.kind, m.sort_order, m.created_at)
        FROM public.lead_ai_memory m
        LEFT JOIN (
          SELECT x.memory_id, count(*) FILTER (WHERE x.ok OR x.first_at < now() - interval '7 days') AS chats, count(*) FILTER (WHERE x.ok) AS reached
            FROM (SELECT u.memory_id, u.first_at,
                         coalesce(c.phone_at BETWEEN u.first_at AND u.first_at + interval '7 days', false)
                         OR coalesce(c.appt_at BETWEEN u.first_at AND u.first_at + interval '7 days', false) AS ok
                    FROM public.lead_ai_memory_uses u JOIN public.lead_contacts c ON c.id = u.contact_id) x
           GROUP BY x.memory_id) s ON s.memory_id = m.id
       WHERE m.brand_id = p_brand), '[]'::jsonb),
    'fileQs', coalesce((
      SELECT jsonb_agg(jsonb_build_object('kind', q.kind, 'ref', q.ref, 'question', q.question, 'instruction', q.instruction, 'custom', q.custom)
             ORDER BY q.sort_order, q.question)
        FROM public.lead_ai_file_questions q WHERE q.brand_id = p_brand), '[]'::jsonb),
    'suggestions', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', g.id, 'kind', g.kind, 'memoryId', g.memory_id, 'outletId', g.outlet_id, 'body', g.body,
               'why', g.why, 'chats', g.chats) ORDER BY g.created_at)
        FROM public.lead_ai_suggestions g WHERE g.brand_id = p_brand AND g.status = 'open'), '[]'::jsonb),
    'asked', coalesce((
      SELECT jsonb_object_agg(a.file_id, a.qs) FROM (
        SELECT y.file_id, jsonb_agg(y.q ORDER BY y.at DESC) AS qs FROM (
          SELECT DISTINCT ON (z.file_id, lower(z.q)) z.file_id, z.q, z.at FROM (
            SELECT substr(e->>'id', 6) AS file_id, d.created_at AS at,
                   (SELECT left(btrim(m.body), 160) FROM public.lead_messages m
                     WHERE m.contact_id = d.contact_id AND m.direction = 'in' AND m.created_at <= d.created_at
                     ORDER BY m.created_at DESC LIMIT 1) AS q
              FROM public.lead_ai_drafts d
              JOIN public.lead_contacts c ON c.id = d.contact_id AND c.brand_id = p_brand
              CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(d.used) = 'array' THEN d.used ELSE '[]'::jsonb END) e
             WHERE d.created_at > now() - interval '30 days' AND e->>'id' LIKE 'file-%') z
           WHERE coalesce(z.q, '') <> ''
           ORDER BY z.file_id, lower(z.q), z.at DESC) y
         GROUP BY y.file_id) a), '{}'::jsonb));
END
$$;
REVOKE ALL ON FUNCTION public.lead_ai_memory_json(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lead_ai_memory_json(uuid) TO service_role;

-- What lead_save_ai saves besides: the memory, the file questions and the suggestions decided — each only when sent.
CREATE OR REPLACE FUNCTION public.lead_save_ai_memory(p_brand uuid, p_data jsonb, p_actor text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  r jsonb;
  v_ord integer := 0;
  v_keep uuid[] := '{}';
  v_id uuid;
  v_kind text;
  v_outlet uuid;
  v_body text;
BEGIN
  IF p_data ? 'memory' THEN
    IF jsonb_typeof(p_data->'memory') <> 'array' OR jsonb_array_length(p_data->'memory') > 500 THEN
      RAISE EXCEPTION 'The agent''s memory is not in the right shape.' USING ERRCODE = '22023';
    END IF;
    FOR r IN SELECT * FROM jsonb_array_elements(p_data->'memory') LOOP
      v_body := left(btrim(coalesce(r->>'body', '')), 1000);
      CONTINUE WHEN v_body = '';  -- an empty line just added is not kept
      v_ord := v_ord + 1;
      v_kind := r->>'kind';
      IF v_kind IS NULL OR v_kind NOT IN ('fixed', 'collected', 'goal', 'outlet') THEN
        RAISE EXCEPTION 'A memory line is fixed, collected, from goal results or an outlet''s.' USING ERRCODE = '22023';
      END IF;
      v_outlet := CASE WHEN v_kind = 'outlet' AND r->>'outletId' ~ '^[0-9a-f-]{36}$' THEN (r->>'outletId')::uuid END;
      IF v_kind = 'outlet' AND NOT EXISTS (SELECT 1 FROM public.lead_outlets o WHERE o.id = v_outlet AND o.brand_id = p_brand AND o.deleted_at IS NULL) THEN
        RAISE EXCEPTION 'An outlet line needs one of this brand''s outlets.' USING ERRCODE = '22023';
      END IF;
      v_id := CASE WHEN r->>'id' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN (r->>'id')::uuid END;
      IF v_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.lead_ai_memory WHERE id = v_id AND brand_id = p_brand) THEN
        UPDATE public.lead_ai_memory m
           SET kind = v_kind, outlet_id = v_outlet, body = v_body, sort_order = v_ord,
               status = CASE WHEN v_kind = 'collected' AND r->>'status' IN ('review', 'on', 'off') THEN r->>'status' WHEN v_kind = 'collected' THEN m.status ELSE 'on' END,
               dir = CASE WHEN v_kind = 'collected' AND r->>'dir' IN ('up', 'down') THEN r->>'dir' END,
               -- Make fixed: the line keeps where it came from, now one of the people's.
               added_by_name = CASE WHEN m.kind = 'collected' AND v_kind = 'fixed' THEN p_actor ELSE m.added_by_name END,
               updated_at = now()
         WHERE m.id = v_id
           AND (m.kind, m.outlet_id, m.body, m.sort_order, m.status, m.dir)
               IS DISTINCT FROM (v_kind, v_outlet, v_body, v_ord,
                                 CASE WHEN v_kind = 'collected' AND r->>'status' IN ('review', 'on', 'off') THEN r->>'status' WHEN v_kind = 'collected' THEN m.status ELSE 'on' END,
                                 CASE WHEN v_kind = 'collected' AND r->>'dir' IN ('up', 'down') THEN r->>'dir' END);
        IF NOT FOUND AND NOT EXISTS (SELECT 1 FROM public.lead_ai_memory WHERE id = v_id) THEN
          RAISE EXCEPTION 'A memory line went missing.' USING ERRCODE = 'P0002';
        END IF;
      ELSE
        IF v_kind = 'collected' THEN
          RAISE EXCEPTION 'Collected lessons come from the AI''s learning, not from the page.' USING ERRCODE = '22023';
        END IF;
        INSERT INTO public.lead_ai_memory (brand_id, kind, outlet_id, body, status, sort_order, added_by_name)
        VALUES (p_brand, v_kind, v_outlet, v_body, 'on', v_ord, p_actor)
        RETURNING id INTO v_id;
      END IF;
      v_keep := v_keep || v_id;
    END LOOP;
    DELETE FROM public.lead_ai_memory WHERE brand_id = p_brand AND NOT id = ANY (v_keep);
  END IF;

  IF p_data ? 'fileQs' THEN
    IF jsonb_typeof(p_data->'fileQs') <> 'array' OR jsonb_array_length(p_data->'fileQs') > 1000 THEN
      RAISE EXCEPTION 'The questions are not in the right shape.' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_data->'fileQs') x
                WHERE NOT (x->>'kind' IN ('file', 'folder') AND x->>'ref' ~ '^[0-9a-f-]{36}$'
                           AND btrim(coalesce(x->>'question', '')) <> '')) THEN
      RAISE EXCEPTION 'A question needs its file or folder and its words.' USING ERRCODE = '22023';
    END IF;
    DELETE FROM public.lead_ai_file_questions q WHERE q.brand_id = p_brand
       AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_data->'fileQs') x
                        WHERE x->>'kind' = q.kind AND x->>'ref' = q.ref::text AND left(btrim(x->>'question'), 300) = q.question);
    INSERT INTO public.lead_ai_file_questions AS q (brand_id, kind, ref, question, instruction, custom, sort_order, updated_by_name)
    SELECT DISTINCT ON (x->>'kind', x->>'ref', left(btrim(x->>'question'), 300))
           p_brand, x->>'kind', (x->>'ref')::uuid, left(btrim(x->>'question'), 300), left(btrim(coalesce(x->>'instruction', '')), 1000),
           coalesce((x->>'custom')::boolean, false), (o.n)::integer, p_actor
      FROM jsonb_array_elements(p_data->'fileQs') WITH ORDINALITY o(x, n)
    ON CONFLICT (brand_id, kind, ref, question) DO UPDATE
      SET instruction = EXCLUDED.instruction, custom = EXCLUDED.custom, sort_order = EXCLUDED.sort_order,
          updated_by_name = EXCLUDED.updated_by_name, updated_at = now()
      WHERE (q.instruction, q.custom, q.sort_order) IS DISTINCT FROM (EXCLUDED.instruction, EXCLUDED.custom, EXCLUDED.sort_order);
    -- Questions with no instruction are only kept when somebody added them.
    DELETE FROM public.lead_ai_file_questions WHERE brand_id = p_brand AND instruction = '' AND NOT custom;
  END IF;

  IF p_data ? 'suggestions' AND jsonb_typeof(p_data->'suggestions') = 'array' THEN
    UPDATE public.lead_ai_suggestions g SET status = x->>'status', decided_by_name = p_actor, decided_at = now()
      FROM jsonb_array_elements(p_data->'suggestions') x
     WHERE g.brand_id = p_brand AND g.status = 'open' AND g.id::text = x->>'id' AND x->>'status' IN ('used', 'dismissed');
  END IF;
END
$$;
REVOKE ALL ON FUNCTION public.lead_save_ai_memory(uuid, jsonb, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lead_save_ai_memory(uuid, jsonb, text) TO service_role;

DO $do$
DECLARE
  v_swaps text[][] := ARRAY[
    ARRAY['public.lead_ai_more(uuid)', '93242106c51b7c0abc4d4e6dde570219',
          $$k.brand_id = p_brand), '[]'::jsonb));$$,
          $$k.brand_id = p_brand), '[]'::jsonb)) || public.lead_ai_memory_json(p_brand);  -- memory, questions, suggestions (mig 20261110230000)$$],
    ARRAY['public.lead_save_ai(uuid,jsonb)', '4de5189e9f39e00c9cf1baaf790ee68d',
          $$WHERE k.paused IS DISTINCT FROM EXCLUDED.paused;
  END IF;$$,
          $$WHERE k.paused IS DISTINCT FROM EXCLUDED.paused;
  END IF;
  PERFORM public.lead_save_ai_memory(p_brand, p_data, v_actor);  -- memory, questions, suggestions (mig 20261110230000)$$]];
  i int;
  v_sig regprocedure;
  v_src text;
  v_def text;
BEGIN
  FOR i IN 1 .. array_length(v_swaps, 1) LOOP
    v_sig := v_swaps[i][1]::regprocedure;
    SELECT prosrc INTO v_src FROM pg_proc WHERE oid = v_sig;
    IF position('mig 20261110230000' IN v_src) > 0 THEN
      CONTINUE;
    END IF;
    IF md5(v_src) IS DISTINCT FROM v_swaps[i][2] THEN
      RAISE EXCEPTION '%: not the body this migration was written against (md5 %) — compare it with production first', v_sig, md5(v_src);
    END IF;
    v_def := pg_get_functiondef(v_sig);
    IF (length(v_def) - length(replace(v_def, v_swaps[i][3], ''))) / length(v_swaps[i][3]) <> 1 THEN
      RAISE EXCEPTION '%: the text to swap is not there exactly once', v_sig;
    END IF;
    EXECUTE replace(v_def, v_swaps[i][3], v_swaps[i][4]);
  END LOOP;
END
$do$;

NOTIFY pgrst, 'reload schema';
