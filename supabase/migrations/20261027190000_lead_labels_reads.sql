-- Lead View › customer labels and read ticks (2026-10-27 — the user: "是否可以label 客户？比方说待考量之类的" with Meta's
-- lead stages, and "聊天室是否能做到已读功能（像WA会蓝色双勾）"; .claude/rules/leads/lead-view.md › LABELS AND READ TICKS).
--
-- Labels:
--   - lead_labels: Customer Service's own list (name, tone, order; soft-deleted) — seeded with Meta's five lead stages.
--   - lead_contact_labels: a conversation's labels, any number of them.
--   - lead_labels() (Lead View · View) reads the list; lead_save_labels(p_labels) (Lead View · Manage — no page guard:
--     no Inbox box stands for Manage, so the cell decides, as lead_assign) saves it whole; lead_set_labels(contact,
--     ids) (Lead View · Edit + the Inbox's page guard, mig 20261027190100) sets a conversation's.
-- Read ticks:
--   - lead_contacts.customer_delivered_at / customer_read_at: Meta's message_deliveries (the mids delivered) and
--     message_reads (a watermark) for the brands' Pages — both already subscribed — kept by lead_ingest_receipts (the
--     service role's alone). Every message out at or before the time shows delivered / read.
-- The card carries both (lead_contact_json, PRODUCTION's body md5 5c672055…, its key list swapped once).

CREATE TABLE IF NOT EXISTS public.lead_labels (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 40),
  tone       text NOT NULL DEFAULT 'grey' CHECK (tone IN ('grey', 'amber', 'green', 'red', 'clay', 'blue')),
  sort_order integer NOT NULL DEFAULT 0,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.lead_contact_labels (
  contact_id    uuid NOT NULL REFERENCES public.lead_contacts(id) ON DELETE CASCADE,
  label_id      uuid NOT NULL REFERENCES public.lead_labels(id),
  added_at      timestamptz NOT NULL DEFAULT now(),
  added_by_name text NOT NULL DEFAULT '',
  PRIMARY KEY (contact_id, label_id)
);
ALTER TABLE public.lead_labels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_contact_labels ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.lead_labels, public.lead_contact_labels FROM PUBLIC, anon, authenticated;
SELECT public.audit_register('lead_labels', 'Lead View labels', 'Member services', '{leads}', 'all', p_labels => '{name}');
SELECT public.audit_register('lead_contact_labels', 'Lead View customer labels', 'Member services', '{leads}', 'all');

INSERT INTO public.lead_labels (name, tone, sort_order)
SELECT v.name, v.tone, v.n FROM (VALUES ('Considering', 'amber', 1), ('Qualified', 'green', 2), ('Converted', 'blue', 3),
                                        ('Lost', 'grey', 4), ('Not qualified', 'red', 5)) v(name, tone, n)
 WHERE NOT EXISTS (SELECT 1 FROM public.lead_labels);

ALTER TABLE public.lead_contacts
  ADD COLUMN IF NOT EXISTS customer_delivered_at timestamptz,
  ADD COLUMN IF NOT EXISTS customer_read_at timestamptz;

CREATE OR REPLACE FUNCTION public.lead_labels()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  PERFORM public.lead_need(ARRAY['leads.view'], 'Lead View needs Lead View · View.');
  RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('id', l.id, 'name', l.name, 'tone', l.tone,
                     'used', (SELECT count(*) FROM public.lead_contact_labels cl WHERE cl.label_id = l.id)) ORDER BY l.sort_order, l.name)
                     FROM public.lead_labels l WHERE l.deleted_at IS NULL), '[]'::jsonb);
END
$fn$;

-- The list, saved whole: [{id?, name, tone}] in order. A label left out is deleted (and taken off every customer).
CREATE OR REPLACE FUNCTION public.lead_save_labels(p_labels jsonb)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  l jsonb;
  n integer := 0;
  v_keep uuid[] := '{}';
  v_id uuid;
