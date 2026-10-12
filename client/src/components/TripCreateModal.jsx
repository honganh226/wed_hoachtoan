import { todayInVietnam } from '../utils/businessDate.js';
import React, { useState, useEffect, useRef } from 'react';
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
  Sparkles,
  Building2,
  Fuel,
  Receipt,
  Plus,
  Trash2,
  HelpCircle,
  Calendar
  ,FileSpreadsheet
} from 'lucide-react';
import { 
  fetchVehicles, 
  fetchDrivers, 
  fetchRoutes, 
  fetchCustomersApi,
  fetchSubcontractorsApi,
  createVehicleApi,
  createDriverApi,
  createRouteApi,
  createCustomerApi,
  createSubcontractorApi,
  createTripApi 
} from '../services/api.js';
import { validateIso6346 } from '../utils/iso6346.js';
import AiDispatchModal from './AiDispatchModal.jsx';

export default function TripCreateModal({ 
  isOpen, 
  onClose, 
  currentUser, 
  onTripCreated, 
  duplicateFromTrip = null,
  onSwitchToBatch,
  onSwitchToExcelImport
}) {
  const requestRef = useRef(null);
  const [vehicles, setVehicles] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [subcontractors, setSubcontractors] = useState([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState(null);
  const [msg, setMsg] = useState(null);

  // Loại xe: 'INTERNAL' (Xe công ty) | 'SUBCONTRACTOR' (Xe thuê ngoài)
  const [vehicleSource, setVehicleSource] = useState('INTERNAL');

  // Form State Cơ Bản - BỎ TOÀN BỘ GIÁ TRỊ MẪU MẶC ĐỊNH
  const [tripDate, setTripDate] = useState(() => todayInVietnam());
  const [vehicleId, setVehicleId] = useState('');
  const [vehiclePlate, setVehiclePlate] = useState('');
  const [driverId, setDriverId] = useState('');
  const [driverName, setDriverName] = useState('');
  const [subcontractorId, setSubcontractorId] = useState('');
  const [subcontractorName, setSubcontractorName] = useState('');
  
  // Khách hàng & Tuyến
  const [customerName, setCustomerName] = useState('');
  const [routeId, setRouteId] = useState('');
  const [routeName, setRouteName] = useState('');
  const [pickupLocation, setPickupLocation] = useState('');
  const [dropoffLocation, setDropoffLocation] = useState('');
  const [suggestedPrice, setSuggestedPrice] = useState(null);

  // DOANH THU: Cước vào — tiền khách trả, đã gồm VAT
  const [vatType, setVatType] = useState('V'); // 'V' (đã gồm VAT) | 'NV' (chưa VAT)
  const [tripRevenue, setTripRevenue] = useState(''); // Tiền cước vào

  // CHI PHÍ CHI TIẾT
  const [subcontractorCost, setSubcontractorCost] = useState(''); // Cước ra — tiền thuê xe ngoài
  const [tollFee, setTollFee] = useState(''); // Phí cầu đường / cao tốc
  const [portFee, setPortFee] = useState(''); // Phí cảng / nâng hạ
  const [parkingFee, setParkingFee] = useState(''); // Phí bến bãi / đỗ xe
  const [handlingFee, setHandlingFee] = useState(''); // Tiền bốc xếp
  const [mealAllowance, setMealAllowance] = useState(''); // Tiền ăn / phụ cấp chuyến (tách riêng khỏi lương)
  const [fuelLiters, setFuelLiters] = useState(''); // Dầu cấp: nhập số lít riêng
  const [otherExpenses, setOtherExpenses] = useState([]); // Mảng [{ name, amount }]

  // LƯƠNG TÀI XẾ (Nhập riêng, chưa tính vào lãi tạm tính chuyến)
  const [driverSalary, setDriverSalary] = useState('');

  // TRẠNG THÁI THANH TOÁN HAI CHIỀU
  const [customerPaymentStatus, setCustomerPaymentStatus] = useState('CHUA_TT'); // CHUA_TT | TUOI | X | DA_TT | DOI_TRU
  const [subcontractorPaymentStatus, setSubcontractorPaymentStatus] = useState('CHUA_TT'); // CHUA_TT | DA_TT
  const [notes, setNotes] = useState('');

  // Cont Kẹp (2x20') State
  const [isMultiContainer, setIsMultiContainer] = useState(false);
  const [containerNumber, setContainerNumber] = useState('');
  const [containerSize, setContainerSize] = useState('40');
  const [secondContainerNumber, setSecondContainerNumber] = useState('');
  const [secondPickupLocation, setSecondPickupLocation] = useState('');
  const [secondDropoffLocation, setSecondDropoffLocation] = useState('');
  const [secondContRevenue, setSecondContRevenue] = useState('');

  // State các Modal con Thêm Nhanh Danh Mục
  const [quickAddType, setQuickAddType] = useState(null); // 'VEHICLE' | 'DRIVER' | 'ROUTE' | 'CUSTOMER' | 'SUBCONTRACTOR'
  const [quickAddInput, setQuickAddInput] = useState({});
  const [quickAddLoading, setQuickAddLoading] = useState(false);
  const [quickAddErr, setQuickAddErr] = useState(null);

  // State AI Dispatch
  const [isAiDispatchModalOpen, setIsAiDispatchModalOpen] = useState(false);
  const [aiBannerInfo, setAiBannerInfo] = useState(null);

  // Validation ISO 6346 Real-time
  const cont1Validation = validateIso6346(containerNumber);
  const cont2Validation = validateIso6346(secondContainerNumber);

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

  const resetForm = () => {
    setTripDate(todayInVietnam());
    setVehicleSource('INTERNAL');
    setVehicleId('');
    setVehiclePlate('');
    setDriverId('');
    setDriverName('');
    setSubcontractorId('');
    setSubcontractorName('');
    setCustomerName('');
    setRouteId('');
    setRouteName('');
    setPickupLocation('');
    setDropoffLocation('');
    setSuggestedPrice(null);
    setVatType('V');
    setTripRevenue('');
    setSubcontractorCost('');
    setTollFee('');
    setPortFee('');
    setParkingFee('');
    setHandlingFee('');
    setMealAllowance('');
    setFuelLiters('');
    setOtherExpenses([]);
    setDriverSalary('');
    setCustomerPaymentStatus('CHUA_TT');
    setSubcontractorPaymentStatus('CHUA_TT');
    setNotes('');
    setIsMultiContainer(false);
    setContainerNumber('');
    setContainerSize('40');
    setSecondContainerNumber('');
    setSecondPickupLocation('');
    setSecondDropoffLocation('');
    setSecondContRevenue('');
    setAiBannerInfo(null);
  };

  const loadDropdowns = async () => {
    try {
      setLoading(true);
      const [vRes, dRes, rRes, cRes, sRes] = await Promise.all([
        fetchVehicles().catch(() => ({ success: false })),
        fetchDrivers().catch(() => ({ success: false })),
        fetchRoutes().catch(() => ({ success: false })),
        fetchCustomersApi().catch(() => ({ success: false })),
        fetchSubcontractorsApi().catch(() => ({ success: false }))
      ]);

      if (vRes.success) setVehicles(vRes.data || []);
      if (dRes.success) setDrivers(dRes.data || []);
      if (rRes.success) setRoutes(rRes.data || []);
      if (cRes.success) setCustomers(cRes.data || []);
      if (sRes.success) setSubcontractors(sRes.data || []);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  };

  const fillFromDuplicate = (source) => {
    setTripDate(todayInVietnam());
    const isSub = Boolean(source.is_subcontractor);
    setVehicleSource(isSub ? 'SUBCONTRACTOR' : 'INTERNAL');
    if (source.vehicle_id) setVehicleId(source.vehicle_id);
    if (source.vehicle_plate) setVehiclePlate(source.vehicle_plate);
    if (source.driver_id) setDriverId(source.driver_id);
    if (source.driver_name) setDriverName(source.driver_name);
    if (source.subcontractor_id) setSubcontractorId(source.subcontractor_id);
    if (source.subcontractor_name) setSubcontractorName(source.subcontractor_name);
    if (source.customer_name) setCustomerName(source.customer_name);
    if (source.route_id) setRouteId(source.route_id);
    if (source.route_name) setRouteName(source.route_name);
    if (source.pickup_location) setPickupLocation(source.pickup_location);
    if (source.dropoff_location) setDropoffLocation(source.dropoff_location);
    if (source.vat_type) setVatType(source.vat_type);
    if (source.trip_revenue || source.total_revenue) setTripRevenue(String(source.total_revenue || source.trip_revenue));
    if (source.subcontractor_cost) setSubcontractorCost(String(source.subcontractor_cost));
    if (source.toll_fee) setTollFee(String(source.toll_fee));
    if (source.port_fee) setPortFee(String(source.port_fee));
    if (source.parking_fee) setParkingFee(String(source.parking_fee));
    if (source.handling_fee) setHandlingFee(String(source.handling_fee));
    if (source.meal_allowance) setMealAllowance(String(source.meal_allowance));
    if (source.fuel_liters) setFuelLiters(String(source.fuel_liters));
    if (source.driver_salary) setDriverSalary(String(source.driver_salary));
    setContainerNumber('');
    setSecondContainerNumber('');
    setIsMultiContainer(false);
    setNotes(`Nhân bản từ ${source.trip_code}`);
  };

  // Chọn xe công ty -> Gợi ý tài xế mặc định
  const handleSelectVehicle = (selectedId) => {
    setVehicleId(selectedId);
    const found = vehicles.find(v => v.id === selectedId);
    if (found) {
      setVehiclePlate(found.plate_number);
      if (found.default_driver_id && !driverId) {
        setDriverId(found.default_driver_id);
        const drv = drivers.find(d => d.id === found.default_driver_id);
        if (drv) setDriverName(drv.full_name);
      }
    } else {
      setVehiclePlate('');
    }
  };

  // Chọn tài xế
  const handleSelectDriver = (selectedId) => {
    setDriverId(selectedId);
    const found = drivers.find(d => d.id === selectedId);
    if (found) {
      setDriverName(found.full_name);
      if (found.default_vehicle_id && !vehicleId) {
        setVehicleId(found.default_vehicle_id);
        const v = vehicles.find(item => item.id === found.default_vehicle_id);
        if (v) setVehiclePlate(v.plate_number);
      }
    } else {
      setDriverName('');
    }
  };

  // Chọn tuyến -> Gợi ý giá tham khảo (chỉ gợi ý, KHÔNG tự ghi đè nếu đã nhập)
  const handleSelectRoute = (selectedId) => {
    setRouteId(selectedId);
    const found = routes.find(r => r.id === selectedId);
    if (found) {
      setRouteName(found.route_name);
      if (found.departure && !pickupLocation) setPickupLocation(found.departure);
      if (found.destination && !dropoffLocation) setDropoffLocation(found.destination);
      if (found.default_price) setSuggestedPrice(found.default_price);
      // Nếu chưa nhập cước và người dùng muốn gợi ý
      if (!tripRevenue && found.default_price) {
        setTripRevenue(String(found.default_price));
      }
      if (!driverSalary && found.default_driver_pay) {
        setDriverSalary(String(found.default_driver_pay));
      }
    } else {
      setRouteName('');
      setSuggestedPrice(null);
    }
  };

  // Áp dụng cước gợi ý từ tuyến
  const handleApplySuggestedPrice = () => {
    if (suggestedPrice) {
      setTripRevenue(String(suggestedPrice));
    }
  };

  // Thêm dòng chi phí khác
  const handleAddOtherExpense = () => {
    setOtherExpenses(prev => [...prev, { name: '', amount: '' }]);
  };

  const handleUpdateOtherExpense = (index, field, value) => {
    setOtherExpenses(prev => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
  };

  const handleRemoveOtherExpense = (index) => {
    setOtherExpenses(prev => prev.filter((_, idx) => idx !== index));
  };

  // TÍNH TOÁN REAL-TIME DOANH THU, TỔNG CHI PHÍ VÀ LÃI TẠM TÍNH
  const calculateTotals = () => {
    const rev1 = Math.round(Number(tripRevenue) || 0);
    const rev2 = isMultiContainer ? Math.round(Number(secondContRevenue) || 0) : 0;
    const totalCuocVao = rev1 + rev2;

    const cuocRa = vehicleSource === 'SUBCONTRACTOR' ? Math.round(Number(subcontractorCost) || 0) : 0;
    const toll = Math.round(Number(tollFee) || 0);
    const port = Math.round(Number(portFee) || 0);
    const parking = Math.round(Number(parkingFee) || 0);
    const handling = Math.round(Number(handlingFee) || 0);
    const meal = Math.round(Number(mealAllowance) || 0);
    const others = otherExpenses.reduce((s, it) => s + (Math.round(Number(it.amount) || 0)), 0);

    const totalChiPhiTien = cuocRa + toll + port + parking + handling + meal + others;
    const laiTamTinh = totalCuocVao - totalChiPhiTien;
    const dauCapLit = Number(fuelLiters) || 0;

    return {
      totalCuocVao,
      cuocRa,
      toll,
      port,
      parking,
      handling,
      meal,
      others,
      totalChiPhiTien,
      laiTamTinh,
      dauCapLit
    };
  };

  const totals = calculateTotals();

  // XỬ LÝ THÊM NHANH DANH MỤC (MODAL CON)
  const handleOpenQuickAdd = (type) => {
    setQuickAddType(type);
    setQuickAddInput({});
    setQuickAddErr(null);
  };

  const handleSaveQuickAdd = async (e) => {
    e.preventDefault();
    setQuickAddLoading(true);
    setQuickAddErr(null);
    try {
      if (quickAddType === 'VEHICLE') {
        const res = await createVehicleApi(quickAddInput);
        if (res.success) {
          setVehicles(prev => [...prev, res.data]);
          handleSelectVehicle(res.data.id);
          setQuickAddType(null);
        } else setQuickAddErr(res.error || 'Lỗi thêm xe');
      } else if (quickAddType === 'DRIVER') {
        const res = await createDriverApi(quickAddInput);
        if (res.success) {
          setDrivers(prev => [...prev, res.data]);
          handleSelectDriver(res.data.id);
          setQuickAddType(null);
        } else setQuickAddErr(res.error || 'Lỗi thêm tài xế');
      } else if (quickAddType === 'ROUTE') {
        const res = await createRouteApi(quickAddInput);
        if (res.success) {
          setRoutes(prev => [...prev, res.data]);
          handleSelectRoute(res.data.id);
          setQuickAddType(null);
        } else setQuickAddErr(res.error || 'Lỗi thêm tuyến');
      } else if (quickAddType === 'CUSTOMER') {
        const res = await createCustomerApi(quickAddInput);
        if (res.success) {
          setCustomers(prev => [...prev, res.data]);
          setCustomerName(res.data.name);
          setQuickAddType(null);
        } else setQuickAddErr(res.error || 'Lỗi thêm khách hàng');
      } else if (quickAddType === 'SUBCONTRACTOR') {
        const res = await createSubcontractorApi(quickAddInput);
        if (res.success) {
          setSubcontractors(prev => [...prev, res.data]);
          setSubcontractorId(res.data.id);
          setSubcontractorName(res.data.name);
          setQuickAddType(null);
        } else setQuickAddErr(res.error || 'Lỗi thêm nhà xe');
      }
    } catch (e) {
      setQuickAddErr(e.message);
    } finally {
      setQuickAddLoading(false);
    }
  };

  // SUBMIT TẠO CUỐC XE
  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      setSubmitting(true);
      setErr(null);

      if (!tripDate) throw new Error('Ngày chạy xe là bắt buộc');
      if (!customerName.trim()) throw new Error('Khách hàng / Chủ hàng là bắt buộc');

      const isSub = vehicleSource === 'SUBCONTRACTOR';

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
          pickup_yard: secondPickupLocation || pickupLocation,
          dropoff_yard: secondDropoffLocation || dropoffLocation,
          notes: 'Cont 2 (Kẹp 2x20\')'
        });
      }

      const otherExpensesPayload = otherExpenses
        .filter(it => it.name && it.amount)
        .map(it => ({ name: it.name.trim(), amount: Math.round(Number(it.amount) || 0) }));

      const payload = {
        trip_date: tripDate,
        is_subcontractor: isSub ? 1 : 0,
        vehicle_id: isSub ? null : (vehicleId || null),
        vehicle_plate: isSub ? (vehiclePlate.trim().toUpperCase() || 'XE NGOÀI') : vehiclePlate,
        driver_id: isSub ? null : (driverId || null),
        driver_name: isSub ? (driverName.trim() || null) : driverName,
        subcontractor_id: isSub ? (subcontractorId || null) : null,
        subcontractor_name: isSub ? (subcontractorName.trim().toUpperCase() || 'NHÀ XE NGOÀI') : null,
        customer_name: customerName.trim().toUpperCase(),
        route_id: routeId || null,
        route_name: routeName.trim() || null,
        pickup_location: pickupLocation.trim() || null,
        dropoff_location: dropoffLocation.trim() || null,
        vat_type: vatType,
        trip_revenue: totals.totalCuocVao,
        subcontractor_cost: totals.cuocRa,
        toll_fee: totals.toll,
        port_fee: totals.port,
        parking_fee: totals.parking,
        handling_fee: totals.handling,
        meal_allowance: totals.meal,
        fuel_liters: totals.dauCapLit,
        other_costs: totals.others,
        other_expenses: otherExpensesPayload,
        driver_salary: Math.round(Number(driverSalary) || 0),
        customer_payment_status: customerPaymentStatus,
        subcontractor_payment_status: isSub ? subcontractorPaymentStatus : 'CHUA_TT',
        is_multi_container: isMultiContainer,
        containers: containerList,
        container_number: containerNumber ? containerNumber.trim().toUpperCase() : '',
        container_size: isMultiContainer ? '20' : containerSize,
        notes: notes.trim() || null,
        source_type: 'MANUAL'
      };

      const requestContent = JSON.stringify(payload);
      if(requestRef.current?.content !== requestContent)requestRef.current = {content:requestContent,id:crypto.randomUUID()};
      const res = await createTripApi(payload,requestRef.current.id);
      if (res.success) {
        setMsg(`Tạo mới chuyến xe ${res.data.trip_code} thành công! Lãi tạm tính: ${formatVnd(res.data.temp_profit)}`);
        setTimeout(() => {
          resetForm();
          if (onTripCreated) onTripCreated(res.data);
          onClose();
        }, 900);
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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl max-w-4xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[94vh]">
        {/* Header */}
        <div className="px-5 py-3.5 bg-slate-900 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-blue-600 rounded-xl text-white">
              {duplicateFromTrip ? <Copy className="w-4 h-4" /> : <PlusCircle className="w-4 h-4" />}
            </div>
            <div>
              <h3 className="font-bold text-sm sm:text-base">
                {duplicateFromTrip ? `Nhân Bản Chuyến Xe (${duplicateFromTrip.trip_code})` : 'Tạo Cuốc Xe Mới'}
              </h3>
              <p className="text-[11px] text-slate-400">
                Chuẩn nghiệp vụ tháng 1: Tách rõ cước vào, cước ra, 6 khoản chi phí, dầu cấp và lãi tạm tính
              </p>
            </div>
          </div>

          {/* BỘ 3 LỰA CHỌN CẠNH NHAU (ĐÚNG YÊU CẦU MỤC 3) */}
          <div className="flex items-center space-x-1.5 bg-slate-800 p-1 rounded-xl self-start sm:self-auto text-xs">
            <button
              type="button"
              className="px-3 py-1.5 rounded-lg text-xs font-bold bg-blue-600 text-white shadow-xs"
            >
              Tạo một cuốc
            </button>
            <button
              type="button"
              onClick={() => { onClose(); if (onSwitchToBatch) onSwitchToBatch(); }}
              className="px-3 py-1.5 rounded-lg text-xs font-bold text-slate-300 hover:text-white hover:bg-slate-700/60 transition-all"
            >
              Nhập nhiều cuốc
            </button>
            <button
              type="button"
              onClick={() => { onClose(); if (onSwitchToExcelImport) onSwitchToExcelImport(); }}
              className="px-3 py-1.5 rounded-lg text-xs font-bold text-slate-300 hover:text-white hover:bg-slate-700/60 transition-all flex items-center space-x-1"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
              <span>Nhập từ Excel</span>
            </button>
          </div>

          <button 
            onClick={onClose}
            aria-label="Đóng cửa sổ" className="shrink-0 self-end p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Thông báo lỗi / thành công */}
        {err && (
          <div className="mx-5 mt-3 p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center space-x-2 shrink-0">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
            <span>{err}</span>
          </div>
        )}
        {msg && (
          <div className="mx-5 mt-3 p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs flex items-center space-x-2 shrink-0">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
            <span>{msg}</span>
          </div>
        )}

        {/* Form Body Cuộn được */}
        <form onSubmit={handleSubmit} className="p-5 overflow-y-auto space-y-4 text-xs">
          
          {/* KHỐI 1: THỜI GIAN & CHỦ HÀNG */}
          <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-3">
            <div className="font-bold text-slate-800 flex items-center space-x-1.5 pb-1 border-b border-slate-200/80">
              <Calendar className="w-3.5 h-3.5 text-blue-600" />
              <span>1. Thời Gian & Khách Hàng</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Ngày Chạy Cuốc Xe <span className="text-rose-500">*</span>
                </label>
                <input
                  type="date"
                  required
                  value={tripDate}
                  onChange={(e) => setTripDate(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white font-medium"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] font-bold text-slate-700">
                    Khách Hàng / Chủ Hàng <span className="text-rose-500">*</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => handleOpenQuickAdd('CUSTOMER')}
                    className="text-[10px] text-blue-600 hover:text-blue-800 font-bold flex items-center space-x-0.5"
                  >
                    <Plus className="w-3 h-3" />
                    <span>Thêm khách mới</span>
                  </button>
                </div>
                <input
                  type="text"
                  required
                  list="customer-suggestions"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Gõ hoặc chọn khách hàng (VD: TTP, VTM, ĐẠI THỊNH...)"
                  className="w-full px-3 py-2 text-xs uppercase font-semibold border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white"
                />
                <datalist id="customer-suggestions">
                  {customers.map(c => <option key={c.id} value={c.name} />)}
                </datalist>
              </div>
            </div>
          </div>

          {/* KHỐI 2: ĐỘI XE & TÀI XẾ (PHÂN BIỆT XE NHÀ & THUÊ NGOÀI) */}
          <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-3">
            <div className="flex items-center justify-between pb-1 border-b border-slate-200/80">
              <div className="font-bold text-slate-800 flex items-center space-x-1.5">
                <Truck className="w-3.5 h-3.5 text-blue-600" />
                <span>2. Phương Tiện & Điều Xe</span>
              </div>
              
              {/* Tab phân loại: Xe công ty vs Xe ngoài */}
              <div className="inline-flex p-0.5 bg-slate-200 rounded-lg">
                <button
                  type="button"
                  onClick={() => setVehicleSource('INTERNAL')}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-all ${
                    vehicleSource === 'INTERNAL'
                      ? 'bg-white text-blue-700 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  🚛 Xe Công Ty
                </button>
                <button
                  type="button"
                  onClick={() => setVehicleSource('SUBCONTRACTOR')}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-all ${
                    vehicleSource === 'SUBCONTRACTOR'
                      ? 'bg-white text-indigo-700 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  🤝 Xe Thuê Ngoài
                </button>
              </div>
            </div>

            {vehicleSource === 'INTERNAL' ? (
              /* GIAO DIỆN XE CÔNG TY */
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[11px] font-bold text-slate-700">
                      Đầu Xe Công Ty
                    </label>
                    <button
                      type="button"
                      onClick={() => handleOpenQuickAdd('VEHICLE')}
                      className="text-[10px] text-blue-600 hover:text-blue-800 font-bold flex items-center space-x-0.5"
                    >
                      <Plus className="w-3 h-3" />
                      <span>Thêm xe mới</span>
                    </button>
                  </div>
                  <select
                    value={vehicleId}
                    onChange={(e) => handleSelectVehicle(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 font-mono font-bold"
                  >
                    <option value="">-- Chọn đầu xe công ty --</option>
                    {vehicles.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.plate_number} {v.driver_name ? `(${v.driver_name})` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[11px] font-bold text-slate-700">
                      Lái Xe Phụ Trách
                    </label>
                    <button
                      type="button"
                      onClick={() => handleOpenQuickAdd('DRIVER')}
                      className="text-[10px] text-blue-600 hover:text-blue-800 font-bold flex items-center space-x-0.5"
                    >
                      <Plus className="w-3 h-3" />
                      <span>Thêm tài xế mới</span>
                    </button>
                  </div>
                  <select
                    value={driverId}
                    onChange={(e) => handleSelectDriver(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 font-medium"
                  >
                    <option value="">-- Chọn lái xe --</option>
                    {drivers.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.full_name} {d.default_plate ? `(${d.default_plate})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            ) : (
              /* GIAO DIỆN XE THUÊ NGOÀI */
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[11px] font-bold text-slate-700">
                      Tên Nhà Xe / Thầu Phụ <span className="text-rose-500">*</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => handleOpenQuickAdd('SUBCONTRACTOR')}
                      className="text-[10px] text-blue-600 hover:text-blue-800 font-bold flex items-center space-x-0.5"
                    >
                      <Plus className="w-3 h-3" />
                      <span>Thêm nhà xe</span>
                    </button>
                  </div>
                  <input
                    type="text"
                    required
                    list="subcontractor-suggestions"
                    value={subcontractorName}
                    onChange={(e) => setSubcontractorName(e.target.value)}
                    placeholder="VD: CÔNG ANH, ANH DŨNG..."
                    className="w-full px-3 py-2 text-xs uppercase font-semibold border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white"
                  />
                  <datalist id="subcontractor-suggestions">
                    {subcontractors.map(s => <option key={s.id} value={s.name} />)}
                  </datalist>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Biển Số Xe Ngoài (nếu biết)
                  </label>
                  <input
                    type="text"
                    value={vehiclePlate}
                    onChange={(e) => setVehiclePlate(e.target.value)}
                    placeholder="VD: 15C-999.88"
                    className="w-full px-3 py-2 text-xs font-mono font-bold uppercase border border-slate-300 rounded-lg bg-white"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Tên Lái Xe Ngoài (tùy chọn)
                  </label>
                  <input
                    type="text"
                    value={driverName}
                    onChange={(e) => setDriverName(e.target.value)}
                    placeholder="Để trống nếu chưa có"
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                  />
                </div>
              </div>
            )}
          </div>

          {/* KHỐI 3: TUYẾN ĐƯỜNG & CONTAINER */}
          <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-3">
            <div className="flex items-center justify-between pb-1 border-b border-slate-200/80">
              <div className="font-bold text-slate-800 flex items-center space-x-1.5">
                <MapPin className="w-3.5 h-3.5 text-blue-600" />
                <span>3. Tuyến Đường & Container</span>
              </div>
              <button
                type="button"
                onClick={() => handleOpenQuickAdd('ROUTE')}
                className="text-[10px] text-blue-600 hover:text-blue-800 font-bold flex items-center space-x-0.5"
              >
                <Plus className="w-3 h-3" />
                <span>Thêm tuyến mới</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Chọn Tuyến Đường (Gợi ý lịch sử)
                </label>
                <select
                  value={routeId}
                  onChange={(e) => handleSelectRoute(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 font-medium"
                >
                  <option value="">-- Chọn tuyến đường mẫu --</option>
                  {routes.map(r => (
                    <option key={r.id} value={r.id}>
                      {r.route_name} {r.default_price ? `(${formatVnd(r.default_price)})` : ''}
                    </option>
                  ))}
                </select>
                {suggestedPrice && (
                  <div className="mt-1 flex items-center justify-between text-[10px] text-slate-500">
                    <span>Giá mẫu: <strong>{formatVnd(suggestedPrice)}</strong></span>
                    <button
                      type="button"
                      onClick={handleApplySuggestedPrice}
                      className="text-blue-600 hover:underline font-bold"
                    >
                      Áp dụng giá này
                    </button>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Cảng / Điểm Nâng Lấy Hàng
                </label>
                <input
                  type="text"
                  value={pickupLocation}
                  onChange={(e) => setPickupLocation(e.target.value)}
                  placeholder="VD: TÂN VŨ, ĐÌNH VŨ, LẠCH HUYỆN..."
                  className="w-full px-3 py-2 text-xs uppercase border border-slate-300 rounded-lg bg-white"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Kho / Điểm Hạ Trả Hàng
                </label>
                <input
                  type="text"
                  value={dropoffLocation}
                  onChange={(e) => setDropoffLocation(e.target.value)}
                  placeholder="VD: KCN BÌNH XUYÊN, HẢI DƯƠNG..."
                  className="w-full px-3 py-2 text-xs uppercase border border-slate-300 rounded-lg bg-white"
                />
              </div>
            </div>

            {/* Container */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] font-bold text-slate-700">
                    Số Container 1
                  </label>
                  {cont1Validation.status === 'VALID' && (
                    <span className="text-[10px] text-emerald-600 font-bold">✓ Chuẩn ISO</span>
                  )}
                </div>
                <input
                  type="text"
                  value={containerNumber}
                  onChange={(e) => setContainerNumber(e.target.value.toUpperCase())}
                  placeholder="VD: TCNU1234567"
                  className="w-full px-3 py-2 text-xs font-mono font-bold uppercase border border-slate-300 rounded-lg bg-white"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Loại Cont
                </label>
                <select
                  value={containerSize}
                  onChange={(e) => setContainerSize(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                >
                  <option value="40">Cont 40' (DC/HC)</option>
                  <option value="20">Cont 20'</option>
                  <option value="45">Cont 45'</option>
                </select>
              </div>

              <div className="flex items-end">
                <button
                  type="button"
                  onClick={() => setIsMultiContainer(!isMultiContainer)}
                  className={`w-full py-2 px-3 rounded-lg text-xs font-bold border transition-all flex items-center justify-center space-x-1.5 ${
                    isMultiContainer 
                      ? 'bg-indigo-50 border-indigo-300 text-indigo-700 shadow-xs' 
                      : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <Layers className="w-3.5 h-3.5 text-indigo-500" />
                  <span>{isMultiContainer ? '✓ Đang Kẹp 2x20\'' : '+ Kẹp Thêm Cont 20\''}</span>
                </button>
              </div>
            </div>

            {/* Form cont thứ 2 nếu kẹp */}
            {isMultiContainer && (
              <div className="p-3 bg-indigo-50/60 rounded-lg border border-indigo-200 grid grid-cols-1 sm:grid-cols-2 gap-3 animate-fadeIn">
                <div>
                  <label className="block text-[11px] font-bold text-indigo-900 mb-1">
                    Số Container 2 (Kẹp)
                  </label>
                  <input
                    type="text"
                    value={secondContainerNumber}
                    onChange={(e) => setSecondContainerNumber(e.target.value.toUpperCase())}
                    placeholder="VD: MSKU7654321"
                    className="w-full px-3 py-2 text-xs font-mono font-bold uppercase border border-indigo-200 rounded-lg bg-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-indigo-900 mb-1">
                    Cước Cont 2 (đã gồm VAT)
                  </label>
                  <input
                    type="number"
                    value={secondContRevenue}
                    onChange={(e) => setSecondContRevenue(e.target.value)}
                    placeholder="VD: 2000000"
                    className="w-full px-3 py-2 text-xs font-bold border border-indigo-200 rounded-lg bg-white"
                  />
                </div>
              </div>
            )}
          </div>

          {/* KHỐI 4: TÁCH BẠCH DOANH THU & CÁC KHOẢN CHI PHÍ */}
          <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-3">
            <div className="font-bold text-slate-800 flex items-center space-x-1.5 pb-1 border-b border-slate-200/80">
              <Coins className="w-3.5 h-3.5 text-emerald-600" />
              <span>4. Doanh Thu & Các Khoản Chi Phí Chi Tiết</span>
            </div>

            {/* DOANH THU */}
            <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-xl space-y-2">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <label className="text-xs font-bold text-emerald-950 flex items-center space-x-1">
                  <span>Cước vào — tiền khách trả, đã gồm VAT</span>
                  <span className="text-rose-500">*</span>
                </label>
                <div className="flex items-center space-x-3 text-[11px]">
                  <label className="flex items-center space-x-1 cursor-pointer font-medium text-emerald-900">
                    <input 
                      type="radio" 
                      name="vatType" 
                      value="V" 
                      checked={vatType === 'V'} 
                      onChange={() => setVatType('V')} 
                      className="text-emerald-600"
                    />
                    <span>Ký hiệu [V] (Đã gồm VAT)</span>
                  </label>
                  <label className="flex items-center space-x-1 cursor-pointer font-medium text-emerald-900">
                    <input 
                      type="radio" 
                      name="vatType" 
                      value="NV" 
                      checked={vatType === 'NV'} 
                      onChange={() => setVatType('NV')} 
                      className="text-emerald-600"
                    />
                    <span>Ký hiệu [NV] (Chưa VAT)</span>
                  </label>
                </div>
              </div>

              <div className="relative">
                <input
                  type="number"
                  required
                  value={tripRevenue}
                  onChange={(e) => setTripRevenue(e.target.value)}
                  placeholder="Nhập số tiền cước vào nguyên VND (VD: 3500000)"
                  className="w-full px-3 py-2.5 text-sm font-bold text-emerald-900 border border-emerald-300 rounded-lg focus:ring-2 focus:ring-emerald-500 bg-white"
                />
                <span className="absolute right-3 top-2.5 text-xs text-emerald-600 font-bold">
                  {tripRevenue ? formatVnd(tripRevenue) : '0 ₫'}
                </span>
              </div>
            </div>

            {/* CHI PHÍ CHI TIẾT */}
            <div className="space-y-3 pt-1">
              <div className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                Các Khoản Chi Phí Trực Tiếp (Để trống nếu không phát sinh)
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {/* Cước ra - xe ngoài */}
                {vehicleSource === 'SUBCONTRACTOR' && (
                  <div className="p-2.5 bg-amber-50/70 border border-amber-200 rounded-lg">
                    <label className="block text-[11px] font-bold text-amber-950 mb-1">
                      Cước ra — tiền thuê xe ngoài
                    </label>
                    <input
                      type="number"
                      value={subcontractorCost}
                      onChange={(e) => setSubcontractorCost(e.target.value)}
                      placeholder="0"
                      className="w-full px-2.5 py-1.5 text-xs font-bold border border-amber-300 rounded bg-white text-amber-900"
                    />
                    <div className="text-[10px] text-amber-700 mt-0.5 text-right font-medium">
                      {formatVnd(subcontractorCost)}
                    </div>
                  </div>
                )}

                {/* Phí cầu đường / cao tốc */}
                <div className="p-2.5 bg-white border border-slate-200 rounded-lg">
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Phí cầu đường / cao tốc
                  </label>
                  <input
                    type="number"
                    value={tollFee}
                    onChange={(e) => setTollFee(e.target.value)}
                    placeholder="0"
                    className="w-full px-2.5 py-1.5 text-xs font-semibold border border-slate-300 rounded bg-white"
                  />
                  <div className="text-[10px] text-slate-500 mt-0.5 text-right">
                    {formatVnd(tollFee)}
                  </div>
                </div>

                {/* Phí cảng / nâng hạ */}
                <div className="p-2.5 bg-white border border-slate-200 rounded-lg">
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Phí cảng / nâng hạ
                  </label>
                  <input
                    type="number"
                    value={portFee}
                    onChange={(e) => setPortFee(e.target.value)}
                    placeholder="0"
                    className="w-full px-2.5 py-1.5 text-xs font-semibold border border-slate-300 rounded bg-white"
                  />
                  <div className="text-[10px] text-slate-500 mt-0.5 text-right">
                    {formatVnd(portFee)}
                  </div>
                </div>

                {/* Phí bến bãi / đỗ xe */}
                <div className="p-2.5 bg-white border border-slate-200 rounded-lg">
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Phí bến bãi / đỗ xe
                  </label>
                  <input
                    type="number"
                    value={parkingFee}
                    onChange={(e) => setParkingFee(e.target.value)}
                    placeholder="0"
                    className="w-full px-2.5 py-1.5 text-xs font-semibold border border-slate-300 rounded bg-white"
                  />
                  <div className="text-[10px] text-slate-500 mt-0.5 text-right">
                    {formatVnd(parkingFee)}
                  </div>
                </div>

                {/* Tiền bốc xếp */}
                <div className="p-2.5 bg-white border border-slate-200 rounded-lg">
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Tiền bốc xếp
                  </label>
                  <input
                    type="number"
                    value={handlingFee}
                    onChange={(e) => setHandlingFee(e.target.value)}
                    placeholder="0"
                    className="w-full px-2.5 py-1.5 text-xs font-semibold border border-slate-300 rounded bg-white"
                  />
                  <div className="text-[10px] text-slate-500 mt-0.5 text-right">
                    {formatVnd(handlingFee)}
                  </div>
                </div>

                {/* Tiền ăn / phụ cấp chuyến */}
                <div className="p-2.5 bg-white border border-slate-200 rounded-lg">
                  <label className="block text-[11px] font-bold text-slate-700 mb-1 flex items-center justify-between">
                    <span>Tiền ăn / phụ cấp chuyến</span>
                    <span className="text-[9px] text-indigo-600 font-normal">Tách riêng lương</span>
                  </label>
                  <input
                    type="number"
                    value={mealAllowance}
                    onChange={(e) => setMealAllowance(e.target.value)}
                    placeholder="0"
                    className="w-full px-2.5 py-1.5 text-xs font-semibold border border-slate-300 rounded bg-white"
                  />
                  <div className="text-[10px] text-slate-500 mt-0.5 text-right">
                    {formatVnd(mealAllowance)}
                  </div>
                </div>

                {/* Dầu cấp theo lít */}
                <div className="p-2.5 bg-sky-50/70 border border-sky-200 rounded-lg">
                  <label className="block text-[11px] font-bold text-sky-950 mb-1 flex items-center space-x-1">
                    <Fuel className="w-3 h-3 text-sky-600" />
                    <span>Dầu cấp (Lượng theo Lít)</span>
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={fuelLiters}
                    onChange={(e) => setFuelLiters(e.target.value)}
                    placeholder="VD: 75"
                    className="w-full px-2.5 py-1.5 text-xs font-bold border border-sky-300 rounded bg-white text-sky-900"
                  />
                  <div className="text-[10px] text-sky-700 mt-0.5">
                    {fuelLiters ? `${fuelLiters} Lít (chưa tính tiền)` : '0 Lít'}
                  </div>
                </div>
              </div>

              {/* Chi phí khác động */}
              <div className="pt-2 border-t border-slate-200">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-bold text-slate-700">
                    Khoản Chi Phí Khác (thêm nhiều dòng)
                  </span>
                  <button
                    type="button"
                    onClick={handleAddOtherExpense}
                    className="text-[10px] text-blue-600 hover:text-blue-800 font-bold flex items-center space-x-1"
                  >
                    <Plus className="w-3 h-3" />
                    <span>+ Thêm khoản chi khác</span>
                  </button>
                </div>

                {otherExpenses.map((exp, idx) => (
                  <div key={idx} className="flex items-center space-x-2 mb-2 animate-fadeIn">
                    <input
                      type="text"
                      placeholder="Tên khoản chi (VD: Tiền cân xe, rửa xe...)"
                      value={exp.name}
                      onChange={(e) => handleUpdateOtherExpense(idx, 'name', e.target.value)}
                      className="flex-1 px-2.5 py-1.5 text-xs border border-slate-300 rounded bg-white"
                    />
                    <input
                      type="number"
                      placeholder="Số tiền VND"
                      value={exp.amount}
                      onChange={(e) => handleUpdateOtherExpense(idx, 'amount', e.target.value)}
                      className="w-32 px-2.5 py-1.5 text-xs font-semibold border border-slate-300 rounded bg-white"
                    />
                    <button
                      type="button"
                      onClick={() => handleRemoveOtherExpense(idx)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 rounded"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* HỘP TỔNG HỢP & LÃI TẠM TÍNH (TỰ ĐỘNG TÍNH) */}
            <div className="mt-3 p-3.5 bg-gradient-to-br from-slate-900 to-slate-800 text-white rounded-xl shadow-sm">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center border-b border-slate-700 pb-3">
                <div>
                  <div className="text-[10px] text-slate-400 uppercase font-semibold">Tổng Cước Vào</div>
                  <div className="text-sm font-bold text-emerald-400 mt-0.5">{formatVnd(totals.totalCuocVao)}</div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-400 uppercase font-semibold">Tổng Chi Phí Tiền</div>
                  <div className="text-sm font-bold text-rose-300 mt-0.5">{formatVnd(totals.totalChiPhiTien)}</div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-400 uppercase font-semibold">Dầu Cấp</div>
                  <div className="text-sm font-bold text-sky-300 mt-0.5">{totals.dauCapLit} Lít</div>
                </div>
                <div>
                  <div className="text-[10px] text-amber-300 uppercase font-bold">Lãi Tạm Tính</div>
                  <div className={`text-base font-extrabold mt-0.5 ${totals.laiTamTinh >= 0 ? 'text-amber-400' : 'text-rose-400'}`}>
                    {formatVnd(totals.laiTamTinh)}
                  </div>
                </div>
              </div>
              <p className="text-[10px] text-slate-400 mt-2 text-center">
                * Lãi tạm tính = Cước vào − Cước ra − Chi phí trực tiếp đã ghi nhận. Chưa trừ lương và chưa tính tiền dầu.
              </p>
            </div>
          </div>

          {/* KHỐI 5: THANH TOÁN & GHI CHÚ */}
          <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-3">
            <div className="font-bold text-slate-800 flex items-center space-x-1.5 pb-1 border-b border-slate-200/80">
              <Receipt className="w-3.5 h-3.5 text-blue-600" />
              <span>5. Trạng Thái Thanh Toán & Ghi Chú</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Trạng Thái Thanh Toán Khách Hàng
                </label>
                <select
                  value={customerPaymentStatus}
                  onChange={(e) => setCustomerPaymentStatus(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                >
                  <option value="CHUA_TT">Chưa thanh toán</option>
                  <option value="TUOI">TƯƠI (Thanh toán ngay sau giao dịch)</option>
                  <option value="X">X (Đã thanh toán sau một thời gian)</option>
                  <option value="DA_TT">ĐÃ THANH TOÁN</option>
                  <option value="DOI_TRU">ĐỐI TRỪ (Đối trừ công nợ, không tính tiền mặt)</option>
                </select>
              </div>

              {vehicleSource === 'SUBCONTRACTOR' && (
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Trạng Thái Trả Nhà Xe Ngoài
                  </label>
                  <select
                    value={subcontractorPaymentStatus}
                    onChange={(e) => setSubcontractorPaymentStatus(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="CHUA_TT">Chưa thanh toán</option>
                    <option value="DA_TT">Đã thanh toán nhà xe</option>
                  </select>
                </div>
              )}
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                Ghi Chú Ngoài / Ký Hiệu Bổ Sung (Cột R)
              </label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="VD: K HD, Ngày hóa đơn, ghi chú đặc biệt..."
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
              />
            </div>
          </div>

          {/* Footer nút hành động */}
          <div className="pt-3 border-t border-slate-200 flex items-center justify-end space-x-2.5 shrink-0">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 border border-slate-300 rounded-xl text-slate-700 hover:bg-slate-100 font-semibold"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold shadow-md active:scale-95 transition-all flex items-center space-x-1.5"
            >
              {submitting ? (
                <span>Đang lưu...</span>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>Xác Nhận Tạo Cuốc Xe</span>
                </>
              )}
            </button>
          </div>
        </form>

        {/* MODAL CON: THÊM NHANH DANH MỤC */}
        {quickAddType && (
          <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in">
            <div className="bg-white rounded-xl max-w-sm w-full p-4 shadow-2xl border border-slate-200 space-y-3">
              <div className="flex items-center justify-between border-b pb-2">
                <h4 className="font-bold text-xs text-slate-800">
                  {quickAddType === 'VEHICLE' && 'Thêm Đầu Xe Mới'}
                  {quickAddType === 'DRIVER' && 'Thêm Tài Xế Mới'}
                  {quickAddType === 'ROUTE' && 'Thêm Tuyến Đường Mới'}
                  {quickAddType === 'CUSTOMER' && 'Thêm Khách Hàng Mới'}
                  {quickAddType === 'SUBCONTRACTOR' && 'Thêm Nhà Xe Ngoài Mới'}
                </h4>
                <button onClick={() => setQuickAddType(null)} className="text-slate-400 hover:text-slate-600">
                  <X className="w-4 h-4" />
                </button>
              </div>

              {quickAddErr && (
                <div className="p-2 bg-rose-50 border border-rose-200 text-rose-700 text-[11px] rounded">
                  {quickAddErr}
                </div>
              )}

              <form onSubmit={handleSaveQuickAdd} className="space-y-2.5 text-xs">
                {quickAddType === 'VEHICLE' && (
                  <>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-0.5">Biển số xe *</label>
                      <input
                        type="text"
                        required
                        placeholder="VD: 15C-123.45"
                        onChange={(e) => setQuickAddInput({ ...quickAddInput, plate_number: e.target.value })}
                        className="w-full px-2.5 py-1.5 border rounded uppercase font-mono font-bold"
                      />
                    </div>
                  </>
                )}

                {quickAddType === 'DRIVER' && (
                  <>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-0.5">Họ và tên tài xế *</label>
                      <input
                        type="text"
                        required
                        placeholder="VD: Nguyễn Văn A"
                        onChange={(e) => setQuickAddInput({ ...quickAddInput, full_name: e.target.value })}
                        className="w-full px-2.5 py-1.5 border rounded"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-0.5">Số điện thoại</label>
                      <input
                        type="text"
                        placeholder="VD: 0912345678"
                        onChange={(e) => setQuickAddInput({ ...quickAddInput, phone: e.target.value })}
                        className="w-full px-2.5 py-1.5 border rounded"
                      />
                    </div>
                  </>
                )}

                {quickAddType === 'ROUTE' && (
                  <>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-0.5">Tên tuyến đường *</label>
                      <input
                        type="text"
                        required
                        placeholder="VD: ĐÓNG VĨNH PHÚC"
                        onChange={(e) => setQuickAddInput({ ...quickAddInput, route_name: e.target.value })}
                        className="w-full px-2.5 py-1.5 border rounded uppercase"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-0.5">Cước mẫu tham khảo</label>
                      <input
                        type="number"
                        placeholder="VD: 3500000"
                        onChange={(e) => setQuickAddInput({ ...quickAddInput, default_price: e.target.value })}
                        className="w-full px-2.5 py-1.5 border rounded font-semibold"
                      />
                    </div>
                  </>
                )}

                {quickAddType === 'CUSTOMER' && (
                  <>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-0.5">Tên khách hàng / chủ hàng *</label>
                      <input
                        type="text"
                        required
                        placeholder="VD: LOGISTICS ABC"
                        onChange={(e) => setQuickAddInput({ ...quickAddInput, name: e.target.value })}
                        className="w-full px-2.5 py-1.5 border rounded uppercase font-bold"
                      />
                    </div>
                  </>
                )}

                {quickAddType === 'SUBCONTRACTOR' && (
                  <>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-0.5">Tên nhà xe / chủ xe *</label>
                      <input
                        type="text"
                        required
                        placeholder="VD: NHÀ XE HƯNG PHÁT"
                        onChange={(e) => setQuickAddInput({ ...quickAddInput, name: e.target.value })}
                        className="w-full px-2.5 py-1.5 border rounded uppercase font-bold"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-0.5">Số điện thoại liên hệ</label>
                      <input
                        type="text"
                        placeholder="VD: 0987654321"
                        onChange={(e) => setQuickAddInput({ ...quickAddInput, phone: e.target.value })}
                        className="w-full px-2.5 py-1.5 border rounded"
                      />
                    </div>
                  </>
                )}

                <div className="pt-2 flex justify-end space-x-2">
                  <button
                    type="button"
                    onClick={() => setQuickAddType(null)}
                    className="px-3 py-1.5 border rounded text-slate-600 hover:bg-slate-100"
                  >
                    Hủy
                  </button>
                  <button
                    type="submit"
                    disabled={quickAddLoading}
                    className="px-3 py-1.5 bg-blue-600 text-white rounded font-bold hover:bg-blue-700"
                  >
                    {quickAddLoading ? 'Đang lưu...' : 'Lưu Danh Mục'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
