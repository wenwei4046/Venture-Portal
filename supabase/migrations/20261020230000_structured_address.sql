-- ============================================================================
-- 20261020230000_structured_address.sql
-- A person's address in six parts (2026-10-20 — the user: "凡是有提到 address 的东西（比如在 People Management 那边），
-- 填写的 format 要区分成 address 1、address 2、postcode、state、city，国家 default 是 Malaysia"; "确保 city、state 还有
-- postcode 跟 Malaysia 的 database 是一样的 … 不是填的，应该都是选的"; the order, asked the same day: "go with state,
-- city, postcode").
-- ============================================================================
--
-- The portal kept an address as one box of text. It is now Address line 1, Address line 2, State, City, Postcode
-- (the three picked in that order from Pos Malaysia's list, src/lib/address/malaysia-postcodes.json — the app and its
-- Server Actions check the three belong together) and Country (Malaysia unless another is picked; abroad the three
-- are typed).
--
-- 1. hr_staff_costs: address_line1, address_line2, address_postcode, address_city, address_state, address_country —
--    granted to authenticated like every column a page reads (src/lib/private-columns.ts). `address` stays: the six
--    put together on one line (`address_compose`, the app's `addressText` word for word) by the BEFORE trigger
--    `hr_staff_costs_compose_address` whenever a part is written — or the old box's own text for a record whose parts
--    were never written (nothing older is rewritten here; a person's own text is moved into parts by
--    scripts/backfill-structured-addresses.mjs, where it reads as one place on the list, and checked by eye).
--
-- 2. Four readers and writers (production's bodies, one statement swapped in each by pg_temp.swap_check — a body
--    already swapped is left alone):
--    * team_directory (md5 1e99de7d…): a directory reader's rows carry the six parts, and first_name / last_name
--      (People lists the full name, 2026-10-20);
--    * my_record (026659f4… — production's text ends its lines \r\n): Me's own record carries the six parts
--      (addressLine1 … addressCountry);
--    * att_profile_changes (0523f3b4…): a profile change may name the six parts (Me's Edit profile sends a changed
--      address as all six; what equals the record is dropped, as for every field);
--    * att_profile_apply (833ca652…): an approved change writes them — the trigger puts `address` together.
--
-- (Production keeps no comment lines inside a function body: the comments stay out here.)
-- PGlite: tests/member-sql/validate-structured-address.mjs (this migration verbatim, over production's own four
-- bodies — structured-address-production.sql, md5-checked).

-- ── 1. The six parts ─────────────────────────────────────────────────────────

ALTER TABLE public.hr_staff_costs ADD COLUMN IF NOT EXISTS address_line1 text;
ALTER TABLE public.hr_staff_costs ADD COLUMN IF NOT EXISTS address_line2 text;
ALTER TABLE public.hr_staff_costs ADD COLUMN IF NOT EXISTS address_postcode text;
ALTER TABLE public.hr_staff_costs ADD COLUMN IF NOT EXISTS address_city text;
ALTER TABLE public.hr_staff_costs ADD COLUMN IF NOT EXISTS address_state text;
ALTER TABLE public.hr_staff_costs ADD COLUMN IF NOT EXISTS address_country text;

GRANT SELECT (address_line1, address_line2, address_postcode, address_city, address_state, address_country) ON public.hr_staff_costs TO authenticated;

COMMENT ON COLUMN public.hr_staff_costs.address IS
  'The address on one line: its six parts put together by hr_staff_costs_compose_address (address_compose) whenever a part is written — or, for a record whose parts were never written, the old box''s own text.';
COMMENT ON COLUMN public.hr_staff_costs.address_state IS
  'In Malaysia one of Pos Malaysia''s sixteen states as src/lib/address/malaysia-postcodes.json names them (W.P. Kuala Lumpur …); the city and postcode are that state''s, picked in that order.';

-- The six on one line, as the app's addressText puts them: line 1, line 2, "postcode city", state, country —
-- each trimmed, a run of spaces one space, a blank part left out, the country Malaysia unless another; NULL for none.
CREATE OR REPLACE FUNCTION public.address_compose(p_line1 text, p_line2 text, p_postcode text, p_city text, p_state text, p_country text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  WITH p AS (
    SELECT nullif(regexp_replace(btrim(coalesce(p_line1, '')), '\s+', ' ', 'g'), '') AS line1,
           nullif(regexp_replace(btrim(coalesce(p_line2, '')), '\s+', ' ', 'g'), '') AS line2,
           nullif(regexp_replace(btrim(coalesce(p_postcode, '')), '\s+', ' ', 'g'), '') AS postcode,
           nullif(regexp_replace(btrim(coalesce(p_city, '')), '\s+', ' ', 'g'), '') AS city,
           nullif(regexp_replace(btrim(coalesce(p_state, '')), '\s+', ' ', 'g'), '') AS state,
           nullif(regexp_replace(btrim(coalesce(p_country, '')), '\s+', ' ', 'g'), '') AS country
  )
  SELECT CASE
           WHEN line1 IS NULL AND line2 IS NULL AND postcode IS NULL AND city IS NULL AND state IS NULL THEN NULL
           ELSE concat_ws(', ', line1, line2, nullif(concat_ws(' ', postcode, city), ''), state, coalesce(country, 'Malaysia'))
         END
    FROM p
$$;

COMMENT ON FUNCTION public.address_compose(text, text, text, text, text, text) IS
  'An address''s six parts on one line, as src/lib/address/address.ts addressText puts them (2026-10-20).';
-- The trigger calls it as whoever writes the row.
REVOKE ALL ON FUNCTION public.address_compose(text, text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.address_compose(text, text, text, text, text, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.hr_staff_costs_compose_address()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT'
     AND coalesce(NEW.address_line1, NEW.address_line2, NEW.address_postcode, NEW.address_city, NEW.address_state) IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE'
     AND (NEW.address_line1, NEW.address_line2, NEW.address_postcode, NEW.address_city, NEW.address_state, NEW.address_country)
         IS NOT DISTINCT FROM
         (OLD.address_line1, OLD.address_line2, OLD.address_postcode, OLD.address_city, OLD.address_state, OLD.address_country) THEN
    RETURN NEW;
  END IF;
  NEW.address := public.address_compose(NEW.address_line1, NEW.address_line2, NEW.address_postcode,
                                        NEW.address_city, NEW.address_state, NEW.address_country);
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS hr_staff_costs_compose_address ON public.hr_staff_costs;
CREATE TRIGGER hr_staff_costs_compose_address
  BEFORE INSERT OR UPDATE OF address_line1, address_line2, address_postcode, address_city, address_state, address_country
  ON public.hr_staff_costs
  FOR EACH ROW EXECUTE FUNCTION public.hr_staff_costs_compose_address();

-- ── 2. The readers and the profile change ────────────────────────────────────

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

SELECT pg_temp.swap_check('public.team_directory(uuid[])',
  $q$'contact_number', s.contact_number, 'email', s.email, 'address', s.address,$q$,
  $q$'contact_number', s.contact_number, 'email', s.email, 'address', s.address,
             'address_line1', s.address_line1, 'address_line2', s.address_line2, 'address_postcode', s.address_postcode,
             'address_city', s.address_city, 'address_state', s.address_state, 'address_country', s.address_country,
             'first_name', s.first_name, 'last_name', s.last_name,$q$);

SELECT pg_temp.swap_check('public.my_record()',
  $q$'phone', s.contact_number, 'email', s.email, 'address', s.address,$q$,
  $q$'phone', s.contact_number, 'email', s.email, 'address', s.address,
             'addressLine1', s.address_line1, 'addressLine2', s.address_line2, 'addressPostcode', s.address_postcode,
             'addressCity', s.address_city, 'addressState', s.address_state, 'addressCountry', s.address_country,$q$);

SELECT pg_temp.swap_check('public.att_profile_changes(uuid,jsonb)',
  $q$"address": "Address",$q$,
  $q$"address": "Address", "address_line1": "Address line 1", "address_line2": "Address line 2", "address_postcode": "Postcode",
    "address_city": "City", "address_state": "State", "address_country": "Country",$q$);

SELECT pg_temp.swap_check('public.att_profile_apply(uuid)',
  $q$'contact_number', 'email', 'address', 'emergency_contact_name', 'emergency_contact_phone',$q$,
  $q$'contact_number', 'email', 'address', 'address_line1', 'address_line2', 'address_postcode', 'address_city',
                         'address_state', 'address_country', 'emergency_contact_name', 'emergency_contact_phone',$q$);
