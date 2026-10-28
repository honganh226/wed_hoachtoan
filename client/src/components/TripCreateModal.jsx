import { todayInVietnam } from '../utils/businessDate.js';
import React, { useState, useEffect, useRef } from 'react';
import {
  PlusCircle,
  Copy,
  Truck,
  MapPin,
  Coins,
  CheckCircle2,
  AlertCircle,
  X,
  Layers,
  Fuel,
  Receipt,
  Plus,
  Trash2,
  Calendar,
  FileSpreadsheet,
  ArrowUpCircle,
  ArrowDownCircle,
  Clock
} from 'lucide-react';
import {
  fetchVehicles,
  fetchDrivers,
  fetchRoutes,
  fetchCustomersApi,
  fetchSubcontractorsApi,
  fetchPortsApi,
  fetchFuelPricesApi,
  createVehicleApi,
  createDriverApi,
  createRouteApi,
  createCustomerApi,
  createSubcontractorApi,
  createPortApi,
  createTripApi
} from '../services/api.js';
import { validateIso6346 } from '../utils/iso6346.js';
import {
  computeTripFinancials,
  STANDARD_CONTAINER_TYPES
} from '../utils/tripFinancials.js';

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
  const [ports, setPorts] = useState([]);
  const [fuelPricesMap, setFuelPricesMap] = useState({});
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState(null);
  const [msg, setMsg] = useState(null);

  // Loại xe: 'INTERNAL' (Xe công ty) | 'SUBCONTRACTOR' (Xe thuê ngoài)
  const [vehicleSource, setVehicleSource] = useState('INTERNAL');

  // Form State Cơ Bản
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
  const [lachHuyenMark, setLachHuyenMark] = useState('');
  const [suggestedPrice, setSuggestedPrice] = useState(null);

  // TIỀN CƯỚC: Cước vào gốc là CHƯA VAT
  const [vatType, setVatType] = useState('NV');
  const [tripRevenue, setTripRevenue] = useState(''); // Cước vào gốc chưa VAT

  // NÂNG / HẠ TÁCH RIÊNG 4 Ô (Công ty chịu)
  const [liftOnLocation, setLiftOnLocation] = useState('');
  const [liftOnFee, setLiftOnFee] = useState('');
  const [liftOffLocation, setLiftOffLocation] = useState('');
  const [liftOffFee, setLiftOffFee] = useState('');

  // CHI PHÍ CÔNG TY KHÁC
  const [subcontractorCost, setSubcontractorCost] = useState(''); // Cước ra — tiền thuê xe ngoài
  const [tollFee, setTollFee] = useState(''); // Phí cầu đường / cao tốc
  const [parkingFee, setParkingFee] = useState(''); // Phí bến bãi / đỗ xe
  const [handlingFee, setHandlingFee] = useState(''); // Tiền bốc xếp
  const [mealAllowance, setMealAllowance] = useState(''); // Tiền ăn / phụ cấp chuyến
  const [fuelLiters, setFuelLiters] = useState(''); // Dầu cấp theo lít
  const [otherExpenses, setOtherExpenses] = useState([]); // Mảng [{ name, amount }]

  // TIỀN PHƠI TRẢ HỘ CHỦ HÀNG (Tách riêng khỏi phí nâng/hạ & chi phí chuyến)
  const [phoiAdvanceAmount, setPhoiAdvanceAmount] = useState('');
  const [phoiReferenceNote, setPhoiReferenceNote] = useState('');
  const [phoiRefundMode, setPhoiRefundMode] = useState('HEN_NGAY'); // 'HEN_NGAY' | 'TUOI'
  const [phoiDueDate, setPhoiDueDate] = useState(''); // Không đặt mặc định 7 hay 30 ngày

  // LƯƠNG TÀI XẾ (Nhập riêng, chưa tính vào chênh lệch tạm tính chuyến)
  const [driverSalary, setDriverSalary] = useState('');

  // TRẠNG THÁI THANH TOÁN TIỀN CƯỚC (Tách riêng với hoàn tiền phơi)
  const [customerPaymentStatus, setCustomerPaymentStatus] = useState('CHUA_TT'); // CHUA_TT | TUOI | X | DA_TT | CN_30_NGAY | DOI_TRU
  const [subcontractorPaymentStatus, setSubcontractorPaymentStatus] = useState('CHUA_TT'); // CHUA_TT | DA_TT
  const [notes, setNotes] = useState('');

  // Container & Loại Cont (20DC, 40DC, 40HC, 40RF, 40FR, 45, hoặc tùy chỉnh)
  const [isMultiContainer, setIsMultiContainer] = useState(false);
  const [containerNumber, setContainerNumber] = useState('');
  const [containerSizeSelect, setContainerSizeSelect] = useState('40HC');
  const [customContainerSize, setCustomContainerSize] = useState('');
  const [secondContainerNumber, setSecondContainerNumber] = useState('');
  const [secondPickupLocation, setSecondPickupLocation] = useState('');
  const [secondDropoffLocation, setSecondDropoffLocation] = useState('');
  const [secondContRevenue, setSecondContRevenue] = useState('');

  // State các Modal con Thêm Nhanh Danh Mục
  const [quickAddType, setQuickAddType] = useState(null); // 'VEHICLE' | 'DRIVER' | 'ROUTE' | 'CUSTOMER' | 'SUBCONTRACTOR' | 'PORT_ON' | 'PORT_OFF'
  const [quickAddInput, setQuickAddInput] = useState({});
  const [quickAddLoading, setQuickAddLoading] = useState(false);
  const [quickAddErr, setQuickAddErr] = useState(null);

  const cont1Validation = validateIso6346(containerNumber);
  const effectiveContainerSize =
    containerSizeSelect === 'CUSTOM'
      ? (customContainerSize.trim().toUpperCase() || 'KHÁC')
      : containerSizeSelect;

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
    setLachHuyenMark('');
    setSuggestedPrice(null);
    setVatType('NV');
    setTripRevenue('');
    setLiftOnLocation('');
    setLiftOnFee('');
    setLiftOffLocation('');
    setLiftOffFee('');
    setSubcontractorCost('');
    setTollFee('');
    setParkingFee('');
    setHandlingFee('');
    setMealAllowance('');
    setFuelLiters('');
    setOtherExpenses([]);
    setPhoiAdvanceAmount('');
    setPhoiReferenceNote('');
    setPhoiRefundMode('HEN_NGAY');
    setPhoiDueDate('');
    setDriverSalary('');
    setCustomerPaymentStatus('CHUA_TT');
    setSubcontractorPaymentStatus('CHUA_TT');
    setNotes('');
    setIsMultiContainer(false);
    setContainerNumber('');
    setContainerSizeSelect('40HC');
    setCustomContainerSize('');
    setSecondContainerNumber('');
    setSecondPickupLocation('');
    setSecondDropoffLocation('');
    setSecondContRevenue('');
  };

  const loadDropdowns = async () => {
    try {
      setLoading(true);
      const [vRes, dRes, rRes, cRes, sRes, pRes, fpRes] = await Promise.all([
        fetchVehicles().catch(() => ({ success: false })),
        fetchDrivers().catch(() => ({ success: false })),
        fetchRoutes().catch(() => ({ success: false })),
        fetchCustomersApi().catch(() => ({ success: false })),
        fetchSubcontractorsApi().catch(() => ({ success: false })),
        fetchPortsApi().catch(() => ({ success: false })),
        fetchFuelPricesApi().catch(() => ({ success: false }))
      ]);

      if (vRes.success) setVehicles(vRes.data || []);
      if (dRes.success) setDrivers(dRes.data || []);
      if (rRes.success) setRoutes(rRes.data || []);
      if (cRes.success) setCustomers(cRes.data || []);
      if (sRes.success) setSubcontractors(sRes.data || []);
      if (pRes.success) setPorts(pRes.data || []);
      const fpList = Array.isArray(fpRes.data?.prices)
        ? fpRes.data.prices
        : Array.isArray(fpRes.data)
        ? fpRes.data
        : Array.isArray(fpRes.prices)
        ? fpRes.prices
        : [];
      if (fpList.length > 0) {
        const map = {};
        fpList.forEach((row) => {
          if (row.apply_date && Number(row.price_per_liter) > 0) {
            map[row.apply_date] = Number(row.price_per_liter);
          }
        });
        setFuelPricesMap(map);
      }
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  };

  const fillFromDuplicate = (source) => {
    setTripDate(todayInVietnam());
    const isSub = Boolean(source.is_subcontractor || source.nx_ngoai);
    setVehicleSource(isSub ? 'SUBCONTRACTOR' : 'INTERNAL');
    if (source.vehicle_id) setVehicleId(source.vehicle_id);
    if (source.vehicle_plate || source.bien_xe) setVehiclePlate(source.vehicle_plate || source.bien_xe);
    if (source.driver_id) setDriverId(source.driver_id);
    if (source.driver_name) setDriverName(source.driver_name);
    if (source.subcontractor_id) setSubcontractorId(source.subcontractor_id);
    if (source.subcontractor_name || source.nx_ngoai) setSubcontractorName(source.subcontractor_name || source.nx_ngoai);
    if (source.customer_name || source.khach_hang) setCustomerName(source.customer_name || source.khach_hang);
    if (source.route_id) setRouteId(source.route_id);
    if (source.route_name || source.lich_trinh) setRouteName(source.route_name || source.lich_trinh);
    if (source.pickup_location) setPickupLocation(source.pickup_location);
    if (source.dropoff_location) setDropoffLocation(source.dropoff_location);
    const baseRev = source.base_revenue ?? source.cuoc_goc ?? source.cuoc_vao ?? source.trip_revenue ?? source.total_revenue;
    if (baseRev) setTripRevenue(String(baseRev));
    if (source.lift_on_location || source.noi_nang) setLiftOnLocation(source.lift_on_location || source.noi_nang);
    if (source.lift_on_fee || source.phi_nang) setLiftOnFee(String(source.lift_on_fee || source.phi_nang));
    if (source.lift_off_location || source.noi_ha) setLiftOffLocation(source.lift_off_location || source.noi_ha);
    if (source.lift_off_fee || source.phi_ha) setLiftOffFee(String(source.lift_off_fee || source.phi_ha));
    if (source.subcontractor_cost || source.cuoc_ra) setSubcontractorCost(String(source.subcontractor_cost || source.cuoc_ra));
    if (source.toll_fee || source.tien_duong) setTollFee(String(source.toll_fee || source.tien_duong));
    if (source.parking_fee) setParkingFee(String(source.parking_fee));
    if (source.handling_fee) setHandlingFee(String(source.handling_fee));
    if (source.meal_allowance) setMealAllowance(String(source.meal_allowance));
    if (source.fuel_liters || source.dau_lit) setFuelLiters(String(source.fuel_liters || source.dau_lit));
    if (source.driver_salary) setDriverSalary(String(source.driver_salary));
    const srcContType = source.container_size || source.loai_cont || '40HC';
    if (STANDARD_CONTAINER_TYPES.includes(srcContType) || ['20', '40'].includes(srcContType)) {
      setContainerSizeSelect(srcContType);
      setCustomContainerSize('');
    } else {
      setContainerSizeSelect('CUSTOM');
      setCustomContainerSize(srcContType);
    }
    // Không sao chép trạng thái đã thu tiền cước hoặc đã hoàn tiền phơi
    setCustomerPaymentStatus('CHUA_TT');
    setSubcontractorPaymentStatus('CHUA_TT');
    setPhoiAdvanceAmount('');
    setPhoiDueDate('');
    setContainerNumber('');
    setSecondContainerNumber('');
    setIsMultiContainer(false);
    setNotes(`Nhân bản từ ${source.trip_code || source.id}`);
  };

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

  // Chọn tuyến -> Gợi ý giá tham khảo, tuyệt đối KHÔNG tự suy ra nơi nâng / nơi hạ từ tuyến đường (Mục 6)
  const handleSelectRoute = (selectedId) => {
    setRouteId(selectedId);
    const found = routes.find(r => r.id === selectedId);
    if (found) {
      setRouteName(found.route_name);
      if (found.departure && !pickupLocation) setPickupLocation(found.departure);
      if (found.destination && !dropoffLocation) setDropoffLocation(found.destination);
      if (found.default_price) setSuggestedPrice(found.default_price);
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

  const handleApplySuggestedPrice = () => {
    if (suggestedPrice) {
      setTripRevenue(String(suggestedPrice));
    }
  };

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

  // TÍNH TOÁN ĐỒNG BỘ 7 CHỈ TIÊU TÀI CHÍNH CHUYẾN (Mục 5, 6, 7, 11, 12)
  const rev1 = Math.round(Number(tripRevenue) || 0);
  const rev2 = isMultiContainer ? Math.round(Number(secondContRevenue) || 0) : 0;
  const totalCuocGoc = rev1 + rev2;

  const cuocRa = vehicleSource === 'SUBCONTRACTOR' ? Math.round(Number(subcontractorCost) || 0) : 0;
  const phiNang = Math.round(Number(liftOnFee) || 0);
  const phiHa = Math.round(Number(liftOffFee) || 0);
  const toll = Math.round(Number(tollFee) || 0);
  const parking = Math.round(Number(parkingFee) || 0);
  const handling = Math.round(Number(handlingFee) || 0);
  const meal = Math.round(Number(mealAllowance) || 0);
  const others = otherExpenses.reduce((s, it) => s + (Math.round(Number(it.amount) || 0)), 0);
  const dauCapLit = Number(fuelLiters) || 0;
  const dailyFuelPrice = tripDate && fuelPricesMap[tripDate] ? fuelPricesMap[tripDate] : null;
  const phoiAdvanceVal = Math.round(Number(phoiAdvanceAmount) || 0);

  const fin = computeTripFinancials({
    base_revenue: totalCuocGoc,
    lift_on_fee: phiNang,
    lift_off_fee: phiHa,
    fuel_liters: dauCapLit,
    fuel_unit_price: dailyFuelPrice,
    toll_fee: toll,
    subcontractor_cost: cuocRa,
    parking_fee: parking,
    handling_fee: handling,
    meal_allowance: meal,
    other_costs: others,
    phoi_advance_amount: phoiAdvanceVal,
    phoi_refunded_amount: phoiRefundMode === 'TUOI' ? phoiAdvanceVal : 0
  });

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
      } else if (quickAddType === 'PORT_ON' || quickAddType === 'PORT_OFF') {
        const res = await createPortApi(quickAddInput);
        if (res.success) {
          setPorts(prev => [...prev, res.data]);
          if (quickAddType === 'PORT_ON') setLiftOnLocation(res.data.name);
          else setLiftOffLocation(res.data.name);
          setQuickAddType(null);
        } else setQuickAddErr(res.error || 'Lỗi thêm cảng/điểm nâng hạ');
      }
    } catch (e) {
      setQuickAddErr(e.message);
    } finally {
      setQuickAddLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      setSubmitting(true);
      setErr(null);

      if (!tripDate) throw new Error('Ngày chạy xe là bắt buộc');
      if (!customerName.trim()) throw new Error('Khách hàng / Chủ hàng là bắt buộc');

      const isSub = vehicleSource === 'SUBCONTRACTOR';

      const containerList = [];
      if (containerNumber || pickupLocation || dropoffLocation || liftOnLocation || liftOffLocation) {
        containerList.push({
          container_number: containerNumber ? containerNumber.trim().toUpperCase() : '',
          container_size: isMultiContainer ? '20DC' : effectiveContainerSize,
          is_second_cont: 0,
          pickup_yard: liftOnLocation || pickupLocation,
          dropoff_yard: liftOffLocation || dropoffLocation,
          notes: isMultiContainer ? 'Cont 1 (Chính)' : ''
        });
      }

      if (isMultiContainer && (secondContainerNumber || secondPickupLocation || secondDropoffLocation)) {
        containerList.push({
          container_number: secondContainerNumber ? secondContainerNumber.trim().toUpperCase() : '',
          container_size: '20DC',
          is_second_cont: 1,
          pickup_yard: secondPickupLocation || liftOnLocation || pickupLocation,
          dropoff_yard: secondDropoffLocation || liftOffLocation || dropoffLocation,
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
        lach_huyen_mark: lachHuyenMark.trim() || null,
        vat_type: vatType,
        base_revenue: totalCuocGoc,
        trip_revenue: totalCuocGoc,
        lift_on_location: liftOnLocation.trim().toUpperCase() || null,
        lift_on_fee: phiNang,
        lift_off_location: liftOffLocation.trim().toUpperCase() || null,
        lift_off_fee: phiHa,
        subcontractor_cost: cuocRa,
        toll_fee: toll,
        parking_fee: parking,
        handling_fee: handling,
        meal_allowance: meal,
        fuel_liters: dauCapLit,
        other_costs: others,
        other_expenses: otherExpensesPayload,
        driver_salary: Math.round(Number(driverSalary) || 0),
        customer_payment_status: customerPaymentStatus,
        subcontractor_payment_status: isSub ? subcontractorPaymentStatus : 'CHUA_TT',
        is_multi_container: isMultiContainer,
        containers: containerList,
        container_number: containerNumber ? containerNumber.trim().toUpperCase() : '',
        container_size: isMultiContainer ? '20DC' : effectiveContainerSize,
        phoi_advance_amount: phoiAdvanceVal,
        phoi_reference_note: phoiReferenceNote.trim() || null,
        phoi_is_tuoi: phoiRefundMode === 'TUOI',
        phoi_due_date: phoiRefundMode === 'HEN_NGAY' && phoiDueDate ? phoiDueDate : null,
        notes: notes.trim() || null,
        source_type: 'MANUAL'
      };

      const requestContent = JSON.stringify(payload);
      if (requestRef.current?.content !== requestContent) {
        requestRef.current = { content: requestContent, id: crypto.randomUUID() };
      }
      const res = await createTripApi(payload, requestRef.current.id);
      if (res.success) {
        requestRef.current = null;
        setMsg(
          `Đã tạo chuyến xe ${res.data.trip_code}! Cước có VAT: ${formatVnd(fin.cuoc_co_vat)} | Chênh lệch sau trừ 17%: ${formatVnd(fin.chenh_lech_sau_tru_17)}`
        );
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
    return new Intl.NumberFormat('vi-VN').format(Math.round(Number(amount) || 0)) + ' ₫';
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl max-w-5xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[95vh]">
        {/* Header */}
        <div className="px-4 sm:px-5 py-3.5 bg-slate-900 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-blue-600 rounded-xl text-white">
              {duplicateFromTrip ? <Copy className="w-4 h-4" /> : <PlusCircle className="w-4 h-4" />}
            </div>
            <div>
              <h3 className="font-bold text-sm sm:text-base">
                {duplicateFromTrip ? `Nhân Bản Chuyến Xe (${duplicateFromTrip.trip_code || duplicateFromTrip.id})` : 'Tạo Cuốc Xe Mới (Chuẩn Hóa VAT 8% • Trừ 17% • Nâng/Hạ • Dầu • Phơi)'}
              </h3>
              <p className="text-[11px] text-slate-400">
                Cước gốc chưa VAT (×1,08 có VAT • ×0,83 sau trừ 17%) • Phí nâng/hạ công ty chịu • Tiền phơi trả hộ chủ hàng riêng
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between sm:justify-end gap-2">
            <div className="flex items-center space-x-1 bg-slate-800 p-1 rounded-xl text-xs">
              <button
                type="button"
                className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-blue-600 text-white shadow-xs"
              >
                Tạo một cuốc
              </button>
              <button
                type="button"
                onClick={() => { onClose(); if (onSwitchToBatch) onSwitchToBatch(); }}
                className="px-2.5 py-1.5 rounded-lg text-xs font-bold text-slate-300 hover:text-white hover:bg-slate-700/60 transition-all"
              >
                Nhập nhiều cuốc
              </button>
              <button
                type="button"
                onClick={() => { onClose(); if (onSwitchToExcelImport) onSwitchToExcelImport(); }}
                className="px-2.5 py-1.5 rounded-lg text-xs font-bold text-slate-300 hover:text-white hover:bg-slate-700/60 transition-all flex items-center space-x-1"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
                <span>Nhập Excel</span>
              </button>
            </div>

            <button
              onClick={onClose}
              aria-label="Đóng cửa sổ"
              className="shrink-0 p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Thông báo lỗi / thành công */}
        {err && (
          <div className="mx-4 sm:mx-5 mt-3 p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center space-x-2 shrink-0">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
            <span>{err}</span>
          </div>
        )}
        {msg && (
          <div className="mx-4 sm:mx-5 mt-3 p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs flex items-center space-x-2 shrink-0">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
            <span>{msg}</span>
          </div>
        )}

        {/* Datalist địa điểm cảng / nâng hạ dùng chung */}
        <datalist id="port-location-suggestions">
          {ports.map(p => <option key={p.id || p.code} value={p.name} />)}
        </datalist>

        {/* Form Body Cuộn được */}
        <form onSubmit={handleSubmit} className="p-4 sm:p-5 overflow-y-auto space-y-4 text-xs">
          {/* KHỐI 1: THÔNG TIN CHUYẾN, XE & CONTAINER */}
          <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-1.5 border-b border-slate-200/80">
              <div className="font-bold text-slate-800 flex items-center space-x-1.5">
                <Calendar className="w-3.5 h-3.5 text-blue-600" />
                <span>1. Thông Tin Chuyến, Phương Tiện & Container</span>
              </div>

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

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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

              <div className="sm:col-span-2">
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
                  placeholder="Gõ hoặc chọn khách hàng (VD: TTP, VTM, ĐẠI THỊNH, KÊNH GIANG...)"
                  className="w-full px-3 py-2 text-xs uppercase font-semibold border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white"
                />
                <datalist id="customer-suggestions">
                  {customers.map(c => <option key={c.id} value={c.name} />)}
                </datalist>
              </div>
            </div>

            {vehicleSource === 'INTERNAL' ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[11px] font-bold text-slate-700">Đầu Xe Công Ty</label>
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
                    <label className="text-[11px] font-bold text-slate-700">Lái Xe Phụ Trách</label>
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

            {/* Tuyến đường & Container */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] font-bold text-slate-700">Lịch Trình / Tuyến Đường</label>
                  <button
                    type="button"
                    onClick={() => handleOpenQuickAdd('ROUTE')}
                    className="text-[10px] text-blue-600 hover:text-blue-800 font-bold flex items-center space-x-0.5"
                  >
                    <Plus className="w-3 h-3" />
                    <span>Thêm tuyến</span>
                  </button>
                </div>
                <select
                  value={routeId}
                  onChange={(e) => handleSelectRoute(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 font-medium"
                >
                  <option value="">-- Chọn hoặc nhập tuyến bên cạnh --</option>
                  {routes.map(r => (
                    <option key={r.id} value={r.id}>
                      {r.route_name} {r.default_price ? `(${formatVnd(r.default_price)})` : ''}
                    </option>
                  ))}
                </select>
                {suggestedPrice && (
                  <div className="mt-1 flex items-center justify-between text-[10px] text-slate-500">
                    <span>Cước mẫu: <strong>{formatVnd(suggestedPrice)}</strong></span>
                    <button
                      type="button"
                      onClick={handleApplySuggestedPrice}
                      className="text-blue-600 hover:underline font-bold"
                    >
                      Áp dụng
                    </button>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Tên Tuyến / Điểm Đóng Trả Hàng
                </label>
                <input
                  type="text"
                  value={routeName}
                  onChange={(e) => setRouteName(e.target.value)}
                  placeholder="VD: ĐÓNG VĨNH PHÚC, HẠ VIP GREEN..."
                  className="w-full px-3 py-2 text-xs uppercase font-semibold border border-slate-300 rounded-lg bg-white"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Đánh Dấu Cảng Lạch Huyện (nếu có)
                </label>
                <input
                  type="text"
                  value={lachHuyenMark}
                  onChange={(e) => setLachHuyenMark(e.target.value)}
                  placeholder="VD: HẠ LẠCH HUYỆN / X"
                  className="w-full px-3 py-2 text-xs uppercase border border-slate-300 rounded-lg bg-white"
                />
              </div>
            </div>

            {/* Container & Loại Cont */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] font-bold text-slate-700">
                    Số Container (Cho phép trùng cont nhiều cuốc)
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
                  Loại Container (Kích thước & Chủng loại)
                </label>
                <div className="flex gap-1.5">
                  <select
                    value={containerSizeSelect}
                    onChange={(e) => setContainerSizeSelect(e.target.value)}
                    className="flex-1 px-2.5 py-2 text-xs font-bold border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="20DC">20DC (20' Khô)</option>
                    <option value="40DC">40DC (40' Khô thường)</option>
                    <option value="40HC">40HC (40' Cao)</option>
                    <option value="40RF">40RF (40' Lạnh - Reefer)</option>
                    <option value="40FR">40FR (40' Flat Rack)</option>
                    <option value="45">45' (Cont 45)</option>
                    <option value="20">20' (Chưa rõ loại)</option>
                    <option value="40">40' (Chưa rõ loại)</option>
                    <option value="CUSTOM">Khác (Nhập tay nguyên trạng)</option>
                  </select>
                  {containerSizeSelect === 'CUSTOM' && (
                    <input
                      type="text"
                      value={customContainerSize}
                      onChange={(e) => setCustomContainerSize(e.target.value.toUpperCase())}
                      placeholder="VD: 20OT..."
                      className="w-28 px-2.5 py-2 text-xs font-mono font-bold uppercase border border-blue-400 rounded-lg bg-white"
                    />
                  )}
                </div>
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

            {isMultiContainer && (
              <div className="p-3 bg-indigo-50/60 rounded-lg border border-indigo-200 grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                    Cước Gốc Cont 2 (Chưa VAT)
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

          {/* KHỐI 2: CÔNG THỨC TIỀN CƯỚC (CƯỚC GỐC CHƯA VAT -> VAT 8% -> CÓ VAT -> TRỪ 17% -> SAU TRỪ) */}
          <div className="bg-emerald-50/70 p-3.5 rounded-xl border border-emerald-200 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 pb-1.5 border-b border-emerald-200/80">
              <div className="font-bold text-emerald-950 flex items-center space-x-1.5">
                <Coins className="w-4 h-4 text-emerald-600" />
                <span>2. Tiền Cước Vận Chuyển (Chuẩn Mới: Cước Gốc Chưa VAT → ×1,08 Có VAT → ×0,83 Sau Trừ 17%)</span>
              </div>
              <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                Khoản trừ 17% là quy tắc tính nội bộ Giám đốc
              </span>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-center">
              <div className="lg:col-span-4">
                <label className="block text-[11px] font-bold text-emerald-950 mb-1">
                  Cước Vào Gốc (Chưa VAT) <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="number"
                    required
                    value={tripRevenue}
                    onChange={(e) => setTripRevenue(e.target.value)}
                    placeholder="Nhập cước gốc chưa VAT (VD: 3200000)"
                    className="w-full px-3 py-2.5 text-sm font-extrabold text-emerald-900 border-2 border-emerald-400 rounded-lg focus:ring-2 focus:ring-emerald-500 bg-white"
                  />
                  <span className="absolute right-3 top-2.5 text-xs text-emerald-700 font-bold">
                    {formatVnd(totalCuocGoc)}
                  </span>
                </div>
              </div>

              {/* 4 Ô CHỈ ĐỌC TỰ ĐỘNG TÍNH */}
              <div className="lg:col-span-8 grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div className="p-2.5 bg-white/90 border border-emerald-200 rounded-lg">
                  <div className="text-[10px] text-slate-500 font-semibold">VAT 8% (Làm tròn đồng)</div>
                  <div className="text-xs font-extrabold text-teal-700 mt-0.5">+{formatVnd(fin.vat_amount)}</div>
                </div>
                <div className="p-2.5 bg-white border border-emerald-300 rounded-lg shadow-2xs">
                  <div className="text-[10px] text-emerald-800 font-bold">Tổng Cước Có VAT (×1,08)</div>
                  <div className="text-xs sm:text-sm font-extrabold text-emerald-700 mt-0.5">{formatVnd(fin.cuoc_co_vat)}</div>
                </div>
                <div className="p-2.5 bg-amber-50/90 border border-amber-200 rounded-lg">
                  <div className="text-[10px] text-amber-800 font-semibold">Khoản Trừ 17% Nội Bộ</div>
                  <div className="text-xs font-extrabold text-amber-700 mt-0.5">−{formatVnd(fin.khoan_tru_17)}</div>
                </div>
                <div className="p-2.5 bg-blue-50 border border-blue-300 rounded-lg shadow-2xs">
                  <div className="text-[10px] text-blue-900 font-bold">Cước Sau Trừ 17% (×0,83)</div>
                  <div className="text-xs sm:text-sm font-extrabold text-blue-700 mt-0.5">{formatVnd(fin.cuoc_sau_tru_17)}</div>
                </div>
              </div>
            </div>
          </div>

          {/* KHỐI 3: CHI PHÍ CÔNG TY CHỊU (TÁCH RIÊNG 4 Ô NÂNG/HẠ + DẦU THEO NGÀY + CHI PHÍ KHÁC) */}
          <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-3">
            <div className="font-bold text-slate-800 flex items-center justify-between pb-1.5 border-b border-slate-200/80">
              <div className="flex items-center space-x-1.5">
                <MapPin className="w-3.5 h-3.5 text-indigo-600" />
                <span>3. Chi Phí Công Ty Chịu (Tách 4 Ô Nơi Nâng / Phí Nâng / Nơi Hạ / Phí Hạ & Dầu Ngày Chạy)</span>
              </div>
              <span className="text-[10px] text-slate-500">Không tự suy địa điểm nâng/hạ từ tuyến đường</span>
            </div>

            {/* 4 Ô ĐỘC LẬP: NƠI NÂNG - PHÍ NÂNG - NƠI HẠ - PHÍ HẠ */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 p-3 bg-indigo-50/50 border border-indigo-200/80 rounded-xl">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] font-bold text-indigo-950 flex items-center space-x-1">
                    <ArrowUpCircle className="w-3.5 h-3.5 text-indigo-600" />
                    <span>1. Nơi Nâng Cont</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => handleOpenQuickAdd('PORT_ON')}
                    className="text-[10px] text-indigo-600 hover:underline font-bold"
                  >
                    + Thêm cảng
                  </button>
                </div>
                <input
                  type="text"
                  list="port-location-suggestions"
                  value={liftOnLocation}
                  onChange={(e) => setLiftOnLocation(e.target.value.toUpperCase())}
                  placeholder="Chọn/nhập nơi nâng (VD: VIP GREEN)"
                  className="w-full px-2.5 py-1.5 text-xs uppercase font-semibold border border-indigo-200 rounded-lg bg-white"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-indigo-950 mb-1">
                  2. Phí Nâng (Công ty chịu)
                </label>
                <input
                  type="number"
                  value={liftOnFee}
                  onChange={(e) => setLiftOnFee(e.target.value)}
                  placeholder="0"
                  className="w-full px-2.5 py-1.5 text-xs font-bold border border-indigo-200 rounded-lg bg-white text-indigo-900"
                />
                <div className="text-[10px] text-indigo-700 mt-0.5 text-right font-medium">
                  {formatVnd(liftOnFee)}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] font-bold text-indigo-950 flex items-center space-x-1">
                    <ArrowDownCircle className="w-3.5 h-3.5 text-indigo-600" />
                    <span>3. Nơi Hạ Cont</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => handleOpenQuickAdd('PORT_OFF')}
                    className="text-[10px] text-indigo-600 hover:underline font-bold"
                  >
                    + Thêm cảng
                  </button>
                </div>
                <input
                  type="text"
                  list="port-location-suggestions"
                  value={liftOffLocation}
                  onChange={(e) => setLiftOffLocation(e.target.value.toUpperCase())}
                  placeholder="Chọn/nhập nơi hạ (VD: LẠCH HUYỆN)"
                  className="w-full px-2.5 py-1.5 text-xs uppercase font-semibold border border-indigo-200 rounded-lg bg-white"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-indigo-950 mb-1">
                  4. Phí Hạ (Công ty chịu)
                </label>
                <input
                  type="number"
                  value={liftOffFee}
                  onChange={(e) => setLiftOffFee(e.target.value)}
                  placeholder="0"
                  className="w-full px-2.5 py-1.5 text-xs font-bold border border-indigo-200 rounded-lg bg-white text-indigo-900"
                />
                <div className="text-[10px] text-indigo-700 mt-0.5 text-right font-medium">
                  {formatVnd(liftOffFee)}
                </div>
              </div>
            </div>

            {/* DẦU CẤP THEO LÍT & ĐƠN GIÁ NGÀY CHẠY + CÁC CHI PHÍ KHÁC */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {/* Dầu cấp */}
              <div className="p-2.5 bg-sky-50/80 border border-sky-200 rounded-lg">
                <label className="block text-[11px] font-bold text-sky-950 mb-1 flex items-center justify-between">
                  <span className="flex items-center space-x-1">
                    <Fuel className="w-3.5 h-3.5 text-sky-600" />
                    <span>Dầu Cấp (Lít)</span>
                  </span>
                  <span className="text-[10px] font-semibold text-sky-700">
                    {dailyFuelPrice ? `Giá ${tripDate}: ${formatVnd(dailyFuelPrice)}/L` : `Ngày ${tripDate}: Chưa nhập giá`}
                  </span>
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={fuelLiters}
                  onChange={(e) => setFuelLiters(e.target.value)}
                  placeholder="VD: 75"
                  className="w-full px-2.5 py-1.5 text-xs font-bold border border-sky-300 rounded bg-white text-sky-900"
                />
                <div className="text-[10px] mt-1 flex items-center justify-between">
                  {dauCapLit > 0 && !dailyFuelPrice ? (
                    <span className="text-amber-700 font-bold">⚠️ Chưa có giá dầu ngày chạy</span>
                  ) : (
                    <span className="text-sky-800 font-bold">Tiền dầu: {formatVnd(fin.tien_dau)}</span>
                  )}
                </div>
              </div>

              {/* Tiền đường / cầu phà */}
              <div className="p-2.5 bg-white border border-slate-200 rounded-lg">
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Tiền Đường / Cầu Phà / Cao Tốc
                </label>
                <input
                  type="number"
                  value={tollFee}
                  onChange={(e) => setTollFee(e.target.value)}
                  placeholder="0"
                  className="w-full px-2.5 py-1.5 text-xs font-semibold border border-slate-300 rounded bg-white"
                />
                <div className="text-[10px] text-slate-500 mt-0.5 text-right">{formatVnd(tollFee)}</div>
              </div>

              {/* Cước ra - xe ngoài */}
              {vehicleSource === 'SUBCONTRACTOR' && (
                <div className="p-2.5 bg-amber-50/70 border border-amber-200 rounded-lg">
                  <label className="block text-[11px] font-bold text-amber-950 mb-1">
                    Cước Ra — Tiền Thuê Xe Ngoài
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

              {/* Phí bến bãi / đỗ xe */}
              <div className="p-2.5 bg-white border border-slate-200 rounded-lg">
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Phí Bến Bãi / Đỗ Xe
                </label>
                <input
                  type="number"
                  value={parkingFee}
                  onChange={(e) => setParkingFee(e.target.value)}
                  placeholder="0"
                  className="w-full px-2.5 py-1.5 text-xs font-semibold border border-slate-300 rounded bg-white"
                />
                <div className="text-[10px] text-slate-500 mt-0.5 text-right">{formatVnd(parkingFee)}</div>
              </div>

              {/* Tiền bốc xếp */}
              <div className="p-2.5 bg-white border border-slate-200 rounded-lg">
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Tiền Bốc Xếp / Kiểm Hóa
                </label>
                <input
                  type="number"
                  value={handlingFee}
                  onChange={(e) => setHandlingFee(e.target.value)}
                  placeholder="0"
                  className="w-full px-2.5 py-1.5 text-xs font-semibold border border-slate-300 rounded bg-white"
                />
                <div className="text-[10px] text-slate-500 mt-0.5 text-right">{formatVnd(handlingFee)}</div>
              </div>

              {/* Tiền ăn / phụ cấp chuyến */}
              <div className="p-2.5 bg-white border border-slate-200 rounded-lg">
                <label className="block text-[11px] font-bold text-slate-700 mb-1 flex items-center justify-between">
                  <span>Phát Sinh / Phụ Cấp Chuyến</span>
                  <span className="text-[9px] text-indigo-600 font-normal">Chưa gồm lương</span>
                </label>
                <input
                  type="number"
                  value={mealAllowance}
                  onChange={(e) => setMealAllowance(e.target.value)}
                  placeholder="0"
                  className="w-full px-2.5 py-1.5 text-xs font-semibold border border-slate-300 rounded bg-white"
                />
                <div className="text-[10px] text-slate-500 mt-0.5 text-right">{formatVnd(mealAllowance)}</div>
              </div>
            </div>

            {/* Chi phí khác động */}
            <div className="pt-1 border-t border-slate-200">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11px] font-bold text-slate-700">
                  Khoản Chi Phí Công Ty Khác (thêm nhiều dòng nếu có)
                </span>
                <button
                  type="button"
                  onClick={handleAddOtherExpense}
                  className="text-[10px] text-blue-600 hover:text-blue-800 font-bold flex items-center space-x-1"
                >
                  <Plus className="w-3 h-3" />
                  <span>+ Thêm khoản chi</span>
                </button>
              </div>

              {otherExpenses.map((exp, idx) => (
                <div key={idx} className="flex items-center space-x-2 mb-2">
                  <input
                    type="text"
                    placeholder="Tên khoản chi (VD: Cân xe, sửa lốp...)"
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

          {/* KHỐI 4: TIỀN PHƠI TRẢ HỘ CHỦ HÀNG & NGÀY HẸN HOÀN TIỀN (Mục 7, 8, 9) */}
          <div className="bg-purple-50/70 p-3.5 rounded-xl border border-purple-200 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 pb-1.5 border-b border-purple-200/80">
              <div className="font-bold text-purple-950 flex items-center space-x-1.5">
                <Clock className="w-4 h-4 text-purple-600" />
                <span>4. Tiền Phơi Trả Hộ Chủ Hàng & Lịch Hẹn Hoàn Tiền</span>
              </div>
              <span className="text-[10px] font-bold text-purple-800 bg-purple-100 px-2.5 py-0.5 rounded-full">
                Trả hộ chủ hàng — Không tính vào doanh thu hay chi phí làm giảm lãi chuyến
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-purple-950 mb-1">
                  Số Tiền Phơi Trả Hộ (VND)
                </label>
                <input
                  type="number"
                  value={phoiAdvanceAmount}
                  onChange={(e) => setPhoiAdvanceAmount(e.target.value)}
                  placeholder="Để trống hoặc 0 nếu không trả hộ"
                  className="w-full px-3 py-2 text-xs font-bold border border-purple-300 rounded-lg bg-white text-purple-950"
                />
                <div className="text-[10px] text-purple-700 mt-0.5 text-right font-semibold">
                  {formatVnd(phoiAdvanceAmount)}
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-purple-950 mb-1">
                  Hình Thức Hoàn Tiền Phơi
                </label>
                <select
                  value={phoiRefundMode}
                  onChange={(e) => setPhoiRefundMode(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-bold border border-purple-300 rounded-lg bg-white text-purple-950"
                >
                  <option value="HEN_NGAY">Chưa hoàn — Theo dõi công nợ & hẹn ngày đòi</option>
                  <option value="TUOI">TƯƠI — Chủ hàng hoàn đủ ngay ngày giao dịch</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-purple-950 mb-1">
                  {phoiRefundMode === 'TUOI' ? 'Trạng Thái Hoàn Ngay (TƯƠI)' : 'Ngày Chủ Hàng Hẹn Hoàn Tiền'}
                </label>
                {phoiRefundMode === 'TUOI' ? (
                  <div className="px-3 py-2 text-xs font-bold bg-emerald-100 text-emerald-800 rounded-lg border border-emerald-300">
                    ✓ Ghi nhận hoàn đủ {formatVnd(phoiAdvanceVal)} ngày {tripDate}
                  </div>
                ) : (
                  <input
                    type="date"
                    value={phoiDueDate}
                    onChange={(e) => setPhoiDueDate(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-medium border border-purple-300 rounded-lg bg-white"
                  />
                )}
                {phoiRefundMode === 'HEN_NGAY' && (
                  <div className="text-[10px] text-purple-700 mt-0.5">
                    {phoiDueDate ? `Web sẽ nhắc đòi từ ngày ${phoiDueDate}` : 'Để trống nếu chưa có ngày hẹn (sẽ vào mục Chưa đặt ngày nhắc)'}
                  </div>
                )}
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-purple-950 mb-1">
                Nội Dung / Chứng Từ Tham Chiếu Tiền Phơi (nếu có)
              </label>
              <input
                type="text"
                value={phoiReferenceNote}
                onChange={(e) => setPhoiReferenceNote(e.target.value)}
                placeholder="VD: Phơi nâng hạ cont TCNU1234567, phiếu EIR số..."
                className="w-full px-3 py-1.5 text-xs border border-purple-200 rounded-lg bg-white"
              />
            </div>
          </div>

          {/* KHỐI 5: THANH TOÁN TIỀN CƯỚC & GHI CHÚ */}
          <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-3">
            <div className="font-bold text-slate-800 flex items-center space-x-1.5 pb-1 border-b border-slate-200/80">
              <Receipt className="w-3.5 h-3.5 text-blue-600" />
              <span>5. Trạng Thái Thanh Toán Tiền Cước & Ghi Chú (Độc lập với hoàn tiền phơi)</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Trạng Thái Thanh Toán Cước Vận Chuyển
                </label>
                <select
                  value={customerPaymentStatus}
                  onChange={(e) => setCustomerPaymentStatus(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white font-semibold"
                >
                  <option value="CHUA_TT">Chưa thanh toán cước</option>
                  <option value="TUOI">TƯƠI (Thanh toán cước ngay sau giao dịch)</option>
                  <option value="X">X (Đã thanh toán sau một thời gian)</option>
                  <option value="DA_TT">ĐÃ THANH TOÁN</option>
                  <option value="CN_30_NGAY">CN 30 NGÀY (Điều khoản công nợ 30 ngày)</option>
                  <option value="DOI_TRU">ĐỐI TRỪ (Đối trừ công nợ)</option>
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

          {/* KHỐI 6: BẢNG TỔNG HỢP 7 CHỈ TIÊU TÀI CHÍNH CHUYẾN & TIỀN PHẢI THU */}
          <div className="p-4 bg-gradient-to-br from-slate-900 to-slate-800 text-white rounded-xl shadow-md space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-700 pb-2">
              <span className="text-xs font-bold text-amber-300 uppercase tracking-wider">
                Bảng Kết Quả 7 Chỉ Tiêu Tài Chính Chuyến & Phải Thu
              </span>
              <span className="text-[10px] text-slate-300">
                * Chưa trừ lương tài xế; không trừ tiền phơi trả hộ vào chi phí chuyến
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5 text-center">
              <div className="p-2 bg-slate-800/80 rounded-lg border border-slate-700">
                <div className="text-[10px] text-slate-400">1. Cước chưa VAT</div>
                <div className="text-xs font-bold text-white mt-0.5">{formatVnd(fin.cuoc_goc)}</div>
              </div>
              <div className="p-2 bg-slate-800/80 rounded-lg border border-slate-700">
                <div className="text-[10px] text-slate-400">2. VAT 8%</div>
                <div className="text-xs font-bold text-teal-300 mt-0.5">{formatVnd(fin.vat_amount)}</div>
              </div>
              <div className="p-2 bg-slate-800/80 rounded-lg border border-emerald-700/60">
                <div className="text-[10px] text-emerald-300 font-semibold">3. Cước có VAT</div>
                <div className="text-xs font-extrabold text-emerald-400 mt-0.5">{formatVnd(fin.cuoc_co_vat)}</div>
              </div>
              <div className="p-2 bg-slate-800/80 rounded-lg border border-amber-700/60">
                <div className="text-[10px] text-amber-300">4. Trừ 17% nội bộ</div>
                <div className="text-xs font-bold text-amber-300 mt-0.5">{formatVnd(fin.khoan_tru_17)}</div>
              </div>
              <div className="p-2 bg-slate-800/80 rounded-lg border border-blue-700/60">
                <div className="text-[10px] text-blue-300 font-semibold">5. Cước sau trừ 17%</div>
                <div className="text-xs font-extrabold text-blue-300 mt-0.5">{formatVnd(fin.cuoc_sau_tru_17)}</div>
              </div>
              <div className="p-2 bg-slate-800/80 rounded-lg border border-rose-700/60">
                <div className="text-[10px] text-rose-300">6. Chi phí Cty chịu</div>
                <div className="text-xs font-bold text-rose-300 mt-0.5">{formatVnd(fin.chi_phi_cong_ty)}</div>
              </div>
              <div className="p-2 bg-amber-500/20 rounded-lg border border-amber-400/70 col-span-2 sm:col-span-1">
                <div className="text-[10px] text-amber-200 font-bold">7. Chênh lệch sau trừ</div>
                <div className={`text-xs sm:text-sm font-extrabold mt-0.5 ${fin.chenh_lech_sau_tru_17 >= 0 ? 'text-amber-300' : 'text-rose-400'}`}>
                  {formatVnd(fin.chenh_lech_sau_tru_17)}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-700/80 text-[11px] text-slate-300">
              <div>
                Đối chiếu chênh lệch trước trừ 17% (Cước gốc − Chi phí):{' '}
                <strong className="text-white">{formatVnd(fin.chenh_lech_truoc_tru_goc)}</strong>
              </div>
              <div>
                Tiền phơi trả hộ còn phải thu lại:{' '}
                <strong className="text-purple-300">{formatVnd(fin.phoi_con_phai_thu)}</strong>
              </div>
            </div>
          </div>

          {/* Footer nút hành động */}
          <div className="pt-2 border-t border-slate-200 flex items-center justify-end space-x-2.5 shrink-0">
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
                  {(quickAddType === 'PORT_ON' || quickAddType === 'PORT_OFF') && 'Thêm Cảng / Điểm Nâng Hạ Mới'}
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
                      <label className="block text-[11px] font-bold text-slate-700 mb-0.5">Cước gốc mẫu tham khảo</label>
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

                {(quickAddType === 'PORT_ON' || quickAddType === 'PORT_OFF') && (
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-0.5">Tên Cảng / Bãi Nâng Hạ *</label>
                    <input
                      type="text"
                      required
                      placeholder="VD: VIP GREEN, LẠCH HUYỆN, NAM ĐÌNH VŨ..."
                      onChange={(e) => setQuickAddInput({ ...quickAddInput, name: e.target.value })}
                      className="w-full px-2.5 py-1.5 border rounded uppercase font-bold"
                    />
                  </div>
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
