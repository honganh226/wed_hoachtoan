import React, { useState, useEffect, useMemo } from 'react';
import { 
  BookOpen, 
  Search, 
  HelpCircle, 
  CheckCircle2, 
  ShieldCheck, 
  Layers, 
  Truck, 
  Coins, 
  FileText, 
  Copy, 
  Check, 
  ExternalLink, 
  ChevronRight, 
  Info, 
  ArrowRight,
  Sparkles,
  Bookmark,
  Calendar,
  Lock,
  Camera,
  Activity,
  Award
} from 'lucide-react';
import { fetchHandbookApi } from '../services/api.js';

export default function HelpCenterPage({ currentUser }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('all'); // 'all' | 'glossary' | 'sop' | 'rbac' | 'faq'
  const [copiedId, setCopiedId] = useState(null);

  useEffect(() => {
    loadHandbook();
  }, []);

  const loadHandbook = async () => {
    try {
      setLoading(true);
      setErr(null);
      const res = await fetchHandbookApi();
      if (res.success && res.data) {
        setData(res.data);
      } else {
        setErr(res.error || 'Không thể tải cẩm nang hướng dẫn');
      }
    } catch (e) {
      setErr(e.message || 'Lỗi kết nối máy chủ');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text, id) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Lọc từ điển theo tìm kiếm
  const filteredGlossary = useMemo(() => {
    if (!data?.glossary) return [];
    if (!searchQuery.trim()) return data.glossary;
    const q = searchQuery.toLowerCase().trim();
    return data.glossary.filter(item => 
      item.term?.toLowerCase().includes(q) ||
      item.name?.toLowerCase().includes(q) ||
      item.shortDesc?.toLowerCase().includes(q) ||
      item.fullDesc?.toLowerCase().includes(q) ||
      item.example?.toLowerCase().includes(q) ||
      item.badge?.toLowerCase().includes(q)
    );
  }, [data?.glossary, searchQuery]);

  // Lọc SOP theo tìm kiếm
  const filteredSop = useMemo(() => {
    if (!data?.sopSteps) return [];
    if (!searchQuery.trim()) return data.sopSteps;
    const q = searchQuery.toLowerCase().trim();
    return data.sopSteps.filter(item => 
      item.title?.toLowerCase().includes(q) ||
      item.shortDesc?.toLowerCase().includes(q) ||
      item.role?.toLowerCase().includes(q) ||
      item.details?.some(d => d.toLowerCase().includes(q))
    );
  }, [data?.sopSteps, searchQuery]);

  // Lọc RBAC theo tìm kiếm
  const filteredRbac = useMemo(() => {
    if (!data?.rbacMatrix) return [];
    if (!searchQuery.trim()) return data.rbacMatrix;
    const q = searchQuery.toLowerCase().trim();
    return data.rbacMatrix.filter(item => 
      item.roleName?.toLowerCase().includes(q) ||
      item.scope?.toLowerCase().includes(q) ||
      item.account?.toLowerCase().includes(q) ||
      item.permissions?.some(p => p.toLowerCase().includes(q))
    );
  }, [data?.rbacMatrix, searchQuery]);

  // Lọc FAQ theo tìm kiếm
  const filteredFaq = useMemo(() => {
    if (!data?.faqList) return [];
    if (!searchQuery.trim()) return data.faqList;
    const q = searchQuery.toLowerCase().trim();
    return data.faqList.filter(item => 
      item.q?.toLowerCase().includes(q) ||
      item.a?.toLowerCase().includes(q)
    );
  }, [data?.faqList, searchQuery]);

  const totalResults = filteredGlossary.length + filteredSop.length + filteredRbac.length + filteredFaq.length;

  return (
    <div className="space-y-6 animate-fadeIn pb-12">
      {/* Hero Header */}
      <div className="bg-white text-slate-900 rounded-2xl p-6 sm:p-7 border border-slate-200 shadow-xs relative overflow-hidden">
        <div className="relative z-10 max-w-3xl space-y-3">
          <div className="inline-flex items-center space-x-2 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">
            <BookOpen className="w-3.5 h-3.5 text-slate-600" />
            <span>CẨM NANG HƯỚNG DẪN & TỪ ĐIỂN KÝ HIỆU VẬN TẢI</span>
          </div>

          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
            Tra Cứu Nghiệp Vụ & Quy Chuẩn Vận Tải
          </h2>

          <p className="text-xs text-slate-500 leading-relaxed">
            Hệ thống hóa toàn bộ ký hiệu nội bộ (<span className="text-slate-800 font-bold">[V]</span>/<span className="text-slate-800 font-bold">[NV]</span>, Cont Kẹp 2x20', EIR, ISO 6346), 
            Quy trình tác nghiệp 7 bước chuẩn SOP, Ma trận phân quyền 4 vai trò và Báo cáo P&L Real-time.
          </p>

          {/* Search Box */}
          <div className="relative max-w-xl pt-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-4" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm kiếm ký hiệu, số cont, quy trình, VAT, phơi EIR, lương, KPI..."
              className="w-full pl-10 pr-9 py-2.5 rounded-xl bg-slate-50 hover:bg-slate-100/70 focus:bg-white text-slate-900 placeholder:text-slate-400 border border-slate-200 focus:border-slate-400 focus:outline-none text-xs transition-all shadow-xs"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3.5 top-4 text-slate-400 hover:text-slate-700"
              >
                ✕
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Navigation Filter Tabs */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-200 pb-3">
        <button
          onClick={() => setActiveTab('all')}
          className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center space-x-1.5 ${
            activeTab === 'all'
              ? 'bg-slate-900 text-white shadow-xs'
              : 'bg-slate-100 text-slate-600 hover:text-slate-900 hover:bg-slate-200/70'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>Tất Cả ({totalResults})</span>
        </button>

        <button
          onClick={() => setActiveTab('glossary')}
          className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center space-x-1.5 ${
            activeTab === 'glossary'
              ? 'bg-slate-900 text-white shadow-xs'
              : 'bg-slate-100 text-slate-600 hover:text-slate-900 hover:bg-slate-200/70'
          }`}
        >
          <Bookmark className="w-3.5 h-3.5" />
          <span>Từ Điển Ký Hiệu ({filteredGlossary.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('sop')}
          className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center space-x-1.5 ${
            activeTab === 'sop'
              ? 'bg-slate-900 text-white shadow-xs'
              : 'bg-slate-100 text-slate-600 hover:text-slate-900 hover:bg-slate-200/70'
          }`}
        >
          <Activity className="w-3.5 h-3.5" />
          <span>Quy Trình SOP ({filteredSop.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('rbac')}
          className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center space-x-1.5 ${
            activeTab === 'rbac'
              ? 'bg-slate-900 text-white shadow-xs'
              : 'bg-slate-100 text-slate-600 hover:text-slate-900 hover:bg-slate-200/70'
          }`}
        >
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>Phân Quyền 4 Vai Trò ({filteredRbac.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('faq')}
          className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center space-x-1.5 ${
            activeTab === 'faq'
              ? 'bg-slate-900 text-white shadow-xs'
              : 'bg-slate-100 text-slate-600 hover:text-slate-900 hover:bg-slate-200/70'
          }`}
        >
          <HelpCircle className="w-3.5 h-3.5" />
          <span>Hỏi Đáp FAQ ({filteredFaq.length})</span>
        </button>

        {searchQuery && (
          <span className="text-xs text-slate-500 ml-auto flex items-center space-x-1">
            <span>Tìm kiếm:</span>
            <span className="font-bold text-slate-800">"{searchQuery}"</span>
            <span className="text-indigo-600 font-semibold">({totalResults} kết quả)</span>
          </span>
        )}
      </div>

      {/* PHẦN 1: TỪ ĐIỂN KÝ HIỆU & THUẬT NGỮ */}
      {(activeTab === 'all' || activeTab === 'glossary') && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 rounded-xl bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-600 font-bold">
                <Bookmark className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Từ Điển Ký Hiệu Nội Bộ & Thuật Ngữ Vận Tải
                </h3>
                <p className="text-xs text-slate-500">
                  Giải nghĩa chuẩn xác các ký hiệu mã hóa, công thức tài chính và thuật ngữ nghiệp vụ
                </p>
              </div>
            </div>
            <span className="text-xs font-bold text-slate-400 bg-slate-100 px-2.5 py-1 rounded-lg">
              {filteredGlossary.length} thuật ngữ
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredGlossary.map((item) => (
              <div
                key={item.id}
                className="bg-white rounded-2xl p-5 border border-slate-200 hover:border-indigo-300 shadow-xs hover:shadow-md transition-all flex flex-col justify-between space-y-3"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center space-x-2.5">
                      <span className="px-2.5 py-1 rounded-xl bg-indigo-50 text-indigo-700 font-mono font-black text-sm border border-indigo-200 shadow-xs">
                        {item.term}
                      </span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600">
                        {item.badge}
                      </span>
                    </div>

                    <button
                      onClick={() => copyToClipboard(item.term, item.id)}
                      className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-slate-100 rounded-lg transition-colors"
                      title="Sao chép ký hiệu"
                    >
                      {copiedId === item.id ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>

                  <h4 className="font-bold text-slate-900 text-sm mt-2.5">
                    {item.name}
                  </h4>
                  <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                    {item.fullDesc}
                  </p>
                </div>

                <div className="space-y-2 pt-2 border-t border-slate-100 text-xs">
                  {item.formula && (
                    <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80 font-mono text-[11px] text-slate-700">
                      <span className="font-bold text-indigo-700 font-sans block text-[10px] uppercase tracking-wider mb-0.5">
                        📐 Công Thức Tính:
                      </span>
                      {item.formula}
                    </div>
                  )}

                  {item.example && (
                    <div className="p-2.5 rounded-xl bg-amber-50/70 border border-amber-200/80 text-[11px] text-amber-900">
                      <span className="font-bold text-amber-800 block text-[10px] uppercase tracking-wider mb-0.5">
                        💡 Ví Dụ Thực Tế:
                      </span>
                      {item.example}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* PHẦN 2: QUY TRÌNH CHUẨN 7 BƯỚC (SOP) */}
      {(activeTab === 'all' || activeTab === 'sop') && (
        <div className="space-y-4 pt-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600 font-bold">
                <Activity className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Quy Trình Tác Nghiệp Chuẩn 7 Bước (SOP)
                </h3>
                <p className="text-xs text-slate-500">
                  Vòng đời khép kín từ tiếp nhận đơn hàng, tạm ứng, điều xe, nộp phơi đến thu tiền công nợ
                </p>
              </div>
            </div>
            <span className="text-xs font-bold text-slate-400 bg-slate-100 px-2.5 py-1 rounded-lg">
              {filteredSop.length} bước
            </span>
          </div>

          <div className="space-y-3">
            {filteredSop.map((step) => (
              <div
                key={step.step}
                className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs hover:border-blue-300 transition-all"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
                  <div className="flex items-center space-x-3">
                    <span className="w-8 h-8 rounded-xl bg-blue-600 text-white font-black text-sm flex items-center justify-center shadow-sm">
                      {step.step}
                    </span>
                    <div>
                      <h4 className="font-bold text-slate-900 text-sm">
                        {step.title}
                      </h4>
                      <span className="text-xs text-slate-500">
                        {step.shortDesc}
                      </span>
                    </div>
                  </div>

                  <span className="px-3 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200 w-fit">
                    Phụ trách: {step.role}
                  </span>
                </div>

                <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                  {step.details?.map((detail, dIdx) => (
                    <div key={dIdx} className="flex items-start space-x-2 text-slate-700 p-2 rounded-xl bg-slate-50">
                      <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                      <span className="leading-relaxed">{detail}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* PHẦN 3: MA TRẬN PHÂN QUYỀN 4 VAI TRÒ (RBAC) */}
      {(activeTab === 'all' || activeTab === 'rbac') && (
        <div className="space-y-4 pt-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 rounded-xl bg-purple-50 border border-purple-200 flex items-center justify-center text-purple-600 font-bold">
                <ShieldCheck className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Ma Trận Phân Quyền 4 Cấp Bậc (RBAC Security)
                </h3>
                <p className="text-xs text-slate-500">
                  Phân định ranh giới dữ liệu bảo mật và tài khoản kiểm thử tương ứng
                </p>
              </div>
            </div>
            <span className="text-xs font-bold text-slate-400 bg-slate-100 px-2.5 py-1 rounded-lg">
              4 vai trò
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredRbac.map((rbac) => (
              <div
                key={rbac.roleKey}
                className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs flex flex-col justify-between space-y-4"
              >
                <div>
                  <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                    <h4 className="font-extrabold text-slate-900 text-sm">
                      {rbac.roleName}
                    </h4>
                    <span className="px-2.5 py-1 rounded-lg text-xs font-mono font-bold bg-slate-100 text-slate-700">
                      {rbac.account}
                    </span>
                  </div>

                  <div className="mt-3">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                      Phạm vi dữ liệu:
                    </span>
                    <p className="text-xs font-semibold text-slate-700 bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                      {rbac.scope}
                    </p>
                  </div>

                  <div className="mt-3 space-y-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                      Quyền hạn & Ranh giới:
                    </span>
                    {rbac.permissions?.map((perm, pIdx) => (
                      <div key={pIdx} className="text-xs text-slate-600 flex items-start space-x-2">
                        <span className="text-indigo-500 font-bold">•</span>
                        <span className="leading-snug">{perm}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* PHẦN 4: HỎI ĐÁP THƯỜNG GẶP (FAQ) */}
      {(activeTab === 'all' || activeTab === 'faq') && (
        <div className="space-y-4 pt-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600 font-bold">
                <HelpCircle className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Câu Hỏi Thường Gặp (FAQ)
                </h3>
                <p className="text-xs text-slate-500">
                  Giải đáp các thắc mắc phổ biến về thao tác hệ thống, thuật toán và tài chính
                </p>
              </div>
            </div>
            <span className="text-xs font-bold text-slate-400 bg-slate-100 px-2.5 py-1 rounded-lg">
              {filteredFaq.length} câu hỏi
            </span>
          </div>

          <div className="grid grid-cols-1 gap-3">
            {filteredFaq.map((faq, fIdx) => (
              <div
                key={fIdx}
                className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs hover:border-emerald-300 transition-all space-y-2"
              >
                <div className="flex items-start space-x-2.5">
                  <div className="w-6 h-6 rounded-lg bg-emerald-100 text-emerald-800 font-black text-xs flex items-center justify-center shrink-0 mt-0.5">
                    Q
                  </div>
                  <h4 className="font-bold text-slate-900 text-sm leading-snug">
                    {faq.q}
                  </h4>
                </div>
                <div className="pl-8 text-xs text-slate-600 leading-relaxed border-l-2 border-emerald-200 ml-3 py-1">
                  {faq.a}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
