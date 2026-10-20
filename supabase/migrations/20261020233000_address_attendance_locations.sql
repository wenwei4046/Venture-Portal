-- ============================================================================
-- 20261020233000_address_attendance_locations.sql
-- An Attendance location's address in six parts (2026-10-20 — the user: "所有关联到 address 的，都要跟着我刚才上面讲的
-- format 给他们去填"; the rule: .claude/rules/hr/people.md › AN ADDRESS IS SIX PARTS, mig 20261020230000).
-- ============================================================================
--
-- 1. att_locations: address_line1 … address_country — hr_staff_costs' names, so `lib/address` reads both. `address`
--    stays, the six on one line, put together by the BEFORE trigger att_locations_compose_address (address_compose;
--    '' for none — the column is NOT NULL) whenever a part is written; its CHECK grows from 200 characters to 1000
--    (two lines of 200 and the rest). `state` stays what it was: whose public holidays cover the location's people
--    (Settings › Holidays — 'Penang', 'Federal Territory' …), which the location window now sets from the address's
--    state (src/lib/attendance/holiday-states.ts).
-- 2. att_save_setting (production's dbc7a788…): a location's INSERT and UPDATE write the six parts (addressLine1 …
--    addressCountry, as my_record names them), and `address` is the trigger's. A row that names no part — a page from
--    before this change sends `address` alone — keeps the parts; its `address` is taken only for a location never
--    written in parts (once there are parts, they are the address).
-- 3. att_config (production's 910bf4c6…): each location carries the six parts.
-- Both bodies are production's, one statement swapped by pg_temp.swap_check; a body already swapped is left alone.
-- (Production keeps no comment lines inside a function body: the comments stay out here.)
-- PGlite: tests/member-sql/validate-address-locations.mjs (this migration verbatim, over production's own two bodies —
-- address-locations-production.sql, md5-checked).

-- ── 1. The six parts ─────────────────────────────────────────────────────────

ALTER TABLE public.att_locations ADD COLUMN IF NOT EXISTS address_line1 text;
ALTER TABLE public.att_locations ADD COLUMN IF NOT EXISTS address_line2 text;
ALTER TABLE public.att_locations ADD COLUMN IF NOT EXISTS address_postcode text;
ALTER TABLE public.att_locations ADD COLUMN IF NOT EXISTS address_city text;
ALTER TABLE public.att_locations ADD COLUMN IF NOT EXISTS address_state text;
ALTER TABLE public.att_locations ADD COLUMN IF NOT EXISTS address_country text;

ALTER TABLE public.att_locations DROP CONSTRAINT IF EXISTS att_locations_address_check;
ALTER TABLE public.att_locations ADD CONSTRAINT att_locations_address_check CHECK (length(address) <= 1000);
ALTER TABLE public.att_locations DROP CONSTRAINT IF EXISTS att_locations_address_parts_check;
ALTER TABLE public.att_locations ADD CONSTRAINT att_locations_address_parts_check CHECK (
  coalesce(length(address_line1), 0) <= 200 AND coalesce(length(address_line2), 0) <= 200
  AND coalesce(length(address_postcode), 0) <= 120 AND coalesce(length(address_city), 0) <= 120
  AND coalesce(length(address_state), 0) <= 120 AND coalesce(length(address_country), 0) <= 120);

COMMENT ON COLUMN public.att_locations.address IS
  'The address on one line: its six parts put together by att_locations_compose_address (address_compose) whenever a part is written — or, for a location whose parts were never written, its old one-box text.';
COMMENT ON COLUMN public.att_locations.state IS
  'Whose public holidays cover the location''s people — Settings › Holidays'' states (src/lib/attendance/holiday-states.ts), not the address''s state (address_state).';

CREATE OR REPLACE FUNCTION public.att_locations_compose_address()
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
  NEW.address := coalesce(public.address_compose(NEW.address_line1, NEW.address_line2, NEW.address_postcode,
                                                 NEW.address_city, NEW.address_state, NEW.address_country), '');
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS att_locations_compose_address ON public.att_locations;
CREATE TRIGGER att_locations_compose_address
  BEFORE INSERT OR UPDATE OF address_line1, address_line2, address_postcode, address_city, address_state, address_country
  ON public.att_locations
  FOR EACH ROW EXECUTE FUNCTION public.att_locations_compose_address();

-- ── 2. The writer and the reader ─────────────────────────────────────────────

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

SELECT pg_temp.swap_check('public.att_save_setting(text,uuid,jsonb)',
  $q$INSERT INTO public.att_locations (name, address, state, radius_m, lat, lng)
      VALUES (v_label, coalesce(p_row->>'address', ''), coalesce(p_row->>'state', ''),$q$,
  $q$INSERT INTO public.att_locations (name, address, address_line1, address_line2, address_postcode, address_city,
                                         address_state, address_country, state, radius_m, lat, lng)
      VALUES (v_label, coalesce(p_row->>'address', ''), nullif(btrim(p_row->>'addressLine1'), ''),
              nullif(btrim(p_row->>'addressLine2'), ''), nullif(btrim(p_row->>'addressPostcode'), ''),
              nullif(btrim(p_row->>'addressCity'), ''), nullif(btrim(p_row->>'addressState'), ''),
              nullif(btrim(p_row->>'addressCountry'), ''), coalesce(p_row->>'state', ''),$q$);

SELECT pg_temp.swap_check('public.att_save_setting(text,uuid,jsonb)',
  $q$UPDATE public.att_locations SET name = v_label, address = coalesce(p_row->>'address', ''), state = coalesce(p_row->>'state', ''),$q$,
  $q$UPDATE public.att_locations SET name = v_label,
             address = CASE WHEN p_row ? 'addressLine1' OR address_line1 IS NOT NULL THEN address ELSE coalesce(p_row->>'address', '') END,
             address_line1 = CASE WHEN p_row ? 'addressLine1' THEN nullif(btrim(p_row->>'addressLine1'), '') ELSE address_line1 END,
             address_line2 = CASE WHEN p_row ? 'addressLine1' THEN nullif(btrim(p_row->>'addressLine2'), '') ELSE address_line2 END,
             address_postcode = CASE WHEN p_row ? 'addressLine1' THEN nullif(btrim(p_row->>'addressPostcode'), '') ELSE address_postcode END,
             address_city = CASE WHEN p_row ? 'addressLine1' THEN nullif(btrim(p_row->>'addressCity'), '') ELSE address_city END,
             address_state = CASE WHEN p_row ? 'addressLine1' THEN nullif(btrim(p_row->>'addressState'), '') ELSE address_state END,
             address_country = CASE WHEN p_row ? 'addressLine1' THEN nullif(btrim(p_row->>'addressCountry'), '') ELSE address_country END,
             state = coalesce(p_row->>'state', ''),$q$);

SELECT pg_temp.swap_check('public.att_config()',
  $q$'locations', coalesce((SELECT jsonb_agg(jsonb_build_object('id', x.id, 'name', x.name, 'address', x.address, 'state', x.state,$q$,
  $q$'locations', coalesce((SELECT jsonb_agg(jsonb_build_object('id', x.id, 'name', x.name, 'address', x.address, 'state', x.state,
               'addressLine1', x.address_line1, 'addressLine2', x.address_line2, 'addressPostcode', x.address_postcode,
               'addressCity', x.address_city, 'addressState', x.address_state, 'addressCountry', x.address_country,$q$);
