-- ติดตั้งครั้งแรกใน Supabase SQL Editor (โปรเจคใหม่)
begin;
create schema if not exists private;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text not null,
  role text not null default 'viewer' check (role in ('admin','teacher','viewer')),
  enabled boolean not null default false,
  created_at timestamptz not null default now()
);
create table public.academic_years (
  id uuid primary key default gen_random_uuid(),
  label integer not null unique check(label between 2500 and 2800),
  starts_on date not null,
  closed boolean not null default false,
  promoted_to uuid references public.academic_years(id),
  created_at timestamptz not null default now()
);
create table public.students (
  id uuid primary key default gen_random_uuid(),
  student_code text not null unique check(student_code ~ '^[A-Za-z0-9_-]{1,30}$'),
  prefix text not null default '' check(length(prefix)<=100),
  first_name text not null check(length(trim(first_name)) between 1 and 100),
  last_name text not null check(length(trim(last_name)) between 1 and 100),
  created_at timestamptz not null default now()
);
create table public.enrollments (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id),
  year_id uuid not null references public.academic_years(id),
  training_year smallint not null check(training_year between 1 and 3),
  room text not null default '' check(length(room)<=100),
  joined_on date not null,
  result text not null default 'pending' check(result in ('pending','passed','failed')),
  unique(student_id, year_id)
);
create table public.training_sessions (
  id uuid primary key default gen_random_uuid(),
  year_id uuid not null references public.academic_years(id),
  training_year smallint not null check(training_year between 1 and 3),
  training_date date not null,
  slot text not null check(length(trim(slot)) between 1 and 100),
  title text not null check(length(trim(title)) between 1 and 200),
  duration_hours numeric(5,2) not null check(duration_hours>0 and duration_hours<=24),
  revision integer not null default 0,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  unique(year_id,training_year,training_date,slot)
);
create table public.attendance (
  session_id uuid not null references public.training_sessions(id),
  enrollment_id uuid not null references public.enrollments(id),
  status text not null check(status in ('present','absent')),
  recorded_by uuid not null references public.profiles(id),
  recorded_at timestamptz not null default now(),
  primary key(session_id,enrollment_id)
);
create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid,
  action text not null,
  table_name text not null,
  record_id text,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now()
);
create index on public.enrollments(year_id,training_year);
create index on public.training_sessions(year_id,training_year,training_date);
create index on public.attendance(enrollment_id);
create index on public.audit_logs(created_at desc);

create function private.role() returns text language sql stable security definer set search_path='' as $$
 select role from public.profiles where id=auth.uid() and enabled
$$;
create function private.require_role(allowed text[]) returns void language plpgsql security definer set search_path='' as $$
begin
 if coalesce(private.role()=any(allowed),false)=false then raise exception 'ไม่มีสิทธิ์ดำเนินการ' using errcode='42501'; end if;
end $$;
create function private.audit() returns trigger language plpgsql security definer set search_path='' as $$
declare oldj jsonb; newj jsonb;
begin
 if TG_OP<>'INSERT' then oldj=to_jsonb(old); end if;
 if TG_OP<>'DELETE' then newj=to_jsonb(new); end if;
 insert into public.audit_logs(actor_id,action,table_name,record_id,before_data,after_data)
 values(auth.uid(),TG_OP,TG_TABLE_NAME,coalesce(newj->>'id',oldj->>'id',newj->>'session_id',oldj->>'session_id'),oldj,newj);
 return coalesce(new,old);
end $$;
create function private.new_profile() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.profiles(id,email,display_name) values(new.id,coalesce(new.email,''),coalesce(nullif(new.raw_user_meta_data->>'display_name',''),new.email,'ผู้ใช้ใหม่'));
 return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function private.new_profile();

