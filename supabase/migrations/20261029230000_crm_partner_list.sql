-- The partner booking link lists the bookings made through it (the owner, 2026-10-29: "这个表单能不能看到也是用这个表单的人的
-- 预约"; asked what it should show, the owner chose the customer's phone and the reference too — "不然预约的人忘记了就改不了了").
-- Anybody with the link reads them, as the link itself already lets anybody holding a reference change or cancel one.
-- Granted to anon by name and asking the link's code, as the page's other five functions (mig 20261029190000).

create or replace function public.crm_partner_list(p_code text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare p crm_partner_links := crm_partner_of(p_code);
begin
  if p.id is null then raise exception 'This link is closed.' using errcode = '42501'; end if;
  -- What is still to come (and today's), soonest first, 300 at most.
  return coalesce((select jsonb_agg(crm_partner_booking_json(b) order by b.start_at)
    from (select * from crm_partner_bookings b
           where b.partner = p.id and b.state = 'booked'
             and b.start_at >= ((now() at time zone 'Asia/Kuala_Lumpur')::date)::timestamp at time zone 'Asia/Kuala_Lumpur'
           order by b.start_at limit 300) b), '[]'::jsonb);
end $$;

revoke execute on function public.crm_partner_list(text) from public;
grant execute on function public.crm_partner_list(text) to anon, authenticated;
