/**
 * Service quản lý Tiền phơi trả hộ chủ hàng, Hoàn tiền phơi & Nhắc việc đến hạn (EIR Advance Service)
 * Quy tắc (Codex Plan 28/10/2026):
 * - Tiền phơi trả hộ chủ hàng tách biệt hoàn toàn với phí nâng/hạ công ty chịu.
 * - Không tính vào doanh thu cước, không trừ vào chi phí làm giảm lãi chuyến.
 * - Trạng thái: CHUA_HOAN, HOAN_MOT_PHAN, DA_HOAN, GHI_CHU_NGUON (ví dụ: "K MẤT").
 * - Chọn TƯƠI khi tạo: tự động tạo giao dịch hoàn đủ (100%) ngay ngày trả hộ.
 * - Cột cuối tích chọn hoàn: ghi nhận giao dịch hoàn một phần hoặc toàn bộ số dư còn lại.
 * - Nhắc việc theo ngày hẹn hoàn (due_date) so với ngày hiện tại theo múi giờ Asia/Ho_Chi_Minh.
 * - Không tự đặt mặc định 7 hay 30 ngày nếu người dùng chưa chọn.
 */
import crypto from 'crypto';
import { db } from '../db/database.js';
import { toIntVnd, getVietnamTodayIso, evaluateEirAdvanceState, isValidCalendarDate } from '../utils/tripFinancials.js';
import { invalidateExcelMonthCache } from './excelMonthService.js';

function recalculateAdvanceTotals(advanceId, actor = 'system') {
  const advance = db.prepare('SELECT * FROM eir_advances WHERE id = ?').get(advanceId);
  if (!advance) return null;

  const activeRefunds = db.prepare(`
    SELECT * FROM eir_refunds
    WHERE advance_id = ? AND status = 'ACTIVE'
    ORDER BY refund_date ASC, created_at ASC
  `).all(advanceId);

  const refundedSum = activeRefunds.reduce((acc, r) => acc + toIntVnd(r.refund_amount), 0);
  const advanceAmt = toIntVnd(advance.advance_amount);
  const isNonFinancial = Boolean(advance.is_non_financial_note);

  let status = 'CHUA_HOAN';
  let completedDate = null;

  if (isNonFinancial || (advanceAmt === 0 && advance.raw_source_value)) {
    status = 'GHI_CHU_NGUON';
  } else if (advanceAmt > 0 && refundedSum >= advanceAmt) {
    status = 'DA_HOAN';
    completedDate = activeRefunds.length > 0
      ? activeRefunds[activeRefunds.length - 1].refund_date
      : advance.advance_date;
  } else if (refundedSum > 0 && refundedSum < advanceAmt) {
    status = 'HOAN_MOT_PHAN';
  }

  const nowIso = new Date().toISOString();
  db.prepare(`
    UPDATE eir_advances
    SET refunded_amount = ?,
        refund_status = ?,
        completed_date = ?,
        updated_at = ?
    WHERE id = ?
  `).run(refundedSum, status, completedDate, nowIso, advanceId);

  // Đồng bộ cờ eir_paid_status trên bảng trips nếu chuyến đó ở trong bảng trips
  syncTripEirStatus(advance.trip_id, nowIso);

  return getAdvanceById(advanceId);
}

export function syncTripEirStatus(tripId, nowIso = new Date().toISOString()) {
  if (!tripId) return;
  const advances = db.prepare('SELECT * FROM eir_advances WHERE trip_id = ?').all(String(tripId));
  const financialAdvances = advances.filter((a) => !a.is_non_financial_note && toIntVnd(a.advance_amount) > 0);
  if (financialAdvances.length === 0) return;

  const allCompleted = financialAdvances.every((a) => toIntVnd(a.refunded_amount) >= toIntVnd(a.advance_amount));
  const anyRefunded = financialAdvances.some((a) => toIntVnd(a.refunded_amount) > 0);
  const eirPaidStatus = allCompleted ? 'DA_TT' : anyRefunded ? 'HOAN_MOT_PHAN' : 'CHUA_TT';

  try {
    db.prepare('UPDATE trips SET eir_paid_status = ?, updated_at = ? WHERE id = ?').run(eirPaidStatus, nowIso, String(tripId));
  } catch (_e) {
    // tripId might be an Excel row ID like T1-26-R10, which is not in trips table
  }
}

