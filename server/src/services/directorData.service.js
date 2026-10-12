import { randomUUID, createHash } from 'node:crypto';
import { db } from '../db/database.js';
import { excelMonthService } from './excelMonthService.js';
import { createTrip, updateTrip } from './trip.service.js';

db.exec(`CREATE TABLE IF NOT EXISTS director_records(entity TEXT NOT NULL, record_id TEXT NOT NULL, value TEXT NOT NULL, PRIMARY KEY(entity,record_id));
CREATE TABLE IF NOT EXISTS director_history(id TEXT PRIMARY KEY,entity TEXT NOT NULL,record_id TEXT NOT NULL,before_value TEXT NOT NULL,after_value TEXT NOT NULL,actor TEXT NOT NULL,reason TEXT NOT NULL,created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS salary_settings(id TEXT PRIMARY KEY,driver_id TEXT NOT NULL,effective_month TEXT NOT NULL,amount INTEGER NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,UNIQUE(driver_id,effective_month));`);

const field=(key,label,type='text',required=false,options=null)=>({key,label,type,required,options});
const money=(key,label)=>field(key,label,'money');
const paymentOptions=['CHUA_TT','TUOI','X','DA_TT','DOI_TRU'];
export const entities={
 trips:{label:'Chuyến xe & công nợ',business:true,fields:[field('trip_date','Ngày chạy','date',true),field('customer_name','Khách hàng', 'text',true),field('route_name','Tuyến'),field('vehicle_plate','Biển số'),field('driver_name','Tài xế'),field('container_number','Số container'),field('container_size','Loại container'),field('is_subcontractor','Xe thuê ngoài','boolean'),field('subcontractor_name','Nhà xe ngoài'),money('cuoc_vao','Cước vào — đã gồm VAT'),money('cuoc_ra','Cước ra'),money('tien_duong','Phí cầu đường'),money('port_fee','Phí cảng / nâng hạ'),money('parking_fee','Phí bến bãi'),money('handling_fee','Bốc xếp'),money('meal_allowance','Tiền ăn / phụ cấp'),money('other_costs','Chi phí khác'),field('dau_liters','Dầu cấp (lít)','number'),field('customer_payment_status','Thanh toán khách','select',false,paymentOptions),field('subcontractor_payment_status','Thanh toán nhà xe','select',false,['CHUA_TT','DA_TT']),money('received_amount','Tiền khách đã trả'),money('offset_amount','Khoản đối trừ'),money('sub_paid_amount','Tiền đã trả nhà xe'),field('notes_r','Ghi chú')]},
 vehicles:{label:'Đầu xe',table:'vehicles',fields:[field('plate_number','Biển số','text',true),field('vehicle_type','Loại xe'),field('status','Trạng thái'),field('default_driver_id','Tài xế mặc định','ref',false,'drivers'),field('inspection_expiry','Hạn đăng kiểm','date'),field('insurance_expiry','Hạn bảo hiểm','date'),field('current_km','Số km','number'),field('last_maintenance_km','Km bảo dưỡng gần nhất','number'),field('oil_change_interval_km','Chu kỳ thay dầu (km)','number'),field('notes','Ghi chú')]},
 drivers:{label:'Tài xế',table:'drivers',fields:[field('full_name','Tên tài xế','text',true),field('area_id','Khu vực'),field('default_vehicle_id','Xe mặc định','ref',false,'vehicles'),field('license_expiry','Hạn bằng lái','date'),money('kpi_target','Mục tiêu doanh thu'),field('is_active','Đang hoạt động','boolean'),field('notes','Ghi chú')]},
 salaries:{label:'Lương cứng theo kỳ',table:'salary_settings',fields:[field('driver_id','Tài xế','ref',true,'drivers'),field('effective_month','Tháng bắt đầu áp dụng','month',true),money('amount','Lương cứng đã xác nhận')]},
 routes:{label:'Tuyến đường',table:'routes',fields:[field('route_name','Tên tuyến','text',true),field('route_code','Mã tuyến'),field('departure','Điểm đi'),field('destination','Điểm đến'),field('distance_km','Khoảng cách (km)','number'),money('default_price','Cước tham khảo'),money('default_driver_pay','Công lái tham khảo'),money('default_toll','Tiền đường tham khảo'),field('default_fuel_liters','Dầu tham khảo (lít)','number'),field('notes','Ghi chú')]},
 customers:{label:'Khách hàng',table:'customers',fields:[field('name','Tên khách','text',true),field('code','Mã khách'),field('phone','Điện thoại'),field('address','Địa chỉ'),field('tax_code','Mã số thuế'),field('notes','Ghi chú')]},
 subcontractors:{label:'Nhà xe ngoài',table:'subcontractors',fields:[field('name','Tên nhà xe','text',true),field('contact_person','Liên hệ'),field('phone','Điện thoại'),field('notes','Ghi chú')]},
 expenses:{label:'Chi phí chi tiết',table:'expenses',fields:[field('trip_id','Chuyến','ref',true,'dbtrips'),field('expense_type','Loại chi phí'),field('category','Nhóm chi phí'),money('amount','Số tiền'),field('expense_date','Ngày chi','date'),field('note','Ghi chú')]},
 advances:{label:'Tạm ứng',table:'trip_advances',fields:[field('driver_id','Tài xế','ref',true,'drivers'),field('trip_id','Chuyến','ref',true,'dbtrips'),field('advance_date','Ngày ứng','date',true),money('advance_amount','Tiền ứng'),money('settled_amount','Thực chi đã quyết toán'),field('status','Trạng thái'),field('notes','Ghi chú')]},
 incentives:{label:'Động viên & điều chỉnh lương',table:'driver_incentives',fields:[field('driver_id','Tài xế','ref',true,'drivers'),field('period_month','Kỳ lương','month',true),money('incentive_amount','Động viên'),money('base_salary_override','Lương cứng riêng kỳ này'),field('incentive_note','Ghi chú'),field('is_approved','Đã duyệt','boolean')]},
 maintenance:{label:'Bảo dưỡng',table:'maintenance_proposals',fields:[field('vehicle_id','Xe','ref',true,'vehicles'),field('title','Nội dung','text',true),field('description','Chi tiết'),field('proposal_type','Loại bảo dưỡng'),money('estimated_cost','Chi phí dự kiến'),money('actual_cost','Chi phí thực tế'),field('km_at_proposal','Km tại thời điểm','number'),field('status','Trạng thái'),field('completed_at','Ngày hoàn thành','date')]},
 containers:{label:'Container & các chặng',table:'containers',fields:[field('trip_id','Chuyến','ref',true,'dbtrips'),field('container_number','Số container'),field('container_size','Kích cỡ'),field('container_type','Loại container'),field('is_second_cont','Container thứ hai','boolean'),field('pickup_yard','Điểm lấy'),field('dropoff_yard','Điểm trả'),money('lift_on_fee','Phí nâng'),money('lift_off_fee','Phí hạ'),field('notes','Ghi chú')]}
};
const version=row=>createHash('sha256').update(JSON.stringify(row)).digest('hex');
export function ensureDirectorSchema(){return true;}
export function overlayBusiness(rows){
 const patches=new Map(db.prepare("SELECT record_id,value FROM director_records WHERE entity='trips'").all().map(r=>[r.record_id,JSON.parse(r.value)]));
 return rows.map(source=>{
  const r={...source,...(patches.get(source.id)||{})};
  r.other_costs ??= r.phat_sinh||0;
  r.phat_sinh=r.other_costs+Number(r.additional_expenses||0)+Number(r.port_fee||0)+Number(r.parking_fee||0)+Number(r.handling_fee||0)+Number(r.meal_allowance||0);
  r.customer_payment_status ||= r.is_offset?'DOI_TRU':r.is_x?'X':r.is_customer_paid?'DA_TT':'CHUA_TT';
  r.subcontractor_payment_status ||= r.phat_sinh_note?.includes('ĐÃ TT')?'DA_TT':'CHUA_TT';
  r.is_offset=r.customer_payment_status==='DOI_TRU';
  r.is_customer_paid=['TUOI','X','DA_TT'].includes(r.customer_payment_status);
  r.payment_status_p=r.is_offset?'ĐỐI TRỪ XONG':r.is_customer_paid?'ĐÃ THANH TOÁN':'CHƯA TT';
  r.payment_timing_q=r.customer_payment_status==='TUOI'?'TƯƠI':r.customer_payment_status==='X'?'X':'';
  r.received_amount ??= r.is_customer_paid?r.cuoc_vao:0;
  r.offset_amount ??= r.is_offset?r.cuoc_vao:0;
  r.sub_paid_amount ??= r.subcontractor_payment_status==='DA_TT'?r.cuoc_ra:0;
  r.direct_cost=Number(r.tien_duong||0)+Number(r.cuoc_ra||0)+r.phat_sinh;
  r.trip_profit=r.is_grouped&&r.allocation_status==='UNALLOCATED'?null:r.cuoc_vao-r.direct_cost;
  return r;
 });
}
function rowsFor(entity){const c=entities[entity];if(!c)throw Error('Danh mục không hợp lệ');return c.business?excelMonthService.getData().rows:db.prepare(`SELECT * FROM ${c.table} ORDER BY rowid DESC LIMIT 3000`).all();}
export function listEntity(entity){return rowsFor(entity).map(r=>({...r,_version:version(r)}));}
export function metadata(){return {entities:Object.entries(entities).map(([key,value])=>({key,label:value.label,fields:value.fields})),references:{drivers:db.prepare('SELECT id,full_name as label FROM drivers').all(),vehicles:db.prepare('SELECT id,plate_number as label FROM vehicles').all(),dbtrips:db.prepare('SELECT id,trip_code as label FROM trips').all()},read_only:process.env.RENDER_READ_ONLY==='true'};}
function validate(config,value){
 const clean={};
 for(const f of config.fields){if(!(f.key in value))continue;let v=value[f.key];
  if(f.required&&(v===null||v===undefined||String(v).trim()===''))throw Error('Cần nhập '+f.label);
  if(['money','number'].includes(f.type)){if(v===''||v===null){clean[f.key]=f.key==='base_salary_override'?null:0;continue;}v=Number(String(v).replace(/[,\s]/g,''));if(!Number.isFinite(v)||v<0||v>1e14||(f.type==='money'&&!Number.isInteger(v)))throw Error(f.label+' phải là số không âm hợp lệ');}
  else if(f.type==='boolean')v=v?1:0;
  else {v=v===null?null:String(v).trim();if(v?.length>4000)throw Error(f.label+' quá dài');if(f.type==='date'&&v&&(!/^\d{4}-\d{2}-\d{2}$/.test(v)||Number.isNaN(Date.parse(v))))throw Error('Ngày không hợp lệ');if(f.type==='month'&&v&&!/^\d{4}-(0[1-9]|1[0-2])$/.test(v))throw Error('Kỳ lương không hợp lệ');if(f.type==='select'&&!f.options.includes(v))throw Error(f.label+' không hợp lệ');if(f.type==='ref'&&v){const table=f.options==='dbtrips'?'trips':entities[f.options]?.table;if(!db.prepare(`SELECT id FROM ${table} WHERE id=?`).get(v))throw Error(f.label+' không tồn tại');}if(f.type==='ref'&&!v)v=null;}
  clean[f.key]=v;
 }
 return clean;
}
export function saveEntity(entity,id,values,expectedVersion,user,reason=''){
 const c=entities[entity];if(!c)throw Error('Danh mục không hợp lệ');
 const old=id?rowsFor(entity).find(r=>r.id===id):null;
 if(id&&!old)throw Error('Không tìm thấy dữ liệu');
 if(old&&version(old)!==expectedVersion){const e=Error('Dữ liệu đã được sửa ở nơi khác. Tải lại trước khi sửa tiếp.');e.status=409;throw e;}
 const clean=validate(c,{...(old||{}),...values});const now=new Date().toISOString();
 db.transaction(()=>{
  if(c.business){
   if(!old){const created=createTrip({tripData:{trip_date:clean.trip_date,customer_name:clean.customer_name,route_name:clean.route_name,vehicle_plate:clean.vehicle_plate,driver_name:clean.driver_name,container_number:clean.container_number,container_size:clean.container_size,trip_revenue:clean.cuoc_vao,subcontractor_cost:clean.cuoc_ra,is_subcontractor:clean.is_subcontractor,subcontractor_name:clean.subcontractor_name,toll_fee:clean.tien_duong,port_fee:clean.port_fee,parking_fee:clean.parking_fee,handling_fee:clean.handling_fee,meal_allowance:clean.meal_allowance,other_costs:clean.other_costs,fuel_liters:clean.dau_liters,customer_payment_status:clean.customer_payment_status,subcontractor_payment_status:clean.subcontractor_payment_status,source_type:'MANUAL',notes:clean.notes_r},user});id=created.id;}
   if(Number(clean.received_amount||0)+Number(clean.offset_amount||0)>clean.cuoc_vao)throw Error('Tiền thu và đối trừ vượt cước vào');
   if(Number(clean.sub_paid_amount||0)>clean.cuoc_ra)throw Error('Tiền trả nhà xe vượt cước ra');
   const dbTrip=db.prepare('SELECT * FROM trips WHERE id=?').get(id);
   if(dbTrip)updateTrip({tripId:id,updateData:{trip_date:clean.trip_date,customer_name:clean.customer_name,route_name:clean.route_name,vehicle_plate:clean.vehicle_plate,driver_name:clean.driver_name,total_revenue:clean.cuoc_vao,trip_revenue:clean.cuoc_vao,subcontractor_cost:clean.cuoc_ra,toll_fee:clean.tien_duong,port_fee:clean.port_fee,parking_fee:clean.parking_fee,handling_fee:clean.handling_fee,meal_allowance:clean.meal_allowance,other_costs:clean.other_costs,fuel_liters:clean.dau_liters,customer_payment_status:clean.customer_payment_status,subcontractor_payment_status:clean.subcontractor_payment_status,notes:clean.notes_r},user,reason});
   db.prepare('INSERT INTO director_records(entity,record_id,value) VALUES(?,?,?) ON CONFLICT(entity,record_id) DO UPDATE SET value=excluded.value').run(entity,id,JSON.stringify(clean));
  }else{
   if(entity==='advances'){clean.balance_amount=Number(clean.advance_amount||0)-Number(clean.settled_amount||0);}
   const columns=new Set(db.prepare(`PRAGMA table_info(${c.table})`).all().map(r=>r.name));
   for(const key of Object.keys(clean))if(!columns.has(key))delete clean[key];
   if(old){if(columns.has('updated_at'))clean.updated_at=now;const keys=Object.keys(clean);db.prepare(`UPDATE ${c.table} SET ${keys.map(k=>`${k}=?`).join(',')} WHERE id=?`).run(...keys.map(k=>clean[k]),id);}
   else {id=randomUUID();const data={...clean,id};if(columns.has('created_at'))data.created_at=now;if(columns.has('updated_at'))data.updated_at=now;if(columns.has('proposed_by'))data.proposed_by=user.username;if(columns.has('created_by'))data.created_by=user.username;const keys=Object.keys(data);db.prepare(`INSERT INTO ${c.table}(${keys.join(',')}) VALUES(${keys.map(()=>'?').join(',')})`).run(...keys.map(k=>data[k]));}
  }
  if(entity==='expenses' && old?.source_component){
    if(clean.trip_id!==old.trip_id)throw Error('Chi phí thành phần không được chuyển sang cuốc khác; sửa tại cuốc gốc.');
    const component=old.source_component;
    const allowed=['toll_fee','port_fee','parking_fee','handling_fee','meal_allowance','subcontractor_cost','other_costs'];
    if(allowed.includes(component)){
      const total=db.prepare('SELECT COALESCE(SUM(amount),0) AS total FROM expenses WHERE trip_id=? AND source_component=?').get(old.trip_id,component).total;
      db.prepare(`UPDATE trips SET ${component}=?,updated_at=? WHERE id=?`).run(total,now,old.trip_id);
      const overlay=db.prepare("SELECT value FROM director_records WHERE entity='trips' AND record_id=?").get(old.trip_id);
      if(overlay){const patch=JSON.parse(overlay.value);patch[({toll_fee:'tien_duong',subcontractor_cost:'cuoc_ra'})[component]||component]=total;db.prepare("UPDATE director_records SET value=? WHERE entity='trips' AND record_id=?").run(JSON.stringify(patch),old.trip_id);}
    }
  }
  const after=rowsFor(entity).find(r=>r.id===id);
  db.prepare('INSERT INTO director_history VALUES(?,?,?,?,?,?,?,?)').run(randomUUID(),entity,id,JSON.stringify(old),JSON.stringify(after),user.username,reason||'Chỉnh sửa dữ liệu',now);
 })();
 return listEntity(entity).find(r=>r.id===id);
}
export function history(){return db.prepare('SELECT * FROM director_history ORDER BY created_at DESC LIMIT 100').all();}
export function undoChange(historyId,user){const h=db.prepare('SELECT * FROM director_history WHERE id=?').get(historyId);if(!h)throw Error('Không tìm thấy lịch sử');const before=JSON.parse(h.before_value),after=JSON.parse(h.after_value);if(!before)throw Error('Bản ghi mới cần xử lý riêng, không tự xóa dữ liệu liên quan');const restored=Object.fromEntries(entities[h.entity].fields.map(f=>[f.key,before[f.key]??(['money','number','boolean'].includes(f.type)?0:f.type==='select'?f.options[0]:null)]));return saveEntity(h.entity,h.record_id,restored,version(after),user,'Hoàn tác '+historyId);}
