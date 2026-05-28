-- Mig 274: allow finance to DELETE draft invoices.
--
-- Previously invoices_no_delete (USING false) blocked all deletes outright,
-- so the deleteDraftInvoice action returned no rows affected with no error
-- (RLS just filters silently). The Delete button in /billing appeared to
-- do nothing.
--
-- Add a permissive policy so finance can recover from mistakes on draft
-- rows. Issued/paid invoices stay blocked (still require credit note flow).
--
-- PostgreSQL RLS: same-command permissive policies are OR'd, so this new
-- policy unlocks the draft case while invoices_no_delete keeps everything
-- else closed.

CREATE POLICY invoices_finance_delete_draft
ON public.invoices
FOR DELETE
USING (
  current_user_role() = 'finance'::user_role
  AND status = 'draft'
);