export function getAdvanceById(advanceId) {
  const row = db.prepare('SELECT * FROM eir_advances WHERE id = ?').get(advanceId);
  if (!row) return null;
  const refunds = db.prepare('SELECT * FROM eir_refunds WHERE advance_id = ? ORDER BY created_at DESC').all(advanceId);
  const history = db.prepare('SELECT * FROM eir_advance_history WHERE advance_id = ? ORDER BY created_at DESC').all(advanceId);
  const state = evaluateEirAdvanceState(row);
  return {
    ...row,
    ...state,
    remaining_amount: state.balance_due,
    reference_note: row.reference_code || row.notes || null,
    phoi_reference_note: row.reference_code || row.notes || null,
    refunds,
    history,
  };
}

export function getAdvancesForTripMap() {
  const advances = db.prepare('SELECT * FROM eir_advances ORDER BY created_at ASC').all();
  const refunds = db.prepare("SELECT * FROM eir_refunds WHERE status = 'ACTIVE' ORDER BY refund_date ASC, created_at ASC").all();
  const refundsByAdvance = new Map();
  for (const r of refunds) {
    if (!refundsByAdvance.has(r.advance_id)) refundsByAdvance.set(r.advance_id, []);
    refundsByAdvance.get(r.advance_id).push(r);
  }

  const todayVn = getVietnamTodayIso();
  const byTrip = new Map();
  for (const adv of advances) {
    const key = String(adv.trip_id);
    if (!byTrip.has(key)) byTrip.set(key, []);
    const state = evaluateEirAdvanceState(adv, todayVn);
    byTrip.get(key).push({
      ...adv,
      ...state,
      refunds: refundsByAdvance.get(adv.id) || [],
    });
  }
  return byTrip;
}

