# Telegram Bot — Mục Tiêu Thu Nhập Grab

Bot Telegram riêng tư, nối với Notion. **Tính năng đầu tiên (đã xong):**

- Đọc mục tiêu tháng từ bảng "Mục Tiêu Và Thu Nhập" (Grab: 10 triệu/tháng)
- Tự chia mục tiêu mỗi ngày
- Anh nhắn số tiền kiếm hôm nay → bot ghi vào Notion và cho biết **hôm nay đủ chỉ tiêu chưa, ngày mai cần chạy bao nhiêu (đã tính bù)**

Sẽ build thêm sau: nhắc nhở hàng ngày, nhiều loại thu nhập, thống kê tháng.

## Cài đặt

### 1. Tạo bot Telegram
1. Mở Telegram → tìm **@BotFather** → `/newbot` → lấy **token**
2. Tìm **@userinfobot** → nhắn gì đó → lấy **User ID** (số) của anh

### 2. Notion integration
1. https://www.notion.so/my-integrations → **New integration** → copy secret (`ntn_...`)
2. Mở trang **Financial** trong Notion → `•••` → **Connections** → thêm integration vừa tạo
   (làm ở trang cha là đủ, các bảng con thừa hưởng quyền)

### 3. Cấu hình
```bash
cd telegram-income-bot
cp .env.example .env
```
Mở `.env`, điền `TELEGRAM_BOT_TOKEN`, `TELEGRAM_ALLOWED_USER_ID`, `NOTION_TOKEN`.
ID 2 bảng và tên cột đã điền sẵn khớp workspace của anh — không cần đổi.

### 4. Chạy
```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python3 -m bot.main
```
Bot chạy chế độ polling — không cần domain/HTTPS, chỉ cần máy có mạng và luôn bật.

## Dùng bot
- `/muctieu` — tiến độ mục tiêu thu nhập tháng: đã kiếm %, còn thiếu, mục tiêu mỗi ngày
- `/thang` — dòng tiền tháng: tổng thu, tổng chi, còn lại, **tiền đi đâu** (chi theo loại + loại nào vượt ngân sách)
- Nhắn một số (vd `650000`) — ghi thu nhập Grab hôm nay + báo đủ/thiếu + mục tiêu ngày mai
- **Nhắc nhở tự động** mỗi ngày lúc `REMINDER_TIME` (mặc định 21:00 giờ VN): tóm tắt hôm nay kiếm được bao nhiêu, còn thiếu bao nhiêu

Đặt giờ nhắc trong `.env`: `REMINDER_TIME=21:00` và `TIMEZONE=Asia/Ho_Chi_Minh`.

## Deploy 24/7 trên Render (miễn phí)
1. Push code lên GitHub (repo Private)
2. render.com → New + → **Background Worker** → chọn repo
3. **Root Directory**: `telegram-income-bot`
4. Build: `pip install -r requirements.txt` — Start: `python -m bot.main`
5. Tab **Environment**: thêm các biến trong `.env` (Render không đọc file `.env`)
6. Deploy → khi hiện **Live** là bot chạy.

## Test
```bash
python3 test_goal_math.py
```

## Bảo mật
- `.env` chứa token — không commit, không share (đã có trong `.gitignore`)
- Bot chỉ trả lời đúng `TELEGRAM_ALLOWED_USER_ID`
