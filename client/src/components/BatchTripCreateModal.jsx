import { todayInVietnam } from '../utils/businessDate.js';
import React, { useState, useRef, useEffect } from 'react';
import {
  PlusCircle,
  Copy,
  Trash2,
  Clipboard,
  CheckCircle2,
  AlertCircle,
  X,
  Save,
  FileSpreadsheet,
  Edit3,
  Table
} from 'lucide-react';
import {
  fetchVehicles,
  fetchDrivers,
  fetchRoutes,
  fetchCustomersApi,
  fetchSubcontractorsApi,
  fetchPortsApi,
  fetchFuelPricesApi,
  createBatchTripsApi
} from '../services/api.js';
import { formatVnd } from '../data/unifiedBusinessData.js';
import { computeTripFinancials } from '../utils/tripFinancials.js';

export default function BatchTripCreateModal({
  isOpen,
  onClose,
  currentUser,
  onBatchCreated,
  onSwitchToOneTrip,
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
  const [submitResult, setSubmitResult] = useState(null);

  const [rows, setRows] = useState([]);
  const [selectedRowIndices, setSelectedRowIndices] = useState(new Set());

  // Áp dụng chung ngày/xe/tuyến/địa điểm (Không sao chép trạng thái đã thu)
  const [batchApplyField, setBatchApplyField] = useState('trip_date');
  const [batchApplyValue, setBatchApplyValue] = useState('');

  // Modal chỉnh sửa chi tiết dòng (Dùng được cho cả Desktop & Mobile)
  const [editingRowIndex, setEditingRowIndex] = useState(null);

  useEffect(() => {
    if (isOpen) {
      setErr(null);
      setMsg(null);
      setSubmitResult(null);
      loadDropdowns();
      const savedDraft = localStorage.getItem(
        'hoachtoan_batch_trip_draft_' + (currentUser?.id || currentUser?.username || 'local')
      );
      if (savedDraft) {
        try {
          const parsed = JSON.parse(savedDraft);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setRows(parsed.map(r => ({ ...createEmptyRow(), ...r })));
            return;
          }
        } catch (e) {}
      }
      setRows([createEmptyRow(), createEmptyRow(), createEmptyRow()]);
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      localStorage.setItem(
        'hoachtoan_batch_trip_draft_' + (currentUser?.id || currentUser?.username || 'local'),
        JSON.stringify(rows)
      );
    }
  }, [rows, isOpen]);

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

  function createEmptyRow() {
    return {
      trip_date: todayInVietnam(),
      is_subcontractor: 0,
      vehicle_id: '',
      vehicle_plate: '',
      driver_id: '',
      driver_name: '',
      subcontractor_name: '',
      customer_name: '',
      route_name: '',
      pickup_location: '',
      dropoff_location: '',
      container_number: '',
      container_size: '40HC',
      trip_revenue: '', // Cước gốc chưa VAT
      lift_on_location: '',
      lift_on_fee: '',
      lift_off_location: '',
      lift_off_fee: '',
      subcontractor_cost: '',
      toll_fee: '',
      parking_fee: '',
      handling_fee: '',
      meal_allowance: '',
      fuel_liters: '',
      other_costs: '',
      phoi_advance_amount: '',
      phoi_refund_mode: 'HEN_NGAY', // 'HEN_NGAY' | 'TUOI'
      phoi_due_date: '',
      phoi_reference_note: '',
      customer_payment_status: 'CHUA_TT',
      subcontractor_payment_status: 'CHUA_TT',
      notes: '',
      validationError: null
    };
  }

  const handleAddRow = () => {
    setRows(prev => [...prev, createEmptyRow()]);
  };

  // Nhân bản dòng: Tuyệt đối KHÔNG sao chép trạng thái đã thu hoặc đã hoàn tiền phơi (Mục 13)
  const handleDuplicateRow = (idx) => {
    setRows(prev => {
      const copy = [...prev];
      const target = {
        ...copy[idx],
        container_number: '',
        customer_payment_status: 'CHUA_TT',
        subcontractor_payment_status: 'CHUA_TT',
        phoi_refund_mode: 'HEN_NGAY',
        validationError: null
      };
      copy.splice(idx + 1, 0, target);
      return copy;
    });
  };

  const handleRemoveRow = (idx) => {
    setRows(prev => prev.filter((_, i) => i !== idx));
    setSelectedRowIndices(prev => {
      const next = new Set(prev);
      next.delete(idx);
      return next;
    });
  };

  const handleCellChange = (idx, field, value) => {
    setRows(prev => {
      const copy = [...prev];
      const row = { ...copy[idx], [field]: value };

      if (field === 'vehicle_id') {
        const v = vehicles.find(item => item.id === value);
        if (v) {
          row.vehicle_plate = v.plate_number;
          if (v.default_driver_id && !row.driver_id) {
            row.driver_id = v.default_driver_id;
            const d = drivers.find(drv => drv.id === v.default_driver_id);
            if (d) row.driver_name = d.full_name;
          }
        }
      }

      if (field === 'driver_id') {
        const d = drivers.find(drv => drv.id === value);
        if (d) row.driver_name = d.full_name;
      }

      row.validationError = null;
      copy[idx] = row;
      return copy;
    });
  };

  const handleToggleSelectRow = (idx) => {
    setSelectedRowIndices(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedRowIndices.size === rows.length) {
      setSelectedRowIndices(new Set());
    } else {
      setSelectedRowIndices(new Set(rows.map((_, i) => i)));
    }
  };

  // Áp dụng chung ngày/xe/tuyến/loại cont/nơi nâng/nơi hạ (không áp dụng trạng thái đã thu)
  const handleApplyBatch = () => {
    if (selectedRowIndices.size === 0) {
      alert('Vui lòng tích chọn ít nhất một dòng để áp dụng!');
      return;
    }
    if (!batchApplyValue) {
      alert('Vui lòng nhập hoặc chọn giá trị muốn áp dụng!');
      return;
    }

    setRows(prev => {
      return prev.map((row, idx) => {
        if (!selectedRowIndices.has(idx)) return row;
        const updated = { ...row, [batchApplyField]: batchApplyValue };
        if (batchApplyField === 'vehicle_id') {
          const v = vehicles.find(item => item.id === batchApplyValue);
          if (v) updated.vehicle_plate = v.plate_number;
        }
        return updated;
      });
    });
    setMsg(`Đã áp dụng ${batchApplyField} cho ${selectedRowIndices.size} dòng được chọn!`);
    setTimeout(() => setMsg(null), 2500);
  };

  const handlePasteFromExcel = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text || !text.trim()) {
        alert('Bộ nhớ tạm (Clipboard) không có dữ liệu văn bản!');
        return;
      }

      const lines = text.trim().split(/\r?\n/).filter(l => l.trim().length > 0);
      if (lines.length === 0) return;

      const newPastedRows = lines.map(line => {
        const cols = line.split('\t').map(c => c.trim());
        const row = createEmptyRow();
        if (cols[0]) row.trip_date = cols[0];
        if (cols[1]) row.customer_name = cols[1].toUpperCase();
        if (cols[2]) row.route_name = cols[2].toUpperCase();
        if (cols[3]) row.container_number = cols[3].toUpperCase();
        if (cols[4]) {
          const val = cols[4].toUpperCase();
          if (val.includes('15C') || val.includes('15H')) {
            row.vehicle_plate = val;
            const matched = vehicles.find(v => v.plate_number.replace(/[^A-Z0-9]/g, '') === val.replace(/[^A-Z0-9]/g, ''));
            if (matched) row.vehicle_id = matched.id;
          } else {
            row.is_subcontractor = 1;
            row.subcontractor_name = val;
          }
        }
        if (cols[5]) row.trip_revenue = cols[5].replace(/[^0-9]/g, '');
        if (cols[6]) row.subcontractor_cost = cols[6].replace(/[^0-9]/g, '');
        if (cols[7]) row.toll_fee = cols[7].replace(/[^0-9]/g, '');
        if (cols[8]) row.fuel_liters = cols[8].replace(/[^0-9.]/g, '');
        if (cols[9]) row.notes = cols[9];
        return row;
      });

      setRows(prev => [...prev.filter(r => r.customer_name || r.container_number), ...newPastedRows]);
      setMsg(`Đã dán thành công ${newPastedRows.length} dòng từ Excel!`);
      setTimeout(() => setMsg(null), 3000);
    } catch (e) {
      alert('Không thể đọc dữ liệu dán từ clipboard: ' + e.message);
    }
  };

  const handleSaveDraft = () => {
    localStorage.setItem(
      'hoachtoan_batch_trip_draft_' + (currentUser?.id || currentUser?.username || 'local'),
      JSON.stringify(rows)
    );
    setMsg('Đã lưu bản nháp vào trình duyệt thành công!');
    setTimeout(() => setMsg(null), 2500);
  };

  const handleClearDraft = () => {
    if (confirm('Bạn có chắc chắn muốn xóa toàn bộ bản nháp này và tạo lại bảng trống?')) {
      localStorage.removeItem('hoachtoan_batch_trip_draft_' + (currentUser?.id || currentUser?.username || 'local'));
      setRows([createEmptyRow(), createEmptyRow(), createEmptyRow()]);
      setSelectedRowIndices(new Set());
    }
  };

  const getRowFinancials = (r) => {
    const dailyPrice = r.trip_date && fuelPricesMap[r.trip_date] ? fuelPricesMap[r.trip_date] : null;
    const phoiAdv = Math.round(Number(r.phoi_advance_amount) || 0);
    return computeTripFinancials({
      base_revenue: Number(r.trip_revenue) || 0,
      lift_on_fee: Number(r.lift_on_fee) || 0,
      lift_off_fee: Number(r.lift_off_fee) || 0,
      fuel_liters: Number(r.fuel_liters) || 0,
      fuel_unit_price: dailyPrice,
      toll_fee: Number(r.toll_fee) || 0,
      subcontractor_cost: Number(r.subcontractor_cost) || 0,
      parking_fee: Number(r.parking_fee) || 0,
      handling_fee: Number(r.handling_fee) || 0,
      meal_allowance: Number(r.meal_allowance) || 0,
      other_costs: Number(r.other_costs) || 0,
      phoi_advance_amount: phoiAdv,
      phoi_refunded_amount: r.phoi_refund_mode === 'TUOI' ? phoiAdv : 0
    });
  };

  const calculateSummary = () => {
    let validCount = 0;
    let totalCuocGoc = 0;
    let totalCuocCoVat = 0;
    let totalCuocSauTru17 = 0;
    let totalCompanyCost = 0;
    let totalMarginAfter17 = 0;
    let totalPhoiAdvance = 0;

    rows.forEach(r => {
      const f = getRowFinancials(r);
      if (r.trip_date && (r.customer_name || f.cuoc_goc > 0)) {
        validCount++;
        totalCuocGoc += f.cuoc_goc;
        totalCuocCoVat += f.cuoc_co_vat;
        totalCuocSauTru17 += f.cuoc_sau_tru_17;
        totalCompanyCost += f.chi_phi_cong_ty;
        totalMarginAfter17 += f.chenh_lech_sau_tru_17;
        totalPhoiAdvance += f.phoi_tra_ho;
      }
    });

    return {
      validCount,
      totalCuocGoc,
      totalCuocCoVat,
      totalCuocSauTru17,
      totalCompanyCost,
      totalMarginAfter17,
      totalPhoiAdvance
    };
  };

  const summary = calculateSummary();

  const handleSaveAll = async () => {
    setErr(null);
    setMsg(null);
    setSubmitResult(null);

    let hasError = false;
    const validatedRows = rows.map((r) => {
      const copy = { ...r };
      if (!copy.trip_date) {
        copy.validationError = 'Thiếu ngày chạy xe';
        hasError = true;
      } else if (!copy.customer_name.trim()) {
        copy.validationError = 'Thiếu khách hàng';
        hasError = true;
      } else if (!copy.trip_revenue || Number(copy.trip_revenue) <= 0) {
        copy.validationError = 'Thiếu cước vào gốc';
        hasError = true;
      } else {
        copy.validationError = null;
      }
      return copy;
    });

    if (hasError) {
      setRows(validatedRows);
      setErr('Có một số dòng thiếu thông tin bắt buộc (bôi đỏ). Vui lòng kiểm tra và sửa trước khi lưu.');
      return;
    }

    try {
      setSubmitting(true);
      const payloadTrips = rows.map(r => ({
        trip_date: r.trip_date,
        is_subcontractor: Number(r.is_subcontractor) || 0,
        vehicle_id: r.vehicle_id || null,
        vehicle_plate: r.vehicle_plate ? r.vehicle_plate.trim().toUpperCase() : (r.is_subcontractor ? 'XE NGOÀI' : ''),
        driver_id: r.driver_id || null,
        driver_name: r.driver_name ? r.driver_name.trim() : null,
        subcontractor_name: r.subcontractor_name ? r.subcontractor_name.trim().toUpperCase() : null,
        customer_name: r.customer_name.trim().toUpperCase(),
        route_name: r.route_name.trim() || null,
        pickup_location: r.pickup_location.trim() || null,
        dropoff_location: r.dropoff_location.trim() || null,
        container_number: r.container_number ? r.container_number.trim().toUpperCase() : null,
        container_size: r.container_size || '40HC',
        base_revenue: Number(r.trip_revenue) || 0,
        trip_revenue: Number(r.trip_revenue) || 0,
        lift_on_location: r.lift_on_location ? r.lift_on_location.trim().toUpperCase() : null,
        lift_on_fee: Number(r.lift_on_fee) || 0,
        lift_off_location: r.lift_off_location ? r.lift_off_location.trim().toUpperCase() : null,
        lift_off_fee: Number(r.lift_off_fee) || 0,
        subcontractor_cost: Number(r.subcontractor_cost) || 0,
        toll_fee: Number(r.toll_fee) || 0,
        parking_fee: Number(r.parking_fee) || 0,
        handling_fee: Number(r.handling_fee) || 0,
        meal_allowance: Number(r.meal_allowance) || 0,
        fuel_liters: Number(r.fuel_liters) || 0,
        other_costs: Number(r.other_costs) || 0,
        phoi_advance_amount: Number(r.phoi_advance_amount) || 0,
        phoi_is_tuoi: r.phoi_refund_mode === 'TUOI',
        phoi_due_date: r.phoi_refund_mode === 'HEN_NGAY' && r.phoi_due_date ? r.phoi_due_date : null,
        phoi_reference_note: r.phoi_reference_note ? r.phoi_reference_note.trim() : null,
        customer_payment_status: r.customer_payment_status || 'CHUA_TT',
        subcontractor_payment_status: r.subcontractor_payment_status || 'CHUA_TT',
        notes: r.notes ? r.notes.trim() : null,
        source_type: 'BATCH'
      }));

      const requestContent = JSON.stringify(payloadTrips);
      if (requestRef.current?.content !== requestContent) {
        requestRef.current = { content: requestContent, id: crypto.randomUUID() };
      }
      const res = await createBatchTripsApi(payloadTrips, requestRef.current.id);
      if (res.success && !res.data.failed) {
        requestRef.current = null;
        setSubmitResult(res.data);
        localStorage.removeItem('hoachtoan_batch_trip_draft_' + (currentUser?.id || currentUser?.username || 'local'));
        setMsg(`Đã nhập thành công ${res.data.inserted} cuốc xe vào hệ thống!`);
        if (onBatchCreated) onBatchCreated(res.data);
      } else {
        setSubmitResult(res.data || null);
        setErr(
          res.data?.errors?.map(e => `Dòng ${e.index + 1}: ${e.reason}`).join(' · ') ||
            res.error ||
            'Chưa lưu cuốc nào. Kiểm tra và thử lại.'
        );
      }
    } catch (e) {
      setErr(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl max-w-[1440px] w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[96vh]">
        {/* HEADER */}
        <div className="px-4 sm:px-5 py-3.5 bg-slate-900 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-indigo-600 rounded-xl text-white">
              <Table className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm sm:text-base">
                Nhập Nhiều Cuốc Xe Theo Lô (Đồng Bộ VAT 8% • Trừ 17% • Nâng/Hạ • Dầu • Phơi)
              </h3>
              <p className="text-[11px] text-slate-400">
                Mỗi dòng có nút &quot;Chi tiết&quot; để nhập đầy đủ Nơi nâng/Phí nâng, Nơi hạ/Phí hạ, Tiền phơi & Ngày hẹn hoàn
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between sm:justify-end gap-2">
            <div className="flex items-center space-x-1 bg-slate-800 p-1 rounded-xl">
              <button
                type="button"
                onClick={() => { onClose(); if (onSwitchToOneTrip) onSwitchToOneTrip(); }}
                className="px-2.5 py-1.5 rounded-lg text-xs font-bold text-slate-300 hover:text-white hover:bg-slate-700/60 transition-all"
              >
                Tạo một cuốc
              </button>
              <button
                type="button"
                className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-indigo-600 text-white shadow-xs"
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

        {/* THÔNG BÁO */}
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

        <datalist id="batch-port-suggestions">
          {ports.map(p => <option key={p.id || p.code} value={p.name} />)}
        </datalist>

        {/* TOOLBAR */}
        <div className="px-4 sm:px-5 py-2.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2.5 shrink-0 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleAddRow}
              className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg font-bold shadow-xs flex items-center space-x-1 active:scale-95 transition-all"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span>+ Thêm dòng</span>
            </button>

            <button
              type="button"
              onClick={handlePasteFromExcel}
              className="px-3 py-1.5 bg-white hover:bg-slate-100 text-emerald-700 border border-emerald-300 rounded-lg font-bold shadow-xs flex items-center space-x-1"
            >
              <Clipboard className="w-3.5 h-3.5 text-emerald-600" />
              <span>Dán từ Excel</span>
            </button>

            <button
              type="button"
              onClick={handleSaveDraft}
              className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-lg font-semibold flex items-center space-x-1"
            >
              <Save className="w-3.5 h-3.5 text-slate-500" />
              <span>Lưu nháp</span>
            </button>

            <button
              type="button"
              onClick={handleClearDraft}
              className="px-2 py-1.5 text-slate-500 hover:text-rose-600 text-xs font-medium"
            >
              Xóa bảng
            </button>
          </div>

          {/* ÁP DỤNG HÀNG LOẠT (Không có trạng thái đã thu để tránh gán nhầm đã thu) */}
          <div className="flex flex-wrap items-center gap-2 bg-white px-2.5 py-1 rounded-lg border border-slate-200 text-xs">
            <span className="text-[11px] text-slate-500 font-medium">Áp dụng chung:</span>
            <select
              value={batchApplyField}
              onChange={(e) => { setBatchApplyField(e.target.value); setBatchApplyValue(''); }}
              className="text-xs border-0 bg-transparent font-bold text-slate-700 focus:outline-none"
            >
              <option value="trip_date">Ngày chạy</option>
              <option value="customer_name">Khách hàng</option>
              <option value="vehicle_id">Đầu xe</option>
              <option value="route_name">Tuyến đường</option>
              <option value="container_size">Loại Cont</option>
              <option value="lift_on_location">Nơi nâng</option>
              <option value="lift_off_location">Nơi hạ</option>
            </select>

            {batchApplyField === 'trip_date' ? (
              <input
                type="date"
                value={batchApplyValue}
                onChange={(e) => setBatchApplyValue(e.target.value)}
                className="px-2 py-0.5 border border-slate-300 rounded text-xs"
              />
            ) : batchApplyField === 'vehicle_id' ? (
              <select
                value={batchApplyValue}
                onChange={(e) => setBatchApplyValue(e.target.value)}
                className="px-2 py-0.5 border border-slate-300 rounded text-xs"
              >
                <option value="">-- Chọn xe --</option>
                {vehicles.map(v => <option key={v.id} value={v.id}>{v.plate_number}</option>)}
              </select>
            ) : batchApplyField === 'container_size' ? (
              <select
                value={batchApplyValue}
                onChange={(e) => setBatchApplyValue(e.target.value)}
                className="px-2 py-0.5 border border-slate-300 rounded text-xs"
              >
                <option value="">-- Chọn loại cont --</option>
                <option value="20DC">20DC</option>
                <option value="40DC">40DC</option>
                <option value="40HC">40HC</option>
                <option value="40RF">40RF</option>
                <option value="40FR">40FR</option>
                <option value="45">45</option>
              </select>
            ) : (
              <input
                type="text"
                placeholder="Giá trị..."
                value={batchApplyValue}
                onChange={(e) => setBatchApplyValue(e.target.value.toUpperCase())}
                className="px-2 py-0.5 border border-slate-300 rounded text-xs uppercase"
              />
            )}

            <button
              type="button"
              onClick={handleApplyBatch}
              className="px-2.5 py-0.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-[11px] font-bold"
            >
              Áp dụng
            </button>
          </div>
        </div>

        {/* NỘI DUNG BẢNG LƯỚI SPREADSHEET (DESKTOP) & THẺ (MOBILE) */}
        <div className="p-3 sm:p-4 overflow-auto flex-1 text-xs">
          {/* DESKTOP TABLE VIEW */}
          <div className="hidden lg:block overflow-x-auto border border-slate-200 rounded-xl shadow-xs">
            <table className="w-full text-left border-collapse min-w-[1400px]">
              <thead>
                <tr className="bg-slate-100 text-slate-700 text-[10px] font-bold uppercase border-b border-slate-200">
                  <th className="p-2 w-8 text-center">
                    <input
                      type="checkbox"
                      checked={selectedRowIndices.size === rows.length && rows.length > 0}
                      onChange={handleSelectAll}
                      className="rounded"
                    />
                  </th>
                  <th className="p-2 w-10 text-center">STT</th>
                  <th className="p-2 w-28">Ngày Chạy *</th>
                  <th className="p-2 w-28">Đầu Xe</th>
                  <th className="p-2 w-28">Chủ Hàng *</th>
                  <th className="p-2 w-32">Tuyến Đường</th>
                  <th className="p-2 w-28">Số Cont</th>
                  <th className="p-2 w-20">Loại Cont</th>
                  <th className="p-2 w-28 text-right">Cước Gốc (Chưa VAT) *</th>
                  <th className="p-2 w-28 text-right">Sau Trừ 17%</th>
                  <th className="p-2 w-24 text-right">Phí Nâng</th>
                  <th className="p-2 w-24 text-right">Phí Hạ</th>
                  <th className="p-2 w-20 text-right">Dầu (L)</th>
                  <th className="p-2 w-24 text-right">Phơi Trả Hộ</th>
                  <th className="p-2 w-28 text-right">Chênh Lệch</th>
                  <th className="p-2 w-28 text-center">Mở Chi Tiết / Tác Vụ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {rows.map((row, idx) => {
                  const fin = getRowFinancials(row);
                  return (
                    <tr
                      key={idx}
                      className={`hover:bg-slate-50 transition-colors ${
                        row.validationError ? 'bg-rose-50/50' : selectedRowIndices.has(idx) ? 'bg-indigo-50/30' : ''
                      }`}
                    >
                      <td className="p-1.5 text-center">
                        <input
                          type="checkbox"
                          checked={selectedRowIndices.has(idx)}
                          onChange={() => handleToggleSelectRow(idx)}
                          className="rounded"
                        />
                      </td>

                      <td className="p-1.5 text-center font-mono text-slate-400 font-bold">{idx + 1}</td>

                      <td className="p-1">
                        <input
                          type="date"
                          value={row.trip_date}
                          onChange={(e) => handleCellChange(idx, 'trip_date', e.target.value)}
                          className={`w-full px-1.5 py-1 text-xs border rounded bg-white font-medium ${
                            !row.trip_date && row.validationError ? 'border-rose-500 bg-rose-50' : 'border-slate-200'
                          }`}
                        />
                      </td>

                      <td className="p-1">
                        <select
                          value={row.vehicle_id}
                          onChange={(e) => handleCellChange(idx, 'vehicle_id', e.target.value)}
                          className="w-full px-1.5 py-1 text-xs border border-slate-200 rounded bg-white font-mono font-bold"
                        >
                          <option value="">-- Xe --</option>
                          {vehicles.map(v => (
                            <option key={v.id} value={v.id}>{v.plate_number}</option>
                          ))}
                        </select>
                      </td>

                      <td className="p-1">
                        <input
                          type="text"
                          value={row.customer_name}
                          onChange={(e) => handleCellChange(idx, 'customer_name', e.target.value.toUpperCase())}
                          placeholder="TTP, VTM..."
                          className={`w-full px-1.5 py-1 text-xs uppercase font-bold border rounded bg-white ${
                            !row.customer_name && row.validationError ? 'border-rose-500 bg-rose-50' : 'border-slate-200'
                          }`}
                        />
                      </td>

                      <td className="p-1">
                        <input
                          type="text"
                          value={row.route_name}
                          onChange={(e) => handleCellChange(idx, 'route_name', e.target.value.toUpperCase())}
                          placeholder="ĐÓNG VĨNH PHÚC..."
                          className="w-full px-1.5 py-1 text-xs uppercase border border-slate-200 rounded bg-white"
                        />
                      </td>

                      <td className="p-1">
                        <input
                          type="text"
                          value={row.container_number}
                          onChange={(e) => handleCellChange(idx, 'container_number', e.target.value.toUpperCase())}
                          placeholder="TCNU..."
                          className="w-full px-1.5 py-1 text-xs font-mono font-bold uppercase border border-slate-200 rounded bg-white"
                        />
                      </td>

                      <td className="p-1">
                        <select
                          value={row.container_size}
                          onChange={(e) => handleCellChange(idx, 'container_size', e.target.value)}
                          className="w-full px-1 py-1 text-xs font-bold border border-slate-200 rounded bg-white"
                        >
                          <option value="20DC">20DC</option>
                          <option value="40DC">40DC</option>
                          <option value="40HC">40HC</option>
                          <option value="40RF">40RF</option>
                          <option value="40FR">40FR</option>
                          <option value="45">45</option>
                          <option value="20">20</option>
                          <option value="40">40</option>
                        </select>
                      </td>

                      <td className="p-1 text-right">
                        <input
                          type="number"
                          value={row.trip_revenue}
                          onChange={(e) => handleCellChange(idx, 'trip_revenue', e.target.value)}
                          placeholder="0"
                          className={`w-full px-1.5 py-1 text-xs font-bold text-right text-emerald-800 border rounded bg-white ${
                            (!row.trip_revenue || Number(row.trip_revenue) <= 0) && row.validationError
                              ? 'border-rose-500 bg-rose-50'
                              : 'border-slate-200'
                          }`}
                        />
                        {fin.cuoc_co_vat > 0 && (
                          <div className="text-[9px] text-emerald-600 font-semibold">
                            Có VAT: {formatVnd(fin.cuoc_co_vat)}
                          </div>
                        )}
                      </td>

                      <td className="p-1.5 text-right font-bold text-blue-700">
                        {formatVnd(fin.cuoc_sau_tru_17)}
                      </td>

                      <td className="p-1 text-right">
                        <input
                          type="number"
                          value={row.lift_on_fee}
                          onChange={(e) => handleCellChange(idx, 'lift_on_fee', e.target.value)}
                          placeholder="0"
                          className="w-full px-1.5 py-1 text-xs text-right border border-slate-200 rounded bg-white"
                        />
                        {row.lift_on_location && (
                          <div className="text-[9px] text-indigo-600 truncate max-w-[90px]">{row.lift_on_location}</div>
                        )}
                      </td>

                      <td className="p-1 text-right">
                        <input
                          type="number"
                          value={row.lift_off_fee}
                          onChange={(e) => handleCellChange(idx, 'lift_off_fee', e.target.value)}
                          placeholder="0"
                          className="w-full px-1.5 py-1 text-xs text-right border border-slate-200 rounded bg-white"
                        />
                        {row.lift_off_location && (
                          <div className="text-[9px] text-indigo-600 truncate max-w-[90px]">{row.lift_off_location}</div>
                        )}
                      </td>

                      <td className="p-1 text-right">
                        <input
                          type="number"
                          step="0.1"
                          value={row.fuel_liters}
                          onChange={(e) => handleCellChange(idx, 'fuel_liters', e.target.value)}
                          placeholder="0"
                          className="w-full px-1.5 py-1 text-xs font-semibold text-right text-sky-800 border border-slate-200 rounded bg-white"
                        />
                      </td>

                      <td className="p-1 text-right">
                        <input
                          type="number"
                          value={row.phoi_advance_amount}
                          onChange={(e) => handleCellChange(idx, 'phoi_advance_amount', e.target.value)}
                          placeholder="0"
                          className="w-full px-1.5 py-1 text-xs font-semibold text-right text-purple-800 border border-purple-200 rounded bg-white"
                        />
                        {row.phoi_due_date && (
                          <div className="text-[9px] text-purple-600">Hẹn: {row.phoi_due_date}</div>
                        )}
                      </td>

                      <td className="p-1.5 text-right font-bold">
                        <span className={fin.chenh_lech_sau_tru_17 >= 0 ? 'text-amber-700' : 'text-rose-600'}>
                          {formatVnd(fin.chenh_lech_sau_tru_17)}
                        </span>
                      </td>

                      <td className="p-1 text-center">
                        <div className="flex items-center justify-center space-x-1">
                          <button
                            type="button"
                            onClick={() => setEditingRowIndex(idx)}
                            className="px-2 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded text-[10px] font-bold flex items-center space-x-0.5"
                            title="Mở chi tiết dòng (Nơi nâng/hạ, ngày hẹn phơi, chi phí khác)"
                          >
                            <Edit3 className="w-3 h-3" />
                            <span>Chi tiết</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDuplicateRow(idx)}
                            className="p-1 text-slate-400 hover:text-indigo-600 rounded"
                            title="Nhân bản dòng (không chép trạng thái đã thu)"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveRow(idx)}
                            className="p-1 text-slate-400 hover:text-rose-600 rounded"
                            title="Xóa dòng"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* MOBILE / TABLET VIEW (<1024px): DANH SÁCH THẺ GỌN RÕ KÈM NÚT CHI TIẾT */}
          <div className="lg:hidden space-y-3">
            {rows.map((row, idx) => {
              const fin = getRowFinancials(row);
              return (
                <div
                  key={idx}
                  className={`p-3 rounded-xl border bg-white shadow-xs space-y-2 ${
                    row.validationError ? 'border-rose-300 bg-rose-50/30' : 'border-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <span className="w-5 h-5 rounded-full bg-slate-900 text-white text-[10px] font-bold flex items-center justify-center">
                        {idx + 1}
                      </span>
                      <span className="font-bold text-xs text-slate-900">
                        {row.customer_name || 'Chưa nhập khách hàng'}
                      </span>
                      <span className="px-1.5 py-0.5 bg-slate-100 text-slate-700 rounded text-[10px] font-mono font-bold">
                        {row.container_size || '40HC'}
                      </span>
                    </div>
                    <div className="flex items-center space-x-1">
                      <button
                        type="button"
                        onClick={() => setEditingRowIndex(idx)}
                        className="px-2.5 py-1 bg-indigo-600 text-white rounded-lg text-[11px] font-bold flex items-center space-x-1 shadow-2xs"
                      >
                        <Edit3 className="w-3 h-3" />
                        <span>Nhập chi tiết</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDuplicateRow(idx)}
                        className="p-1.5 text-slate-500 hover:text-indigo-600"
                        title="Nhân bản dòng"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemoveRow(idx)}
                        className="p-1.5 text-slate-400 hover:text-rose-600"
                        title="Xóa dòng"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-600 pt-1 border-t border-slate-100">
                    <div>Ngày: <strong>{row.trip_date}</strong></div>
                    <div>Xe: <strong className="font-mono">{row.vehicle_plate || 'Chưa gán'}</strong></div>
                    <div>Cước gốc: <strong className="text-emerald-700">{formatVnd(fin.cuoc_goc)}</strong></div>
                    <div>Có VAT (×1,08): <strong className="text-emerald-800">{formatVnd(fin.cuoc_co_vat)}</strong></div>
                    <div>Sau trừ 17%: <strong className="text-blue-700">{formatVnd(fin.cuoc_sau_tru_17)}</strong></div>
                    <div>Chênh lệch: <strong className={fin.chenh_lech_sau_tru_17 >= 0 ? 'text-amber-700' : 'text-rose-600'}>{formatVnd(fin.chenh_lech_sau_tru_17)}</strong></div>
                    {(fin.phi_nang > 0 || fin.phi_ha > 0) && (
                      <div className="col-span-2 text-indigo-700">
                        Nâng/Hạ: <strong>{formatVnd(fin.phi_nang)} / {formatVnd(fin.phi_ha)}</strong>
                      </div>
                    )}
                    {fin.phoi_tra_ho > 0 && (
                      <div className="col-span-2 text-purple-700">
                        Phơi trả hộ: <strong>{formatVnd(fin.phoi_tra_ho)}</strong>{' '}
                        {row.phoi_due_date ? `(Hẹn hoàn: ${row.phoi_due_date})` : row.phoi_refund_mode === 'TUOI' ? '(TƯƠI)' : '(Chưa đặt ngày nhắc)'}
                      </div>
                    )}
                  </div>

                  {row.validationError && (
                    <div className="text-[10px] text-rose-600 font-bold flex items-center space-x-1 pt-1">
                      <AlertCircle className="w-3 h-3 shrink-0" />
                      <span>{row.validationError}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* CHÂN TRANG: TỔNG KẾT & XÁC NHẬN LƯU */}
        <div className="p-3.5 sm:p-4 bg-slate-900 text-white flex flex-col lg:flex-row lg:items-center justify-between gap-3 shrink-0">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-xs">
            <div>
              <span className="text-slate-400 text-[10px] uppercase">Số Cuốc:</span>
              <div className="font-bold text-white text-xs sm:text-sm">{summary.validCount} / {rows.length}</div>
            </div>
            <div>
              <span className="text-slate-400 text-[10px] uppercase">Cước Gốc (Chưa VAT):</span>
              <div className="font-bold text-white text-xs sm:text-sm">{formatVnd(summary.totalCuocGoc)}</div>
            </div>
            <div>
              <span className="text-emerald-300 text-[10px] uppercase font-semibold">Cước Có VAT (×1,08):</span>
              <div className="font-bold text-emerald-400 text-xs sm:text-sm">{formatVnd(summary.totalCuocCoVat)}</div>
            </div>
            <div>
              <span className="text-blue-300 text-[10px] uppercase font-semibold">Sau Trừ 17% (×0,83):</span>
              <div className="font-bold text-blue-300 text-xs sm:text-sm">{formatVnd(summary.totalCuocSauTru17)}</div>
            </div>
            <div>
              <span className="text-purple-300 text-[10px] uppercase">Phơi Trả Hộ:</span>
              <div className="font-bold text-purple-300 text-xs sm:text-sm">{formatVnd(summary.totalPhoiAdvance)}</div>
            </div>
            <div>
              <span className="text-amber-300 text-[10px] uppercase font-bold">Chênh Lệch Sau Trừ:</span>
              <div className={`font-extrabold text-xs sm:text-sm ${summary.totalMarginAfter17 >= 0 ? 'text-amber-400' : 'text-rose-400'}`}>
                {formatVnd(summary.totalMarginAfter17)}
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-2.5 self-end lg:self-auto">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 border border-slate-700 text-slate-300 rounded-xl hover:bg-slate-800 text-xs font-semibold"
            >
              Đóng
            </button>
            <button
              type="button"
              onClick={handleSaveAll}
              disabled={submitting || rows.length === 0}
              className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold shadow-md active:scale-95 transition-all flex items-center space-x-1.5"
            >
              {submitting ? (
                <span>Đang lưu lô {rows.length} cuốc...</span>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4 text-emerald-300" />
                  <span>Xác Nhận Nhập Toàn Bộ Vào Hệ Thống</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* MODAL CHI TIẾT DÒNG (Đầy đủ các trường Nâng/Hạ, Phơi, Ngày hẹn, Loại cont cho cả Điện thoại & Máy tính) */}
        {editingRowIndex !== null && rows[editingRowIndex] && (() => {
          const r = rows[editingRowIndex];
          const f = getRowFinancials(r);
          return (
            <div className="fixed inset-0 z-60 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs">
              <div className="bg-white rounded-2xl max-w-2xl w-full p-4 sm:p-5 shadow-2xl border border-slate-200 space-y-3 max-h-[92vh] overflow-y-auto text-xs">
                <div className="flex items-center justify-between border-b pb-2.5">
                  <div>
                    <h4 className="font-bold text-sm text-slate-900">
                      Chi Tiết Đầy Đủ Cuốc Xe Dòng #{editingRowIndex + 1}
                    </h4>
                    <p className="text-[11px] text-slate-500">
                      Nhập đủ Nơi nâng/Phí nâng, Nơi hạ/Phí hạ, Tiền phơi trả hộ & Ngày hẹn hoàn tiền
                    </p>
                  </div>
                  <button onClick={() => setEditingRowIndex(null)} className="p-1 text-slate-400 hover:text-slate-600">
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-0.5">Ngày chạy *</label>
                    <input
                      type="date"
                      value={r.trip_date}
                      onChange={(e) => handleCellChange(editingRowIndex, 'trip_date', e.target.value)}
                      className="w-full px-2.5 py-1.5 border rounded"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-[11px] font-bold text-slate-700 mb-0.5">Khách hàng / Chủ hàng *</label>
                    <input
                      type="text"
                      value={r.customer_name}
                      onChange={(e) => handleCellChange(editingRowIndex, 'customer_name', e.target.value.toUpperCase())}
                      className="w-full px-2.5 py-1.5 border rounded uppercase font-bold"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-0.5">Đầu xe</label>
                    <select
                      value={r.vehicle_id}
                      onChange={(e) => handleCellChange(editingRowIndex, 'vehicle_id', e.target.value)}
                      className="w-full px-2 py-1.5 border rounded font-mono font-bold"
                    >
                      <option value="">-- Chọn xe --</option>
                      {vehicles.map(v => <option key={v.id} value={v.id}>{v.plate_number}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-0.5">Lái xe</label>
                    <select
                      value={r.driver_id}
                      onChange={(e) => handleCellChange(editingRowIndex, 'driver_id', e.target.value)}
                      className="w-full px-2 py-1.5 border rounded"
                    >
                      <option value="">-- Lái xe --</option>
                      {drivers.map(d => <option key={d.id} value={d.id}>{d.full_name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-0.5">Tuyến đường</label>
                    <input
                      type="text"
                      value={r.route_name}
                      onChange={(e) => handleCellChange(editingRowIndex, 'route_name', e.target.value.toUpperCase())}
                      className="w-full px-2.5 py-1.5 border rounded uppercase"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-0.5">Số Container</label>
                    <input
                      type="text"
                      value={r.container_number}
                      onChange={(e) => handleCellChange(editingRowIndex, 'container_number', e.target.value.toUpperCase())}
                      className="w-full px-2.5 py-1.5 border rounded font-mono font-bold uppercase"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-0.5">Loại Container</label>
                    <input
                      type="text"
                      list="batch-cont-types"
                      value={r.container_size}
                      onChange={(e) => handleCellChange(editingRowIndex, 'container_size', e.target.value.toUpperCase())}
                      placeholder="20DC, 40DC, 40HC, 40RF, 40FR, 45..."
                      className="w-full px-2.5 py-1.5 border rounded font-mono font-bold uppercase"
                    />
                    <datalist id="batch-cont-types">
                      <option value="20DC" />
                      <option value="40DC" />
                      <option value="40HC" />
                      <option value="40RF" />
                      <option value="40FR" />
                      <option value="45" />
                    </datalist>
                  </div>
                </div>

                {/* TIỀN CƯỚC */}
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl space-y-2">
                  <div>
                    <label className="block text-[11px] font-bold text-emerald-950 mb-0.5">
                      Cước Vào Gốc (Chưa VAT) *
                    </label>
                    <input
                      type="number"
                      value={r.trip_revenue}
                      onChange={(e) => handleCellChange(editingRowIndex, 'trip_revenue', e.target.value)}
                      className="w-full px-2.5 py-1.5 border border-emerald-300 rounded bg-white font-bold text-emerald-900"
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-[11px]">
                    <div>VAT 8%: <strong>{formatVnd(f.vat_amount)}</strong></div>
                    <div>Có VAT (×1,08): <strong className="text-emerald-700">{formatVnd(f.cuoc_co_vat)}</strong></div>
                    <div>Sau trừ 17%: <strong className="text-blue-700">{formatVnd(f.cuoc_sau_tru_17)}</strong></div>
                  </div>
                </div>

                {/* 4 Ô NÂNG & HẠ */}
                <div className="p-3 bg-indigo-50/70 border border-indigo-200 rounded-xl grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[11px] font-bold text-indigo-950 mb-0.5">1. Nơi nâng cont</label>
                    <input
                      type="text"
                      list="batch-port-suggestions"
                      value={r.lift_on_location}
                      onChange={(e) => handleCellChange(editingRowIndex, 'lift_on_location', e.target.value.toUpperCase())}
                      placeholder="VD: VIP GREEN"
                      className="w-full px-2.5 py-1.5 border rounded bg-white uppercase font-semibold"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-indigo-950 mb-0.5">2. Phí nâng (Công ty chịu)</label>
                    <input
                      type="number"
                      value={r.lift_on_fee}
                      onChange={(e) => handleCellChange(editingRowIndex, 'lift_on_fee', e.target.value)}
                      className="w-full px-2.5 py-1.5 border rounded bg-white font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-indigo-950 mb-0.5">3. Nơi hạ cont</label>
                    <input
                      type="text"
                      list="batch-port-suggestions"
                      value={r.lift_off_location}
                      onChange={(e) => handleCellChange(editingRowIndex, 'lift_off_location', e.target.value.toUpperCase())}
                      placeholder="VD: LẠCH HUYỆN"
                      className="w-full px-2.5 py-1.5 border rounded bg-white uppercase font-semibold"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-indigo-950 mb-0.5">4. Phí hạ (Công ty chịu)</label>
                    <input
                      type="number"
                      value={r.lift_off_fee}
                      onChange={(e) => handleCellChange(editingRowIndex, 'lift_off_fee', e.target.value)}
                      className="w-full px-2.5 py-1.5 border rounded bg-white font-bold"
                    />
                  </div>
                </div>

                {/* DẦU & CHI PHÍ KHÁC */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-0.5">Dầu cấp (Lít)</label>
                    <input
                      type="number"
                      step="0.1"
                      value={r.fuel_liters}
                      onChange={(e) => handleCellChange(editingRowIndex, 'fuel_liters', e.target.value)}
                      className="w-full px-2.5 py-1.5 border rounded font-bold text-sky-900"
                    />
                    <div className="text-[10px] text-sky-700 mt-0.5">Tiền dầu: {formatVnd(f.tien_dau)}</div>
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-0.5">Tiền đường</label>
                    <input
                      type="number"
                      value={r.toll_fee}
                      onChange={(e) => handleCellChange(editingRowIndex, 'toll_fee', e.target.value)}
                      className="w-full px-2.5 py-1.5 border rounded"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-0.5">Cước thuê ngoài</label>
                    <input
                      type="number"
                      value={r.subcontractor_cost}
                      onChange={(e) => handleCellChange(editingRowIndex, 'subcontractor_cost', e.target.value)}
                      className="w-full px-2.5 py-1.5 border rounded"
                    />
                  </div>
                </div>

                {/* TIỀN PHƠI TRẢ HỘ & NGÀY HẸN HOÀN */}
                <div className="p-3 bg-purple-50 border border-purple-200 rounded-xl space-y-2">
                  <div className="font-bold text-purple-950 text-[11px]">
                    Tiền Phơi Trả Hộ Chủ Hàng (Tách riêng khỏi phí nâng/hạ & chi phí chuyến)
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <div>
                      <label className="block text-[10px] font-bold text-purple-900 mb-0.5">Số tiền phơi trả hộ</label>
                      <input
                        type="number"
                        value={r.phoi_advance_amount}
                        onChange={(e) => handleCellChange(editingRowIndex, 'phoi_advance_amount', e.target.value)}
                        className="w-full px-2.5 py-1.5 border border-purple-300 rounded bg-white font-bold text-purple-900"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-purple-900 mb-0.5">Hình thức hoàn</label>
                      <select
                        value={r.phoi_refund_mode}
                        onChange={(e) => handleCellChange(editingRowIndex, 'phoi_refund_mode', e.target.value)}
                        className="w-full px-2 py-1.5 border border-purple-300 rounded bg-white font-semibold"
                      >
                        <option value="HEN_NGAY">Hẹn hoàn sau</option>
                        <option value="TUOI">TƯƠI (Hoàn ngay)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-purple-900 mb-0.5">Ngày hẹn hoàn tiền</label>
                      <input
                        type="date"
                        disabled={r.phoi_refund_mode === 'TUOI'}
                        value={r.phoi_due_date}
                        onChange={(e) => handleCellChange(editingRowIndex, 'phoi_due_date', e.target.value)}
                        className="w-full px-2.5 py-1.5 border border-purple-300 rounded bg-white"
                      />
                    </div>
                  </div>
                </div>

                {/* THANH TOÁN CƯỚC & GHI CHÚ */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-0.5">TT Tiền Cước</label>
                    <select
                      value={r.customer_payment_status}
                      onChange={(e) => handleCellChange(editingRowIndex, 'customer_payment_status', e.target.value)}
                      className="w-full px-2.5 py-1.5 border rounded font-semibold"
                    >
                      <option value="CHUA_TT">Chưa TT</option>
                      <option value="TUOI">TƯƠI</option>
                      <option value="X">X (Đã TT)</option>
                      <option value="DA_TT">ĐÃ TT</option>
                      <option value="CN_30_NGAY">CN 30 NGÀY</option>
                      <option value="DOI_TRU">ĐỐI TRỪ</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-0.5">Ghi chú (Cột R)</label>
                    <input
                      type="text"
                      value={r.notes}
                      onChange={(e) => handleCellChange(editingRowIndex, 'notes', e.target.value)}
                      className="w-full px-2.5 py-1.5 border rounded"
                    />
                  </div>
                </div>

                <div className="pt-2 border-t flex items-center justify-between">
                  <div className="text-xs font-bold text-slate-800">
                    Chênh lệch sau trừ 17%: <span className="text-amber-700">{formatVnd(f.chenh_lech_sau_tru_17)}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditingRowIndex(null)}
                    className="px-5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold"
                  >
                    Xong Dòng #{editingRowIndex + 1}
                  </button>
                </div>
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
}
