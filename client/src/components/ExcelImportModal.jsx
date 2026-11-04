import React, { useState, useEffect, useRef } from 'react';
import {
  FileSpreadsheet,
  Upload,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  X,
  ChevronRight,
  RefreshCw,
  RotateCcw,
  Clock,
  Check,
  Table,
  SlidersHorizontal
} from 'lucide-react';
import {
  previewExcelImportApi,
  commitExcelImportApi,
  fetchExcelBatchesApi,
  rollbackExcelBatchApi
} from '../services/api.js';
import { formatVnd } from '../data/unifiedBusinessData.js';

const FIELD_LABELS = {
  stt: 'STT',
  trip_date: 'NGÀY CHẠY',
  customer_name: 'KHÁCH HÀNG',
  route_name: 'LỊCH TRÌNH / TUYẾN',
  container_number: 'SỐ CONT',
  vehicle_plate: 'BIỂN SỐ XE',
  cont_40: 'LOẠI CONT 40 (40DC/HC/RF/FR)',
  cont_20: 'LOẠI CONT 20 (20DC)',
  lift_on: 'NÂNG (Nơi nâng / Phí nâng)',
  lift_off: 'HẠ (Nơi hạ / Phí hạ)',
  phoi_nang_ha: 'PHƠI NÂNG HẠ (Trả hộ)',
  fuel_liters: 'DẦU (Lít)',
  toll_fee: 'TIỀN ĐƯỜNG',
  lach_huyen: 'LẠCH HUYỆN',
  subcontractor_name: 'NX NGOÀI',
  other_costs: 'PHÁT SINH',
  subcontractor_cost: 'CƯỚC RA',
  base_revenue: 'CƯỚC VÀO (Gốc chưa VAT)',
  paid_status: 'ĐÃ TT',
  payment_timing: 'CÔNG NỢ / TƯƠI / X',
  notes: 'GHI CHÚ (Cột R)'
};

