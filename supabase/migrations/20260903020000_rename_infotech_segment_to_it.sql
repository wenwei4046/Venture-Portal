-- 2026-09-03 (user: "IT 的segment 不是infotech, 而是真的叫IT"): rename the
-- enum values minted at provisioning. RENAME VALUE rewrites every stored row
-- (invoice_lines.segment, journal_entries.segment) in place, so the two
-- issued Aug consolidated invoices and any JEs follow automatically. The
-- provisioning RPC's 3-char slug guard was why 'infotech' was chosen; the
-- rename is done directly here instead.
ALTER TYPE gl_segment RENAME VALUE 'infotech' TO 'it';
ALTER TYPE billing_mode RENAME VALUE 'infotech_attribution' TO 'it_attribution';
UPDATE departments SET segment_key = 'it', billing_mode_key = 'it_attribution'
 WHERE name = 'IT' AND segment_key = 'infotech';
