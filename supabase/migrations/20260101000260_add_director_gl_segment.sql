-- Add 'director' gl_segment so the Director department shows as its own
-- income-statement segment (like marketing/finance/hr/director_office).
ALTER TYPE gl_segment ADD VALUE IF NOT EXISTS 'director';