export function summarizeTripAdvances(tripId, advancesList = null) {
  const list = advancesList ?? (getAdvancesForTripMap().get(String(tripId)) || []);
  const todayVn = getVietnamTodayIso();

  if (!list.length) {
    return {
      phoi_advances: [],
      phoi_count: 0,
      phoi_total_advance: 0,
      phoi_total_refunded: 0,
      phoi_balance_due: 0,
      phoi_status: 'KHONG_PHAT_SINH',
      phoi_status_label: 'Không phát sinh',
      phoi_due_date: null,
      phoi_payment_term_type: null,
      phoi_reminder_status: 'NONE',
      phoi_reminder_label: '',
      phoi_is_completed: false,
      phoi_raw_note: null,
    };
  }

  let totalAdvance = 0;
  let totalRefunded = 0;
  let earliestDueDate = null;
  let primaryTermType = null;
  let rawSourceNote = null;

  for (const item of list) {
    if (item.is_non_financial_note) {
      rawSourceNote = item.raw_source_value || item.notes || 'K MẤT';
      continue;
    }
    const itemAdv = toIntVnd(item.advance_amount);
    const itemRef = toIntVnd(item.refunded_amount);
    const itemBal = Math.max(0, itemAdv - itemRef);
    totalAdvance += itemAdv;
    totalRefunded += itemRef;

    // Chỉ tính ngày hẹn và nhắc việc của các khoản chưa tất toán xong (tránh leak overdue từ khoản đã đóng)
    if (itemBal > 0 && item.due_date && (!earliestDueDate || item.due_date < earliestDueDate)) {
      earliestDueDate = item.due_date;
    }
    if (!primaryTermType && item.payment_term_type) {
      primaryTermType = item.payment_term_type;
    }
  }

  const balanceDue = Math.max(0, totalAdvance - totalRefunded);

  if (totalAdvance === 0 && rawSourceNote) {
    return {
      phoi_advances: list,
      phoi_count: list.length,
      phoi_total_advance: 0,
      phoi_total_refunded: 0,
      phoi_balance_due: 0,
      phoi_status: 'GHI_CHU_NGUON',
      phoi_status_label: rawSourceNote,
      phoi_due_date: null,
      phoi_payment_term_type: primaryTermType,
      phoi_reminder_status: 'NONE',
      phoi_reminder_label: 'Ghi chú nguồn (không tạo nợ)',
      phoi_is_completed: false,
      phoi_raw_note: rawSourceNote,
    };
  }

  const syntheticEval = evaluateEirAdvanceState(
    {
      advance_amount: totalAdvance,
      refunded_amount: totalRefunded,
      due_date: earliestDueDate,
      payment_term_type: primaryTermType,
    },
    todayVn
  );

  return {
    phoi_advances: list,
    eir_advances: list,
    phoi_count: list.length,
    phoi_total_advance: totalAdvance,
    phoi_total_refunded: totalRefunded,
    phoi_balance_due: balanceDue,
    phoi_remaining_amount: balanceDue,
    phoi_status: syntheticEval.refund_status,
    phoi_status_label: syntheticEval.refund_status_label,
    phoi_due_date: earliestDueDate,
    phoi_payment_term_type: primaryTermType,
    phoi_reminder_status: syntheticEval.reminder_status,
    phoi_reminder_label: syntheticEval.reminder_label,
    phoi_is_completed: syntheticEval.is_completed,
    phoi_raw_note: rawSourceNote,
  };
}

