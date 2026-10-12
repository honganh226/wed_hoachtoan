/**
 * ============================================================
 * AI CHAT BOX - TRỢ LÝ ẢO NỘI BỘ VẬN TẢI CONTAINER
 * ============================================================
 * Task 6.3: Khung chat AI tiếng Việt 24/7 với Bộ lọc Phân quyền
 * Bảo mật (AI Guardrails) ở tầng Backend.
 * ============================================================
 */
import React, { useState, useEffect, useRef } from 'react';
import { askAiChatApi, fetchAiSuggestionsApi } from '../services/api.js';

export default function AiChatBox({ currentUser, isOpen, onClose }) {
  const [messages, setMessages] = useState([
    {
      id: 'welcome',
      sender: 'ai',
      text: `Xin chào ${currentUser?.full_name || 'bạn'}! Tôi là **Trợ Lý Ảo Vận Tải AI** trực thuộc Hệ thống Điều Vận Container WED_HOACHTOAN. 

Tôi được trang bị bộ lọc bảo mật **AI Guardrails** và có thể giải đáp thông tin về:
- 🚛 Tình trạng đội xe, cảnh báo hạn đăng kiểm, bảo hiểm, chu kỳ thay dầu máy.
- 📋 Chuyến xe, tra cứu tuyến đường và cảnh báo đọng phơi EIR.
- 📦 Chuẩn kiểm tra số container ISO 6346 và nghiệp vụ cont kẹp 2x20'.
${currentUser?.role === 'DIRECTOR' ? '- 📊 Báo cáo tài chính Real-time P&L, dòng tiền thực thu vs công nợ.' : ''}
${currentUser?.role === 'DRIVER' ? '- 💵 Tra cứu chuyến xe, tạm ứng và thu nhập cá nhân của bạn.' : ''}

Bạn có thể chọn câu hỏi gợi ý bên dưới hoặc gõ trực tiếp câu hỏi nhé!`,
      blocked: false,
      timestamp: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
    }
  ]);

  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const messagesEndRef = useRef(null);

  // Cuộn xuống tin nhắn mới nhất
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
    }
  }, [messages, isOpen]);

  // Lấy câu hỏi gợi ý theo vai trò
  useEffect(() => {
    async function loadSuggestions() {
      try {
        const res = await fetchAiSuggestionsApi();
        if (res.success && Array.isArray(res.data)) {
          setSuggestions(res.data);
        }
      } catch (err) {
        console.warn('Lỗi tải gợi ý câu hỏi:', err);
      }
    }
    if (isOpen) {
      loadSuggestions();
    }
  }, [isOpen, currentUser?.role]);

  // Gửi tin nhắn
  const handleSendMessage = async (textToSend = null) => {
    const text = (textToSend !== null ? textToSend : inputText).trim();
    if (!text || loading) return;

    const userMessageId = 'usr_' + Date.now();
    const userMsg = {
      id: userMessageId,
      sender: 'user',
      text,
      timestamp: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
    };

    setMessages((prev) => [...prev, userMsg]);
    if (textToSend === null) setInputText('');
    setLoading(true);

    try {
      const history = messages
        .filter((m) => m.id !== 'welcome')
        .slice(-6)
        .map((m) => ({ role: m.sender === 'user' ? 'user' : 'model', text: m.text }));

      const res = await askAiChatApi(text, history);

      if (res.success && res.data) {
        const aiMsg = {
          id: 'ai_' + Date.now(),
          sender: 'ai',
          text: res.data.reply,
          blocked: res.data.blocked || false,
          category: res.data.category || null,
          timestamp: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
        };
        setMessages((prev) => [...prev, aiMsg]);
      } else {
        setMessages((prev) => [
          ...prev,
          {
            id: 'err_' + Date.now(),
            sender: 'ai',
            text: `⚠️ Lỗi: ${res.error || 'Không thể nhận phản hồi từ Trợ lý ảo.'}`,
            blocked: false,
            timestamp: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
          }
        ]);
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: 'err_' + Date.now(),
          sender: 'ai',
          text: `⚠️ Lỗi kết nối: ${err.message || 'Không thể liên lạc với máy chủ AI.'}`,
          blocked: false,
          timestamp: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
        }
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const roleLabels = {
    DIRECTOR: 'Giám Đốc (Toàn Quyền)',
    ACCOUNTANT: 'Kế Toán (Tác Nghiệp)',
    AREA_MANAGER: 'Quản Lý Khu',
    DRIVER: 'Lái Xe'
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 sm:inset-auto sm:right-6 sm:bottom-6 sm:w-[480px] sm:h-[640px] bg-white sm:rounded-3xl shadow-2xl z-50 flex flex-col border border-slate-200 overflow-hidden animate-in fade-in slide-in-from-bottom-5 duration-200">
      {/* HEADER */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white p-4 flex items-center justify-between shadow-md">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-2xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-xl shadow-inner">
            🤖
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h3 className="font-black text-sm tracking-wide">Trợ Lý Ảo Vận Tải AI</h3>
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
            </div>
            <div className="flex items-center space-x-1.5 text-[11px] text-slate-300 font-medium">
              <span className="text-indigo-300 font-bold">🛡️ RBAC Guard:</span>
              <span className="bg-white/10 px-1.5 py-0.5 rounded text-[10px] text-indigo-200 font-mono">
                {roleLabels[currentUser?.role] || currentUser?.role}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-1">
          <button
            onClick={() => setMessages([messages[0]])}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg transition-colors text-xs"
            title="Xóa đoạn chat cũ"
          >
            🧹
          </button>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg transition-colors font-bold text-sm"
            title="Đóng chat"
          >
            ✕
          </button>
        </div>
      </div>

      {/* DANH SÁCH TIN NHẮN */}
      <div className="flex-1 p-4 overflow-y-auto space-y-4 bg-slate-50/70 text-xs">
        {messages.map((m) => {
          const isUser = m.sender === 'user';
          return (
            <div
              key={m.id}
              className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-3 leading-relaxed ${
                  isUser
                    ? 'bg-blue-600 text-white rounded-tr-none shadow-sm'
                    : m.blocked
                    ? 'bg-rose-50 border border-rose-200 text-rose-900 rounded-tl-none shadow-sm'
                    : 'bg-white border border-slate-200 text-slate-800 rounded-tl-none shadow-sm'
                }`}
              >
                {/* Header nhãn cảnh báo nếu tin nhắn bị chặn */}
                {!isUser && m.blocked && (
                  <div className="flex items-center space-x-1.5 text-rose-700 font-black mb-1.5 text-[11px] pb-1 border-b border-rose-200">
                    <span>🚨</span>
                    <span>AI GUARDRAILS - CHẶN BẢO MẬT</span>
                  </div>
                )}

                {/* Nội dung tin nhắn (hỗ trợ hiển thị ngắt dòng và markdown cơ bản) */}
                <div className="whitespace-pre-wrap font-sans">
                  {m.text}
                </div>
              </div>

              <span className="text-[10px] text-slate-400 mt-1 px-1">
                {m.timestamp}
              </span>
            </div>
          );
        })}

        {loading && (
          <div className="flex items-center space-x-2 text-slate-400 text-xs py-2">
            <span className="animate-spin text-base">⚙️</span>
            <span>Trợ lý AI đang tra cứu dữ liệu vận tải và kiểm tra bảo mật...</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* THANH GỢI Ý CÂU HỎI NHANH */}
      {suggestions.length > 0 && (
        <div className="px-3 py-2 bg-slate-100/80 border-t border-slate-200 overflow-x-auto whitespace-nowrap flex space-x-2 scrollbar-none">
          {suggestions.map((sug, idx) => (
            <button
              key={idx}
              onClick={() => handleSendMessage(sug)}
              className="text-[11px] font-semibold bg-white hover:bg-indigo-50 hover:text-indigo-700 border border-slate-200 text-slate-600 px-3 py-1.5 rounded-full shrink-0 transition-colors shadow-2xs"
            >
              {sug}
            </button>
          ))}
        </div>
      )}

      {/* INPUT NHẬP LIỆU */}
      <div className="p-3 bg-white border-t border-slate-200">
        <div className="flex items-center space-x-2 bg-slate-100 rounded-2xl px-3 py-1.5 border border-slate-200 focus-within:border-blue-500 focus-within:bg-white transition-all">
          <input
            type="text"
            placeholder="Hỏi AI về xe, chuyến, cước, cont kẹp, ODO..."
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={loading}
            className="flex-1 bg-transparent text-xs text-slate-800 placeholder-slate-400 focus:outline-none py-1.5"
          />
          <button
            onClick={() => handleSendMessage()}
            disabled={loading || !inputText.trim()}
            className="w-8 h-8 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white flex items-center justify-center font-bold text-sm shadow-sm transition-all"
            title="Gửi câu hỏi"
          >
            ➤
          </button>
        </div>
        <div className="text-[10px] text-center text-slate-400 mt-1.5 font-medium">
          🔒 Bảo mật RBAC 4 cấp: Lái xe không xem lương người khác, dữ liệu toàn hệ thống được kiểm toán.
        </div>
      </div>
    </div>
  );
}
