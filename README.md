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

Báo cáo chia làm ba mục tách bạch, mỗi mục trả lời một câu hỏi khác nhau:

```
📊 NGÂN SÁCH
✅ Thiết Yếu: 2.328.400đ / 2.330.000đ · còn 1.600đ
⛔ Làm YouTube: 574.444đ / 500.000đ · vượt 74.444đ

💸 NỢ CẦN TRẢ — đã tiêu nhưng chưa cấp quỹ
• Làm YouTube → Quỹ Momo: 554.444đ
• Làm YouTube → Momo: 20.000đ
Tổng: 574.444đ

💰 CẦN CẤP THÊM — cho phần ngân sách chưa tiêu
• Phát Sinh → Quỹ Momo: 449.000đ
```

- **NGÂN SÁCH** — đã tiêu bao nhiêu so với mức trần tự đặt. Đây là kế hoạch, không phải tiền thật.
- **NỢ CẦN TRẢ** — tiền đã tiêu rồi mà chưa được cấp vào quỹ, tức nhóm đó đã mượn tiền của tài khoản khác. Mỗi dòng đọc là: *nhóm nào → nợ tài khoản nào → bao nhiêu*. Tiền đã tiêu mất rồi nên không cấp vào quỹ nữa, việc phải làm là trả lại chỗ đã ứng ra.
- **CẦN CẤP THÊM** — phần ngân sách chưa tiêu mà quỹ chưa có đủ tiền. Cấp vào để chuẩn bị chi tiếp.

Ví dụ nhóm Làm YouTube ở trên: ngân sách 500.000đ nhưng chưa cấp đồng nào vào quỹ, nên toàn bộ 574.444đ đã tiêu đều là tiền đi mượn — 554.444đ của Quỹ Momo và 20.000đ của Momo. Con số nợ bám theo tiền thật đã rời khỏi tài khoản, không bám theo mức trần ngân sách.

`vượt 74.444đ` chỉ là thông tin: tháng này nhóm đó xài lố so với dự tính. Không có khoản tiền nào phải chuyển đi đâu vì việc đó — muốn cân lại thì cắt ngân sách nhóm khác hoặc chấp nhận.

Nhóm nào không bật `Bắt Buộc Cấp Quỹ` trong Notion thì không bao giờ bị tính nợ, vì nó vốn được chi thẳng từ tài khoản của nó.

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
