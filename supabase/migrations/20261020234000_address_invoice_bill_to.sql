-- ============================================================================
-- 20261020234000_address_invoice_bill_to.sql
-- A typed bill-to's address in six parts (2026-10-20 — the user: "所有关联到 address 的，都要跟着我刚才上面讲的 format 给他们去填";
-- the rule: .claude/rules/hr/people.md › AN ADDRESS IS SIX PARTS, and THE CITY IS THE PLACE'S OWN NAME).
-- ============================================================================
--
-- An invoice billed to a party typed by hand (billable_to_type 'freetext') kept its address as one box. It is now the
-- portal's six parts, picked as everywhere else, held whole as `billable_to_freetext_address_parts` — jsonb, the app's
-- Address: { line1, line2, postcode, city, state, country } (src/lib/address/address.ts). An invoice is a document and
-- its address a snapshot no query reads by part, so one value, not six columns. `billable_to_freetext_address` stays
-- the one line the page, the drawer and the Finance app read: the parts put together by the Server Action
-- (`partyAddress` — never taken as the browser sent it). The invoices already billed to a typed party keep their text
-- and no parts (their dialog shows it On file; the PDF prints it as typed).
--
-- 1. invoices.billable_to_freetext_address_parts — an object or NULL. `invoices` is granted whole to authenticated.
-- 2. amend_issued_invoice (production's ec915120…): the parts as the header names them — an object, else NULL —
--    beside the one line. A header without them (a page from before) leaves the parts NULL and the line as sent.
-- (pg_temp.swap_check: production's body, one statement swapped; a body already swapped is left alone.)
-- PGlite: tests/member-sql/validate-address-invoice.mjs (this migration verbatim over production's own body —
-- address-invoice-production.sql, md5-checked).

ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS billable_to_freetext_address_parts jsonb;
ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_freetext_address_parts_check;
ALTER TABLE public.invoices ADD CONSTRAINT invoices_freetext_address_parts_check
  CHECK (billable_to_freetext_address_parts IS NULL OR jsonb_typeof(billable_to_freetext_address_parts) = 'object');

COMMENT ON COLUMN public.invoices.billable_to_freetext_address_parts IS
  'A typed bill-to''s address in its six parts — { line1, line2, postcode, city, state, country } (src/lib/address/address.ts) — picked State → City → Postcode from the official list; billable_to_freetext_address is them on one line. NULL for an invoice billed before the parts (2026-10-20).';

CREATE OR REPLACE FUNCTION pg_temp.swap_check(p_sig regprocedure, p_old text, p_new text)
RETURNS void
LANGUAGE plpgsql AS $fn$
DECLARE
  v_src   text := (SELECT prosrc FROM pg_proc WHERE oid = p_sig);
  v_pat   text;
  v_found text;
  v_n     integer;
BEGIN
  IF strpos(v_src, p_new) > 0 THEN
    RETURN;  -- already swapped
  END IF;
  -- The old statement, every run of whitespace matching any run.
  v_pat := regexp_replace(regexp_replace(p_old, '([.^$*+?()\[\]{}|\\])', '\\\1', 'g'), '\s+', '\\s+', 'g');
  SELECT count(*) INTO v_n FROM regexp_matches(v_src, v_pat, 'g');
  IF v_n <> 1 THEN
    RAISE EXCEPTION '%: its statement is there % times, not once — production changed since this migration was written', p_sig, v_n;
  END IF;
  v_found := (regexp_match(v_src, '(' || v_pat || ')'))[1];
  EXECUTE replace(pg_get_functiondef(p_sig), v_found, p_new);
END
$fn$;

SELECT pg_temp.swap_check('public.amend_issued_invoice(uuid,jsonb,jsonb,jsonb,text)',
  $q$billable_to_freetext_address = NULLIF(p_header->>'billable_to_freetext_address', ''),$q$,
  $q$billable_to_freetext_address = NULLIF(p_header->>'billable_to_freetext_address', ''),
        billable_to_freetext_address_parts = CASE WHEN jsonb_typeof(p_header->'billable_to_freetext_address_parts') = 'object'
                                                  THEN p_header->'billable_to_freetext_address_parts' END,$q$);
