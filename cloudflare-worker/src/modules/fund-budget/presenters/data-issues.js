/**
 * Nhóm và trình bày các giao dịch thiếu hoặc mâu thuẫn dữ kiện từ kết quả kiểm tra.
 * Không tự kết luận giao dịch là nợ chỉ dựa vào một con số.
 */
import { money_ } from "../../shared/finance/shared.js";

export function appendDataIssues_(lines, dataIssues) {
  const byRowId = new Map();
  for (const issue of dataIssues || []) {
    const existing = byRowId.get(issue.rowId);
    if (existing) {
      existing.details.push(
        ...(issue.details || []).map((detail) => ({
          type: issue.type,
          detail,
        })),
      );
      continue;
    }
    byRowId.set(issue.rowId, {
      rowId: issue.rowId,
      date: issue.date,
      createdTime: issue.createdTime,
      title: issue.title,
      amount: issue.amount,
      details: (issue.details || []).map((detail) => ({
        type: issue.type,
        detail,
      })),
    });
  }
  const visible = [...byRowId.values()].sort(
    (a, b) =>
      String(a.date || '').localeCompare(String(b.date || '')) ||
      String(a.createdTime || '').localeCompare(String(b.createdTime || '')) ||
      String(a.rowId || '').localeCompare(String(b.rowId || '')),
  );
  if (!visible.length) return false;
  lines.push('', '⚠️ CHƯA ĐỦ DỮ KIỆN');
  for (const row of visible) {
    const day =
      typeof row.date === 'string' && row.date.length >= 10
        ? row.date.slice(8, 10) + '/' + row.date.slice(5, 7)
        : '(không ngày)';
    const details = row.details.map(({ type, detail }) =>
      type === 'missing_required_data'
        ? 'thiếu ' + detail
        : String(detail || '').replace(/^./, (character) =>
            character.toLocaleLowerCase('vi-VN'),
          ),
    );
    lines.push(
      '• ' +
        day +
        ' — ' +
        (row.title || '(không nội dung)') +
        ' — ' +
        money_(row.amount || 0) +
        (details.length ? ' · ' + details.join(', ') : ''),
    );
  }
  return true;
}
