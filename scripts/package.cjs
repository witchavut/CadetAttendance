// Build a standalone demo and an empty Excel import template; no build dependencies.
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const b64=p=>fs.readFileSync(path.join(root,p)).toString('base64');
let css=read('web/styles.css');
for(const font of ['ibm-thai-regular.ttf','ibm-thai-semibold.ttf'])css=css.replaceAll('vendor/'+font,'data:font/ttf;base64,'+b64('web/vendor/'+font));
const image='data:image/svg+xml;base64,'+b64('web/icon.svg');
// Data URLs keep HTML strings inside libraries away from HTML preview rewriters.
const script=s=>'<script src="data:application/javascript;base64,'+Buffer.from(s,'utf8').toString('base64')+'"></script>';
const config="window.CADET_CONFIG={supabaseUrl:'',supabaseKey:'',schoolName:'โรงเรียนเมืองกาฬสินธุ์'};";
const scripts=[read('web/vendor/xlsx.full.min.js'),config,read('web/core.js'),read('web/api.js'),read('web/app.js').replaceAll('icon.svg',image)];
let html=read('web/index.html').replace(/\s*<script defer[^>]*><\/script>/g,'').replace('<link rel="stylesheet" href="styles.css">',()=>'<style>'+css+'</style>').replaceAll('icon.svg',image).replace('</body>',()=>scripts.map(script).join('\n')+'\n</body>');
const licenses=['IBM-Plex-LICENSE.txt','Supabase-LICENSE.txt','SheetJS-LICENSE.txt'].map(p=>read('web/vendor/'+p)).join('\n\n').replaceAll('-->','-- >');
html='<!-- Third-party license notices\n'+licenses+'\n-->\n'+html;
fs.writeFileSync(path.join(root,'Demo.html'),html);
const XLSX=require('../web/vendor/xlsx.full.min.js');
const C=require('../web/core.js');
const wb=XLSX.utils.book_new();
const blank=XLSX.utils.aoa_to_sheet([C.HEADERS]);
blank['!cols']=[{wch:18},{wch:14},{wch:24},{wch:26},{wch:15},{wch:10}];
XLSX.utils.book_append_sheet(wb,blank,'ทะเบียน');
XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['คอลัมน์','คำอธิบาย'],['รหัสนักเรียน','ต้องไม่ซ้ำ เก็บเป็นข้อความเพื่อคงเลขศูนย์ด้านหน้า'],['คำนำหน้า','นาย / นางสาว หรือเว้นว่าง'],['ชื่อ','จำเป็น'],['นามสกุล','จำเป็น'],['ห้อง','เช่น ม.4/1'],['ชั้นปี','ใช้เลข 1, 2 หรือ 3']]),'คำอธิบาย');
fs.writeFileSync(path.join(root,'Cadet_Import_Template.xlsx'),XLSX.write(wb,{type:'buffer',bookType:'xlsx'}));
const check=XLSX.read(fs.readFileSync(path.join(root,'Cadet_Import_Template.xlsx')),{type:'buffer'});
if(JSON.stringify(XLSX.utils.sheet_to_json(check.Sheets['ทะเบียน'],{header:1})[0])!==JSON.stringify(C.HEADERS))throw new Error('Template headers mismatch');
console.log('Built Demo.html and Cadet_Import_Template.xlsx');
