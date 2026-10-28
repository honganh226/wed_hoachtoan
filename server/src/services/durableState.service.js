import { createCipheriv,createDecipheriv,randomBytes } from 'node:crypto';
import { db } from '../db/database.js';
import { initDatabase } from '../db/init.js';
import { excelMonthService } from './excelMonthService.js';
import { authenticateToken } from '../middlewares/auth.middleware.js';
let revision=null;
let ready=false;
let queue=Promise.resolve();
const configured=()=>Boolean(process.env.SUPABASE_URL&&process.env.SUPABASE_SERVICE_ROLE_KEY);
function key(){const value=process.env.ENCRYPTION_KEY||'';if(!/^[a-f0-9]{64}$/i.test(value))throw Error('Cần ENCRYPTION_KEY gồm 64 ký tự hex');return Buffer.from(value,'hex');}
function encrypt(data){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key(),iv);const body=Buffer.concat([cipher.update(JSON.stringify(data),'utf8'),cipher.final()]);return Buffer.concat([iv,cipher.getAuthTag(),body]).toString('base64');}
function decrypt(value){const bytes=Buffer.from(value,'base64');const cipher=createDecipheriv('aes-256-gcm',key(),bytes.subarray(0,12));cipher.setAuthTag(bytes.subarray(12,28));return JSON.parse(Buffer.concat([cipher.update(bytes.subarray(28)),cipher.final()]).toString('utf8'));}
export function captureState(){const tables={};for(const {name} of db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all()){if(!/^[a-zA-Z0-9_]+$/.test(name))throw Error('Tên bảng không hợp lệ');tables[name]=db.prepare(`SELECT * FROM ${name}`).all();}return {format:1,tables,allocations:Object.fromEntries(excelMonthService.groupAllocations)};}
export function restoreState(state){if(state.format!==1)throw Error('Định dạng snapshot không hỗ trợ');initDatabase();const names=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map(r=>r.name);db.exec('PRAGMA foreign_keys=OFF');try{db.transaction(()=>{for(const name of names)db.prepare(`DELETE FROM ${name}`).run();for(const name of names){const columns=new Set(db.prepare(`PRAGMA table_info(${name})`).all().map(c=>c.name));for(const row of state.tables[name]||[]){const keys=Object.keys(row).filter(k=>columns.has(k));if(keys.length)db.prepare(`INSERT INTO ${name}(${keys.join(',')}) VALUES(${keys.map(()=>'?').join(',')})`).run(...keys.map(k=>row[k]));}}})();initDatabase();}finally{db.exec('PRAGMA foreign_keys=ON');}excelMonthService.groupAllocations=new Map(Object.entries(state.allocations||{}));excelMonthService.cachedData=null;}
async function remote(method,suffix='',body){const url=process.env.SUPABASE_URL.replace(/\/$/,'')+'/rest/v1/hoachtoan_state'+suffix;const response=await fetch(url,{method,headers:{apikey:process.env.SUPABASE_SERVICE_ROLE_KEY,Authorization:'Bearer '+process.env.SUPABASE_SERVICE_ROLE_KEY,'Content-Type':'application/json',Prefer:'return=representation'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(15000)});if(!response.ok)throw Error('Không thể lưu database bền vững (HTTP '+response.status+')');return response.json();}
export async function initializeDurableState(){if(!configured())return false;const rows=await remote('GET','?id=eq.main&select=id,revision,payload');if(rows.length){restoreState(decrypt(rows[0].payload));revision=rows[0].revision;}else{await remote('POST','',{id:'main',revision:1,payload:encrypt(captureState()),updated_at:new Date().toISOString()});revision=1;}ready=true;return true;}
async function flushState(){const next=revision+1;const rows=await remote('PATCH',`?id=eq.main&revision=eq.${revision}`,{revision:next,payload:encrypt(captureState()),updated_at:new Date().toISOString()});if(rows.length!==1){ready=false;throw Error('Database đã được cập nhật bởi phiên khác. Cần khởi động lại để nhận bản mới.');}revision=next;}
export function durabilityStatus(){return {configured:configured(),ready,revision};}
export function durableWrites(req,res,next){
 if(req.method==='POST'&&req.path==='/ai/chat'){
   if(!req.user)return authenticateToken(req,res,()=>durableWrites(req,res,next));
   if(req.user.role==='DIRECTOR')return next();
 }
 if(!configured()||['GET','HEAD','OPTIONS'].includes(req.method)||['/auth/login','/auth/logout','/excel/preview'].includes(req.path))return next();
 const run=async()=>{
  if(!ready){res.status(503).json({success:false,error:'Database bền vững chưa sẵn sàng. Chưa lưu thay đổi.'});return;}
  const before=captureState();const end=res.end.bind(res);let finished=false;
  await new Promise(resolve=>{
   res.end=function(...args){if(finished)return res;finished=true;(async()=>{try{if(res.statusCode<400)await flushState();else restoreState(before);end(...args);}catch(e){restoreState(before);res.statusCode=503;res.removeHeader('Content-Length');res.setHeader('Content-Type','application/json');end(JSON.stringify({success:false,error:e.message+' Thay đổi chưa được lưu; nội dung cũ được giữ lại.'}));}finally{resolve();}})();return res;};
   res.once('close',()=>{if(!finished){finished=true;restoreState(before);resolve();}});
   next();
  });
 };
 const task=queue.then(run);queue=task.catch(()=>{});task.catch(next);
}
