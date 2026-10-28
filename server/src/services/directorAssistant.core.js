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
 if(/\bcuoc\s*(?:so\s*)?\d+|\bchuyen\s*(?:so\s*)?\d+|chi tiet cuoc|chi tiet chuyen|t1-2026-/.test(n))return 'trip';
 if(/cuoc.*(lo|am)|chuyen.*(lo|am)|dang lo/.test(n))return 'losses';
 if(/\bno\b|cong no|con no|no nhieu|phai thu|phai tra|da thu|thu duoc|doi tru|tien phoi|phoi chua hoan|den han|qua han/.test(n))return /nha xe|phai tra/.test(n)?'payables':'receivables';
 if(/tai xe|lai xe|ong nao/.test(n))return 'drivers';
 if(/hieu qua xe|xep hang xe|xe nao|xe .*nhieu nhat|xe .*it nhat/.test(n))return 'vehicles';
 if(/\bxe\b/.test(n)&&!/(may|bao nhieu|so) (cuoc|chuyen)/.test(n))return 'vehicle';
 if(/\bkhach\b|chu hang/.test(n))return 'customer_trips';
 if(/tong ket|tom tat|tinh hinh|ban tin|can chu y/.test(n))return 'briefing';
 if(/doanh thu|chi phi|tien dau|gia dau|lai|loi nhuan|tien cuoc|cuoc goc|cuoc co vat|khoan tru|sau khoan tru|vat|may cuoc|bao nhieu (cuoc|chuyen)|so (cuoc|chuyen)|lam an/.test(n))return 'summary';
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
function hasRowRevenue(r){return amount(r,'cuoc_goc')!==null||amount(r,'cuoc_vao')!==null;}
function rowCuocGoc(r){return hasRowRevenue(r)?number(r.cuoc_goc??r.cuoc_vao):null;}
function rowVat8(r){const g=rowCuocGoc(r);if(g===null)return null;return typeof r.vat_amount==='number'?r.vat_amount:Math.round(g*0.08);}
function rowCuocCoVat(r){const g=rowCuocGoc(r);if(g===null)return null;return typeof r.cuoc_co_vat==='number'?r.cuoc_co_vat:g+rowVat8(r);}
function rowKhoanTru17(r){const cv=rowCuocCoVat(r);if(cv===null)return null;return typeof r.khoan_tru_17==='number'?r.khoan_tru_17:Math.round(cv*0.17);}
function rowCuocSauTru17(r){const cv=rowCuocCoVat(r);if(cv===null)return null;return typeof r.cuoc_sau_tru_17==='number'?r.cuoc_sau_tru_17:cv-rowKhoanTru17(r);}
function isRowFuelMissing(r){
 if(Boolean(r.is_fuel_price_missing))return true;
 const liters=number(r.dau_liters??r.fuel_liters);
 if(liters<=0)return false;
 const fuelCost=number(r.tien_dau??r.fuel_cost);
 const unitPrice=number(r.fuel_unit_price);
 return fuelCost<=0&&unitPrice<=0;
}
function rowCompanyCost(r){
 if(r.allocation_status==='UNALLOCATED')return null;
 if('direct_cost' in r && r.direct_cost===null)return null;
 if(typeof r.chi_phi_cong_ty==='number'&&Number.isFinite(r.chi_phi_cong_ty))return r.chi_phi_cong_ty;
 if(typeof r.direct_cost==='number'&&Number.isFinite(r.direct_cost)){
  if(r.direct_cost_before_fuel!==undefined)return r.direct_cost;
  return r.direct_cost+number(r.tien_dau??r.fuel_cost);
 }
 return null;
}
function rowMarginAfter17(r){
 if(r.allocation_status==='UNALLOCATED')return null;
 if('chenh_lech_sau_tru_17' in r){
  return typeof r.chenh_lech_sau_tru_17==='number'&&Number.isFinite(r.chenh_lech_sau_tru_17)?r.chenh_lech_sau_tru_17:null;
 }
 const after17=rowCuocSauTru17(r),cost=rowCompanyCost(r);
 if(after17===null||cost===null)return null;
 return after17-cost;
}
function rowProfitBeforeDeduction(r){
 if(r.allocation_status==='UNALLOCATED')return null;
 const goc=rowCuocGoc(r),cost=rowCompanyCost(r);
 if(goc===null||cost===null)return null;
 return goc-cost;
}
function rowReceivableDue(r){
 const g=rowCuocGoc(r),cv=rowCuocCoVat(r);
 if(g===null||cv===null)return 0;
 const received=number(r.received_amount),offset=number(r.offset_amount);
 const isSettled=Boolean(r.is_customer_paid||r.is_offset||['DA_TT','TUOI','X','DOI_TRU'].includes(r.customer_payment_status));
 const isHistoricalSettledAtBase=isSettled&&(received+offset===g);
 return isHistoricalSettledAtBase?0:Math.max(0,cv-received-offset);
}
function metricsFor(rows,groups,allRows){
 if(!rows.length)return {trips:0,revenue:null,revenue_pre_vat:null,vat_8:null,revenue_with_vat:null,deduction_17:null,revenue_after_deduction:null,recorded_cost:null,profit:null,profit_before_deduction:null,margin_after_deduction_17:null,fuel_liters:null,fuel_cost:null,missing_fuel_price_trips:0,phoi_advance:0,phoi_refunded:0,phoi_due:0,received:null,offset:null,receivable_due:null,combined_receivable_due:null,payable:null,payable_due:null,unallocated_groups:0,incomplete_shared_cost:false,incomplete_cost:false,missing_financial_data:true};
 const ids=new Set(rows.map(r=>r.id));
 const pending=groups.filter(g=>g.allocation_mode==='UNALLOCATED'&&g.trips.some(id=>ids.has(id)));
 const incomplete=pending.some(g=>g.trips.some(id=>!ids.has(id)&&allRows.some(r=>r.id===id)));
 const missingRevenue=rows.some(r=>!hasRowRevenue(r));
 // Các dòng đơn lẻ (không thuộc nhóm gộp UNALLOCATED) nếu thiếu direct_cost là thiếu dữ liệu chi phí
 const missingCost=rows.some(r=>r.allocation_status!=='UNALLOCATED'&&rowCompanyCost(r)===null);
 const missing=missingRevenue||missingCost;
 const revPreVat = missingRevenue ? null : rows.reduce((s, r) => s + rowCuocGoc(r), 0);
 const vat8 = missingRevenue ? null : rows.reduce((s, r) => s + rowVat8(r), 0);
 const revWithVat = missingRevenue ? null : rows.reduce((s, r) => s + rowCuocCoVat(r), 0);
 const deduct17 = missingRevenue ? null : rows.reduce((s, r) => s + rowKhoanTru17(r), 0);
 const revAfterDeduct = missingRevenue ? null : rows.reduce((s, r) => s + rowCuocSauTru17(r), 0);
 const fuelCostTotal = rows.reduce((s, r) => s + number(r.tien_dau ?? r.fuel_cost), 0);
 const costTotal = missingCost ? null : rows.reduce((s, r) => {
  if (r.allocation_status === 'UNALLOCATED') {
   // Với nhóm gộp chưa phân bổ nhưng nằm trọn trong kỳ: cộng chi phí trực tiếp trên dòng (đã giữ 1 lần ở dòng đầu nhóm) + tiền dầu
   const baseCost = r.direct_cost_before_fuel !== undefined ? number(r.direct_cost_before_fuel) + number(r.tien_dau ?? r.fuel_cost) : number(r.tien_duong) + number(r.cuoc_ra) + number(r.lift_on_fee) + number(r.lift_off_fee) + number(r.phat_sinh) + number(r.tien_dau ?? r.fuel_cost);
   return s + baseCost;
  }
  return s + rowCompanyCost(r);
 }, 0);
 const missingFuelCount = rows.filter(isRowFuelMissing).length;
 const marginAfter17 = missing || incomplete ? null : revAfterDeduct - costTotal;
 const profitBeforeDeduct = missing || incomplete ? null : revPreVat - costTotal;
 const receivableDue = rows.reduce((s, r) => s + rowReceivableDue(r), 0);
 const phoiDue = total(rows, 'phoi_balance_due');
 const incompleteCost = Boolean(missingFuelCount > 0 || pending.length > 0 || incomplete);
 return {
  trips:rows.length,
  revenue:revPreVat,
  revenue_pre_vat:revPreVat,
  vat_8:vat8,
  revenue_with_vat:revWithVat,
  deduction_17:deduct17,
  revenue_after_deduction:revAfterDeduct,
  recorded_cost:costTotal,
  profit:marginAfter17,
  margin_after_deduction_17:marginAfter17,
  profit_before_deduction:profitBeforeDeduct,
  fuel_liters:rows.reduce((s,r)=>s+number(r.dau_liters??r.fuel_liters),0),
  fuel_cost:fuelCostTotal,
  missing_fuel_price_trips:missingFuelCount,
  phoi_advance:total(rows,'phoi_total_advance'),
  phoi_refunded:total(rows,'phoi_total_refunded'),
  phoi_due:phoiDue,
  received:total(rows,'received_amount'),
  offset:total(rows,'offset_amount'),
  receivable_due:receivableDue,
  combined_receivable_due:receivableDue+phoiDue,
  payable:total(rows,'cuoc_ra'),
  payable_due:rows.reduce((s,r)=>s+Math.max(0,number(r.cuoc_ra)-number(r.sub_paid_amount)),0),
  unallocated_groups:pending.length,
  incomplete_shared_cost:incomplete,
  incomplete_cost:incompleteCost,
  missing_financial_data:missing
 };
}
function link(label,kind,value,period,entity=null){return {label,target:{kind,...(kind==='trip'?{id:value}:value?{query:value}:{}),period,entity}};}
const note='Chênh lệch tạm tính chưa trừ lương; cước vào gốc là chưa VAT (+8% VAT, khoản trừ 17% là quy tắc tính nội bộ, không phải lãi ròng).';
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
  if(metrics.missing_fuel_price_trips > 0 && metrics.fuel_cost === 0){
   response.type='insufficient_data';response.reply=prefix+`\nĐã ghi nhận cấp ${new Intl.NumberFormat('vi-VN').format(metrics.fuel_liters)} lít dầu. Chưa có đơn giá dầu cho ngày chạy nên chưa tính được tiền dầu; không coi tiền dầu bằng 0.`;response.sources=[link('Đối chiếu các cuốc','trips',state.entity?.value,period,state.entity)];return {response,state};
  }
  response.reply=prefix+`\nLượng dầu cấp: ${new Intl.NumberFormat('vi-VN').format(metrics.fuel_liters)} lít · Tiền dầu đã quy đổi: ${money(metrics.fuel_cost)}${metrics.missing_fuel_price_trips>0?` (còn ${metrics.missing_fuel_price_trips} cuốc chưa có giá dầu ngày chạy)`:''}.`;
  response.sources=[link('Đối chiếu các cuốc','trips',state.entity?.value,period,state.entity)];return {response,state};
 }
 response.notes=[note];
 if(metrics.missing_fuel_price_trips>0)response.notes.push(`Chưa hoàn chỉnh: có ${metrics.missing_fuel_price_trips} cuốc cấp dầu (${new Intl.NumberFormat('vi-VN').format(metrics.fuel_liters)} lít) chưa nhập đơn giá dầu ngày chạy; chênh lệch tạm tính chưa trừ tiền dầu của các cuốc này.`);
 if(metrics.unallocated_groups)response.notes.push(`${metrics.unallocated_groups} nhóm chi phí chung chưa phân bổ; chưa chốt chênh lệch riêng từng cuốc.`);
 if(metrics.incomplete_shared_cost)response.notes.push('Phạm vi chỉ chứa một phần nhóm chưa phân bổ; chưa đủ cơ sở xác định chênh lệch cho phần này.');
 const show=v=>v===null?'Chưa đủ cơ sở':money(v);
 const incompleteTag=metrics.missing_fuel_price_trips>0?' [chưa đủ giá dầu — chưa hoàn chỉnh]':metrics.unallocated_groups>0?' [có nhóm gộp chưa phân bổ]':'';
 const brief=`${rows.length} cuốc · Cước gốc (chưa VAT) ${show(metrics.revenue)} · VAT 8% ${show(metrics.vat_8)} · Cước có VAT ${show(metrics.revenue_with_vat)} · Khoản trừ 17% nội bộ ${show(metrics.deduction_17)} · Cước sau trừ 17% ${show(metrics.revenue_after_deduction)} · Chi phí công ty ${show(metrics.recorded_cost)} · Chênh lệch tạm tính sau trừ 17% & chi phí (chưa trừ lương)${incompleteTag}: ${show(metrics.margin_after_deduction_17)} (Đối chiếu chênh lệch trước khoản trừ 17%: ${show(metrics.profit_before_deduction)}).`;
 if(intent==='compare'){
  const priorPeriod=comparisonPeriod(period,now);
  if(!priorPeriod){response.reply=prefix+'\nHãy chọn một khoảng ngày để so sánh với kỳ liền trước.';return {response,state};}
  const beforeRows=data.rows.filter(r=>inPeriod(r,priorPeriod)&&filterEntity(r,state.entity));
  const before=metricsFor(beforeRows,data.groups,data.rows);response.comparison={period:priorPeriod,metrics:before,changes:{}};
  for(const key of ['trips','revenue','revenue_with_vat','revenue_after_deduction','recorded_cost','margin_after_deduction_17','profit']){const current=metrics[key],old=before[key];response.comparison.changes[key]=!beforeRows.length||current===null||old===null?{delta:null,percent:null}:{delta:current-old,percent:old>0?Math.round((current-old)/old*10000)/100:null};}
  response.reply=prefix+'\n'+brief+'\n'+(beforeRows.length?`Kỳ đối chiếu ${priorPeriod.label}: cước gốc (chưa VAT) ${show(before.revenue)}, cước sau trừ 17% ${show(before.revenue_after_deduction)}, chi phí công ty ${show(before.recorded_cost)}, chênh lệch tạm tính sau trừ 17% (chưa trừ lương) ${show(before.margin_after_deduction_17)}.`:`Kỳ đối chiếu ${priorPeriod.label} chưa có dữ liệu; không tính phần trăm tăng giảm.`);
  if(beforeRows.length)for(const[key,label]of [['revenue','Cước gốc (chưa VAT)'],['revenue_after_deduction','Cước sau trừ 17%'],['recorded_cost','Chi phí công ty'],['margin_after_deduction_17','Chênh lệch tạm tính sau trừ 17% (chưa trừ lương)']]){const change=response.comparison.changes[key];if(change.delta!==null)response.reply+=`\n${label} ${change.delta===0?'không đổi':(change.delta>0?'tăng ':'giảm ')+money(Math.abs(change.delta))}${change.percent===null?' (không tính tỷ lệ %)':` (${Math.abs(change.percent)}%)`}.`;}
  response.sources=[link('Xem kỳ hiện tại','trips',state.entity?.value,period),link('Xem kỳ đối chiếu','trips',state.entity?.value,priorPeriod)];
 }else if(['receivables','payables'].includes(intent)){
  const payable=intent==='payables',key=payable?'subcontractor_name':'customer_name';
  const names=unique(rows.filter(r=>!payable||r.is_subcontractor).map(r=>r[key]));
  const debtRows=names.map(name=>{const rs=rows.filter(r=>r[key]===name),m=metricsFor(rs,data.groups,data.rows);return {name,trips:rs.length,amount:payable?m.payable:m.revenue,amount_with_vat:payable?m.payable:m.revenue_with_vat,paid:payable?total(rs,'sub_paid_amount'):m.received,offset:payable?0:m.offset,due:payable?m.payable_due:m.receivable_due,phoi_due:payable?0:m.phoi_due,combined_due:payable?m.payable_due:m.combined_receivable_due};}).sort((a,b)=>(b.combined_due-a.combined_due)||(b.due-a.due));
  response.items=debtRows.filter(r=>r.combined_due>0||r.due>0).slice(0,10);response.notes.push('Công nợ của cuốc phát sinh trong kỳ, theo tình trạng thanh toán hiện tại; chưa phải số dư lịch sử tại ngày chốt.');
  response.reply=prefix+'\n'+(payable?`Phải trả nhà xe ${show(metrics.payable)}; còn phải trả ${show(metrics.payable_due)}.`:`Cước gốc (chưa VAT) ${show(metrics.revenue)} · Cước có VAT ${show(metrics.revenue_with_vat)}; đã thu ${show(metrics.received)}; đối trừ ${show(metrics.offset)}; còn phải thu cước (có VAT) ${show(metrics.receivable_due)} · Tiền phơi trả hộ ${show(metrics.phoi_advance)}, còn chưa hoàn ${show(metrics.phoi_due)} · Tổng phải thu khách ${show(metrics.combined_receivable_due)}.`)+(response.items.length?'\n'+response.items.map(r=>`${r.name}: còn nợ cước ${money(r.due)}${r.phoi_due>0?` + nợ phơi ${money(r.phoi_due)}`:''} (${r.trips} cuốc).`).join('\n'):'\nKhông có khoản còn nợ được ghi nhận trong phạm vi này.');
  response.sources=response.items.length?response.items.map(r=>link(r.name,payable?'payables':'customer',r.name,period)):[link('Đối chiếu chi tiết',payable?'payables':'customer',state.entity?.value,period)];
 }else if(intent==='losses'){
  const losses=rows.filter(r=>{const m17=rowMarginAfter17(r);return typeof m17==='number'&&m17<0;}).sort((a,b)=>rowMarginAfter17(a)-rowMarginAfter17(b));
  const ids=new Set(rows.map(r=>r.id));const lossGroups=data.groups.filter(g=>g.trips.every(id=>ids.has(id))&&(typeof g.group_margin_after_deduction==='number'?g.group_margin_after_deduction<0:(typeof g.group_margin==='number'&&g.group_margin<0)));
  response.items=losses.slice(0,10).map(r=>({id:r.id,date:r.trip_date,customer:r.customer_name,profit:rowMarginAfter17(r),margin_after_deduction_17:rowMarginAfter17(r),profit_before_deduction:rowProfitBeforeDeduction(r),incomplete_fuel:isRowFuelMissing(r)}));response.metrics.loss_trips=losses.length;response.metrics.loss_groups=lossGroups.length;
  response.reply=prefix+`\nCó ${losses.length} cuốc đủ cơ sở đang có chênh lệch tạm tính sau trừ 17% (chưa trừ lương) âm và ${lossGroups.length} nhóm có chênh lệch âm.`+(losses.length?'\n'+response.items.map(r=>`${r.id} · ${r.customer}: chênh lệch sau trừ 17% ${money(r.profit)}${r.incomplete_fuel?' (chưa đủ giá dầu)':''} (Đối chiếu trước trừ 17%: ${show(r.profit_before_deduction)}).`).join('\n'):'\nKhông tự coi cuốc chưa phân bổ chi phí hoặc thiếu cơ sở là có lãi hoặc không lỗ.');
  response.sources=[...losses.slice(0,8).map(r=>link(r.id,'trip',r.id,period)),...lossGroups.slice(0,3).map(g=>link(g.group_key,'group',g.group_key,period))];
 }else if(['vehicles','drivers'].includes(intent)){
  const driver=intent==='drivers',key=driver?'driver_name':'vehicle_plate';
  const validRows=rows.filter(r=>!r.is_subcontractor&&(!driver||knownDriver(r.driver_name)));
  const names=unique(validRows.map(r=>r[key]));
  const ranking=names.map(name=>{const own=validRows.filter(r=>r[key]===name),m=metricsFor(own,data.groups,data.rows);return {name,trips:own.length,revenue:m.revenue,revenue_after_deduction:m.revenue_after_deduction,recorded_cost:m.recorded_cost,fuel_cost:m.fuel_cost,profit:m.margin_after_deduction_17,margin_after_deduction_17:m.margin_after_deduction_17,profit_before_deduction:m.profit_before_deduction,missing_fuel_price_trips:m.missing_fuel_price_trips,incomplete_cost:m.incomplete_cost};});
  const metric=state.metric,asc=/it nhat|lai thap|thap nhat/.test(normalize(message));
  const available=ranking.filter(r=>r[metric]!==null).sort((a,b)=>(asc?1:-1)*(a[metric]-b[metric])||a.name.localeCompare(b.name,'vi'));
  response.items=available.slice(0,10);response.metrics.unconfirmed_driver_trips=driver?rows.filter(r=>!r.is_subcontractor&&!knownDriver(r.driver_name)).length:0;
  response.reply=prefix+'\n'+(available.length?`Xếp theo ${metric==='trips'?'số cuốc':metric==='profit'?'chênh lệch tạm tính sau trừ 17% (chưa trừ lương)':'cước gốc (chưa VAT)'}${asc?' từ thấp lên cao':''}:\n`+response.items.map((r,i)=>`${i+1}. ${r.name}: ${r.trips} cuốc, cước gốc ${show(r.revenue)}, cước sau trừ 17% ${show(r.revenue_after_deduction)}, chi phí công ty ${show(r.recorded_cost)} (tiền dầu ${show(r.fuel_cost)}), chênh lệch sau trừ 17% (chưa trừ lương) ${show(r.margin_after_deduction_17)}${r.missing_fuel_price_trips>0?` [chưa đủ giá dầu ${r.missing_fuel_price_trips} cuốc — chưa hoàn chỉnh]`:''}.`).join('\n'):`Chưa đủ dữ liệu ${driver?'tài xế được xác nhận':'xe'} để xếp hạng theo chỉ tiêu này.`);
  if(driver&&response.metrics.unconfirmed_driver_trips)response.notes.push(`${response.metrics.unconfirmed_driver_trips} cuốc xe công ty chưa xác nhận tài xế; không dùng dữ liệu mẫu để gán lịch sử.`);
  response.notes.push('Số cuốc ít không chứng minh xe đang rảnh hoặc tài xế làm việc kém.');response.sources=response.items.map(r=>link(r.name,'trips',r.name,period,{kind:driver?'driver':'vehicle',value:r.name}));
 }else{
  response.reply=prefix+'\n'+brief;
  const lossCount=rows.filter(r=>{const m17=rowMarginAfter17(r);return typeof m17==='number'&&m17<0;}).length;
  if(intent==='briefing')response.reply+=`\nĐã thu ${show(metrics.received)}, đối trừ ${show(metrics.offset)}, còn phải thu cước (có VAT) ${show(metrics.receivable_due)} (tiền phơi chưa hoàn ${show(metrics.phoi_due)}); còn phải trả nhà xe ${show(metrics.payable_due)}.\nDầu cấp ${new Intl.NumberFormat('vi-VN').format(metrics.fuel_liters)} lít (tiền dầu đã quy đổi ${show(metrics.fuel_cost)}${metrics.missing_fuel_price_trips>0?`, còn ${metrics.missing_fuel_price_trips} cuốc chưa nhập giá dầu`:''}).\nCần chú ý: ${metrics.unallocated_groups} nhóm chưa phân bổ chi phí; ${lossCount} cuốc đủ cơ sở có chênh lệch sau trừ 17% âm.`;
  if(intent==='trip'&&rows.length===1){const r=rows[0];const m17=rowMarginAfter17(r);const fuelWarn=isRowFuelMissing(r)?` [chưa đủ giá dầu ngày ${r.trip_date} cho ${number(r.dau_liters??r.fuel_liters)}L — chưa hoàn chỉnh]`:r.allocation_status==='UNALLOCATED'?' [nhóm chi phí gộp chưa phân bổ — chưa hoàn chỉnh]':'';response.reply=`${prefix}\n${r.id} · ${r.customer_name} · ${r.route_name}.\nCước vào gốc (chưa VAT) ${show(rowCuocGoc(r))}, VAT 8% ${show(rowVat8(r))}, cước có VAT ${show(rowCuocCoVat(r))}, khoản trừ 17% nội bộ ${show(rowKhoanTru17(r))}, cước sau trừ 17% ${show(rowCuocSauTru17(r))}, chi phí công ty ${show(rowCompanyCost(r))}, chênh lệch tạm tính sau trừ 17% (chưa trừ lương) ${show(m17)}${fuelWarn} (Đối chiếu chênh lệch trước khoản trừ 17%: ${show(rowProfitBeforeDeduction(r))}).`;}
  if(intent==='customer_trips'||intent==='vehicle')response.items=rows.slice(0,10).map(r=>({id:r.id,date:r.trip_date,customer:r.customer_name,revenue:rowCuocGoc(r),revenue_after_deduction:rowCuocSauTru17(r),profit:rowMarginAfter17(r),margin_after_deduction_17:rowMarginAfter17(r),profit_before_deduction:rowProfitBeforeDeduction(r),incomplete_fuel:isRowFuelMissing(r)}));
  response.sources=intent==='trip'&&rows.length===1?[link('Xem chi tiết cuốc','trip',rows[0].id,period)]:response.items.length?response.items.slice(0,8).map(r=>link(`${r.date} · ${r.id}`,'trip',r.id,period)):[link('Đối chiếu các cuốc','trips',state.entity?.value,period),link('Xem công nợ khách','customer',null,period)];
 }
 for(const source of response.sources)if(!source.target.entity&&state.entity)source.target.entity=state.entity;
 response.reply+='\n'+response.notes.join('\n');
 return {response,state};
}
