import React, { useState, useMemo, useRef } from 'react';
import {
  Calendar,
  Printer,
  BarChart3,
  Table2,
  LayoutGrid,
  Eye,
  Filter,
  CheckCircle2,
  Truck,
  Building2,
  Coins,
  Fuel,
  X,
  FileText,
  ArrowUpRight,
  Check
} from 'lucide-react';
import { formatVnd, formatTrieuDong } from '../data/unifiedBusinessData';
import {
  computeTripFinancials,
  computeAggregateMetrics,
  getTripAccountingMonth
} from '../utils/tripFinancials.js';

const MONTHS_2026 = Array.from({ length: 12 }, (_, idx) => {
  const m = String(idx + 1).padStart(2, '0');
  return {
    index: idx + 1,
    monthCode: m,
    filterKey: `month_${m}`,
    ym: `2026-${m}`,
    label: `Tháng ${m}/2026`,
    shortLabel: `T${idx + 1}`
  };
});

export default function MonthlyBusinessReportSection({
  tripsData = [],
  scopeFilter = 'ALL',
  dateFilter = 'all',
  onSelectDateFilter,
  onOpenDrawer,
  printModalOpen = false,
  onOpenPrintModal,
  onClosePrintModal
}) {
  // Chế độ hiển thị trên trang: 'ALL' (Biểu đồ + Bảng) | 'TABLE' (Chỉ bảng) | 'CARDS' (Thẻ từng tháng)
  const [viewMode, setViewMode] = useState('ALL');
  // Ẩn/hiện các tháng chưa phát sinh dữ liệu (0 cuốc)
  const [hideEmptyMonths, setHideEmptyMonths] = useState(false);

  // Cấu hình bản in trong Modal In Báo Cáo
  const [printPeriod, setPrintPeriod] = useState('all'); // 'all' | 'month_01' .. 'month_12'
  const [printIncludeChart, setPrintIncludeChart] = useState(true);
  const [printIncludeMonthlyTable, setPrintIncludeMonthlyTable] = useState(true);
  const [printIncludeFleetTable, setPrintIncludeFleetTable] = useState(true);
  const [printIncludeTripDetails, setPrintIncludeTripDetails] = useState(false);

  const printAreaRef = useRef(null);

  // Tập chuyến đã lọc theo Scope (Toàn công ty / Đội xe nhà / Xe thuê ngoài)
  const scopeFilteredTrips = useMemo(() => {
    return tripsData.filter((t) => {
      if (scopeFilter === 'XE_NHA') return !t.is_subcontractor;
      if (scopeFilter === 'THUE_NGOAI') return t.is_subcontractor;
      return true;
    });
  }, [tripsData, scopeFilter]);

  // Tính toán đầy đủ thông số cho từng tháng 1 -> 12 và cả năm
  const monthlyReports = useMemo(() => {
    return MONTHS_2026.map((mInfo) => {
      const monthTrips = scopeFilteredTrips.filter(
        (t) => getTripAccountingMonth(t) === mInfo.ym
      );
      const allScopeMonthTrips = tripsData.filter(
        (t) => getTripAccountingMonth(t) === mInfo.ym
      );
      const metrics = computeAggregateMetrics(monthTrips);
      const marginRate =
        metrics.totalCuocSauTru17 > 0
          ? Math.round((metrics.totalChenhLechSauTru17 / metrics.totalCuocSauTru17) * 1000) / 10
          : 0;

      return {
        ...mInfo,
        trips: monthTrips,
        allScopeCount: allScopeMonthTrips.length,
        metrics,
        marginRate,
        hasData: monthTrips.length > 0
      };
    });
  }, [scopeFilteredTrips, tripsData]);

  // Tổng hợp cả năm 2026 theo đúng scope đang chọn
  const yearlyMetrics = useMemo(() => {
    const metrics = computeAggregateMetrics(scopeFilteredTrips);
    const marginRate =
      metrics.totalCuocSauTru17 > 0
        ? Math.round((metrics.totalChenhLechSauTru17 / metrics.totalCuocSauTru17) * 1000) / 10
        : 0;
    const activeMonthsCount = monthlyReports.filter((m) => m.hasData).length || 1;
    return {
      ...metrics,
      marginRate,
      activeMonthsCount
    };
  }, [scopeFilteredTrips, monthlyReports]);

  // Danh sách các tháng hiển thị trên bảng theo bộ lọc hideEmptyMonths
  const visibleMonthlyReports = useMemo(() => {
    if (!hideEmptyMonths) return monthlyReports;
    return monthlyReports.filter((m) => m.hasData);
  }, [monthlyReports, hideEmptyMonths]);

  // Giá trị lớn nhất để vẽ tỷ lệ chiều cao cột biểu đồ
  const maxChartValue = useMemo(() => {
    let maxVal = 1;
    monthlyReports.forEach((m) => {
      if (m.metrics.totalCuocSauTru17 > maxVal) maxVal = m.metrics.totalCuocSauTru17;
      if (m.metrics.totalCuocCoVat > maxVal) maxVal = m.metrics.totalCuocCoVat;
    });
    return maxVal;
  }, [monthlyReports]);

  // Dữ liệu phục vụ Modal Bản In theo printPeriod đã chọn
  const printTargetData = useMemo(() => {
    const isSingleMonth = printPeriod.startsWith('month_');
    const targetMonthReport = isSingleMonth
      ? monthlyReports.find((m) => m.filterKey === printPeriod)
      : null;

    const targetTrips = isSingleMonth && targetMonthReport
      ? targetMonthReport.trips
      : scopeFilteredTrips;

    const targetMetrics = isSingleMonth && targetMonthReport
      ? targetMonthReport.metrics
      : yearlyMetrics;

    const periodTitle = isSingleMonth && targetMonthReport
      ? `${targetMonthReport.label}`
      : 'CẢ NĂM 2026 (THÁNG 01 – THÁNG 12/2026)';

    // Thống kê đội xe nhà trong kỳ in
    const platesSet = new Set();
    targetTrips
      .filter((t) => !t.is_subcontractor)
      .forEach((t) => {
        const p = t.vehicle_plate || t.so_xe;
        if (p && p !== 'Xe ngoài' && p !== 'ĐÃ TT' && p !== 'MẸ ĐÃ TT') {
          platesSet.add(p);
        }
      });
    const fleetRows = Array.from(platesSet)
      .sort()
      .map((plate) => {
        const pTrips = targetTrips.filter(
          (t) => !t.is_subcontractor && (t.vehicle_plate === plate || t.so_xe === plate)
        );
        return {
          plate,
          ...computeAggregateMetrics(pTrips)
        };
      });

    // Thống kê đối tác thuê ngoài trong kỳ in
    const subMap = new Map();
    targetTrips
      .filter((t) => t.is_subcontractor)
      .forEach((t) => {
        let name = t.subcontractor_name || t.vehicle_plate || 'Xe ngoài';
        if (name === 'ĐÃ TT' || name === 'MẸ ĐÃ TT') name = t.vehicle_plate || 'Xe ngoài';
        if (!subMap.has(name)) subMap.set(name, []);
        subMap.get(name).push(t);
      });
    const subRows = Array.from(subMap.entries())
      .map(([name, sTrips]) => ({
        name,
        ...computeAggregateMetrics(sTrips)
      }))
      .sort((a, b) => b.totalCuocRa - a.totalCuocRa);

    return {
      isSingleMonth,
      targetMonthReport,
      targetTrips,
      targetMetrics,
      periodTitle,
      fleetRows,
      subRows
    };
  }, [printPeriod, monthlyReports, scopeFilteredTrips, yearlyMetrics]);

  // Mở modal in với kỳ mong muốn
  const handleOpenPrintForPeriod = (periodKey = 'all', withTripDetails = false) => {
    setPrintPeriod(periodKey);
    setPrintIncludeTripDetails(withTripDetails);
    onOpenPrintModal?.();
  };

  // Thực thi lệnh in trực quan (hỗ trợ cả cửa sổ in chuẩn A4 Landscape và fallback @media print cho iPhone/Messenger)
  const handleExecutePrint = () => {
    if (!printAreaRef.current) {
      window.print();
      return;
    }

    const contentHtml = printAreaRef.current.innerHTML;
    const printStyles = `
      @page { size: A4 landscape; margin: 8mm 10mm; }
      * { box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
      body {
        font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, Arial, sans-serif;
        color: #0f172a;
        background: #ffffff;
        margin: 0;
        padding: 0;
        font-size: 11px;
        line-height: 1.4;
      }
      table { width: 100%; border-collapse: collapse; margin-top: 6px; margin-bottom: 12px; font-size: 10px; }
      th, td { border: 1px solid #cbd5e1; padding: 5px 6px; }
      th { background-color: #f1f5f9 !important; font-weight: 700; color: #1e293b; text-align: center; }
      tfoot tr { background-color: #f8fafc !important; font-weight: 700; }
      .text-right { text-align: right; }
      .text-center { text-align: center; }
      .text-left { text-align: left; }
      .font-mono { font-variant-numeric: tabular-nums; }
      .font-bold { font-weight: 700; }
      .font-semibold { font-weight: 600; }
      .text-blue-700, .text-blue-800 { color: #1d4ed8; }
      .text-emerald-700, .text-emerald-800 { color: #047857; }
      .text-amber-800 { color: #92400e; }
      .text-rose-700 { color: #be123c; }
      .bg-slate-50 { background-color: #f8fafc !important; }
      .bg-blue-50\\/40 { background-color: #eff6ff !important; }
      .bg-emerald-50\\/40 { background-color: #ecfdf5 !important; }
      .print-kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 12px; }
      .print-kpi-card { border: 1px solid #cbd5e1; border-radius: 6px; padding: 8px 10px; background: #fff; }
      .print-section-title { font-size: 12px; font-weight: 700; text-transform: uppercase; color: #0f172a; margin: 12px 0 6px 0; padding-bottom: 3px; border-bottom: 2px solid #334155; }
      .print-chart-bars { display: grid; grid-template-columns: repeat(12, 1fr); gap: 6px; align-items: end; height: 120px; padding: 12px 8px 4px; border: 1px solid #cbd5e1; border-radius: 6px; margin-bottom: 12px; }
      .no-print { display: none !important; }
      .page-break-before { page-break-before: always; }
    `;

    try {
      const printWin = window.open('', '_blank', 'width=1200,height=850');
      if (printWin && printWin.document) {
        printWin.document.open();
        printWin.document.write(`
          <!DOCTYPE html>
          <html lang="vi">
          <head>
            <meta charset="utf-8" />
            <title>Báo Cáo Thống Kê Kinh Doanh - ${printTargetData.periodTitle}</title>
            <style>${printStyles}</style>
          </head>
          <body>
            ${contentHtml}
            <script>
              window.onload = function() {
                setTimeout(function() {
                  window.focus();
                  window.print();
                }, 250);
              };
            </script>
          </body>
          </html>
        `);
        printWin.document.close();
        return;
      }
    } catch (_) {
      // Fallback nếu WebView trên điện thoại chặn window.open
    }

    window.print();
  };

  const scopeLabel =
    scopeFilter === 'ALL'
      ? 'Toàn công ty'
      : scopeFilter === 'XE_NHA'
      ? 'Đội xe nhà'
      : 'Xe thuê ngoài';

  return (
    <>
      {/* ============================================================ */}
      {/* THANH CHỌN NHANH 12 THÁNG TRONG NĂM (QUICK MONTH BAR) */}
      {/* ============================================================ */}
      <div
        data-testid="quick-month-selector-bar"
        className="bg-white border border-slate-200 rounded-xl p-3 shadow-2xs space-y-2"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
            <Calendar size={14} className="text-blue-700" />
            <span>Chọn nhanh tháng báo cáo năm 2026:</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() =>
                handleOpenPrintForPeriod(
                  dateFilter.startsWith('month_') ? dateFilter : dateFilter === 'month' ? 'month_01' : 'all',
                  dateFilter.startsWith('month_') || dateFilter === 'month'
                )
              }
              data-testid="btn-open-print-report"
              className="inline-flex items-center gap-1.5 px-3 py-1 bg-blue-700 hover:bg-blue-800 text-white rounded-lg text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
            >
              <Printer size={13} />
              <span>
                In báo cáo {dateFilter.startsWith('month_') ? `Tháng ${parseInt(dateFilter.slice(6), 10)}` : 'Cả năm / Từng tháng'}
              </span>
            </button>
          </div>
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
          <button
            type="button"
            onClick={() => onSelectDateFilter?.('all')}
            data-testid="month-pill-all"
            className={`px-3 py-1.5 rounded-lg text-xs font-bold shrink-0 transition-all cursor-pointer border ${
              dateFilter === 'all'
                ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
            }`}
          >
            Cả năm 2026 ({yearlyMetrics.completedCount} cuốc)
          </button>

          {monthlyReports.map((m) => {
            const isActive =
              dateFilter === m.filterKey || (dateFilter === 'month' && m.monthCode === '01');
            return (
              <button
                key={m.filterKey}
                type="button"
                onClick={() => onSelectDateFilter?.(m.filterKey)}
                data-testid={`month-pill-${m.monthCode}`}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold shrink-0 transition-all cursor-pointer border flex items-center gap-1 ${
                  isActive
                    ? 'bg-blue-700 text-white border-blue-700 shadow-xs font-bold'
                    : m.hasData
                    ? 'bg-white text-slate-800 border-slate-200 hover:border-blue-400 hover:bg-blue-50/40'
                    : 'bg-slate-50/60 text-slate-400 border-slate-200/60 hover:bg-slate-100'
                }`}
                title={`${m.label}: ${m.metrics.completedCount} cuốc • Cước sau trừ 17%: ${formatVnd(
                  m.metrics.totalCuocSauTru17
                )}`}
              >
                <span>Tháng {m.index}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                    isActive
                      ? 'bg-blue-900/60 text-white'
                      : m.hasData
                      ? 'bg-slate-100 text-slate-700 font-bold'
                      : 'bg-slate-100 text-slate-400'
                  }`}
                >
                  {m.metrics.completedCount}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ============================================================ */}
      {/* BÁO CÁO THỐNG KÊ KINH DOANH TỪNG THÁNG TRONG NĂM (T1 - T12) */}
      {/* ============================================================ */}
      <section
        aria-label="Báo cáo thống kê kinh doanh từng tháng trong năm"
        data-testid="monthly-business-report-section"
        className="bg-white rounded-xl border border-slate-200 p-4 space-y-4 shadow-2xs"
      >
        {/* Header khu vực báo cáo 12 tháng */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-slate-200 pb-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <BarChart3 size={18} className="text-blue-700" />
                <span>Báo cáo thống kê kinh doanh từng tháng năm 2026 (Tháng 01 – Tháng 12)</span>
              </h2>
              <span className="text-[11px] px-2.5 py-0.5 rounded-full font-bold bg-blue-50 text-blue-800 border border-blue-200">
                Phạm vi: {scopeLabel} ({yearlyMetrics.completedCount} cuốc)
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Tổng hợp đầy đủ tất cả thông số sản lượng, doanh thu cước (gốc, VAT 8%, trừ 17%), chi phí trực tiếp, chênh lệch tạm tính, công nợ và tiền phơi của từng tháng trong năm.
            </p>
          </div>

          {/* Các nút điều khiển chế độ xem & In báo cáo */}
          <div className="flex flex-wrap items-center gap-2 self-start lg:self-auto">
            <label className="inline-flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer select-none bg-slate-50 px-2.5 py-1.5 rounded-lg border border-slate-200">
              <input
                type="checkbox"
                checked={hideEmptyMonths}
                onChange={(e) => setHideEmptyMonths(e.target.checked)}
                className="rounded border-slate-300 text-blue-700 focus:ring-blue-500"
              />
              <span>Ẩn tháng chưa phát sinh</span>
            </label>

            <div className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-0.5 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setViewMode('ALL')}
                className={`px-2.5 py-1 rounded-md flex items-center gap-1 transition-all cursor-pointer ${
                  viewMode === 'ALL'
                    ? 'bg-white text-slate-900 shadow-2xs font-bold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <BarChart3 size={13} />
                <span>Biểu đồ & Bảng</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('TABLE')}
                className={`px-2.5 py-1 rounded-md flex items-center gap-1 transition-all cursor-pointer ${
                  viewMode === 'TABLE'
                    ? 'bg-white text-slate-900 shadow-2xs font-bold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Table2 size={13} />
                <span>Bảng 12 tháng</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('CARDS')}
                className={`px-2.5 py-1 rounded-md flex items-center gap-1 transition-all cursor-pointer ${
                  viewMode === 'CARDS'
                    ? 'bg-white text-slate-900 shadow-2xs font-bold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <LayoutGrid size={13} />
                <span>Thẻ từng tháng</span>
              </button>
            </div>

            <button
              type="button"
              onClick={() => handleOpenPrintForPeriod('all', false)}
              data-testid="btn-print-yearly-summary"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors cursor-pointer"
            >
              <Printer size={14} />
              <span>Xem bản in & In báo cáo</span>
            </button>
          </div>
        </div>

        {/* ============================================================ */}
        {/* PHẦN A: BIỂU ĐỒ TRỰC QUAN 12 THÁNG TRONG NĂM */}
        {/* ============================================================ */}
        {viewMode === 'ALL' && (
          <div className="bg-slate-50/70 border border-slate-200 rounded-xl p-4 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="text-xs font-bold text-slate-800 flex items-center gap-2">
                <span>Biểu đồ trực quan so sánh 12 tháng năm 2026 (Đơn vị: Triệu đồng)</span>
                <span className="text-[11px] font-normal text-slate-500">
                  (Bấm vào cột tháng bất kỳ để lọc chi tiết tháng đó)
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-4 text-[11px] font-semibold">
                <span className="flex items-center gap-1.5 text-blue-800">
                  <span className="w-3 h-3 rounded-xs bg-blue-600 inline-block"></span>
                  <span>Cước sau trừ 17%</span>
                </span>
                <span className="flex items-center gap-1.5 text-amber-800">
                  <span className="w-3 h-3 rounded-xs bg-amber-500 inline-block"></span>
                  <span>Chi phí công ty</span>
                </span>
                <span className="flex items-center gap-1.5 text-emerald-800">
                  <span className="w-3 h-3 rounded-xs bg-emerald-600 inline-block"></span>
                  <span>Chênh lệch tạm tính</span>
                </span>
              </div>
            </div>

            <div className="ha-table-scroll pb-1">
              <div className="min-w-[760px] grid grid-cols-12 gap-2 pt-4 pb-1 px-1">
                {monthlyReports.map((m) => {
                  const isSelected =
                    dateFilter === m.filterKey ||
                    (dateFilter === 'month' && m.monthCode === '01');
                  const revHeight = m.hasData
                    ? Math.max(8, Math.round((m.metrics.totalCuocSauTru17 / maxChartValue) * 120))
                    : 2;
                  const costHeight = m.hasData
                    ? Math.max(
                        4,
                        Math.round((m.metrics.totalChiPhiCongTy / maxChartValue) * 120)
                      )
                    : 2;
                  const profitHeight = m.hasData
                    ? Math.max(
                        6,
                        Math.round(
                          (Math.max(0, m.metrics.totalChenhLechSauTru17) / maxChartValue) * 120
                        )
                      )
                    : 2;

                  return (
                    <div
                      key={m.filterKey}
                      onClick={() => onSelectDateFilter?.(m.filterKey)}
                      className={`flex flex-col items-center p-2 rounded-lg border transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-blue-50/80 border-blue-400 shadow-xs'
                          : m.hasData
                          ? 'bg-white border-slate-200 hover:border-slate-300'
                          : 'bg-slate-50/50 border-slate-200/50 opacity-60'
                      }`}
                      title={`${m.label}: ${m.metrics.completedCount} cuốc\n• Cước gốc: ${formatVnd(
                        m.metrics.totalCuocGoc
                      )}\n• Cước sau trừ 17%: ${formatVnd(
                        m.metrics.totalCuocSauTru17
                      )}\n• Chi phí công ty: ${formatVnd(
                        m.metrics.totalChiPhiCongTy
                      )}\n• Chênh lệch tạm tính: +${formatVnd(m.metrics.totalChenhLechSauTru17)}`}
                    >
                      {/* Số liệu tóm tắt trên đỉnh cột */}
                      <div className="text-[10px] font-mono font-bold text-blue-800 leading-tight">
                        {m.hasData ? `${formatTrieuDong(m.metrics.totalCuocSauTru17)}M` : '-'}
                      </div>
                      <div className="text-[9px] font-mono text-emerald-700 font-semibold mb-1">
                        {m.hasData
                          ? `+${formatTrieuDong(m.metrics.totalChenhLechSauTru17)}M`
                          : ''}
                      </div>

                      {/* Khung 3 cột biểu đồ */}
                      <div className="h-[125px] w-full flex items-end justify-center gap-1 border-b border-slate-200 pb-1">
                        <div
                          style={{ height: `${revHeight}px` }}
                          className="w-3 bg-blue-600 rounded-t-xs transition-all"
                        />
                        <div
                          style={{ height: `${costHeight}px` }}
                          className="w-3 bg-amber-500 rounded-t-xs transition-all"
                        />
                        <div
                          style={{ height: `${profitHeight}px` }}
                          className="w-3 bg-emerald-600 rounded-t-xs transition-all"
                        />
                      </div>

                      {/* Nhãn tháng & số cuốc */}
                      <div
                        className={`mt-1.5 text-xs font-bold ${
                          isSelected ? 'text-blue-800' : 'text-slate-800'
                        }`}
                      >
                        Tháng {m.index}
                      </div>
                      <div className="text-[10px] text-slate-500 font-mono">
                        {m.metrics.completedCount} cuốc
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* PHẦN B: BẢNG THỐNG KÊ TẤT CẢ THÔNG SỐ THEO TỪNG THÁNG (T1-T12) */}
        {/* ============================================================ */}
        {(viewMode === 'ALL' || viewMode === 'TABLE') && (
          <div
            className="ha-table-scroll border border-slate-200 rounded-xl"
            tabIndex={0}
            role="region"
            aria-label="Bảng báo cáo thống kê tất cả thông số 12 tháng"
          >
            <table
              data-testid="monthly-statistics-table"
              className="w-full text-xs text-left border-collapse"
            >
              <thead>
                <tr className="bg-slate-100/90 border-b border-slate-200 text-slate-700 font-bold text-[11px]">
                  <th className="py-2.5 px-3 sticky left-0 bg-slate-100 z-10 border-r border-slate-200">
                    Tháng / Kỳ
                  </th>
                  <th className="py-2.5 px-2.5 text-center">Tổng cuốc</th>
                  <th className="py-2.5 px-2.5 text-center">Xe nhà / Ngoài</th>
                  <th className="py-2.5 px-3 text-right">Cước gốc (Chưa VAT)</th>
                  <th className="py-2.5 px-3 text-right">VAT 8%</th>
                  <th className="py-2.5 px-3 text-right">Cước có VAT (×1,08)</th>
                  <th className="py-2.5 px-3 text-right">Trừ 17% nội bộ</th>
                  <th className="py-2.5 px-3 text-right bg-blue-50/60 text-blue-900">
                    Sau trừ 17% (×0,83)
                  </th>
                  <th className="py-2.5 px-3 text-right">Thuê ngoài (Cước ra)</th>
                  <th className="py-2.5 px-3 text-right">Tiền đường (BOT)</th>
                  <th className="py-2.5 px-3 text-right">Nâng hạ & PS</th>
                  <th className="py-2.5 px-2.5 text-center">Dầu cấp</th>
                  <th className="py-2.5 px-3 text-right bg-amber-50/60 text-amber-950">
                    Tổng chi phí CTy
                  </th>
                  <th className="py-2.5 px-3 text-right bg-emerald-50/60 text-emerald-900">
                    Chênh lệch tạm tính
                  </th>
                  <th className="py-2.5 px-3 text-right">Dư nợ cước khách</th>
                  <th className="py-2.5 px-3 text-right">Phơi trả hộ (Còn thu)</th>
                  <th className="py-2.5 px-3 text-center">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/70">
                {visibleMonthlyReports.map((m) => {
                  const isSelected =
                    dateFilter === m.filterKey ||
                    (dateFilter === 'month' && m.monthCode === '01');
                  const { metrics: mt } = m;

                  return (
                    <tr
                      key={m.filterKey}
                      data-testid={`monthly-row-${m.monthCode}`}
                      className={`transition-colors ${
                        isSelected
                          ? 'bg-blue-50/70 font-semibold'
                          : m.hasData
                          ? 'hover:bg-slate-50/90'
                          : 'bg-slate-50/30 text-slate-400'
                      }`}
                    >
                      {/* Cột 1: Tháng */}
                      <td
                        className={`py-2.5 px-3 font-bold sticky left-0 z-10 border-r border-slate-200 ${
                          isSelected
                            ? 'bg-blue-50 text-blue-900'
                            : m.hasData
                            ? 'bg-white text-slate-900'
                            : 'bg-slate-50 text-slate-400'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1.5">
                          <button
                            type="button"
                            onClick={() => onSelectDateFilter?.(m.filterKey)}
                            className="hover:underline text-left cursor-pointer flex items-center gap-1"
                          >
                            <span>{m.label}</span>
                          </button>
                          {isSelected && (
                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-blue-700 text-white font-semibold">
                              Đang xem
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Cột 2: Tổng cuốc */}
                      <td className="py-2.5 px-2.5 text-center font-mono font-bold text-slate-900">
                        {mt.completedCount}
                      </td>

                      {/* Cột 3: Xe nhà / Thuê ngoài */}
                      <td className="py-2.5 px-2.5 text-center font-mono text-[11px] text-slate-600">
                        {m.hasData ? (
                          <span>
                            <strong className="text-slate-800">{mt.houseTripsCount}</strong> nhà /{' '}
                            <strong className="text-slate-700">{mt.subTripsCount}</strong> ngoài
                          </span>
                        ) : (
                          '-'
                        )}
                      </td>

                      {/* Cột 4: Cước gốc */}
                      <td className="py-2.5 px-3 text-right font-mono text-slate-800">
                        {m.hasData ? formatVnd(mt.totalCuocGoc) : '0 ₫'}
                      </td>

                      {/* Cột 5: VAT 8% */}
                      <td className="py-2.5 px-3 text-right font-mono text-slate-600">
                        {m.hasData ? formatVnd(mt.totalVat8) : '0 ₫'}
                      </td>

                      {/* Cột 6: Cước có VAT */}
                      <td className="py-2.5 px-3 text-right font-mono text-slate-800">
                        {m.hasData ? formatVnd(mt.totalCuocCoVat) : '0 ₫'}
                      </td>

                      {/* Cột 7: Trừ 17% */}
                      <td className="py-2.5 px-3 text-right font-mono text-rose-700">
                        {m.hasData ? `-${formatVnd(mt.totalKhoanTru17)}` : '0 ₫'}
                      </td>

                      {/* Cột 8: Cước sau trừ 17% */}
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-blue-800 bg-blue-50/30">
                        {m.hasData ? formatVnd(mt.totalCuocSauTru17) : '0 ₫'}
                      </td>

                      {/* Cột 9: Cước thuê ngoài */}
                      <td className="py-2.5 px-3 text-right font-mono text-slate-700">
                        {mt.totalCuocRa > 0 ? formatVnd(mt.totalCuocRa) : '0 ₫'}
                      </td>

                      {/* Cột 10: Tiền đường BOT */}
                      <td className="py-2.5 px-3 text-right font-mono text-slate-700">
                        {mt.totalToll > 0 ? formatVnd(mt.totalToll) : '0 ₫'}
                      </td>

                      {/* Cột 11: Nâng hạ & Phát sinh */}
                      <td
                        className="py-2.5 px-3 text-right font-mono text-slate-700"
                        title={`Phí nâng: ${formatVnd(mt.totalPhiNang)} • Phí hạ: ${formatVnd(
                          mt.totalPhiHa
                        )} • Phát sinh: ${formatVnd(mt.totalPhatSinh)}`}
                      >
                        {mt.totalNangHaPhatSinh > 0 ? formatVnd(mt.totalNangHaPhatSinh) : '0 ₫'}
                      </td>

                      {/* Cột 12: Dầu cấp */}
                      <td className="py-2.5 px-2.5 text-center font-mono text-slate-700">
                        {mt.totalFuelLiters > 0
                          ? `${mt.totalFuelLiters.toLocaleString('vi-VN')} L`
                          : '-'}
                      </td>

                      {/* Cột 13: Tổng chi phí công ty */}
                      <td className="py-2.5 px-3 text-right font-mono font-semibold text-amber-900 bg-amber-50/30">
                        {m.hasData ? formatVnd(mt.totalChiPhiCongTy) : '0 ₫'}
                      </td>

                      {/* Cột 14: Chênh lệch tạm tính */}
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-800 bg-emerald-50/30">
                        {m.hasData ? (
                          <div>
                            <span>
                              {mt.totalChenhLechSauTru17 >= 0 ? '+' : ''}
                              {formatVnd(mt.totalChenhLechSauTru17)}
                            </span>
                            <span className="block text-[10px] font-normal text-emerald-700">
                              ({m.marginRate}% cước)
                            </span>
                          </div>
                        ) : (
                          '0 ₫'
                        )}
                      </td>

                      {/* Cột 15: Dư nợ cước khách */}
                      <td className="py-2.5 px-3 text-right font-mono text-slate-700">
                        {mt.totalConPhaiThuKhach > 0 ? (
                          <span className="text-rose-700 font-semibold">
                            {formatVnd(mt.totalConPhaiThuKhach)}
                          </span>
                        ) : (
                          '0 ₫'
                        )}
                      </td>

                      {/* Cột 16: Phơi trả hộ */}
                      <td
                        className="py-2.5 px-3 text-right font-mono text-slate-700"
                        title={`Tổng phơi tạm ứng: ${formatVnd(
                          mt.totalPhoiTraHo
                        )} • Đã hoàn: ${formatVnd(
                          mt.totalPhoiDaHoan
                        )} • Còn phải thu: ${formatVnd(mt.totalPhoiConPhaiThu)}`}
                      >
                        {mt.totalPhoiTraHo > 0 ? (
                          <div>
                            <span>{formatVnd(mt.totalPhoiTraHo)}</span>
                            {mt.totalPhoiConPhaiThu > 0 && (
                              <span className="block text-[10px] text-purple-700">
                                Nợ: {formatVnd(mt.totalPhoiConPhaiThu)}
                              </span>
                            )}
                          </div>
                        ) : (
                          '0 ₫'
                        )}
                      </td>

                      {/* Cột 17: Thao tác */}
                      <td className="py-2.5 px-3 text-center">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => onSelectDateFilter?.(m.filterKey)}
                            className="px-2 py-1 bg-white hover:bg-blue-50 text-blue-700 border border-blue-200 rounded text-[11px] font-semibold transition-colors cursor-pointer"
                            title={`Chuyển Dashboard sang xem ${m.label}`}
                          >
                            Xem kỳ
                          </button>
                          {m.hasData && (
                            <>
                              <button
                                type="button"
                                onClick={(e) =>
                                  onOpenDrawer?.(
                                    {
                                      type: 'TRIPS',
                                      title: `Danh sách cuốc xe ${m.label} (${scopeLabel})`,
                                      subtitle: `Tổng cộng ${mt.completedCount} cuốc • Cước sau trừ 17%: ${formatVnd(
                                        mt.totalCuocSauTru17
                                      )}`,
                                      trips: m.trips
                                    },
                                    e.currentTarget
                                  )
                                }
                                className="px-2 py-1 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded text-[11px] font-semibold transition-colors cursor-pointer"
                                title={`Mở danh sách ${mt.completedCount} cuốc của ${m.label}`}
                              >
                                DS cuốc
                              </button>
                              <button
                                type="button"
                                onClick={() => handleOpenPrintForPeriod(m.filterKey, true)}
                                className="p-1 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded transition-colors cursor-pointer"
                                title={`In báo cáo chi tiết ${m.label}`}
                              >
                                <Printer size={13} />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>

              {/* Dòng Tổng cộng cả năm 2026 & Trung bình tháng */}
              <tfoot>
                <tr className="bg-slate-100 border-t-2 border-slate-300 font-bold text-slate-900">
                  <td className="py-3 px-3 uppercase sticky left-0 bg-slate-100 z-10 border-r border-slate-200">
                    Tổng cả năm 2026
                  </td>
                  <td className="py-3 px-2.5 text-center font-mono text-sm">
                    {yearlyMetrics.completedCount}
                  </td>
                  <td className="py-3 px-2.5 text-center font-mono text-[11px]">
                    {yearlyMetrics.houseTripsCount} nhà / {yearlyMetrics.subTripsCount} ngoài
                  </td>
                  <td className="py-3 px-3 text-right font-mono">
                    {formatVnd(yearlyMetrics.totalCuocGoc)}
                  </td>
                  <td className="py-3 px-3 text-right font-mono">
                    {formatVnd(yearlyMetrics.totalVat8)}
                  </td>
                  <td className="py-3 px-3 text-right font-mono">
                    {formatVnd(yearlyMetrics.totalCuocCoVat)}
                  </td>
                  <td className="py-3 px-3 text-right font-mono text-rose-700">
                    -{formatVnd(yearlyMetrics.totalKhoanTru17)}
                  </td>
                  <td className="py-3 px-3 text-right font-mono text-blue-900 bg-blue-100/60">
                    {formatVnd(yearlyMetrics.totalCuocSauTru17)}
                  </td>
                  <td className="py-3 px-3 text-right font-mono">
                    {formatVnd(yearlyMetrics.totalCuocRa)}
                  </td>
                  <td className="py-3 px-3 text-right font-mono">
                    {formatVnd(yearlyMetrics.totalToll)}
                  </td>
                  <td className="py-3 px-3 text-right font-mono">
                    {formatVnd(yearlyMetrics.totalNangHaPhatSinh)}
                  </td>
                  <td className="py-3 px-2.5 text-center font-mono">
                    {yearlyMetrics.totalFuelLiters.toLocaleString('vi-VN')} L
                  </td>
                  <td className="py-3 px-3 text-right font-mono text-amber-950 bg-amber-100/60">
                    {formatVnd(yearlyMetrics.totalChiPhiCongTy)}
                  </td>
                  <td className="py-3 px-3 text-right font-mono text-emerald-900 bg-emerald-100/60">
                    +{formatVnd(yearlyMetrics.totalChenhLechSauTru17)}
                  </td>
                  <td className="py-3 px-3 text-right font-mono text-rose-800">
                    {formatVnd(yearlyMetrics.totalConPhaiThuKhach)}
                  </td>
                  <td className="py-3 px-3 text-right font-mono">
                    {formatVnd(yearlyMetrics.totalPhoiTraHo)}
                  </td>
                  <td className="py-3 px-3 text-center">
                    <button
                      type="button"
                      onClick={() => handleOpenPrintForPeriod('all', false)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-900 hover:bg-slate-800 text-white rounded text-[11px] font-semibold cursor-pointer"
                    >
                      <Printer size={12} />
                      <span>In cả năm</span>
                    </button>
                  </td>
                </tr>

                {/* Dòng Trung bình mỗi tháng có phát sinh */}
                <tr className="bg-slate-50 border-t border-slate-200 text-slate-600 font-medium text-[11px]">
                  <td className="py-2 px-3 sticky left-0 bg-slate-50 z-10 border-r border-slate-200">
                    Bình quân / tháng ({yearlyMetrics.activeMonthsCount} tháng chạy)
                  </td>
                  <td className="py-2 px-2.5 text-center font-mono">
                    {Math.round(yearlyMetrics.completedCount / yearlyMetrics.activeMonthsCount)}
                  </td>
                  <td className="py-2 px-2.5 text-center font-mono">
                    {Math.round(yearlyMetrics.houseTripsCount / yearlyMetrics.activeMonthsCount)} /{' '}
                    {Math.round(yearlyMetrics.subTripsCount / yearlyMetrics.activeMonthsCount)}
                  </td>
                  <td className="py-2 px-3 text-right font-mono">
                    {formatVnd(
                      Math.round(yearlyMetrics.totalCuocGoc / yearlyMetrics.activeMonthsCount)
                    )}
                  </td>
                  <td className="py-2 px-3 text-right font-mono">
                    {formatVnd(
                      Math.round(yearlyMetrics.totalVat8 / yearlyMetrics.activeMonthsCount)
                    )}
                  </td>
                  <td className="py-2 px-3 text-right font-mono">
                    {formatVnd(
                      Math.round(yearlyMetrics.totalCuocCoVat / yearlyMetrics.activeMonthsCount)
                    )}
                  </td>
                  <td className="py-2 px-3 text-right font-mono">
                    -{formatVnd(
                      Math.round(yearlyMetrics.totalKhoanTru17 / yearlyMetrics.activeMonthsCount)
                    )}
                  </td>
                  <td className="py-2 px-3 text-right font-mono font-semibold text-blue-800">
                    {formatVnd(
                      Math.round(yearlyMetrics.totalCuocSauTru17 / yearlyMetrics.activeMonthsCount)
                    )}
                  </td>
                  <td className="py-2 px-3 text-right font-mono">
                    {formatVnd(
                      Math.round(yearlyMetrics.totalCuocRa / yearlyMetrics.activeMonthsCount)
                    )}
                  </td>
                  <td className="py-2 px-3 text-right font-mono">
                    {formatVnd(
                      Math.round(yearlyMetrics.totalToll / yearlyMetrics.activeMonthsCount)
                    )}
                  </td>
                  <td className="py-2 px-3 text-right font-mono">
                    {formatVnd(
                      Math.round(
                        yearlyMetrics.totalNangHaPhatSinh / yearlyMetrics.activeMonthsCount
                      )
                    )}
                  </td>
                  <td className="py-2 px-2.5 text-center font-mono">
                    {Math.round(
                      yearlyMetrics.totalFuelLiters / yearlyMetrics.activeMonthsCount
                    ).toLocaleString('vi-VN')}{' '}
                    L
                  </td>
                  <td className="py-2 px-3 text-right font-mono font-semibold text-amber-900">
                    {formatVnd(
                      Math.round(
                        yearlyMetrics.totalChiPhiCongTy / yearlyMetrics.activeMonthsCount
                      )
                    )}
                  </td>
                  <td className="py-2 px-3 text-right font-mono font-semibold text-emerald-800">
                    +{formatVnd(
                      Math.round(
                        yearlyMetrics.totalChenhLechSauTru17 / yearlyMetrics.activeMonthsCount
                      )
                    )}
                  </td>
                  <td className="py-2 px-3 text-right font-mono">
                    {formatVnd(
                      Math.round(
                        yearlyMetrics.totalConPhaiThuKhach / yearlyMetrics.activeMonthsCount
                      )
                    )}
                  </td>
                  <td className="py-2 px-3 text-right font-mono">
                    {formatVnd(
                      Math.round(yearlyMetrics.totalPhoiTraHo / yearlyMetrics.activeMonthsCount)
                    )}
                  </td>
                  <td className="py-2 px-3 text-center">-</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {/* ============================================================ */}
        {/* PHẦN C: CHẾ ĐỘ THẺ CHI TIẾT TỪNG THÁNG (DỄ XEM TRÊN ĐIỆN THOẠI & TABLET) */}
        {/* ============================================================ */}
        {viewMode === 'CARDS' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {visibleMonthlyReports.map((m) => {
              const { metrics: mt } = m;
              const isSelected =
                dateFilter === m.filterKey ||
                (dateFilter === 'month' && m.monthCode === '01');

              return (
                <div
                  key={m.filterKey}
                  className={`rounded-xl border p-4 space-y-3 transition-all ${
                    isSelected
                      ? 'bg-blue-50/40 border-blue-400 shadow-xs'
                      : m.hasData
                      ? 'bg-white border-slate-200 hover:border-slate-300 shadow-2xs'
                      : 'bg-slate-50/60 border-slate-200/60 opacity-75'
                  }`}
                >
                  <div className="flex items-center justify-between border-b border-slate-200/80 pb-2">
                    <div>
                      <span className="font-bold text-sm text-slate-900">{m.label}</span>
                      <span className="block text-[11px] text-slate-500">
                        Xe nhà: {mt.houseTripsCount} cuốc ({mt.activeVehiclesCount} xe) • Ngoài:{' '}
                        {mt.subTripsCount} cuốc
                      </span>
                    </div>
                    <span className="px-2.5 py-0.5 rounded-full bg-slate-900 text-white font-mono font-bold text-xs">
                      {mt.completedCount} cuốc
                    </span>
                  </div>

                  <div className="space-y-1.5 text-xs font-mono">
                    <div className="flex justify-between text-slate-600">
                      <span className="font-sans">Cước gốc (chưa VAT):</span>
                      <strong className="text-slate-900">{formatVnd(mt.totalCuocGoc)}</strong>
                    </div>
                    <div className="flex justify-between text-slate-600">
                      <span className="font-sans">VAT 8% / Có VAT:</span>
                      <span>
                        {formatTrieuDong(mt.totalVat8)}M / {formatVnd(mt.totalCuocCoVat)}
                      </span>
                    </div>
                    <div className="flex justify-between text-rose-700">
                      <span className="font-sans">Khoản trừ 17% nội bộ:</span>
                      <span>-{formatVnd(mt.totalKhoanTru17)}</span>
                    </div>
                    <div className="flex justify-between font-bold text-blue-800 bg-blue-50/60 px-2 py-1 rounded">
                      <span className="font-sans">Tổng cước sau trừ 17%:</span>
                      <span>{formatVnd(mt.totalCuocSauTru17)}</span>
                    </div>
                    <div className="flex justify-between text-slate-600 pt-1">
                      <span className="font-sans">Chi phí thuê ngoài (Cước ra):</span>
                      <span>{formatVnd(mt.totalCuocRa)}</span>
                    </div>
                    <div className="flex justify-between text-slate-600">
                      <span className="font-sans">Vé cầu đường BOT:</span>
                      <span>{formatVnd(mt.totalToll)}</span>
                    </div>
                    <div className="flex justify-between text-slate-600">
                      <span className="font-sans">Nâng hạ & Phát sinh:</span>
                      <span>{formatVnd(mt.totalNangHaPhatSinh)}</span>
                    </div>
                    <div className="flex justify-between text-slate-600">
                      <span className="font-sans">Dầu cấp trong tháng:</span>
                      <span>{mt.totalFuelLiters.toLocaleString('vi-VN')} Lít</span>
                    </div>
                    <div className="flex justify-between font-semibold text-amber-900 bg-amber-50/60 px-2 py-1 rounded">
                      <span className="font-sans">Tổng chi phí công ty:</span>
                      <span>{formatVnd(mt.totalChiPhiCongTy)}</span>
                    </div>
                    <div className="flex justify-between font-bold text-emerald-800 bg-emerald-50/70 px-2 py-1.5 rounded border border-emerald-200">
                      <span className="font-sans">Chênh lệch tạm tính:</span>
                      <span>+{formatVnd(mt.totalChenhLechSauTru17)}</span>
                    </div>
                    <div className="flex justify-between text-slate-600 pt-1 text-[11px]">
                      <span className="font-sans">Dư nợ cước / Phơi trả hộ:</span>
                      <span>
                        {formatTrieuDong(mt.totalConPhaiThuKhach)}M /{' '}
                        {formatTrieuDong(mt.totalPhoiTraHo)}M
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => onSelectDateFilter?.(m.filterKey)}
                      className="flex-1 py-1.5 bg-blue-700 hover:bg-blue-800 text-white rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                    >
                      Xem {m.label}
                    </button>
                    {m.hasData && (
                      <button
                        type="button"
                        onClick={() => handleOpenPrintForPeriod(m.filterKey, true)}
                        className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                      >
                        <Printer size={13} />
                        <span>In tháng</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ============================================================ */}
      {/* MODAL XEM TRƯỚC BẢN IN & IN BÁO CÁO TRỰC QUAN (A4 LANDSCAPE) */}
      {/* ============================================================ */}
      {printModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Xem trước bản in báo cáo thống kê kinh doanh"
          data-testid="print-business-report-modal"
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex flex-col items-center justify-start overflow-y-auto p-2 sm:p-6"
          onClick={onClosePrintModal}
        >
          <div
            className="w-full max-w-6xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden my-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Thanh công cụ cấu hình bản in (Không in ra giấy) */}
            <div className="p-4 bg-slate-900 text-white flex flex-col lg:flex-row lg:items-center justify-between gap-3 no-print">
              <div className="flex items-center gap-2.5">
                <Printer className="w-5 h-5 text-blue-400 shrink-0" />
                <div>
                  <h3 className="text-sm font-bold">
                    Bản In Báo Cáo Thống Kê Kinh Doanh Trực Quan (Chuẩn A4 Ngang)
                  </h3>
                  <p className="text-[11px] text-slate-300">
                    Chọn kỳ báo cáo (Cả năm 12 tháng hoặc Từng tháng) và bấm &ldquo;In ngay / Xuất PDF&rdquo;
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={printPeriod}
                  onChange={(e) => {
                    const val = e.target.value;
                    setPrintPeriod(val);
                    if (val.startsWith('month_')) {
                      setPrintIncludeTripDetails(true);
                    } else {
                      setPrintIncludeTripDetails(false);
                    }
                  }}
                  data-testid="select-print-period"
                  className="bg-slate-800 border border-slate-600 text-white rounded-lg px-2.5 py-1.5 text-xs font-semibold"
                >
                  <option value="all">Báo cáo Tổng hợp 12 Tháng Năm 2026</option>
                  {MONTHS_2026.map((m) => (
                    <option key={m.filterKey} value={m.filterKey}>
                      Báo cáo Chi tiết {m.label}
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  onClick={handleExecutePrint}
                  data-testid="btn-execute-print"
                  className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold shadow-xs transition-colors cursor-pointer"
                >
                  <Printer size={15} />
                  <span>In ngay / Lưu PDF (Ctrl+P)</span>
                </button>

                <button
                  type="button"
                  onClick={onClosePrintModal}
                  data-testid="btn-close-print-modal"
                  className="inline-flex items-center gap-1 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-100 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                >
                  <X size={15} />
                  <span>Đóng</span>
                </button>
              </div>
            </div>

            {/* Thanh tuỳ chọn các mục đưa vào trang in */}
            <div className="px-4 py-2.5 bg-slate-100 border-b border-slate-200 flex flex-wrap items-center gap-4 text-xs text-slate-700 no-print">
              <span className="font-bold text-slate-900">Nội dung bản in:</span>
              <label className="inline-flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={printIncludeChart}
                  onChange={(e) => setPrintIncludeChart(e.target.checked)}
                />
                <span>Biểu đồ trực quan 12 tháng</span>
              </label>
              <label className="inline-flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={printIncludeMonthlyTable}
                  onChange={(e) => setPrintIncludeMonthlyTable(e.target.checked)}
                />
                <span>Bảng thống kê tất cả thông số 12 tháng</span>
              </label>
              <label className="inline-flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={printIncludeFleetTable}
                  onChange={(e) => setPrintIncludeFleetTable(e.target.checked)}
                />
                <span>Bảng hiệu quả Đội xe nhà & Thuê ngoài</span>
              </label>
              <label className="inline-flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={printIncludeTripDetails}
                  onChange={(e) => setPrintIncludeTripDetails(e.target.checked)}
                />
                <span>
                  Kèm bảng kê chi tiết từng chuyến xe ({printTargetData.targetTrips.length} cuốc)
                </span>
              </label>
            </div>

            {/* ============================================================ */}
            {/* NỘI DUNG TỜ BÁO CÁO IN (PRINTABLE SHEET) */}
            {/* ============================================================ */}
            <div
              ref={printAreaRef}
              id="printable-business-report-area"
              className="p-4 sm:p-8 bg-white text-slate-900 space-y-6 max-h-[80vh] overflow-y-auto"
            >
              {/* Quốc hiệu & Tiêu đề Báo cáo */}
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b-2 border-slate-800 pb-4">
                <div>
                  <div className="text-xs font-bold uppercase tracking-wider text-slate-700">
                    HỆ THỐNG QUẢN TRỊ ĐIỀU VẬN & HẠCH TOÁN VẬN TẢI CONTAINER
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    Chuẩn nghiệp vụ: Cước gốc chưa VAT • VAT 8% • Khoản trừ 17% nội bộ • Tách nâng/hạ • Tiền phơi trả hộ
                  </div>
                </div>
                <div className="text-left sm:text-right text-[11px] text-slate-600">
                  <div className="font-bold text-slate-800">BÁO CÁO ĐIỀU HÀNH BAN GIÁM ĐỐC</div>
                  <div>
                    Ngày giờ lập: {new Date().toLocaleDateString('vi-VN')}{' '}
                    {new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              </div>

              <div className="text-center space-y-1">
                <h1 className="text-lg sm:text-xl font-bold uppercase tracking-tight text-slate-900">
                  BÁO CÁO THỐNG KÊ KẾT QUẢ KINH DOANH — {printTargetData.periodTitle}
                </h1>
                <div className="text-xs font-semibold text-slate-600">
                  Phạm vi báo cáo: {scopeLabel} • Tổng sản lượng:{' '}
                  {printTargetData.targetMetrics.completedCount} cuốc hoàn thành (
                  {printTargetData.targetMetrics.houseTripsCount} cuốc xe nhà /{' '}
                  {printTargetData.targetMetrics.subTripsCount} cuốc thuê ngoài)
                </div>
              </div>

              {/* 1. Bốn thẻ KPI Tổng hợp của Kỳ in */}
              <div className="print-kpi-grid grid grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="print-kpi-card border border-slate-300 rounded-lg p-3 bg-slate-50/50">
                  <div className="text-[10px] font-bold uppercase text-slate-500">
                    1. Sản lượng & Doanh thu gốc
                  </div>
                  <div className="text-base font-bold font-mono text-slate-900 mt-1">
                    {printTargetData.targetMetrics.completedCount} cuốc —{' '}
                    {formatVnd(printTargetData.targetMetrics.totalCuocGoc)}
                  </div>
                  <div className="text-[10px] text-slate-600 mt-0.5">
                    VAT 8%: {formatVnd(printTargetData.targetMetrics.totalVat8)} • Có VAT:{' '}
                    {formatVnd(printTargetData.targetMetrics.totalCuocCoVat)}
                  </div>
                </div>

                <div className="print-kpi-card border border-blue-300 rounded-lg p-3 bg-blue-50/30">
                  <div className="text-[10px] font-bold uppercase text-blue-800">
                    2. Tổng cước sau trừ 17% (×0,83)
                  </div>
                  <div className="text-base font-bold font-mono text-blue-900 mt-1">
                    {formatVnd(printTargetData.targetMetrics.totalCuocSauTru17)}
                  </div>
                  <div className="text-[10px] text-slate-600 mt-0.5">
                    Khoản trừ 17% nội bộ: -{formatVnd(printTargetData.targetMetrics.totalKhoanTru17)}
                  </div>
                </div>

                <div className="print-kpi-card border border-amber-300 rounded-lg p-3 bg-amber-50/30">
                  <div className="text-[10px] font-bold uppercase text-amber-900">
                    3. Tổng chi phí công ty chịu
                  </div>
                  <div className="text-base font-bold font-mono text-amber-950 mt-1">
                    {formatVnd(printTargetData.targetMetrics.totalChiPhiCongTy)}
                  </div>
                  <div className="text-[10px] text-slate-600 mt-0.5">
                    Thuê ngoài: {formatTrieuDong(printTargetData.targetMetrics.totalCuocRa)}M • BOT:{' '}
                    {formatTrieuDong(printTargetData.targetMetrics.totalToll)}M • Dầu:{' '}
                    {printTargetData.targetMetrics.totalFuelLiters.toLocaleString('vi-VN')}L
                  </div>
                </div>

                <div className="print-kpi-card border border-emerald-300 rounded-lg p-3 bg-emerald-50/30">
                  <div className="text-[10px] font-bold uppercase text-emerald-900">
                    4. Chênh lệch tạm tính (Chưa lương)
                  </div>
                  <div className="text-base font-bold font-mono text-emerald-900 mt-1">
                    +{formatVnd(printTargetData.targetMetrics.totalChenhLechSauTru17)}
                  </div>
                  <div className="text-[10px] text-slate-600 mt-0.5">
                    Dư nợ cước: {formatTrieuDong(printTargetData.targetMetrics.totalConPhaiThuKhach)}M
                    • Phơi trả hộ: {formatTrieuDong(printTargetData.targetMetrics.totalPhoiTraHo)}M
                  </div>
                </div>
              </div>

              {/* 2. Biểu đồ trực quan 12 tháng trên Bản In */}
              {printIncludeChart && (
                <div>
                  <div className="print-section-title text-xs font-bold uppercase border-b-2 border-slate-700 pb-1 mb-2">
                    I. BIỂU ĐỒ TRỰC QUAN SO SÁNH DOANH THU SAU TRỪ 17% & CHÊNH LỆCH 12 THÁNG NĂM 2026
                  </div>
                  <div className="print-chart-bars grid grid-cols-12 gap-2 items-end border border-slate-300 rounded-lg p-3 bg-white">
                    {monthlyReports.map((m) => {
                      const revH = m.hasData
                        ? Math.max(6, Math.round((m.metrics.totalCuocSauTru17 / maxChartValue) * 80))
                        : 2;
                      const profH = m.hasData
                        ? Math.max(
                            4,
                            Math.round(
                              (Math.max(0, m.metrics.totalChenhLechSauTru17) / maxChartValue) * 80
                            )
                          )
                        : 2;
                      return (
                        <div key={m.filterKey} className="flex flex-col items-center text-center">
                          <div className="text-[9px] font-mono font-bold text-blue-800">
                            {m.hasData ? `${formatTrieuDong(m.metrics.totalCuocSauTru17)}M` : '-'}
                          </div>
                          <div className="h-[85px] flex items-end justify-center gap-1 border-b border-slate-300 w-full pb-0.5">
                            <div
                              style={{ height: `${revH}px`, backgroundColor: '#2563eb' }}
                              className="w-2.5 bg-blue-600"
                            />
                            <div
                              style={{ height: `${profH}px`, backgroundColor: '#059669' }}
                              className="w-2.5 bg-emerald-600"
                            />
                          </div>
                          <div className="text-[10px] font-bold mt-1">T{m.index}</div>
                          <div className="text-[9px] text-slate-600 font-mono">
                            {m.metrics.completedCount}c
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 3. Bảng Thống Kê Tất Cả Thông Số Theo Từng Tháng (12 Tháng) */}
              {printIncludeMonthlyTable && (
                <div>
                  <div className="print-section-title text-xs font-bold uppercase border-b-2 border-slate-700 pb-1 mb-2">
                    II. BẢNG THỐNG KÊ TẤT CẢ THÔNG SỐ KINH DOANH THEO TỪNG THÁNG NĂM 2026
                  </div>
                  <div className="ha-table-scroll">
                    <table className="w-full text-[11px] border-collapse border border-slate-300">
                      <thead>
                        <tr className="bg-slate-100 text-slate-800 font-bold">
                          <th className="border border-slate-300 py-1.5 px-2 text-left">Tháng</th>
                          <th className="border border-slate-300 py-1.5 px-1.5 text-center">Số cuốc</th>
                          <th className="border border-slate-300 py-1.5 px-1.5 text-center">
                            Nhà/Ngoài
                          </th>
                          <th className="border border-slate-300 py-1.5 px-2 text-right">
                            Cước gốc
                          </th>
                          <th className="border border-slate-300 py-1.5 px-2 text-right">VAT 8%</th>
                          <th className="border border-slate-300 py-1.5 px-2 text-right">
                            Cước có VAT
                          </th>
                          <th className="border border-slate-300 py-1.5 px-2 text-right">
                            Trừ 17%
                          </th>
                          <th className="border border-slate-300 py-1.5 px-2 text-right">
                            Sau trừ 17%
                          </th>
                          <th className="border border-slate-300 py-1.5 px-2 text-right">
                            Thuê ngoài
                          </th>
                          <th className="border border-slate-300 py-1.5 px-2 text-right">
                            Tiền đường
                          </th>
                          <th className="border border-slate-300 py-1.5 px-2 text-right">
                            Nâng hạ & PS
                          </th>
                          <th className="border border-slate-300 py-1.5 px-1.5 text-center">
                            Dầu (L)
                          </th>
                          <th className="border border-slate-300 py-1.5 px-2 text-right">
                            Tổng chi phí
                          </th>
                          <th className="border border-slate-300 py-1.5 px-2 text-right">
                            Chênh lệch
                          </th>
                          <th className="border border-slate-300 py-1.5 px-2 text-right">
                            Nợ cước
                          </th>
                          <th className="border border-slate-300 py-1.5 px-2 text-right">
                            Phơi trả hộ
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {monthlyReports.map((m) => {
                          const { metrics: mt } = m;
                          const isTarget = printPeriod === m.filterKey;
                          return (
                            <tr
                              key={m.filterKey}
                              className={isTarget ? 'bg-blue-50/40 font-bold' : ''}
                            >
                              <td className="border border-slate-300 py-1 px-2 font-semibold">
                                {m.label}
                              </td>
                              <td className="border border-slate-300 py-1 px-1.5 text-center font-mono font-bold">
                                {mt.completedCount}
                              </td>
                              <td className="border border-slate-300 py-1 px-1.5 text-center font-mono">
                                {mt.houseTripsCount}/{mt.subTripsCount}
                              </td>
                              <td className="border border-slate-300 py-1 px-2 text-right font-mono">
                                {formatVnd(mt.totalCuocGoc)}
                              </td>
                              <td className="border border-slate-300 py-1 px-2 text-right font-mono">
                                {formatVnd(mt.totalVat8)}
                              </td>
                              <td className="border border-slate-300 py-1 px-2 text-right font-mono">
                                {formatVnd(mt.totalCuocCoVat)}
                              </td>
                              <td className="border border-slate-300 py-1 px-2 text-right font-mono">
                                -{formatVnd(mt.totalKhoanTru17)}
                              </td>
                              <td className="border border-slate-300 py-1 px-2 text-right font-mono font-bold text-blue-800">
                                {formatVnd(mt.totalCuocSauTru17)}
                              </td>
                              <td className="border border-slate-300 py-1 px-2 text-right font-mono">
                                {formatVnd(mt.totalCuocRa)}
                              </td>
                              <td className="border border-slate-300 py-1 px-2 text-right font-mono">
                                {formatVnd(mt.totalToll)}
                              </td>
                              <td className="border border-slate-300 py-1 px-2 text-right font-mono">
                                {formatVnd(mt.totalNangHaPhatSinh)}
                              </td>
                              <td className="border border-slate-300 py-1 px-1.5 text-center font-mono">
                                {mt.totalFuelLiters > 0
                                  ? mt.totalFuelLiters.toLocaleString('vi-VN')
                                  : '-'}
                              </td>
                              <td className="border border-slate-300 py-1 px-2 text-right font-mono font-semibold">
                                {formatVnd(mt.totalChiPhiCongTy)}
                              </td>
                              <td className="border border-slate-300 py-1 px-2 text-right font-mono font-bold text-emerald-800">
                                +{formatVnd(mt.totalChenhLechSauTru17)}
                              </td>
                              <td className="border border-slate-300 py-1 px-2 text-right font-mono">
                                {formatVnd(mt.totalConPhaiThuKhach)}
                              </td>
                              <td className="border border-slate-300 py-1 px-2 text-right font-mono">
                                {formatVnd(mt.totalPhoiTraHo)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="bg-slate-100 font-bold text-slate-900">
                          <td className="border border-slate-300 py-1.5 px-2 uppercase">
                            TỔNG CẢ NĂM 2026
                          </td>
                          <td className="border border-slate-300 py-1.5 px-1.5 text-center font-mono">
                            {yearlyMetrics.completedCount}
                          </td>
                          <td className="border border-slate-300 py-1.5 px-1.5 text-center font-mono">
                            {yearlyMetrics.houseTripsCount}/{yearlyMetrics.subTripsCount}
                          </td>
                          <td className="border border-slate-300 py-1.5 px-2 text-right font-mono">
                            {formatVnd(yearlyMetrics.totalCuocGoc)}
                          </td>
                          <td className="border border-slate-300 py-1.5 px-2 text-right font-mono">
                            {formatVnd(yearlyMetrics.totalVat8)}
                          </td>
                          <td className="border border-slate-300 py-1.5 px-2 text-right font-mono">
                            {formatVnd(yearlyMetrics.totalCuocCoVat)}
                          </td>
                          <td className="border border-slate-300 py-1.5 px-2 text-right font-mono">
                            -{formatVnd(yearlyMetrics.totalKhoanTru17)}
                          </td>
                          <td className="border border-slate-300 py-1.5 px-2 text-right font-mono text-blue-800">
                            {formatVnd(yearlyMetrics.totalCuocSauTru17)}
                          </td>
                          <td className="border border-slate-300 py-1.5 px-2 text-right font-mono">
                            {formatVnd(yearlyMetrics.totalCuocRa)}
                          </td>
                          <td className="border border-slate-300 py-1.5 px-2 text-right font-mono">
                            {formatVnd(yearlyMetrics.totalToll)}
                          </td>
                          <td className="border border-slate-300 py-1.5 px-2 text-right font-mono">
                            {formatVnd(yearlyMetrics.totalNangHaPhatSinh)}
                          </td>
                          <td className="border border-slate-300 py-1.5 px-1.5 text-center font-mono">
                            {yearlyMetrics.totalFuelLiters.toLocaleString('vi-VN')}
                          </td>
                          <td className="border border-slate-300 py-1.5 px-2 text-right font-mono">
                            {formatVnd(yearlyMetrics.totalChiPhiCongTy)}
                          </td>
                          <td className="border border-slate-300 py-1.5 px-2 text-right font-mono text-emerald-800">
                            +{formatVnd(yearlyMetrics.totalChenhLechSauTru17)}
                          </td>
                          <td className="border border-slate-300 py-1.5 px-2 text-right font-mono">
                            {formatVnd(yearlyMetrics.totalConPhaiThuKhach)}
                          </td>
                          <td className="border border-slate-300 py-1.5 px-2 text-right font-mono">
                            {formatVnd(yearlyMetrics.totalPhoiTraHo)}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              )}

              {/* 4. Bảng Hiệu quả Đội xe nhà & Thuê ngoài trong Kỳ in */}
              {printIncludeFleetTable && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {/* Đội xe nhà */}
                  <div>
                    <div className="print-section-title text-xs font-bold uppercase border-b-2 border-slate-700 pb-1 mb-2">
                      III. HIỆU QUẢ ĐỘI XE NHÀ ({printTargetData.fleetRows.length} XE —{' '}
                      {printTargetData.periodTitle})
                    </div>
                    <table className="w-full text-[11px] border-collapse border border-slate-300">
                      <thead>
                        <tr className="bg-slate-100 font-bold">
                          <th className="border border-slate-300 py-1 px-2 text-left">Biển số xe</th>
                          <th className="border border-slate-300 py-1 px-1.5 text-center">Cuốc</th>
                          <th className="border border-slate-300 py-1 px-2 text-right">
                            Sau trừ 17%
                          </th>
                          <th className="border border-slate-300 py-1 px-2 text-right">
                            Chi phí (BOT+PS)
                          </th>
                          <th className="border border-slate-300 py-1 px-1.5 text-center">
                            Dầu (L)
                          </th>
                          <th className="border border-slate-300 py-1 px-2 text-right">
                            Chênh lệch
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {printTargetData.fleetRows.map((tr) => (
                          <tr key={tr.plate}>
                            <td className="border border-slate-300 py-1 px-2 font-bold">
                              {tr.plate}
                            </td>
                            <td className="border border-slate-300 py-1 px-1.5 text-center font-mono">
                              {tr.completedCount}
                            </td>
                            <td className="border border-slate-300 py-1 px-2 text-right font-mono">
                              {formatVnd(tr.totalCuocSauTru17)}
                            </td>
                            <td className="border border-slate-300 py-1 px-2 text-right font-mono">
                              {formatVnd(tr.totalChiPhiCongTy)}
                            </td>
                            <td className="border border-slate-300 py-1 px-1.5 text-center font-mono">
                              {tr.totalFuelLiters > 0
                                ? tr.totalFuelLiters.toLocaleString('vi-VN')
                                : '-'}
                            </td>
                            <td className="border border-slate-300 py-1 px-2 text-right font-mono font-bold text-emerald-800">
                              +{formatVnd(tr.totalChenhLechSauTru17)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Đối tác thuê ngoài */}
                  <div>
                    <div className="print-section-title text-xs font-bold uppercase border-b-2 border-slate-700 pb-1 mb-2">
                      IV. THỐNG KÊ NHÀ XE THUÊ NGOÀI ({printTargetData.subRows.length} ĐỐI TÁC —{' '}
                      {printTargetData.periodTitle})
                    </div>
                    <table className="w-full text-[11px] border-collapse border border-slate-300">
                      <thead>
                        <tr className="bg-slate-100 font-bold">
                          <th className="border border-slate-300 py-1 px-2 text-left">
                            Nhà xe ngoài
                          </th>
                          <th className="border border-slate-300 py-1 px-1.5 text-center">Cuốc</th>
                          <th className="border border-slate-300 py-1 px-2 text-right">
                            Cước sau trừ 17%
                          </th>
                          <th className="border border-slate-300 py-1 px-2 text-right">
                            Cước ra phải trả
                          </th>
                          <th className="border border-slate-300 py-1 px-2 text-right">
                            Chênh lệch
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {printTargetData.subRows.slice(0, 20).map((sr) => (
                          <tr key={sr.name}>
                            <td className="border border-slate-300 py-1 px-2 font-semibold">
                              {sr.name}
                            </td>
                            <td className="border border-slate-300 py-1 px-1.5 text-center font-mono">
                              {sr.completedCount}
                            </td>
                            <td className="border border-slate-300 py-1 px-2 text-right font-mono">
                              {formatVnd(sr.totalCuocSauTru17)}
                            </td>
                            <td className="border border-slate-300 py-1 px-2 text-right font-mono">
                              {formatVnd(sr.totalCuocRa)}
                            </td>
                            <td className="border border-slate-300 py-1 px-2 text-right font-mono font-bold text-emerald-800">
                              +{formatVnd(sr.totalChenhLechSauTru17)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* 5. Phụ lục Bảng kê chi tiết từng chuyến xe trong kỳ (khi được bật) */}
              {printIncludeTripDetails && printTargetData.targetTrips.length > 0 && (
                <div className="page-break-before">
                  <div className="print-section-title text-xs font-bold uppercase border-b-2 border-slate-700 pb-1 mb-2">
                    V. PHỤ LỤC BẢNG KÊ CHI TIẾT CHUYẾN XE ({printTargetData.targetTrips.length} CUỐC
                    — {printTargetData.periodTitle})
                  </div>
                  <div className="ha-table-scroll">
                    <table className="w-full text-[10px] border-collapse border border-slate-300">
                      <thead>
                        <tr className="bg-slate-100 font-bold">
                          <th className="border border-slate-300 py-1 px-1.5 text-center">STT</th>
                          <th className="border border-slate-300 py-1 px-1.5 text-center">Ngày</th>
                          <th className="border border-slate-300 py-1 px-2 text-left">Chủ hàng</th>
                          <th className="border border-slate-300 py-1 px-2 text-left">
                            Tuyến đường
                          </th>
                          <th className="border border-slate-300 py-1 px-1.5 text-center">
                            Số Cont
                          </th>
                          <th className="border border-slate-300 py-1 px-1.5 text-center">
                            BKS / Xe ngoài
                          </th>
                          <th className="border border-slate-300 py-1 px-2 text-right">
                            Cước gốc
                          </th>
                          <th className="border border-slate-300 py-1 px-2 text-right">
                            Sau trừ 17%
                          </th>
                          <th className="border border-slate-300 py-1 px-2 text-right">
                            Chi phí CTy
                          </th>
                          <th className="border border-slate-300 py-1 px-2 text-right">
                            Chênh lệch
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {printTargetData.targetTrips.map((t, idx) => {
                          const f = computeTripFinancials({
                            base_revenue: t.cuoc_goc ?? t.base_revenue ?? t.cuoc_vao ?? 0,
                            lift_on_fee: t.phi_nang ?? t.lift_on_fee ?? 0,
                            lift_off_fee: t.phi_ha ?? t.lift_off_fee ?? 0,
                            port_fee: t.port_fee ?? 0,
                            fuel_liters: t.dau_liters ?? t.dau_lit ?? t.fuel_liters ?? 0,
                            fuel_unit_price: t.don_gia_dau ?? t.fuel_unit_price ?? null,
                            fuel_cost: t.tien_dau ?? t.fuel_cost ?? null,
                            toll_fee: t.tien_duong ?? t.toll_fee ?? 0,
                            subcontractor_cost: t.cuoc_ra ?? t.subcontractor_cost ?? 0,
                            other_costs: t.phat_sinh ?? t.other_costs ?? 0
                          });
                          return (
                            <tr key={t.id || idx}>
                              <td className="border border-slate-300 py-1 px-1.5 text-center font-mono">
                                {t.stt ?? idx + 1}
                              </td>
                              <td className="border border-slate-300 py-1 px-1.5 text-center font-mono">
                                {t.trip_date}
                              </td>
                              <td className="border border-slate-300 py-1 px-2">
                                {t.customer_name}
                              </td>
                              <td className="border border-slate-300 py-1 px-2">{t.route_name}</td>
                              <td className="border border-slate-300 py-1 px-1.5 text-center font-mono">
                                {t.container_number || '-'}
                              </td>
                              <td className="border border-slate-300 py-1 px-1.5 text-center font-mono">
                                {t.is_subcontractor
                                  ? t.subcontractor_name || t.vehicle_plate
                                  : t.vehicle_plate}
                              </td>
                              <td className="border border-slate-300 py-1 px-2 text-right font-mono">
                                {formatVnd(f.cuoc_goc)}
                              </td>
                              <td className="border border-slate-300 py-1 px-2 text-right font-mono text-blue-800 font-semibold">
                                {formatVnd(f.cuoc_sau_tru_17)}
                              </td>
                              <td className="border border-slate-300 py-1 px-2 text-right font-mono">
                                {formatVnd(f.chi_phi_cong_ty)}
                              </td>
                              <td className="border border-slate-300 py-1 px-2 text-right font-mono font-bold text-emerald-800">
                                +{formatVnd(f.cuoc_sau_tru_17 - f.chi_phi_cong_ty)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Chữ ký xác nhận cuối báo cáo */}
              <div className="grid grid-cols-3 gap-4 pt-6 text-center text-xs">
                <div>
                  <div className="font-bold uppercase text-slate-800">NGƯỜI LẬP BIỂU</div>
                  <div className="text-[11px] text-slate-500 italic mt-0.5">(Ký, ghi rõ họ tên)</div>
                  <div className="h-16"></div>
                </div>
                <div>
                  <div className="font-bold uppercase text-slate-800">KẾ TOÁN TRƯỞNG</div>
                  <div className="text-[11px] text-slate-500 italic mt-0.5">(Ký, ghi rõ họ tên)</div>
                  <div className="h-16"></div>
                </div>
                <div>
                  <div className="font-bold uppercase text-slate-800">GIÁM ĐỐC DUYỆT</div>
                  <div className="text-[11px] text-slate-500 italic mt-0.5">
                    (Ký, đóng dấu xác nhận)
                  </div>
                  <div className="h-16"></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
