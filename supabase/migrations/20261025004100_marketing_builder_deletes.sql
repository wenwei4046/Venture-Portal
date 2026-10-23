-- Marketing (2026-10-24) — the user's answer 8 ("可以删（只限从没发布、没被用过的）"): a workflow template, a minutes
-- template or a product that was never published may be deleted by the manager (the handoff deletes nothing; a product
-- once on sale is retired instead, a template once published keeps its versions). Never published means never used — a
-- project starts only on a published version. A draft a product's draft still links is refused, in words, until the
-- product lets it go: deleting it would leave the product pointing at nothing.
--
--   mkt_workflow_delete(id, rev)  Marketing · Manage — a template never published, on the draft count it was opened on
--   mkt_minutes_delete(id, rev)   Marketing · Manage — the same, a minutes template no product names as its intake
--   mkt_product_delete(id, rev)   Marketing · Manage — a product still a draft
--
-- PGlite: tests/member-sql/validate-marketing-products.mjs (its last section).

CREATE OR REPLACE FUNCTION public.mkt_workflow_delete(p_id uuid, p_rev integer)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_w       public.mkt_workflows;
  v_by      text;
  v_product text;
BEGIN
  PERFORM public.mkt_need(ARRAY['marketing.manage'], 'The Workflow Builder is the manager''s.');
  SELECT * INTO v_w FROM public.mkt_workflows WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That template is not there any more.' USING ERRCODE = 'P0002';
  END IF;
  IF v_w.version > 0 THEN
    RAISE EXCEPTION 'A template once published stays — its versions are kept.' USING ERRCODE = '22023';
  END IF;
  IF p_rev IS DISTINCT FROM v_w.draft_rev THEN
    v_by := coalesce((SELECT u.name FROM public.users u WHERE u.id = v_w.updated_by), 'Somebody');
    RAISE EXCEPTION '% changed this template since you opened it — reload to see it.', v_by USING ERRCODE = '40001';
  END IF;
  SELECT coalesce(nullif(p.name, ''), p.code) INTO v_product
    FROM public.mkt_products p
   CROSS JOIN LATERAL jsonb_array_elements(p.groups) g
   CROSS JOIN LATERAL jsonb_array_elements(coalesce(g -> 'items', '[]'::jsonb)) i
   WHERE i ->> 'workflow' = p_id::text
   ORDER BY p.code
   LIMIT 1;
  IF v_product IS NOT NULL THEN
    RAISE EXCEPTION 'The product "%" links this template — unlink it there first.', v_product USING ERRCODE = '22023';
  END IF;
  DELETE FROM public.mkt_workflows WHERE id = p_id;
END
$fn$;

CREATE OR REPLACE FUNCTION public.mkt_minutes_delete(p_id uuid, p_rev integer)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_t       public.mkt_minutes_templates;
  v_by      text;
  v_product text;
BEGIN
  PERFORM public.mkt_need(ARRAY['marketing.manage'], 'The Minutes Builder is the manager''s.');
  SELECT * INTO v_t FROM public.mkt_minutes_templates WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That template is not there any more.' USING ERRCODE = 'P0002';
  END IF;
  IF v_t.version > 0 THEN
    RAISE EXCEPTION 'A template once published stays — its versions are kept.' USING ERRCODE = '22023';
  END IF;
  IF p_rev IS DISTINCT FROM v_t.draft_rev THEN
    v_by := coalesce((SELECT u.name FROM public.users u WHERE u.id = v_t.updated_by), 'Somebody');
    RAISE EXCEPTION '% changed this template since you opened it — reload to see it.', v_by USING ERRCODE = '40001';
  END IF;
  SELECT coalesce(nullif(p.name, ''), p.code) INTO v_product
    FROM public.mkt_products p WHERE p.intake_id = p_id ORDER BY p.code LIMIT 1;
  IF v_product IS NOT NULL THEN
    RAISE EXCEPTION 'The product "%" takes this template as its intake — pick another there first.', v_product USING ERRCODE = '22023';
  END IF;
  DELETE FROM public.mkt_minutes_templates WHERE id = p_id;
END
$fn$;

CREATE OR REPLACE FUNCTION public.mkt_product_delete(p_id uuid, p_rev integer)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_p  public.mkt_products;
  v_by text;
BEGIN
  PERFORM public.mkt_need(ARRAY['marketing.manage'], 'The Product Builder is the manager''s.');
  SELECT * INTO v_p FROM public.mkt_products WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That product is not there any more.' USING ERRCODE = 'P0002';
  END IF;
  IF v_p.version > 0 THEN
    RAISE EXCEPTION 'A product once on sale is retired, not deleted.' USING ERRCODE = '22023';
  END IF;
  IF p_rev IS DISTINCT FROM v_p.draft_rev THEN
    v_by := coalesce((SELECT u.name FROM public.users u WHERE u.id = v_p.updated_by), 'Somebody');
    RAISE EXCEPTION '% changed this product since you opened it — reload to see it.', v_by USING ERRCODE = '40001';
  END IF;
  DELETE FROM public.mkt_products WHERE id = p_id;
END
$fn$;

REVOKE ALL ON FUNCTION public.mkt_workflow_delete(uuid, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mkt_minutes_delete(uuid, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mkt_product_delete(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mkt_workflow_delete(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mkt_minutes_delete(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mkt_product_delete(uuid, integer) TO authenticated;
