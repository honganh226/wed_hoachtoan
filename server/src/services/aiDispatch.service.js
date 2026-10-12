/**
 * ============================================================
 * AI DISPATCH SERVICE - ĐIỀU PHỐI XE & TÀI XẾ THÔNG MINH (TASK 6.4)
 * ============================================================
 * Thuật toán quét và cho điểm trọng số 4 tiêu chí vàng:
 * 1. Tiến độ KPI (35%): Ưu tiên bù cuốc cho tài xế đang chậm chỉ tiêu (<80%)
 * 2. Sức khỏe & Đảo cuốc (25%): Ưu tiên tài xế nghỉ ngơi, tránh quá tải tuyến dài
 * 3. Trạng thái kỹ thuật xe & Mức độ rảnh (25%): Xe đứng bãi IDLE, an toàn đăng kiểm, dầu máy ODO
 * 4. Tối ưu lợi nhuận & Tuyến quen (15%): Ưu tiên tài xế thông thạo tuyến đường, ít phát sinh
 * ============================================================
 */
import { db } from '../db/database.js';
import { calculateExpiryAlert, calculateOilChangeStatus } from './maintenance.service.js';

/**
 * Đề xuất phân bổ xe & tài xế dựa trên 4 tiêu chí vàng
 * @param {object} params
 * @param {string} [params.routeId] - Tuyến đường được chọn
 * @param {string} [params.customerName] - Tên khách hàng
 * @param {string} [params.tripDate] - Ngày dự kiến chạy (YYYY-MM-DD)
 * @param {string} [params.pickupLocation] - Nơi nhận/nâng cont
 * @param {string} [params.dropoffLocation] - Nơi giao/hạ cont
 * @param {boolean} [params.isMultiContainer] - Cont kẹp 2x20'
 * @param {object} [user] - Thông tin người dùng đăng nhập
 */
