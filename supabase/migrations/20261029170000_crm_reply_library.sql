-- The reply library (the owner, 2026-10-29: "先不接 AI，那我能有个类似 reply library 的功能，主要可以存入一些不错的话术，让业务参考，
-- 当然里面的名字等，可以根据客户的咨询自动调整"): the company's good replies, kept once for everybody — a title, a category,
-- the words (with {name}, {me}, {project} … that the chat fills in for the customer on screen) and keywords that bring it
-- up as a suggestion. Everybody in the CRM reads it; CRM · Manage (the Principal, the Revenue Director) keeps it, saved
-- whole from the desktop's Settings › Reply library.

create table if not exists public.crm_reply_library (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text not null default '',
  body text not null,
  keywords text[] not null default '{}',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid
);

alter table public.crm_reply_library enable row level security;
revoke all on public.crm_reply_library from anon, authenticated;
grant select on public.crm_reply_library to authenticated;

drop policy if exists crm_reply_library_read on public.crm_reply_library;
create policy crm_reply_library_read on public.crm_reply_library for select to authenticated
  using ((select crm_me()) is not null);

-- The whole library, in its order: rows kept by id, new ones added, the rest removed. Answers the library as saved
-- (new rows with their ids), so the next save from the screen keeps them.
create or replace function public.crm_save_reply_library(p_items jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v jsonb; n int := 0; v_id uuid; v_keep uuid[] := '{}';
begin
  if not crm_manages() then perform crm_deny('change the reply library'); end if;
  if jsonb_typeof(coalesce(p_items, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_items, '[]'::jsonb)) > 300 then
    raise exception 'Up to 300 replies in the library.' using errcode = '22023';
  end if;
  for v in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    n := n + 1;
    if length(btrim(coalesce(v->>'title', ''))) not between 1 and 80 then raise exception 'Give each reply a title (up to 80 characters).' using errcode = '22023'; end if;
    if length(btrim(coalesce(v->>'body', ''))) not between 1 and 2000 then raise exception '"%": write its words (up to 2,000 characters).', btrim(v->>'title') using errcode = '22023'; end if;
    if length(coalesce(v->>'category', '')) > 40 then raise exception '"%": a category is up to 40 characters.', btrim(v->>'title') using errcode = '22023'; end if;
    v_id := case when coalesce(v->>'id', '') ~ '^[0-9a-f-]{36}$' then (v->>'id')::uuid else null end;
    if v_id is not null and exists (select 1 from crm_reply_library where id = v_id) then
      update crm_reply_library set title = btrim(v->>'title'), category = btrim(coalesce(v->>'category', '')), body = btrim(v->>'body'),
        keywords = coalesce((select array_agg(left(btrim(k), 30)) from jsonb_array_elements_text(coalesce(v->'keywords', '[]'::jsonb)) k where btrim(k) <> ''), '{}'),
        sort_order = n, updated_at = now(), updated_by = crm_me()
       where id = v_id;
    else
      insert into crm_reply_library (title, category, body, keywords, sort_order, updated_by)
      values (btrim(v->>'title'), btrim(coalesce(v->>'category', '')), btrim(v->>'body'),
        coalesce((select array_agg(left(btrim(k), 30)) from jsonb_array_elements_text(coalesce(v->'keywords', '[]'::jsonb)) k where btrim(k) <> ''), '{}'), n, crm_me())
      returning id into v_id;
    end if;
    v_keep := v_keep || v_id;
  end loop;
  delete from crm_reply_library where not (id = any (v_keep));
  return coalesce((select jsonb_agg(jsonb_build_object('id', id, 'title', title, 'category', category, 'body', body, 'keywords', to_jsonb(keywords)) order by sort_order)
    from crm_reply_library), '[]'::jsonb);
end $$;

revoke execute on function public.crm_save_reply_library(jsonb) from public, anon;
grant execute on function public.crm_save_reply_library(jsonb) to authenticated;

SELECT public.audit_register('crm_reply_library', 'CRM reply library', 'Member services', '{revenue,crm_manage}', 'people');