BEGIN
  PERFORM public.lead_need(ARRAY['leads.manage'], 'Changing the labels needs Lead View · Manage.');
  IF jsonb_typeof(coalesce(p_labels, '[]'::jsonb)) <> 'array' OR jsonb_array_length(coalesce(p_labels, '[]'::jsonb)) > 30 THEN
    RAISE EXCEPTION 'Up to 30 labels.' USING ERRCODE = '22023';
  END IF;
  FOR l IN SELECT * FROM jsonb_array_elements(coalesce(p_labels, '[]'::jsonb)) LOOP
    n := n + 1;
    IF length(btrim(coalesce(l->>'name', ''))) NOT BETWEEN 1 AND 40 THEN
      RAISE EXCEPTION 'A label needs a name of 40 characters at most.' USING ERRCODE = '22023';
    END IF;
    v_id := CASE WHEN coalesce(l->>'id', '') ~ '^[0-9a-f-]{36}$' THEN (l->>'id')::uuid END;
    IF v_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.lead_labels WHERE id = v_id AND deleted_at IS NULL) THEN
      UPDATE public.lead_labels SET name = btrim(l->>'name'), tone = coalesce(nullif(l->>'tone', ''), 'grey'), sort_order = n, updated_at = now()
       WHERE id = v_id AND (name, tone, sort_order) IS DISTINCT FROM (btrim(l->>'name'), coalesce(nullif(l->>'tone', ''), 'grey'), n);
    ELSE
      INSERT INTO public.lead_labels (name, tone, sort_order) VALUES (btrim(l->>'name'), coalesce(nullif(l->>'tone', ''), 'grey'), n)
      RETURNING id INTO v_id;
    END IF;
    v_keep := v_keep || v_id;
  END LOOP;
  DELETE FROM public.lead_contact_labels WHERE label_id IN (SELECT id FROM public.lead_labels WHERE deleted_at IS NULL AND id <> ALL (v_keep));
  UPDATE public.lead_labels SET deleted_at = now(), updated_at = now() WHERE deleted_at IS NULL AND id <> ALL (v_keep);
END
$fn$;

-- A conversation's labels, set whole.
CREATE OR REPLACE FUNCTION public.lead_set_labels(p_contact uuid, p_labels uuid[])
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_old text;
  v_new text;
BEGIN
  PERFORM public.lead_need(ARRAY['leads.edit'], 'Labelling a customer needs Lead View · Edit.');
  PERFORM 1 FROM public.lead_contacts WHERE id = p_contact FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That conversation is gone.' USING ERRCODE = 'P0002';
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(coalesce(p_labels, '{}')) x WHERE NOT EXISTS (SELECT 1 FROM public.lead_labels WHERE id = x AND deleted_at IS NULL)) THEN
    RAISE EXCEPTION 'That label is gone — open the conversation again.' USING ERRCODE = '22023';
  END IF;
  SELECT string_agg(l.name, ', ' ORDER BY l.sort_order) INTO v_old FROM public.lead_contact_labels cl JOIN public.lead_labels l ON l.id = cl.label_id WHERE cl.contact_id = p_contact;
  DELETE FROM public.lead_contact_labels WHERE contact_id = p_contact AND label_id <> ALL (coalesce(p_labels, '{}'));
  INSERT INTO public.lead_contact_labels (contact_id, label_id, added_by_name)
  SELECT p_contact, x, public.lead_actor_name() FROM unnest(coalesce(p_labels, '{}')) x
  ON CONFLICT DO NOTHING;
  SELECT string_agg(l.name, ', ' ORDER BY l.sort_order) INTO v_new FROM public.lead_contact_labels cl JOIN public.lead_labels l ON l.id = cl.label_id WHERE cl.contact_id = p_contact;
  IF v_old IS DISTINCT FROM v_new THEN
    UPDATE public.lead_contacts SET updated_at = now() WHERE id = p_contact;
    PERFORM public.lead_event(p_contact, CASE WHEN v_new IS NULL THEN 'Labels cleared' ELSE 'Labelled ' || v_new END);
  END IF;
END
$fn$;

