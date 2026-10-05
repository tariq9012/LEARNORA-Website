-- Phase 16: additive. Existing assets stay LOCAL; new assets record S3 when
-- STORAGE_PROVIDER=s3. No rows are touched.
ALTER TYPE "StorageProviderKind" ADD VALUE IF NOT EXISTS 'S3';
