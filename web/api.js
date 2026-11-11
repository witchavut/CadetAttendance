(function () {
  'use strict';
  const C = window.CadetCore, cfg = window.CADET_CONFIG || {};
  const configured = Boolean(cfg.supabaseUrl && cfg.supabaseKey);
  if (configured && (cfg.supabaseKey.startsWith('sb_secret_') || (() => { try { return JSON.parse(atob(cfg.supabaseKey.split('.')[1])).role === 'service_role'; } catch { return false; } })())) {
    throw new Error('ห้ามใช้ secret หรือ service_role key ในหน้าเว็บ');
  }
  const client = configured ? window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey) : null;
  const clone = v => JSON.parse(JSON.stringify(v));
  const id = () => crypto.randomUUID();
  const demoKey = 'cadet-demo-v1';
  let db;
  function seed() {
    const year = { id: 'year-demo', label: 2569, starts_on: '2026-05-16', closed: false };
    const names = ['กิตติพงศ์','ธนกฤต','ภาคิน','ณัฐวุฒิ','ศุภวิชญ์','ธนภัทร','ปุณณวิช','จิรายุ','ธีรภัทร','พีรวิชญ์','กวิน','ปฏิภาณ','ธนวัฒน์','ศุภกร','ชยพล','ปวริศ','ณภัทร','อชิระ','นราวิชญ์','ธนากร','กฤตภาส','วรเมธ','พศิน','ศิวกร'];
    const students = names.map((name,i) => ({ id:'s'+i, student_code:String(69001+i), prefix:'นาย', first_name:name, last_name:'ตัวอย่าง '+(i+1) }));
    const enrollments = students.map((s,i) => ({ id:'e'+i, student_id:s.id, year_id:year.id, training_year:Math.floor(i/8)+1, room:'ม.'+(Math.floor(i/8)+4)+'/'+(i%2+1), joined_on:'2026-05-16', result:'pending' }));
    const sessions = [], attendance = [];
    for (let level=1;level<=3;level++) for (let round=0;round<4;round++) {
      const s = { id:`t${level}-${round}`,year_id:year.id,training_year:level,training_date:['2026-10-19','2026-10-26','2026-11-02','2026-11-09'][round],slot:'08:00–12:00',title:['ระเบียบแถวและบุคคลท่ามือเปล่า','วิชาทหารทั่วไป','การฝึกภาคปฏิบัติ','การฝึกประจำสัปดาห์'][round],duration_hours:4,revision:0,created_by:'demo-admin' };
      sessions.push(s);
      if(round<3) enrollments.filter(e=>e.training_year===level).forEach((e,i) => attendance.push({session_id:s.id,enrollment_id:e.id,status:(i+round)%7===0?'absent':'present',recorded_by:'demo-admin',recorded_at:'2026-11-02T05:00:00Z'}));
    }
    return { years:[year], students, enrollments, sessions, attendance, profiles:[{id:'demo-admin',email:'demo@example.invalid',display_name:'ครูผู้กำกับ · ตัวอย่าง',role:'admin',enabled:true}], audit:[] };
  }
  function persist() { localStorage.setItem(demoKey, JSON.stringify(db)); }
  if (!configured) { try { db=JSON.parse(localStorage.getItem(demoKey)) || seed(); } catch { db=seed(); } }
  let user = configured ? null : db.profiles[0];
  async function rows(table, filter, order='id') {
    const all=[];
    for(let start=0;;start+=1000) {
      let query=client.from(table).select('*').order(order).range(start,start+999);
      if(filter) for(const [key,value] of Object.entries(filter)) query=query.eq(key,value);
      const {data,error}=await query; if(error) throw error;
      all.push(...data); if(data.length<1000) return all;
    }
  }
  async function rpc(name,args) { const {data,error}=await client.rpc(name,args); if(error) throw error; return data; }
  function log(action,table,record) {
    db.audit.unshift({id:id(),actor_id:user.id,action,table_name:table,record_id:record,created_at:new Date().toISOString()});
    persist();
  }
  function ensureWrite(roles=['admin']) { if(!roles.includes(user?.role)||!user?.enabled) throw new Error('ไม่มีสิทธิ์ดำเนินการ'); }
  function openYear(yearId) { if(db.years.find(y=>y.id===yearId)?.closed) throw new Error('ปีการศึกษานี้ปิดแล้ว'); }
  const API = {
    demo:!configured, client,
    async session() {
      if(!configured) return user;
      const {data:{user:authUser},error}=await client.auth.getUser();
      if(error||!authUser) return null;
      const {data,error:err}=await client.from('profiles').select('*').eq('id',authUser.id).single();
      if(err) throw err;
      user=data; return data;
    },
    async login(email,password) { const {error}=await client.auth.signInWithPassword({email,password}); if(error) throw new Error('อีเมลหรือรหัสผ่านไม่ถูกต้อง'); return API.session(); },
    async logout() { if(configured) {const {error}=await client.auth.signOut();if(error)throw error;} user=null; },
    async load(yearId) {
      if(!configured) return clone({...db,enrollments:db.enrollments.filter(e=>e.year_id===yearId),sessions:db.sessions.filter(s=>s.year_id===yearId),attendance:db.attendance.filter(a=>db.sessions.some(s=>s.id===a.session_id&&s.year_id===yearId))});
      const [years,students,enrollments,sessions,profiles,audit]=await Promise.all([
        rows('academic_years',null,'label'),rows('students'),yearId?rows('enrollments',{year_id:yearId}):[],yearId?rows('training_sessions',{year_id:yearId}):[],user.role==='admin'?rows('profiles'):rpc('get_recorder_names',{}),user.role==='admin'?client.from('audit_logs').select('*').order('id',{ascending:false}).limit(150).then(r=>{if(r.error)throw r.error;return r.data;}):[]
      ]);
      // Server RLS verifies access. Filter attendance on the session relation, then paginate.
      const attendance=[];
      if(yearId) for(let start=0;;start+=1000) {
        const {data,error}=await client.from('attendance').select('*,training_sessions!inner(year_id)').eq('training_sessions.year_id',yearId).order('session_id').order('enrollment_id').range(start,start+999);
        if(error)throw error;attendance.push(...data);if(data.length<1000)break;
      }
      return {years,students,enrollments,sessions,attendance,profiles,audit};
    },
    async createYear(label,date) {
      if(configured) return rpc('create_year',{p_label:label,p_starts_on:date});
      ensureWrite(); if(db.years.some(y=>y.label===label))throw new Error('ปีการศึกษาซ้ำ');
      const year={id:id(),label,starts_on:date,closed:false};db.years.push(year);log('INSERT','academic_years',year.id);return year.id;
    },
    async importStudents(yearId,values,date) {
      if(!yearId)throw new Error('กรุณาสร้างหรือเลือกปีการศึกษาก่อนนำเข้ารายชื่อ');
      if(configured) return rpc('import_students',{p_year_id:yearId,p_rows:values,p_joined_on:date});
      ensureWrite();openYear(yearId);
      const next=clone(db);
      for(const v of values) {
        let s=next.students.find(x=>x.student_code===v.student_code);
        if(s&&[s.first_name,s.last_name,s.prefix].join('|')!==[v.first_name,v.last_name,v.prefix].join('|'))throw new Error('ชื่อไม่ตรงกับทะเบียนเดิม: '+v.student_code);
        if(!s){s={id:id(),...v};delete s.training_year;delete s.room;next.students.push(s);}
        if(next.enrollments.some(e=>e.student_id===s.id&&e.year_id===yearId))throw new Error('มีรายชื่อในปีนี้แล้ว');
        next.enrollments.push({id:id(),student_id:s.id,year_id:yearId,training_year:v.training_year,room:v.room,joined_on:date,result:'pending'});
      }
      db=next;log('IMPORT','enrollments',String(values.length));return values.length;
    },
    async updateEnrollment(eId,room,result) {
      if(configured)return rpc('update_enrollment',{p_id:eId,p_room:room,p_result:result});
      ensureWrite();const e=db.enrollments.find(e=>e.id===eId);openYear(e.year_id);e.room=room;e.result=result;log('UPDATE','enrollments',eId);
    },
    async createSession(v) {
      if(configured)return rpc('create_session',{p_year_id:v.year_id,p_training_year:v.training_year,p_date:v.training_date,p_slot:v.slot,p_title:v.title,p_hours:v.duration_hours});
      ensureWrite(['admin','teacher']);openYear(v.year_id);
      if(db.sessions.some(s=>s.year_id===v.year_id&&s.training_year===v.training_year&&s.training_date===v.training_date&&s.slot===v.slot))throw new Error('มีรอบฝึกนี้แล้ว');
      const s={id:id(),...v,revision:0,created_by:user.id};db.sessions.push(s);log('INSERT','training_sessions',s.id);return s.id;
    },
    async createWeeklySchedule(yearId,term=2,first='2026-11-04',last='2027-03-17') {
      if(!yearId)throw new Error('กรุณาเลือกปีการศึกษาก่อน');
      if(configured)return rpc('create_weekly_schedule',{p_year_id:yearId,p_term:term,p_first_date:first,p_last_date:last,p_start_time:'14:40',p_end_time:'15:30'});
      ensureWrite();openYear(yearId);const dates=C.weeklyDates(first,last);
      for(const week of dates)for(const level of [1,2,3]){
        const old=db.sessions.find(s=>s.year_id===yearId&&s.term_number===term&&s.week_number===week.week_number&&s.training_year===level);
        if(old){if(old.training_date!==week.training_date)throw new Error('ตารางเดิมไม่ตรงกัน');continue;}
        db.sessions.push({id:id(),year_id:yearId,training_year:level,...week,term_number:term,slot:'14:40–15:30',duration_hours:0.83,duration_minutes:50,title:`เช็กชื่อ นศท. ภาคเรียน ${term} สัปดาห์ที่ ${week.week_number}`,session_kind:'training',activity_note:'',revision:0,created_by:user.id});
      }log('CREATE_SCHEDULE','training_sessions',String(term));return dates.length;
    },
    async saveWeeklyAttendance(yearId,term,week,expected,kind,note,records) {
      if(configured)return rpc('save_weekly_attendance',{p_year_id:yearId,p_term:term,p_week:week,p_expected:expected,p_kind:kind,p_note:note,p_records:records});
      ensureWrite(['admin','teacher']);openYear(yearId);
      if(!['training','activity'].includes(kind)||typeof note!=='string'||note.length>500||(kind==='activity'&&!note.trim()))throw new Error('กรุณาระบุเหตุผลกรณีมีกิจกรรม');
      const group=db.sessions.filter(s=>s.year_id===yearId&&s.term_number===term&&s.week_number===week);
      if(group.length!==3)throw new Error('ตารางยังไม่ครบทั้ง 3 ชั้นปี');
      const saved=JSON.parse(localStorage.getItem(demoKey)||'null');
      if(group.some(s=>expected[s.id]!==s.revision||(saved&&saved.sessions.find(x=>x.id===s.id)?.revision!==s.revision)))throw new Error('มีผู้ใช้อื่นแก้ไขสัปดาห์นี้แล้ว กรุณาโหลดข้อมูลใหม่');
      const next=clone(db);
      for(const s of group){
        const roster=next.enrollments.filter(e=>e.year_id===yearId&&e.training_year===s.training_year&&e.joined_on<=s.training_date);
        const changes=kind==='activity'?roster.map(e=>({enrollment_id:e.id,status:'present'})):records.filter(r=>roster.some(e=>e.id===r.enrollment_id));
        for(const r of changes){next.attendance=next.attendance.filter(a=>!(a.session_id===s.id&&a.enrollment_id===r.enrollment_id));if(r.status!=='pending')next.attendance.push({...r,session_id:s.id,recorded_by:user.id,recorded_at:new Date().toISOString()});}
        Object.assign(next.sessions.find(x=>x.id===s.id),{session_kind:kind,activity_note:kind==='activity'?note.trim():'',revision:s.revision+1});
      }db=next;log('SAVE_WEEK','training_sessions',`${term}/${week}`);return{week,kind};
    },
    async saveAttendance(sessionId,revision,records) {
      if(configured)return rpc('save_attendance',{p_session_id:sessionId,p_expected_revision:revision,p_records:records});
      ensureWrite(['admin','teacher']);const s=db.sessions.find(s=>s.id===sessionId);openYear(s.year_id);
      // Read persisted state to detect another tab's save, matching production revisions.
      const persisted=JSON.parse(localStorage.getItem(demoKey)||'null');
      if(persisted&&persisted.sessions.find(x=>x.id===sessionId)?.revision!==revision)throw new Error('มีผู้ใช้อื่นแก้ไขแล้ว กรุณาโหลดใหม่');
      if(s.revision!==revision)throw new Error('มีผู้ใช้อื่นแก้ไขแล้ว กรุณาโหลดใหม่');
      for(const r of records) {
        const e=db.enrollments.find(e=>e.id===r.enrollment_id);
        if(!e||e.year_id!==s.year_id||e.training_year!==s.training_year||e.joined_on>s.training_date||!['present','absent','pending'].includes(r.status))throw new Error('ข้อมูลเช็กชื่อไม่ถูกต้อง');
      }
      for(const r of records){db.attendance=db.attendance.filter(a=>!(a.session_id===sessionId&&a.enrollment_id===r.enrollment_id));if(r.status!=='pending')db.attendance.push({...r,session_id:sessionId,recorded_by:user.id,recorded_at:new Date().toISOString()});}
      s.revision++;log('SAVE','attendance',sessionId);return s.revision;
    },
    async promote(source,target,date) {
      if(configured)return rpc('promote_year',{p_source_id:source,p_target_label:target,p_starts_on:date});
      ensureWrite();openYear(source);const y=db.years.find(y=>y.id===source),list=db.enrollments.filter(e=>e.year_id===source);
      if(!list.length||list.some(e=>e.result==='pending'))throw new Error('กรุณาระบุผลการฝึกให้ครบ');
      if(target!==y.label+1||date<=y.starts_on||db.years.some(y=>y.label===target))throw new Error('ปีปลายทางไม่ถูกต้องหรือมีอยู่แล้ว');
      const targetId=id();db.years.push({id:targetId,label:target,starts_on:date,closed:false});let moved=0,graduated=0;
      for(const e of C.promotionPreview(list)){if(e.next_year===null){graduated++;continue;}db.enrollments.push({...e,id:id(),year_id:targetId,training_year:e.next_year,room:'',joined_on:date,result:'pending'});moved++;}
      y.closed=true;y.promoted_to=targetId;log('PROMOTE','academic_years',source);return {year_id:targetId,moved,graduated};
    },
    async member(v) {
      if(configured) {
        if(v.id)return rpc('set_member',{p_id:v.id,p_role:v.role,p_name:v.display_name,p_enabled:v.enabled});
        const {data,error}=await client.functions.invoke('manage-users',{body:v});
        if(error)throw new Error((await error.context?.json?.().catch(()=>null))?.error||error.message);if(data?.error)throw new Error(data.error);return data;
      }
      ensureWrite();if(v.id===user.id&&(!v.enabled||v.role!=='admin'))throw new Error('ไม่สามารถปิดสิทธิ์ผู้ดูแลของตนเอง');
      if(v.id)Object.assign(db.profiles.find(p=>p.id===v.id),v);else{if(db.profiles.some(p=>p.email===v.email))throw new Error('อีเมลซ้ำ');const {password,...safe}=v;db.profiles.push({...safe,id:id()});}log('UPDATE','profiles',v.id||v.email);
    },
    async backup() { if(configured)return rpc('export_backup',{});return clone({format:'cadet-backup-v1',exported_at:new Date().toISOString(),...db}); },
    resetDemo(){localStorage.removeItem(demoKey);location.reload();}
  };
  window.CadetAPI=API;
})();