export function createEirAdvance({
  trip_id,
  customer_name,
  advance_amount = 0,
  advance_date,
  reference_code = '',
  raw_source_value = '',
  is_non_financial_note = false,
  payment_term_type = 'CHUA_DAT', // 'TUOI' | 'HEN_NGAY' | 'CN_30_NGAY' | 'CHUA_DAT'
  due_date = null,
  notes = '',
  actor = 'system',
  is_tuoi = false,
  phoi_is_tuoi = false,
  reference_note = '',
  phoi_reference_note = '',
}) {
  if (!trip_id) throw new Error('Thiếu mã chuyến (trip_id) khi tạo khoản tiền phơi trả hộ.');
  const customerStr = String(customer_name || 'CHƯA RÕ CHỦ HÀNG').trim();
  const amount = Math.max(0, toIntVnd(advance_amount));
  const advDate = String(advance_date || getVietnamTodayIso()).trim().slice(0, 10);
  if (!isValidCalendarDate(advDate)) {
    throw new Error('Ngày trả hộ phơi không hợp lệ trong lịch thực tế (YYYY-MM-DD).');
  }
  const rawVal = String(raw_source_value || '').trim();
  const nonFin = Boolean(is_non_financial_note || (amount === 0 && rawVal));

  if (!nonFin && amount <= 0) {
    throw new Error('Số tiền phơi trả hộ phải lớn hơn 0.');
  }

  const rawDueDate = due_date ? String(due_date).trim() : null;
  let cleanDueDate = null;
  if (rawDueDate) {
    if (!isValidCalendarDate(rawDueDate)) {
      throw new Error(`Ngày hẹn hoàn tiền không hợp lệ trong lịch thực tế: ${rawDueDate}`);
    }
    cleanDueDate = rawDueDate;
  }

  const passedTuoi = Boolean(is_tuoi || phoi_is_tuoi || String(payment_term_type || '').toUpperCase() === 'TUOI');
  let termType = passedTuoi ? 'TUOI' : String(payment_term_type || 'CHUA_DAT').toUpperCase();
  if (!passedTuoi && cleanDueDate && termType === 'CHUA_DAT') {
    termType = 'HEN_NGAY';
  }

  const isTuoiFinal = termType === 'TUOI' && !nonFin && amount > 0;
  const nowIso = new Date().toISOString();
  const advanceId = crypto.randomUUID();

  const finalRef = String(reference_code || reference_note || phoi_reference_note || '').trim() || null;
  const finalNotes = String(notes || reference_note || phoi_reference_note || '').trim() || null;

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO eir_advances (
        id, trip_id, customer_name, advance_amount, advance_date,
        reference_code, raw_source_value, is_non_financial_note,
        refunded_amount, refund_status, payment_term_type,
        due_date, completed_date, notes, created_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      advanceId,
      String(trip_id),
      customerStr,
      amount,
      advDate,
      finalRef,
      rawVal || null,
      nonFin ? 1 : 0,
      isTuoiFinal ? amount : 0,
      nonFin ? 'GHI_CHU_NGUON' : isTuoiFinal ? 'DA_HOAN' : 'CHUA_HOAN',
      termType,
      isTuoiFinal ? null : cleanDueDate,
      isTuoiFinal ? advDate : null,
      finalNotes,
      actor,
      nowIso,
      nowIso
    );

    if (isTuoiFinal) {
      db.prepare(`
        INSERT INTO eir_refunds (
          id, advance_id, trip_id, refund_amount, refund_date,
          is_tuoi, note, status, actor, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, 1, ?, 'ACTIVE', ?, ?, ?)
      `).run(
        crypto.randomUUID(),
        advanceId,
        String(trip_id),
        amount,
        advDate,
        'Hoàn ngay (TƯƠI) khi phát sinh trả hộ',
        actor,
        nowIso,
        nowIso
      );
    }

    db.prepare(`
      INSERT INTO eir_advance_history (
        id, advance_id, trip_id, action, old_values, new_values, note, actor, created_at
      ) VALUES (?, ?, ?, 'CREATE_ADVANCE', NULL, ?, ?, ?, ?)
    `).run(
      crypto.randomUUID(),
      advanceId,
      String(trip_id),
      JSON.stringify({ advance_amount: amount, advance_date: advDate, payment_term_type: termType, due_date: isTuoiFinal ? null : cleanDueDate }),
      isTuoiFinal ? 'Tạo khoản phơi trả hộ — Đã hoàn ngay (TƯƠI)' : 'Tạo khoản phơi trả hộ',
      actor,
      nowIso
    );

    syncTripEirStatus(trip_id, nowIso);
  });

  tx();
  invalidateExcelMonthCache();
  return getAdvanceById(advanceId);
}

