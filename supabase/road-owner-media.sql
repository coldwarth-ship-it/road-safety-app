-- Verified existing module, 24 Oct 2026. Read-only verification; no migration needed.
-- Do not replace is_road_owner: it uses the existing road_private.site_owner allowlist.
-- Do not create road_media_items / road_site_owners / road-media: the live schema is:
-- public.sharky_media (images text[], published boolean), storage bucket sharky-media.
-- Existing UPDATE grants are COLUMN-level; role_table_grants alone misses them.
select column_name,data_type,is_nullable,column_default
from information_schema.columns
where table_schema='public' and table_name='sharky_media' order by ordinal_position;
select policyname,roles,cmd,qual,with_check from pg_policies
where schemaname='public' and tablename='sharky_media';
select column_name,privilege_type from information_schema.column_privileges
where table_schema='public' and table_name='sharky_media' and grantee='authenticated';
select id,public,file_size_limit from storage.buckets where id='sharky-media';
-- Owner management/creation is not automatic. Verify the configured owner separately.
