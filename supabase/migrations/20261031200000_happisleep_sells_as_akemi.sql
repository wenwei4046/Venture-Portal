-- ============================================================================
-- 20261031200000_happisleep_sells_as_akemi.sql
-- HappiSleep is Akemi's: one brand, one calculator, one margin ladder (2026-10-31).
-- ============================================================================
--
-- The user: "i need akemi calculater in revenue app, is including with happisleep, cause actaully they can under the
-- same brand, just happisleep is the subbrand of akemi, so the shena for magrin leader is same as well. dont need
-- seperate out"; then "this is consider sub brand of akemi, but we calculate as a same brand. so i dont differentiate
-- it out with 2 calcualtor, i wnat make them into one".
--
-- What the ERP says (2026-10-31): twelve SKUs — EASE COOL and FRESH COOL, each S / SS / Q / K / SK / SP — carry the
-- branding HAPPI SLEEP on the model and the SKU; every other HappiSleep item (ZEN COOL, SOLITUDE, PRIME COOL, the
-- pillows, protectors and bed linen) is branded AKEMI already. The portal names a brand by its code or its name
-- (erp_sync_brand_code) and knows no HAPPI SLEEP, so those two models sold under nothing: in no calculator, Modular
-- asked for a margin ladder, and a bill the ERP writes under HAPPI SLEEP would carry no brand and hold the month's
-- margin incentive ("some sales carry no brand").
--
--   comm_brands.sub_brands   the ERP brandings that ARE this brand. Akemi's: HAPPI SLEEP. Set on Rules › Brands.
--   erp_sync_brand_code      a brand by its code, its name, or one of its sub-brands — a brand's own code or name
--                            first, so a sub-brand never takes a word another brand is called by.
--
-- erp_sync_brand_code is the one place an ERP brand word becomes a portal brand, so this reaches every one at once:
-- the Quote's catalogue (catalogue_brand_of → member_catalogue: EASE COOL and FRESH COOL in Akemi's calculator, on
-- Akemi's ladder), a bill's brand at ingest and restamp (erp_sync_order_brand, sales_order_lines_brand,
-- sales_order_restamp_brand, ingest_erp_sales_order), a fair's booth (ingest_erp_sales_attending, the order books,
-- brand weeks) and the legacy price adoption. Its TypeScript twins answer the same: brandCodeFor (lib/brand-code.ts),
-- read by the Product List's loader, Modular's board and lib/exhibitions.ts. No bill changes: none the portal holds
-- names HAPPI SLEEP, and none of the twelve SKUs is on a bill yet.
--
-- erp_sync_brand_code from PRODUCTION's body — the repo's last copy, 20260905010000, is the same (md5 285ce8ea…) —
-- md5-checked first; what landed, at the end. PGlite: tests/member-sql/validate-happisleep-is-akemi.mjs (the migration
-- verbatim, twice, over member_catalogue as production runs it).

BEGIN;

DO $$
DECLARE
    v_md5 TEXT;
BEGIN
    SELECT md5(replace(prosrc, E'\r', '')) INTO v_md5
      FROM pg_proc WHERE oid = 'public.erp_sync_brand_code(text)'::regprocedure;
    IF v_md5 NOT IN ('285ce8ea21feef12b5250ac6be4ba6af', 'b0df3385c53987a71ca25a28e17d056e') THEN
        RAISE EXCEPTION 'erp_sync_brand_code is md5 %, not the body this migration was written from', v_md5;
    END IF;
END $$;

-- ── The ERP brandings a brand answers to besides its own code and name ─────
ALTER TABLE public.comm_brands ADD COLUMN IF NOT EXISTS sub_brands TEXT[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.comm_brands.sub_brands IS
    'The ERP brandings that are this brand (2026-10-31: HAPPI SLEEP is Akemi''s) — its calculator, its margin ladder. Upper case, as the ERP writes them.';

-- Akemi's — every scheme's (Fair's alone has brands on 2026-10-31).
UPDATE public.comm_brands
   SET sub_brands = sub_brands || ARRAY['HAPPI SLEEP']
 WHERE UPPER(BTRIM(code)) = 'AKEMI'
   AND NOT ('HAPPI SLEEP' = ANY (sub_brands));

-- ── A brand by its code, its name, or one of its sub-brands ────────────────
-- The ERP's Branding text → a comm_brands code, case-insensitively on the code, the name or a sub-brand, any active
-- scheme. Brands are per scheme but a code means the same brand everywhere.
CREATE OR REPLACE FUNCTION public.erp_sync_brand_code(p_name TEXT)
RETURNS TEXT
LANGUAGE sql
STABLE
SET search_path = public
AS $$
    SELECT b.code
    FROM comm_brands b
    WHERE p_name IS NOT NULL
      AND b.is_active
      AND (UPPER(BTRIM(b.code)) = UPPER(BTRIM(p_name)) OR UPPER(BTRIM(b.name)) = UPPER(BTRIM(p_name))
           OR UPPER(BTRIM(p_name)) IN (SELECT UPPER(BTRIM(s)) FROM UNNEST(b.sub_brands) AS s))
    -- A brand's own code or name before another brand's sub-brand of the same word.
    ORDER BY CASE WHEN UPPER(BTRIM(b.code)) = UPPER(BTRIM(p_name)) OR UPPER(BTRIM(b.name)) = UPPER(BTRIM(p_name))
                  THEN 0 ELSE 1 END,
             b.created_at
    LIMIT 1;
$$;

-- ── What landed ─────────────────────────────────────────────────────────────
DO $$
DECLARE
    v_md5 TEXT;
BEGIN
    SELECT md5(replace(prosrc, E'\r', '')) INTO v_md5
      FROM pg_proc WHERE oid = 'public.erp_sync_brand_code(text)'::regprocedure;
    IF v_md5 <> 'b0df3385c53987a71ca25a28e17d056e' THEN
        RAISE EXCEPTION 'erp_sync_brand_code is md5 %, not the body this migration makes', v_md5;
    END IF;
END $$;

COMMIT;

-- Rollback, in words: put back erp_sync_brand_code from 20260905010000 (md5 285ce8ea…), then drop
-- comm_brands.sub_brands.
