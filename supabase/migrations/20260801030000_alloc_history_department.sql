-- Snapshots carry the department label too (2026-08-01, user: "快照要和名单
-- 一样能搜索和显示department这些").
--
-- Backfill: existing snapshot rows take the CURRENT staff's label — snapshots
-- so far are all from today, so current labels are historically accurate.

ALTER TABLE alloc_staff_history ADD COLUMN IF NOT EXISTS department TEXT NOT NULL DEFAULT '';

UPDATE alloc_staff_history h
SET department = st.department
FROM alloc_staff st
WHERE st.id = h.staff_id AND h.department = '' AND st.department <> '';
