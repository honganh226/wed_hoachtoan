/**
 * ============================================================
 * TRIPS CONTROLLER & SERVICE - WED_HOACHTOAN
 * ============================================================
 * Tác nghiệp quản lý chuyến xe (MVP Core):
 * - Tạo chuyến mới (Task 3.1)
 * - Tự động điền giá cước mẫu, lương lái xe theo tuyến
 * - Gắn mã VAT [V] hoặc [NV], tính toán tiền thuế và tổng doanh thu
 * - Nhân bản chuyến hôm qua (Duplicate trip)
 * - Cập nhật chuyến kèm Audit Log & Check Khóa sổ kỳ (Task 2.3)
 * - Xóa chuyến kèm Audit Log & Check Khóa sổ kỳ
 * ============================================================
 */
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/database.js';
import { recordAuditLog, AUDIT_ACTIONS } from '../services/audit.service.js';
import { isPeriodLocked } from '../services/periodLock.service.js';
import { TRIP_STATUSES, VAT_TYPES, EIR_STATUSES, EIR_PAID_STATUSES } from '../db/schema.js';
import { validateIso6346 } from '../utils/iso6346.js';
import { broadcastPLUpdate } from './plEngine.service.js';
if(!db.prepare('PRAGMA table_info(expenses)').all().some(c=>c.name==='source_component'))db.exec('ALTER TABLE expenses ADD COLUMN source_component TEXT');

/**
 * Sinh mã cuốc xe tự động theo ngày: C{YYYYMMDD}-{STT 3 số}
 * Ví dụ: C20261008-001
 */
export function generateTripCode(tripDate) {
  const dateStr = tripDate.replace(/-/g, '');
  const prefix = `C${dateStr}-`;
  
  const lastTrip = db.prepare(`
    SELECT trip_code FROM trips 
    WHERE trip_code LIKE ? 
    ORDER BY trip_code DESC LIMIT 1
  `).get(`${prefix}%`);

  let nextSeq = 1;
  if (lastTrip && lastTrip.trip_code) {
    const parts = lastTrip.trip_code.split('-');
    if (parts.length === 2) {
      const parsed = parseInt(parts[1], 10);
      if (!isNaN(parsed)) {
        nextSeq = parsed + 1;
      }
    }
  }

  return `${prefix}${String(nextSeq).padStart(3, '0')}`;
}

/**
 * Lấy đơn giá cước mẫu theo tuyến
 */
export function getRouteDefaultPrice(routeIdOrName) {
  if (!routeIdOrName) return null;
  const route = db.prepare(`
    SELECT * FROM routes 
    WHERE id = ? OR route_name = ? OR route_code = ?
    LIMIT 1
  `).get(routeIdOrName, routeIdOrName, routeIdOrName);
  return route || null;
}

/**
 * Tạo mới một cuốc xe
 */
