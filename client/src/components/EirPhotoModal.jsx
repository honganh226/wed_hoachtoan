import React, { useState, useEffect, useRef } from 'react';
import { 
  X, 
  Camera, 
  Upload, 
  Image as ImageIcon, 
  AlertTriangle, 
  CheckCircle2, 
  Clock, 
  Trash2, 
  Download, 
  ZoomIn, 
  RefreshCw, 
  FileCheck, 
  ShieldAlert, 
  Calendar, 
  Truck, 
  User, 
  Check, 
  Maximize2
} from 'lucide-react';
import { 
  uploadEirPhotoApi, 
  updateEirStatusApi, 
  deleteEirPhotoApi, 
  fetchPendingEirTrips 
} from '../services/api.js';

export default function EirPhotoModal({
  isOpen,
  onClose,
  targetTrip = null,
  allTrips = [],
  currentUser = null,
  onUpdated = () => {}
}) {
  const [selectedTripId, setSelectedTripId] = useState(targetTrip?.id || (allTrips[0]?.id || ''));
  const [currentTrip, setCurrentTrip] = useState(null);
  const [activeTab, setActiveTab] = useState('CAPTURE'); // 'CAPTURE' hoặc 'OVERDUE_MONITOR'

  // Trạng thái ảnh
  const [photoPreview, setPhotoPreview] = useState(null);
  const [originalFileSize, setOriginalFileSize] = useState(null);
  const [compressedFileSize, setCompressedFileSize] = useState(null);
  const [compressedBase64, setCompressedBase64] = useState(null);
  const [isZoomOpen, setIsZoomOpen] = useState(false);

  // Trạng thái phiếu phơi
  const [eirStatus, setEirStatus] = useState('CHUA_TRA');
  const [eirPaidStatus, setEirPaidStatus] = useState('CHUA_TT');
  const [eirNotes, setEirNotes] = useState('');

  // Danh sách các chuyến xe đọng phơi (> 3 ngày)
  const [pendingTrips, setPendingTrips] = useState([]);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);
  const [err, setErr] = useState(null);

  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);

  // Sync selected trip
  useEffect(() => {
    if (targetTrip?.id) {
      setSelectedTripId(targetTrip.id);
    } else if (allTrips.length > 0 && !selectedTripId) {
      setSelectedTripId(allTrips[0].id);
    }
  }, [targetTrip, allTrips]);

  // Load thông tin chuyến đang chọn
  useEffect(() => {
    if (!selectedTripId) return;
    const found = allTrips.find(t => t.id === selectedTripId) || targetTrip;
    if (found) {
      setCurrentTrip(found);
      setEirStatus(found.eir_status || 'CHUA_TRA');
      setEirPaidStatus(found.eir_paid_status || 'CHUA_TT');
      setEirNotes(found.notes || '');
      setPhotoPreview(found.eir_photo_url || null);
      setCompressedBase64(null);
      setOriginalFileSize(null);
      setCompressedFileSize(null);
    }
  }, [selectedTripId, allTrips, targetTrip]);

  // Load danh sách đọng phơi khi mở tab OVERDUE_MONITOR
  const loadPendingTrips = async () => {
    try {
      setLoading(true);
      const res = await fetchPendingEirTrips(3);
      if (res.success) {
        setPendingTrips(res.data.items || []);
      }
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && activeTab === 'OVERDUE_MONITOR') {
      loadPendingTrips();
    }
  }, [isOpen, activeTab]);

  if (!isOpen) return null;

  /**
   * Thuật toán nén ảnh tự động bằng HTML5 Canvas:
   * Giảm kích thước ảnh xuống tối đa 1600x1200 và nén JPEG chất lượng 0.8
   * Giúp ảnh từ 5MB - 10MB chụp bằng camera điện thoại nén xuống còn ~150KB - 250KB,
   * vừa sắc nét số container, vừa tải siêu nhanh ở bãi cảng!
   */
  const compressImage = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target.result;
        img.onload = () => {
          const maxWidth = 1600;
          const maxHeight = 1200;
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > maxWidth) {
              height = Math.round((height * maxWidth) / width);
              width = maxWidth;
            }
          } else {
            if (height > maxHeight) {
              width = Math.round((width * maxHeight) / height);
              height = maxHeight;
            }
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);

          // Nén JPEG 0.8
          const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
          // Ước tính kích thước byte của base64
          const compressedBytes = Math.round((dataUrl.length * 3) / 4);

          resolve({
            dataUrl,
            compressedBytes
          });
        };
        img.onerror = (err) => reject(err);
      };
      reader.onerror = (err) => reject(err);
    });
  };

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setErr(null);
      setMsg(null);
      setOriginalFileSize(Math.round(file.size / 1024)); // KB

      // Nén ảnh tự động
      const { dataUrl, compressedBytes } = await compressImage(file);
      setCompressedFileSize(Math.round(compressedBytes / 1024)); // KB
      setCompressedBase64(dataUrl);
      setPhotoPreview(dataUrl);
    } catch (error) {
      setErr('Lỗi khi nén ảnh phiếu phơi: ' + error.message);
    }
  };

  const handleUploadPhoto = async () => {
    if (!compressedBase64) {
      setErr('Vui lòng chụp ảnh hoặc chọn ảnh phiếu phơi trước khi tải lên.');
      return;
    }

    try {
      setSaving(true);
      setErr(null);
      setMsg(null);

      const res = await uploadEirPhotoApi(selectedTripId, {
        photoBase64: compressedBase64
      });

      if (res.success) {
        setMsg('Đã tải lên ảnh phiếu phơi và chuyển trạng thái ĐÃ TRẢ PHƠI thành công!');
        setEirStatus('DA_TRA');
        setCompressedBase64(null);
        if (res.data?.photoUrl) {
          setPhotoPreview(res.data.photoUrl);
        }
        onUpdated();
      } else {
        setErr(res.error || 'Upload ảnh phơi thất bại');
      }
    } catch (e) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateStatusOnly = async () => {
    try {
      setSaving(true);
      setErr(null);
      setMsg(null);

      const res = await updateEirStatusApi(selectedTripId, {
        eir_status: eirStatus,
        eir_paid_status: eirPaidStatus,
        notes: eirNotes
      });

      if (res.success) {
        setMsg('Đã cập nhật trạng thái phiếu phơi thành công!');
        onUpdated();
      } else {
        setErr(res.error || 'Cập nhật thất bại');
      }
    } catch (e) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDeletePhoto = async () => {
    if (!window.confirm('Bạn có chắc chắn muốn xóa ảnh phiếu phơi này không?')) return;

    try {
      setSaving(true);
      setErr(null);
      const res = await deleteEirPhotoApi(selectedTripId);
      if (res.success) {
        setPhotoPreview(null);
        setCompressedBase64(null);
        setEirStatus('CHUA_TRA');
        setMsg('Đã xóa ảnh phiếu phơi thành công.');
        onUpdated();
      } else {
        setErr(res.error || 'Xóa ảnh thất bại');
      }
    } catch (e) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  };

  // Tính số ngày đọng phơi của cuốc hiện tại
  const calcDaysOverdue = (dateStr) => {
    if (!dateStr) return 0;
    const tDate = new Date(dateStr);
    tDate.setHours(0, 0, 0, 0);
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return Math.floor((now.getTime() - tDate.getTime()) / (1000 * 60 * 60 * 24));
  };

  const currentOverdueDays = currentTrip ? calcDaysOverdue(currentTrip.trip_date) : 0;
  const isCurrentlyOverdue = currentTrip && currentTrip.eir_status !== 'DA_TRA' && currentOverdueDays >= 3;

  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-slate-900/60 backdrop-blur-xs p-2 sm:p-4 overflow-y-auto">
      <div className="bg-white w-full max-w-4xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden my-auto flex flex-col max-h-[calc(100dvh-1rem)] sm:max-h-[92dvh]">
        {/* Header Modal */}
        <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-emerald-500/20 text-emerald-400 rounded-xl">
              <Camera className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold flex items-center space-x-2">
                <span>Chụp Ảnh Phiếu Phơi & Quản Lý EIR Container</span>
                <span className="px-2 py-0.5 text-[10px] font-extrabold bg-emerald-600 text-white rounded-md uppercase">
                  Task 3.5
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Mobile Camera • Tự nén ảnh Canvas (~200KB) • Cảnh báo đọng phơi &gt; 3 ngày
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Top Navbar & Chuyển Tab */}
        <div className="bg-slate-100 px-6 py-3 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setActiveTab('CAPTURE')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center space-x-1.5 ${
                activeTab === 'CAPTURE'
                  ? 'bg-white text-emerald-700 shadow-xs border border-slate-200'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Camera className="w-3.5 h-3.5" />
              <span>Chụp & Cập Nhật Phơi</span>
            </button>
            <button
              onClick={() => setActiveTab('OVERDUE_MONITOR')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center space-x-1.5 ${
                activeTab === 'OVERDUE_MONITOR'
                  ? 'bg-amber-100 text-amber-900 shadow-xs border border-amber-300'
                  : 'text-slate-600 hover:text-amber-700'
              }`}
            >
              <Clock className="w-3.5 h-3.5 text-amber-600" />
              <span>Cảnh Báo Đọng Phơi (&gt;3 Ngày)</span>
            </button>
          </div>

          {activeTab === 'CAPTURE' && (
            <div className="flex items-center space-x-2">
              <label className="text-xs font-medium text-slate-600 whitespace-nowrap">Chọn cuốc xe:</label>
              <select
                value={selectedTripId}
                onChange={(e) => setSelectedTripId(e.target.value)}
                className="text-xs bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 font-mono font-semibold text-emerald-700 focus:outline-hidden focus:ring-2 focus:ring-emerald-500 max-w-[240px]"
              >
                {allTrips.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.trip_code} - {t.vehicle_plate} ({t.container_number || 'N/A'})
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {/* Thông báo Alert */}
          {msg && (
            <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium flex items-center space-x-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{msg}</span>
            </div>
          )}
          {err && (
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-medium flex items-center space-x-2">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{err}</span>
            </div>
          )}

          {activeTab === 'OVERDUE_MONITOR' ? (
            /* TAB 2: GIÁM SÁT ĐỌNG PHƠI > 3 NGÀY */
            <div className="space-y-4">
              <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl flex items-start space-x-3">
                <Clock className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div className="text-xs text-amber-900">
                  <div className="font-bold text-sm">Danh Sách Cuốc Xe Đọng Phơi Quá 3 Ngày Chưa Nộp</div>
                  <p className="mt-0.5 text-amber-700">
                    Hệ thống tự động phát hiện các chuyến xe đã chạy quá 3 ngày nhưng tài xế chưa trả phơi/phiếu hạ, giúp bộ phận điều hành kịp thời đôn đốc để thanh quyết toán cảng và phát hành hóa đơn cho khách hàng.
                  </p>
                </div>
              </div>

              <div className="border border-slate-200 rounded-xl ha-table-scroll" tabIndex={0} role="region" aria-label="Bảng dữ liệu, có thể cuộn ngang">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 border-b border-slate-200 text-slate-600 uppercase font-semibold text-[10px]">
                    <tr>
                      <th className="p-3">Mã Cuốc & Ngày Chạy</th>
                      <th className="p-3">Số Container</th>
                      <th className="p-3">Đầu Xe & Lái Xe</th>
                      <th className="p-3">Chủ Hàng & Tuyến</th>
                      <th className="p-3 text-center">Thời Gian Đọng</th>
                      <th className="p-3 text-right">Thao Tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {pendingTrips.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="text-center py-8 text-slate-400">
                          {loading ? 'Đang tải danh sách...' : 'Tuyệt vời! Không có cuốc xe nào bị đọng phơi quá 3 ngày.'}
                        </td>
                      </tr>
                    ) : (
                      pendingTrips.map((p) => (
                        <tr key={p.id} className="hover:bg-amber-50/40">
                          <td className="p-3">
                            <span className="font-mono font-bold text-blue-600">{p.trip_code}</span>
                            <div className="text-[10px] text-slate-400">{p.trip_date}</div>
                          </td>
                          <td className="p-3">
                            <span className="font-mono font-bold text-slate-800">{p.container_number || 'N/A'}</span>
                            <span className="text-[10px] text-slate-400 block">{p.container_size || '40'}'</span>
                          </td>
                          <td className="p-3">
                            <span className="font-bold text-slate-800">{p.vehicle_plate}</span>
                            <div className="text-[10px] text-slate-500">{p.driver_name || 'Chưa gán'}</div>
                          </td>
                          <td className="p-3">
                            <span className="font-medium text-slate-800">{p.customer_name}</span>
                            <div className="text-[10px] text-slate-500 truncate max-w-[160px]">{p.route_name}</div>
                          </td>
                          <td className="p-3 text-center">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              p.days_overdue >= 7 
                                ? 'bg-rose-100 text-rose-700 border border-rose-300' 
                                : 'bg-amber-100 text-amber-800 border border-amber-300'
                            }`}>
                              ⚠️ Đọng {p.days_overdue} ngày
                            </span>
                          </td>
                          <td className="p-3 text-right">
                            <button
                              onClick={() => {
                                setSelectedTripId(p.id);
                                setActiveTab('CAPTURE');
                              }}
                              className="px-2.5 py-1 text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-all"
                            >
                              Chụp phơi ngay
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            /* TAB 1: CHỤP ẢNH & CẬP NHẬT PHƠI */
            <div className="space-y-6">
              {/* Banner cảnh báo nếu cuốc hiện tại bị đọng phơi */}
              {isCurrentlyOverdue && (
                <div className="p-3.5 bg-amber-50 border border-amber-300 rounded-xl text-xs text-amber-900 flex items-center space-x-2">
                  <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
                  <div>
                    <span className="font-bold">CẢNH BÁO ĐỌNG PHƠI: </span>
                    <span>Cuốc xe này đã chạy cách đây {currentOverdueDays} ngày nhưng chưa trả phiếu phơi! Vui lòng chụp hoặc tải ảnh phơi để hoàn tất.</span>
                  </div>
                </div>
              )}

              {/* Thông tin chuyến xe tóm tắt */}
              {currentTrip && (
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl flex flex-wrap items-center justify-between gap-3 text-xs">
                  <div>
                    <span className="font-mono font-bold text-blue-600 text-sm">{currentTrip.trip_code}</span>
                    <span className="text-slate-400 ml-2">({currentTrip.trip_date})</span>
                    <div className="text-slate-700 font-semibold mt-0.5">
                      {currentTrip.customer_name} • Tuyến: {currentTrip.route_name}
                    </div>
                  </div>
                  <div className="flex items-center space-x-3">
                    <div className="text-right">
                      <span className="text-[10px] text-slate-400 block font-medium">Xe & Số Cont:</span>
                      <span className="font-bold text-slate-800">{currentTrip.vehicle_plate}</span> - <span className="font-mono font-bold text-emerald-600">{currentTrip.container_number || 'N/A'}</span>
                    </div>
                    <span className={`px-2.5 py-1 rounded-lg text-xs font-bold border ${
                      eirStatus === 'DA_TRA'
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : 'bg-amber-50 text-amber-700 border-amber-200'
                    }`}>
                      {eirStatus === 'DA_TRA' ? '✓ Đã Trả Phơi' : '⏳ Chưa Trả Phơi'}
                    </span>
                  </div>
                </div>
              )}

              {/* Grid 2 cột: Ảnh Phơi (Trái) + Trạng thái & Thao tác (Phải) */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Cột Trái: Ảnh Phiếu Phơi */}
                <div className="space-y-3">
                  <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center justify-between">
                    <span>Ảnh Phiếu Phơi / Phiếu Hạ</span>
                    {compressedFileSize && (
                      <span className="text-[10px] text-emerald-600 font-semibold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                        Nén: {originalFileSize}KB ➔ {compressedFileSize}KB
                      </span>
                    )}
                  </h3>

                  <div className="border-2 border-dashed border-slate-300 rounded-2xl p-4 bg-slate-50 text-center min-h-[260px] flex flex-col items-center justify-center relative overflow-hidden group">
                    {photoPreview ? (
                      <div className="relative w-full h-full flex flex-col items-center">
                        <img
                          src={photoPreview}
                          alt="Phiếu phơi container"
                          className="max-h-64 object-contain rounded-xl shadow-xs border border-slate-200"
                        />
                        <div className="absolute top-2 right-2 flex items-center space-x-1.5 bg-slate-900/70 p-1 rounded-lg backdrop-blur-xs">
                          <button
                            onClick={() => setIsZoomOpen(true)}
                            className="p-1 text-white hover:text-emerald-400"
                            title="Phóng to xem chi tiết"
                          >
                            <Maximize2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={handleDeletePhoto}
                            className="p-1 text-white hover:text-rose-400"
                            title="Gỡ ảnh phơi"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2 py-6">
                        <ImageIcon className="w-12 h-12 text-slate-400 mx-auto" />
                        <div className="text-xs text-slate-600 font-medium">
                          Chưa có ảnh phiếu phơi cho cuốc xe này
                        </div>
                        <p className="text-[11px] text-slate-400">
                          Chụp bằng camera điện thoại hoặc chọn ảnh từ máy tính
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Nút chụp ảnh Camera & Tải ảnh */}
                  <div className="grid grid-cols-2 gap-2.5">
                    {/* Nút 1: Chụp bằng camera điện thoại */}
                    <button
                      type="button"
                      onClick={() => cameraInputRef.current?.click()}
                      className="px-3 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-xs transition-all flex items-center justify-center space-x-1.5"
                    >
                      <Camera className="w-4 h-4" />
                      <span>Chụp Bằng Camera</span>
                    </button>
                    <input
                      type="file"
                      ref={cameraInputRef}
                      accept="image/*"
                      capture="environment"
                      onChange={handleFileChange}
                      className="hidden"
                    />

                    {/* Nút 2: Chọn file từ máy */}
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="px-3 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl border border-slate-300 transition-all flex items-center justify-center space-x-1.5"
                    >
                      <Upload className="w-4 h-4" />
                      <span>Chọn Ảnh Từ Máy</span>
                    </button>
                    <input
                      type="file"
                      ref={fileInputRef}
                      accept="image/*"
                      onChange={handleFileChange}
                      className="hidden"
                    />
                  </div>

                  {compressedBase64 && (
                    <button
                      onClick={handleUploadPhoto}
                      disabled={saving}
                      className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-md shadow-blue-500/20 transition-all flex items-center justify-center space-x-1.5 animate-bounce"
                    >
                      <Check className="w-4 h-4" />
                      <span>Xác Nhận Lưu Ảnh Phơi ({compressedFileSize} KB)</span>
                    </button>
                  )}
                </div>

                {/* Cột Phải: Trạng Thái Phơi & Quyết Toán */}
                <div className="space-y-4 bg-slate-50/50 p-4 rounded-2xl border border-slate-200 flex flex-col justify-between">
                  <div className="space-y-3">
                    <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                      Trạng Thái & Thông Tin Phiếu Phơi
                    </h3>

                    {/* Trạng thái nộp phơi */}
                    <div>
                      <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                        Trạng Thái Trả Phơi (EIR Status)
                      </label>
                      <select
                        value={eirStatus}
                        onChange={(e) => setEirStatus(e.target.value)}
                        className="w-full text-xs bg-white border border-slate-300 rounded-lg p-2 font-bold text-slate-800 focus:ring-2 focus:ring-emerald-500"
                      >
                        <option value="CHUA_TRA">⏳ Chưa Trả Phơi (CHUA_TRA)</option>
                        <option value="DA_TRA">✓ Đã Trả Phơi (DA_TRA)</option>
                      </select>
                    </div>

                    {/* Trạng thái thanh toán phơi */}
                    <div>
                      <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                        Thanh Toán Tiền Phơi Cảng
                      </label>
                      <select
                        value={eirPaidStatus}
                        onChange={(e) => setEirPaidStatus(e.target.value)}
                        className="w-full text-xs bg-white border border-slate-300 rounded-lg p-2 font-bold text-slate-800 focus:ring-2 focus:ring-emerald-500"
                      >
                        <option value="CHUA_TT">❌ Chưa Thanh Toán Phơi (CHUA_TT)</option>
                        <option value="DA_TT">💰 Đã Thanh Toán Phơi (DA_TT)</option>
                      </select>
                    </div>

                    {/* Ghi chú phơi */}
                    <div>
                      <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                        Ghi Chú Phiếu Phơi / Tình Trạng Vỏ Cont
                      </label>
                      <textarea
                        rows={3}
                        value={eirNotes}
                        onChange={(e) => setEirNotes(e.target.value)}
                        placeholder="VD: Phơi mờ dấu mộc, vỏ cont có vết móp bên hông, bãi Đình Vũ giữ cọc..."
                        className="w-full text-xs bg-white border border-slate-300 rounded-lg p-2 text-slate-800"
                      />
                    </div>
                  </div>

                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={handleUpdateStatusOnly}
                      disabled={saving}
                      className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-xs transition-all flex items-center justify-center space-x-1.5"
                    >
                      <FileCheck className="w-3.5 h-3.5" />
                      <span>Cập Nhật Trạng Thái Phơi</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-slate-50 px-6 py-3 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500 shrink-0">
          <span>Hệ thống tự động nén ảnh nhẹ để truyền tải ổn định ngoài cảng</span>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold rounded-xl transition-all"
          >
            Đóng
          </button>
        </div>
      </div>

      {/* Modal Zoom Xem Ảnh Phơi To */}
      {isZoomOpen && photoPreview && (
        <div className="fixed inset-0 z-60 bg-black/90 flex flex-col items-center justify-center p-4">
          <div className="relative max-w-4xl max-h-[90vh]">
            <img
              src={photoPreview}
              alt="Phóng to phiếu phơi"
              className="max-h-[85vh] max-w-full object-contain rounded-lg shadow-2xl"
            />
            <button
              onClick={() => setIsZoomOpen(false)}
              className="absolute -top-10 right-0 p-2 text-white hover:text-rose-400 bg-slate-800/80 rounded-full"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