do $$ declare t text; begin
 foreach t in array array['profiles','academic_years','students','enrollments','training_sessions','attendance'] loop
  execute format('create trigger audit_change after insert or update or delete on public.%I for each row execute function private.audit()',t);
 end loop;
 foreach t in array array['profiles','academic_years','students','enrollments','training_sessions','attendance','audit_logs'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from anon, authenticated',t);
  execute format('grant select on public.%I to authenticated',t);
 end loop;
end $$;
create policy profile_read on public.profiles for select to authenticated using(id=auth.uid() or private.role()='admin');
create policy year_read on public.academic_years for select to authenticated using(private.role() is not null);
create policy student_read on public.students for select to authenticated using(private.role() is not null);
create policy enrollment_read on public.enrollments for select to authenticated using(private.role() is not null);
create policy session_read on public.training_sessions for select to authenticated using(private.role() is not null);
create policy attendance_read on public.attendance for select to authenticated using(private.role() is not null);
create policy audit_read on public.audit_logs for select to authenticated using(private.role()='admin');

create function private.open_year(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 -- Share lock serializes all current-year writes against closing/promotion.
 perform 1 from public.academic_years where id=p_id and not closed for share;
 if not found then raise exception 'ปีการศึกษาถูกปิดแล้วหรือไม่พบข้อมูล'; end if;
end $$;
create function private.create_year(p_label integer,p_starts_on date) returns uuid language plpgsql security definer set search_path='' as $$
declare v uuid; begin
 perform private.require_role(array['admin']);
 if p_starts_on is null then raise exception 'กรุณาระบุวันเริ่มปีการศึกษา'; end if;
 insert into public.academic_years(label,starts_on) values(p_label,p_starts_on) returning id into v; return v;
end $$;
create function public.create_year(p_label integer,p_starts_on date) returns uuid language sql security invoker set search_path='' as $$ select private.create_year(p_label,p_starts_on) $$;

create function private.import_students(p_year_id uuid,p_rows jsonb,p_joined_on date) returns integer language plpgsql security definer set search_path='' as $$
declare r jsonb; sid uuid; n integer=0; begin
 perform private.require_role(array['admin']); perform private.open_year(p_year_id);
 if p_rows is null or jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows) not between 1 and 2000 or p_joined_on is null then raise exception 'ข้อมูลนำเข้าไม่ถูกต้อง (1–2,000 รายการ)'; end if;
 for r in select value from jsonb_array_elements(p_rows) loop
  -- A known student code must match the student's name; never silently overwrite identity.
  select id into sid from public.students where student_code=trim(r->>'student_code');
  if sid is not null then
   if exists(select 1 from public.students where id=sid and (first_name<>trim(r->>'first_name') or last_name<>trim(r->>'last_name') or prefix<>coalesce(trim(r->>'prefix'),''))) then
    raise exception 'รหัส % มีชื่อไม่ตรงกับทะเบียนเดิม',r->>'student_code';
   end if;
  else
   insert into public.students(student_code,prefix,first_name,last_name) values(trim(r->>'student_code'),coalesce(trim(r->>'prefix'),''),trim(r->>'first_name'),trim(r->>'last_name')) returning id into sid;
  end if;
  insert into public.enrollments(student_id,year_id,training_year,room,joined_on)
   values(sid,p_year_id,(r->>'training_year')::smallint,coalesce(trim(r->>'room'),''),p_joined_on);
  n=n+1;
 end loop;
 return n;
end $$;
create function public.import_students(p_year_id uuid,p_rows jsonb,p_joined_on date) returns integer language sql security invoker set search_path='' as $$ select private.import_students(p_year_id,p_rows,p_joined_on) $$;

create function private.update_enrollment(p_id uuid,p_room text,p_result text) returns void language plpgsql security definer set search_path='' as $$
declare y uuid; begin
 perform private.require_role(array['admin']); select year_id into y from public.enrollments where id=p_id;
 perform private.open_year(y);
 update public.enrollments set room=trim(p_room), result=p_result where id=p_id;
end $$;
create function public.update_enrollment(p_id uuid,p_room text,p_result text) returns void language sql security invoker set search_path='' as $$ select private.update_enrollment(p_id,p_room,p_result) $$;

create function private.create_session(p_year_id uuid,p_training_year smallint,p_date date,p_slot text,p_title text,p_hours numeric) returns uuid language plpgsql security definer set search_path='' as $$
declare v uuid; begin
 perform private.require_role(array['admin','teacher']); perform private.open_year(p_year_id);
 if p_date is null then raise exception 'กรุณาระบุวันที่'; end if;
 insert into public.training_sessions(year_id,training_year,training_date,slot,title,duration_hours,created_by)
 values(p_year_id,p_training_year,p_date,trim(p_slot),trim(p_title),p_hours,auth.uid()) returning id into v; return v;
end $$;
create function public.create_session(p_year_id uuid,p_training_year smallint,p_date date,p_slot text,p_title text,p_hours numeric) returns uuid language sql security invoker set search_path='' as $$ select private.create_session(p_year_id,p_training_year,p_date,p_slot,p_title,p_hours) $$;

create function private.save_attendance(p_session_id uuid,p_expected_revision integer,p_records jsonb) returns integer language plpgsql security definer set search_path='' as $$
declare s public.training_sessions; r jsonb; v integer; begin
 perform private.require_role(array['admin','teacher']);
 select * into s from public.training_sessions where id=p_session_id;
 if not found then raise exception 'ไม่พบรอบฝึก'; end if;
 perform private.open_year(s.year_id);
 select * into s from public.training_sessions where id=p_session_id for update;
 if p_expected_revision is null or s.revision<>p_expected_revision then raise exception 'มีผู้ใช้อื่นแก้ไขรอบนี้แล้ว กรุณาโหลดใหม่' using errcode='40001'; end if;
 if p_records is null or jsonb_typeof(p_records)<>'array' or jsonb_array_length(p_records) not between 1 and 2000 then raise exception 'ข้อมูลไม่ถูกต้อง'; end if;
 if (select count(*)<>count(distinct value->>'enrollment_id') from jsonb_array_elements(p_records)) then raise exception 'รายชื่อซ้ำ'; end if;
 for r in select value from jsonb_array_elements(p_records) loop
  if not exists(select 1 from public.enrollments e where e.id=(r->>'enrollment_id')::uuid and e.year_id=s.year_id and e.training_year=s.training_year and e.joined_on<=s.training_date) then raise exception 'รายชื่อไม่อยู่ในรอบฝึกนี้'; end if;
  if r->>'status'='pending' then
   delete from public.attendance where session_id=s.id and enrollment_id=(r->>'enrollment_id')::uuid;
  elsif r->>'status' in ('present','absent') then
   insert into public.attendance(session_id,enrollment_id,status,recorded_by,recorded_at)
   values(s.id,(r->>'enrollment_id')::uuid,r->>'status',auth.uid(),now())
   on conflict(session_id,enrollment_id) do update set status=excluded.status, recorded_by=excluded.recorded_by, recorded_at=excluded.recorded_at;
  else raise exception 'ใช้ได้เฉพาะ มา ขาด หรือคืนเป็นยังไม่บันทึก'; end if;
 end loop;
 update public.training_sessions set revision=revision+1 where id=s.id returning revision into v; return v;
end $$;
create function public.save_attendance(p_session_id uuid,p_expected_revision integer,p_records jsonb) returns integer language sql security invoker set search_path='' as $$ select private.save_attendance(p_session_id,p_expected_revision,p_records) $$;

create function private.promote_year(p_source_id uuid,p_target_label integer,p_starts_on date) returns jsonb language plpgsql security definer set search_path='' as $$
declare src public.academic_years; target uuid; moved integer; graduated integer; begin
 perform private.require_role(array['admin']);
 select * into src from public.academic_years where id=p_source_id for update;
 if not found or src.closed or src.promoted_to is not null then raise exception 'ปีนี้ปิดหรือเลื่อนชั้นแล้ว'; end if;
 if p_target_label<>src.label+1 or p_starts_on<=src.starts_on or p_starts_on is null then raise exception 'ปีปลายทางต้องเป็นปีถัดไป และวันเริ่มต้องหลังปีเดิม'; end if;
 if not exists(select 1 from public.enrollments where year_id=src.id) then raise exception 'ยังไม่มีทะเบียน'; end if;
 if exists(select 1 from public.enrollments where year_id=src.id and result='pending') then raise exception 'ต้องระบุผลการฝึกทุกรายก่อนเลื่อนชั้น'; end if;
 -- Target must be new: prevents accidental merging into an existing academic year.
 insert into public.academic_years(label,starts_on) values(p_target_label,p_starts_on) returning id into target;
 insert into public.enrollments(student_id,year_id,training_year,room,joined_on)
 select student_id,target,case when result='passed' then training_year+1 else training_year end,'',p_starts_on
 from public.enrollments where year_id=src.id and not(training_year=3 and result='passed');
 get diagnostics moved=row_count;
 select count(*) into graduated from public.enrollments where year_id=src.id and training_year=3 and result='passed';
 update public.academic_years set closed=true,promoted_to=target where id=src.id;
 return jsonb_build_object('year_id',target,'moved',moved,'graduated',graduated);
end $$;
create function public.promote_year(p_source_id uuid,p_target_label integer,p_starts_on date) returns jsonb language sql security invoker set search_path='' as $$ select private.promote_year(p_source_id,p_target_label,p_starts_on) $$;

create function private.set_member(p_id uuid,p_role text,p_name text,p_enabled boolean) returns void language plpgsql security definer set search_path='' as $$
begin
 -- Serialize admin changes, so two admins cannot concurrently remove the last admin.
 perform pg_advisory_xact_lock(724108);
 perform private.require_role(array['admin']);
 if auth.uid()=p_id and (p_role<>'admin' or not p_enabled) then raise exception 'ไม่สามารถปิดสิทธิ์ผู้ดูแลของตนเอง'; end if;
 if length(trim(p_name)) not between 1 and 100 or p_enabled is null then raise exception 'ข้อมูลผู้ใช้ไม่ถูกต้อง'; end if;
 update public.profiles set role=p_role,display_name=trim(p_name),enabled=p_enabled where id=p_id;
 if not found then raise exception 'ไม่พบผู้ใช้'; end if;
end $$;
create function public.set_member(p_id uuid,p_role text,p_name text,p_enabled boolean) returns void language sql security invoker set search_path='' as $$ select private.set_member(p_id,p_role,p_name,p_enabled) $$;

-- Export contains application data only; auth passwords are deliberately excluded.
create function private.export_backup() returns jsonb language plpgsql security definer set search_path='' as $$
declare v jsonb; begin
 perform private.require_role(array['admin']);
 select jsonb_build_object('format','cadet-backup-v1','exported_at',now(),
 'academic_years',(select coalesce(jsonb_agg(t),'[]') from public.academic_years t),
 'students',(select coalesce(jsonb_agg(t),'[]') from public.students t),
 'enrollments',(select coalesce(jsonb_agg(t),'[]') from public.enrollments t),
 'training_sessions',(select coalesce(jsonb_agg(t),'[]') from public.training_sessions t),
 'attendance',(select coalesce(jsonb_agg(t),'[]') from public.attendance t),
 'profiles',(select coalesce(jsonb_agg(t),'[]') from public.profiles t),
 'audit_logs',(select coalesce(jsonb_agg(t),'[]') from public.audit_logs t)) into v;
 return v;
end $$;
create function public.export_backup() returns jsonb language sql security invoker set search_path='' as $$ select private.export_backup() $$;

create function private.recorder_names() returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform private.require_role(array['admin','teacher','viewer']);
 return (select coalesce(jsonb_agg(jsonb_build_object('id',id,'display_name',display_name)),'[]') from public.profiles);
end $$;
create function public.get_recorder_names() returns jsonb language sql security invoker set search_path='' as $$ select private.recorder_names() $$;

-- No client can mutate tables directly, self-assign a role or write an audit record.
revoke all on all functions in schema private from public,anon,authenticated;
grant usage on schema private to authenticated;
grant execute on function private.role() to authenticated;
grant execute on function private.create_year(integer,date),private.import_students(uuid,jsonb,date),private.update_enrollment(uuid,text,text),private.create_session(uuid,smallint,date,text,text,numeric),private.save_attendance(uuid,integer,jsonb),private.promote_year(uuid,integer,date),private.set_member(uuid,text,text,boolean),private.export_backup() to authenticated;
revoke execute on function public.create_year(integer,date),public.import_students(uuid,jsonb,date),public.update_enrollment(uuid,text,text),public.create_session(uuid,smallint,date,text,text,numeric),public.save_attendance(uuid,integer,jsonb),public.promote_year(uuid,integer,date),public.set_member(uuid,text,text,boolean),public.export_backup() from public,anon;
grant execute on function public.create_year(integer,date),public.import_students(uuid,jsonb,date),public.update_enrollment(uuid,text,text),public.create_session(uuid,smallint,date,text,text,numeric),public.save_attendance(uuid,integer,jsonb),public.promote_year(uuid,integer,date),public.set_member(uuid,text,text,boolean),public.export_backup() to authenticated;
revoke execute on function public.get_recorder_names() from public,anon;
grant execute on function private.recorder_names(),public.get_recorder_names() to authenticated;
grant all on public.profiles,public.academic_years,public.students,public.enrollments,public.training_sessions,public.attendance,public.audit_logs to service_role;
commit;
