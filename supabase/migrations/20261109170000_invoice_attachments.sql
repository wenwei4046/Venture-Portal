-- An invoice's attachments (2026-11-09, the user: "我issue invoice 时可以放attachment 一起print 出来吗？ export pdf 也一起"
-- → "就是我开invoice 时放，也可以看完后放"): files kept with an invoice — added in Create invoice or later on its page,
-- each one printed after its invoice when the PDF is asked for with them (invoice + its files, invoice + its files…).
--
-- The files themselves sit where a voucher's do: file storage's `payment-attachments` bucket, under
-- `invoices/<invoice id>/…` (its INSERT and SELECT policies already let a signed-in session in; the member boundary
-- keeps a Revenue account out). The rows are kept in `invoice_attachments`, which no session reads or writes
-- directly: through `invoice_attachments_of`, `invoice_attachment_add` and `invoice_attachment_remove` only.
-- A file may be added or removed while the invoice is not voided.

CREATE TABLE IF NOT EXISTS public.invoice_attachments (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id   uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  file_name    text NOT NULL CHECK (length(file_name) BETWEEN 1 AND 255),
  file_type    text NOT NULL,
  file_size    bigint,
  storage_path text NOT NULL UNIQUE CHECK (storage_path LIKE 'invoices/%'),
  uploaded_by  uuid REFERENCES public.users(id),
  uploaded_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS invoice_attachments_invoice ON public.invoice_attachments (invoice_id, uploaded_at);
ALTER TABLE public.invoice_attachments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.invoice_attachments FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.invoice_attachments TO service_role;

SELECT public.audit_register('invoice_attachments', 'Invoice attachments', 'Billing', '{billing,treasury}',
  p_labels => '{invoice_id,file_name}');


-- The files of these invoices, oldest first (the order they print in), for a reader of invoices.
CREATE OR REPLACE FUNCTION public.invoice_attachments_of(p_ids uuid[])
RETURNS TABLE (id uuid, invoice_id uuid, file_name text, file_type text, file_size bigint, storage_path text,
               uploaded_by text, uploaded_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT a.id, a.invoice_id, a.file_name, a.file_type, a.file_size, a.storage_path,
         u.name, a.uploaded_at
    FROM public.invoice_attachments a
    LEFT JOIN public.users u ON u.id = a.uploaded_by
   WHERE a.invoice_id = ANY (p_ids)
     AND auth.uid() IS NOT NULL
     AND coalesce(public.has_any_action(ARRAY['billing.view', 'billing.create', 'billing.edit', 'billing.export', 'billing.void']), false)
   ORDER BY a.invoice_id, a.uploaded_at, a.id
$fn$;


-- One file filed with an invoice, once it is in file storage under the invoice's own folder.
CREATE OR REPLACE FUNCTION public.invoice_attachment_add(p_invoice uuid, p_name text, p_type text, p_size bigint, p_path text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_status text;
  v_id     uuid;
BEGIN
  PERFORM public.tab_write_guard(ARRAY['/invoices/[id]', '/statements'], ARRAY['billing.create']);
  IF auth.uid() IS NULL OR NOT coalesce(public.has_any_action(ARRAY['billing.create']), false) THEN
    RAISE EXCEPTION 'Attachments need Billing · Create.' USING ERRCODE = '42501';
  END IF;
  SELECT i.status::text INTO v_status FROM public.invoices i WHERE i.id = p_invoice;
  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Invoice not found.' USING ERRCODE = '22023';
  END IF;
  IF v_status = 'voided' THEN
    RAISE EXCEPTION 'This invoice is voided.' USING ERRCODE = '22023';
  END IF;
  IF p_path IS NULL OR p_path NOT LIKE 'invoices/' || p_invoice::text || '/%' THEN
    RAISE EXCEPTION 'The file is not in this invoice''s folder.' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.file_objects o WHERE o.bucket_id = 'payment-attachments' AND o.name = p_path) THEN
    RAISE EXCEPTION 'The file did not arrive.' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.invoice_attachments (invoice_id, file_name, file_type, file_size, storage_path, uploaded_by)
  VALUES (p_invoice, left(coalesce(nullif(btrim(p_name), ''), 'file'), 255), coalesce(nullif(btrim(p_type), ''), 'application/octet-stream'),
          p_size, p_path, auth.uid())
  RETURNING id INTO v_id;
  RETURN v_id;
END
$fn$;


-- One file taken off an invoice: its row goes, and its path comes back for the file itself to be removed.
CREATE OR REPLACE FUNCTION public.invoice_attachment_remove(p_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_path   text;
  v_status text;
BEGIN
  PERFORM public.tab_write_guard(ARRAY['/invoices/[id]', '/statements'], ARRAY['billing.create']);
  IF auth.uid() IS NULL OR NOT coalesce(public.has_any_action(ARRAY['billing.create']), false) THEN
    RAISE EXCEPTION 'Attachments need Billing · Create.' USING ERRCODE = '42501';
  END IF;
  SELECT a.storage_path, i.status::text INTO v_path, v_status
    FROM public.invoice_attachments a JOIN public.invoices i ON i.id = a.invoice_id
   WHERE a.id = p_id
     FOR UPDATE OF a;
  IF v_path IS NULL THEN
    RAISE EXCEPTION 'That file is not there any more.' USING ERRCODE = '22023';
  END IF;
  IF v_status = 'voided' THEN
    RAISE EXCEPTION 'This invoice is voided.' USING ERRCODE = '22023';
  END IF;
  DELETE FROM public.invoice_attachments WHERE id = p_id;
  RETURN v_path;
END
$fn$;


-- The file itself may go once no invoice row names it (the RPC above ran first), for a Billing · Create session. Asked
-- through a definer: a policy's own reads run as the caller, and no session reads invoice_attachments.
CREATE OR REPLACE FUNCTION public.invoice_attachment_object_removable(p_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT p_name LIKE 'invoices/%'
     AND coalesce(public.has_any_action(ARRAY['billing.create']), false)
     AND NOT EXISTS (SELECT 1 FROM public.invoice_attachments a WHERE a.storage_path = p_name)
$fn$;
REVOKE ALL ON FUNCTION public.invoice_attachment_object_removable(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.invoice_attachment_object_removable(text) TO authenticated, service_role;

DROP POLICY IF EXISTS "invoice attachments: out" ON public.file_objects;
CREATE POLICY "invoice attachments: out" ON public.file_objects FOR DELETE
USING (bucket_id = 'payment-attachments' AND public.invoice_attachment_object_removable(name));


-- A voucher's PDF with its attachments reads payment_attachments under the PDF's own gate — Treasury · Export, or
-- HR Costing · Export for HR's payroll vouchers — so the table asks for those actions as well. Its rows stay the
-- treasury's (pa_select): HR's PDF simply carries no files.
INSERT INTO public.permission_table_reads (table_name, actions) VALUES
  ('payment_attachments', ARRAY['approvals.approve', 'approvals.view', 'director_salary.approve', 'hr_costing.approve', 'hr_costing.export', 'hr_costing.view:own', 'treasury.approve', 'treasury.create', 'treasury.edit', 'treasury.export', 'treasury.view'])
ON CONFLICT (table_name) DO UPDATE SET actions = EXCLUDED.actions;
SELECT public.permission_reads_guard('payment_attachments');


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

SELECT pg_temp.tab_guard('public.invoice_attachment_add(uuid, text, text, bigint, text)',
  $$ARRAY['/invoices/[id]', '/statements']$$, ARRAY['billing.create']);
SELECT pg_temp.tab_guard('public.invoice_attachment_remove(uuid)',
  $$ARRAY['/invoices/[id]', '/statements']$$, ARRAY['billing.create']);

REVOKE ALL ON FUNCTION public.invoice_attachments_of(uuid[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.invoice_attachment_add(uuid, text, text, bigint, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.invoice_attachment_remove(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.invoice_attachments_of(uuid[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.invoice_attachment_add(uuid, text, text, bigint, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.invoice_attachment_remove(uuid) TO authenticated, service_role;
