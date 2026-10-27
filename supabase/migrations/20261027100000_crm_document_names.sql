-- A customer's document keeps its file's own name beside its caption (the owner, 2026-10-27, of Jayden Goh's Word file sent
-- with a long message — the card and the viewer's bar showed the message cut off as the file's name: "when customer send
-- document, then attach with typing. it can view all").
-- WhatsApp sends a document's caption and its filename; the ingest keeps ONE body — the caption, else the filename — so a
-- captioned document lost its name and its words were drawn as one. Now crm_messages.media_name keeps the file's name,
-- set by the webhook right after the ingest through crm_document_names (service role only, as crm_their_reactions), and
-- the caption stays the message's words, shown in full under the document's card. Documents kept before this are named
-- from Meta's delivery log (crm_channel_events). crm_ingest_whatsapp is not changed.

alter table public.crm_messages add column if not exists media_name text;

create or replace function public.crm_document_names(p_names jsonb)
returns integer language plpgsql security definer set search_path to 'public' as $$
declare r jsonb; n integer := 0; k integer;
begin
  if jsonb_typeof(p_names) is distinct from 'array' then return 0; end if;
  for r in select * from jsonb_array_elements(p_names) loop
    update crm_messages set media_name = left(r->>'name', 240)
     where external_id = r->>'id' and coalesce(r->>'id', '') <> '' and coalesce(r->>'name', '') <> '' and direction = 'in';
    get diagnostics k = row_count; n := n + k;
  end loop;
  return n;
end $$;
revoke all on function public.crm_document_names(jsonb) from public, anon, authenticated;
grant execute on function public.crm_document_names(jsonb) to service_role;

-- The documents kept before: named from the delivery that brought them.
update crm_messages t set media_name = left(x.fname, 240)
from (
  select distinct on (d->>'id') d->>'id' as mid, d->'document'->>'filename' as fname
  from crm_channel_events e
  cross join lateral jsonb_path_query(e.payload, '$.entry[*].changes[*].value.messages[*]') d
  where e.channel = 'whatsapp' and d->>'type' = 'document' and coalesce(d->'document'->>'filename', '') <> ''
) x
where t.external_id = x.mid and t.direction = 'in' and t.media_name is null;
