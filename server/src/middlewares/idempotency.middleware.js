import { createHash } from 'node:crypto';
import { db } from '../db/database.js';
db.exec('CREATE TABLE IF NOT EXISTS write_requests(id TEXT PRIMARY KEY,body_hash TEXT NOT NULL,status INTEGER NOT NULL,response TEXT NOT NULL)');
export function idempotentWrites(req,res,next){
 const requestId=req.get('Idempotency-Key');
 if(!requestId||req.method!=='POST'||!['/trips','/trips/batch','/excel/commit'].includes(req.path))return next();
 if(requestId.length>100)return res.status(400).json({success:false,error:'Mã yêu cầu quá dài'});
 const id=createHash('sha256').update((req.get('Authorization')||'')+'|'+req.path+'|'+requestId).digest('hex');
 const hash=createHash('sha256').update(JSON.stringify(req.body)).digest('hex');
 const old=db.prepare('SELECT * FROM write_requests WHERE id=?').get(id);
 if(old){if(old.body_hash!==hash)return res.status(409).json({success:false,error:'Mã yêu cầu đã dùng với nội dung khác'});return res.status(old.status).json(JSON.parse(old.response));}
 const json=res.json.bind(res);res.json=function(body){if(res.statusCode<400&&body?.success&&!body.data?.failed)db.prepare('INSERT OR IGNORE INTO write_requests VALUES(?,?,?,?)').run(id,hash,res.statusCode,JSON.stringify(body));return json(body);};next();
}
