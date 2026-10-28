/**
 * ============================================================
 * REAL-TIME P&L ENGINE SERVICE - WED_HOACHTOAN (TASK 4.1 & TASK 4.3)
 * ============================================================
 * Quy chuẩn kỹ thuật:
 * - Tiền tệ: Số nguyên VND Integer (Math.round tuyệt đối không số thực)
 * - Song song 2 dòng tiền: Kỳ vọng (Expected) vs Thực thu (Actual) vs Công nợ (Receivables)
 * - Server-Sent Events (SSE) broadcasting: Tự nhảy số tức thì khi có biến động
 * - Phân bổ chi phí: Cố định (Fixed) vs Biến động (Variable)
 * - Task 4.3: Hỗ trợ bộ lọc đa chu kỳ: MTD, Quý 1-4, Năm, Tùy chọn khoảng ngày
 * ============================================================
 */
import { db } from '../db/database.js';
import { EXPENSE_CATEGORIES, TRIP_STATUSES, USER_ROLES } from '../db/schema.js';

// Danh sách client SSE đang kết nối
const sseClients = new Set();

/**
 * Tính toán toàn bộ bức tranh P&L (Profit & Loss) và 2 dòng tiền
 * @param {object} options - Tham số lọc
 * @param {string|null} options.month - Lọc theo tháng cụ thể (YYYY-MM) - tương thích ngược
 * @param {string|null} options.year - Lọc theo năm cụ thể (YYYY) - tương thích ngược
 * @param {string|null} options.startDate - Ngày bắt đầu bộ lọc (YYYY-MM-DD) - Task 4.3
 * @param {string|null} options.endDate - Ngày kết thúc bộ lọc (YYYY-MM-DD) - Task 4.3
 * @param {string|null} options.areaId - Lọc theo khu vực
 * @param {object|null} options.user - Thông tin user RBAC
 */
