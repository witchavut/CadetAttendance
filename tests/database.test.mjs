// Run with PGLITE_PATH=/absolute/path/to/@electric-sql/pglite/dist/index.js node tests/database.test.mjs
// Uses an isolated PostgreSQL engine; never connects to a live project.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const {PGlite}=await import(process.env.PGLITE_PATH||'@electric-sql/pglite');
const db=new PGlite();
await db.exec(`create role anon; create role authenticated; create role service_role; create schema auth;
create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}');
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
grant usage on schema auth to anon,authenticated;
grant usage on schema public to anon,authenticated;`);
await db.exec(await fs.readFile(new URL('../supabase/schema.sql',import.meta.url),'utf8'));
const admin='10000000-0000-0000-0000-000000000001',teacher='10000000-0000-0000-0000-000000000002',viewer='10000000-0000-0000-0000-000000000003',disabled='10000000-0000-0000-0000-000000000004';
await db.exec(`insert into auth.users(id,email) values('${admin}','admin@test.invalid'),('${teacher}','teacher@test.invalid'),('${viewer}','viewer@test.invalid'),('${disabled}','disabled@test.invalid');
update public.profiles set role='admin',enabled=true where id='${admin}';
update public.profiles set role='teacher',enabled=true where id='${teacher}';
update public.profiles set role='viewer',enabled=true where id='${viewer}';`);
await db.exec((await fs.readFile(new URL('../supabase/bootstrap-admin.sql',import.meta.url),'utf8')).replace('CHANGE_TO_YOUR_EMAIL@example.com','admin@test.invalid'));
assert.equal((await db.query('select role from public.profiles where id=$1',[admin])).rows[0].role,'admin');
const as=async(uid)=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[uid]);await db.exec('set role authenticated');};
let checks=0;
const verify=(name,fn)=>fn().then(()=>{checks++;console.log('PASS',name);});
const rejected=async(sql,params=[],pattern)=>{await assert.rejects(db.query(sql,params),pattern);};
await as(admin);
const y=(await db.query("select public.create_year(2569,'2026-05-16') id")).rows[0].id;
const input=[{student_code:'001',prefix:'นาย',first_name:'หนึ่ง',last_name:'ทดสอบ',room:'ม.4/1',training_year:1},{student_code:'002',prefix:'นาย',first_name:'สอง',last_name:'ทดสอบ',room:'ม.6/1',training_year:3},{student_code:'003',prefix:'นาย',first_name:'สาม',last_name:'ทดสอบ',room:'ม.5/1',training_year:2},{student_code:'004',prefix:'นาย',first_name:'สี่',last_name:'ทดสอบ',room:'ม.4/1',training_year:1}];
await db.query('select public.import_students($1,$2,$3)',[y,JSON.stringify(input),'2026-05-16']);
const es=(await db.query('select e.*,s.student_code from public.enrollments e join public.students s on s.id=e.student_id order by student_code')).rows;
const sid=(await db.query("select public.create_session($1,1::smallint,'2026-05-20','08–10','ทดสอบ',2) id",[y])).rows[0].id;
await verify('new sessions have no attendance, so unrecorded is never absent',async()=>assert.equal((await db.query('select count(*) n from public.attendance')).rows[0].n,0));
await verify('entire invalid import rolls back without orphaned students',async()=>{
 await rejected('select public.import_students($1,$2,$3)',[y,JSON.stringify([{...input[0],student_code:'005'},{...input[0],student_code:'006',training_year:4}]),'2026-05-16']);
 assert.equal((await db.query("select count(*) n from public.students where student_code in ('005','006')")).rows[0].n,0);
});
await as(teacher);
await verify('recorders expose display names to teachers without account email or roles',async()=>{
 const names=(await db.query('select public.get_recorder_names() n')).rows[0].n;
 assert.equal(names.length,4);assert.deepEqual(Object.keys(names[0]).sort(),['display_name','id']);
});
await verify('teacher can explicitly mark present with server attribution',async()=>{
 await db.query('select public.save_attendance($1,0,$2)',[sid,JSON.stringify([{enrollment_id:es[0].id,status:'present',recorded_by:admin}])]);
 const a=(await db.query('select * from public.attendance')).rows[0];assert.equal(a.recorded_by,teacher);assert.equal(a.status,'present');
});
await verify('stale revision rejects overwriting another saved version',()=>rejected('select public.save_attendance($1,0,$2)',[sid,JSON.stringify([{enrollment_id:es[0].id,status:'absent'}])],/โหลดใหม่/));
await verify('cross-year-level attendance is rejected atomically',async()=>{
 await rejected('select public.save_attendance($1,1,$2)',[sid,JSON.stringify([{enrollment_id:es[0].id,status:'absent'},{enrollment_id:es[1].id,status:'present'}])],/ไม่อยู่/);
 assert.equal((await db.query('select status from public.attendance')).rows[0].status,'present');
});
await verify('pending deletes an existing explicit status, not an absent replacement',async()=>{
 await db.query('select public.save_attendance($1,1,$2)',[sid,JSON.stringify([{enrollment_id:es[0].id,status:'pending'}])]);
 assert.equal((await db.query('select count(*) n from public.attendance')).rows[0].n,0);
});
await verify('teachers cannot import or self-promote to admin',async()=>{
 await rejected('select public.import_students($1,$2,$3)',[y,JSON.stringify(input),'2026-05-16'],/สิทธิ์/);
 await rejected("update public.profiles set role='admin' where id=$1",[teacher],/permission denied/);
});
await as(viewer);
await verify('viewer reads reports but cannot write attendance or access audits',async()=>{
 assert.equal((await db.query('select count(*) n from public.students')).rows[0].n,4);
 assert.equal((await db.query('select count(*) n from public.audit_logs')).rows[0].n,0);
 await rejected('select public.save_attendance($1,2,$2)',[sid,JSON.stringify([{enrollment_id:es[0].id,status:'absent'}])],/สิทธิ์/);
});
await as(disabled);
await verify('disabled accounts see no student data and cannot call mutation RPCs',async()=>{
 assert.equal((await db.query('select count(*) n from public.students')).rows[0].n,0);
 await rejected("select public.create_year(2570,'2027-05-16')",[],/สิทธิ์/);
});
await db.exec('reset role; set role anon');
await verify('anonymous callers cannot read or execute application RPCs',async()=>{
 await rejected('select * from public.students',[],/permission denied/);
 await rejected("select public.create_year(2570,'2027-05-16')",[],/permission denied/);
});
await as(admin);
await verify('promotion is blocked until every training result is assigned',()=>rejected("select public.promote_year($1,2570,'2027-05-16')",[y],/ทุกราย/));
await verify('admin cannot disable or demote self',()=>rejected("select public.set_member($1,'viewer','test',false)",[admin],/ตนเอง/));
for(const e of es)await db.query('select public.update_enrollment($1,$2,$3)',[e.id,e.room,['001','002'].includes(e.student_code)?'passed':'failed']);
const promoted=(await db.query("select public.promote_year($1,2570,'2027-05-16') result",[y])).rows[0].result;
await verify('promotion advances passed, repeats failed and graduates passed year three',async()=>{
 assert.equal(promoted.moved,3);assert.equal(promoted.graduated,1);
 const next=(await db.query('select e.training_year,e.room,s.student_code from public.enrollments e join public.students s on s.id=e.student_id where e.year_id=$1 order by s.student_code',[promoted.year_id])).rows;
 assert.deepEqual(next.map(e=>[e.student_code,e.training_year]),[['001',2],['003',2],['004',1]]);
 assert.ok(next.every(e=>e.room===''));
 assert.equal((await db.query('select count(*) n from public.enrollments where year_id=$1',[y])).rows[0].n,4);
});
await verify('closed-year writes and repeated promotion are blocked',async()=>{
 await rejected('select public.save_attendance($1,2,$2)',[sid,JSON.stringify([{enrollment_id:es[0].id,status:'absent'}])],/ปิด/);
 await rejected("select public.promote_year($1,2570,'2027-05-16')",[y],/เลื่อนชั้นแล้ว/);
});
await verify('admin backup includes all years and audit history',async()=>{
 const b=(await db.query('select public.export_backup() b')).rows[0].b;
 assert.equal(b.academic_years.length,2);assert.ok(b.audit_logs.length>10);assert.equal(b.students.length,4);
});
console.log(`${checks} database checks passed`);await db.close();
