# Hướng dẫn dựng bot bằng Google Apps Script (miễn phí, không cần server, không cần thẻ)

Chỉ cần **tài khoản Google (Gmail)**. Làm theo đúng thứ tự.

## Bước 1 — Tạo project Apps Script
1. Vào **script.google.com** → **New project**
2. Xóa hết code mẫu trong ô soạn thảo
3. Mở file `Code.gs` (trong repo, thư mục này) → **copy toàn bộ** → dán vào
4. Bấm biểu tượng 💾 (Save)

## Bước 2 — Điền token (Script Properties)
1. Bên trái, bấm ⚙️ **Project Settings**
2. Kéo xuống **Script Properties** → **Add script property**, thêm 3 dòng:

| Property | Value |
|---|---|
| `TELEGRAM_TOKEN` | token bot từ @BotFather (dạng `8123...:AAH...`) |
| `ALLOWED_USER_ID` | `7429683600` (User ID của bạn) |
| `NOTION_TOKEN` | token Notion integration (`ntn_...`) |

3. **Save script properties**

> ID các bảng Notion đã ghi sẵn trong `Code.gs`, không cần điền.
> Nhớ đã share trang **Financial** với integration Notion (••• → Connections).

## Bước 3 — Kiểm tra Notion đọc được
1. Trên thanh trên, chọn hàm **`testNotion`** → bấm **Run**
2. Lần đầu Google hỏi quyền → **Review permissions** → chọn tài khoản → **Advanced** → **Go to (project) (unsafe)** → **Allow**
   (An toàn — đây là script của chính bạn)
3. Xem **Execution log**: nếu hiện "Mục tiêu tháng: 10000000" và số Grab đã kiếm → Notion OK ✅

## Bước 4 — Deploy web app
1. Góc phải trên: **Deploy** → **New deployment**
2. Bấm ⚙️ chọn loại **Web app**
3. Cấu hình:
   - **Execute as**: Me
   - **Who has access**: **Anyone**  ← bắt buộc, để Telegram gọi vào được
4. **Deploy** → copy **Web app URL** (dạng `https://script.google.com/macros/s/.../exec`)

## Bước 5 — Đăng ký webhook
1. Chọn hàm **`setWebhook`** → **Run**
2. Xem log: thấy `{"ok":true,"result":true,...}` là thành công ✅

## Bước 6 — Thử bot
Mở Telegram, nhắn cho bot:
- `/start` → bot chào
- `/muctieu` → tiến độ thu nhập
- `/thang` → dòng tiền tháng
- gõ một số (vd `500000`) → bot ghi vào Notion + báo đủ/thiếu

## Bước 7 (tùy chọn) — Nhắc nhở hàng ngày
1. Bên trái, bấm ⏰ **Triggers** → **Add Trigger**
2. Chọn:
   - Function: **`dailyReminder`**
   - Event source: **Time-driven**
   - Type: **Day timer** → **9pm to 10pm** (khoảng 21h)
3. **Save**

## Khi sửa code
Mỗi lần đổi `Code.gs`, phải **Deploy → Manage deployments → ✏️ → Version: New version → Deploy** thì bản mới mới có hiệu lực. (Webhook giữ nguyên, không cần chạy lại `setWebhook`.)

## Gỡ lỗi
- Bot không trả lời: chạy lại `setWebhook`, xem log có `ok:true` không; kiểm tra "Who has access" = Anyone.
- Sai số / lỗi Notion: chạy `testNotion` xem log.
- Đổi giờ nhắc: sửa lại Trigger ở bước 7.
