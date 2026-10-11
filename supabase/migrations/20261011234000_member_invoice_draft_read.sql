-- member-invoices: whoever uploaded a file into their own DRAFT may see it — and so remove it
-- (2026-10-11, the user, asked whether an uploader may delete their own unfinished draft's file:
-- "Yes they can delete").
--
-- member_invoice_draft_delete (mig 20260912020000) already lets the creator of a draft remove a file of
-- theirs that no attachment row names. But a DELETE through the Storage API reads the row it deletes
-- (`WHERE name = …`), so Postgres asks the SELECT policies as well — and the only one,
-- member_invoice_read, shows a file only once an attachment row names it. The two never met: a file whose
-- attestation failed — the Revenue app's `attachVerified`, Sales Groups' "+" with a signed form
-- (`addToWaitingList` → `member_waiting_add_form`) — could be removed by nobody but the service role, and
-- stayed in the bucket. Found removing the "+" E2E's file (2026-10-11).
--
-- member_invoice_draft_read: the creator sees the files in their own folder of their own draft — the
-- only files member_invoice_insert ever let them put there. Once the request is sent (no longer a draft)
-- it stops, and member_invoice_read alone decides, as before. Nothing else changes: who uploads, who
-- reads an attested file, who deletes.

DROP POLICY IF EXISTS member_invoice_draft_read ON storage.objects;
CREATE POLICY member_invoice_draft_read ON storage.objects FOR SELECT TO authenticated USING (
  bucket_id = 'member-invoices'
  AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  AND EXISTS (SELECT 1 FROM public.member_requests r
               WHERE r.id::text = (storage.foldername(name))[2]
                 AND r.created_by = (SELECT auth.uid())
                 AND r.status = 'draft')
);
