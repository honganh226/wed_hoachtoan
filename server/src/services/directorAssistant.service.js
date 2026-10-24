import { createHash,createHmac,timingSafeEqual } from 'node:crypto';
import { excelMonthService } from './excelMonthService.js';
import { answerDirector } from './directorAssistant.core.js';

const cache=new Map(),windows=new Map();
export const directorSuggestions=['Tóm tắt tình hình','Cuốc nào đang lỗ?','Hiệu quả xe theo doanh thu','Công nợ khách hàng'];
function error(message,status=400){return Object.assign(Error(message),{status});}
function identity(user){return String(user.userId||user.id||user.username||'');}
function signature(value){const secret=process.env.JWT_SECRET;if(!secret)throw error('Máy chủ chưa sẵn sàng xác thực ngữ cảnh.',503);return createHmac('sha256',secret).update(value).digest('base64url');}
function sign(state,user,now){const payload=Buffer.from(JSON.stringify({...state,sub:identity(user),exp:now+30*60*1000})).toString('base64url');return payload+'.'+signature(payload);}
function previous(token,user,now){if(!token)return{};if(typeof token!=='string'||token.length>6000)throw error('Ngữ cảnh không hợp lệ. Xóa cuộc trò chuyện rồi thử lại.');const[payload,mac,...rest]=token.split('.');if(!payload||!mac||rest.length)throw error('Ngữ cảnh không hợp lệ.');const expected=signature(payload),a=Buffer.from(mac),b=Buffer.from(expected);if(a.length!==b.length||!timingSafeEqual(a,b))throw error('Ngữ cảnh không hợp lệ.');let value;try{value=JSON.parse(Buffer.from(payload,'base64url').toString('utf8'));}catch{throw error('Ngữ cảnh không hợp lệ.');}if(value.sub!==identity(user))throw error('Ngữ cảnh không thuộc tài khoản đang đăng nhập.',403);return value.exp>now?value:{};}
function limit(user,now){const id=identity(user);if(!id)throw error('Cần đăng nhập.',401);for(const[key,w]of windows)if(w.until<=now)windows.delete(key);const w=windows.get(id)||{count:0,until:now+60000};if(w.count>=10)throw error('Bạn đã gửi 10 câu hỏi trong một phút. Vui lòng chờ một chút.',429);w.count++;windows.set(id,w);}
export function chatWithDirectorAssistant(input,user,{now=new Date(),enforceRateLimit=true}={}){
 if(user?.role!=='DIRECTOR')throw error('Chỉ giám đốc được tra cứu tài chính qua trợ lý này.',403);
 if(!input||typeof input.message!=='string'||!input.message.trim())throw error('Vui lòng nhập câu hỏi.');
 if(input.message.length>1000)throw error('Câu hỏi tối đa 1.000 ký tự.');
 const millis=now.getTime();if(enforceRateLimit)limit(user,millis);
 const prior=previous(input.contextToken,user,millis);
 // Client history is deliberately ignored: all figures are recomputed from the shared feed.
 if(input.viewContext&&(typeof input.viewContext!=='object'||Array.isArray(input.viewContext)||JSON.stringify(input.viewContext).length>4000))throw error('Bộ lọc trợ lý không hợp lệ.');
 if(input.choice&&(typeof input.choice!=='object'||JSON.stringify(input.choice).length>5000))throw error('Lựa chọn đối tượng không hợp lệ.');
 const view=input.viewContext&&typeof input.viewContext==='object'?input.viewContext:{};
 const data=excelMonthService.getData();
 const revision=createHash('sha256').update(JSON.stringify({rows:data.rows,groups:data.groups})).digest('hex');
 const key=createHash('sha256').update(JSON.stringify({user:identity(user),role:user.role,message:input.message.trim(),view,choice:input.choice||null,prior,revision,today:new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh'}).format(now)})).digest('hex');
 for(const[k,value]of cache)if(value.expires<=millis)cache.delete(k);
 const hit=cache.get(key);
 if(hit)return {...structuredClone(hit.result),cached:true};
 const {response,state}=answerDirector({message:input.message.trim(),viewContext:view,previous:prior,choice:input.choice,data,now});
 const result={...response,success:true,blocked:false,role:'DIRECTOR',data_revision:revision,contextToken:sign(state,user,millis)};
 if(cache.size>=100)cache.delete(cache.keys().next().value);
 cache.set(key,{expires:millis+300000,result:structuredClone(result)});
 return result;
}
export function resetDirectorAssistantMemory(){cache.clear();windows.clear();}