export function calculatePL({ month = null, year = null, startDate = null, endDate = null, areaId = null, user = null } = {}) {
  // Xây dựng điều kiện lọc thời gian và quyền RBAC
  const tripWhereClauses = [];
  const tripParams = [];

  const expenseWhereClauses = [];
  const expenseParams = [];

  const advanceWhereClauses = [];
  const advanceParams = [];

  // ================================================================
  // TASK 4.3: Xây dựng điều kiện thời gian linh hoạt
  // Ưu tiên: startDate/endDate > month > year > (toàn bộ - không lọc)
  // ================================================================
  if (startDate && endDate) {
    // Lọc theo khoảng ngày tùy chọn (YYYY-MM-DD đến YYYY-MM-DD)
    tripWhereClauses.push('t.trip_date >= ? AND t.trip_date <= ?');
    tripParams.push(startDate, endDate);

    expenseWhereClauses.push('e.expense_date >= ? AND e.expense_date <= ?');
    expenseParams.push(startDate, endDate);

    advanceWhereClauses.push('ta.advance_date >= ? AND ta.advance_date <= ?');
    advanceParams.push(startDate, endDate);
  } else if (startDate && !endDate) {
    // Chỉ có ngày bắt đầu: lọc từ startDate đến hiện tại
    tripWhereClauses.push('t.trip_date >= ?');
    tripParams.push(startDate);

    expenseWhereClauses.push('e.expense_date >= ?');
    expenseParams.push(startDate);

    advanceWhereClauses.push('ta.advance_date >= ?');
    advanceParams.push(startDate);
  } else if (month) {
    // Tương thích ngược: lọc theo tháng YYYY-MM
    tripWhereClauses.push('t.trip_date LIKE ?');
    tripParams.push(`${month}%`);

    expenseWhereClauses.push('e.expense_date LIKE ?');
    expenseParams.push(`${month}%`);

    advanceWhereClauses.push('ta.advance_date LIKE ?');
    advanceParams.push(`${month}%`);
  } else if (year) {
    // Tương thích ngược: lọc theo năm YYYY
    tripWhereClauses.push('t.trip_date LIKE ?');
    tripParams.push(`${year}%`);

    expenseWhereClauses.push('e.expense_date LIKE ?');
    expenseParams.push(`${year}%`);

    advanceWhereClauses.push('ta.advance_date LIKE ?');
    advanceParams.push(`${year}%`);
  }
  // Nếu không có bất kỳ tham số thời gian nào -> tính toàn bộ dữ liệu (không lọc)

  // Lọc theo areaId hoặc RBAC
  if (areaId) {
    tripWhereClauses.push('t.area_id = ?');
    tripParams.push(areaId);
  }

  if (user) {
    if (user.role === USER_ROLES.DRIVER) {
      tripWhereClauses.push('t.driver_id = ?');
      tripParams.push(user.userId);
    } else if (user.role === USER_ROLES.AREA_MANAGER && user.areaId) {
      tripWhereClauses.push('t.area_id = ?');
      tripParams.push(user.areaId);
    }
  }

  const tripWhereSql = tripWhereClauses.length > 0 ? `WHERE ${tripWhereClauses.join(' AND ')}` : '';
  const expenseWhereSql = expenseWhereClauses.length > 0 ? `WHERE ${expenseWhereClauses.join(' AND ')}` : '';
  const advanceWhereSql = advanceWhereClauses.length > 0 ? `WHERE ${advanceWhereClauses.join(' AND ')}` : '';

  // 1. DOANH THU & CHUYẾN XE (TRIPS)
  const tripSummary = db.prepare(`
    SELECT
      COUNT(*) AS total_trips,
      COALESCE(SUM(t.trip_revenue), 0) AS total_trip_revenue,
      COALESCE(SUM(t.vat_amount), 0) AS total_vat_amount,
      COALESCE(SUM(t.total_revenue), 0) AS total_expected_revenue,
      COALESCE(SUM(CASE WHEN t.status = 'PAID' OR t.eir_paid_status = 'DA_TT' THEN t.total_revenue ELSE 0 END), 0) AS total_actual_revenue,
      COALESCE(SUM(t.driver_salary), 0) AS total_driver_salary,
      COALESCE(SUM(t.subcontractor_cost), 0) AS total_subcontractor_cost,
      COALESCE(SUM(CASE WHEN t.is_subcontractor = 1 THEN 1 ELSE 0 END), 0) AS subcontractor_trips_count,
      COALESCE(SUM(CASE WHEN t.status = 'PAID' THEN 1 ELSE 0 END), 0) AS paid_trips_count,
      COALESCE(SUM(CASE WHEN t.status = 'COMPLETED' THEN 1 ELSE 0 END), 0) AS completed_trips_count,
      COALESCE(SUM(CASE WHEN t.status = 'RUNNING' THEN 1 ELSE 0 END), 0) AS running_trips_count,
      COALESCE(SUM(CASE WHEN t.status = 'NEW' OR t.status = 'DISPATCHED' THEN 1 ELSE 0 END), 0) AS new_trips_count
    FROM trips t
    ${tripWhereSql}
  `).get(...tripParams);

  const totalExpectedRevenue = Math.round(Number(tripSummary?.total_expected_revenue || 0));
  const totalActualRevenue = Math.round(Number(tripSummary?.total_actual_revenue || 0));
  const totalReceivables = totalExpectedRevenue - totalActualRevenue; // Tiền nợ chưa thu
  const collectionRate = totalExpectedRevenue > 0 ? Math.round((totalActualRevenue / totalExpectedRevenue) * 100) : 0;

  const totalDriverSalary = Math.round(Number(tripSummary?.total_driver_salary || 0));
  const totalSubcontractorTripCost = Math.round(Number(tripSummary?.total_subcontractor_cost || 0));

  // 2. CHI PHÍ THỰC TẾ (EXPENSES)
  const expenseTypeStats = db.prepare(`
    SELECT 
      e.expense_type,
      e.category,
      COUNT(*) as count,
      COALESCE(SUM(e.amount), 0) as total_amount,
      COALESCE(SUM(e.is_anomaly), 0) as anomaly_count
    FROM expenses e
    ${expenseWhereSql}
    GROUP BY e.expense_type, e.category
  `).all(...expenseParams);

  let expenseLiftOn = 0;
  let expenseLiftOff = 0;
  let expenseTollBot = 0;
  let expenseFuel = 0;
  let expenseSubcontractorDirect = 0;
  let expenseRepair = 0;
  let expenseSelectCont = 0;
  let expensePolice = 0;
  let expenseTire = 0;
  let expenseOtherVariable = 0;

  let totalFixedExpenses = 0;
  let totalVariableExpensesDirect = 0;
  let totalAnomaliesCount = 0;

  for (const item of expenseTypeStats) {
    const amt = Math.round(Number(item.total_amount || 0));
    totalAnomaliesCount += Number(item.anomaly_count || 0);

    if (item.category === EXPENSE_CATEGORIES.FIXED) {
      totalFixedExpenses += amt;
    } else {
      totalVariableExpensesDirect += amt;
    }

    switch (item.expense_type) {
      case 'LIFT_ON': expenseLiftOn += amt; break;
      case 'LIFT_OFF': expenseLiftOff += amt; break;
      case 'TOLL_BOT': expenseTollBot += amt; break;
      case 'FUEL': expenseFuel += amt; break;
      case 'SUBCONTRACTOR': expenseSubcontractorDirect += amt; break;
      case 'REPAIR': expenseRepair += amt; break;
      case 'SELECT_CONT': expenseSelectCont += amt; break;
      case 'POLICE': expensePolice += amt; break;
      case 'TIRE': expenseTire += amt; break;
      default:
        if (item.category === EXPENSE_CATEGORIES.VARIABLE) {
          expenseOtherVariable += amt;
        }
        break;
    }
  }

  // Tổng cước thuê ngoài: lấy lớn nhất giữa bảng trips hoặc bảng expenses để không tính trùng nếu đã nhập
  const effectiveSubcontractorCost = Math.max(totalSubcontractorTripCost, expenseSubcontractorDirect);

  // Tổng chi phí biến động = Các khoản trực tiếp trong bảng expenses + Lương lái xe chuyến + Cước thuê ngoài (nếu chưa có trong expenses)
  const additionalSubcontractor = effectiveSubcontractorCost > expenseSubcontractorDirect ? (effectiveSubcontractorCost - expenseSubcontractorDirect) : 0;
  const totalVariableExpenses = totalVariableExpensesDirect + totalDriverSalary + additionalSubcontractor;

  // Lương cứng tài xế (Cố định phân bổ hàng tháng của các xe)
  const baseSalaryTotal = 0; // Fixed salaries are confirmed per period in Payroll; trip P&L excludes them.

  // Tổng chi phí cố định bao gồm cả lương cứng tài xế
  const totalFixedExpensesWithSalary = totalFixedExpenses + Math.round(Number(baseSalaryTotal || 0));

  // TỔNG CHI PHÍ HOẠT ĐỘNG
  const totalOperatingCosts = totalVariableExpenses + totalFixedExpensesWithSalary;

  // 3. LỢI NHUẬN GỘP & BIÊN LỢI NHUẬN
  const expectedGrossProfit = totalExpectedRevenue - totalOperatingCosts;
  const actualGrossProfit = totalActualRevenue - totalOperatingCosts;
  const profitMarginPercent = totalExpectedRevenue > 0 
    ? Math.round((expectedGrossProfit / totalExpectedRevenue) * 100) 
    : 0;

  // 4. TẠM ỨNG & QUYẾT TOÁN LÁI XE
  const advanceStats = db.prepare(`
    SELECT
      COUNT(*) as total_advances,
      COALESCE(SUM(advance_amount), 0) as total_advance_amount,
      COALESCE(SUM(settled_amount), 0) as total_settled_amount,
      COALESCE(SUM(balance_amount), 0) as total_balance_amount,
      COALESCE(SUM(CASE WHEN status = 'PENDING' THEN 1 ELSE 0 END), 0) as pending_count,
      COALESCE(SUM(CASE WHEN status = 'SETTLED' THEN 1 ELSE 0 END), 0) as settled_count
    FROM trip_advances ta
    ${advanceWhereSql}
  `).get(...advanceParams);

  // 5. THỐNG KÊ THEO XE (VEHICLE BREAKDOWN)
  const vehicleStats = db.prepare(`
    SELECT 
      t.vehicle_plate,
      COUNT(t.id) as trip_count,
      COALESCE(SUM(t.total_revenue), 0) as revenue,
      COALESCE(SUM(t.driver_salary), 0) as salary,
      COALESCE(SUM(t.subcontractor_cost), 0) as sub_cost
    FROM trips t
    ${tripWhereSql}
    GROUP BY t.vehicle_plate
    ORDER BY revenue DESC
  `).all(...tripParams).map(v => {
    const rev = Math.round(Number(v.revenue || 0));
    return {
      vehicle_plate: v.vehicle_plate || 'Xe ngoài / Khác',
      trip_count: v.trip_count,
      revenue: rev,
      salary: Math.round(Number(v.salary || 0)),
      subcontractor_cost: Math.round(Number(v.sub_cost || 0))
    };
  });

  // 6. THỐNG KÊ THEO KHÁCH HÀNG (CUSTOMER BREAKDOWN)
  const customerStats = db.prepare(`
    SELECT 
      t.customer_name,
      COUNT(t.id) as trip_count,
      COALESCE(SUM(t.total_revenue), 0) as total_revenue,
      COALESCE(SUM(CASE WHEN t.status = 'PAID' OR t.eir_paid_status = 'DA_TT' THEN t.total_revenue ELSE 0 END), 0) as collected_revenue
    FROM trips t
    ${tripWhereSql}
    GROUP BY t.customer_name
    ORDER BY total_revenue DESC
    LIMIT 10
  `).all(...tripParams).map(c => {
    const totalRev = Math.round(Number(c.total_revenue || 0));
    const collectedRev = Math.round(Number(c.collected_revenue || 0));
    return {
      customer_name: c.customer_name,
      trip_count: c.trip_count,
      total_revenue: totalRev,
      collected_revenue: collectedRev,
      receivable: totalRev - collectedRev
    };
  });

  // 7. THỐNG KÊ THEO TUYẾN ĐƯỜNG (ROUTE BREAKDOWN)
  const routeStats = db.prepare(`
    SELECT
      t.route_name,
      COUNT(t.id) as trip_count,
      COALESCE(SUM(t.total_revenue), 0) as total_revenue,
      COALESCE(AVG(t.total_revenue), 0) as avg_revenue
    FROM trips t
    ${tripWhereSql}
    GROUP BY t.route_name
    ORDER BY total_revenue DESC
    LIMIT 10
  `).all(...tripParams).map(r => ({
    route_name: r.route_name || 'Tuyến lẻ',
    trip_count: r.trip_count,
    total_revenue: Math.round(Number(r.total_revenue || 0)),
    avg_revenue: Math.round(Number(r.avg_revenue || 0))
  }));

  // 8. THỐNG KÊ DOANH THU THEO TÀI XẾ (DRIVER REVENUE BREAKDOWN)
  const joinClause = tripWhereSql ? tripWhereSql.replace(/^\s*WHERE\s+/i, 'AND ') : '';
  const companyDrivers = db.prepare(`
    SELECT 
      d.id as driver_id,
      d.full_name as driver_name,
      COALESCE(d.phone, '') as phone,
      COALESCE(d.area_id, '') as area_id,
      COALESCE(v.plate_number, '') as vehicle_plate,
      COALESCE(d.kpi_target, 0) as kpi_target,
      COUNT(t.id) as trip_count,
      COALESCE(SUM(t.total_revenue), 0) as total_revenue,
      COALESCE(SUM(CASE WHEN t.status = 'PAID' OR t.eir_paid_status = 'DA_TT' THEN t.total_revenue ELSE 0 END), 0) as collected_revenue,
      COALESCE(SUM(t.driver_salary), 0) as salary
    FROM drivers d
    LEFT JOIN vehicles v ON d.default_vehicle_id = v.id
    LEFT JOIN trips t ON t.driver_id = d.id ${joinClause}
    WHERE d.is_active = 1
    GROUP BY d.id
    ORDER BY total_revenue DESC
  `).all(...tripParams);

  const subWhere = tripWhereSql 
    ? `${tripWhereSql} AND t.driver_id IS NULL`
    : `WHERE t.driver_id IS NULL`;

  const subStats = db.prepare(`
    SELECT 
      'Xe ngoài / Thuê ngoài' as driver_name,
      NULL as driver_id,
      '' as phone,
      '' as area_id,
      'Xe ngoài' as vehicle_plate,
      0 as kpi_target,
      COUNT(t.id) as trip_count,
      COALESCE(SUM(t.total_revenue), 0) as total_revenue,
      COALESCE(SUM(CASE WHEN t.status = 'PAID' OR t.eir_paid_status = 'DA_TT' THEN t.total_revenue ELSE 0 END), 0) as collected_revenue,
      COALESCE(SUM(t.subcontractor_cost), 0) as salary
    FROM trips t
    ${subWhere}
  `).get(...tripParams);

  const combinedDriverList = [...companyDrivers];
  if (subStats && subStats.trip_count > 0) {
    combinedDriverList.push(subStats);
  }

  const driverStats = combinedDriverList.map(d => {
    const totalRev = Math.round(Number(d.total_revenue || 0));
    const collectedRev = Math.round(Number(d.collected_revenue || 0));
    return {
      driver_id: d.driver_id,
      driver_name: d.driver_name,
      phone: d.phone,
      area_id: d.area_id,
      vehicle_plate: d.vehicle_plate,
      kpi_target: Math.round(Number(d.kpi_target || 0)),
      trip_count: d.trip_count || 0,
      total_revenue: totalRev,
      collected_revenue: collectedRev,
      receivable: totalRev - collectedRev,
      salary: Math.round(Number(d.salary || 0)),
      revenue_share_percent: totalExpectedRevenue > 0 ? Math.round((totalRev / totalExpectedRevenue) * 100) : 0
    };
  });

  return {
    calculated_at: new Date().toISOString(),
    currency: 'VND_INTEGER',
    cash_flow: {
      expected_revenue: totalExpectedRevenue,     // Dòng tiền kỳ vọng
      actual_revenue: totalActualRevenue,         // Dòng tiền thực thu
      pending_receivables: totalReceivables,      // Công nợ phải thu
      collection_rate_percent: collectionRate     // Tỷ lệ đã thu hồi (%)
    },
    profit_and_loss: {
      expected_gross_profit: expectedGrossProfit, // Lợi nhuận gộp kỳ vọng
      actual_gross_profit: actualGrossProfit,     // Lợi nhuận gộp thực thu
      profit_margin_percent: profitMarginPercent, // Tỉ suất lợi nhuận gộp (%)
      total_operating_costs: totalOperatingCosts  // Tổng chi phí
    },
    expenses_breakdown: {
      total_variable: totalVariableExpenses,
      total_fixed: totalFixedExpensesWithSalary,
      fixed_ratio_percent: totalOperatingCosts > 0 ? Math.round((totalFixedExpensesWithSalary / totalOperatingCosts) * 100) : 0,
      variable_ratio_percent: totalOperatingCosts > 0 ? Math.round((totalVariableExpenses / totalOperatingCosts) * 100) : 0,
      details: {
        lift_on: expenseLiftOn,
        lift_off: expenseLiftOff,
        toll_bot: expenseTollBot,
        fuel: expenseFuel,
        subcontractor: effectiveSubcontractorCost,
        driver_salary: totalDriverSalary,
        repair: expenseRepair,
        select_cont: expenseSelectCont,
        police: expensePolice,
        tire: expenseTire,
        other_variable: expenseOtherVariable,
        base_salary_fixed: Math.round(Number(baseSalaryTotal || 0)),
        other_fixed: totalFixedExpenses
      },
      anomalies_count: totalAnomaliesCount
    },
    trips_overview: {
      total_trips: tripSummary?.total_trips || 0,
      paid_trips: tripSummary?.paid_trips_count || 0,
      completed_trips: tripSummary?.completed_trips_count || 0,
      running_trips: tripSummary?.running_trips_count || 0,
      new_trips: tripSummary?.new_trips_count || 0,
      subcontractor_trips: tripSummary?.subcontractor_trips_count || 0
    },
    advances_overview: {
      total_advance_amount: Math.round(Number(advanceStats?.total_advance_amount || 0)),
      total_settled_amount: Math.round(Number(advanceStats?.total_settled_amount || 0)),
      pending_balance: Math.round(Number(advanceStats?.total_balance_amount || 0)),
      pending_count: advanceStats?.pending_count || 0,
      settled_count: advanceStats?.settled_count || 0
    },
    breakdowns: {
      vehicles: vehicleStats,
      customers: customerStats,
      routes: routeStats,
      drivers: driverStats
    }
  };
}

