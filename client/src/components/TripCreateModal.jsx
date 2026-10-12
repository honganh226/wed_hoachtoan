import React, { useState, useEffect } from 'react';
import { 
  PlusCircle, 
  Copy, 
  Truck, 
  User, 
  MapPin, 
  Coins, 
  CheckCircle2, 
  AlertCircle, 
  X, 
  Tag, 
  FileText,
  Percent,
  Layers,
  Container,
  AlertTriangle,
  MinusCircle,
  Sparkles
} from 'lucide-react';
import { 
  fetchVehicles, 
  fetchDrivers, 
  fetchRoutes, 
  createTripApi 
} from '../services/api.js';
import { validateIso6346 } from '../utils/iso6346.js';
import AiDispatchModal from './AiDispatchModal.jsx';

export default function TripCreateModal({ 
  isOpen, 
  onClose, 
  currentUser, 
  onTripCreated, 
  duplicateFromTrip = null 
}) {
  const [vehicles, setVehicles] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState(null);
  const [msg, setMsg] = useState(null);

  // Form State Cơ Bản
  const [tripDate, setTripDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [vehicleId, setVehicleId] = useState('');
  const [driverId, setDriverId] = useState('');
  const [routeId, setRouteId] = useState('');
  const [customerName, setCustomerName] = useState('TTP');
  const [pickupLocation, setPickupLocation] = useState('TÂN VŨ');
  const [dropoffLocation, setDropoffLocation] = useState('KCN BÌNH XUYÊN');
  const [vatType, setVatType] = useState('V'); // 'V' (đã gồm VAT) | 'NV' (chưa VAT)
  const [tripRevenue, setTripRevenue] = useState(3200000); // Tiền cước VND nguyên (Cont 1 hoặc chuyến đơn)
  const [driverSalary, setDriverSalary] = useState(550000); // Lương chuyến lái xe VND nguyên
  const [notes, setNotes] = useState('');

  // Task 3.2: Cont Kẹp (2x20') State
  const [isMultiContainer, setIsMultiContainer] = useState(false);
  const [containerNumber, setContainerNumber] = useState('');
  const [containerSize, setContainerSize] = useState('40');
  const [secondContainerNumber, setSecondContainerNumber] = useState('');
  const [secondPickupLocation, setSecondPickupLocation] = useState('ĐÌNH VŨ');
  const [secondDropoffLocation, setSecondDropoffLocation] = useState('KCN BÌNH XUYÊN');
  const [secondContRevenue, setSecondContRevenue] = useState(2500000); // Cước cont kẹp thứ hai
  const [secondContDriverPay, setSecondContDriverPay] = useState(250000); // Phụ cấp kẹp cont cho tài xế

  // Validation ISO 6346 Real-time
  const cont1Validation = validateIso6346(containerNumber);
  const cont2Validation = validateIso6346(secondContainerNumber);

  // Task 6.4: State AI Dispatch
  const [isAiDispatchModalOpen, setIsAiDispatchModalOpen] = useState(false);
  const [aiBannerInfo, setAiBannerInfo] = useState(null);

  const handleSelectAiRecommendation = (rec) => {
    if (!rec) return;
    if (rec.vehicle?.id) setVehicleId(rec.vehicle.id);
    if (rec.driver?.id) setDriverId(rec.driver.id);
    setAiBannerInfo({
      driverName: rec.driver.fullName,
      plateNumber: rec.vehicle.plateNumber,
      score: rec.score,
      reason: rec.reasons?.[0] || 'Phù hợp 4 tiêu chí tối ưu'
    });
  };

  // Tải danh mục hỗ trợ
  useEffect(() => {
    if (isOpen) {
      setErr(null);
      setMsg(null);
      loadDropdowns();
      if (duplicateFromTrip) {
        fillFromDuplicate(duplicateFromTrip);
      }
    }
  }, [isOpen, duplicateFromTrip]);

  const loadDropdowns = async () => {
    try {
      setLoading(true);
      const [vRes, dRes, rRes] = await Promise.all([
        fetchVehicles().catch(() => ({ success: false })),
        fetchDrivers().catch(() => ({ success: false })),
        fetchRoutes().catch(() => ({ success: false }))
      ]);

      if (vRes.success) setVehicles(vRes.data || []);
      if (dRes.success) setDrivers(dRes.data || []);
      if (rRes.success) setRoutes(rRes.data || []);

      // Mặc định chọn xe & tài xế đầu tiên nếu chưa có
      if (!duplicateFromTrip) {
        if (vRes.data?.length > 0 && !vehicleId) setVehicleId(vRes.data[0].id);
        if (dRes.data?.length > 0 && !driverId) setDriverId(dRes.data[0].id);
        if (rRes.data?.length > 0 && !routeId) {
          setRouteId(rRes.data[0].id);
          applyRouteDefaults(rRes.data[0]);
        }
      }
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  };

  const fillFromDuplicate = (source) => {
    setTripDate(new Date().toISOString().slice(0, 10));
    if (source.vehicle_id) setVehicleId(source.vehicle_id);
    if (source.driver_id) setDriverId(source.driver_id);
    if (source.route_id) setRouteId(source.route_id);
    if (source.customer_name) setCustomerName(source.customer_name);
    if (source.pickup_location) setPickupLocation(source.pickup_location);
    if (source.dropoff_location) setDropoffLocation(source.dropoff_location);
    if (source.vat_type) setVatType(source.vat_type);
    if (source.trip_revenue) setTripRevenue(source.trip_revenue);
    if (source.driver_salary) setDriverSalary(source.driver_salary);
    setContainerNumber(''); // Reset số cont để nhập cont mới
    setSecondContainerNumber('');
    setIsMultiContainer(false);
    setNotes(`Nhân bản từ ${source.trip_code}`);
  };

  const applyRouteDefaults = (route) => {
    if (!route) return;
    if (route.default_price) setTripRevenue(route.default_price);
    if (route.default_driver_pay) setDriverSalary(route.default_driver_pay);
    if (route.departure) {
      setPickupLocation(route.departure);
      setSecondPickupLocation(route.departure);
    }
    if (route.destination) {
      setDropoffLocation(route.destination);
      setSecondDropoffLocation(route.destination);
    }
  };

  const handleRouteChange = (e) => {
    const selectedId = e.target.value;
    setRouteId(selectedId);
    const found = routes.find(r => r.id === selectedId);
    if (found) {
      applyRouteDefaults(found);
    }
  };

  // Toggle Cont Kẹp 2x20'
  const handleToggleMultiContainer = () => {
    if (!isMultiContainer) {
      setIsMultiContainer(true);
      setContainerSize('20');
      // Khi kẹp thêm cont 2, gợi ý tăng lương công chuyến tài xế
      setDriverSalary(prev => Math.round(Number(prev) || 0) + Number(secondContDriverPay));
    } else {
      setIsMultiContainer(false);
      setContainerSize('40');
      setSecondContainerNumber('');
      setDriverSalary(prev => Math.max(0, Math.round(Number(prev) || 0) - Number(secondContDriverPay)));
    }
  };

  // Tính thuế VAT và tổng tiền cước cộng dồn
  // Hợp đồng kỹ thuật: Số nguyên VND Integer
  const calculateTotals = () => {
    const baseRev = Math.round(Number(tripRevenue) || 0);
    const extraRev = isMultiContainer ? Math.round(Number(secondContRevenue) || 0) : 0;
    const totalRawRev = baseRev + extraRev;

    let vat = 0;
    let total = totalRawRev;
    if (vatType === 'V') {
      vat = Math.round((totalRawRev * 8) / 108); // Chuẩn ngành vận tải 8% trong tổng giá
    }
    return { rev: totalRawRev, vat, total, baseRev, extraRev };
  };

  const { rev, vat, total, baseRev, extraRev } = calculateTotals();

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      setSubmitting(true);
      setErr(null);

      // Chuẩn bị danh sách container
      const containerList = [];
      if (containerNumber || pickupLocation || dropoffLocation) {
        containerList.push({
          container_number: containerNumber ? containerNumber.trim().toUpperCase() : '',
          container_size: isMultiContainer ? '20' : containerSize,
          is_second_cont: 0,
          pickup_yard: pickupLocation,
          dropoff_yard: dropoffLocation,
          notes: isMultiContainer ? 'Cont 1 (Chính)' : ''
        });
      }

      if (isMultiContainer && (secondContainerNumber || secondPickupLocation || secondDropoffLocation)) {
        containerList.push({
          container_number: secondContainerNumber ? secondContainerNumber.trim().toUpperCase() : '',
          container_size: '20',
          is_second_cont: 1,
          pickup_yard: secondPickupLocation,
          dropoff_yard: secondDropoffLocation,
          notes: 'Cont 2 (Kẹp thêm 2x20\')'
        });
      }

      const payload = {
        trip_date: tripDate,
        vehicle_id: vehicleId,
        driver_id: driverId,
        route_id: routeId,
        customer_name: customerName,
        pickup_location: pickupLocation,
        dropoff_location: dropoffLocation,
        vat_type: vatType,
        trip_revenue: rev, // Tổng doanh thu cộng dồn 2 cont
        driver_salary: Math.round(Number(driverSalary) || 0),
        is_multi_container: isMultiContainer,
        containers: containerList,
        container_number: containerNumber ? containerNumber.trim().toUpperCase() : '',
        container_size: isMultiContainer ? '20' : containerSize,
        notes: isMultiContainer 
          ? `${notes ? notes + ' | ' : ''}Cuốc kẹp 2x20' (Cont 1: ${containerNumber || 'N/A'}, Cont 2: ${secondContainerNumber || 'N/A'})` 
          : notes
      };

      const res = await createTripApi(payload);
      if (res.success) {
        setMsg(`Tạo mới chuyến xe ${res.data.trip_code} thành công!${isMultiContainer ? ' (Đã lưu cuốc kẹp 2x20\')' : ''}`);
        setTimeout(() => {
          if (onTripCreated) onTripCreated(res.data);
          onClose();
        }, 800);
      } else {
        setErr(res.error || 'Tạo chuyến xe thất bại');
      }
    } catch (e) {
      setErr(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const formatVnd = (amount) => {
    return new Intl.NumberFormat('vi-VN').format(amount || 0) + ' ₫';
  };

  // Render badge trạng thái kiểm tra ISO 6346
  const renderIsoBadge = (validation) => {
    if (!validation || validation.status === 'EMPTY') return null;

    if (validation.status === 'VALID') {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
          <CheckCircle2 className="w-3 h-3 mr-1 text-emerald-600" />
          <span>✓ ISO 6346 Chuẩn (Digit: {validation.expectedCheckDigit})</span>
        </span>
      );
    }

    if (validation.status === 'INVALID_CHECK_DIGIT') {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-300">
          <AlertCircle className="w-3 h-3 mr-1 text-rose-600" />
          <span>Sai Check Digit (Gõ: {validation.actualCheckDigit} ➔ Chuẩn: {validation.expectedCheckDigit})</span>
        </span>
      );
    }

    if (validation.status === 'INCOMPLETE') {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-amber-50 text-amber-700 border border-amber-200">
          <span>{validation.message}</span>
        </span>
      );
    }

    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-rose-50 text-rose-700 border border-rose-200">
        <AlertTriangle className="w-3 h-3 mr-1 text-rose-500" />
        <span>{validation.message}</span>
      </span>
    );
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-blue-600 rounded-xl">
              {duplicateFromTrip ? <Copy className="w-5 h-5 text-white" /> : <PlusCircle className="w-5 h-5 text-white" />}
            </div>
            <div>
              <h3 className="font-bold text-base">
                {duplicateFromTrip ? `Nhân Bản Chuyến Xe (${duplicateFromTrip.trip_code})` : 'Tạo Chuyến Xe Mới (Task 3.1 & Task 3.2 MVP)'}
              </h3>
              <p className="text-xs text-slate-400">
                Gợi ý cước mẫu, Ký hiệu VAT [V]/[NV] & Hỗ trợ Kẹp 2 Cont 20' (ISO 6346)
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Thông báo lỗi / thành công */}
        {err && (
          <div className="mx-6 mt-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
            <span>{err}</span>
          </div>
        )}
        {msg && (
          <div className="mx-6 mt-4 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
            <span>{msg}</span>
          </div>
        )}

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-4 text-xs">
          {/* Row 1: Ngày Chuyến & Khách Hàng */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Ngày Chuyến (YYYY-MM-DD) <span className="text-rose-500">*</span>
              </label>
              <input
                type="date"
                required
                value={tripDate}
                onChange={(e) => setTripDate(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Khách Hàng / Chủ Hàng <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value.toUpperCase())}
                placeholder="VD: TTP, VTM, ĐẠI THỊNH..."
                className="w-full px-3 py-2 text-xs uppercase font-semibold border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Task 6.4: Thanh Kích Hoạt AI Gợi Ý Phân Bổ Nhanh & Banner */}
          <div className="pt-1">
            <div className="flex items-center justify-between pb-1.5">
              <span className="text-xs font-bold text-slate-700 flex items-center space-x-1.5">
                <span>Phân Bổ Đầu Xe & Lái Xe:</span>
              </span>
              <button
                type="button"
                onClick={() => setIsAiDispatchModalOpen(true)}
                className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-gradient-to-r from-purple-600 via-indigo-600 to-blue-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded-xl text-xs font-bold shadow-md shadow-indigo-500/20 active:scale-95 transition-all"
                title="Quét 4 tiêu chí: KPI chậm, Thể lực, Xe rảnh ODO, Tuyến quen"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-300 animate-pulse" />
                <span>🤖 AI Gợi Ý Phân Bổ Nhanh</span>
              </button>
            </div>

            {aiBannerInfo && (
              <div className="mb-2 p-2.5 rounded-xl bg-purple-50 border border-purple-200 text-purple-900 flex items-start justify-between text-xs animate-fadeIn">
                <div className="flex items-start space-x-2">
                  <Sparkles className="w-4 h-4 text-purple-600 mt-0.5 shrink-0" />
                  <div>
                    <div className="font-bold flex items-center space-x-1.5">
                      <span>Đã áp dụng gợi ý AI:</span>
                      <span className="text-indigo-700">{aiBannerInfo.driverName}</span>
                      <span>•</span>
                      <span className="text-blue-700 font-mono">{aiBannerInfo.plateNumber}</span>
                      <span className="px-1.5 py-0.5 bg-purple-200 text-purple-800 text-[10px] rounded-full font-bold">
                        {aiBannerInfo.score}/100đ
                      </span>
                    </div>
                    <div className="text-[11px] text-purple-700 mt-0.5">
                      {aiBannerInfo.reason}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setAiBannerInfo(null)}
                  className="text-purple-400 hover:text-purple-700 text-xs ml-2"
                >
                  ✕
                </button>
              </div>
            )}
          </div>

          {/* Row 2: Đầu Xe & Lái Xe */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center space-x-1">
                <Truck className="w-3.5 h-3.5 text-blue-600" />
                <span>Đầu Xe Gán Chạy</span>
              </label>
              <select
                value={vehicleId}
                onChange={(e) => setVehicleId(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none font-mono font-bold"
              >
                <option value="">-- Chọn đầu xe --</option>
                {vehicles.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.plate_number} ({v.driver_name || 'Chưa gán tài xế'})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center space-x-1">
                <User className="w-3.5 h-3.5 text-indigo-600" />
                <span>Tài Xế Nhận Cuốc</span>
              </label>
              <select
                value={driverId}
                onChange={(e) => setDriverId(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none font-semibold"
              >
                <option value="">-- Chọn tài xế --</option>
                {drivers.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.full_name} (Khu: {d.area_id || 'Chung'})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Row 3: Tuyến Đường */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center justify-between">
              <span className="flex items-center space-x-1">
                <MapPin className="w-3.5 h-3.5 text-emerald-600" />
                <span>Tuyến Đường Vận Chuyển (Tự động điền cước mẫu & công lái)</span>
              </span>
              <span className="text-[10px] text-blue-600 font-normal">Hợp đồng mẫu</span>
            </label>
            <select
              value={routeId}
              onChange={handleRouteChange}
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none font-medium"
            >
              <option value="">-- Chọn tuyến đường tiêu chuẩn --</option>
              {routes.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.route_name} • Cước: {formatVnd(r.default_price)} • Lương: {formatVnd(r.default_driver_pay)}
                </option>
              ))}
            </select>
          </div>

          {/* Row 4: Điểm Nâng / Hạ Cont 1 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                {isMultiContainer ? 'Bãi Nâng Cont 1 (20\')' : 'Nơi Lấy Hàng / Bãi Nâng'}
              </label>
              <input
                type="text"
                value={pickupLocation}
                onChange={(e) => setPickupLocation(e.target.value)}
                placeholder="VD: TÂN VŨ, ĐÌNH VŨ..."
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                {isMultiContainer ? 'Bãi Hạ Cont 1 (20\')' : 'Nơi Giao Hàng / Bãi Hạ'}
              </label>
              <input
                type="text"
                value={dropoffLocation}
                onChange={(e) => setDropoffLocation(e.target.value)}
                placeholder="VD: KCN BÌNH XUYÊN, TIL..."
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Row 5: Ký Hiệu VAT, Cước Vận Chuyển & Lương Lái Xe */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center space-x-1">
                <Tag className="w-3.5 h-3.5 text-blue-600" />
                <span>Ký Hiệu VAT</span>
              </label>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => setVatType('V')}
                  className={`py-1.5 text-xs font-bold rounded-lg border transition-all ${
                    vatType === 'V'
                      ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  [V] Đã VAT
                </button>
                <button
                  type="button"
                  onClick={() => setVatType('NV')}
                  className={`py-1.5 text-xs font-bold rounded-lg border transition-all ${
                    vatType === 'NV'
                      ? 'bg-amber-600 text-white border-amber-600 shadow-xs'
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  [NV] Chưa VAT
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                {isMultiContainer ? 'Cước Cont 1 (VND)' : 'Cước Vận Chuyển (VND)'} <span className="text-rose-500">*</span>
              </label>
              <input
                type="number"
                step="1000"
                required
                value={tripRevenue}
                onChange={(e) => setTripRevenue(e.target.value)}
                className="w-full px-3 py-2 text-xs font-mono font-bold text-slate-900 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
              <span className="text-[10px] text-slate-500 mt-0.5 block">{formatVnd(baseRev)}</span>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Tổng Lương Lái Xe (VND)
              </label>
              <input
                type="number"
                step="1000"
                value={driverSalary}
                onChange={(e) => setDriverSalary(e.target.value)}
                className="w-full px-3 py-2 text-xs font-mono font-bold text-indigo-700 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
              <span className="text-[10px] text-slate-500 mt-0.5 block">{formatVnd(driverSalary)}</span>
            </div>
          </div>

          {/* ============================================================ */}
          {/* TASK 3.2: KHỐI CONTAINER CHÍNH & NÚT KẸP THÊM CONT 20 THỨ HAI */}
          {/* ============================================================ */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 font-bold rounded text-[10px]">
                  Task 3.2
                </span>
                <span className="font-bold text-slate-800 text-xs flex items-center space-x-1">
                  <Container className="w-4 h-4 text-indigo-600" />
                  <span>{isMultiContainer ? 'Container 1 (20 Feet Chính)' : 'Thông Tin Container Vận Chuyển'}</span>
                </span>
              </div>

              {/* Nút Kẹp Cont 2x20 */}
              <button
                type="button"
                onClick={handleToggleMultiContainer}
                className={`px-3 py-1.5 rounded-xl font-bold text-xs flex items-center space-x-1.5 transition-all ${
                  isMultiContainer 
                    ? 'bg-rose-100 text-rose-700 border border-rose-200 hover:bg-rose-200'
                    : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm shadow-indigo-500/20 active:scale-95'
                }`}
              >
                {isMultiContainer ? (
                  <>
                    <MinusCircle className="w-3.5 h-3.5" />
                    <span>Hủy Cont Kẹp</span>
                  </>
                ) : (
                  <>
                    <PlusCircle className="w-3.5 h-3.5" />
                    <span>[+ Kẹp Thêm Cont 20 Thứ Hai]</span>
                  </>
                )}
              </button>
            </div>

            {/* Container 1 Info */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-slate-700">
                    Mã Cont 1 (11 ký tự ISO 6346)
                  </label>
                  {renderIsoBadge(cont1Validation)}
                </div>
                <input
                  type="text"
                  value={containerNumber}
                  onChange={(e) => setContainerNumber(e.target.value.toUpperCase())}
                  placeholder="VD: MSMU5022544"
                  maxLength={11}
                  className={`w-full px-3 py-2 text-xs font-mono uppercase tracking-wider border rounded-xl focus:ring-2 focus:outline-none ${
                    cont1Validation.status === 'VALID' 
                      ? 'border-emerald-500 focus:ring-emerald-500 bg-emerald-50/20' 
                      : cont1Validation.status === 'INVALID_CHECK_DIGIT'
                      ? 'border-rose-400 focus:ring-rose-400 bg-rose-50/20'
                      : 'border-slate-300 focus:ring-blue-500'
                  }`}
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Kích Thước Cont 1
                </label>
                <select
                  value={containerSize}
                  disabled={isMultiContainer}
                  onChange={(e) => setContainerSize(e.target.value)}
                  className={`w-full px-3 py-2 text-xs border border-slate-300 rounded-xl bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none ${
                    isMultiContainer ? 'bg-slate-100 text-slate-500 font-bold' : ''
                  }`}
                >
                  <option value="20">Cont 20' (20 feet)</option>
                  <option value="40">Cont 40' (40 feet)</option>
                  <option value="45">Cont 45' (45 feet)</option>
                </select>
                {isMultiContainer && (
                  <span className="text-[10px] text-indigo-600 font-medium mt-0.5 block">
                    Khóa 20' khi chạy kẹp
                  </span>
                )}
              </div>
            </div>

            {/* SECTION: CONTAINER 2 (KẸP 2x20') NẾU ĐƯỢC KÍCH HOẠT */}
            {isMultiContainer && (
              <div className="mt-3 p-3.5 bg-indigo-50/60 border border-indigo-200 rounded-xl space-y-3 animate-in fade-in duration-200">
                <div className="flex items-center justify-between border-b border-indigo-100 pb-2">
                  <div className="flex items-center space-x-1.5">
                    <span className="w-2 h-2 rounded-full bg-indigo-600 animate-pulse" />
                    <span className="font-bold text-indigo-900 text-xs">
                      Container Thứ Hai (20' Kẹp)
                    </span>
                    <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-indigo-200 text-indigo-800">
                      2x20' DOUBLE
                    </span>
                  </div>
                  {renderIsoBadge(cont2Validation)}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Mã Cont 2 (11 ký tự ISO 6346) <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={secondContainerNumber}
                      onChange={(e) => setSecondContainerNumber(e.target.value.toUpperCase())}
                      placeholder="VD: TCNU9183777"
                      maxLength={11}
                      className={`w-full px-3 py-2 text-xs font-mono uppercase tracking-wider border rounded-xl focus:ring-2 focus:outline-none ${
                        cont2Validation.status === 'VALID' 
                          ? 'border-emerald-500 focus:ring-emerald-500 bg-emerald-50/20' 
                          : cont2Validation.status === 'INVALID_CHECK_DIGIT'
                          ? 'border-rose-400 focus:ring-rose-400 bg-rose-50/20'
                          : 'border-slate-300 focus:ring-indigo-500'
                      }`}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Cước Cont 2 Cộng Dồn (VND)
                    </label>
                    <input
                      type="number"
                      step="1000"
                      value={secondContRevenue}
                      onChange={(e) => setSecondContRevenue(e.target.value)}
                      className="w-full px-3 py-2 text-xs font-mono font-bold text-indigo-900 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                    <span className="text-[10px] text-slate-500 mt-0.5 block">{formatVnd(extraRev)}</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Bãi Nâng Cont 2
                    </label>
                    <input
                      type="text"
                      value={secondPickupLocation}
                      onChange={(e) => setSecondPickupLocation(e.target.value)}
                      placeholder="VD: ĐÌNH VŨ, NAM HẢI ĐÌNH VŨ..."
                      className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Bãi Hạ Cont 2
                    </label>
                    <input
                      type="text"
                      value={secondDropoffLocation}
                      onChange={(e) => setSecondDropoffLocation(e.target.value)}
                      placeholder="VD: KCN BÌNH XUYÊN, TIL..."
                      className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Bảng Tóm Tắt Doanh Thu & VAT Realtime */}
          <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-xl flex items-center justify-between text-xs">
            <div className="space-y-0.5">
              <span className="text-emerald-800 font-bold flex items-center space-x-1">
                <Coins className="w-3.5 h-3.5 text-emerald-600" />
                <span>Tổng Cước Hóa Đơn {isMultiContainer ? '(Cộng Gộp 2 Cont)' : ''}:</span>
              </span>
              <p className="text-[11px] text-slate-600">
                {isMultiContainer ? (
                  <span>Cont 1: {formatVnd(baseRev)} + Cont 2: {formatVnd(extraRev)} • </span>
                ) : null}
                Ký hiệu: <b>[{vatType}]</b> • Tiền thuế VAT: <b>{formatVnd(vat)}</b>
              </p>
            </div>
            <div className="text-right">
              <span className="text-base font-mono font-extrabold text-emerald-700">
                {formatVnd(total)}
              </span>
              <span className="text-[10px] text-slate-500 block">Số nguyên VND</span>
            </div>
          </div>

          {/* Ghi chú */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Ghi Chú Chuyến</label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ghi chú về điểm trả, phụ phí hoặc chứng từ..."
              className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
          </div>
        </form>

        {/* Footer */}
        <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 transition-colors"
          >
            Hủy Bỏ
          </button>

          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-md shadow-blue-500/20 active:scale-95 transition-all flex items-center space-x-2"
          >
            {duplicateFromTrip ? <Copy className="w-4 h-4" /> : <PlusCircle className="w-4 h-4" />}
            <span>{submitting ? 'Đang Lưu Chuyến...' : (duplicateFromTrip ? 'Xác Nhận Nhân Bản' : (isMultiContainer ? 'Tạo Chuyến Cont Kẹp 2x20\'' : 'Tạo Chuyến Xe Ngay'))}</span>
          </button>
        </div>
      </div>

      {/* Modal AI Gợi Ý Phân Bổ Nhanh (Task 6.4) */}
      <AiDispatchModal
        isOpen={isAiDispatchModalOpen}
        onClose={() => setIsAiDispatchModalOpen(false)}
        tripParams={{
          routeId,
          customerName,
          tripDate,
          pickupLocation,
          dropoffLocation,
          isMultiContainer
        }}
        onSelectRecommendation={handleSelectAiRecommendation}
      />
    </div>
  );
}
