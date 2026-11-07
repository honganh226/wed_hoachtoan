import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import {
  Printer,
  Download,
  Calendar,
  Truck,
  Building2,
  TrendingUp,
  BarChart3,
  Layers,
  CreditCard,
  Search,
  CheckCircle2,
  AlertCircle,
  ArrowUpRight,
  ArrowDownRight,
  RefreshCw,
  FileSpreadsheet,
  Filter,
  X,
  Eye,
  Coins,
  Fuel
} from 'lucide-react';
import { formatVnd, formatTrieuDong } from '../data/unifiedBusinessData';
import {
  fetchBusinessTripsApi,
  fetchBusinessDebtsApi,
  fetchBusinessGroupsApi
} from '../services/api.js';
import {
  computeTripFinancials,
  computeAggregateMetrics,
  getTripAccountingMonth,
  getTripAccountingYear
} from '../utils/tripFinancials.js';

const MONTHS_CONFIG = Array.from({ length: 12 }, (_, idx) => {
  const m = String(idx + 1).padStart(2, '0');
  return {
    index: idx + 1,
    monthCode: m,
    filterKey: `month_${m}`,
    quarter: Math.floor(idx / 3) + 1,
    shortLabel: `T${idx + 1}`,
    label: `Tháng ${m}`
  };
});

const QUARTERS_CONFIG = [
  { index: 1, filterKey: 'q_1', label: 'Quý 1', months: ['01', '02', '03'] },
  { index: 2, filterKey: 'q_2', label: 'Quý 2', months: ['04', '05', '06'] },
  { index: 3, filterKey: 'q_3', label: 'Quý 3', months: ['07', '08', '09'] },
  { index: 4, filterKey: 'q_4', label: 'Quý 4', months: ['10', '11', '12'] }
];

/**
 * Xây dựng danh mục dòng P&L đa tầng chuẩn Tập đoàn (MS.01 -> MS.75)
 * từ đối tượng metrics đã tính bởi computeAggregateMetrics
 */
export function buildCorporatePlRows(metrics, revenueBasis = 'SAU_TRU_17') {
  const revMain =
    revenueBasis === 'GOC_CHUA_VAT' ? metrics.totalCuocGoc : metrics.totalCuocSauTru17;
  const revOwn =
    revenueBasis === 'GOC_CHUA_VAT' ? metrics.ownCuocGoc : metrics.ownCuocSauTru17;
  const revExt =
    revenueBasis === 'GOC_CHUA_VAT' ? metrics.extCuocGoc : metrics.extCuocSauTru17;
  const grossMain =
    revenueBasis === 'GOC_CHUA_VAT' ? metrics.grossProfitGoc : metrics.grossProfitSauTru17;
  const grossMarginPct =
    revenueBasis === 'GOC_CHUA_VAT'
      ? metrics.grossMarginGocPct
      : metrics.grossMarginSauTru17Pct;
  const netMain =
    revenueBasis === 'GOC_CHUA_VAT'
      ? metrics.totalChenhLechTruocTruGoc
      : metrics.totalChenhLechSauTru17;
  const netMarginPct =
    revenueBasis === 'GOC_CHUA_VAT' ? metrics.netMarginGocPct : metrics.netMarginSauTru17Pct;

  const pctOfRev = (val) => {
    if (!revMain || revMain <= 0) return 0;
    return Math.round((val / revMain) * 1000) / 10;
  };

  return [
    {
      code: 'MS.01',
      section: 'I. SẢN LƯỢNG & DOANH THU CƯỚC VẬN TẢI (REVENUE)',
      name: 'Tổng sản lượng vận hành (Tổng số chuyến = Xe nhà + Xe ngoài)',
      isVolume: true,
      value: metrics.completedCount,
      subText: `${metrics.houseTripsCount} chuyến xe nhà / ${metrics.subTripsCount} chuyến thuê ngoài`,
      pct: null,
      rowType: 'volume'
    },
    {
      code: 'MS.10',
      name: 'Tổng Doanh thu Cước gốc chưa VAT (Cước vào gốc)',
      value: metrics.totalCuocGoc,
      pct: pctOfRev(metrics.totalCuocGoc),
      rowType: revenueBasis === 'GOC_CHUA_VAT' ? 'highlight_navy' : 'normal'
    },
    {
      code: 'MS.11',
      name: '  • Doanh thu cước gốc Đội xe nhà (Core Fleet)',
      value: metrics.ownCuocGoc,
      pct: pctOfRev(metrics.ownCuocGoc),
      rowType: 'sub'
    },
    {
      code: 'MS.12',
      name: '  • Doanh thu cước gốc Điều phối xe thuê ngoài (Sub-contract)',
      value: metrics.extCuocGoc,
      pct: pctOfRev(metrics.extCuocGoc),
      rowType: 'sub'
    },
    {
      code: 'MS.13',
      name: 'Thuế GTGT đầu ra (VAT 8% = Cước gốc × 8%)',
      value: metrics.totalVat8,
      pct: pctOfRev(metrics.totalVat8),
      rowType: 'sub'
    },
    {
      code: 'MS.14',
      name: 'Tổng Doanh thu Cước có VAT (Cước gốc × 1,08)',
      value: metrics.totalCuocCoVat,
      pct: pctOfRev(metrics.totalCuocCoVat),
      rowType: 'normal'
    },
    {
      code: 'MS.15',
      name: 'Khoản trừ nội bộ 17% (Cước có VAT × 17% — Quy tắc Giám đốc)',
      value: -metrics.totalKhoanTru17,
      pct: -pctOfRev(metrics.totalKhoanTru17),
      rowType: 'deduction'
    },
    {
      code: 'MS.16',
      name: 'TỔNG DOANH THU CƯỚC THUẦN SAU TRỪ 17% (Cước có VAT × 0,83)',
      value: metrics.totalCuocSauTru17,
      pct: pctOfRev(metrics.totalCuocSauTru17),
      rowType: revenueBasis === 'SAU_TRU_17' ? 'highlight_navy' : 'subtotal'
    },
    {
      code: 'MS.16A',
      name: '  • Doanh thu sau trừ 17% — Đội xe nhà',
      value: metrics.ownCuocSauTru17,
      pct: pctOfRev(metrics.ownCuocSauTru17),
      rowType: 'sub'
    },
    {
      code: 'MS.16B',
      name: '  • Doanh thu sau trừ 17% — Điều phối xe thuê ngoài',
      value: metrics.extCuocSauTru17,
      pct: pctOfRev(metrics.extCuocSauTru17),
      rowType: 'sub'
    },
    {
      code: 'MS.20',
      section: 'II. GIÁ VỐN HÀNG BÁN TRỰC TIẾP CHUYẾN XE (DIRECT COGS)',
      name: 'TỔNG GIÁ VỐN TRỰC TIẾP (COGS = MS.21 + MS.22 + MS.23 + MS.24)',
      value: metrics.totalCogs,
      pct: pctOfRev(metrics.totalCogs),
      rowType: 'subtotal_amber'
    },
    {
      code: 'MS.21',
      name: '  • Chi phí thuê xe ngoài / Cước ra (Sub-contract Cost)',
      value: metrics.totalCuocRa,
      pct: pctOfRev(metrics.totalCuocRa),
      rowType: 'sub'
    },
    {
      code: 'MS.22',
      name: `  • Chi phí nhiên liệu Dầu Diesel (${metrics.totalFuelLiters.toLocaleString('vi-VN')} Lít cấp)`,
      value: metrics.totalTienDau,
      pct: pctOfRev(metrics.totalTienDau),
      rowType: 'sub',
      note:
        metrics.missingFuelPriceTrips > 0
          ? `${metrics.missingFuelPriceTrips} cuốc chờ nhập đơn giá dầu ngày chạy`
          : null
    },
    {
      code: 'MS.23',
      name: '  • Chi phí tiền đường, vé trạm BOT & cao tốc',
      value: metrics.totalToll,
      pct: pctOfRev(metrics.totalToll),
      rowType: 'sub'
    },
    {
      code: 'MS.24',
      name: '  • Chi phí nâng hạ container công ty chịu (Tách riêng phơi trả hộ)',
      value: metrics.totalPhiNangHa,
      pct: pctOfRev(metrics.totalPhiNangHa),
      rowType: 'sub'
    },
    {
      code: 'MS.30',
      name:
        revenueBasis === 'GOC_CHUA_VAT'
          ? 'LỢI NHUẬN GỘP / CHÊNH LỆCH SAU GIÁ VỐN (MS.10 - MS.20)'
          : 'LỢI NHUẬN GỘP / CHÊNH LỆCH SAU GIÁ VỐN (MS.16 - MS.20)',
      value: grossMain,
      pct: grossMarginPct,
      rowType: 'highlight_teal'
    },
    {
      code: 'MS.40',
      section: 'III. CHI PHÍ VẬN HÀNH (OPEX) & CHÊNH LỆCH TẠM TÍNH',
      name: 'TỔNG CHI PHÍ VẬN HÀNH & PHÁT SINH TẠI CHUYẾN (OPEX = MS.41 + MS.42)',
      value: metrics.totalOpex,
      pct: pctOfRev(metrics.totalOpex),
      rowType: 'subtotal'
    },
    {
      code: 'MS.41',
      name: '  • Chi phí lương cứng + phụ cấp lái xe (Theo dõi tại Bảng lương riêng)',
      value: 0,
      pct: 0,
      rowType: 'sub',
      note: 'Chưa trừ lương tại bảng kê chuyến'
    },
    {
      code: 'MS.42',
      name: '  • Chi phí phát sinh tại chuyến, sửa chữa & chi phí khác công ty chịu',
      value: metrics.totalPhatSinh,
      pct: pctOfRev(metrics.totalPhatSinh),
      rowType: 'sub'
    },
    {
      code: 'MS.50',
      name: 'TỔNG CHI PHÍ CÔNG TY GHI NHẬN TẠI CHUYẾN (MS.20 + MS.40)',
      value: metrics.totalChiPhiCongTy,
      pct: pctOfRev(metrics.totalChiPhiCongTy),
      rowType: 'subtotal_amber'
    },
    {
      code: 'MS.60',
      name:
        revenueBasis === 'GOC_CHUA_VAT'
          ? 'CHÊNH LỆCH TẠM TÍNH TRƯỚC KHOẢN TRỪ 17% (MS.10 - MS.50 • Chưa trừ lương)'
          : 'CHÊNH LỆCH TẠM TÍNH SAU KHOẢN TRỪ 17% (MS.16 - MS.50 • Chưa trừ lương)',
      value: netMain,
      pct: netMarginPct,
      rowType: 'grand_total_emerald'
    },
    {
      code: 'MS.61',
      name:
        revenueBasis === 'GOC_CHUA_VAT'
          ? '  • Đối chiếu: Chênh lệch tạm tính SAU khoản trừ 17% (MS.16 - MS.50)'
          : '  • Đối chiếu: Chênh lệch tạm tính TRƯỚC khoản trừ 17% (MS.10 - MS.50)',
      value:
        revenueBasis === 'GOC_CHUA_VAT'
          ? metrics.totalChenhLechSauTru17
          : metrics.totalChenhLechTruocTruGoc,
      pct:
        revenueBasis === 'GOC_CHUA_VAT'
          ? metrics.netMarginSauTru17Pct
          : metrics.netMarginGocPct,
      rowType: 'sub'
    },
    {
      code: 'MS.70',
      section: 'IV. VỐN LƯU ĐỘNG, CÔNG NỢ (AR/AP), TIỀN PHƠI & DÒNG TIỀN (CASH FLOW)',
      name: 'Dòng tiền cước đã thu & đối trừ từ khách hàng (Cash Collected + Offset)',
      value: metrics.cashSettledKhach,
      pct: metrics.collectionRatePct,
      rowType: 'normal'
    },
    {
      code: 'MS.71',
      name: 'Công nợ cước phải thu khách hàng cuối kỳ (AR Outstanding)',
      value: metrics.totalConPhaiThuKhach,
      pct:
        metrics.totalCuocGoc > 0
          ? Math.round((metrics.totalConPhaiThuKhach / metrics.totalCuocGoc) * 1000) / 10
          : 0,
      rowType: 'highlight_rose'
    },
    {
      code: 'MS.72',
      name: 'Tỷ lệ thu hồi công nợ cước khách hàng (Collection Rate %)',
      isPercentOnly: true,
      value: metrics.collectionRatePct,
      pct: metrics.collectionRatePct,
      rowType: 'sub'
    },
    {
      code: 'MS.73',
      name: 'Công nợ cước thuê ngoài còn phải trả nhà xe (AP Outstanding)',
      value: metrics.totalConPhaiTraNhaXe,
      pct: pctOfRev(metrics.totalConPhaiTraNhaXe),
      rowType: 'normal'
    },
    {
      code: 'MS.74',
      name: 'Lưu chuyển tiền tệ thuần tạm tính từ HĐKD (Thực thu cước - Thực chi trực tiếp)',
      value: metrics.netOperatingCashFlow,
      pct: pctOfRev(metrics.netOperatingCashFlow),
      rowType: 'subtotal'
    },
    {
      code: 'MS.75',
      name: 'Tiền phơi trả hộ chủ hàng (Tách riêng khỏi doanh thu & chi phí chuyến)',
      value: metrics.totalPhoiTraHo,
      subText: `Còn phải thu hoàn phơi: ${formatVnd(metrics.totalPhoiConPhaiThu)}`,
      pct: null,
      rowType: 'sub'
    }
  ];
}

