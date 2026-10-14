-- A customer's WhatsApp document is named by its file (2026-10-14; the owner: a PDF showed only "Document").
-- From now on the webhook hands the file name as the message's words when it has no caption (lib/whatsapp/webhook.ts);
-- this fills in the documents that came before, from Meta's own deliveries kept in crm_channel_events. Data only: no
-- function changes, and a document that has a caption keeps it.
with docs as (
  select distinct on (d->>'id') d->>'id' as media_id, d->>'filename' as filename
  from crm_channel_events e, jsonb_path_query(e.payload, '$.**.document') d
  where e.channel = 'whatsapp' and d->>'filename' is not null and d->>'id' is not null
)
update crm_messages m set body = docs.filename
  from docs
 where docs.media_id = m.media_id and m.direction = 'in' and m.kind = 'document' and m.body is null;