-- Meta's receipts for the brands' Pages: {delivered: [{externalId}], reads: [{pageId, psid, watermark}]}.
CREATE OR REPLACE FUNCTION public.lead_ingest_receipts(p_receipts jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_delivered integer := 0;
  v_read integer := 0;
BEGIN
  WITH d AS (
    SELECT m.contact_id, max(m.created_at) AS at
      FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_receipts->'delivered') = 'array' THEN p_receipts->'delivered' ELSE '[]'::jsonb END) x
      JOIN public.lead_messages m ON m.external_id = x->>'externalId' AND m.direction = 'out'
     GROUP BY m.contact_id)
  UPDATE public.lead_contacts c SET customer_delivered_at = greatest(c.customer_delivered_at, d.at)
    FROM d WHERE c.id = d.contact_id AND c.customer_delivered_at IS DISTINCT FROM greatest(c.customer_delivered_at, d.at);
  GET DIAGNOSTICS v_delivered = ROW_COUNT;
  WITH r AS (
    SELECT x->>'pageId' AS page_id, x->>'psid' AS psid, max((x->>'watermark')::timestamptz) AS at
      FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_receipts->'reads') = 'array' THEN p_receipts->'reads' ELSE '[]'::jsonb END) x
     WHERE coalesce(x->>'watermark', '') <> ''
     GROUP BY 1, 2)
  UPDATE public.lead_contacts c SET customer_read_at = greatest(c.customer_read_at, r.at),
                                    customer_delivered_at = greatest(c.customer_delivered_at, r.at)
    FROM r WHERE c.channel = 'messenger' AND c.page_id = r.page_id AND c.external_id = r.psid
     AND c.customer_read_at IS DISTINCT FROM greatest(c.customer_read_at, r.at);
  GET DIAGNOSTICS v_read = ROW_COUNT;
  RETURN jsonb_build_object('delivered', v_delivered, 'read', v_read);
END
$fn$;

REVOKE ALL ON FUNCTION public.lead_labels(), public.lead_save_labels(jsonb), public.lead_set_labels(uuid, uuid[]), public.lead_ingest_receipts(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.lead_ingest_receipts(jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.lead_labels(), public.lead_save_labels(jsonb), public.lead_set_labels(uuid, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.lead_ingest_receipts(jsonb) TO service_role;

-- The card carries the labels and the receipts (production's lead_contact_json, md5 5c672055…, one key list swapped).
DO $do$
DECLARE
  v_sig regprocedure := 'public.lead_contact_json(public.lead_contacts)'::regprocedure;
  v_src text := (SELECT prosrc FROM pg_proc WHERE oid = 'public.lead_contact_json(public.lead_contacts)'::regprocedure);
  v_old text := $$'assignedTo', c.assigned_to, 'assignedName', c.assigned_name, 'assignedAt', c.assigned_at)$$;
  v_new text := $$'assignedTo', c.assigned_to, 'assignedName', c.assigned_name, 'assignedAt', c.assigned_at,
      'deliveredAt', c.customer_delivered_at, 'readAt', c.customer_read_at,
      'labels', coalesce((SELECT jsonb_agg(jsonb_build_object('id', l.id, 'name', l.name, 'tone', l.tone) ORDER BY l.sort_order, l.name)
                            FROM public.lead_contact_labels cl JOIN public.lead_labels l ON l.id = cl.label_id AND l.deleted_at IS NULL
                           WHERE cl.contact_id = c.id), '[]'::jsonb))$$;
BEGIN
  IF position('customer_read_at' IN v_src) > 0 THEN
    RETURN;
  END IF;
  IF md5(v_src) IS DISTINCT FROM '5c67205569ebe4e6f5ca7381b6ac89c2' THEN
    RAISE EXCEPTION 'lead_contact_json: not the body this migration was written against (md5 %) — compare it with production first', md5(v_src);
  END IF;
  IF (length(v_src) - length(replace(v_src, v_old, ''))) / length(v_old) <> 1 THEN
    RAISE EXCEPTION 'lead_contact_json: the key list is not there exactly once';
  END IF;
  EXECUTE replace(pg_get_functiondef(v_sig), v_old, v_new);
END
$do$;

NOTIFY pgrst, 'reload schema';
