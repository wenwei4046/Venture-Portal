-- Lead View › a template's options as long as they need (2026-10-29 — the user, on Reply templates: "button 不要限制字数";
-- .claude/rules/leads/lead-view.md › LONG OPTIONS, BOLD AND ITALIC). Messenger's quick-reply button still shows 20
-- characters (Meta's rule): the app writes a long option's first characters on the button, lists every option in full in
-- the message, and carries the whole option back in the button's payload, so the template reads the tap as the option.
-- PRODUCTION's lead_template_problem (md5 88621c44…) allows 200 characters instead of 20 — its check and its words.

DO $do$
DECLARE
  v_sig regprocedure := 'public.lead_template_problem(jsonb)'::regprocedure;
  v_src text;
  v_new text;
BEGIN
  SELECT prosrc INTO v_src FROM pg_proc WHERE oid = v_sig;
  IF position('length(b->>''label'') > 200' IN v_src) > 0 THEN
    RETURN;
  END IF;
  IF md5(v_src) IS DISTINCT FROM '88621c4466fed9cf166b5e4cbf9674f4' THEN
    RAISE EXCEPTION '%: not the body this migration was written against (md5 %) — compare it with production first', v_sig, md5(v_src);
  END IF;
  IF (length(v_src) - length(replace(v_src, 'length(b->>''label'') > 20 THEN', ''))) / length('length(b->>''label'') > 20 THEN') <> 1
     OR (length(v_src) - length(replace(v_src, '''An option says 1 to 20 characters.''', ''))) / length('''An option says 1 to 20 characters.''') <> 1 THEN
    RAISE EXCEPTION '%: the text to swap is not there exactly once', v_sig;
  END IF;
  v_new := replace(replace(pg_get_functiondef(v_sig),
    'length(b->>''label'') > 20 THEN', 'length(b->>''label'') > 200 THEN'),
    '''An option says 1 to 20 characters.''', '''An option says 1 to 200 characters.''');
  EXECUTE v_new;
END
$do$;
