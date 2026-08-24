-- 2026-08-24: Monthly R&P per-debtor rows ignored collections because settle
-- receipts carry payee_name '—'. For invoice-linked vouchers the linked
-- invoice's bill-to (short_code → company name → dept name → freetext) is the
-- real counterparty; placeholder '—' payees are dropped entirely.
CREATE OR REPLACE FUNCTION public.voucher_party_refs()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    (SELECT jsonb_agg(jsonb_build_object('id', pv.id, 'payee', p.payee))
     FROM payment_vouchers pv
     CROSS JOIN LATERAL (
       SELECT COALESCE(
         (SELECT COALESCE(NULLIF(c.short_code, ''), c.name, d.name, NULLIF(i.billable_to_freetext_name, ''))
            FROM invoices i
            LEFT JOIN companies c ON c.id = i.company_id
            LEFT JOIN departments d ON d.id = i.billable_to_department_id AND d.is_internal = false
           WHERE i.id = pv.invoice_id),
         NULLIF(TRIM(pv.payee_name), ''),
         NULL
       ) AS payee
     ) p
     WHERE p.payee IS NOT NULL AND p.payee <> '—'),
    '[]'::jsonb
  );
$function$;
