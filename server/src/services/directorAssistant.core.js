// Deterministic, read-only business analysis. No model, network or user-generated SQL.
export const normalize = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').replace(/Đ/g,'D').toLowerCase().replace(/\s+/g,' ').trim();
const money = value => new Intl.NumberFormat('vi-VN').format(value)+' đ';
const number = value => typeof value==='number'&&Number.isFinite(value)?value:0;
const dayMs=86400000;
export function vietnamToday(now=new Date()){const parts=new Intl.DateTimeFormat('en',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);const get=t=>parts.find(p=>p.type===t).value;return `${get('year')}-${get('month')}-${get('day')}`;}
function iso(date){return date.toISOString().slice(0,10);}
function shift(date,days){return iso(new Date(Date.parse(date+'T00:00:00Z')+days*dayMs));}
function validDate(value){return /^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T00:00:00Z'))&&iso(new Date(value+'T00:00:00Z'))===value;}
function monthPeriod(year,month,today){const start=iso(new Date(Date.UTC(year,month-1,1))),last=iso(new Date(Date.UTC(year,month,0)));return {startDate:start,endDate:start.slice(0,7)===today.slice(0,7)?today:last,kind:'month'};}
function labelled(period){if(period.all)return {...period,label:'Toàn bộ dữ liệu đã ghi nhận'};if(!validDate(period.startDate)||!validDate(period.endDate)||period.startDate>period.endDate)throw Object.assign(Error('Khoảng ngày không hợp lệ. Vui lòng chọn lại ngày bắt đầu và kết thúc.'),{status:400});return {...period,label:period.startDate===period.endDate?`Ngày ${period.startDate}`:`${period.startDate} đến ${period.endDate}`};}
export function resolvePeriod(message,view={},previous={},now=new Date()){
 const n=normalize(message),today=vietnamToday(now),year=Number(today.slice(0,4)),month=Number(today.slice(5,7));
 const comparing=/so (voi|sanh)|tang giam|chenh lech|tang hay giam/.test(n);
 const dates=[...n.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b|\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/g)].map(m=>m[1]?m[0]:`${m[6]}-${m[5].padStart(2,'0')}-${m[4].padStart(2,'0')}`);
 if(dates.length)return labelled({startDate:dates[0],endDate:dates[1]||dates[0],kind:dates.length>1?'range':'day'});
 const shortDay=n.match(/\bngay\s+(\d{1,2})\/(\d{1,2})\b/);
 if(shortDay){const date=`${year}-${shortDay[2].padStart(2,'0')}-${shortDay[1].padStart(2,'0')}`;return labelled({startDate:date,endDate:date,kind:'day'});}
 if(/hom nay|ngay nay/.test(n))return labelled({startDate:today,endDate:today,kind:'day'});
 if(/hom qua/.test(n))return labelled({startDate:comparing?today:shift(today,-1),endDate:comparing?today:shift(today,-1),kind:'day'});
 if(/tuan (nay|truoc)/.test(n)){const weekday=new Date(today+'T00:00:00Z').getUTCDay();let start=shift(today,-((weekday+6)%7));const last=n.includes('tuan truoc')&&!comparing;if(last)start=shift(start,-7);return labelled({startDate:start,endDate:last?shift(start,6):today,kind:'week'});}
 if(/thang nay/.test(n))return labelled(monthPeriod(year,month,today));
 // In comparisons, "tháng trước" identifies the comparator, not the primary period.
 if(/thang truoc/.test(n)&&!/so (voi|sanh)|tang giam|chenh lech/.test(n))return labelled(monthPeriod(year,month-1,today));
 const m=n.match(/\bthang\s+(\d{1,2})(?:\s*(?:\/|nam|-)\s*(\d{4}))?\b|\b(\d{2})\/(\d{4})\b/);
 if(m){const mm=Number(m[1]||m[3]),yy=Number(m[2]||m[4]||year);if(mm<1||mm>12||yy<1900||yy>2200)throw Object.assign(Error('Tháng không hợp lệ.'),{status:400});return labelled(monthPeriod(yy,mm,today));}
 if(/tat ca|toan bo (thoi gian|du lieu)|tu truoc den nay/.test(n))return labelled({all:true,kind:'all'});
 const refer=/^(con |the |vay |chi tiet)|\b(xe do|khach do|cuoc do|tai xe do)\b/.test(n);
 const candidate=(refer?previous.period:null)||view.period||view;
 if(candidate?.all)return labelled({all:true,kind:'all'});
 if(candidate?.startDate&&candidate?.endDate)return labelled({startDate:candidate.startDate,endDate:candidate.endDate,kind:candidate.kind||'range'});
 return labelled(monthPeriod(year,month,today));
}
export function comparisonPeriod(period,now=new Date()){
 if(period.all)return null;
 const today=vietnamToday(now),start=period.startDate,end=period.endDate;
 if(period.kind==='week')return labelled({startDate:shift(start,-7),endDate:shift(end,-7),kind:'week'});
 const lastOfMonth=iso(new Date(Date.UTC(Number(start.slice(0,4)),Number(start.slice(5,7)),0)));
 if(period.kind==='month'||(start.endsWith('-01')&&(end===lastOfMonth||(end===today&&end.slice(0,7)===start.slice(0,7))))){const y=Number(start.slice(0,4)),m=Number(start.slice(5,7)),previous=monthPeriod(y,m-1,'0000-00-00');if(end.slice(0,7)===today.slice(0,7)&&end>=today){const day=Math.min(Number(today.slice(8)),Number(previous.endDate.slice(8)));previous.endDate=previous.startDate.slice(0,8)+String(day).padStart(2,'0');}return labelled(previous);}
 const days=Math.round((Date.parse(end)-Date.parse(start))/dayMs)+1;return labelled({startDate:shift(start,-days),endDate:shift(start,-1),kind:period.kind});
}
export function detectIntent(message,previous={}){
 const n=normalize(message);
 if(/^(?:(?:hay|vui long|giup toi)\s+)?(xoa|sua|cap nhat|ghi de|chuyen tien|thanh toan ho)\b/.test(n))return 'write_refusal';
 if(/du bao|tuong lai|thoi tiet/.test(n))return 'clarify';
 if(/so (voi|sanh)|tang giam|chenh lech|tang hay giam/.test(n))return 'compare';
 if(/(khach|chu hang|nha xe).*(gom|nhung cuoc|nhung chuyen|chi tiet)|chi tiet (khach|chu hang)/.test(n))return 'customer_trips';
 if(/cuoc.*(lo|am)|chuyen.*(lo|am)|dang lo/.test(n))return 'losses';
 if(/\bno\b|cong no|con no|no nhieu|phai thu|phai tra|da thu|thu duoc|doi tru/.test(n))return /nha xe|phai tra/.test(n)?'payables':'receivables';
 if(/tai xe|lai xe|ong nao/.test(n))return 'drivers';
 if(/hieu qua xe|xep hang xe|xe nao|xe .*nhieu nhat|xe .*it nhat/.test(n))return 'vehicles';
 if(/\bcuoc\s*(?:so\s*)?\d+|\bchuyen\s*(?:so\s*)?\d+|chi tiet cuoc|chi tiet chuyen|t1-2026-/.test(n))return 'trip';
 if(/\bxe\b/.test(n)&&!/(may|bao nhieu|so) (cuoc|chuyen)/.test(n))return 'vehicle';
 if(/\bkhach\b|chu hang/.test(n))return 'customer_trips';
 if(/tong ket|tom tat|tinh hinh|ban tin|can chu y/.test(n))return 'briefing';
 if(/doanh thu|chi phi|tien dau|gia dau|lai|loi nhuan|tien cuoc|may cuoc|bao nhieu (cuoc|chuyen)|so (cuoc|chuyen)|lam an/.test(n))return 'summary';
 if(/^(con |the |vay |chi tiet)|^tuan (nay|truoc)$|^thang (nay|truoc)$/.test(n))return previous.intent||'summary';
 return 'clarify';
}
function unique(values){return [...new Set(values.filter(Boolean))];}
function compact(value){return normalize(value).replace(/[^a-z0-9]/g,'');}
function candidates(rows,kind){if(kind==='trip')return unique(rows.map(r=>r.id));if(kind==='vehicle')return unique(rows.map(r=>r.vehicle_plate));if(kind==='driver')return unique(rows.map(r=>r.driver_name).filter(knownDriver));if(kind==='supplier')return unique(rows.filter(r=>r.is_subcontractor).map(r=>r.subcontractor_name));return unique(rows.map(r=>r.customer_name));}
function knownDriver(name){const n=normalize(name);return Boolean(n)&&!/(chua|khong ro|khong xac dinh|xe ngoai|tai xe phu trach|tai xe chua)/.test(n);}
export function resolveEntity(message,intent,rows,previous={},view={},choice=null){
 const n=normalize(message),isDebt=['receivables','payables','customer_trips'].includes(intent);
 const kind=intent==='payables'?'supplier':isDebt?'customer':intent==='drivers'?'driver':'vehicle';
 const choices=candidates(rows,kind);
 if(choice?.kind===kind&&choices.includes(choice.value))return {entity:{kind,value:choice.value}};
 if(choice?.kind==='trip'&&rows.some(r=>r.id===choice.value))return {entity:{kind:'trip',value:choice.value}};
 const idMatch=rows.find(r=>r.id&&n.includes(normalize(r.id)));
 const seq=n.match(/\b(?:cuoc|chuyen)\s*(?:so\s*)?(\d+)\b/);
 if(intent==='trip'&&(idMatch||seq)){const matched=idMatch||rows.find(r=>r.stt===Number(seq[1]));return {entity:{kind:'trip',value:matched?.id||`Cuốc số ${seq?.[1]}`}};}
 const plates=candidates(rows,'vehicle').filter(v=>compact(v).length>=6&&compact(n).includes(compact(v)));
 if(plates.length===1)return {entity:{kind:'vehicle',value:plates[0]}};
 if(kind==='vehicle'){
  const plate=n.match(/\b\d{2}\s*[-.]?\s*[a-z]\s*[-.]?\s*\d[\d .-]{3,9}\d\b/);
  if(plate)return {entity:{kind,value:plate[0].trim()}};
  const partial=n.match(/\bxe\s+(\d{2}[a-z](?:[\d.-]+)?)/);
  if(partial){const matches=choices.filter(v=>compact(v).startsWith(compact(partial[1])));if(matches.length===1)return {entity:{kind,value:matches[0]}};if(matches.length>1)return {clarification:{question:'Bạn muốn xem xe nào?',options:matches.slice(0,8).map(value=>({label:value,message,choice:{kind,value}}))}};return {entity:{kind,value:partial[1]}};}
 }
 const namePattern=kind==='driver'?/(?:tai xe|lai xe)\s+(.+)/:kind==='supplier'?/nha xe\s+(.+)/:kind==='customer'?/(?:khach hang|khach|chu hang)\s+(.+)/:null;
 const named=namePattern?n.match(namePattern):null;
 let query=named?.[1]?.split(/\s+(?:con no|no bao|gom|co nhung|dang|trong|thang|tuan|hom|lai bao|doanh thu|chi phi|chi tiet|mang lai|phai tra)/)[0]?.trim();
 if(query&&/^(nao|do|nhieu|con|da|cua|it|bao nhieu|xep hang)/.test(query))query=null;
 let matches=choices.filter(value=>normalize(value).length>=3&&n.includes(normalize(value)));
 if(!matches.length&&query)matches=choices.filter(value=>{const words=query.split(/[^a-z0-9]+/).filter(Boolean);return words.length&&words.every(word=>normalize(value).includes(word));});
 if(matches.length>1)return {clarification:{question:'Có nhiều đối tượng phù hợp. Bạn muốn xem đối tượng nào?',options:matches.slice(0,8).map(value=>({label:value,choice:{kind,value},message}))}};
 if(matches.length===1)return {entity:{kind,value:matches[0]}};
 if(/\b(xe do|khach do|tai xe do|cuoc do)\b|^(con |the |vay )/.test(n)&&previous.entity)return {entity:previous.entity};
 if(view.entity&&candidates(rows,view.entity.kind).includes(view.entity.value))return {entity:view.entity};
 if(query)return {entity:{kind,value:query}};
 return {entity:null};
}
function inPeriod(row,period){return period.all||(row.trip_date>=period.startDate&&row.trip_date<=period.endDate);}
function filterEntity(row,entity){if(!entity)return true;const key={vehicle:'vehicle_plate',driver:'driver_name',customer:'customer_name',supplier:'subcontractor_name',trip:'id'}[entity.kind];return key&&normalize(row[key])===normalize(entity.value);}
function amount(row,key){return typeof row[key]==='number'&&Number.isFinite(row[key])?row[key]:null;}
function total(rows,key){return rows.reduce((sum,row)=>sum+number(row[key]),0);}
function metricsFor(rows,groups,allRows){
 if(!rows.length)return {trips:0,revenue:null,recorded_cost:null,profit:null,fuel_liters:null,received:null,offset:null,receivable_due:null,payable:null,payable_due:null,unallocated_groups:0,incomplete_shared_cost:false,missing_financial_data:true};
 const ids=new Set(rows.map(r=>r.id));
 const pending=groups.filter(g=>g.allocation_mode==='UNALLOCATED'&&g.trips.some(id=>ids.has(id)));
 const incomplete=pending.some(g=>g.trips.some(id=>!ids.has(id)&&allRows.some(r=>r.id===id)));
 const missingRevenue=rows.some(r=>amount(r,'cuoc_vao')===null),missingCost=rows.some(r=>amount(r,'direct_cost')===null),missing=missingRevenue||missingCost;
 return {trips:rows.length,revenue:missingRevenue?null:total(rows,'cuoc_vao'),recorded_cost:missingCost?null:total(rows,'direct_cost'),profit:missing||incomplete?null:total(rows,'cuoc_vao')-total(rows,'direct_cost'),fuel_liters:total(rows,'dau_liters'),received:total(rows,'received_amount'),offset:total(rows,'offset_amount'),receivable_due:rows.reduce((s,r)=>s+Math.max(0,number(r.cuoc_vao)-number(r.received_amount)-number(r.offset_amount)),0),payable:total(rows,'cuoc_ra'),payable_due:rows.reduce((s,r)=>s+Math.max(0,number(r.cuoc_ra)-number(r.sub_paid_amount)),0),unallocated_groups:pending.length,incomplete_shared_cost:incomplete,missing_financial_data:missing};
}
function link(label,kind,value,period,entity=null){return {label,target:{kind,...(kind==='trip'?{id:value}:value?{query:value}:{}),period,entity}};}
const note='Lãi tạm tính chưa trừ lương và chưa quy đổi tiền dầu; cước đã gồm VAT.';
export function answerDirector({message,viewContext={},previous={},choice=null,data,now=new Date()}){
 const intent=detectIntent(message,previous),period=resolvePeriod(message,viewContext,previous,now);
 const companyScope=/toan cong ty/.test(normalize(message))||choice?.kind==='company_scope';
 const resolved=resolveEntity(message,intent,data.rows,companyScope?{...previous,entity:null}:previous,companyScope?{...viewContext,entity:null}:viewContext,choice);
 const response={type:intent,period,metrics:{},items:[],sources:[],notes:[],clarification:null,reply:'',engine:'internal',read_only:true,timestamp:now.toISOString()};
 const text=normalize(message);
 const explicitProfit=/lãi|lời|lợi nhuận/iu.test(message)||/loi nhuan|tien loi|mang loi|loi (nhieu|it|bao)|theo loi/.test(text);
 const state={intent,period,entity:resolved.entity,metric:/doanh thu/.test(text)?'revenue':explicitProfit?'profit':/it|may|cuoc|chuyen/.test(text)?'trips':/\blai\b/.test(text)?'profit':previous.metric||'revenue'};
 if(/\bquy\s*[1-4]|\b(ca nam|nam nay|nam truoc)\b/.test(text)||(/\bnam\s+\d{4}\b/.test(text)&&!text.includes('thang'))){
  response.type='clarification';response.reply='Bạn hãy ghi khoảng ngày bắt đầu và kết thúc cho quý hoặc năm, ví dụ: Tổng kết từ 01/01/2026 đến 31/03/2026. Tôi không tự dùng kỳ đang chọn để thay cho quý/năm được hỏi.';return {response,state};
 }
 if(viewContext.area&&viewContext.area!=='ALL'&&!/toan cong ty/.test(normalize(message))&&choice?.kind!=='company_scope'){
  response.type='clarification';response.reply='Chưa có dữ liệu khu vực được xác nhận đầy đủ cho các cuốc nguồn. Tôi không tự gán khu vực để tính số liệu.';response.clarification={question:'Bạn muốn xem toàn công ty trong cùng kỳ không?',options:[{label:'Xem toàn công ty',message:'Tổng kết toàn công ty',choice:{kind:'company_scope',value:'ALL'}}]};return {response,state};
 }
 if(intent==='write_refusal'){response.reply='Trợ lý chỉ tra cứu và phân tích. Bạn có thể dùng mục Dữ liệu & chỉnh sửa để thay đổi thông tin và kiểm tra trước khi lưu.';response.sources=[link('Mở dữ liệu & chỉnh sửa','trips',null,period)];return {response,state};}
 if(resolved.clarification){response.type='clarification';response.clarification=resolved.clarification;response.reply=resolved.clarification.question;return {response,state};}
 if(intent==='trip'&&!state.entity){response.type='clarification';response.reply='Bạn muốn xem cuốc nào? Chọn một cuốc hoặc nhập mã/số thứ tự cuốc.';response.clarification={question:'Một số cuốc trong dữ liệu:',options:data.rows.filter(r=>inPeriod(r,period)).slice(0,5).map(r=>({label:`${r.id} · ${r.customer_name}`,message:`Chi tiết cuốc ${r.id}`,choice:{kind:'trip',value:r.id}}))};return {response,state};}
 if(intent==='clarify'){response.type='clarification';response.reply='Tôi chưa xác định được chỉ tiêu bạn muốn xem. Bạn có thể hỏi về doanh thu, chi phí, lãi tạm tính, xe, tài xế hoặc công nợ.';response.clarification={question:'Bạn muốn xem nội dung nào?',options:[{label:'Tổng kết kỳ',message:'Tổng kết kỳ'},{label:'Cuốc đang lỗ',message:'Cuốc nào đang lỗ?'},{label:'Công nợ',message:'Công nợ khách hàng'}]};return {response,state};}
 const rows=data.rows.filter(r=>inPeriod(r,period)&&filterEntity(r,state.entity));
 const metrics=metricsFor(rows,data.groups,data.rows);response.metrics=metrics;
 const prefix=`Phạm vi: ${period.label}${state.entity?' · '+state.entity.value:''}.`;
 if(!rows.length){response.type='no_data';response.reply=prefix+'\nChưa có dữ liệu ghi nhận trong phạm vi này; chưa đủ cơ sở kết luận doanh thu, chi phí hoặc lãi bằng 0.';const months=unique(data.rows.map(r=>r.trip_date?.slice(0,7))).sort();response.clarification={question:'Dữ liệu hiện có ở các kỳ sau:',options:months.slice(-6).map(m=>({label:m,message:`Tổng kết tháng ${Number(m.slice(5))}/${m.slice(0,4)}`}))};return {response,state};}
 if(/tien dau|chi phi dau|gia dau/.test(text)){
  response.type='insufficient_data';response.reply=prefix+`\nĐã ghi nhận cấp ${new Intl.NumberFormat('vi-VN').format(metrics.fuel_liters)} lít dầu. Chưa có đơn giá dầu được xác nhận trong nguồn phân tích nên chưa tính được tiền dầu; không coi tiền dầu bằng 0.`;response.sources=[link('Đối chiếu các cuốc','trips',state.entity?.value,period,state.entity)];return {response,state};
 }
 response.notes=[note];
 if(metrics.unallocated_groups)response.notes.push(`${metrics.unallocated_groups} nhóm chi phí chung chưa phân bổ; chưa chốt lãi riêng từng cuốc.`);
 if(metrics.incomplete_shared_cost)response.notes.push('Phạm vi chỉ chứa một phần nhóm chưa phân bổ; chưa đủ cơ sở xác định lãi cho phần này.');
 const show=v=>v===null?'Chưa đủ cơ sở':money(v);
 const brief=`${rows.length} cuốc · Doanh thu ${show(metrics.revenue)} · Chi phí đã ghi nhận ${show(metrics.recorded_cost)} · Lãi tạm tính ${show(metrics.profit)}.`;
 if(intent==='compare'){
  const priorPeriod=comparisonPeriod(period,now);
  if(!priorPeriod){response.reply=prefix+'\nHãy chọn một khoảng ngày để so sánh với kỳ liền trước.';return {response,state};}
  const beforeRows=data.rows.filter(r=>inPeriod(r,priorPeriod)&&filterEntity(r,state.entity));
  const before=metricsFor(beforeRows,data.groups,data.rows);response.comparison={period:priorPeriod,metrics:before,changes:{}};
  for(const key of ['trips','revenue','recorded_cost','profit']){const current=metrics[key],old=before[key];response.comparison.changes[key]=!beforeRows.length||current===null||old===null?{delta:null,percent:null}:{delta:current-old,percent:old>0?Math.round((current-old)/old*10000)/100:null};}
  response.reply=prefix+'\n'+brief+'\n'+(beforeRows.length?`Kỳ đối chiếu ${priorPeriod.label}: doanh thu ${show(before.revenue)}, chi phí ${show(before.recorded_cost)}, lãi tạm tính ${show(before.profit)}.`:`Kỳ đối chiếu ${priorPeriod.label} chưa có dữ liệu; không tính phần trăm tăng giảm.`);
  if(beforeRows.length)for(const[key,label]of [['revenue','Doanh thu'],['recorded_cost','Chi phí'],['profit','Lãi tạm tính']]){const change=response.comparison.changes[key];if(change.delta!==null)response.reply+=`\n${label} ${change.delta===0?'không đổi':(change.delta>0?'tăng ':'giảm ')+money(Math.abs(change.delta))}${change.percent===null?' (không tính tỷ lệ %)':` (${Math.abs(change.percent)}%)`}.`;}
  response.sources=[link('Xem kỳ hiện tại','trips',state.entity?.value,period),link('Xem kỳ đối chiếu','trips',state.entity?.value,priorPeriod)];
 }else if(['receivables','payables'].includes(intent)){
  const payable=intent==='payables',key=payable?'subcontractor_name':'customer_name';
  const names=unique(rows.filter(r=>!payable||r.is_subcontractor).map(r=>r[key]));
  const debtRows=names.map(name=>{const rs=rows.filter(r=>r[key]===name),m=metricsFor(rs,data.groups,data.rows);return {name,trips:rs.length,amount:payable?m.payable:m.revenue,paid:payable?total(rs,'sub_paid_amount'):m.received,offset:payable?0:m.offset,due:payable?m.payable_due:m.receivable_due};}).sort((a,b)=>b.due-a.due);
  response.items=debtRows.filter(r=>r.due>0).slice(0,10);response.notes.push('Công nợ của cuốc phát sinh trong kỳ, theo tình trạng thanh toán hiện tại; chưa phải số dư lịch sử tại ngày chốt.');
  response.reply=prefix+'\n'+(payable?`Phải trả nhà xe ${show(metrics.payable)}; còn phải trả ${show(metrics.payable_due)}.`:`Cước phải thu ${show(metrics.revenue)}; đã thu ${show(metrics.received)}; đối trừ ${show(metrics.offset)}; còn phải thu ${show(metrics.receivable_due)}.`)+(response.items.length?'\n'+response.items.map(r=>`${r.name}: còn ${money(r.due)} (${r.trips} cuốc).`).join('\n'):'\nKhông có khoản còn nợ được ghi nhận trong phạm vi này.');
  response.sources=response.items.length?response.items.map(r=>link(r.name,payable?'payables':'customer',r.name,period)):[link('Đối chiếu chi tiết',payable?'payables':'customer',state.entity?.value,period)];
 }else if(intent==='losses'){
  const losses=rows.filter(r=>typeof r.trip_profit==='number'&&r.trip_profit<0).sort((a,b)=>a.trip_profit-b.trip_profit);
  const ids=new Set(rows.map(r=>r.id));const lossGroups=data.groups.filter(g=>g.trips.every(id=>ids.has(id))&&g.group_margin<0);
  response.items=losses.slice(0,10).map(r=>({id:r.id,date:r.trip_date,customer:r.customer_name,profit:r.trip_profit}));response.metrics.loss_trips=losses.length;response.metrics.loss_groups=lossGroups.length;
  response.reply=prefix+`\nCó ${losses.length} cuốc đủ cơ sở đang có lãi tạm tính âm và ${lossGroups.length} nhóm có chênh lệch âm.`+(losses.length?'\n'+response.items.map(r=>`${r.id} · ${r.customer}: ${money(r.profit)}.`).join('\n'):'\nKhông tự coi cuốc chưa phân bổ chi phí là có lãi hoặc không lỗ.');
  response.sources=[...losses.slice(0,8).map(r=>link(r.id,'trip',r.id,period)),...lossGroups.slice(0,3).map(g=>link(g.group_key,'group',g.group_key,period))];
 }else if(['vehicles','drivers'].includes(intent)){
  const driver=intent==='drivers',key=driver?'driver_name':'vehicle_plate';
  const validRows=rows.filter(r=>!r.is_subcontractor&&(!driver||knownDriver(r.driver_name)));
  const names=unique(validRows.map(r=>r[key]));
  const ranking=names.map(name=>{const own=validRows.filter(r=>r[key]===name),m=metricsFor(own,data.groups,data.rows);return {name,trips:own.length,revenue:m.revenue,profit:m.profit};});
  const metric=state.metric,asc=/it nhat|lai thap|thap nhat/.test(normalize(message));
  const available=ranking.filter(r=>r[metric]!==null).sort((a,b)=>(asc?1:-1)*(a[metric]-b[metric])||a.name.localeCompare(b.name,'vi'));
  response.items=available.slice(0,10);response.metrics.unconfirmed_driver_trips=driver?rows.filter(r=>!r.is_subcontractor&&!knownDriver(r.driver_name)).length:0;
  response.reply=prefix+'\n'+(available.length?`Xếp theo ${metric==='trips'?'số cuốc':metric==='profit'?'lãi tạm tính đủ cơ sở':'doanh thu'}${asc?' từ thấp lên cao':''}:\n`+response.items.map((r,i)=>`${i+1}. ${r.name}: ${r.trips} cuốc, doanh thu ${show(r.revenue)}, lãi tạm tính ${show(r.profit)}.`).join('\n'):`Chưa đủ dữ liệu ${driver?'tài xế được xác nhận':'xe'} để xếp hạng theo chỉ tiêu này.`);
  if(driver&&response.metrics.unconfirmed_driver_trips)response.notes.push(`${response.metrics.unconfirmed_driver_trips} cuốc xe công ty chưa xác nhận tài xế; không dùng dữ liệu mẫu để gán lịch sử.`);
  response.notes.push('Số cuốc ít không chứng minh xe đang rảnh hoặc tài xế làm việc kém.');response.sources=response.items.map(r=>link(r.name,'trips',r.name,period,{kind:driver?'driver':'vehicle',value:r.name}));
 }else{
  response.reply=prefix+'\n'+brief;
  if(intent==='briefing')response.reply+=`\nĐã thu ${show(metrics.received)}, đối trừ ${show(metrics.offset)}, còn phải thu ${show(metrics.receivable_due)}; còn phải trả nhà xe ${show(metrics.payable_due)}.\nDầu cấp ${new Intl.NumberFormat('vi-VN').format(metrics.fuel_liters)} lít.\nCần chú ý: ${metrics.unallocated_groups} nhóm chưa phân bổ chi phí; ${rows.filter(r=>typeof r.trip_profit==='number'&&r.trip_profit<0).length} cuốc đủ cơ sở có lãi tạm tính âm.`;
  if(intent==='trip'&&rows.length===1){const r=rows[0];response.reply=`${prefix}\n${r.id} · ${r.customer_name} · ${r.route_name}.\nCước vào ${show(r.cuoc_vao)}, chi phí đã ghi nhận ${show(r.direct_cost)}, lãi tạm tính ${show(r.trip_profit)}.`;}
  if(intent==='customer_trips'||intent==='vehicle')response.items=rows.slice(0,10).map(r=>({id:r.id,date:r.trip_date,customer:r.customer_name,revenue:r.cuoc_vao,profit:r.trip_profit}));
  response.sources=intent==='trip'&&rows.length===1?[link('Xem chi tiết cuốc','trip',rows[0].id,period)]:response.items.length?response.items.slice(0,8).map(r=>link(`${r.date} · ${r.id}`,'trip',r.id,period)):[link('Đối chiếu các cuốc','trips',state.entity?.value,period),link('Xem công nợ khách','customer',null,period)];
 }
 for(const source of response.sources)if(!source.target.entity&&state.entity)source.target.entity=state.entity;
 response.reply+='\n'+response.notes.join('\n');
 return {response,state};
}