export function createTrip({ tripData, user, ipAddress = null }) {
  const {
    trip_date,
    vehicle_id,
    driver_id,
    route_id,
    customer_id,
    customer_name,
    pickup_location,
    dropoff_location,
    vat_type = VAT_TYPES.V,
    trip_revenue = 0,
    driver_salary = 0,
    container_number = '',
    container_size = '40',
    notes = '',
    is_subcontractor = 0,
    subcontractor_id = null,
    subcontractor_name = '',
    subcontractor_cost = 0,
    toll_fee = 0,
    port_fee = 0,
    parking_fee = 0,
    handling_fee = 0,
    meal_allowance = 0,
    fuel_liters = 0,
    other_costs = 0,
    other_expenses = [],
    customer_payment_status = 'CHUA_TT',
    subcontractor_payment_status = 'CHUA_TT',
    group_id = null,
    source_type = 'MANUAL',
    area_id = null
  } = tripData;

  if (!trip_date || !/^\d{4}-\d{2}-\d{2}$/.test(trip_date) || Number.isNaN(Date.parse(trip_date))) throw new Error('Ngày chạy phải có dạng YYYY-MM-DD hợp lệ');
  for(const field of ['trip_revenue','subcontractor_cost','toll_fee','port_fee','parking_fee','handling_fee','meal_allowance','other_costs','fuel_liters']) {
    const value=tripData[field];if(value!=null&&value!==''&&(!Number.isFinite(Number(value))||Number(value)<0))throw Error('Số tiền/lượng không hợp lệ: '+field);
  }
  if (isPeriodLocked(trip_date)) {
    throw new Error(`Kỳ kế toán tháng [${trip_date.slice(0, 7)}] đã bị KHÓA SỔ. Không thể tạo chuyến xe mới trong tháng này.`);
  }

  // Tra cứu thông tin xe & tài xế
  let vehiclePlate = tripData.vehicle_plate || '';
  if (vehicle_id) {
    const v = db.prepare('SELECT plate_number FROM vehicles WHERE id = ?').get(vehicle_id);
    if (v) vehiclePlate = v.plate_number;
  } else if (!vehiclePlate && is_subcontractor) {
    vehiclePlate = 'XE NGOÀI';
  }

  let driverName = tripData.driver_name || '';
  let resolvedAreaId = area_id;
  if (driver_id) {
    const d = db.prepare('SELECT full_name, area_id FROM drivers WHERE id = ?').get(driver_id);
    if (d) {
      driverName = d.full_name;
      if (!resolvedAreaId) resolvedAreaId = d.area_id;
    }
  }

  // Tra cứu thông tin nhà thầu phụ / nhà xe
  let finalSubName = subcontractor_name || '';
  if (subcontractor_id && !finalSubName) {
    const s = db.prepare('SELECT name FROM subcontractors WHERE id = ?').get(subcontractor_id);
    if (s) finalSubName = s.name;
  }

  // Tra cứu thông tin tuyến
  let routeName = tripData.route_name || '';
  let autoRevenue = parseInt(trip_revenue, 10) || 0;
  let autoDriverSalary = parseInt(driver_salary, 10) || 0;

  if (route_id) {
    const r = db.prepare('SELECT route_name, default_price, default_driver_pay FROM routes WHERE id = ?').get(route_id);
    if (r) {
      routeName = r.route_name;
      if (tripData.trip_revenue == null && r.default_price) autoRevenue = r.default_price;
      if (tripData.driver_salary == null && r.default_driver_pay) autoDriverSalary = r.default_driver_pay;
    }
  }

  // Tra cứu khách hàng
  let finalCustomerName = customer_name || '';
  if (customer_id && !finalCustomerName) {
    const c = db.prepare('SELECT name FROM customers WHERE id = ?').get(customer_id);
    if (c) finalCustomerName = c.name;
  }
  if (!finalCustomerName) finalCustomerName = 'KHÁCH LẺ';

  // Tính VAT:
  const numRevenue = Math.round(Number(autoRevenue) || 0);
  let vatAmount = 0;
  let totalRevenue = numRevenue;

  if (vat_type === VAT_TYPES.V) {
    vatAmount = 0; // No tax rate has been approved; preserve gross fare.
  } else {
    vatAmount = 0;
  }

  // Tính các khoản chi phí chi tiết
  const numSubCost = is_subcontractor ? Math.round(Number(subcontractor_cost) || 0) : 0;
  const numToll = Math.round(Number(toll_fee) || 0);
  const numPort = Math.round(Number(port_fee) || 0);
  const numParking = Math.round(Number(parking_fee) || 0);
  const numHandling = Math.round(Number(handling_fee) || 0);
  const numMeal = Math.round(Number(meal_allowance) || 0);
  const numFuelLiters = Number(fuel_liters) || 0;

  // Xử lý danh sách chi phí khác
  let extraOtherCosts = 0;
  if (Array.isArray(other_expenses) && other_expenses.length > 0) {
    extraOtherCosts = other_expenses.reduce((sum, item) => sum + (Math.round(Number(item.amount) || 0)), 0);
  }
  const numOtherCosts = (Math.round(Number(other_costs) || 0)) + extraOtherCosts;

  // Tổng chi phí tiền đã ghi nhận (không bao gồm lương tài xế và chưa tính tiền dầu)
  const totalDirectCosts = numSubCost + numToll + numPort + numParking + numHandling + numMeal + numOtherCosts;
  // Lãi tạm tính = Cước vào - các chi phí tiền đã ghi nhận
  const tempProfit = totalRevenue - totalDirectCosts;

  const tripId = uuidv4();
  const tripCode = generateTripCode(trip_date);
  const now = new Date().toISOString();

  // Insert trip vào DB
  const stmt = db.prepare(`
    INSERT INTO trips (
      id, trip_code, trip_date, vehicle_id, vehicle_plate, driver_id, driver_name,
      route_id, route_name, customer_id, customer_name, area_id,
      pickup_location, dropoff_location, vat_type, trip_revenue, vat_amount,
      total_revenue, driver_salary, status, is_subcontractor, subcontractor_id,
      subcontractor_name, subcontractor_cost, toll_fee, port_fee, parking_fee,
      handling_fee, meal_allowance, fuel_liters, other_costs,
      customer_payment_status, subcontractor_payment_status, group_id, source_type,
      eir_status, eir_paid_status, is_locked, notes, created_by,
      created_at, updated_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, 0, ?, ?,
      ?, ?
    )
  `);

  stmt.run(
    tripId, tripCode, trip_date, vehicle_id || null, vehiclePlate, driver_id || null, driverName,
    route_id && db.prepare('SELECT id FROM routes WHERE id=?').get(route_id) ? route_id : null, routeName, customer_id || null, finalCustomerName, resolvedAreaId || null,
    pickup_location || null, dropoff_location || null, vat_type, numRevenue, vatAmount,
    totalRevenue, Math.round(Number(autoDriverSalary) || 0), TRIP_STATUSES.NEW,
    is_subcontractor ? 1 : 0, subcontractor_id || null, finalSubName || null, numSubCost,
    numToll, numPort, numParking, numHandling, numMeal, numFuelLiters, numOtherCosts,
    customer_payment_status, subcontractor_payment_status, group_id || null, source_type,
    EIR_STATUSES.CHUA_TRA, EIR_PAID_STATUSES.CHUA_TT, notes || null, user?.username || 'SYSTEM',
    now, now
  );

  // Lưu chi tiết các khoản chi phí vào bảng expenses để báo cáo chi phí đồng bộ
  const expenseEntries = [];
  if (numToll > 0) expenseEntries.push({ type: 'TOLL_BOT', amount: numToll, note: 'Phí cầu đường / cao tốc' });
  if (numPort > 0) expenseEntries.push({ type: 'LIFT_ON', amount: numPort, note: 'Phí cảng / nâng hạ' });
  if (numParking > 0) expenseEntries.push({ type: 'PARKING', amount: numParking, note: 'Phí bến bãi / đỗ xe' });
  if (numHandling > 0) expenseEntries.push({ type: 'HANDLING', amount: numHandling, note: 'Tiền bốc xếp' });
  if (numMeal > 0) expenseEntries.push({ type: 'MEAL_ALLOWANCE', amount: numMeal, note: 'Phụ cấp ăn / chuyến' });
  if (numSubCost > 0) expenseEntries.push({ type: 'SUBCONTRACTOR', amount: numSubCost, note: `Cước thuê xe ngoài: ${finalSubName}` });

  if (Array.isArray(other_expenses)) {
    for (const exp of other_expenses) {
      const amt = Math.round(Number(exp.amount) || 0);
      if (amt > 0) {
        expenseEntries.push({ type: 'OTHER', amount: amt, note: exp.name || exp.note || 'Chi phí khác' });
      }
    }
  }
  if (!expenseEntries.some(e=>e.type==='OTHER') && numOtherCosts > 0) {
    expenseEntries.push({ type: 'OTHER', amount: numOtherCosts, note: 'Chi phí khác' });
  }

  for (const exp of expenseEntries) {
    const expId = uuidv4();
    db.prepare(`
      INSERT INTO expenses (
        id, trip_id, vehicle_id, expense_type, category, amount,
        expense_date, note, receipt_url, is_anomaly, created_at, updated_at, source_component
      ) VALUES (?, ?, ?, ?, 'VARIABLE', ?, ?, ?, NULL, 0, ?, ?, ?)
    `).run(
      expId, tripId, vehicle_id || null, exp.type, exp.amount,
      trip_date, exp.note, now, now, ({TOLL_BOT:'toll_fee',LIFT_ON:'port_fee',PARKING:'parking_fee',HANDLING:'handling_fee',MEAL_ALLOWANCE:'meal_allowance',SUBCONTRACTOR:'subcontractor_cost',OTHER:'other_costs'})[exp.type]
    );
  }

  // Thêm Container(s) vào bảng containers
  const savedContainers = [];
  const containerListToInsert = [];

  if (Array.isArray(tripData.containers) && tripData.containers.length > 0) {
    tripData.containers.forEach((c, idx) => {
      containerListToInsert.push({
        container_number: c.container_number ? c.container_number.trim().toUpperCase() : null,
        container_size: c.container_size || (tripData.is_multi_container ? '20' : '40'),
        container_type: c.container_type || 'DC',
        is_second_cont: c.is_second_cont ? 1 : (idx > 0 ? 1 : 0),
        pickup_yard: c.pickup_yard || pickup_location || null,
        dropoff_yard: c.dropoff_yard || dropoff_location || null,
        lift_on_fee: Math.round(Number(c.lift_on_fee) || 0),
        lift_off_fee: Math.round(Number(c.lift_off_fee) || 0),
        cargo_weight: Math.round(Number(c.cargo_weight) || 0),
        notes: c.notes || null
      });
    });
  } else if (container_number || pickup_location || dropoff_location) {
    containerListToInsert.push({
      container_number: container_number ? container_number.trim().toUpperCase() : null,
      container_size: container_size || '40',
      container_type: 'DC',
      is_second_cont: 0,
      pickup_yard: pickup_location || null,
      dropoff_yard: dropoff_location || null,
      lift_on_fee: 0,
      lift_off_fee: 0,
      cargo_weight: 0,
      notes: notes || null
    });
  }

  for (const c of containerListToInsert) {
    const cId = uuidv4();
    db.prepare(`
      INSERT INTO containers (
        id, trip_id, container_number, container_size, container_type,
        is_second_cont, pickup_yard, dropoff_yard, lift_on_fee, lift_off_fee,
        cargo_weight, notes, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      cId, tripId, c.container_number, c.container_size, c.container_type,
      c.is_second_cont, c.pickup_yard, c.dropoff_yard, c.lift_on_fee, c.lift_off_fee,
      c.cargo_weight, c.notes, now, now
    );
    savedContainers.push({ id: cId, ...c });
  }

  if(other_expenses.length)db.prepare('UPDATE trips SET raw_data=? WHERE id=?').run(JSON.stringify({other_expenses}),tripId);

  // Ghi Audit Log
  recordAuditLog({
    userId: user?.userId || user?.id,
    username: user?.username || 'SYSTEM',
    action: AUDIT_ACTIONS.CREATE,
    tableName: 'trips',
    recordId: tripId,
    oldValues: null,
    newValues: {
      trip_code: tripCode,
      trip_date,
      vehicle_plate: vehiclePlate,
      driver_name: driverName,
      route_name: routeName,
      customer_name: finalCustomerName,
      total_revenue: totalRevenue,
      vat_type,
      containers_count: savedContainers.length,
      is_multi_container: savedContainers.length > 1 ? 1 : 0
    },
    reason: `Tạo mới chuyến xe ${tripCode}${savedContainers.length > 1 ? ' (Kẹp 2x20 cont)' : ''}`,
    ipAddress
  });

  const primaryCont = savedContainers.find(c => c.is_second_cont === 0) || savedContainers[0];
  const secondCont = savedContainers.find(c => c.is_second_cont === 1);

  // Phát tín hiệu cập nhật P&L Real-time SSE
  broadcastPLUpdate('TRIP_CREATED', {
    trigger: 'CREATE_TRIP',
    reason: `Tạo mới chuyến xe ${tripCode} (${totalRevenue.toLocaleString('vi-VN')}₫)`
  });

  return {
    id: tripId,
    trip_code: tripCode,
    trip_date,
    is_subcontractor: is_subcontractor ? 1 : 0,
    subcontractor_name: finalSubName || null,
    vehicle_plate: vehiclePlate,
    driver_name: driverName,
    route_name: routeName,
    customer_name: finalCustomerName,
    trip_revenue: numRevenue,
    total_revenue: totalRevenue,
    vat_type,
    subcontractor_cost: numSubCost,
    toll_fee: numToll,
    port_fee: numPort,
    parking_fee: numParking,
    handling_fee: numHandling,
    meal_allowance: numMeal,
    fuel_liters: numFuelLiters,
    other_costs: numOtherCosts,
    total_direct_costs: totalDirectCosts,
    temp_profit: tempProfit,
    customer_payment_status,
    subcontractor_payment_status,
    container_number: primaryCont?.container_number || null,
    second_container_number: secondCont?.container_number || null,
    is_multi_container: !!secondCont,
    containers: savedContainers
  };
}

/**
 * Nhân bản cuốc xe hôm qua (Duplicate Trip)
 */
export function duplicateTrip({ sourceTripId, targetDate, user, ipAddress = null }) {
  const source = db.prepare('SELECT * FROM trips WHERE id = ?').get(sourceTripId);
  if (!source) throw new Error('Không tìm thấy chuyến xe gốc để nhân bản');

  const container = db.prepare('SELECT * FROM containers WHERE trip_id = ? AND is_second_cont = 0 LIMIT 1').get(sourceTripId);

  const newTripData = {
    trip_date: targetDate || new Date().toISOString().slice(0, 10),
    vehicle_id: source.vehicle_id,
    vehicle_plate: source.vehicle_plate,
    driver_id: source.driver_id,
    driver_name: source.driver_name,
    route_id: source.route_id,
    route_name: source.route_name,
    customer_id: source.customer_id,
    customer_name: source.customer_name,
    area_id: source.area_id,
    pickup_location: source.pickup_location,
    dropoff_location: source.dropoff_location,
    vat_type: source.vat_type,
    trip_revenue: source.trip_revenue,
    driver_salary: source.driver_salary,
    container_number: '', // Không copy số cont để tránh trùng số
    container_size: container?.container_size || '40',
    notes: `Nhân bản từ ${source.trip_code}`,
    is_subcontractor: source.is_subcontractor,
    subcontractor_id: source.subcontractor_id,
    subcontractor_name: source.subcontractor_name,
    subcontractor_cost: source.subcontractor_cost,
    toll_fee: source.toll_fee,
    port_fee: source.port_fee,
    parking_fee: source.parking_fee,
    handling_fee: source.handling_fee,
    meal_allowance: source.meal_allowance,
    fuel_liters: source.fuel_liters,
    other_costs: source.other_costs,
    customer_payment_status: source.customer_payment_status,
    subcontractor_payment_status: source.subcontractor_payment_status
  };

  return createTrip({ tripData: newTripData, user, ipAddress });
}

/**
 * Cập nhật chuyến xe (có check Period Lock và Audit Log)
 */
export function updateTrip({ tripId, updateData, user, reason = '', ipAddress = null }) {
  const oldTrip = db.prepare('SELECT * FROM trips WHERE id = ?').get(tripId);
  if (!oldTrip) throw new Error('Không tìm thấy chuyến xe cần cập nhật');

  if (oldTrip.is_locked === 1 || isPeriodLocked(oldTrip.trip_date)) {
    throw new Error(`Kỳ kế toán tháng [${oldTrip.trip_date.slice(0, 7)}] đã bị KHÓA SỔ. Không thể chỉnh sửa cuốc xe này.`);
  }

  // Nếu người dùng đổi ngày chuyến, kiểm tra ngày mới có bị khóa không
  if (updateData.trip_date && updateData.trip_date !== oldTrip.trip_date) {
    if (isPeriodLocked(updateData.trip_date)) {
      throw new Error(`Kỳ kế toán tháng mới [${updateData.trip_date.slice(0, 7)}] đã bị KHÓA SỔ.`);
    }
  }

  const now = new Date().toISOString();
  const fields = [];
  const params = [];

  const allowedFields = [
    'trip_date', 'vehicle_id', 'vehicle_plate', 'driver_id', 'driver_name',
    'route_id', 'route_name', 'customer_id', 'customer_name', 'area_id',
    'pickup_location', 'dropoff_location', 'vat_type', 'trip_revenue',
    'vat_amount', 'total_revenue', 'driver_salary', 'status',
    'is_subcontractor', 'subcontractor_id', 'subcontractor_name', 'subcontractor_cost',
    'toll_fee', 'port_fee', 'parking_fee', 'handling_fee', 'meal_allowance',
    'fuel_liters', 'other_costs', 'customer_payment_status', 'subcontractor_payment_status',
    'group_id', 'eir_status', 'eir_paid_status', 'notes'
  ];

  for (const key of allowedFields) {
    if (updateData[key] !== undefined) {
      fields.push(`${key} = ?`);
      let val = updateData[key];
      if (['trip_revenue', 'vat_amount', 'total_revenue', 'driver_salary', 'subcontractor_cost'].includes(key)) {
        val = Math.round(Number(val) || 0);
      }
      params.push(val);
    }
  }

  if (fields.length === 0) {
    return oldTrip;
  }

  fields.push('updated_at = ?');
  params.push(now);
  params.push(tripId);

  db.prepare(`UPDATE trips SET ${fields.join(', ')} WHERE id = ?`).run(...params);

  const componentTypes={toll_fee:'TOLL_BOT',port_fee:'LIFT_ON',parking_fee:'PARKING',handling_fee:'HANDLING',meal_allowance:'MEAL_ALLOWANCE',subcontractor_cost:'SUBCONTRACTOR',other_costs:'OTHER'};
  for(const [component,type] of Object.entries(componentTypes)){
    if(updateData[component]===undefined)continue;
    const entries=db.prepare('SELECT * FROM expenses WHERE trip_id=? AND source_component=?').all(tripId,component);
    const amount=Math.round(Number(updateData[component])||0);
    if(entries.reduce((sum,e)=>sum+e.amount,0)===amount)continue;
    db.prepare('DELETE FROM expenses WHERE trip_id=? AND source_component=?').run(tripId,component);
    if(amount)db.prepare("INSERT INTO expenses(id,trip_id,vehicle_id,expense_type,category,amount,expense_date,note,is_anomaly,created_at,updated_at,source_component) VALUES(?,?,?,?,'VARIABLE',?,?,?,0,?,?,?)").run(uuidv4(),tripId,oldTrip.vehicle_id,type,amount,updateData.trip_date||oldTrip.trip_date,'Điều chỉnh '+component,now,now,component);
  }
  const updatedTrip = db.prepare('SELECT * FROM trips WHERE id = ?').get(tripId);

  // Ghi Audit Log
  recordAuditLog({
    userId: user?.userId || user?.id,
    username: user?.username || 'SYSTEM',
    action: AUDIT_ACTIONS.UPDATE,
    tableName: 'trips',
    recordId: tripId,
    oldValues: oldTrip,
    newValues: updatedTrip,
    reason: reason || `Cập nhật thông tin chuyến xe ${oldTrip.trip_code}`,
    ipAddress
  });

  // Phát tín hiệu cập nhật P&L Real-time SSE
  broadcastPLUpdate('TRIP_UPDATED', {
    trigger: 'UPDATE_TRIP',
    reason: `Cập nhật thông tin chuyến xe ${oldTrip.trip_code}`
  });

  return updatedTrip;
}

/**
 * Lấy danh sách containers gắn với một chuyến xe (bao gồm cả cont kẹp thứ 2)
 */
export function getTripContainers(tripId) {
  const contList = db.prepare(`
    SELECT * FROM containers 
    WHERE trip_id = ? 
    ORDER BY is_second_cont ASC, created_at ASC
  `).all(tripId);

  return contList.map(c => {
    const isoCheck = c.container_number ? validateIso6346(c.container_number) : null;
    return {
      ...c,
      iso_validation: isoCheck
    };
  });
}

/**
 * Thêm hoặc kẹp thêm container cho chuyến xe (Task 3.2)
 */
export function addTripContainer({ tripId, containerData, user, ipAddress = null }) {
  const trip = db.prepare('SELECT * FROM trips WHERE id = ?').get(tripId);
  if (!trip) throw new Error('Không tìm thấy chuyến xe');

  if (trip.is_locked === 1 || isPeriodLocked(trip.trip_date)) {
    throw new Error(`Kỳ kế toán tháng [${trip.trip_date.slice(0, 7)}] đã bị KHÓA SỔ.`);
  }

  const existingConts = db.prepare('SELECT * FROM containers WHERE trip_id = ?').all(tripId);
  if (existingConts.length >= 2) {
    throw new Error('Chuyến xe đã có tối đa 2 container (cont kẹp 2x20\'). Không thể kẹp thêm.');
  }

  const isSecondCont = existingConts.length > 0 ? 1 : (containerData.is_second_cont ? 1 : 0);
  const cleanNumber = containerData.container_number ? containerData.container_number.trim().toUpperCase() : null;

  const contId = uuidv4();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO containers (
      id, trip_id, container_number, container_size, container_type,
      is_second_cont, pickup_yard, dropoff_yard, lift_on_fee, lift_off_fee,
      cargo_weight, notes, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    contId, tripId, cleanNumber,
    isSecondCont ? '20' : (containerData.container_size || '20'),
    containerData.container_type || 'DC',
    isSecondCont,
    containerData.pickup_yard || trip.pickup_location || null,
    containerData.dropoff_yard || trip.dropoff_location || null,
    Math.round(Number(containerData.lift_on_fee) || 0),
    Math.round(Number(containerData.lift_off_fee) || 0),
    Math.round(Number(containerData.cargo_weight) || 0),
    containerData.notes || null,
    now, now
  );

  const newCont = db.prepare('SELECT * FROM containers WHERE id = ?').get(contId);

  // Ghi Audit Log
  recordAuditLog({
    userId: user?.userId || user?.id,
    username: user?.username || 'SYSTEM',
    action: AUDIT_ACTIONS.CREATE,
    tableName: 'containers',
    recordId: contId,
    oldValues: null,
    newValues: newCont,
    reason: `Kẹp thêm container [${cleanNumber || 'N/A'}] (2x20') cho chuyến ${trip.trip_code}`,
    ipAddress
  });

  return {
    ...newCont,
    iso_validation: cleanNumber ? validateIso6346(cleanNumber) : null
  };
}

/**
 * Xóa container khỏi chuyến (ví dụ hủy cont kẹp)
 */
export function removeTripContainer({ tripId, containerId, user, ipAddress = null }) {
  const trip = db.prepare('SELECT * FROM trips WHERE id = ?').get(tripId);
  if (!trip) throw new Error('Không tìm thấy chuyến xe');

  if (trip.is_locked === 1 || isPeriodLocked(trip.trip_date)) {
    throw new Error(`Kỳ kế toán tháng [${trip.trip_date.slice(0, 7)}] đã bị KHÓA SỔ.`);
  }

  const cont = db.prepare('SELECT * FROM containers WHERE id = ? AND trip_id = ?').get(containerId, tripId);
  if (!cont) throw new Error('Không tìm thấy container cần xóa');

  db.prepare('DELETE FROM containers WHERE id = ?').run(containerId);

  // Ghi Audit Log
  recordAuditLog({
    userId: user?.userId || user?.id,
    username: user?.username || 'SYSTEM',
    action: AUDIT_ACTIONS.DELETE,
    tableName: 'containers',
    recordId: containerId,
    oldValues: cont,
    newValues: null,
    reason: `Xóa container ${cont.container_number || ''} khỏi chuyến ${trip.trip_code}`,
    ipAddress
  });

  return { success: true, removedContainerId: containerId };
}

/**
 * ============================================================
 * TASK 4.5: THANH TOÁN GỘP THEO BẢNG KÊ (BATCH PAYMENT)
 * ============================================================
 */

/**
 * Lấy danh sách các chuyến xe chưa thanh toán, gom nhóm theo Khách Hàng
 * Dùng để cấp dữ liệu cho Modal Thanh Toán Bảng Kê
 */
export function getUnpaidTripsByCustomer({ customerName = null, user = null } = {}) {
  let query = `
    SELECT t.*,
           GROUP_CONCAT(c.container_number, ', ') as container_numbers,
           MIN(c.pickup_yard) as pickup_yard,
           MIN(c.dropoff_yard) as dropoff_yard
    FROM trips t
    LEFT JOIN containers c ON t.id = c.trip_id
    WHERE (t.status != '${TRIP_STATUSES.PAID}' OR t.eir_paid_status != '${EIR_PAID_STATUSES.DA_TT}' OR t.eir_paid_status IS NULL)
  `;
  const params = [];

  if (customerName) {
    query += ` AND t.customer_name = ?`;
    params.push(customerName);
  }

  // RBAC scope nếu là quản lý khu vực
  if (user && user.role === 'AREA_MANAGER' && user.areaId) {
    query += ` AND t.area_id = ?`;
    params.push(user.areaId);
  }

  query += ` GROUP BY t.id ORDER BY t.customer_name ASC, t.trip_date DESC, t.trip_code DESC`;

  const unpaidTrips = db.prepare(query).all(...params);

  // Gom nhóm theo khách hàng
  const customerMap = new Map();

  for (const trip of unpaidTrips) {
    const cName = trip.customer_name || 'Khách Vãng Lai / Chưa Đặt Tên';
    if (!customerMap.has(cName)) {
      customerMap.set(cName, {
        customer_name: cName,
        customer_id: trip.customer_id || null,
        total_trips: 0,
        total_receivable: 0,
        trips: []
      });
    }

    const group = customerMap.get(cName);
    group.total_trips += 1;
    group.total_receivable += Math.round(Number(trip.total_revenue) || 0);
    group.trips.push({
      id: trip.id,
      trip_code: trip.trip_code,
      trip_date: trip.trip_date,
      vehicle_plate: trip.vehicle_plate,
      driver_name: trip.driver_name,
      route_name: trip.route_name,
      vat_type: trip.vat_type,
      total_revenue: Math.round(Number(trip.total_revenue) || 0),
      eir_status: trip.eir_status,
      eir_paid_status: trip.eir_paid_status,
      container_number: trip.container_numbers,
      notes: trip.notes,
      is_locked: trip.is_locked
    });
  }

  const result = Array.from(customerMap.values()).sort((a, b) => b.total_receivable - a.total_receivable);

  return {
    total_unpaid_customers: result.length,
    total_unpaid_trips: unpaidTrips.length,
    total_receivable: result.reduce((sum, c) => sum + c.total_receivable, 0),
    customers: result
  };
}

/**
 * Thanh toán gộp cả lô nhiều chuyến xe (Batch Payment)
 * @param {Object} params
 * @param {string[]} params.tripIds - Danh sách ID các chuyến cần thanh toán
 * @param {string} [params.customerName] - Tên khách hàng đối chiếu
 * @param {string} [params.paymentDate] - Ngày ghi nhận thanh toán (YYYY-MM-DD)
 * @param {string} [params.paymentNote] - Số UNC, số hóa đơn hoặc ghi chú bảng kê
 * @param {string} [params.paymentMethod] - BANK_TRANSFER | CASH
 * @param {Object} [params.user] - Người thực hiện
 * @param {string} [params.ipAddress] - IP client
 */
export function batchPayTrips({
  tripIds = [],
  customerName = null,
  paymentDate = null,
  paymentNote = '',
  paymentMethod = 'BANK_TRANSFER',
  user = null,
  ipAddress = null
}) {
  if (!Array.isArray(tripIds) || tripIds.length === 0) {
    throw new Error('Vui lòng chọn ít nhất 1 chuyến xe để thanh toán');
  }

  const effectiveDate = paymentDate || new Date().toISOString().slice(0, 10);
  const now = new Date().toISOString();

  // Tra cứu toàn bộ chuyến trong danh sách
  const placeholders = tripIds.map(() => '?').join(',');
  const trips = db.prepare(`SELECT * FROM trips WHERE id IN (${placeholders})`).all(...tripIds);

  if (trips.length !== tripIds.length) {
    throw new Error(`Một số chuyến xe không tìm thấy trong hệ thống (${trips.length}/${tripIds.length})`);
  }

  // Kiểm tra khóa sổ kỳ kế toán
  const lockedTrips = trips.filter(t => t.is_locked === 1 || isPeriodLocked(t.trip_date));
  if (lockedTrips.length > 0) {
    const lockedCodes = lockedTrips.map(t => `${t.trip_code} (${t.trip_date})`).join(', ');
    throw new Error(`Không thể thanh toán do có chuyến nằm trong kỳ đã KHÓA SỔ: ${lockedCodes}`);
  }

  // Tính tổng tiền thanh toán
  const totalAmount = trips.reduce((sum, t) => sum + (Math.round(Number(t.total_revenue)) || 0), 0);

  // Tạo ID định danh cho đợt thanh toán bảng kê
  const batchId = uuidv4();
  const batchCode = `BATCH-${effectiveDate.replace(/-/g, '')}-${Date.now().toString().slice(-4)}`;

  // Thực thi cập nhật lô trong Database Transaction
  const executeBatch = db.transaction(() => {
    const updateStmt = db.prepare(`
      UPDATE trips 
      SET status = ?, 
          eir_paid_status = ?, 
          updated_at = ?
      WHERE id = ?
    `);

    for (const t of trips) {
      updateStmt.run(TRIP_STATUSES.PAID, EIR_PAID_STATUSES.DA_TT, now, t.id);
    }

    // Ghi Audit Log cho cả lô thanh toán
    recordAuditLog({
      userId: user?.userId || user?.id,
      username: user?.username || 'SYSTEM',
      action: AUDIT_ACTIONS.BATCH_PAYMENT,
      tableName: 'trips',
      recordId: batchId,
      oldValues: trips.map(t => ({
        id: t.id,
        trip_code: t.trip_code,
        status: t.status,
        eir_paid_status: t.eir_paid_status,
        total_revenue: t.total_revenue
      })),
      newValues: {
        batch_id: batchId,
        batch_code: batchCode,
        trip_count: trips.length,
        total_amount: totalAmount,
        customer_name: customerName || (trips[0]?.customer_name ?? 'Nhiều KH'),
        payment_date: effectiveDate,
        payment_method: paymentMethod,
        payment_note: paymentNote,
        trip_ids: tripIds,
        applied_status: TRIP_STATUSES.PAID,
        applied_eir_paid_status: EIR_PAID_STATUSES.DA_TT
      },
      reason: `Thanh toán gộp ${trips.length} chuyến [${customerName || trips[0]?.customer_name || 'Bảng Kê'}] theo ${paymentNote || 'Bảng kê định kỳ'} - Tổng tiền: ${totalAmount.toLocaleString('vi-VN')}₫`,
      ipAddress
    });
  });

  executeBatch();

  // Phát tín hiệu cập nhật P&L Real-time SSE
  broadcastPLUpdate('BATCH_PAYMENT_COMPLETED', {
    trigger: 'BATCH_PAYMENT',
    batchId,
    batchCode,
    tripCount: trips.length,
    totalAmount,
    customerName: customerName || trips[0]?.customer_name,
    reason: `Thanh toán gộp bảng kê ${trips.length} chuyến (${totalAmount.toLocaleString('vi-VN')}₫)`
  });

  return {
    batch_id: batchId,
    batch_code: batchCode,
    trip_count: trips.length,
    total_amount: totalAmount,
    paid_trip_ids: tripIds,
    customer_name: customerName || trips[0]?.customer_name,
    payment_date: effectiveDate,
    payment_note: paymentNote,
    payment_method: paymentMethod
  };
}

/**
 * Nhập nhiều cuốc xe đồng thời trong một giao dịch an toàn (Batch Trip Creation)
 */
export function createBatchTrips({ trips, tripsData, user, ipAddress = null }) {
  const data = trips || tripsData;
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error('Danh sách cuốc xe trống');
  }

  const results = {
    total: data.length,
    inserted: 0,
    failed: 0,
    trips: [],
    errors: []
  };

  db.exec('BEGIN TRANSACTION;');
  try {
    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      try {
        if (!row.trip_date) throw new Error('Thiếu ngày chạy xe');
        if (!row.customer_name && !row.customer_id) throw new Error('Thiếu tên khách hàng / chủ hàng');

        // Kiểm tra đối chiếu chống trùng lặp cuốc
        const plate = row.vehicle_plate || '';
        const cust = row.customer_name || '';
        const cont = (row.container_number || '').trim().toUpperCase();

        let checkQuery = 'SELECT id, trip_code FROM trips WHERE trip_date = ? AND vehicle_plate = ? AND customer_name = ?';
        const checkParams = [row.trip_date, plate, cust];

        if (cont) {
          checkQuery = `
            SELECT t.id, t.trip_code 
            FROM trips t
            LEFT JOIN containers c ON t.id = c.trip_id
            WHERE t.trip_date = ? AND t.vehicle_plate = ? AND t.customer_name = ? AND c.container_number = ?
          `;
          checkParams.push(cont);
        }

        const existing = db.prepare(checkQuery).get(...checkParams);

        if (existing && !row.allow_duplicate) {
          results.failed++;
          results.errors.push({
            index: i,
            row,
            reason: `Cuốc có khả năng trùng với ${existing.trip_code} (Cùng ngày ${row.trip_date}, xe ${plate}, khách ${cust}${cont ? ', cont ' + cont : ''})`
          });
          continue;
        }

        const created = createTrip({
          tripData: { ...row, source_type: row.source_type || 'BATCH' },
          user,
          ipAddress
        });
        results.inserted++;
        results.trips.push(created);
      } catch (rowErr) {
        results.failed++;
        results.errors.push({ index: i, row, reason: rowErr.message });
      }
    }
    if(results.failed){db.exec('ROLLBACK;');results.inserted=0;results.trips=[];results.rolled_back=true;return results;}
    db.exec('COMMIT;');
  } catch (txErr) {
    db.exec('ROLLBACK;');
    throw txErr;
  }

  if (results.inserted > 0) {
    broadcastPLUpdate('TRIP_CREATED', {
      trigger: 'BATCH_TRIP_CREATED',
      reason: `Nhập nhiều cuốc: Đã thêm ${results.inserted} cuốc xe`
    });
  }

  return results;
}


