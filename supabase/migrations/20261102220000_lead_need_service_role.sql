-- Lead View: `lead_need` knows the service role on every connection (2026-11-02, found right after mig 20261102210000).
--
-- Mig 20261102170000 let the service role through `lead_need` by its JWT role: `request.jwt.claim.role`, else the role
-- in `request.jwt.claims`. But a custom setting once set on a pooled connection reads back as '' (not NULL) afterwards,
-- and coalesce stops at '': the service role was refused on such a connection — and since mig 20261102210000 the
-- outbox (the templates' messages) asks `lead_need` too. Now an empty setting counts as unset (nullif), and the role in
-- `request.jwt.claims` (what PostgREST sets) is read first.
--
-- PRODUCTION's lead_need (md5 c18c8f74…, = mig 20261102170000's) with one swap, found exactly once.

DO $do$
DECLARE
  v_sig regprocedure := 'public.lead_need(text[], text)'::regprocedure;
  v_src text;
  v_def text;
  v_old text := $$     AND coalesce(current_setting('request.jwt.claim.role', true), current_setting('request.jwt.claims', true)::jsonb ->> 'role', '') <> 'service_role' THEN$$;
  v_new text := $$     -- An empty setting is an unset one: a custom setting once set on a pooled connection reads back as '' (mig 20261102220000).
     AND coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', nullif(current_setting('request.jwt.claim.role', true), ''), '') <> 'service_role' THEN$$;
BEGIN
  SELECT prosrc INTO v_src FROM pg_proc WHERE oid = v_sig;
  IF position('mig 20261102220000' IN v_src) > 0 THEN
    RETURN;
  END IF;
  IF md5(v_src) IS DISTINCT FROM 'c18c8f743fa634e5f8378da94fbd5981' THEN
    RAISE EXCEPTION '%: not the body this migration was written against (md5 %) — compare it with production first', v_sig, md5(v_src);
  END IF;
  v_def := pg_get_functiondef(v_sig);
  IF (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old) <> 1 THEN
    RAISE EXCEPTION '%: the text to swap is not there exactly once', v_sig;
  END IF;
  EXECUTE replace(v_def, v_old, v_new);
END
$do$;

NOTIFY pgrst, 'reload schema';
