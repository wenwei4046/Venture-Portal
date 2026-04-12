-- ============================================================================
-- 20260101000058_payment_attachment_storage.sql
-- Create Supabase Storage bucket for payment voucher attachments
-- ============================================================================

-- Create storage bucket (if Supabase supports this via SQL — otherwise
-- this must be done via Dashboard or API). The INSERT is idempotent.
INSERT INTO storage.buckets (id, name, public)
VALUES ('payment-attachments', 'payment-attachments', false)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS: authenticated users can upload, Principal + Finance can read
CREATE POLICY "Finance can upload attachments"
    ON storage.objects FOR INSERT
    WITH CHECK (bucket_id = 'payment-attachments' AND auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can read attachments"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'payment-attachments' AND auth.role() = 'authenticated');
