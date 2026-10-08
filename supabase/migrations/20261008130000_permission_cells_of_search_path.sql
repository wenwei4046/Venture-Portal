-- permission_cells_of (20261008120000) was the one function of the permission
-- templates without a fixed search_path — Supabase's security advisor
-- (function_search_path_mutable). It reads nothing but its argument, so the
-- fix changes no behaviour; every other function there already sets it.

ALTER FUNCTION public.permission_cells_of(jsonb) SET search_path = public;
