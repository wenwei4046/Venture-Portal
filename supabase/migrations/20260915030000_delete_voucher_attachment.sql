-- Delete a voucher attachment (user 2026-09-15 "要"): Finance/Principal may
-- remove a mis-uploaded file while the PV is still draft / pending_approval —
-- the same window uploadVoucherAttachment allows. Once approved or paid the
-- attachments are the Principal's approval evidence and stay locked.
--
-- Two halves, mirroring upload's shape:
--   1. RPC deletes the payment_attachments row (table RLS is pa_no_delete for
--      everyone, so SECURITY DEFINER + explicit checks) and returns the
--      storage path.
--   2. A storage.objects DELETE policy lets the same user's client remove the
--      file afterwards — but ONLY once no payment_attachments row references
--      that path (the RPC ran first) and only under a draft/pending voucher's
--      folder. Same guard style as member_invoice_draft_delete.

BEGIN;

CREATE OR REPLACE FUNCTION public.delete_voucher_attachment(p_attachment_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_role   user_role;
    v_uid    uuid;
    v_att    record;
    v_status text;
BEGIN
    v_role := current_user_role();
    IF v_role NOT IN ('finance', 'principal') THEN
        RAISE EXCEPTION 'delete_voucher_attachment: unauthorized role %', v_role
            USING ERRCODE = 'insufficient_privilege';
    END IF;
    v_uid := auth.uid();

    SELECT a.id, a.voucher_id, a.storage_path, a.file_name
      INTO v_att
      FROM payment_attachments a
     WHERE a.id = p_attachment_id
       FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'delete_voucher_attachment: attachment % not found', p_attachment_id;
    END IF;

    SELECT status::text INTO v_status FROM payment_vouchers WHERE id = v_att.voucher_id;
    IF v_status IS NULL OR v_status NOT IN ('draft', 'pending_approval') THEN
        RAISE EXCEPTION 'PV 已经 %，附件是审批证据，不能删', coalesce(v_status, '?');
    END IF;

    DELETE FROM payment_attachments WHERE id = p_attachment_id;

    INSERT INTO access_log (user_id, resource_type, resource_id, action, metadata)
    VALUES (v_uid, 'payment_attachments', p_attachment_id::text, 'delete',
        jsonb_build_object('voucher_id', v_att.voucher_id, 'file_name', v_att.file_name,
            'storage_path', v_att.storage_path, 'voucher_status', v_status));

    RETURN v_att.storage_path;
END $function$;

COMMENT ON FUNCTION public.delete_voucher_attachment(uuid) IS
    'Finance/Principal remove a PV attachment while the voucher is draft/pending_approval. Deletes the row, logs it, returns storage_path for the client to remove the object.';

-- Storage: the object may go only after its row is gone, and only under a
-- still-editable voucher's folder (first path segment = voucher id).
DROP POLICY IF EXISTS "Finance can delete draft-voucher attachments" ON storage.objects;
CREATE POLICY "Finance can delete draft-voucher attachments"
ON storage.objects FOR DELETE
USING (
    bucket_id = 'payment-attachments'
    AND (SELECT has_scope(ARRAY['treasury'::text]))
    AND NOT EXISTS (
        SELECT 1 FROM public.payment_attachments a WHERE a.storage_path = objects.name
    )
    AND EXISTS (
        SELECT 1 FROM public.payment_vouchers pv
         WHERE pv.id::text = (storage.foldername(objects.name))[1]
           AND pv.status IN ('draft', 'pending_approval')
    )
);

COMMIT;
