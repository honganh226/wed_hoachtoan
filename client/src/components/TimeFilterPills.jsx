/**
 * ============================================================
 * THANH CHUYỂN ĐỔI ĐA CHU KỲ THỜI GIAN (TASK 4.3)
 * TimeFilterPills.jsx
 * ============================================================
 * Tính năng chính:
 * - Nút bấm 1-chạm: [Tháng này (MTD)], [Quý 1], [Quý 2], [Quý 3], [Quý 4], [Năm 2026]
 * - Bộ lọc tùy chọn khoảng ngày: Từ ngày - Đến ngày (DatePicker)
 * - Tự động tính toán startDate/endDate cho từng chu kỳ
 * - Hiển thị rõ ràng chu kỳ đang được chọn và khoảng ngày tương ứng
 * - Responsive mobile-first design
 * ============================================================
 */
import React, { useState, useMemo } from 'react';
import { Calendar, ChevronRight, CalendarDays, Clock, TrendingUp } from 'lucide-react';

// ================================================================
// TIỆN ÍCH TÍNH TOÁN CHU KỲ
// ================================================================

/**
 * Lấy ngày đầu tháng hiện tại (MTD = Month-To-Date)
 */
function getMTDRange() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const startDate = `${year}-${month}-01`;
  const endDate = `${year}-${month}-${day}`;
  return { startDate, endDate };
}

/**
 * Lấy khoảng ngày của một Quý cụ thể (1-4) trong năm referenceYear
 */
function getQuarterRange(quarter, referenceYear) {
  const year = referenceYear || new Date().getFullYear();
  const quarterStartMonths = [0, 3, 6, 9]; // Jan, Apr, Jul, Oct (0-indexed)
  const quarterEndMonths = [2, 5, 8, 11];  // Mar, Jun, Sep, Dec

  const startMonth = quarterStartMonths[quarter - 1];
  const endMonth = quarterEndMonths[quarter - 1];

  const startDate = new Date(year, startMonth, 1);
  const endDate = new Date(year, endMonth + 1, 0); // Ngày cuối của tháng

  return {
    startDate: formatDate(startDate),
    endDate: formatDate(endDate)
  };
}

/**
 * Lấy khoảng ngày của cả năm
 */
function getYearRange(year) {
  const y = year || new Date().getFullYear();
  return {
    startDate: `${y}-01-01`,
    endDate: `${y}-12-31`
  };
}

/**
 * Lấy khoảng ngày của tháng trước
 */
function getLastMonthRange() {
  const now = new Date();
  const firstDayThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastDayLastMonth = new Date(firstDayThisMonth - 1);
  const firstDayLastMonth = new Date(lastDayLastMonth.getFullYear(), lastDayLastMonth.getMonth(), 1);
  return {
    startDate: formatDate(firstDayLastMonth),
    endDate: formatDate(lastDayLastMonth)
  };
}

function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDateVN(dateStr) {
  if (!dateStr) return '';
  const [year, month, day] = dateStr.split('-');
  return `${day}/${month}/${year}`;
}

// ================================================================
// CÁC NÚT BẤM CHU KỲ CỐ ĐỊNH
// ================================================================
const CURRENT_YEAR = new Date().getFullYear();

function buildPresetPills() {
  const mtd = getMTDRange();
  const q1 = getQuarterRange(1, CURRENT_YEAR);
  const q2 = getQuarterRange(2, CURRENT_YEAR);
  const q3 = getQuarterRange(3, CURRENT_YEAR);
  const q4 = getQuarterRange(4, CURRENT_YEAR);
  const year = getYearRange(CURRENT_YEAR);
  const lastMonth = getLastMonthRange();

  return [
    {
      id: 'mtd',
      label: `Tháng này (MTD)`,
      shortLabel: 'Tháng này',
      icon: '📅',
      color: 'blue',
      ...mtd
    },
    {
      id: 'last_month',
      label: 'Tháng trước',
      shortLabel: 'T.Trước',
      icon: '📆',
      color: 'slate',
      ...lastMonth
    },
    {
      id: 'q1',
      label: 'Quý 1 (T1-T3)',
      shortLabel: 'Q1',
      icon: '1️⃣',
      color: 'indigo',
      ...q1
    },
    {
      id: 'q2',
      label: 'Quý 2 (T4-T6)',
      shortLabel: 'Q2',
      icon: '2️⃣',
      color: 'violet',
      ...q2
    },
    {
      id: 'q3',
      label: 'Quý 3 (T7-T9)',
      shortLabel: 'Q3',
      icon: '3️⃣',
      color: 'purple',
      ...q3
    },
    {
      id: 'q4',
      label: 'Quý 4 (T10-T12)',
      shortLabel: 'Q4',
      icon: '4️⃣',
      color: 'fuchsia',
      ...q4
    },
    {
      id: `year_${CURRENT_YEAR}`,
      label: `Năm ${CURRENT_YEAR}`,
      shortLabel: `${CURRENT_YEAR}`,
      icon: '🗓️',
      color: 'emerald',
      ...year
    },
    {
      id: 'all',
      label: 'Toàn bộ',
      shortLabel: 'Tất cả',
      icon: '∞',
      color: 'rose',
      startDate: null,
      endDate: null
    }
  ];
}

