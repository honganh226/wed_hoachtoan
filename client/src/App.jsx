import React, { useState, useEffect } from 'react';
import { 
  Server, 
  Database, 
  ShieldCheck, 
  Download, 
  RefreshCw, 
  AlertTriangle, 
  CheckCircle2, 
  HardDrive,
  Truck,
  Users,
  Layers,
  KeyRound,
  FileSpreadsheet,
  Coins,
  MapPin,
  Calendar
} from 'lucide-react';
import { 
  fetchHealth, 
  fetchBackupStats, 
  fetchBackupList, 
  triggerBackup, 
  resetDatabase,
  fetchDataSummary,
  triggerSeed,
  fetchVehicles,
  fetchTrips,
  getStoredUser,
  setStoredUser,
  setAuthToken,
  fetchMeApi,
  logoutApi,
  loginApi,
  getBackupDownloadUrl
} from './services/api.js';
import LoginModal from './components/LoginModal.jsx';
import PeriodLockModal from './components/PeriodLockModal.jsx';
import TripCreateModal from './components/TripCreateModal.jsx';
import DataManagementView from './components/DataManagementView.jsx';
import BatchTripCreateModal from './components/BatchTripCreateModal.jsx';
import ExcelImportModal from './components/ExcelImportModal.jsx';
import AdvanceSettlementModal from './components/AdvanceSettlementModal.jsx';
import ExpenseEntryModal from './components/ExpenseEntryModal.jsx';
import EirPhotoModal from './components/EirPhotoModal.jsx';
import DirectorDashboard from './components/DirectorDashboard.jsx';
import TimeFilterPills from './components/TimeFilterPills.jsx';
import KpiAdjustTable from './components/KpiAdjustTable.jsx';
import BatchPaymentModal from './components/BatchPaymentModal.jsx';
import PayrollView from './components/PayrollView.jsx';
import DriverApp from './components/DriverApp.jsx';
import MaintenanceView from './components/MaintenanceView.jsx';
import AiChatBox from './components/AiChatBox.jsx';
import HelpCenterPage from './components/HelpCenterPage.jsx';
import AiDispatchModal from './components/AiDispatchModal.jsx';
import PwaOfflineBanner from './components/PwaOfflineBanner.jsx';
import OffsiteBackupCard from './components/OffsiteBackupCard.jsx';
import BusinessOverviewView from './components/BusinessOverviewView.jsx';
import DirectorAnalyticsView, { INITIAL_ANALYTICS_STATE } from './components/DirectorAnalyticsView.jsx';
import { INITIAL_EXECUTIVE_TASKS } from './data/mockBusinessData.js';
import DirectorTasksView from './components/DirectorTasksView.jsx';
import DirectorDebtsView from './components/DirectorDebtsView.jsx';
import { useRealtimePL } from './hooks/useRealtimePL.js';
import { 
  LogIn, 
  LogOut, 
  Crown, 
  Calculator, 
  ShieldAlert, 
  UserCheck, 
  Lock, 
  PlusCircle, 
  Copy, 
  Wallet, 
  Receipt, 
  Camera, 
  Clock, 
  Target, 
  Image as ImageIcon, 
  TrendingUp, 
  BarChart3, 
  CreditCard,
  BookOpen,
  Sparkles,
  MessageSquare,
  ChevronDown,
  Check,
  Menu,
  SlidersHorizontal,
  FolderOpen
} from 'lucide-react';

