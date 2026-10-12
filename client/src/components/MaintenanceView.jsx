/**
 * ============================================================
 * MAINTENANCE VIEW - PHÂN HỆ QUẢN LÝ ĐỘI XE & BẢO DƯỠNG
 * ============================================================
 * Task 6.2: Quản lý đội xe, cảnh báo hạn đăng kiểm, bảo hiểm, bằng lái,
 * chu kỳ thay dầu máy ODO và cơ chế phê duyệt độc quyền 100% Giám đốc.
 * ============================================================
 */
import React, { useState, useEffect } from 'react';
import {
  fetchMaintenanceOverviewApi,
  fetchMaintenanceProposalsApi,
  createMaintenanceProposalApi,
  approveMaintenanceProposalApi,
  rejectMaintenanceProposalApi,
  completeMaintenanceProposalApi,
  updateVehicleStatusApi,
  updateVehicleKmApi
} from '../services/api.js';

export default function MaintenanceView({ currentUser }) {
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState(null);
  const [proposals, setProposals] = useState([]);
  const [activeTab, setActiveTab] = useState('vehicles'); // 'vehicles' | 'proposals'
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Modals state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedVehicleForProposal, setSelectedVehicleForProposal] = useState(null);
  const [createForm, setCreateForm] = useState({
    vehicle_id: '',
    proposal_type: 'PERIODIC',
    title: '',
    description: '',
    estimated_cost: ''
  });

  const [showCompleteModal, setShowCompleteModal] = useState(false);
  const [selectedProposalToComplete, setSelectedProposalToComplete] = useState(null);
  const [completeForm, setCompleteForm] = useState({
    actual_cost: '',
    completion_km: '',
    notes: ''
  });

  const [editingKmVehicleId, setEditingKmVehicleId] = useState(null);
  const [editKmValue, setEditKmValue] = useState('');

  const isDirector = currentUser?.role === 'DIRECTOR';

  // Tải dữ liệu ban đầu
  const loadData = async () => {
    try {
      setLoading(true);
      setErrorMsg('');
      const [overviewRes, proposalsRes] = await Promise.all([
        fetchMaintenanceOverviewApi(),
        fetchMaintenanceProposalsApi()
      ]);

      if (overviewRes.success) {
        setOverview(overviewRes.data);
      } else {
        setErrorMsg(overviewRes.error || 'Lỗi tải tổng quan đội xe');
      }

      if (proposalsRes.success) {
        setProposals(proposalsRes.data);
      }
    } catch (err) {
      setErrorMsg(err.message || 'Lỗi kết nối máy chủ');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const formatVND = (val) => {
    return (Number(val) || 0).toLocaleString('vi-VN') + '₫';
  };

  // Mở modal tạo đề xuất
  const handleOpenCreateModal = (vehicle = null) => {
    setSelectedVehicleForProposal(vehicle);
    setCreateForm({
      vehicle_id: vehicle ? vehicle.id : (overview?.vehicles?.[0]?.id || ''),
      proposal_type: 'PERIODIC',
      title: vehicle ? `Bảo dưỡng định kỳ xe ${vehicle.plate_number}` : '',
      description: '',
      estimated_cost: ''
    });
    setShowCreateModal(true);
  };

  // Gửi tạo đề xuất
  const handleCreateProposal = async (e) => {
    e.preventDefault();
    if (!createForm.vehicle_id) {
      alert('Vui lòng chọn xe cần bảo dưỡng');
      return;
    }
    if (!createForm.title.trim()) {
      alert('Vui lòng nhập tiêu đề đề xuất');
      return;
    }

    try {
      const res = await createMaintenanceProposalApi({
        ...createForm,
        estimated_cost: Number(createForm.estimated_cost) || 0
      });
      if (res.success) {
        setSuccessMsg(`Đã gửi đề xuất bảo dưỡng thành công! Chờ Giám đốc phê duyệt.`);
        setShowCreateModal(false);
        await loadData();
        setActiveTab('proposals');
      } else {
        alert(res.error || 'Không thể tạo đề xuất');
      }
    } catch (err) {
      alert(err.message || 'Lỗi hệ thống');
    }
  };

  // Giám đốc duyệt đề xuất
  const handleApprove = async (proposalId) => {
    if (!isDirector) {
      alert('Chỉ Giám đốc mới có thẩm quyền duyệt đề xuất bảo dưỡng!');
      return;
    }
    if (!window.confirm('Xác nhận Giám đốc phê duyệt đề xuất này? Xe sẽ tự động chuyển sang trạng thái NẰM XƯỞNG (🔴 MAINTENANCE).')) {
      return;
    }

    try {
      const res = await approveMaintenanceProposalApi(proposalId);
      if (res.success) {
        setSuccessMsg('Đã phê duyệt đề xuất. Xe đã vào xưởng sửa chữa.');
        await loadData();
      } else {
        alert(res.error || 'Lỗi phê duyệt');
      }
    } catch (err) {
      alert(err.message || 'Lỗi hệ thống');
    }
  };

  // Giám đốc từ chối
  const handleReject = async (proposalId) => {
    if (!isDirector) {
      alert('Chỉ Giám đốc mới có thẩm quyền từ chối!');
      return;
    }
    const reason = window.prompt('Nhập lý do từ chối đề xuất bảo dưỡng:');
    if (reason === null) return;

    try {
      const res = await rejectMaintenanceProposalApi(proposalId, reason);
      if (res.success) {
        setSuccessMsg('Đã từ chối đề xuất bảo dưỡng.');
        await loadData();
      } else {
        alert(res.error || 'Lỗi từ chối');
      }
    } catch (err) {
      alert(err.message || 'Lỗi hệ thống');
    }
  };

  // Mở modal hoàn thành nghiệm thu xuất xưởng
  const handleOpenCompleteModal = (proposal) => {
    setSelectedProposalToComplete(proposal);
    setCompleteForm({
      actual_cost: proposal.estimated_cost || '',
      completion_km: proposal.km_at_proposal || '',
      notes: ''
    });
    setShowCompleteModal(true);
  };

  // Gửi hoàn thành nghiệm thu
  const handleCompleteProposal = async (e) => {
    e.preventDefault();
    if (!selectedProposalToComplete) return;

    try {
      const res = await completeMaintenanceProposalApi(selectedProposalToComplete.id, {
        actual_cost: Number(completeForm.actual_cost) || selectedProposalToComplete.estimated_cost,
        completion_km: Number(completeForm.completion_km) || 0,
        notes: completeForm.notes
      });

      if (res.success) {
        setSuccessMsg(res.message);
        setShowCompleteModal(false);
        await loadData();
      } else {
        alert(res.error || 'Lỗi nghiệm thu hoàn thành');
      }
    } catch (err) {
      alert(err.message || 'Lỗi hệ thống');
    }
  };

  // Đổi trạng thái xe trực tiếp
  const handleUpdateVehicleStatus = async (vehicleId, newStatus) => {
    try {
      const res = await updateVehicleStatusApi(vehicleId, newStatus);
      if (res.success) {
        setSuccessMsg(`Đã đổi trạng thái xe thành công.`);
        await loadData();
      } else {
        alert(res.error || 'Lỗi cập nhật');
      }
    } catch (err) {
      alert(err.message || 'Lỗi hệ thống');
    }
  };

  // Lưu ODO km xe
  const handleSaveKm = async (vehicleId) => {
    if (!editKmValue || isNaN(editKmValue)) {
      alert('Vui lòng nhập số km hợp lệ');
      return;
    }
    try {
      const res = await updateVehicleKmApi(vehicleId, { current_km: Number(editKmValue) });
      if (res.success) {
        setEditingKmVehicleId(null);
        setEditKmValue('');
        await loadData();
      } else {
        alert(res.error || 'Lỗi cập nhật km');
      }
    } catch (err) {
      alert(err.message || 'Lỗi hệ thống');
    }
  };

  const summary = overview?.summary || {};

  return (
    <div className="space-y-6">
      {/* THÔNG BÁO FLASH */}
      {successMsg && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl flex items-center justify-between shadow-sm">
          <div className="flex items-center space-x-2">
            <span className="text-xl">✅</span>
            <span className="font-medium text-sm">{successMsg}</span>
          </div>
          <button onClick={() => setSuccessMsg('')} className="text-emerald-600 hover:text-emerald-900 font-bold text-sm">✕</button>
        </div>
      )}

      {errorMsg && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-800 rounded-xl flex items-center justify-between shadow-sm">
          <div className="flex items-center space-x-2">
            <span className="text-xl">⚠️</span>
            <span className="font-medium text-sm">{errorMsg}</span>
          </div>
          <button onClick={() => setErrorMsg('')} className="text-red-600 hover:text-red-900 font-bold text-sm">✕</button>
        </div>
      )}

      {/* HEADER TỔNG QUAN & NÚT HÀNH ĐỘNG */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl font-bold text-2xl">🚛</div>
            <div>
              <h1 className="text-2xl font-black text-slate-800 tracking-tight">
                Quản Lý Đội Xe & Đề Xuất Bảo Dưỡng
              </h1>
              <p className="text-slate-500 text-xs mt-0.5">
                Giám sát ODO, chu kỳ thay dầu, cảnh báo hạn đăng kiểm/bảo hiểm/bằng lái & Duyệt sửa chữa độc quyền Ban Giám đốc (100% GĐ)
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-3 w-full md:w-auto">
          <button
            onClick={() => handleOpenCreateModal()}
            className="flex-1 md:flex-none px-4 py-2.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold rounded-xl shadow-sm shadow-blue-200 flex items-center justify-center space-x-2 transition-all text-sm"
          >
            <span>➕</span>
            <span>Tạo Đề Xuất Bảo Dưỡng</span>
          </button>
          <button
            onClick={loadData}
            disabled={loading}
            className="px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-medium transition-colors text-sm"
            title="Làm mới dữ liệu"
          >
            🔄
          </button>
        </div>
      </div>

      {/* THẺ CHỈ SỐ KPI TỔNG QUAN (CARDS) */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        {/* Tổng số xe */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="text-slate-400 text-xs font-semibold uppercase tracking-wider">Tổng Đội Xe</div>
          <div className="text-2xl font-black text-slate-800 mt-1">{summary.totalVehicles || 0} xe</div>
          <div className="text-xs text-slate-500 mt-1">Đầu kéo & Sơ mi rơ moóc</div>
        </div>

        {/* Đang chạy */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="text-emerald-600 text-xs font-bold uppercase tracking-wider flex items-center space-x-1">
            <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block animate-pulse"></span>
            <span>Đang Chạy (🟢)</span>
          </div>
          <div className="text-2xl font-black text-emerald-700 mt-1">{summary.activeCount || 0} xe</div>
          <div className="text-xs text-slate-500 mt-1">Sẵn sàng nhận cuốc</div>
        </div>

        {/* Đứng bãi */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="text-amber-600 text-xs font-bold uppercase tracking-wider flex items-center space-x-1">
            <span className="w-2 h-2 rounded-full bg-amber-500 inline-block"></span>
            <span>Đứng Bãi (🟡)</span>
          </div>
          <div className="text-2xl font-black text-amber-700 mt-1">{summary.idleCount || 0} xe</div>
          <div className="text-xs text-slate-500 mt-1">Chờ điều phối</div>
        </div>

        {/* Nằm xưởng */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="text-rose-600 text-xs font-bold uppercase tracking-wider flex items-center space-x-1">
            <span className="w-2 h-2 rounded-full bg-rose-500 inline-block"></span>
            <span>Nằm Xưởng (🔴)</span>
          </div>
          <div className="text-2xl font-black text-rose-700 mt-1">{summary.maintenanceCount || 0} xe</div>
          <div className="text-xs text-rose-500 font-semibold mt-1">Đang bảo dưỡng/sửa</div>
        </div>

        {/* Cảnh báo kỹ thuật / Hạn xe */}
        <div className="bg-white p-4 rounded-xl border border-amber-200 bg-amber-50/40 shadow-sm">
          <div className="text-amber-800 text-xs font-bold uppercase tracking-wider">Cảnh Báo Hạn Xe</div>
          <div className="text-2xl font-black text-amber-700 mt-1">{summary.totalAlertCount || 0} xe</div>
          <div className="text-xs text-amber-700 font-medium mt-1">Đăng kiểm/Bảo hiểm/Dầu</div>
        </div>

        {/* Đề xuất chờ duyệt */}
        <div className="bg-white p-4 rounded-xl border border-indigo-200 bg-indigo-50/40 shadow-sm">
          <div className="text-indigo-800 text-xs font-bold uppercase tracking-wider">Chờ GĐ Duyệt</div>
          <div className="text-2xl font-black text-indigo-700 mt-1">{summary.pendingProposalsCount || 0} đơn</div>
          <div className="text-xs text-indigo-600 font-medium mt-1">100% Giám đốc duyệt</div>
        </div>
      </div>

      {/* THANH CHUYỂN TAB */}
      <div className="flex border-b border-slate-200 bg-white px-4 pt-2 rounded-t-2xl">
        <button
          onClick={() => setActiveTab('vehicles')}
          className={`px-5 py-3 font-bold text-sm border-b-2 transition-all flex items-center space-x-2 ${
            activeTab === 'vehicles'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <span>🚛</span>
          <span>Ma Trận Tình Trạng Đội Xe & Cảnh Báo Hạn ({overview?.vehicles?.length || 0})</span>
        </button>

        <button
          onClick={() => setActiveTab('proposals')}
          className={`px-5 py-3 font-bold text-sm border-b-2 transition-all flex items-center space-x-2 relative ${
            activeTab === 'proposals'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <span>🔧</span>
          <span>Nhật Ký Đề Xuất & Duyệt Sửa Chữa ({proposals.length})</span>
          {summary.pendingProposalsCount > 0 && (
            <span className="bg-rose-500 text-white text-[10px] font-black px-1.5 py-0.5 rounded-full">
              {summary.pendingProposalsCount}
            </span>
          )}
        </button>
      </div>

      {/* NỘI DUNG TAB 1: MA TRẬN ĐỘI XE */}
      {activeTab === 'vehicles' && (
        <div className="bg-white rounded-b-2xl shadow-sm border border-slate-200 border-t-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-slate-50 text-slate-600 text-xs font-bold uppercase tracking-wider border-b border-slate-200">
                  <th className="py-3 px-4">Biển Số Xe</th>
                  <th className="py-3 px-4">Lái Xe Phụ Trách</th>
                  <th className="py-3 px-4">Trạng Thái Xe</th>
                  <th className="py-3 px-4">Số Km (ODO)</th>
                  <th className="py-3 px-4">Dầu Máy (10.000km)</th>
                  <th className="py-3 px-4">Hạn Đăng Kiểm</th>
                  <th className="py-3 px-4">Hạn Bảo Hiểm</th>
                  <th className="py-3 px-4 text-center">Thao Tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                {overview?.vehicles?.map((v) => {
                  const statusColors = {
                    ACTIVE: 'bg-emerald-50 text-emerald-700 border-emerald-200',
                    IDLE: 'bg-amber-50 text-amber-700 border-amber-200',
                    MAINTENANCE: 'bg-rose-50 text-rose-700 border-rose-200'
                  };

                  const statusLabels = {
                    ACTIVE: '🟢 Đang chạy',
                    IDLE: '🟡 Chờ việc',
                    MAINTENANCE: '🔴 Nằm xưởng'
                  };

                  return (
                    <tr key={v.id} className="hover:bg-slate-50/70 transition-colors">
                      {/* Biển số xe */}
                      <td className="py-3 px-4">
                        <div className="font-black text-slate-800 text-base font-mono">{v.plate_number}</div>
                        <div className="text-[11px] text-slate-400 font-normal">{v.vehicle_type === 'TRACTOR' ? 'Đầu kéo' : 'Rơ moóc'}</div>
                      </td>

                      {/* Lái xe phụ trách */}
                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-800">{v.driver_name || 'Chưa gán tài xế'}</div>
                        {v.driver_phone && <div className="text-xs text-slate-400 font-mono">{v.driver_phone}</div>}
                        {v.licenseAlert && v.licenseAlert.status !== 'UNKNOWN' && (
                          <div className={`text-[10px] mt-0.5 font-bold ${v.licenseAlert.color === 'red' ? 'text-rose-600' : v.licenseAlert.color === 'yellow' ? 'text-amber-600' : 'text-slate-400'}`}>
                            Bằng lái: {v.licenseAlert.label}
                          </div>
                        )}
                      </td>

                      {/* Trạng thái xe */}
                      <td className="py-3 px-4">
                        <select
                          value={v.status}
                          onChange={(e) => handleUpdateVehicleStatus(v.id, e.target.value)}
                          className={`text-xs font-bold px-2.5 py-1.5 rounded-lg border focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer ${
                            statusColors[v.status] || 'bg-slate-50 text-slate-700'
                          }`}
                        >
                          <option value="ACTIVE">🟢 Đang chạy</option>
                          <option value="IDLE">🟡 Chờ việc / Đứng bãi</option>
                          <option value="MAINTENANCE">🔴 Nằm xưởng bảo dưỡng</option>
                        </select>
                      </td>

                      {/* ODO Km */}
                      <td className="py-3 px-4">
                        {editingKmVehicleId === v.id ? (
                          <div className="flex items-center space-x-1.5">
                            <input
                              type="number"
                              value={editKmValue}
                              onChange={(e) => setEditKmValue(e.target.value)}
                              className="w-24 text-xs p-1 border rounded font-mono font-bold"
                              autoFocus
                            />
                            <button onClick={() => handleSaveKm(v.id)} className="text-xs px-2 py-1 bg-blue-600 text-white rounded font-bold">✓</button>
                            <button onClick={() => setEditingKmVehicleId(null)} className="text-xs px-2 py-1 bg-slate-200 text-slate-600 rounded">✕</button>
                          </div>
                        ) : (
                          <div className="flex items-center space-x-2">
                            <span className="font-bold font-mono text-slate-800">{v.current_km.toLocaleString('vi-VN')} km</span>
                            <button
                              onClick={() => {
                                setEditingKmVehicleId(v.id);
                                setEditKmValue(v.current_km);
                              }}
                              className="text-[11px] text-blue-600 hover:underline"
                              title="Cập nhật ODO"
                            >
                              ✏️
                            </button>
                          </div>
                        )}
                        <div className="text-[10px] text-slate-400 font-normal">Kỳ trước: {v.last_maintenance_km.toLocaleString('vi-VN')} km</div>
                      </td>

                      {/* Dầu máy */}
                      <td className="py-3 px-4">
                        <div className="w-36">
                          <div className="flex justify-between text-[11px] mb-1">
                            <span className="font-bold text-slate-700">{v.oilStatus.usagePercentage}%</span>
                            <span className={`font-semibold ${v.oilStatus.color === 'red' ? 'text-rose-600' : v.oilStatus.color === 'yellow' ? 'text-amber-600' : 'text-slate-500'}`}>
                              {v.oilStatus.label}
                            </span>
                          </div>
                          <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${
                                v.oilStatus.status === 'EXPIRED'
                                  ? 'bg-rose-500'
                                  : v.oilStatus.status === 'WARNING'
                                  ? 'bg-amber-500'
                                  : 'bg-emerald-500'
                              }`}
                              style={{ width: `${Math.min(100, v.oilStatus.usagePercentage)}%` }}
                            ></div>
                          </div>
                        </div>
                      </td>

                      {/* Hạn Đăng kiểm */}
                      <td className="py-3 px-4">
                        {v.inspection_expiry ? (
                          <div>
                            <div className="font-mono text-xs font-bold text-slate-700">{v.inspection_expiry}</div>
                            <span
                              className={`inline-block text-[10px] font-black px-2 py-0.5 rounded-full mt-0.5 ${
                                v.inspectionAlert.color === 'red'
                                  ? 'bg-rose-100 text-rose-700 border border-rose-200'
                                  : v.inspectionAlert.color === 'yellow'
                                  ? 'bg-amber-100 text-amber-700 border border-amber-200'
                                  : 'bg-slate-100 text-slate-600'
                              }`}
                            >
                              {v.inspectionAlert.label}
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-300 italic">Chưa có</span>
                        )}
                      </td>

                      {/* Hạn Bảo hiểm */}
                      <td className="py-3 px-4">
                        {v.insurance_expiry ? (
                          <div>
                            <div className="font-mono text-xs font-bold text-slate-700">{v.insurance_expiry}</div>
                            <span
                              className={`inline-block text-[10px] font-black px-2 py-0.5 rounded-full mt-0.5 ${
                                v.insuranceAlert.color === 'red'
                                  ? 'bg-rose-100 text-rose-700 border border-rose-200'
                                  : v.insuranceAlert.color === 'yellow'
                                  ? 'bg-amber-100 text-amber-700 border border-amber-200'
                                  : 'bg-slate-100 text-slate-600'
                              }`}
                            >
                              {v.insuranceAlert.label}
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-300 italic">Chưa có</span>
                        )}
                      </td>

                      {/* Thao tác */}
                      <td className="py-3 px-4 text-center">
                        <button
                          onClick={() => handleOpenCreateModal(v)}
                          className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-xs font-bold transition-colors"
                        >
                          ➕ Đề Xuất
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

      {/* NỘI DUNG TAB 2: DANH SÁCH ĐỀ XUẤT BẢO DƯỠNG */}
      {activeTab === 'proposals' && (
        <div className="bg-white rounded-b-2xl shadow-sm border border-slate-200 border-t-0 overflow-hidden">
          {proposals.length === 0 ? (
            <div className="p-12 text-center text-slate-400">
              <span className="text-4xl block mb-2">📋</span>
              <p className="font-medium text-sm">Chưa có đề xuất bảo dưỡng nào trong hệ thống.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="bg-slate-50 text-slate-600 text-xs font-bold uppercase tracking-wider border-b border-slate-200">
                    <th className="py-3 px-4">Biển Số Xe</th>
                    <th className="py-3 px-4">Hạng Mục & Tiêu Đề</th>
                    <th className="py-3 px-4">Loại Bảo Dưỡng</th>
                    <th className="py-3 px-4">Dự Toán Chi Phí</th>
                    <th className="py-3 px-4">Thực Tế Chi</th>
                    <th className="py-3 px-4">Người Đề Xuất</th>
                    <th className="py-3 px-4">Trạng Thái</th>
                    <th className="py-3 px-4 text-right">Phê Duyệt / Nghiệm Thu</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                  {proposals.map((p) => {
                    const statusBadges = {
                      PENDING: 'bg-amber-100 text-amber-800 border-amber-200',
                      APPROVED: 'bg-blue-100 text-blue-800 border-blue-200',
                      REJECTED: 'bg-rose-100 text-rose-800 border-rose-200',
                      COMPLETED: 'bg-emerald-100 text-emerald-800 border-emerald-200'
                    };

                    const statusLabels = {
                      PENDING: '⏳ Chờ GĐ Duyệt',
                      APPROVED: '🔧 Đã Duyệt (Vào Xưởng)',
                      REJECTED: '✕ GĐ Từ Chối',
                      COMPLETED: '✓ Đã Hoàn Thành'
                    };

                    const typeLabels = {
                      OIL_CHANGE: '🛢️ Thay dầu máy',
                      TIRE_REPLACEMENT: '🛞 Thay lốp',
                      PERIODIC: '📋 Định kỳ',
                      REPAIR: '🔨 Sửa chữa'
                    };

                    return (
                      <tr key={p.id} className="hover:bg-slate-50/70 transition-colors">
                        {/* Biển số xe */}
                        <td className="py-3 px-4">
                          <div className="font-black text-slate-800 font-mono text-base">{p.plate_number}</div>
                          <div className="text-[11px] text-slate-400">Tài xế: {p.driver_name || 'N/A'}</div>
                        </td>

                        {/* Tiêu đề & mô tả */}
                        <td className="py-3 px-4 max-w-xs">
                          <div className="font-bold text-slate-800">{p.title}</div>
                          {p.description && <div className="text-xs text-slate-500 mt-0.5 line-clamp-2">{p.description}</div>}
                          {p.rejection_reason && (
                            <div className="text-xs text-rose-600 font-semibold mt-1">Lý do từ chối: {p.rejection_reason}</div>
                          )}
                        </td>

                        {/* Loại */}
                        <td className="py-3 px-4 text-xs font-semibold text-slate-600">
                          {typeLabels[p.proposal_type] || p.proposal_type}
                        </td>

                        {/* Dự toán */}
                        <td className="py-3 px-4 font-mono font-bold text-slate-800">
                          {formatVND(p.estimated_cost)}
                        </td>

                        {/* Thực tế */}
                        <td className="py-3 px-4 font-mono font-bold text-emerald-700">
                          {p.actual_cost ? formatVND(p.actual_cost) : <span className="text-slate-300 font-normal">--</span>}
                        </td>

                        {/* Người đề xuất */}
                        <td className="py-3 px-4 text-xs text-slate-600">
                          <div className="font-bold">{p.proposed_by}</div>
                          <div className="text-[10px] text-slate-400">{p.created_at?.slice(0, 10)}</div>
                        </td>

                        {/* Trạng thái */}
                        <td className="py-3 px-4">
                          <span className={`inline-block text-xs font-bold px-2.5 py-1 rounded-full border ${statusBadges[p.status] || 'bg-slate-100'}`}>
                            {statusLabels[p.status] || p.status}
                          </span>
                          {p.approved_by && (
                            <div className="text-[10px] text-slate-400 mt-0.5">Duyệt: {p.approved_by}</div>
                          )}
                        </td>

                        {/* Thao tác Phê duyệt / Nghiệm thu */}
                        <td className="py-3 px-4 text-right">
                          {p.status === 'PENDING' && (
                            <div className="flex items-center justify-end space-x-2">
                              {isDirector ? (
                                <>
                                  <button
                                    onClick={() => handleApprove(p.id)}
                                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-sm shadow-emerald-200 transition-all flex items-center space-x-1"
                                    title="Phê duyệt đưa xe vào xưởng"
                                  >
                                    <span>✓ Duyệt (100% GĐ)</span>
                                  </button>
                                  <button
                                    onClick={() => handleReject(p.id)}
                                    className="px-2.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-lg text-xs font-bold transition-colors"
                                    title="Từ chối đề xuất"
                                  >
                                    ✕
                                  </button>
                                </>
                              ) : (
                                <span className="text-xs text-amber-600 italic font-medium">Chờ GĐ phê duyệt</span>
                              )}
                            </div>
                          )}

                          {p.status === 'APPROVED' && (
                            <button
                              onClick={() => handleOpenCompleteModal(p)}
                              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold shadow-sm shadow-blue-200 transition-all"
                            >
                              🏁 Nghiệm Thu Xuất Xưởng
                            </button>
                          )}

                          {p.status === 'COMPLETED' && (
                            <span className="text-xs text-emerald-600 font-bold">✓ Đã xuất xưởng</span>
                          )}

                          {p.status === 'REJECTED' && (
                            <span className="text-xs text-rose-500 font-medium">Đã từ chối</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* MODAL 1: TẠO ĐỀ XUẤT BẢO DƯỠNG */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl overflow-hidden border border-slate-100 animate-in fade-in zoom-in duration-150">
            <div className="px-6 py-4 bg-slate-900 text-white flex justify-between items-center">
              <div className="flex items-center space-x-2">
                <span className="text-xl">🔧</span>
                <h3 className="font-black text-lg">Tạo Đề Xuất Bảo Dưỡng / Sửa Chữa</h3>
              </div>
              <button onClick={() => setShowCreateModal(false)} className="text-slate-400 hover:text-white font-bold text-lg">✕</button>
            </div>

            <form onSubmit={handleCreateProposal} className="p-6 space-y-4">
              {/* Chọn xe */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Chọn Xe Cần Bảo Dưỡng *</label>
                <select
                  value={createForm.vehicle_id}
                  onChange={(e) => setCreateForm({ ...createForm, vehicle_id: e.target.value })}
                  className="w-full text-sm font-bold p-2.5 border rounded-xl bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                  required
                >
                  <option value="">-- Chọn đầu xe --</option>
                  {overview?.vehicles?.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.plate_number} ({v.driver_name || 'Chưa gán'} - ODO: {v.current_km.toLocaleString('vi-VN')} km)
                    </option>
                  ))}
                </select>
              </div>

              {/* Loại hình */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Loại Hình Bảo Dưỡng *</label>
                <select
                  value={createForm.proposal_type}
                  onChange={(e) => setCreateForm({ ...createForm, proposal_type: e.target.value })}
                  className="w-full text-sm p-2.5 border rounded-xl bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="PERIODIC">📋 Bảo dưỡng định kỳ</option>
                  <option value="OIL_CHANGE">🛢️ Thay dầu máy động cơ</option>
                  <option value="TIRE_REPLACEMENT">🛞 Thay lốp xe / Vỏ xe</option>
                  <option value="REPAIR">🔨 Sửa chữa đột xuất hỏng hóc</option>
                </select>
              </div>

              {/* Tiêu đề */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Tiêu Đề / Hạng Mục Cụ Thể *</label>
                <input
                  type="text"
                  placeholder="VD: Thay dầu máy động cơ Total Rubia 15W40 + Lọc nhớt"
                  value={createForm.title}
                  onChange={(e) => setCreateForm({ ...createForm, title: e.target.value })}
                  className="w-full text-sm p-2.5 border rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              {/* Dự toán chi phí */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Dự Toán Chi Phí (VND Nguyên)</label>
                <div className="relative">
                  <input
                    type="number"
                    placeholder="VD: 3500000"
                    value={createForm.estimated_cost}
                    onChange={(e) => setCreateForm({ ...createForm, estimated_cost: e.target.value })}
                    className="w-full text-sm font-bold font-mono p-2.5 border rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 pr-10"
                  />
                  <span className="absolute right-3 top-2.5 text-slate-400 font-bold text-sm">₫</span>
                </div>
                {createForm.estimated_cost && (
                  <div className="text-xs text-blue-600 font-bold mt-1">
                    = {formatVND(createForm.estimated_cost)}
                  </div>
                )}
              </div>

              {/* Mô tả chi tiết */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Mô Tả Hiện Trạng / Ghi Chú Kỹ Thuật</label>
                <textarea
                  rows="3"
                  placeholder="Ghi rõ tình trạng mòn lốp, tiếng kêu động cơ hoặc xưởng đề xuất làm..."
                  value={createForm.description}
                  onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
                  className="w-full text-sm p-2.5 border rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                ></textarea>
              </div>

              <div className="pt-3 border-t flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm rounded-xl"
                >
                  Hủy Bỏ
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm rounded-xl shadow-sm shadow-blue-200"
                >
                  Gửi Đề Xuất Cho Giám Đốc
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: NGHIỆM THU XUẤT XƯỞNG & GHI NHẬN CHI PHÍ */}
      {showCompleteModal && selectedProposalToComplete && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl overflow-hidden border border-slate-100 animate-in fade-in zoom-in duration-150">
            <div className="px-6 py-4 bg-emerald-700 text-white flex justify-between items-center">
              <div className="flex items-center space-x-2">
                <span className="text-xl">🏁</span>
                <h3 className="font-black text-lg">Nghiệm Thu Xuất Xưởng & Hạch Toán</h3>
              </div>
              <button onClick={() => setShowCompleteModal(false)} className="text-emerald-200 hover:text-white font-bold text-lg">✕</button>
            </div>

            <form onSubmit={handleCompleteProposal} className="p-6 space-y-4">
              <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 text-xs text-emerald-800">
                Xe: <strong className="font-mono text-sm">{selectedProposalToComplete.plate_number}</strong> | 
                Hạng mục: <strong>{selectedProposalToComplete.title}</strong>
              </div>

              {/* Chi phí thực tế */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Chi Phí Thực Tế Quyết Toán (VND Nguyên) *
                </label>
                <div className="relative">
                  <input
                    type="number"
                    value={completeForm.actual_cost}
                    onChange={(e) => setCompleteForm({ ...completeForm, actual_cost: e.target.value })}
                    className="w-full text-base font-black font-mono p-2.5 border rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 pr-10 text-emerald-800"
                    required
                  />
                  <span className="absolute right-3 top-2.5 text-slate-400 font-bold text-sm">₫</span>
                </div>
                {completeForm.actual_cost && (
                  <div className="text-xs text-emerald-700 font-bold mt-1">
                    = {formatVND(completeForm.actual_cost)} (Tự động ghi vào Chi Phí Cố Định)
                  </div>
                )}
              </div>

              {/* ODO khi xuất xưởng */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Số Km Đồng Hồ ODO Cập Nhật
                </label>
                <input
                  type="number"
                  value={completeForm.completion_km}
                  onChange={(e) => setCompleteForm({ ...completeForm, completion_km: e.target.value })}
                  className="w-full text-sm font-bold font-mono p-2.5 border rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <div className="text-[11px] text-slate-400 mt-0.5">Mốc ODO này sẽ dùng làm chuẩn tính chu kỳ bảo dưỡng kế tiếp</div>
              </div>

              {/* Ghi chú */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Ghi Chú Nghiệm Thu</label>
                <textarea
                  rows="2"
                  placeholder="Ghi nhận hóa đơn, xưởng sửa chữa, bảo hành linh kiện..."
                  value={completeForm.notes}
                  onChange={(e) => setCompleteForm({ ...completeForm, notes: e.target.value })}
                  className="w-full text-sm p-2.5 border rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                ></textarea>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl text-xs text-slate-500">
                💡 <strong>Hệ thống tự động thực hiện:</strong><br />
                1. Chuyển trạng thái xe từ 🔴 Nằm Xưởng sang 🟡 Chờ Việc (IDLE sẵn sàng chạy).<br />
                2. Tự động tạo 1 khoản Chi phí Cố định (Fixed Expense) trong hệ thống tài chính.<br />
                3. Phát tín hiệu SSE cập nhật bảng P&L Real-time tức thì.
              </div>

              <div className="pt-3 border-t flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setShowCompleteModal(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm rounded-xl"
                >
                  Hủy Bỏ
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm rounded-xl shadow-sm shadow-emerald-200"
                >
                  Xác Nhận Xuất Xưởng & Hạch Toán
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