export default function CorporateFinancialReportView({
  initialTripsData = null,
  initialYear = '2026',
  initialPeriod = 'all',
  onSelectTrip,
  embedded = false
}) {
  const [tripsData, setTripsData] = useState(initialTripsData || []);
  const [debtsData, setDebtsData] = useState(null);
  const [loading, setLoading] = useState(!initialTripsData);
  const [loadError, setLoadError] = useState(null);

  // 1. Bộ lọc cấp Tập đoàn (Năm tài chính, Kỳ Năm/Quý/Tháng, Đầu xe, Cơ sở Doanh thu, Từ khóa)
  const [selectedYear, setSelectedYear] = useState(initialYear);
  const [selectedPeriod, setSelectedPeriod] = useState(initialPeriod); // 'all' | 'q_1'..'q_4' | 'month_01'..'month_12'
  const [selectedVehicleFilter, setSelectedVehicleFilter] = useState('ALL'); // 'ALL' | 'OWN_FLEET' | 'SUBCONTRACT' | plate
  const [revenueBasis, setRevenueBasis] = useState('SAU_TRU_17'); // 'SAU_TRU_17' | 'GOC_CHUA_VAT'
  const [searchQuery, setSearchQuery] = useState('');

  // 2. Hệ thống 4 Tab Báo Cáo Chuyên Sâu
  // 'ANNUAL_QUARTERLY' | 'MONTHLY_MATRIX' | 'UNIT_ECONOMICS' | 'AR_AP_AGING'
  const [activeReportTab, setActiveReportTab] = useState('ANNUAL_QUARTERLY');

  // Tháng đang được chọn để phân tích chuyên sâu MoM trong Tab 2 (1..12)
  const [focusedMonthCode, setFocusedMonthCode] = useState('01');

  // Biển số xe chủ lực đang được chọn để xem 12 tháng trong Tab 3 (mặc định 15H00266)
  const [focusedTruckPlate, setFocusedTruckPlate] = useState('15H00266');

  // Bộ lọc trạng thái công nợ trong Tab 4
  const [arStatusFilter, setArStatusFilter] = useState('ALL'); // 'ALL' | 'HAS_AR' | 'SETTLED' | 'HAS_PHOI'

  // 3. Modal Xem trước & In Báo Cáo Tài Chính (Hỗ trợ in bất kỳ tháng nào T1-T12, Quý Q1-Q4, hoặc Cả Năm)
  const [printModalOpen, setPrintModalOpen] = useState(false);
  const [printReportPeriod, setPrintReportPeriod] = useState('all'); // 'all' | 'q_1'..'q_4' | 'month_01'..'month_12'
  const [printIncludeCharts, setPrintIncludeCharts] = useState(true);
  const [printIncludeMonthlyMatrix, setPrintIncludeMonthlyMatrix] = useState(true);
  const [printIncludeUnitEconomics, setPrintIncludeUnitEconomics] = useState(true);
  const [printIncludeArAp, setPrintIncludeArAp] = useState(true);
  const [printIncludeTripsAppendix, setPrintIncludeTripsAppendix] = useState(false);

  const printContainerRef = useRef(null);

  // Đồng bộ khi initialTripsData thay đổi từ component cha
  useEffect(() => {
    if (Array.isArray(initialTripsData)) {
      setTripsData(initialTripsData);
      setLoading(false);
    }
  }, [initialTripsData]);

  // Đồng bộ focusedMonthCode khi người dùng chọn kỳ là 1 tháng cụ thể
  useEffect(() => {
    if (selectedPeriod.startsWith('month_')) {
      setFocusedMonthCode(selectedPeriod.slice(6));
    }
  }, [selectedPeriod]);

  const loadFinancialData = useCallback(async () => {
    try {
      setLoading(true);
      setLoadError(null);
      const [trRes, debtsRes] = await Promise.all([
        fetchBusinessTripsApi(),
        fetchBusinessDebtsApi({}).catch(() => ({ success: false }))
      ]);
      if (trRes && trRes.success) {
        setTripsData(trRes.data?.trips || []);
        if (debtsRes && debtsRes.success) {
          setDebtsData(debtsRes.data);
        }
      } else {
        setLoadError(trRes?.error || 'Không thể tải dữ liệu báo cáo tài chính.');
      }
    } catch (err) {
      setLoadError(err.message || 'Lỗi kết nối máy chủ khi tải báo cáo tài chính.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!initialTripsData) {
      loadFinancialData();
    } else {
      fetchBusinessDebtsApi({})
        .then((res) => {
          if (res?.success) setDebtsData(res.data);
        })
        .catch(() => {});
    }
  }, [initialTripsData, loadFinancialData]);

  // Danh sách các năm tài chính có trong dữ liệu (mặc định luôn có 2026)
  const availableYears = useMemo(() => {
    const yearsSet = new Set(['2026']);
    tripsData.forEach((t) => {
      const yr = getTripAccountingYear(t);
      if (yr) yearsSet.add(yr);
    });
    return Array.from(yearsSet).sort().reverse();
  }, [tripsData]);

  // Danh sách biển số xe nhà thực tế trong năm
  const housePlatesList = useMemo(() => {
    const plates = new Set([
      '15H00266',
      '15H04255',
      '15H01492',
      '15C35981',
      '15C22405',
      '15H02477'
    ]);
    tripsData.forEach((t) => {
      if (!t.is_subcontractor) {
        const p = String(t.vehicle_plate || t.so_xe || '').trim();
        if (p && p !== 'Xe ngoài' && p !== 'ĐÃ TT' && p !== 'MẸ ĐÃ TT') {
          plates.add(p);
        }
      }
    });
    return Array.from(plates).sort();
  }, [tripsData]);

  // Lọc chuyến theo Năm tài chính + Đầu xe + Từ khóa tìm kiếm (Tập nền của cả năm để tính 12 tháng & 4 quý)
  const yearAndFleetFilteredTrips = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return tripsData.filter((t) => {
      const yr = getTripAccountingYear(t);
      if (yr !== selectedYear) return false;

      if (selectedVehicleFilter === 'OWN_FLEET' && t.is_subcontractor) return false;
      if (selectedVehicleFilter === 'SUBCONTRACT' && !t.is_subcontractor) return false;
      if (
        selectedVehicleFilter !== 'ALL' &&
        selectedVehicleFilter !== 'OWN_FLEET' &&
        selectedVehicleFilter !== 'SUBCONTRACT'
      ) {
        const plate = String(t.vehicle_plate || t.so_xe || '').trim();
        if (t.is_subcontractor || plate !== selectedVehicleFilter) return false;
      }

      if (q) {
        const matchCustomer = String(t.customer_name || '').toLowerCase().includes(q);
        const matchPlate = String(t.vehicle_plate || '').toLowerCase().includes(q);
        const matchSub = String(t.subcontractor_name || '').toLowerCase().includes(q);
        const matchRoute = String(t.route_name || '').toLowerCase().includes(q);
        const matchCont = String(t.container_number || '').toLowerCase().includes(q);
        if (!matchCustomer && !matchPlate && !matchSub && !matchRoute && !matchCont) {
          return false;
        }
      }
      return true;
    });
  }, [tripsData, selectedYear, selectedVehicleFilter, searchQuery]);

  // Lọc tiếp theo Kỳ đang chọn (Cả năm / Quý 1..4 / Tháng 01..12)
  const activePeriodTrips = useMemo(() => {
    if (selectedPeriod === 'all') return yearAndFleetFilteredTrips;
    if (selectedPeriod.startsWith('month_')) {
      const mCode = selectedPeriod.slice(6);
      const targetYm = `${selectedYear}-${mCode}`;
      return yearAndFleetFilteredTrips.filter((t) => getTripAccountingMonth(t) === targetYm);
    }
    if (selectedPeriod.startsWith('q_')) {
      const qIdx = parseInt(selectedPeriod.slice(2), 10);
      const qCfg = QUARTERS_CONFIG.find((q) => q.index === qIdx);
      if (!qCfg) return yearAndFleetFilteredTrips;
      const validYms = new Set(qCfg.months.map((m) => `${selectedYear}-${m}`));
      return yearAndFleetFilteredTrips.filter((t) => validYms.has(getTripAccountingMonth(t)));
    }
    return yearAndFleetFilteredTrips;
  }, [yearAndFleetFilteredTrips, selectedPeriod, selectedYear]);

  // Nhãn hiển thị của kỳ đang chọn
  const activePeriodLabel = useMemo(() => {
    if (selectedPeriod === 'all') return `Cả Năm ${selectedYear}`;
    if (selectedPeriod.startsWith('month_')) {
      const mCode = selectedPeriod.slice(6);
      return `Tháng ${mCode}/${selectedYear}`;
    }
    if (selectedPeriod.startsWith('q_')) {
      const qIdx = parseInt(selectedPeriod.slice(2), 10);
      return `Quý ${qIdx}/${selectedYear}`;
    }
    return `Năm ${selectedYear}`;
  }, [selectedPeriod, selectedYear]);

  // 1. Chỉ số tổng hợp của Kỳ đang chọn (dùng cho 4 thẻ KPI chiến lược)
  const activePeriodMetrics = useMemo(() => {
    return computeAggregateMetrics(activePeriodTrips);
  }, [activePeriodTrips]);

  // 2. Chỉ số của từng tháng T1..T12 trong năm đang chọn
  const monthlyDataList = useMemo(() => {
    return MONTHS_CONFIG.map((mCfg) => {
      const targetYm = `${selectedYear}-${mCfg.monthCode}`;
      const mTrips = yearAndFleetFilteredTrips.filter(
        (t) => getTripAccountingMonth(t) === targetYm
      );
      const metrics = computeAggregateMetrics(mTrips);
      const plRows = buildCorporatePlRows(metrics, revenueBasis);
      return {
        ...mCfg,
        ym: targetYm,
        fullLabel: `Tháng ${mCfg.monthCode}/${selectedYear}`,
        trips: mTrips,
        metrics,
        plRows,
        hasData: mTrips.length > 0
      };
    });
  }, [yearAndFleetFilteredTrips, selectedYear, revenueBasis]);

  // 3. Chỉ số của 4 Quý (Q1..Q4) và Cả năm
  const quarterlyDataList = useMemo(() => {
    return QUARTERS_CONFIG.map((qCfg) => {
      const validYms = new Set(qCfg.months.map((m) => `${selectedYear}-${m}`));
      const qTrips = yearAndFleetFilteredTrips.filter((t) =>
        validYms.has(getTripAccountingMonth(t))
      );
      const metrics = computeAggregateMetrics(qTrips);
      const plRows = buildCorporatePlRows(metrics, revenueBasis);
      return {
        ...qCfg,
        fullLabel: `${qCfg.label}/${selectedYear}`,
        trips: qTrips,
        metrics,
        plRows
      };
    });
  }, [yearAndFleetFilteredTrips, selectedYear, revenueBasis]);

  const annualSummary = useMemo(() => {
    const metrics = computeAggregateMetrics(yearAndFleetFilteredTrips);
    const plRows = buildCorporatePlRows(metrics, revenueBasis);
    const activeMonthsCount = monthlyDataList.filter((m) => m.hasData).length || 1;
    return {
      metrics,
      plRows,
      activeMonthsCount
    };
  }, [yearAndFleetFilteredTrips, revenueBasis, monthlyDataList]);

  // 4. Phân tích chuyên sâu Tháng đang chọn (Tab 2) kèm so sánh MoM với tháng liền trước
  const focusedMonthAnalysis = useMemo(() => {
    const idx = Math.max(
      0,
      monthlyDataList.findIndex((m) => m.monthCode === focusedMonthCode)
    );
    const currentMonth = monthlyDataList[idx] || monthlyDataList[0];
    const prevMonth = idx > 0 ? monthlyDataList[idx - 1] : null;
    return {
      currentMonth,
      prevMonth
    };
  }, [monthlyDataList, focusedMonthCode]);

  // 5. Phân tích Hiệu suất Đội xe (Unit Economics per Truck/Trip - Tab 3)
  const unitEconomicsData = useMemo(() => {
    const rows = [];
    // Từng đầu xe nhà
    housePlatesList.forEach((plate) => {
      const pTrips = activePeriodTrips.filter(
        (t) => !t.is_subcontractor && String(t.vehicle_plate || t.so_xe || '').trim() === plate
      );
      const m = computeAggregateMetrics(pTrips);
      const rev = revenueBasis === 'GOC_CHUA_VAT' ? m.totalCuocGoc : m.totalCuocSauTru17;
      const profit =
        revenueBasis === 'GOC_CHUA_VAT'
          ? m.totalChenhLechTruocTruGoc
          : m.totalChenhLechSauTru17;
      const marginPct = rev > 0 ? Math.round((profit / rev) * 1000) / 10 : 0;
      const count = m.completedCount || 0;

      rows.push({
        id: plate,
        label: `Đầu kéo ${plate}`,
        category: 'OWN_TRUCK',
        tripsCount: count,
        cuocGoc: m.totalCuocGoc,
        cuocSauTru17: m.totalCuocSauTru17,
        revMain: rev,
        fuelLiters: m.totalFuelLiters,
        fuelCost: m.totalTienDau,
        tollCost: m.totalToll,
        liftAndOtherCost: m.totalPhiNangHa + m.totalPhatSinh,
        subCost: 0,
        totalCost: m.totalChiPhiCongTy,
        profitMain: profit,
        marginPct,
        revPerTrip: count > 0 ? Math.round(rev / count) : 0,
        fuelLitersPerTrip: count > 0 ? Math.round((m.totalFuelLiters / count) * 10) / 10 : 0,
        profitPerTrip: count > 0 ? Math.round(profit / count) : 0
      });
    });

    rows.sort((a, b) => b.profitMain - a.profitMain || b.tripsCount - a.tripsCount);

    // Khối Điều phối xe thuê ngoài
    const subTrips = activePeriodTrips.filter((t) => t.is_subcontractor);
    const subM = computeAggregateMetrics(subTrips);
    const subRev =
      revenueBasis === 'GOC_CHUA_VAT' ? subM.totalCuocGoc : subM.totalCuocSauTru17;
    const subProfit =
      revenueBasis === 'GOC_CHUA_VAT'
        ? subM.totalChenhLechTruocTruGoc
        : subM.totalChenhLechSauTru17;
    const subCount = subM.completedCount || 0;

    const subRow = {
      id: 'SUBCONTRACT_ALL',
      label: `Điều phối Xe thuê ngoài (${subM.subPartnersCount} nhà xe)`,
      category: 'SUBCONTRACT',
      tripsCount: subCount,
      cuocGoc: subM.totalCuocGoc,
      cuocSauTru17: subM.totalCuocSauTru17,
      revMain: subRev,
      fuelLiters: subM.totalFuelLiters,
      fuelCost: subM.totalTienDau,
      tollCost: subM.totalToll,
      liftAndOtherCost: subM.totalPhiNangHa + subM.totalPhatSinh,
      subCost: subM.totalCuocRa,
      totalCost: subM.totalChiPhiCongTy,
      profitMain: subProfit,
      marginPct: subRev > 0 ? Math.round((subProfit / subRev) * 1000) / 10 : 0,
      revPerTrip: subCount > 0 ? Math.round(subRev / subCount) : 0,
      fuelLitersPerTrip: 0,
      profitPerTrip: subCount > 0 ? Math.round(subProfit / subCount) : 0
    };

    // Bảng 12 tháng của riêng đầu xe đang chọn (mặc định 15H00266)
    const truck12Months = MONTHS_CONFIG.map((mCfg) => {
      const ym = `${selectedYear}-${mCfg.monthCode}`;
      const mTrips = tripsData.filter(
        (t) =>
          !t.is_subcontractor &&
          String(t.vehicle_plate || t.so_xe || '').trim() === focusedTruckPlate &&
          getTripAccountingMonth(t) === ym
      );
      const m = computeAggregateMetrics(mTrips);
      const rev = revenueBasis === 'GOC_CHUA_VAT' ? m.totalCuocGoc : m.totalCuocSauTru17;
      const profit =
        revenueBasis === 'GOC_CHUA_VAT'
          ? m.totalChenhLechTruocTruGoc
          : m.totalChenhLechSauTru17;
      return {
        ...mCfg,
        ym,
        tripsCount: m.completedCount,
        cuocGoc: m.totalCuocGoc,
        cuocSauTru17: m.totalCuocSauTru17,
        revMain: rev,
        fuelLiters: m.totalFuelLiters,
        tollCost: m.totalToll,
        liftAndOther: m.totalPhiNangHa + m.totalPhatSinh,
        totalCost: m.totalChiPhiCongTy,
        profitMain: profit,
        marginPct: rev > 0 ? Math.round((profit / rev) * 1000) / 10 : 0
      };
    });

    return {
      fleetRows: [...rows.filter((r) => r.tripsCount > 0 || housePlatesList.slice(0, 6).includes(r.id)), subRow],
      truck12Months
    };
  }, [activePeriodTrips, housePlatesList, revenueBasis, tripsData, selectedYear, focusedTruckPlate]);

  // 6. Quản trị Công nợ Khách hàng (AR) & Nhà xe ngoài (AP) trong kỳ đang chọn (Tab 4)
  const arApAnalysis = useMemo(() => {
    const custMap = new Map();
    activePeriodTrips.forEach((t) => {
      const name = String(t.customer_name || 'Khách lẻ').trim();
      if (!custMap.has(name)) {
        custMap.set(name, []);
      }
      custMap.get(name).push(t);
    });

    let customerRows = Array.from(custMap.entries()).map(([customerName, cTrips]) => {
      const m = computeAggregateMetrics(cTrips);
      return {
        customerName,
        tripsCount: m.completedCount,
        cuocGoc: m.totalCuocGoc,
        cuocCoVat: m.totalCuocCoVat,
        cuocSauTru17: m.totalCuocSauTru17,
        cashSettled: m.cashSettledKhach,
        arOutstanding: m.totalConPhaiThuKhach,
        phoiAdvance: m.totalPhoiTraHo,
        phoiBalanceDue: m.totalPhoiConPhaiThu,
        collectionRatePct: m.collectionRatePct
      };
    });

    customerRows.sort(
      (a, b) => b.arOutstanding - a.arOutstanding || b.cuocGoc - a.cuocGoc
    );

    if (arStatusFilter === 'HAS_AR') {
      customerRows = customerRows.filter((r) => r.arOutstanding > 0);
    } else if (arStatusFilter === 'SETTLED') {
      customerRows = customerRows.filter((r) => r.arOutstanding === 0);
    } else if (arStatusFilter === 'HAS_PHOI') {
      customerRows = customerRows.filter((r) => r.phoiBalanceDue > 0);
    }

    // Công nợ phải trả nhà xe thuê ngoài (AP)
    const subMap = new Map();
    activePeriodTrips
      .filter((t) => t.is_subcontractor)
      .forEach((t) => {
        let name = String(t.subcontractor_name || t.vehicle_plate || 'Xe ngoài').trim();
        if (name === 'ĐÃ TT' || name === 'MẸ ĐÃ TT') name = 'Xe ngoài lẻ';
        if (!subMap.has(name)) subMap.set(name, []);
        subMap.get(name).push(t);
      });

    const apSubRows = Array.from(subMap.entries())
      .map(([partnerName, sTrips]) => {
        const m = computeAggregateMetrics(sTrips);
        return {
          partnerName,
          tripsCount: m.completedCount,
          cuocSauTru17: m.totalCuocSauTru17,
          totalPayable: m.totalCuocRa,
          paidAmount: m.totalDaTraNhaXe,
          apOutstanding: m.totalConPhaiTraNhaXe,
          marginSpread: m.totalCuocSauTru17 - m.totalCuocRa
        };
      })
      .sort((a, b) => b.apOutstanding - a.apOutstanding || b.totalPayable - a.totalPayable);

    return {
      customerRows,
      apSubRows
    };
  }, [activePeriodTrips, arStatusFilter]);

  // 7. Dữ liệu phục vụ Modal Bản In (Cho phép Giám đốc in bất kỳ Tháng T1..T12, Quý Q1..Q4, hoặc Cả Năm)
  const printReportTarget = useMemo(() => {
    let targetTrips = yearAndFleetFilteredTrips;
    let periodTitle = `CẢ NĂM TÀI CHÍNH ${selectedYear} (THÁNG 01 – THÁNG 12/${selectedYear})`;
    let prevMonthMetrics = null;
    let prevMonthLabel = null;
    let isSingleMonth = false;

    if (printReportPeriod.startsWith('month_')) {
      isSingleMonth = true;
      const mCode = printReportPeriod.slice(6);
      const mIdx = parseInt(mCode, 10) - 1;
      const mObj = monthlyDataList[mIdx];
      if (mObj) {
        targetTrips = mObj.trips;
        periodTitle = `THÁNG ${mCode} NĂM ${selectedYear}`;
        if (mIdx > 0) {
          prevMonthMetrics = monthlyDataList[mIdx - 1].metrics;
          prevMonthLabel = monthlyDataList[mIdx - 1].fullLabel;
        }
      }
    } else if (printReportPeriod.startsWith('q_')) {
      const qIdx = parseInt(printReportPeriod.slice(2), 10) - 1;
      const qObj = quarterlyDataList[qIdx];
      if (qObj) {
        targetTrips = qObj.trips;
        periodTitle = `QUÝ ${qObj.index} NĂM ${selectedYear}`;
      }
    }

    const metrics = computeAggregateMetrics(targetTrips);
    const plRows = buildCorporatePlRows(metrics, revenueBasis);

    // Đội xe trong kỳ in
    const fleetRowsInPrint = [];
    housePlatesList.forEach((plate) => {
      const pTrips = targetTrips.filter(
        (t) => !t.is_subcontractor && String(t.vehicle_plate || t.so_xe || '').trim() === plate
      );
      if (pTrips.length > 0) {
        const pm = computeAggregateMetrics(pTrips);
        fleetRowsInPrint.push({
          label: `Đầu kéo ${plate}`,
          ...pm
        });
      }
    });
    const subTripsInPrint = targetTrips.filter((t) => t.is_subcontractor);
    if (subTripsInPrint.length > 0) {
      fleetRowsInPrint.push({
        label: `Khối Xe thuê ngoài (${subTripsInPrint.length} cuốc)`,
        ...computeAggregateMetrics(subTripsInPrint)
      });
    }

    // Khách hàng lớn nhất trong kỳ in
    const cMap = new Map();
    targetTrips.forEach((t) => {
      const cName = String(t.customer_name || 'Khách lẻ').trim();
      if (!cMap.has(cName)) cMap.set(cName, []);
      cMap.get(cName).push(t);
    });
    const topCustomersInPrint = Array.from(cMap.entries())
      .map(([customerName, cTrips]) => ({
        customerName,
        ...computeAggregateMetrics(cTrips)
      }))
      .sort((a, b) => b.totalCuocGoc - a.totalCuocGoc)
      .slice(0, 15);

    return {
      isSingleMonth,
      periodTitle,
      targetTrips,
      metrics,
      plRows,
      prevMonthMetrics,
      prevMonthLabel,
      fleetRowsInPrint,
      topCustomersInPrint
    };
  }, [
    printReportPeriod,
    yearAndFleetFilteredTrips,
    selectedYear,
    monthlyDataList,
    quarterlyDataList,
    revenueBasis,
    housePlatesList
  ]);

  // Mở Modal In Báo Cáo cho bất kỳ kỳ nào (Cả năm, Quý, hoặc bất kỳ Tháng T1..T12)
  const handleOpenPrintModal = (periodKey = selectedPeriod) => {
    setPrintReportPeriod(periodKey);
    if (periodKey.startsWith('month_')) {
      setPrintIncludeMonthlyMatrix(false);
      setPrintIncludeTripsAppendix(false);
    } else {
      setPrintIncludeMonthlyMatrix(true);
      setPrintIncludeTripsAppendix(false);
    }
    setPrintModalOpen(true);
  };

  // Thực thi In Báo Cáo A4 / Xuất PDF
  const handleExecutePrint = () => {
    if (!printContainerRef.current) {
      window.print();
      return;
    }
    const contentHtml = printContainerRef.current.innerHTML;
    const printStyles = `
      @page { size: A4 landscape; margin: 8mm 10mm; }
      * { box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
      body {
        font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, Arial, sans-serif;
        color: #0f172a;
        background: #ffffff;
        margin: 0;
        padding: 0;
        font-size: 10.5px;
        line-height: 1.38;
      }
      table { width: 100%; border-collapse: collapse; margin-top: 4px; margin-bottom: 10px; font-size: 9.5px; }
      th, td { border: 1px solid #cbd5e1; padding: 4px 6px; }
      th { background-color: #1B365D !important; color: #ffffff !important; font-weight: 700; text-align: center; }
      .sub-th th { background-color: #f1f5f9 !important; color: #0f172a !important; }
      .text-right { text-align: right; font-variant-numeric: tabular-nums; }
      .text-center { text-align: center; }
      .text-left { text-align: left; }
      .font-mono { font-variant-numeric: tabular-nums; }
      .font-bold { font-weight: 700; }
      .double-bottom { border-bottom: 3px double #0f172a !important; font-weight: 700; }
      .row-navy { background-color: #eff6ff !important; font-weight: 700; color: #1e3a8a; }
      .row-teal { background-color: #f0fdfa !important; font-weight: 700; color: #0f766e; }
      .row-emerald { background-color: #ecfdf5 !important; font-weight: 700; color: #065f46; border-bottom: 3px double #065f46 !important; }
      .row-amber { background-color: #fffbeb !important; font-weight: 700; color: #92400e; }
      .row-section { background-color: #e2e8f0 !important; font-weight: 700; color: #0f172a; text-transform: uppercase; }
      .print-kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 10px; }
      .print-kpi-box { border: 1px solid #cbd5e1; border-radius: 6px; padding: 7px 10px; }
      .print-section-hdr { font-size: 11px; font-weight: 700; text-transform: uppercase; color: #1B365D; border-bottom: 2px solid #1B365D; padding-bottom: 2px; margin: 10px 0 5px 0; }
      .signature-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-top: 18px; text-align: center; page-break-inside: avoid; }
    `;

    try {
      const printWin = window.open('', '_blank', 'width=1240,height=880');
      if (printWin && printWin.document) {
        printWin.document.open();
        printWin.document.write(`
          <!DOCTYPE html>
          <html lang="vi">
          <head>
            <meta charset="utf-8" />
            <title>Báo Cáo Tài Chính Doanh Nghiệp - ${printReportTarget.periodTitle}</title>
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
      // Fallback cho WebView điện thoại
    }
    window.print();
  };

  // Xuất file CSV Báo cáo Tài chính 12 tháng & Cả năm
  const handleExportCsv = () => {
    const headers = [
      'Mã số',
      'Chỉ tiêu Báo cáo Tài chính',
      ...monthlyDataList.map((m) => m.fullLabel),
      `Cả Năm ${selectedYear}`,
      'Tỷ trọng (%)'
    ];
    const csvRows = [headers.join(',')];

    annualSummary.plRows.forEach((annualRow, rIdx) => {
      const monthVals = monthlyDataList.map((m) => {
        const mRow = m.plRows[rIdx];
        return mRow ? mRow.value : 0;
      });
      const line = [
        `"${annualRow.code}"`,
        `"${annualRow.name.replace(/"/g, '""')}"`,
        ...monthVals,
        annualRow.value,
        annualRow.pct ?? ''
      ];
      csvRows.push(line.join(','));
    });

    const blob = new Blob(['\uFEFF' + csvRows.join('\n')], {
      type: 'text/csv;charset=utf-8;'
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Bao_Cao_Tai_Chinh_${selectedYear}_${selectedPeriod}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Giá trị cực đại để vẽ biểu đồ 12 tháng
  const chartMaxValues = useMemo(() => {
    let maxBar = 1;
    let maxCash = 1;
    monthlyDataList.forEach((m) => {
      const rev =
        revenueBasis === 'GOC_CHUA_VAT'
          ? m.metrics.totalCuocGoc
          : m.metrics.totalCuocSauTru17;
      if (rev > maxBar) maxBar = rev;
      if (m.metrics.totalCuocGoc > maxCash) maxCash = m.metrics.totalCuocGoc;
    });
    return { maxBar, maxCash };
  }, [monthlyDataList, revenueBasis]);

  if (loading) {
    return (
      <div className="p-12 bg-white rounded-2xl border border-slate-200 text-center space-y-3">
        <RefreshCw className="w-8 h-8 text-[#1B365D] animate-spin mx-auto" />
        <div className="text-sm font-bold text-slate-800">
          Đang tổng hợp Báo cáo Tài chính Đa tầng (P&L, Cash Flow & Unit Economics)...
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="p-8 bg-white rounded-2xl border border-rose-200 text-center space-y-3">
        <AlertCircle className="w-8 h-8 text-rose-600 mx-auto" />
        <div className="text-sm font-bold text-slate-900">Không thể tải Báo cáo Tài chính</div>
        <p className="text-xs text-slate-600">{loadError}</p>
        <button
          type="button"
          onClick={loadFinancialData}
          className="px-4 py-2 bg-[#1B365D] text-white text-xs font-semibold rounded-lg"
        >
          Thử lại
        </button>
      </div>
    );
  }

  const kpiRevMain =
    revenueBasis === 'GOC_CHUA_VAT'
      ? activePeriodMetrics.totalCuocGoc
      : activePeriodMetrics.totalCuocSauTru17;
  const kpiOwnRev =
    revenueBasis === 'GOC_CHUA_VAT'
      ? activePeriodMetrics.ownCuocGoc
      : activePeriodMetrics.ownCuocSauTru17;
  const kpiExtRev =
    revenueBasis === 'GOC_CHUA_VAT'
      ? activePeriodMetrics.extCuocGoc
      : activePeriodMetrics.extCuocSauTru17;
  const kpiGrossMain =
    revenueBasis === 'GOC_CHUA_VAT'
      ? activePeriodMetrics.grossProfitGoc
      : activePeriodMetrics.grossProfitSauTru17;
  const kpiGrossMarginPct =
    revenueBasis === 'GOC_CHUA_VAT'
      ? activePeriodMetrics.grossMarginGocPct
      : activePeriodMetrics.grossMarginSauTru17Pct;
  const kpiNetMain =
    revenueBasis === 'GOC_CHUA_VAT'
      ? activePeriodMetrics.totalChenhLechTruocTruGoc
      : activePeriodMetrics.totalChenhLechSauTru17;
  const kpiNetMarginPct =
    revenueBasis === 'GOC_CHUA_VAT'
      ? activePeriodMetrics.netMarginGocPct
      : activePeriodMetrics.netMarginSauTru17Pct;
  const kpiProfitPerTrip =
    activePeriodMetrics.completedCount > 0
      ? Math.round(kpiNetMain / activePeriodMetrics.completedCount)
      : 0;

  return (
    <div
      data-testid="corporate-financial-report-view"
      className="space-y-5 bg-[#F8FAFC] rounded-2xl p-3 sm:p-5 border border-slate-200/90 shadow-xs"
    >
      {/* ============================================================ */}
      {/* 1. HEADER & FILTER BAR CHUẨN CFO DASHBOARD (#1B365D & #0D9488) */}
      {/* ============================================================ */}
      <div className="bg-[#1B365D] text-white rounded-xl p-4 sm:p-5 shadow-md space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-white/15 pb-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-md text-[11px] font-bold uppercase tracking-wider bg-[#0D9488] text-white">
                CFO Financial Report • IFRS/VAS
              </span>
              <span className="px-2.5 py-0.5 rounded-md text-[11px] font-semibold bg-white/10 text-slate-100">
                Kỳ đang xem: {activePeriodLabel} ({activePeriodMetrics.completedCount} chuyến)
              </span>
            </div>
            <h2 className="text-lg sm:text-xl font-bold tracking-tight mt-1.5">
              BÁO CÁO TÀI CHÍNH DOANH NGHIỆP — TỪNG THÁNG (T1–T12), QUÝ & TỔNG HỢP NĂM {selectedYear}
            </h2>
            <p className="text-xs text-slate-200 mt-0.5">
              Báo cáo kết quả hoạt động kinh doanh đa tầng (MS.01–MS.75), Dòng tiền & Công nợ (AR/AP), Hiệu suất từng đầu xe (Unit Economics) và In báo cáo trực quan bất kỳ tháng nào hoặc cả năm.
            </p>
          </div>

          {/* Cụm nút In Báo Cáo Tháng Bất Kỳ / In Cả Năm / Xuất CSV */}
          <div className="flex flex-wrap items-center gap-2 self-start lg:self-auto">
            <button
              type="button"
              onClick={() => handleOpenPrintModal(selectedPeriod)}
              data-testid="cfo-btn-print-current-period"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-[#10B981] hover:bg-emerald-600 text-white rounded-lg text-xs font-bold shadow-sm transition-all cursor-pointer"
            >
              <Printer size={15} />
              <span>In Báo Cáo {activePeriodLabel}</span>
            </button>

            <button
              type="button"
              onClick={() => handleOpenPrintModal('all')}
              data-testid="cfo-btn-print-any-month-or-year"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white text-[#1B365D] hover:bg-slate-100 rounded-lg text-xs font-bold shadow-sm transition-all cursor-pointer"
            >
              <Printer size={15} className="text-[#0D9488]" />
              <span>Chọn In Tháng Bất Kỳ (T1–T12) / Cả Năm</span>
            </button>

            <button
              type="button"
              onClick={handleExportCsv}
              data-testid="cfo-btn-export-csv"
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-white/10 hover:bg-white/20 text-white border border-white/20 rounded-lg text-xs font-semibold transition-all cursor-pointer"
            >
              <Download size={14} />
              <span>Xuất CSV</span>
            </button>
          </div>
        </div>

        {/* Thanh Bộ Lọc Đa Chiều: Năm, Kỳ Báo Cáo, Đầu Xe, Cơ sở Doanh thu, Tìm kiếm */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5 text-xs">
          {/* 1. Chọn Năm */}
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-slate-300 font-semibold">Năm tài chính:</label>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
              data-testid="cfo-select-year"
              className="bg-slate-900/70 border border-white/20 rounded-lg px-2.5 py-1.5 text-white font-semibold focus:outline-hidden"
            >
              {availableYears.map((yr) => (
                <option key={yr} value={yr}>
                  Năm tài chính {yr}
                </option>
              ))}
            </select>
          </div>

          {/* 2. Chọn Kỳ báo cáo (Cả năm / Quý 1..4 / Tháng 01..12) */}
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-slate-300 font-semibold">
              Kỳ báo cáo (Năm / Quý / Tháng):
            </label>
            <select
              value={selectedPeriod}
              onChange={(e) => setSelectedPeriod(e.target.value)}
              data-testid="cfo-select-period"
              className="bg-slate-900/70 border border-white/20 rounded-lg px-2.5 py-1.5 text-white font-semibold focus:outline-hidden"
            >
              <option value="all">Cả Năm {selectedYear} (12 Tháng)</option>
              <optgroup label={`Theo Quý Năm ${selectedYear}`}>
                {QUARTERS_CONFIG.map((q) => (
                  <option key={q.filterKey} value={q.filterKey}>
                    {q.label}/{selectedYear} (T{q.months[0]}–T{q.months[2]})
                  </option>
                ))}
              </optgroup>
              <optgroup label={`Từng Tháng Năm ${selectedYear}`}>
                {MONTHS_CONFIG.map((m) => (
                  <option key={m.filterKey} value={m.filterKey}>
                    Tháng {m.monthCode}/{selectedYear}
                  </option>
                ))}
              </optgroup>
            </select>
          </div>

          {/* 3. Chọn Đầu xe / Mô hình khai thác */}
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-slate-300 font-semibold">
              Phạm vi Đội xe / Đầu kéo:
            </label>
            <select
              value={selectedVehicleFilter}
              onChange={(e) => setSelectedVehicleFilter(e.target.value)}
              data-testid="cfo-select-vehicle"
              className="bg-slate-900/70 border border-white/20 rounded-lg px-2.5 py-1.5 text-white font-semibold focus:outline-hidden"
            >
              <option value="ALL">Toàn công ty (Xe nhà + Thuê ngoài)</option>
              <option value="OWN_FLEET">Đội xe nhà (Tất cả đầu kéo)</option>
              <option value="SUBCONTRACT">Điều phối xe thuê ngoài (Sub-contract)</option>
              <optgroup label="Từng đầu xe chủ lực">
                {housePlatesList.map((plate) => (
                  <option key={plate} value={plate}>
                    Xe đầu kéo {plate}
                  </option>
                ))}
              </optgroup>
            </select>
          </div>

          {/* 4. Chọn Cơ sở Doanh thu hiển thị */}
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-slate-300 font-semibold">
              Cơ sở Doanh thu trọng tâm:
            </label>
            <select
              value={revenueBasis}
              onChange={(e) => setRevenueBasis(e.target.value)}
              data-testid="cfo-select-basis"
              className="bg-slate-900/70 border border-white/20 rounded-lg px-2.5 py-1.5 text-white font-semibold focus:outline-hidden"
            >
              <option value="SAU_TRU_17">Chuẩn điều hành (Cước sau trừ 17%)</option>
              <option value="GOC_CHUA_VAT">Chuẩn kế toán gốc (Cước gốc chưa VAT)</option>
            </select>
          </div>

          {/* 5. Ô tìm kiếm khách hàng / biển số / tuyến */}
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-slate-300 font-semibold">
              Lọc theo khách hàng / xe / tuyến:
            </label>
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-300 absolute left-2.5 top-2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="VD: HARMONY, PDVN, 15H00266..."
                className="w-full bg-slate-900/70 border border-white/20 rounded-lg pl-8 pr-6 py-1.5 text-white placeholder:text-slate-400 focus:outline-hidden"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-2 text-slate-300 hover:text-white"
                >
                  <X size={13} />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Thanh chọn nhanh Cả Năm / 4 Quý / 12 Tháng kèm nút In nhanh */}
        <div className="pt-2 border-t border-white/10 flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
          <button
            type="button"
            onClick={() => setSelectedPeriod('all')}
            data-testid="cfo-pill-all"
            className={`px-2.5 py-1 rounded-md text-xs font-bold shrink-0 transition-all cursor-pointer ${
              selectedPeriod === 'all'
                ? 'bg-[#0D9488] text-white shadow-xs'
                : 'bg-white/10 text-slate-200 hover:bg-white/20'
            }`}
          >
            Cả Năm {selectedYear} ({annualSummary.metrics.completedCount})
          </button>

          {QUARTERS_CONFIG.map((q) => (
            <button
              key={q.filterKey}
              type="button"
              onClick={() => setSelectedPeriod(q.filterKey)}
              data-testid={`cfo-pill-${q.filterKey}`}
              className={`px-2.5 py-1 rounded-md text-xs font-semibold shrink-0 transition-all cursor-pointer ${
                selectedPeriod === q.filterKey
                  ? 'bg-[#0D9488] text-white font-bold shadow-xs'
                  : 'bg-white/10 text-slate-200 hover:bg-white/20'
              }`}
            >
              {q.label} ({quarterlyDataList[q.index - 1]?.metrics.completedCount || 0})
            </button>
          ))}

          <span className="text-white/30 px-1">|</span>

          {monthlyDataList.map((m) => (
            <button
              key={m.filterKey}
              type="button"
              onClick={() => {
                setSelectedPeriod(m.filterKey);
                setFocusedMonthCode(m.monthCode);
              }}
              data-testid={`cfo-pill-month-${m.monthCode}`}
              className={`px-2.5 py-1 rounded-md text-xs font-semibold shrink-0 transition-all cursor-pointer flex items-center gap-1 ${
                selectedPeriod === m.filterKey
                  ? 'bg-amber-500 text-slate-950 font-bold shadow-xs'
                  : m.hasData
                  ? 'bg-white/10 text-white hover:bg-white/20'
                  : 'bg-white/5 text-slate-400 hover:bg-white/10'
              }`}
            >
              <span>T{m.index}</span>
              <span className="text-[10px] opacity-85 font-mono">({m.metrics.completedCount})</span>
            </button>
          ))}
        </div>
      </div>

      {/* ============================================================ */}
      {/* 2. HÀNG 1: 4 THẺ KPI CHIẾN LƯỢC (EXECUTIVE SCORECARDS) */}
      {/* ============================================================ */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Scorecard 1: Tổng Doanh Thu Thuần */}
        <div className="bg-white rounded-xl border-l-4 border-l-[#1B365D] border border-slate-200 p-4 shadow-2xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-[#1B365D]">
              <span>1. Doanh thu thuần ({activePeriodLabel})</span>
              <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 font-mono text-[10px]">
                {revenueBasis === 'GOC_CHUA_VAT' ? 'MS.10' : 'MS.16'}
              </span>
            </div>
            <div
              data-testid="cfo-kpi-revenue"
              className="text-2xl font-bold font-mono text-slate-900 mt-1.5 tabular-nums"
            >
              {formatVnd(kpiRevMain)}
            </div>
            <div className="text-[11px] text-slate-500 mt-1 font-mono">
              {revenueBasis === 'SAU_TRU_17'
                ? `Cước gốc chưa VAT: ${formatVnd(activePeriodMetrics.totalCuocGoc)}`
                : `Sau trừ 17%: ${formatVnd(activePeriodMetrics.totalCuocSauTru17)}`}
            </div>
          </div>
          <div className="mt-3 pt-2.5 border-t border-slate-100 text-[11px] text-slate-600 space-y-1">
            <div className="flex justify-between font-mono">
              <span>• Đội xe nhà ({activePeriodMetrics.houseTripsCount}c):</span>
              <strong className="text-slate-900">{formatTrieuDong(kpiOwnRev)}</strong>
            </div>
            <div className="flex justify-between font-mono">
              <span>• Xe thuê ngoài ({activePeriodMetrics.subTripsCount}c):</span>
              <strong className="text-slate-700">{formatTrieuDong(kpiExtRev)}</strong>
            </div>
          </div>
        </div>

        {/* Scorecard 2: Lợi Nhuận Gộp (Gross Profit & Gross Margin %) */}
        <div className="bg-white rounded-xl border-l-4 border-l-[#0D9488] border border-slate-200 p-4 shadow-2xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-[#0D9488]">
              <span>2. Lợi nhuận gộp (Gross Profit)</span>
              <span className="px-1.5 py-0.5 rounded bg-teal-50 text-teal-800 font-mono text-[10px]">
                MS.30 • Biên {kpiGrossMarginPct}%
              </span>
            </div>
            <div
              data-testid="cfo-kpi-gross-profit"
              className="text-2xl font-bold font-mono text-[#0D9488] mt-1.5 tabular-nums"
            >
              {formatVnd(kpiGrossMain)}
            </div>
            <div className="text-[11px] text-slate-500 mt-1 font-mono">
              Tổng giá vốn COGS (MS.20): {formatVnd(activePeriodMetrics.totalCogs)}
            </div>
          </div>
          <div className="mt-3 pt-2.5 border-t border-slate-100 text-[11px] text-slate-600 space-y-1">
            <div className="flex justify-between font-mono">
              <span>• Thuê ngoài / BOT:</span>
              <span>
                {formatTrieuDong(activePeriodMetrics.totalCuocRa)} /{' '}
                {formatTrieuDong(activePeriodMetrics.totalToll)}
              </span>
            </div>
            <div className="flex justify-between font-mono">
              <span>• Dầu cấp / Nâng hạ:</span>
              <span>
                {activePeriodMetrics.totalFuelLiters.toLocaleString('vi-VN')}L /{' '}
                {formatTrieuDong(activePeriodMetrics.totalPhiNangHa)}
              </span>
            </div>
          </div>
        </div>

        {/* Scorecard 3: Chênh Lệch Tạm Tính (Net Provisional Profit) */}
        <div className="bg-white rounded-xl border-l-4 border-l-[#10B981] border border-slate-200 p-4 shadow-2xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-emerald-800">
              <span>3. Chênh lệch tạm tính (Chưa lương)</span>
              <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-800 font-mono text-[10px]">
                MS.60 • Biên {kpiNetMarginPct}%
              </span>
            </div>
            <div
              data-testid="cfo-kpi-net-profit"
              className="text-2xl font-bold font-mono text-emerald-700 mt-1.5 tabular-nums"
            >
              {kpiNetMain >= 0 ? '+' : ''}
              {formatVnd(kpiNetMain)}
            </div>
            <div className="text-[11px] text-slate-500 mt-1 font-mono">
              BQ / chuyến: <strong>+{formatVnd(kpiProfitPerTrip)}</strong> ({activePeriodMetrics.completedCount}{' '}
              cuốc)
            </div>
          </div>
          <div className="mt-3 pt-2.5 border-t border-slate-100 text-[11px] text-slate-600 space-y-1">
            <div className="flex justify-between font-mono">
              <span>• Phát sinh OPEX (MS.42):</span>
              <span>{formatVnd(activePeriodMetrics.totalPhatSinh)}</span>
            </div>
            <div className="flex justify-between font-mono text-slate-500">
              <span>
                • {revenueBasis === 'SAU_TRU_17' ? 'Trước trừ 17%:' : 'Sau trừ 17%:'}
              </span>
              <strong>
                {formatTrieuDong(
                  revenueBasis === 'SAU_TRU_17'
                    ? activePeriodMetrics.totalChenhLechTruocTruGoc
                    : activePeriodMetrics.totalChenhLechSauTru17
                )}
              </strong>
            </div>
          </div>
        </div>

        {/* Scorecard 4: Dòng Tiền Thực Thu & Công Nợ AR */}
        <div className="bg-white rounded-xl border-l-4 border-l-[#F59E0B] border border-slate-200 p-4 shadow-2xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-amber-900">
              <span>4. Thực thu & Công nợ phải thu AR</span>
              <span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-900 font-mono text-[10px]">
                Thu hồi {activePeriodMetrics.collectionRatePct}%
              </span>
            </div>
            <div
              data-testid="cfo-kpi-cash-collected"
              className="text-2xl font-bold font-mono text-slate-900 mt-1.5 tabular-nums"
            >
              {formatVnd(activePeriodMetrics.cashSettledKhach)}
            </div>
            <div className="text-[11px] text-rose-700 font-semibold mt-1 font-mono">
              Còn phải thu AR (MS.71): {formatVnd(activePeriodMetrics.totalConPhaiThuKhach)}
            </div>
          </div>
          <div className="mt-3 pt-2 border-t border-slate-100 space-y-1.5">
            <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-[#0D9488] rounded-full transition-all"
                style={{ width: `${Math.min(100, activePeriodMetrics.collectionRatePct)}%` }}
              />
            </div>
            <div className="flex justify-between text-[10px] text-slate-600 font-mono">
              <span>Phải trả NX (AP): {formatTrieuDong(activePeriodMetrics.totalConPhaiTraNhaXe)}</span>
              <span>Phơi nợ: {formatTrieuDong(activePeriodMetrics.totalPhoiConPhaiThu)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ============================================================ */}
      {/* 3. HÀNG 2: HỆ THỐNG 2 BIỂU ĐỒ TÀI CHÍNH TƯƠNG TÁC (RELATIVE H-72) */}
      {/* ============================================================ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Biểu đồ 1: Combo Bar + Line Chart (Doanh thu, Giá vốn, Lợi nhuận & Biên % T1-T12) */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#1B365D]">
                Biểu đồ 1: Doanh thu, Chi phí, Chênh lệch & Biên lợi nhuận 12 Tháng ({selectedYear})
              </h3>
              <p className="text-[11px] text-slate-500">
                Bấm vào cột tháng bất kỳ để xem & in báo cáo tài chính của tháng đó
              </p>
            </div>
            <div className="flex items-center gap-3 text-[10px] font-semibold">
              <span className="flex items-center gap-1 text-[#1B365D]">
                <span className="w-2.5 h-2.5 rounded-xs bg-[#1B365D] inline-block" /> Doanh thu
              </span>
              <span className="flex items-center gap-1 text-amber-700">
                <span className="w-2.5 h-2.5 rounded-xs bg-amber-500 inline-block" /> Chi phí
              </span>
              <span className="flex items-center gap-1 text-emerald-700">
                <span className="w-2.5 h-2.5 rounded-xs bg-emerald-600 inline-block" /> Chênh lệch
              </span>
            </div>
          </div>

          <div className="relative h-72 w-full pt-4 pb-2 px-1 flex flex-col justify-end">
            <div className="grid grid-cols-12 gap-1.5 items-end h-56 border-b border-slate-200 pb-1">
              {monthlyDataList.map((m) => {
                const rev =
                  revenueBasis === 'GOC_CHUA_VAT'
                    ? m.metrics.totalCuocGoc
                    : m.metrics.totalCuocSauTru17;
                const cost = m.metrics.totalChiPhiCongTy;
                const prof =
                  revenueBasis === 'GOC_CHUA_VAT'
                    ? m.metrics.totalChenhLechTruocTruGoc
                    : m.metrics.totalChenhLechSauTru17;
                const marginPct =
                  revenueBasis === 'GOC_CHUA_VAT'
                    ? m.metrics.netMarginGocPct
                    : m.metrics.netMarginSauTru17Pct;

                const revH = m.hasData
                  ? Math.max(8, Math.round((rev / chartMaxValues.maxBar) * 165))
                  : 2;
                const costH = m.hasData
                  ? Math.max(4, Math.round((cost / chartMaxValues.maxBar) * 165))
                  : 2;
                const profH = m.hasData
                  ? Math.max(6, Math.round((Math.max(0, prof) / chartMaxValues.maxBar) * 165))
                  : 2;
                const isSelected = selectedPeriod === m.filterKey;

                return (
                  <div
                    key={m.filterKey}
                    onClick={() => {
                      setSelectedPeriod(m.filterKey);
                      setFocusedMonthCode(m.monthCode);
                    }}
                    className={`flex flex-col items-center justify-end h-full rounded-lg p-1 cursor-pointer transition-all ${
                      isSelected ? 'bg-blue-50/90 ring-1 ring-[#1B365D]' : 'hover:bg-slate-50'
                    }`}
                    title={`${m.fullLabel}: ${m.metrics.completedCount} chuyến\n• Doanh thu: ${formatVnd(
                      rev
                    )}\n• Chi phí: ${formatVnd(cost)}\n• Chênh lệch: +${formatVnd(
                      prof
                    )} (Biên ${marginPct}%)`}
                  >
                    {m.hasData && (
                      <span className="text-[9px] font-mono font-bold text-emerald-700 mb-0.5">
                        {marginPct}%
                      </span>
                    )}
                    <div className="flex items-end justify-center gap-0.5 w-full">
                      <div
                        style={{ height: `${revH}px` }}
                        className="w-2.5 bg-[#1B365D] rounded-t-xs"
                      />
                      <div
                        style={{ height: `${costH}px` }}
                        className="w-2.5 bg-amber-500 rounded-t-xs"
                      />
                      <div
                        style={{ height: `${profH}px` }}
                        className="w-2.5 bg-emerald-600 rounded-t-xs"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="grid grid-cols-12 gap-1.5 pt-1.5 text-center">
              {monthlyDataList.map((m) => (
                <div key={m.filterKey} className="leading-tight">
                  <div className="text-[10px] font-bold text-slate-800">{m.shortLabel}</div>
                  <div className="text-[9px] font-mono text-slate-500">
                    {m.metrics.completedCount}c
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Biểu đồ 2: Stacked Bar Chart (Thực thu Cash Collected vs Công nợ Phải thu AR T1-T12) */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#1B365D]">
                Biểu đồ 2: Dòng tiền Đã thu vs Công nợ Phải thu (AR) theo Tháng ({selectedYear})
              </h3>
              <p className="text-[11px] text-slate-500">
                Kiểm soát thanh khoản và tỷ lệ thu hồi tiền mặt từng tháng (T1–T12)
              </p>
            </div>
            <div className="flex items-center gap-3 text-[10px] font-semibold">
              <span className="flex items-center gap-1 text-[#0D9488]">
                <span className="w-2.5 h-2.5 rounded-xs bg-[#0D9488] inline-block" /> Đã thu / Đối trừ
              </span>
              <span className="flex items-center gap-1 text-rose-600">
                <span className="w-2.5 h-2.5 rounded-xs bg-rose-500 inline-block" /> Còn phải thu AR
              </span>
            </div>
          </div>

          <div className="relative h-72 w-full pt-4 pb-2 px-1 flex flex-col justify-end">
            <div className="grid grid-cols-12 gap-2 items-end h-56 border-b border-slate-200 pb-1">
              {monthlyDataList.map((m) => {
                const totalGoc = m.metrics.totalCuocGoc;
                const collected = m.metrics.cashSettledKhach;
                const arDue = m.metrics.totalConPhaiThuKhach;
                const totalStack = Math.max(totalGoc, collected + arDue, 1);

                const totalH = m.hasData
                  ? Math.max(10, Math.round((totalStack / chartMaxValues.maxCash) * 165))
                  : 2;
                const collectedH = m.hasData
                  ? Math.round((collected / totalStack) * totalH)
                  : 0;
                const arH = m.hasData ? Math.max(0, totalH - collectedH) : 0;

                return (
                  <div
                    key={m.filterKey}
                    onClick={() => {
                      setSelectedPeriod(m.filterKey);
                      setFocusedMonthCode(m.monthCode);
                    }}
                    className="flex flex-col items-center justify-end h-full rounded-lg p-1 cursor-pointer hover:bg-slate-50"
                    title={`${m.fullLabel}:\n• Đã thu & Đối trừ: ${formatVnd(
                      collected
                    )}\n• Còn phải thu AR: ${formatVnd(arDue)}\n• Tỷ lệ thu hồi: ${
                      m.metrics.collectionRatePct
                    }%`}
                  >
                    {m.hasData && (
                      <span className="text-[9px] font-mono font-bold text-[#0D9488] mb-0.5">
                        {m.metrics.collectionRatePct}%
                      </span>
                    )}
                    <div className="w-5 flex flex-col justify-end rounded-t-xs overflow-hidden">
                      {arH > 0 && (
                        <div style={{ height: `${arH}px` }} className="w-full bg-rose-500" />
                      )}
                      {collectedH > 0 && (
                        <div
                          style={{ height: `${collectedH}px` }}
                          className="w-full bg-[#0D9488]"
                        />
                      )}
                      {!m.hasData && <div className="w-full h-0.5 bg-slate-200" />}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="grid grid-cols-12 gap-2 pt-1.5 text-center">
              {monthlyDataList.map((m) => (
                <div key={m.filterKey} className="leading-tight">
                  <div className="text-[10px] font-bold text-slate-800">{m.shortLabel}</div>
                  <div className="text-[9px] font-mono text-rose-700">
                    {m.metrics.totalConPhaiThuKhach > 0
                      ? `${Math.round(m.metrics.totalConPhaiThuKhach / 1e6)}M`
                      : '0'}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ============================================================ */}
      {/* 4. HÀNG 3: HỆ THỐNG 4 TAB BÁO CÁO TÀI CHÍNH CHUYÊN SÂU */}
      {/* ============================================================ */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        {/* Thanh chuyển đổi 4 Tab Báo Cáo */}
        <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-slate-100/80 border-b border-slate-200">
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setActiveReportTab('ANNUAL_QUARTERLY')}
              data-testid="cfo-tab-annual-quarterly"
              className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                activeReportTab === 'ANNUAL_QUARTERLY'
                  ? 'bg-[#1B365D] text-white shadow-xs'
                  : 'bg-white text-slate-700 hover:bg-slate-50 border border-slate-200'
              }`}
            >
              <Layers size={14} />
              <span>1. Báo Cáo Tài Chính Năm & Quý</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveReportTab('MONTHLY_MATRIX')}
              data-testid="cfo-tab-monthly-matrix"
              className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                activeReportTab === 'MONTHLY_MATRIX'
                  ? 'bg-[#1B365D] text-white shadow-xs'
                  : 'bg-white text-slate-700 hover:bg-slate-50 border border-slate-200'
              }`}
            >
              <Calendar size={14} />
              <span>2. Báo Cáo Chi Tiết Từng Tháng (T1–T12)</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveReportTab('UNIT_ECONOMICS')}
              data-testid="cfo-tab-unit-economics"
              className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                activeReportTab === 'UNIT_ECONOMICS'
                  ? 'bg-[#1B365D] text-white shadow-xs'
                  : 'bg-white text-slate-700 hover:bg-slate-50 border border-slate-200'
              }`}
            >
              <Truck size={14} />
              <span>3. Hiệu Suất Đội Xe (Unit Economics)</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveReportTab('AR_AP_AGING')}
              data-testid="cfo-tab-ar-ap"
              className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                activeReportTab === 'AR_AP_AGING'
                  ? 'bg-[#1B365D] text-white shadow-xs'
                  : 'bg-white text-slate-700 hover:bg-slate-50 border border-slate-200'
              }`}
            >
              <CreditCard size={14} />
              <span>4. Quản Trị Công Nợ Khách Hàng (AR/AP)</span>
            </button>
          </div>

          {/* Nút In nhanh ngay tại thanh Tab */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() =>
                handleOpenPrintModal(
                  activeReportTab === 'MONTHLY_MATRIX'
                    ? `month_${focusedMonthCode}`
                    : selectedPeriod
                )
              }
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#0D9488] hover:bg-teal-700 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer"
            >
              <Printer size={13} />
              <span>
                {activeReportTab === 'MONTHLY_MATRIX'
                  ? `In Báo Cáo Tháng ${focusedMonthCode}/${selectedYear}`
                  : `In Báo Cáo ${activePeriodLabel}`}
              </span>
            </button>
          </div>
        </div>

        {/* ============================================================ */}
        {/* TAB 1: BÁO CÁO TÀI CHÍNH NĂM & QUÝ (MULTI-STEP P&L & CASH FLOW) */}
        {/* ============================================================ */}
        {activeReportTab === 'ANNUAL_QUARTERLY' && (
          <div className="p-4 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-[#1B365D] uppercase">
                  Bảng Báo Cáo Kết Quả Hoạt Động Kinh Doanh & Dòng Tiền Theo Quý và Cả Năm {selectedYear}
                </h3>
                <p className="text-xs text-slate-500">
                  Đơn vị tính: Đồng Việt Nam (VND) • Cấu trúc chuẩn P&L đa tầng (MS.01 – MS.75)
                </p>
              </div>
              <div className="flex items-center gap-2">
                {QUARTERS_CONFIG.map((q) => (
                  <button
                    key={q.filterKey}
                    type="button"
                    onClick={() => handleOpenPrintModal(q.filterKey)}
                    className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
                  >
                    <Printer size={11} />
                    <span>In {q.label}</span>
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => handleOpenPrintModal('all')}
                  className="px-3 py-1 bg-[#1B365D] hover:bg-slate-800 text-white rounded text-xs font-bold flex items-center gap-1 cursor-pointer"
                >
                  <Printer size={12} />
                  <span>In Cả Năm {selectedYear}</span>
                </button>
              </div>
            </div>

            <div className="ha-table-scroll border border-slate-200 rounded-xl">
              <table
                data-testid="cfo-annual-quarterly-table"
                className="w-full text-xs border-collapse"
              >
                <thead>
                  <tr className="bg-[#1B365D] text-white font-bold text-[11px]">
                    <th className="py-2.5 px-3 text-center w-16 sticky left-0 bg-[#1B365D] z-10">
                      Mã số
                    </th>
                    <th className="py-2.5 px-3 text-left min-w-[270px]">
                      Chỉ tiêu Báo cáo Tài chính (P&L & Cash Flow)
                    </th>
                    <th className="py-2.5 px-3 text-right">Quý 1/{selectedYear}</th>
                    <th className="py-2.5 px-3 text-right">Quý 2/{selectedYear}</th>
                    <th className="py-2.5 px-3 text-right">Quý 3/{selectedYear}</th>
                    <th className="py-2.5 px-3 text-right">Quý 4/{selectedYear}</th>
                    <th className="py-2.5 px-3 text-right bg-[#0D9488]">
                      CẢ NĂM {selectedYear}
                    </th>
                    <th className="py-2.5 px-2.5 text-right w-24">Tỷ trọng (%)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {annualSummary.plRows.map((row, rIdx) => {
                    const q1Val = quarterlyDataList[0]?.plRows[rIdx]?.value ?? 0;
                    const q2Val = quarterlyDataList[1]?.plRows[rIdx]?.value ?? 0;
                    const q3Val = quarterlyDataList[2]?.plRows[rIdx]?.value ?? 0;
                    const q4Val = quarterlyDataList[3]?.plRows[rIdx]?.value ?? 0;

                    const formatCell = (val) => {
                      if (row.isVolume) return `${val.toLocaleString('vi-VN')} cuốc`;
                      if (row.isPercentOnly) return `${val}%`;
                      return formatVnd(val);
                    };

                    const rowClass =
                      row.rowType === 'highlight_navy'
                        ? 'bg-blue-50/80 font-bold text-[#1B365D]'
                        : row.rowType === 'highlight_teal'
                        ? 'bg-teal-50/80 font-bold text-[#0D9488]'
                        : row.rowType === 'grand_total_emerald'
                        ? 'bg-emerald-50/90 font-bold text-emerald-900 border-b-4 border-double border-emerald-700'
                        : row.rowType === 'subtotal_amber'
                        ? 'bg-amber-50/70 font-bold text-amber-950'
                        : row.rowType === 'highlight_rose'
                        ? 'bg-rose-50/60 font-bold text-rose-800'
                        : row.rowType === 'deduction'
                        ? 'text-rose-700'
                        : row.rowType === 'subtotal'
                        ? 'bg-slate-50 font-bold text-slate-900'
                        : row.rowType === 'sub'
                        ? 'text-slate-600'
                        : 'text-slate-800 font-medium';

                    return (
                      <React.Fragment key={row.code}>
                        {row.section && (
                          <tr className="bg-slate-200/80 text-slate-900 font-bold text-[11px] uppercase tracking-wider">
                            <td colSpan={8} className="py-2 px-3">
                              {row.section}
                            </td>
                          </tr>
                        )}
                        <tr className={`hover:bg-slate-50/80 transition-colors ${rowClass}`}>
                          <td className="py-2 px-3 text-center font-mono font-bold sticky left-0 bg-inherit border-r border-slate-200">
                            {row.code}
                          </td>
                          <td className="py-2 px-3">
                            <div>{row.name}</div>
                            {row.subText && (
                              <div className="text-[10px] font-normal text-slate-500">
                                {row.subText}
                              </div>
                            )}
                            {row.note && (
                              <div className="text-[10px] font-normal italic text-amber-700">
                                ({row.note})
                              </div>
                            )}
                          </td>
                          <td className="py-2 px-3 text-right font-mono tabular-nums">
                            {formatCell(q1Val)}
                          </td>
                          <td className="py-2 px-3 text-right font-mono tabular-nums">
                            {formatCell(q2Val)}
                          </td>
                          <td className="py-2 px-3 text-right font-mono tabular-nums">
                            {formatCell(q3Val)}
                          </td>
                          <td className="py-2 px-3 text-right font-mono tabular-nums">
                            {formatCell(q4Val)}
                          </td>
                          <td className="py-2 px-3 text-right font-mono font-bold tabular-nums bg-slate-50/60">
                            {formatCell(row.value)}
                          </td>
                          <td className="py-2 px-2.5 text-right font-mono tabular-nums text-slate-600">
                            {row.pct !== null && row.pct !== undefined ? `${row.pct}%` : '-'}
                          </td>
                        </tr>
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* TAB 2: BÁO CÁO CHI TIẾT TỪNG THÁNG (T1-T12) & MA TRẬN P&L 12 THÁNG */}
        {/* ============================================================ */}
        {activeReportTab === 'MONTHLY_MATRIX' && (
          <div className="p-4 space-y-6">
            {/* KHỐI A: BỘ CHỌN XEM & IN BÁO CÁO CHI TIẾT TỪNG THÁNG 1 (KÈM SO SÁNH MoM) */}
            <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 space-y-4">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-slate-200 pb-3">
                <div>
                  <h3 className="text-sm font-bold text-[#1B365D] uppercase flex items-center gap-2">
                    <Calendar size={16} className="text-[#0D9488]" />
                    <span>
                      Báo Cáo Tài Chính Chi Tiết Từng Tháng — Đang chọn:{' '}
                      {focusedMonthAnalysis.currentMonth.fullLabel}
                    </span>
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Chọn bất kỳ tháng nào từ Tháng 01 đến Tháng 12/{selectedYear} để xem đầy đủ P&L, so sánh với tháng liền kề (MoM) và in riêng tháng đó.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={focusedMonthCode}
                    onChange={(e) => {
                      setFocusedMonthCode(e.target.value);
                      setSelectedPeriod(`month_${e.target.value}`);
                    }}
                    data-testid="cfo-select-single-month-detail"
                    className="bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs font-bold text-[#1B365D]"
                  >
                    {monthlyDataList.map((m) => (
                      <option key={m.monthCode} value={m.monthCode}>
                        {m.fullLabel} ({m.metrics.completedCount} chuyến)
                      </option>
                    ))}
                  </select>

                  <button
                    type="button"
                    onClick={() => handleOpenPrintModal(`month_${focusedMonthCode}`)}
                    data-testid="cfo-btn-print-focused-month"
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-[#1B365D] hover:bg-slate-800 text-white rounded-lg text-xs font-bold shadow-xs cursor-pointer"
                  >
                    <Printer size={14} />
                    <span>In Báo Cáo Tháng {focusedMonthCode}/{selectedYear}</span>
                  </button>
                </div>
              </div>

              {/* 12 Nút chọn tháng trực quan */}
              <div className="grid grid-cols-3 sm:grid-cols-6 lg:grid-cols-12 gap-1.5">
                {monthlyDataList.map((m) => {
                  const isFocused = focusedMonthCode === m.monthCode;
                  return (
                    <button
                      key={m.monthCode}
                      type="button"
                      onClick={() => {
                        setFocusedMonthCode(m.monthCode);
                        setSelectedPeriod(m.filterKey);
                      }}
                      className={`p-2 rounded-lg border text-center transition-all cursor-pointer ${
                        isFocused
                          ? 'bg-[#1B365D] text-white border-[#1B365D] shadow-xs font-bold'
                          : m.hasData
                          ? 'bg-white text-slate-800 border-slate-200 hover:border-[#0D9488]'
                          : 'bg-slate-100/60 text-slate-400 border-slate-200/60'
                      }`}
                    >
                      <div className="text-xs font-bold">Tháng {m.index}</div>
                      <div
                        className={`text-[10px] font-mono ${
                          isFocused ? 'text-teal-300' : 'text-slate-500'
                        }`}
                      >
                        {m.metrics.completedCount} cuốc
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Bảng P&L chi tiết của Tháng đang chọn + So sánh MoM tháng liền trước */}
              <div className="ha-table-scroll bg-white border border-slate-200 rounded-xl">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-800 text-white font-bold text-[11px]">
                      <th className="py-2 px-3 text-center w-16">Mã số</th>
                      <th className="py-2 px-3 text-left">
                        Chỉ tiêu P&L Chi tiết ({focusedMonthAnalysis.currentMonth.fullLabel})
                      </th>
                      <th className="py-2 px-3 text-right">
                        {focusedMonthAnalysis.currentMonth.fullLabel}
                      </th>
                      <th className="py-2 px-3 text-right">
                        {focusedMonthAnalysis.prevMonth
                          ? `Tháng liền trước (${focusedMonthAnalysis.prevMonth.fullLabel})`
                          : 'Tháng liền trước'}
                      </th>
                      <th className="py-2 px-3 text-right">Tăng / Giảm (MoM Δ)</th>
                      <th className="py-2 px-3 text-right">Tỷ trọng (%)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {focusedMonthAnalysis.currentMonth.plRows.map((row, rIdx) => {
                      const prevRow = focusedMonthAnalysis.prevMonth?.plRows[rIdx];
                      const prevVal = prevRow ? prevRow.value : null;
                      const diff = prevVal !== null ? row.value - prevVal : null;
                      const diffPct =
                        prevVal && prevVal !== 0
                          ? Math.round(((row.value - prevVal) / Math.abs(prevVal)) * 1000) / 10
                          : null;

                      const formatCell = (val) => {
                        if (val === null || val === undefined) return '-';
                        if (row.isVolume) return `${val.toLocaleString('vi-VN')} cuốc`;
                        if (row.isPercentOnly) return `${val}%`;
                        return formatVnd(val);
                      };

                      return (
                        <tr
                          key={row.code}
                          className={
                            row.rowType === 'grand_total_emerald'
                              ? 'bg-emerald-50 font-bold text-emerald-900 border-b-4 border-double border-emerald-700'
                              : row.rowType === 'highlight_navy'
                              ? 'bg-blue-50/70 font-bold text-[#1B365D]'
                              : row.rowType === 'highlight_teal'
                              ? 'bg-teal-50/70 font-bold text-[#0D9488]'
                              : 'hover:bg-slate-50'
                          }
                        >
                          <td className="py-2 px-3 text-center font-mono font-bold">
                            {row.code}
                          </td>
                          <td className="py-2 px-3">{row.name}</td>
                          <td className="py-2 px-3 text-right font-mono font-bold tabular-nums">
                            {formatCell(row.value)}
                          </td>
                          <td className="py-2 px-3 text-right font-mono tabular-nums text-slate-600">
                            {prevVal !== null ? formatCell(prevVal) : '-'}
                          </td>
                          <td className="py-2 px-3 text-right font-mono tabular-nums">
                            {diff !== null && !row.isPercentOnly ? (
                              <span
                                className={
                                  diff > 0
                                    ? 'text-emerald-700 font-semibold'
                                    : diff < 0
                                    ? 'text-rose-700 font-semibold'
                                    : 'text-slate-500'
                                }
                              >
                                {diff > 0 ? '+' : ''}
                                {row.isVolume ? `${diff}c` : formatTrieuDong(diff)}
                                {diffPct !== null ? ` (${diffPct > 0 ? '+' : ''}${diffPct}%)` : ''}
                              </span>
                            ) : (
                              '-'
                            )}
                          </td>
                          <td className="py-2 px-3 text-right font-mono tabular-nums text-slate-600">
                            {row.pct !== null && row.pct !== undefined ? `${row.pct}%` : '-'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* KHỐI B: MA TRẬN BÁO CÁO TÀI CHÍNH NGANG 12 THÁNG (T1 - T12 & CẢ NĂM) */}
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-bold text-[#1B365D] uppercase">
                  Ma Trận Báo Cáo Tài Chính 12 Tháng Năm {selectedYear} (Tháng 01 – Tháng 12 & Cả Năm)
                </h3>
                <span className="text-xs text-slate-500">
                  Cột chỉ tiêu cố định bên trái (Sticky) • Bấm nút máy in ở từng cột tháng để in riêng tháng đó
                </span>
              </div>

              <div className="ha-table-scroll border border-slate-200 rounded-xl">
                <table
                  data-testid="cfo-monthly-matrix-12m-table"
                  className="w-full text-xs border-collapse"
                >
                  <thead>
                    <tr className="bg-[#1B365D] text-white font-bold text-[11px]">
                      <th className="py-2.5 px-2.5 sticky left-0 bg-[#1B365D] z-20 border-r border-white/15 min-w-[230px] text-left">
                        Mã số & Chỉ tiêu Tài chính
                      </th>
                      {monthlyDataList.map((m) => (
                        <th key={m.monthCode} className="py-2 px-2.5 text-right min-w-[115px]">
                          <div className="flex items-center justify-end gap-1">
                            <span>{m.shortLabel}/{selectedYear.slice(2)}</span>
                            <button
                              type="button"
                              onClick={() => handleOpenPrintModal(m.filterKey)}
                              title={`In Báo cáo Tài chính ${m.fullLabel}`}
                              className="p-0.5 rounded bg-white/15 hover:bg-white/30 text-white cursor-pointer"
                            >
                              <Printer size={11} />
                            </button>
                          </div>
                        </th>
                      ))}
                      <th className="py-2.5 px-3 text-right bg-[#0D9488] min-w-[135px]">
                        CẢ NĂM {selectedYear}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {annualSummary.plRows.map((row, rIdx) => {
                      const formatCompact = (val) => {
                        if (row.isVolume) return `${val}`;
                        if (row.isPercentOnly) return `${val}%`;
                        return formatVnd(val);
                      };

                      const isHighlight =
                        row.rowType === 'highlight_navy' ||
                        row.rowType === 'highlight_teal' ||
                        row.rowType === 'grand_total_emerald';

                      return (
                        <tr
                          key={row.code}
                          className={
                            row.rowType === 'grand_total_emerald'
                              ? 'bg-emerald-50 font-bold text-emerald-900 border-b-4 border-double border-emerald-700'
                              : row.rowType === 'highlight_navy'
                              ? 'bg-blue-50/80 font-bold text-[#1B365D]'
                              : row.rowType === 'highlight_teal'
                              ? 'bg-teal-50/80 font-bold text-[#0D9488]'
                              : row.rowType === 'subtotal_amber'
                              ? 'bg-amber-50/60 font-bold text-amber-950'
                              : 'hover:bg-slate-50'
                          }
                        >
                          <td
                            className={`py-2 px-2.5 sticky left-0 z-10 border-r border-slate-200 ${
                              isHighlight ? 'bg-slate-100 font-bold' : 'bg-white'
                            }`}
                          >
                            <span className="font-mono font-bold text-[#1B365D] mr-1.5">
                              {row.code}
                            </span>
                            <span>{row.name}</span>
                          </td>
                          {monthlyDataList.map((m) => {
                            const mVal = m.plRows[rIdx]?.value ?? 0;
                            return (
                              <td
                                key={m.monthCode}
                                className="py-2 px-2.5 text-right font-mono tabular-nums"
                              >
                                {formatCompact(mVal)}
                              </td>
                            );
                          })}
                          <td className="py-2 px-3 text-right font-mono font-bold tabular-nums bg-slate-50">
                            {formatCompact(row.value)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* TAB 3: HIỆU SUẤT ĐỘI XE (UNIT ECONOMICS PER TRUCK / TRIP) */}
        {/* ============================================================ */}
        {activeReportTab === 'UNIT_ECONOMICS' && (
          <div className="p-4 space-y-6">
            <div>
              <h3 className="text-sm font-bold text-[#1B365D] uppercase">
                Bảng Phân Tích Hiệu Suất Đơn Vị Từng Đầu Xe (Unit Economics — Kỳ: {activePeriodLabel})
              </h3>
              <p className="text-xs text-slate-500">
                Đo lường Doanh thu/Chuyến, Lít dầu/Chuyến, Chênh lệch/Chuyến của 6 đầu kéo chủ lực và khối Điều phối xe thuê ngoài.
              </p>
            </div>

            <div className="ha-table-scroll border border-slate-200 rounded-xl">
              <table
                data-testid="cfo-unit-economics-table"
                className="w-full text-xs border-collapse"
              >
                <thead>
                  <tr className="bg-[#1B365D] text-white font-bold text-[11px]">
                    <th className="py-2.5 px-3 text-left">Đầu xe / Khối khai thác</th>
                    <th className="py-2.5 px-2.5 text-center">Số chuyến</th>
                    <th className="py-2.5 px-3 text-right">Cước gốc (Chưa VAT)</th>
                    <th className="py-2.5 px-3 text-right">Cước sau trừ 17%</th>
                    <th className="py-2.5 px-3 text-right">Dầu cấp (Lít)</th>
                    <th className="py-2.5 px-3 text-right">Tiền đường BOT</th>
                    <th className="py-2.5 px-3 text-right">Tổng Chi phí CTy</th>
                    <th className="py-2.5 px-3 text-right bg-[#0D9488]">
                      Chênh lệch tạm tính
                    </th>
                    <th className="py-2.5 px-2.5 text-right">Biên (%)</th>
                    <th className="py-2.5 px-3 text-right">DT / Chuyến</th>
                    <th className="py-2.5 px-3 text-right">Lãi / Chuyến</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {unitEconomicsData.fleetRows.map((r) => (
                    <tr
                      key={r.id}
                      className={
                        r.category === 'SUBCONTRACT'
                          ? 'bg-amber-50/50 font-semibold'
                          : 'hover:bg-slate-50'
                      }
                    >
                      <td className="py-2.5 px-3 font-bold text-slate-900">{r.label}</td>
                      <td className="py-2.5 px-2.5 text-center font-mono font-bold">
                        {r.tripsCount}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                        {formatVnd(r.cuocGoc)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-semibold text-[#1B365D] tabular-nums">
                        {formatVnd(r.cuocSauTru17)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                        {r.fuelLiters > 0 ? `${r.fuelLiters.toLocaleString('vi-VN')} L` : '-'}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                        {formatVnd(r.tollCost)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums text-amber-900">
                        {formatVnd(r.totalCost)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-800 bg-emerald-50/40 tabular-nums">
                        +{formatVnd(r.profitMain)}
                      </td>
                      <td className="py-2.5 px-2.5 text-right font-mono font-bold text-[#0D9488] tabular-nums">
                        {r.marginPct}%
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                        {formatVnd(r.revPerTrip)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-semibold text-emerald-700 tabular-nums">
                        +{formatVnd(r.profitPerTrip)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Bảng theo dõi riêng 12 tháng của đầu xe chủ lực (15H00266 hoặc chọn xe bất kỳ) */}
            <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h4 className="text-xs font-bold uppercase text-[#1B365D]">
                    Bảng Theo Dõi P&L 12 Tháng Của Đầu Xe Chủ Lực: {focusedTruckPlate} (Năm {selectedYear})
                  </h4>
                  <p className="text-[11px] text-slate-500">
                    Chọn biển số xe bất kỳ để xem biến động sản lượng, doanh thu, dầu cấp và chênh lệch 12 tháng của xe đó
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {housePlatesList.map((plate) => (
                    <button
                      key={plate}
                      type="button"
                      onClick={() => setFocusedTruckPlate(plate)}
                      className={`px-2.5 py-1 rounded-md text-xs font-mono font-bold cursor-pointer transition-all ${
                        focusedTruckPlate === plate
                          ? 'bg-[#1B365D] text-white'
                          : 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-100'
                      }`}
                    >
                      {plate}
                    </button>
                  ))}
                </div>
              </div>

              <div className="ha-table-scroll bg-white border border-slate-200 rounded-xl">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-800 text-white font-bold text-[11px]">
                      <th className="py-2 px-3 text-left">Tháng</th>
                      <th className="py-2 px-2.5 text-center">Số chuyến</th>
                      <th className="py-2 px-3 text-right">Cước gốc</th>
                      <th className="py-2 px-3 text-right">Cước sau trừ 17%</th>
                      <th className="py-2 px-3 text-right">Lít dầu cấp</th>
                      <th className="py-2 px-3 text-right">Tiền đường BOT</th>
                      <th className="py-2 px-3 text-right">Nâng hạ & PS</th>
                      <th className="py-2 px-3 text-right">Tổng chi phí</th>
                      <th className="py-2 px-3 text-right">Chênh lệch tạm tính</th>
                      <th className="py-2 px-2.5 text-right">Biên (%)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {unitEconomicsData.truck12Months.map((tm) => (
                      <tr key={tm.monthCode} className="hover:bg-slate-50">
                        <td className="py-2 px-3 font-bold">
                          Tháng {tm.monthCode}/{selectedYear}
                        </td>
                        <td className="py-2 px-2.5 text-center font-mono font-bold">
                          {tm.tripsCount}
                        </td>
                        <td className="py-2 px-3 text-right font-mono tabular-nums">
                          {formatVnd(tm.cuocGoc)}
                        </td>
                        <td className="py-2 px-3 text-right font-mono font-semibold text-[#1B365D] tabular-nums">
                          {formatVnd(tm.cuocSauTru17)}
                        </td>
                        <td className="py-2 px-3 text-right font-mono tabular-nums">
                          {tm.fuelLiters > 0 ? `${tm.fuelLiters.toLocaleString('vi-VN')} L` : '-'}
                        </td>
                        <td className="py-2 px-3 text-right font-mono tabular-nums">
                          {formatVnd(tm.tollCost)}
                        </td>
                        <td className="py-2 px-3 text-right font-mono tabular-nums">
                          {formatVnd(tm.liftAndOther)}
                        </td>
                        <td className="py-2 px-3 text-right font-mono tabular-nums text-amber-900">
                          {formatVnd(tm.totalCost)}
                        </td>
                        <td className="py-2 px-3 text-right font-mono font-bold text-emerald-700 tabular-nums">
                          {tm.tripsCount > 0 ? `+${formatVnd(tm.profitMain)}` : '0 ₫'}
                        </td>
                        <td className="py-2 px-2.5 text-right font-mono tabular-nums">
                          {tm.marginPct}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* TAB 4: QUẢN TRỊ CÔNG NỢ KHÁCH HÀNG & NHÀ XE (AR / AP AGING) */}
        {/* ============================================================ */}
        {activeReportTab === 'AR_AP_AGING' && (
          <div className="p-4 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-[#1B365D] uppercase">
                  Bảng Quản Trị Công Nợ Phải Thu Khách Hàng (AR) & Tiền Phơi Trả Hộ — Kỳ: {activePeriodLabel}
                </h3>
                <p className="text-xs text-slate-500">
                  Theo dõi doanh thu, tiền đã thu, dư nợ cước phải thu (AR) và tỷ lệ thu hồi của từng chủ hàng ({arApAnalysis.customerRows.length} khách hàng)
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                {[
                  { id: 'ALL', label: 'Tất cả khách hàng' },
                  { id: 'HAS_AR', label: 'Còn nợ cước (AR > 0)' },
                  { id: 'SETTLED', label: 'Đã tất toán (AR = 0)' },
                  { id: 'HAS_PHOI', label: 'Còn nợ phơi trả hộ' }
                ].map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setArStatusFilter(f.id)}
                    className={`px-2.5 py-1 rounded-lg font-semibold cursor-pointer ${
                      arStatusFilter === f.id
                        ? 'bg-[#1B365D] text-white'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="ha-table-scroll border border-slate-200 rounded-xl max-h-[520px] overflow-y-auto">
              <table data-testid="cfo-ar-ap-table" className="w-full text-xs border-collapse">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-[#1B365D] text-white font-bold text-[11px]">
                    <th className="py-2.5 px-3 text-center w-12">#</th>
                    <th className="py-2.5 px-3 text-left">Khách hàng / Chủ hàng</th>
                    <th className="py-2.5 px-2.5 text-center">Số chuyến</th>
                    <th className="py-2.5 px-3 text-right">Cước gốc (Chưa VAT)</th>
                    <th className="py-2.5 px-3 text-right">Cước có VAT (×1,08)</th>
                    <th className="py-2.5 px-3 text-right">Sau trừ 17% (×0,83)</th>
                    <th className="py-2.5 px-3 text-right">Đã thu & Đối trừ</th>
                    <th className="py-2.5 px-3 text-right bg-rose-800">
                      Còn phải thu (AR)
                    </th>
                    <th className="py-2.5 px-3 text-right">Phơi còn thu</th>
                    <th className="py-2.5 px-3 text-center w-36">Tỷ lệ thu hồi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {arApAnalysis.customerRows.map((c, idx) => (
                    <tr key={c.customerName} className="hover:bg-slate-50">
                      <td className="py-2 px-3 text-center font-mono text-slate-500">
                        {idx + 1}
                      </td>
                      <td className="py-2 px-3 font-bold text-slate-900">{c.customerName}</td>
                      <td className="py-2 px-2.5 text-center font-mono font-bold">
                        {c.tripsCount}
                      </td>
                      <td className="py-2 px-3 text-right font-mono tabular-nums">
                        {formatVnd(c.cuocGoc)}
                      </td>
                      <td className="py-2 px-3 text-right font-mono tabular-nums text-slate-600">
                        {formatVnd(c.cuocCoVat)}
                      </td>
                      <td className="py-2 px-3 text-right font-mono font-semibold text-[#1B365D] tabular-nums">
                        {formatVnd(c.cuocSauTru17)}
                      </td>
                      <td className="py-2 px-3 text-right font-mono text-emerald-700 font-semibold tabular-nums">
                        {formatVnd(c.cashSettled)}
                      </td>
                      <td className="py-2 px-3 text-right font-mono font-bold text-rose-700 bg-rose-50/40 tabular-nums">
                        {formatVnd(c.arOutstanding)}
                      </td>
                      <td className="py-2 px-3 text-right font-mono text-purple-700 tabular-nums">
                        {c.phoiBalanceDue > 0 ? formatVnd(c.phoiBalanceDue) : '0 ₫'}
                      </td>
                      <td className="py-2 px-3">
                        <div className="flex items-center gap-1.5">
                          <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-[#0D9488] rounded-full"
                              style={{ width: `${Math.min(100, c.collectionRatePct)}%` }}
                            />
                          </div>
                          <span className="font-mono text-[10px] font-bold w-10 text-right">
                            {c.collectionRatePct}%
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* ============================================================ */}
      {/* 5. MODAL XEM TRƯỚC & IN BÁO CÁO TÀI CHÍNH CHUẨN CFO (T1-T12 / QUÝ / NĂM) */}
      {/* ============================================================ */}
      {printModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="In Báo Cáo Tài Chính Doanh Nghiệp"
          data-testid="cfo-print-report-modal"
          className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex flex-col items-center justify-start overflow-y-auto p-2 sm:p-6"
          onClick={() => setPrintModalOpen(false)}
        >
          <div
            className="w-full max-w-6xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden my-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Thanh điều khiển chọn Tháng / Quý / Năm cần in */}
            <div className="p-4 bg-[#1B365D] text-white flex flex-col lg:flex-row lg:items-center justify-between gap-3 no-print">
              <div className="flex items-center gap-2.5">
                <Printer className="w-5 h-5 text-teal-300 shrink-0" />
                <div>
                  <h3 className="text-sm font-bold">
                    In Báo Cáo Tài Chính Doanh Nghiệp (Chọn Bất Kỳ Tháng Nào T1–T12, Quý Hoặc Cả Năm {selectedYear})
                  </h3>
                  <p className="text-[11px] text-slate-200">
                    Định dạng chuẩn A4 Ngang • Có đầy đủ bảng P&L đa tầng (MS.01–MS.75), Đội xe, Công nợ & Chữ ký phê duyệt
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={printReportPeriod}
                  onChange={(e) => setPrintReportPeriod(e.target.value)}
                  data-testid="cfo-modal-select-print-period"
                  className="bg-slate-900 border border-white/25 text-white rounded-lg px-3 py-1.5 text-xs font-bold"
                >
                  <option value="all">
                    Báo Cáo Tài Chính Cả Năm {selectedYear} (Tổng hợp 12 Tháng & 4 Quý)
                  </option>
                  <optgroup label={`In Theo Quý Năm ${selectedYear}`}>
                    {QUARTERS_CONFIG.map((q) => (
                      <option key={q.filterKey} value={q.filterKey}>
                        Báo Cáo Tài Chính {q.label}/{selectedYear}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label={`In Từng Tháng Bất Kỳ Năm ${selectedYear}`}>
                    {monthlyDataList.map((m) => (
                      <option key={m.filterKey} value={m.filterKey}>
                        Báo Cáo Tài Chính {m.fullLabel} ({m.metrics.completedCount} chuyến)
                      </option>
                    ))}
                  </optgroup>
                </select>

                <button
                  type="button"
                  onClick={handleExecutePrint}
                  data-testid="cfo-modal-btn-execute-print"
                  className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-[#10B981] hover:bg-emerald-500 text-white rounded-lg text-xs font-bold shadow-sm cursor-pointer"
                >
                  <Printer size={15} />
                  <span>In Ngay / Xuất PDF (Ctrl+P)</span>
                </button>

                <button
                  type="button"
                  onClick={() => setPrintModalOpen(false)}
                  data-testid="cfo-modal-btn-close"
                  className="inline-flex items-center gap-1 px-3 py-1.5 bg-white/15 hover:bg-white/25 text-white rounded-lg text-xs font-semibold cursor-pointer"
                >
                  <X size={15} />
                  <span>Đóng</span>
                </button>
              </div>
            </div>

            {/* Thanh chọn nhanh tháng cần in ngay trong Modal */}
            <div className="px-4 py-2.5 bg-slate-100 border-b border-slate-200 space-y-2 no-print">
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
                <span className="text-[11px] font-bold text-slate-700 shrink-0 mr-1">
                  Chọn nhanh kỳ in:
                </span>
                <button
                  type="button"
                  onClick={() => setPrintReportPeriod('all')}
                  className={`px-2.5 py-1 rounded text-xs font-bold shrink-0 cursor-pointer ${
                    printReportPeriod === 'all'
                      ? 'bg-[#1B365D] text-white'
                      : 'bg-white text-slate-700 border border-slate-300'
                  }`}
                >
                  Cả Năm {selectedYear}
                </button>
                {monthlyDataList.map((m) => (
                  <button
                    key={m.filterKey}
                    type="button"
                    onClick={() => setPrintReportPeriod(m.filterKey)}
                    data-testid={`cfo-print-quick-month-${m.monthCode}`}
                    className={`px-2 py-1 rounded text-xs font-semibold shrink-0 cursor-pointer ${
                      printReportPeriod === m.filterKey
                        ? 'bg-[#0D9488] text-white font-bold'
                        : 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    T{m.index} ({m.metrics.completedCount})
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-4 text-xs text-slate-700 pt-1 border-t border-slate-200/80">
                <span className="font-bold text-slate-900">Tùy chọn phần in:</span>
                {!printReportTarget.isSingleMonth && (
                  <label className="inline-flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={printIncludeMonthlyMatrix}
                      onChange={(e) => setPrintIncludeMonthlyMatrix(e.target.checked)}
                    />
                    <span>Kèm Ma trận 12 Tháng (T1–T12)</span>
                  </label>
                )}
                <label className="inline-flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={printIncludeUnitEconomics}
                    onChange={(e) => setPrintIncludeUnitEconomics(e.target.checked)}
                  />
                  <span>Kèm Bảng Hiệu suất Đội xe</span>
                </label>
                <label className="inline-flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={printIncludeArAp}
                    onChange={(e) => setPrintIncludeArAp(e.target.checked)}
                  />
                  <span>Kèm Bảng Top Công nợ Khách hàng (AR)</span>
                </label>
                <label className="inline-flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={printIncludeTripsAppendix}
                    onChange={(e) => setPrintIncludeTripsAppendix(e.target.checked)}
                  />
                  <span>
                    Kèm Phụ lục chi tiết chuyến xe ({printReportTarget.targetTrips.length} cuốc)
                  </span>
                </label>
              </div>
            </div>

            {/* VÙNG TRANG IN A4 LANDSCAPE */}
            <div className="p-4 sm:p-6 bg-slate-200/60 max-h-[75vh] overflow-y-auto">
              <div
                ref={printContainerRef}
                id="printable-business-report-area"
                className="bg-white p-6 rounded-xl shadow-sm border border-slate-300 space-y-5 text-slate-900"
              >
                {/* Quốc hiệu & Tiêu đề Công ty */}
                <div className="flex justify-between items-start border-b-2 border-[#1B365D] pb-3">
                  <div>
                    <div className="text-xs font-bold uppercase text-[#1B365D]">
                      CÔNG TY VẬN TẢI CONTAINER & LOGISTICS
                    </div>
                    <div className="text-[11px] text-slate-600">
                      Hệ thống Quản trị Tài chính & Điều vận Tập trung • Chuẩn báo cáo CFO (MS.01–MS.75)
                    </div>
                  </div>
                  <div className="text-right text-[11px] text-slate-600">
                    <div className="font-bold text-slate-900">MẪU BÁO CÁO: BCTC-PL-{selectedYear}</div>
                    <div>Ngày giờ xuất bản in: {new Date().toLocaleString('vi-VN')}</div>
                  </div>
                </div>

                <div className="text-center space-y-1">
                  <h1 className="text-lg sm:text-xl font-bold uppercase text-[#1B365D]">
                    BÁO CÁO TÀI CHÍNH & KẾT QUẢ HOẠT ĐỘNG KINH DOANH — {printReportTarget.periodTitle}
                  </h1>
                  <div className="text-xs font-semibold text-slate-600">
                    Tổng sản lượng: {printReportTarget.metrics.completedCount} chuyến hoàn tất (
                    {printReportTarget.metrics.houseTripsCount} chuyến Đội xe nhà /{' '}
                    {printReportTarget.metrics.subTripsCount} chuyến Điều phối thuê ngoài)
                  </div>
                </div>

                {/* 4 Ô Tóm tắt Chiến lược trên Bản In */}
                <div className="print-kpi-grid grid grid-cols-2 lg:grid-cols-4 gap-3">
                  <div className="print-kpi-box border border-slate-300 rounded-lg p-2.5 bg-slate-50">
                    <div className="text-[10px] font-bold uppercase text-[#1B365D]">
                      1. Doanh thu cước gốc (MS.10)
                    </div>
                    <div className="text-sm font-bold font-mono mt-0.5">
                      {formatVnd(printReportTarget.metrics.totalCuocGoc)}
                    </div>
                    <div className="text-[10px] text-slate-600">
                      Có VAT (MS.14): {formatVnd(printReportTarget.metrics.totalCuocCoVat)}
                    </div>
                  </div>

                  <div className="print-kpi-box border border-blue-300 rounded-lg p-2.5 bg-blue-50/40">
                    <div className="text-[10px] font-bold uppercase text-blue-900">
                      2. Doanh thu sau trừ 17% (MS.16)
                    </div>
                    <div className="text-sm font-bold font-mono text-blue-900 mt-0.5">
                      {formatVnd(printReportTarget.metrics.totalCuocSauTru17)}
                    </div>
                    <div className="text-[10px] text-slate-600">
                      Khoản trừ 17%: -{formatVnd(printReportTarget.metrics.totalKhoanTru17)}
                    </div>
                  </div>

                  <div className="print-kpi-box border border-amber-300 rounded-lg p-2.5 bg-amber-50/40">
                    <div className="text-[10px] font-bold uppercase text-amber-900">
                      3. Tổng chi phí công ty (MS.50)
                    </div>
                    <div className="text-sm font-bold font-mono text-amber-950 mt-0.5">
                      {formatVnd(printReportTarget.metrics.totalChiPhiCongTy)}
                    </div>
                    <div className="text-[10px] text-slate-600">
                      Thuê ngoài: {formatTrieuDong(printReportTarget.metrics.totalCuocRa)} • BOT:{' '}
                      {formatTrieuDong(printReportTarget.metrics.totalToll)}
                    </div>
                  </div>

                  <div className="print-kpi-box border border-emerald-300 rounded-lg p-2.5 bg-emerald-50/40">
                    <div className="text-[10px] font-bold uppercase text-emerald-900">
                      4. Chênh lệch tạm tính (MS.60)
                    </div>
                    <div className="text-sm font-bold font-mono text-emerald-900 mt-0.5">
                      +{formatVnd(printReportTarget.metrics.totalChenhLechSauTru17)}
                    </div>
                    <div className="text-[10px] text-slate-600">
                      Còn phải thu AR: {formatTrieuDong(printReportTarget.metrics.totalConPhaiThuKhach)}
                    </div>
                  </div>
                </div>

                {/* PHẦN I: BẢNG BÁO CÁO KẾT QUẢ KINH DOANH ĐA TẦNG (MS.01 - MS.75) */}
                <div>
                  <div className="print-section-hdr text-xs font-bold uppercase text-[#1B365D] border-b-2 border-[#1B365D] pb-1 mb-2">
                    I. BẢNG BÁO CÁO KẾT QUẢ HOẠT ĐỘNG KINH DOANH & LƯU CHUYỂN TIỀN TỆ ({printReportTarget.periodTitle})
                  </div>
                  <table className="w-full text-[11px] border-collapse border border-slate-300">
                    <thead>
                      <tr className="bg-[#1B365D] text-white">
                        <th className="border border-slate-300 py-1.5 px-2 text-center w-16">
                          Mã số
                        </th>
                        <th className="border border-slate-300 py-1.5 px-2 text-left">
                          Chỉ tiêu Tài chính & Kế toán Quản trị
                        </th>
                        <th className="border border-slate-300 py-1.5 px-2 text-right w-40">
                          Số tiền / Giá trị ({printReportTarget.periodTitle})
                        </th>
                        {printReportTarget.prevMonthMetrics && (
                          <th className="border border-slate-300 py-1.5 px-2 text-right w-36">
                            Kỳ liền trước ({printReportTarget.prevMonthLabel})
                          </th>
                        )}
                        <th className="border border-slate-300 py-1.5 px-2 text-right w-24">
                          Tỷ trọng (%)
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {printReportTarget.plRows.map((row, idx) => {
                        const prevRows = printReportTarget.prevMonthMetrics
                          ? buildCorporatePlRows(printReportTarget.prevMonthMetrics, revenueBasis)
                          : null;
                        const prevVal = prevRows ? prevRows[idx]?.value : null;

                        const fmtVal = (v) => {
                          if (v === null || v === undefined) return '-';
                          if (row.isVolume) return `${v.toLocaleString('vi-VN')} chuyến`;
                          if (row.isPercentOnly) return `${v}%`;
                          return formatVnd(v);
                        };

                        const trCls =
                          row.rowType === 'grand_total_emerald'
                            ? 'row-emerald font-bold bg-emerald-50 double-bottom'
                            : row.rowType === 'highlight_navy'
                            ? 'row-navy font-bold bg-blue-50'
                            : row.rowType === 'highlight_teal'
                            ? 'row-teal font-bold bg-teal-50'
                            : row.rowType === 'subtotal_amber'
                            ? 'row-amber font-bold bg-amber-50'
                            : '';

                        return (
                          <React.Fragment key={row.code}>
                            {row.section && (
                              <tr className="row-section bg-slate-200 font-bold">
                                <td
                                  colSpan={printReportTarget.prevMonthMetrics ? 5 : 4}
                                  className="border border-slate-300 py-1 px-2 uppercase"
                                >
                                  {row.section}
                                </td>
                              </tr>
                            )}
                            <tr className={trCls}>
                              <td className="border border-slate-300 py-1 px-2 text-center font-mono font-bold">
                                {row.code}
                              </td>
                              <td className="border border-slate-300 py-1 px-2">{row.name}</td>
                              <td className="border border-slate-300 py-1 px-2 text-right font-mono font-bold">
                                {fmtVal(row.value)}
                              </td>
                              {printReportTarget.prevMonthMetrics && (
                                <td className="border border-slate-300 py-1 px-2 text-right font-mono">
                                  {fmtVal(prevVal)}
                                </td>
                              )}
                              <td className="border border-slate-300 py-1 px-2 text-right font-mono">
                                {row.pct !== null && row.pct !== undefined ? `${row.pct}%` : '-'}
                              </td>
                            </tr>
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* PHẦN II: MA TRẬN THỐNG KÊ 12 THÁNG TRONG NĂM (Khi in báo cáo Cả Năm hoặc Quý) */}
                {!printReportTarget.isSingleMonth && printIncludeMonthlyMatrix && (
                  <div>
                    <div className="print-section-hdr text-xs font-bold uppercase text-[#1B365D] border-b-2 border-[#1B365D] pb-1 mb-2">
                      II. BẢNG THỐNG KÊ TỔNG HỢP TỪNG THÁNG TRONG NĂM {selectedYear} (THÁNG 01 – THÁNG 12)
                    </div>
                    <table className="w-full text-[10px] border-collapse border border-slate-300">
                      <thead>
                        <tr className="bg-[#1B365D] text-white">
                          <th className="border border-slate-300 py-1 px-1.5 text-left">Tháng</th>
                          <th className="border border-slate-300 py-1 px-1.5 text-center">
                            Số cuốc
                          </th>
                          <th className="border border-slate-300 py-1 px-1.5 text-center">
                            Nhà/Ngoài
                          </th>
                          <th className="border border-slate-300 py-1 px-1.5 text-right">
                            Cước gốc (MS.10)
                          </th>
                          <th className="border border-slate-300 py-1 px-1.5 text-right">
                            Có VAT (MS.14)
                          </th>
                          <th className="border border-slate-300 py-1 px-1.5 text-right">
                            Sau trừ 17% (MS.16)
                          </th>
                          <th className="border border-slate-300 py-1 px-1.5 text-right">
                            Thuê ngoài
                          </th>
                          <th className="border border-slate-300 py-1 px-1.5 text-right">
                            BOT & Nâng hạ
                          </th>
                          <th className="border border-slate-300 py-1 px-1.5 text-right">
                            Tổng chi phí
                          </th>
                          <th className="border border-slate-300 py-1 px-1.5 text-right">
                            Chênh lệch (MS.60)
                          </th>
                          <th className="border border-slate-300 py-1 px-1.5 text-right">
                            Phải thu AR
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {monthlyDataList.map((m) => (
                          <tr key={m.monthCode}>
                            <td className="border border-slate-300 py-1 px-1.5 font-bold">
                              {m.fullLabel}
                            </td>
                            <td className="border border-slate-300 py-1 px-1.5 text-center font-mono font-bold">
                              {m.metrics.completedCount}
                            </td>
                            <td className="border border-slate-300 py-1 px-1.5 text-center font-mono">
                              {m.metrics.houseTripsCount}/{m.metrics.subTripsCount}
                            </td>
                            <td className="border border-slate-300 py-1 px-1.5 text-right font-mono">
                              {formatVnd(m.metrics.totalCuocGoc)}
                            </td>
                            <td className="border border-slate-300 py-1 px-1.5 text-right font-mono">
                              {formatVnd(m.metrics.totalCuocCoVat)}
                            </td>
                            <td className="border border-slate-300 py-1 px-1.5 text-right font-mono font-bold">
                              {formatVnd(m.metrics.totalCuocSauTru17)}
                            </td>
                            <td className="border border-slate-300 py-1 px-1.5 text-right font-mono">
                              {formatVnd(m.metrics.totalCuocRa)}
                            </td>
                            <td className="border border-slate-300 py-1 px-1.5 text-right font-mono">
                              {formatVnd(m.metrics.totalToll + m.metrics.totalNangHaPhatSinh)}
                            </td>
                            <td className="border border-slate-300 py-1 px-1.5 text-right font-mono">
                              {formatVnd(m.metrics.totalChiPhiCongTy)}
                            </td>
                            <td className="border border-slate-300 py-1 px-1.5 text-right font-mono font-bold">
                              +{formatVnd(m.metrics.totalChenhLechSauTru17)}
                            </td>
                            <td className="border border-slate-300 py-1 px-1.5 text-right font-mono">
                              {formatVnd(m.metrics.totalConPhaiThuKhach)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="row-emerald font-bold bg-emerald-50 double-bottom">
                          <td className="border border-slate-300 py-1.5 px-1.5">
                            TỔNG CẢ NĂM {selectedYear}
                          </td>
                          <td className="border border-slate-300 py-1.5 px-1.5 text-center font-mono">
                            {annualSummary.metrics.completedCount}
                          </td>
                          <td className="border border-slate-300 py-1.5 px-1.5 text-center font-mono">
                            {annualSummary.metrics.houseTripsCount}/
                            {annualSummary.metrics.subTripsCount}
                          </td>
                          <td className="border border-slate-300 py-1.5 px-1.5 text-right font-mono">
                            {formatVnd(annualSummary.metrics.totalCuocGoc)}
                          </td>
                          <td className="border border-slate-300 py-1.5 px-1.5 text-right font-mono">
                            {formatVnd(annualSummary.metrics.totalCuocCoVat)}
                          </td>
                          <td className="border border-slate-300 py-1.5 px-1.5 text-right font-mono">
                            {formatVnd(annualSummary.metrics.totalCuocSauTru17)}
                          </td>
                          <td className="border border-slate-300 py-1.5 px-1.5 text-right font-mono">
                            {formatVnd(annualSummary.metrics.totalCuocRa)}
                          </td>
                          <td className="border border-slate-300 py-1.5 px-1.5 text-right font-mono">
                            {formatVnd(
                              annualSummary.metrics.totalToll +
                                annualSummary.metrics.totalNangHaPhatSinh
                            )}
                          </td>
                          <td className="border border-slate-300 py-1.5 px-1.5 text-right font-mono">
                            {formatVnd(annualSummary.metrics.totalChiPhiCongTy)}
                          </td>
                          <td className="border border-slate-300 py-1.5 px-1.5 text-right font-mono">
                            +{formatVnd(annualSummary.metrics.totalChenhLechSauTru17)}
                          </td>
                          <td className="border border-slate-300 py-1.5 px-1.5 text-right font-mono">
                            {formatVnd(annualSummary.metrics.totalConPhaiThuKhach)}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}

                {/* PHẦN III: BẢNG HIỆU SUẤT ĐỘI XE & CÔNG NỢ TRỌNG ĐIỂM TRONG KỲ IN */}
                {(printIncludeUnitEconomics || printIncludeArAp) && (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {printIncludeUnitEconomics && (
                      <div>
                        <div className="print-section-hdr text-xs font-bold uppercase text-[#1B365D] border-b-2 border-[#1B365D] pb-1 mb-2">
                          III. HIỆU SUẤT KHAI THÁC ĐỘI XE ({printReportTarget.periodTitle})
                        </div>
                        <table className="w-full text-[10px] border-collapse border border-slate-300">
                          <thead>
                            <tr className="bg-slate-100">
                              <th className="border border-slate-300 py-1 px-1.5 text-left">
                                Đầu xe / Khối
                              </th>
                              <th className="border border-slate-300 py-1 px-1.5 text-center">
                                Số cuốc
                              </th>
                              <th className="border border-slate-300 py-1 px-1.5 text-right">
                                Sau trừ 17%
                              </th>
                              <th className="border border-slate-300 py-1 px-1.5 text-right">
                                Chi phí CTy
                              </th>
                              <th className="border border-slate-300 py-1 px-1.5 text-right">
                                Chênh lệch
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {printReportTarget.fleetRowsInPrint.map((fr) => (
                              <tr key={fr.label}>
                                <td className="border border-slate-300 py-1 px-1.5 font-bold">
                                  {fr.label}
                                </td>
                                <td className="border border-slate-300 py-1 px-1.5 text-center font-mono">
                                  {fr.completedCount}
                                </td>
                                <td className="border border-slate-300 py-1 px-1.5 text-right font-mono">
                                  {formatVnd(fr.totalCuocSauTru17)}
                                </td>
                                <td className="border border-slate-300 py-1 px-1.5 text-right font-mono">
                                  {formatVnd(fr.totalChiPhiCongTy)}
                                </td>
                                <td className="border border-slate-300 py-1 px-1.5 text-right font-mono font-bold">
                                  +{formatVnd(fr.totalChenhLechSauTru17)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {printIncludeArAp && (
                      <div>
                        <div className="print-section-hdr text-xs font-bold uppercase text-[#1B365D] border-b-2 border-[#1B365D] pb-1 mb-2">
                          IV. TOP KHÁCH HÀNG & CÔNG NỢ PHẢI THU ({printReportTarget.periodTitle})
                        </div>
                        <table className="w-full text-[10px] border-collapse border border-slate-300">
                          <thead>
                            <tr className="bg-slate-100">
                              <th className="border border-slate-300 py-1 px-1.5 text-left">
                                Khách hàng
                              </th>
                              <th className="border border-slate-300 py-1 px-1.5 text-center">
                                Cuốc
                              </th>
                              <th className="border border-slate-300 py-1 px-1.5 text-right">
                                Cước gốc
                              </th>
                              <th className="border border-slate-300 py-1 px-1.5 text-right">
                                Đã thu
                              </th>
                              <th className="border border-slate-300 py-1 px-1.5 text-right">
                                Còn phải thu AR
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {printReportTarget.topCustomersInPrint.map((cr) => (
                              <tr key={cr.customerName}>
                                <td className="border border-slate-300 py-1 px-1.5 font-bold">
                                  {cr.customerName}
                                </td>
                                <td className="border border-slate-300 py-1 px-1.5 text-center font-mono">
                                  {cr.completedCount}
                                </td>
                                <td className="border border-slate-300 py-1 px-1.5 text-right font-mono">
                                  {formatVnd(cr.totalCuocGoc)}
                                </td>
                                <td className="border border-slate-300 py-1 px-1.5 text-right font-mono">
                                  {formatVnd(cr.cashSettledKhach)}
                                </td>
                                <td className="border border-slate-300 py-1 px-1.5 text-right font-mono font-bold">
                                  {formatVnd(cr.totalConPhaiThuKhach)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}

                {/* PHỤ LỤC CHI TIẾT TỪNG CHUYẾN XE TRONG KỲ IN (NẾU BẬT) */}
                {printIncludeTripsAppendix && printReportTarget.targetTrips.length > 0 && (
                  <div>
                    <div className="print-section-hdr text-xs font-bold uppercase text-[#1B365D] border-b-2 border-[#1B365D] pb-1 mb-2">
                      PHỤ LỤC: BẢNG KÊ CHI TIẾT TỪNG CHUYẾN XE ({printReportTarget.targetTrips.length} CHUYẾN)
                    </div>
                    <table className="w-full text-[9.5px] border-collapse border border-slate-300">
                      <thead>
                        <tr className="bg-slate-100">
                          <th className="border border-slate-300 py-1 px-1 text-center">#</th>
                          <th className="border border-slate-300 py-1 px-1 text-center">Ngày</th>
                          <th className="border border-slate-300 py-1 px-1 text-left">Chủ hàng</th>
                          <th className="border border-slate-300 py-1 px-1 text-left">Tuyến</th>
                          <th className="border border-slate-300 py-1 px-1 text-center">Số Cont</th>
                          <th className="border border-slate-300 py-1 px-1 text-center">Xe/NX</th>
                          <th className="border border-slate-300 py-1 px-1 text-right">Cước gốc</th>
                          <th className="border border-slate-300 py-1 px-1 text-right">
                            Sau trừ 17%
                          </th>
                          <th className="border border-slate-300 py-1 px-1 text-right">
                            Chi phí CTy
                          </th>
                          <th className="border border-slate-300 py-1 px-1 text-right">
                            Chênh lệch
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {printReportTarget.targetTrips.map((t, idx) => {
                          const f = computeTripFinancials({
                            base_revenue: t.cuoc_goc ?? t.base_revenue ?? t.cuoc_vao ?? 0,
                            lift_on_fee: t.phi_nang ?? t.lift_on_fee ?? 0,
                            lift_off_fee: t.phi_ha ?? t.lift_off_fee ?? 0,
                            port_fee: t.port_fee ?? 0,
                            fuel_liters: t.dau_liters ?? t.dau_lit ?? 0,
                            fuel_unit_price: t.don_gia_dau ?? t.fuel_unit_price ?? null,
                            fuel_cost: t.tien_dau ?? t.fuel_cost ?? null,
                            toll_fee: t.tien_duong ?? t.toll_fee ?? 0,
                            subcontractor_cost: t.cuoc_ra ?? t.subcontractor_cost ?? 0,
                            other_costs: t.phat_sinh ?? t.other_costs ?? 0
                          });
                          return (
                            <tr key={t.id || idx}>
                              <td className="border border-slate-300 py-0.5 px-1 text-center font-mono">
                                {idx + 1}
                              </td>
                              <td className="border border-slate-300 py-0.5 px-1 text-center font-mono">
                                {t.trip_date}
                              </td>
                              <td className="border border-slate-300 py-0.5 px-1">
                                {t.customer_name}
                              </td>
                              <td className="border border-slate-300 py-0.5 px-1">
                                {t.route_name}
                              </td>
                              <td className="border border-slate-300 py-0.5 px-1 text-center font-mono">
                                {t.container_number}
                              </td>
                              <td className="border border-slate-300 py-0.5 px-1 text-center font-mono">
                                {t.is_subcontractor
                                  ? t.subcontractor_name || t.vehicle_plate
                                  : t.vehicle_plate}
                              </td>
                              <td className="border border-slate-300 py-0.5 px-1 text-right font-mono">
                                {formatVnd(f.cuoc_goc)}
                              </td>
                              <td className="border border-slate-300 py-0.5 px-1 text-right font-mono">
                                {formatVnd(f.cuoc_sau_tru_17)}
                              </td>
                              <td className="border border-slate-300 py-0.5 px-1 text-right font-mono">
                                {formatVnd(f.chi_phi_cong_ty)}
                              </td>
                              <td className="border border-slate-300 py-0.5 px-1 text-right font-mono font-bold">
                                {formatVnd(f.cuoc_sau_tru_17 - f.chi_phi_cong_ty)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Khối Chữ ký xác nhận trên Bản In */}
                <div className="signature-grid grid grid-cols-3 gap-6 pt-4 border-t border-slate-300 text-center text-xs">
                  <div>
                    <div className="font-bold uppercase">NGƯỜI LẬP BIỂU</div>
                    <div className="text-[10px] text-slate-500 italic">(Ký, ghi rõ họ tên)</div>
                    <div className="h-14" />
                  </div>
                  <div>
                    <div className="font-bold uppercase">KẾ TOÁN TRƯỞNG</div>
                    <div className="text-[10px] text-slate-500 italic">(Ký, ghi rõ họ tên)</div>
                    <div className="h-14" />
                  </div>
                  <div>
                    <div className="font-bold uppercase">GIÁM ĐỐC PHÊ DUYỆT</div>
                    <div className="text-[10px] text-slate-500 italic">
                      (Ký, đóng dấu xác nhận)
                    </div>
                    <div className="h-14" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
