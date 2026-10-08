-- A role for everybody whose access comes wholly from their title's permission
-- template (2026-10-08).
--
-- The user does not want a role at all ("到最后是跟着 title 的 permission 走"):
-- Invite no longer asks for one, and the role an account gets is the hidden
-- `base_role` of its title's template (20261008120000). Most templates are not
-- Principal / Finance / HR / Dept Manager / Revenue member — a Director, the
-- executive office, a marketing executive — and every one of those roles carries
-- something besides permissions (role defaults, a dept_manager's own-department
-- rows, role-specific screens). `staff` carries nothing: no defaults, no rows,
-- no screens of its own. What its holder may do is their template, and only
-- that, until the last gates that read a role are gone.
--
-- Its own migration: a new enum value cannot be used in the transaction that
-- adds it.

ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'staff';