export async function getAiDispatchRecommendations(params = {}, user = {}) {
  const targetDate = params.tripDate || new Date().toISOString().slice(0, 10);
  const routeId = params.routeId || null;
  const isMultiCont = Boolean(params.isMultiContainer);

  // 1. Lấy thông tin tuyến đường nếu có
  let selectedRoute = null;
  if (routeId) {
    selectedRoute = db.prepare('SELECT * FROM routes WHERE id = ?').get(routeId);
  }

  // 2. Lấy danh sách tất cả tài xế đang hoạt động
  const drivers = db.prepare(`
    SELECT 
      d.id,
      d.full_name,
      d.phone,
      d.base_salary,
      d.kpi_target,
      d.default_vehicle_id,
      d.license_expiry,
      d.area_id,
      d.notes
    FROM drivers d
    WHERE d.is_active = 1
  `).all();

  // 3. Lấy danh sách tất cả các xe đang hoạt động
  const vehicles = db.prepare(`
    SELECT 
      v.id,
      v.plate_number,
      v.vehicle_type,
      v.default_driver_id,
      v.status,
      v.inspection_expiry,
      v.insurance_expiry,
      v.current_km,
      v.last_maintenance_km,
      v.oil_change_interval_km,
      v.notes
    FROM vehicles v
  `).all();

  const vehicleMap = new Map();
  vehicles.forEach(v => vehicleMap.set(v.id, v));

  // 4. Lấy tháng hiện tại của targetDate để tính KPI
  const currentMonthPrefix = targetDate.slice(0, 7); // 'YYYY-MM'

  // Query thống kê KPI trong tháng hiện tại
  const kpiRows = db.prepare(`
    SELECT 
      driver_id,
      COALESCE(SUM(total_revenue), 0) as current_month_revenue,
      COUNT(id) as current_month_trips
    FROM trips
    WHERE trip_date LIKE ?
    GROUP BY driver_id
  `).all(`${currentMonthPrefix}%`);

  const kpiMap = new Map();
  kpiRows.forEach(r => kpiMap.set(r.driver_id, {
    revenue: Number(r.current_month_revenue || 0),
    trips: Number(r.current_month_trips || 0)
  }));

  // Query thống kê các chuyến gần nhất (trong 3 ngày quanh targetDate hoặc ngày mới nhất)
  const recentTrips = db.prepare(`
    SELECT 
      id,
      trip_code,
      driver_id,
      vehicle_id,
      route_id,
      trip_date,
      status,
      pickup_location,
      dropoff_location,
      total_revenue
    FROM trips
    ORDER BY trip_date DESC, created_at DESC
  `).all();

  // Nhóm lịch sử theo tài xế
  const driverTripHistory = new Map();
  recentTrips.forEach(t => {
    if (!driverTripHistory.has(t.driver_id)) {
      driverTripHistory.set(t.driver_id, []);
    }
    driverTripHistory.get(t.driver_id).push(t);
  });

  // Query xe đang chạy dở hôm nay (DISPATCHED, CONT_PICKED, RUNNING, CONT_DROPPED)
  const activeTripsToday = db.prepare(`
    SELECT driver_id, vehicle_id, status, trip_date
    FROM trips
    WHERE trip_date = ? AND status IN ('DISPATCHED', 'CONT_PICKED', 'RUNNING', 'CONT_DROPPED')
  `).all(targetDate);

  const busyDriversToday = new Set(activeTripsToday.map(t => t.driver_id));
  const busyVehiclesToday = new Set(activeTripsToday.map(t => t.vehicle_id));

  const now = new Date();

  // 5. Tính điểm 4 tiêu chí cho từng cặp tài xế + xe
  const candidates = [];

  for (const driver of drivers) {
    // Tìm xe của tài xế (mặc định hoặc xe liên kết)
    let vehicle = driver.default_vehicle_id ? vehicleMap.get(driver.default_vehicle_id) : null;
    if (!vehicle) {
      // Tìm xe có default_driver_id trỏ về driver này
      vehicle = vehicles.find(v => v.default_driver_id === driver.id) || vehicles[0];
    }

    if (!vehicle) continue;

    const reasons = [];

    // ----------------------------------------------------
    // TIÊU CHÍ 1: TIẾN ĐỘ KPI (TRỌNG SỐ 35%)
    // ----------------------------------------------------
    const kpiInfo = kpiMap.get(driver.id) || { revenue: 0, trips: 0 };
    const kpiTarget = Math.round(Number(driver.kpi_target || 0));
    let kpiScore = 50;
    let kpiStatus = 'NONE';
    let kpiPercent = 0;

    if (kpiTarget > 0) {
      kpiPercent = Math.round((kpiInfo.revenue / kpiTarget) * 100);
      if (kpiPercent < 50) {
        kpiScore = 100;
        kpiStatus = 'CRITICAL_SLOW';
        reasons.push(`🎯 Tiến độ KPI tháng mới đạt ${kpiPercent}% (${formatVndNumber(kpiInfo.revenue)} / ${formatVndNumber(kpiTarget)}) -> Cần ưu tiên bù cuốc cấp bách.`);
      } else if (kpiPercent < 80) {
        kpiScore = 85;
        kpiStatus = 'SLOW';
        reasons.push(`🎯 Tiến độ KPI đạt ${kpiPercent}% (dưới ngưỡng 80%) -> Ưu tiên giao chuyến để đảm bảo mục tiêu doanh thu.`);
      } else if (kpiPercent <= 100) {
        kpiScore = 60;
        kpiStatus = 'ON_TRACK';
        reasons.push(`🎯 Tiến độ KPI đạt ${kpiPercent}% (chuẩn tiến độ).`);
      } else {
        kpiScore = 35;
        kpiStatus = 'AHEAD';
        reasons.push(`🎯 Tiến độ KPI đã vượt ${kpiPercent}% -> AI cân nhắc san sẻ bớt cho các xe chạy ít.`);
      }
    } else {
      reasons.push(`🎯 Tài xế chưa cài chỉ tiêu KPI cố định (chế độ linh hoạt).`);
    }

    // ----------------------------------------------------
    // TIÊU CHÍ 2: SỨC KHỎE & ĐẢO CUỐC (TRỌNG SỐ 25%)
    // ----------------------------------------------------
    let healthScore = 80;
    const history = driverTripHistory.get(driver.id) || [];
    const isBusyNow = busyDriversToday.has(driver.id);

    if (isBusyNow) {
      healthScore = 20;
      reasons.push(`⚠️ Tài xế đang có chuyến chạy dở trong ngày ${targetDate} -> Cần cân nhắc lịch trình.`);
    } else if (history.length > 0) {
      const lastTrip = history[0];
      const daysDiff = Math.round((new Date(targetDate).getTime() - new Date(lastTrip.trip_date).getTime()) / (1000 * 3600 * 24));

      if (daysDiff >= 2) {
        healthScore = 100;
        reasons.push(`💪 Đã nghỉ ngơi ${daysDiff} ngày kể từ chuyến gần nhất (${lastTrip.trip_date}) -> Thể lực sung mãn, sẵn sàng 100%.`);
      } else if (daysDiff === 1) {
        healthScore = 85;
        reasons.push(`💪 Đã hoàn thành chuyến hôm qua, nhịp sinh hoạt ổn định.`);
      } else if (daysDiff === 0) {
        healthScore = 65;
        reasons.push(`⚡ Đã có cuốc trong ngày, nếu nhận thêm cần đảm bảo thời gian lái xe không quá quy định.`);
      } else {
        healthScore = 90;
        reasons.push(`💪 Lịch trình điều vận thông thoáng.`);
      }
    } else {
      healthScore = 100;
      reasons.push(`💪 Chưa có lịch chạy gần đây, sẵn sàng tiếp nhận điều phối mới.`);
    }

    // ----------------------------------------------------
    // TIÊU CHÍ 3: TRẠNG THÁI XE & KỸ THUẬT AN TOÀN (TRỌNG SỐ 25%)
    // ----------------------------------------------------
    let vehicleScore = 80;
    const isVehicleBusy = busyVehiclesToday.has(vehicle.id);
    const inspectionAlert = calculateExpiryAlert(vehicle.inspection_expiry, now);
    const insuranceAlert = calculateExpiryAlert(vehicle.insurance_expiry, now);
    const driverLicenseAlert = calculateExpiryAlert(driver.license_expiry, now);
    const oilStatus = calculateOilChangeStatus(vehicle);

    if (vehicle.status === 'MAINTENANCE') {
      vehicleScore = 0;
      reasons.push(`⛔ Đầu xe ${vehicle.plate_number} ĐANG NẰM XƯỞNG BẢO DƯỠNG -> Không thể xuất bãi!`);
    } else if (inspectionAlert.severity >= 3 || insuranceAlert.severity >= 3 || driverLicenseAlert.severity >= 3) {
      vehicleScore = 15;
      reasons.push(`🚨 Xe hoặc bằng lái đã QUÁ HẠN đăng kiểm/bảo hiểm -> Phải gia hạn trước khi lăn bánh.`);
    } else {
      // Xe an toàn
      if (vehicle.status === 'IDLE' || vehicle.status === 'STANDBY' || !isVehicleBusy) {
        vehicleScore = 95;
        reasons.push(`🚛 Đầu xe ${vehicle.plate_number} đang RẢNH (đứng bãi chờ lệnh), đăng kiểm còn ${inspectionAlert.diffDays || 30} ngày.`);
      } else {
        vehicleScore = 70;
        reasons.push(`🚛 Đầu xe ${vehicle.plate_number} đang trực chiến.`);
      }

      // Kiểm tra dầu
      if (oilStatus.status === 'WARNING') {
        vehicleScore -= 10;
        reasons.push(`🔧 ODO dầu nhớt sắp đến hạn thay (${oilStatus.label}).`);
      } else if (oilStatus.status === 'EXPIRED') {
        vehicleScore -= 25;
        reasons.push(`⚠️ ODO dầu đã vượt hạn khuyến nghị (${oilStatus.label}).`);
      }
    }

    // ----------------------------------------------------
    // TIÊU CHÍ 4: TỐI ƯU TUYẾN QUEN & KINH NGHIỆM (TRỌNG SỐ 15%)
    // ----------------------------------------------------
    let routeScore = 60;
    if (selectedRoute) {
      // Đếm số lần tài xế đã chạy tuyến này
      const pastTripsOnRoute = history.filter(t => t.route_id === selectedRoute.id || 
        (t.dropoff_location && selectedRoute.destination && t.dropoff_location.toUpperCase().includes(selectedRoute.destination.toUpperCase())));

      if (pastTripsOnRoute.length >= 3) {
        routeScore = 100;
        reasons.push(`🛣️ Rất quen tuyến "${selectedRoute.route_name}" (đã chạy ${pastTripsOnRoute.length} lượt thành công) -> Hạn chế tối đa phát sinh đường sá.`);
      } else if (pastTripsOnRoute.length >= 1) {
        routeScore = 85;
        reasons.push(`🛣️ Đã có kinh nghiệm chạy tuyến "${selectedRoute.route_name}".`);
      } else {
        routeScore = 65;
        reasons.push(`🛣️ Tuyến mới đối với tài xế nhưng phù hợp với định mức cước xe.`);
      }
    } else if (params.dropoffLocation) {
      const dest = params.dropoffLocation.toUpperCase();
      const pastTripsOnYard = history.filter(t => t.dropoff_location && t.dropoff_location.toUpperCase().includes(dest));
      if (pastTripsOnYard.length > 0) {
        routeScore = 90;
        reasons.push(`📍 Đã quen giao hàng tại bãi/kho "${params.dropoffLocation}" (${pastTripsOnYard.length} lần).`);
      } else {
        routeScore = 70;
        reasons.push(`📍 Sẵn sàng phục vụ tuyến giao hàng "${params.dropoffLocation}".`);
      }
    } else {
      routeScore = 75;
      reasons.push(`📍 Xe và tài xế đa năng, đáp ứng tốt mọi cung đường.`);
    }

    // Đánh giá cont kẹp 2x20'
    if (isMultiCont) {
      reasons.push(`📦 Hỗ trợ cấu hình cont kẹp 2x20' (Mooc tiêu chuẩn kéo 2 vỏ an toàn).`);
    }

    // ----------------------------------------------------
    // TỔNG HỢP ĐIỂM (WEIGHTED SUM)
    // ----------------------------------------------------
    // Trọng số: 35% KPI + 25% Thể lực/Đảo cuốc + 25% Xe rảnh kỹ thuật + 15% Tuyến quen
    let totalScore = Math.round(
      (0.35 * kpiScore) +
      (0.25 * healthScore) +
      (0.25 * vehicleScore) +
      (0.15 * routeScore)
    );

    // Nếu xe nằm xưởng hoặc quá hạn nghiêm trọng, điểm tối đa chỉ là 15
    if (vehicle.status === 'MAINTENANCE' || inspectionAlert.severity >= 3) {
      totalScore = Math.min(totalScore, 15);
    }

    candidates.push({
      driver: {
        id: driver.id,
        fullName: driver.full_name,
        phone: driver.phone,
        areaId: driver.area_id,
        baseSalary: Number(driver.base_salary || 0),
        kpiTarget: kpiTarget,
        kpiCurrentRevenue: kpiInfo.revenue,
        kpiCurrentTrips: kpiInfo.trips,
        kpiPercent: kpiPercent,
        kpiStatus: kpiStatus,
        licenseExpiry: driver.license_expiry
      },
      vehicle: {
        id: vehicle.id,
        plateNumber: vehicle.plate_number,
        vehicleType: vehicle.vehicle_type,
        status: vehicle.status,
        currentKm: vehicle.current_km,
        inspectionExpiry: vehicle.inspection_expiry,
        insuranceExpiry: vehicle.insurance_expiry,
        oilStatus: oilStatus
      },
      score: totalScore,
      criteriaBreakdown: {
        kpi: {
          score: kpiScore,
          weight: '35%',
          comment: `KPI đạt ${kpiPercent}% chỉ tiêu tháng`
        },
        health: {
          score: healthScore,
          weight: '25%',
          comment: isBusyNow ? 'Đang có chuyến chạy' : 'Sẵn sàng nhận lệnh'
        },
        vehicleReadiness: {
          score: vehicleScore,
          weight: '25%',
          comment: vehicle.status === 'MAINTENANCE' ? 'Nằm xưởng' : 'Xe an toàn xuất bãi'
        },
        routeFit: {
          score: routeScore,
          weight: '15%',
          comment: 'Phù hợp tuyến đường & bãi cảng'
        }
      },
      reasons: reasons
    });
  }

  // 6. Sắp xếp giảm dần theo điểm
  candidates.sort((a, b) => b.score - a.score);

  // Gán xếp hạng và huy hiệu
  const recommendations = candidates.map((c, index) => {
    let badge = 'Phương án khả thi';
    let badgeColor = 'blue';

    if (index === 0 && c.score >= 70) {
      badge = '⭐ Đề Xuất Tối Ưu Nhất (Best Match)';
      badgeColor = 'amber';
    } else if (index === 1 && c.score >= 60) {
      badge = '🥈 Đề Xuất Dự Phòng Cao Cấp';
      badgeColor = 'emerald';
    } else if (index === 2) {
      badge = '🥉 Phương Án Khả Thi';
      badgeColor = 'indigo';
    }

    return {
      rank: index + 1,
      badge,
      badgeColor,
      ...c
    };
  });

  const bestMatch = recommendations[0] || null;

  // 7. Tạo đoạn tóm tắt phân tích của AI
  let analysisSummary = 'AI chưa tìm thấy đề xuất phù hợp.';
  if (bestMatch) {
    analysisSummary = `Hệ thống AI đề xuất chỉ định Tài xế ${bestMatch.driver.fullName} điều khiển Xe ${bestMatch.vehicle.plateNumber} (Điểm đánh giá: ${bestMatch.score}/100). Lý do chủ đạo: ${bestMatch.reasons[0] || ''}`;
  }

  return {
    targetDate,
    selectedRoute: selectedRoute ? { id: selectedRoute.id, name: selectedRoute.route_name } : null,
    totalEvaluated: candidates.length,
    bestMatch,
    recommendations,
    analysisSummary
  };
}

/**
 * Format số VND gọn gàng
 */
function formatVndNumber(amount) {
  return new Intl.NumberFormat('vi-VN').format(amount || 0) + ' ₫';
}