// Kiểu dáng tối giản chuẩn doanh nghiệp (Đồng bộ Slate / Monochrome, không lòe loẹt đa màu)
const ENTERPRISE_PILL_STYLE = {
  active: 'bg-slate-900 text-white border-slate-900 shadow-xs font-semibold',
  inactive: 'bg-slate-100 text-slate-600 hover:text-slate-900 hover:bg-slate-200/80 border-transparent font-medium'
};

// ================================================================
// COMPONENT CHÍNH: TimeFilterPills
// ================================================================

/**
 * @param {function} onChange - Callback khi filter thay đổi: onChange({ startDate, endDate, label })
 * @param {object} currentFilter - Bộ lọc hiện tại { startDate, endDate }
 */
export default function TimeFilterPills({ onChange, currentFilter = {} }) {
  const presetPills = useMemo(() => buildPresetPills(), []);

  // State cho bộ lọc tùy chọn ngày
  const [showCustomPicker, setShowCustomPicker] = useState(false);
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  // Xác định pill nào đang được chọn (dựa trên startDate/endDate hiện tại)
  const activePillId = useMemo(() => {
    if (!currentFilter.startDate && !currentFilter.endDate) return 'all';
    const match = presetPills.find(p =>
      p.startDate === currentFilter.startDate &&
      p.endDate === currentFilter.endDate
    );
    return match ? match.id : 'custom';
  }, [currentFilter, presetPills]);

  // Xử lý bấm chọn một pill preset
  const handlePresetClick = (pill) => {
    setShowCustomPicker(false);
    onChange({
      startDate: pill.startDate,
      endDate: pill.endDate,
      label: pill.label,
      type: pill.id
    });
  };

  // Xử lý áp dụng bộ lọc tùy chọn
  const handleCustomApply = () => {
    if (!customStart || !customEnd) {
      alert('Vui lòng chọn cả Ngày bắt đầu và Ngày kết thúc.');
      return;
    }
    if (customStart > customEnd) {
      alert('Ngày bắt đầu phải nhỏ hơn hoặc bằng Ngày kết thúc.');
      return;
    }
    onChange({
      startDate: customStart,
      endDate: customEnd,
      label: `${formatDateVN(customStart)} → ${formatDateVN(customEnd)}`,
      type: 'custom'
    });
    setShowCustomPicker(false);
  };

  // Hiển thị nhãn chu kỳ hiện tại
  const currentLabel = useMemo(() => {
    if (activePillId === 'custom') {
      return `${formatDateVN(currentFilter.startDate)} → ${formatDateVN(currentFilter.endDate)}`;
    }
    const pill = presetPills.find(p => p.id === activePillId);
    return pill ? pill.label : 'Toàn bộ dữ liệu';
  }, [activePillId, currentFilter, presetPills]);

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="flex items-center space-x-2">
          <CalendarDays className="w-4 h-4 text-slate-700" />
          <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">Chu Kỳ Hoạch Toán</span>
        </div>
        <div className="flex items-center space-x-1.5 text-xs text-slate-500">
          <Clock className="w-3.5 h-3.5 text-slate-400" />
          <span>Đang chọn:</span>
          <span className="font-semibold text-slate-900 bg-slate-100 px-2.5 py-0.5 rounded-md border border-slate-200 font-mono text-[11px]">
            {currentLabel}
          </span>
          {currentFilter.startDate && (
            <span className="text-slate-400 font-mono text-[10px]">
              ({formatDateVN(currentFilter.startDate)}
              {currentFilter.endDate && ` → ${formatDateVN(currentFilter.endDate)}`})
            </span>
          )}
        </div>
      </div>

      {/* Pills Row */}
      <div className="px-3.5 py-2.5 flex flex-wrap gap-1.5 items-center bg-slate-50/50">
        {presetPills.map((pill) => {
          const isActive = activePillId === pill.id;
          return (
            <button
              key={pill.id}
              onClick={() => handlePresetClick(pill)}
              className={`
                inline-flex items-center space-x-1 px-3 py-1.5 rounded-lg border text-xs
                transition-all duration-150 active:scale-95 select-none
                ${isActive ? ENTERPRISE_PILL_STYLE.active : ENTERPRISE_PILL_STYLE.inactive}
              `}
              title={`Lọc dữ liệu theo ${pill.label}${pill.startDate ? `: ${formatDateVN(pill.startDate)} - ${formatDateVN(pill.endDate)}` : ''}`}
            >
              <span className="text-xs">{pill.icon}</span>
              <span className="hidden sm:inline">{pill.label}</span>
              <span className="sm:hidden">{pill.shortLabel}</span>
            </button>
          );
        })}

        {/* Nút Tùy chọn khoảng ngày */}
        <button
          onClick={() => setShowCustomPicker(!showCustomPicker)}
          className={`
            inline-flex items-center space-x-1 px-3 py-1.5 rounded-lg border text-xs
            transition-all duration-150 active:scale-95
            ${activePillId === 'custom' || showCustomPicker
              ? ENTERPRISE_PILL_STYLE.active
              : ENTERPRISE_PILL_STYLE.inactive
            }
          `}
          title="Tùy chọn khoảng ngày bất kỳ"
        >
          <Calendar className="w-3.5 h-3.5" />
          <span>Tùy chọn ngày</span>
          <ChevronRight className={`w-3 h-3 transition-transform ${showCustomPicker ? 'rotate-90' : ''}`} />
        </button>
      </div>

      {/* Custom Date Picker Panel */}
      {showCustomPicker && (
        <div className="m-3 p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-3 animate-fade-in">
          <div className="flex items-center space-x-2 text-xs font-semibold text-slate-800">
            <Calendar className="w-3.5 h-3.5 text-slate-600" />
            <span>Chọn khoảng ngày tùy chỉnh:</span>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-end">
            <div className="flex-1">
              <label className="block text-[11px] font-medium text-slate-600 mb-1">
                Từ ngày (bắt đầu):
              </label>
              <input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                max={customEnd || undefined}
                className="w-full px-3 py-1.5 text-xs border border-slate-300 bg-white rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-400 font-mono"
              />
            </div>
            <div className="flex items-center text-slate-400 font-bold text-sm hidden sm:flex">→</div>
            <div className="flex-1">
              <label className="block text-[11px] font-medium text-slate-600 mb-1">
                Đến ngày (kết thúc):
              </label>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                min={customStart || undefined}
                className="w-full px-3 py-1.5 text-xs border border-slate-300 bg-white rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-400 font-mono"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleCustomApply}
                disabled={!customStart || !customEnd}
                className="px-4 py-1.5 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 disabled:cursor-not-allowed text-white text-xs font-semibold rounded-lg transition-all active:scale-95 shadow-xs"
              >
                Áp Dụng
              </button>
              <button
                onClick={() => setShowCustomPicker(false)}
                className="px-3 py-1.5 bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-medium rounded-lg transition-all"
              >
                Hủy
              </button>
            </div>
          </div>


          {/* Gợi ý nhanh cho bộ lọc tùy chọn */}
          <div className="flex flex-wrap gap-1.5 pt-2 border-t border-slate-200">
            <span className="text-[11px] text-slate-500 font-medium self-center">Gợi ý nhanh:</span>
            {[
              { label: '7 ngày qua', days: 7 },
              { label: '14 ngày qua', days: 14 },
              { label: '30 ngày qua', days: 30 },
              { label: '60 ngày qua', days: 60 },
              { label: '90 ngày qua', days: 90 }
            ].map(({ label, days }) => {
              const end = new Date();
              const start = new Date();
              start.setDate(start.getDate() - days + 1);
              return (
                <button
                  key={days}
                  onClick={() => {
                    const s = formatDate(start);
                    const e = formatDate(end);
                    setCustomStart(s);
                    setCustomEnd(e);
                  }}
                  className="px-2 py-0.5 text-[11px] font-medium bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 rounded-md transition-colors"
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
