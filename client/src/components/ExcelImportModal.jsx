import React, { useState, useEffect, useRef } from 'react';
import { 
  FileSpreadsheet, 
  Upload, 
  CheckCircle2, 
  AlertCircle, 
  AlertTriangle, 
  X, 
  ArrowRight, 
  ChevronRight, 
  RefreshCw, 
  RotateCcw, 
  Clock, 
  Database, 
  Eye, 
  Check, 
  Layers, 
  Calendar,
  Fuel,
  Receipt,
  Truck,
  PlusCircle,
  Table
} from 'lucide-react';
import { 
  previewExcelImportApi, 
  commitExcelImportApi, 
  fetchExcelBatchesApi, 
  rollbackExcelBatchApi 
} from '../services/api.js';
import { formatVnd } from '../data/unifiedBusinessData.js';

export default function ExcelImportModal({
  isOpen,
  onClose,
  currentUser,
  onImportSuccess,
  onSwitchToOneTrip,
  onSwitchToBatch
}) {
  // 5 BƯỚC CỦA LUỒNG NHẬP EXCEL
  // 1: Tải file -> 2: Xem trước -> 3: Kiểm tra / Ghép cột -> 4: Xác nhận nhập -> 5: Hoàn tất & Lịch sử
  const [step, setStep] = useState(1);
  const [file, setFile] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState(null);
  const [msg, setMsg] = useState(null);

  // Kết quả parse & preview từ server
  const [mappingEnabled,setMappingEnabled]=useState(false);
  const [columnMapping,setColumnMapping]=useState(() => {try{return JSON.parse(localStorage.getItem('hoachtoan_excel_mapping'))||{"A": "A", "B": "B", "C": "C", "D": "D", "E": "E", "F": "F", "G": "G", "H": "H", "I": "I", "J": "J", "K": "K", "L": "L", "M": "M", "N": "N", "O": "O", "P": "P", "Q": "Q", "R": "R"};}catch{return {"A": "A", "B": "B", "C": "C", "D": "D", "E": "E", "F": "F", "G": "G", "H": "H", "I": "I", "J": "J", "K": "K", "L": "L", "M": "M", "N": "N", "O": "O", "P": "P", "Q": "Q", "R": "R"};}});
  const columnLabels={"A": "STT", "B": "Ngày chạy", "C": "Khách hàng", "D": "Tuyến", "E": "Container", "F": "Biển số", "G": "Cont 40", "H": "Cont 20", "I": "Dầu cấp", "J": "Tiền đường", "K": "Đánh dấu cảng", "L": "Nhà xe", "M": "Phát sinh", "N": "Cước ra", "O": "Cước vào", "P": "Đã thanh toán", "Q": "Tươi / X", "R": "Ghi chú"};
  const [previewData, setPreviewData] = useState(null);
  // Kết quả commit
  const [commitResult, setCommitResult] = useState(null);

  // Lịch sử các đợt nhập
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
      processSelectedFile(droppedFile);
    }
  };

  const handleFileChange = (e) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      processSelectedFile(selectedFile);
    }
  };

  const processSelectedFile = async (selectedFile) => {
    if (!selectedFile.name.match(/\.(xlsx|xls)$/i)) {
      setErr('Vui lòng chọn đúng tệp Excel định dạng .xlsx hoặc .xls');
      return;
    }
    if(mappingEnabled)localStorage.setItem('hoachtoan_excel_mapping',JSON.stringify(columnMapping));
    setFile(selectedFile);
    setErr(null);
    setLoading(true);

    try {
      const res = await previewExcelImportApi(selectedFile,mappingEnabled?columnMapping:null);
      if (res.success) {
        setPreviewData(res.data);
        setStep(2); // Chuyển sang Bước 2: Xem trước
      } else {
        setErr(res.error || 'Không thể đọc tệp Excel. Vui lòng kiểm tra lại cấu trúc file.');
      }
    } catch (e) {
      setErr(`Lỗi tải lên: ${e.message}`);
    } finally {
      setLoading(false);
    }
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
        setStep(5); // Chuyển sang Bước 5: Hoàn tất
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
    if (!window.confirm('Bạn có chắc chắn muốn hoàn tác toàn bộ cuốc xe thuộc đợt nhập này? Các cuốc xe đã nhập sẽ bị xóa khỏi cơ sở dữ liệu.')) {
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl max-w-6xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[96vh]">
        
        {/* HEADER VỚI BỘ 3 LỰA CHỌN CẠNH NHAU */}
        <div className="px-5 py-3.5 bg-slate-900 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-emerald-600 rounded-xl text-white">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm sm:text-base flex items-center space-x-2">
                <span>Nhập Dữ Liệu Từ Excel</span>
                <span className="text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-full font-mono">
                  Chuẩn tháng 1.xlsx
                </span>
              </h3>
              <p className="text-[11px] text-slate-400">
                Luồng 5 bước: Tải file → Xem trước → Đối chiếu trùng lặp → Xác nhận nhập → Cập nhật báo cáo tức thì
              </p>
            </div>
          </div>

          {/* BỘ 3 LỰA CHỌN CẠNH NHAU (ĐÚNG YÊU CẦU MỤC 3) */}
          <div className="flex items-center space-x-1.5 bg-slate-800 p-1 rounded-xl self-start sm:self-auto text-xs">
            <button
              type="button"
              onClick={() => { onClose(); if (onSwitchToOneTrip) onSwitchToOneTrip(); }}
              className="px-3 py-1.5 rounded-lg text-xs font-bold text-slate-300 hover:text-white hover:bg-slate-700/60 transition-all"
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
              className="px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 text-white shadow-xs flex items-center space-x-1"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
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

        {/* BĂNG TIẾN TRÌNH 5 BƯỚC */}
        <div className="bg-slate-50 border-b border-slate-200 px-5 py-2.5 flex items-center justify-between text-xs overflow-x-auto shrink-0">
          <div className="flex items-center space-x-2 sm:space-x-4 min-w-max">
            <div className={`flex items-center space-x-1.5 font-bold ${step >= 1 ? 'text-emerald-700' : 'text-slate-400'}`}>
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] ${step >= 1 ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-500'}`}>1</span>
              <span>Tải file Excel</span>
            </div>
            <ChevronRight className="w-3.5 h-3.5 text-slate-300" />

            <div className={`flex items-center space-x-1.5 font-bold ${step >= 2 ? 'text-emerald-700' : 'text-slate-400'}`}>
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] ${step >= 2 ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-500'}`}>2</span>
              <span>Xem trước số liệu</span>
            </div>
            <ChevronRight className="w-3.5 h-3.5 text-slate-300" />

            <div className={`flex items-center space-x-1.5 font-bold ${step >= 3 ? 'text-emerald-700' : 'text-slate-400'}`}>
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] ${step >= 3 ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-500'}`}>3</span>
              <span>Đối chiếu & Trùng lặp</span>
            </div>
            <ChevronRight className="w-3.5 h-3.5 text-slate-300" />

            <div className={`flex items-center space-x-1.5 font-bold ${step >= 4 ? 'text-emerald-700' : 'text-slate-400'}`}>
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] ${step >= 4 ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-500'}`}>4</span>
              <span>Xác nhận nhập</span>
            </div>
            <ChevronRight className="w-3.5 h-3.5 text-slate-300" />

            <div className={`flex items-center space-x-1.5 font-bold ${step === 5 ? 'text-emerald-700' : 'text-slate-400'}`}>
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] ${step === 5 ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-500'}`}>5</span>
              <span>Hoàn tất & Lịch sử</span>
            </div>
          </div>

          <div className="hidden sm:flex items-center space-x-2 text-[11px] text-slate-500">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            <span>Bảo toàn ô gộp & truy vết nguồn</span>
          </div>
        </div>

        {/* THÔNG BÁO LỖI / THÀNH CÔNG */}
        {err && (
          <div className="mx-5 mt-3 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center space-x-2 shrink-0">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
            <span className="font-medium">{err}</span>
          </div>
        )}
        {msg && (
          <div className="mx-5 mt-3 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs flex items-center space-x-2 shrink-0">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
            <span className="font-medium">{msg}</span>
          </div>
        )}

        {/* NỘI DUNG CHÍNH THEO BƯỚC */}
        <div className="p-5 flex-1 overflow-y-auto space-y-4">
          
          {/* ================= BƯỚC 1: TẢI FILE ================= */}
          {step === 1 && (
            <div className="space-y-6">
              <div className="border rounded-xl p-3 space-y-3"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={mappingEnabled} onChange={e=>setMappingEnabled(e.target.checked)}/>File khác thứ tự cột — chọn cách ghép cột</label><p className="text-xs text-slate-500">Mẫu mặc định theo bảng tháng 1. Với file khác, nhập chữ cột tương ứng (A, B, C…). Dòng tiêu đề ở hàng 2; dữ liệu từ hàng 3. Mẫu ghép được lưu trên thiết bị.</p>{mappingEnabled&&<div className="grid grid-cols-2 sm:grid-cols-3 gap-2">{Object.entries(columnLabels).map(([key,label])=><label key={key} className="text-xs">{label}<input aria-label={'Cột '+label} value={columnMapping[key]||''} onChange={e=>setColumnMapping(m=>({...m,[key]:e.target.value.toUpperCase()}))} className="block w-full border rounded p-2 mt-1"/></label>)}</div>}</div>
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-2xl p-8 sm:p-12 text-center cursor-pointer transition-all ${
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
                <div className="w-16 h-16 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto mb-4 shadow-sm">
                  <Upload className="w-8 h-8" />
                </div>
                <h4 className="text-sm sm:text-base font-bold text-slate-800 mb-1">
                  Kéo thả file Excel bảng kê vào đây hoặc <span className="text-emerald-600 underline">bấm để chọn file</span>
                </h4>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  Hỗ trợ file bảng kê chuẩn <code className="bg-slate-100 px-1.5 py-0.5 rounded text-slate-700 font-mono">tháng 1.xlsx</code> hoặc các định dạng bảng kê vận tải container tương đương (.xlsx, .xls).
                </p>

                <div className="mt-6 flex flex-wrap items-center justify-center gap-3 text-[11px] text-slate-500">
                  <span className="flex items-center space-x-1">
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Tự bỏ qua dòng format trống (hàng 80 - 889)</span>
                  </span>
                  <span className="flex items-center space-x-1">
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Chuẩn hóa lỗi gõ năm 2025 → 2026</span>
                  </span>
                  <span className="flex items-center space-x-1">
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Cước vào đã gồm VAT</span>
                  </span>
                  <span className="flex items-center space-x-1">
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Nhận diện ô gộp thông minh</span>
                  </span>
                </div>
              </div>

              {/* LỊCH SỬ CÁC ĐỢT NHẬP GẦN ĐÂY */}
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
                <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                  <div className="flex items-center space-x-2 text-xs font-bold text-slate-700">
                    <Clock className="w-4 h-4 text-slate-500" />
                    <span>Lịch Sử Các Đợt Nhập & Khả Năng Hoàn Tác (Rollback)</span>
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
                      <div key={b.id} className="p-3 sm:px-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:bg-slate-50/60 transition-colors">
                        <div className="space-y-1">
                          <div className="flex items-center space-x-2">
                            <span className="font-bold text-xs text-slate-800">{b.filename}</span>
                            <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-mono">
                              {b.total_trips} cuốc
                            </span>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                              b.status === 'ROLLED_BACK' 
                                ? 'bg-rose-100 text-rose-700' 
                                : 'bg-emerald-100 text-emerald-700'
                            }`}>
                              {b.status === 'ROLLED_BACK' ? 'Đã hoàn tác' : 'Đã nhập'}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-500 flex items-center space-x-3">
                            <span>Thời điểm: {b.imported_at ? new Date(b.imported_at).toLocaleString('vi-VN') : '-'}</span>
                            <span>Người nhập: <strong>{b.created_by || 'DIRECTOR'}</strong></span>
                            <span>Doanh thu: <strong>{formatVnd(b.total_revenue)}</strong></span>
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

          {/* ================= BƯỚC 2 & 3 & 4: XEM TRƯỚC VÀ ĐỐI CHIẾU ================= */}
          {(step === 2 || step === 3 || step === 4) && previewData && (
            <div className="space-y-4">
              
              {/* TỔNG QUAN TẬP DỮ LIỆU ĐỌC ĐƯỢC */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                  <div className="text-[11px] font-medium text-slate-500">Tổng Số Cuốc Đọc Được</div>
                  <div className="text-xl font-bold text-slate-900 mt-0.5">{previewData.total_rows}</div>
                  <div className="text-[10px] text-slate-400 mt-1">Hàng 3 đến hàng 79 (STT 1-77)</div>
                </div>

                <div className="bg-emerald-50/60 border border-emerald-200 rounded-xl p-3">
                  <div className="text-[11px] font-medium text-emerald-700">Tổng Cước Vào (Gồm VAT)</div>
                  <div className="text-xl font-bold text-emerald-800 mt-0.5">
                    {formatVnd(previewData.summary?.total_cuoc_vao)}
                  </div>
                  <div className="text-[10px] text-emerald-600 mt-1">Doanh thu chuẩn bảng kê</div>
                </div>

                <div className="bg-amber-50/60 border border-amber-200 rounded-xl p-3">
                  <div className="text-[11px] font-medium text-amber-700">Chi Phí Trực Tiếp Đã Biết</div>
                  <div className="text-xl font-bold text-amber-800 mt-0.5">
                    {formatVnd(previewData.summary?.total_direct_cost)}
                  </div>
                  <div className="text-[10px] text-amber-600 mt-1">
                    Đường {formatVnd(previewData.summary?.total_tien_duong)} • Cước ra {formatVnd(previewData.summary?.total_cuoc_ra)}
                  </div>
                </div>

                <div className="bg-blue-50/60 border border-blue-200 rounded-xl p-3">
                  <div className="text-[11px] font-medium text-blue-700">Lãi Tạm Tính (Chưa Trừ Lương)</div>
                  <div className="text-xl font-bold text-blue-800 mt-0.5">
                    {formatVnd(previewData.summary?.temp_profit)}
                  </div>
                  <div className="text-[10px] text-blue-600 mt-1">
                    Cấp {previewData.summary?.total_dau_lit} lít dầu (chưa tính tiền)
                  </div>
                </div>
              </div>

              {/* BẢNG CẢNH BÁO TRÙNG LẶP */}
              {previewData.duplicate_count > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 flex items-start space-x-3">
                  <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  <div className="space-y-1 text-xs">
                    <h5 className="font-bold text-amber-900">
                      Phát hiện {previewData.duplicate_count} cuốc có khả năng trùng. Mặc định chỉ nhập dòng mới, giữ các dòng này để đối chiếu.
                    </h5>
                    <p className="text-amber-700">
                      Hệ thống sẽ giữ lại cả hai hoặc chỉ nhập các cuốc xe mới tùy bạn lựa chọn. Theo quy tắc đối chiếu, trùng số cont không tự xóa chuyến nếu ngày hoặc khách hàng khác nhau.
                    </p>
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

                <div className="overflow-x-auto max-h-80">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-100 text-slate-600 font-semibold sticky top-0 border-b border-slate-200">
                      <tr>
                        <th className="py-2 px-2.5 w-12 text-center">STT</th>
                        <th className="py-2 px-2.5">Ngày Chạy</th>
                        <th className="py-2 px-2.5">Chủ Hàng</th>
                        <th className="py-2 px-2.5">Tuyến Đường</th>
                        <th className="py-2 px-2.5">Số Container</th>
                        <th className="py-2 px-2.5">BKS / Nhà Xe</th>
                        <th className="py-2 px-2.5 text-right">Cước Vào</th>
                        <th className="py-2 px-2.5 text-right">Cước Ra</th>
                        <th className="py-2 px-2.5 text-right">Tiền Đường</th>
                        <th className="py-2 px-2.5 text-center">Dầu Cấp</th>
                        <th className="py-2 px-2.5">Ô Gộp</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                      {previewData.rows.slice(0, 30).map((r, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/80">
                          <td className="py-1.5 px-2.5 text-center text-slate-400">{r.stt || idx + 1}</td>
                          <td className="py-1.5 px-2.5 text-slate-700">{r.trip_date}</td>
                          <td className="py-1.5 px-2.5 font-bold text-slate-800 font-sans">{r.customer_name}</td>
                          <td className="py-1.5 px-2.5 text-slate-600 font-sans">{r.route_name || '-'}</td>
                          <td className="py-1.5 px-2.5 text-slate-800 font-bold">{r.container_number || '-'}</td>
                          <td className="py-1.5 px-2.5 font-sans">
                            {r.is_subcontractor ? (
                              <span className="text-amber-700 bg-amber-50 px-1 py-0.5 rounded text-[10px]">
                                {r.subcontractor_name || 'Xe ngoài'}
                              </span>
                            ) : (
                              <span className="text-blue-700 font-bold">{r.vehicle_plate}</span>
                            )}
                          </td>
                          <td className="py-1.5 px-2.5 text-right font-bold text-emerald-700">
                            {formatVnd(r.trip_revenue)}
                          </td>
                          <td className="py-1.5 px-2.5 text-right text-amber-700">
                            {r.subcontractor_cost > 0 ? formatVnd(r.subcontractor_cost) : '-'}
                          </td>
                          <td className="py-1.5 px-2.5 text-right text-slate-700">
                            {r.toll_fee > 0 ? formatVnd(r.toll_fee) : '-'}
                          </td>
                          <td className="py-1.5 px-2.5 text-center text-indigo-700 font-bold">
                            {r.fuel_liters > 0 ? `${r.fuel_liters} L` : '-'}
                          </td>
                          <td className="py-1.5 px-2.5 font-sans">
                            {r.group_id ? (
                              <span className="text-[10px] bg-purple-50 text-purple-700 border border-purple-200 px-1.5 py-0.5 rounded">
                                {r.group_id}
                              </span>
                            ) : (
                              <span className="text-slate-300">-</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {previewData.rows.length > 30 && (
                  <div className="p-2.5 bg-slate-50 text-center text-[11px] text-slate-500 border-t border-slate-200">
                    Đang hiển thị 30 / {previewData.rows.length} dòng. Toàn bộ {previewData.rows.length} dòng sẽ được nhập vào cơ sở dữ liệu.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ================= BƯỚC 5: HOÀN TẤT VÀ KẾT QUẢ ================= */}
          {step === 5 && commitResult && (
            <div className="space-y-6 py-6 text-center max-w-xl mx-auto">
              <div className="w-16 h-16 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto shadow-sm">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <div className="space-y-2">
                <h4 className="text-lg font-bold text-slate-900">
                  Nhập Dữ Liệu Excel Thành Công!
                </h4>
                <p className="text-xs text-slate-600">
                  Đã thêm thành công <strong>{commitResult.inserted_count}</strong> cuốc xe vào cơ sở dữ liệu. Các báo cáo Tổng quan kinh doanh, Hiệu quả đội xe và Công nợ đã được cập nhật đồng bộ.
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
                  <span>Tổng cước vào (Doanh thu gồm VAT):</span>
                  <span className="font-bold text-emerald-700">{formatVnd(commitResult.total_revenue)}</span>
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

        {/* FOOTER ACTIONS CHO CÁC BƯỚC 1 -> 4 */}
        {step < 5 && (
          <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between shrink-0">
            <div>
              {step > 1 && (
                <button
                  type="button"
                  onClick={() => setStep(prev => Math.max(1, prev - 1))}
                  className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 transition-colors"
                >
                  ← Quay lại bước trước
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
