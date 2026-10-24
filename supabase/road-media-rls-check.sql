-- Run in the existing project's SQL Editor as its database owner.
-- Temporary unpublished fixture is rolled back inside a PL/pgSQL subtransaction.
-- Unexpected permissions abort the entire command; no fixture is retained.
do $$
declare n integer;
begin
  begin
    insert into public.sharky_media(id,title,category,images,published)
    values('00000000-0000-4000-8000-000000000101','Temporary RLS hidden check','comic',
      array['https://coldwarth-ship-it.github.io/road-safety-app/game/assets/story-01.webp'],false);
    perform set_config('request.jwt.claims','{"role":"anon"}',true);
    execute 'set local role anon';
    select count(*) into n from public.sharky_media where id='00000000-0000-4000-8000-000000000101';
    if n<>0 then raise exception 'Anonymous can read unpublished media'; end if;
    begin
      update public.sharky_media set title=title where id='00000000-0000-4000-8000-000000000101';
      raise exception 'Anonymous update unexpectedly allowed';
    exception when insufficient_privilege then null;
    end;
    execute 'reset role';
    perform set_config('request.jwt.claims','{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000099"}',true);
    execute 'set local role authenticated';
    if public.is_road_owner() then raise exception 'Non-owner treated as owner'; end if;
    select count(*) into n from public.sharky_media where id='00000000-0000-4000-8000-000000000101';
    if n<>0 then raise exception 'Non-owner can read unpublished media'; end if;
    update public.sharky_media set title=title where id='00000000-0000-4000-8000-000000000101';
    get diagnostics n=row_count;
    if n<>0 then raise exception 'Non-owner update unexpectedly allowed'; end if;
    begin
      insert into public.sharky_media(title,category,images)
      values('Temporary unauthorized insert','media',array['https://example.invalid/test.png']);
      raise exception 'Non-owner insert unexpectedly allowed';
    exception when insufficient_privilege then null;
    end;
    execute 'reset role';
    raise exception using errcode='ZX001',message='Rollback temporary fixture';
  exception when sqlstate 'ZX001' then null;
  end;
  if exists(select 1 from public.sharky_media where id='00000000-0000-4000-8000-000000000101') then
    raise exception 'Temporary fixture rollback failed';
  end if;
end $$;
select 'PASS: public reads and owner-only writes; temporary fixture rolled back' as verification;
