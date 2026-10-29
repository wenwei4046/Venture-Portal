-- Suggested replies, without AI (the owner, 2026-10-29: "在聊天室里面，系统先去看客户的回复内容，根据过往的经验和总结，draft 出一个
-- 回复讯息模板 … 业务能编辑再发送"; asked: no API — "对的", on the phone and the computer). The screen matches the customer's
-- last words against what customers asked before and offers what our team answered then; this hands it the examples.
--
-- crm_reply_examples(): every customer text message that one of us answered (the first reply of ours that is not an
-- auto-reply, within 24 h), newest first, 800 at most — the company's whole experience, not only the reader's own chats,
-- which is why it is a DEFINER function. What leaves it is the question and the answer only: the customer's name in our
-- answer becomes {name}, and any run of 7+ digits (a phone number, an IC, a unit's account) becomes "…". Whether the
-- chat reached an appointment or a sale rides along (`won`, `appt`), so the screen can put those answers first.
-- Anybody in the CRM may read it (crm_me()).

CREATE OR REPLACE FUNCTION public.crm_reply_examples()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r jsonb;
begin
  if crm_me() is null then perform crm_deny('read the reply examples'); end if;
  select coalesce(jsonb_agg(s.x order by s.at desc), '[]'::jsonb) into r from (
    select m.sent_at as at, jsonb_build_object(
        'q', left(regexp_replace(btrim(m.body), '\d[\d \-]{5,}\d', '…', 'g'), 300),
        'a', left(regexp_replace(
               case when length(btrim(coalesce(c.name, ''))) >= 2
                 then replace(replace(o.body, btrim(c.name), '{name}'), split_part(btrim(c.name), ' ', 1), case when length(split_part(btrim(c.name), ' ', 1)) >= 3 then '{name}' else split_part(btrim(c.name), ' ', 1) end)
                 else o.body end,
               '\d[\d \-]{5,}\d', '…', 'g'), 800),
        'won', c.status = 'won',
        'appt', c.status in ('appointment', 'won') or exists (select 1 from crm_appointments a where a.contact_id = c.id and a.state in ('booked', 'attended'))
      ) as x
      from crm_messages m
      join crm_contacts c on c.id = m.contact_id
      join lateral (
        select o.body from crm_messages o
         where o.contact_id = m.contact_id and o.direction = 'out' and o.kind = 'text' and not coalesce(o.auto, false)
           and o.sent_at > m.sent_at and o.sent_at < m.sent_at + interval '24 hours'
         order by o.sent_at limit 1
      ) o on true
     where m.direction = 'in' and m.kind = 'text' and length(btrim(coalesce(m.body, ''))) >= 2
       and length(btrim(coalesce(o.body, ''))) between 4 and 1000
     order by m.sent_at desc
     limit 800
  ) s;
  return r;
end $function$;

REVOKE ALL ON FUNCTION public.crm_reply_examples() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crm_reply_examples() TO authenticated, service_role;
