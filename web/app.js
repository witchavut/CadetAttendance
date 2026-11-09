(function () {
  'use strict';
  const C=window.CadetCore, API=window.CadetAPI, esc=C.escapeHTML;
  const $=(s,root=document)=>root.querySelector(s), $$=(s,root=document)=>[...root.querySelectorAll(s)];
  const roles={admin:'ผู้ดูแลระบบ',teacher:'ครูผู้เช็กชื่อ',viewer:'ผู้ดูรายงาน'};
  const results={pending:'ยังไม่ระบุผล',passed:'ผ่าน',failed:'ไม่ผ่าน'};
  const pages={dashboard:'ภาพรวม',attendance:'เช็กชื่อการฝึก',students:'ทะเบียนนักศึกษา',import:'นำเข้า Excel',reports:'รายงานการฝึก',years:'ปีการศึกษา / เลื่อนชั้น',users:'ผู้ใช้และสิทธิ์',audit:'ประวัติการใช้งาน',settings:'การตั้งค่าและสำรองข้อมูล'};
  const iconPaths={
    dashboard:'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
    attendance:'M9 5H5v16h14V5h-4 M9 3h6v4H9z M8 13l3 3 5-5',
    students:'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M22 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75',
    import:'M12 16V3 M7 8l5-5 5 5 M3 14v7h18v-7',
    reports:'M5 3h9l5 5v13H5z M14 3v6h5 M8 13h8 M8 17h5',
    years:'M4 6h16v15H4z M4 10h16 M8 3v5 M16 3v5 M8 14h2 M14 14h2 M8 17h2',
    users:'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M20 8v6 M17 11h6',
    audit:'M3 12a9 9 0 1 0 3-7 M3 3v5h5 M12 7v5l3 2',
    settings:'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1z',
    menu:'M4 6h16 M4 12h16 M4 18h16',plus:'M12 5v14 M5 12h14',download:'M12 3v12 M7 10l5 5 5-5 M4 16v5h16v-5',arrow:'M5 12h14 M14 7l5 5-5 5',check:'M5 12l4 4L19 6',close:'M6 6l12 12 M18 6L6 18',search:'M21 21l-5-5 M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14',logout:'M9 3H4v18h5 M10 12h11 M17 8l4 4-4 4',refresh:'M20 7a9 9 0 1 0 1 8 M20 3v5h-5',clock:'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18 M12 7v5l3 2',print:'M6 8V3h12v5 M6 17H3V9h18v8h-3 M6 14h12v7H6z',shield:'M12 3l8 3v6c0 5-8 9-8 9s-8-4-8-9V6z M8 12l3 3 5-6',edit:'M16 3l5 5-12 12H4v-5z M13 6l5 5',alert:'M12 3 2 21h20z M12 9v5 M12 17v1'
  };
  const icon=(name)=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${iconPaths[name]||iconPaths.reports}"/></svg>`;
  const btn=(label,action,kind='',symbol='')=>`<button type="button" class="btn ${kind}" data-action="${action}">${symbol?icon(symbol):''}${label}</button>`;
  const state={page:'dashboard',level:0,yearId:localStorage.getItem('cadet-year')||'',data:{years:[],students:[],enrollments:[],sessions:[],attendance:[],profiles:[],audit:[]},user:null,sessionId:'',draft:{},search:'',importRows:[],importDate:'',collapsed:localStorage.getItem('cadet-sidebar')==='collapsed',mobile:false,busy:false};
  let toastTimer;
  const toast=(message)=>{const el=$('#toast');el.textContent=message;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),4200);};
  const year=()=>state.data.years.find(y=>y.id===state.yearId);
  const isAdmin=()=>state.user?.role==='admin';
  const canCheck=()=>['admin','teacher'].includes(state.user?.role)&&!year()?.closed;
  const canManage=()=>isAdmin()&&!year()?.closed;
  const enrollmentList=()=>state.data.enrollments.map(e=>({...e,student:state.data.students.find(s=>s.id===e.student_id)||{}}));
  const filteredEnrollments=()=>enrollmentList().filter(e=>(!state.level||e.training_year===state.level)&&(!state.search||[C.fullName(e.student),e.student.student_code,e.room].join(' ').toLowerCase().includes(state.search.toLowerCase())));
  const sessions=()=>state.data.sessions.filter(s=>!state.level||s.training_year===state.level);
  const selectedSession=()=>state.data.sessions.find(s=>s.id===state.sessionId);
  const roster=()=>{const s=selectedSession();return s?enrollmentList().filter(e=>e.training_year===s.training_year&&e.joined_on<=s.training_date):[];};
  const date=(v,opts={})=>v?new Intl.DateTimeFormat('th-TH',{day:'numeric',month:'short',year:'numeric',timeZone:'Asia/Bangkok',...opts}).format(new Date(v.length===10?v+'T12:00:00+07:00':v)):'—';
  const statusBadge=(v)=>`<span class="badge ${v==='absent'?'red':v==='pending'?'gold':''}">${C.STATUSES[v]||esc(v)}</span>`;
  const empty=(title,desc,action='')=>`<div class="empty">${icon('attendance')}<h3>${title}</h3><p>${desc}</p>${action?`<div style="margin-top:18px">${action}</div>`:''}</div>`;
  const changed=()=>Object.keys(state.draft).length>0;
  const mayLeave=()=>!changed()||confirm('ยังมีรายการเช็กชื่อที่ไม่ได้บันทึก ต้องการออกจากหน้านี้หรือไม่?');
  const levelTabs=()=>`<div class="level-tabs" role="group" aria-label="เลือกชั้นปี">${[0,1,2,3].filter(n=>state.page!=='attendance'||n!==0).map(n=>`<button type="button" class="${state.level===n?'selected':''}" aria-pressed="${state.level===n}" data-action="level" data-value="${n}">${n?'ชั้นปีที่ '+n:'ทุกชั้นปี'}</button>`).join('')}</div>`;
  const heading=(eyebrow,title,desc,actions='')=>`<div class="heading"><div><div class="eyebrow">${eyebrow}</div><h1>${title}</h1><p>${desc}</p></div><div class="actions">${actions}</div></div>`;
  function searchField(placeholder='ค้นหารหัส ชื่อ หรือห้องเรียน') {return `<div class="search">${icon('search')}<input id="search" type="search" autocomplete="off" placeholder="${placeholder}" aria-label="${placeholder}" value="${esc(state.search)}"></div>`;}
  function activeMenu(p){return `<button type="button" data-action="navigate" data-page="${p}" class="${state.page===p?'active':''}" title="${pages[p]}" ${state.page===p?'aria-current="page"':''}>${icon(p)}<span class="nav-text">${pages[p]}</span></button>`;}
  function render() {
    if(!state.user){renderLogin();return;}
    if(!state.user.enabled){$('#app').innerHTML=`<div class="login"><div class="card login-box"><img src="icon.svg" width="48" alt=""><h2 style="margin-top:15px">บัญชียังไม่ได้เปิดสิทธิ์</h2><p class="guide">กรุณาให้ผู้ดูแลระบบเปิดใช้งานบัญชี ${esc(state.user.email)}</p>${btn('ออกจากระบบ','logout')}</div></div>`;return;}
    const content={dashboard:renderDashboard,attendance:renderAttendance,students:renderStudents,import:renderImport,reports:renderReports,years:renderYears,users:renderUsers,audit:renderAudit,settings:renderSettings}[state.page]();
    $('#app').innerHTML=`<div class="layout ${state.collapsed?'collapsed':''} ${state.mobile?'mobile-open':''}">
      <button class="overlay" type="button" data-action="menu" aria-label="ปิดเมนู"></button>
      <aside class="sidebar" aria-label="เมนูหลัก" ${innerWidth<=700&&!state.mobile?'inert':''}><div class="brand"><img src="icon.svg" alt="ตราระบบ นศท."><div class="brand-text"><b>นศท. Connect</b><small>CADET ATTENDANCE</small></div></div>
      <div class="nav-label">WORKSPACE</div><nav class="nav">${['dashboard','attendance','students',...(isAdmin()?['import']:[]),'reports'].map(activeMenu).join('')}</nav>
      <div class="nav-label" style="margin-top:23px">MANAGEMENT</div><nav class="nav">${[...(isAdmin()?['years','users','audit']:[]),'settings'].map(activeMenu).join('')}</nav>
      <div class="sidebar-bottom"><div class="term">การฝึกนักศึกษาวิชาทหาร<b>ปีการศึกษา ${year()?.label||'—'}</b><span>${year()?.closed?'ปิดปีแล้ว · ดูประวัติย้อนหลัง':'ชั้นปีที่ 1–3'}</span></div>
      <div class="user"><div class="avatar">${icon('shield')}</div><div class="user-text"><b>${esc(state.user.display_name)}</b><small>${roles[state.user.role]}</small></div><button class="icon-btn logout" type="button" data-action="logout" aria-label="ออกจากระบบ" title="ออกจากระบบ">${icon('logout')}</button></div></div></aside>
      <main class="main" ${innerWidth<=700&&state.mobile?'inert':''}><header class="topbar"><button class="icon-btn" type="button" data-action="menu" aria-label="${innerWidth<=700?(state.mobile?'ปิด':'เปิด'):(state.collapsed?'ขยาย':'ยุบ')}เมนู" aria-expanded="${window.innerWidth<=700?state.mobile:!state.collapsed}">${icon('menu')}</button><div class="breadcrumb"><span>${esc(window.CADET_CONFIG.schoolName||'ระบบนักศึกษาวิชาทหาร')}</span><span>/</span><b>${pages[state.page]}</b></div><div class="online ${API.demo?'demo':''}">${API.demo?'โหมดทดลอง · ข้อมูลตัวอย่าง':'เชื่อมต่อฐานข้อมูลจริง'}</div><select id="year-select" aria-label="ปีการศึกษา">${state.data.years.map(y=>`<option value="${y.id}" ${y.id===state.yearId?'selected':''}>ปีการศึกษา ${y.label}${y.closed?' · ปิดปีแล้ว':''}</option>`).join('')||'<option>ยังไม่มีปีการศึกษา</option>'}</select></header>
      <div class="content" id="content" tabindex="-1">${year()?.closed&&state.page!=='years'?'<div class="callout">กำลังดูประวัติปีการศึกษาที่ปิดแล้ว ข้อมูลถูกเก็บไว้และไม่เปิดให้แก้ไข</div>':''}${content}<footer class="footer"><span>นศท. Connect · ${esc(window.CADET_CONFIG.schoolName||'ระบบเช็กชื่อ นศท.')}</span><span>บันทึกการฝึกอย่างเป็นระบบ ทุกปีการศึกษา</span></footer></div></main></div>`;
  }
  function renderDashboard() {
    const es=filteredEnrollments(),ss=sessions(),sum=C.summarize(es,ss,state.data.attendance);
    const latest=[...ss].sort((a,b)=>b.training_date.localeCompare(a.training_date)||b.slot.localeCompare(a.slot)).slice(0,4);
    const kpis=[['students',es.length,'นักศึกษาทั้งหมด','คน · ตามชั้นปีที่เลือก',''],['check',sum.present,'มาเข้าฝึก','รายการเช็กชื่อที่บันทึกแล้ว',''],['close',sum.absent,'ขาดการฝึก','เฉพาะรายการที่ระบุว่าขาด','red'],['clock',sum.pending,'ยังไม่บันทึก','ไม่นับรวมเป็นการขาด','gold']];
    const total=sum.expected||1,pctPresent=sum.present/total*100,pctAbsent=sum.absent/total*100;
    return heading('OVERVIEW','ภาพรวมการฝึก','ติดตามการเข้าฝึกและจัดการข้อมูลนักศึกษาวิชาทหาร',btn('ดาวน์โหลดรายงาน','goto-reports','','download')+btn('เช็กชื่อการฝึก','goto-attendance','primary','plus'))+
      `<div class="hero"><div><div class="eyebrow">TRAINING YEAR ${year()?.label||'—'}</div><h2>พร้อมสำหรับการฝึกครั้งต่อไป</h2><p>ดูภาพรวม ตรวจสอบรายชื่อ และติดตามการฝึกได้ในที่เดียว</p></div><div class="hero-side"><div class="hero-number">${sum.rate===null?'—':sum.rate+'%'}</div><div class="hero-rule"></div><div class="hero-caption">อัตรามาเข้าฝึก<br>จากรายการที่บันทึกแล้ว</div></div></div>`+levelTabs()+
      `<div class="kpis">${kpis.map(([ic,n,label,note,cls])=>`<div class="card kpi ${cls}"><div class="kpi-icon">${icon(ic)}</div><span class="dot"></span><strong>${n.toLocaleString('th-TH')}</strong><div class="label">${label}</div><small>${note}</small></div>`).join('')}</div>
      <div class="dashboard-grid"><section class="card"><div class="card-head"><div><h2>การเข้าฝึกแต่ละชั้นปี</h2><p>จำนวนรายการในทุกรอบฝึกที่สร้างไว้</p></div><span class="badge gray">ปี ${year()?.label||'—'}</span></div><div class="legend"><span><i style="background:#537c5b"></i>มา</span><span><i style="background:#cf9e8e"></i>ขาด</span><span><i style="background:#e4d8b6"></i>ยังไม่บันทึก</span></div><div class="bars">${[1,2,3].map(level=>{const st=C.summarize(es.filter(e=>e.training_year===level),ss.filter(s=>s.training_year===level),state.data.attendance);const max=Math.max(1,...[1,2,3].map(l=>C.summarize(es.filter(e=>e.training_year===l),ss.filter(s=>s.training_year===l),state.data.attendance).expected));return `<div class="bar-group" aria-label="ชั้นปี ${level}: มา ${st.present} ขาด ${st.absent} ยังไม่บันทึก ${st.pending}">${[st.present,st.absent,st.pending].map((v,i)=>`<i title="${['มา','ขาด','ยังไม่บันทึก'][i]} ${v}" style="height:${v/max*100}%;background:${['#537c5b','#cf9e8e','#e4d8b6'][i]}"></i>`).join('')}</div>`;}).join('')}</div><div class="bar-labels"><span>ชั้นปีที่ 1</span><span>ชั้นปีที่ 2</span><span>ชั้นปีที่ 3</span></div></section>
      <section class="card"><div class="card-head"><div><h2>สถานะการบันทึก</h2><p>ภาพรวมรายการเช็กชื่อทั้งหมด</p></div>${icon('attendance')}</div><div class="ring-layout"><div class="ring" style="background:conic-gradient(#537c5b 0 ${pctPresent}%,#cf9e8e ${pctPresent}% ${pctPresent+pctAbsent}%,#e9e2cf ${pctPresent+pctAbsent}% 100%)"><div><strong>${sum.expected?Math.round((sum.present+sum.absent)/sum.expected*100)+'%':'—'}</strong><small>บันทึกแล้ว</small></div></div><div class="ring-details"><div class="row"><span>มาเข้าฝึก</span><strong>${sum.present}</strong></div><div class="row"><span>ขาดการฝึก</span><strong>${sum.absent}</strong></div><div class="row"><span>ยังไม่บันทึก</span><strong>${sum.pending}</strong></div></div></div><div class="note">รายการที่ยังไม่บันทึกจะแยกไว้เสมอ และไม่นับเป็นขาดการฝึก</div></section></div>
      <section class="card page-card"><div class="card-head"><div><h2>รอบฝึกล่าสุด</h2><p>เลือกเพื่อดูรายชื่อและบันทึกการเข้าฝึก</p></div>${btn('ดูรอบฝึกทั้งหมด','goto-attendance','ghost sm','arrow')}</div>${latest.length?`<div class="table-wrap"><table class="table"><thead><tr><th>วันที่ฝึก</th><th>รายละเอียด</th><th>ชั้นปี</th><th>สถานะ</th><th></th></tr></thead><tbody>${latest.map(s=>{const list=es.filter(e=>e.training_year===s.training_year&&e.joined_on<=s.training_date),st=C.summarize(list,[s],state.data.attendance);return `<tr><td class="num">${date(s.training_date)}<small>${esc(s.slot)}</small></td><td class="name">${esc(s.title)}</td><td><span class="badge gray">ปี ${s.training_year}</span></td><td><span class="badge ${st.pending?'gold':''}">${st.pending?'บันทึก '+(st.present+st.absent)+' / '+list.length:'บันทึกครบแล้ว'}</span></td><td><button class="btn ghost sm" data-action="open-session" data-id="${s.id}">${icon('arrow')}<span class="small">เปิด</span></button></td></tr>`;}).join('')}</tbody></table></div>`:empty('ยังไม่มีรอบฝึก','สร้างรอบฝึกเพื่อเริ่มบันทึกการเข้าฝึก',canCheck()?btn('สร้างรอบฝึก','new-session','primary','plus'):'')}</section>`;
  }
  function chooseSession() {
    if(!sessions().some(s=>s.id===state.sessionId)) {state.sessionId=[...sessions()].sort((a,b)=>b.training_date.localeCompare(a.training_date))[0]?.id||'';state.draft={};}
  }
  function renderAttendance() {
    if(!state.level)state.level=1;chooseSession();
    const ss=[...sessions()].sort((a,b)=>b.training_date.localeCompare(a.training_date)),s=selectedSession(),list=roster();
    return heading('ATTENDANCE','เช็กชื่อการฝึก','เลือกชั้นปีและรอบฝึก แล้วระบุเฉพาะสถานะที่ตรวจสอบแล้ว',btn('โหลดข้อมูลใหม่','refresh','','refresh')+(canCheck()?btn('สร้างรอบฝึก','new-session','primary','plus'):''))+levelTabs()+
      (s?`<div class="callout ${year()?.closed?'':'success'}">${esc(s.title)} · ${date(s.training_date)} · ${esc(s.slot)} · ${s.duration_hours} ชั่วโมง <span class="muted">| รายชื่อ ${list.length} คน</span></div>`:'')+
      `<section class="card page-card"><div class="toolbar"><select id="session-select" class="field-select" aria-label="เลือกรอบฝึก">${ss.map(s=>`<option value="${s.id}" ${s.id===state.sessionId?'selected':''}>${date(s.training_date)} · ${esc(s.slot)} · ${esc(s.title)}</option>`).join('')||'<option>ยังไม่มีรอบฝึก</option>'}</select>${searchField()}${canCheck()&&s?btn('ระบุ “มา” ทั้งรายชื่อที่แสดง','mark-present','sm','check'):''}</div><div id="attendance-table">${attendanceTable()}</div>${s?`<div class="savebar"><p id="draft-count">${draftSummary()}</p>${canCheck()?`<button type="button" class="btn primary" data-action="save-attendance" ${changed()?'':'disabled'}>${icon('check')}บันทึกการเช็กชื่อ</button>`:'<span class="muted small">ดูข้อมูลอย่างเดียว</span>'}</div>`:''}</section>`;
  }
  function currentStatus(eId) {return state.draft[eId]??state.data.attendance.find(a=>a.session_id===state.sessionId&&a.enrollment_id===eId)?.status??'pending';}
  function draftSummary(){const list=roster(),n=list.filter(e=>currentStatus(e.id)==='pending').length;return `เปลี่ยนแปลง <strong>${Object.keys(state.draft).length}</strong> รายการ · ยังไม่บันทึก ${n} คน`;}
  function attendanceTable() {
    if(!selectedSession())return empty('ยังไม่มีรอบฝึกในชั้นปีนี้','กดสร้างรอบฝึกเพื่อเริ่มเช็กชื่อ');
    const list=roster().filter(e=>!state.search||[C.fullName(e.student),e.student.student_code,e.room].join(' ').toLowerCase().includes(state.search.toLowerCase()));
    if(!list.length)return empty('ไม่พบรายชื่อ','ตรวจคำค้น หรือเพิ่มทะเบียนนักศึกษาก่อนสร้างรายการเช็กชื่อ');
    return `<div class="table-wrap"><table class="table"><thead><tr><th>ลำดับ</th><th>นักศึกษา</th><th>ห้อง</th><th>สถานะการเข้าฝึก</th><th class="optional">บันทึกล่าสุด</th></tr></thead><tbody>${list.map((e,i)=>{const a=state.data.attendance.find(a=>a.session_id===state.sessionId&&a.enrollment_id===e.id),actor=state.data.profiles.find(p=>p.id===a?.recorded_by);const status=currentStatus(e.id);return `<tr><td class="muted">${i+1}</td><td class="name">${esc(C.fullName(e.student))}<small>${esc(e.student.student_code)}</small></td><td>${esc(e.room)||'—'}</td><td>${canCheck()?`<div class="status-control" role="group" aria-label="สถานะ ${esc(C.fullName(e.student))}">${['present','absent','pending'].map(st=>`<button type="button" class="${status===st?'on ':''}${st}" aria-pressed="${status===st}" data-action="status" data-id="${e.id}" data-status="${st}">${C.STATUSES[st]}</button>`).join('')}</div>`:statusBadge(status)}</td><td class="optional muted">${state.draft[e.id]!==undefined?'รอบันทึก':a?esc(actor?.display_name||'ผู้บันทึก')+'<small>'+date(a.recorded_at,{hour:'2-digit',minute:'2-digit'})+'</small>':'—'}</td></tr>`;}).join('')}</tbody></table></div>`;
  }
  function renderStudents() {
    return heading('STUDENT REGISTRY','ทะเบียนนักศึกษา','ทะเบียนแยกปีการศึกษา พร้อมผลการฝึกและประวัติการเข้าฝึก',canManage()?btn('นำเข้า Excel','goto-import','','import')+btn('เพิ่มนักศึกษา','new-student','primary','plus'):'')+levelTabs()+`<section class="card page-card"><div class="toolbar">${searchField()}<span class="muted small">${filteredEnrollments().length} รายชื่อ</span></div><div id="students-table">${studentsTable()}</div></section>`;
  }
  function studentsTable() {const es=filteredEnrollments();return es.length?`<div class="table-wrap"><table class="table"><thead><tr><th>รหัสนักเรียน</th><th>ชื่อ–นามสกุล</th><th>ชั้นปี</th><th>ห้อง</th><th>ผลการฝึก</th><th>การจัดการ</th></tr></thead><tbody>${es.map(e=>`<tr><td class="num">${esc(e.student.student_code)}</td><td class="name">${esc(C.fullName(e.student))}</td><td><span class="badge gray">ปี ${e.training_year}</span></td><td>${esc(e.room)||'—'}</td><td><span class="badge ${e.result==='failed'?'red':e.result==='pending'?'gold':''}">${results[e.result]}</span></td><td><button type="button" class="btn ghost sm" data-action="student-detail" data-id="${e.id}">${icon(canManage()?'edit':'reports')}${canManage()?'ห้อง / ผลการฝึก':'ดูประวัติ'}</button></td></tr>`).join('')}</tbody></table></div>`:empty('ยังไม่มีทะเบียนที่ตรงกัน','เพิ่มรายชื่อหรือนำเข้า Excel ในปีการศึกษานี้');}
  function renderImport() {
    if(!isAdmin())return empty('ไม่มีสิทธิ์','เฉพาะผู้ดูแลระบบเท่านั้น');
    const invalid=state.importRows.filter(r=>r.errors.length).length;
    return heading('IMPORT STUDENTS','นำเข้าทะเบียน Excel','ตรวจสอบรายชื่อก่อนนำเข้า ข้อมูลจะบันทึกพร้อมกันเมื่อผ่านการตรวจครบทุกแถว',btn('ดาวน์โหลดแบบฟอร์ม .xlsx','template','','download'))+
      `<div class="two-col"><section class="card"><div class="card-head"><div><h2>เพิ่มรายชื่อจากไฟล์</h2><p>ปีการศึกษา ${year()?.label||'—'}</p></div><span class="badge gray">EXCEL / CSV</span></div><label class="upload">${icon('import')}<b>เลือกไฟล์ทะเบียนนักศึกษา</b><small>.xlsx หรือ .csv · ไม่เกิน 5 MB และ 2,000 รายชื่อ</small><input id="import-file" type="file" accept=".xlsx,.csv" ${canManage()?'':'disabled'}></label><label class="field" style="margin-top:18px">เริ่มนับรอบฝึกตั้งแต่วันที่<input id="import-date" type="date" value="${state.importDate||year()?.starts_on||C.bangkokDate()}" required></label><div id="import-error" class="error"></div></section><section class="card"><h2>เตรียมไฟล์อย่างไร</h2><div class="guide"><ol><li>ดาวน์โหลดแบบฟอร์ม แล้วกรอกในชีต <b>ทะเบียน</b></li><li>ใช้หัวคอลัมน์ตามแบบฟอร์ม: ${C.HEADERS.join(' · ')}</li><li>ชั้นปีใช้เลข <b>1, 2 หรือ 3</b> และรหัสนักเรียนต้องไม่ซ้ำ</li><li>เก็บรหัสนักเรียนเป็นข้อความเพื่อคงเลขศูนย์ด้านหน้า</li><li>ตรวจตัวอย่างด้านล่าง แล้วกดยืนยันนำเข้า</li></ol></div><div class="note">หากมีแถวผิด ระบบจะยังไม่บันทึกทั้งไฟล์ เพื่อให้แก้ข้อมูลได้ครบก่อนนำเข้า</div></section></div>
      ${state.importRows.length?`<section class="card page-card" style="margin-top:22px"><div class="card-head"><div><h2>ตรวจสอบก่อนนำเข้า</h2><p>${state.importRows.length} รายชื่อ · พบปัญหา ${invalid} แถว</p></div><span class="badge ${invalid?'red':''}">${invalid?'ต้องแก้ไขไฟล์':'พร้อมนำเข้า'}</span></div><div class="table-wrap"><table class="table"><thead><tr><th>แถว</th><th>รหัส</th><th>ชื่อ–นามสกุล</th><th>ชั้นปี</th><th>ผลตรวจสอบ</th></tr></thead><tbody>${state.importRows.slice(0,100).map(r=>`<tr><td>${r.row}</td><td>${esc(r.value.student_code)}</td><td>${esc(C.fullName(r.value))}</td><td>${r.value.training_year||'—'}</td><td>${r.errors.length?`<span style="color:var(--red)">${esc(r.errors.join(' · '))}</span>`:'<span class="badge">ถูกต้อง</span>'}</td></tr>`).join('')}</tbody></table></div><div class="savebar"><p>แสดงตัวอย่างสูงสุด 100 แถว · ตรวจครบทั้งไฟล์แล้ว</p><button class="btn primary" data-action="confirm-import" ${invalid||!canManage()?'disabled':''}>ยืนยันนำเข้า ${state.importRows.length} คน</button></div></section>`:''}`;
  }
  function reportRows() {return filteredEnrollments().map(e=>({e,...C.studentReport(e,sessions(),state.data.attendance)}));}
  function renderReports() {
    return heading('TRAINING REPORTS','รายงานการฝึก','สรุปรายบุคคล และดาวน์โหลดตารางรายรอบพร้อมสถานะที่ยังไม่บันทึก',btn('พิมพ์ / บันทึก PDF','print','','print')+btn('ดาวน์โหลด Excel','export-report','primary','download'))+levelTabs()+`<div class="note" style="margin-bottom:18px">อัตราเข้าฝึก = มา ÷ (มา + ขาด) · คำนวณจากรายการที่บันทึกแล้วเท่านั้น · ชั่วโมงสะสมคิดเฉพาะสถานะ “มา”</div><section class="card page-card"><div class="toolbar">${searchField()}<span class="muted small">ปีการศึกษา ${year()?.label||'—'} · ${filteredEnrollments().length} รายชื่อ</span></div><div id="reports-table">${reportsTable()}</div></section>`;
  }
  function reportsTable(){const rows=reportRows();return rows.length?`<div class="table-wrap"><table class="table"><thead><tr><th>รหัส / ชื่อ–นามสกุล</th><th>ชั้นปี / ห้อง</th><th>มา</th><th>ขาด</th><th>ยังไม่บันทึก</th><th>ชั่วโมงสะสม</th><th>อัตราเข้าฝึก</th></tr></thead><tbody>${rows.map(r=>`<tr><td class="name">${esc(C.fullName(r.e.student))}<small>${esc(r.e.student.student_code)}</small></td><td>ปี ${r.e.training_year}<small>${esc(r.e.room)||'—'}</small></td><td><span class="badge">${r.present}</span></td><td><span class="badge ${r.absent?'red':'gray'}">${r.absent}</span></td><td><span class="badge ${r.pending?'gold':'gray'}">${r.pending}</span></td><td class="num">${r.hours.toLocaleString('th-TH')}</td><td>${r.rate===null?'—':r.rate+'%'}</td></tr>`).join('')}</tbody></table></div>`:empty('ยังไม่มีข้อมูลรายงาน','เพิ่มทะเบียนและสร้างรอบฝึกก่อน');}
  function renderYears(){
    if(!isAdmin())return empty('ไม่มีสิทธิ์','เฉพาะผู้ดูแลระบบเท่านั้น');
    const preview=C.promotionPreview(enrollmentList()),pending=preview.filter(e=>e.result==='pending').length;
    return heading('ACADEMIC YEARS','ปีการศึกษาและเลื่อนชั้น','แยกทะเบียนแต่ละปี เก็บประวัติเดิม และจัดชั้นปีถัดไปตามผลการฝึก',btn('เพิ่มปีการศึกษา','new-year','','plus'))+
      `<div class="two-col"><section class="card"><div class="card-head"><div><h2>ปีการศึกษา ${year()?.label||'—'}</h2><p>เริ่ม ${date(year()?.starts_on)}</p></div><span class="badge ${year()?.closed?'gray':''}">${year()?.closed?'ปิดปีแล้ว':'เปิดใช้งาน'}</span></div><div class="guide"><p>ผ่านชั้นปี 1 → ชั้นปี 2</p><p>ผ่านชั้นปี 2 → ชั้นปี 3</p><p>ผ่านชั้นปี 3 → สำเร็จการฝึก</p><p>ไม่ผ่าน → อยู่ชั้นปีเดิมในปีการศึกษาถัดไป</p></div><div class="callout" style="margin-top:18px;margin-bottom:18px">${pending?'ยังไม่ระบุผล '+pending+' คน กรุณาไปกำหนดผลในทะเบียนก่อน':'กำหนดผลครบแล้ว ตรวจสอบรายชื่อด้านล่างก่อนดำเนินการ'}<br>ระบบเลื่อนชั้นจะสร้างปีใหม่และปิดปีเดิมพร้อมกัน หลังดำเนินการจะไม่แก้ข้อมูลปีเดิมผ่านหน้าเว็บ</div><button type="button" class="btn primary" data-action="promote" ${pending||!preview.length||!canManage()?'disabled':''}>${icon('years')}ตรวจสอบและเลื่อนชั้นทั้งปี</button></section>
      <section class="card"><h2>ปีการศึกษาทั้งหมด</h2><div class="guide" style="margin-top:15px">${[...state.data.years].sort((a,b)=>b.label-a.label).map(y=>`<div style="display:flex;justify-content:space-between;align-items:center;padding:12px 0;border-bottom:1px solid var(--line)"><span>ปีการศึกษา ${y.label} ${y.closed?'<span class="badge gray">ปิดแล้ว</span>':''}</span><button class="btn sm" data-action="select-year" data-id="${y.id}">${y.id===state.yearId?'กำลังดู':'เปิดดู'}</button></div>`).join('')||'ยังไม่มีปีการศึกษา'}</div></section></div>
      <section class="card page-card" style="margin-top:22px"><div class="card-head"><div><h2>ผลการฝึกและชั้นปีถัดไป</h2><p>${preview.length} รายชื่อ · ผลการฝึกกำหนดโดยครูผู้รับผิดชอบ</p></div>${btn('กำหนดผลการฝึก','goto-students','ghost sm','arrow')}</div>${preview.length?`<div class="table-wrap"><table class="table"><thead><tr><th>ชื่อ–นามสกุล</th><th>ชั้นปีปัจจุบัน</th><th>ผลการฝึก</th><th>การจัดชั้นปีถัดไป</th></tr></thead><tbody>${preview.map(e=>`<tr><td>${esc(C.fullName(e.student))}</td><td>ชั้นปี ${e.training_year}</td><td>${results[e.result]}</td><td>${esc(e.outcome)}${e.next_year?' · ชั้นปี '+e.next_year:''}</td></tr>`).join('')}</tbody></table></div>`:empty('ยังไม่มีทะเบียน','เพิ่มทะเบียนในปีนี้ก่อน')}</section>`;
  }
  function renderUsers(){
    if(!isAdmin())return empty('ไม่มีสิทธิ์','เฉพาะผู้ดูแลระบบเท่านั้น');
    return heading('ACCESS MANAGEMENT','ผู้ใช้และสิทธิ์','ผู้ดูแลจัดการข้อมูล · ครูเช็กชื่อ · ผู้ดูรายงานอ่านและดาวน์โหลด',btn('เพิ่มผู้ใช้','new-user','primary','plus'))+`<section class="card page-card"><div class="table-wrap"><table class="table"><thead><tr><th>ชื่อผู้ใช้</th><th>อีเมล</th><th>สิทธิ์</th><th>สถานะ</th><th></th></tr></thead><tbody>${state.data.profiles.map(p=>`<tr><td class="name">${esc(p.display_name)}</td><td>${esc(p.email)}</td><td>${roles[p.role]}</td><td><span class="badge ${p.enabled?'':'gray'}">${p.enabled?'ใช้งาน':'ปิดสิทธิ์'}</span></td><td><button class="btn ghost sm" data-action="edit-user" data-id="${p.id}">${icon('edit')}แก้ไขสิทธิ์</button></td></tr>`).join('')}</tbody></table></div></section>${API.demo?'<div class="callout" style="margin-top:20px">โหมดทดลองแสดงการจัดการสิทธิ์ด้วยข้อมูลตัวอย่าง บัญชีจริงจะสร้างหลังเชื่อมต่อ Supabase และติดตั้งส่วนจัดการผู้ใช้</div>':''}`;
  }
  function renderAudit(){
    if(!isAdmin())return empty('ไม่มีสิทธิ์','เฉพาะผู้ดูแลระบบเท่านั้น');
    const tables={students:'ทะเบียนนักศึกษา',enrollments:'ทะเบียนรายปี',attendance:'การเช็กชื่อ',training_sessions:'รอบฝึก',academic_years:'ปีการศึกษา',profiles:'ผู้ใช้'};
    const actions={INSERT:'เพิ่ม',UPDATE:'แก้ไข',DELETE:'ลบ',IMPORT:'นำเข้า',SAVE:'บันทึก',PROMOTE:'เลื่อนชั้น'};
    return heading('AUDIT LOG','ประวัติการใช้งาน','บันทึกการเปลี่ยนแปลงพร้อมผู้ดำเนินการและเวลาจากระบบ',btn('โหลดใหม่','refresh','','refresh'))+`<section class="card page-card"><div class="card-head"><div><h2>รายการล่าสุด</h2><p>แสดงสูงสุด 150 รายการ · ประวัติทั้งหมดรวมอยู่ในไฟล์สำรองข้อมูล</p></div></div>${state.data.audit.length?`<div class="table-wrap"><table class="table"><thead><tr><th>วันและเวลา</th><th>ผู้ดำเนินการ</th><th>การทำรายการ</th><th>ข้อมูล</th><th></th></tr></thead><tbody>${state.data.audit.slice(0,150).map(a=>`<tr><td>${date(a.created_at,{hour:'2-digit',minute:'2-digit',second:'2-digit'})}</td><td>${esc(state.data.profiles.find(p=>p.id===a.actor_id)?.display_name||'ระบบ / ผู้ติดตั้ง')}</td><td>${actions[a.action]||esc(a.action)}</td><td>${tables[a.table_name]||esc(a.table_name)}</td><td><button class="btn ghost sm" data-action="audit-detail" data-id="${a.id}">ดูรายละเอียด</button></td></tr>`).join('')}</tbody></table></div>`:empty('ยังไม่มีประวัติ','การเพิ่มข้อมูลและแก้ไขรายการจะปรากฏที่นี่')}</section>`;
  }
  function renderSettings(){
    return heading('SETTINGS','การตั้งค่าและสำรองข้อมูล','ตรวจสอบสถานะระบบและเก็บสำเนาข้อมูลสำหรับผู้ดูแล')+`<div class="two-col"><section class="card"><div class="card-head"><div><h2>สถานะระบบ</h2><p>${esc(window.CADET_CONFIG.schoolName||'ระบบเช็กชื่อ นศท.')}</p></div><span class="badge ${API.demo?'gold':''}">${API.demo?'ทดลองใช้งาน':'เชื่อมต่อแล้ว'}</span></div><div class="guide"><p>เขตเวลา: ประเทศไทย (Asia/Bangkok)</p><p>สถานะเช็กชื่อ: มา / ขาด</p><p>ยังไม่เช็ก: ยังไม่บันทึก</p><p>ผู้ใช้ปัจจุบัน: ${esc(state.user.display_name)}</p></div>${API.demo?`<div class="callout" style="margin-top:18px">ข้อมูลตัวอย่างเก็บเฉพาะเบราว์เซอร์นี้ เมื่อต่อฐานข้อมูลจริงจะเริ่มจากทะเบียนว่าง</div>${btn('เริ่มข้อมูลทดลองใหม่','reset-demo','danger','refresh')}`:''}</section><section class="card"><h2>สำรองข้อมูล</h2><p class="guide" style="margin-top:15px">${isAdmin()?'ดาวน์โหลดข้อมูลทุกปี พร้อมทะเบียน รอบฝึก รายการเช็กชื่อ สิทธิ์ และประวัติการแก้ไข เป็นไฟล์ JSON':'การสำรองข้อมูลทั้งหมดเปิดให้ผู้ดูแลระบบเท่านั้น'}</p>${isAdmin()?`<div style="margin-top:20px">${btn('ดาวน์โหลดสำเนาข้อมูลทั้งหมด','backup','primary','download')}</div><div class="note" style="margin-top:20px">ไฟล์นี้เป็นสำเนาข้อมูลแอป ไม่รวมรหัสผ่านบัญชีผู้ใช้ การสำรองฐานข้อมูลอัตโนมัติให้เปิดใช้ตามคู่มือติดตั้งที่แนบมากับระบบ</div>`:''}</section></div>`;
  }
  function renderLogin(){
    $('#app').innerHTML=`<div class="login"><section class="card login-box"><div class="login-brand"><img src="icon.svg" alt="ตรา นศท."><div><div class="eyebrow">CADET ATTENDANCE</div><h2>นศท. Connect</h2></div></div><h1>เข้าสู่ระบบ</h1><p class="guide" style="margin-top:8px">${esc(window.CADET_CONFIG.schoolName||'ระบบเช็กชื่อ นศท.')}</p><form id="login-form"><label class="field">อีเมล<input name="email" type="email" required autocomplete="username"></label><label class="field">รหัสผ่าน<input name="password" type="password" required autocomplete="current-password"></label><div id="login-error" class="error"></div><button class="btn primary" type="submit">เข้าสู่ระบบ ${icon('arrow')}</button></form><div class="note" style="margin-top:23px">ใช้บัญชีที่ผู้ดูแลระบบสร้างให้</div></section></div>`;
  }
  async function reload(){
    let data=await API.load(state.yearId);
    if(!data.years.some(y=>y.id===state.yearId)){
      state.yearId=[...data.years].sort((a,b)=>b.label-a.label)[0]?.id||'';
      if(state.yearId)data=await API.load(state.yearId);
    }
    state.data=data;localStorage.setItem('cadet-year',state.yearId);state.draft={};render();
  }
  function openModal(title,body,form,submit='บันทึก'){
    $('#modal-body').innerHTML=`<div class="modal-title"><h2>${title}</h2><button class="icon-btn" data-action="close-modal" aria-label="ปิด">${icon('close')}</button></div>${form?`<form data-form="${form}">${body}<div id="form-error" class="error"></div><div class="modal-actions">${btn('ยกเลิก','close-modal')}<button class="btn primary" type="submit">${submit}</button></div></form>`:body}`;
    $('#modal').showModal();
  }
  const field=(label,name,type='text',value='',extra='')=>`<label class="field">${label}<input name="${name}" type="${type}" value="${esc(value)}" ${extra}></label>`;
  const levelSelect=(value=state.level||1)=>`<label class="field">ชั้นปี<select name="training_year">${[1,2,3].map(n=>`<option value="${n}" ${n===value?'selected':''}>ชั้นปีที่ ${n}</option>`).join('')}</select></label>`;
  function newSession(){if(!state.yearId)throw new Error('กรุณาสร้างปีการศึกษาก่อน');openModal('สร้างรอบฝึก',`<div class="form-grid">${levelSelect()}${field('วันที่ฝึก','training_date','date',C.bangkokDate(),'required')}${field('ช่วงเวลา / รอบ','slot','text','08:00–12:00','required maxlength="100"')}${field('จำนวนชั่วโมง','duration_hours','number','4','required min="0.25" max="24" step="0.25"')}<div class="full">${field('หัวข้อการฝึก','title','text','','required maxlength="200"')}</div></div>`,'session','สร้างรอบฝึก');}
  function newStudent(){if(!state.yearId)throw new Error('กรุณาสร้างปีการศึกษาก่อน');openModal('เพิ่มนักศึกษา',`<div class="form-grid">${field('รหัสนักเรียน','student_code','text','','required maxlength="30" pattern="[A-Za-z0-9_-]+"')}${field('คำนำหน้า','prefix','text','นาย','maxlength="100"')}${field('ชื่อ','first_name','text','','required maxlength="100"')}${field('นามสกุล','last_name','text','','required maxlength="100"')}${field('ห้องเรียน','room','text','','maxlength="100"')}${levelSelect()}<div class="full">${field('เริ่มนับรอบฝึกตั้งแต่','joined_on','date',year()?.starts_on||C.bangkokDate(),'required')}</div></div>`,'student');}
  function studentDetail(eId){
    const e=enrollmentList().find(e=>e.id===eId),r=C.studentReport(e,state.data.sessions,state.data.attendance);
    const ss=state.data.sessions.filter(s=>s.training_year===e.training_year&&s.training_date>=e.joined_on).sort((a,b)=>b.training_date.localeCompare(a.training_date));
    const history=`<div class="note">มา ${r.present} · ขาด ${r.absent} · ยังไม่บันทึก ${r.pending} · ชั่วโมงสะสม ${r.hours}</div><div class="table-wrap" style="max-height:220px;overflow:auto;margin-top:16px"><table class="table"><thead><tr><th>รอบฝึก</th><th>สถานะ</th></tr></thead><tbody>${ss.map(s=>`<tr><td>${date(s.training_date)}<small>${esc(s.title)}</small></td><td>${statusBadge(state.data.attendance.find(a=>a.session_id===s.id&&a.enrollment_id===e.id)?.status||'pending')}</td></tr>`).join('')}</tbody></table></div>`;
    openModal(esc(C.fullName(e.student)),`<p class="modal-subtitle">รหัส ${esc(e.student.student_code)} · ชั้นปี ${e.training_year}</p>${history}${canManage()?`<div class="form-grid" style="margin-top:22px"><input type="hidden" name="id" value="${e.id}">${field('ห้องเรียน','room','text',e.room,'maxlength="100"')}<label class="field">ผลการฝึก<select name="result">${Object.entries(results).map(([key,value])=>`<option value="${key}" ${key===e.result?'selected':''}>${value}</option>`).join('')}</select></label></div>`:''}`,canManage()?'enrollment':null);
  }
  function userModal(p){
    openModal(p?'แก้ไขผู้ใช้':'เพิ่มผู้ใช้',`<div class="form-grid"><input type="hidden" name="id" value="${p?.id||''}"><div class="full">${field('ชื่อที่แสดง','display_name','text',p?.display_name||'','required maxlength="100"')}</div>${p?`<p class="modal-subtitle full">${esc(p.email)}</p>`:`<div class="full">${field('อีเมล','email','email','','required')}</div><div class="full">${field('รหัสผ่านเริ่มต้น (อย่างน้อย 12 ตัวอักษร)','password','password','','required minlength="12" autocomplete="new-password"')}</div>`}<label class="field">สิทธิ์<select name="role">${Object.entries(roles).map(([k,v])=>`<option value="${k}" ${(p?.role||'teacher')===k?'selected':''}>${v}</option>`).join('')}</select></label><label class="field">สถานะ<select name="enabled"><option value="true" ${p?.enabled!==false?'selected':''}>เปิดใช้งาน</option><option value="false" ${p?.enabled===false?'selected':''}>ปิดสิทธิ์</option></select></label></div>`,'user',p?'บันทึกสิทธิ์':'สร้างผู้ใช้');
  }
  function download(name,contents,type){const url=URL.createObjectURL(new Blob([contents],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);}
  function workbook(sheets,name){if(!window.XLSX)throw new Error('ไม่พบส่วนอ่าน Excel กรุณาโหลดหน้าเว็บใหม่');const wb=XLSX.utils.book_new();for(const [sheet,rows] of sheets){const ws=XLSX.utils.aoa_to_sheet(rows);ws['!cols']=(rows[0]||[]).map((_,i)=>({wch:i===1?30:18}));XLSX.utils.book_append_sheet(wb,ws,sheet);}XLSX.writeFile(wb,name);}
  function template(){workbook([['ทะเบียน',[C.HEADERS]],['คำอธิบาย',[['คอลัมน์','คำอธิบาย'],['รหัสนักเรียน','ไม่ซ้ำ เก็บเป็นข้อความเพื่อคงเลขศูนย์ด้านหน้า'],['คำนำหน้า','เช่น นาย / นางสาว'],['ชื่อ','ชื่อจริง'],['นามสกุล','นามสกุล'],['ห้อง','เช่น ม.4/1 (เว้นว่างได้)'],['ชั้นปี','ใช้เลข 1, 2 หรือ 3']]]],'Cadet_Import_Template.xlsx');}
  function exportReport(){
    const rr=reportRows(),ss=[...sessions()].sort((a,b)=>a.training_date.localeCompare(b.training_date)||a.slot.localeCompare(b.slot));
    const summary=[['ปีการศึกษา','รหัสนักเรียน','ชื่อ–นามสกุล','ชั้นปี','ห้อง','มา','ขาด','ยังไม่บันทึก','ชั่วโมงมาเข้าฝึก','อัตราเข้าฝึก (%)','ผลการฝึก'],...rr.map(r=>[year()?.label,r.e.student.student_code,C.fullName(r.e.student),r.e.training_year,r.e.room,r.present,r.absent,r.pending,r.hours,r.rate===null?'ยังไม่มีรายการที่บันทึก':r.rate,results[r.e.result]])];
    const detail=[['ปีการศึกษา','รหัสนักเรียน','ชื่อ–นามสกุล','ชั้นปี','วันที่ฝึก','ช่วงเวลา','หัวข้อ','ชั่วโมง','สถานะ','ผู้บันทึก','เวลาบันทึก (ประเทศไทย)']];
    for(const r of rr) for(const s of ss.filter(s=>s.training_year===r.e.training_year&&s.training_date>=r.e.joined_on)){const a=state.data.attendance.find(a=>a.session_id===s.id&&a.enrollment_id===r.e.id);detail.push([year()?.label,r.e.student.student_code,C.fullName(r.e.student),r.e.training_year,s.training_date,s.slot,s.title,Number(s.duration_hours),C.STATUSES[a?.status||'pending'],state.data.profiles.find(p=>p.id===a?.recorded_by)?.display_name||a?.recorded_by||'',a?date(a.recorded_at,{hour:'2-digit',minute:'2-digit',second:'2-digit'}):'']);}
    workbook([['สรุปรายบุคคล',summary],['รายรอบฝึก',detail],['วิธีอ่านรายงาน',[['หัวข้อ','คำอธิบาย'],['ตัวกรอง',`ปี ${year()?.label||'—'} / ${state.level?'ชั้นปี '+state.level:'ทุกชั้นปี'} / คำค้น ${state.search||'ทั้งหมด'}`],['อัตราเข้าฝึก','มา ÷ (มา + ขาด) × 100 ใช้เฉพาะรายการที่บันทึกแล้ว'],['ยังไม่บันทึก','ไม่นับเป็นขาด และไม่รวมในตัวหารอัตราเข้าฝึก'],['ชั่วโมงสะสม','รวมเฉพาะรอบที่มีสถานะ มา'],['วันที่ส่งออก',date(new Date().toISOString(),{hour:'2-digit',minute:'2-digit'})]]]],`Cadet_Report_${year()?.label||'all'}_${C.bangkokDate()}.xlsx`);
    toast('ดาวน์โหลดรายงานแล้ว');
  }
  async function parseImport(file){
    if(!file)return;if(file.size>5*1024*1024)throw new Error('ไฟล์ต้องไม่เกิน 5 MB');
    if(!/\.(xlsx|csv)$/i.test(file.name))throw new Error('รองรับ .xlsx หรือ .csv เท่านั้น');
    const wb=XLSX.read(await file.arrayBuffer(),{type:'array',cellText:true});const ws=wb.Sheets['ทะเบียน']||wb.Sheets[wb.SheetNames[0]];
    const header=XLSX.utils.sheet_to_json(ws,{header:1,raw:false,blankrows:false})[0]||[];
    if(C.HEADERS.some(h=>!header.includes(h))||new Set(header).size!==header.length)throw new Error('หัวคอลัมน์ไม่ตรงแบบฟอร์ม หรือมีหัวคอลัมน์ซ้ำ');
    const rows=XLSX.utils.sheet_to_json(ws,{raw:false,defval:''});if(!rows.length||rows.length>2000)throw new Error('ไฟล์ต้องมี 1–2,000 รายชื่อ');
    state.importRows=C.validateImport(rows,enrollmentList().map(e=>e.student));render();
  }
  async function navigate(page){if(!mayLeave())return;state.page=page;state.search='';state.draft={};state.mobile=false;if(page==='attendance'&&!state.level)state.level=1;render();window.scrollTo(0,0);}
  async function changeYear(y){if(!mayLeave()){render();return;}state.yearId=y;state.sessionId='';state.search='';state.importRows=[];state.importDate='';await reload();}
  async function act(action,el){
    if(action.startsWith('goto-'))return navigate(action.slice(5));
    switch(action){
      case 'navigate':return navigate(el.dataset.page);
      case 'menu':if(innerWidth<=700)state.mobile=!state.mobile;else{state.collapsed=!state.collapsed;localStorage.setItem('cadet-sidebar',state.collapsed?'collapsed':'expanded');}render();break;
      case 'level':if(!mayLeave())return;state.level=Number(el.dataset.value);state.draft={};state.search='';render();break;
      case 'close-modal':$('#modal').close();break;
      case 'refresh':if(mayLeave()){await reload();toast('โหลดข้อมูลล่าสุดแล้ว');}break;
      case 'new-session':if(mayLeave())newSession();break;
      case 'new-student':newStudent();break;
      case 'status':{const original=state.data.attendance.find(a=>a.session_id===state.sessionId&&a.enrollment_id===el.dataset.id)?.status||'pending';if(el.dataset.status===original)delete state.draft[el.dataset.id];else state.draft[el.dataset.id]=el.dataset.status;refreshAttendance();break;}
      case 'mark-present':{const visible=roster().filter(e=>!state.search||[C.fullName(e.student),e.student.student_code,e.room].join(' ').toLowerCase().includes(state.search.toLowerCase()));if(!confirm(`ระบุ “มา” ให้ทั้ง ${visible.length} รายชื่อที่แสดงหรือไม่?`))return;for(const e of visible){const original=state.data.attendance.find(a=>a.session_id===state.sessionId&&a.enrollment_id===e.id)?.status||'pending';if(original==='present')delete state.draft[e.id];else state.draft[e.id]='present';}refreshAttendance();break;}
      case 'save-attendance':{const s=selectedSession();const records=Object.entries(state.draft).map(([enrollment_id,status])=>({enrollment_id,status}));if(!records.length)return;await API.saveAttendance(s.id,s.revision,records);await reload();toast('บันทึกการเช็กชื่อ '+records.length+' รายการแล้ว');break;}
      case 'open-session':if(!mayLeave())return;state.sessionId=el.dataset.id;state.level=state.data.sessions.find(s=>s.id===state.sessionId).training_year;state.draft={};state.page='attendance';state.search='';render();break;
      case 'student-detail':studentDetail(el.dataset.id);break;
      case 'template':template();break;
      case 'confirm-import':{if(!state.importRows.length||state.importRows.some(r=>r.errors.length))return;const d=$('#import-date').value;if(!d)throw new Error('กรุณาระบุวันเริ่มนับรอบฝึก');const count=await API.importStudents(state.yearId,state.importRows.map(r=>r.value),d);state.importRows=[];await reload();toast('นำเข้าสำเร็จ '+count+' รายชื่อ');break;}
      case 'export-report':exportReport();break;
      case 'print':window.print();break;
      case 'new-year':openModal('เพิ่มปีการศึกษา',`<div class="form-grid">${field('ปีการศึกษา (พ.ศ.)','label','number',String((year()?.label||new Date().getFullYear()+543)+1),'required min="2500" max="2800"')}${field('วันเริ่มนับการฝึก','starts_on','date',C.bangkokDate(),'required')}</div><p class="modal-subtitle" style="margin-top:18px">การเพิ่มปีนี้เริ่มจากทะเบียนว่าง หากต้องการย้ายรายชื่อเดิม ให้ใช้เมนูเลื่อนชั้นทั้งปี</p>`,'year','สร้างปีการศึกษา');break;
      case 'select-year':await changeYear(el.dataset.id);break;
      case 'promote':{const list=C.promotionPreview(state.data.enrollments),next=year().label+1;const passed=list.filter(e=>e.outcome==='เลื่อนชั้น').length,repeat=list.filter(e=>e.outcome==='เรียนซ้ำชั้นปี').length,finished=list.filter(e=>e.outcome==='สำเร็จการฝึก').length;openModal('ยืนยันเลื่อนชั้นทั้งปี',`<div class="callout">ปี ${year().label} → ${next}<br>เลื่อนชั้น ${passed} คน · เรียนซ้ำ ${repeat} คน · สำเร็จการฝึก ${finished} คน<br>ระบบจะปิดการแก้ไขปีเดิม และสร้างทะเบียนปีใหม่ ห้องเรียนจะเว้นว่างเพื่อให้กำหนดใหม่</div>${field('วันเริ่มปีการศึกษาใหม่','starts_on','date',`${next-543}-05-16`,'required')}<label class="field" style="margin-top:18px">พิมพ์ปีปลายทาง ${next} เพื่อยืนยัน<input name="confirm_year" required pattern="${next}" inputmode="numeric"></label>`,'promote','ยืนยันเลื่อนชั้น');break;}
      case 'new-user':userModal();break;
      case 'edit-user':userModal(state.data.profiles.find(p=>p.id===el.dataset.id));break;
      case 'audit-detail':{const a=state.data.audit.find(a=>String(a.id)===el.dataset.id);openModal('รายละเอียดประวัติ',`<p class="modal-subtitle">${date(a.created_at,{hour:'2-digit',minute:'2-digit'})} · ${esc(a.table_name)}</p><pre style="white-space:pre-wrap;overflow-wrap:anywhere;font-size:11px;line-height:1.8;max-height:55vh;overflow:auto">${esc(JSON.stringify(a,null,2))}</pre>`,null);break;}
      case 'backup':download(`Cadet_Backup_${C.bangkokDate()}.json`,JSON.stringify(await API.backup(),null,2),'application/json');toast('ดาวน์โหลดสำเนาข้อมูลแล้ว');break;
      case 'reset-demo':if(confirm('เริ่มข้อมูลตัวอย่างใหม่ในเบราว์เซอร์นี้หรือไม่?'))API.resetDemo();break;
      case 'logout':if(!mayLeave())return;if(API.demo){toast('โหมดทดลองไม่ใช้บัญชีจริง');return;}await API.logout();state.user=null;render();break;
    }
  }
  function refreshAttendance(){const table=$('#attendance-table');if(table)table.innerHTML=attendanceTable();const dc=$('#draft-count');if(dc)dc.innerHTML=draftSummary();const save=$('[data-action="save-attendance"]');if(save)save.disabled=!changed();}
  async function submitModal(form){
    const v=Object.fromEntries(new FormData(form)),kind=form.dataset.form;
    switch(kind){
      case 'session':state.sessionId=await API.createSession({year_id:state.yearId,training_year:Number(v.training_year),training_date:v.training_date,slot:v.slot,title:v.title,duration_hours:Number(v.duration_hours)});state.level=Number(v.training_year);state.page='attendance';state.draft={};break;
      case 'student':{const values=C.validateImport([{...Object.fromEntries(C.HEADERS.map((h,i)=>[h,[v.student_code,v.prefix,v.first_name,v.last_name,v.room,v.training_year][i]]))}],enrollmentList().map(e=>e.student));if(values[0].errors.length)throw new Error(values[0].errors.join(' · '));await API.importStudents(state.yearId,[values[0].value],v.joined_on);break;}
      case 'enrollment':await API.updateEnrollment(v.id,v.room,v.result);break;
      case 'year':state.yearId=await API.createYear(Number(v.label),v.starts_on);state.sessionId='';break;
      case 'promote':{const target=year().label+1;if(Number(v.confirm_year)!==target)throw new Error('ปีที่พิมพ์ยืนยันไม่ถูกต้อง');const result=await API.promote(state.yearId,target,v.starts_on);state.yearId=result.year_id;state.sessionId='';break;}
      case 'user':await API.member({...v,id:v.id||undefined,enabled:v.enabled==='true'});break;
    }
    $('#modal').close();await reload();toast(kind==='promote'?'เลื่อนชั้นและสร้างปีการศึกษาใหม่แล้ว':'บันทึกข้อมูลแล้ว');
  }
  document.addEventListener('click',async ev=>{
    const el=ev.target.closest('[data-action]');if(!el||el.disabled||state.busy)return;
    const action=el.dataset.action;const asyncAction=['save-attendance','confirm-import','refresh','backup','logout','select-year'].includes(action);
    try{if(asyncAction){state.busy=true;el.classList.add('busy');el.disabled=true;}await act(action,el);}
    catch(error){toast(error.message||'ทำรายการไม่สำเร็จ');}
    finally{state.busy=false;el.classList.remove('busy');if(document.contains(el))el.disabled=action==='save-attendance'?!changed():false;}
  });
  document.addEventListener('submit',async ev=>{
    if(ev.target.id==='login-form'){
      ev.preventDefault();const f=ev.target,b=$('button[type=submit]',f);b.disabled=true;
      try{const v=Object.fromEntries(new FormData(f));state.user=await API.login(v.email,v.password);await reload();}
      catch(err){$('#login-error').textContent=err.message;}finally{b.disabled=false;}return;
    }
    if(!ev.target.dataset.form)return;ev.preventDefault();if(state.busy)return;state.busy=true;
    const f=ev.target,b=$('button[type=submit]',f);b.disabled=true;$('#form-error').textContent='';
    try{await submitModal(f);}catch(err){$('#form-error').textContent=err.message||'บันทึกไม่สำเร็จ';}finally{b.disabled=false;state.busy=false;}
  });
  document.addEventListener('input',ev=>{
    if(ev.target.id!=='search')return;state.search=ev.target.value;
    if(state.page==='attendance')refreshAttendance();
    if(state.page==='students')$('#students-table').innerHTML=studentsTable();
    if(state.page==='reports')$('#reports-table').innerHTML=reportsTable();
  });
  document.addEventListener('change',async ev=>{
    try{
      if(ev.target.id==='year-select')await changeYear(ev.target.value);
      if(ev.target.id==='session-select'){if(!mayLeave()){ev.target.value=state.sessionId;return;}state.sessionId=ev.target.value;state.draft={};render();}
      if(ev.target.id==='import-date')state.importDate=ev.target.value;
      if(ev.target.id==='import-file'){const file=ev.target.files[0];state.importRows=[];try{await parseImport(file);}catch(err){render();throw err;}}
    }catch(err){const e=$('#import-error');if(e)e.textContent=err.message;else toast(err.message);}
  });
  addEventListener('beforeunload',ev=>{if(changed()){ev.preventDefault();ev.returnValue='';}});
  async function init(){try{state.user=await API.session();if(state.user?.enabled)await reload();else render();}catch(err){$('#app').innerHTML=`<div class="login"><section class="card login-box"><h2>เชื่อมต่อระบบไม่ได้</h2><div class="error">${esc(err.message)}</div><p class="guide" style="margin-top:16px">ตรวจสอบการเชื่อมต่อและการตั้งค่า Supabase แล้วลองโหลดหน้าใหม่</p>${btn('ลองอีกครั้ง','refresh','','refresh')}</section></div>`;}}
  init();
})();
