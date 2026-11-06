import { randomUUID, createHash } from 'node:crypto';
import { db } from '../db/database.js';
import { excelMonthService, invalidateExcelMonthCache } from './excelMonthService.js';
import { createTrip, updateTrip } from './trip.service.js';
import { broadcastPLUpdate } from './plEngine.service.js';
import { legacyDemoIds } from './demoData.service.js';
import { calculateFareBreakdown, calculateFuelCost, calculateTripFinancials, normalizeContainerType, toIntVnd } from '../utils/tripFinancials.js';
import { getFuelPriceMap } from './fuelPrice.service.js';
import { getAdvancesForTripMap, summarizeTripAdvances } from './eirAdvance.service.js';

db.exec(`CREATE TABLE IF NOT EXISTS director_records(entity TEXT NOT NULL, record_id TEXT NOT NULL, value TEXT NOT NULL, PRIMARY KEY(entity,record_id));
CREATE TABLE IF NOT EXISTS director_history(id TEXT PRIMARY KEY,entity TEXT NOT NULL,record_id TEXT NOT NULL,before_value TEXT NOT NULL,after_value TEXT NOT NULL,actor TEXT NOT NULL,reason TEXT NOT NULL,created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS salary_settings(id TEXT PRIMARY KEY,driver_id TEXT NOT NULL,effective_month TEXT NOT NULL,amount INTEGER NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,UNIQUE(driver_id,effective_month));`);

