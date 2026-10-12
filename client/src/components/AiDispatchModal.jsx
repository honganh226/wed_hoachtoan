import React, { useState, useEffect } from 'react';
import { 
  Sparkles, 
  X, 
  CheckCircle2, 
  AlertCircle, 
  Truck, 
  User, 
  TrendingUp, 
  ShieldCheck, 
  HeartPulse, 
  Compass, 
  ArrowRight, 
  Check, 
  Award,
  Zap,
  Info
} from 'lucide-react';
import { fetchAiDispatchSuggestionsApi } from '../services/api.js';

export default function AiDispatchModal({
  isOpen,
  onClose,
  tripParams = {},
  onSelectRecommendation
}) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [selectedRank, setSelectedRank] = useState(1);

  useEffect(() => {
    if (isOpen) {
      loadSuggestions();
    }
  }, [isOpen, tripParams.routeId, tripParams.tripDate, tripParams.customerName]);

  const loadSuggestions = async () => {
    try {
      setLoading(true);
      setErr(null);
      const res = await fetchAiDispatchSuggestionsApi(tripParams);
      if (res.success && res.data) {
        setData(res.data);
        if (res.data.recommendations?.length > 0) {
          setSelectedRank(res.data.recommendations[0].rank);
        }
      } else {
        setErr(res.error || 'Không thể tải đề xuất phân bổ AI');
      }
    } catch (e) {
      setErr(e.message || 'Lỗi kết nối máy chủ');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const formatVnd = (num) => new Intl.NumberFormat('vi-VN').format(num || 0) + ' ₫';

  const handleApply = (rec) => {
    if (onSelectRecommendation && rec) {
      onSelectRecommendation(rec);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden">
        
        {/* Header với phong cách AI cao cấp */}
        <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-purple-900 text-white px-6 py-4 flex items-center justify-between border-b border-indigo-800/40">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-400 to-indigo-400 p-0.5 shadow-lg shadow-purple-500/20">
              <div className="w-full h-full bg-slate-900 rounded-[10px] flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-amber-300 animate-pulse" />
              </div>
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-base font-bold text-white tracking-wide">
                  AI GỢI Ý PHÂN BỔ NHANH ĐIỀU VẬN
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-400/20 text-amber-300 border border-amber-400/40">
                  4 TIÊU CHÍ VÀNG
                </span>
              </div>
              <p className="text-xs text-indigo-200/80">
                Thuật toán quét tự động: Tiến độ KPI (35%) • Thể lực/Đảo cuốc (25%) • Xe rảnh & Kỹ thuật (25%) • Tuyến quen (15%)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Thước đo 4 tiêu chí giải thích vắn tắt */}
        <div className="bg-slate-50 border-b border-slate-200 px-6 py-2.5 grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
          <div className="flex items-center space-x-2 text-slate-700">
            <TrendingUp className="w-4 h-4 text-purple-600 shrink-0" />
            <div>
              <span className="font-bold text-slate-900">1. Bù KPI (35%):</span>
              <span className="text-[11px] text-slate-500 block">Ưu tiên tài xế &lt; 80%</span>
            </div>
          </div>
          <div className="flex items-center space-x-2 text-slate-700">
            <HeartPulse className="w-4 h-4 text-rose-500 shrink-0" />
            <div>
              <span className="font-bold text-slate-900">2. Thể Lực (25%):</span>
              <span className="text-[11px] text-slate-500 block">Ưu tiên đã nghỉ &gt;= 1 ngày</span>
            </div>
          </div>
          <div className="flex items-center space-x-2 text-slate-700">
            <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
            <div>
              <span className="font-bold text-slate-900">3. Kỹ Thuật Xe (25%):</span>
              <span className="text-[11px] text-slate-500 block">Xe rảnh, ODO & Hạn an toàn</span>
            </div>
          </div>
          <div className="flex items-center space-x-2 text-slate-700">
            <Compass className="w-4 h-4 text-blue-600 shrink-0" />
            <div>
              <span className="font-bold text-slate-900">4. Tuyến Quen (15%):</span>
              <span className="text-[11px] text-slate-500 block">Kinh nghiệm chạy cung đường</span>
            </div>
          </div>
        </div>

        {/* Nội dung chính Modal */}
        <div className="p-6 overflow-y-auto flex-1 space-y-5">
          {err && (
            <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 flex items-center space-x-3 text-sm">
              <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
              <span>{err}</span>
            </div>
          )}

          {loading ? (
            <div className="py-16 text-center space-y-4">
              <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
              <p className="text-sm font-semibold text-slate-700">
                AI đang quét ma trận dữ liệu ODO, KPI, lịch trình chuyến và phân tích 4 tiêu chí...
              </p>
            </div>
          ) : data ? (
            <>
              {/* Thanh thông báo kết luận của AI */}
              {data.bestMatch && (
                <div className="p-4 rounded-xl bg-gradient-to-r from-purple-50 to-indigo-50 border border-purple-200 flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-sm">
                  <div className="flex items-start space-x-3">
                    <Zap className="w-5 h-5 text-purple-600 mt-0.5 shrink-0" />
                    <div>
                      <div className="text-xs font-bold uppercase tracking-wider text-purple-700">
                        ĐÁNH GIÁ TỔNG QUAN TỪ AI ENGINE
                      </div>
                      <div className="text-sm font-medium text-slate-800 mt-0.5">
                        {data.analysisSummary}
                      </div>
                      <div className="text-xs text-slate-500 mt-1">
                        Ngày chạy: <span className="font-semibold text-slate-700">{data.targetDate}</span>
                        {data.selectedRoute && (
                          <span className="ml-2">
                            • Tuyến: <span className="font-semibold text-slate-700">{data.selectedRoute.name}</span>
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => handleApply(data.bestMatch)}
                    className="inline-flex items-center justify-center space-x-2 px-4 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded-xl text-xs font-bold shadow-md shadow-purple-600/30 active:scale-95 transition-all shrink-0"
                  >
                    <Sparkles className="w-4 h-4 text-amber-300" />
                    <span>Áp Dụng Top 1 Ngay</span>
                  </button>
                </div>
              )}

              {/* Danh sách các đề xuất */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                    XẾP HẠNG ĐỀ XUẤT ({data.recommendations?.length || 0} PHƯƠNG ÁN)
                  </h4>
                  <span className="text-xs text-slate-400">
                    Bấm vào từng phương án hoặc nhấn nút Áp Dụng
                  </span>
                </div>

                <div className="grid grid-cols-1 gap-4">
                  {data.recommendations?.map((rec) => {
                    const isTop1 = rec.rank === 1;
                    const isSelected = selectedRank === rec.rank;

                    return (
                      <div
                        key={rec.driver.id}
                        onClick={() => setSelectedRank(rec.rank)}
                        className={`rounded-2xl border transition-all p-5 cursor-pointer relative ${
                          isTop1
                            ? 'bg-gradient-to-br from-amber-50/40 via-white to-purple-50/30 border-amber-300 shadow-md ring-2 ring-amber-400/30'
                            : isSelected
                            ? 'bg-white border-indigo-400 shadow-sm ring-1 ring-indigo-400'
                            : 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-sm'
                        }`}
                      >
                        {/* Huy hiệu thứ hạng */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                          <div className="flex items-center space-x-3">
                            <span className={`w-8 h-8 rounded-xl flex items-center justify-center font-black text-sm shrink-0 shadow-sm ${
                              isTop1
                                ? 'bg-amber-500 text-white'
                                : rec.rank === 2
                                ? 'bg-slate-700 text-white'
                                : 'bg-slate-200 text-slate-700'
                            }`}>
                              #{rec.rank}
                            </span>
                            <div>
                              <div className="flex items-center space-x-2">
                                <span className="font-extrabold text-base text-slate-900">
                                  {rec.driver.fullName}
                                </span>
                                <span className="text-slate-400 font-bold">•</span>
                                <span className="font-black text-base text-blue-700 bg-blue-50 px-2 py-0.5 rounded-lg border border-blue-200">
                                  {rec.vehicle.plateNumber}
                                </span>
                              </div>
                              <div className="text-xs text-slate-500 mt-0.5">
                                SĐT: {rec.driver.phone || 'Chưa cập nhật'} • Loại xe: {rec.vehicle.vehicleType || 'Đầu kéo'}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center space-x-3">
                            {/* Điểm số */}
                            <div className="text-right">
                              <div className="flex items-baseline space-x-1 justify-end">
                                <span className={`text-2xl font-black ${
                                  rec.score >= 85 ? 'text-amber-600' : rec.score >= 70 ? 'text-indigo-600' : 'text-slate-700'
                                }`}>
                                  {rec.score}
                                </span>
                                <span className="text-xs text-slate-400 font-bold">/100</span>
                              </div>
                              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                                Điểm phù hợp
                              </span>
                            </div>

                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleApply(rec);
                              }}
                              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center space-x-1.5 shadow-sm active:scale-95 ${
                                isTop1
                                  ? 'bg-amber-500 hover:bg-amber-600 text-white shadow-amber-500/20'
                                  : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                              }`}
                            >
                              <Check className="w-3.5 h-3.5" />
                              <span>Chọn Cặp Này</span>
                            </button>
                          </div>
                        </div>

                        {/* Điểm phân rã 4 tiêu chí */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 my-3 pt-1">
                          <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                            <div className="flex items-center justify-between text-[11px] text-slate-500">
                              <span>1. Tiến độ KPI</span>
                              <span className="font-bold text-slate-800">{rec.criteriaBreakdown?.kpi?.score}/100</span>
                            </div>
                            <div className="w-full bg-slate-200 h-1.5 rounded-full mt-1.5 overflow-hidden">
                              <div 
                                className="bg-purple-600 h-full rounded-full" 
                                style={{ width: `${rec.criteriaBreakdown?.kpi?.score || 0}%` }}
                              ></div>
                            </div>
                            <div className="text-[10px] text-slate-600 mt-1 truncate" title={rec.criteriaBreakdown?.kpi?.comment}>
                              {rec.criteriaBreakdown?.kpi?.comment}
                            </div>
                          </div>

                          <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                            <div className="flex items-center justify-between text-[11px] text-slate-500">
                              <span>2. Sức khỏe/Đảo cuốc</span>
                              <span className="font-bold text-slate-800">{rec.criteriaBreakdown?.health?.score}/100</span>
                            </div>
                            <div className="w-full bg-slate-200 h-1.5 rounded-full mt-1.5 overflow-hidden">
                              <div 
                                className="bg-rose-500 h-full rounded-full" 
                                style={{ width: `${rec.criteriaBreakdown?.health?.score || 0}%` }}
                              ></div>
                            </div>
                            <div className="text-[10px] text-slate-600 mt-1 truncate" title={rec.criteriaBreakdown?.health?.comment}>
                              {rec.criteriaBreakdown?.health?.comment}
                            </div>
                          </div>

                          <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                            <div className="flex items-center justify-between text-[11px] text-slate-500">
                              <span>3. Xe & Kỹ thuật</span>
                              <span className="font-bold text-slate-800">{rec.criteriaBreakdown?.vehicleReadiness?.score}/100</span>
                            </div>
                            <div className="w-full bg-slate-200 h-1.5 rounded-full mt-1.5 overflow-hidden">
                              <div 
                                className="bg-emerald-500 h-full rounded-full" 
                                style={{ width: `${rec.criteriaBreakdown?.vehicleReadiness?.score || 0}%` }}
                              ></div>
                            </div>
                            <div className="text-[10px] text-slate-600 mt-1 truncate" title={rec.criteriaBreakdown?.vehicleReadiness?.comment}>
                              {rec.criteriaBreakdown?.vehicleReadiness?.comment}
                            </div>
                          </div>

                          <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                            <div className="flex items-center justify-between text-[11px] text-slate-500">
                              <span>4. Tuyến quen</span>
                              <span className="font-bold text-slate-800">{rec.criteriaBreakdown?.routeFit?.score}/100</span>
                            </div>
                            <div className="w-full bg-slate-200 h-1.5 rounded-full mt-1.5 overflow-hidden">
                              <div 
                                className="bg-blue-500 h-full rounded-full" 
                                style={{ width: `${rec.criteriaBreakdown?.routeFit?.score || 0}%` }}
                              ></div>
                            </div>
                            <div className="text-[10px] text-slate-600 mt-1 truncate" title={rec.criteriaBreakdown?.routeFit?.comment}>
                              {rec.criteriaBreakdown?.routeFit?.comment}
                            </div>
                          </div>
                        </div>

                        {/* Danh sách các lý do AI đưa ra */}
                        <div className="mt-2 pt-2 border-t border-slate-100 space-y-1">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                            Lý do hệ thống đề xuất:
                          </span>
                          {rec.reasons?.map((reason, rIdx) => (
                            <div key={rIdx} className="text-xs text-slate-700 flex items-start space-x-2">
                              <span className="text-slate-400 mt-0.5">•</span>
                              <span className="leading-snug">{reason}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          ) : (
            <div className="py-12 text-center text-sm text-slate-500">
              Chưa có dữ liệu đề xuất.
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-slate-50 px-6 py-3 border-t border-slate-200 flex items-center justify-between">
          <div className="flex items-center space-x-2 text-xs text-slate-500">
            <Info className="w-4 h-4 text-indigo-500 shrink-0" />
            <span>
              Thao tác này sẽ tự động điền thông tin Lái xe & Xe vào phiếu tạo chuyến.
            </span>
          </div>

          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-200 transition-colors"
          >
            Đóng
          </button>
        </div>

      </div>
    </div>
  );
}