export function updateEirAdvance(advanceId, payload = {}, actor = 'system') {
  const existing = db.prepare('SELECT * FROM eir_advances WHERE id = ?').get(advanceId);
  if (!existing) throw new Error('Không tìm thấy khoản tiền phơi trả hộ.');

  const nowIso = new Date().toISOString();
  const nextAmount = payload.advance_amount !== undefined ? Math.max(0, toIntVnd(payload.advance_amount)) : toIntVnd(existing.advance_amount);
  if (nextAmount < toIntVnd(existing.refunded_amount)) {
    throw new Error(`Số tiền trả hộ (${nextAmount.toLocaleString('vi-VN')}đ) không được nhỏ hơn số tiền đã hoàn (${toIntVnd(existing.refunded_amount).toLocaleString('vi-VN')}đ).`);
  }

  let nextDueDate = existing.due_date;
  if (payload.due_date !== undefined) {
    const rawDue = payload.due_date ? String(payload.due_date).trim() : null;
    if (rawDue) {
      if (!isValidCalendarDate(rawDue)) {
        throw new Error(`Ngày hẹn hoàn tiền không hợp lệ trong lịch thực tế: ${rawDue}`);
      }
      nextDueDate = rawDue;
    } else {
      nextDueDate = null;
    }
  }

  let nextAdvDate = existing.advance_date;
  if (payload.advance_date) {
    const rawAdv = String(payload.advance_date).trim().slice(0, 10);
    if (!isValidCalendarDate(rawAdv)) {
      throw new Error(`Ngày trả hộ không hợp lệ trong lịch thực tế: ${rawAdv}`);
    }
    nextAdvDate = rawAdv;
  }

  const inputRef = payload.reference_code ?? payload.reference_note ?? payload.phoi_reference_note;
  const inputNotes = payload.notes ?? payload.reference_note ?? payload.phoi_reference_note;

  const nextRef = inputRef !== undefined ? (String(inputRef || '').trim() || null) : existing.reference_code;
  const nextNotes = inputNotes !== undefined ? (String(inputNotes || '').trim() || null) : existing.notes;

  const nextTermType = payload.payment_term_type !== undefined
    ? String(payload.payment_term_type).toUpperCase()
    : (nextDueDate ? 'HEN_NGAY' : existing.payment_term_type);

  const tx = db.transaction(() => {
    db.prepare(`
      UPDATE eir_advances
      SET advance_amount = ?,
          advance_date = ?,
          due_date = ?,
          payment_term_type = ?,
          reference_code = ?,
          notes = ?,
          updated_at = ?
      WHERE id = ?
    `).run(nextAmount, nextAdvDate, nextDueDate, nextTermType, nextRef, nextNotes, nowIso, advanceId);

    db.prepare(`
      INSERT INTO eir_advance_history (
        id, advance_id, trip_id, action, old_values, new_values, note, actor, created_at
      ) VALUES (?, ?, ?, 'UPDATE_ADVANCE', ?, ?, ?, ?, ?)
    `).run(
      crypto.randomUUID(),
      advanceId,
      existing.trip_id,
      JSON.stringify({ advance_amount: existing.advance_amount, due_date: existing.due_date, payment_term_type: existing.payment_term_type, reference_code: existing.reference_code, notes: existing.notes }),
      JSON.stringify({ advance_amount: nextAmount, due_date: nextDueDate, payment_term_type: nextTermType, reference_code: nextRef, notes: nextNotes }),
      payload.reason || 'Cập nhật thông tin khoản phơi / ngày hẹn hoàn',
      actor,
      nowIso
    );

    recalculateAdvanceTotals(advanceId, actor);
  });

  tx();
  invalidateExcelMonthCache();
  return getAdvanceById(advanceId);
}

