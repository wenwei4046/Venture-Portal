-- ============================================================================
-- 20260101000067_director_pin.sql
-- Director section PIN protection
-- HOUZS Venture Portal (VP)
--
-- 6-digit PIN stored as bcrypt hash in treasury_config.
-- Principal manages PIN via Settings > Directors tab.
-- Finance must enter PIN to access Director Salary / Director Pool pages.
-- ============================================================================

-- Store PIN hash and lockout state in treasury_config
INSERT INTO treasury_config (config_key, config_value, description)
VALUES
  ('director_pin_hash', 0, 'Bcrypt hash of 6-digit Director section PIN (stored as text in description)')
ON CONFLICT DO NOTHING;

-- Lockout tracking: attempts + lockout_until
INSERT INTO treasury_config (config_key, config_value, description)
VALUES
  ('director_pin_attempts', 0, 'Failed PIN attempts counter. Resets on success.'),
  ('director_pin_lockout_until', 0, 'Unix timestamp of lockout expiry. 0 = not locked.')
ON CONFLICT DO NOTHING;
