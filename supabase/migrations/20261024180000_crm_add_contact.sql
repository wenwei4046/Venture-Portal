-- CRM redesign v2 (frames 02 / 03: Inbox's "New chat", Contacts' "Add customer"; the owner: "做手动新增客户"):
-- a customer added by hand — a name and a WhatsApp phone. Kept on the number the newest WhatsApp customers wrote to (the
-- CRM's ad number), so when they write back the webhook finds this very customer (channel, account_id, external_id = wa_id).
-- Given to the one who adds them; CRM · Manage may give them to anybody in the CRM. A phone already in the CRM is not added
-- twice: its customer is answered instead. Asks CRM · Edit (own) — the customer-work cell — and crm_manages() to give away.
-- A new function only; no CRM function is rewritten.

create or replace function public.crm_add_contact(p_name text, p_phone text, p_assign uuid)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare me uuid := crm_me(); d text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'); acc text; who uuid; got uuid;
begin
  if me is null or not crm_can('edit', 'own') then perform crm_deny('add customers'); end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'Give the customer a name.' using errcode = '22023'; end if;
  if d like '0%' then d := '6' || d; end if;                -- 012-345 6789 → 60123456789 (Malaysia)
  if length(d) < 9 or length(d) > 15 then raise exception 'Type the phone with its country code, e.g. 6012 345 6789.' using errcode = '22023'; end if;
  select account_id into acc from crm_contacts where channel = 'whatsapp' and account_id ~ '^\d+$' order by created_at desc limit 1;
  if acc is null then raise exception 'No WhatsApp number has received a customer yet, so there is no number to add them on.' using errcode = '22023'; end if;
  select id into got from crm_contacts where channel = 'whatsapp' and account_id = acc and external_id = d;
  if got is not null then return got; end if;
  who := coalesce(p_assign, me);
  if who is distinct from me and not crm_manages() then perform crm_deny('give a customer to somebody else'); end if;
  insert into crm_contacts (channel, account_id, external_id, name, phone, status, assigned_to, team_id, assigned_at, assigned_by)
  values ('whatsapp', acc, d, left(trim(p_name), 120), '+' || d, 'new', who, crm_team_of(who), now(), me)
  returning id into got;
  return got;
end $$;
revoke all on function public.crm_add_contact(text, text, uuid) from public, anon;
grant execute on function public.crm_add_contact(text, text, uuid) to authenticated;
