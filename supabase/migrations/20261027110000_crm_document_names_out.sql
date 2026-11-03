-- The documents WE send keep their file's own name too (the owner, 2026-10-27: "两个都一起改" — ours and Messenger's, after
-- 20261027100000 named a customer's WhatsApp document). sendCrmMedia records a document with the caption as its body
-- (else the file name), so a captioned one lost its name. crm_name_out_file sets crm_messages.media_name on our own
-- outgoing message once its file is kept (crm_set_out_media) — the same checks: our message, crm_can_reply on its customer.
-- Messenger's files are named by the webhook through crm_document_names (no change here). Our documents kept before this
-- with no caption are named by their body (it IS the file name); the one captioned before keeps its words as its name.

create or replace function public.crm_name_out_file(p_message uuid, p_name text)
returns void language plpgsql security definer set search_path to 'public' as $$
declare m crm_messages;
begin
  select * into m from crm_messages where id = p_message;
  if m.id is null or m.direction <> 'out' then raise exception 'That message is not one we sent.' using errcode = '22023'; end if;
  if not public.crm_can_reply(m.contact_id) then perform crm_deny('send files to this customer'); end if;
  if m.media_path is null then raise exception 'That message has no file.' using errcode = '22023'; end if;
  update crm_messages set media_name = nullif(left(trim(coalesce(p_name, '')), 240), '') where id = p_message;
end $$;
revoke all on function public.crm_name_out_file(uuid, text) from public, anon;
grant execute on function public.crm_name_out_file(uuid, text) to authenticated;

update crm_messages set media_name = left(trim(body), 240)
 where direction = 'out' and kind = 'document' and media_path is not null and media_name is null
   and body ~ '\.[A-Za-z0-9]{2,5}$';
