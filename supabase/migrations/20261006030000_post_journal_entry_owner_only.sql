-- 20261006030000_post_journal_entry_owner_only.sql
--
-- The second half of 20261006020000. Apply it only once the code that posts
-- journals through post_journal_entry_as_caller (lib/journal.ts) is live: the
-- code before it calls post_journal_entry straight, and every billing,
-- payment, fund-out and approval action that posts one would be refused.
--
-- After it, post_journal_entry — which posts whatever lines it is given in
-- whatever name it is handed — is the owner's and the service role's alone:
-- the SECURITY DEFINER functions that post journals for their own flows run
-- as the owner and are unaffected; a signed-in user's browser goes through
-- post_journal_entry_as_caller (own name, treasury / admin / hr scope).

REVOKE EXECUTE ON FUNCTION public.post_journal_entry(p_transaction_date date, p_description text, p_reference_type text, p_reference_id uuid, p_created_by uuid, p_lines jsonb, p_segment gl_segment) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.post_journal_entry(p_transaction_date date, p_description text, p_reference_type text, p_reference_id uuid, p_created_by uuid, p_lines jsonb, p_segment gl_segment) TO service_role;

NOTIFY pgrst, 'reload schema';
