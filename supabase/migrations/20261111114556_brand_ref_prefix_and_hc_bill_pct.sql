-- Sales by Brand & Billing export (2026-11-11, the user: an Export on the
-- Comm Cal month page, "the detail same as the attached Excel"
-- — Revenue-Team-Sep-2026-Sales-by-Brand-Billing.xlsx).
--
-- Two facts the portal did not hold, both set on Rules › Brands & margin bands:
--   ref_prefixes  — the paper's Ref No. prefix that names the brand
--                   (HC = Akemi, ZNT = Zanotti, PG = Dunlop, EGT = Ergotex);
--                   the user chose the Ref No. over the bill's brand_code.
--   hc_bill_pct   — "Houzs Venture bill to Houzs Century": Bill = the brand's
--                   total sales × this %. A fraction (0.14 = 14%); NULL = not set.
-- Seeded from the September file; edited in Rules from now on.
--
-- Rollback: alter table comm_brands drop column ref_prefixes, drop column hc_bill_pct.

alter table comm_brands
  add column if not exists ref_prefixes text[] not null default '{}',
  add column if not exists hc_bill_pct numeric(6,4)
    check (hc_bill_pct is null or (hc_bill_pct >= 0 and hc_bill_pct <= 1));

update comm_brands set ref_prefixes = '{HC}',  hc_bill_pct = 0.14 where code = 'AKEMI'   and ref_prefixes = '{}';
update comm_brands set ref_prefixes = '{ZNT}', hc_bill_pct = 0.13 where code = 'ZANOTTI' and ref_prefixes = '{}';
update comm_brands set ref_prefixes = '{PG}',  hc_bill_pct = 0.13 where code = 'DUNLOP'  and ref_prefixes = '{}';
update comm_brands set ref_prefixes = '{EGT}', hc_bill_pct = 0.14 where code = 'ERGOTEX' and ref_prefixes = '{}';
