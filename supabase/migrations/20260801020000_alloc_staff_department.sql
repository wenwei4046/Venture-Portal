-- Allocator staff get a DEPARTMENT label (2026-08-01, user: "每个人我要label
-- department, split 是 split, department 是 department, 然后我要有的维护").
--
-- Free text, Finance-maintained: the roster spans group companies, so this is
-- the person's team/function label — deliberately NOT an FK to the portal's
-- departments table (those are HV's internal five). It has no effect on the
-- allocation math; splits alone drive the money.

ALTER TABLE alloc_staff ADD COLUMN IF NOT EXISTS department TEXT NOT NULL DEFAULT '';

-- Seed the obvious ones: people whose ONLY split is the Marketing department
-- were "Marketing Department" staff in the user's sheet.
UPDATE alloc_staff st
SET department = 'Marketing'
WHERE department = ''
  AND EXISTS (
    SELECT 1 FROM alloc_staff_splits sp
    JOIN departments d ON d.id = sp.department_id
    WHERE sp.staff_id = st.id AND d.name = 'Marketing'
  )
  AND NOT EXISTS (
    SELECT 1 FROM alloc_staff_splits sp
    WHERE sp.staff_id = st.id AND sp.department_id IS NULL
  );
