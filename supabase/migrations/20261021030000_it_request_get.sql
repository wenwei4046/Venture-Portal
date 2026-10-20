-- A notification can name an older request outside the latest 100 personal / 300 desk rows.
-- Read that exact request with the same owner-or-IT-view boundary, including its notes and files.
-- This adds one reader; the existing list, write and JSON functions stay unchanged.
CREATE FUNCTION public.it_request_get(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_me uuid := auth.uid();
  v_id uuid;
BEGIN
  IF v_me IS NULL OR NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = v_me AND u.is_active) THEN
    RAISE EXCEPTION 'Sign in with an active account.' USING ERRCODE = '42501';
  END IF;

  SELECT r.id INTO v_id
    FROM public.it_requests r
   WHERE r.id = p_id
     AND (r.sent_by = v_me OR coalesce(public.has_any_action(ARRAY['it_requests.view']), false));
  IF v_id IS NULL THEN
    -- An inaccessible ID and an absent ID have the same answer.
    RAISE EXCEPTION 'This IT request was not found.' USING ERRCODE = '42501';
  END IF;

  RETURN public.it_requests_json(ARRAY[v_id]) -> 0;
END
$fn$;

REVOKE ALL ON FUNCTION public.it_request_get(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.it_request_get(uuid) TO authenticated, service_role;
