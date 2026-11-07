-- IR Quote under View as (2026-11-06 — the user, in the quote as the Principal: "我在crm as a member 了，进来能as a member
-- 嘛？", then "要带"). A member's quote drafts and Drive are their own (mig 20261105120000): the Principal viewing a member
-- reads them here, and sends nothing — the app has no write for it, and every write still asks for the caller's own row.
-- `member_principal_context` asks what every View-as read asks: an active Principal account, and somebody who is a member
-- (or a director) of that sub-department today.

create or replace function public.ir_quote_member_view(p_staff uuid, p_sub_department uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_user uuid;
  v_name text;
begin
  perform public.member_principal_context(p_staff, p_sub_department);
  select s.user_id, s.employee_name into v_user, v_name from public.hr_staff_costs s where s.id = p_staff;
  return jsonb_build_object(
    'user', jsonb_build_object('id', coalesce(v_user, p_staff), 'name', coalesce(v_name, '')),
    'drafts', coalesce((select jsonb_agg(d.draft order by d.updated_at desc) from public.ir_quote_drafts d where d.owner = v_user), '[]'::jsonb),
    'boards', coalesce((select jsonb_agg(b.board order by b.updated_at) from public.ir_drive_boards b where b.owner = v_user), '[]'::jsonb)
  );
end $function$;
revoke all on function public.ir_quote_member_view(uuid, uuid) from public, anon;
grant execute on function public.ir_quote_member_view(uuid, uuid) to authenticated;

-- The Drive's photos: their owner's, and an active Principal's, who sees them under View as. Everything else as it was.
drop policy if exists "ir quote photos: read" on public.file_objects;
create policy "ir quote photos: read" on public.file_objects for select to authenticated
  using (bucket_id = 'ir-quote'
    and (((storage.foldername(name))[1] = 'config' and (select has_any_action(array['revenue_app.create:own', 'product_list.edit'])))
      or ((storage.foldername(name))[1] = 'drive' and ((storage.foldername(name))[2] = (select auth.uid())::text
        or (select exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'principal' and u.is_active))))));
