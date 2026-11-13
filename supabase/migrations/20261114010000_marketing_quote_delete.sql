-- Marketing — a draft quotation is deleted (2026-11-14). The user, of the Quotations tab: "quota 的资料全删，也要有可删除
-- 的功能", then, asked which may go: "只有 Draft 能删" — a quotation sent or accepted stays (a client has seen it, or its work
-- has started).
--
-- mkt_quote_delete(id, rev): Marketing · Manage, as every quotation write; only a draft, on the count the page last saw
-- (somebody's newer save is never deleted unseen); its versions (none for a draft that was never sent) go with it.
-- Its number may be given again to the next quotation of the month (a draft was never sent to anybody).
-- PGlite: tests/member-sql/validate-marketing-quotes.mjs (its last section).

CREATE OR REPLACE FUNCTION public.mkt_quote_delete(p_id uuid, p_rev integer)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_q  public.mkt_quotes;
  v_by text;
BEGIN
  PERFORM public.mkt_need(ARRAY['marketing.manage'], 'Quotations are the manager''s.');
  SELECT * INTO v_q FROM public.mkt_quotes WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That quotation is not there any more.' USING ERRCODE = 'P0002';
  END IF;
  IF p_rev IS DISTINCT FROM v_q.rev THEN
    v_by := coalesce((SELECT u.name FROM public.users u WHERE u.id = v_q.updated_by), 'Somebody');
    RAISE EXCEPTION '% changed this quotation since you opened it — reload to see it.', v_by USING ERRCODE = '40001';
  END IF;
  IF v_q.status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'Only a draft is deleted — % is %.', v_q.no, v_q.status USING ERRCODE = '22023';
  END IF;
  DELETE FROM public.mkt_quote_versions WHERE quote_id = v_q.id;
  DELETE FROM public.mkt_quotes WHERE id = v_q.id;
  RETURN jsonb_build_object('id', v_q.id, 'no', v_q.no);
END
$fn$;

REVOKE ALL ON FUNCTION public.mkt_quote_delete(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mkt_quote_delete(uuid, integer) TO authenticated;

NOTIFY pgrst, 'reload schema';
