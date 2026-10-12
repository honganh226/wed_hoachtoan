import React, { useState, useEffect } from 'react';
import { fetchDriverPersonalAppViewApi } from '../services/api';
import {
  Truck,
  Wallet,
  FileCheck,
  Clock,
  Calendar,
  RefreshCw,
  Image as ImageIcon,
  AlertCircle,
  CheckCircle2,
  CircleDollarSign,
  ShieldCheck,
  ChevronRight
} from 'lucide-react';

export default function DriverApp({ currentUser }) {
  const [loading, setLoading] = useState(false);
  const [periodMonth, setPeriodMonth] = useState('2026-09');
  const [driverData, setDriverData] = useState(null);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('trips'); // 'trips' | 'advances'
  const [viewingPhotoUrl, setViewingPhotoUrl] = useState(null);

  const loadData = async (month = periodMonth) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchDriverPersonalAppViewApi(month);
      if (res.success && res.data) {
        setDriverData(res.data);
      } else {
        setError(res.error || 'Không thể tải dữ liệu tài xế');
      }
    } catch (err) {
      setError(err.message || 'Lỗi kết nối máy chủ');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData(periodMonth);
  }, [periodMonth]);

  const formatMoney = (amount) => {
    return (Number(amount) || 0).toLocaleString('vi-VN') + ' ₫';
  };

  return (
    <div className="max-w-xl mx-auto space-y-4 pb-12">
      {/* HEADER TÀI XẾ (MOBILE HERO CARD) */}
      <div className="bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 rounded-2xl p-5 text-white shadow-lg border border-slate-800">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-emerald-500/20 border-2 border-emerald-400 flex items-center justify-center font-bold text-lg text-emerald-300">
              {driverData?.driver?.full_name ? driverData.driver.full_name.charAt(0) : 'LX'}
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h2 className="text-lg font-bold text-white tracking-wide">
                  {driverData?.driver?.full_name || currentUser?.fullName || 'Tài Xế'}
                </h2>
                <CheckCircle2 className="w-4 h-4 text-emerald-400" title="Đã xác thực" />
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-300 mt-0.5">
                <span className="font-mono bg-slate-800/80 px-2 py-0.5 rounded text-emerald-400 font-semibold border border-slate-700">
                  {driverData?.driver?.vehicle_plate || '15C-22405'}
                </span>
                {driverData?.driver?.phone && <span>• {driverData.driver.phone}</span>}
              </div>
            </div>
          </div>

          <div className="text-right">
            <select
              value={periodMonth}
              onChange={(e) => setPeriodMonth(e.target.value)}
              className="bg-slate-800 border border-slate-700 text-xs font-semibold text-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-emerald-400 cursor-pointer"
            >
              <option value="2026-09">Tháng 09/2026</option>
              <option value="2026-10">Tháng 10/2026</option>
              <option value="2026-11">Tháng 11/2026</option>
            </select>
          </div>
        </div>

        {/* THẺ THỰC LĨNH THÁNG NÀY (HERO STAT) */}
        {driverData?.payroll && (
          <div className="mt-5 bg-white/10 backdrop-blur-md rounded-xl p-4 border border-white/15">
            <div className="flex items-center justify-between text-xs text-emerald-300 font-semibold uppercase tracking-wider">
              <span>Lương Thực Lĩnh Dự Kiến</span>
              <span className="text-[11px] bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full border border-emerald-400/30">
                Kỳ {periodMonth}
              </span>
            </div>
            <div className="text-3xl font-black text-emerald-400 mt-1">
              {formatMoney(driverData.payroll.net_salary)}
            </div>

            {/* 3 THÀNH PHẦN CHI TIẾT */}
            <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-white/10 text-center">
              <div>
                <p className="text-[11px] text-slate-400">1. Lương Cứng</p>
                <p className="text-xs font-bold text-white mt-0.5">
                  {formatMoney(driverData.payroll.base_salary)}
                </p>
              </div>
              <div className="border-x border-white/10">
                <p className="text-[11px] text-slate-400">2. Lương Chuyến</p>
                <p className="text-xs font-bold text-indigo-300 mt-0.5">
                  +{formatMoney(driverData.payroll.trip_salary)}
                </p>
              </div>
              <div>
                <p className="text-[11px] text-slate-400">3. Động Viên GĐ</p>
                <p className="text-xs font-bold text-amber-300 mt-0.5">
                  +{formatMoney(driverData.payroll.incentive_bonus)}
                </p>
              </div>
            </div>

            {driverData.payroll.incentive_note && (
              <div className="mt-2.5 px-2.5 py-1.5 bg-amber-500/20 rounded-lg text-[11px] text-amber-200 flex items-center gap-1.5 border border-amber-500/30">
                <ShieldCheck className="w-3.5 h-3.5 shrink-0 text-amber-400" />
                <span>Thưởng GĐ: {driverData.payroll.incentive_note}</span>
              </div>
            )}

            {driverData.payroll.deductions > 0 && (
              <p className="text-[11px] text-rose-300 mt-2 text-right">
                * Đã khấu trừ tạm ứng: -{formatMoney(driverData.payroll.deductions)}
              </p>
            )}

            {/* Doanh thu cuốc xe mang về trong kỳ */}
            {driverData?.trips_summary?.total_revenue > 0 && (
              <div className="mt-3 pt-2.5 border-t border-white/10 flex items-center justify-between text-xs text-slate-300">
                <span>Doanh thu cuốc xe mang về:</span>
                <span className="font-mono font-bold text-emerald-300">
                  {formatMoney(driverData.trips_summary.total_revenue)} ({driverData.trips_summary.total_trips} cuốc)
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* THANH CHUYỂN TAB TÁC NGHIỆP */}
      <div className="flex bg-slate-100 p-1 rounded-xl">
        <button
          onClick={() => setActiveTab('trips')}
          className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
            activeTab === 'trips'
              ? 'bg-white text-slate-800 shadow-xs'
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <Truck className="w-4 h-4" />
          <span>Cuốc Xe Đã Chạy ({driverData?.trips_summary?.total_trips || 0})</span>
        </button>

        <button
          onClick={() => setActiveTab('advances')}
          className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
            activeTab === 'advances'
              ? 'bg-white text-slate-800 shadow-xs'
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <CircleDollarSign className="w-4 h-4" />
          <span>Tạm Ứng & Phơi ({driverData?.advances_summary?.advances?.length || 0})</span>
        </button>
      </div>

      {/* NỘI DUNG TAB 1: CUỐC XE ĐÃ CHẠY */}
      {activeTab === 'trips' && (
        <div className="space-y-3">
          {error ? (
            <div className="bg-white rounded-xl p-6 text-center text-rose-600 border border-slate-200">
              <AlertCircle className="w-6 h-6 mx-auto mb-1" />
              <p className="text-xs font-medium">{error}</p>
            </div>
          ) : loading && !driverData ? (
            <div className="bg-white rounded-xl p-8 text-center text-slate-500 border border-slate-200">
              <RefreshCw className="w-6 h-6 mx-auto mb-2 animate-spin text-emerald-500" />
              <p className="text-xs">Đang tải lịch sử chuyến chạy...</p>
            </div>
          ) : driverData?.trips_summary?.trips?.length === 0 ? (
            <div className="bg-white rounded-xl p-8 text-center text-slate-400 border border-slate-200">
              <Truck className="w-8 h-8 mx-auto mb-1.5 opacity-40" />
              <p className="text-xs font-semibold">Chưa có cuốc xe nào được ghi nhận trong tháng {periodMonth}</p>
            </div>
          ) : (
            driverData?.trips_summary?.trips?.map((trip) => {
              const hasEirPhoto = Boolean(trip.eir_photo_url);
              const isEirSubmitted = trip.eir_status === 'DA_TRA';

              return (
                <div
                  key={trip.id}
                  className="bg-white rounded-xl p-4 shadow-2xs border border-slate-200 hover:border-slate-300 transition-all space-y-2.5"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-800 text-sm">
                          {trip.trip_code}
                        </span>
                        <span className="text-[11px] text-slate-500 font-medium">
                          {trip.trip_date}
                        </span>
                      </div>
                      <div className="text-xs font-semibold text-slate-700 mt-0.5">
                        {trip.route_name || 'Tuyến mặc định'}
                      </div>
                      <div className="text-[11px] text-slate-400">
                        Chủ hàng: {trip.customer_name}
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-xs text-slate-400">Công chuyến</div>
                      <div className="text-base font-extrabold text-indigo-700">
                        +{formatMoney(trip.driver_salary)}
                      </div>
                      {trip.total_revenue > 0 && (
                        <div className="text-[10px] text-slate-500 font-mono">
                          Cước: {formatMoney(trip.total_revenue)}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* THÔNG TIN CONTAINER & NƠI NÂNG HẠ */}
                  {(trip.container_numbers || trip.pickup_location || trip.dropoff_location) && (
                    <div className="bg-slate-50 rounded-lg p-2 text-[11px] text-slate-600 space-y-1">
                      {trip.container_numbers && (
                        <div>
                          <span className="font-semibold text-slate-700">Cont: </span>
                          <span className="font-mono font-medium text-blue-700">{trip.container_numbers}</span>
                        </div>
                      )}
                      {(trip.pickup_location || trip.dropoff_location) && (
                        <div className="text-slate-500 flex items-center gap-1 truncate">
                          <span>Nâng: {trip.pickup_location || 'Cảng'}</span>
                          <span>➔</span>
                          <span>Hạ: {trip.dropoff_location || 'Kho'}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* TRẠNG THÁI PHƠI EIR */}
                  <div className="flex items-center justify-between pt-1 border-t border-slate-100 text-xs">
                    <div className="flex items-center gap-1.5">
                      {isEirSubmitted ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                          <FileCheck className="w-3.5 h-3.5 text-emerald-600" />
                          Đã nộp phơi
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                          <Clock className="w-3.5 h-3.5 text-amber-600" />
                          Chưa nộp phơi
                        </span>
                      )}
                    </div>

                    {hasEirPhoto && (
                      <button
                        onClick={() => setViewingPhotoUrl(trip.eir_photo_url)}
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 hover:text-blue-800"
                      >
                        <ImageIcon className="w-3.5 h-3.5" />
                        <span>Xem ảnh phơi</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* NỘI DUNG TAB 2: TẠM ỨNG & QUYẾT TOÁN */}
      {activeTab === 'advances' && (
        <div className="space-y-3">
          {driverData?.advances_summary?.advances?.length === 0 ? (
            <div className="bg-white rounded-xl p-8 text-center text-slate-400 border border-slate-200">
              <CircleDollarSign className="w-8 h-8 mx-auto mb-1.5 opacity-40" />
              <p className="text-xs font-semibold">Chưa có khoản tạm ứng nào trong tháng {periodMonth}</p>
            </div>
          ) : (
            driverData?.advances_summary?.advances?.map((adv) => {
              const isSettled = adv.status === 'SETTLED';
              const balance = Number(adv.balance_amount) || 0;

              return (
                <div
                  key={adv.id}
                  className="bg-white rounded-xl p-4 shadow-2xs border border-slate-200 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs font-bold text-slate-800">
                        Ngày ứng: {adv.advance_date}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        {adv.trip_code ? `Chuyến: ${adv.trip_code} (${adv.route_name || ''})` : 'Tạm ứng đường'}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-slate-400">Tiền đã ứng</div>
                      <div className="text-sm font-bold text-rose-600">
                        -{formatMoney(adv.advance_amount)}
                      </div>
                    </div>
                  </div>

                  <div className="bg-slate-50 rounded-lg p-2.5 text-xs flex items-center justify-between">
                    <div>
                      <span className="text-slate-500">Thực chi theo vé: </span>
                      <span className="font-semibold text-slate-700">{formatMoney(adv.settled_amount)}</span>
                    </div>

                    <div>
                      {isSettled ? (
                        balance > 0 ? (
                          <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded">
                            Thừa trả quỹ: {formatMoney(balance)}
                          </span>
                        ) : balance < 0 ? (
                          <span className="text-[11px] font-semibold text-blue-700 bg-blue-100 px-2 py-0.5 rounded">
                            Cty bù thêm: {formatMoney(Math.abs(balance))}
                          </span>
                        ) : (
                          <span className="text-[11px] font-semibold text-slate-600 bg-slate-200 px-2 py-0.5 rounded">
                            Khớp 100%
                          </span>
                        )
                      ) : (
                        <span className="text-[11px] font-semibold text-amber-700 bg-amber-100 px-2 py-0.5 rounded">
                          Chờ nộp vé quyết toán
                        </span>
                      )}
                    </div>
                  </div>

                  {adv.notes && (
                    <div className="text-[11px] text-slate-500 italic">
                      Ghi chú: {adv.notes}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* MODAL XEM ẢNH PHƠI */}
      {viewingPhotoUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full overflow-hidden shadow-2xl">
            <div className="p-3 bg-slate-900 text-white flex items-center justify-between">
              <span className="text-xs font-bold">Ảnh Phiếu Phơi / Phiếu Hạ Container</span>
              <button
                onClick={() => setViewingPhotoUrl(null)}
                className="text-slate-400 hover:text-white text-sm font-bold px-2 py-1"
              >
                ✕ Đóng
              </button>
            </div>
            <div className="p-2 bg-slate-100 flex items-center justify-center max-h-[75vh] overflow-auto">
              <img
                src={viewingPhotoUrl}
                alt="Phiếu phơi container"
                className="max-w-full h-auto rounded object-contain"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