export function ensureDirectorSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS director_records(entity TEXT NOT NULL, record_id TEXT NOT NULL, value TEXT NOT NULL, PRIMARY KEY(entity,record_id));
    CREATE TABLE IF NOT EXISTS director_history(id TEXT PRIMARY KEY,entity TEXT NOT NULL,record_id TEXT NOT NULL,before_value TEXT NOT NULL,after_value TEXT NOT NULL,actor TEXT NOT NULL,reason TEXT NOT NULL,created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS salary_settings(id TEXT PRIMARY KEY,driver_id TEXT NOT NULL,effective_month TEXT NOT NULL,amount INTEGER NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,UNIQUE(driver_id,effective_month));
  `);
  const historyCols = new Set(db.prepare("PRAGMA table_info(director_history)").all().map(r => r.name));
  if (!historyCols.has('is_undone')) db.exec("ALTER TABLE director_history ADD COLUMN is_undone INTEGER DEFAULT 0;");
  if (!historyCols.has('undone_at')) db.exec("ALTER TABLE director_history ADD COLUMN undone_at TEXT;");
  if (!historyCols.has('undone_by')) db.exec("ALTER TABLE director_history ADD COLUMN undone_by TEXT;");
  return true;
}
ensureDirectorSchema();

const field=(key,label,type='text',required=false,options=null)=>({key,label,type,required,options});
const money=(key,label)=>field(key,label,'money');
const paymentOptions=['CHUA_TT','TUOI','X','DA_TT','DOI_TRU'];
export function syncTripExpenseComponent(tripId, sourceComponent, timestamp = new Date().toISOString()) {
  if (!tripId) return;
  const dbTrip = db.prepare('SELECT id FROM trips WHERE id = ?').get(tripId);
  if (!dbTrip) return;

  const allowed = ['toll_fee', 'port_fee', 'parking_fee', 'handling_fee', 'meal_allowance', 'subcontractor_cost', 'other_costs', 'lift_on_fee', 'lift_off_fee'];
  if (sourceComponent && allowed.includes(sourceComponent)) {
    const total = db.prepare('SELECT COALESCE(SUM(amount), 0) AS total FROM expenses WHERE trip_id = ? AND source_component = ?').get(tripId, sourceComponent).total;
    db.prepare(`UPDATE trips SET ${sourceComponent} = ?, updated_at = ? WHERE id = ?`).run(total, timestamp, tripId);

    const compMap = {
      toll_fee: 'tien_duong',
      subcontractor_cost: 'cuoc_ra',
      lift_on_fee: 'lift_on_fee',
      lift_off_fee: 'lift_off_fee',
      port_fee: 'port_fee',
      parking_fee: 'parking_fee',
      handling_fee: 'handling_fee',
      meal_allowance: 'meal_allowance',
      other_costs: 'other_costs'
    };
    const overlayKey = compMap[sourceComponent] || sourceComponent;
    const overlay = db.prepare("SELECT value FROM director_records WHERE entity = 'trips' AND record_id = ?").get(tripId);
    if (overlay) {
      const patch = JSON.parse(overlay.value);
      patch[overlayKey] = total;
      if (overlayKey === 'lift_on_fee') patch.phi_nang = total;
      if (overlayKey === 'lift_off_fee') patch.phi_ha = total;
      db.prepare("UPDATE director_records SET value = ? WHERE entity = 'trips' AND record_id = ?").run(JSON.stringify(patch), tripId);
    }
  }
}

export const entities={
 trips:{label:'Chuyến xe & công nợ',business:true,fields:[field('trip_date','Ngày chạy','date',true),field('customer_name','Khách hàng', 'text',true),field('route_name','Tuyến'),field('vehicle_plate','Biển số'),field('driver_name','Tài xế'),field('container_number','Số container'),field('container_size','Loại container'),field('is_subcontractor','Xe thuê ngoài','boolean'),field('subcontractor_name','Nhà xe ngoài'),money('cuoc_goc','Cước vào gốc — chưa VAT'),money('cuoc_vao','Cước vào — chưa VAT (nguồn)'),field('lift_on_location','Nơi nâng'),money('lift_on_fee','Phí nâng'),field('lift_off_location','Nơi hạ'),money('lift_off_fee','Phí hạ'),money('cuoc_ra','Cước ra'),money('tien_duong','Phí cầu đường'),money('port_fee','Phí cảng gộp cũ (chưa tách)'),money('parking_fee','Phí bến bãi'),money('handling_fee','Bốc xếp'),money('meal_allowance','Tiền ăn / phụ cấp'),money('other_costs','Chi phí khác'),field('dau_liters','Dầu cấp (lít)','number'),field('customer_payment_status','Thanh toán khách','select',false,paymentOptions),field('subcontractor_payment_status','Thanh toán nhà xe','select',false,['CHUA_TT','DA_TT']),money('received_amount','Tiền khách đã trả'),money('offset_amount','Khoản đối trừ'),money('sub_paid_amount','Tiền đã trả nhà xe'),field('payment_terms','Điều khoản công nợ (VD: CN 30 NGÀY)'),field('notes_r','Ghi chú')]},
 vehicles:{label:'Đầu xe',table:'vehicles',fields:[field('plate_number','Biển số','text',true),field('vehicle_type','Loại xe'),field('status','Trạng thái'),field('default_driver_id','Tài xế mặc định','ref',false,'drivers'),field('inspection_expiry','Hạn đăng kiểm','date'),field('insurance_expiry','Hạn bảo hiểm','date'),field('current_km','Số km','number'),field('last_maintenance_km','Km bảo dưỡng gần nhất','number'),field('oil_change_interval_km','Chu kỳ thay dầu (km)','number'),field('notes','Ghi chú')]},
 drivers:{label:'Tài xế',table:'drivers',fields:[field('full_name','Tên tài xế','text',true),field('area_id','Khu vực'),field('default_vehicle_id','Xe mặc định','ref',false,'vehicles'),field('license_expiry','Hạn bằng lái','date'),money('kpi_target','Mục tiêu doanh thu'),field('is_active','Đang hoạt động','boolean'),field('notes','Ghi chú')]},
 salaries:{label:'Lương cứng theo kỳ',table:'salary_settings',fields:[field('driver_id','Tài xế','ref',true,'drivers'),field('effective_month','Tháng bắt đầu áp dụng','month',true),money('amount','Lương cứng đã xác nhận')]},
 routes:{label:'Tuyến đường',table:'routes',fields:[field('route_name','Tên tuyến','text',true),field('route_code','Mã tuyến'),field('departure','Điểm đi'),field('destination','Điểm đến'),field('distance_km','Khoảng cách (km)','number'),money('default_price','Cước tham khảo'),money('default_driver_pay','Công lái tham khảo'),money('default_toll','Tiền đường tham khảo'),field('default_fuel_liters','Dầu tham khảo (lít)','number'),field('notes','Ghi chú')]},
 customers:{label:'Khách hàng',table:'customers',fields:[field('name','Tên khách','text',true),field('code','Mã khách'),field('phone','Điện thoại'),field('address','Địa chỉ'),field('tax_code','Mã số thuế'),field('notes','Ghi chú')]},
 ports:{label:'Địa điểm nâng / hạ & cảng',table:'ports',fields:[field('name','Tên cảng / địa điểm','text',true),field('code','Mã địa điểm'),field('port_type','Loại (PORT/ICD/DEPOT)'),field('address','Địa chỉ'),field('notes','Ghi chú')]},
 subcontractors:{label:'Nhà xe ngoài',table:'subcontractors',fields:[field('name','Tên nhà xe','text',true),field('contact_person','Liên hệ'),field('phone','Điện thoại'),field('notes','Ghi chú')]},
 expenses:{label:'Chi phí chi tiết',table:'expenses',fields:[field('trip_id','Chuyến','ref',true,'dbtrips'),field('expense_type','Loại chi phí'),field('category','Nhóm chi phí'),money('amount','Số tiền'),field('expense_date','Ngày chi','date'),field('source_component','Thành phần chi phí chuyến'),field('note','Ghi chú')]},
 advances:{label:'Tạm ứng',table:'trip_advances',fields:[field('driver_id','Tài xế','ref',true,'drivers'),field('trip_id','Chuyến','ref',true,'dbtrips'),field('advance_date','Ngày ứng','date',true),money('advance_amount','Tiền ứng'),money('settled_amount','Thực chi đã quyết toán'),field('status','Trạng thái'),field('notes','Ghi chú')]},
 incentives:{label:'Động viên & điều chỉnh lương',table:'driver_incentives',fields:[field('driver_id','Tài xế','ref',true,'drivers'),field('period_month','Kỳ lương','month',true),money('incentive_amount','Động viên'),money('base_salary_override','Lương cứng riêng kỳ này'),field('incentive_note','Ghi chú'),field('is_approved','Đã duyệt','boolean')]},
 legacy_trips:{label:'Chuyến mẫu đội xe — riêng báo cáo tài chính',table:'trips',legacy:true,fields:[field('trip_date','Ngày chạy','date',true),field('customer_name','Khách','text',true),field('vehicle_id','Xe','ref',false,'vehicles'),field('driver_id','Tài xế','ref',false,'drivers'),field('route_name','Tuyến'),money('trip_revenue','Cước vào'),money('driver_salary','Lương chuyến'),money('subcontractor_cost','Cước ra'),field('status','Trạng thái'),field('notes','Ghi chú')]},
 containers:{label:'Container & các chặng',table:'containers',fields:[field('trip_id','Chuyến','ref',true,'dbtrips'),field('container_number','Số container'),field('container_size','Kích cỡ'),field('container_type','Loại container'),field('is_second_cont','Container thứ hai','boolean'),field('pickup_yard','Điểm lấy'),field('dropoff_yard','Điểm trả'),money('lift_on_fee','Phí nâng'),money('lift_off_fee','Phí hạ'),field('notes','Ghi chú')]},
 eir_advances:{label:'Tiền phơi trả hộ',table:'eir_advances',fields:[field('trip_id','Chuyến','ref',true,'dbtrips'),field('customer_name','Chủ hàng','text',true),money('advance_amount','Tiền phơi trả hộ'),field('advance_date','Ngày ứng','date',true),field('payment_term_type','Điều khoản hoàn tiền','select',false,['CHUA_DAT','TUOI','NGAY_CO_DINH','SO_NGAY_SAU_CHUYEN']),field('due_date','Ngày hẹn hoàn','date'),field('refund_status','Trạng thái hoàn','select',false,['CHUA_HOAN','HOAN_MOT_PHAN','DA_HOAN']),money('refunded_amount','Đã hoàn'),field('notes','Ghi chú')]}
};
const version=row=>createHash('sha256').update(JSON.stringify(row)).digest('hex');

export function overlayBusiness(rows){
 const patches=new Map(db.prepare("SELECT record_id,value FROM director_records WHERE entity='trips'").all().map(r=>[r.record_id,JSON.parse(r.value)]));
 const fuelMap=getFuelPriceMap();
 const advancesByTrip=getAdvancesForTripMap();

 return rows.map(source=>{
  const patch=patches.get(source.id)||{};
  const r={...source,...patch};
  if (patch.is_cancelled) {
    r.is_cancelled = true;
    r.cancel_reason = patch.cancel_reason;
    r.cancelled_at = patch.cancelled_at;
    r.cancelled_by = patch.cancelled_by;
  }

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
function rowsFor(entity){const c=entities[entity];if(!c)throw Error('Danh mục không hợp lệ');if(c.business)return excelMonthService.getData().rows.filter(r=>!r.is_cancelled);const rows=db.prepare(`SELECT * FROM ${c.table} ORDER BY rowid DESC LIMIT 3000`).all();return c.legacy?rows.filter(r=>r.source_type==='LEGACY_TEST'||legacyDemoIds.has(r.id)):rows;}
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
 if (entity === 'expenses' && !clean.source_component && clean.expense_type) {
   const typeToComp = {
     TOLL: 'toll_fee',
     TOLL_BOT: 'toll_fee',
     PORT_LIFT: 'port_fee',
     LIFT_ON: 'lift_on_fee',
     LIFT_OFF: 'lift_off_fee',
     PARKING: 'parking_fee',
     HANDLING: 'handling_fee',
     MEAL_ALLOWANCE: 'meal_allowance',
     SUBCONTRACTOR: 'subcontractor_cost',
     OTHER: 'other_costs'
   };
   if (typeToComp[clean.expense_type]) {
     clean.source_component = typeToComp[clean.expense_type];
   }
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
  if(entity==='expenses'){
    const targetTripId = clean.trip_id || old?.trip_id;
    const targetComponent = clean.source_component || old?.source_component;
    if(old?.source_component && clean.trip_id && clean.trip_id !== old.trip_id){
      throw Error('Chi phí thành phần không được chuyển sang cuốc khác; sửa tại cuốc gốc.');
    }
    if(targetTripId && targetComponent){
      syncTripExpenseComponent(targetTripId, targetComponent, now);
    }
    if(old?.source_component && old.source_component !== targetComponent && old.trip_id){
      syncTripExpenseComponent(old.trip_id, old.source_component, now);
    }
  }
  const after=rowsFor(entity).find(r=>r.id===id);
  db.prepare('INSERT INTO director_history (id, entity, record_id, before_value, after_value, actor, reason, created_at, is_undone) VALUES(?,?,?,?,?,?,?,?,0)').run(randomUUID(),entity,id,JSON.stringify(old),JSON.stringify(after),user.username,reason||'Chỉnh sửa dữ liệu',now);
 })();
 invalidateExcelMonthCache();
 try { broadcastPLUpdate('DIRECTOR_DATA_SAVED', `Cập nhật ${entity} [${id}]`); } catch (_) {}
 return listEntity(entity).find(r=>r.id===id);
}
export function deleteEntity(entity, id, user, reason = '', expectedVersion = null) {
  const c = entities[entity];
  if (!c) {
    const err = new Error('Danh mục không hợp lệ');
    err.status = 400;
    throw err;
  }
  if (!reason || typeof reason !== 'string' || !reason.trim() || reason.trim().length < 3) {
    const err = new Error('Bắt buộc nhập lý do xóa / hủy dữ liệu (tối thiểu 3 ký tự) để phục vụ kiểm toán.');
    err.status = 400;
    throw err;
  }
  const cleanReason = reason.trim();
  const old = rowsFor(entity).find(r => r.id === id);
  if (!old) {
    const err = new Error('Không tìm thấy dữ liệu để xóa/hủy');
    err.status = 404;
    throw err;
  }
  if (!expectedVersion || typeof expectedVersion !== 'string' || !expectedVersion.trim()) {
    const err = new Error('Bắt buộc cung cấp mã phiên bản (version) để xác thực tính toàn vẹn khi xóa/hủy bản ghi.');
    err.status = 400;
    throw err;
  }
  const cleanExpectedVersion = expectedVersion.trim();
  if (version(old) !== cleanExpectedVersion) {
    const err = new Error('Dữ liệu đã được người khác chỉnh sửa trước đó (phiên bản không khớp). Vui lòng tải lại trước khi thao tác.');
    err.status = 409;
    throw err;
  }

  const now = new Date().toISOString();
  let actionResult = 'DELETED';
  let impactMessage = 'Đã xóa bản ghi thành công';
  let fullSnapshot = null;

  db.transaction(() => {
    if (c.business && entity === 'trips') {
      // 1. Kiểm tra khóa sổ kỳ kế toán
      const tripMonth = (old.trip_date || '').slice(0, 7);
      if (tripMonth) {
        const pCols = new Set(db.prepare("PRAGMA table_info(period_locks)").all().map(r => r.name));
        const monthCol = pCols.has('period_month') ? 'period_month' : pCols.has('effective_month') ? 'effective_month' : null;
        const lockCol = pCols.has('is_locked') ? 'is_locked = 1' : pCols.has('status') ? "status = 'LOCKED'" : null;
        if (monthCol && lockCol) {
          const isLocked = db.prepare(`SELECT 1 FROM period_locks WHERE ${monthCol} = ? AND ${lockCol} LIMIT 1`).get(tripMonth);
          if (isLocked) {
            const err = new Error(`Kỳ kế toán [${tripMonth}] chứa ngày chạy của cuốc xe đã bị khóa sổ. Không thể xóa hoặc hủy.`);
            err.status = 403;
            throw err;
          }
        }
      }

      const dbTrip = db.prepare('SELECT id, source_type, is_locked FROM trips WHERE id = ?').get(id);
      if (dbTrip?.is_locked) {
        const err = new Error('Cuốc xe đã bị khóa sổ kỳ kế toán. Không thể xóa/hủy.');
        err.status = 403;
        throw err;
      }

      // 2. Kiểm tra đầy đủ các giao dịch thực tế & chi phí phát sinh trước khi cho phép xóa/hủy
      const blockingReasons = [];

      if (Number(old.received_amount || 0) > 0 || ['TUOI', 'X', 'DA_TT'].includes(old.customer_payment_status)) {
        blockingReasons.push(`tiền đã thu khách (${Number(old.received_amount || 0).toLocaleString('vi-VN')} đ / trạng thái ${old.customer_payment_status})`);
      }
      if (Number(old.offset_amount || 0) > 0 || old.customer_payment_status === 'DOI_TRU') {
        blockingReasons.push(`khoản đối trừ công nợ (${Number(old.offset_amount || 0).toLocaleString('vi-VN')} đ)`);
      }
      if (Number(old.sub_paid_amount || 0) > 0 || old.subcontractor_payment_status === 'DA_TT' || Number(old.cuoc_ra || 0) > 0) {
        blockingReasons.push(`tiền trả nhà xe / cước thuê ngoài (${Number(old.sub_paid_amount || old.cuoc_ra || 0).toLocaleString('vi-VN')} đ)`);
      }

      const dbExpenseSum = db.prepare('SELECT COALESCE(SUM(amount), 0) AS s FROM expenses WHERE trip_id = ? AND amount > 0').get(id)?.s || 0;
      const nonSubDirectCost = Math.max(0, Number(old.direct_cost || 0) - Number(old.cuoc_ra || 0));
      const tripFuelLiters = Number(old.dau_liters || 0);
      if (dbExpenseSum > 0 || nonSubDirectCost > 0 || tripFuelLiters > 0) {
        const expParts = [];
        if (Math.max(dbExpenseSum, nonSubDirectCost) > 0) expParts.push(`${Math.max(dbExpenseSum, nonSubDirectCost).toLocaleString('vi-VN')} đ`);
        if (tripFuelLiters > 0) expParts.push(`${tripFuelLiters}L dầu`);
        blockingReasons.push(`chi phí thực tế (${expParts.join(', ')})`);
      }

      const hasActiveRefund = Boolean(db.prepare(`
        SELECT 1 FROM eir_refunds r
        INNER JOIN eir_advances a ON r.advance_id = a.id
        WHERE a.trip_id = ? AND r.status = 'ACTIVE'
        LIMIT 1
      `).get(id));
      const eirAdvanceSum = db.prepare('SELECT COALESCE(SUM(advance_amount), 0) AS s FROM eir_advances WHERE trip_id = ? AND advance_amount > 0').get(id)?.s || Number(old.phoi_total_advance || 0);
      if (hasActiveRefund || eirAdvanceSum > 0) {
        blockingReasons.push(`tiền phơi trả hộ (${eirAdvanceSum.toLocaleString('vi-VN')} đ${hasActiveRefund ? ', đã có hoàn tiền' : ''})`);
      }

      const advRow = db.prepare('SELECT COALESCE(SUM(advance_amount), 0) AS adv, COALESCE(SUM(settled_amount), 0) AS setl FROM trip_advances WHERE trip_id = ? AND (advance_amount > 0 OR settled_amount > 0)').get(id);
      if (advRow && (advRow.adv > 0 || advRow.setl > 0)) {
        blockingReasons.push(`phiếu tạm ứng tài xế (${advRow.adv.toLocaleString('vi-VN')} đ)`);
      }

      if (blockingReasons.length > 0) {
        const err = new Error(
          `Tạm chặn xóa/hủy cuốc xe [${id}] vì đang có giao dịch hoặc chi phí thực tế cần xử lý trước: ${blockingReasons.join('; ')}. Vui lòng tất toán, hoàn tác hoặc điều chỉnh các khoản này về 0 trước khi xóa/hủy.`
        );
        err.status = 400;
        err.blocking_items = blockingReasons;
        throw err;
      }

      const isExcelMonth1 = String(id).startsWith('T1-2026-') || !dbTrip;

      // Cuốc chưa phát sinh giao dịch/chi phí thực tế:
      if (isExcelMonth1) {
        actionResult = 'CANCELLED';
        impactMessage = `Đã hủy cuốc xe [${id}] (chưa phát sinh giao dịch thực tế) có lưu dấu vết.`;
        db.prepare(`
          INSERT INTO director_records(entity, record_id, value)
          VALUES(?, ?, ?)
          ON CONFLICT(entity, record_id) DO UPDATE SET value = excluded.value
        `).run(entity, id, JSON.stringify({
          ...old,
          is_cancelled: 1,
          cancel_reason: cleanReason,
          cancelled_at: now,
          cancelled_by: user?.username
        }));
      } else {
        // Cuốc DB chưa có giao dịch thực tế -> xóa cứng kèm lưu bản chụp đầy đủ để khôi phục nguyên trạng
        actionResult = 'DELETED';
        impactMessage = `Đã xóa cuốc xe [${id}] (chưa phát sinh giao dịch thực tế) khỏi hệ thống thành công.`;

        const rawTrip = db.prepare('SELECT * FROM trips WHERE id = ?').get(id);
        const rawContainers = db.prepare('SELECT * FROM containers WHERE trip_id = ?').all(id);
        const rawExpenses = db.prepare('SELECT * FROM expenses WHERE trip_id = ?').all(id);
        const rawOverlay = db.prepare("SELECT value FROM director_records WHERE entity = 'trips' AND record_id = ?").get(id);

        fullSnapshot = {
          ...old,
          _raw_trip: rawTrip || null,
          _raw_containers: rawContainers || [],
          _raw_expenses: rawExpenses || [],
          _raw_overlay: rawOverlay ? rawOverlay.value : null
        };

        db.prepare('DELETE FROM eir_advances WHERE trip_id = ?').run(id);
        db.prepare('DELETE FROM expenses WHERE trip_id = ?').run(id);
        db.prepare('DELETE FROM containers WHERE trip_id = ?').run(id);
        db.prepare('DELETE FROM director_records WHERE entity = ? AND record_id = ?').run(entity, id);
        db.prepare('DELETE FROM trips WHERE id = ?').run(id);
      }
    } else {
      const table = c.table;
      if (!table) {
        const err = new Error('Không hỗ trợ xóa cho bảng này');
        err.status = 400;
        throw err;
      }

      const isCatalog = ['vehicles', 'drivers', 'customers', 'subcontractors', 'routes', 'ports'].includes(entity);
      if (isCatalog) {
        let isReferenced = false;
        if (entity === 'vehicles') isReferenced = Boolean(db.prepare('SELECT 1 FROM trips WHERE vehicle_id = ? OR vehicle_plate = ? LIMIT 1').get(id, old.plate_number));
        else if (entity === 'drivers') isReferenced = Boolean(db.prepare('SELECT 1 FROM trips WHERE driver_id = ? LIMIT 1').get(id));
        else if (entity === 'customers') isReferenced = Boolean(db.prepare('SELECT 1 FROM trips WHERE customer_id = ? OR customer_name = ? LIMIT 1').get(id, old.name));
        else if (entity === 'subcontractors') isReferenced = Boolean(db.prepare('SELECT 1 FROM trips WHERE subcontractor_id = ? OR subcontractor_name = ? LIMIT 1').get(id, old.name));
        else if (entity === 'routes') isReferenced = Boolean(db.prepare('SELECT 1 FROM trips WHERE route_id = ? OR route_name = ? LIMIT 1').get(id, old.route_name));
        else if (entity === 'ports') isReferenced = Boolean(db.prepare('SELECT 1 FROM trips WHERE lift_on_location = ? OR lift_off_location = ? LIMIT 1').get(old.name, old.name));

        if (isReferenced) {
          actionResult = 'DEACTIVATED';
          impactMessage = `Danh mục "${old.name || old.plate_number || old.full_name || id}" đã được dùng trong các chuyến xe lịch sử nên được chuyển sang trạng thái ngưng hoạt động để bảo toàn đối soát.`;
          const cols = new Set(db.prepare(`PRAGMA table_info(${table})`).all().map(r => r.name));
          if (cols.has('is_active')) {
            db.prepare(`UPDATE ${table} SET is_active = 0, updated_at = ? WHERE id = ?`).run(now, id);
          } else if (cols.has('status')) {
            db.prepare(`UPDATE ${table} SET status = 'INACTIVE', updated_at = ? WHERE id = ?`).run(now, id);
          } else {
            const err = new Error(`Danh mục "${old.name || old.plate_number || old.full_name || id}" đã được dùng trong chuyến xe và không có cột trạng thái ngưng hoạt động.`);
            err.status = 400;
            throw err;
          }
        } else {
          actionResult = 'DELETED';
          impactMessage = `Đã xóa danh mục [${id}] thành công.`;
          db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(id);
        }
      } else {
        if (entity === 'eir_advances') {
          const hasRefund = db.prepare("SELECT 1 FROM eir_refunds WHERE advance_id = ? AND status = 'ACTIVE' LIMIT 1").get(id);
          if (hasRefund) {
            const err = new Error('Khoản phơi đã có giao dịch hoàn tiền thực tế. Cần hủy giao dịch hoàn tiền trước.');
            err.status = 400;
            throw err;
          }
          db.prepare('DELETE FROM eir_advance_history WHERE advance_id = ?').run(id);
          db.prepare('DELETE FROM eir_advances WHERE id = ?').run(id);
          actionResult = 'DELETED';
          impactMessage = 'Đã xóa khoản tạm ứng phơi thành công.';
        } else if (entity === 'advances') {
          if (Number(old.settled_amount || 0) > 0 || old.status === 'SETTLED') {
            const err = new Error('Phiếu tạm ứng đã quyết toán chi phí thực tế. Không thể xóa.');
            err.status = 400;
            throw err;
          }
          db.prepare('DELETE FROM trip_advances WHERE id = ?').run(id);
          actionResult = 'DELETED';
          impactMessage = 'Đã xóa phiếu tạm ứng thành công.';
        } else if (entity === 'expenses') {
          db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(id);
          if (old.trip_id && old.source_component) {
            syncTripExpenseComponent(old.trip_id, old.source_component, now);
          }
          actionResult = 'DELETED';
          impactMessage = 'Đã xóa chi phí thành phần và cập nhật lại tổng chi phí cuốc xe.';
        } else {
          db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(id);
          actionResult = 'DELETED';
          impactMessage = 'Đã xóa bản ghi thành công.';
        }
      }
    }

    db.prepare(`
      INSERT INTO director_history (id, entity, record_id, before_value, after_value, actor, reason, created_at, is_undone)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
    `).run(
      randomUUID(),
      entity,
      id,
      JSON.stringify(fullSnapshot || old),
      JSON.stringify({ is_deleted: true, action: actionResult, reason: cleanReason, deleted_at: now }),
      user.username,
      cleanReason,
      now
    );
  })();

  invalidateExcelMonthCache();
  try { broadcastPLUpdate('DIRECTOR_DATA_DELETED', `${actionResult} ${entity} [${id}]`); } catch (_) {}
  return { success: true, id, entity, action: actionResult, message: impactMessage };
}

export function history() {
  return db.prepare('SELECT * FROM director_history ORDER BY created_at DESC LIMIT 100').all();
}

export function undoChange(historyId, user) {
  const h = db.prepare('SELECT * FROM director_history WHERE id = ?').get(historyId);
  if (!h) {
    const err = new Error('Không tìm thấy lịch sử để hoàn tác');
    err.status = 404;
    throw err;
  }
  if (h.is_undone) {
    const err = new Error('Thao tác này đã được hoàn tác trước đó.');
    err.status = 400;
    throw err;
  }

  const before = JSON.parse(h.before_value || 'null');
  const after = JSON.parse(h.after_value || 'null');
  const now = new Date().toISOString();

  let message = 'Đã hoàn tác thay đổi thành công';

  db.transaction(() => {
    // 1. Hoàn tác một thao tác XÓA / HỦY (after.is_deleted === true)
    if (after?.is_deleted) {
      if (!before) {
        throw new Error('Không có dữ liệu trước đó để khôi phục.');
      }

      if (h.entity === 'trips') {
        // Trường hợp chuyến xe: Phải giữ đúng ID ban đầu h.record_id!
        if (after.action === 'CANCELLED' || before.source_type === 'EXCEL' || String(h.record_id).startsWith('T1-2026-')) {
          // Khôi phục cuốc bị hủy: Xóa cờ hủy trong director_records
          const currentRecord = db.prepare("SELECT value FROM director_records WHERE entity = 'trips' AND record_id = ?").get(h.record_id);
          if (currentRecord) {
            const patch = JSON.parse(currentRecord.value);
            delete patch.is_cancelled;
            delete patch.cancel_reason;
            delete patch.cancelled_at;
            delete patch.cancelled_by;
            db.prepare("UPDATE director_records SET value = ? WHERE entity = 'trips' AND record_id = ?").run(JSON.stringify(patch), h.record_id);
          }
          // Khôi phục trạng thái trong trips nếu có
          const dbTrip = db.prepare('SELECT id FROM trips WHERE id = ?').get(h.record_id);
          if (dbTrip) {
            db.prepare("UPDATE trips SET status = ?, updated_at = ? WHERE id = ?").run(before.status || 'PLANNED', now, h.record_id);
          }
          message = `Đã hoàn tác hủy cuốc xe [${h.record_id}], khôi phục lại toàn bộ dữ liệu tài chính.`;
        } else {
          // Khôi phục cuốc nháp đã bị hard delete: Phục hồi lại với đúng ID gốc h.record_id!
          const existing = db.prepare('SELECT id FROM trips WHERE id = ?').get(h.record_id);
          if (existing) {
            throw new Error(`Cuốc xe [${h.record_id}] hiện đã tồn tại. Không thể khôi phục.`);
          }
          const tripCols = new Set(db.prepare("PRAGMA table_info(trips)").all().map(r => r.name));
          const rawSource = before._raw_trip || before;
          const toInsert = {};
          for (const k of Object.keys(rawSource)) {
            if (tripCols.has(k) && !k.startsWith('_')) toInsert[k] = rawSource[k];
          }
          toInsert.id = h.record_id;
          if (!toInsert.updated_at) toInsert.updated_at = now;
          const cols = Object.keys(toInsert);
          db.prepare(`INSERT INTO trips (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`).run(...cols.map(k => toInsert[k]));

          // Phục hồi container(s)
          if (Array.isArray(before._raw_containers) && before._raw_containers.length > 0) {
            const contCols = new Set(db.prepare("PRAGMA table_info(containers)").all().map(r => r.name));
            for (const cont of before._raw_containers) {
              const cData = {};
              for (const k of Object.keys(cont)) {
                if (contCols.has(k)) cData[k] = cont[k];
              }
              cData.trip_id = h.record_id;
              if (!cData.id) cData.id = randomUUID();
              const cKeys = Object.keys(cData);
              db.prepare(`INSERT INTO containers (${cKeys.join(',')}) VALUES (${cKeys.map(() => '?').join(',')})`).run(...cKeys.map(k => cData[k]));
            }
          }

          // Phục hồi chi phí nếu có
          if (Array.isArray(before._raw_expenses) && before._raw_expenses.length > 0) {
            const expCols = new Set(db.prepare("PRAGMA table_info(expenses)").all().map(r => r.name));
            for (const exp of before._raw_expenses) {
              const eData = {};
              for (const k of Object.keys(exp)) {
                if (expCols.has(k)) eData[k] = exp[k];
              }
              eData.trip_id = h.record_id;
              if (!eData.id) eData.id = randomUUID();
              const eKeys = Object.keys(eData);
              db.prepare(`INSERT INTO expenses (${eKeys.join(',')}) VALUES (${eKeys.map(() => '?').join(',')})`).run(...eKeys.map(k => eData[k]));
            }
          }

          // Phục hồi overlay director_records nếu có
          if (before._raw_overlay) {
            db.prepare("INSERT INTO director_records (entity, record_id, value) VALUES ('trips', ?, ?) ON CONFLICT(entity, record_id) DO UPDATE SET value = excluded.value").run(h.record_id, before._raw_overlay);
          }

          message = `Đã khôi phục hoàn chỉnh cuốc xe [${h.record_id}] cùng đầy đủ container và dữ liệu gốc.`;
        }
      } else {
        // Khôi phục các danh mục hoặc bản ghi bảng khác:
        const c = entities[h.entity];
        if (!c?.table) throw new Error(`Không hỗ trợ khôi phục cho thực thể ${h.entity}`);

        if (after.action === 'DEACTIVATED') {
          // Danh mục đã được chuyển sang ngưng hoạt động: khôi phục kích hoạt lại
          const cols = new Set(db.prepare(`PRAGMA table_info(${c.table})`).all().map(r => r.name));
          const updates = [];
          const params = [];
          if (cols.has('is_active')) { updates.push('is_active = ?'); params.push(before.is_active ?? 1); }
          if (cols.has('status')) { updates.push('status = ?'); params.push(before.status || 'ACTIVE'); }
          if (cols.has('updated_at')) { updates.push('updated_at = ?'); params.push(before.updated_at || now); }
          if (updates.length > 0) {
            params.push(h.record_id);
            db.prepare(`UPDATE ${c.table} SET ${updates.join(', ')} WHERE id = ?`).run(...params);
          }
          message = `Đã kích hoạt lại danh mục [${h.record_id}] thành công.`;
        } else {
          // Danh mục hoặc bản ghi bị xóa vật lý:
          // KIỂM TRA BẢN GHI HIỆN TẠI VÀ TRÁNH XUNG ĐỘT RÀNG BUỘC (Không dùng INSERT OR REPLACE!)
          const existing = db.prepare(`SELECT 1 FROM ${c.table} WHERE id = ?`).get(h.record_id);
          if (existing) {
            throw new Error(`Bản ghi [${h.record_id}] hiện đã tồn tại trong bảng ${c.table}. Không thể khôi phục đè.`);
          }
          // Kiểm tra unique collisions (ví dụ biển số xe)
          if (h.entity === 'vehicles' && before.plate_number) {
            const conflict = db.prepare('SELECT id FROM vehicles WHERE plate_number = ?').get(before.plate_number);
            if (conflict) {
              throw new Error(`Biển số xe [${before.plate_number}] hiện đã được sử dụng ở bản ghi khác (${conflict.id}). Không thể khôi phục.`);
            }
          }
          const tableCols = new Set(db.prepare(`PRAGMA table_info(${c.table})`).all().map(r => r.name));
          const toInsert = {};
          for (const k of Object.keys(before)) {
            if (tableCols.has(k) && k !== '_version') toInsert[k] = before[k];
          }
          toInsert.id = h.record_id;
          if (tableCols.has('updated_at') && !toInsert.updated_at) toInsert.updated_at = now;
          const cols = Object.keys(toInsert);
          db.prepare(`INSERT INTO ${c.table} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`).run(...cols.map(k => toInsert[k]));
          message = `Đã khôi phục bản ghi [${h.record_id}] trong danh mục ${c.label}.`;
        }
      }
    } else {
      // 2. Hoàn tác một thao tác SỬA (after.is_deleted === false / undefined)
      if (!before) throw new Error('Bản ghi mới thêm cần xử lý xóa riêng, không tự ý hoàn tác.');
      const current = rowsFor(h.entity).find(r => r.id === h.record_id);
      if (!current) throw new Error('Bản ghi hiện không còn tồn tại để hoàn tác giá trị.');
      
      // Chống đè lên thay đổi mới hơn
      if (after && version(current) !== version(after)) {
        const err = new Error('Dữ liệu đã có chỉnh sửa tiếp theo sau mốc này. Không thể hoàn tác để tránh mất dữ liệu mới.');
        err.status = 409;
        throw err;
      }

      // Khôi phục giá trị cũ
      if (entities[h.entity].business) {
        const dbTrip = db.prepare('SELECT * FROM trips WHERE id = ?').get(h.record_id);
        if (dbTrip) {
          const fare = calculateFareBreakdown(before.cuoc_goc ?? before.cuoc_vao ?? 0);
          updateTrip({
            tripId: h.record_id,
            updateData: {
              trip_date: before.trip_date,
              customer_name: before.customer_name,
              route_name: before.route_name,
              vehicle_plate: before.vehicle_plate,
              driver_name: before.driver_name,
              base_revenue: fare.cuoc_goc,
              trip_revenue: fare.cuoc_goc,
              lift_on_location: before.lift_on_location,
              lift_on_fee: before.lift_on_fee,
              lift_off_location: before.lift_off_location,
              lift_off_fee: before.lift_off_fee,
              subcontractor_cost: before.cuoc_ra,
              toll_fee: before.tien_duong,
              port_fee: before.port_fee,
              parking_fee: before.parking_fee,
              handling_fee: before.handling_fee,
              meal_allowance: before.meal_allowance,
              other_costs: before.other_costs,
              fuel_liters: before.dau_liters,
              customer_payment_status: before.customer_payment_status,
              subcontractor_payment_status: before.subcontractor_payment_status,
              payment_terms: before.payment_terms,
              notes: before.notes_r
            },
            user,
            reason: `Hoàn tác: ${h.reason || 'Chỉnh sửa dữ liệu'}`
          });
        }
        db.prepare(`
          INSERT INTO director_records(entity, record_id, value)
          VALUES(?, ?, ?)
          ON CONFLICT(entity, record_id) DO UPDATE SET value = excluded.value
        `).run(h.entity, h.record_id, JSON.stringify(before));
      } else {
        const table = entities[h.entity].table;
        const tableCols = new Set(db.prepare(`PRAGMA table_info(${table})`).all().map(r => r.name));
        const updates = [];
        const params = [];
        for (const k of Object.keys(before)) {
          if (tableCols.has(k) && k !== 'id' && k !== '_version') {
            updates.push(`${k} = ?`);
            params.push(before[k]);
          }
        }
        if (tableCols.has('updated_at') && !('updated_at' in before)) {
          updates.push('updated_at = ?');
          params.push(now);
        }
        params.push(h.record_id);
        db.prepare(`UPDATE ${table} SET ${updates.join(', ')} WHERE id = ?`).run(...params);
      }
      message = `Đã khôi phục lại giá trị trước sửa đổi cho bản ghi [${h.record_id}].`;
    }

    // Đồng bộ chi phí cuốc cha nếu hoàn tác chi phí
    if (h.entity === 'expenses') {
      const targetTripId = before?.trip_id || after?.trip_id;
      const targetComponent = before?.source_component || after?.source_component;
      if (targetTripId && targetComponent) {
        syncTripExpenseComponent(targetTripId, targetComponent, now);
      }
    }

    // Đánh dấu bản ghi lịch sử này ĐÃ HOÀN TÁC (chống bấm lặp / 1 lần duy nhất)
    db.prepare('UPDATE director_history SET is_undone = 1, undone_at = ?, undone_by = ? WHERE id = ?').run(now, user?.username || 'DIRECTOR', historyId);
  })();

  invalidateExcelMonthCache();
  try { broadcastPLUpdate('DIRECTOR_DATA_UNDONE', `Hoàn tác ${h.entity} [${h.record_id}]`); } catch (_) {}
  return { success: true, historyId, message };
}


// Bảng nghiệp vụ do db/init.js tạo sẵn: BẮT BUỘC phải tồn tại, thiếu là lỗi schema.
// Thứ tự xóa tôn trọng quan hệ khóa ngoại (bảng con trước).
export const RESET_REQUIRED_TABLES = [
  'eir_refunds', 'eir_advance_history', 'eir_advances', 'expenses', 'containers',
  'trip_advances', 'trips', 'import_batches', 'write_requests', 'driver_incentives',
  'maintenance_proposals', 'fuel_price_history', 'fuel_prices', 'drivers', 'vehicles',
  'customers', 'routes', 'subcontractors', 'ports'
];
// Bảng do dịch vụ tạo khi dùng lần đầu (CREATE TABLE IF NOT EXISTS lúc chạy): được phép chưa tồn tại.
export const RESET_OPTIONAL_TABLES = ['director_records', 'director_history', 'import_previews', 'salary_settings'];

function resetError(message, status = 500) {
  const err = new Error(message);
  err.status = status;
  return err;
}

export function resetBusinessData({ user, reason, confirmToken }) {
  if (user?.role !== 'DIRECTOR') {
    throw resetError('Chỉ tài khoản Giám đốc được làm sạch dữ liệu nghiệp vụ.', 403);
  }
  if (confirmToken !== 'CONFIRM_RESET_ALL_BUSINESS_DATA') {
    throw resetError('Mã xác nhận xóa toàn bộ dữ liệu nghiệp vụ không chính xác.', 400);
  }

  const now = new Date().toISOString();
  const actor = user?.username || 'DIRECTOR';
  const cleanReason = reason || 'Chủ dự án cho phép xóa toàn bộ dữ liệu nghiệp vụ cũ để chuẩn bị nhập Excel mới';

  const existing = new Set(
    db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((r) => r.name)
  );
  const missingRequired = RESET_REQUIRED_TABLES.filter((t) => !existing.has(t));
  if (missingRequired.length) {
    throw resetError(`Schema thiếu bảng bắt buộc: ${missingRequired.join(', ')}. Không xóa gì.`);
  }
  const optionalPresent = RESET_OPTIONAL_TABLES.filter((t) => existing.has(t));
  const optionalAbsent = RESET_OPTIONAL_TABLES.filter((t) => !existing.has(t));
  const tablesToClear = [...optionalPresent.filter((t) => ['director_records', 'director_history'].includes(t)), ...RESET_REQUIRED_TABLES, ...optionalPresent.filter((t) => ['import_previews', 'salary_settings'].includes(t))];

  const deletedCounts = {};
  let currentTable = null;
  try {
    db.transaction(() => {
      for (const t of tablesToClear) {
        currentTable = t;
        const before = db.prepare(`SELECT count(*) AS c FROM ${t}`).get().c;
        db.prepare(`DELETE FROM ${t}`).run();
        const after = db.prepare(`SELECT count(*) AS c FROM ${t}`).get().c;
        if (after !== 0) throw new Error(`Bảng ${t} vẫn còn ${after} dòng sau khi xóa`);
        deletedCounts[t] = before;
      }
      currentTable = 'audit_logs';
      db.prepare(`
        INSERT INTO audit_logs (id, user_id, username, action, table_name, record_id, old_values, new_values, reason, created_at)
        VALUES (?, ?, ?, 'RESET_BUSINESS_DATA', 'ALL_BUSINESS_TABLES', 'ALL', ?, ?, ?, ?)
      `).run(
        randomUUID(),
        user?.id || 'DIRECTOR',
        actor,
        JSON.stringify(deletedCounts),
        JSON.stringify({ status: 'CLEAN_EMPTY_STATE', optional_tables_absent: optionalAbsent }),
        cleanReason,
        now
      );
    })();
  } catch (dbErr) {
    // Giao dịch đã tự hoàn tác: không xóa một phần.
    throw resetError(`Làm sạch thất bại tại bảng "${currentTable}": ${dbErr.message}. Toàn bộ thao tác đã được hoàn tác, dữ liệu giữ nguyên.`);
  }

  // Xóa cấu hình phân bổ bộ nhớ & cache
  if (excelMonthService?.groupAllocations) {
    excelMonthService.groupAllocations.clear();
    try { excelMonthService.saveAllocationsToFile(); } catch (_) {}
  }
  invalidateExcelMonthCache();

  try {
    broadcastPLUpdate('DATA_MUTATED', {
      trigger: 'RESET_BUSINESS_DATA',
      reason: 'Toàn bộ dữ liệu nghiệp vụ cũ đã được làm sạch theo lệnh của Giám đốc'
    });
  } catch (_) {}

  return {
    success: true,
    message: 'Đã xóa toàn bộ dữ liệu nghiệp vụ cũ thành công. Hệ thống đã trở về trạng thái sạch.',
    deleted_counts: deletedCounts,
    optional_tables_absent: optionalAbsent,
    timestamp: now
  };
}
