/**
 * Tác vụ nhắc mục tiêu: lấy trạng thái thu nhập rồi giao cho hàm trình bày/gửi đã được truyền vào.
 * Không phụ thuộc controller hoặc tạo kết nối Telegram riêng.
 */
export function createCronReminder({ getGoalStatus, deliver }) {
  return async () => deliver(await getGoalStatus());
}