// ============================================================
// SERVER-SENT EVENTS (SSE) BROADCASTER
// ============================================================

/**
 * Đăng ký client nhận Server-Sent Events
 */
export function registerSSEClient(req, res) {
  // Thiết lập SSE HTTP headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*'
  });

  // Flush headers
  res.write('\n');

  // Gửi thông điệp chào mừng và snapshot dữ liệu P&L đầu tiên
  const initialData = calculatePL();
  const initPayload = {
    event: 'INIT_CONNECTED',
    timestamp: new Date().toISOString(),
    message: 'Kết nối SSE Real-time P&L Engine thành công',
    activeClients: sseClients.size + 1,
    data: initialData
  };

  res.write(`data: ${JSON.stringify(initPayload)}\n\n`);

  // Thêm client vào Set
  sseClients.add(res);
  const userInfo = req.user ? `[${req.user.username} - ${req.user.role}]` : '[Unknown]';
  console.log(`[SSE P&L] Client connected ${userInfo}. Total active clients: ${sseClients.size}`);

  const tokenExpMs = req.user?.exp ? req.user.exp * 1000 : null;
  res.tokenExpMs = tokenExpMs;
  let isCleanedUp = false;

  const cleanup = () => {
    if (isCleanedUp) return;
    isCleanedUp = true;
    clearInterval(heartbeat);
    sseClients.delete(res);
    console.log(`[SSE P&L] Client disconnected ${userInfo}. Total active clients: ${sseClients.size}`);
  };
  res.cleanup = cleanup;

  // Heartbeat ping & kiểm tra hạn token định kỳ (mỗi 10 giây)
  const heartbeat = setInterval(() => {
    if (isCleanedUp) {
      clearInterval(heartbeat);
      return;
    }

    // 1. Kiểm tra Token hết hạn: Đóng stream nếu exp <= now
    if (tokenExpMs && Date.now() >= tokenExpMs) {
      console.warn(`[SSE P&L] Token expired for client ${userInfo}. Closing SSE stream.`);
      try {
        res.write(`event: AUTH_EXPIRED\ndata: ${JSON.stringify({ error: 'Token expired', code: 'AUTH_EXPIRED' })}\n\n`);
      } catch (err) {
        // Bỏ qua lỗi ghi khi stream đang đóng
      }
      res.end();
      cleanup();
      return;
    }

    // 2. Heartbeat ping giữ kết nối
    try {
      res.write(`: ping ${Date.now()}\n\n`);
    } catch (e) {
      cleanup();
    }
  }, 10000);

  // Dọn dẹp kết nối toàn diện: req đóng, res kết thúc hoặc lỗi stream
  req.on('close', cleanup);
  res.on('finish', cleanup);
  res.on('error', cleanup);
}

