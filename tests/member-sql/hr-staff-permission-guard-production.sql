CREATE OR REPLACE FUNCTION public.hr_staff_permission_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_from uuid;
  v_to   uuid;
BEGIN
  IF NEW.user_id IS NULL OR auth.uid() IS NULL OR public.has_perm('permissions_manage') THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.user_id IS NOT DISTINCT FROM OLD.user_id AND NEW.title_id IS NOT DISTINCT FROM OLD.title_id THEN
      RETURN NEW;
    END IF;
    IF NEW.user_id IS NOT DISTINCT FROM OLD.user_id THEN
      SELECT template_id INTO v_from FROM public.titles WHERE id = OLD.title_id;
      SELECT template_id INTO v_to FROM public.titles WHERE id = NEW.title_id;
      IF v_from IS NOT DISTINCT FROM v_to THEN RETURN NEW; END IF;
    END IF;
  END IF;
  RAISE EXCEPTION 'This person signs in: moving them to a title on another permission template changes what they can do. Ask whoever manages permissions.'
    USING ERRCODE = '42501';
END
$function$
;
