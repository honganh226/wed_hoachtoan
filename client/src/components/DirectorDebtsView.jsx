import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import {
  Building2,
  Truck,
  Search,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Info,
  ArrowLeftRight,
  CreditCard,
  FileText,
  Loader2,
  Clock,
  Calendar,
  X,
  ExternalLink,
  AlertCircle
} from 'lucide-react';
import { formatVnd } from '../data/unifiedBusinessData';
import { fetchBusinessDebtsApi, fetchEirRemindersApi } from '../services/api.js';
import PhoiRefundModal from './PhoiRefundModal.jsx';
import TripDetailDrawer from './TripDetailDrawer.jsx';

const MONTHS_LIST = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'];
const QUARTERS_LIST = [
  { key: 'q_1', label: 'Quý 1', start: '2026-01-01', end: '2026-03-31' },
  { key: 'q_2', label: 'Quý 2', start: '2026-04-01', end: '2026-06-30' },
  { key: 'q_3', label: 'Quý 3', start: '2026-07-01', end: '2026-09-30' },
  { key: 'q_4', label: 'Quý 4', start: '2026-10-01', end: '2026-12-31' }
];

// Ánh xạ kỳ thời gian sang khoảng ngày YYYY-MM-DD
function getPeriodRange(filterKey, customStart, customEnd, exactDate) {
  if (filterKey === 'month') return { start_date: '2026-01-01', end_date: '2026-01-31' };
  if (filterKey && filterKey.startsWith('month_')) {
    const m = filterKey.slice(6);
    const lastDay = new Date(2026, parseInt(m, 10), 0).getDate();
    return { start_date: `2026-${m}-01`, end_date: `2026-${m}-${String(lastDay).padStart(2, '0')}` };
  }
  if (filterKey && filterKey.startsWith('q_')) {
    const qObj = QUARTERS_LIST.find((q) => q.key === filterKey);
    if (qObj) return { start_date: qObj.start, end_date: qObj.end };
  }
  if (filterKey === 'single_day') {
    const d = exactDate || customStart || '2026-01-09';
    return { start_date: d, end_date: d };
  }
  if (filterKey === 'day_09') return { start_date: '2026-01-09', end_date: '2026-01-09' };
  if (filterKey === 'day_08') return { start_date: '2026-01-08', end_date: '2026-01-08' };
  if (filterKey === 'range') {
    const s = customStart || '2026-01-01';
    const e = customEnd || s;
    return s <= e ? { start_date: s, end_date: e } : { start_date: e, end_date: s };
  }
  return {}; // 'all'
}

function getPeriodDisplayLabel(filterKey, customStart, customEnd, exactDate) {
  if (filterKey === 'all') return 'Toàn bộ năm 2026 (T1–T12)';
  if (filterKey === 'month') return 'Tháng 01/2026';
  if (filterKey && filterKey.startsWith('month_')) {
    return `Tháng ${filterKey.slice(6)}/2026`;
  }
  if (filterKey && filterKey.startsWith('q_')) {
    const qObj = QUARTERS_LIST.find((q) => q.key === filterKey);
    return qObj ? `${qObj.label}/2026` : 'Theo quý';
  }
  if (filterKey === 'single_day') return `Ngày ${exactDate || customStart}`;
  if (filterKey === 'day_09') return 'Ngày 09/01/2026';
  if (filterKey === 'day_08') return 'Ngày 08/01/2026';
  if (filterKey === 'range') return `Từ ${customStart} đến ${customEnd}`;
  return 'Toàn bộ kỳ';
}

