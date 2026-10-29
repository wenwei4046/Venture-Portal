-- Lead View › a customer back from an ad gets the ad's reply again (2026-10-29 — the user: "如果客户第一次看了广告与我们
-- 连系，又再点广告进来，是否还会有自动回复的功能", told no, then "要"; .claude/rules/leads/lead-view.md › BACK FROM AN AD).
--
--   - Meta tells a customer who already has a thread and taps an ad again by a referral on its own (type OPEN_THREAD,
--     the ad's id and title, no message), and sometimes by a referral on the message itself. Both now keep the ad on the
--     conversation (ad_id, source_ad) and mark it lead_contacts.ad_again_at = the click, with "Came back from the ad …"
--     on the timeline: lead_ingest_ad_return(returns) for the first (only a conversation Lead View has — a new one comes
--     with its message), PRODUCTION's lead_ingest_messenger (md5 81363a67…) for the second (its existing-conversation
--     UPDATE swapped once).
--   - The customer's next message within the hour runs the reply rules again, as a first message does (PRODUCTION's
--     lead_flow_on_message, md5 b55553ca…, two swaps) — unless a template is waiting on them (that one answers, as
--     before), CS replied in the last 24 hours, or the Page wrote to them in the 24 hours before the click (a person in
--     Business Suite; the Page's own greeting at the click does not count). The mark is used once.

ALTER TABLE public.lead_contacts ADD COLUMN IF NOT EXISTS ad_again_at timestamptz;

-- Referrals on their own: [{pageId, psid, ad: {sourceId, headline}}]. Only conversations Lead View has.
CREATE OR REPLACE FUNCTION public.lead_ingest_ad_return(p_returns jsonb)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  r jsonb;
  v_brand public.lead_brands;
  v_mini uuid;
  v_c public.lead_contacts;
  v_ad text;
  v_head text;
  n integer := 0;
BEGIN
  FOR r IN SELECT * FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_returns) = 'array' THEN p_returns ELSE '[]'::jsonb END) LOOP
    v_ad := CASE WHEN coalesce(r->'ad'->>'sourceId', '') ~ '^[0-9]{5,30}$' THEN r->'ad'->>'sourceId' END;
    CONTINUE WHEN v_ad IS NULL OR coalesce(r->>'psid', '') !~ '^[0-9]{5,32}$';
    SELECT * INTO v_brand FROM public.lead_brands WHERE fb_page_id = r->>'pageId' AND deleted_at IS NULL;
    CONTINUE WHEN NOT FOUND;
    SELECT b.id INTO v_mini FROM public.lead_brands b
     WHERE b.deleted_at IS NULL AND b.fb_page_id IS NULL AND lower(b.name) = lower(v_brand.name) || ' mini';
    SELECT * INTO v_c FROM public.lead_contacts c
     WHERE c.channel = 'messenger' AND c.external_id = r->>'psid' AND (c.brand_id = v_brand.id OR c.brand_id = v_mini)
     ORDER BY c.created_at LIMIT 1 FOR UPDATE;
    CONTINUE WHEN NOT FOUND;
    v_head := left(btrim(coalesce(r->'ad'->>'headline', '')), 120);
    UPDATE public.lead_contacts
       SET ad_id = v_ad, source_ad = CASE WHEN v_head <> '' THEN v_head ELSE source_ad END, ad_again_at = now(), updated_at = now()
     WHERE id = v_c.id;
    PERFORM public.lead_event(v_c.id, 'Came back from the ad ' || CASE WHEN v_head <> '' THEN v_head ELSE v_ad END);
    n := n + 1;
  END LOOP;
  RETURN n;
END
$fn$;

