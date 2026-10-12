import React, { useState, useEffect } from 'react';
import {
  fetchPayrollSummaryApi,
  updateDriverIncentiveApi
} from '../services/api';
import {
  Wallet,
  ShieldCheck,
  Edit3,
  ChevronDown,
  ChevronUp,
  Truck,
  Calendar,
  CircleDollarSign,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  FileText
} from 'lucide-react';

export default function PayrollView({ currentUser }) {
  const [loading, setLoading] = useState(false);
  const [periodMonth, setPeriodMonth] = useState('2026-09');
  const [payrollData, setPayrollData] = useState(null);
  const [error, setError] = useState(null);
  const [expandedDriverId, setExpandedDriverId] = useState(null);

  // State cho Modal Sửa Khoản Động Viên (DIRECTOR)
  const [editingDriver, setEditingDriver] = useState(null);
  const [incentiveAmount, setIncentiveAmount] = useState('');
  const [incentiveNote, setIncentiveNote] = useState('');
  const [baseSalaryOverride, setBaseSalaryOverride] = useState('');
  const [savingIncentive, setSavingIncentive] = useState(false);
  const [modalSuccessMsg, setModalSuccessMsg] = useState('');

  const isDirector = currentUser?.role === 'DIRECTOR';

  const loadPayroll = async (month = periodMonth) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchPayrollSummaryApi(month);
      if (res.success && res.data) {
        setPayrollData(res.data);
      } else {
        setError(res.error || 'Không thể tải bảng lương');
      }
    } catch (err) {
      setError(err.message || 'Lỗi mạng khi tải bảng lương');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPayroll(periodMonth);
  }, [periodMonth]);

  const handleOpenEditModal = (drv) => {
    setEditingDriver(drv);
    setIncentiveAmount(drv.incentive_bonus || 0);
    setIncentiveNote(drv.incentive_note || '');
    setBaseSalaryOverride(drv.base_salary || 0);
    setModalSuccessMsg('');
  };

  const handleSaveIncentive = async (e) => {
    e.preventDefault();
    if (!editingDriver) return;
    setSavingIncentive(true);
    setModalSuccessMsg('');
    try {
      const payload = {
        driver_id: editingDriver.driver_id,
        period_month: periodMonth,
        incentive_amount: Math.round(Number(incentiveAmount) || 0),
        incentive_note: incentiveNote,
        base_salary_override: baseSalaryOverride !== '' ? Math.round(Number(baseSalaryOverride) || 0) : null
      };
      const res = await updateDriverIncentiveApi(payload);
      if (res.success) {
        setModalSuccessMsg('Đã lưu khoản động viên thành công!');
        setTimeout(() => {
          setEditingDriver(null);
          loadPayroll(periodMonth);
        }, 800);
      } else {
        alert(res.error || 'Cập nhật thất bại');
      }
    } catch (err) {
      alert(err.message || 'Lỗi kết nối máy chủ');
    } finally {
      setSavingIncentive(false);
    }
  };

  const formatMoney = (amount) => {
    return (Number(amount) || 0).toLocaleString('vi-VN') + ' ₫';
  };

  return (
    <div className="space-y-6">
      {/* HEADER & CHỌN THÁNG */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-2 bg-emerald-100 text-emerald-700 rounded-lg">
                <Wallet className="w-6 h-6" />
              </span>
              <div>
                <h2 className="text-xl font-bold text-slate-800">
                  Bảng Lương 3 Thành Phần Toàn Đội
                </h2>
                <p className="text-xs text-slate-500">
                  Chuẩn công thức: Lương cứng + Lương công chuyến + Khoản động viên GĐ - Tạm ứng
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200">
              <Calendar className="w-4 h-4 text-slate-500" />
              <span className="text-xs font-medium text-slate-600">Kỳ Lương:</span>
              <select
                value={periodMonth}
                onChange={(e) => setPeriodMonth(e.target.value)}
                className="bg-transparent text-sm font-semibold text-slate-800 focus:outline-none cursor-pointer"
              >
                <option value="2026-09">Tháng 09/2026 (Dữ liệu mẫu)</option>
                <option value="2026-10">Tháng 10/2026 (Hiện tại)</option>
                <option value="2026-11">Tháng 11/2026</option>
                <option value="2026-12">Tháng 12/2026</option>
              </select>
            </div>

            <button
              onClick={() => loadPayroll(periodMonth)}
              disabled={loading}
              className="p-2 text-slate-600 hover:text-emerald-600 hover:bg-slate-100 rounded-lg transition-colors"
              title="Tải lại bảng lương"
            >
              <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin text-emerald-600' : ''}`} />
            </button>
          </div>
        </div>

        {/* 5 THẺ TỔNG HỢP QUỸ LƯƠNG & DOANH THU */}
        {payrollData?.summary && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-6">
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5">
              <p className="text-[11px] font-semibold text-slate-600 uppercase tracking-wider">
                Doanh Thu Đội Xe
              </p>
              <p className="text-lg font-bold font-mono text-slate-900 mt-1">
                {formatMoney(payrollData.summary.total_revenue_generated)}
              </p>
              <p className="text-[10px] text-slate-500 mt-0.5">{payrollData.total_trips_completed} cuốc xe hoàn thành</p>
            </div>

            <div className="bg-blue-50/60 border border-blue-100 rounded-xl p-3.5">
              <p className="text-[11px] font-semibold text-blue-600 uppercase tracking-wider">
                1. Lương Cứng
              </p>
              <p className="text-lg font-bold font-mono text-blue-900 mt-1">
                {formatMoney(payrollData.summary.total_base_salary)}
              </p>
              <p className="text-[10px] text-blue-500 mt-0.5">Định mức hàng tháng</p>
            </div>

            <div className="bg-indigo-50/60 border border-indigo-100 rounded-xl p-3.5">
              <p className="text-[11px] font-semibold text-indigo-600 uppercase tracking-wider">
                2. Lương Chuyến
              </p>
              <p className="text-lg font-bold font-mono text-indigo-900 mt-1">
                {formatMoney(payrollData.summary.total_trip_salary)}
              </p>
              <p className="text-[10px] text-indigo-500 mt-0.5">Công theo từng chuyến</p>
            </div>

            <div className="bg-amber-50/60 border border-amber-100 rounded-xl p-3.5">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-semibold text-amber-700 uppercase tracking-wider">
                  3. Động Viên
                </p>
                <span className="text-[9px] bg-amber-200 text-amber-800 px-1 py-0.2 rounded font-bold">
                  Bảo Mật
                </span>
              </div>
              <p className="text-lg font-bold font-mono text-amber-900 mt-1">
                {formatMoney(payrollData.summary.total_incentive)}
              </p>
              <p className="text-[10px] text-amber-600 mt-0.5">Thưởng hiệu quả / giữ xe</p>
            </div>

            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3.5 shadow-xs col-span-2 md:col-span-1">
              <p className="text-[11px] font-semibold text-emerald-700 uppercase tracking-wider">
                💰 Tổng Quỹ Thực Chi
              </p>
              <p className="text-lg font-black font-mono text-emerald-800 mt-1">
                {formatMoney(payrollData.summary.total_net_payout)}
              </p>
              <p className="text-[10px] text-emerald-600 mt-0.5">
                (Đã trừ {formatMoney(payrollData.summary.total_deductions)} tạm ứng)
              </p>
            </div>
          </div>
        )}
      </div>

      {/* DANH SÁCH BẢNG LƯƠNG TÀI XẾ */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Truck className="w-5 h-5 text-slate-500" />
            <h3 className="font-bold text-slate-800">
              Chi Tiết Lương Từng Lái Xe ({payrollData?.drivers?.length || 0} tài xế)
            </h3>
          </div>
          <span className="text-xs text-slate-500">
            Kỳ {periodMonth} • Tiền tệ số nguyên VND chuẩn hóa
          </span>
        </div>

        {error ? (
          <div className="p-8 text-center text-rose-600">
            <AlertCircle className="w-8 h-8 mx-auto mb-2" />
            <p className="font-semibold">{error}</p>
          </div>
        ) : loading && !payrollData ? (
          <div className="p-8 text-center text-slate-500">
            <RefreshCw className="w-8 h-8 mx-auto mb-2 animate-spin text-emerald-500" />
            <p>Đang tổng hợp số liệu lương...</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 text-[11px] font-bold text-slate-600 uppercase border-b border-slate-200">
                  <th className="py-3 px-4">Lái Xe & Đầu Xe</th>
                  <th className="py-3 px-4 text-right text-slate-900 font-extrabold">Doanh Thu</th>
                  <th className="py-3 px-4 text-right">Lương Cứng</th>
                  <th className="py-3 px-4 text-right">Lương Chuyến</th>
                  <th className="py-3 px-4 text-right">Động Viên GĐ</th>
                  <th className="py-3 px-4 text-right text-rose-600">Trừ Tạm Ứng</th>
                  <th className="py-3 px-4 text-right bg-emerald-50 text-emerald-800 font-extrabold">
                    Thực Lĩnh
                  </th>
                  <th className="py-3 px-4 text-center">Tác Vụ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {payrollData?.drivers?.map((drv) => {
                  const isExpanded = expandedDriverId === drv.driver_id;
                  return (
                    <React.Fragment key={drv.driver_id}>
                      <tr className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3 px-4">
                          <div className="font-bold text-slate-800">{drv.driver_name}</div>
                          <div className="flex items-center gap-1.5 text-xs text-slate-500 mt-0.5">
                            <span className="bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded font-mono font-medium">
                              {drv.vehicle_plate}
                            </span>
                            {drv.phone && <span>• {drv.phone}</span>}
                          </div>
                        </td>

                        {/* Doanh thu mang về */}
                        <td className="py-3 px-4 text-right">
                          <div className="font-bold font-mono text-slate-900">
                            {formatMoney(drv.total_revenue)}
                          </div>
                          <div className="text-[10px] text-slate-500">
                            {drv.trips_count} cuốc • Thu: <b className="text-emerald-700">{formatMoney(drv.collected_revenue)}</b>
                          </div>
                        </td>

                        {/* 1. Lương cứng */}
                        <td className="py-3 px-4 text-right font-medium text-slate-700">
                          {formatMoney(drv.base_salary)}
                        </td>

                        {/* 2. Lương chuyến */}
                        <td className="py-3 px-4 text-right">
                          <div className="font-semibold text-indigo-700">
                            {formatMoney(drv.trip_salary)}
                          </div>
                          <div className="text-[11px] text-slate-400">
                            {drv.trips_count} chuyến xe
                          </div>
                        </td>

                        {/* 3. Khoản động viên GĐ */}
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <span className="font-bold text-amber-700">
                              {formatMoney(drv.incentive_bonus)}
                            </span>
                            {isDirector && (
                              <button
                                onClick={() => handleOpenEditModal(drv)}
                                className="p-1 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded transition-colors"
                                title="Chỉnh sửa khoản động viên"
                              >
                                <Edit3 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                          {drv.incentive_note ? (
                            <div className="text-[11px] text-slate-500 italic max-w-[180px] ml-auto truncate" title={drv.incentive_note}>
                              {drv.incentive_note}
                            </div>
                          ) : (
                            <div className="text-[10px] text-slate-400">Chưa ghi chú</div>
                          )}
                        </td>

                        {/* Khấu trừ tạm ứng */}
                        <td className="py-3 px-4 text-right font-medium text-rose-600">
                          -{formatMoney(drv.deductions)}
                        </td>

                        {/* Thực lĩnh */}
                        <td className="py-3 px-4 text-right bg-emerald-50 font-black text-emerald-700 text-base">
                          {formatMoney(drv.net_salary)}
                        </td>

                        {/* Nút xem chi tiết */}
                        <td className="py-3 px-4 text-center">
                          <button
                            onClick={() => setExpandedDriverId(isExpanded ? null : drv.driver_id)}
                            className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-600 transition-colors"
                          >
                            <span>{isExpanded ? 'Đóng' : 'Chi tiết'}</span>
                            {isExpanded ? (
                              <ChevronUp className="w-3.5 h-3.5" />
                            ) : (
                              <ChevronDown className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </td>
                      </tr>

                      {/* DRILLDOWN: DANH SÁCH CUỐC XE & TẠM ỨNG CỦA TÀI XẾ */}
                      {isExpanded && (
                        <tr className="bg-slate-50/90">
                          <td colSpan={8} className="p-4 border-y border-slate-200">
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                              {/* Cột trái: Các chuyến xe chạy trong kỳ */}
                              <div className="bg-white rounded-lg p-3 border border-slate-200 shadow-2xs">
                                <h4 className="text-xs font-bold text-slate-700 uppercase mb-2 flex items-center gap-1.5">
                                  <FileText className="w-4 h-4 text-indigo-600" />
                                  Danh Sách Cuốc Xe ({drv.trips?.length || 0} cuốc)
                                </h4>
                                {drv.trips?.length === 0 ? (
                                  <p className="text-xs text-slate-400 italic">Không có cuốc xe nào trong tháng</p>
                                ) : (
                                  <div className="max-h-56 overflow-y-auto divide-y divide-slate-100 text-xs">
                                    {drv.trips?.map((t) => (
                                      <div key={t.id} className="py-1.5 flex items-center justify-between">
                                        <div>
                                          <div className="font-semibold text-slate-800">
                                            {t.trip_code} • {t.trip_date}
                                          </div>
                                          <div className="text-slate-500 text-[11px]">
                                            {t.route_name || 'Tuyến mặc định'} ({t.customer_name})
                                          </div>
                                        </div>
                                        <div className="text-right">
                                          <div className="font-bold text-indigo-700">
                                            +{formatMoney(t.driver_salary)}
                                          </div>
                                          <div className="text-[10px] text-slate-500 font-mono">
                                            Cước: {formatMoney(t.total_revenue)}
                                          </div>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>

                              {/* Cột phải: Các khoản tạm ứng */}
                              <div className="bg-white rounded-lg p-3 border border-slate-200 shadow-2xs">
                                <h4 className="text-xs font-bold text-slate-700 uppercase mb-2 flex items-center gap-1.5">
                                  <CircleDollarSign className="w-4 h-4 text-rose-600" />
                                  Các Khoản Tạm Ứng Trước Cuốc ({drv.advances?.length || 0} lần)
                                </h4>
                                {drv.advances?.length === 0 ? (
                                  <p className="text-xs text-slate-400 italic">Không có tạm ứng nào trong tháng</p>
                                ) : (
                                  <div className="max-h-56 overflow-y-auto divide-y divide-slate-100 text-xs">
                                    {drv.advances?.map((adv) => (
                                      <div key={adv.id} className="py-1.5 flex items-center justify-between">
                                        <div>
                                          <div className="font-semibold text-slate-800">
                                            Ngày {adv.advance_date}
                                          </div>
                                          <div className="text-slate-500 text-[11px]">
                                            {adv.notes || 'Tạm ứng đường/ăn ca'}
                                          </div>
                                        </div>
                                        <div className="text-right">
                                          <div className="font-bold text-rose-600">
                                            -{formatMoney(adv.advance_amount)}
                                          </div>
                                          <div className="text-[10px]">
                                            {adv.status === 'SETTLED' ? (
                                              <span className="text-emerald-600">Đã chốt phơi</span>
                                            ) : (
                                              <span className="text-amber-600">Chờ hoàn ứng</span>
                                            )}
                                          </div>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* MODAL SỬA KHOẢN ĐỘNG VIÊN CHO GIÁM ĐỐC */}
      {editingDriver && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-md w-full overflow-hidden">
            <div className="bg-amber-500 px-5 py-4 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-6 h-6" />
                <h3 className="font-bold text-lg">Phê Duyệt Khoản Động Viên</h3>
              </div>
              <span className="text-xs bg-amber-600 px-2 py-0.5 rounded font-bold">
                Quyền Giám Đốc
              </span>
            </div>

            <form onSubmit={handleSaveIncentive} className="p-5 space-y-4">
              <div>
                <p className="text-xs text-slate-500">Lái xe nhận thưởng:</p>
                <p className="text-base font-bold text-slate-800">{editingDriver.driver_name}</p>
                <p className="text-xs text-slate-500">Xe: {editingDriver.vehicle_plate} • Kỳ: {periodMonth}</p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Khoản Động Viên / Thưởng Chuyên Cần (VND)
                </label>
                <input
                  type="number"
                  step="10000"
                  required
                  value={incentiveAmount}
                  onChange={(e) => setIncentiveAmount(e.target.value)}
                  placeholder="Ví dụ: 2000000"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-base font-bold text-slate-800 focus:ring-2 focus:ring-amber-500 focus:outline-none"
                />
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Quy đổi: {formatMoney(incentiveAmount)}
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Lý Do / Ghi Chú Động Viên (Bảo mật nội bộ)
                </label>
                <textarea
                  rows={2}
                  value={incentiveNote}
                  onChange={(e) => setIncentiveNote(e.target.value)}
                  placeholder="Ví dụ: Chăm sóc xe tốt, chạy đêm kịp chuyến, phụ trách hàng khẩn cấp..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs text-slate-700 focus:ring-2 focus:ring-amber-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Lương Cứng Điều Chỉnh Riêng Tháng Này (Tùy chọn)
                </label>
                <input
                  type="number"
                  step="10000"
                  value={baseSalaryOverride}
                  onChange={(e) => setBaseSalaryOverride(e.target.value)}
                  placeholder="Để mặc định theo định mức hồ sơ lái xe"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-semibold text-slate-700 focus:ring-2 focus:ring-amber-500 focus:outline-none"
                />
              </div>

              {modalSuccessMsg && (
                <div className="p-2.5 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-lg text-xs flex items-center gap-1.5 font-medium">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  {modalSuccessMsg}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingDriver(null)}
                  disabled={savingIncentive}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  disabled={savingIncentive}
                  className="px-4 py-2 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-lg shadow-sm transition-colors flex items-center gap-1.5"
                >
                  {savingIncentive && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  Xác Nhận Duyệt Lương
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
