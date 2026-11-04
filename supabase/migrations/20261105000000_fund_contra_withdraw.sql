-- Withdraw a fund contra still waiting (2026-11-05 — the user, on "还没批的 contra 只能在 Approvals 按 Reject": "这个可以先做吗？").
-- Whoever filed it, or whoever holds the queue's Approve (the Principal), takes it back before it is decided: the contra
-- 'withdrawn', its approval closed as rejected with a note saying who withdrew it. Nothing was written for it, so
-- nothing is undone. Fund OUT's and Fund IN's Contra window lists the contras waiting and offers it.

create or replace function withdraw_fund_contra(p_contra_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_c fund_contras%rowtype;
begin
  PERFORM public.tab_write_guard(ARRAY['/fund-out', '/fund-in'], ARRAY['treasury.create']);
  IF auth.uid() IS NOT NULL AND NOT public.has_any_action(ARRAY['treasury.create']) THEN RAISE EXCEPTION 'withdraw_fund_contra: needs Treasury · Create' USING ERRCODE = '42501';
  end if;
  select * into v_c from fund_contras where id = p_contra_id for update;
  if not found then raise exception 'That contra was not found'; end if;
  IF auth.uid() IS NOT NULL
     AND v_c.created_by IS DISTINCT FROM auth.uid()
     AND NOT public.has_any_action(ARRAY['approvals.approve']) THEN
    RAISE EXCEPTION 'Only whoever filed it, or the Principal, may withdraw it' USING ERRCODE = '42501';
  END IF;
  if v_c.status <> 'pending' then raise exception 'That contra is no longer waiting (it is %)', v_c.status; end if;

  update fund_contras set status = 'withdrawn', decided_by = auth.uid(), decided_at = now() where id = v_c.id;
  update approval_requests
     set status = 'rejected', workflow_state = 'rejected', approved_by = auth.uid(), approved_at = now(),
         notes = case when v_c.created_by is not distinct from auth.uid() then 'Withdrawn by whoever filed it' else 'Withdrawn by the Principal' end,
         updated_at = now()
   where id = v_c.approval_id and status = 'pending';
end $$;

-- The guard the scan reads (tab-write-guards.test.ts).
CREATE OR REPLACE FUNCTION pg_temp.tab_guard(p_sig text, p_pages text, p_wants text[])
RETURNS void
LANGUAGE plpgsql AS $g$
DECLARE
  v_line text := format('PERFORM public.tab_write_guard(%s, ARRAY[%s]);', p_pages,
    array_to_string(ARRAY(SELECT quote_literal(w) FROM unnest(p_wants) w), ', '));
BEGIN
  IF position(v_line IN (SELECT prosrc FROM pg_proc WHERE oid = p_sig::regprocedure)) = 0 THEN
    RAISE EXCEPTION '% does not ask its page: % is not in its body', p_sig, v_line;
  END IF;
END
$g$;
SELECT pg_temp.tab_guard('public.withdraw_fund_contra(uuid)', $$ARRAY['/fund-out', '/fund-in']$$, ARRAY['treasury.create']);

revoke all on function withdraw_fund_contra(uuid) from public, anon;
grant execute on function withdraw_fund_contra(uuid) to authenticated, service_role;