export default function App() {
  const [directorAnalyticsState, setDirectorAnalyticsState] = useState(INITIAL_ANALYTICS_STATE);
  const [directorTasks, setDirectorTasks] = useState(INITIAL_EXECUTIVE_TASKS);
  const [directorTaskDraft, setDirectorTaskDraft] = useState(null);
  const [health, setHealth] = useState(null);
  const [stats, setStats] = useState(null);
  const [backups, setBackups] = useState([]);
  const [dataSummary, setDataSummary] = useState(null);
  const [vehicles, setVehicles] = useState([]);
  const [sampleTrips, setSampleTrips] = useState([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState(null);
  const [err, setErr] = useState(null);
  const [currentUser, setCurrentUser] = useState(() => getStoredUser());
  // Phân quyền vai trò cốt lõi (Gồm Giám đốc, Kế toán, Thư ký, Quản lý khu, Lái xe)
  const isDirector = currentUser?.role === 'DIRECTOR';
  const isAccountant = currentUser?.role === 'ACCOUNTANT';
  const isSecretary = currentUser?.role === 'SECRETARY';
  const isAreaManager = currentUser?.role === 'AREA_MANAGER';
  const isDriver = currentUser?.role === 'DRIVER';
  const canViewPL = Boolean(currentUser && (isDirector || isAccountant));

  const [isLoginOpen, setIsLoginOpen] = useState(() => !getStoredUser());
  const [isPeriodLockOpen, setIsPeriodLockOpen] = useState(false);
  const [isTripCreateOpen, setIsTripCreateOpen] = useState(false);
  const [isBatchTripCreateOpen, setIsBatchTripCreateOpen] = useState(false);
  const [isExcelImportOpen, setIsExcelImportOpen] = useState(false);
  const [duplicateTargetTrip, setDuplicateTargetTrip] = useState(null);
  const [isAdvanceModalOpen, setIsAdvanceModalOpen] = useState(false);
  const [targetTripForAdvance, setTargetTripForAdvance] = useState(null);
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  const [targetTripForExpense, setTargetTripForExpense] = useState(null);
  const [isEirModalOpen, setIsEirModalOpen] = useState(false);
  const [targetTripForEir, setTargetTripForEir] = useState(null);
  const [isBatchPaymentOpen, setIsBatchPaymentOpen] = useState(false);
  const [batchPaymentCustomer, setBatchPaymentCustomer] = useState('');
  
  // Enterprise 4-Module Structure (Tối giản chuẩn doanh nghiệp lớn)
  const initialUrlTab = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('tab') : null;
  const [activeModule, setActiveModule] = useState(() => {
    if (initialUrlTab === 'debts') return 'debts';
    if (initialUrlTab === 'trips') return 'trips';
    return 'overview';
  });
  const [subView, setSubView] = useState(() => {
    if (initialUrlTab === 'debts') return 'debts';
    if (initialUrlTab === 'trips') return 'trips';
    return 'business_overview';
  });
  const [lastFleetView, setLastFleetView] = useState(null);
  const [lastSystemView, setLastSystemView] = useState('help');
  useEffect(() => {
    if (activeModule === 'fleet' && ['vehicles', 'kpi', 'payroll', 'driver_app'].includes(subView)) {
      setLastFleetView(subView);
    }
    if (activeModule === 'system' && ['help', 'backup'].includes(subView)) {
      setLastSystemView(subView);
    }
  }, [activeModule, subView]);
  const [isActionsMenuOpen, setIsActionsMenuOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);

  const [activeTab, setActiveTab] = useState(() => {
    if (initialUrlTab === 'debts') return 'debts';
    if (initialUrlTab === 'trips') return 'trips';
    return 'business_overview';
  }); // Mặc định hiển thị Bản mẫu Tổng quan Đợt 1
  const [isAiChatOpen, setIsAiChatOpen] = useState(false);
  const [assistantContext,setAssistantContext]=useState({});
  const [assistantFocus,setAssistantFocus]=useState(null);
  const [businessAssistantFocus,setBusinessAssistantFocus]=useState(null);
  const [debtAssistantFocus,setDebtAssistantFocus]=useState(null);
  const [isAiDispatchOpen, setIsAiDispatchOpen] = useState(false);

  // Task 4.3: State bộ lọc chu kỳ thời gian (dùng chung cho Dashboard P&L)
  // Mặc định: MTD (đầu tháng đến hôm nay)
  const [dateFilter, setDateFilter] = useState(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return {
      startDate: `${year}-${month}-01`,
      endDate: `${year}-${month}-${day}`,
      label: 'Tháng này (MTD)',
      type: 'mtd'
    };
  });

  // Hook lắng nghe Server-Sent Events (SSE) P&L Engine (Task 4.1 & Task 4.3)
  // Quản lý phiên tài khoản & chỉ kết nối SSE khi user có quyền (DIRECTOR / ACCOUNTANT)
  const { 
    data: plData, 
    loading: plLoading, 
    isConnected: isPlConnected, 
    lastEvent: plLastEvent, 
    eventCount: plEventCount, 
    lastPulseTime: plLastPulseTime,
    refresh: refreshPL, 
    triggerBroadcast: triggerPLBroadcast 
  } = useRealtimePL(dateFilter, currentUser);

  const loadData = async () => {
    try {
      setErr(null);
      const [hRes, sRes, lRes, sumRes, vRes, tRes, meRes] = await Promise.all([
        fetchHealth(),
        fetchBackupStats().catch(() => ({ success: false })),
        fetchBackupList().catch(() => ({ success: false })),
        fetchDataSummary().catch(() => ({ success: false })),
        fetchVehicles().catch(() => ({ success: false })),
        fetchTrips(50).catch(() => ({ success: false })),
        fetchMeApi().catch(() => ({ success: false }))
      ]);
      if (hRes.success) setHealth(hRes.data);
      if (sRes.success) setStats(sRes.data);
      if (lRes.success) setBackups(lRes.data.backups || []);
      if (sumRes.success) setDataSummary(sumRes.data);
      if (vRes.success) setVehicles(vRes.data || []);
      if (tRes.success) setSampleTrips(tRes.data || []);
      if (meRes.success && meRes.data?.user) {
        setCurrentUser(meRes.data.user);
        setStoredUser(meRes.data.user);
        setIsLoginOpen(false);
      }
    } catch (e) {
      setErr('Không thể kết nối tới Backend (Port 5000). Hãy đảm bảo server đang chạy.');
    }
  };

  const handleLogout = async () => {
    try {
      await logoutApi();
    } catch (e) {}
    setAuthToken(null);
    setStoredUser(null);
    setCurrentUser(null);
    setSampleTrips([]);
    setVehicles([]);
    setDataSummary(null);
    setStats(null);
    setBackups([]);
    setIsLoginOpen(true);
    setMsg('Đã đăng xuất khỏi hệ thống an toàn.');
  };

  const handleAssistantNavigate = target => {
    if (!target || !['trip','trips','vehicle','driver','customer','payables','group'].includes(target.kind)) return;
    const focus={...target,nonce:Date.now()+Math.random()};
    if (['customer','payables'].includes(target.kind)) {setDebtAssistantFocus(focus);setActiveModule('debts');setActiveTab('debts');}
    else if(target.kind==='trip'){setBusinessAssistantFocus(focus);setActiveModule('overview');setSubView('business_overview');setActiveTab('business_overview');}
    else {setAssistantFocus(focus);setActiveModule('manage');setActiveTab('manage');}
  };
  const handleNavigateTab = (tab) => {
    if (tab === 'analytics') {
      setActiveModule('analytics');
      setActiveTab('analytics');
    } else if (tab === 'tasks') {
      setActiveModule('tasks');
      setActiveTab('tasks');
    } else if (tab === 'debts') {
      setActiveModule('debts');
      setActiveTab('debts');
    } else if (tab === 'trips') {
      setActiveModule('trips');
      setActiveTab('trips');
    } else if (tab === 'overview' || tab === 'business_overview') {
      setActiveModule('overview');
      setSubView('business_overview');
      setActiveTab('business_overview');
    } else if (tab === 'kpi') {
      setActiveModule('fleet');
      setSubView('kpi');
      setActiveTab('kpi');
    } else if (tab === 'vehicles' || tab === 'maintenance') {
      setActiveModule('fleet');
      setSubView('vehicles');
      setActiveTab('maintenance');
    } else if (tab === 'payroll') {
      setActiveModule('fleet');
      setSubView('payroll');
      setActiveTab('payroll');
    } else {
      setActiveTab(tab);
    }
  };

  // Tự động điều chỉnh module & subView phù hợp với vai trò
  useEffect(() => {
    if (!currentUser) return;
    if (currentUser.role === 'DRIVER') {
      setActiveModule('fleet');
      setSubView('driver_app');
      setActiveTab('driver_app');
    } else if (currentUser.role === 'AREA_MANAGER') {
      // Quản lý khu không xem P&L, tự động điều hướng sang Chuyến xe
      if (activeModule === 'overview') {
        setActiveModule('trips');
        setActiveTab('trips');
      }
      if (activeModule === 'fleet' && subView !== 'vehicles') {
        setSubView('vehicles');
        setActiveTab('maintenance');
      }
      if (activeModule === 'system' && subView !== 'help') {
        setSubView('help');
        setActiveTab('help');
      }
    } else if (currentUser.role === 'SECRETARY') {
      if (activeModule === 'overview') {
        setActiveModule('debts');
        setActiveTab('debts');
      }
      if (activeModule === 'fleet' && subView !== 'vehicles') {
        setSubView('vehicles');
        setActiveTab('maintenance');
      }
      if (activeModule === 'system' && subView !== 'help') {
        setSubView('help');
        setActiveTab('help');
      }
    } else if (currentUser.role === 'ACCOUNTANT') {
      if (activeModule === 'fleet' && subView === 'driver_app') {
        setSubView('payroll');
        setActiveTab('payroll');
      }
    }
  }, [currentUser?.role]);

  const handleQuickSwitchRole = async (username, password) => {
    try {
      setLoading(true);
      setMsg(null);
      setErr(null);
      const res = await loginApi(username, password);
      if (res.success) {
        setAuthToken(res.data.token);
        setStoredUser(res.data.user);
        setCurrentUser(res.data.user);
        if (res.data.user.role === 'DRIVER') {
          setActiveModule('fleet');
          setSubView('driver_app');
          setActiveTab('driver_app');
        } else if (res.data.user.role === 'AREA_MANAGER') {
          setActiveModule('trips');
          setSubView('trips');
          setActiveTab('trips');
        } else {
          setActiveModule('overview');
          setSubView('business_overview');
          setActiveTab('business_overview');
        }
        setIsUserMenuOpen(false);
        setMsg(`Đã chuyển đổi sang: [${res.data.user.full_name}] - Vai trò [${res.data.user.role}]`);
        await loadData();
      } else {
        setErr(res.error || 'Đổi vai trò thất bại');
      }
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCreateBackup = async () => {
    if (currentUser?.role !== 'DIRECTOR') {
      setErr('⛔ Từ chối quyền truy cập (403): Thao tác sao lưu Database chỉ dành riêng cho Giám Đốc (DIRECTOR).');
      return;
    }
    try {
      setLoading(true);
      setMsg(null);
      setErr(null);
      const res = await triggerBackup();
      if (res.success) {
        setMsg(`Sao lưu thành công: ${res.data.filename} (${res.data.sizeMB} MB)`);
        await loadData();
      } else {
        setErr(res.error || 'Lỗi khi tạo backup');
      }
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleResetDb = async () => {
    if (currentUser?.role !== 'DIRECTOR') {
      setErr('⛔ Từ chối quyền truy cập (403): Thao tác Reset Database chỉ dành riêng cho Giám Đốc (DIRECTOR).');
      return;
    }
    const confirmation = window.prompt(
      '⚠️ CẢNH BÁO: Thao tác này sẽ xoá trắng toàn bộ dữ liệu bảng!\nNhập đúng câu sau để xác nhận:\nXAC_NHAN_XOA_TOAN_BO_DU_LIEU'
    );
    if (!confirmation) return;

    try {
      setLoading(true);
      setMsg(null);
      setErr(null);
      const res = await resetDatabase(confirmation);
      if (res.success) {
        setMsg(res.message);
        await loadData();
      } else {
        setErr(res.error || 'Reset database thất bại');
      }
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSeedFromExcel = async () => {
    if (currentUser?.role !== 'DIRECTOR') {
      setErr('⛔ Từ chối quyền truy cập (403): Thao tác nạp lại dữ liệu gốc từ Excel chỉ dành riêng cho Giám Đốc (DIRECTOR).');
      return;
    }
    try {
      setLoading(true);
      setMsg(null);
      setErr(null);
      const res = await triggerSeed();
      if (res.success) {
        setMsg('Đã nạp toàn bộ dữ liệu mẫu từ file 7.xlsx vào SQLite thành công!');
        await loadData();
      } else {
        setErr(res.error || 'Nạp dữ liệu thất bại');
      }
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  };

  // Định dạng số nguyên VND
  const formatVnd = (amount) => {
    return new Intl.NumberFormat('vi-VN').format(amount || 0) + ' ₫';
  };

  return (
    <div className="ha-app min-h-screen text-slate-800">
      {/* ============================================================
          ENTERPRISE MINIMALIST HEADER (CHUẨN DOANH NGHIỆP LỚN)
          ============================================================ */}
      <header className="ha-app-header sticky top-0 z-40">
        <div className="ha-header-inner">
          {/* Logo & Brand */}
          <div className="ha-brand flex items-center space-x-3">
            <div className="w-9 h-9 rounded-lg bg-slate-900 text-white flex items-center justify-center shadow-sm">
              <Truck className="w-5 h-5 text-slate-100" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-bold text-slate-900 text-sm tracking-tight">QUẢN LÝ VẬN TẢI</span>
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${
                  isDriver
                    ? 'bg-purple-50 text-purple-700 border-purple-200'
                    : isAreaManager
                    ? 'bg-blue-50 text-blue-700 border-blue-200'
                    : isAccountant
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : 'bg-slate-100 text-slate-600 border-slate-200'
                }`}>
                  {isDriver ? 'Lái xe' : isAreaManager ? `Quản lý khu (${currentUser?.area_id || 'Tuân'})` : isSecretary ? 'Thư ký' : isAccountant ? 'Kế toán' : 'Giám đốc'}
                </span>
              </div>
              <div className="text-[11px] text-slate-400 flex items-center space-x-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                <span>{isDriver ? 'Sẵn sàng nhận chuyến' : 'Hệ thống quản trị doanh nghiệp'}</span>
              </div>
            </div>
          </div>

          {/* Action Buttons & Profile Controls */}
          <div className="ha-header-actions">
            {/* Menu Dropdown Thao Tác Nghiệp Vụ Nhanh (ẨN ĐỐI VỚI LÁI XE) */}
            {!isDriver && (
              <div className="relative">
                <button
                  onClick={() => setIsActionsMenuOpen(!isActionsMenuOpen)}
                  className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-lg text-xs font-semibold shadow-xs transition-all"
                  title="Mở menu các thao tác nghiệp vụ"
                >
                  <SlidersHorizontal className="w-3.5 h-3.5 text-slate-500" />
                  <span className="hidden sm:inline">Tác nghiệp</span>
                  <ChevronDown className="w-3 h-3 text-slate-400" />
                </button>

                {isActionsMenuOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setIsActionsMenuOpen(false)}></div>
                    <div className="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-xl border border-slate-200 py-1.5 z-50 text-xs animate-fade-in">
                      <div className="px-3 py-1.5 text-[11px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">
                        Tác Nghiệp Vận Tải
                      </div>
                      <button
                        onClick={() => { setIsBatchTripCreateOpen(true); setIsActionsMenuOpen(false); }}
                        className="w-full text-left px-3 py-2 hover:bg-slate-50 flex items-center space-x-2 text-slate-700"
                      >
                        <Table className="w-4 h-4 text-indigo-600" />
                        <span>Nhập nhiều cuốc</span>
                      </button>
                      <button
                        onClick={() => { setIsExcelImportOpen(true); setIsActionsMenuOpen(false); }}
                        className="w-full text-left px-3 py-2 hover:bg-slate-50 flex items-center space-x-2 text-slate-700"
                      >
                        <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                        <span>Nhập bảng kê Excel</span>
                      </button>
                      <button
                        onClick={() => { setIsAiDispatchOpen(true); setIsActionsMenuOpen(false); }}
                        className="w-full text-left px-3 py-2 hover:bg-slate-50 flex items-center space-x-2 text-slate-700"
                      >
                        <Sparkles className="w-4 h-4 text-purple-600" />
                        <span>Gợi ý phân bổ xe</span>
                      </button>
                      <button
                        onClick={() => { setTargetTripForAdvance(null); setIsAdvanceModalOpen(true); setIsActionsMenuOpen(false); }}
                        className="w-full text-left px-3 py-2 hover:bg-slate-50 flex items-center space-x-2 text-slate-700"
                      >
                        <Wallet className="w-4 h-4 text-emerald-600" />
                        <span>Tạm Ứng & Hoàn Ứng Lái Xe</span>
                      </button>
                      <button
                        onClick={() => { setTargetTripForExpense(null); setIsExpenseModalOpen(true); setIsActionsMenuOpen(false); }}
                        className="w-full text-left px-3 py-2 hover:bg-slate-50 flex items-center space-x-2 text-slate-700"
                      >
                        <Receipt className="w-4 h-4 text-amber-600" />
                        <span>Chi Phí Thực Tế & Cảnh Báo</span>
                      </button>
                      <button
                        onClick={() => { setTargetTripForEir(null); setIsEirModalOpen(true); setIsActionsMenuOpen(false); }}
                        className="w-full text-left px-3 py-2 hover:bg-slate-50 flex items-center space-x-2 text-slate-700"
                      >
                        <Camera className="w-4 h-4 text-indigo-600" />
                        <span>Phiếu Phơi EIR Mobile</span>
                      </button>

                      {/* Phân hệ Khóa Sổ & Audit Log: Chỉ Giám Đốc và Kế Toán */}
                      {(isDirector || isAccountant) && (
                        <>
                          <div className="px-3 py-1.5 text-[11px] font-bold text-slate-400 uppercase tracking-wider border-t border-b border-slate-100 mt-1">
                            Kế Toán & Quản Trị
                          </div>
                          <button
                            onClick={() => { setIsPeriodLockOpen(true); setIsActionsMenuOpen(false); }}
                            className="w-full text-left px-3 py-2 hover:bg-slate-50 flex items-center space-x-2 text-slate-700"
                          >
                            <Lock className="w-4 h-4 text-slate-600" />
                            <span>Khóa sổ & lịch sử</span>
                          </button>
                        </>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Nút Tạo Chuyến Xe Mới (Chỉ hiển thị cho Quản lý khu, Kế toán, Giám đốc) */}
            {!isDriver && (
              <button
                onClick={() => {
                  setDuplicateTargetTrip(null);
                  setIsTripCreateOpen(true);
                }}
                className="inline-flex items-center space-x-1.5 px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold shadow-sm transition-all active:scale-95"
              >
                <PlusCircle className="w-3.5 h-3.5" />
                <span>Tạo chuyến</span>
              </button>
            )}

            {/* Nút Trợ Lý AI Chat */}
            <button
              onClick={() => setIsAiChatOpen(true)}
              className="inline-flex items-center space-x-1 px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-medium transition-all"
              title="Mở Trợ lý ảo AI nội bộ"
            >
              <MessageSquare size={16} />
              <span className="hidden md:inline">Trợ lý</span>
            </button>

            {/* User Profile & Role Switcher Popup */}
            <div className="relative">
              {currentUser ? (
                <button
                  onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                  className="flex items-center space-x-2 p-1 pl-2 pr-2.5 rounded-lg border border-slate-200 hover:bg-slate-50 transition-all text-left"
                >
                  <div className="w-6 h-6 rounded-full bg-slate-900 text-white font-bold text-[10px] flex items-center justify-center">
                    {currentUser.role === 'DIRECTOR' ? 'GĐ' : currentUser.role === 'ACCOUNTANT' ? 'KT' : currentUser.role === 'SECRETARY' ? 'TK' : currentUser.role === 'AREA_MANAGER' ? 'QL' : 'LX'}
                  </div>
                  <span className="text-xs font-semibold text-slate-800 hidden sm:inline max-w-[100px] truncate">
                    {currentUser.full_name}
                  </span>
                  <ChevronDown className="w-3 h-3 text-slate-400" />
                </button>
              ) : (
                <button
                  onClick={() => setIsLoginOpen(true)}
                  className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold shadow-sm transition-all"
                >
                  <LogIn className="w-3.5 h-3.5" />
                  <span>Đăng Nhập</span>
                </button>
              )}

              {/* Popover Đổi Vai Trò Gọn Gàng */}
              {isUserMenuOpen && currentUser && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setIsUserMenuOpen(false)}></div>
                  <div className="absolute right-0 mt-2 w-64 bg-white rounded-xl shadow-xl border border-slate-200 p-2 z-50 text-xs animate-fade-in">
                    <div className="px-2 py-2 border-b border-slate-100 mb-1">
                      <div className="font-bold text-slate-900">{currentUser.full_name}</div>
                      <div className="text-[11px] text-slate-500 flex items-center space-x-1">
                        <span>Vai trò:</span>
                        <strong className="text-slate-700">
                          {currentUser.role === 'DIRECTOR' && 'Giám đốc'}
                          {currentUser.role === 'ACCOUNTANT' && 'Kế toán'}
                          {currentUser.role === 'SECRETARY' && 'Thư ký'}
                          {currentUser.role === 'AREA_MANAGER' && `Quản lý khu (${currentUser.area_id || 'Tuân'})`}
                          {currentUser.role === 'DRIVER' && 'Lái xe'}
                        </strong>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <button
                        onClick={() => { setIsUserMenuOpen(false); setIsLoginOpen(true); }}
                        className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-slate-50 text-slate-700 flex items-center space-x-2 font-medium"
                      >
                        <UserCheck className="w-3.5 h-3.5 text-blue-600" />
                        <span>Đổi tài khoản đăng nhập</span>
                      </button>
                    </div>

                    <div className="border-t border-slate-100 mt-2 pt-1">
                      <button
                        onClick={() => { setIsUserMenuOpen(false); handleLogout(); }}
                        className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-rose-50 text-rose-600 flex items-center space-x-2 font-medium"
                      >
                        <LogOut className="w-3.5 h-3.5" />
                        <span>Đăng xuất</span>
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="ha-main space-y-5">
        {/* PWA Mobile Offline & Sync Banner (Chỉ hiện khi ngoại tuyến hoặc có hàng đợi chờ) */}
        <PwaOfflineBanner onDataSynced={loadData} />

        {/* Banner Alert Message */}
        {msg && (
          <div className="p-3.5 rounded-xl bg-slate-900 text-white flex items-center justify-between shadow-sm animate-fade-in text-xs">
            <div className="flex items-center space-x-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{msg}</span>
            </div>
            <button onClick={() => setMsg(null)} className="text-slate-400 hover:text-white">✕</button>
          </div>
        )}
        {err && (
          <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 flex items-center justify-between shadow-sm animate-fade-in text-xs">
            <div className="flex items-center space-x-2.5">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{err}</span>
            </div>
            <button onClick={() => setErr(null)} className="text-rose-500 hover:text-rose-800">✕</button>
          </div>
        )}

        {/* ============================================================
            NẾU CHƯA ĐĂNG NHẬP: HIỂN THỊ MÀN HÌNH BẢO MẬT YÊU CẦU ĐĂNG NHẬP
            ============================================================ */}
        {!currentUser ? (
          <div className="max-w-md mx-auto my-12 p-8 bg-white border border-slate-200 rounded-2xl shadow-xl text-center space-y-5 animate-fade-in">
            <div className="w-16 h-16 mx-auto bg-slate-900 text-white rounded-2xl flex items-center justify-center shadow-lg">
              <Lock className="w-8 h-8 text-amber-400" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900">Đăng nhập quản trị</h2>
              <p className="text-xs text-slate-500 mt-1">
                Bản trực tuyến dành cho Giám Đốc và Quản lý. Vui lòng đăng nhập để truy cập dữ liệu và báo cáo tài chính.
              </p>
            </div>
            <button
              onClick={() => setIsLoginOpen(true)}
              className="w-full py-3 px-4 bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold rounded-xl shadow-md transition-all flex items-center justify-center space-x-2"
            >
              <LogIn className="w-4 h-4 text-amber-400" />
              <span>Đăng Nhập Ngay</span>
            </button>
            <div className="text-[11px] text-slate-400 pt-3 border-t border-slate-100">
              Phân quyền 4 vai trò & Token JWT an toàn
            </div>
          </div>
        ) : isDriver ? (
          <div className="space-y-5 animate-fade-in">
            <DriverApp currentUser={currentUser} />
          </div>
        ) : (
          <>
            {/* ============================================================
                THANH ĐIỀU HƯỚNG 2 TẦNG (CHUẨN DOANH NGHIỆP: TAB CON NẰM DƯỚI TAB CHA)
                ============================================================ */}
            <div data-navigation="two-level" role="navigation" aria-label="Điều hướng chính" className="ha-main-navigation" style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
              {/* TẦNG 1: HÀNG TAB CHÍNH NỔI BẬT */}
              <div className="flex items-center overflow-x-auto no-scrollbar py-0.5">
                <div className="ha-primary-tabs">
                  {/* Tab Tổng Quan Kinh Doanh (Giám Đốc, Kế Toán) */}
                  {(isDirector || isAccountant) && (
                    <button
                      onClick={() => { setActiveModule('overview'); setSubView('business_overview'); setActiveTab('business_overview'); }}
                      className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-all flex items-center space-x-1.5 shrink-0 ${
                        activeModule === 'overview'
                          ? 'ha-nav-active'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <TrendingUp className="w-4 h-4 text-slate-500" />
                      <span>{isAccountant ? 'P&L & Tổng quan' : 'Tổng quan kinh doanh'}</span>
                      <span className={`w-1.5 h-1.5 rounded-full ${isPlConnected ? 'bg-emerald-500' : 'bg-slate-400'}`}></span>
                    </button>
                  )}

                  {/* Tab Chuyến Xe (Giám Đốc, Kế Toán, Quản Lý Khu) */}
                  <button
                    onClick={() => { setActiveModule('trips'); setActiveTab('trips'); }}
                    className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-all flex items-center space-x-1.5 shrink-0 ${
                      activeModule === 'trips'
                        ? 'ha-nav-active'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Truck className="w-4 h-4 text-slate-500" />
                    <span>
                      {isAreaManager ? `Chuyến xe khu vực (${sampleTrips.length})` : isAccountant ? `Đối soát chuyến xe (${sampleTrips.length})` : 'Chuyến xe'}
                    </span>
                  </button>

                  {/* Tab Công Nợ & Tiền Phơi (Giám Đốc / Kế Toán / Thư Ký) */}
                  {(isDirector || isAccountant || isSecretary) && (
                    <button
                      onClick={() => { setActiveModule('debts'); setActiveTab('debts'); }}
                      className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-all flex items-center space-x-1.5 shrink-0 ${
                        activeModule === 'debts'
                          ? 'ha-nav-active'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <CreditCard className="w-4 h-4 text-slate-500" />
                      <span>{isSecretary ? 'Nhắc đòi phơi & Công nợ' : 'Công nợ'}</span>
                    </button>
                  )}

                  {/* Tab Đội Xe & Lương (Luôn đánh dấu chọn khi xem bất kỳ tab con nào của mục này) */}
                  <button
                    onClick={() => {
                      const permittedViews = isAreaManager ? ['vehicles'] : isAccountant ? ['vehicles', 'kpi', 'payroll'] : ['vehicles', 'kpi', 'payroll', 'driver_app'];
                      const nextView = permittedViews.includes(lastFleetView) ? lastFleetView : (isAccountant ? 'payroll' : 'vehicles');
                      setActiveModule('fleet');
                      setSubView(nextView);
                      setActiveTab(nextView === 'vehicles' ? 'maintenance' : nextView);
                    }}
                    className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-all flex items-center space-x-1.5 shrink-0 ${
                      activeModule === 'fleet'
                        ? 'ha-nav-active'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Users className="w-4 h-4 text-slate-500" />
                    <span>
                      {isAreaManager ? 'Xe & Chi phí khu vực' : isAccountant ? 'Lương & Tạm ứng' : 'Đội xe & Lương'}
                    </span>
                  </button>

                  {isDirector && <button onClick={() => { setActiveModule('manage'); setActiveTab('manage'); }} className={`px-3.5 py-2 rounded-lg text-xs font-bold shrink-0 ${activeModule === 'manage' ? 'ha-nav-active' : 'text-slate-600'}`}>Dữ liệu & chỉnh sửa</button>}
                  {/* Tab Cẩm Nang & Quản Trị */}
                  <button
                    onClick={() => {
                      const nextView = isDirector && lastSystemView === 'backup' ? 'backup' : 'help';
                      setActiveModule('system');
                      setSubView(nextView);
                      setActiveTab(nextView);
                    }}
                    className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-all flex items-center space-x-1.5 shrink-0 ${
                      activeModule === 'system'
                        ? 'ha-nav-active'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <BookOpen className="w-4 h-4 text-slate-500" />
                    <span>{isDirector ? 'Cẩm nang & Quản trị' : 'Cẩm nang SOP'}</span>
                  </button>
                </div>
              </div>

              {/* TẦNG 2: HÀNG TAB CON NẰM DƯỚI HÀNG TAB CHÍNH */}
              {activeModule === 'fleet' && (
                <div className="pt-1.5 border-t border-slate-100 flex items-center overflow-x-auto no-scrollbar">
                  <div className="inline-flex p-0.5 bg-slate-50 rounded-lg space-x-1 shrink-0">
                    {/* Tab Con: Đội xe (Trạng thái xe, ODO, kiểm định) */}
                    <button
                      onClick={() => { setSubView('vehicles'); setActiveTab('maintenance'); }}
                      className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all shrink-0 ${
                        subView === 'vehicles' || activeTab === 'maintenance'
                          ? 'bg-white text-slate-900 font-semibold shadow-xs border border-slate-200/80'
                          : 'text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      Đội xe
                    </button>

                    {/* Tab Con: Doanh thu & KPI (DIRECTOR & ACCOUNTANT) */}
                    {(isDirector || isAccountant) && (
                      <button
                        onClick={() => { setSubView('kpi'); setActiveTab('kpi'); }}
                        className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all shrink-0 ${
                          subView === 'kpi' || activeTab === 'kpi'
                            ? 'bg-white text-slate-900 font-semibold shadow-xs border border-slate-200/80'
                            : 'text-slate-500 hover:text-slate-800'
                        }`}
                      >
                        Doanh thu & KPI
                      </button>
                    )}

                    {/* Tab Con: Bảng lương (DIRECTOR & ACCOUNTANT) */}
                    {(isDirector || isAccountant) && (
                      <button
                        onClick={() => { setSubView('payroll'); setActiveTab('payroll'); }}
                        className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all shrink-0 ${
                          subView === 'payroll' || activeTab === 'payroll'
                            ? 'bg-white text-slate-900 font-semibold shadow-xs border border-slate-200/80'
                            : 'text-slate-500 hover:text-slate-800'
                        }`}
                      >
                        Bảng lương
                      </button>
                    )}

                    {/* Tab Con: Xem giao diện tài xế (chỉ Director dùng test) */}
                    {isDirector && (
                      <button
                        onClick={() => { setSubView('driver_app'); setActiveTab('driver_app'); }}
                        className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all shrink-0 ${
                          subView === 'driver_app' || activeTab === 'driver_app'
                            ? 'bg-white text-slate-900 font-semibold shadow-xs border border-slate-200/80'
                            : 'text-slate-500 hover:text-slate-800'
                        }`}
                      >
                        Giao diện tài xế
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* TẦNG 2 CHO HỆ THỐNG / QUẢN TRỊ */}
              {activeModule === 'system' && (
                <div className="pt-1.5 border-t border-slate-100 flex items-center overflow-x-auto no-scrollbar">
                  <div className="inline-flex p-0.5 bg-slate-50 rounded-lg space-x-1 shrink-0">
                    <button
                      onClick={() => { setSubView('help'); setActiveTab('help'); }}
                      className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all shrink-0 ${
                        subView === 'help' || activeTab === 'help'
                          ? 'bg-white text-slate-900 font-semibold shadow-xs border border-slate-200/80'
                          : 'text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      Từ điển & SOP
                    </button>
                    {isDirector && (
                      <button
                        onClick={() => { setSubView('backup'); setActiveTab('system'); }}
                        className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all shrink-0 ${
                          subView === 'backup' || activeTab === 'system'
                            ? 'bg-white text-slate-900 font-semibold shadow-xs border border-slate-200/80'
                            : 'text-slate-500 hover:text-slate-800'
                        }`}
                      >
                        Sao lưu & Kỹ thuật
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>

            {isDirector && activeTab === 'manage' && <DataManagementView assistantFocus={assistantFocus} onAssistantFocusConsumed={() => setAssistantFocus(null)} onAssistantContext={setAssistantContext} />}

            {/* PHÂN HỆ TỔNG QUAN KINH DOANH - ĐÚNG 3 PHẦN GỌN RÕ */}
            {(isDirector || isAccountant) && (activeTab === 'business_overview') && (
              <div className="space-y-5">
                <BusinessOverviewView
                  assistantFocus={businessAssistantFocus}
                  onAssistantFocusConsumed={() => setBusinessAssistantFocus(null)}
                  onAssistantContext={setAssistantContext}
                  onNavigateTab={handleNavigateTab}
                  onOpenTripCreate={() => {
                    setDuplicateTargetTrip(null);
                    setIsTripCreateOpen(true);
                  }}
                />
              </div>
            )}

            {/* PHÂN HỆ PHÂN TÍCH CHUYÊN SÂU (GIÁM ĐỐC & KẾ TOÁN) */}
            {(isDirector || isAccountant) && (activeTab === 'analytics') && (
              <div className="space-y-5 animate-fade-in">
                <DirectorAnalyticsView state={directorAnalyticsState} onStateChange={setDirectorAnalyticsState}
                  onCreateTask={draft => { setDirectorTaskDraft(draft); handleNavigateTab('tasks'); }} />
              </div>
            )}

            {/* PHÂN HỆ CÔNG VIỆC GIÁM ĐỐC & GIAO VIỆC (GIÁM ĐỐC & KẾ TOÁN) */}
            {(isDirector || isAccountant) && (activeTab === 'tasks') && (
              <div className="space-y-5 animate-fade-in">
                <DirectorTasksView onNavigateTab={handleNavigateTab} tasks={directorTasks} onTasksChange={setDirectorTasks}
                  incomingDraft={directorTaskDraft} onDraftConsumed={() => setDirectorTaskDraft(null)} />
              </div>
            )}

            {/* PHÂN HỆ CÔNG NỢ DOANH NGHIỆP & TIỀN PHƠI (GIÁM ĐỐC, KẾ TOÁN & THƯ KÝ) */}
            {(isDirector || isAccountant || isSecretary) && (activeTab === 'debts') && (
              <div className="space-y-5 animate-fade-in">
                <DirectorDebtsView assistantFocus={debtAssistantFocus} onAssistantFocusConsumed={() => setDebtAssistantFocus(null)} onAssistantContext={setAssistantContext} />
              </div>
            )}

            {/* PHÂN HỆ 1: DASHBOARD REAL-TIME P&L (CHỈ DÀNH CHO GIÁM ĐỐC VÀ KẾ TOÁN) */}
            {(isDirector || isAccountant) && (activeTab === 'dashboard' || activeTab === 'all') && (
              <div className="space-y-5">
                {/* Task 4.3: Thanh Chuyển Đổi Đa Chu Kỳ */}
                <TimeFilterPills
                  currentFilter={dateFilter}
                  onChange={(newFilter) => setDateFilter(newFilter)}
                />

                {/* Task 4.2: Dashboard song song 2 dòng tiền */}
                <DirectorDashboard
                  plData={plData}
                  loading={plLoading}
                  isConnected={isPlConnected}
                  lastEvent={plLastEvent}
                  eventCount={plEventCount}
                  lastPulseTime={plLastPulseTime}
                  onRefresh={refreshPL}
                  onTriggerSSE={triggerPLBroadcast}
                  currentUser={currentUser}
                  trips={sampleTrips}
                  dateFilter={dateFilter}
                  onOpenBatchPayment={(cust) => {
                    setBatchPaymentCustomer(cust || '');
                    setIsBatchPaymentOpen(true);
                  }}
                  onNavigateToKpi={() => {
                    setActiveTab('kpi');
                    setSubView('kpi');
                    setActiveModule('overview');
                  }}
                />
              </div>
            )}

            {/* PHÂN HỆ KPI ĐỘNG (CHỈ DÀNH CHO GIÁM ĐỐC VÀ KẾ TOÁN) */}
            {(isDirector || isAccountant) && (activeTab === 'kpi' || activeTab === 'all') && (
              <div className="space-y-5">
                {activeTab === 'kpi' && (
                  <TimeFilterPills
                    currentFilter={dateFilter}
                    onChange={(newFilter) => setDateFilter(newFilter)}
                  />
                )}

                <KpiAdjustTable
                  dateFilter={dateFilter}
                  currentUser={currentUser}
                />
              </div>
            )}

            {/* PHÂN HỆ BẢNG LƯƠNG 3 THÀNH PHẦN (CHỈ DÀNH CHO GIÁM ĐỐC VÀ KẾ TOÁN) */}
            {(isDirector || isAccountant) && (activeTab === 'payroll' || activeTab === 'all') && (
              <div className="space-y-5">
                <PayrollView currentUser={currentUser} />
              </div>
            )}

            {/* PHÂN HỆ XEM GIẢ LẬP APP LÁI XE (DÀNH CHO GIÁM ĐỐC TEST) */}
            {isDirector && activeTab === 'driver_app' && (
              <div className="space-y-5">
                <DriverApp currentUser={currentUser} />
              </div>
            )}

            {/* PHÂN HỆ QUẢN LÝ ĐỘI XE & BẢO DƯỠNG (GIÁM ĐỐC, KẾ TOÁN, QUẢN LÝ KHU) */}
            {(activeTab === 'maintenance' || activeTab === 'all') && (
              <div className="space-y-5">
                <MaintenanceView currentUser={currentUser} />
              </div>
            )}

            {/* PHÂN HỆ CẨM NANG HƯỚNG DẪN & TỪ ĐIỂN KÝ HIỆU (TẤT CẢ VAI TRÒ) */}
            {(activeTab === 'help' || activeTab === 'all') && (
              <div className="space-y-5">
                <HelpCenterPage currentUser={currentUser} />
              </div>
            )}

            {/* PHÂN HỆ HẠ TẦNG KỸ THUẬT (CHỈ GIÁM ĐỐC ĐƯỢC XEM) */}
            {isDirector && (activeTab === 'system' || activeTab === 'all') && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Card 1: Backend Server */}
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 flex flex-col justify-between">
            <div className="flex items-start justify-between">
              <div>
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Backend API Server</span>
                <h3 className="text-lg font-bold text-slate-900 mt-1">Cổng Port 5000</h3>
              </div>
              <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl">
                <Server className="w-6 h-6" />
              </div>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-100 text-xs text-slate-600 space-y-1">
              <div className="flex justify-between">
                <span>Trạng thái:</span>
                <span className="font-semibold text-emerald-600">{health?.server || 'Online'}</span>
              </div>
              <div className="flex justify-between">
                <span>Môi trường:</span>
                <span className="font-semibold capitalize">{health?.environment || 'development'}</span>
              </div>
              <div className="flex justify-between">
                <span>Phiên bản API:</span>
                <span className="font-mono">{health?.version || 'v1.0.0'}</span>
              </div>
            </div>
          </div>

          {/* Card 2: SQLite WAL & Drizzle ORM */}
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 flex flex-col justify-between">
            <div className="flex items-start justify-between">
              <div>
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Database & ORM</span>
                <h3 className="text-lg font-bold text-slate-900 mt-1">Drizzle ORM (14 Bảng)</h3>
              </div>
              <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl">
                <Database className="w-6 h-6" />
              </div>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-100 text-xs text-slate-600 space-y-1">
              <div className="flex justify-between">
                <span>Journal Mode:</span>
                <span className="font-mono font-bold text-indigo-600">{health?.journalMode || 'WAL'}</span>
              </div>
              <div className="flex justify-between">
                <span>Tiền tệ quy chuẩn:</span>
                <span className="font-semibold text-emerald-600">Số nguyên VND</span>
              </div>
              <div className="flex justify-between">
                <span>Mã hóa ePort:</span>
                <span className="text-blue-600 font-semibold">AES-256-GCM</span>
              </div>
            </div>
          </div>

          {/* Card 3: Backup Engine Stats */}
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 flex flex-col justify-between">
            <div className="flex items-start justify-between">
              <div>
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Hệ Thống Sao Lưu</span>
                <h3 className="text-lg font-bold text-slate-900 mt-1">VACUUM INTO</h3>
              </div>
              <div className="p-2.5 bg-amber-50 text-amber-600 rounded-xl">
                <HardDrive className="w-6 h-6" />
              </div>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-100 text-xs text-slate-600 space-y-1">
              <div className="flex justify-between">
                <span>Tổng bản lưu:</span>
                <span className="font-bold">{stats?.totalBackups || 0} / {stats?.maxBackupsKept || 10}</span>
              </div>
              <div className="flex justify-between">
                <span>Dung lượng sao lưu:</span>
                <span className="font-semibold">{stats?.totalSizeMB || 0} MB</span>
              </div>
              <div className="flex justify-between">
                <span>Cơ chế bảo vệ:</span>
                <span className="text-blue-600 font-semibold">WAL Hot-Backup</span>
              </div>
            </div>
          </div>

          {/* Card 4: Auth & RBAC Security */}
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 flex flex-col justify-between">
            <div className="flex items-start justify-between">
              <div>
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Hệ Thống Phân Quyền</span>
                <h3 className="text-lg font-bold text-slate-900 mt-1">JWT & Bcrypt & RBAC</h3>
              </div>
              <div className="p-2.5 bg-purple-50 text-purple-600 rounded-xl">
                <ShieldCheck className="w-6 h-6" />
              </div>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-100 text-xs text-slate-600 space-y-1">
              <div className="flex justify-between">
                <span>Đang đăng nhập:</span>
                <span className="font-semibold text-purple-700">
                  {currentUser ? currentUser.username : 'Khách (Chưa đăng nhập)'}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Thời hạn Token:</span>
                <span className="font-medium text-slate-700">8 Giờ (JWT Signed)</span>
              </div>
              <div className="flex justify-between">
                <span>Chống Brute Force:</span>
                <span className="font-medium text-emerald-600">Rate Limiting Kích hoạt</span>
              </div>
            </div>
          </div>
        </div>
        )}

        {/* SECTION: DỮ LIỆU ĐÃ IMPORT TỪ EXCEL */}
        {isDirector && activeTab === 'trips' && <DataManagementView assistantFocus={assistantFocus} onAssistantFocusConsumed={() => setAssistantFocus(null)} onAssistantContext={setAssistantContext} />}
        {!isDirector && (activeTab === 'trips' || activeTab === 'all') && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-5">
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-lg font-bold text-slate-900">Danh Mục Chuyến Xe & Dữ Liệu Vận Tải</h2>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Quản lý toàn bộ thông tin cuốc xe, đầu kéo 15C/15H, lái xe, bãi cảng và cổng ePort.
              </p>
            </div>
            <div className="flex items-center space-x-3">
              {(isDirector || isAccountant) && (
                <button
                  onClick={() => {
                    setBatchPaymentCustomer('');
                    setIsBatchPaymentOpen(true);
                  }}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 shadow-xs active:scale-95 transition-all flex items-center space-x-1.5"
                >
                  <CreditCard className="w-4 h-4 text-indigo-200" />
                  <span>📑 Thanh Toán Bảng Kê</span>
                </button>
              )}
              {isDirector && (
                <button
                  onClick={handleSeedFromExcel}
                  disabled={loading}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 active:scale-95 transition-all flex items-center space-x-1.5"
                >
                  <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                  <span>Nạp Lại Từ 7.xlsx</span>
                </button>
              )}
            </div>
          </div>

          {/* Metric Stats Pills */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-100">
              <span className="text-xs text-slate-500 flex items-center space-x-1">
                <Truck className="w-3.5 h-3.5 text-blue-500" />
                <span>Đầu Xe</span>
              </span>
              <p className="text-xl font-bold text-slate-900 mt-1">{dataSummary?.vehicles || 0}</p>
              <span className="text-[10px] text-slate-400">15C, 15H chuẩn</span>
            </div>

            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-100">
              <span className="text-xs text-slate-500 flex items-center space-x-1">
                <Users className="w-3.5 h-3.5 text-indigo-500" />
                <span>Tài Xế</span>
              </span>
              <p className="text-xl font-bold text-slate-900 mt-1">{dataSummary?.drivers || 0}</p>
              <span className="text-[10px] text-slate-400">Khu Tuân & T.Anh</span>
            </div>

            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-100">
              <span className="text-xs text-slate-500 flex items-center space-x-1">
                <Layers className="w-3.5 h-3.5 text-amber-500" />
                <span>Cuốc Xe</span>
              </span>
              <p className="text-xl font-bold text-slate-900 mt-1">{dataSummary?.trips || 0}</p>
              <span className="text-[10px] text-slate-400">Đã nạp đầy đủ</span>
            </div>

            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-100">
              <span className="text-xs text-slate-500 flex items-center space-x-1">
                <MapPin className="w-3.5 h-3.5 text-emerald-500" />
                <span>Bãi Cảng</span>
              </span>
              <p className="text-xl font-bold text-slate-900 mt-1">{dataSummary?.ports || 0}</p>
              <span className="text-[10px] text-slate-400">Tân Vũ, Đ.Vũ, TIL...</span>
            </div>

            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-100">
              <span className="text-xs text-slate-500 flex items-center space-x-1">
                <KeyRound className="w-3.5 h-3.5 text-rose-500" />
                <span>Cổng ePort</span>
              </span>
              <p className="text-xl font-bold text-slate-900 mt-1">{dataSummary?.eport_accounts || 0}</p>
              <span className="text-[10px] text-rose-600 font-medium">Mã hóa AES-GCM</span>
            </div>

            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-100">
              <span className="text-xs text-slate-500 flex items-center space-x-1">
                <Coins className="w-3.5 h-3.5 text-amber-600" />
                <span>Tổng Doanh Thu</span>
              </span>
              <p className="text-lg font-bold text-slate-900 mt-1 truncate" title={formatVnd(dataSummary?.total_revenue_vnd)}>
                {formatVnd(dataSummary?.total_revenue_vnd)}
              </p>
              <span className="text-[10px] text-slate-400">Số nguyên VND</span>
            </div>
          </div>

          {/* Sub-grid: Danh sách Đầu Xe & Cuốc xe mẫu */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-2">
            {/* Box 1: Đội Xe Nhà */}
            <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/50">
              <h3 className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-3 flex items-center justify-between">
                <span>Đội Xe Nhà Trong File Excel ({vehicles.length})</span>
                <span className="text-[10px] text-emerald-600 font-semibold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                  100% Hoạt Động
                </span>
              </h3>
              <div className="space-y-2">
                {vehicles.map((v) => (
                  <div key={v.id} className="bg-white p-3 rounded-lg border border-slate-200 flex items-center justify-between shadow-xs">
                    <div>
                      <span className="font-mono font-bold text-sm text-slate-900">{v.plate_number}</span>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Tài xế: <span className="font-medium text-slate-700">{v.driver_name || 'Chưa gán'}</span>
                      </p>
                    </div>
                    <div className="text-right text-xs">
                      <span className="inline-block px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-50 text-blue-700">
                        {v.vehicle_type}
                      </span>
                      <p className="text-[10px] text-slate-400 mt-1">Hạn ĐK: {v.inspection_expiry}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Box 2: Cuốc Xe Theo Phân Quyền */}
            <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/50">
              <h3 className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-3 flex items-center justify-between">
                <span>Cuốc Xe Trong Quyền Truy Cập ({sampleTrips.length} chuyến)</span>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                  currentUser?.role === 'DIRECTOR'
                    ? 'bg-amber-50 text-amber-700 border-amber-200'
                    : currentUser?.role === 'ACCOUNTANT'
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : currentUser?.role === 'AREA_MANAGER'
                    ? 'bg-blue-50 text-blue-700 border-blue-200'
                    : currentUser?.role === 'DRIVER'
                    ? 'bg-purple-50 text-purple-700 border-purple-200'
                    : 'bg-slate-100 text-slate-600 border-slate-200'
                }`}>
                  {currentUser?.role === 'DIRECTOR' && '👑 Toàn Bộ Công Ty (33 chuyến)'}
                  {currentUser?.role === 'ACCOUNTANT' && '💼 Toàn Bộ Công Ty (33 chuyến)'}
                  {currentUser?.role === 'AREA_MANAGER' && `📍 Khu Vực ${currentUser.area_id || 'TUAN'} (${sampleTrips.length} chuyến)`}
                  {currentUser?.role === 'DRIVER' && `🚛 Cá Nhân ${currentUser.full_name} (${sampleTrips.length} chuyến)`}
                  {!currentUser && 'Toàn Bộ Chuyến (Khách)'}
                </span>
              </h3>
              <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
                {sampleTrips.map((t) => (
                    <div key={t.id} className="bg-white p-2.5 rounded-lg border border-slate-200 text-xs shadow-xs relative">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-1.5">
                        <span className="font-mono font-semibold text-blue-600">{t.trip_code}</span>
                        {t.is_locked === 1 && (
                          <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-rose-100 text-rose-700 border border-rose-200 flex items-center space-x-0.5">
                            <Lock className="w-2.5 h-2.5 mr-0.5" />
                            <span>Đã khóa</span>
                          </span>
                        )}
                        <span className={`px-1 rounded text-[9px] font-bold ${t.vat_type === 'V' ? 'bg-blue-50 text-blue-700' : 'bg-amber-50 text-amber-700'}`}>
                          [{t.vat_type || 'V'}]
                        </span>
                        {(t.is_multi_container === 1 || (t.notes && t.notes.includes('2x20'))) && (
                          <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-indigo-100 text-indigo-700 border border-indigo-200">
                            2x20' Kẹp
                          </span>
                        )}
                      </div>
                      <div className="flex items-center space-x-1.5">
                        <span className="text-[10px] text-slate-400 flex items-center space-x-1 mr-1">
                          <Calendar className="w-3 h-3" />
                          <span>{t.trip_date}</span>
                        </span>
                        {/* Nút Xuất Tạm Ứng Trước Chuyến (Task 3.3) */}
                        <button
                          onClick={() => {
                            setTargetTripForAdvance(t);
                            setIsAdvanceModalOpen(true);
                          }}
                          className="p-1 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded transition-colors"
                          title="Tạm ứng & Quyết toán hoàn ứng cuốc này"
                        >
                          <Wallet className="w-3.5 h-3.5" />
                        </button>
                        {/* Nút Nhập Chi Phí Thực Tế & Cảnh Báo (Task 3.4) */}
                        <button
                          onClick={() => {
                            setTargetTripForExpense(t);
                            setIsExpenseModalOpen(true);
                          }}
                          className="p-1 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded transition-colors"
                          title="Nhập Chi phí thực tế (Cố định/Biến động) & Cảnh báo >25%"
                        >
                          <Receipt className="w-3.5 h-3.5" />
                        </button>
                        {/* Nút Chụp Ảnh Phiếu Phơi EIR (Task 3.5) */}
                        <button
                          onClick={() => {
                            setTargetTripForEir(t);
                            setIsEirModalOpen(true);
                          }}
                          className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors"
                          title="Chụp ảnh phiếu phơi / Phiếu hạ"
                        >
                          <Camera className="w-3.5 h-3.5" />
                        </button>
                        {/* Nút Nhân bản chuyến hôm qua (Task 3.1) */}
                        {currentUser?.role !== 'DRIVER' && (
                          <button
                            onClick={() => {
                              setDuplicateTargetTrip(t);
                              setIsTripCreateOpen(true);
                            }}
                            className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                            title="Nhân bản chuyến xe này sang ngày mới"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="mt-1 flex justify-between items-center text-slate-700">
                      <div>
                        <span className="font-bold text-slate-900">{t.customer_name}</span> - <span className="text-slate-600">{t.route_name}</span>
                      </div>
                      <span className="font-mono font-bold text-emerald-600">{formatVnd(t.total_revenue)}</span>
                    </div>
                    <div className="mt-1 text-[11px] text-slate-500 flex justify-between items-center">
                      <span>Xe: <b className="text-slate-700">{t.vehicle_plate}</b></span>
                      <span>Cont: <b className="font-mono text-slate-700">{t.container_number || 'N/A'}</b></span>
                      {t.eir_status === 'DA_TRA' ? (
                        <span className="inline-flex items-center space-x-1 px-1.5 py-0.2 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <span>Phơi: Đã trả</span>
                          {t.eir_photo_url && <ImageIcon className="w-2.5 h-2.5 ml-0.5 text-emerald-600" />}
                        </span>
                      ) : (
                        (() => {
                          const tDate = new Date(t.trip_date);
                          tDate.setHours(0, 0, 0, 0);
                          const now = new Date();
                          now.setHours(0, 0, 0, 0);
                          const diff = Math.floor((now.getTime() - tDate.getTime()) / (1000 * 60 * 60 * 24));
                          if (diff >= 3) {
                            return (
                              <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300 animate-pulse">
                                ⚠️ Đọng phơi {diff} ngày
                              </span>
                            );
                          }
                          return (
                            <span className="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-amber-50 text-amber-700">
                              Phơi: Chưa trả
                            </span>
                          );
                        })()
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
        )}

        {/* Task 7.4 Offsite Backup (Telegram / Cloud 23h59) & Task 1.2 Action Controls - CHỈ DÀNH CHO GIÁM ĐỐC */}
        {isDirector && (activeTab === 'system' || activeTab === 'all') && (
        <div className="space-y-6">
          {/* Card Sao Lưu Offsite Hàng Đêm Telegram / Cloud (Task 7.4) */}
          <OffsiteBackupCard currentUser={currentUser} />

          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-6 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900 flex items-center space-x-2">
                <ShieldCheck className="w-5 h-5 text-slate-700" />
                <span>Quản Trị Cơ Sở Dữ Liệu & Bản Sao Lưu</span>
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                Tạo bản sao lưu tức thì không gián đoạn đọc/ghi (VACUUM INTO), tải file .sqlite về máy hoặc khôi phục an toàn.
              </p>
            </div>
            <div className="flex items-center space-x-3">
              <button
                onClick={loadData}
                disabled={loading}
                className="px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 active:scale-95 transition-all flex items-center space-x-1.5"
                title="Làm mới trạng thái"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                <span>Làm mới</span>
              </button>

              <button
                onClick={handleCreateBackup}
                disabled={loading}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 active:scale-95 shadow-sm shadow-blue-500/20 transition-all flex items-center space-x-1.5"
              >
                <HardDrive className="w-4 h-4" />
                <span>1-Click Sao Lưu Ngay</span>
              </button>

              <button
                onClick={handleResetDb}
                disabled={loading}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 active:scale-95 transition-all flex items-center space-x-1.5"
              >
                <AlertTriangle className="w-4 h-4 text-rose-600" />
                <span>1-Click Reset DB</span>
              </button>
            </div>
          </div>

          {/* Backup List Table */}
          <div className="p-6">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">
              Danh sách các bản sao lưu sẵn có ({backups.length})
            </h3>
            {backups.length === 0 ? (
              <div className="text-center py-12 border-2 border-dashed border-slate-200 rounded-xl bg-slate-50">
                <Database className="w-10 h-10 text-slate-400 mx-auto mb-2" />
                <p className="text-sm font-medium text-slate-600">Chưa có bản sao lưu nào trong thư mục backups/</p>
                <p className="text-xs text-slate-400 mt-1">Bấm nút "1-Click Sao Lưu Ngay" ở trên để tạo bản backup đầu tiên.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500 text-xs uppercase tracking-wider">
                      <th className="pb-3 font-semibold">Tên Tập Tin</th>
                      <th className="pb-3 font-semibold">Thời Gian Tạo</th>
                      <th className="pb-3 font-semibold">Dung Lượng</th>
                      <th className="pb-3 font-semibold text-right">Thao Tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {backups.map((b) => (
                      <tr key={b.filename} className="hover:bg-slate-50 transition-colors">
                        <td className="py-3 font-mono font-medium text-slate-800 text-xs">
                          {b.filename}
                        </td>
                        <td className="py-3 text-slate-500 text-xs">
                          {new Date(b.createdAt).toLocaleString('vi-VN')}
                        </td>
                        <td className="py-3 text-slate-600 text-xs font-medium">
                          {b.sizeMB} MB
                        </td>
                        <td className="py-3 text-right">
                          {currentUser?.role === 'DIRECTOR' ? (
                            <a
                              href={getBackupDownloadUrl(b.filename)}
                              download
                              className="inline-flex items-center space-x-1 px-3 py-1.5 text-xs font-semibold text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition-all"
                            >
                              <Download className="w-3.5 h-3.5" />
                              <span>Tải về .sqlite</span>
                            </a>
                          ) : (
                            <span className="text-[11px] text-slate-400 italic">
                              🔒 Chỉ Giám Đốc
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
        </div>
        )}
          </>
        )}
      </main>

      {/* Modal Đăng Nhập & Phân Quyền 4 Vai Trò */}
      <LoginModal 
        isOpen={isLoginOpen} 
        onClose={() => setIsLoginOpen(false)} 
        onLoginSuccess={(user) => {
          setCurrentUser(user);
          loadData();
        }}
        currentUser={currentUser}
      />

      {/* Modal Khóa sổ & lịch sử (Task 2.3) */}
      <PeriodLockModal
        isOpen={isPeriodLockOpen}
        onClose={() => setIsPeriodLockOpen(false)}
        currentUser={currentUser}
        onActionSuccess={() => {
          loadData();
        }}
      />

      {/* Modal Tạo Chuyến Xe Mới & Nhân Bản (Task 3.1) */}
      <TripCreateModal
        isOpen={isTripCreateOpen}
        onClose={() => {
          setIsTripCreateOpen(false);
          setDuplicateTargetTrip(null);
        }}
        currentUser={currentUser}
        duplicateFromTrip={duplicateTargetTrip}
        onTripCreated={(newTrip) => {
          setMsg(`Đã lưu cuốc xe [${newTrip.trip_code}] thành công! Lãi tạm tính: ${new Intl.NumberFormat('vi-VN').format(newTrip.temp_profit || 0)} ₫`);
          loadData();
          setTimeout(() => setMsg(null), 5000);
        }}
        onSwitchToBatch={() => {
          setIsTripCreateOpen(false);
          setIsBatchTripCreateOpen(true);
        }}
        onSwitchToExcelImport={() => {
          setIsTripCreateOpen(false);
          setIsExcelImportOpen(true);
        }}
      />

      {/* Modal Nhập Nhiều Cuốc Xe (Spreadsheet Grid) */}
      <BatchTripCreateModal
        isOpen={isBatchTripCreateOpen}
        onClose={() => setIsBatchTripCreateOpen(false)}
        currentUser={currentUser}
        onBatchCreated={(result) => {
          setMsg(`Đã nhập thành công ${result.inserted} cuốc xe theo lô vào hệ thống!`);
          loadData();
          setTimeout(() => setMsg(null), 5000);
        }}
        onSwitchToOneTrip={() => {
          setIsBatchTripCreateOpen(false);
          setIsTripCreateOpen(true);
        }}
        onSwitchToExcelImport={() => {
          setIsBatchTripCreateOpen(false);
          setIsExcelImportOpen(true);
        }}
      />

      {/* Modal Nhập bảng kê Excel (5 bước theo chuẩn tháng 1) */}
      <ExcelImportModal
        isOpen={isExcelImportOpen}
        onClose={() => setIsExcelImportOpen(false)}
        currentUser={currentUser}
        onImportSuccess={() => {
          setMsg('Đã nhập bảng kê Excel vào hệ thống thành công! Dữ liệu tổng quan đã được cập nhật.');
          loadData();
          setTimeout(() => setMsg(null), 5000);
        }}
        onSwitchToOneTrip={() => {
          setIsExcelImportOpen(false);
          setIsTripCreateOpen(true);
        }}
        onSwitchToBatch={() => {
          setIsExcelImportOpen(false);
          setIsBatchTripCreateOpen(true);
        }}
      />

      {/* Modal Tạm Ứng & Quyết Toán Hoàn Ứng (Task 3.3) */}
      <AdvanceSettlementModal
        isOpen={isAdvanceModalOpen}
        onClose={() => {
          setIsAdvanceModalOpen(false);
          setTargetTripForAdvance(null);
        }}
        currentUser={currentUser}
        targetTrip={targetTripForAdvance}
        onUpdated={() => {
          loadData();
        }}
      />

      {/* Modal Nhập Chi Phí Thực Tế & Cảnh Báo Bất Thường (Task 3.4) */}
      <ExpenseEntryModal
        isOpen={isExpenseModalOpen}
        onClose={() => {
          setIsExpenseModalOpen(false);
          setTargetTripForExpense(null);
        }}
        targetTrip={targetTripForExpense}
        allTrips={sampleTrips}
        currentUser={currentUser}
        onUpdated={() => {
          loadData();
        }}
      />

      {/* Modal Chụp Ảnh Phiếu Phơi EIR Container (Task 3.5) */}
      <EirPhotoModal
        isOpen={isEirModalOpen}
        onClose={() => {
          setIsEirModalOpen(false);
          setTargetTripForEir(null);
        }}
        targetTrip={targetTripForEir}
        allTrips={sampleTrips}
        currentUser={currentUser}
        onUpdated={() => {
          loadData();
        }}
      />

      {/* Modal Thanh Toán Gộp Bảng Kê (Task 4.5) */}
      <BatchPaymentModal
        isOpen={isBatchPaymentOpen}
        onClose={() => {
          setIsBatchPaymentOpen(false);
          setBatchPaymentCustomer('');
        }}
        defaultCustomerName={batchPaymentCustomer}
        currentUser={currentUser}
        onSuccess={(result) => {
          const formatted = new Intl.NumberFormat('vi-VN').format(result.total_amount || 0);
          setMsg(`Đã thanh toán gộp thành công ${result.trip_count} chuyến cho khách [${result.customer_name}] (Tổng: ${formatted} ₫)! Dòng tiền P&L đã cập nhật tức thì.`);
          loadData();
          refreshPL();
          setTimeout(() => setMsg(null), 6000);
        }}
      />

      {/* NÚT BẤM NỔI FLOATING TRỢ LÝ ẢO AI (TỐI ƯU KHÔNG CHE SỐ LIỆU TRÊN MOBILE) */}
      {!isAiChatOpen && (
        <button
          onClick={() => setIsAiChatOpen(true)}
          className="ha-assistant-launcher fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-30"
          title="Trợ lý ảo AI nội bộ"
        >
          <MessageSquare size={16} />
          <span>Trợ lý</span>
        </button>
      )}

      {/* KHUNG CHAT TRỢ LÝ ẢO AI NỘI BỘ (TASK 6.3) */}
      <AiChatBox
        key={currentUser?.id || currentUser?.username || 'guest'}
        viewContext={['overview','trips','manage','debts'].includes(activeModule) ? assistantContext : {}}
        onNavigate={handleAssistantNavigate}
        currentUser={currentUser}
        isOpen={isAiChatOpen}
        onClose={() => setIsAiChatOpen(false)}
      />

      {/* MODAL AI GỢI Ý PHÂN BỔ NHANH ĐIỀU VẬN (TASK 6.4) */}
      <AiDispatchModal
        isOpen={isAiDispatchOpen}
        onClose={() => setIsAiDispatchOpen(false)}
        tripParams={{ tripDate: new Date().toISOString().slice(0, 10) }}
        onSelectRecommendation={(rec) => {
          setIsAiDispatchOpen(false);
          setDuplicateTargetTrip({
            vehicle_id: rec.vehicle?.id,
            driver_id: rec.driver?.id,
            trip_revenue: 3200000,
            driver_salary: 550000,
            customer_name: 'TTP'
          });
          setIsTripCreateOpen(true);
        }}
      />
    </div>
  );
}