/**
 * Phát tín hiệu cập nhật P&L tức thì tới toàn bộ trình duyệt đang kết nối
 */
export function broadcastPLUpdate(eventType = 'PL_UPDATED', meta = {}) {
  if (sseClients.size === 0) return;

  try {
    const freshPL = calculatePL();
    const payload = {
      event: eventType,
      timestamp: new Date().toISOString(),
      trigger: meta.trigger || 'SYSTEM',
      reason: meta.reason || 'Dữ liệu cước/chi phí thay đổi',
      activeClients: sseClients.size,
      data: freshPL
    };

    const sseMessage = `data: ${JSON.stringify(payload)}\n\n`;
    const now = Date.now();

    for (const client of sseClients) {
      // Bảo vệ dữ liệu: Kiểm tra hạn token trước khi phát dữ liệu tài chính cho từng client
      if (client.tokenExpMs && now >= client.tokenExpMs) {
        console.warn('[SSE P&L] Token expired during broadcast. Sending AUTH_EXPIRED and closing connection.');
        try {
          client.write(`event: AUTH_EXPIRED\ndata: ${JSON.stringify({ error: 'Token expired', code: 'AUTH_EXPIRED' })}\n\n`);
        } catch (e) {
          // Bỏ qua lỗi ghi
        }
        try {
          client.end();
        } catch (e) {}
        if (typeof client.cleanup === 'function') {
          client.cleanup();
        } else {
          sseClients.delete(client);
        }
        continue; // TUYỆT ĐỐI KHÔNG gửi dữ liệu tài chính P&L cho client này!
      }

      try {
        client.write(sseMessage);
      } catch (err) {
        sseClients.delete(client);
      }
    }

    console.log(`[SSE P&L] Broadcasted '${eventType}' to ${sseClients.size} clients.`);
  } catch (err) {
    console.error('[SSE P&L Broadcast Error]', err);
  }
}

/**
 * Lấy số lượng client SSE hiện tại
 */
export function getActiveSSECount() {
  return sseClients.size;
}

/**
 * Hỗ trợ kiểm thử tự động: Chủ động phát tín hiệu AUTH_EXPIRED và ngắt stream tới client
 */
export function expireClientsForTest() {
  const clients = Array.from(sseClients);
  for (const client of clients) {
    try {
      client.write(`event: AUTH_EXPIRED\ndata: ${JSON.stringify({ error: 'Token expired', code: 'AUTH_EXPIRED' })}\n\n`);
    } catch (e) {}
    try {
      client.end();
    } catch (e) {}
    if (typeof client.cleanup === 'function') {
      client.cleanup();
    } else {
      sseClients.delete(client);
    }
  }
  return clients.length;
}
