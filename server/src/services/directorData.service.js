import { randomUUID, createHash } from 'node:crypto';
import { db } from '../db/database.js';
import { excelMonthService } from './excelMonthService.js';
import { createTrip, updateTrip } from './trip.service.js';
import { legacyDemoIds } from './demoData.service.js';
import { calculateFareBreakdown, calculateFuelCost, calculateTripFinancials, normalizeContainerType, toIntVnd } from '../utils/tripFinancials.js';
import { getFuelPriceMap } from './fuelPrice.service.js';
import { getAdvancesForTripMap, summarizeTripAdvances } from './eirAdvance.service.js';

db.exec(`CREATE TABLE IF NOT EXISTS director_records(entity TEXT NOT NULL, record_id TEXT NOT NULL, value TEXT NOT NULL, PRIMARY KEY(entity,record_id));
CREATE TABLE IF NOT EXISTS director_history(id TEXT PRIMARY KEY,entity TEXT NOT NULL,record_id TEXT NOT NULL,before_value TEXT NOT NULL,after_value TEXT NOT NULL,actor TEXT NOT NULL,reason TEXT NOT NULL,created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS salary_settings(id TEXT PRIMARY KEY,driver_id TEXT NOT NULL,effective_month TEXT NOT NULL,amount INTEGER NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,UNIQUE(driver_id,effective_month));`);

