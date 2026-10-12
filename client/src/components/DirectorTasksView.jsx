import React, { useState, useEffect, useRef } from 'react';
import {
  Briefcase,
  PlusCircle,
  Clock,
  User,
  MessageSquare,
  CheckSquare,
  Send,
  X
} from 'lucide-react';
import {
  INITIAL_EXECUTIVE_TASKS,
  MOCK_TRIPS_DATA
} from '../data/mockBusinessData.js';
import TripDetailDrawer from './TripDetailDrawer.jsx';

export default function DirectorTasksView({ onNavigateTab, tasks: sharedTasks, onTasksChange, incomingDraft, onDraftConsumed }) {
  const [localTasks, setLocalTasks] = useState(INITIAL_EXECUTIVE_TASKS);
  const tasks = sharedTasks || localTasks;
  const setTasks = onTasksChange || setLocalTasks;
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const taskModalRef = useRef(null);
  useEffect(() => {
    if (!isModalOpen) return;
    const before = document.activeElement, overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    taskModalRef.current?.querySelector('button:not(:disabled)')?.focus();
    const handler = e => {
      if (e.key === 'Escape') { e.preventDefault(); setIsModalOpen(false); }
      if (e.key !== 'Tab') return;
      const items = [...taskModalRef.current.querySelectorAll('button:not(:disabled), input:not(:disabled), select, textarea, a[href], [tabindex="0"]')];
      const first = items[0], last = items.at(-1);
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
    };
    window.addEventListener('keydown', handler);
    return () => { document.body.style.overflow = overflow; window.removeEventListener('keydown', handler); if (before?.isConnected) before.focus(); };
  }, [isModalOpen]);
  const [selectedTrip, setSelectedTrip] = useState(null);
  const [directorNotesInput, setDirectorNotesInput] = useState({});

  const [newTaskForm, setNewTaskForm] = useState({
    title: '',
    issue_impact: '',
    related_info: '',
    assignee_name: 'Trần Văn Tuấn (Điều vận)',
    due_date: 'Hôm nay, 17:00',
    initial_note: ''
  });

  useEffect(() => {
    if (!incomingDraft) return;
    setNewTaskForm(prev => ({ ...prev, ...incomingDraft }));
    setIsModalOpen(true);
    onDraftConsumed?.();
  }, [incomingDraft]);

  const handleUpdateStatus = (taskId, newStatus) => {
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: newStatus } : t));
  };

  const handleAddNote = (taskId) => {
    const text = (directorNotesInput[taskId] || '').trim();
    if (!text) return;

    const now = new Date();
    const timeStr = new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(now);

    setTasks(prev => prev.map(t => {
      if (t.id === taskId) {
        return {
          ...t,
          notes: [...t.notes, { author: 'Giám Đốc', time: timeStr, text }]
        };
      }
      return t;
    }));
    setDirectorNotesInput(prev => ({ ...prev, [taskId]: '' }));
  };

  const handleCreateTask = (e) => {
    if (e) e.preventDefault();
    if (!newTaskForm.title.trim()) return;

    const newId = `TASK-${(tasks.length + 1).toString().padStart(2, '0')}`;
    const now = new Date();
    const timeStr = new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(now);

    const newTask = {
      id: newId,
      title: newTaskForm.title.trim(),
      issue_impact: newTaskForm.issue_impact.trim() || 'Giám Đốc giao việc trực tiếp.',
      related_type: newTaskForm.related_type || 'CUSTOM',
      related_code: newTaskForm.related_code || 'THEO DÕI',
      related_info: newTaskForm.related_info.trim() || 'Toàn đội xe',
      assignee_name: newTaskForm.assignee_name,
      assignee_role: newTaskForm.assignee_name.includes('Điều vận') ? 'Điều phối vận tải' : newTaskForm.assignee_name.includes('Kế toán') ? 'Kế toán chuyến' : 'Kỹ thuật đội xe',
      due_date: newTaskForm.due_date.trim() || 'Chưa đặt hạn',
      status: 'TODO',
      responses: [],
      notes: newTaskForm.initial_note.trim() ? [
        { author: 'Giám Đốc', time: timeStr, text: newTaskForm.initial_note.trim() }
      ] : []
    };

    setTasks(prev => [newTask, ...prev]);
    setIsModalOpen(false);
    setNewTaskForm({
      title: '',
      issue_impact: '',
      related_info: '',
      assignee_name: 'Trần Văn Tuấn (Điều vận)',
      due_date: 'Hôm nay, 17:00',
      initial_note: ''
    });
  };

  const filteredTasks = tasks.filter(t => {
    if (statusFilter === 'ALL') return true;
    return t.status === statusFilter;
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center space-x-2">
            <span>Danh Sách Công Việc Của Giám Đốc</span>
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Theo dõi việc liên quan tới chuyến, tài xế và xe. Bản dùng thử chưa gửi thông báo tới nhân sự.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <span className="text-[11px] text-slate-400 bg-slate-100 px-2.5 py-1 rounded-md border border-slate-200">
            Dữ liệu mẫu · Lưu trong phiên ứng dụng
          </span>
          <button
            onClick={() => setIsModalOpen(true)}
            className="px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold shadow-xs flex items-center space-x-1.5 transition-colors"
          >
            <PlusCircle className="w-3.5 h-3.5" />
            <span>+ Giao Việc Mới</span>
          </button>
        </div>
      </div>

      {/* Bộ lọc tab */}
      <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-1 text-xs">
        <button
          onClick={() => setStatusFilter('ALL')}
          className={`px-3 py-1 rounded-md font-medium transition-colors ${
            statusFilter === 'ALL' ? 'bg-white text-slate-900 shadow-2xs font-bold' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          Tất cả ({tasks.length})
        </button>
        <button
          onClick={() => setStatusFilter('TODO')}
          className={`px-3 py-1 rounded-md font-medium transition-colors ${
            statusFilter === 'TODO' ? 'bg-amber-100 text-amber-900 shadow-2xs font-bold' : 'text-slate-600 hover:text-amber-800'
          }`}
        >
          Chưa xử lý ({tasks.filter(t => t.status === 'TODO').length})
        </button>
        <button
          onClick={() => setStatusFilter('IN_PROGRESS')}
          className={`px-3 py-1 rounded-md font-medium transition-colors ${
            statusFilter === 'IN_PROGRESS' ? 'bg-blue-100 text-blue-900 shadow-2xs font-bold' : 'text-slate-600 hover:text-blue-800'
          }`}
        >
          Đang xử lý ({tasks.filter(t => t.status === 'IN_PROGRESS').length})
        </button>
        <button
          onClick={() => setStatusFilter('DONE')}
          className={`px-3 py-1 rounded-md font-medium transition-colors ${
            statusFilter === 'DONE' ? 'bg-emerald-100 text-emerald-900 shadow-2xs font-bold' : 'text-slate-600 hover:text-emerald-800'
          }`}
        >
          Hoàn tất ({tasks.filter(t => t.status === 'DONE').length})
        </button>
      </div>

      {/* Danh sách công việc */}
      <div className="space-y-4">
        {filteredTasks.map(task => {
          const isDone = task.status === 'DONE';
          const isInProgress = task.status === 'IN_PROGRESS';
          const isTodo = task.status === 'TODO';

          return (
            <div
              key={task.id}
              className={`p-4 rounded-xl border transition-all space-y-3 ${
                isDone ? 'bg-slate-50/70 border-slate-200 opacity-90' : 'bg-white border-slate-200 shadow-2xs'
              }`}
            >
              {/* Header card */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
                <div className="flex items-center space-x-2">
                  <span className="font-mono text-[11px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
                    {task.id}
                  </span>
                  <h3 className={`text-xs font-bold ${isDone ? 'line-through text-slate-500' : 'text-slate-900'}`}>
                    {task.title}
                  </h3>
                </div>

                <div className="flex items-center space-x-2">
                  <span className="text-[11px] text-slate-500 flex items-center space-x-1">
                    <Clock className="w-3 h-3 text-slate-400" />
                    <span>Hạn: <b>{task.due_date}</b></span>
                  </span>

                  <div className="inline-flex rounded-md border border-slate-200 bg-white p-0.5 text-[10px]">
                    <button
                      onClick={() => handleUpdateStatus(task.id, 'TODO')}
                      className={`px-2 py-0.5 rounded ${isTodo ? 'bg-amber-100 text-amber-900 font-bold' : 'text-slate-600'}`}
                    >
                      Chưa xử lý
                    </button>
                    <button
                      onClick={() => handleUpdateStatus(task.id, 'IN_PROGRESS')}
                      className={`px-2 py-0.5 rounded ${isInProgress ? 'bg-blue-100 text-blue-900 font-bold' : 'text-slate-600'}`}
                    >
                      Đang xử lý
                    </button>
                    <button
                      onClick={() => handleUpdateStatus(task.id, 'DONE')}
                      className={`px-2 py-0.5 rounded ${isDone ? 'bg-emerald-100 text-emerald-900 font-bold' : 'text-slate-600'}`}
                    >
                      Hoàn tất
                    </button>
                  </div>
                </div>
              </div>

              {/* Thân card */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 text-xs">
                {/* Trái: Vấn đề & Phụ trách */}
                <div className="lg:col-span-7 space-y-2">
                  <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-1.5">
                    <span className="font-semibold text-slate-800 text-[11px] block">Vấn đề & Ảnh hưởng:</span>
                    <p className="text-slate-600 leading-relaxed text-[11px]">{task.issue_impact}</p>
                    <div className="flex items-center space-x-2 pt-1 border-t border-slate-200 text-[11px]">
                      <span className="text-slate-500">Đối tượng:</span>
                      <span className="font-mono font-semibold text-slate-800">{task.related_info}</span>
                      {task.related_type === 'TRIP' && (
                        <button
                          onClick={() => {
                            const trip = MOCK_TRIPS_DATA.find(t => t.trip_code === task.related_code);
                            if (trip) setSelectedTrip(trip);
                          }}
                          className="text-blue-700 hover:underline font-bold text-[10px]"
                        >
                          Xem cuốc →
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-2 rounded-lg bg-slate-50 text-[11px]">
                    <span className="text-slate-600">Người phụ trách: <b className="text-slate-900">{task.assignee_name}</b></span>
                    <span className="text-slate-400 italic">({task.assignee_role})</span>
                  </div>
                </div>

                {/* Phải: Phản hồi & Chỉ đạo */}
                <div className="lg:col-span-5 space-y-2.5">
                  {/* Phản hồi */}
                  <div>
                    <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block mb-1">
                      Phản hồi từ nhân sự:
                    </span>
                    {task.responses.length > 0 ? (
                      <div className="space-y-1.5">
                        {task.responses.map((r, rIdx) => (
                          <div key={rIdx} className="p-2 rounded-lg bg-blue-50 border border-blue-200 text-[11px]">
                            <div className="flex justify-between font-semibold text-blue-900 text-[10px]">
                              <span>{r.author}</span>
                              <span className="font-mono text-slate-400">{r.time}</span>
                            </div>
                            <p className="text-slate-700 mt-0.5">{r.text}</p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-[11px] text-slate-400 italic">Chưa có phản hồi mới.</p>
                    )}
                  </div>

                  {/* Chỉ đạo */}
                  <div>
                    <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block mb-1">
                      Chỉ đạo của Giám Đốc ({task.notes.length}):
                    </span>
                    {task.notes.length > 0 && (
                      <div className="space-y-1 mb-1.5">
                        {task.notes.map((n, nIdx) => (
                          <div key={nIdx} className="p-1.5 rounded bg-amber-50 border border-amber-200 text-[11px]">
                            <span className="font-bold text-amber-900 text-[10px] mr-1">[{n.time}]</span>
                            <span>{n.text}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="flex items-center space-x-1.5">
                      <input
                        type="text"
                        value={directorNotesInput[task.id] || ''}
                        onChange={e => setDirectorNotesInput(prev => ({ ...prev, [task.id]: e.target.value }))}
                        onKeyDown={e => e.key === 'Enter' && handleAddNote(task.id)}
                        placeholder="Thêm chỉ đạo..."
                        className="flex-1 bg-white border border-slate-300 rounded-lg px-2.5 py-1 text-xs focus:outline-hidden"
                      />
                      <button
                        onClick={() => handleAddNote(task.id)}
                        className="px-2.5 py-1 bg-slate-900 text-white rounded-lg text-xs font-semibold"
                      >
                        Gửi
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal Tạo Việc Mới */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-2xs">
          <div ref={taskModalRef} role="dialog" aria-modal="true" aria-label="Giao việc mới" className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-lg p-5 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-bold text-slate-900">Giao Việc Mới Cho Nhân Sự</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>

            {newTaskForm.related_info && <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs text-slate-700"><b>Đối tượng & phạm vi báo cáo</b><p className="mt-1">{newTaskForm.related_info}</p></div>}
            <form onSubmit={handleCreateTask} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-700 font-semibold mb-1">Tiêu đề công việc *</label>
                <input
                  type="text"
                  required
                  value={newTaskForm.title}
                  onChange={e => setNewTaskForm(prev => ({ ...prev, title: e.target.value }))}
                  placeholder="Ví dụ: Kiểm tra lại chi phí van hơi xe 15H-04255"
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">Vấn đề và ảnh hưởng</label>
                <textarea
                  rows="2"
                  value={newTaskForm.issue_impact}
                  onChange={e => setNewTaskForm(prev => ({ ...prev, issue_impact: e.target.value }))}
                  placeholder="Mô tả nguyên nhân..."
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:outline-hidden"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Người phụ trách</label>
                  <select
                    value={newTaskForm.assignee_name}
                    onChange={e => setNewTaskForm(prev => ({ ...prev, assignee_name: e.target.value }))}
                    className="w-full border border-slate-300 rounded-lg px-2.5 py-2 text-slate-900 bg-white focus:outline-hidden"
                  >
                    <option value="Trần Văn Tuấn (Điều vận)">Trần Văn Tuấn (Điều vận)</option>
                    <option value="Lê Thu Hương (Kế toán)">Lê Thu Hương (Kế toán)</option>
                    <option value="Nguyễn Văn Hùng (Kỹ thuật)">Nguyễn Văn Hùng (Kỹ thuật)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Hạn xử lý</label>
                  <input
                    type="text"
                    value={newTaskForm.due_date}
                    onChange={e => setNewTaskForm(prev => ({ ...prev, due_date: e.target.value }))}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:outline-hidden"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">Chỉ đạo ban đầu của Giám Đốc</label>
                <input
                  type="text"
                  value={newTaskForm.initial_note}
                  onChange={e => setNewTaskForm(prev => ({ ...prev, initial_note: e.target.value }))}
                  placeholder="Ghi chú yêu cầu..."
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:outline-hidden"
                />
              </div>

              <div className="flex items-center justify-end space-x-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-3.5 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-medium"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg font-semibold"
                >
                  Xác Nhận & Giao Việc
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Drawer */}
      <TripDetailDrawer
        selectedTrip={selectedTrip}
        onClose={() => setSelectedTrip(null)}
        onPrev={() => {}}
        onNext={() => {}}
        hasPrev={false}
        hasNext={false}
      />
    </div>
  );
}
