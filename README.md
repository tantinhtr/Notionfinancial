# Notion Finance Bot

[![CI](https://github.com/tantinhtr/Notionfinancial/actions/workflows/ci.yml/badge.svg)](https://github.com/tantinhtr/Notionfinancial/actions/workflows/ci.yml)

Bot Telegram cá nhân dùng Notion làm nguồn dữ liệu và chạy trên Cloudflare Workers. Bot ghi nhận thu nhập Grab, tổng hợp dòng tiền, theo dõi sáu lọ tài chính và đối soát các khoản vay, trả nợ hoặc ứng tiền giữa các nguồn.

## Chức năng

- Ghi thu nhập Grab bằng cách gửi trực tiếp một số tiền cho bot.
- Xem dòng tiền tháng theo tài khoản, chiều tiền và loại giao dịch.
- Xem mức sử dụng ngân sách của từng lọ và nhãn chi phí.
- Theo dõi số tiền đã cấp, khoản cần cấp thêm và số dư đang giữ trong quỹ.
- Đối soát khoản vay, trả nợ và tiền tháng trước từ lịch sử giao dịch Notion.
- Gửi nhắc nhở mục tiêu thu nhập lúc 21:00 hằng ngày.
- Chỉ phục vụ Telegram user được khai báo trong `ALLOWED_USER_ID`.

## Sử dụng bot

| Thao tác | Kết quả |
|---|---|
| `/start` | Mở báo cáo dòng tiền tháng và các nút điều hướng |
| `/muctieu` | Xem tiến độ mục tiêu thu nhập Grab |
| Gửi một số, ví dụ `650000` | Ghi khoản thu nhập Grab của ngày hiện tại vào Notion |
| **📊 Dòng tiền** | Xem tiền vào, tiền ra và chi tiết theo từng tài khoản |
| **📦 Quỹ & ngân sách** | Xem sáu lọ, nhãn con, khoản nợ và số tiền cần cấp |

## Nguyên tắc dữ liệu

- Bản ghi Notion là nguồn dữ liệu gốc; bot không tự tạo giao dịch để cân đối báo cáo.
- Quan hệ tài khoản, nhóm quỹ và loại chi phí được ưu tiên. Tiêu đề và ghi chú chỉ bổ sung ý nghĩa vay, trả, ứng hoặc phân bổ quỹ.
- `Nhóm Quỹ` là sáu lọ lớn; `Loại Chi Phí` là các nhãn chi tiết nằm trong từng lọ.
- Nợ chỉ giảm khi có giao dịch trả phù hợp. Số dư tài khoản hoặc thu nhập mới không tự động được xem là đã trả nợ.
- Tiền đầu tháng lấy từ số dư ban đầu của các nguồn được cấu hình, trừ phần thực tế dùng cho Nhà Trọ rồi chia phần còn lại cho các lọ chuyển tiếp.
- Tổng chi ngoài quỹ loại các khoản tiền đi rồi quay về dựa trên nội dung hoặc loại giao dịch, không dựa vào một ngưỡng số tiền cố định.
- Khi giao dịch hiện tại liên quan đến khoản cũ, bot đọc lịch sử trước tháng để đối soát nhưng chỉ báo cáo dữ liệu của tháng đang xem.

Các trường hợp nghiệp vụ chi tiết được khóa bằng regression test trong [`cloudflare-worker/test`](cloudflare-worker/test).

## Kiến trúc

```text
Telegram
   │ webhook
   ▼
Cloudflare Worker ──► Notion API
   │
   ├── Durable Object: chống xử lý trùng Telegram update
   ├── KV: cache báo cáo và trạng thái xử lý
   └── Cron: nhắc mục tiêu thu nhập hằng ngày
```

Mã nguồn chính nằm trong `cloudflare-worker/`:

```text
cloudflare-worker/
├── src/
│   ├── index.js                 # Export Worker và Durable Object
│   ├── app/
│   │   ├── runtime.js           # Tạo adapter, repository, component và router
│   │   ├── webhook.js           # HTTP endpoints và cron
│   │   ├── update-coordinator.js # Durable Object và tuần tự hóa
│   │   └── coordinator-handler.js # Chống lặp và đối soát update
│   ├── bot.js                   # Phân quyền, định tuyến lệnh và callback
│   ├── features/
│   │   ├── cashflow/            # Dòng tiền: component, model, presenter, callbacks
│   │   ├── fund-budget/         # Quỹ: component, model, presenter
│   │   └── income-goal/         # Mục tiêu, ghi thu nhập và nhắc hằng ngày
│   ├── domain/
│   │   ├── finance/             # Phân loại chi, định dạng dùng chung, dữ liệu thu nhập
│   │   └── ledger/              # Vay quỹ, vay cá nhân, ứng tháng trước và phân bổ
│   ├── repositories/           # Truy vấn, cache và lắp dữ liệu báo cáo
│   ├── adapters/               # Notion, Telegram và KV
│   └── config.js               # Cấu hình nghiệp vụ và Notion database IDs
├── test/                       # Unit, component contract và regression test
├── package.json
└── wrangler.jsonc
```

Mỗi tính năng có một `component.js` điều phối việc đọc dữ liệu và gửi kết quả. `model.js` tính toán trên dữ liệu thuần; `presenter.js` trả về `{ text, replyMarkup }`. Cashflow sở hữu điều hướng tài khoản → chiều tiền → loại giao dịch; fund-budget sở hữu báo cáo quỹ; income-goal sở hữu mục tiêu, ghi thu nhập, xác nhận sau đối soát và nhắc hằng ngày.

`app/runtime.js` tạo các dependency rồi truyền vào component và router. Repository chỉ trả dữ liệu, dùng các model thuần của cashflow/fund-budget để lắp báo cáo; adapter thực hiện I/O. Domain chỉ phụ thuộc domain. Các feature không import nội bộ của nhau.

Các file `finance.js`, `ledger.js`, `repository.js`, `notion.js`, `telegram.js`, `state.js` và `coordinator.js` ở đầu `src/` là facade giữ tương thích import cũ. Khi thêm logic, đặt vào component/domain/adapter tương ứng. `createBot` vẫn hỗ trợ cách khởi tạo cũ; runtime mới truyền trực tiếp ba component vào `createBotRouter`.

## Yêu cầu

- Node.js 22 trở lên.
- Tài khoản Cloudflare có Workers, KV và Durable Objects.
- Telegram bot token từ BotFather.
- Notion integration có quyền truy cập các database tài chính tương ứng.

Database IDs và các hằng số nghiệp vụ của dự án được khai báo trong [`cloudflare-worker/src/config.js`](cloudflare-worker/src/config.js).

## Chạy local

```bash
cd cloudflare-worker
npm ci
npm test
npm run dev
```

Tạo `cloudflare-worker/.dev.vars` cho môi trường local:

```dotenv
TELEGRAM_TOKEN=...
NOTION_TOKEN=...
WEBHOOK_SECRET=...
ALLOWED_USER_ID=...
```

Không commit `.dev.vars`, token hoặc secret vào Git. File này đã được loại bằng `.gitignore`.

## Cấu hình Cloudflare

| Binding | Loại | Mục đích |
|---|---|---|
| `TELEGRAM_TOKEN` | Secret | Gọi Telegram Bot API |
| `NOTION_TOKEN` | Secret | Đọc và ghi dữ liệu Notion |
| `WEBHOOK_SECRET` | Secret | Xác thực request webhook từ Telegram |
| `ALLOWED_USER_ID` | Variable | Telegram user duy nhất được dùng bot |
| `BOT_STATE` | KV namespace | Cache báo cáo và trạng thái ngắn hạn |
| `UPDATE_COORDINATOR` | Durable Object | Tuần tự hóa và chống ghi trùng update |

KV, Durable Object, lịch cron và tên Worker được khai báo trong [`cloudflare-worker/wrangler.jsonc`](cloudflare-worker/wrangler.jsonc).

## HTTP endpoints

| Method | Path | Mục đích |
|---|---|---|
| `GET` | `/health` | Kiểm tra Worker và các binding bắt buộc |
| `POST` | `/telegram/webhook` | Nhận Telegram update có secret header hợp lệ |

Ví dụ kiểm tra Worker:

```bash
curl https://<worker>.workers.dev/health
```

## Kiểm thử

```bash
cd cloudflare-worker
npm run check
npm test
```

GitHub Actions chạy hai lệnh trên mỗi lần push vào `main` và trên mọi pull request. Workflow nằm tại [`.github/workflows/ci.yml`](.github/workflows/ci.yml).

## Triển khai

```bash
cd cloudflare-worker
npm run deploy
```

Lệnh này triển khai Worker bằng Wrangler theo `wrangler.jsonc`. Nếu Cloudflare Workers Builds đã kết nối với repository, có thể cấu hình thư mục gốc là `cloudflare-worker` và production branch là `main`.

Sau khi triển khai:

1. Kiểm tra `GET /health` trả về HTTP `200`.
2. Cấu hình Telegram webhook trỏ tới `/telegram/webhook` với cùng `WEBHOOK_SECRET`.
3. Thử `/start`, `/muctieu` và nút **Quỹ & ngân sách** bằng user được cho phép.

## Bảo mật

- Không ghi token, secret hoặc URL chứa token vào log.
- Không thử lại lệnh ghi Notion một cách mù quáng vì có thể tạo bản ghi trùng.
- Không mở quyền bot cho user ngoài `ALLOWED_USER_ID`.
- Chỉ đưa thông tin trạng thái binding, không trả giá trị secret qua `/health`.
