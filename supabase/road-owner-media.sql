-- Review against the installed schema BEFORE applying. One atomic migration.
-- Adds a separate module; never drops existing media, chat, game or rider data.
begin;
create table if not exists public.road_site_owners (
  user_id uuid primary key references auth.users(id),
  created_at timestamptz not null default now()
);
alter table public.road_site_owners enable row level security;
revoke all on public.road_site_owners from anon, authenticated;

create or replace function public.is_road_owner() returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null
    and coalesce((auth.jwt()->>'is_anonymous')::boolean,false)=false
    and exists(select 1 from public.road_site_owners o where o.user_id=auth.uid());
$$;
revoke all on function public.is_road_owner() from public;
grant execute on function public.is_road_owner() to anon, authenticated;

create table if not exists public.road_media_items (
  id uuid primary key,
  title text not null check(length(trim(title)) between 1 and 160),
  category text not null check(category in ('media','comic')),
  images jsonb not null check(jsonb_typeof(images)='array' and jsonb_array_length(images) between 1 and 30),
  sort_order integer not null default 0 check(sort_order>=0),
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists road_media_public_order on public.road_media_items(category,sort_order,id) where deleted_at is null;
alter table public.road_media_items enable row level security;
revoke all on public.road_media_items from anon, authenticated;
grant select on public.road_media_items to anon, authenticated;
grant insert, update on public.road_media_items to authenticated;
drop policy if exists road_media_read on public.road_media_items;
create policy road_media_read on public.road_media_items for select to anon, authenticated
using (deleted_at is null or public.is_road_owner());
drop policy if exists road_media_owner_insert on public.road_media_items;
create policy road_media_owner_insert on public.road_media_items for insert to authenticated
with check (public.is_road_owner() and created_by=auth.uid());
drop policy if exists road_media_owner_update on public.road_media_items;
create policy road_media_owner_update on public.road_media_items for update to authenticated
using (public.is_road_owner()) with check(public.is_road_owner());

create or replace function public.road_media_validate() returns trigger
language plpgsql set search_path='' as $$
declare image jsonb;
begin
  if tg_op='UPDATE' then
    if new.id<>old.id or new.created_by<>old.created_by or new.created_at<>old.created_at then
      raise exception 'Immutable media identity';
    end if;
  end if;
  for image in select value from jsonb_array_elements(new.images) loop
    if jsonb_typeof(image)<>'object' or image->>'path' is null
      or image->>'path' !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9]{2}-[0-9a-f-]{36}\.(png|jpg|webp)$'
      or split_part(image->>'path','/',2)<>new.id::text
      or split_part(image->>'path','/',1)<>new.created_by::text then
      raise exception 'Invalid media image path';
    end if;
  end loop;
  new.title=trim(new.title);
  new.updated_at=clock_timestamp();
  return new;
end;
$$;
drop trigger if exists road_media_validate on public.road_media_items;
create trigger road_media_validate before insert or update on public.road_media_items
for each row execute function public.road_media_validate();

create or replace function public.road_media_reorder(p_category text,p_ids uuid[]) returns void
language plpgsql security invoker set search_path='' as $$
begin
  if not public.is_road_owner() then raise exception 'Owner required' using errcode='42501'; end if;
  if p_category not in ('media','comic') or p_ids is null then raise exception 'Invalid order'; end if;
  -- Serialize reordering operations; identity is still protected by RLS.
  perform pg_advisory_xact_lock(731023);
  perform 1 from public.road_media_items where category=p_category and deleted_at is null for update;
  if cardinality(p_ids)<>(select count(*) from public.road_media_items where category=p_category and deleted_at is null)
    or cardinality(p_ids)<>(select count(distinct x) from unnest(p_ids) x)
    or exists(select 1 from unnest(p_ids) x where not exists(
      select 1 from public.road_media_items m where m.id=x and m.category=p_category and m.deleted_at is null)) then
    raise exception 'List changed; reload before reordering';
  end if;
  update public.road_media_items m set sort_order=o.ordinality::integer-1
    from unnest(p_ids) with ordinality o(id,ordinality) where m.id=o.id;
end;
$$;
revoke all on function public.road_media_reorder(text,uuid[]) from public;
grant execute on function public.road_media_reorder(text,uuid[]) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('road-media','road-media',false,10485760,array['image/png','image/jpeg','image/webp'])
on conflict(id) do nothing;
-- Deliberately do not modify an existing bucket's access settings silently.
do $$begin
  if exists(select 1 from storage.buckets where id='road-media' and public) then
    raise exception 'Existing road-media bucket is public; review before applying';
  end if;
end$$;
drop policy if exists road_media_images_read on storage.objects;
create policy road_media_images_read on storage.objects for select to anon,authenticated
using(bucket_id='road-media' and (public.is_road_owner() or exists(
  select 1 from public.road_media_items m
    where m.deleted_at is null and exists(
      select 1 from jsonb_array_elements(m.images) image where image->>'path'=name))));
drop policy if exists road_media_images_insert on storage.objects;
create policy road_media_images_insert on storage.objects for insert to authenticated
with check(bucket_id='road-media' and public.is_road_owner() and (storage.foldername(name))[1]=auth.uid()::text);
-- No DELETE policy: trash and restore change metadata; image bytes remain recoverable.
commit;

-- Provision the already verified owner UID using the management console ONLY.
-- Never expose a self-enrolment route or grant ownership based on an email typed in a form.
-- insert into public.road_site_owners(user_id) values('<VERIFIED_EXISTING_AUTH_USER_UUID>');
