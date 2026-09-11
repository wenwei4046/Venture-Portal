-- A neutral account role. Commit this migration BEFORE any migration uses it.
-- Never reuse dept_manager: its legacy RLS policies grant department finance access.
ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'revenue_member';
