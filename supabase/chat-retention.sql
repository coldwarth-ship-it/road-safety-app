-- Run in Supabase SQL Editor as postgres AFTER deploying chat-retention.
-- First save a SECRET API key (sb_secret_..., never publishable) in Vault,
-- with the name chat_retention_api_key. Do not paste it into GitHub or chat.

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

create index if not exists chat_messages_retention_created_at_idx
  on public.chat_messages(created_at, id);
create index if not exists chat_messages_retention_image_path_idx
  on public.chat_messages(image_path) where image_path is not null;

create or replace function public.chat_cleanup_candidates(batch_size integer default 100)
returns table (removed_messages integer, image_paths text[])
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  cutoff timestamptz := now() - interval '30 days';
  removed_count integer;
  paths text[];
begin
  -- Limit work and lock rows so simultaneous runs can skip each other's rows.
  with expired as (
    select id from public.chat_messages
    where created_at < cutoff
    order by created_at, id
    limit 1000
    for update skip locked
  )
  delete from public.chat_messages m
  using expired e where m.id = e.id;
  get diagnostics removed_count = row_count;

  -- Read Storage metadata only; actual files MUST be removed through Storage API.
  -- This also retries old orphaned uploads after previous API failures.
  -- Retain any file still referenced by a surviving message.
  select coalesce(array_agg(candidate.name), array[]::text[]) into paths
  from (
    select o.name from storage.objects o
    where o.bucket_id = 'chat-images'
      and o.created_at < cutoff
      and not exists (
        select 1 from public.chat_messages m where m.image_path = o.name
      )
    order by o.created_at, o.name
    limit least(greatest(coalesce(batch_size, 100), 1), 100)
  ) candidate;

  return query select removed_count, paths;
end;
$$;
revoke all on function public.chat_cleanup_candidates(integer) from public, anon, authenticated;
grant execute on function public.chat_cleanup_candidates(integer) to service_role;

-- Validate configuration without printing the key into query results.
do $$
begin
  if not exists (
    select 1 from vault.decrypted_secrets
    where name = 'chat_retention_api_key' and decrypted_secret like 'sb_secret_%'
  ) then
    raise exception 'Save a secret API key in Vault named chat_retention_api_key first';
  end if;
end;
$$;

-- Same job name replaces the previous schedule, so this script is repeatable.
select cron.schedule(
  'chat-retention-30-days',
  '0 * * * *',
  $job$
    select net.http_post(
      url := 'https://selohymkkwvldhtohtbm.supabase.co/functions/v1/chat-retention',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'chat_retention_api_key')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 60000
    );
  $job$
);

-- Verify that a job exists and is active. This does not print credentials.
select jobid, jobname, schedule, active
from cron.job where jobname = 'chat-retention-30-days';
