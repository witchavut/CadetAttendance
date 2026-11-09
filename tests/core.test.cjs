const test=require('node:test');
const assert=require('node:assert/strict');
const C=require('../web/core.js');
const enrollments=[{id:'e1',training_year:1,joined_on:'2026-05-01'},{id:'e2',training_year:2,joined_on:'2026-05-01'}];
const sessions=[{id:'s1',training_year:1,training_date:'2026-05-02',duration_hours:2},{id:'s2',training_year:1,training_date:'2026-05-03',duration_hours:4},{id:'s3',training_year:2,training_date:'2026-05-02',duration_hours:3}];
test('unrecorded students remain pending, never absent',()=>{
 assert.deepEqual(C.summarize(enrollments,sessions,[]),{present:0,absent:0,pending:3,expected:3,rate:null});
});
test('rate excludes pending; hours only count present sessions',()=>{
 const a=[{session_id:'s1',enrollment_id:'e1',status:'present'}];
 assert.deepEqual(C.studentReport(enrollments[0],sessions,a),{present:1,absent:0,pending:1,hours:2,rate:100});
 assert.equal(C.summarize(enrollments,sessions,a).pending,2);
});
test('records from other years do not enter the summary',()=>{
 const a=[{session_id:'previous-year',enrollment_id:'e1',status:'absent'},{session_id:'s1',enrollment_id:'other-year',status:'absent'}];
 assert.equal(C.summarize(enrollments,sessions,a).absent,0);
});
test('student joining later has no pending earlier sessions',()=>{
 assert.equal(C.studentReport({...enrollments[0],joined_on:'2026-05-03'},sessions,[]).pending,1);
});
test('import preserves leading zeroes, rejects duplicates and invalid training years',()=>{
 const r={'รหัสนักเรียน':'00123','คำนำหน้า':'นาย','ชื่อ':'ทดสอบ','นามสกุล':'ระบบ','ห้อง':'ม.4/1','ชั้นปี':'1'};
 const checked=C.validateImport([r,r,{...r,'รหัสนักเรียน':'B12','ชั้นปี':'4'}]);
 assert.equal(checked[0].value.student_code,'00123');assert.equal(checked[0].errors.length,0);
 assert.match(checked[1].errors.join(),/ซ้ำ/);assert.match(checked[2].errors.join(),/ชั้นปี/);
 assert.match(C.validateImport([r],[{student_code:'00123'}])[0].errors.join(),/มีทะเบียน/);
});
test('promotion follows training result, graduates only passed year three',()=>{
 const p=C.promotionPreview([{training_year:1,result:'passed'},{training_year:2,result:'failed'},{training_year:3,result:'passed'},{training_year:3,result:'failed'},{training_year:1,result:'pending'}]);
 assert.deepEqual(p.map(e=>e.next_year),[2,2,null,3,null]);assert.equal(p[2].outcome,'สำเร็จการฝึก');assert.equal(p[4].outcome,'ยังไม่ระบุผล');
});
test('Thailand date rolls at 17:00 UTC',()=>{
 assert.equal(C.bangkokDate(new Date('2026-11-09T16:59:59Z')),'2026-11-09');
 assert.equal(C.bangkokDate(new Date('2026-11-09T17:00:00Z')),'2026-11-10');
});
test('untrusted names are escaped and CSV formulas are inert',()=>{
 assert.equal(C.escapeHTML('<img src=x onerror="evil()">'),'&lt;img src=x onerror=&quot;evil()&quot;&gt;');
 assert.equal(C.csvCell('=SUM(A1)'), '"\'=SUM(A1)"');
});