const field=(key,label,type='text',required=false,options=null)=>({key,label,type,required,options});
const money=(key,label)=>field(key,label,'money');
const paymentOptions=['CHUA_TT','TUOI','X','DA_TT','DOI_TRU'];
export const entities={
 trips:{label:'Chuyến xe & công nợ',business:true,fields:[field('trip_date','Ngày chạy','date',true),field('customer_name','Khách hàng', 'text',true),field('route_name','Tuyến'),field('vehicle_plate','Biển số'),field('driver_name','Tài xế'),field('container_number','Số container'),field('container_size','Loại container'),field('is_subcontractor','Xe thuê ngoài','boolean'),field('subcontractor_name','Nhà xe ngoài'),money('cuoc_goc','Cước vào gốc — chưa VAT'),money('cuoc_vao','Cước vào — chưa VAT (nguồn)'),field('lift_on_location','Nơi nâng'),money('lift_on_fee','Phí nâng'),field('lift_off_location','Nơi hạ'),money('lift_off_fee','Phí hạ'),money('cuoc_ra','Cước ra'),money('tien_duong','Phí cầu đường'),money('port_fee','Phí cảng gộp cũ (chưa tách)'),money('parking_fee','Phí bến bãi'),money('handling_fee','Bốc xếp'),money('meal_allowance','Tiền ăn / phụ cấp'),money('other_costs','Chi phí khác'),field('dau_liters','Dầu cấp (lít)','number'),field('customer_payment_status','Thanh toán khách','select',false,paymentOptions),field('subcontractor_payment_status','Thanh toán nhà xe','select',false,['CHUA_TT','DA_TT']),money('received_amount','Tiền khách đã trả'),money('offset_amount','Khoản đối trừ'),money('sub_paid_amount','Tiền đã trả nhà xe'),field('payment_terms','Điều khoản công nợ (VD: CN 30 NGÀY)'),field('notes_r','Ghi chú')]},
 vehicles:{label:'Đầu xe',table:'vehicles',fields:[field('plate_number','Biển số','text',true),field('vehicle_type','Loại xe'),field('status','Trạng thái'),field('default_driver_id','Tài xế mặc định','ref',false,'drivers'),field('inspection_expiry','Hạn đăng kiểm','date'),field('insurance_expiry','Hạn bảo hiểm','date'),field('current_km','Số km','number'),field('last_maintenance_km','Km bảo dưỡng gần nhất','number'),field('oil_change_interval_km','Chu kỳ thay dầu (km)','number'),field('notes','Ghi chú')]},
 drivers:{label:'Tài xế',table:'drivers',fields:[field('full_name','Tên tài xế','text',true),field('area_id','Khu vực'),field('default_vehicle_id','Xe mặc định','ref',false,'vehicles'),field('license_expiry','Hạn bằng lái','date'),money('kpi_target','Mục tiêu doanh thu'),field('is_active','Đang hoạt động','boolean'),field('notes','Ghi chú')]},
 salaries:{label:'Lương cứng theo kỳ',table:'salary_settings',fields:[field('driver_id','Tài xế','ref',true,'drivers'),field('effective_month','Tháng bắt đầu áp dụng','month',true),money('amount','Lương cứng đã xác nhận')]},
 routes:{label:'Tuyến đường',table:'routes',fields:[field('route_name','Tên tuyến','text',true),field('route_code','Mã tuyến'),field('departure','Điểm đi'),field('destination','Điểm đến'),field('distance_km','Khoảng cách (km)','number'),money('default_price','Cước tham khảo'),money('default_driver_pay','Công lái tham khảo'),money('default_toll','Tiền đường tham khảo'),field('default_fuel_liters','Dầu tham khảo (lít)','number'),field('notes','Ghi chú')]},
 customers:{label:'Khách hàng',table:'customers',fields:[field('name','Tên khách','text',true),field('code','Mã khách'),field('phone','Điện thoại'),field('address','Địa chỉ'),field('tax_code','Mã số thuế'),field('notes','Ghi chú')]},
 ports:{label:'Địa điểm nâng / hạ & cảng',table:'ports',fields:[field('name','Tên cảng / địa điểm','text',true),field('code','Mã địa điểm'),field('port_type','Loại (PORT/ICD/DEPOT)'),field('address','Địa chỉ'),field('notes','Ghi chú')]},
 subcontractors:{label:'Nhà xe ngoài',table:'subcontractors',fields:[field('name','Tên nhà xe','text',true),field('contact_person','Liên hệ'),field('phone','Điện thoại'),field('notes','Ghi chú')]},
 expenses:{label:'Chi phí chi tiết',table:'expenses',fields:[field('trip_id','Chuyến','ref',true,'dbtrips'),field('expense_type','Loại chi phí'),field('category','Nhóm chi phí'),money('amount','Số tiền'),field('expense_date','Ngày chi','date'),field('note','Ghi chú')]},
 advances:{label:'Tạm ứng',table:'trip_advances',fields:[field('driver_id','Tài xế','ref',true,'drivers'),field('trip_id','Chuyến','ref',true,'dbtrips'),field('advance_date','Ngày ứng','date',true),money('advance_amount','Tiền ứng'),money('settled_amount','Thực chi đã quyết toán'),field('status','Trạng thái'),field('notes','Ghi chú')]},
 incentives:{label:'Động viên & điều chỉnh lương',table:'driver_incentives',fields:[field('driver_id','Tài xế','ref',true,'drivers'),field('period_month','Kỳ lương','month',true),money('incentive_amount','Động viên'),money('base_salary_override','Lương cứng riêng kỳ này'),field('incentive_note','Ghi chú'),field('is_approved','Đã duyệt','boolean')]},
 maintenance:{label:'Bảo dưỡng',table:'maintenance_proposals',fields:[field('vehicle_id','Xe','ref',true,'vehicles'),field('title','Nội dung','text',true),field('description','Chi tiết'),field('proposal_type','Loại bảo dưỡng'),money('estimated_cost','Chi phí dự kiến'),money('actual_cost','Chi phí thực tế'),field('km_at_proposal','Km tại thời điểm','number'),field('status','Trạng thái'),field('completed_at','Ngày hoàn thành','date')]},
 legacy_trips:{label:'Chuyến mẫu đội xe — riêng báo cáo tài chính',table:'trips',legacy:true,fields:[field('trip_date','Ngày chạy','date',true),field('customer_name','Khách','text',true),field('vehicle_id','Xe','ref',false,'vehicles'),field('driver_id','Tài xế','ref',false,'drivers'),field('route_name','Tuyến'),money('trip_revenue','Cước vào'),money('driver_salary','Lương chuyến'),money('subcontractor_cost','Cước ra'),field('status','Trạng thái'),field('notes','Ghi chú')]},
 containers:{label:'Container & các chặng',table:'containers',fields:[field('trip_id','Chuyến','ref',true,'dbtrips'),field('container_number','Số container'),field('container_size','Kích cỡ'),field('container_type','Loại container'),field('is_second_cont','Container thứ hai','boolean'),field('pickup_yard','Điểm lấy'),field('dropoff_yard','Điểm trả'),money('lift_on_fee','Phí nâng'),money('lift_off_fee','Phí hạ'),field('notes','Ghi chú')]}
};
const version=row=>createHash('sha256').update(JSON.stringify(row)).digest('hex');
export function ensureDirectorSchema(){return true;}