export default function ExcelImportModal({
  isOpen,
  onClose,
  currentUser,
  onImportSuccess,
  onSwitchToOneTrip,
  onSwitchToBatch
}) {
  const [step, setStep] = useState(1);
  const [file, setFile] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState(null);
  const [msg, setMsg] = useState(null);

  const [mappingEnabled, setMappingEnabled] = useState(false);
  const [columnMapping, setColumnMapping] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('hoachtoan_excel_mapping_v2')) || {};
    } catch {
      return {};
    }
  });
  const [previewData, setPreviewData] = useState(null);
  const [commitResult, setCommitResult] = useState(null);

  const [batches, setBatches] = useState([]);
  const [loadingBatches, setLoadingBatches] = useState(false);
  const [rollingBackId, setRollingBackId] = useState(null);

  const fileInputRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setStep(1);
      setFile(null);
      setPreviewData(null);
      setCommitResult(null);
      setErr(null);
      setMsg(null);
      loadBatches();
    }
  }, [isOpen]);

  const loadBatches = async () => {
    try {
      setLoadingBatches(true);
      const res = await fetchExcelBatchesApi();
      if (res.success) {
        setBatches(res.data || []);
      }
    } catch (e) {
      console.warn('Lỗi tải lịch sử đợt nhập:', e);
    } finally {
      setLoadingBatches(false);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const droppedFile = e.dataTransfer.files?.[0];
    if (droppedFile) {
      processSelectedFile(droppedFile, mappingEnabled ? columnMapping : null);
    }
  };

  const handleFileChange = (e) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      processSelectedFile(selectedFile, mappingEnabled ? columnMapping : null);
    }
  };

  const processSelectedFile = async (selectedFile, customMap = null) => {
    if (!selectedFile.name.match(/\.(xlsx|xls)$/i)) {
      setErr('Vui lòng chọn đúng tệp Excel định dạng .xlsx hoặc .xls');
      return;
    }
    if (customMap && Object.keys(customMap).length > 0) {
      localStorage.setItem('hoachtoan_excel_mapping_v2', JSON.stringify(customMap));
    }
    setFile(selectedFile);
    setErr(null);
    setLoading(true);

    try {
      const res = await previewExcelImportApi(selectedFile, customMap);
      if (res.success) {
        setPreviewData(res.data);
        if (res.data?.header_mapping) {
          setColumnMapping(res.data.header_mapping);
        }
        setStep(2);
      } else {
        setErr(res.error || 'Không thể đọc tệp Excel. Vui lòng kiểm tra lại cấu trúc file.');
      }
    } catch (e) {
      setErr(`Lỗi tải lên: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleRePreviewWithMapping = async () => {
    if (!file) return;
    await processSelectedFile(file, columnMapping);
    setMsg('Đã áp dụng cách ghép cột mới và đọc lại dữ liệu xem trước!');
    setTimeout(() => setMsg(null), 2500);
  };

  const handleConfirmCommit = async () => {
    if (!previewData || !previewData.rows || previewData.rows.length === 0) {
      setErr('Không có dữ liệu cuốc xe nào để nhập.');
      return;
    }

    setSubmitting(true);
    setErr(null);

    try {
      const res = await commitExcelImportApi({
        rows: previewData.rows,
        preview_id: previewData.preview_id,
        filename: previewData.filename,
        sheetName: previewData.sheet_name
      });

      if (res.success) {
        setCommitResult(res.data);
        setStep(5);
        loadBatches();
        if (onImportSuccess) {
          onImportSuccess(res.data);
        }
      } else {
        setErr(res.error || 'Lỗi khi nhập dữ liệu vào hệ thống.');
      }
    } catch (e) {
      setErr(`Lỗi lưu dữ liệu: ${e.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleRollbackBatch = async (batchId) => {
    if (
      !window.confirm(
        'Bạn có chắc chắn muốn hoàn tác toàn bộ cuốc xe thuộc đợt nhập này? Các cuốc xe đã nhập sẽ bị xóa khỏi cơ sở dữ liệu.'
      )
    ) {
      return;
    }

    setRollingBackId(batchId);
    setErr(null);

    try {
      const res = await rollbackExcelBatchApi(batchId);
      if (res.success) {
        setMsg(res.message || 'Đã hoàn tác đợt nhập thành công!');
        loadBatches();
        if (onImportSuccess) onImportSuccess();
        setTimeout(() => setMsg(null), 3000);
      } else {
        setErr(res.error || 'Hoàn tác đợt nhập thất bại.');
      }
    } catch (e) {
      setErr(`Lỗi hoàn tác: ${e.message}`);
    } finally {
      setRollingBackId(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-1.5 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-6xl w-full my-auto shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[calc(100dvh-0.75rem)] sm:max-h-[96dvh]">
        {/* HEADER */}
        <div className="px-4 sm:px-5 py-3.5 bg-slate-900 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-emerald-600 rounded-xl text-white">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm sm:text-base flex items-center space-x-2">
                <span>Nhập Dữ Liệu Từ Excel (Nhận Diện Tiêu Đề Cột & Ghép Cột)</span>
                <span className="text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-full font-mono">
                  Mẫu tháng 1 & Mẫu mới (NÂNG • HẠ • PHƠI)
                </span>
              </h3>
              <p className="text-[11px] text-slate-400">
                Cước gốc chưa VAT (×1,08 có VAT • ×0,83 sau trừ 17%) • Nhận diện NÂNG, HẠ, PHƠI NÂNG HẠ, DẦU, TIỀN ĐƯỜNG, CÔNG NỢ
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between sm:justify-end gap-2">
            <div className="flex items-center space-x-1 bg-slate-800 p-1 rounded-xl text-xs">
              <button
                type="button"
                onClick={() => { onClose(); if (onSwitchToOneTrip) onSwitchToOneTrip(); }}
                className="px-2.5 py-1.5 rounded-lg text-xs font-bold text-slate-300 hover:text-white hover:bg-slate-700/60 transition-all"
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
                className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 text-white shadow-xs flex items-center space-x-1"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
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

        {/* BĂNG TIẾN TRÌNH */}
        <div className="bg-slate-50 border-b border-slate-200 px-4 sm:px-5 py-2.5 flex items-center justify-between text-xs overflow-x-auto shrink-0">
          <div className="flex items-center space-x-2 sm:space-x-4 min-w-max">
            <div className={`flex items-center space-x-1.5 font-bold ${step >= 1 ? 'text-emerald-700' : 'text-slate-400'}`}>
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] ${step >= 1 ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-500'}`}>1</span>
              <span>Tải file Excel</span>
            </div>
            <ChevronRight className="w-3.5 h-3.5 text-slate-300" />

            <div className={`flex items-center space-x-1.5 font-bold ${step >= 2 ? 'text-emerald-700' : 'text-slate-400'}`}>
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] ${step >= 2 ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-500'}`}>2</span>
              <span>Ghép cột & Xem trước</span>
            </div>
            <ChevronRight className="w-3.5 h-3.5 text-slate-300" />

            <div className={`flex items-center space-x-1.5 font-bold ${step === 5 ? 'text-emerald-700' : 'text-slate-400'}`}>
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] ${step === 5 ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-500'}`}>3</span>
              <span>Hoàn tất & Lịch sử</span>
            </div>
          </div>

          <div className="hidden sm:flex items-center space-x-2 text-[11px] text-slate-500">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            <span>Không đọc lệch cột khi thêm trường • Bảo toàn ô gộp</span>
          </div>
        </div>

        {/* THÔNG BÁO */}
        {err && (
          <div className="mx-4 sm:mx-5 mt-3 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center space-x-2 shrink-0">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
            <span className="font-medium">{err}</span>
          </div>
        )}
        {msg && (
          <div className="mx-4 sm:mx-5 mt-3 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs flex items-center space-x-2 shrink-0">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
            <span className="font-medium">{msg}</span>
          </div>
        )}

        {/* NỘI DUNG CHÍNH */}
        <div className="p-4 sm:p-5 flex-1 overflow-y-auto space-y-4">
          {/* BƯỚC 1: TẢI FILE */}
          {step === 1 && (
            <div className="space-y-6">
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-2xl p-8 sm:p-10 text-center cursor-pointer transition-all ${
                  isDragging
                    ? 'border-emerald-500 bg-emerald-50/50 scale-[0.99]'
                    : 'border-slate-300 hover:border-emerald-400 bg-slate-50/50 hover:bg-white'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx, .xls"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <div className="w-14 h-14 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto mb-3 shadow-sm">
                  <Upload className="w-7 h-7" />
                </div>
                <h4 className="text-sm sm:text-base font-bold text-slate-800 mb-1">
                  Kéo thả file Excel bảng kê vào đây hoặc <span className="text-emerald-600 underline">bấm để chọn file</span>
                </h4>
                <p className="text-xs text-slate-500 max-w-lg mx-auto">
                  Tự động nhận diện tiêu đề cột cho cả mẫu <code className="bg-slate-100 px-1.5 py-0.5 rounded text-slate-700 font-mono">tháng 1.xlsx</code> (18 cột A–R) và mẫu mới có tách <code className="bg-slate-100 px-1.5 py-0.5 rounded text-slate-700 font-mono">NÂNG, HẠ, PHƠI NÂNG HẠ</code>.
                </p>

                <div className="mt-5 flex flex-wrap items-center justify-center gap-3 text-[11px] text-slate-600">
                  <span className="flex items-center space-x-1">
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Cước vào gốc chưa VAT → ×1,08 có VAT → ×0,83 sau trừ 17%</span>
                  </span>
                  <span className="flex items-center space-x-1">
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Giữ nguyên loại cont (40FR, 40RF, 20DC...)</span>
                  </span>
                  <span className="flex items-center space-x-1">
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Chuẩn hóa lỗi gõ năm 2025 → 2026</span>
                  </span>
                </div>
              </div>

              {/* LỊCH SỬ CÁC ĐỢT NHẬP */}
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
                <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                  <div className="flex items-center space-x-2 text-xs font-bold text-slate-700">
                    <Clock className="w-4 h-4 text-slate-500" />
                    <span>Lịch Sử Các Đợt Nhập & Hoàn Tác (Rollback)</span>
                  </div>
                  <button
                    onClick={loadBatches}
                    className="text-[11px] text-slate-500 hover:text-slate-800 flex items-center space-x-1"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>Làm mới</span>
                  </button>
                </div>

                {batches.length === 0 ? (
                  <div className="p-6 text-center text-xs text-slate-400">
                    Chưa có đợt nhập Excel nào trong cơ sở dữ liệu.
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {batches.map((b) => (
                      <div
                        key={b.id}
                        className="p-3 sm:px-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:bg-slate-50/60 transition-colors"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center space-x-2">
                            <span className="font-bold text-xs text-slate-800">{b.filename}</span>
                            <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-mono">
                              {b.total_trips} cuốc
                            </span>
                            <span
                              className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                                b.status === 'ROLLED_BACK'
                                  ? 'bg-rose-100 text-rose-700'
                                  : 'bg-emerald-100 text-emerald-700'
                              }`}
                            >
                              {b.status === 'ROLLED_BACK' ? 'Đã hoàn tác' : 'Đã nhập'}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-500 flex items-center space-x-3">
                            <span>Thời điểm: {b.imported_at ? new Date(b.imported_at).toLocaleString('vi-VN') : '-'}</span>
                            <span>Người nhập: <strong>{b.created_by || 'DIRECTOR'}</strong></span>
                            <span>Cước gốc: <strong>{formatVnd(b.total_revenue)}</strong></span>
                          </div>
                        </div>

                        {b.status !== 'ROLLED_BACK' && (
                          <button
                            type="button"
                            disabled={rollingBackId === b.id}
                            onClick={() => handleRollbackBatch(b.id)}
                            className="self-start sm:self-auto px-2.5 py-1 text-[11px] font-semibold text-rose-600 hover:bg-rose-50 border border-rose-200 rounded-lg transition-colors flex items-center space-x-1"
                          >
                            <RotateCcw className="w-3 h-3" />
                            <span>{rollingBackId === b.id ? 'Đang hoàn tác...' : 'Hoàn tác đợt này'}</span>
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* BƯỚC 2: XEM TRƯỚC, GHÉP CỘT & ĐỐI CHIẾU */}
          {step >= 2 && step <= 4 && previewData && (
            <div className="space-y-4">
              {/* TỔNG QUAN SỐ LIỆU ĐỌC ĐƯỢC THEO CHUẨN MỚI */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-2.5">
                  <div className="text-[10px] font-semibold text-slate-500 uppercase">Số Cuốc Đọc Được</div>
                  <div className="text-lg font-extrabold text-slate-900 mt-0.5">{previewData.total_rows} cuốc</div>
                  <div className="text-[10px] text-slate-500 mt-0.5">
                    Dầu cấp: <strong>{previewData.summary?.total_dau_lit || 0} Lít</strong>
                  </div>
                </div>

                <div className="bg-white border border-slate-200 rounded-xl p-2.5">
                  <div className="text-[10px] font-semibold text-slate-500 uppercase">1. Cước Gốc (Chưa VAT)</div>
                  <div className="text-sm sm:text-base font-extrabold text-slate-900 mt-0.5">
                    {formatVnd(previewData.summary?.total_cuoc_goc ?? previewData.summary?.total_cuoc_vao)}
                  </div>
                  <div className="text-[10px] text-teal-700 mt-0.5">
                    + VAT 8%: {formatVnd(previewData.summary?.total_vat_8)}
                  </div>
                </div>

                <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-2.5">
                  <div className="text-[10px] font-bold text-emerald-800 uppercase">2. Cước Có VAT (×1,08)</div>
                  <div className="text-sm sm:text-base font-extrabold text-emerald-800 mt-0.5">
                    {formatVnd(previewData.summary?.total_cuoc_co_vat)}
                  </div>
                  <div className="text-[10px] text-amber-700 mt-0.5">
                    − Trừ 17%: {formatVnd(previewData.summary?.total_khoan_tru_17)}
                  </div>
                </div>

                <div className="bg-blue-50/70 border border-blue-200 rounded-xl p-2.5">
                  <div className="text-[10px] font-bold text-blue-800 uppercase">3. Sau Trừ 17% (×0,83)</div>
                  <div className="text-sm sm:text-base font-extrabold text-blue-800 mt-0.5">
                    {formatVnd(previewData.summary?.total_cuoc_sau_tru_17)}
                  </div>
                  <div className="text-[10px] text-blue-600 mt-0.5">Quy tắc tính nội bộ</div>
                </div>

                <div className="bg-indigo-50/70 border border-indigo-200 rounded-xl p-2.5">
                  <div className="text-[10px] font-bold text-indigo-800 uppercase">4. Phí Nâng/Hạ & Phơi</div>
                  <div className="text-xs font-extrabold text-indigo-900 mt-0.5">
                    Nâng/Hạ: {formatVnd((previewData.summary?.total_phi_nang || 0) + (previewData.summary?.total_phi_ha || 0))}
                  </div>
                  <div className="text-[10px] text-purple-700 font-bold mt-0.5">
                    Phơi trả hộ: {formatVnd(previewData.summary?.total_phoi_tra_ho || 0)}
                  </div>
                </div>

                <div className="bg-amber-50/80 border border-amber-300 rounded-xl p-2.5">
                  <div className="text-[10px] font-bold text-amber-900 uppercase">5. Chênh Lệch Sau Trừ</div>
                  <div className="text-sm sm:text-base font-extrabold text-amber-800 mt-0.5">
                    {formatVnd(previewData.summary?.temp_profit_after_17 ?? previewData.summary?.temp_profit)}
                  </div>
                  <div className="text-[10px] text-amber-700 mt-0.5">Chưa trừ lương</div>
                </div>
              </div>

              {/* CHỈNH SỬA CÁCH GHÉP CỘT TRƯỚC KHI XÁC NHẬN NHẬP (Mục 14) */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => setMappingEnabled(!mappingEnabled)}
                    className="text-xs font-bold text-slate-800 flex items-center space-x-1.5 hover:text-emerald-700"
                  >
                    <SlidersHorizontal className="w-3.5 h-3.5 text-emerald-600" />
                    <span>
                      {mappingEnabled ? '▼ Ẩn bảng ghép cột Excel' : '▶ Kiểm tra / Sửa cách ghép cột Excel (NÂNG, HẠ, PHƠI NÂNG HẠ, CƯỚC VÀO...)'}
                    </span>
                  </button>
                  {mappingEnabled && (
                    <button
                      type="button"
                      onClick={handleRePreviewWithMapping}
                      disabled={loading}
                      className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-xs"
                    >
                      {loading ? 'Đang đọc lại...' : 'Áp dụng ghép cột & Xem trước lại'}
                    </button>
                  )}
                </div>

                {mappingEnabled && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 pt-2 border-t border-slate-200">
                    {Object.entries(FIELD_LABELS).map(([fieldKey, label]) => (
                      <label key={fieldKey} className="text-[10px] font-semibold text-slate-700">
                        <span className="block truncate" title={label}>{label}</span>
                        <input
                          type="text"
                          placeholder="Cột (A,B..)"
                          value={columnMapping[fieldKey] || ''}
                          onChange={(e) =>
                            setColumnMapping((prev) => ({
                              ...prev,
                              [fieldKey]: e.target.value.toUpperCase().trim()
                            }))
                          }
                          className="mt-0.5 w-full px-2 py-1 text-xs font-mono font-bold uppercase border border-slate-300 rounded bg-white"
                        />
                      </label>
                    ))}
                  </div>
                )}
              </div>

              {/* CẢNH BÁO TRÙNG LẶP */}
              {previewData.duplicate_count > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start space-x-2.5">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div className="text-xs text-amber-800">
                    <strong>Phát hiện {previewData.duplicate_count} dòng có khả năng trùng ngày + khách + cont + cước.</strong> Hệ thống giữ nguyên các cuốc khác ngày hoặc khác tuyến, không tự xóa chuyến chỉ vì trùng số container.
                  </div>
                </div>
              )}

              {/* BẢNG CHI TIẾT CÁC DÒNG XEM TRƯỚC */}
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
                <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                  <div className="text-xs font-bold text-slate-800 flex items-center space-x-2">
                    <Table className="w-4 h-4 text-slate-500" />
                    <span>Chi Tiết Dữ Liệu Sẽ Nhập ({previewData.rows.length} dòng)</span>
                  </div>
                  <div className="text-[11px] text-slate-500">
                    File: <strong className="text-slate-700">{previewData.filename}</strong> (Sheet: {previewData.sheet_name})
                  </div>
                </div>

                <div className="max-h-80 ha-table-scroll" tabIndex={0} role="region" aria-label="Bảng dữ liệu, có thể cuộn ngang">
                  <table className="w-full text-left text-xs border-collapse min-w-[1150px]">
                    <thead className="bg-slate-100 text-slate-600 font-semibold sticky top-0 border-b border-slate-200 text-[11px]">
                      <tr>
                        <th className="py-2 px-2 w-10 text-center">STT</th>
                        <th className="py-2 px-2">Ngày Chạy</th>
                        <th className="py-2 px-2">Chủ Hàng</th>
                        <th className="py-2 px-2">Tuyến Đường</th>
                        <th className="py-2 px-2">Số Cont</th>
                        <th className="py-2 px-2">Loại Cont</th>
                        <th className="py-2 px-2">BKS / Nhà Xe</th>
                        <th className="py-2 px-2 text-right">Cước Gốc (Chưa VAT)</th>
                        <th className="py-2 px-2 text-right">Có VAT (×1,08)</th>
                        <th className="py-2 px-2 text-right">Sau Trừ 17%</th>
                        <th className="py-2 px-2 text-right">Phí Nâng/Hạ</th>
                        <th className="py-2 px-2 text-right">Phơi Trả Hộ</th>
                        <th className="py-2 px-2 text-center">Dầu</th>
                        <th className="py-2 px-2">TT / Công Nợ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                      {previewData.rows.slice(0, 40).map((r, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/80">
                          <td className="py-1.5 px-2 text-center text-slate-400">{r.stt || idx + 1}</td>
                          <td className="py-1.5 px-2 text-slate-700">{r.trip_date}</td>
                          <td className="py-1.5 px-2 font-bold text-slate-800 font-sans">{r.customer_name}</td>
                          <td className="py-1.5 px-2 text-slate-600 font-sans">{r.route_name || '-'}</td>
                          <td className="py-1.5 px-2 text-slate-800 font-bold">{r.container_number || '-'}</td>
                          <td className="py-1.5 px-2 text-indigo-700 font-bold">{r.container_size || '-'}</td>
                          <td className="py-1.5 px-2 font-sans">
                            {r.is_subcontractor ? (
                              <span className="text-amber-700 bg-amber-50 px-1 py-0.5 rounded text-[10px]">
                                {r.subcontractor_name || 'Xe ngoài'}
                              </span>
                            ) : (
                              <span className="text-blue-700 font-bold">{r.vehicle_plate}</span>
                            )}
                          </td>
                          <td className="py-1.5 px-2 text-right font-bold text-slate-900">
                            {formatVnd(r.base_revenue ?? r.trip_revenue)}
                          </td>
                          <td className="py-1.5 px-2 text-right font-bold text-emerald-700">
                            {formatVnd(r.cuoc_co_vat ?? Math.round((r.base_revenue || r.trip_revenue || 0) * 1.08))}
                          </td>
                          <td className="py-1.5 px-2 text-right font-bold text-blue-700">
                            {formatVnd(r.cuoc_sau_tru_17 ?? Math.round((r.base_revenue || r.trip_revenue || 0) * 1.08 * 0.83))}
                          </td>
                          <td className="py-1.5 px-2 text-right text-indigo-700 font-sans">
                            {(r.lift_on_fee > 0 || r.lift_off_fee > 0)
                              ? formatVnd((r.lift_on_fee || 0) + (r.lift_off_fee || 0))
                              : (r.lift_on_location || r.lift_off_location || '-')}
                          </td>
                          <td className="py-1.5 px-2 text-right text-purple-700 font-sans">
                            {r.phoi_advance_amount > 0
                              ? formatVnd(r.phoi_advance_amount)
                              : (r.phoi_source_note || '-')}
                          </td>
                          <td className="py-1.5 px-2 text-center text-sky-700 font-bold">
                            {r.fuel_liters > 0 ? `${r.fuel_liters}L` : '-'}
                          </td>
                          <td className="py-1.5 px-2 font-sans text-[10px]">
                            {r.customer_payment_status || r.payment_terms || '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* BƯỚC 5: HOÀN TẤT */}
          {step === 5 && commitResult && (
            <div className="space-y-6 py-6 text-center max-w-xl mx-auto">
              <div className="w-16 h-16 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto shadow-sm">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <div className="space-y-2">
                <h4 className="text-lg font-bold text-slate-900">Nhập Dữ Liệu Excel Thành Công!</h4>
                <p className="text-xs text-slate-600">
                  Đã thêm thành công <strong>{commitResult.inserted_count}</strong> cuốc xe vào cơ sở dữ liệu theo chuẩn Cước gốc chưa VAT, VAT 8%, Trừ 17%, Nâng/Hạ và Tiền phơi trả hộ.
                </p>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-left space-y-2 text-xs">
                <div className="flex justify-between text-slate-600">
                  <span>Mã đợt nhập (Batch ID):</span>
                  <span className="font-mono font-bold text-slate-800">{commitResult.batch_id}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Tên tệp nguồn:</span>
                  <span className="font-bold text-slate-800">{commitResult.filename}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Tổng cước vào gốc (Chưa VAT):</span>
                  <span className="font-bold text-slate-900">{formatVnd(commitResult.total_revenue)}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Số cuốc xe mới nạp:</span>
                  <span className="font-bold text-blue-700">{commitResult.inserted_count} chuyến</span>
                </div>
              </div>

              <div className="flex items-center justify-center space-x-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setStep(1);
                    setFile(null);
                    setPreviewData(null);
                    setCommitResult(null);
                  }}
                  className="px-4 py-2 border border-slate-300 hover:bg-slate-50 text-slate-700 font-bold text-xs rounded-xl transition-all"
                >
                  Nhập thêm tệp khác
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl shadow-sm transition-all"
                >
                  Đóng và xem báo cáo
                </button>
              </div>
            </div>
          )}
        </div>

        {/* FOOTER ACTIONS */}
        {step < 5 && (
          <div className="px-4 sm:px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between shrink-0">
            <div>
              {step > 1 && (
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 transition-colors"
                >
                  ← Chọn lại tệp Excel
                </button>
              )}
            </div>

            <div className="flex items-center space-x-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-200/60 rounded-xl transition-colors"
              >
                Hủy bỏ
              </button>

              {step >= 2 && step <= 4 && (
                <button
                  type="button"
                  disabled={submitting}
                  onClick={handleConfirmCommit}
                  className="px-5 py-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-sm transition-all flex items-center space-x-2 disabled:opacity-50"
                >
                  {submitting ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Đang lưu vào DB...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      <span>Xác nhận nhập {previewData?.total_rows || 0} cuốc vào DB</span>
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
