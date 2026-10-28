import React, { useEffect, useRef, useState } from 'react';
import {
  X,
  ChevronLeft,
  ChevronRight,
  Truck,
  Layers,
  Droplet,
  ArrowUpCircle,
  ArrowDownCircle,
  Clock,
  CheckCircle2,
  Coins
} from 'lucide-react';
import { formatVnd } from '../data/unifiedBusinessData';
import { computeTripFinancials } from '../utils/tripFinancials.js';
import PhoiRefundModal from './PhoiRefundModal.jsx';

export default function TripDetailDrawer({
  selectedTrip,
  onClose,
  onPrev,
  onNext,
  hasPrev,
  hasNext,
  onTripUpdated
}) {
  const dialogRef = useRef(null);
  const handlers = useRef({ onClose, onPrev, onNext, hasPrev, hasNext });
  handlers.current = { onClose, onPrev, onNext, hasPrev, hasNext };
  const open = Boolean(selectedTrip);

  const [phoiModalOpen, setPhoiModalOpen] = useState(false);
  const [phoiModalMode, setPhoiModalMode] = useState('REFUND');

  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialogRef.current?.querySelector('button:not(:disabled)')?.focus();
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        handlers.current.onClose();
      }
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
      if (e.key === '[' && handlers.current.hasPrev) handlers.current.onPrev();
      if (e.key === ']' && handlers.current.hasNext) handlers.current.onNext();
      if (e.key !== 'Tab') return;
      const buttons = [
        ...dialogRef.current.querySelectorAll(
          'button:not(:disabled), input, select, textarea, a[href], [tabindex="0"]'
        )
      ];
      const first = buttons[0],
        last = buttons.at(-1);
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [open]);

  if (!selectedTrip) return null;

  const tripCode = selectedTrip.trip_code || `TRIP-${selectedTrip.id}`;
  const tripDate = selectedTrip.trip_date || selectedTrip.raw_date || 'N/A';
  const driverName = selectedTrip.lai_xe || selectedTrip.driver_name || 'Xe ngoài điều phối';
  const vehiclePlate = selectedTrip.so_xe || selectedTrip.vehicle_plate || 'Thuê ngoài';
  const customerName = selectedTrip.ten_khach || selectedTrip.customer_name || 'Khách hàng';
  const routeName = selectedTrip.tuyen_duong || selectedTrip.route_name || 'Tuyến vận chuyển';

  const baseRevenue =
    selectedTrip.cuoc_goc ??
    selectedTrip.base_revenue ??
    selectedTrip.cuoc_vao ??
    selectedTrip.revenue_pre_tax ??
    0;

  const liftOnLocation = selectedTrip.noi_nang || selectedTrip.lift_on_location || null;
  const liftOnFee = selectedTrip.phi_nang ?? selectedTrip.lift_on_fee ?? 0;
  const liftOffLocation = selectedTrip.noi_ha || selectedTrip.lift_off_location || null;
  const liftOffFee = selectedTrip.phi_ha ?? selectedTrip.lift_off_fee ?? 0;
  const fuelLiters = selectedTrip.dau_liters ?? selectedTrip.dau_lit ?? selectedTrip.fuel_liters ?? 0;
  const fuelUnitPrice = selectedTrip.don_gia_dau ?? selectedTrip.fuel_unit_price ?? null;
  const phoiAdvanceAmount = selectedTrip.phoi_tra_ho ?? selectedTrip.phoi_advance_amount ?? 0;
  const phoiRefundedAmount = selectedTrip.phoi_da_hoan ?? selectedTrip.phoi_refunded_amount ?? 0;
  const phoiDueDate = selectedTrip.phoi_ngay_hen_hoan || selectedTrip.phoi_due_date || null;
  const phoiStatus = selectedTrip.phoi_trang_thai || (phoiAdvanceAmount > 0 ? (phoiRefundedAmount >= phoiAdvanceAmount ? 'DA_HOAN' : phoiRefundedAmount > 0 ? 'HOAN_MOT_PHAN' : 'CHUA_HOAN') : 'KHONG_PHAT_SINH');

  const fin = computeTripFinancials({
    base_revenue: baseRevenue,
    lift_on_fee: liftOnFee,
    lift_off_fee: liftOffFee,
    port_fee: selectedTrip.port_fee || 0,
    fuel_liters: fuelLiters,
    fuel_unit_price: fuelUnitPrice,
    fuel_cost: selectedTrip.tien_dau ?? selectedTrip.fuel_cost ?? null,
    toll_fee: selectedTrip.tien_duong ?? selectedTrip.toll_fee ?? 0,
    subcontractor_cost: selectedTrip.cuoc_ra ?? selectedTrip.subcontractor_cost ?? 0,
    other_costs: selectedTrip.phat_sinh ?? selectedTrip.other_costs ?? 0,
    phoi_advance_amount: phoiAdvanceAmount,
    phoi_refunded_amount: phoiRefundedAmount
  });

  const isMergedGroup = selectedTrip.is_merged_group || Boolean(selectedTrip.group_id);
  const groupId = selectedTrip.group_id || 'Chung';
  const pendingAllocation = isMergedGroup && selectedTrip.allocation_status !== 'MANUAL';

  return (
    <div
      id="trip-detail-drawer"
      role="dialog"
      aria-modal="true"
      aria-label={'Chi tiết cuốc xe ' + tripCode}
      className="fixed inset-0 z-50 overflow-hidden"
    >
      <div
        className="fixed inset-0 bg-slate-900/50 backdrop-blur-2xs transition-opacity"
        onClick={onClose}
      />

      <div
        ref={dialogRef}
        className="fixed inset-y-0 right-0 w-full max-w-2xl h-full shadow-2xl flex flex-col border-l border-slate-200 z-10 bg-white"
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-200 flex items-center justify-between bg-slate-900 text-white">
          <div className="flex items-center space-x-2">
            <button
              onClick={onPrev}
              disabled={!hasPrev}
              className="p-1.5 rounded-lg border border-slate-700 hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed text-slate-200 transition-colors"
              title="Cuốc trước (Phím [)"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={onNext}
              disabled={!hasNext}
              className="p-1.5 rounded-lg border border-slate-700 hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed text-slate-200 transition-colors"
              title="Cuốc tiếp theo (Phím ])"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <div className="pl-1">
              <div className="flex items-center space-x-2">
                <h3 className="font-mono font-bold text-white text-sm sm:text-base">{tripCode}</h3>
                <span className="text-[11px] text-slate-300 font-normal">• Ngày chạy: {tripDate}</span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Dòng nguồn #{selectedTrip.row_index || selectedTrip.stt || selectedTrip.id} •{' '}
                {selectedTrip.area_id === 'TUAN' ? 'Khu Tuân (Xe nhà)' : 'Toàn công ty'}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {isMergedGroup && (
              <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-indigo-500/30 text-indigo-200 border border-indigo-400/40">
                Ô gộp {groupId}
              </span>
            )}
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
              title="Đóng (Escape)"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Thân Drawer */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 text-xs">
          {isMergedGroup && (
            <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-xl space-y-1 text-indigo-900">
              <div className="flex items-center gap-2 font-bold text-xs">
                <Layers className="w-4 h-4 text-indigo-600" />
                <span>Cuốc xe thuộc nhóm hành trình dùng chung chi phí (Ô gộp {groupId})</span>
              </div>
              <p className="text-[11px] text-indigo-800">
                Khoản chi chung của nhóm chưa tự động chia vào từng cuốc lẻ; chênh lệch được kết luận ở cấp nhóm.
              </p>
            </div>
          )}

          {/* 7 CHỈ TIÊU TÀI CHÍNH CHUYẾN (Mục 3.A) */}
          <div className="p-3.5 rounded-xl bg-slate-900 text-white space-y-3 shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-700 pb-2">
              <span className="font-bold text-amber-300 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                <Coins className="w-3.5 h-3.5" />
                <span>7 Chỉ Tiêu Tài Chính Chuyến (Chuẩn Hóa Cước Gốc Chưa VAT • VAT 8% • Trừ 17%)</span>
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <div className="p-2.5 bg-slate-800 rounded-lg border border-slate-700">
                <span className="text-[10px] text-slate-400 block">1. Cước vào chưa VAT</span>
                <span className="text-sm font-bold font-mono text-white block mt-0.5">
                  {formatVnd(fin.cuoc_goc)}
                </span>
              </div>

              <div className="p-2.5 bg-slate-800 rounded-lg border border-slate-700">
                <span className="text-[10px] text-slate-400 block">2. VAT 8%</span>
                <span className="text-sm font-bold font-mono text-teal-300 block mt-0.5">
                  +{formatVnd(fin.vat_amount)}
                </span>
              </div>

              <div className="p-2.5 bg-slate-800 rounded-lg border border-emerald-600/60">
                <span className="text-[10px] text-emerald-300 font-semibold block">3. Cước vào có VAT (×1,08)</span>
                <span className="text-sm font-extrabold font-mono text-emerald-400 block mt-0.5">
                  {formatVnd(fin.cuoc_co_vat)}
                </span>
              </div>

              <div className="p-2.5 bg-slate-800 rounded-lg border border-amber-600/60">
                <span className="text-[10px] text-amber-300 block">4. Khoản trừ 17% nội bộ</span>
                <span className="text-sm font-bold font-mono text-amber-300 block mt-0.5">
                  −{formatVnd(fin.khoan_tru_17)}
                </span>
              </div>

              <div className="p-2.5 bg-slate-800 rounded-lg border border-blue-500/60">
                <span className="text-[10px] text-blue-300 font-semibold block">5. Cước sau trừ 17% (×0,83)</span>
                <span className="text-sm font-extrabold font-mono text-blue-300 block mt-0.5">
                  {formatVnd(fin.cuoc_sau_tru_17)}
                </span>
              </div>

              <div className="p-2.5 bg-slate-800 rounded-lg border border-rose-500/60">
                <span className="text-[10px] text-rose-300 block">6. Chi phí Cty đã ghi nhận</span>
                <span className="text-sm font-bold font-mono text-rose-300 block mt-0.5">
                  {formatVnd(fin.chi_phi_cong_ty)}
                </span>
              </div>
            </div>

            {/* Chỉ tiêu thứ 7 */}
            <div className="p-3 bg-amber-500/15 border border-amber-400/60 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <div className="text-xs font-bold text-amber-300">
                  7. Chênh lệch tạm tính sau khoản trừ 17% và chi phí
                </div>
                <div className="text-[10px] text-slate-300 mt-0.5">
                  Chưa trừ lương • Không trừ tiền phơi trả hộ • Đối chiếu trước trừ 17% (Cước gốc − Chi phí):{' '}
                  <strong className="text-white">{formatVnd(fin.chenh_lech_truoc_tru_goc)}</strong>
                </div>
              </div>
              <div className="text-right">
                {pendingAllocation ? (
                  <span className="text-xs font-bold font-mono text-indigo-300">Theo nhóm ô gộp</span>
                ) : (
                  <span
                    className={`text-base sm:text-lg font-extrabold font-mono ${
                      fin.chenh_lech_sau_tru_17 >= 0 ? 'text-amber-300' : 'text-rose-400'
                    }`}
                  >
                    {formatVnd(fin.chenh_lech_sau_tru_17)}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* THÔNG TIN HÀNH TRÌNH & CONTAINER */}
          <div className="p-3.5 rounded-xl border border-slate-200 space-y-2 bg-white shadow-2xs">
            <h4 className="font-bold text-slate-900 uppercase tracking-wider text-[11px]">
              Hành Trình, Phương Tiện & Container
            </h4>
            <div className="grid grid-cols-2 gap-3 pt-1">
              <div>
                <span className="text-slate-500 block text-[11px]">Xe / Lái xe:</span>
                <span className="font-semibold text-slate-800 flex items-center space-x-1 mt-0.5">
                  <Truck className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                  <span>{vehiclePlate}</span>
                  <span className="text-slate-400 font-normal">• {driverName}</span>
                </span>
              </div>

              <div>
                <span className="text-slate-500 block text-[11px]">Khách hàng / Tuyến:</span>
                <span className="font-semibold text-slate-800 block mt-0.5">
                  {customerName} • {routeName}
                </span>
              </div>

              <div>
                <span className="text-slate-500 block text-[11px]">Số Container:</span>
                <span className="font-mono font-bold text-slate-900 block mt-0.5">
                  {selectedTrip.container_number || selectedTrip.so_cont || 'N/A'}
                </span>
              </div>

              <div>
                <span className="text-slate-500 block text-[11px]">Loại Container (Giữ nguyên nguồn):</span>
                <span className="font-mono font-bold text-indigo-700 block mt-0.5">
                  {selectedTrip.loai_cont || selectedTrip.container_size || 'Theo bảng kê'}
                </span>
              </div>
            </div>
          </div>

          {/* CHI TIẾT CHI PHÍ CÔNG TY CHỊU (NÂNG, HẠ, DẦU THEO NGÀY, ĐƯỜNG, CƯỚC RA) */}
          <div className="p-3.5 rounded-xl border border-slate-200 space-y-2.5 bg-white shadow-2xs">
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-slate-900 uppercase tracking-wider text-[11px]">
                Chi Phí Công Ty Chịu (Nâng • Hạ • Dầu Ngày Chạy • Đường • Thuê Ngoài)
              </h4>
              <span className="text-[11px] font-bold text-rose-700">
                Tổng: {formatVnd(fin.chi_phi_cong_ty)}
              </span>
            </div>

            <div className="divide-y divide-slate-100">
              {/* Phí nâng */}
              <div className="py-2 flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <ArrowUpCircle className="w-3.5 h-3.5 text-indigo-600" />
                  <div>
                    <span className="font-semibold text-slate-800">1. Nâng container (Công ty chịu)</span>
                    <span className="text-[10px] text-slate-500 block">
                      Nơi nâng: <strong>{liftOnLocation || 'Chưa ghi nhận địa điểm'}</strong>
                    </span>
                  </div>
                </div>
                <span className="font-mono font-bold text-indigo-900">{formatVnd(fin.phi_nang)}</span>
              </div>

              {/* Phí hạ */}
              <div className="py-2 flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <ArrowDownCircle className="w-3.5 h-3.5 text-indigo-600" />
                  <div>
                    <span className="font-semibold text-slate-800">2. Hạ container (Công ty chịu)</span>
                    <span className="text-[10px] text-slate-500 block">
                      Nơi hạ: <strong>{liftOffLocation || 'Chưa ghi nhận địa điểm'}</strong>
                    </span>
                  </div>
                </div>
                <span className="font-mono font-bold text-indigo-900">{formatVnd(fin.phi_ha)}</span>
              </div>

              {/* Tiền dầu */}
              <div className="py-2 flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Droplet className="w-3.5 h-3.5 text-sky-600" />
                  <div>
                    <span className="font-semibold text-slate-800">
                      3. Dầu cấp ({fin.dau_lit} Lít) × Giá ngày chạy ({tripDate})
                    </span>
                    <span className="text-[10px] text-slate-500 block">
                      {fin.don_gia_dau
                        ? `Đơn giá ngày ${tripDate}: ${formatVnd(fin.don_gia_dau)}/lít`
                        : fin.dau_lit > 0
                        ? '⚠️ Chưa nhập giá dầu cho ngày chạy này'
                        : 'Không cấp dầu'}
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  <span className="font-mono font-bold text-sky-800 block">{formatVnd(fin.tien_dau)}</span>
                  {fin.is_fuel_price_missing && (
                    <span className="text-[10px] text-amber-700 font-semibold">Chưa nhập giá dầu</span>
                  )}
                </div>
              </div>

              {/* Tiền đường */}
              <div className="py-2 flex items-center justify-between">
                <div>
                  <span className="font-semibold text-slate-800">4. Tiền đường / Cầu phà BOT</span>
                  {selectedTrip.tien_duong_note && (
                    <span className="text-[10px] text-slate-500 block">Ghi chú: {selectedTrip.tien_duong_note}</span>
                  )}
                </div>
                <span className="font-mono font-semibold text-slate-900">{formatVnd(fin.tien_duong)}</span>
              </div>

              {/* Cước thuê ngoài */}
              <div className="py-2 flex items-center justify-between">
                <div>
                  <span className="font-semibold text-slate-800">5. Cước thuê ngoài (Cước ra)</span>
                  {isMergedGroup && (
                    <span className="ml-2 text-[10px] text-indigo-800 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-200">
                      Ô gộp nhóm
                    </span>
                  )}
                </div>
                <span className="font-mono font-semibold text-slate-900">{formatVnd(fin.cuoc_thue_ngoai)}</span>
              </div>

              {/* Phát sinh khác */}
              <div className="py-2 flex items-center justify-between">
                <div>
                  <span className="font-semibold text-slate-800">6. Chi phí phát sinh khác</span>
                  {selectedTrip.ghi_chu_phat_sinh && (
                    <span className="text-[10px] text-slate-500 block">Lý do: {selectedTrip.ghi_chu_phat_sinh}</span>
                  )}
                </div>
                <span className="font-mono font-semibold text-slate-900">{formatVnd(fin.chi_phi_khac)}</span>
              </div>
            </div>
          </div>

          {/* TIỀN PHƠI TRẢ HỘ CHỦ HÀNG & HOÀN TIỀN PHƠI (Mục 7, 8, 9) */}
          <div className="p-3.5 rounded-xl border border-purple-200 bg-purple-50/60 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h4 className="font-bold text-purple-950 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-purple-600" />
                  <span>Tiền Phơi Trả Hộ Chủ Hàng (Tách Riêng Khỏi Doanh Thu & Lãi Chuyến)</span>
                </h4>
                <p className="text-[10px] text-purple-700 mt-0.5">
                  Thanh toán tiền cước không tự động tất toán tiền phơi trả hộ.
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  setPhoiModalMode(phoiAdvanceAmount > 0 ? 'REFUND' : 'CREATE');
                  setPhoiModalOpen(true);
                }}
                className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-xs font-bold shadow-2xs flex items-center gap-1 cursor-pointer"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>
                  {phoiAdvanceAmount > 0
                    ? fin.phoi_con_phai_thu > 0
                      ? 'Thu Hoàn Phơi / Đổi Ngày Hẹn'
                      : 'Xem Lịch Sử Hoàn Phơi'
                    : '+ Ghi Nhận Tiền Phơi Trả Hộ'}
                </span>
              </button>
            </div>

            {phoiAdvanceAmount > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-center">
                <div className="p-2 bg-white rounded-lg border border-purple-200">
                  <span className="text-[10px] text-slate-500 block">Đã trả hộ</span>
                  <span className="font-mono font-bold text-purple-950">{formatVnd(fin.phoi_tra_ho)}</span>
                </div>
                <div className="p-2 bg-white rounded-lg border border-purple-200">
                  <span className="text-[10px] text-slate-500 block">Chủ hàng đã hoàn</span>
                  <span className="font-mono font-bold text-emerald-700">{formatVnd(fin.phoi_da_hoan)}</span>
                </div>
                <div className="p-2 bg-white rounded-lg border border-purple-200">
                  <span className="text-[10px] text-slate-500 block">Còn phải thu</span>
                  <span className="font-mono font-bold text-rose-700">{formatVnd(fin.phoi_con_phai_thu)}</span>
                </div>
                <div className="p-2 bg-white rounded-lg border border-purple-200">
                  <span className="text-[10px] text-slate-500 block">Trạng thái / Ngày hẹn</span>
                  <span className="font-bold text-purple-900 block">
                    {phoiStatus === 'DA_HOAN'
                      ? '✓ Đã hoàn đủ'
                      : phoiStatus === 'HOAN_MOT_PHAN'
                      ? `Hoàn 1 phần (${phoiDueDate || 'Chưa hẹn'})`
                      : phoiDueDate
                      ? `Hẹn: ${phoiDueDate}`
                      : 'Chưa đặt ngày nhắc'}
                  </span>
                </div>
              </div>
            ) : (
              <div className="text-[11px] text-purple-800 bg-white/80 p-2.5 rounded-lg border border-purple-100">
                Chuyến xe này chưa phát sinh khoản tiền phơi trả hộ. Bấm <b>&quot;+ Ghi Nhận Tiền Phơi Trả Hộ&quot;</b> nếu cần theo dõi hoàn tiền phơi.
              </div>
            )}
          </div>

          {/* GHI CHÚ ĐỐI SOÁT & TRẠNG THÁI THANH TOÁN CƯỚC */}
          <div className="p-3.5 rounded-xl border border-slate-200 space-y-2 bg-slate-50/70 text-[11px]">
            <h4 className="font-bold text-slate-800 uppercase tracking-wider">
              Trạng Thái Thanh Toán Cước & Ghi Chú Nguồn
            </h4>
            <div className="space-y-1.5 text-slate-600">
              <div className="flex items-center gap-2">
                <span>• Thanh toán tiền cước:</span>
                <span className="font-semibold text-slate-800">
                  {selectedTrip.da_tra_khach ? 'Đã thanh toán cước (X / TƯƠI)' : 'Còn nợ tiền cước'}
                </span>
              </div>
              {selectedTrip.ghi_chu_khach && (
                <div className="text-indigo-800 bg-indigo-50/60 p-2 rounded border border-indigo-100">
                  • Ghi chú khách (Cột R): <b>&quot;{selectedTrip.ghi_chu_khach}&quot;</b>
                </div>
              )}
              {selectedTrip.ghi_chu_nha_xe && (
                <div className="text-slate-700">
                  • Ghi chú nhà xe: <b>&quot;{selectedTrip.ghi_chu_nha_xe}&quot;</b>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-3 sm:p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-xs">
          <span className="text-slate-400 text-[11px]">Nhấn <b>Escape</b> để đóng ngăn kéo</span>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-lg shadow-xs transition-colors"
          >
            Đóng Chi Tiết
          </button>
        </div>
      </div>

      {/* Modal Hoàn Tiền Phơi / Đặt Ngày Hẹn Hoàn */}
      <PhoiRefundModal
        isOpen={phoiModalOpen}
        onClose={() => setPhoiModalOpen(false)}
        trip={selectedTrip}
        initialMode={phoiModalMode}
        onSuccess={() => {
          if (onTripUpdated) onTripUpdated();
        }}
      />
    </div>
  );
}
