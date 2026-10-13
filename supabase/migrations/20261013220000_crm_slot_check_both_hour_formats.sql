-- One closure, two ways of writing its hours (2026-10-13). Round 2 (#347, mig 20261013210000) writes a timed closure as
-- one window t1 / t2 (the phone panel's Blocked time slots); the CRM desktop rev 1 (mig 20261013100000) writes several,
-- ranges [{f, t}]. Both were applied the same day and production kept the desktop's body, which reads only ranges — so
-- a t1 / t2 closure closed the whole day. This reads both: a closure with no hours either way closes the day; one with
-- hours closes a slot starting at or after a window's start and before its end.
--
-- Production's body of 2026-10-13 (md5(prosrc) b750d01c4db9dfc45c45fcac3358c9f5, the desktop's); only the two closure
-- checks change. The app reads the same through blockHours() (lib/member/crm-data.ts).
create or replace function public.crm_slot_check(p_showroom text, p_start timestamp with time zone, p_except uuid default null::uuid)
 returns void
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  r       crm_showrooms;
  v_local timestamp := p_start at time zone 'Asia/Kuala_Lumpur';
  v_date  text := to_char(v_local, 'YYYY-MM-DD');
  v_hhmm  text := to_char(v_local, 'HH24:MI');
  v_mon0  text := ((extract(isodow from v_local)::int + 6) % 7)::text; -- 0 = Monday
  v_taken integer;
begin
  select * into r from crm_showrooms where id = trim(p_showroom);
  if r.id is null or not r.active then raise exception 'Choose a showroom that is open.' using errcode = '22023'; end if;
  if extract(dow from v_local)::int = any (r.weekly)
     or exists (select 1 from jsonb_array_elements(r.blocks) b
                 where v_date between b ->> 'a' and coalesce(b ->> 'b', b ->> 'a')
                   and coalesce(jsonb_array_length(case when jsonb_typeof(b -> 'ranges') = 'array' then b -> 'ranges' end), 0) = 0
                   and (coalesce(b ->> 't1', '') = '' or coalesce(b ->> 't2', '') = '')) then
    raise exception '% is closed that day.', r.name using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements(r.blocks) b,
               lateral (select g ->> 'f' as f, g ->> 't' as t
                          from jsonb_array_elements(case when jsonb_typeof(b -> 'ranges') = 'array' then b -> 'ranges' else '[]'::jsonb end) g
                        union all
                        select b ->> 't1', b ->> 't2' where coalesce(b ->> 't1', '') <> '' and coalesce(b ->> 't2', '') <> '') w
              where v_date between b ->> 'a' and coalesce(b ->> 'b', b ->> 'a') and v_hhmm >= w.f and v_hhmm < w.t) then
    raise exception '% is closed at that time.', r.name using errcode = '22023';
  end if;
  if not exists (select 1 from unnest(r.slots) s
                  where split_part(s, '@', 1) = v_hhmm
                    and (position('@' in s) = 0 or position(v_mon0 in split_part(s, '@', 2)) > 0)) then
    raise exception '% does not take bookings at that time.', r.name using errcode = '22023';
  end if;
  select count(*) into v_taken from crm_appointments
   where showroom = r.id and start_at = p_start and state = 'booked' and id is distinct from p_except;
  if v_taken >= r.cap then raise exception 'That time is full at %. Choose another.', r.name using errcode = '22023'; end if;
end $function$;
