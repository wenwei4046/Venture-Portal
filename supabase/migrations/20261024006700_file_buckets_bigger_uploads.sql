-- Bigger uploads (2026-10-24 — the owner, the morning after every bucket moved to Cloudflare R2: "make the size more
-- bigger for all, let me know the limit"; the night before: "make sure in future i can upload all big file, video and
-- etc"). A file now goes from the browser straight to R2 on a link made for that one file (lib/storage/server.ts ›
-- prepareUpload — never through a function, whose body stops at 4.5 MB), so a bucket's limit is the portal's own
-- choice up to R2's 5 GB for one upload. `file_objects_stamp` reads these two columns for every file a session sends.
--
--   2 GB, videos taken  — hr-documents (HR Documentation: documents, letters, memos, the Data center; PowerPoint and
--                         zip taken too) and it-requests (a screen recording).
--   100 MB              — payment-attachments (Payments, Receipts, Invoice Financing; no limit until now, but its
--                         uploads still pass through a Server Action, 4 MB), hiring-files, attendance, member-forms and
--                         member-invoices — documents and photos.
--   100 MB              — crm-media: WhatsApp's own ceiling, for a document (a picture 5 MB, a video 16 MB, Messenger
--                         25 MB — lib/member/crm-media.ts keeps those, and the CRM's own code says what it sends).
--   unchanged, 5 MB     — crm-showrooms and crm-auto-reply: pictures sent on WhatsApp, which takes none past 5 MB.
--
-- 2 GB, not R2's 5 GB: one upload is one request, and a bigger one lost near its end starts again from nothing.
-- The amounts are binary (2 GiB, 100 MiB), as every limit here has been. Re-running this changes nothing.

UPDATE public.file_buckets
   SET file_size_limit = 2147483648,
       allowed_mime_types = ARRAY[
         'application/pdf',
         'application/msword',
         'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
         'application/vnd.ms-excel',
         'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
         'application/vnd.ms-powerpoint',
         'application/vnd.openxmlformats-officedocument.presentationml.presentation',
         'text/csv',
         'image/png',
         'image/jpeg',
         'image/webp',
         'image/gif',
         'image/heic',
         'video/mp4',
         'video/quicktime',
         'video/webm',
         'application/zip',
         'application/x-zip-compressed'
       ]
 WHERE id = 'hr-documents';

UPDATE public.file_buckets SET file_size_limit = 2147483648 WHERE id = 'it-requests';

UPDATE public.file_buckets SET file_size_limit = 104857600
 WHERE id IN ('payment-attachments', 'hiring-files', 'attendance', 'member-forms', 'member-invoices', 'crm-media');
