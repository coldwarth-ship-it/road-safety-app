begin;
create table if not exists public.road_chat_messages (
 id uuid primary key default gen_random_uuid(),
 room text not null check(char_length(room) between 1 and 160),
 user_id uuid references auth.users(id) on delete set null,
 nickname text not null check(char_length(nickname) between 1 and 30),
 message text not null check(char_length(message) between 1 and 500),
 created_at timestamptz not null default now(),
 hidden boolean not null default false
);
create index if not exists road_chat_room_time on public.road_chat_messages(room,created_at desc);
create index if not exists road_chat_user_time on public.road_chat_messages(user_id,created_at desc);
alter table public.road_chat_messages enable row level security;
create policy road_chat_public_read on public.road_chat_messages for select to anon, authenticated using (not hidden and created_at >= now()-interval '30 days');
revoke all on public.road_chat_messages from anon, authenticated;
grant select on public.road_chat_messages to anon, authenticated;
create or replace function public.send_road_chat(p_id uuid,p_room text,p_nickname text,p_message text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); normalized text; prior uuid;
begin
 if uid is null then raise exception 'กรุณาเชื่อมต่อก่อนส่ง'; end if;
 perform pg_advisory_xact_lock(hashtextextended(uid::text,0));
 select id into prior from public.road_chat_messages where id=p_id and user_id=uid;
 if prior is not null then return prior; end if;
 p_room:=btrim(p_room);p_nickname:=btrim(p_nickname);p_message:=btrim(p_message);
 if p_room is null or char_length(p_room) not between 1 and 160 or not (p_room='general' or p_room like 'point:%' or p_room like 'coord:%') then raise exception 'ห้องไม่ถูกต้อง';end if;
 if p_nickname is null or char_length(p_nickname) not between 1 and 30 or p_message is null or char_length(p_message) not between 1 and 500 then raise exception 'ข้อความหรือชื่อเล่นไม่ถูกต้อง';end if;
 normalized:=regexp_replace(lower(p_nickname||' '||p_message),'[[:space:]._*\-​‌‍]+','','g');
 if normalized ~ 'ควย|เย็ด|เหี้ย|สัส|ไอ้สัตว์|fuck|shit|bitch' then raise exception 'พบคำไม่สุภาพ กรุณาแก้ไขก่อนส่ง';end if;
 if exists(select 1 from public.road_chat_messages where user_id=uid and created_at>now()-interval '5 seconds') then raise exception 'เว้นระยะอย่างน้อย 5 วินาที';end if;
 insert into public.road_chat_messages(id,room,user_id,nickname,message) values(p_id,p_room,uid,p_nickname,p_message);
 return p_id;
end;
$$;
revoke all on function public.send_road_chat(uuid,text,text,text) from public,anon;
grant execute on function public.send_road_chat(uuid,text,text,text) to authenticated;
alter publication supabase_realtime add table public.road_chat_messages;
commit;
select 'road chat installed' as result;