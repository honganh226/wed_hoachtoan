import React, { useState, useMemo, useEffect, useCallback } from 'react';
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
  Clock
} from 'lucide-react';
import { formatVnd } from '../data/unifiedBusinessData';
import { fetchBusinessDebtsApi, fetchEirRemindersApi } from '../services/api.js';
import PhoiRefundModal from './PhoiRefundModal.jsx';

export default function DirectorDebtsView({
  assistantFocus,
  onAssistantFocusConsumed,
  onAssistantContext
}) {
  const [assistantPeriod, setAssistantPeriod] = useState(null);
  const [activeTab, setActiveTab] = useState('receivables'); // 'receivables' | 'phoi_advances' | 'payables'
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('ALL'); // 'ALL' | 'UNPAID' | 'PAID' | 'OFFSET'
  const [expandedCustomer, setExpandedCustomer] = useState(null);
  const [expandedSubcontractor, setExpandedSubcontractor] = useState(null);

  const [debts, setDebts] = useState(null);
  const [eirReminders, setEirReminders] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const [phoiModalTarget, setPhoiModalTarget] = useState(null); // { trip, advance, mode }

  const isSecretary = (() => {
    try {
      const u = JSON.parse(localStorage.getItem('hoachtoan_auth_user') || '{}');
      return u?.role === 'SECRETARY';
    } catch {
      return false;
    }
  })();

  const loadDebts = useCallback(async () => {
    try {
      setLoading(true);
      setLoadError(null);

      if (isSecretary) {
        // Thư ký chỉ có quyền truy cập nhắc việc và khoản phơi, không gọi API công nợ tài chính
        const remRes = await fetchEirRemindersApi().catch(() => ({ success: false }));
        if (remRes.success) {
          setEirReminders(remRes.data);
        } else {
          setLoadError(remRes.error || 'Lỗi tải danh sách nhắc việc hoàn tiền phơi.');
        }
        return;
      }

      const [res, remRes] = await Promise.all([
        fetchBusinessDebtsApi(
          assistantPeriod && !assistantPeriod.all
            ? { start_date: assistantPeriod.startDate, end_date: assistantPeriod.endDate }
            : {}
        ).catch((err) => ({ success: false, error: err.message })),
        fetchEirRemindersApi().catch(() => ({ success: false }))
      ]);

      if (remRes.success) setEirReminders(remRes.data);

      if (res.success) {
        setDebts(res.data);
      } else {
        setLoadError(res.error || 'Lỗi tải dữ liệu công nợ.');
      }
    } catch (e) {
      setLoadError('Không thể kết nối máy chủ backend. Vui lòng kiểm tra mạng và thử lại.');
    } finally {
      setLoading(false);
    }
  }, [assistantPeriod, isSecretary]);

  useEffect(() => {
    loadDebts();
  }, [loadDebts]);

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === 'visible') loadDebts();
    };
    window.addEventListener('business-data-changed', refresh);
    const timer = setInterval(refresh, 30000);
    return () => {
      window.removeEventListener('business-data-changed', refresh);
      clearInterval(timer);
    };
  }, [loadDebts]);

  const receivables = debts?.receivables || {};
  const payables = debts?.payables || {};

  useEffect(() => {
    if (!assistantFocus) return;
    setActiveTab(assistantFocus.kind === 'payables' ? 'payables' : 'receivables');
    setSearchQuery(assistantFocus.query || '');
    setFilterStatus('ALL');
    setAssistantPeriod(assistantFocus.period || null);
    onAssistantFocusConsumed?.();
  }, [assistantFocus?.nonce]);

  useEffect(() => {
    const query = searchQuery.trim().toLocaleLowerCase('vi');
    const party =
      activeTab === 'payables'
        ? (debts?.payables?.subcontractors || []).find((r) => r.subcontractor_name.toLocaleLowerCase('vi') === query)
        : (debts?.receivables?.customers || []).find((r) => r.customer_name.toLocaleLowerCase('vi') === query);
    const entity = party
      ? {
          kind: activeTab === 'payables' ? 'supplier' : 'customer',
          value: party.subcontractor_name || party.customer_name
        }
      : null;
    onAssistantContext?.({ period: assistantPeriod || { all: true }, entity });
  }, [assistantPeriod, searchQuery, activeTab, debts, onAssistantContext]);

  const normalizedCustomers = useMemo(() => {
    return (receivables.customers || []).map((c) => {
      const fareDue = c.balance_due ?? c.total_remaining ?? 0;
      const phoiDue = c.phoi_balance_due ?? 0;
      return {
        name: c.customer_name || 'Khách vãng lai',
        trip_count: c.trip_count || (c.trips ? c.trips.length : 0),
        total_cuoc_goc: c.total_revenue ?? c.total_receivable ?? 0,
        total_cuoc_co_vat: c.total_cuoc_co_vat ?? Math.round((c.total_revenue || 0) * 1.08),
        total_received: c.total_paid ?? c.total_received ?? 0,
        total_offset: c.total_offset ?? 0,
        fare_remaining: fareDue,
        vat_reconciliation_diff: c.vat_reconciliation_diff ?? 0,
        phoi_advance_total: c.phoi_advance_total ?? 0,
        phoi_refunded_total: c.phoi_refunded_total ?? 0,
        phoi_remaining: phoiDue,
        total_customer_due: c.total_customer_receivable_due ?? fareDue + phoiDue,
        has_special_item: Boolean(c.has_special_item),
        trips: c.trips || []
      };
    });
  }, [receivables.customers]);

  const normalizedSubcontractors = useMemo(() => {
    return (payables.subcontractors || []).map((s) => ({
      name: s.subcontractor_name || s.name || 'Nhà xe đối tác',
      trip_count: s.trip_count || (s.trips ? s.trips.length : 0),
      total_payable: s.total_payable ?? 0,
      total_paid: s.total_paid ?? 0,
      total_remaining: s.balance_due ?? s.total_remaining ?? 0,
      trips: s.trips || []
    }));
  }, [payables.subcontractors]);

  const filteredCustomers = useMemo(() => {
    return normalizedCustomers.filter((c) => {
      const matchSearch = c.name.toLowerCase().includes((searchQuery || '').toLowerCase());
      if (!matchSearch) return false;
      if (filterStatus === 'UNPAID') return c.total_customer_due > 0;
      if (filterStatus === 'PAID') return c.total_customer_due === 0;
      if (filterStatus === 'OFFSET') return c.total_offset > 0 || c.has_special_item || c.phoi_advance_total > 0;
      return true;
    });
  }, [normalizedCustomers, searchQuery, filterStatus]);

  const filteredSubcontractors = useMemo(() => {
    return normalizedSubcontractors.filter((s) => {
      const matchSearch = s.name.toLowerCase().includes((searchQuery || '').toLowerCase());
      if (!matchSearch) return false;
      if (filterStatus === 'UNPAID') return s.total_remaining > 0;
      if (filterStatus === 'PAID') return s.total_remaining === 0;
      return true;
    });
  }, [normalizedSubcontractors, searchQuery, filterStatus]);

  const recSummary = {
    total_cuoc_goc: receivables.total_receivable ?? 0,
    total_cuoc_co_vat: receivables.total_cuoc_co_vat ?? 0,
    total_received: receivables.total_paid ?? 0,
    total_offset: receivables.total_offset ?? 0,
    fare_remaining: receivables.total_due ?? 0,
    total_vat_reconciliation_diff: receivables.total_vat_reconciliation_diff ?? 0,
    total_phoi_advance: receivables.total_phoi_advance ?? 0,
    total_phoi_refunded: receivables.total_phoi_refunded ?? 0,
    total_phoi_due: receivables.total_phoi_due ?? 0,
    total_customer_receivable_due:
      receivables.total_customer_receivable_due ?? (receivables.total_due || 0) + (receivables.total_phoi_due || 0),
    count_customers: normalizedCustomers.length
  };

  const paySummary = {
    total_payable: payables.total_payable ?? 0,
    total_paid: payables.total_paid ?? 0,
    total_remaining: payables.total_due ?? 0,
    count_subcontractors: normalizedSubcontractors.length
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-16 flex flex-col items-center justify-center space-y-4 text-center">
        <Loader2 className="w-8 h-8 text-slate-800 animate-spin" />
        <div className="text-sm font-semibold text-slate-700">Đang tải dữ liệu công nợ từ máy chủ...</div>
        <div className="text-xs text-slate-400">
          Đối soát Công nợ Tiền cước • Công nợ Tiền phơi trả hộ • Phải trả Nhà xe
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="max-w-2xl mx-auto my-12 p-6 bg-white border border-rose-200 rounded-2xl shadow-sm text-center space-y-4">
        <AlertTriangle className="w-10 h-10 text-rose-500 mx-auto" />
        <h3 className="text-base font-bold text-slate-900">Không thể tải dữ liệu công nợ</h3>
        <p className="text-xs text-slate-600">{loadError}</p>
        <button
          onClick={loadDebts}
          className="inline-flex items-center space-x-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-xl shadow-xs transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Thử lại</span>
        </button>
      </div>
    );
  }

  const allReminderItems = [
    ...(eirReminders?.overdue || []).map((it) => ({ ...it, badge: 'Quá hạn', badgeColor: 'bg-rose-100 text-rose-800' })),
    ...(eirReminders?.due_today || []).map((it) => ({ ...it, badge: 'Đến hạn hôm nay', badgeColor: 'bg-amber-100 text-amber-800' })),
    ...(eirReminders?.unscheduled || []).map((it) => ({ ...it, badge: 'Chưa đặt ngày nhắc', badgeColor: 'bg-purple-100 text-purple-800' })),
    ...(eirReminders?.upcoming || []).map((it) => ({ ...it, badge: `Hẹn ${it.due_date}`, badgeColor: 'bg-blue-100 text-blue-800' }))
  ];

  return (
    <div className="space-y-6 pb-20 animate-fade-in text-slate-800">
      {assistantPeriod && !assistantPeriod.all && (
        <div className="text-xs bg-blue-50 p-3 rounded-lg">
          Cuốc phát sinh từ {assistantPeriod.startDate} đến {assistantPeriod.endDate}, theo thanh toán hiện tại.{' '}
          <button
            className="underline font-bold"
            onClick={() => {
              setAssistantPeriod(null);
              setSearchQuery('');
            }}
          >
            Xem toàn bộ
          </button>
        </div>
      )}

      {/* 1. Header & Điều hướng 3 tab công nợ */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-5">
        <div className="flex flex-col gap-4 min-w-0">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 flex items-center gap-2">
              <CreditCard className="w-7 h-7 text-indigo-600" />
              <span>Quản Lý Công Nợ (Tiền Cước • Tiền Phơi Trả Hộ • Nhà Xe)</span>
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-1">
              Tách biệt rõ Công nợ tiền cước, Công nợ tiền phơi trả hộ chủ hàng và Tổng phải thu khách hàng
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5 p-1 bg-slate-100 rounded-xl w-full border border-slate-200">
            <button
              onClick={() => {
                setActiveTab('receivables');
                setFilterStatus('ALL');
              }}
              className={`flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
                activeTab === 'receivables'
                  ? 'bg-white text-indigo-700 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Building2 className="w-4 h-4" />
              <span>Phải Thu Khách Hàng ({normalizedCustomers.length})</span>
            </button>

            <button
              onClick={() => {
                setActiveTab('phoi_advances');
                setFilterStatus('ALL');
              }}
              className={`flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
                activeTab === 'phoi_advances'
                  ? 'bg-white text-purple-700 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Clock className="w-4 h-4" />
              <span>Công Nợ & Nhắc Đòi Tiền Phơi ({allReminderItems.length})</span>
            </button>

            <button
              onClick={() => {
                setActiveTab('payables');
                setFilterStatus('ALL');
              }}
              className={`flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
                activeTab === 'payables'
                  ? 'bg-white text-indigo-700 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Truck className="w-4 h-4" />
              <span>Phải Trả Nhà Xe ({normalizedSubcontractors.length})</span>
            </button>
          </div>
        </div>

        <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg flex items-start gap-2 text-xs text-blue-900">
          <Info className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold">Chuẩn đối soát công nợ mới (28/10/2026):</span> Cước vào gốc là <b>chưa VAT</b> (Cước có VAT = Cước gốc × 1,08). Các cuốc lịch sử đã đánh dấu thu (X/TƯƠI) giữ nguyên trạng thái đã thu cước gốc và hiển thị riêng phần <b>chênh lệch VAT 8% ({formatVnd(recSummary.total_vat_reconciliation_diff)})</b> để đối soát, không tự mở lại nợ cũ. <b>Tiền phơi trả hộ</b> được theo dõi công nợ riêng biệt với tiền cước.
          </div>
        </div>
      </div>

      {/* 2. Tab Phải Thu Khách Hàng (Cước + Phơi + Tổng phải thu) */}
      {activeTab === 'receivables' && (
        <div className="space-y-6">
          {/* 5 Thẻ chỉ số tổng hợp Phải thu */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
              <span className="text-xs font-medium text-slate-500">1. Cước Gốc / Có VAT</span>
              <p className="text-base sm:text-lg font-extrabold text-slate-900 mt-1 font-mono">
                {formatVnd(recSummary.total_cuoc_goc)}
              </p>
              <span className="text-[11px] text-emerald-700 font-semibold mt-0.5 block">
                Có VAT (×1,08): {formatVnd(recSummary.total_cuoc_co_vat)}
              </span>
            </div>

            <div className="bg-white p-4 rounded-xl border border-emerald-200 shadow-sm bg-emerald-50/20">
              <span className="text-xs font-medium text-emerald-700">2. Đã Thu & Đối Trừ Cước</span>
              <p className="text-base sm:text-lg font-extrabold text-emerald-700 mt-1 font-mono">
                {formatVnd(recSummary.total_received)}
              </p>
              <span className="text-[11px] text-amber-700 mt-0.5 block">
                Đối trừ P22: {formatVnd(recSummary.total_offset)}
              </span>
            </div>

            <div className="bg-white p-4 rounded-xl border border-rose-200 shadow-sm bg-rose-50/20">
              <span className="text-xs font-medium text-rose-700">3. Còn Nợ Tiền Cước</span>
              <p className="text-base sm:text-lg font-extrabold text-rose-700 mt-1 font-mono">
                {formatVnd(recSummary.fare_remaining)}
              </p>
              <span className="text-[10px] text-slate-500 mt-0.5 block">
                VAT 8% lịch sử đối soát: {formatVnd(recSummary.total_vat_reconciliation_diff)}
              </span>
            </div>

            <div className="bg-white p-4 rounded-xl border border-purple-200 shadow-sm bg-purple-50/20">
              <span className="text-xs font-medium text-purple-800">4. Còn Nợ Tiền Phơi Trả Hộ</span>
              <p className="text-base sm:text-lg font-extrabold text-purple-800 mt-1 font-mono">
                {formatVnd(recSummary.total_phoi_due)}
              </p>
              <span className="text-[11px] text-purple-600 mt-0.5 block">
                Đã trả hộ: {formatVnd(recSummary.total_phoi_advance)}
              </span>
            </div>

            <div className="bg-slate-900 text-white p-4 rounded-xl border border-slate-800 shadow-sm col-span-2 lg:col-span-1">
              <span className="text-xs font-bold text-amber-300">5. TỔNG PHẢI THU KHÁCH</span>
              <p className="text-base sm:text-lg font-extrabold text-amber-300 mt-1 font-mono">
                {formatVnd(recSummary.total_customer_receivable_due)}
              </p>
              <span className="text-[10px] text-slate-300 mt-0.5 block">
                = Nợ tiền cước + Nợ tiền phơi trả hộ
              </span>
            </div>
          </div>

          {/* Thanh tìm kiếm & bộ lọc */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
            <div className="relative flex-1">
              <Search className="w-5 h-5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Tìm tên khách hàng (VD: VSC, QUANG HÀ, ĐỨC LUẬN...)"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg text-sm"
              />
            </div>

            <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
              <button
                onClick={() => setFilterStatus('ALL')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap cursor-pointer ${
                  filterStatus === 'ALL' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600'
                }`}
              >
                Tất cả ({normalizedCustomers.length})
              </button>
              <button
                onClick={() => setFilterStatus('UNPAID')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap cursor-pointer ${
                  filterStatus === 'UNPAID' ? 'bg-rose-600 text-white' : 'bg-rose-50 text-rose-700'
                }`}
              >
                Còn nợ cước/phơi ({normalizedCustomers.filter((c) => c.total_customer_due > 0).length})
              </button>
              <button
                onClick={() => setFilterStatus('PAID')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap cursor-pointer ${
                  filterStatus === 'PAID' ? 'bg-emerald-600 text-white' : 'bg-emerald-50 text-emerald-700'
                }`}
              >
                Đã tất toán ({normalizedCustomers.filter((c) => c.total_customer_due === 0).length})
              </button>
            </div>
          </div>

          {/* Danh sách khách hàng */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="divide-y divide-slate-200">
              {filteredCustomers.length === 0 ? (
                <div className="p-8 text-center text-slate-500">
                  Không tìm thấy khách hàng phù hợp với điều kiện tìm kiếm.
                </div>
              ) : (
                filteredCustomers.map((customer) => {
                  const isExpanded = expandedCustomer === customer.name;
                  return (
                    <div key={customer.name} className="transition-colors hover:bg-slate-50/50">
                      <div
                        onClick={() => setExpandedCustomer(isExpanded ? null : customer.name)}
                        className="p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-3 cursor-pointer"
                      >
                        <div className="flex items-start sm:items-center gap-3">
                          <div
                            className={`w-10 h-10 rounded-lg flex items-center justify-center font-bold text-sm flex-shrink-0 ${
                              customer.total_customer_due > 0
                                ? 'bg-rose-100 text-rose-700'
                                : 'bg-emerald-100 text-emerald-700'
                            }`}
                          >
                            {customer.name.substring(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <h4 className="font-bold text-slate-900 text-base">{customer.name}</h4>
                              {customer.phoi_remaining > 0 && (
                                <span className="text-[11px] bg-purple-100 text-purple-800 font-bold px-2 py-0.5 rounded-full">
                                  Nợ phơi: {formatVnd(customer.phoi_remaining)}
                                </span>
                              )}
                              {customer.total_offset > 0 && (
                                <span className="text-[11px] bg-amber-100 text-amber-800 font-semibold px-2 py-0.5 rounded-full">
                                  Có đối trừ
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-slate-500 mt-0.5">
                              {customer.trip_count} cuốc xe • Cước có VAT: <b>{formatVnd(customer.total_cuoc_co_vat)}</b>
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 items-center border-t lg:border-t-0 pt-2 lg:pt-0 text-xs">
                          <div className="text-left sm:text-right">
                            <span className="text-[11px] text-slate-400 block">Cước gốc (Chưa VAT)</span>
                            <span className="font-mono font-semibold text-slate-800">
                              {formatVnd(customer.total_cuoc_goc)}
                            </span>
                          </div>

                          <div className="text-left sm:text-right">
                            <span className="text-[11px] text-slate-400 block">Nợ tiền cước</span>
                            <span className="font-mono font-bold text-rose-600">
                              {formatVnd(customer.fare_remaining)}
                            </span>
                          </div>

                          <div className="text-left sm:text-right">
                            <span className="text-[11px] text-purple-600 block">Nợ tiền phơi trả hộ</span>
                            <span className="font-mono font-bold text-purple-700">
                              {formatVnd(customer.phoi_remaining)}
                            </span>
                          </div>

                          <div className="text-right flex items-center justify-end gap-2">
                            <div>
                              <span className="text-[11px] text-slate-500 font-bold block">Tổng phải thu</span>
                              <span
                                className={`text-sm font-mono font-extrabold ${
                                  customer.total_customer_due > 0 ? 'text-rose-700' : 'text-emerald-600'
                                }`}
                              >
                                {customer.total_customer_due > 0
                                  ? formatVnd(customer.total_customer_due)
                                  : '0 đ (Hết nợ)'}
                              </span>
                            </div>
                            <div className="text-slate-400">
                              {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                            </div>
                          </div>
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="bg-slate-50 border-t border-slate-200 p-4 sm:p-5">
                          <h5 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">
                            Chi tiết các cuốc, tiền cước và tiền phơi trả hộ của {customer.name}
                          </h5>

                          <div className="overflow-x-auto">
                            <table className="w-full text-left text-xs min-w-[900px]">
                              <thead>
                                <tr className="border-b border-slate-200 text-slate-500 font-semibold">
                                  <th className="pb-2">Mã cuốc</th>
                                  <th className="pb-2">Ngày</th>
                                  <th className="pb-2">Tuyến đường</th>
                                  <th className="pb-2">Container</th>
                                  <th className="pb-2 text-right">Cước gốc (Chưa VAT)</th>
                                  <th className="pb-2 text-right">Cước có VAT (×1,08)</th>
                                  <th className="pb-2 text-center">TT Tiền Cước</th>
                                  <th className="pb-2 text-right">Còn nợ cước</th>
                                  <th className="pb-2 text-center">Cột Cuối: Hoàn Tiền Phơi</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-200/60">
                                {customer.trips.map((t, tIdx) => {
                                  const isOffset = t.is_offset;
                                  const isPaid = t.is_paid || isOffset;
                                  const phoiAdv = t.phoi_tra_ho ?? 0;
                                  const phoiRem = t.phoi_con_phai_thu ?? 0;
                                  const isPhoiDone = phoiAdv > 0 && phoiRem === 0;

                                  return (
                                    <tr key={tIdx} className="hover:bg-slate-100/50">
                                      <td className="py-2 font-mono text-slate-500">#{t.id || tIdx + 1}</td>
                                      <td className="py-2 text-slate-700">{t.trip_date || t.raw_date}</td>
                                      <td className="py-2 font-medium text-slate-800">
                                        {t.route_name || t.tuyen_duong || 'Khoản ngoài cuốc'}
                                      </td>
                                      <td className="py-2 font-mono text-slate-600">{t.container_number || '-'}</td>
                                      <td className="py-2 text-right font-mono font-semibold text-slate-900">
                                        {formatVnd(t.cuoc_goc ?? t.cuoc_vao)}
                                      </td>
                                      <td className="py-2 text-right font-mono font-bold text-emerald-700">
                                        {formatVnd(t.cuoc_co_vat ?? Math.round((t.cuoc_vao || 0) * 1.08))}
                                      </td>
                                      <td className="py-2 text-center">
                                        {isOffset ? (
                                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-800">
                                            <ArrowLeftRight className="w-3 h-3" />
                                            ĐỐI TRỪ XONG
                                          </span>
                                        ) : isPaid ? (
                                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-800">
                                            <CheckCircle2 className="w-3 h-3" />
                                            {t.payment_timing_q === 'TƯƠI' ? 'TƯƠI (Đã thu)' : 'Đã trả (X)'}
                                          </span>
                                        ) : (
                                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-rose-100 text-rose-800">
                                            Chưa TT cước
                                          </span>
                                        )}
                                      </td>
                                      <td className="py-2 text-right font-mono font-bold">
                                        {isPaid ? (
                                          <span className="text-slate-400">0 đ</span>
                                        ) : (
                                          <span className="text-rose-600">{formatVnd(t.balance || t.cuoc_vao)}</span>
                                        )}
                                      </td>
                                      <td className="py-2 text-center">
                                        {phoiAdv > 0 ? (
                                          <button
                                            type="button"
                                            onClick={() =>
                                              setPhoiModalTarget({
                                                trip: { id: t.id, customer_name: customer.name, trip_date: t.trip_date },
                                                mode: 'REFUND'
                                              })
                                            }
                                            className={`inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-bold border cursor-pointer ${
                                              isPhoiDone
                                                ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                                : 'bg-purple-100 text-purple-900 border-purple-300'
                                            }`}
                                          >
                                            <input
                                              type="checkbox"
                                              checked={isPhoiDone}
                                              readOnly
                                              className="rounded pointer-events-none"
                                            />
                                            <span>
                                              {isPhoiDone
                                                ? `Đã hoàn ✓ (${formatVnd(phoiAdv)})`
                                                : `Nợ phơi: ${formatVnd(phoiRem)}`}
                                            </span>
                                          </button>
                                        ) : (
                                          <button
                                            type="button"
                                            onClick={() =>
                                              setPhoiModalTarget({
                                                trip: { id: t.id, customer_name: customer.name, trip_date: t.trip_date },
                                                mode: 'CREATE'
                                              })
                                            }
                                            className="text-[11px] text-slate-400 hover:text-purple-700 hover:underline"
                                          >
                                            + Ghi phơi
                                          </button>
                                        )}
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

      {/* 3. Tab Công Nợ & Nhắc Đòi Tiền Phơi Trả Hộ */}
      {activeTab === 'phoi_advances' && (
        <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-5 space-y-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
            <div>
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Clock className="w-5 h-5 text-purple-600" />
                <span>Danh Sách Tiền Phơi Trả Hộ Cần Đòi & Lịch Hẹn Hoàn Tiền</span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Tích xác nhận hoàn đủ hoặc hoàn một phần; đổi ngày chủ hàng hẹn hoàn thì lịch nhắc tự đổi theo.
              </p>
            </div>
            <div className="text-xs font-bold text-purple-900 bg-purple-50 px-3 py-1.5 rounded-lg border border-purple-200">
              Tổng phơi còn phải thu: {formatVnd(eirReminders?.summary?.total_outstanding_amount || 0)}
            </div>
          </div>

          {allReminderItems.length === 0 ? (
            <div className="p-8 text-center text-slate-500 text-xs">
              Hiện không có khoản tiền phơi trả hộ nào đang chờ hoàn tiền.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse min-w-[900px]">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                    <th className="py-2.5 px-3">Trạng Thái Nhắc</th>
                    <th className="py-2.5 px-3">Mã Chuyến</th>
                    <th className="py-2.5 px-3">Chủ Hàng</th>
                    <th className="py-2.5 px-3">Ngày Trả Hộ</th>
                    <th className="py-2.5 px-3">Ngày Hẹn Hoàn</th>
                    <th className="py-2.5 px-3 text-right">Đã Trả Hộ</th>
                    <th className="py-2.5 px-3 text-right">Đã Hoàn</th>
                    <th className="py-2.5 px-3 text-right">Còn Phải Thu</th>
                    <th className="py-2.5 px-3 text-center">Cột Cuối: Hoàn Tiền Phơi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {allReminderItems.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50">
                      <td className="py-2.5 px-3">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${item.badgeColor}`}>
                          {item.badge}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-mono font-bold text-slate-900">{item.trip_id}</td>
                      <td className="py-2.5 px-3 font-bold text-slate-800">{item.customer_name}</td>
                      <td className="py-2.5 px-3 font-mono text-slate-600">{item.advance_date}</td>
                      <td className="py-2.5 px-3 font-mono font-semibold text-purple-800">
                        {item.due_date || 'Chưa đặt ngày nhắc'}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-semibold text-slate-900">
                        {formatVnd(item.advance_amount)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-emerald-700">
                        {formatVnd(item.refunded_amount)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-extrabold text-rose-700">
                        {formatVnd(item.remaining_amount)}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            type="button"
                            onClick={() =>
                              setPhoiModalTarget({
                                advance: item,
                                trip: { id: item.trip_id, customer_name: item.customer_name },
                                mode: 'REFUND'
                              })
                            }
                            className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold text-[11px] cursor-pointer"
                          >
                            ✓ Tích Đã Hoàn
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
                            className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-semibold text-[11px] cursor-pointer"
                          >
                            📅 Hẹn Ngày
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* 4. Tab Phải Trả Nhà Xe */}
      {activeTab === 'payables' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
            <div className="bg-white p-4 sm:p-5 rounded-xl border border-slate-200 shadow-sm">
              <span className="text-xs sm:text-sm font-medium text-slate-500">Tổng Cước Thuê Ngoài (Cước Ra)</span>
              <p className="text-lg sm:text-2xl font-bold text-slate-900 mt-1">
                {formatVnd(paySummary.total_payable)}
              </p>
              <span className="text-xs text-slate-400 mt-1 block">{paySummary.count_subcontractors} nhà xe đối tác</span>
            </div>

            <div className="bg-white p-4 sm:p-5 rounded-xl border border-emerald-200 shadow-sm bg-emerald-50/20">
              <span className="text-xs sm:text-sm font-medium text-emerald-700">Đã Thanh Toán Cho Nhà Xe</span>
              <p className="text-lg sm:text-2xl font-bold text-emerald-700 mt-1">
                {formatVnd(paySummary.total_paid)}
              </p>
              <span className="text-xs text-emerald-600 mt-1 block">Có ký hiệu (X) hoặc TƯƠI</span>
            </div>

            <div className="bg-white p-4 sm:p-5 rounded-xl border border-rose-200 shadow-sm bg-rose-50/20">
              <span className="text-xs sm:text-sm font-medium text-rose-700">Còn Phải Trả Nhà Xe</span>
              <p className="text-lg sm:text-2xl font-bold text-rose-700 mt-1">
                {formatVnd(paySummary.total_remaining)}
              </p>
              <span className="text-xs text-rose-600 mt-1 block">Khoản phải trả giữ nợ chuyển kỳ</span>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="divide-y divide-slate-200">
              {filteredSubcontractors.map((subcontractor) => {
                const isExpanded = expandedSubcontractor === subcontractor.name;
                return (
                  <div key={subcontractor.name} className="transition-colors hover:bg-slate-50/50">
                    <div
                      onClick={() => setExpandedSubcontractor(isExpanded ? null : subcontractor.name)}
                      className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-amber-100 text-amber-800 flex items-center justify-center font-bold text-sm">
                          <Truck className="w-5 h-5" />
                        </div>
                        <div>
                          <h4 className="font-bold text-slate-900 text-base">{subcontractor.name}</h4>
                          <div className="text-xs text-slate-500 mt-0.5">{subcontractor.trip_count} cuốc chạy hộ</div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between sm:justify-end gap-4">
                        <div className="text-right">
                          <span className="text-xs text-slate-400 block">Tổng cước ra</span>
                          <span className="text-sm font-semibold text-slate-800">
                            {formatVnd(subcontractor.total_payable)}
                          </span>
                        </div>
                        <div className="text-right min-w-[120px]">
                          <span className="text-xs text-slate-400 block">Còn phải trả</span>
                          <span
                            className={`text-base font-bold ${
                              subcontractor.total_remaining > 0 ? 'text-rose-600' : 'text-slate-400'
                            }`}
                          >
                            {subcontractor.total_remaining > 0
                              ? formatVnd(subcontractor.total_remaining)
                              : '0 đ (Đã hết)'}
                          </span>
                        </div>
                        <div className="text-slate-400 pl-2">
                          {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* MODAL XÁC NHẬN HOÀN TIỀN PHƠI / ĐẶT NGÀY HẸN HOÀN */}
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
