-- Ads counted together, the rest of it gone (2026-10-24, after 20261025124500 took the dealer back): once the screens no
-- longer call crm_save_ads_together nor read crm_ad_assign.together, both go, with crm_counted_leads — the schema as before
-- 20261025121500. Nothing else reads them: crm_campaign_given, crm_assign_contact and crm_save_ad_assign are production's
-- bodies of before again (124500).

drop function if exists public.crm_save_ads_together(jsonb, text, jsonb, text, jsonb, jsonb);
drop function if exists public.crm_counted_leads(text, timestamptz);
alter table public.crm_ad_assign drop column if exists together;
