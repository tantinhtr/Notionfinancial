# Telegram Bot — Tài chính cá nhân trên Notion

Bot Telegram riêng tư, đọc/ghi thẳng vào workspace Notion. Chạy trên Cloudflare Workers.

- Theo dõi mục tiêu thu nhập Grab theo tháng, tự chia chỉ tiêu mỗi ngày
- Nhắn một con số là ghi ngay khoản thu hôm nay vào Notion
- Xem dòng tiền tháng, bóc tách theo từng tài khoản và loại giao dịch
- Theo dõi quỹ và ngân sách: đã tiêu bao nhiêu, còn bao nhiêu, cần chuyển thêm bao nhiêu vào tài khoản giữ quỹ
- Nhắc nhở tự động 21:00 giờ VN mỗi ngày

## Dùng bot

| Thao tác | Kết quả |
|---|---|
| `/start` | Dòng tiền tháng — số dư từng tài khoản, kèm nút điều hướng |
| `/muctieu` | Tiến độ mục tiêu thu nhập Grab: đã kiếm, còn thiếu, chỉ tiêu hôm nay/ngày mai |
| Nhắn một số (vd `650000`) | Ghi thu nhập Grab hôm nay vào Notion + báo đủ/thiếu chỉ tiêu |
| Nút **📊 Dòng tiền** | Danh sách tài khoản → bấm tiếp để xem tiền vào/ra theo từng loại |
| Nút **📦 Quỹ & ngân sách** | Từng nhóm quỹ: đã tiêu / ngân sách, và tiền cần chuyển vào tài khoản giữ quỹ |

Bot chỉ trả lời đúng một Telegram user id (`ALLOWED_USER_ID`), mọi người khác nhắn vào đều bị bỏ qua.

### Đọc báo cáo Quỹ & ngân sách

Mỗi nhóm quỹ in ra hai dòng, đo hai thứ khác nhau — đừng đọc nhập làm một:

```
✅ Thiết Yếu: 2.122.000đ / 2.330.000đ | còn 208.000đ
   💰 Quỹ Momo: đã cấp 2.150.000đ · còn 28.000đ trong quỹ · cần chuyển 180.000đ
```

- Dòng trên là **ngân sách**: `còn 208.000đ` = còn được phép tiêu bấy nhiêu nữa.
- Dòng dưới là **tiền mặt**: `cần chuyển 180.000đ` = còn phải bơm bấy nhiêu vào tài khoản giữ quỹ.

Hai số lệch nhau là bình thường. Ở ví dụ trên, quỹ đã có sẵn 28.000đ nên chỉ cần chuyển thêm 180.000đ nữa là đủ cho 208.000đ ngân sách còn lại.

Nếu quỹ đã chi hộ mà chưa được cấp bù, dòng dưới sẽ ghi `quỹ đang âm ...` — đó là tiền tài khoản giữ quỹ đã ứng ra thay cho nhóm này.

Nhóm nào không bật `Bắt Buộc Cấp Quỹ` trong Notion thì không có dòng tiền mặt.

## Kiến trúc

```
cloudflare-worker/
  src/
    index.js        webhook + cron + Durable Object
    bot.js          định tuyến lệnh và callback từ Telegram
    finance.js      toàn bộ phép tính và phần render text
    repository.js   đọc/ghi Notion, cache báo cáo trong KV
    notion.js       client Notion API
    telegram.js     client Telegram Bot API
    coordinator.js  chống ghi trùng khi Telegram gửi lại webhook
    config.js       id các database Notion và hằng số
  test/             chạy bằng node --test
```

Vài điểm đáng biết:

- **Chống ghi trùng**: mỗi `update_id` của Telegram được xử lý trong một Durable Object riêng. Telegram gửi lại webhook cũng không tạo ra hai khoản thu.
- **Cache**: báo cáo dòng tiền cache trong KV 60 giây. Báo cáo quỹ không cache, luôn đọc thẳng Notion.
- **Cron**: `0 14 * * *` UTC = 21:00 giờ VN.
- Thư mục `bot/` cùng `requirements.txt` và `test_*.py` ở gốc repo là **bản Python cũ**, không còn chạy nữa. Giữ lại để tham khảo.

## Deploy

Repo đã nối với Cloudflare Workers Builds. **Đẩy code lên nhánh `main` là tự động deploy**, không cần làm gì thêm.

Cấu hình build trong dashboard Cloudflare (Worker `notion-finance-bot` → Settings → Build):

| Ô | Giá trị |
|---|---|
| Production branch | `main` |
| Root directory | `cloudflare-worker` |
| Build command | để trống |
| Deploy command | `npx wrangler deploy` |

`Root directory` phải là `cloudflare-worker`. Để trống hoặc để `/` thì Cloudflare nhìn vào gốc repo, thấy `requirements.txt` của bản Python cũ rồi tưởng đây là dự án Python và build hỏng.

Tên Worker trong dashboard phải trùng với `name` trong `cloudflare-worker/wrangler.jsonc` (`notion-finance-bot`), nếu không build cũng hỏng.

Muốn deploy tay thì:

```bash
cd cloudflare-worker
npx wrangler deploy
```

Lỡ deploy nhầm bản lỗi thì vào tab **Deployments** của Worker, chọn bản cũ rồi rollback.

## Cấu hình

Secrets và biến đặt trong Cloudflare (Worker → Settings → Variables), **không** nằm trong repo:

| Tên | Loại | Nội dung |
|---|---|---|
| `TELEGRAM_TOKEN` | Secret | Token từ @BotFather |
| `NOTION_TOKEN` | Secret | Internal integration secret (`ntn_...`) |
| `WEBHOOK_SECRET` | Secret | Chuỗi tự đặt, dùng xác thực webhook Telegram |
| `ALLOWED_USER_ID` | Variable | Telegram user id duy nhất được dùng bot |

Bindings khai trong `cloudflare-worker/wrangler.jsonc`: KV `BOT_STATE` và Durable Object `UPDATE_COORDINATOR`.

Id các database Notion nằm trong `cloudflare-worker/src/config.js`. Integration Notion phải được thêm vào trang **Financial** trong Notion (các bảng con thừa hưởng quyền).

## Test

```bash
cd cloudflare-worker
npm test
```

## Kiểm tra bot còn sống

```
GET https://<worker>.workers.dev/health
```

Trả về JSON liệt kê từng binding có mặt hay không.
