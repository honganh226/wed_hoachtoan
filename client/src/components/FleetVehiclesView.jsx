import React, { useState, useEffect, useMemo } from 'react';
import { fetchFleetVehiclesApi } from '../services/api';

export default function FleetVehiclesView({ currentUser }) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({ summary: {}, vehicles: [] });
  const [searchTerm, setSearchTerm] = useState('');
  const [filterAlertOnly, setFilterAlertOnly] = useState(false);
  const [error, setError] = useState(null);

  const loadVehicles = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetchFleetVehiclesApi();
      if (res && res.success) {
        setData(res.data || { summary: {}, vehicles: [] });
      } else {
        setError(res?.error?.message || 'Không thể tải danh sách đội xe');
      }
    } catch (err) {
      setError(err?.message || 'Lỗi kết nối khi tải danh sách xe');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadVehicles();
  }, []);

  const filteredVehicles = useMemo(() => {
    let list = data.vehicles || [];
    if (filterAlertOnly) {
      list = list.filter((v) => v.hasAlert);
    }
    if (searchTerm.trim()) {
      const q = searchTerm.trim().toLowerCase();
      list = list.filter(
        (v) =>
          (v.plate_number && v.plate_number.toLowerCase().includes(q)) ||
          (v.driver_name && v.driver_name.toLowerCase().includes(q)) ||
          (v.vehicle_type && v.vehicle_type.toLowerCase().includes(q))
      );
    }
    return list;
  }, [data.vehicles, searchTerm, filterAlertOnly]);

  const summary = data.summary || {};

  const renderBadge = (alert) => {
    if (!alert || !alert.date) {
      return <span style={{ color: '#94a3b8', fontSize: '0.8rem' }}>Chưa có</span>;
    }
    const colorStyles = {
      red: { background: '#fee2e2', color: '#991b1b', border: '1px solid #fecaca' },
      yellow: { background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a' },
      green: { background: '#dcfce7', color: '#166534', border: '1px solid #bbf7d0' },
      gray: { background: '#f1f5f9', color: '#475569', border: '1px solid #e2e8f0' }
    };
    const style = colorStyles[alert.color] || colorStyles.gray;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
        <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>{alert.date}</span>
        <span
          style={{
            display: 'inline-block',
            padding: '1px 6px',
            borderRadius: '4px',
            fontSize: '0.72rem',
            fontWeight: 500,
            width: 'fit-content',
            ...style
          }}
        >
          {alert.label}
        </span>
      </div>
    );
  };

  return (
    <div style={{ padding: '16px', maxWidth: '1280px', margin: '0 auto' }}>
      {/* HEADER */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          gap: '12px',
          marginBottom: '20px'
        }}
      >
        <div>
          <h2 style={{ margin: '0 0 6px 0', fontSize: '1.4rem', fontWeight: 700, color: '#0f172a' }}>
            🚛 Danh Mục Đội Xe & Hạn Giấy Tờ
          </h2>
          <p style={{ margin: 0, fontSize: '0.9rem', color: '#64748b' }}>
            Theo dõi danh sách xe, tài xế phụ trách và giám sát thời hạn đăng kiểm, bảo hiểm, bằng lái.
          </p>
        </div>
        <button
          onClick={loadVehicles}
          disabled={loading}
          style={{
            padding: '8px 14px',
            borderRadius: '6px',
            border: '1px solid #cbd5e1',
            background: '#ffffff',
            color: '#334155',
            fontSize: '0.875rem',
            fontWeight: 600,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px'
          }}
        >
          🔄 {loading ? 'Đang tải...' : 'Làm mới'}
        </button>
      </div>

      {/* KPI METRIC CARDS */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: '12px',
          marginBottom: '20px'
        }}
      >
        <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px' }}>
          <div style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 500 }}>Tổng số đầu xe</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#0f172a', marginTop: '4px' }}>
            {summary.totalVehicles || 0}
          </div>
        </div>
        <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px' }}>
          <div style={{ fontSize: '0.8rem', color: '#166534', fontWeight: 500 }}>Đang hoạt động</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#16a34a', marginTop: '4px' }}>
            {summary.activeCount || 0}
          </div>
        </div>
        <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px' }}>
          <div style={{ fontSize: '0.8rem', color: '#854d0e', fontWeight: 500 }}>Chờ lệnh / Rảnh</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#ca8a04', marginTop: '4px' }}>
            {summary.idleCount || 0}
          </div>
        </div>
        <div
          style={{
            background: summary.alertCount > 0 ? '#fef2f2' : '#ffffff',
            border: summary.alertCount > 0 ? '1px solid #fecaca' : '1px solid #e2e8f0',
            borderRadius: '8px',
            padding: '12px'
          }}
        >
          <div style={{ fontSize: '0.8rem', color: summary.alertCount > 0 ? '#b91c1c' : '#64748b', fontWeight: 500 }}>
            Cảnh báo giấy tờ
          </div>
          <div
            style={{
              fontSize: '1.5rem',
              fontWeight: 700,
              color: summary.alertCount > 0 ? '#dc2626' : '#0f172a',
              marginTop: '4px'
            }}
          >
            {summary.alertCount || 0}
          </div>
        </div>
      </div>

      {/* FILTER BAR */}
      <div
        style={{
          display: 'flex',
          gap: '12px',
          alignItems: 'center',
          flexWrap: 'wrap',
          marginBottom: '16px',
          background: '#f8fafc',
          padding: '12px',
          borderRadius: '8px',
          border: '1px solid #e2e8f0'
        }}
      >
        <input
          type="text"
          placeholder="Tìm theo biển số, tài xế..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{
            padding: '8px 12px',
            borderRadius: '6px',
            border: '1px solid #cbd5e1',
            fontSize: '0.875rem',
            flex: '1 1 200px',
            minWidth: '180px'
          }}
        />
        <label
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '0.875rem',
            color: '#334155',
            cursor: 'pointer',
            userSelect: 'none'
          }}
        >
          <input
            type="checkbox"
            checked={filterAlertOnly}
            onChange={(e) => setFilterAlertOnly(e.target.checked)}
            style={{ cursor: 'pointer' }}
          />
          Chỉ xem xe sắp/đã quá hạn giấy tờ ({summary.alertCount || 0})
        </label>
      </div>

      {/* ERROR NOTICE */}
      {error && (
        <div
          style={{
            padding: '12px 16px',
            marginBottom: '16px',
            borderRadius: '6px',
            background: '#fee2e2',
            color: '#991b1b',
            border: '1px solid #fecaca',
            fontSize: '0.875rem'
          }}
        >
          ⚠️ {error}
        </div>
      )}

      {/* TABLE / CARD LIST */}
      <div
        style={{
          background: '#ffffff',
          borderRadius: '8px',
          border: '1px solid #e2e8f0',
          overflowX: 'auto',
          boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
        }}
      >
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '680px' }}>
          <thead>
            <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569', fontSize: '0.8rem' }}>
              <th style={{ padding: '12px 16px', fontWeight: 600 }}>Biển số</th>
              <th style={{ padding: '12px 16px', fontWeight: 600 }}>Loại xe / Ghi chú</th>
              <th style={{ padding: '12px 16px', fontWeight: 600 }}>Tài xế phụ trách</th>
              <th style={{ padding: '12px 16px', fontWeight: 600 }}>Hạn Đăng kiểm</th>
              <th style={{ padding: '12px 16px', fontWeight: 600 }}>Hạn Bảo hiểm</th>
              <th style={{ padding: '12px 16px', fontWeight: 600 }}>Hạn Bằng lái</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} style={{ padding: '32px', textAlign: 'center', color: '#64748b' }}>
                  ⏳ Đang tải thông tin đội xe...
                </td>
              </tr>
            ) : filteredVehicles.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ padding: '32px', textAlign: 'center', color: '#64748b' }}>
                  {searchTerm || filterAlertOnly ? 'Không tìm thấy xe nào khớp với bộ lọc' : 'Chưa có thông tin xe trong hệ thống'}
                </td>
              </tr>
            ) : (
              filteredVehicles.map((v) => (
                <tr
                  key={v.id}
                  style={{
                    borderBottom: '1px solid #f1f5f9',
                    background: v.hasAlert ? '#fffbf5' : '#ffffff',
                    fontSize: '0.875rem',
                    color: '#1e293b'
                  }}
                >
                  <td style={{ padding: '12px 16px', fontWeight: 700, color: '#0f172a' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span>🚛 {v.plate_number}</span>
                      {v.hasAlert && <span title="Có giấy tờ cần gia hạn" style={{ fontSize: '0.9rem' }}>⚠️</span>}
                    </div>
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ fontWeight: 500 }}>{v.vehicle_type || 'Đầu kéo'}</div>
                    {v.notes && <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{v.notes}</div>}
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    {v.driver_name ? (
                      <div>
                        <div style={{ fontWeight: 600, color: '#0f172a' }}>👤 {v.driver_name}</div>
                        {v.driver_phone && (
                          <div style={{ fontSize: '0.75rem', color: '#64748b' }}>📞 {v.driver_phone}</div>
                        )}
                      </div>
                    ) : (
                      <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>Chưa gán</span>
                    )}
                  </td>
                  <td style={{ padding: '12px 16px' }}>{renderBadge(v.inspectionAlert)}</td>
                  <td style={{ padding: '12px 16px' }}>{renderBadge(v.insuranceAlert)}</td>
                  <td style={{ padding: '12px 16px' }}>{renderBadge(v.licenseAlert)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
