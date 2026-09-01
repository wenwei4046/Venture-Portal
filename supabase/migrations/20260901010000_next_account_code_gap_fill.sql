-- 2026-09-01: creating a Revenue account failed with "range exhausted" —
-- next_account_code was MAX+1 within the range, and 5999 Discount Allowed
-- sits at the very top of 5000-5999, so MAX+1 overflowed with only ~15 codes
-- actually used (same disease as 1900 Opening Balance Clearing → 1901).
-- Allocate the SMALLEST FREE code in the range instead.
CREATE OR REPLACE FUNCTION public.next_account_code(p_type account_type)
 RETURNS character varying
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_start INT; v_end INT; v_next INT;
BEGIN
  CASE p_type
    WHEN 'equity'        THEN v_start := 1000; v_end := 1999;
    WHEN 'fixed_asset'   THEN v_start := 2000; v_end := 2999;
    WHEN 'asset'         THEN v_start := 3000; v_end := 3999;
    WHEN 'liability'     THEN v_start := 4000; v_end := 4999;
    WHEN 'revenue'       THEN v_start := 5000; v_end := 5999;
    WHEN 'cost'          THEN v_start := 6000; v_end := 6999;
    WHEN 'other_income'  THEN v_start := 7000; v_end := 7999;
    WHEN 'expense'       THEN v_start := 9000; v_end := 9999;
    ELSE
      RAISE EXCEPTION 'next_account_code: unknown account_type %', p_type;
  END CASE;

  SELECT MIN(candidate) INTO v_next
  FROM generate_series(v_start, v_end) AS candidate
  WHERE NOT EXISTS (
    SELECT 1 FROM chart_of_accounts c WHERE c.code = candidate::text
  );

  IF v_next IS NULL THEN
    RAISE EXCEPTION '% range exhausted (all % codes used)', p_type, v_end - v_start + 1;
  END IF;
  RETURN v_next::TEXT;
END $function$;
