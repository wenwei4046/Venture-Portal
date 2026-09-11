-- Legacy attachment and claim policies admit every authenticated session.
-- Keep their existing behavior for prior roles while requiring Revenue members
-- to use their private invoice bucket and verified claim submission workflow.
-- Check the stored role even when inactive: current_user_role() returns NULL
-- for inactive accounts, whose existing JWT can still be authenticated.
CREATE FUNCTION public.member_is_revenue_account() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS(SELECT 1 FROM public.users WHERE id=auth.uid() AND role='revenue_member');
$$;
REVOKE ALL ON FUNCTION public.member_is_revenue_account() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.member_is_revenue_account() TO authenticated;

-- Restrictive policies intersect with every existing permissive policy rather
-- than replacing a host's policy names or widening another bucket's access.
CREATE POLICY member_payment_attachment_boundary ON storage.objects
 AS RESTRICTIVE FOR ALL TO authenticated
 USING (bucket_id<>'payment-attachments' OR NOT (SELECT public.member_is_revenue_account()))
 WITH CHECK (bucket_id<>'payment-attachments' OR NOT (SELECT public.member_is_revenue_account()));

CREATE POLICY member_direct_claim_boundary ON public.claims
 AS RESTRICTIVE FOR INSERT TO authenticated
 WITH CHECK (NOT (SELECT public.member_is_revenue_account()));

-- member_submit_request() is owned SECURITY DEFINER code and remains the
-- authorized path after invoice attestation. Service-role jobs retain their
-- existing bypass; these policies neither grant access nor change claim data.