function toIntVnd(val) {
  const n = Number(val);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

/**
 * Chuẩn hóa một khoản tiền phơi trả hộ từ API
 */
export function normalizeEirItem(it = {}, defaultCategory = 'UNSCHEDULED') {
  const advanceAmt = Math.max(0, toIntVnd(it.advance_amount));
  const refundedAmt = Math.max(0, toIntVnd(it.refunded_amount));
  const balanceDue = it.balance_due !== undefined && it.balance_due !== null
    ? toIntVnd(it.balance_due)
    : it.remaining_amount !== undefined && it.remaining_amount !== null
    ? toIntVnd(it.remaining_amount)
    : Math.max(0, advanceAmt - refundedAmt);

  // 1. Trạng thái hoàn tiền (refund_status)
  let refundStatus = it.refund_status;
  let refundStatusLabel = it.refund_status_label;
  if (!refundStatus) {
    if (advanceAmt > 0 && balanceDue === 0) {
      refundStatus = 'DA_HOAN';
      refundStatusLabel = it.payment_term_type === 'TUOI' ? 'Đã hoàn (TƯƠI)' : 'Đã hoàn';
    } else if (refundedAmt > 0 && balanceDue > 0) {
      refundStatus = 'HOAN_MOT_PHAN';
      refundStatusLabel = 'Hoàn một phần';
    } else {
      refundStatus = 'CHUA_HOAN';
      refundStatusLabel = 'Chưa hoàn';
    }
  }

  // 2. Trạng thái ngày nhắc hẹn (reminder_status)
  let reminderStatus = it.reminder_status || defaultCategory;
  let reminderLabel = it.reminder_label || '';
  let reminderBadgeColor = 'bg-slate-100 text-slate-700 border border-slate-300';

  if (reminderStatus === 'OVERDUE') {
    reminderLabel = it.reminder_label || (it.due_date ? `Quá hạn (${it.due_date})` : 'Quá hạn hoàn phơi');
    reminderBadgeColor = 'bg-rose-100 text-rose-800 border border-rose-300';
  } else if (reminderStatus === 'DUE_TODAY') {
    reminderLabel = it.reminder_label || (it.due_date ? `Đến hạn hôm nay (${it.due_date})` : 'Đến hạn hôm nay');
    reminderBadgeColor = 'bg-amber-100 text-amber-800 border border-amber-300';
  } else if (reminderStatus === 'UPCOMING') {
    reminderLabel = it.reminder_label || (it.due_date ? `Hẹn ${it.due_date}` : 'Trong hạn');
    reminderBadgeColor = 'bg-blue-100 text-blue-800 border border-blue-300';
  } else if (reminderStatus === 'NO_DUE_DATE' || reminderStatus === 'UNSCHEDULED') {
    reminderLabel = 'Chưa đặt ngày hẹn';
    reminderBadgeColor = 'bg-purple-100 text-purple-800 border border-purple-300';
  } else if (reminderStatus === 'COMPLETED' || refundStatus === 'DA_HOAN') {
    reminderLabel = 'Đã tất toán';
    reminderBadgeColor = 'bg-emerald-100 text-emerald-800 border border-emerald-300';
  }

  return {
    ...it,
    advance_amount: advanceAmt,
    refunded_amount: refundedAmt,
    balance_due: balanceDue,
    remaining_amount: balanceDue,
    refund_status: refundStatus,
    refund_status_label: refundStatusLabel,
    reminder_status: reminderStatus,
    reminder_label: reminderLabel,
    reminderBadgeColor,
    due_date: it.due_date || null,
  };
}

export default function DirectorDebtsView({
  assistantFocus,
  onAssistantFocusConsumed,
  onAssistantContext,
  onOpenBatchPayment
}) {
  // 1. Phân hệ chính: 'receivables' (Khách hàng) | 'phoi_advances' (Phơi) | 'payables' (Nhà xe)
  const [activeTab, setActiveTab] = useState('receivables');

  // 2. Bộ lọc kỳ thời gian (Toàn bộ, T1..T12, Quý 1..4, Ngày cụ thể, Khoảng ngày)
  const [dateFilter, setDateFilter] = useState('all'); // 'all' | 'month_01'..'month_12' | 'q_1'..'q_4' | 'single_day' | 'range'
  const [exactDate, setExactDate] = useState('2026-01-09');
  const [rangeStart, setRangeStart] = useState('2026-01-01');
  const [rangeEnd, setRangeEnd] = useState('2026-11-30');
  const [periodStatsCache, setPeriodStatsCache] = useState(null);

  // 3. Tìm kiếm và lọc trạng thái
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('ALL'); // 'ALL' | 'UNPAID' | 'PAID' | 'OFFSET' | 'OVERDUE' | 'HOAN_MOT_PHAN' | 'NO_DUE_DATE'
  const [expandedCustomer, setExpandedCustomer] = useState(null);
  const [expandedSubcontractor, setExpandedSubcontractor] = useState(null);
  const [showPaidCustomers, setShowPaidCustomers] = useState(false);
  const [showPaidSubcontractors, setShowPaidSubcontractors] = useState(false);

  // 4. Dữ liệu công nợ & Trạng thái tải riêng biệt
  const [debts, setDebts] = useState(null);
  const [debtsPeriodKey, setDebtsPeriodKey] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  // Dữ liệu tiền phơi & Trạng thái tải riêng biệt
  const [eirReminders, setEirReminders] = useState(null);
  const [eirLoading, setEirLoading] = useState(true);
  const [eirError, setEirError] = useState(null);

  // 5. Drawer & Modal
  const [selectedTrip, setSelectedTrip] = useState(null);
  const [phoiModalTarget, setPhoiModalTarget] = useState(null);

  // Sequence counter để chống race condition khi đổi kỳ liên tục
  const requestSeqRef = useRef(0);

  const isSecretary = (() => {
    try {
      const u = JSON.parse(localStorage.getItem('hoachtoan_auth_user') || '{}');
      return u?.role === 'SECRETARY';
    } catch {
      return false;
    }
  })();

  const currentPeriodKey = useMemo(() => {
    const range = getPeriodRange(dateFilter, rangeStart, rangeEnd, exactDate);
    return `${dateFilter}:${range.start_date || 'ALL'}:${range.end_date || 'ALL'}`;
  }, [dateFilter, rangeStart, rangeEnd, exactDate]);

  // Tải dữ liệu công nợ và tiền phơi từ backend (tách biệt lỗi để không gộp chung)
  const loadDebts = useCallback(async () => {
    const seq = ++requestSeqRef.current;
    setLoading(true);
    setLoadError(null);
    setEirLoading(true);
    setEirError(null);

    const range = getPeriodRange(dateFilter, rangeStart, rangeEnd, exactDate);

    try {
      if (isSecretary) {
        // Thư ký chỉ truy cập nhắc việc và khoản phơi
        const remRes = await fetchEirRemindersApi().catch((err) => ({ success: false, error: err.message }));
        if (seq !== requestSeqRef.current) return;
        if (remRes && remRes.success && remRes.data) {
          setEirReminders(remRes.data);
          setEirError(null);
        } else {
          setEirError(remRes?.error || 'Không thể tải danh sách nhắc hoàn tiền phơi.');

        }
        setDebts(null);
        setLoading(false);
        setEirLoading(false);
        return;
      }

      // Giám đốc và Kế toán: Gọi song song cả hai API
      const [debtsRes, remRes] = await Promise.all([
        fetchBusinessDebtsApi(range).catch((err) => ({ success: false, error: err.message })),
        fetchEirRemindersApi().catch((err) => ({ success: false, error: err.message }))
      ]);

      if (seq !== requestSeqRef.current) return;

      // Xử lý công nợ khách hàng và nhà xe
      if (debtsRes && debtsRes.success && debtsRes.data) {
        setDebts(debtsRes.data);
        if (debtsRes.data.period_stats) {
          setPeriodStatsCache(debtsRes.data.period_stats);
        }
        setDebtsPeriodKey(currentPeriodKey);
        setLoadError(null);
      } else {
        setLoadError(debtsRes?.error || 'Lỗi tải dữ liệu công nợ từ máy chủ.');
      }

      // Xử lý tiền phơi ĐỘC LẬP (nếu lỗi phơi, không làm hỏng công nợ và ngược lại)
      if (remRes && remRes.success && remRes.data) {
        setEirReminders(remRes.data);
        setEirError(null);
      } else {
        setEirError(remRes?.error || 'Không thể tải danh sách nhắc hoàn tiền phơi từ máy chủ.');

      }
    } catch (e) {
      if (seq === requestSeqRef.current) {
        setLoadError('Không thể kết nối máy chủ backend. Vui lòng kiểm tra mạng và thử lại.');
      }
    } finally {
      if (seq === requestSeqRef.current) {
        setLoading(false);
        setEirLoading(false);
      }
    }
  }, [dateFilter, rangeStart, rangeEnd, exactDate, currentPeriodKey, isSecretary]);

  // Hàm thử lại tải riêng tiền phơi khi API phơi gặp sự cố
  const retryLoadEir = useCallback(async () => {
    setEirLoading(true);
    setEirError(null);
    try {
      const remRes = await fetchEirRemindersApi().catch((err) => ({ success: false, error: err.message }));
      if (remRes && remRes.success && remRes.data) {
        setEirReminders(remRes.data);
        setEirError(null);
      } else {
        setEirError(remRes?.error || 'Không thể tải danh sách nhắc hoàn tiền phơi.');

      }
    } catch (err) {
      setEirError(err.message || 'Lỗi kết nối khi tải tiền phơi.');
    } finally {
      setEirLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDebts();
  }, [loadDebts]);

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === 'visible') loadDebts();
    };
    window.addEventListener('business-data-changed', refresh);
    return () => window.removeEventListener('business-data-changed', refresh);
  }, [loadDebts]);

  // Phản hồi điều hướng từ Trợ lý
  useEffect(() => {
    if (!assistantFocus) return;
    if (assistantFocus.kind === 'payables') {
      setActiveTab('payables');
    } else if (assistantFocus.kind === 'phoi') {
      setActiveTab('phoi_advances');
    } else {
      setActiveTab('receivables');
    }
    if (assistantFocus.query) setSearchQuery(assistantFocus.query);
    setFilterStatus('ALL');
    onAssistantFocusConsumed?.();
  }, [assistantFocus, onAssistantFocusConsumed]);

  // Cập nhật ngữ cảnh cho Trợ lý theo chuẩn startDate/endDate/all
  useEffect(() => {
    const range = getPeriodRange(dateFilter, rangeStart, rangeEnd, exactDate);
    const label = getPeriodDisplayLabel(dateFilter, rangeStart, rangeEnd, exactDate);
    const period =
      dateFilter === 'all'
        ? { startDate: null, endDate: null, all: true, kind: 'all', label: 'Toàn bộ' }
        : { startDate: range.start_date || null, endDate: range.end_date || null, kind: dateFilter, label };

    const q = searchQuery.trim().toLowerCase();
    const entity = q ? { kind: activeTab === 'payables' ? 'subcontractor' : 'customer', value: q } : null;

    onAssistantContext?.({
      module: 'debts',
      tab: activeTab,
      period,
      entity
    });
  }, [activeTab, dateFilter, rangeStart, rangeEnd, exactDate, searchQuery, onAssistantContext]);

  // Kiểm tra tính hợp lệ của dữ liệu theo kỳ
  const isDataCurrent = Boolean(debts && debtsPeriodKey === currentPeriodKey);
  const effectiveDebts = isDataCurrent ? debts : null;

  const receivables = effectiveDebts?.receivables || {};
  const payables = effectiveDebts?.payables || {};

  // 1. Chuẩn hóa danh sách khách hàng (Đọc trực tiếp các trường chuẩn từ API)
  const normalizedCustomers = useMemo(() => {
    if (!receivables.customers) return [];
    return receivables.customers.map((c) => {
      const fareDue = c.balance_due ?? c.total_remaining ?? 0;
      const phoiDue = c.phoi_balance_due ?? 0;
      return {
        id: c.customer_id || c.customer_name,
        name: c.customer_name || 'Khách vãng lai',
        trip_count: c.trip_count || (c.trips ? c.trips.length : 0),
        total_cuoc_goc: c.total_revenue ?? c.total_revenue_pre_vat ?? 0,
        total_vat_8: c.total_vat_8 ?? c.total_vat ?? Math.round((c.total_revenue || 0) * 0.08),
        total_cuoc_co_vat: c.total_revenue_with_vat ?? c.total_cuoc_co_vat ?? Math.round((c.total_revenue || 0) * 1.08),
        total_sau_tru_17: c.total_revenue_after_deduction ?? 0,
        total_received: c.total_paid ?? c.total_received ?? 0,
        total_offset: c.total_offset ?? 0,
        fare_remaining: fareDue,
        vat_reconciliation_diff: c.vat_reconciliation_diff ?? 0,
        phoi_advance_total: c.phoi_total_advance ?? 0,
        phoi_refunded_total: c.phoi_total_refunded ?? 0,
        phoi_remaining: phoiDue,
        total_customer_due: c.total_combined_due ?? (fareDue + phoiDue),
        has_special_item: Boolean(c.has_special_item || (c.customer_name || '').includes('VẠN ĐẠT')),
        trips: c.trips || []
      };
    });
  }, [receivables.customers]);

  // Phân chia khách hàng: Còn nợ (ưu tiên hiển thị) và Đã tất toán (gom gọn)
  const { unpaidCustomers, paidCustomers } = useMemo(() => {
    const unpaid = [];
    const paid = [];
    normalizedCustomers.forEach((c) => {
      if (c.total_customer_due > 0 || c.fare_remaining > 0 || c.phoi_remaining > 0) {
        unpaid.push(c);
      } else {
        paid.push(c);
      }
    });
    unpaid.sort((a, b) => b.total_customer_due - a.total_customer_due);
    return { unpaidCustomers: unpaid, paidCustomers: paid };
  }, [normalizedCustomers]);

  // Lọc danh sách khách hàng theo tìm kiếm và bộ lọc trạng thái
  const filteredCustomers = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    let list = normalizedCustomers;

    if (filterStatus === 'UNPAID') {
      list = unpaidCustomers;
    } else if (filterStatus === 'PAID') {
      list = paidCustomers;
    } else if (filterStatus === 'OFFSET') {
      list = normalizedCustomers.filter((c) => c.total_offset > 0 || c.has_special_item);
    }

    if (q) {
      list = list.filter((c) => c.name.toLowerCase().includes(q));
    }

    return list;
  }, [normalizedCustomers, unpaidCustomers, paidCustomers, filterStatus, searchQuery]);

  // 2. Chuẩn hóa danh sách nhà xe thuê ngoài
  const normalizedSubcontractors = useMemo(() => {
    if (!payables.subcontractors && !payables.subcontractor_payables) return [];
    const list = payables.subcontractors || payables.subcontractor_payables || [];
    return list.map((s) => ({
      id: s.subcontractor_id || s.subcontractor_name,
      name: s.subcontractor_name || s.name || 'Nhà xe đối tác',
      trip_count: s.trip_count || (s.trips ? s.trips.length : 0),
      total_payable: s.total_payable ?? 0,
      total_paid: s.total_paid ?? 0,
      total_remaining: s.balance_due ?? s.total_remaining ?? 0,
      trips: s.trips || []
    }));
  }, [payables.subcontractors, payables.subcontractor_payables]);

  // Phân chia nhà xe: Còn nợ và Đã tất toán
  const { unpaidSubcontractors, paidSubcontractors } = useMemo(() => {
    const unpaid = [];
    const paid = [];
    normalizedSubcontractors.forEach((s) => {
      if (s.total_remaining > 0) {
        unpaid.push(s);
      } else {
        paid.push(s);
      }
    });
    unpaid.sort((a, b) => b.total_remaining - a.total_remaining);
    return { unpaidSubcontractors: unpaid, paidSubcontractors: paid };
  }, [normalizedSubcontractors]);

  const filteredSubcontractors = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    let list = normalizedSubcontractors;

    if (filterStatus === 'UNPAID') {
      list = unpaidSubcontractors;
    } else if (filterStatus === 'PAID') {
      list = paidSubcontractors;
    }

    if (q) {
      list = list.filter((s) => s.name.toLowerCase().includes(q));
    }

    return list;
  }, [normalizedSubcontractors, unpaidSubcontractors, paidSubcontractors, filterStatus, searchQuery]);

  // Đồng bộ selectedTrip khi dữ liệu công nợ được tải lại ngầm
  useEffect(() => {
    if (!selectedTrip) return;
    const targetId = String(selectedTrip.id);
    for (const c of normalizedCustomers) {
      const match = (c.trips || []).find((t) => String(t.id) === targetId);
      if (match && match !== selectedTrip) {
        setSelectedTrip(match);
        return;
      }
    }
    for (const s of normalizedSubcontractors) {
      const match = (s.trips || []).find((t) => String(t.id) === targetId);
      if (match && match !== selectedTrip) {
        setSelectedTrip(match);
        return;
      }
    }
  }, [normalizedCustomers, normalizedSubcontractors, selectedTrip]);

  // 3. Chuẩn hóa danh sách tiền phơi trả hộ (Bảo đảm balance_due và remaining_amount đồng nhất)
  const allReminderItems = useMemo(() => {
    if (!eirReminders) return [];
    const itemsMap = new Map();

    const addGroup = (arr, category) => {
      (arr || []).forEach((it) => {
        const norm = normalizeEirItem(it, category);
        if (norm.id && !itemsMap.has(norm.id)) {
          itemsMap.set(norm.id, norm);
        }
      });
    };

    addGroup(eirReminders.overdue, 'OVERDUE');
    addGroup(eirReminders.due_today, 'DUE_TODAY');
    addGroup(eirReminders.upcoming, 'UPCOMING');
    addGroup(eirReminders.no_due_date || eirReminders.unscheduled, 'NO_DUE_DATE');
    addGroup(eirReminders.completed_recent, 'COMPLETED');

    return Array.from(itemsMap.values());
  }, [eirReminders]);

  const filteredPhoiItems = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    let list = allReminderItems;

    if (dateFilter !== 'all') {
      const r = getPeriodRange(dateFilter, rangeStart, rangeEnd, exactDate);
      if (r.start_date && r.end_date) {
        const fullMonthMatch = String(r.start_date).match(/^2026-(\d{2})-01$/);
        const mPrefix = fullMonthMatch ? `T${parseInt(fullMonthMatch[1], 10)}-` : null;
        list = list.filter((it) => {
          const advDate = String(it.advance_date || '').slice(0, 10);
          const tripId = String(it.trip_id || '');
          if (mPrefix && tripId.toUpperCase().startsWith(mPrefix)) return true;
          return advDate >= r.start_date && advDate <= r.end_date;
        });
      }
    }

    if (filterStatus === 'UNPAID') {
      list = list.filter((it) => it.balance_due > 0);
    } else if (filterStatus === 'PAID') {
      list = list.filter((it) => it.refund_status === 'DA_HOAN' || it.balance_due === 0);
    } else if (filterStatus === 'HOAN_MOT_PHAN') {
      list = list.filter((it) => it.refund_status === 'HOAN_MOT_PHAN');
    } else if (filterStatus === 'OVERDUE') {
      list = list.filter((it) => it.reminder_status === 'OVERDUE');
    } else if (filterStatus === 'NO_DUE_DATE') {
      list = list.filter((it) => it.reminder_status === 'NO_DUE_DATE' || it.reminder_status === 'UNSCHEDULED');
    }

    if (q) {
      list = list.filter(
        (it) =>
          (it.customer_name || '').toLowerCase().includes(q) ||
          (it.trip_id || '').toLowerCase().includes(q) ||
          (it.container_number || '').toLowerCase().includes(q)
      );
    }

    return list;
  }, [allReminderItems, dateFilter, rangeStart, rangeEnd, exactDate, filterStatus, searchQuery]);

  // Tóm tắt chỉ số tài chính Phải thu khách hàng (khớp chuẩn API total_receivable_with_vat)
  const recSummary = {
    total_cuoc_goc: receivables.total_receivable ?? receivables.total_receivable_pre_vat ?? 0,
    total_cuoc_co_vat: receivables.total_receivable_with_vat ?? (receivables.total_cuoc_co_vat ?? 0),
    total_vat_8: receivables.total_vat_8 ?? Math.round((receivables.total_receivable || 0) * 0.08),
    total_sau_tru_17: receivables.total_after_deduction_17 ?? 0,
    total_deduction_17: receivables.total_deduction_17 ?? 0,
    total_received: receivables.total_paid ?? 0,
    total_offset: receivables.total_offset ?? 0,
    fare_remaining: receivables.total_due ?? 0,
    total_vat_reconciliation_diff: receivables.total_vat_reconciliation_diff ?? 0,
    total_phoi_advance: receivables.total_phoi_advance ?? 0,
    total_phoi_refunded: receivables.total_phoi_refunded ?? 0,
    total_phoi_due: receivables.total_phoi_due ?? 0,
    total_customer_receivable_due:
      receivables.total_combined_due ?? (receivables.total_due || 0) + (receivables.total_phoi_due || 0),
    count_customers: normalizedCustomers.length
  };

  // Tóm tắt chỉ số Phải trả nhà xe
  const paySummary = {
    total_payable: payables.total_payable ?? 0,
    total_paid: payables.total_paid ?? 0,
    total_remaining: payables.balance_due ?? payables.total_remaining ?? 0,
    count_subcontractors: normalizedSubcontractors.length
  };

  // Tóm tắt tiền phơi toàn thời gian
  const phoiSummaryTotalDue = useMemo(() => {
    if (eirReminders?.summary?.total_outstanding_amount !== undefined) {
      return eirReminders.summary.total_outstanding_amount;
    }
    return allReminderItems.reduce((acc, it) => acc + (it.balance_due || 0), 0);
  }, [eirReminders, allReminderItems]);

  return (
    <div className="space-y-4 pb-20">
      {/* 1. THANH TIÊU ĐỀ & ĐIỀU HƯỚNG KỲ CÔNG NỢ */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">Quản Lý Công Nợ Doanh Nghiệp</h1>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                Theo chuẩn hạch toán 28/10/2026
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Theo dõi 3 phân hệ độc lập: Phải thu cước khách hàng, Tiền phơi trả hộ chủ hàng, và Phải trả đối tác nhà xe.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {onOpenBatchPayment && !isSecretary && (
              <button
                type="button"
                onClick={() => onOpenBatchPayment('')}
                className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 transition-all active:scale-95"
              >
                <CreditCard className="w-3.5 h-3.5 text-emerald-400" />
                <span>Thanh toán gộp</span>
              </button>
            )}
            <button
              onClick={loadDebts}
              disabled={loading || eirLoading}
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 transition-all active:scale-95 disabled:opacity-50"
              title="Tải lại dữ liệu công nợ"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading || eirLoading ? 'animate-spin text-emerald-600' : 'text-slate-500'}`} />
              <span>{loading || eirLoading ? 'Đang tải...' : 'Làm mới'}</span>
            </button>
          </div>
        </div>

        {/* BỘ LỌC KỲ CÔNG NỢ NÂNG CẤP: ĐỦ 12 THÁNG (T1-T12), 4 QUÝ, TÌM THEO NGÀY & KHOẢNG NGÀY */}
        <div
          data-testid="debts-period-filter-panel"
          className="mt-3.5 pt-3.5 border-t border-slate-200/80 space-y-2.5"
        >
          {/* HÀNG 1: CHỌN NHANH TOÀN BỘ NĂM, CÁC QUÝ & TỪNG THÁNG TRONG NĂM (T1 - T12) */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-bold text-slate-700 flex items-center space-x-1 mr-1">
              <Calendar className="w-3.5 h-3.5 text-blue-600" />
              <span>Kỳ công nợ theo tháng:</span>
            </span>

            <button
              type="button"
              data-testid="debts-period-btn-all"
              onClick={() => setDateFilter('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                dateFilter === 'all'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              Toàn bộ kỳ{periodStatsCache?.total_all_trips ? ` (${periodStatsCache.total_all_trips})` : ''}
            </button>

            {MONTHS_LIST.map((mKey) => {
              const mCount = periodStatsCache?.month_trip_counts?.[mKey];
              const isSelected =
                dateFilter === `month_${mKey}` || (mKey === '01' && dateFilter === 'month');
              return (
                <button
                  key={mKey}
                  type="button"
                  data-testid={`debts-period-btn-month-${mKey}`}
                  onClick={() => setDateFilter(`month_${mKey}`)}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-1 ${
                    isSelected
                      ? 'bg-blue-700 text-white font-bold shadow-xs ring-2 ring-blue-200'
                      : mCount === 0
                      ? 'bg-slate-50 text-slate-400 hover:bg-slate-100 border border-slate-200/60'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                  title={`Xem công nợ Tháng ${mKey}/2026`}
                >
                  <span>Tháng {parseInt(mKey, 10)}</span>
                  {mCount !== undefined && (
                    <span
                      className={`text-[10px] font-mono ${
                        isSelected ? 'text-blue-100' : 'text-slate-500'
                      }`}
                    >
                      ({mCount})
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* HÀNG 2: TRA CỨU THEO NGÀY CỤ THỂ, KHOẢNG NGÀY (TỪ NGÀY -> ĐẾN NGÀY) & THEO QUÝ */}
          <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-50/90 p-2.5 rounded-xl border border-slate-200/80 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              {/* Chọn theo Quý */}
              <div className="flex items-center gap-1 pr-2 border-r border-slate-200">
                <span className="text-[11px] font-semibold text-slate-500">Theo quý:</span>
                {QUARTERS_LIST.map((q) => (
                  <button
                    key={q.key}
                    type="button"
                    data-testid={`debts-period-btn-${q.key}`}
                    onClick={() => setDateFilter(q.key)}
                    className={`px-2 py-1 rounded-md text-[11px] font-semibold transition-all cursor-pointer ${
                      dateFilter === q.key
                        ? 'bg-teal-700 text-white font-bold shadow-2xs'
                        : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {q.label}
                  </button>
                ))}
              </div>

              {/* Tìm theo 1 Ngày cụ thể */}
              <div className="flex items-center gap-1.5 pr-2 border-r border-slate-200">
                <button
                  type="button"
                  data-testid="debts-period-btn-single-day"
                  onClick={() => setDateFilter('single_day')}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all cursor-pointer flex items-center gap-1 ${
                    dateFilter === 'single_day'
                      ? 'bg-indigo-700 text-white font-bold shadow-2xs'
                      : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <span>Tìm theo ngày:</span>
                </button>
                <input
                  type="date"
                  data-testid="debts-input-exact-date"
                  value={exactDate}
                  onChange={(e) => {
                    if (e.target.value) {
                      setExactDate(e.target.value);
                      setDateFilter('single_day');
                    }
                  }}
                  className={`border rounded-md px-2 py-1 text-xs font-mono transition-all ${
                    dateFilter === 'single_day'
                      ? 'border-indigo-600 bg-indigo-50/40 text-indigo-950 font-bold ring-1 ring-indigo-500'
                      : 'border-slate-300 bg-white text-slate-700'
                  }`}
                />
              </div>

              {/* Tìm theo Khoảng ngày (Từ ngày -> Đến ngày) */}
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  data-testid="debts-period-btn-range"
                  onClick={() => setDateFilter('range')}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all cursor-pointer ${
                    dateFilter === 'range'
                      ? 'bg-amber-600 text-white font-bold shadow-2xs'
                      : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  Khoảng ngày:
                </button>
                <div className="flex items-center gap-1">
                  <input
                    type="date"
                    data-testid="debts-input-range-start"
                    value={rangeStart}
                    onChange={(e) => {
                      if (e.target.value) {
                        setRangeStart(e.target.value);
                        setDateFilter('range');
                      }
                    }}
                    className={`border rounded-md px-2 py-1 text-xs font-mono ${
                      dateFilter === 'range'
                        ? 'border-amber-600 bg-amber-50/30 text-slate-900 font-bold'
                        : 'border-slate-300 bg-white text-slate-700'
                    }`}
                  />
                  <span className="text-slate-400 font-bold">→</span>
                  <input
                    type="date"
                    data-testid="debts-input-range-end"
                    value={rangeEnd}
                    onChange={(e) => {
                      if (e.target.value) {
                        setRangeEnd(e.target.value);
                        setDateFilter('range');
                      }
                    }}
                    className={`border rounded-md px-2 py-1 text-xs font-mono ${
                      dateFilter === 'range'
                        ? 'border-amber-600 bg-amber-50/30 text-slate-900 font-bold'
                        : 'border-slate-300 bg-white text-slate-700'
                    }`}
                  />
                </div>
              </div>
            </div>

            {/* Nhãn hiển thị kỳ đang lọc & Nút xóa bộ lọc kỳ */}
            <div className="flex items-center gap-2">
              <span
                data-testid="debts-active-period-badge"
                className="px-2.5 py-1 rounded-md bg-blue-50 text-blue-800 border border-blue-200 font-semibold text-[11px]"
              >
                Đang xem: {getPeriodDisplayLabel(dateFilter, rangeStart, rangeEnd, exactDate)}
                {isDataCurrent && debts?.period_stats?.scoped_trips !== undefined
                  ? ` • ${debts.period_stats.scoped_trips} chuyến`
                  : ''}
              </span>
              {dateFilter !== 'all' && (
                <button
                  type="button"
                  data-testid="debts-btn-reset-period"
                  onClick={() => setDateFilter('all')}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-[11px] font-semibold cursor-pointer"
                >
                  <X className="w-3 h-3" />
                  <span>Xem toàn bộ</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 2. CHỌN PHÂN HỆ CÔNG NỢ (3 SUB-TABS) */}
      <div className="flex p-1 bg-slate-100/80 rounded-xl border border-slate-200 space-x-1">
        <button
          onClick={() => {
            setActiveTab('receivables');
            setFilterStatus('ALL');
          }}
          className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center space-x-2 ${
            activeTab === 'receivables'
              ? 'bg-white text-blue-700 shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
          }`}
        >
          <Building2 className="w-4 h-4 text-blue-500" />
          <span>A. Phải thu khách hàng</span>
          <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-blue-50 text-blue-700 font-mono">
            {isDataCurrent ? `${normalizedCustomers.length} khách` : '--'}
          </span>
        </button>

        <button
          onClick={() => {
            setActiveTab('phoi_advances');
            setFilterStatus('ALL');
          }}
          className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center space-x-2 ${
            activeTab === 'phoi_advances'
              ? 'bg-white text-purple-700 shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
          }`}
        >
          <Clock className="w-4 h-4 text-purple-500" />
          <span>B. Tiền phơi trả hộ</span>
          <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-purple-50 text-purple-700 font-mono">
            {eirReminders ? `${allReminderItems.length} khoản` : eirError ? 'Lỗi' : '--'}
          </span>
        </button>

        <button
          onClick={() => {
            setActiveTab('payables');
            setFilterStatus('ALL');
          }}
          className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center space-x-2 ${
            activeTab === 'payables'
              ? 'bg-white text-emerald-700 shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
          }`}
        >
          <Truck className="w-4 h-4 text-emerald-500" />
          <span>C. Phải trả nhà xe</span>
          <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-emerald-50 text-emerald-700 font-mono">
            {isDataCurrent ? `${normalizedSubcontractors.length} nhà xe` : '--'}
          </span>
        </button>
      </div>

      {/* THÔNG BÁO LỖI HOẶC TRẠNG THÁI TẢI CÔNG NỢ */}
      {loadError && activeTab !== 'phoi_advances' && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start space-x-3 text-red-800 text-xs">
          <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-bold text-red-900">Không thể tải dữ liệu công nợ:</p>
            <p className="mt-0.5">{loadError}</p>
            <p className="mt-1 text-slate-500 italic">
              Trạng thái: Chưa xác định — chưa tải được công nợ từ máy chủ. Số dư không được tự mặc định thành 0 đ.
            </p>
            <button
              onClick={loadDebts}
              className="mt-2 inline-flex items-center space-x-1 px-3 py-1 bg-red-100 hover:bg-red-200 text-red-900 rounded-lg font-semibold transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Thử lại</span>
            </button>
          </div>
        </div>
      )}

      {/* 3. PHÂN HỆ A: PHẢI THU TIỀN CƯỚC KHÁCH HÀNG */}
      {activeTab === 'receivables' && (
        <div className="space-y-4">
          {/* KPI TỔNG HỢP PHẢI THU (4 CARD CHUẨN) */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs">
              <span className="text-xs text-slate-500 block font-medium">Cước phát sinh (Gốc / Có VAT)</span>
              <p className="text-base sm:text-lg font-bold text-slate-900 font-mono mt-1">
                {isDataCurrent ? formatVnd(recSummary.total_cuoc_goc) : 'Đang tải...'}
              </p>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between text-[11px] mt-0.5 gap-1">
                <span className="text-blue-700 font-semibold">
                  Có VAT 8%: {isDataCurrent ? formatVnd(recSummary.total_cuoc_co_vat) : '--'}
                </span>
                <span className="text-slate-600 font-medium">
                  Sau trừ 17%: {isDataCurrent ? formatVnd(recSummary.total_sau_tru_17) : '--'}
                </span>
              </div>
            </div>

            <div className="bg-white p-3.5 rounded-xl border border-emerald-200 bg-emerald-50/20 shadow-xs">
              <span className="text-xs text-emerald-700 block font-medium">Tiền thực thu vào quỹ</span>
              <p className="text-base sm:text-lg font-bold text-emerald-700 font-mono mt-1">
                {isDataCurrent ? formatVnd(recSummary.total_received) : 'Đang tải...'}
              </p>
              <span className="text-[11px] text-amber-700 block mt-0.5 font-medium">
                Khoản đối trừ (P22): {isDataCurrent ? formatVnd(recSummary.total_offset) : '--'}
              </span>
            </div>

            <div className="bg-white p-3.5 rounded-xl border border-rose-200 bg-rose-50/20 shadow-xs">
              <span className="text-xs text-rose-700 block font-medium">Dư nợ cước gốc còn lại</span>
              <p
                className={`text-base sm:text-lg font-bold font-mono mt-1 ${
                  recSummary.fare_remaining > 0 ? 'text-rose-600' : 'text-slate-800'
                }`}
              >
                {isDataCurrent ? formatVnd(recSummary.fare_remaining) : 'Chưa xác định'}
              </p>
              <span className="text-[11px] text-slate-500 block mt-0.5">
                Chênh lệch VAT lịch sử: {isDataCurrent ? formatVnd(recSummary.total_vat_reconciliation_diff) : '--'}
              </span>
            </div>

            <div className="bg-white p-3.5 rounded-xl border border-purple-200 bg-purple-50/20 shadow-xs">
              <span className="text-xs text-purple-800 block font-medium">Phơi trả hộ còn phải thu</span>
              <p className="text-base sm:text-lg font-bold text-purple-800 font-mono mt-1">
                {isDataCurrent ? formatVnd(recSummary.total_phoi_due) : 'Chưa xác định'}
              </p>
              <span className="text-[11px] text-purple-600 block mt-0.5">
                Đã trả hộ: {isDataCurrent ? formatVnd(recSummary.total_phoi_advance) : '--'}
              </span>
            </div>
          </div>

          {/* CẢNH BÁO ĐỐI TRỪ SỔ SÁCH VẠN ĐẠT THÁI BÌNH (P22) */}
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <p className="font-bold flex items-center space-x-1.5">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>Khoản đối trừ sổ sách: VẠN ĐẠT THÁI BÌNH (3.600.000 đ tại cuốc #22)</span>
              </p>
              <p className="text-[11px] text-amber-800 mt-0.5">
                Khoản cước 3.600.000 đ ghi chú "ĐỐI TRỪ XONG" được hạch toán giảm nợ cho khách hàng, không phát sinh tiền mặt thực nhận vào quỹ công ty.
              </p>
            </div>
          </div>

          {/* THANH TÌM KIẾM & BỘ LỌC KHÁCH HÀNG */}
          <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-center justify-between">
            <div className="relative flex-1">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Tìm tên khách hàng cần đối chiếu công nợ..."
                className="w-full pl-9 pr-8 py-2 text-xs border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-blue-500 bg-white"
              />
              <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-2.5" />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="flex items-center space-x-2">
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="py-2 px-2.5 text-xs border border-slate-300 rounded-lg bg-white"
              >
                <option value="ALL">Tất cả khách hàng ({normalizedCustomers.length})</option>
                <option value="UNPAID">Khách hàng còn nợ ({unpaidCustomers.length})</option>
                <option value="OFFSET">Có khoản đối trừ (1)</option>
                <option value="PAID">Đã tất toán ({paidCustomers.length})</option>
              </select>
            </div>
          </div>

          {/* DANH SÁCH KHÁCH HÀNG (ƯU TIÊN CÒN NỢ LÊN ĐẦU, GOM GỌN ĐÃ TẤT TOÁN) */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="p-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-xs">
              <span className="font-bold text-slate-700">
                Hiển thị {filteredCustomers.length} khách hàng trong kỳ
              </span>
              <span className="text-slate-500">Ưu tiên khách còn nợ; bấm để mở danh sách chuyến xe</span>
            </div>

            <div className="divide-y divide-slate-100">
              {loading && !debts ? (
                <div className="py-12 text-center text-slate-400 text-xs">
                  <RefreshCw className="w-5 h-5 animate-spin mx-auto text-blue-500 mb-2" />
                  <span>Đang tải danh sách công nợ khách hàng...</span>
                </div>
              ) : filteredCustomers.length === 0 ? (
                <div className="py-12 text-center text-slate-400 text-xs">
                  Không tìm thấy khách hàng nào phù hợp với điều kiện tìm kiếm.
                </div>
              ) : (
                filteredCustomers.map((cust) => {
                  const isExpanded = expandedCustomer === cust.name;
                  const isPaid = cust.total_customer_due === 0;

                  return (
                    <div key={cust.id} className="transition-colors hover:bg-slate-50/60">
                      <div
                        onClick={() => setExpandedCustomer(isExpanded ? null : cust.name)}
                        className="p-3 sm:p-4 flex flex-col md:flex-row md:items-center justify-between gap-2.5 cursor-pointer"
                      >
                        <div className="flex items-center space-x-2.5">
                          <div
                            className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs shrink-0 ${
                              isPaid ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                            }`}
                          >
                            <Building2 className="w-4 h-4" />
                          </div>
                          <div>
                            <div className="flex items-center space-x-2">
                              <span className="font-bold text-sm text-slate-900">{cust.name}</span>
                              {cust.has_special_item && (
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                                  Đối trừ {formatVnd(cust.total_offset)}
                                </span>
                              )}
                              {cust.phoi_remaining > 0 && (
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-purple-100 text-purple-800">
                                  Nợ phơi: {formatVnd(cust.phoi_remaining)}
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-500 mt-0.5">
                              {cust.trip_count} cuốc xe • Cước gốc: {formatVnd(cust.total_cuoc_goc)} • Có VAT: <strong>{formatVnd(cust.total_cuoc_co_vat)}</strong> • Sau trừ 17%: {formatVnd(cust.total_sau_tru_17)}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center justify-between md:justify-end gap-4 text-xs font-mono pt-2 md:pt-0 border-t md:border-t-0 border-slate-100">
                          <div className="text-left md:text-right">
                            <span className="text-[10px] text-slate-400 block font-sans">Thực thu vào quỹ</span>
                            <span className="font-semibold text-emerald-700">{formatVnd(cust.total_received)}</span>
                          </div>

                          <div className="text-right min-w-[110px]">
                            <span className="text-[10px] text-slate-400 block font-sans">Dư nợ cước gốc</span>
                            <span
                              className={`font-bold ${cust.fare_remaining > 0 ? 'text-rose-600' : 'text-slate-400'}`}
                            >
                              {cust.fare_remaining > 0 ? formatVnd(cust.fare_remaining) : '0 đ (Hết nợ)'}
                            </span>
                          </div>

                          <div className="text-slate-400 pl-1">
                            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          </div>
                        </div>
                      </div>

                      {/* CHI TIẾT CÁC CUỐC XE CỦA KHÁCH HÀNG NÀY */}
                      {isExpanded && (
                        <div className="bg-slate-50/80 p-3 sm:p-4 border-t border-slate-200 text-xs">
                          <div className="flex items-center justify-between mb-2">
                            <span className="font-bold text-slate-700">
                              Chi tiết {cust.trips.length} cuốc xe của khách hàng {cust.name}
                            </span>
                            <span className="text-[11px] text-slate-500">
                              Bấm vào bất kỳ cuốc nào để mở chi tiết
                            </span>
                          </div>

                          <div className=" ha-table-scroll" tabIndex={0} role="region" aria-label="Bảng dữ liệu, có thể cuộn ngang">
                            <table className="w-full text-left text-xs bg-white rounded-lg border border-slate-200 overflow-hidden">
                              <thead>
                                <tr className="bg-slate-100 text-slate-600 font-semibold border-b border-slate-200">
                                  <th className="py-2 px-2.5 text-center">STT</th>
                                  <th className="py-2 px-2.5">Ngày</th>
                                  <th className="py-2 px-2.5">Tuyến đường</th>
                                  <th className="py-2 px-2.5">Số Container</th>
                                  <th className="py-2 px-2.5 text-right">Cước gốc</th>
                                  <th className="py-2 px-2.5 text-right">Có VAT 8%</th>
                                  <th className="py-2 px-2.5 text-center">Trạng thái</th>
                                  <th className="py-2 px-2.5 text-right">Dư nợ</th>
                                  <th className="py-2 px-2.5 text-center">Thao tác</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {cust.trips.map((t, idx) => {
                                  const cuocGoc = t.cuoc_goc ?? t.cuoc_vao ?? 0;
                                  const cuocCoVat = t.cuoc_co_vat ?? Math.round(cuocGoc * 1.08);
                                  const isOffset = Boolean(t.is_offset);
                                  const isPaid = Boolean(t.is_paid);

                                  return (
                                    <tr
                                      key={t.id || idx}
                                      onClick={() => setSelectedTrip(t)}
                                      className="hover:bg-blue-50/50 cursor-pointer transition-colors"
                                    >
                                      <td className="py-2 px-2.5 text-center font-mono font-bold text-slate-600">
                                        #{t.stt || t.row_index || idx + 1}
                                      </td>
                                      <td className="py-2 px-2.5 font-mono text-slate-700 whitespace-nowrap">
                                        {t.trip_date || '--'}
                                      </td>
                                      <td className="py-2 px-2.5 text-slate-800 truncate max-w-[200px]">
                                        {t.route_name || '--'}
                                      </td>
                                      <td className="py-2 px-2.5 font-mono text-slate-600 whitespace-nowrap">
                                        {t.container_number || '--'}
                                      </td>
                                      <td className="py-2 px-2.5 text-right font-mono font-semibold text-slate-900">
                                        {formatVnd(cuocGoc)}
                                      </td>
                                      <td className="py-2 px-2.5 text-right font-mono text-blue-700">
                                        {formatVnd(cuocCoVat)}
                                      </td>
                                      <td className="py-2 px-2.5 text-center">
                                        {isOffset ? (
                                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800">
                                            Đối trừ
                                          </span>
                                        ) : isPaid ? (
                                          <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-50 text-emerald-700">
                                            Đã TT
                                          </span>
                                        ) : (
                                          <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-rose-50 text-rose-700">
                                            Chưa TT
                                          </span>
                                        )}
                                      </td>
                                      <td className="py-2 px-2.5 text-right font-mono">
                                        {t.balance > 0 ? (
                                          <span className="font-bold text-rose-600">{formatVnd(t.balance)}</span>
                                        ) : (
                                          <span className="text-slate-400">0 đ</span>
                                        )}
                                      </td>
                                      <td className="py-2 px-2.5 text-center">
                                        <button className="text-blue-600 hover:text-blue-800 inline-flex items-center space-x-0.5">
                                          <ExternalLink className="w-3 h-3" />
                                          <span className="text-[10px]">Mở</span>
                                        </button>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* 4. PHÂN HỆ B: TIỀN PHƠI TRẢ HỘ CHỦ HÀNG */}
      {activeTab === 'phoi_advances' && (
        <div className="space-y-4">
          <div className="p-3 bg-purple-50 border border-purple-200 rounded-xl text-xs text-purple-900 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <p className="font-bold flex items-center space-x-1.5">
                <Clock className="w-4 h-4 text-purple-600 shrink-0" />
                <span>Quy tắc chuẩn hóa Tiền phơi trả hộ chủ hàng (28/10/2026):</span>
              </p>
              <p className="text-[11px] text-purple-800 mt-0.5">
                Tách biệt hoàn toàn khỏi phí nâng/hạ; không tính vào doanh thu cước hoặc chi phí chuyến xe. Khi chưa có ngày hẹn hoàn tiền, hệ thống ghi rõ "Chưa đặt ngày hẹn", tuyệt đối không tự gán 7 hay 30 ngày. Danh sách theo dõi toàn thời gian các khoản phơi tính đến hôm nay.
              </p>
            </div>
            <div className="font-bold text-purple-900 font-mono text-sm whitespace-nowrap">
              Còn phải thu:{' '}
              {eirError ? (
                <span className="text-rose-600">Chưa xác định</span>
              ) : (eirLoading && !eirReminders) ? (
                <span className="text-slate-500">Đang tải...</span>
              ) : (
                formatVnd(phoiSummaryTotalDue)
              )}
            </div>
          </div>

          {/* XỬ LÝ LỖI API PHƠI ĐỘC LẬP */}
          {eirError ? (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start space-x-3 text-red-800 text-xs">
              <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-bold text-red-900">Chưa xác định — chưa tải được danh sách tiền phơi trả hộ:</p>
                <p className="mt-0.5">{eirError}</p>
                <p className="mt-1 text-slate-500 italic">
                  Không tự kết luận là 0 khoản hoặc hết nợ khi dịch vụ nhắc việc chưa tải thành công.
                </p>
                <button
                  type="button"
                  onClick={retryLoadEir}
                  className="mt-2 inline-flex items-center space-x-1.5 px-3 py-1 bg-red-100 hover:bg-red-200 text-red-900 rounded-lg font-semibold transition-colors"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Thử lại tải tiền phơi</span>
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* BỘ LỌC VÀ TÌM KIẾM TIỀN PHƠI */}
              <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-center justify-between">
                <div className="relative flex-1">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Tìm theo chủ hàng, mã chuyến, số container..."
                    className="w-full pl-9 pr-8 py-2 text-xs border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-purple-500 bg-white"
                  />
                  <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-2.5" />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <div className="flex items-center space-x-2">
                  <select
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value)}
                    className="py-2 px-2.5 text-xs border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="ALL">Tất cả các khoản ({allReminderItems.length})</option>
                    <option value="UNPAID">Chưa hoàn / Còn nợ</option>
                    <option value="HOAN_MOT_PHAN">Hoàn một phần</option>
                    <option value="OVERDUE">Quá hạn hẹn hoàn</option>
                    <option value="NO_DUE_DATE">Chưa đặt ngày hẹn</option>
                    <option value="PAID">Đã tất toán (Đã hoàn đủ)</option>
                  </select>
                </div>
              </div>

              {/* DANH SÁCH CÁC KHOẢN PHƠI TRẢ HỘ */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
                <div className="p-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-700">
                    Danh sách theo dõi tiền phơi ({filteredPhoiItems.length} khoản)
                  </span>
                  <span className="text-slate-500">Ưu tiên khoản quá hạn và đến hạn hôm nay</span>
                </div>

                {(eirLoading && !eirReminders) ? (
                  <div className="py-12 text-center text-slate-400 text-xs">
                    <RefreshCw className="w-5 h-5 animate-spin mx-auto text-purple-500 mb-2" />
                    <span>Đang tải danh sách tiền phơi trả hộ...</span>
                  </div>
                ) : filteredPhoiItems.length === 0 ? (
                  <div className="py-12 text-center text-slate-400 text-xs">
                    <Clock className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                    <p className="font-semibold text-slate-600">Hiện không có khoản nợ tiền phơi nào cần thu hồi</p>
                    <p className="text-slate-400 mt-0.5">
                      {searchQuery
                        ? 'Không tìm thấy khoản phơi phù hợp với từ khóa tìm kiếm.'
                        : 'Toàn bộ các khoản tiền phơi đã được hoàn tất hoặc không phát sinh nợ.'}
                    </p>
                  </div>
                ) : (
                  <div className=" ha-table-scroll" tabIndex={0} role="region" aria-label="Bảng dữ liệu, có thể cuộn ngang">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                          <th className="py-2.5 px-3">Trạng thái hoàn</th>
                          <th className="py-2.5 px-3">Trạng thái nhắc</th>
                          <th className="py-2.5 px-3">Mã chuyến</th>
                          <th className="py-2.5 px-3">Chủ hàng</th>
                          <th className="py-2.5 px-3">Ngày trả hộ</th>
                          <th className="py-2.5 px-3">Ngày hẹn hoàn</th>
                          <th className="py-2.5 px-3 text-right">Đã trả hộ</th>
                          <th className="py-2.5 px-3 text-right">Đã hoàn</th>
                          <th className="py-2.5 px-3 text-right">Còn phải thu</th>
                          <th className="py-2.5 px-3 text-center">Thao tác</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filteredPhoiItems.map((item) => (
                          <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                            {/* 1. Trạng thái hoàn tiền */}
                            <td className="py-2.5 px-3">
                              {item.refund_status === 'DA_HOAN' ? (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                                  {item.refund_status_label || 'Đã hoàn'}
                                </span>
                              ) : item.refund_status === 'HOAN_MOT_PHAN' ? (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-300">
                                  Hoàn 1 phần
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                                  Chưa hoàn
                                </span>
                              )}
                            </td>

                            {/* 2. Trạng thái nhắc hẹn */}
                            <td className="py-2.5 px-3">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${item.reminderBadgeColor}`}>
                                {item.reminder_label || item.reminder_status}
                              </span>
                            </td>

                            {/* 3. Mã chuyến */}
                            <td className="py-2.5 px-3 font-mono font-bold text-slate-900">{item.trip_id}</td>

                            {/* 4. Chủ hàng */}
                            <td className="py-2.5 px-3 font-bold text-slate-800">{item.customer_name}</td>

                            {/* 5. Ngày trả hộ */}
                            <td className="py-2.5 px-3 font-mono text-slate-600">{item.advance_date}</td>

                            {/* 6. Ngày hẹn hoàn */}
                            <td className="py-2.5 px-3 font-mono font-semibold text-purple-800">
                              {item.due_date ? (
                                item.due_date
                              ) : (
                                <span className="text-slate-400 italic">Chưa đặt ngày hẹn</span>
                              )}
                            </td>

                            {/* 7. Đã trả hộ */}
                            <td className="py-2.5 px-3 text-right font-mono font-semibold text-slate-900">
                              {formatVnd(item.advance_amount)}
                            </td>

                            {/* 8. Đã hoàn */}
                            <td className="py-2.5 px-3 text-right font-mono text-emerald-700">
                              {formatVnd(item.refunded_amount)}
                            </td>

                            {/* 9. Còn phải thu (Đồng nhất balance_due và remaining_amount) */}
                            <td className="py-2.5 px-3 text-right font-mono font-extrabold text-rose-700">
                              {formatVnd(item.balance_due)}
                            </td>

                            {/* 10. Thao tác */}
                            <td className="py-2.5 px-3 text-center">
                              <div className="flex items-center justify-center space-x-1.5">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setPhoiModalTarget({
                                      advance: item,
                                      trip: { id: item.trip_id, customer_name: item.customer_name },
                                      mode: 'REFUND'
                                    })
                                  }
                                  className="px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded font-bold text-[10px] transition-colors"
                                >
                                  Ghi hoàn tiền
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setPhoiModalTarget({
                                      advance: item,
                                      trip: { id: item.trip_id, customer_name: item.customer_name },
                                      mode: 'SCHEDULE'
                                    })
                                  }
                                  className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded font-semibold text-[10px] transition-colors"
                                >
                                  Hẹn ngày
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {/* Giới hạn hiển thị lịch sử hoàn tất */}
                <div className="p-2.5 bg-slate-50 border-t border-slate-200 text-slate-400 text-[11px] text-center">
                  Ghi chú: Mục các khoản đã tất toán hiển thị tối đa 20 giao dịch hoàn tất gần nhất theo giới hạn API backend.
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* 5. PHÂN HỆ C: PHẢI TRẢ NHÀ XE THUÊ NGOÀI */}
      {activeTab === 'payables' && (
        <div className="space-y-4">
          {/* KPI TỔNG HỢP PHẢI TRẢ (3 THẺ CHUẨN) */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs">
              <span className="text-xs text-slate-500 block font-medium">Tổng cước thuê ngoài phát sinh</span>
              <p className="text-base sm:text-lg font-bold text-slate-900 font-mono mt-1">
                {isDataCurrent ? formatVnd(paySummary.total_payable) : 'Đang tải...'}
              </p>
              <span className="text-[11px] text-slate-400 block mt-0.5">
                {isDataCurrent ? `${paySummary.count_subcontractors} đối tác nhà xe` : '--'}
              </span>
            </div>

            <div className="bg-white p-3.5 rounded-xl border border-emerald-200 bg-emerald-50/20 shadow-xs">
              <span className="text-xs text-emerald-700 block font-medium">Đã thanh toán cho nhà xe</span>
              <p className="text-base sm:text-lg font-bold text-emerald-700 font-mono mt-1">
                {isDataCurrent ? formatVnd(paySummary.total_paid) : 'Đang tải...'}
              </p>
              <span className="text-[11px] text-emerald-600 block mt-0.5">
                Theo nguồn đối soát chuẩn công nợ payables
              </span>
            </div>

            <div className="bg-white p-3.5 rounded-xl border border-rose-200 bg-rose-50/20 shadow-xs">
              <span className="text-xs text-rose-700 block font-medium">Còn phải trả nhà xe</span>
              <p
                className={`text-base sm:text-lg font-bold font-mono mt-1 ${
                  paySummary.total_remaining > 0 ? 'text-rose-600' : 'text-slate-800'
                }`}
              >
                {isDataCurrent ? formatVnd(paySummary.total_remaining) : 'Chưa xác định'}
              </p>
              <span className="text-[11px] text-slate-400 block mt-0.5">
                {paySummary.total_remaining > 0 ? 'Còn số dư phải trả' : 'Đã tất toán toàn bộ'}
              </span>
            </div>
          </div>

          {/* DANH SÁCH ĐỐI TÁC NHÀ XE (DESKTOP & MOBILE) */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="p-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-xs">
              <span className="font-bold text-slate-700">
                Hiển thị {filteredSubcontractors.length} đối tác nhà xe trong kỳ
              </span>
              <span className="text-slate-500">Ưu tiên đối tác còn nợ; bấm để mở danh sách chuyến xe</span>
            </div>

            <div className="divide-y divide-slate-100">
              {loading && !debts ? (
                <div className="py-12 text-center text-slate-400 text-xs">
                  <RefreshCw className="w-5 h-5 animate-spin mx-auto text-emerald-500 mb-2" />
                  <span>Đang tải danh sách công nợ nhà xe...</span>
                </div>
              ) : filteredSubcontractors.length === 0 ? (
                <div className="py-12 text-center text-slate-400 text-xs">
                  Không tìm thấy nhà xe nào phù hợp với điều kiện tìm kiếm.
                </div>
              ) : (
                filteredSubcontractors.map((sub) => {
                  const isExpanded = expandedSubcontractor === sub.name;
                  const isPaid = sub.total_remaining === 0;

                  return (
                    <div key={sub.id} className="transition-colors hover:bg-slate-50/60">
                      <div
                        onClick={() => setExpandedSubcontractor(isExpanded ? null : sub.name)}
                        className="p-3 sm:p-4 flex flex-col md:flex-row md:items-center justify-between gap-2.5 cursor-pointer"
                      >
                        <div className="flex items-center space-x-2.5">
                          <div
                            className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs shrink-0 ${
                              isPaid ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            <Truck className="w-4 h-4" />
                          </div>
                          <div>
                            <span className="font-bold text-sm text-slate-900">{sub.name}</span>
                            <div className="text-[11px] text-slate-500 mt-0.5">
                              {sub.trip_count} cuốc xe chạy hộ • Tổng cước ra:{' '}
                              <strong>{formatVnd(sub.total_payable)}</strong>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center justify-between md:justify-end gap-4 text-xs font-mono pt-2 md:pt-0 border-t md:border-t-0 border-slate-100">
                          <div className="text-left md:text-right">
                            <span className="text-[10px] text-slate-400 block font-sans">Đã thanh toán</span>
                            <span className="font-semibold text-emerald-700">{formatVnd(sub.total_paid)}</span>
                          </div>

                          <div className="text-right min-w-[110px]">
                            <span className="text-[10px] text-slate-400 block font-sans">Còn phải trả</span>
                            <span className={`font-bold ${sub.total_remaining > 0 ? 'text-rose-600' : 'text-slate-400'}`}>
                              {sub.total_remaining > 0 ? formatVnd(sub.total_remaining) : '0 đ (Đã hết)'}
                            </span>
                          </div>

                          <div className="text-slate-400 pl-1">
                            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          </div>
                        </div>
                      </div>

                      {/* CHI TIẾT CÁC CUỐC CHẠY HỘ CỦA NHÀ XE */}
                      {isExpanded && (
                        <div className="bg-slate-50/80 p-3 sm:p-4 border-t border-slate-200 text-xs">
                          <div className="flex items-center justify-between mb-2">
                            <span className="font-bold text-slate-700">
                              Các cuốc xe do đối tác {sub.name} thực hiện ({sub.trips.length} cuốc)
                            </span>
                            <span className="text-[11px] text-slate-500">
                              Bấm vào bất kỳ cuốc nào để mở xem chi tiết
                            </span>
                          </div>

                          <div className=" ha-table-scroll" tabIndex={0} role="region" aria-label="Bảng dữ liệu, có thể cuộn ngang">
                            <table className="w-full text-left text-xs bg-white rounded-lg border border-slate-200 overflow-hidden">
                              <thead>
                                <tr className="bg-slate-100 text-slate-600 font-semibold border-b border-slate-200">
                                  <th className="py-2 px-2.5 text-center">STT</th>
                                  <th className="py-2 px-2.5">Ngày</th>
                                  <th className="py-2 px-2.5">Khách hàng</th>
                                  <th className="py-2 px-2.5">Tuyến đường</th>
                                  <th className="py-2 px-2.5">Container</th>
                                  <th className="py-2 px-2.5 text-right">Cước ra phải trả</th>
                                  <th className="py-2 px-2.5 text-center">Thao tác</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {sub.trips.map((t, idx) => (
                                  <tr
                                    key={t.id || idx}
                                    onClick={() => setSelectedTrip(t)}
                                    className="hover:bg-blue-50/50 cursor-pointer transition-colors"
                                  >
                                    <td className="py-2 px-2.5 text-center font-mono font-bold text-slate-600">
                                      #{t.stt || idx + 1}
                                    </td>
                                    <td className="py-2 px-2.5 font-mono text-slate-700 whitespace-nowrap">
                                      {t.trip_date || '--'}
                                    </td>
                                    <td className="py-2 px-2.5 text-slate-900 font-medium">
                                      {t.customer_name || '--'}
                                    </td>
                                    <td className="py-2 px-2.5 text-slate-600 truncate max-w-[200px]">
                                      {t.route_name || '--'}
                                    </td>
                                    <td className="py-2 px-2.5 font-mono text-slate-600 whitespace-nowrap">
                                      {t.container_number || '--'}
                                    </td>
                                    <td className="py-2 px-2.5 text-right font-mono font-bold text-amber-800">
                                      {formatVnd(t.cuoc_ra ?? t.subcontractor_cost ?? 0)}
                                    </td>
                                    <td className="py-2 px-2.5 text-center">
                                      <button className="text-blue-600 hover:text-blue-800 inline-flex items-center space-x-0.5">
                                        <ExternalLink className="w-3 h-3" />
                                        <span className="text-[10px]">Mở</span>
                                      </button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* DRAWER CHI TIẾT CHUYẾN XE (KHI BẤM XEM CUỐC TỪ BẤT KỲ ĐỐI TÁC NÀO) */}
      {selectedTrip && (
        <TripDetailDrawer
          selectedTrip={selectedTrip}
          onClose={() => setSelectedTrip(null)}
          onTripUpdated={loadDebts}
        />
      )}

      {/* MODAL HOÀN TIỀN PHƠI / ĐẶT NGÀY HẸN */}
      <PhoiRefundModal
        isOpen={Boolean(phoiModalTarget)}
        onClose={() => setPhoiModalTarget(null)}
        trip={phoiModalTarget?.trip || null}
        advance={phoiModalTarget?.advance || null}
        initialMode={phoiModalTarget?.mode || 'REFUND'}
        onSuccess={loadDebts}
      />
    </div>
  );
}
