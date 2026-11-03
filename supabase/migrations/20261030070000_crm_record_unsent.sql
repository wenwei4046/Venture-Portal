-- CRM › a reply past the reply window is kept in the chat, not sent (2026-10-30 — the owner: "crm 改成lead view的做法",
-- quoting Lead View's: the salesperson can still type and send; the message is kept in the chat only, and under it
-- "Saved but not sent: More than 24 hours since the customer's last message …"). .claude/rules/revenue/crm.md ›
-- A REPLY PAST THE WINDOW IS KEPT, NOT SENT.
--
-- crm_record_out keeps a message Meta took (its id, then "sent"), and counts it as our reply (last_reply_at, New →
-- Follow up, unread 0). A message Meta was never sent has no id and is no reply: crm_record_unsent keeps it as ours,
-- status 'failed' with the reason, and leaves the customer's row alone. The same check as crm_record_out
-- (crm_can_reply); a file is given to it afterwards by crm_set_out_media, as to a sent one.

CREATE OR REPLACE FUNCTION public.crm_record_unsent(p_contact uuid, p_kind text, p_body text, p_error text, p_reply_to uuid DEFAULT NULL::uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_me  uuid := crm_me();
  v_row crm_messages;
begin
  if not crm_can_reply(p_contact) then raise exception 'You may not reply to this customer.' using errcode = '42501'; end if;
  if coalesce(trim(p_body), '') = '' or coalesce(trim(p_error), '') = '' then
    raise exception 'A message kept unsent needs its text and why.' using errcode = '22023';
  end if;
  if p_kind not in ('text', 'image', 'document') then raise exception 'Unknown message kind.' using errcode = '22023'; end if;
  if p_reply_to is not null and not exists (select 1 from crm_messages where id = p_reply_to and contact_id = p_contact) then
    raise exception 'That message is not in this chat.' using errcode = '22023';
  end if;
  insert into crm_messages (contact_id, external_id, direction, kind, body, status, error, sent_by, sent_at, reply_to)
  values (p_contact, null, 'out', p_kind, left(p_body, 4000), 'failed', left(p_error, 500), v_me, now(), p_reply_to)
  returning * into v_row;
  return to_jsonb(v_row);
end $function$;

REVOKE ALL ON FUNCTION public.crm_record_unsent(uuid, text, text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crm_record_unsent(uuid, text, text, text, uuid) TO authenticated, service_role;

-- The journey's "first reply" is a message the customer got: one kept unsent (no Meta id) is not it. PRODUCTION's body
-- (md5 4dbec7c8…), one condition added.
DO $do$
DECLARE
  v_sig regprocedure := 'public.crm_journey_message()'::regprocedure;
  v_src text;
  v_old text := $$  if new.direction = 'out' and not coalesce(new.auto, false)$$;
  v_new text := $$  if new.direction = 'out' and not coalesce(new.auto, false) and new.external_id is not null$$;
BEGIN
  SELECT prosrc INTO v_src FROM pg_proc WHERE oid = v_sig;
  IF position(v_new IN v_src) > 0 THEN RETURN; END IF;
  IF md5(v_src) IS DISTINCT FROM '4dbec7c80610f45a1a19149d150d6af6' THEN
    RAISE EXCEPTION '%: not the body this migration was written against (md5 %)', v_sig, md5(v_src);
  END IF;
  IF (length(v_src) - length(replace(v_src, v_old, ''))) / length(v_old) <> 1 THEN
    RAISE EXCEPTION '%: the text to swap is not there exactly once', v_sig;
  END IF;
  EXECUTE replace(pg_get_functiondef(v_sig), v_old, v_new);
END
$do$;

NOTIFY pgrst, 'reload schema';