export function overlayBusiness(rows){
 const patches=new Map(db.prepare("SELECT record_id,value FROM director_records WHERE entity='trips'").all().map(r=>[r.record_id,JSON.parse(r.value)]));
 const fuelMap=getFuelPriceMap();
 const advancesByTrip=getAdvancesForTripMap();

 return rows.map(source=>{
  const patch=patches.get(source.id)||{};
  const r={...source,...patch};

  // 1. Cước vào gốc là chưa VAT (+8% VAT, -17% nội bộ)
  const rawBaseFare = patch.cuoc_goc !== undefined
    ? patch.cuoc_goc
    : patch.cuoc_vao !== undefined
    ? patch.cuoc_vao
    : (source.cuoc_goc ?? source.base_revenue ?? source.cuoc_vao ?? 0);

  const fare = calculateFareBreakdown(rawBaseFare);
  r.cuoc_goc = fare.cuoc_goc;
  r.base_revenue = fare.cuoc_goc;
  // Giữ cuoc_vao bằng cước gốc chưa VAT để không nhân đôi VAT khi lưu lại, và cung cấp đầy đủ cuoc_co_vat, vat_amount, khoan_tru_17, cuoc_sau_tru_17
  r.cuoc_vao = fare.cuoc_goc;
  r.vat_amount = fare.vat_amount;
  r.vat_8 = fare.vat_amount;
  r.cuoc_co_vat = fare.cuoc_co_vat;
  r.total_revenue_with_vat = fare.cuoc_co_vat;
  r.khoan_tru_17 = fare.khoan_tru_17;
  r.deduction_amount = fare.khoan_tru_17;
  r.cuoc_sau_tru_17 = fare.cuoc_sau_tru_17;
  r.revenue_after_deduction = fare.cuoc_sau_tru_17;

  // 2. Loại container chuẩn hóa (bảo toàn 40FR, 40RF, 45, 20DC, 40DC, 40HC, và 15H00267 ở G71:G72)
  const contNorm = normalizeContainerType(r.container_type_raw || r.raw_G || r.raw_H || r.container_type || r.container_size, r.container_size);
  r.container_code = contNorm.container_code || r.container_size || '40';
  r.container_type_raw = contNorm.raw_container_type || r.container_code;
  r.container_needs_classification = contNorm.needs_classification;

  // 3. Tách Nâng & Hạ (4 trường độc lập) + chống cộng trùng port_fee cũ
  r.lift_on_location = r.lift_on_location ?? r.pickup_location ?? null;
  r.pickup_location = r.lift_on_location;
  r.lift_off_location = r.lift_off_location ?? r.dropoff_location ?? null;
  r.dropoff_location = r.lift_off_location;
  r.lift_on_fee = toIntVnd(r.lift_on_fee ?? r.phi_nang ?? 0);
  r.phi_nang = r.lift_on_fee;
  r.lift_off_fee = toIntVnd(r.lift_off_fee ?? r.phi_ha ?? 0);
  r.phi_ha = r.lift_off_fee;

  const hasSplitLift = r.lift_on_fee > 0 || r.lift_off_fee > 0;
  r.port_fee = hasSplitLift ? 0 : toIntVnd(r.port_fee || 0);
  r.has_unclassified_port_fee = !hasSplitLift && r.port_fee > 0;

  // 4. Dầu cấp theo lít & Tiền dầu theo đơn giá đúng ngày chạy (trip_date)
  const dailyPrice = fuelMap.has(String(r.trip_date || '').slice(0, 10))
    ? fuelMap.get(String(r.trip_date || '').slice(0, 10))
    : null;
  const fuelCalc = calculateFuelCost(r.dau_liters, dailyPrice);
  r.fuel_unit_price = fuelCalc.fuel_unit_price;
  r.tien_dau = fuelCalc.fuel_cost;
  r.fuel_cost = fuelCalc.fuel_cost;
  r.is_fuel_price_missing = fuelCalc.is_fuel_price_missing;
  r.fuel_status_label = fuelCalc.fuel_status_label;

  // 5. Chi phí công ty & Kết quả chuyến
  r.other_costs ??= r.phat_sinh || 0;
  // Chi phí phát sinh / phụ phí ngoài nâng hạ & dầu
  r.phat_sinh = toIntVnd(r.other_costs) + toIntVnd(r.additional_expenses) + r.port_fee + toIntVnd(r.parking_fee) + toIntVnd(r.handling_fee) + toIntVnd(r.meal_allowance);

  const isUnallocGroup = Boolean(r.is_grouped && r.allocation_status === 'UNALLOCATED');
  const fin = calculateTripFinancials({
    baseFare: r.cuoc_goc,
    subcontractorCost: r.cuoc_ra,
    tollFee: r.tien_duong,
    liftOnFee: r.lift_on_fee,
    liftOffFee: r.lift_off_fee,
    legacyPortFee: r.port_fee,
    fuelLiters: r.dau_liters,
    fuelUnitPrice: r.fuel_unit_price,
    parkingFee: r.parking_fee,
    handlingFee: r.handling_fee,
    mealAllowance: r.meal_allowance,
    otherCosts: toIntVnd(r.other_costs) + toIntVnd(r.additional_expenses),
    isUnallocatedGroup: isUnallocGroup,
  });

  // direct_cost (tương thích ngược: chi phí công ty chưa gồm dầu để khớp đối chiếu 47.940.000đ khi chưa nhập giá dầu, hoặc gồm nâng/hạ/dầu trong chi_phi_cong_ty)
  r.direct_cost_before_fuel = toIntVnd(r.tien_duong) + toIntVnd(r.cuoc_ra) + r.lift_on_fee + r.lift_off_fee + r.phat_sinh;
  r.direct_cost = r.direct_cost_before_fuel + r.tien_dau;
  r.chi_phi_cong_ty = r.direct_cost;
  r.chenh_lech_sau_tru_17 = fin.chenh_lech_sau_tru_17;
  r.chenh_lech_truoc_tru_goc = fin.chenh_lech_truoc_tru_goc;
  r.chenh_lech_truoc_tru_co_vat = fin.chenh_lech_truoc_tru_co_vat;
  r.trip_profit = isUnallocGroup ? null : (r.cuoc_goc - r.direct_cost_before_fuel);
  r.is_result_incomplete = fin.is_result_incomplete;
  r.result_note = fin.result_note;

  // 6. Thanh toán cước & Đối soát VAT lịch sử
  r.customer_payment_status ||= r.is_offset ? 'DOI_TRU' : r.is_x ? 'X' : r.is_customer_paid ? 'DA_TT' : 'CHUA_TT';
  r.subcontractor_payment_status ||= r.phat_sinh_note?.includes('ĐÃ TT') ? 'DA_TT' : 'CHUA_TT';
  r.is_offset = r.customer_payment_status === 'DOI_TRU';
  r.is_customer_paid = ['TUOI', 'X', 'DA_TT'].includes(r.customer_payment_status);
  r.payment_status_p = r.is_offset ? 'ĐỐI TRỪ XONG' : r.is_customer_paid ? 'ĐÃ THANH TOÁN' : 'CHƯA TT';
  r.payment_timing_q = r.customer_payment_status === 'TUOI' ? 'TƯƠI' : r.customer_payment_status === 'X' ? 'X' : (r.payment_terms || '');
  // Bảo toàn số tiền khách đã trả / đối trừ lịch sử (tránh tự tăng tiền đã nhận khi áp quy tắc cộng 8% VAT mới)
  r.received_amount ??= r.is_customer_paid ? r.cuoc_goc : 0;
  r.offset_amount ??= r.is_offset ? r.cuoc_goc : 0;
  r.sub_paid_amount ??= r.subcontractor_payment_status === 'DA_TT' ? r.cuoc_ra : 0;

  const settledBase = toIntVnd(r.received_amount) + toIntVnd(r.offset_amount);
  r.fare_balance_base = Math.max(0, r.cuoc_goc - settledBase);
  r.fare_balance_with_vat = Math.max(0, r.cuoc_co_vat - settledBase);
  // Nếu cuốc lịch sử đã ghi nhận ĐÃ TT/ĐỐI TRỪ đủ theo cước gốc nhưng thiếu phần VAT 8% mới -> đưa vào chênh lệch cần đối soát VAT
  r.vat_reconciliation_diff = (r.is_customer_paid || r.is_offset) && settledBase === r.cuoc_goc
    ? r.vat_amount
    : 0;

  // 7. Tiền phơi trả hộ chủ hàng (EIR Advances) — Tách biệt hoàn toàn khỏi doanh thu/chi phí cước
  const tripAdvances = advancesByTrip.get(String(r.id)) || [];
  const phoiSummary = summarizeTripAdvances(r.id, tripAdvances);
  Object.assign(r, phoiSummary);

  return r;
 });
}
function rowsFor(entity){const c=entities[entity];if(!c)throw Error('Danh mục không hợp lệ');if(c.business)return excelMonthService.getData().rows;const rows=db.prepare(`SELECT * FROM ${c.table} ORDER BY rowid DESC LIMIT 3000`).all();return c.legacy?rows.filter(r=>r.source_type==='LEGACY_TEST'||legacyDemoIds.has(r.id)):rows;}
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
 if(c.business){
   // Đồng bộ cuoc_goc và cuoc_vao (cả hai đều là cước gốc chưa VAT)
   if(values.cuoc_goc !== undefined && values.cuoc_vao === undefined) clean.cuoc_vao = clean.cuoc_goc;
   if(values.cuoc_vao !== undefined && values.cuoc_goc === undefined) clean.cuoc_goc = clean.cuoc_vao;
   const fare = calculateFareBreakdown(clean.cuoc_goc ?? clean.cuoc_vao ?? 0);
   clean.cuoc_goc = fare.cuoc_goc;
   clean.cuoc_vao = fare.cuoc_goc;

   if(values.customer_payment_status && values.customer_payment_status!==old?.customer_payment_status){
     if(values.received_amount===undefined||clean.received_amount===old?.received_amount)clean.received_amount=['TUOI','X','DA_TT'].includes(clean.customer_payment_status)?fare.cuoc_goc:0;
     if(values.offset_amount===undefined||clean.offset_amount===old?.offset_amount)clean.offset_amount=clean.customer_payment_status==='DOI_TRU'?fare.cuoc_goc:0;
   }
   if(values.subcontractor_payment_status && values.subcontractor_payment_status!==old?.subcontractor_payment_status)clean.sub_paid_amount=clean.subcontractor_payment_status==='DA_TT'?clean.cuoc_ra:0;
 }
 db.transaction(()=>{
  if(c.business){
   const fare = calculateFareBreakdown(clean.cuoc_goc ?? clean.cuoc_vao ?? 0);
   if(!old){const created=createTrip({tripData:{trip_date:clean.trip_date,customer_name:clean.customer_name,route_name:clean.route_name,vehicle_plate:clean.vehicle_plate,driver_name:clean.driver_name,container_number:clean.container_number,container_size:clean.container_size,base_revenue:fare.cuoc_goc,trip_revenue:fare.cuoc_goc,lift_on_location:clean.lift_on_location,lift_on_fee:clean.lift_on_fee,lift_off_location:clean.lift_off_location,lift_off_fee:clean.lift_off_fee,subcontractor_cost:clean.cuoc_ra,is_subcontractor:clean.is_subcontractor,subcontractor_name:clean.subcontractor_name,toll_fee:clean.tien_duong,port_fee:clean.port_fee,parking_fee:clean.parking_fee,handling_fee:clean.handling_fee,meal_allowance:clean.meal_allowance,other_costs:clean.other_costs,fuel_liters:clean.dau_liters,customer_payment_status:clean.customer_payment_status,subcontractor_payment_status:clean.subcontractor_payment_status,payment_terms:clean.payment_terms,source_type:'MANUAL',notes:clean.notes_r},user});id=created.id;}
   if(Number(clean.received_amount||0)+Number(clean.offset_amount||0)>fare.cuoc_co_vat)throw Error('Tiền thu và đối trừ vượt cước vào (có VAT)');
   if(Number(clean.sub_paid_amount||0)>clean.cuoc_ra)throw Error('Tiền trả nhà xe vượt cước ra');
   const dbTrip=db.prepare('SELECT * FROM trips WHERE id=?').get(id);
   if(dbTrip)updateTrip({tripId:id,updateData:{trip_date:clean.trip_date,customer_name:clean.customer_name,route_name:clean.route_name,vehicle_plate:clean.vehicle_plate,driver_name:clean.driver_name,base_revenue:fare.cuoc_goc,trip_revenue:fare.cuoc_goc,lift_on_location:clean.lift_on_location,lift_on_fee:clean.lift_on_fee,lift_off_location:clean.lift_off_location,lift_off_fee:clean.lift_off_fee,subcontractor_cost:clean.cuoc_ra,toll_fee:clean.tien_duong,port_fee:clean.port_fee,parking_fee:clean.parking_fee,handling_fee:clean.handling_fee,meal_allowance:clean.meal_allowance,other_costs:clean.other_costs,fuel_liters:clean.dau_liters,customer_payment_status:clean.customer_payment_status,subcontractor_payment_status:clean.subcontractor_payment_status,payment_terms:clean.payment_terms,notes:clean.notes_r,phoi_customer_sync_mode:values.phoi_customer_sync_mode,sync_open_advances_customer:values.sync_open_advances_customer},user,reason});
   db.prepare('INSERT INTO director_records(entity,record_id,value) VALUES(?,?,?) ON CONFLICT(entity,record_id) DO UPDATE SET value=excluded.value').run(entity,id,JSON.stringify(clean));
  }else{
   if(entity==='legacy_trips'){clean.total_revenue=clean.trip_revenue;clean.source_type='LEGACY_TEST';if(clean.driver_id)clean.driver_name=db.prepare('SELECT full_name FROM drivers WHERE id=?').get(clean.driver_id).full_name;if(clean.vehicle_id)clean.vehicle_plate=db.prepare('SELECT plate_number FROM vehicles WHERE id=?').get(clean.vehicle_id).plate_number;}
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