REVOKE ALL ON FUNCTION public.lead_ingest_ad_return(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lead_ingest_ad_return(jsonb) TO service_role;

DO $do$
DECLARE
  v_swaps text[][] := ARRAY[
    ARRAY['public.lead_ingest_messenger(jsonb)',
          $$      UPDATE public.lead_contacts SET
        name = CASE WHEN name = '' THEN left(btrim(coalesce(m->>'name', '')), 80) ELSE name END,
        page_id = coalesce(page_id, m->>'pageId')
       WHERE id = v_c.id;$$,
          $$      UPDATE public.lead_contacts SET
        name = CASE WHEN name = '' THEN left(btrim(coalesce(m->>'name', '')), 80) ELSE name END,
        page_id = coalesce(page_id, m->>'pageId'),
        -- Back from an ad, told on the message itself (mig 20261029170010): the ad kept, the reply rules asked again.
        ad_id = coalesce(v_ad, ad_id),
        source_ad = CASE WHEN v_ad IS NOT NULL AND v_head <> '' THEN v_head ELSE source_ad END,
        ad_again_at = CASE WHEN v_ad IS NOT NULL THEN now() ELSE ad_again_at END
       WHERE id = v_c.id;
      IF v_ad IS NOT NULL AND (v_c.ad_again_at IS NULL OR v_c.ad_again_at < now() - interval '2 minutes') THEN
        PERFORM public.lead_event(v_c.id, 'Came back from the ad ' || CASE WHEN v_head <> '' THEN v_head ELSE v_ad END);
      END IF;$$,
          '81363a67c59972b2b10a3f00bc539951', ''],
    ARRAY['public.lead_flow_on_message()',
          $$  v_rule text;
BEGIN$$,
          $$  v_rule text;
  v_again boolean := false;
BEGIN$$,
          'b55553cafa0373854a71f1ed4d76e45f',
          $$  IF v_first AND c.flow_state = 'none' THEN$$ || chr(10) || $$    -- The reply rules first$$]];
  i int;
  v_sig regprocedure;
  v_src text;
  v_def text;
BEGIN
  FOR i IN 1 .. array_length(v_swaps, 1) LOOP
    v_sig := v_swaps[i][1]::regprocedure;
    SELECT prosrc INTO v_src FROM pg_proc WHERE oid = v_sig;
    IF position(v_swaps[i][3] IN v_src) > 0 THEN
      CONTINUE;
    END IF;
    IF md5(v_src) IS DISTINCT FROM v_swaps[i][4] THEN
      RAISE EXCEPTION '%: not the body this migration was written against (md5 %) — compare it with production first', v_sig, md5(v_src);
    END IF;
    IF (length(v_src) - length(replace(v_src, v_swaps[i][2], ''))) / length(v_swaps[i][2]) <> 1 THEN
      RAISE EXCEPTION '%: the text to swap is not there exactly once', v_sig;
    END IF;
    v_def := replace(pg_get_functiondef(v_sig), v_swaps[i][2], v_swaps[i][3]);
    -- The runner's second swap: where a first message asks the reply rules, a return from an ad asks them too.
    IF v_swaps[i][5] <> '' THEN
      IF (length(v_def) - length(replace(v_def, v_swaps[i][5], ''))) / length(v_swaps[i][5]) <> 1 THEN
        RAISE EXCEPTION '%: the first message''s branch is not there exactly once', v_sig;
      END IF;
      v_def := replace(v_def, v_swaps[i][5],
        $$  -- Back from an ad (mig 20261029170010): within the hour of the click, nobody of ours answering — the rules again.
  v_again := NOT v_first AND c.ad_again_at IS NOT NULL AND c.ad_again_at > now() - interval '1 hour'
    AND NOT EXISTS (SELECT 1 FROM public.lead_messages m WHERE m.contact_id = c.id AND m.sender = 'cs' AND m.created_at > now() - interval '24 hours')
    AND NOT EXISTS (SELECT 1 FROM public.lead_messages m WHERE m.contact_id = c.id AND m.sender = 'page'
                     AND m.created_at > c.ad_again_at - interval '24 hours' AND m.created_at < c.ad_again_at - interval '2 minutes');
  IF c.ad_again_at IS NOT NULL THEN
    UPDATE public.lead_contacts SET ad_again_at = NULL WHERE id = c.id;
  END IF;
  IF (v_first AND c.flow_state = 'none') OR v_again THEN
    -- The reply rules first$$);
    END IF;
    EXECUTE v_def;
  END LOOP;
END
$do$;

NOTIFY pgrst, 'reload schema';
