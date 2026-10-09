-- The Principal opens the CRM as the Boss (user 2026-10-03).
--
-- The Boss reviews the CRM from the portal's Principal account
-- (/member?page=crm), which is linked to no staff record — so the CRM said
-- "your login is not linked" and showed nothing. Now: a signed-in account
-- with no staff record of its own that IS the Principal (users.role =
-- 'principal', the same test member_principal_snapshot uses) acts in the CRM
-- as the active staff member whose title maps to Boss (the CEO). Everything
-- else follows from crm_me(): reads everything, replies to nobody, sends to
-- teams, keeps the settings, and "changed by" names the CEO.
-- A linked staff record always wins; nobody else gains anything.
--
-- Add-only: crm_me re-stated.

create or replace function public.crm_me() returns uuid
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select s.id from users u join hr_staff_costs s on s.user_id = u.id
      where u.id = auth.uid() and u.is_active and s.status = 'active'
      limit 1),
    (select s.id from hr_staff_costs s join crm_role_map m on m.title_id = s.title_id
      where m.crm_role = 'boss' and s.status = 'active'
        and exists (select 1 from users u where u.id = auth.uid() and u.is_active and u.role = 'principal')
      order by s.id
      limit 1)
  )
$$;
