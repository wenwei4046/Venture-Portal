-- A customer's reaction is on the message it reacts to, not a message of its own (the owner, 2026-10-24, of an empty bubble
-- at 7:32 PM: "為什麼看不到客戶的訊息" — Jayden Goh had pressed 👌 on our "Are you available tomorrow at 12 PM?").
-- WhatsApp sends a reaction as a message of type "reaction" ({emoji, message_id}); the ingest kept it as kind 'other' with no
-- words. Now the webhook hands reactions apart to crm_their_reactions (service role only), which sets the target's
-- crm_messages.their_reaction (an empty emoji takes it off). The three reactions kept as empty messages before this are
-- moved onto their messages and the empty rows go.

alter table public.crm_messages add column if not exists their_reaction text;

create or replace function public.crm_their_reactions(p_reactions jsonb)
returns integer language plpgsql security definer set search_path to 'public' as $$
declare r jsonb; n integer := 0; k integer;
begin
  if jsonb_typeof(p_reactions) is distinct from 'array' then return 0; end if;
  for r in select * from jsonb_array_elements(p_reactions) loop
    update crm_messages set their_reaction = nullif(left(coalesce(r->>'emoji', ''), 16), '')
     where external_id = r->>'target' and coalesce(r->>'target', '') <> '';
    get diagnostics k = row_count; n := n + k;
  end loop;
  return n;
end $$;
revoke all on function public.crm_their_reactions(jsonb) from public, anon, authenticated;
grant execute on function public.crm_their_reactions(jsonb) to service_role;

-- The reactions kept before as empty messages: onto their messages, and the empty rows removed.
with r as (
  select m.id, x->'reaction'->>'emoji' as emoji, x->'reaction'->>'message_id' as target
  from crm_messages m
  join crm_channel_events e on e.received_at = m.created_at and e.channel = 'whatsapp'
  cross join lateral jsonb_path_query(e.payload, '$.entry[*].changes[*].value.messages[*]') x
  where m.kind = 'other' and m.direction = 'in' and m.body is null and x->>'type' = 'reaction' and x->>'id' = m.external_id
), u as (
  update crm_messages t set their_reaction = nullif(r.emoji, '') from r where t.external_id = r.target returning 1
)
delete from crm_messages d using r where d.id = r.id;
