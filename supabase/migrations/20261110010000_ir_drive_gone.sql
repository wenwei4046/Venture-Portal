-- IR Quote's Drive goes (the user, 2026-11-10: "Drive 的旧资料 删掉").
--
-- The app stopped using it on 2026-11-09 (#989): style photos are the company's alone (Quote settings › Styles), and no
-- screen reads or writes a salesperson's Drive any more. What it left: the table ir_drive_boards (4 boards, one owner),
-- its two functions ir_drive_read() and ir_drive_save_board(text, jsonb), and its line in audit_tables. It never had rows
-- in permission_table_reads / _writes, and no file in R2 (the `ir-quote` bucket holds config/ only).
-- What the rows said stays in audit_events.

-- ir_quote_member_view(uuid, uuid) — the Principal's View as of a member's quote (PR #963, open; applied to production on
-- 2026-11-06 ahead of its merge) — also hands back the member's Drive boards. Made again from PRODUCTION's body
-- (md5 a213163522522a6aa2c93087f4bd7f60) less its 'boards' line, and nothing else; refused if that body has changed.
-- Run on a database without it (a fresh one, CI's), it is not made: it is #963's to make, and #963's own copy must lose
-- the same line before it merges.
DO $$
DECLARE
  v_md5 text;
BEGIN
  SELECT md5(p.prosrc) INTO v_md5 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'ir_quote_member_view';
  IF v_md5 IS NULL THEN
    RETURN;
  END IF;
  IF v_md5 <> 'a213163522522a6aa2c93087f4bd7f60' THEN
    RAISE EXCEPTION 'ir_quote_member_view is not the body this migration was written from (md5 %)', v_md5;
  END IF;
  EXECUTE $f$
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
    'drafts', coalesce((select jsonb_agg(d.draft order by d.updated_at desc) from public.ir_quote_drafts d where d.owner = v_user), '[]'::jsonb)
  );
end $function$;
$f$;
END $$;

DROP FUNCTION IF EXISTS public.ir_drive_read();
DROP FUNCTION IF EXISTS public.ir_drive_save_board(text, jsonb);
-- Its triggers (the audit's) and policies with it.
DROP TABLE IF EXISTS public.ir_drive_boards;
DELETE FROM public.audit_tables WHERE table_name = 'ir_drive_boards';

-- Nothing left names what went.
DO $$
DECLARE
  v_left text;
BEGIN
  SELECT string_agg(p.oid::regprocedure::text, ', ' ORDER BY p.oid::regprocedure::text) INTO v_left
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.prosrc ~ '(ir_drive_boards|ir_drive_read|ir_drive_save_board)';
  IF v_left IS NOT NULL THEN
    RAISE EXCEPTION 'Still naming the IR Drive: %', v_left;
  END IF;
END $$;
