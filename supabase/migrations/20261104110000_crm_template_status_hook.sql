-- Meta's review of a template reaches the CRM the moment it is decided (2026-11-04; the owner: "如果meta 审核成功，这边就要马上
-- 更新" — both templates were Approved in WhatsApp Manager while the CRM still read In review). Meta tells the WhatsApp
-- webhook (field message_template_status_update, subscribed on the app's WhatsApp Business Account); the webhook hands
-- the verdicts here. crm_template_statuses (CRM · Manage, the templates page's refresh) asks who the caller is, and the
-- webhook has no caller — so this is its twin for the service role ALONE, production's body (md5
-- 67e48ac2271fd9a65462176e36f8612a) less its crm_manages() check. Same rows in, same update: a template found by Meta's
-- name, Approved / Rejected (Disabled) / In review, switched off when it is no longer approved, Meta's reason kept.

create or replace function public.crm_template_status_hook(p_rows jsonb)
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  with meta as (
    select r ->> 'name' as meta_name,
           case upper(coalesce(r ->> 'status', '')) when 'APPROVED' then 'approved' when 'REJECTED' then 'rejected' when 'DISABLED' then 'rejected' else 'review' end as status,
           nullif(r ->> 'reason', '') as reason
      from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) r
  )
  update crm_templates t set status = m.status, is_on = t.is_on and m.status = 'approved',
         reject_reason = case when m.status = 'rejected' then coalesce(m.reason, t.reject_reason) else null end, updated_at = now()
    from meta m
   where t.meta_name = m.meta_name and t.status in ('review', 'approved', 'rejected') and (t.status <> m.status or (m.status = 'rejected' and t.reject_reason is distinct from m.reason));
  get diagnostics n = row_count;
  return n;
end $$;

revoke all on function public.crm_template_status_hook(jsonb) from public, anon, authenticated;
grant execute on function public.crm_template_status_hook(jsonb) to service_role;
