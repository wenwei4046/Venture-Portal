-- The chat composer's Recents (2026-10-14, the owner's Claude Design handoff "Typing bar UI mobile chat design" —
-- docs/design/chat-composer: "Persist … recent emoji per user on the server"): the emoji a salesperson picks in the
-- composer's Sticker panel come first in its Recents, on every phone they sign in on. Each person's own, as their
-- notification reads are (crm_staff_prefs, mig 20261009160000 — read under one's own session through its own-row policy,
-- written only by a DEFINER function that writes the caller's row).

alter table public.crm_staff_prefs add column if not exists recent_emoji text[] not null default '{}';

-- One's recent emoji, as the composer keeps them: most recent first, each once, 24 at most (one category's three rows),
-- each a short string (a flag, a family, a skin tone is one emoji but several code points).
create or replace function public.crm_save_recent_emoji(p_emoji text[])
returns void language plpgsql security definer set search_path = public as $$
declare v_me uuid := crm_me(); v_list text[];
begin
  if v_me is null then perform crm_deny('keep recent emoji'); end if;
  select coalesce(array_agg(e order by o), '{}') into v_list
    from (select e, min(o) as o from unnest(coalesce(p_emoji, '{}')) with ordinality as t(e, o)
          where e is not null and char_length(e) between 1 and 16
          group by e order by min(o) limit 24) x;
  insert into crm_staff_prefs (staff_id, recent_emoji) values (v_me, v_list)
  on conflict (staff_id) do update set recent_emoji = excluded.recent_emoji;
end $$;

revoke execute on function public.crm_save_recent_emoji(text[]) from public, anon;
grant execute on function public.crm_save_recent_emoji(text[]) to authenticated, service_role;
