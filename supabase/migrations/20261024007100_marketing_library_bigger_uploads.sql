-- Marketing's Library takes files up to 2 GB (2026-10-24). The user had answered "50 MB 内上传，大档贴链接" for the
-- Library (mig 20261024007000); the same night, once every bucket was in R2, the user told the storage session "make
-- sure in future i can upload all big file, video and etc" and, the morning after, "make the size more bigger for
-- all" (mig 20261024006700 — 2 GB for HR's documents and IT's requests). The Library is where Marketing's videos are
-- kept (*Video library*), so it takes what HR's documents take: 2 GB a file, any type as before. A folder kept
-- elsewhere (*Raw footage* on Drive) stays a link folder. The app says the same number first
-- (lib/marketing/library.ts › LIB_MAX_BYTES). Re-running this changes nothing.
--
-- PGlite: tests/member-sql/validate-marketing-library.mjs.

UPDATE public.file_buckets SET file_size_limit = 2147483648 WHERE id = 'marketing';
