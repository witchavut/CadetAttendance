(function (root) {
  'use strict';
  const STATUSES = { present: 'มา', absent: 'ขาด', pending: 'ยังไม่บันทึก' };
  const text = v => String(v ?? '').trim();
  const fullName = s => [s.prefix, s.first_name, s.last_name].filter(Boolean).join(' ');
  function bangkokDate(now = new Date()) {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  }
  function summarize(enrollments, sessions, records) {
    const studentIds = new Set(enrollments.map(e => e.id));
    const sessionMap = new Map(sessions.map(s => [s.id, s]));
    const expected = enrollments.reduce((n, e) => n + sessions.filter(s => s.training_year === e.training_year && (!e.joined_on || s.training_date >= e.joined_on)).length, 0);
    let present = 0, absent = 0;
    for (const a of records) {
      if (!studentIds.has(a.enrollment_id) || !sessionMap.has(a.session_id)) continue;
      if (a.status === 'present') present++;
      else if (a.status === 'absent') absent++;
    }
    return { present, absent, pending: Math.max(0, expected - present - absent), expected, rate: present + absent ? Math.round(100 * present / (present + absent)) : null };
  }
  function studentReport(e, sessions, records) {
    const eligible = sessions.filter(s => s.training_year === e.training_year && (!e.joined_on || s.training_date >= e.joined_on));
    const bySession = new Map(records.filter(a => a.enrollment_id === e.id).map(a => [a.session_id, a]));
    let present = 0, absent = 0, hours = 0;
    for (const s of eligible) {
      const a = bySession.get(s.id);
      if (a?.status === 'present') { present++; hours += s.duration_minutes != null ? Number(s.duration_minutes)/60 : Number(s.duration_hours); }
      if (a?.status === 'absent') absent++;
    }
    return { present, absent, pending: eligible.length - present - absent, hours: Math.round(hours*100)/100, rate: present + absent ? Math.round(present * 100 / (present + absent)) : null };
  }
  const HEADERS = ['รหัสนักเรียน', 'คำนำหน้า', 'ชื่อ', 'นามสกุล', 'ห้อง', 'ชั้นปี'];
  function validateImport(rows, existing = []) {
    const seen = new Set(), existingSet = new Set(existing.map(e => e.student_code));
    return rows.map((r, i) => {
      const value = { student_code: text(r[HEADERS[0]]), prefix: text(r[HEADERS[1]]), first_name: text(r[HEADERS[2]]), last_name: text(r[HEADERS[3]]), room: text(r[HEADERS[4]]), training_year: Number(r[HEADERS[5]]) };
      const errors = [];
      if (!/^[A-Za-z0-9_-]{1,30}$/.test(value.student_code)) errors.push('รหัสนักเรียนไม่ถูกต้อง (ใช้ตัวเลข/อังกฤษ - _)');
      if (!value.first_name || !value.last_name) errors.push('ชื่อและนามสกุลต้องครบ');
      if (![1, 2, 3].includes(value.training_year)) errors.push('ชั้นปีต้องเป็น 1, 2 หรือ 3');
      if (Object.values(value).some(v => typeof v === 'string' && v.length > 100)) errors.push('ข้อความยาวเกิน 100 ตัวอักษร');
      if (seen.has(value.student_code)) errors.push('รหัสซ้ำในไฟล์');
      if (existingSet.has(value.student_code)) errors.push('มีทะเบียนในปีการศึกษานี้แล้ว');
      seen.add(value.student_code);
      return { row: i + 2, value, errors };
    });
  }
  function promotionPreview(enrollments) {
    return enrollments.map(e => ({ ...e, next_year: e.result === 'passed' ? (e.training_year < 3 ? e.training_year + 1 : null) : (e.result === 'failed' ? e.training_year : null), outcome: e.result === 'passed' ? (e.training_year === 3 ? 'สำเร็จการฝึก' : 'เลื่อนชั้น') : (e.result === 'failed' ? 'เรียนซ้ำชั้นปี' : 'ยังไม่ระบุผล') }));
  }
  function escapeHTML(value) { return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function csvCell(v) { let s = String(v ?? ''); if (/^[=+@-]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; }
  function weeklyDates(first='2026-11-04',last='2027-03-17') {
    const start=new Date(first+'T00:00:00Z'),end=new Date(last+'T00:00:00Z');
    if(!/^\d{4}-\d{2}-\d{2}$/.test(first)||!/^\d{4}-\d{2}-\d{2}$/.test(last)||!Number.isFinite(+start)||!Number.isFinite(+end)||start.toISOString().slice(0,10)!==first||end.toISOString().slice(0,10)!==last||start.getUTCDay()!==3||end<start||(+end-start)%604800000!==0)throw new Error('กรุณาระบุวันพุธแรกและสุดท้ายให้ถูกต้อง');
    const count=(+end-start)/604800000+1;if(count>52)throw new Error('ตารางต้องไม่เกิน 52 สัปดาห์');
    return Array.from({length:count},(_,i)=>({week_number:i+1,training_date:new Date(+start+i*604800000).toISOString().slice(0,10)}));
  }
  function weeklyGroups(sessions,term=2) {
    const groups=new Map();
    for(const s of sessions.filter(s=>Number(s.term_number)===Number(term)&&s.week_number)){
      const key=Number(s.week_number);if(!groups.has(key))groups.set(key,{week_number:key,training_date:s.training_date,slot:s.slot,term_number:Number(term),sessions:[]});
      groups.get(key).sessions.push(s);
    }
    return [...groups.values()].sort((a,b)=>a.week_number-b.week_number);
  }
  const api = { STATUSES, HEADERS, fullName, bangkokDate, summarize, studentReport, validateImport, promotionPreview, escapeHTML, csvCell, weeklyDates, weeklyGroups };
  if (typeof module !== 'undefined') module.exports = api;
  root.CadetCore = api;
})(typeof window === 'undefined' ? globalThis : window);

