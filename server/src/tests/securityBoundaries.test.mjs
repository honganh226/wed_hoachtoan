import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {createRequire} from 'node:module';
import {pathToFileURL,fileURLToPath} from 'node:url';

const root=process.env.SECURITY_PROJECT_ROOT || fileURLToPath(new URL('../../../',import.meta.url));
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'hoachtoan-security-'));
process.env.NODE_ENV='test';
process.env.DB_PATH=path.join(temp,'isolated.db');
process.env.GROUP_ALLOCATIONS_PATH=path.join(temp,'groups.json');
process.env.JWT_SECRET=randomBytes(48).toString('hex');
process.env.SUPABASE_URL='';process.env.SUPABASE_SERVICE_ROLE_KEY='';process.env.SUPABASE_SECRET_KEY='';
process.env.EXCEL_PATH=path.join(root,'tháng 1.xlsx');
new DatabaseSync(process.env.DB_PATH).close();
const require=createRequire(path.join(root,'server/package.json'));
const jwt=require('jsonwebtoken');
const bcrypt=require('bcryptjs');
const load=relative=>import(pathToFileURL(path.join(root,'server/src',relative)).href);
const {default:app}=await load('index.js');
const {db}=await load('db/database.js');
const {imageExtension,isExcelFile}=await load('utils/uploadSecurity.js');
const {readUploadedWorkbook}=await load('services/excelReader.service.js');
const password=randomBytes(18).toString('base64url');
const now=new Date().toISOString();
for(const [id,role,area] of [['security-director','DIRECTOR',null],['security-secretary','SECRETARY',null],['security-manager','AREA_MANAGER',null]]){
 db.prepare('INSERT INTO users(id,username,password_hash,full_name,role,area_id,is_active,created_at,updated_at) VALUES(?,?,?,?,?,?,1,?,?)').run(id,id,bcrypt.hashSync(password,4),id,role,area,now,now);
}
const signed=(id,role='DIRECTOR',options={})=>jwt.sign({id,userId:id,username:id,role},process.env.JWT_SECRET,{expiresIn:'5m',...options});
const token=signed('security-director');
const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
const base=`http://127.0.0.1:${server.address().port}`;
const results=[];
async function test(name,fn){try{await fn();results.push({name,status:'PASS'});console.log('PASS',name);}catch(error){results.push({name,status:'FAIL',error:error.message});console.error('FAIL',name,error.message);}}
async function request(route,options={}){const r=await fetch(base+route,{...options,signal:AbortSignal.timeout(15000)});return r;}
const headers={Authorization:'Bearer '+token};
try{
 await test('Unauthenticated legacy pricing is blocked',async()=>assert.equal((await request('/api/v1/trips/default-price')).status,401));
 await test('Unauthenticated financial reports are blocked',async()=>assert.equal((await request('/api/v1/business/financial-report')).status,401));
 await test('Unauthenticated mutations are rejected before write queue',async()=>assert.equal((await request('/api/v1/manage/reset-business-data',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,401));
 await test('Valid director session still works',async()=>assert.equal((await request('/api/v1/manage/metadata',{headers})).status,200));
 await test('Deleted/nonexistent users cannot use signed tokens',async()=>assert.equal((await request('/api/v1/manage/metadata',{headers:{Authorization:'Bearer '+signed('missing-user')}})).status,401));
 await test('Wrong signing algorithm is rejected',async()=>assert.equal((await request('/api/v1/manage/metadata',{headers:{Authorization:'Bearer '+signed('security-director','DIRECTOR',{algorithm:'HS512'})}})).status,403));
 await test('Expired tokens are rejected',async()=>assert.equal((await request('/api/v1/manage/metadata',{headers:{Authorization:'Bearer '+signed('security-director','DIRECTOR',{expiresIn:-1})}})).status,401));
 await test('Database role overrides token role',async()=>assert.equal((await request('/api/v1/manage/metadata',{headers:{Authorization:'Bearer '+signed('security-secretary')}})).status,403));
 await test('Secretaries cannot read payroll',async()=>assert.equal((await request('/api/v1/payroll/summary',{headers:{Authorization:'Bearer '+signed('security-secretary','SECRETARY')}})).status,403));
 await test('Area manager without an assigned area fails closed',async()=>assert.equal((await request('/api/v1/data/trips',{headers:{Authorization:'Bearer '+signed('security-manager','AREA_MANAGER')}})).status,403));
 await test('Disabled users lose API access immediately',async()=>{db.prepare('UPDATE users SET is_active=0 WHERE id=?').run('security-director');try{assert.equal((await request('/api/v1/manage/metadata',{headers})).status,403);}finally{db.prepare('UPDATE users SET is_active=1 WHERE id=?').run('security-director');}});
 await test('SSE keeps authentication and exact allowed origin',async()=>{const abort=new AbortController();try{const r=await fetch(base+'/api/v1/pl/events?token='+token,{headers:{Origin:'http://localhost:5173'},signal:abort.signal});assert.equal(r.status,200);assert.equal(r.headers.get('access-control-allow-origin'),'http://localhost:5173');assert.match(r.headers.get('content-type'),/text\/event-stream/);assert.match(r.headers.get('cache-control'),/no-store/);await r.body.getReader().read();}finally{abort.abort();}});
 await test('Query tokens cannot authorize general APIs',async()=>assert.equal((await request('/api/v1/manage/metadata?token='+token)).status,401));
 await test('Foreign origins are rejected',async()=>assert.equal((await request('/api/v1/manage/metadata',{headers:{...headers,Origin:'https://localhost.evil.example'}})).status,403));
 await test('Allowed frontend preflight permits write concurrency headers',async()=>{const r=await request('/api/v1/manage/trips',{method:'OPTIONS',headers:{Origin:'http://localhost:5173','Access-Control-Request-Method':'PUT','Access-Control-Request-Headers':'authorization,idempotency-key,if-match'}});assert.equal(r.status,204);assert.match(r.headers.get('access-control-allow-headers'),/Idempotency-Key/);});
 await test('Responses block framing and disable sensitive caching',async()=>{const r=await request('/api/v1/manage/metadata',{headers});assert.equal(r.headers.get('x-frame-options'),'DENY');assert.match(r.headers.get('cache-control'),/no-store/);assert.equal(r.headers.get('x-content-type-options'),'nosniff');assert.match(r.headers.get('content-security-policy'),/frame-ancestors 'none'/);});
 await test('Sensitive filesystem paths return 404',async()=>{for(const route of ['/.env','/.git/config','/backup.sqlite','/assets/source.js.map'])assert.equal((await request(route)).status,404);});
 await test('Forged image content is rejected',async()=>{assert.equal(imageExtension(Buffer.from('<html><script>alert(1)</script></html>')),null);assert.equal(imageExtension(Buffer.from('89504e470d0a1a0a','hex')),'png');});
 await test('Fake Excel files are rejected before parsing',async()=>{assert.equal(isExcelFile(Buffer.from('<html/>'),'data.xlsx'),false);await assert.rejects(async()=>readUploadedWorkbook(Buffer.from('<html/>'),'data.xlsx'));});
 await test('Malformed ZIP cannot crash the main server',async()=>{await assert.rejects(()=>readUploadedWorkbook(Buffer.from('504b03040000000000000000','hex'),'data.xlsx'));assert.equal((await request('/api/v1/health')).status,200);});
 await test('Legitimate workbook still reads through bounded worker',async()=>{const w=await readUploadedWorkbook(fs.readFileSync(process.env.EXCEL_PATH),'thang1.xlsx');assert(w.SheetNames.includes('T1-26'));});
 await test('Excel preview, commit, financial totals and rollback still agree',async()=>{
   const XLSX=require('xlsx');const wb=XLSX.utils.book_new();
   XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['STT','NGÀY','CHỦ HÀNG','TUYẾN','CƯỚC VÀO'],[1,'08/11/2026','SECURITY TEST','HP-HN',4500000]]),'T11-2026');
   const form=new FormData();form.append('file',new Blob([XLSX.write(wb,{type:'buffer',bookType:'xlsx'})]),'test.xlsx');
   const pre=await request('/api/v1/excel/preview',{method:'POST',headers,body:form});assert.equal(pre.status,200);const preview=(await pre.json()).data;assert.equal(preview.rows.length,1);
   const committed=await request('/api/v1/excel/commit',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({preview_id:preview.preview_id})});assert.equal(committed.status,201);const batch=(await committed.json()).data;assert.equal(batch.inserted_count,1);
   const report=await request('/api/v1/business/overview?period=custom&start_date=2026-11-08&end_date=2026-11-08',{headers});assert.equal(report.status,200);const k=(await report.json()).data.kpis;assert.equal(k.total_revenue_pre_vat,4500000);assert.equal(k.total_revenue_after_deduction,4033800);
   const undo=await request('/api/v1/excel/batches/'+batch.batch_id+'/rollback',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:'{}'});assert.equal(undo.status,200);
   assert.equal(db.prepare('SELECT count(*) AS n FROM trips').get().n,0);
 });
 await test('Object login inputs produce validation error',async()=>assert.equal((await request('/api/v1/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:{role:'DIRECTOR'},password:'test'})})).status,400));
 await test('Real login remains functional',async()=>{const r=await request('/api/v1/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'security-director',password})});assert.equal(r.status,200);assert((await r.json()).data.token);});
 await test('Repeated failed login attempts are rate limited',async()=>{let limited=false;for(let i=0;i<16;i++){const r=await request('/api/v1/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'security-director',password:'wrong'})});if(r.status===429){limited=true;break;}}assert(limited);});
}finally{
 await new Promise(resolve=>server.close(resolve));db.close();
 const failed=results.filter(r=>r.status==='FAIL').length;
 const output={pass:results.length-failed,fail:failed,results};
 const report=process.env.SECURITY_TEST_REPORT || path.join(temp,'results.json');fs.mkdirSync(path.dirname(report),{recursive:true});fs.writeFileSync(report,JSON.stringify(output,null,2));
 console.log(JSON.stringify({pass:output.pass,fail:output.fail,report}));if(failed)process.exitCode=1;
}
