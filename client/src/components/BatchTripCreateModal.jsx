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
  Layers, 
  Save, 
  RefreshCw, 
  FileSpreadsheet, 
  Check, 
  Edit3, 
  ChevronRight, 
  ChevronDown,
  Sparkles,
  SlidersHorizontal,
  Table,
  Columns
} from 'lucide-react';
import { 
  fetchVehicles, 
  fetchDrivers, 
  fetchRoutes, 
  fetchCustomersApi,
  fetchSubcontractorsApi,
  createBatchTripsApi 
} from '../services/api.js';
import { formatVnd } from '../data/unifiedBusinessData.js';

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
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState(null);
  const [msg, setMsg] = useState(null);
  const [submitResult, setSubmitResult] = useState(null);

  // Danh sách dòng cuốc xe nhập theo lô
  const [rows, setRows] = useState([]);
  const [selectedRowIndices, setSelectedRowIndices] = useState(new Set());

  // Áp dụng hàng loạt (Batch apply)
  const [batchApplyField, setBatchApplyField] = useState('trip_date');
  const [batchApplyValue, setBatchApplyValue] = useState('');

  // Mobile Drawer chỉnh sửa chi tiết dòng
  const [editingRowIndex, setEditingRowIndex] = useState(null);

  // Tải danh mục hỗ trợ
  useEffect(() => {
    if (isOpen) {
      setErr(null);
      setMsg(null);
      setSubmitResult(null);
      loadDropdowns();
      // Khôi phục nháp từ localStorage nếu có, nếu không tạo sẵn 3 dòng trống
      const savedDraft = localStorage.getItem('hoachtoan_batch_trip_draft_' + (currentUser?.id || currentUser?.username || 'local'));
      if (savedDraft) {
        try {
          const parsed = JSON.parse(savedDraft);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setRows(parsed);
            return;
          }
        } catch (e) {}
      }
      setRows([createEmptyRow(), createEmptyRow(), createEmptyRow()]);
    }
  }, [isOpen]);

  useEffect(() => { if(isOpen) localStorage.setItem('hoachtoan_batch_trip_draft_' + (currentUser?.id || currentUser?.username || 'local'), JSON.stringify(rows)); }, [rows, isOpen]);

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
      trip_revenue: '',
      subcontractor_cost: '',
      toll_fee: '',
      port_fee: '',
      parking_fee: '',
      handling_fee: '',
      meal_allowance: '',
      fuel_liters: '',
      other_costs: '',
      customer_payment_status: 'CHUA_TT',
      subcontractor_payment_status: 'CHUA_TT',
      notes: '',
      validationError: null
    };
  }

  // Thêm dòng mới
  const handleAddRow = () => {
    setRows(prev => [...prev, createEmptyRow()]);
  };

  // Nhân bản dòng
  const handleDuplicateRow = (idx) => {
    setRows(prev => {
      const copy = [...prev];
      const target = { ...copy[idx], container_number: '' }; // Không nhân bản số cont để tránh trùng
      copy.splice(idx + 1, 0, target);
      return copy;
    });
  };

  // Xóa dòng
  const handleRemoveRow = (idx) => {
    setRows(prev => prev.filter((_, i) => i !== idx));
    setSelectedRowIndices(prev => {
      const next = new Set(prev);
      next.delete(idx);
      return next;
    });
  };

  // Cập nhật giá trị ô
  const handleCellChange = (idx, field, value) => {
    setRows(prev => {
      const copy = [...prev];
      const row = { ...copy[idx], [field]: value };

      // Tự động suy ra biển số khi chọn xe
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

      // Tự động suy ra tên tài xế khi chọn lái xe
      if (field === 'driver_id') {
        const d = drivers.find(drv => drv.id === value);
        if (d) row.driver_name = d.full_name;
      }

      // Xóa lỗi validation khi người dùng sửa
      row.validationError = null;
      copy[idx] = row;
      return copy;
    });
  };

  // Toggle chọn dòng
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

  // Áp dụng giá trị hàng loạt cho các dòng đã chọn
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

  // Dán từ Clipboard Excel (TSV)
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
        // Giả định thứ tự cột Excel phổ biến:
        // [0: Ngày, 1: Chủ hàng, 2: Tuyến, 3: Cont, 4: Biển số / Nhà xe, 5: Cước vào, 6: Cước ra, 7: Cầu đường, 8: Dầu, 9: Ghi chú]
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

  // Lưu nháp vào LocalStorage
  const handleSaveDraft = () => {
    localStorage.setItem('hoachtoan_batch_trip_draft_' + (currentUser?.id || currentUser?.username || 'local'), JSON.stringify(rows));
    setMsg('Đã lưu bản nháp vào trình duyệt thành công!');
    setTimeout(() => setMsg(null), 2500);
  };

  // Xóa bản nháp
  const handleClearDraft = () => {
    if (confirm('Bạn có chắc chắn muốn xóa toàn bộ bản nháp này và tạo lại bảng trống?')) {
      localStorage.removeItem('hoachtoan_batch_trip_draft_' + (currentUser?.id || currentUser?.username || 'local'));
      setRows([createEmptyRow(), createEmptyRow(), createEmptyRow()]);
      setSelectedRowIndices(new Set());
    }
  };

  // Tính toán tổng hợp cho toàn bảng
  const calculateSummary = () => {
    let validCount = 0;
    let totalRev = 0;
    let totalDirectCost = 0;
    let totalFuel = 0;

    rows.forEach(r => {
      const rev = Number(r.trip_revenue) || 0;
      const sub = Number(r.subcontractor_cost) || 0;
      const toll = Number(r.toll_fee) || 0;
      const port = Number(r.port_fee) || 0;
      const park = Number(r.parking_fee) || 0;
      const hand = Number(r.handling_fee) || 0;
      const meal = Number(r.meal_allowance) || 0;
      const other = Number(r.other_costs) || 0;
      const fuel = Number(r.fuel_liters) || 0;

      if (r.trip_date && (r.customer_name || rev > 0)) {
        validCount++;
        totalRev += rev;
        totalDirectCost += (sub + toll + port + park + hand + meal + other);
        totalFuel += fuel;
      }
    });

    const totalProfit = totalRev - totalDirectCost;
    return { validCount, totalRev, totalDirectCost, totalFuel, totalProfit };
  };

  const summary = calculateSummary();

  // Xác nhận lưu toàn bộ bảng vào DB
  const handleSaveAll = async () => {
    setErr(null);
    setMsg(null);
    setSubmitResult(null);

    // Validate từng dòng
    let hasError = false;
    const validatedRows = rows.map((r, idx) => {
      const copy = { ...r };
      if (!copy.trip_date) {
        copy.validationError = 'Thiếu ngày chạy xe';
        hasError = true;
      } else if (!copy.customer_name.trim()) {
        copy.validationError = 'Thiếu khách hàng';
        hasError = true;
      } else if (!copy.trip_revenue || Number(copy.trip_revenue) <= 0) {
        copy.validationError = 'Thiếu cước vào';
        hasError = true;
      } else {
        copy.validationError = null;
      }
      return copy;
    });

    if (hasError) {
      setRows(validatedRows);
      setErr('Có một số ô bị lỗi hoặc thiếu thông tin bắt buộc (bôi đỏ). Vui lòng kiểm tra và sửa trước khi lưu.');
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
        trip_revenue: Number(r.trip_revenue) || 0,
        subcontractor_cost: Number(r.subcontractor_cost) || 0,
        toll_fee: Number(r.toll_fee) || 0,
        port_fee: Number(r.port_fee) || 0,
        parking_fee: Number(r.parking_fee) || 0,
        handling_fee: Number(r.handling_fee) || 0,
        meal_allowance: Number(r.meal_allowance) || 0,
        fuel_liters: Number(r.fuel_liters) || 0,
        other_costs: Number(r.other_costs) || 0,
        customer_payment_status: r.customer_payment_status || 'CHUA_TT',
        subcontractor_payment_status: r.subcontractor_payment_status || 'CHUA_TT',
        notes: r.notes ? r.notes.trim() : null,
        source_type: 'BATCH'
      }));

      const requestContent = JSON.stringify(payloadTrips);
      if(requestRef.current?.content !== requestContent)requestRef.current = {content:requestContent,id:crypto.randomUUID()};
      const res = await createBatchTripsApi(payloadTrips,requestRef.current.id);
      if (res.success && !res.data.failed) {
        setSubmitResult(res.data);
        localStorage.removeItem('hoachtoan_batch_trip_draft_' + (currentUser?.id || currentUser?.username || 'local'));
        setMsg(`Đã nhập thành công ${res.data.inserted} cuốc xe vào hệ thống!`);
        if (onBatchCreated) onBatchCreated(res.data);
      } else {
        setSubmitResult(res.data || null);
        setErr(res.data?.errors?.map(e => `Dòng ${e.index + 1}: ${e.reason}`).join(' · ') || res.error || 'Chưa lưu cuốc nào. Kiểm tra và thử lại.');
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
      <div className="bg-white rounded-2xl max-w-7xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[96vh]">
        
        {/* HEADER VỚI BỘ 3 LỰA CHỌN CẠNH NHAU */}
        <div className="px-5 py-3.5 bg-slate-900 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-indigo-600 rounded-xl text-white">
              <Table className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm sm:text-base flex items-center space-x-2">
                <span>Quản Lý Nhập Cuốc Xe</span>
              </h3>
              <p className="text-[11px] text-slate-400">
                Nhập bảng nhiều cuốc, dán nhanh từ Excel, kiểm tra lỗi từng ô và tính toán lãi trước khi lưu
              </p>
            </div>
          </div>

          {/* BỘ 3 LỰA CHỌN CẠNH NHAU (ĐÚNG YÊU CẦU MỤC 3) */}
          <div className="flex items-center space-x-1.5 bg-slate-800 p-1 rounded-xl self-start sm:self-auto">
            <button
              type="button"
              onClick={() => { onClose(); if (onSwitchToOneTrip) onSwitchToOneTrip(); }}
              className="px-3 py-1.5 rounded-lg text-xs font-bold text-slate-300 hover:text-white hover:bg-slate-700/60 transition-all"
            >
              Tạo một cuốc
            </button>
            <button
              type="button"
              className="px-3 py-1.5 rounded-lg text-xs font-bold bg-indigo-600 text-white shadow-xs"
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

        {/* THÔNG BÁO LỖI / THÀNH CÔNG */}
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

        {/* THANH CÔNG CỤ THAO TÁC BẢNG (TOOLBAR) */}
        <div className="px-5 py-2.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2.5 shrink-0 text-xs">
          <div className="flex items-center space-x-2">
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
              title="Đọc dữ liệu từ clipboard dán vào bảng"
            >
              <Clipboard className="w-3.5 h-3.5 text-emerald-600" />
              <span>Dán từ Excel</span>
            </button>

            <button
              type="button"
              onClick={handleSaveDraft}
              className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-lg font-semibold flex items-center space-x-1"
              title="Lưu nháp vào trình duyệt để tiếp tục sau"
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

          {/* KHỐI ÁP DỤNG HÀNG LOẠT (BATCH APPLY) */}
          <div className="flex items-center space-x-2 bg-white px-2.5 py-1 rounded-lg border border-slate-200 text-xs">
            <span className="text-[11px] text-slate-500 font-medium">Áp dụng cho dòng chọn:</span>
            <select
              value={batchApplyField}
              onChange={(e) => { setBatchApplyField(e.target.value); setBatchApplyValue(''); }}
              className="text-xs border-0 bg-transparent font-bold text-slate-700 focus:outline-none"
            >
              <option value="trip_date">Ngày chạy</option>
              <option value="customer_name">Khách hàng</option>
              <option value="vehicle_id">Đầu xe</option>
              <option value="route_name">Tuyến đường</option>
              <option value="customer_payment_status">TT Khách</option>
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
            ) : batchApplyField === 'customer_payment_status' ? (
              <select
                value={batchApplyValue}
                onChange={(e) => setBatchApplyValue(e.target.value)}
                className="px-2 py-0.5 border border-slate-300 rounded text-xs"
              >
                <option value="CHUA_TT">Chưa TT</option>
                <option value="TUOI">TƯƠI</option>
                <option value="X">X (Đã TT)</option>
                <option value="DA_TT">ĐÃ TT</option>
                <option value="DOI_TRU">ĐỐI TRỪ</option>
              </select>
            ) : (
              <input
                type="text"
                placeholder="Giá trị..."
                value={batchApplyValue}
                onChange={(e) => setBatchApplyValue(e.target.value)}
                className="px-2 py-0.5 border border-slate-300 rounded text-xs uppercase"
              />
            )}

            <button
              type="button"
              onClick={handleApplyBatch}
              className="px-2 py-0.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-[11px] font-bold"
            >
              Áp dụng
            </button>
          </div>
        </div>

        {/* NỘI DUNG BẢNG LƯỚI SPREADSHEET (DESKTOP) & THẺ (MOBILE) */}
        <div className="p-3 sm:p-5 overflow-auto flex-1 text-xs">
          
          {/* DESKTOP TABLE VIEW */}
          <div className="hidden lg:block overflow-x-auto border border-slate-200 rounded-xl shadow-xs">
            <table className="w-full text-left border-collapse min-w-[1300px]">
              <thead>
                <tr className="bg-slate-100 text-slate-700 text-[11px] font-bold uppercase border-b border-slate-200">
                  <th className="p-2 w-10 text-center">
                    <input
                      type="checkbox"
                      checked={selectedRowIndices.size === rows.length && rows.length > 0}
                      onChange={handleSelectAll}
                      className="rounded"
                    />
                  </th>
                  <th className="p-2 w-12 text-center">STT</th>
                  <th className="p-2 w-28">Ngày Chạy *</th>
                  <th className="p-2 w-28">Đầu Xe</th>
                  <th className="p-2 w-28">Lái Xe</th>
                  <th className="p-2 w-32">Chủ Hàng *</th>
                  <th className="p-2 w-36">Tuyến Đường</th>
                  <th className="p-2 w-28">Số Cont</th>
                  <th className="p-2 w-32 text-right">Cước Vào (đã VAT) *</th>
                  <th className="p-2 w-28 text-right">Cước Ra</th>
                  <th className="p-2 w-24 text-right">Tiền Đường</th>
                  <th className="p-2 w-20 text-right">Dầu (L)</th>
                  <th className="p-2 w-28 text-right">Lãi Tạm Tính</th>
                  <th className="p-2 w-28">Thanh Toán</th>
                  <th className="p-2 w-32">Ghi Chú</th>
                  <th className="p-2 w-20 text-center">Tác Vụ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {rows.map((row, idx) => {
                  const rev = Number(row.trip_revenue) || 0;
                  const directCost = (Number(row.subcontractor_cost) || 0) +
                                     (Number(row.toll_fee) || 0) +
                                     (Number(row.port_fee) || 0) +
                                     (Number(row.parking_fee) || 0) +
                                     (Number(row.handling_fee) || 0) +
                                     (Number(row.meal_allowance) || 0) +
                                     (Number(row.other_costs) || 0);
                  const profit = rev - directCost;

                  return (
                    <tr 
                      key={idx} 
                      className={`hover:bg-slate-50 transition-colors ${
                        row.validationError ? 'bg-rose-50/50' : selectedRowIndices.has(idx) ? 'bg-indigo-50/30' : ''
                      }`}
                    >
                      <td className="p-2 text-center">
                        <input
                          type="checkbox"
                          checked={selectedRowIndices.has(idx)}
                          onChange={() => handleToggleSelectRow(idx)}
                          className="rounded"
                        />
                      </td>

                      <td className="p-2 text-center font-mono text-slate-400 font-bold">
                        {idx + 1}
                      </td>

                      {/* Ngày chạy */}
                      <td className="p-1">
                        <input
                          type="date"
                          value={row.trip_date}
                          onChange={(e) => handleCellChange(idx, 'trip_date', e.target.value)}
                          className={`w-full px-2 py-1 text-xs border rounded bg-white font-medium ${
                            !row.trip_date && row.validationError ? 'border-rose-500 bg-rose-50' : 'border-slate-200'
                          }`}
                        />
                      </td>

                      {/* Đầu xe */}
                      <td className="p-1">
                        <select
                          value={row.vehicle_id}
                          onChange={(e) => handleCellChange(idx, 'vehicle_id', e.target.value)}
                          className="w-full px-2 py-1 text-xs border border-slate-200 rounded bg-white font-mono font-bold"
                        >
                          <option value="">-- Xe --</option>
                          {vehicles.map(v => (
                            <option key={v.id} value={v.id}>{v.plate_number}</option>
                          ))}
                        </select>
                      </td>

                      {/* Lái xe */}
                      <td className="p-1">
                        <select
                          value={row.driver_id}
                          onChange={(e) => handleCellChange(idx, 'driver_id', e.target.value)}
                          className="w-full px-2 py-1 text-xs border border-slate-200 rounded bg-white"
                        >
                          <option value="">-- Lái xe --</option>
                          {drivers.map(d => (
                            <option key={d.id} value={d.id}>{d.full_name}</option>
                          ))}
                        </select>
                      </td>

                      {/* Chủ hàng */}
                      <td className="p-1">
                        <input
                          type="text"
                          value={row.customer_name}
                          onChange={(e) => handleCellChange(idx, 'customer_name', e.target.value.toUpperCase())}
                          placeholder="TTP, VTM..."
                          className={`w-full px-2 py-1 text-xs uppercase font-bold border rounded bg-white ${
                            !row.customer_name && row.validationError ? 'border-rose-500 bg-rose-50' : 'border-slate-200'
                          }`}
                        />
                      </td>

                      {/* Tuyến đường */}
                      <td className="p-1">
                        <input
                          type="text"
                          value={row.route_name}
                          onChange={(e) => handleCellChange(idx, 'route_name', e.target.value.toUpperCase())}
                          placeholder="ĐÓNG BÌNH XUYÊN..."
                          className="w-full px-2 py-1 text-xs uppercase border border-slate-200 rounded bg-white"
                        />
                      </td>

                      {/* Số Cont */}
                      <td className="p-1">
                        <input
                          type="text"
                          value={row.container_number}
                          onChange={(e) => handleCellChange(idx, 'container_number', e.target.value.toUpperCase())}
                          placeholder="MSMU..."
                          className="w-full px-2 py-1 text-xs font-mono font-bold uppercase border border-slate-200 rounded bg-white"
                        />
                      </td>

                      {/* Cước vào */}
                      <td className="p-1 text-right">
                        <input
                          type="number"
                          value={row.trip_revenue}
                          onChange={(e) => handleCellChange(idx, 'trip_revenue', e.target.value)}
                          placeholder="0"
                          className={`w-full px-2 py-1 text-xs font-bold text-right text-emerald-800 border rounded bg-white ${
                            (!row.trip_revenue || Number(row.trip_revenue) <= 0) && row.validationError 
                              ? 'border-rose-500 bg-rose-50' 
                              : 'border-slate-200'
                          }`}
                        />
                      </td>

                      {/* Cước ra */}
                      <td className="p-1 text-right">
                        <input
                          type="number"
                          value={row.subcontractor_cost}
                          onChange={(e) => handleCellChange(idx, 'subcontractor_cost', e.target.value)}
                          placeholder="0"
                          className="w-full px-2 py-1 text-xs font-semibold text-right text-amber-800 border border-slate-200 rounded bg-white"
                        />
                      </td>

                      {/* Tiền đường */}
                      <td className="p-1 text-right">
                        <input
                          type="number"
                          value={row.toll_fee}
                          onChange={(e) => handleCellChange(idx, 'toll_fee', e.target.value)}
                          placeholder="0"
                          className="w-full px-2 py-1 text-xs text-right border border-slate-200 rounded bg-white"
                        />
                      </td>

                      {/* Dầu */}
                      <td className="p-1 text-right">
                        <input
                          type="number"
                          step="0.1"
                          value={row.fuel_liters}
                          onChange={(e) => handleCellChange(idx, 'fuel_liters', e.target.value)}
                          placeholder="0"
                          className="w-full px-2 py-1 text-xs font-semibold text-right text-sky-800 border border-slate-200 rounded bg-white"
                        />
                      </td>

                      {/* Lãi tạm tính tự động */}
                      <td className="p-2 text-right font-bold">
                        <span className={profit >= 0 ? 'text-amber-700' : 'text-rose-600'}>
                          {formatVnd(profit)}
                        </span>
                      </td>

                      {/* Thanh toán */}
                      <td className="p-1">
                        <select
                          value={row.customer_payment_status}
                          onChange={(e) => handleCellChange(idx, 'customer_payment_status', e.target.value)}
                          className="w-full px-1.5 py-1 text-[11px] border border-slate-200 rounded bg-white"
                        >
                          <option value="CHUA_TT">Chưa TT</option>
                          <option value="TUOI">TƯƠI</option>
                          <option value="X">X (Đã TT)</option>
                          <option value="DA_TT">ĐÃ TT</option>
                          <option value="DOI_TRU">ĐỐI TRỪ</option>
                        </select>
                      </td>

                      {/* Ghi chú */}
                      <td className="p-1">
                        <input
                          type="text"
                          value={row.notes}
                          onChange={(e) => handleCellChange(idx, 'notes', e.target.value)}
                          placeholder="Cột R..."
                          className="w-full px-2 py-1 text-xs border border-slate-200 rounded bg-white"
                        />
                      </td>

                      {/* Tác vụ */}
                      <td className="p-1 text-center">
                        <div className="flex items-center justify-center space-x-1">
                          <button
                            type="button"
                            onClick={() => handleDuplicateRow(idx)}
                            className="p-1 text-slate-400 hover:text-indigo-600 rounded"
                            title="Nhân bản dòng"
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

          {/* MOBILE VIEW (390px): DANH SÁCH THẺ GỌN RÕ */}
          <div className="lg:hidden space-y-3">
            {rows.map((row, idx) => {
              const rev = Number(row.trip_revenue) || 0;
              const directCost = (Number(row.subcontractor_cost) || 0) + (Number(row.toll_fee) || 0);
              const profit = rev - directCost;

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
                        {row.customer_name || 'Chưa có tên khách'}
                      </span>
                    </div>
                    <div className="flex items-center space-x-1">
                      <button
                        type="button"
                        onClick={() => setEditingRowIndex(idx)}
                        className="px-2 py-1 bg-blue-50 text-blue-700 rounded text-[11px] font-bold flex items-center space-x-1"
                      >
                        <Edit3 className="w-3 h-3" />
                        <span>Sửa chi tiết</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemoveRow(idx)}
                        className="p-1 text-slate-400 hover:text-rose-600"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-600 pt-1 border-t border-slate-100">
                    <div>Ngày: <strong>{row.trip_date}</strong></div>
                    <div>Xe: <strong className="font-mono">{row.vehicle_plate || 'Chưa gán'}</strong></div>
                    <div>Cước vào: <strong className="text-emerald-700">{formatVnd(rev)}</strong></div>
                    <div>Lãi tạm tính: <strong className={profit >= 0 ? 'text-amber-700' : 'text-rose-600'}>{formatVnd(profit)}</strong></div>
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
        <div className="p-4 bg-slate-900 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
            <div>
              <span className="text-slate-400 text-[10px] uppercase">Số Cuốc Xe:</span>
              <div className="font-bold text-white text-sm">{summary.validCount} / {rows.length} cuốc</div>
            </div>
            <div>
              <span className="text-slate-400 text-[10px] uppercase">Tổng Cước Vào:</span>
              <div className="font-bold text-emerald-400 text-sm">{formatVnd(summary.totalRev)}</div>
            </div>
            <div>
              <span className="text-slate-400 text-[10px] uppercase">Tổng Chi Phí:</span>
              <div className="font-bold text-rose-300 text-sm">{formatVnd(summary.totalDirectCost)}</div>
            </div>
            <div>
              <span className="text-amber-300 text-[10px] uppercase font-bold">Lãi Tạm Tính:</span>
              <div className={`font-extrabold text-sm ${summary.totalProfit >= 0 ? 'text-amber-400' : 'text-rose-400'}`}>
                {formatVnd(summary.totalProfit)}
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-2.5 self-end sm:self-auto">
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

        {/* MODAL SỬA CHI TIẾT DÒNG CHO MOBILE VIEW */}
        {editingRowIndex !== null && rows[editingRowIndex] && (
          <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
            <div className="bg-white rounded-2xl max-w-md w-full p-5 shadow-2xl border border-slate-200 space-y-3 max-h-[90vh] overflow-y-auto text-xs">
              <div className="flex items-center justify-between border-b pb-2">
                <h4 className="font-bold text-sm text-slate-900">
                  Chi Tiết Cuốc Xe Dòng #{editingRowIndex + 1}
                </h4>
                <button onClick={() => setEditingRowIndex(null)} className="text-slate-400 hover:text-slate-600">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-2.5">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-0.5">Ngày chạy *</label>
                  <input
                    type="date"
                    value={rows[editingRowIndex].trip_date}
                    onChange={(e) => handleCellChange(editingRowIndex, 'trip_date', e.target.value)}
                    className="w-full px-2.5 py-1.5 border rounded"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-0.5">Khách hàng *</label>
                  <input
                    type="text"
                    value={rows[editingRowIndex].customer_name}
                    onChange={(e) => handleCellChange(editingRowIndex, 'customer_name', e.target.value.toUpperCase())}
                    className="w-full px-2.5 py-1.5 border rounded uppercase font-bold"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-0.5">Đầu xe</label>
                    <select
                      value={rows[editingRowIndex].vehicle_id}
                      onChange={(e) => handleCellChange(editingRowIndex, 'vehicle_id', e.target.value)}
                      className="w-full px-2 py-1.5 border rounded"
                    >
                      <option value="">-- Chọn xe --</option>
                      {vehicles.map(v => <option key={v.id} value={v.id}>{v.plate_number}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-0.5">Lái xe</label>
                    <select
                      value={rows[editingRowIndex].driver_id}
                      onChange={(e) => handleCellChange(editingRowIndex, 'driver_id', e.target.value)}
                      className="w-full px-2 py-1.5 border rounded"
                    >
                      <option value="">-- Lái xe --</option>
                      {drivers.map(d => <option key={d.id} value={d.id}>{d.full_name}</option>)}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-0.5">Cước vào (đã gồm VAT) *</label>
                  <input
                    type="number"
                    value={rows[editingRowIndex].trip_revenue}
                    onChange={(e) => handleCellChange(editingRowIndex, 'trip_revenue', e.target.value)}
                    className="w-full px-2.5 py-1.5 border rounded font-bold text-emerald-800"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-0.5">Cước ra (xe ngoài)</label>
                    <input
                      type="number"
                      value={rows[editingRowIndex].subcontractor_cost}
                      onChange={(e) => handleCellChange(editingRowIndex, 'subcontractor_cost', e.target.value)}
                      className="w-full px-2 py-1.5 border rounded font-semibold text-amber-800"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-0.5">Tiền đường</label>
                    <input
                      type="number"
                      value={rows[editingRowIndex].toll_fee}
                      onChange={(e) => handleCellChange(editingRowIndex, 'toll_fee', e.target.value)}
                      className="w-full px-2 py-1.5 border rounded"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-0.5">Dầu (lít)</label>
                    <input
                      type="number"
                      step="0.1"
                      value={rows[editingRowIndex].fuel_liters}
                      onChange={(e) => handleCellChange(editingRowIndex, 'fuel_liters', e.target.value)}
                      className="w-full px-2 py-1.5 border rounded"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-0.5">TT Khách</label>
                    <select
                      value={rows[editingRowIndex].customer_payment_status}
                      onChange={(e) => handleCellChange(editingRowIndex, 'customer_payment_status', e.target.value)}
                      className="w-full px-2 py-1.5 border rounded"
                    >
                      <option value="CHUA_TT">Chưa TT</option>
                      <option value="TUOI">TƯƠI</option>
                      <option value="X">X (Đã TT)</option>
                      <option value="DA_TT">ĐÃ TT</option>
                      <option value="DOI_TRU">ĐỐI TRỪ</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-0.5">Số Container</label>
                  <input
                    type="text"
                    value={rows[editingRowIndex].container_number}
                    onChange={(e) => handleCellChange(editingRowIndex, 'container_number', e.target.value.toUpperCase())}
                    className="w-full px-2.5 py-1.5 border rounded font-mono font-bold uppercase"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-0.5">Ghi chú (Cột R)</label>
                  <input
                    type="text"
                    value={rows[editingRowIndex].notes}
                    onChange={(e) => handleCellChange(editingRowIndex, 'notes', e.target.value)}
                    className="w-full px-2.5 py-1.5 border rounded"
                  />
                </div>
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  type="button"
                  onClick={() => setEditingRowIndex(null)}
                  className="px-4 py-1.5 bg-blue-600 text-white rounded-lg font-bold"
                >
                  Xong
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