export function recordEirRefund(advanceId, { refund_amount, refund_date, is_tuoi = false, note = '' }, actor = 'system') {
  const refDate = String(refund_date || getVietnamTodayIso()).trim().slice(0, 10);
  if (!isValidCalendarDate(refDate)) {
    throw new Error(`Ngày hoàn tiền phơi không hợp lệ trong lịch thực tế: ${refDate}`);
  }

  const nowIso = new Date().toISOString();
  const refundId = crypto.randomUUID();

  const tx = db.transaction(() => {
    const existing = db.prepare('SELECT * FROM eir_advances WHERE id = ?').get(advanceId);
    if (!existing) throw new Error('Không tìm thấy khoản tiền phơi trả hộ cần hoàn.');

    const balanceDue = Math.max(0, toIntVnd(existing.advance_amount) - toIntVnd(existing.refunded_amount));
    if (balanceDue <= 0) {
      throw new Error('Khoản tiền phơi này đã được hoàn đủ, không còn số dư cần thu.');
    }

    const amount = refund_amount !== undefined && refund_amount !== null
      ? toIntVnd(refund_amount)
      : balanceDue;

    if (amount <= 0) {
      throw new Error('Số tiền hoàn phơi phải lớn hơn 0.');
    }
    if (amount > balanceDue) {
      throw new Error(`Số tiền hoàn (${amount.toLocaleString('vi-VN')}đ) vượt quá số dư còn phải thu (${balanceDue.toLocaleString('vi-VN')}đ).`);
    }

    db.prepare(`
      INSERT INTO eir_refunds (
        id, advance_id, trip_id, refund_amount, refund_date,
        is_tuoi, note, status, actor, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?, ?)
    `).run(
      refundId,
      advanceId,
      existing.trip_id,
      amount,
      refDate,
      is_tuoi ? 1 : 0,
      String(note || '').trim() || null,
      actor,
      nowIso,
      nowIso
    );

    if (is_tuoi) {
      db.prepare("UPDATE eir_advances SET payment_term_type = 'TUOI', updated_at = ? WHERE id = ?").run(nowIso, advanceId);
    }

    db.prepare(`
      INSERT INTO eir_advance_history (
        id, advance_id, trip_id, action, old_values, new_values, note, actor, created_at
      ) VALUES (?, ?, ?, 'RECORD_REFUND', ?, ?, ?, ?, ?)
    `).run(
      crypto.randomUUID(),
      advanceId,
      existing.trip_id,
      JSON.stringify({ refunded_amount: existing.refunded_amount, balance_due: balanceDue }),
      JSON.stringify({ refund_id: refundId, refund_amount: amount, refund_date: refDate, new_balance: balanceDue - amount }),
      String(note || 'Ghi nhận hoàn tiền phơi').trim(),
      actor,
      nowIso
    );

    recalculateAdvanceTotals(advanceId, actor);
  });

  tx();
  invalidateExcelMonthCache();
  return getAdvanceById(advanceId);
}

export function cancelEirRefund(refundId, { reason = '' } = {}, actor = 'system') {
  const refund = db.prepare('SELECT * FROM eir_refunds WHERE id = ?').get(refundId);
  if (!refund) throw new Error('Không tìm thấy giao dịch hoàn tiền phơi.');
  if (refund.status === 'CANCELLED') {
    throw new Error('Giao dịch hoàn tiền phơi này đã bị hủy trước đó.');
  }
  const cleanReason = String(reason || '').trim();
  if (!cleanReason) {
    throw new Error('Bắt buộc nhập lý do khi hủy giao dịch hoàn tiền phơi.');
  }

  const nowIso = new Date().toISOString();
  const tx = db.transaction(() => {
    db.prepare(`
      UPDATE eir_refunds
      SET status = 'CANCELLED',
          cancelled_by = ?,
          cancelled_reason = ?,
          updated_at = ?
      WHERE id = ?
    `).run(actor, cleanReason, nowIso, refundId);

    db.prepare(`
      INSERT INTO eir_advance_history (
        id, advance_id, trip_id, action, old_values, new_values, note, actor, created_at
      ) VALUES (?, ?, ?, 'CANCEL_REFUND', ?, ?, ?, ?, ?)
    `).run(
      crypto.randomUUID(),
      refund.advance_id,
      refund.trip_id,
      JSON.stringify({ refund_id: refundId, refund_amount: refund.refund_amount, status: 'ACTIVE' }),
      JSON.stringify({ refund_id: refundId, status: 'CANCELLED', reason: cleanReason }),
      `Hủy giao dịch hoàn phơi: ${cleanReason}`,
      actor,
      nowIso
    );

    recalculateAdvanceTotals(refund.advance_id, actor);
  });

  tx();
  invalidateExcelMonthCache();
  return getAdvanceById(refund.advance_id);
}

/**
 * Thao tác đính chính riêng lịch sử chủ hàng của khoản tiền phơi (B05)
 * Bắt buộc có lý do rõ ràng, không tự đổi theo thao tác sửa chuyến thông thường.
 */
