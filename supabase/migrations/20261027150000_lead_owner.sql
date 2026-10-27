-- Lead View › each conversation's own CS (2026-10-27 — the user: "客服只看派给自己（或自己接手）的对话，Principal 看全部", then,
-- the same hour: "应该是客服可以看到所有回复（不管是不是指派给自己的，因为目前客服只有一人），可能可以加一个功能是当我在crm 加人，
-- 就可以指派"; .claude/rules/leads/lead-view.md › A CONVERSATION'S OWN CS).
--
-- Everybody with Lead View still sees every conversation; who handles one is a mark, for when there is more than one CS:
--   - lead_contacts.assigned_to (a login) / assigned_name / assigned_at: nobody at first.
--   - Taking: CS's first reply on a conversation nobody has makes it theirs (lead_reply, production's body md5 8ec9f900…
--     + one statement before its RETURN); somebody with Lead View · Manage (the Principal) replying takes nothing.
--   - Giving: lead_assign(contact, user) — Lead View · Manage (no page guard: no Inbox box stands for Manage, so the cell decides); NULL gives it back to nobody.
--     lead_agents() lists who may be given one: a login whose title's template, or their own ticks, give Lead View ›
--     Inbox's Create — so a new CS HR adds and ticks for Lead View is on the list at once.
--   - The card carries it (lead_contact_json, production's body md5 56e7cd62…, one key list swapped).

ALTER TABLE public.lead_contacts
  ADD COLUMN IF NOT EXISTS assigned_to uuid REFERENCES public.users(id),
  ADD COLUMN IF NOT EXISTS assigned_name text NOT NULL DEFAULT '' CHECK (length(assigned_name) <= 120),
  ADD COLUMN IF NOT EXISTS assigned_at timestamptz;
CREATE INDEX IF NOT EXISTS lead_contacts_assigned ON public.lead_contacts (assigned_to) WHERE assigned_to IS NOT NULL;

-- Taking: CS's first reply on a conversation nobody has (production's lead_reply, md5 8ec9f900…, + one statement).
DO $do$
DECLARE
  v_src text := (SELECT prosrc FROM pg_proc WHERE oid = 'public.lead_reply(uuid, text)'::regprocedure);
  v_old text := E'  RETURN v_id;\nEND';
  v_new text := E'  IF NOT public.has_any_action(ARRAY[''leads.manage'']) THEN\n'
             || E'    UPDATE public.lead_contacts SET assigned_to = auth.uid(), assigned_name = public.lead_actor_name(), assigned_at = now()\n'
             || E'     WHERE id = p_contact AND assigned_to IS NULL AND auth.uid() IS NOT NULL;\n'
             || E'    IF FOUND THEN\n'
             || E'      PERFORM public.lead_event(p_contact, ''Taken by '' || public.lead_actor_name());\n'
             || E'    END IF;\n'
             || E'  END IF;\n'
             || E'  RETURN v_id;\nEND';
BEGIN
  IF position('assigned_to = auth.uid()' IN v_src) > 0 THEN
    RETURN;
  END IF;
  IF (length(v_src) - length(replace(v_src, v_old, ''))) / length(v_old) <> 1 THEN
    RAISE EXCEPTION 'lead_reply: its RETURN is not there exactly once';
  END IF;
  EXECUTE replace(pg_get_functiondef('public.lead_reply(uuid, text)'::regprocedure), v_old, v_new);
END
$do$;

-- The card carries who handles it (production's lead_contact_json, md5 56e7cd62…, one key list swapped).
DO $do$
DECLARE
  v_sig regprocedure := 'public.lead_contact_json(public.lead_contacts)'::regprocedure;
  v_src text := (SELECT prosrc FROM pg_proc WHERE oid = 'public.lead_contact_json(public.lead_contacts)'::regprocedure);
  v_old text := $$'stageByName', c.stage_by_name, 'updatedAt', c.updated_at)$$;
  v_new text := $$'stageByName', c.stage_by_name, 'updatedAt', c.updated_at, 'assignedTo', c.assigned_to, 'assignedName', c.assigned_name, 'assignedAt', c.assigned_at)$$;
BEGIN
  IF position(v_new IN v_src) > 0 THEN
    RETURN;
  END IF;
  IF md5(v_src) IS DISTINCT FROM '56e7cd62d76740f60a7a3a37752e6b59' THEN
    RAISE EXCEPTION 'lead_contact_json: not the body this migration was written against (md5 %)', md5(v_src);
  END IF;
  IF (length(v_src) - length(replace(v_src, v_old, ''))) / length(v_old) <> 1 THEN
    RAISE EXCEPTION 'lead_contact_json: the key list is not there exactly once';
  END IF;
  EXECUTE replace(pg_get_functiondef(v_sig), v_old, v_new);
END
$do$;

-- Who may be given a conversation: a login whose title's template ticks Lead View › Inbox's Create, or whose own ticks
-- do (a person's own "no" wins), still active.
CREATE OR REPLACE FUNCTION public.lead_agents()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  PERFORM public.lead_need(ARRAY['leads.manage'], 'Giving a conversation to somebody needs Lead View · Manage.');
  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object('id', u.id, 'name', coalesce(nullif(btrim(u.name), ''), u.email)) ORDER BY coalesce(nullif(btrim(u.name), ''), u.email))
      FROM public.users u
     WHERE u.is_active
       AND NOT EXISTS (SELECT 1 FROM public.user_permission_tabs p WHERE p.user_id = u.id AND p.tab_id = 'lead.inbox' AND p.action = 'create' AND NOT p.granted)
       AND (EXISTS (SELECT 1 FROM public.user_permission_tabs p WHERE p.user_id = u.id AND p.tab_id = 'lead.inbox' AND p.action = 'create' AND p.granted)
            OR EXISTS (SELECT 1 FROM public.hr_staff_costs h JOIN public.titles t ON t.id = h.title_id
                         JOIN public.permission_template_tabs tt ON tt.template_id = t.template_id
                        WHERE h.user_id = u.id AND h.status = 'active' AND tt.tab_id = 'lead.inbox' AND tt.action = 'create'))), '[]'::jsonb);
END
$fn$;

-- Giving a conversation (Lead View · Manage). NULL = back to nobody.
CREATE OR REPLACE FUNCTION public.lead_assign(p_contact uuid, p_user uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_name text := '';
BEGIN
  PERFORM public.lead_need(ARRAY['leads.manage'], 'Giving a conversation to somebody needs Lead View · Manage.');
  PERFORM 1 FROM public.lead_contacts WHERE id = p_contact FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That conversation is gone.' USING ERRCODE = 'P0002';
  END IF;
  IF p_user IS NOT NULL THEN
    SELECT left(coalesce(nullif(btrim(name), ''), email), 120) INTO v_name FROM public.users WHERE id = p_user AND is_active;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'That person cannot be given a conversation.' USING ERRCODE = '22023';
    END IF;
  END IF;
  UPDATE public.lead_contacts
     SET assigned_to = p_user, assigned_name = coalesce(v_name, ''), assigned_at = CASE WHEN p_user IS NULL THEN NULL ELSE now() END, updated_at = now()
   WHERE id = p_contact;
  PERFORM public.lead_event(p_contact, CASE WHEN p_user IS NULL THEN 'Given back to nobody' ELSE 'Given to ' || v_name END);
END
$fn$;

REVOKE ALL ON FUNCTION public.lead_agents() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.lead_assign(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lead_agents(), public.lead_assign(uuid, uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
