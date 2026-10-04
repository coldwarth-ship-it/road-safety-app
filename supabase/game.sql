-- Run in the Supabase SQL editor. Separate names preserve existing project tables.
create table if not exists public.ssar_profiles (
 user_id uuid primary key references auth.users(id) on delete cascade,
 nickname text not null default 'Rider',
 progress jsonb not null default '{"version":1,"xp":0,"wallet":0,"deliveries":0,"stops":0,"safe":0,"clean":0,"best":0,"completed":[],"medals":[],"owned":["red","blue","gold","violet","green","navy","orange"],"bike":"red","suit":"green"}'::jsonb,
 updated_at timestamptz not null default now()
);
create table if not exists public.ssar_sessions (
 round_id uuid primary key,user_id uuid not null references auth.users(id) on delete cascade,
 stage integer not null check(stage between 0 and 5),kind text not null check(kind in ('mission','free')),
 started_at timestamptz not null default now(),submitted boolean not null default false
);
create table if not exists public.ssar_rounds (
 round_id uuid primary key references public.ssar_sessions(round_id),user_id uuid not null references auth.users(id) on delete cascade,
 nickname text not null,stage integer not null,score integer not null check(score>=0),metrics jsonb not null,
 created_at timestamptz not null default now()
);
create index if not exists ssar_rounds_user_time on public.ssar_rounds(user_id,created_at desc);
create index if not exists ssar_rounds_scores on public.ssar_rounds(score desc,created_at desc);
alter table public.ssar_profiles enable row level security;
alter table public.ssar_sessions enable row level security;
alter table public.ssar_rounds enable row level security;
-- No direct browser grants. game-api verifies Auth and serves only authorised data.
revoke all on public.ssar_profiles,public.ssar_sessions,public.ssar_rounds from anon,authenticated;
grant all on public.ssar_profiles,public.ssar_sessions,public.ssar_rounds to service_role;

create or replace function public.ssar_submit(p_user uuid,p_round uuid,p_score integer,p_metrics jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare sess ssar_sessions%rowtype; pr jsonb; old_score integer; completed jsonb; medals jsonb; gain integer; clean boolean; delivered boolean; m text;
begin
 select * into sess from ssar_sessions where round_id=p_round and user_id=p_user for update;
 if not found then raise exception 'Round not found';end if;
 select progress into pr from ssar_profiles where user_id=p_user for update;
 if sess.submitted then
  select score into old_score from ssar_rounds where round_id=p_round;
  return jsonb_build_object('score',old_score,'profile',pr,'duplicate',true);
 end if;
 delivered=coalesce((p_metrics->>'delivered')::boolean,false);
 clean=delivered and (p_metrics->>'crashes')::integer=0 and (p_metrics->>'penalty')::integer=0;
 gain=floor(p_score*.35);completed=pr->'completed';medals=pr->'medals';
 if delivered and not completed @> jsonb_build_array(sess.stage) then completed=completed||jsonb_build_array(sess.stage);end if;
 pr=pr||jsonb_build_object('xp',(pr->>'xp')::integer+p_score,'wallet',(pr->>'wallet')::integer+gain,'best',greatest((pr->>'best')::integer,p_score),'deliveries',(pr->>'deliveries')::integer+case when delivered then 1 else 0 end,'clean',(pr->>'clean')::integer+case when clean then 1 else 0 end,'stops',(pr->>'stops')::integer+(p_metrics->>'stops')::integer,'safe',(pr->>'safe')::integer+(p_metrics->>'safe')::integer,'completed',completed);
 for m in select unnest(array['delivery','yield','clean','all','scan']) loop
  if not medals @> jsonb_build_array(m) and ((m='delivery' and (pr->>'deliveries')::integer>=1) or (m='yield' and (pr->>'stops')::integer>=5) or (m='clean' and (pr->>'clean')::integer>=1) or (m='all' and jsonb_array_length(completed)>=6) or (m='scan' and (pr->>'safe')::integer>=20)) then medals=medals||jsonb_build_array(m);end if;
 end loop;
 pr=pr||jsonb_build_object('medals',medals);
 update ssar_profiles set progress=pr,updated_at=now() where user_id=p_user;
 insert into ssar_rounds(round_id,user_id,nickname,stage,score,metrics) select p_round,p_user,nickname,sess.stage,p_score,p_metrics from ssar_profiles where user_id=p_user;
 update ssar_sessions set submitted=true where round_id=p_round;
 return jsonb_build_object('score',p_score,'profile',pr);
end $$;
revoke all on function public.ssar_submit(uuid,uuid,integer,jsonb) from public,anon,authenticated;
grant execute on function public.ssar_submit(uuid,uuid,integer,jsonb) to service_role;

create or replace function public.ssar_equip(p_user uuid,p_item text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare pr jsonb; price integer; category text;
begin
 if p_item not in ('red','blue','gold','violet','green','navy','orange') then raise exception 'Unknown item';end if;
 price=0;
 category=case when p_item in ('red','blue','gold','violet') then 'bike' else 'suit' end;
 select progress into pr from ssar_profiles where user_id=p_user for update;
 if not found then raise exception 'Profile not found';end if;
 if not (pr->'owned') @> jsonb_build_array(p_item) then
  if (pr->>'wallet')::integer<price then raise exception 'Insufficient points';end if;
  pr=pr||jsonb_build_object('wallet',(pr->>'wallet')::integer-price,'owned',(pr->'owned')||jsonb_build_array(p_item));
 end if;
 pr=pr||jsonb_build_object(category,p_item);update ssar_profiles set progress=pr,updated_at=now() where user_id=p_user;return pr;
end $$;
revoke all on function public.ssar_equip(uuid,text) from public,anon,authenticated;
grant execute on function public.ssar_equip(uuid,text) to service_role;

create or replace function public.ssar_leaderboard(p_since timestamptz default null)
returns table(nickname text,score integer) language sql security definer set search_path=public,pg_temp as $$
 select r.nickname,r.score from (
  select distinct on (user_id) user_id,nickname,score,created_at from ssar_rounds
  where p_since is null or created_at>=p_since order by user_id,score desc,created_at asc
 ) r order by r.score desc,r.created_at asc limit 20
$$;
revoke all on function public.ssar_leaderboard(timestamptz) from public,anon,authenticated;
grant execute on function public.ssar_leaderboard(timestamptz) to service_role;

-- Existing profiles keep progress and equipment; all colours are available immediately.
update public.ssar_profiles set progress=progress||jsonb_build_object('owned',jsonb_build_array('red','blue','gold','violet','green','navy','orange'));