export function correctEirAdvanceCustomer(advanceId, { customer_name, reason = '' } = {}, actor = 'system') {
  const existing = db.prepare('SELECT * FROM eir_advances WHERE id = ?').get(advanceId);
  if (!existing) throw new Error('Không tìm thấy khoản tiền phơi trả hộ.');
  const cleanCustomer = String(customer_name || '').trim();
  if (!cleanCustomer) {
    throw new Error('Bắt buộc nhập tên chủ hàng mới cần đính chính.');
  }
  const cleanReason = String(reason || '').trim();
  if (!cleanReason) {
    throw new Error('Bắt buộc nhập lý do khi đính chính lịch sử chủ hàng của khoản tiền phơi.');
  }

  const nowIso = new Date().toISOString();
  const tx = db.transaction(() => {
    db.prepare(`
      UPDATE eir_advances
      SET customer_name = ?, updated_at = ?
      WHERE id = ?
    `).run(cleanCustomer, nowIso, advanceId);

    db.prepare(`
      INSERT INTO eir_advance_history (
        id, advance_id, trip_id, action, old_values, new_values, note, actor, created_at
      ) VALUES (?, ?, ?, 'CORRECT_CUSTOMER_HISTORY', ?, ?, ?, ?, ?)
    `).run(
      crypto.randomUUID(),
      advanceId,
      existing.trip_id,
      JSON.stringify({ customer_name: existing.customer_name, refund_status: existing.refund_status }),
      JSON.stringify({ customer_name: cleanCustomer, refund_status: existing.refund_status, reason: cleanReason }),
      `Đính chính lịch sử chủ hàng khoản phơi: ${existing.customer_name} -> ${cleanCustomer} (${cleanReason})`,
      actor,
      nowIso
    );
  });

  tx();
  invalidateExcelMonthCache();
  return getAdvanceById(advanceId);
}

export function getEirReminders({ referenceDate } = {}) {
  const todayVn = referenceDate ? String(referenceDate).slice(0, 10) : getVietnamTodayIso();
  const advances = db.prepare('SELECT * FROM eir_advances ORDER BY due_date ASC, advance_date ASC').all();

  const overdue = [];
  const dueToday = [];
  const noDueDate = [];
  const upcoming = [];
  const completed = [];

  for (const adv of advances) {
    const evaluated = evaluateEirAdvanceState(adv, todayVn);
    const enriched = { ...adv, ...evaluated };
    if (evaluated.reminder_status === 'OVERDUE') overdue.push(enriched);
    else if (evaluated.reminder_status === 'DUE_TODAY') dueToday.push(enriched);
    else if (evaluated.reminder_status === 'NO_DUE_DATE') noDueDate.push(enriched);
    else if (evaluated.reminder_status === 'UPCOMING') upcoming.push(enriched);
    else if (evaluated.reminder_status === 'COMPLETED') completed.push(enriched);
  }

  const sumBalance = (arr) => arr.reduce((s, x) => s + toIntVnd(x.balance_due), 0);

  return {
    today_vn: todayVn,
    summary: {
      overdue_count: overdue.length,
      overdue_amount: sumBalance(overdue),
      due_today_count: dueToday.length,
      due_today_amount: sumBalance(dueToday),
      no_due_date_count: noDueDate.length,
      no_due_date_amount: sumBalance(noDueDate),
      upcoming_count: upcoming.length,
      upcoming_amount: sumBalance(upcoming),
      total_unrefunded_count: overdue.length + dueToday.length + noDueDate.length + upcoming.length,
      total_unrefunded_amount: sumBalance(overdue) + sumBalance(dueToday) + sumBalance(noDueDate) + sumBalance(upcoming),
      total_outstanding_amount: sumBalance(overdue) + sumBalance(dueToday) + sumBalance(noDueDate) + sumBalance(upcoming),
      unscheduled_count: noDueDate.length,
      unscheduled_amount: sumBalance(noDueDate),
    },
    overdue,
    due_today: dueToday,
    no_due_date: noDueDate,
    unscheduled: noDueDate,
    upcoming,
    completed_recent: completed.slice(0, 20),
  };
}
