import React, { useEffect, useRef } from 'react';
import {
  X,
  ChevronLeft,
  ChevronRight,
  Calendar,
  Truck,
  Layers,
  MapPin,
  Building,
  CheckCircle,
  Clock,
  AlertTriangle,
  FileText,
  Info,
  Droplet
} from 'lucide-react';
import { formatVnd } from '../data/unifiedBusinessData';

export default function TripDetailDrawer({
  selectedTrip,
  onClose,
  onPrev,
  onNext,
  hasPrev,
  hasNext,
  onCreateTask
}) {
  const dialogRef = useRef(null);
  const handlers = useRef({ onClose, onPrev, onNext, hasPrev, hasNext });
  handlers.current = { onClose, onPrev, onNext, hasPrev, hasNext };
  const open = Boolean(selectedTrip);

  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialogRef.current?.querySelector('button:not(:disabled)')?.focus();
    const handleKeyDown = e => {
      if (e.key === 'Escape') { e.preventDefault(); handlers.current.onClose(); }
      if (['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName)) return;
      if(e.key === '[' && handlers.current.hasPrev) handlers.current.onPrev();
      if(e.key === ']' && handlers.current.hasNext) handlers.current.onNext();
      if(e.key !== 'Tab') return;
      const buttons = [...dialogRef.current.querySelectorAll('button:not(:disabled), input, select, textarea, a[href], [tabindex="0"]')];
      const first = buttons[0], last = buttons.at(-1);
      if(e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
      else if(!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
    };
    window.addEventListener('keydown',handleKeyDown);
    return () => { document.body.style.overflow = previousOverflow; window.removeEventListener('keydown',handleKeyDown); if(previousFocus?.isConnected) previousFocus.focus(); };
  }, [open]);

  if (!selectedTrip) return null;

  // Chuẩn hóa dữ liệu đọc từ cả hai nguồn (Excel tháng 1 và Mock)
  const tripCode = selectedTrip.trip_code || `TRIP-${selectedTrip.id}`;
  const tripDate = selectedTrip.trip_date || selectedTrip.raw_date || 'N/A';
  const driverName = selectedTrip.lai_xe || selectedTrip.driver_name || 'Xe ngoài điều phối';
  const vehiclePlate = selectedTrip.so_xe || selectedTrip.vehicle_plate || 'Thuê ngoài';
  const customerName = selectedTrip.ten_khach || selectedTrip.customer_name || 'Khách hàng';
  const routeName = selectedTrip.tuyen_duong || selectedTrip.route_name || 'Tuyến vận chuyển';
  
  const revenue = selectedTrip.cuoc_vao !== undefined 
    ? selectedTrip.cuoc_vao 
    : (selectedTrip.revenue_pre_tax || 0);

  const directCost = selectedTrip.direct_cost ?? ((selectedTrip.tien_duong || 0) + (selectedTrip.cuoc_ra || 0) + (selectedTrip.phat_sinh || 0));
  const tripProfit = selectedTrip.trip_profit !== undefined ? selectedTrip.trip_profit : revenue - directCost;

  const fuelLiters = selectedTrip.dau_liters || selectedTrip.dau_lit || 0;
  const isMergedGroup = selectedTrip.is_merged_group || Boolean(selectedTrip.group_id);
  const groupId = selectedTrip.group_id || 'Chung';
  const pendingAllocation=isMergedGroup&&selectedTrip.allocation_status!=='MANUAL';

  return (
    <div id="trip-detail-drawer" role="dialog" aria-modal="true" aria-label={"Chi tiết cuốc xe " + tripCode} className="fixed inset-0 z-50 overflow-hidden">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/50 backdrop-blur-2xs transition-opacity"
        onClick={onClose}
      />

      {/* Drawer bên phải */}
      <div
        ref={dialogRef} className="fixed inset-y-0 right-0 w-full max-w-xl h-full shadow-2xl flex flex-col border-l border-slate-200 z-10 bg-white"
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center space-x-2">
            <button
              onClick={onPrev}
              disabled={!hasPrev}
              className="p-1.5 rounded-lg border border-slate-300 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed text-slate-700 transition-colors"
              title="Cuốc trước (Phím [)"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={onNext}
              disabled={!hasNext}
              className="p-1.5 rounded-lg border border-slate-300 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed text-slate-700 transition-colors"
              title="Cuốc tiếp theo (Phím ])"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <div className="pl-1">
              <div className="flex items-center space-x-2">
                <h3 className="font-mono font-bold text-slate-900 text-sm sm:text-base">
                  {tripCode}
                </h3>
                <span className="text-[11px] text-slate-500 font-normal">
                  • {tripDate}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Dòng bảng kê #{selectedTrip.row_index || selectedTrip.id} • {selectedTrip.area_id === 'TUAN' ? 'Khu Tuân' : 'Toàn công ty'}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {isMergedGroup && (
              <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-indigo-100 text-indigo-800">
                Ô gộp {groupId}
              </span>
            )}
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-500 hover:text-slate-800 transition-colors"
              title="Đóng (Escape)"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Thân Drawer cuộn độc lập */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-5 text-xs">
          {/* CẢNH BÁO Ô GỘP DÙNG CHUNG CHI PHÍ */}
          {isMergedGroup && (
            <div className="p-3.5 bg-indigo-50 border border-indigo-200 rounded-xl space-y-1.5 text-indigo-900">
              <div className="flex items-center gap-2 font-bold text-xs">
                <Layers className="w-4 h-4 text-indigo-600" />
                <span>Cuốc xe thuộc nhóm hành trình dùng chung chi phí (Ô gộp)</span>
              </div>
              <p className="text-[11px] text-indigo-800 leading-relaxed">
                Cuốc xe này dùng chung cước ra với cuốc cùng nhóm. Để tính chính xác lãi riêng từng cuốc, cần duyệt phương án phân bổ theo tỷ trọng cước vào hoặc phân bổ thủ công.
              </p>
            </div>
          )}

          {/* 3 CON SỐ CỐT LÕI */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 grid grid-cols-3 gap-2 text-center">
            <div className="p-2 bg-white rounded-lg border border-slate-200 shadow-2xs">
              <span className="text-[11px] text-slate-500 block">Cước Vào</span>
              <span className="text-sm sm:text-base font-bold font-mono text-slate-900 block mt-0.5">
                {formatVnd(revenue)}
              </span>
              <span className="text-[10px] text-indigo-600 font-medium">Có VAT</span>
            </div>

            <div className="p-2 bg-white rounded-lg border border-slate-200 shadow-2xs">
              <span className="text-[11px] text-slate-500 block">Chi Phí Đã Biết</span>
              <span className="text-sm sm:text-base font-bold font-mono text-slate-700 block mt-0.5">
                {formatVnd(directCost)}
              </span>
              <span className="text-[10px] text-slate-400">Tiền đường, cước ra và phát sinh</span>
            </div>

            <div className="p-2 bg-white rounded-lg border border-slate-200 shadow-2xs">
              <span className="text-[11px] text-slate-500 block">
                {pendingAllocation ? 'Chênh Lệch Cấp Nhóm' : 'Lãi Tạm Tính'}
              </span>
              {pendingAllocation ? (
                <div className="mt-0.5">
                  <span className="text-xs sm:text-sm font-bold font-mono text-indigo-700 block">
                    Theo nhóm ô gộp
                  </span>
                  <span className="text-[10px] text-slate-500 block mt-0.5">
                    Chưa phân bổ riêng
                  </span>
                </div>
              ) : (
                <div className="mt-0.5">
                  <span
                    className={`text-sm sm:text-base font-bold font-mono block ${
                      tripProfit < 0 ? 'text-rose-700' : 'text-emerald-800'
                    }`}
                  >
                    {tripProfit === null ? 'Chưa đủ cơ sở' : formatVnd(tripProfit)}
                  </span>
                  <span className="text-[10px] text-slate-500 block">
                    Chưa trừ lương và tiền dầu
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* THÔNG TIN HÀNH TRÌNH & ĐỐI TƯỢNG */}
          <div className="p-3.5 rounded-xl border border-slate-200 space-y-2 bg-white shadow-2xs">
            <h4 className="font-bold text-slate-900 uppercase tracking-wider text-[11px]">
              Hành Trình & Phương Tiện
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
                <span className="font-mono font-medium text-slate-800 block mt-0.5">
                  {selectedTrip.container_number || selectedTrip.so_cont || 'N/A'}
                </span>
              </div>

              <div>
                <span className="text-slate-500 block text-[11px]">Loại Container:</span>
                <span className="text-slate-700 block mt-0.5">
                  {selectedTrip.loai_cont || selectedTrip.container_size || 'Theo bảng kê'}
                </span>
              </div>
            </div>
          </div>

          {/* BÓC TÁCH CHI PHÍ TRỰC TIẾP & LƯỢNG CẤP DẦU */}
          <div className="p-3.5 rounded-xl border border-slate-200 space-y-2.5 bg-white shadow-2xs">
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-slate-900 uppercase tracking-wider text-[11px]">
                Chi Tiết Chi Phí & Nhiên Liệu
              </h4>
              <span className="text-[11px] text-slate-500">
                Cước ra: <b>{formatVnd(selectedTrip.cuoc_ra || 0)}</b>
              </span>
            </div>

            <div className="divide-y divide-slate-100">
              {/* Cước ra thuê ngoài hoặc chi phí xe */}
              <div className="py-2 flex items-center justify-between">
                <div>
                  <span className="font-semibold text-slate-800">1. Cước ra (Chi phí thuê ngoài / vận chuyển)</span>
                  {selectedTrip.is_merged_group && (
                    <span className="ml-2 text-[10px] text-indigo-800 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-200">
                      Ô gộp nhóm
                    </span>
                  )}
                </div>
                <span className="font-mono font-semibold text-slate-900">
                  {formatVnd(selectedTrip.cuoc_ra || 0)}
                </span>
              </div>

              {/* Vé cầu đường BOT */}
              <div className="py-2 flex items-center justify-between">
                <div>
                  <span className="font-semibold text-slate-800">2. Vé cầu đường BOT</span>
                  {selectedTrip.tien_duong_note && (
                    <span className="text-[10px] text-slate-500 block">
                      Ghi chú: {selectedTrip.tien_duong_note}
                    </span>
                  )}
                </div>
                <span className="font-mono font-semibold text-slate-900">
                  {formatVnd(selectedTrip.tien_duong || 0)}
                </span>
              </div>

              {/* Lượng dầu cấp theo Lít */}
              <div className="py-2 flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Droplet className="w-3.5 h-3.5 text-amber-600" />
                  <span className="font-semibold text-slate-800">3. Lượng cấp nhiên liệu (Dầu DO)</span>
                </div>
                <div className="text-right">
                  <span className="font-mono font-bold text-amber-700 block">
                    {fuelLiters > 0 ? `${fuelLiters} Lít` : '0 Lít'}
                  </span>
                  <span className="text-[10px] text-slate-400">
                    Theo dõi lượng cấp, chưa áp đơn giá
                  </span>
                </div>
              </div>

              {/* Khoản phát sinh */}
              <div className="py-2 flex items-center justify-between">
                <div>
                  <span className="font-semibold text-slate-800">4. Chi phí phát sinh tại bãi / đường</span>
                  {selectedTrip.ghi_chu_phat_sinh && (
                    <span className="text-[10px] text-slate-500 block">
                      Lý do: {selectedTrip.ghi_chu_phat_sinh}
                    </span>
                  )}
                </div>
                <span className="font-mono font-semibold text-slate-900">
                  {formatVnd(selectedTrip.phat_sinh || 0)}
                </span>
              </div>
            </div>
          </div>

          {/* GHI CHÚ ĐỐI SOÁT & TRẠNG THÁI THANH TOÁN */}
          <div className="p-3.5 rounded-xl border border-slate-200 space-y-2 bg-slate-50/70 text-[11px]">
            <h4 className="font-bold text-slate-800 uppercase tracking-wider">
              Ghi Chú Nghiệp Vụ & Đối Soát
            </h4>
            <div className="space-y-1.5 text-slate-600">
              <div className="flex items-center gap-2">
                <span>• Thanh toán khách hàng:</span>
                <span className="font-semibold text-slate-800">
                  {selectedTrip.da_tra_khach ? 'Đã thanh toán (X / TƯƠI)' : 'Còn nợ (Phải thu)'}
                </span>
              </div>
              {selectedTrip.ghi_chu_khach && (
                <div className="text-indigo-800 bg-indigo-50/60 p-2 rounded border border-indigo-100">
                  • Ghi chú khách: <b>"{selectedTrip.ghi_chu_khach}"</b>
                </div>
              )}
              {selectedTrip.ghi_chu_nha_xe && (
                <div className="text-slate-700">
                  • Ghi chú nhà xe: <b>"{selectedTrip.ghi_chu_nha_xe}"</b>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-3 sm:p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-xs">
          <span className="text-slate-400 text-[11px]">
            Nhấn <b>Escape</b> để đóng ngăn kéo
          </span>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-lg shadow-xs transition-colors"
          >
            Đóng Chi Tiết
          </button>
        </div>
      </div>
    </div>
  );
}
