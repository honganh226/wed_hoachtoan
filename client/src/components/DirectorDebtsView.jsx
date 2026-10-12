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
  Loader2
} from 'lucide-react';
import { formatVnd } from '../data/unifiedBusinessData';
import { fetchBusinessDebtsApi } from '../services/api.js';

export default function DirectorDebtsView() {
  const [activeTab, setActiveTab] = useState('receivables'); // 'receivables' | 'payables'
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('ALL'); // 'ALL' | 'UNPAID' | 'PAID' | 'OFFSET'
  const [expandedCustomer, setExpandedCustomer] = useState(null);
  const [expandedSubcontractor, setExpandedSubcontractor] = useState(null);

  const [debts, setDebts] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const loadDebts = useCallback(async () => {
    try {
      setLoading(true);
      setLoadError(null);
      const res = await fetchBusinessDebtsApi();
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
  }, []);

  useEffect(() => {
    loadDebts();
  }, [loadDebts]);
  useEffect(() => {
    const refresh = () => { if (document.visibilityState === 'visible') loadDebts(); };
    window.addEventListener('business-data-changed', refresh);
    const timer = setInterval(refresh, 30000);
    return () => { window.removeEventListener('business-data-changed', refresh); clearInterval(timer); };
  }, [loadDebts]);

  const receivables = debts?.receivables || {};
  const payables = debts?.payables || {};

  // Chuẩn hóa danh sách khách hàng
  const normalizedCustomers = useMemo(() => {
    return (receivables.customers || []).map(c => ({
      name: c.customer_name || 'Khách vãng lai',
      trip_count: c.trip_count || (c.trips ? c.trips.length : 0),
      total_receivable: c.total_revenue ?? c.total_receivable ?? 0,
      total_received: c.total_paid ?? c.total_received ?? 0,
      total_offset: c.total_offset ?? 0,
      total_remaining: c.balance_due ?? c.total_remaining ?? 0,
      has_special_item: Boolean(c.has_special_item),
      trips: c.trips || []
    }));
  }, [receivables.customers]);

  // Chuẩn hóa danh sách nhà xe ngoài
  const normalizedSubcontractors = useMemo(() => {
    return (payables.subcontractors || []).map(s => ({
      name: s.subcontractor_name || s.name || 'Nhà xe đối tác',
      trip_count: s.trip_count || (s.trips ? s.trips.length : 0),
      total_payable: s.total_payable ?? 0,
      total_paid: s.total_paid ?? 0,
      total_remaining: s.balance_due ?? s.total_remaining ?? 0,
      trips: s.trips || []
    }));
  }, [payables.subcontractors]);

  // Lọc danh sách khách hàng
  const filteredCustomers = useMemo(() => {
    return normalizedCustomers.filter(c => {
      const matchSearch = c.name.toLowerCase().includes((searchQuery || '').toLowerCase());
      if (!matchSearch) return false;
      if (filterStatus === 'UNPAID') return c.total_remaining > 0;
      if (filterStatus === 'PAID') return c.total_remaining === 0;
      if (filterStatus === 'OFFSET') return c.total_offset > 0 || c.has_special_item;
      return true;
    });
  }, [normalizedCustomers, searchQuery, filterStatus]);

  // Lọc danh sách nhà xe ngoài
  const filteredSubcontractors = useMemo(() => {
    return normalizedSubcontractors.filter(s => {
      const matchSearch = c => c.name.toLowerCase().includes((searchQuery || '').toLowerCase());
      if (!matchSearch(s)) return false;
      if (filterStatus === 'UNPAID') return s.total_remaining > 0;
      if (filterStatus === 'PAID') return s.total_remaining === 0;
      return true;
    });
  }, [normalizedSubcontractors, searchQuery, filterStatus]);

  const recSummary = {
    total_receivable: receivables.total_receivable ?? receivables.summary?.total_revenue ?? 0,
    total_received: receivables.total_paid ?? receivables.summary?.total_paid ?? 0,
    total_offset: receivables.total_offset ?? receivables.summary?.total_offset ?? 0,
    total_remaining: receivables.total_due ?? receivables.summary?.balance_due ?? 0,
    count_customers: normalizedCustomers.length
  };

  const paySummary = {
    total_payable: payables.total_payable ?? payables.summary?.total_payable ?? 0,
    total_paid: payables.total_paid ?? payables.summary?.total_paid ?? 0,
    total_remaining: payables.total_due ?? payables.summary?.balance_due ?? 0,
    count_subcontractors: normalizedSubcontractors.length
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-16 flex flex-col items-center justify-center space-y-4 text-center">
        <Loader2 className="w-8 h-8 text-slate-800 animate-spin" />
        <div className="text-sm font-semibold text-slate-700">Đang tải dữ liệu công nợ từ máy chủ...</div>
        <div className="text-xs text-slate-400">Đối soát phải thu khách hàng & phải trả nhà xe</div>
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

  return (
    <div className="space-y-6 pb-20 animate-fade-in text-slate-800">
      {/* 1. Header & Điều hướng 2 tab công nợ */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
        <div className="flex flex-col gap-4 min-w-0">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 flex items-center gap-2">
              <CreditCard className="w-7 h-7 text-indigo-600" />
              <span>Quản Lý Công Nợ Doanh Nghiệp</span>
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-1">
              Theo dõi chi tiết phải thu khách hàng và phải trả nhà xe theo dữ liệu chuẩn hóa tháng 1/2026
            </p>
          </div>

          {/* Tab Selector */}
          <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-xl w-full border border-slate-200">
            <button
              onClick={() => { setActiveTab('receivables'); setFilterStatus('ALL'); }}
              className={`flex-1 sm:flex-none flex items-center justify-center gap-2 py-2 px-4 rounded-lg text-sm font-semibold transition-all cursor-pointer ${
                activeTab === 'receivables'
                  ? 'bg-white text-indigo-700 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Building2 className="w-4 h-4" />
              <span>Phải Thu Khách Hàng ({normalizedCustomers.length})</span>
            </button>
            <button
              onClick={() => { setActiveTab('payables'); setFilterStatus('ALL'); }}
              className={`flex-1 sm:flex-none flex items-center justify-center gap-2 py-2 px-4 rounded-lg text-sm font-semibold transition-all cursor-pointer ${
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

        {/* Chú thích nguyên tắc nghiệp vụ xác nhận */}
        <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg flex items-start gap-2 text-xs sm:text-sm text-blue-900">
          <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold">Chuẩn đối soát công nợ đã xác nhận:</span> Cước đã bao gồm VAT. 
            Khoản ghi chú <span className="font-semibold text-amber-900 bg-amber-100 px-1 py-0.5 rounded">ĐỐI TRỪ XONG</span> (như hàng 22 VẠN ĐẠT THÁI BÌNH 3.600.000 đ) giảm công nợ nhưng không tính vào tiền mặt thực thu. 
            Ký hiệu <span className="font-semibold text-emerald-800 bg-emerald-100 px-1 py-0.5 rounded">X</span> biểu thị đã thanh toán sau thời gian; <span className="font-semibold text-blue-800 bg-blue-100 px-1 py-0.5 rounded">TƯƠI</span> biểu thị thanh toán ngay sau giao dịch.
          </div>
        </div>
      </div>

      {/* 2. Nội dung Tab Phải Thu Khách Hàng */}
      {activeTab === 'receivables' && (
        <div className="space-y-6">
          {/* Thẻ chỉ số tổng hợp Phải thu */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <div className="bg-white p-4 sm:p-5 rounded-xl border border-slate-200 shadow-sm">
              <span className="text-xs sm:text-sm font-medium text-slate-500">Tổng Cước Phải Thu (Có VAT)</span>
              <p className="text-lg sm:text-2xl font-bold text-slate-900 mt-1 font-mono whitespace-nowrap">
                {formatVnd(recSummary.total_receivable)}
              </p>
              <span className="text-xs text-slate-400 mt-1 block">{recSummary.count_customers} khách hàng (Bảng kê tháng 1)</span>
            </div>

            <div className="bg-white p-4 sm:p-5 rounded-xl border border-emerald-200 shadow-sm bg-emerald-50/20">
              <span className="text-xs sm:text-sm font-medium text-emerald-700">Đã Thu Thực Tế</span>
              <p className="text-lg sm:text-2xl font-bold text-emerald-700 mt-1 font-mono whitespace-nowrap">
                {formatVnd(recSummary.total_received)}
              </p>
              <span className="text-xs text-emerald-600 mt-1 block">Tiền tươi hoặc đã thanh toán (X)</span>
            </div>

            <div className="bg-white p-4 sm:p-5 rounded-xl border border-amber-200 shadow-sm bg-amber-50/20">
              <span className="text-xs sm:text-sm font-medium text-amber-700">Đã Đối Trừ / Cấn Trừ</span>
              <p className="text-lg sm:text-2xl font-bold text-amber-700 mt-1 font-mono whitespace-nowrap">
                {formatVnd(recSummary.total_offset)}
              </p>
              <span className="text-xs text-amber-600 mt-1 block">Cấn trừ cước (không tăng tiền thu)</span>
            </div>

            <div className="bg-white p-4 sm:p-5 rounded-xl border border-rose-200 shadow-sm bg-rose-50/20">
              <span className="text-xs sm:text-sm font-medium text-rose-700">Còn Phải Thu (Nợ Kỳ Này)</span>
              <p className="text-lg sm:text-2xl font-bold text-rose-700 mt-1 font-mono whitespace-nowrap">
                {formatVnd(recSummary.total_remaining)}
              </p>
              <span className="text-xs text-rose-600 mt-1 block">Chờ khách thanh toán chuyển kỳ</span>
            </div>
          </div>

          {/* Thông tin đối soát khoản đối trừ P22 (VẠN ĐẠT THÁI BÌNH) */}
          <div className="bg-amber-50/60 rounded-xl border border-amber-200 p-4 sm:p-5">
            <h3 className="text-sm sm:text-base font-bold text-amber-900 flex items-center gap-2 mb-2">
              <FileText className="w-5 h-5 text-amber-700" />
              <span>Khoản Cấn Trừ Đối Trừ Thực Tế Kỳ Này (Dòng 22 Excel Tháng 1)</span>
            </h3>
            <div className="bg-white p-3.5 rounded-lg border border-amber-200 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-800 text-sm">VẠN ĐẠT THÁI BÌNH</span>
                  <span className="text-xs bg-amber-100 text-amber-800 font-semibold px-2 py-0.5 rounded-full">
                    ĐỐI TRỪ XONG
                  </span>
                  <span className="text-xs text-slate-400">Cuốc T1-2026-022 • Dòng #22</span>
                </div>
                <p className="text-xs text-slate-600 mt-1">
                  Tuyến: TRẢ KẺ SẶT-HD • Container: EMCU8435007 • Cước ghi nhận: 3.600.000 đ cấn trừ giảm công nợ, không tạo dòng tiền thực thu.
                </p>
              </div>
              <div className="text-left sm:text-right">
                <span className="text-base font-bold text-amber-900 block font-mono">{formatVnd(3600000)}</span>
                <span className="text-xs text-emerald-700 font-medium">Đã tất toán đối trừ</span>
              </div>
            </div>
          </div>

          {/* Thanh công cụ tìm kiếm và lọc */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
            <div className="relative flex-1">
              <Search className="w-5 h-5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Tìm tên khách hàng (VD: VSC, QUANG HÀ, ĐỨC LUẬN...)"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>

            <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
              <button
                onClick={() => setFilterStatus('ALL')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                  filterStatus === 'ALL'
                    ? 'bg-slate-800 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Tất cả ({normalizedCustomers.length})
              </button>
              <button
                onClick={() => setFilterStatus('UNPAID')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                  filterStatus === 'UNPAID'
                    ? 'bg-rose-600 text-white'
                    : 'bg-rose-50 text-rose-700 hover:bg-rose-100'
                }`}
              >
                Còn nợ ({normalizedCustomers.filter(c => c.total_remaining > 0).length})
              </button>
              <button
                onClick={() => setFilterStatus('PAID')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                  filterStatus === 'PAID'
                    ? 'bg-emerald-600 text-white'
                    : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                }`}
              >
                Đã thanh toán ({normalizedCustomers.filter(c => c.total_remaining === 0).length})
              </button>
              <button
                onClick={() => setFilterStatus('OFFSET')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                  filterStatus === 'OFFSET'
                    ? 'bg-amber-600 text-white'
                    : 'bg-amber-50 text-amber-700 hover:bg-amber-100'
                }`}
              >
                Có đối trừ / đặc biệt
              </button>
            </div>
          </div>

          {/* Danh sách khách hàng dạng Card/Accordion */}
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
                      {/* Tiêu đề dòng khách hàng */}
                      <div 
                        onClick={() => setExpandedCustomer(isExpanded ? null : customer.name)}
                        className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer"
                      >
                        <div className="flex items-start sm:items-center gap-3">
                          <div className={`w-10 h-10 rounded-lg flex items-center justify-center font-bold text-sm flex-shrink-0 ${
                            customer.total_remaining > 0 
                              ? 'bg-rose-100 text-rose-700' 
                              : 'bg-emerald-100 text-emerald-700'
                          }`}>
                            {customer.name.substring(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <h4 className="font-bold text-slate-900 text-base">{customer.name}</h4>
                              {customer.has_special_item && (
                                <span className="text-[11px] bg-amber-100 text-amber-800 font-semibold px-2 py-0.5 rounded-full">
                                  Khoản ngoài cuốc
                                </span>
                              )}
                              {customer.total_offset > 0 && (
                                <span className="text-[11px] bg-purple-100 text-purple-800 font-semibold px-2 py-0.5 rounded-full">
                                  Có đối trừ
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-2">
                              <span>{customer.trip_count} cuốc xe</span>
                              <span>•</span>
                              <span>Gồm {customer.trips.length} dòng kê</span>
                            </div>
                          </div>
                        </div>

                        {/* Số tiền tóm tắt */}
                        <div className="flex items-center justify-between sm:justify-end gap-4 border-t sm:border-t-0 pt-2 sm:pt-0">
                          <div className="text-left sm:text-right">
                            <span className="text-xs text-slate-400 block">Tổng cước</span>
                            <span className="text-sm font-semibold text-slate-800">
                              {formatVnd(customer.total_receivable)}
                            </span>
                          </div>

                          {customer.total_offset > 0 && (
                            <div className="text-left sm:text-right hidden sm:block">
                              <span className="text-xs text-amber-600 block">Đối trừ</span>
                              <span className="text-sm font-semibold text-amber-700">
                                {formatVnd(customer.total_offset)}
                              </span>
                            </div>
                          )}

                          <div className="text-left sm:text-right">
                            <span className="text-xs text-slate-400 block">Đã thanh toán</span>
                            <span className="text-sm font-semibold text-emerald-600">
                              {formatVnd(customer.total_received)}
                            </span>
                          </div>

                          <div className="text-right min-w-[120px]">
                            <span className="text-xs text-slate-400 block">Còn nợ</span>
                            <span className={`text-base font-bold ${customer.total_remaining > 0 ? 'text-rose-600' : 'text-slate-400'}`}>
                              {customer.total_remaining > 0 ? formatVnd(customer.total_remaining) : '0 đ (Hết nợ)'}
                            </span>
                          </div>

                          <div className="text-slate-400 pl-2">
                            {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                          </div>
                        </div>
                      </div>

                      {/* Chi tiết từng cuốc / khoản khi bấm mở rộng */}
                      {isExpanded && (
                        <div className="bg-slate-50 border-t border-slate-200 p-4 sm:p-5">
                          <h5 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">
                            Chi tiết các cuốc và khoản mục của {customer.name}
                          </h5>
                          
                          <div className="overflow-x-auto">
                            <table className="w-full text-left text-xs sm:text-sm">
                              <thead>
                                <tr className="border-b border-slate-200 text-slate-500 font-semibold">
                                  <th className="pb-2">Mã cuốc</th>
                                  <th className="pb-2">Ngày</th>
                                  <th className="pb-2">Tuyến đường</th>
                                  <th className="pb-2">Container</th>
                                  <th className="pb-2 text-right">Cước vào</th>
                                  <th className="pb-2 text-center">Trạng thái thanh toán</th>
                                  <th className="pb-2 text-right">Còn nợ</th>
                                  <th className="pb-2">Ghi chú</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-200/60">
                                {customer.trips.map((t, tIdx) => {
                                  const isOffset = t.is_offset;
                                  const isPaid = t.is_paid || isOffset;
                                  return (
                                    <tr key={tIdx} className="hover:bg-slate-100/50">
                                      <td className="py-2.5 font-mono text-slate-400">#{t.id || tIdx + 1}</td>
                                      <td className="py-2.5 text-slate-700">{t.trip_date || t.raw_date}</td>
                                      <td className="py-2.5 font-medium text-slate-800">{t.route_name || t.tuyen_duong || 'Khoản ngoài cuốc'}</td>
                                      <td className="py-2.5 font-mono text-slate-600">{t.container_number || '-'}</td>
                                      <td className="py-2.5 text-right font-bold text-slate-900">
                                        {formatVnd(t.cuoc_vao)}
                                      </td>
                                      <td className="py-2.5 text-center">
                                        {isOffset ? (
                                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800">
                                            <ArrowLeftRight className="w-3.5 h-3.5" />
                                            ĐỐI TRỪ XONG
                                          </span>
                                        ) : isPaid ? (
                                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
                                            <CheckCircle2 className="w-3.5 h-3.5" />
                                            {t.payment_timing_q === 'TƯƠI' ? 'TƯƠI (Đã thu)' : 'Đã trả (X)'}
                                          </span>
                                        ) : (
                                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-rose-100 text-rose-800">
                                            Chưa thanh toán
                                          </span>
                                        )}
                                      </td>
                                      <td className="py-2.5 text-right font-bold">
                                        {isPaid ? (
                                          <span className="text-slate-400">0 đ</span>
                                        ) : (
                                          <span className="text-rose-600">{formatVnd(t.balance || t.cuoc_vao)}</span>
                                        )}
                                      </td>
                                      <td className="py-2.5 text-slate-500 text-xs italic">
                                        {t.notes || t.payment_status_p || '-'}
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

      {/* 3. Nội dung Tab Phải Trả Nhà Xe */}
      {activeTab === 'payables' && (
        <div className="space-y-6">
          {/* Thẻ chỉ số tổng hợp Phải trả */}
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

          {/* Thanh công cụ tìm kiếm và lọc */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
            <div className="relative flex-1">
              <Search className="w-5 h-5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Tìm tên nhà xe ngoài (VD: HÀ PHƯƠNG, SAO VIỆT, ĐỨC NAM...)"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>

            <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
              <button
                onClick={() => setFilterStatus('ALL')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                  filterStatus === 'ALL'
                    ? 'bg-slate-800 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Tất cả ({normalizedSubcontractors.length})
              </button>
              <button
                onClick={() => setFilterStatus('UNPAID')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                  filterStatus === 'UNPAID'
                    ? 'bg-rose-600 text-white'
                    : 'bg-rose-50 text-rose-700 hover:bg-rose-100'
                }`}
              >
                Còn nợ ({normalizedSubcontractors.filter(s => s.total_remaining > 0).length})
              </button>
              <button
                onClick={() => setFilterStatus('PAID')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                  filterStatus === 'PAID'
                    ? 'bg-emerald-600 text-white'
                    : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                }`}
              >
                Đã trả hết ({normalizedSubcontractors.filter(s => s.total_remaining === 0).length})
              </button>
            </div>
          </div>

          {/* Danh sách nhà xe ngoài */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="divide-y divide-slate-200">
              {filteredSubcontractors.length === 0 ? (
                <div className="p-8 text-center text-slate-500">
                  Không tìm thấy nhà xe phù hợp với điều kiện tìm kiếm.
                </div>
              ) : (
                filteredSubcontractors.map((subcontractor) => {
                  const isExpanded = expandedSubcontractor === subcontractor.name;
                  return (
                    <div key={subcontractor.name} className="transition-colors hover:bg-slate-50/50">
                      {/* Tiêu đề dòng nhà xe */}
                      <div 
                        onClick={() => setExpandedSubcontractor(isExpanded ? null : subcontractor.name)}
                        className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer"
                      >
                        <div className="flex items-start sm:items-center gap-3">
                          <div className={`w-10 h-10 rounded-lg flex items-center justify-center font-bold text-sm flex-shrink-0 ${
                            subcontractor.total_remaining > 0 
                              ? 'bg-amber-100 text-amber-800' 
                              : 'bg-emerald-100 text-emerald-700'
                          }`}>
                            <Truck className="w-5 h-5" />
                          </div>
                          <div>
                            <h4 className="font-bold text-slate-900 text-base">{subcontractor.name}</h4>
                            <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-2">
                              <span>{subcontractor.trip_count} cuốc chạy hộ</span>
                              <span>•</span>
                              <span>Đối tác thuê ngoài</span>
                            </div>
                          </div>
                        </div>

                        {/* Số tiền tóm tắt */}
                        <div className="flex items-center justify-between sm:justify-end gap-4 border-t sm:border-t-0 pt-2 sm:pt-0">
                          <div className="text-left sm:text-right">
                            <span className="text-xs text-slate-400 block">Tổng cước ra</span>
                            <span className="text-sm font-semibold text-slate-800">
                              {formatVnd(subcontractor.total_payable)}
                            </span>
                          </div>

                          <div className="text-left sm:text-right">
                            <span className="text-xs text-slate-400 block">Đã thanh toán</span>
                            <span className="text-sm font-semibold text-emerald-600">
                              {formatVnd(subcontractor.total_paid)}
                            </span>
                          </div>

                          <div className="text-right min-w-[120px]">
                            <span className="text-xs text-slate-400 block">Còn phải trả</span>
                            <span className={`text-base font-bold ${subcontractor.total_remaining > 0 ? 'text-rose-600' : 'text-slate-400'}`}>
                              {subcontractor.total_remaining > 0 ? formatVnd(subcontractor.total_remaining) : '0 đ (Đã hết)'}
                            </span>
                          </div>

                          <div className="text-slate-400 pl-2">
                            {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                          </div>
                        </div>
                      </div>

                      {/* Chi tiết từng cuốc xe thuê ngoài */}
                      {isExpanded && (
                        <div className="bg-slate-50 border-t border-slate-200 p-4 sm:p-5">
                          <h5 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">
                            Chi tiết các cuốc xe chạy hộ bởi {subcontractor.name}
                          </h5>
                          
                          <div className="overflow-x-auto">
                            <table className="w-full text-left text-xs sm:text-sm">
                              <thead>
                                <tr className="border-b border-slate-200 text-slate-500 font-semibold">
                                  <th className="pb-2">Mã cuốc</th>
                                  <th className="pb-2">Ngày</th>
                                  <th className="pb-2">Tuyến đường</th>
                                  <th className="pb-2 text-right">Cước ra (Phải trả)</th>
                                  <th className="pb-2 text-center">Trạng thái trả</th>
                                  <th className="pb-2 text-right">Còn nợ lại</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-200/60">
                                {subcontractor.trips.map((t, tIdx) => {
                                  return (
                                    <tr key={tIdx} className="hover:bg-slate-100/50">
                                      <td className="py-2.5 font-mono text-slate-400">#{t.id || tIdx + 1}</td>
                                      <td className="py-2.5 text-slate-700">{t.trip_date || t.raw_date}</td>
                                      <td className="py-2.5 font-medium text-slate-800">{t.route_name || t.tuyen_duong || 'Tuyến vận chuyển'}</td>
                                      <td className="py-2.5 text-right font-bold text-slate-900">
                                        {formatVnd(t.cuoc_ra)}
                                      </td>
                                      <td className="py-2.5 text-center">
                                        {t.is_paid ? (
                                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
                                            <CheckCircle2 className="w-3.5 h-3.5" />
                                            Đã trả (X)
                                          </span>
                                        ) : (
                                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-rose-100 text-rose-800">
                                            Chưa trả
                                          </span>
                                        )}
                                      </td>
                                      <td className="py-2.5 text-right font-bold">
                                        {t.is_paid ? (
                                          <span className="text-slate-400">0 đ</span>
                                        ) : (
                                          <span className="text-rose-600">{formatVnd(t.balance || t.cuoc_ra)}</span>
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
    </div>
  );
}
