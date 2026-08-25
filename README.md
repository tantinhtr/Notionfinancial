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

💸 ỨNG TRƯỚC — cần trả lại
• Làm YouTube → quỹ tích lũy: 554.444đ
    02/08 Goolge play tự động thanh toán tiền claude: 554.444đ
• Phát Sinh → Momo: 47.000đ
    22/08 Thanh toán đơn hàng shoppe: 47.000đ (phần lố)
Tổng: 601.444đ

💰 CẦN CẤP THÊM — phần ngân sách chưa dùng mà quỹ chưa có tiền
• Phát Sinh → Quỹ Momo: 449.000đ
```

- **NGÂN SÁCH** — đã tiêu bao nhiêu so với mức trần tự đặt. Đây là kế hoạch, không phải tiền thật.
- **ỨNG TRƯỚC** — tiền người khác bỏ ra hộ, phải trả lại. Mỗi dòng đọc là: *nhóm nào → trả cho ai → bao nhiêu*, kèm luôn các giao dịch tạo ra nó.
- **CẦN CẤP THÊM** — phần ngân sách **chưa dùng tới**, trừ đi số quỹ đang giữ. Tiền đã tiêu bằng túi khác **cũng coi như đã cấp rồi**: đáng lẽ nó phải đi qua quỹ, chỉ là chưa có giao dịch chuyển. Việc trả lại cho bên đã ứng nằm ở mục ỨNG TRƯỚC, không phải cấp lại lần hai. Nhóm nào tiêu vượt ngân sách thì không xuất hiện ở đây.

Mỗi nhóm quỹ có một tài khoản giữ quỹ (`Tài Khoản Giữ Quỹ` trong Notion), và mọi khoản thuộc nhóm đó đáng lẽ phải thanh toán bằng tài khoản ấy. Khi một khoản lại được trả bằng thứ khác — tiền mặt, ví khác, hay quỹ khác:

**Momo** và **Grap Tiền Mặt** là hai nguồn dùng để cấp tiền cho các nhóm quỹ (khai báo ở `fundingSourceAccounts` trong `config.js`). Chi thẳng bằng hai ví này thì **coi như đã cấp cho nhóm rồi** — chỉ là bỏ qua bước chuyển khoản — nên không ai phải trả lại ai.

| Tình huống | Bot làm gì |
|---|---|
| Trả bằng Momo / Grap Tiền Mặt | Coi như đã cấp. Không ghi nợ |
| Trả bằng tài khoản khác (Banking, Paypal…) | Ghi vào ỨNG TRƯỚC → phải chuyển trả lại đúng chỗ đã ứng |
| Trả bằng Quỹ Momo, ghi chú nói `lấy từ quỹ X` mà X **không** phải một nhóm quỹ | Trả đủ cho quỹ X — đó là tiền của quỹ con khác đang nằm chung trong Quỹ Momo |

Ví dụ nhóm Làm YouTube (ngân sách 600.000đ) chưa cấp đồng nào mà đã tiêu 574.444đ: 554.444đ trả bằng Quỹ Momo với ghi chú `( lấy từ quỹ tích lũy )`, 20.000đ trả bằng Momo.

- ỨNG TRƯỚC chỉ có **quỹ tích lũy 554.444đ** — quỹ tích lũy là một túi khác nằm chung trong Quỹ Momo, phải trả đủ.
- 20.000đ Momo **không** vào ỨNG TRƯỚC: Momo là nguồn cấp quỹ, coi như đã cấp.
- CẦN CẤP THÊM còn **25.556đ** = 600.000 − 574.444, vì phần đã tiêu coi như đã cấp rồi.

Ví dụ nhóm Thiết Yếu gồm Nhà Trọ 2.150.000 + Internet 180.000 + Khác 70.000, tất cả trả bằng Quỹ Momo. Hôm cắt tóc lại trả bằng Banking thì báo cáo hiện `Thiết Yếu → Banking: 70.000đ` — Banking không phải nguồn cấp quỹ nên phải được trả lại.

Tên nhóm quỹ trong ghi chú chỉ được tính khi nó đứng **sau chữ `quỹ`** và **kết thúc trọn vẹn**. Nhờ vậy `Gửi xe đi chợ` không bị kéo vào nhóm Đi Chợ, và `( lấy từ quỹ đi chơi với em )` không bị cắt thành `quỹ Đi Chợ`.

Mỗi món liệt kê tối đa 6 giao dịch rồi gộp phần còn lại thành `… và N khoản nữa`. Tên hiển thị được cắt bỏ chú thích quỹ trong ngoặc cho gọn, nhưng ngoặc mang ngữ cảnh thật như `( mua đồ cho em )` thì giữ nguyên.

`vượt 74.444đ` ở mục NGÂN SÁCH chỉ là thông tin: tháng này nhóm đó xài lố so với dự tính.

Nhóm nào không bật `Bắt Buộc Cấp Quỹ` trong Notion thì không bao giờ xuất hiện ở mục ỨNG TRƯỚC, vì nó vốn được chi thẳng từ tài khoản của nó.

### Tiền vào quỹ

Mỗi nhóm quỹ có hai chiều tiền, báo cáo hiện cả hai:

```
✅ Thiết Yếu: 2.298.400đ / 2.400.000đ · quỹ còn 31.600đ
   ↳ đã cấp 2.330.000đ / 2.400.000đ
💵 Đã cấp vào quỹ: 2.330.000đ · quỹ đang giữ: 31.600đ
```

- Dòng trên là **tiền ra**: đã tiêu bao nhiêu so với ngân sách, và trong quỹ còn **tiền thật** bao nhiêu.
- Dòng `↳` là **tiền vào**: đã chuyển được bao nhiêu trên tổng ngân sách của nhóm.
- Dòng `💵` là tổng của cả hai.

`quỹ còn X` **không phải** là ngân sách trừ đã tiêu. Nó là `đã cấp − đã tiêu`, tức tiền đang thật sự nằm trong tài khoản giữ quỹ. Ví dụ trên: ngân sách còn dư 101.600 trên giấy, nhưng 70.000 tiền cắt tóc chưa hề được cấp vào quỹ nên không được tính là tiền của nhóm — trong quỹ chỉ có 31.600 (tiền trọ thừa 28.000 + wifi thừa 3.600). Khi nào cấp nốt 70.000 kia thì dòng này mới thành `quỹ còn 101.600đ`.

Phần chênh lệch đó chính là mục **CẦN CẤP THÊM**: `ngân sách chưa dùng tới − quỹ đang giữ` (xem ở trên).

`quỹ còn X` chỉ hiện khi đó là tiền thật sự **rảnh**. Nếu nhóm có khoản chi trả bằng tài khoản khác thì số dư đã bị hẹn trả lại, nên bị trừ đi trước — không thể vừa khoe *"quỹ còn 31.600đ"* vừa đòi trả đúng 31.600đ đó ở mục ỨNG TRƯỚC.

Nhóm không bật `Bắt Buộc Cấp Quỹ` (như Đi Chợ) không có quỹ riêng, nên dòng của nó vẫn là `còn X` theo ngân sách.

Dòng tổng **không so với tổng ngân sách 5tr5**, vì phần ngân sách đã tiêu rồi thì cấp vào cũng vô nghĩa — tiền đi mất rồi.

Tiền vào lấy từ bảng **Giao Dịch Các Tài Khoản**, chỉ tính giao dịch có gắn nhãn `Nhóm Quỹ` và chuyển **đến** đúng tài khoản giữ quỹ của nhóm. Chuyển ra khỏi tài khoản đó thì trừ đi.

Nhóm không bật `Bắt Buộc Cấp Quỹ` (như Đi Chợ) không có dòng `↳`, vì nó vốn chi thẳng không cần cấp trước.

### Hai nhóm chi tiêu

Bot chia mọi khoản chi làm đúng hai nhóm:

| Nhóm | Gồm gì | Quy tắc |
|---|---|---|
| **Nhóm quỹ** | Khoản thuộc 5 nhóm — theo `Loại Chi Phí` hoặc theo ghi chú nhắc tên quỹ | Tính hết, không phân biệt to nhỏ |
| **Ngoài nhóm quỹ** | Mọi khoản còn lại | Chỉ tính giao dịch **dưới 500.000đ** |

Giao dịch lẻ ngoài nhóm quỹ **từ 500.000đ trở lên** không được tính là chi tiêu của tháng — nó là khoản bất thường, bot liệt kê riêng ở mục `🚫 KHÔNG TÍNH` để tự quyết.

Ngưỡng áp cho **từng giao dịch riêng lẻ**, không phải cho tổng của một loại chi. Một loại chi có tổng 2 triệu gồm nhiều khoản nhỏ vẫn được tính trọn; chỉ khoản đơn lẻ vượt ngưỡng mới bị tách. Đổi ngưỡng ở `outsideBudgetThreshold` trong `src/config.js`.

Không có ngoại lệ theo loại: nạp ví Grab, đổ xăng, sửa xe, cho mượn — tất cả đều theo đúng luật trên. Khoản nào dưới ngưỡng thì là chi tiêu, trên ngưỡng thì bị loại.

### Thu nhập thật và tiền chạy qua

| Nguồn | Bot hiểu là |
|---|---|
| Bảng **Báo Cáo Thu Nhập** | **Thu nhập thật** |
| Bảng **Khoản Thu Khác**, tên chứa `Grap` | Doanh thu gộp — đối ứng với chi phí nạp ví/xăng, không phải kiếm được |
| Bảng **Khoản Thu Khác**, còn lại | Mượn / trả / thu hộ |

Chỉ dòng đầu được cộng vào thu nhập tháng. Hai dòng sau là tiền chạy qua tài khoản.

### Quy ước ghi chú

Bot không chỉ nhìn cột `Loại Chi Phí` mà đọc cả tiêu đề và ô Ghi Chú của khoản chi. Hai động từ, hai việc khác nhau và độc lập với nhau:

| Cách viết | Bot hiểu là |
|---|---|
| `( tính vào quỹ X )` | khoản này **chỉ** thuộc ngân sách nhóm X — rời hẳn khỏi `Loại Chi Phí` của nó |
| `( lấy từ quỹ X )` | khoản này **mượn tiền** của quỹ X → sinh dòng nợ trả về quỹ X |
| `( mượn quỹ X )` | **mượn tiền** của quỹ X |
| `( quỹ X )` | không có tác dụng gì |

Một khoản có thể vừa `tính vào quỹ phát sinh` vừa `lấy từ quỹ tích lũy` — nó được đắp vào ngân sách Phát Sinh, và sinh ra món nợ với quỹ tích lũy.

Khoản được `tính vào quỹ X` **không còn được cộng vào loại chi gốc nữa**. Ví dụ một khoản mang nhãn `Nhà Trọ` (thuộc Thiết Yếu) mà ghi chú kêu tính vào Phát Sinh thì nó rời hẳn Thiết Yếu, chỉ tính cho Phát Sinh — không đếm ở cả hai nơi.

`tính vào` là thứ khiến những khoản như *"Mua bạc xỉu ( tính vào quỹ phát sinh )"* — mang `Loại Chi Phí` là Cà Phê, vốn nằm ngoài mọi nhóm quỹ — vẫn được cộng vào ngân sách Phát Sinh. Không có nó, những khoản đó biến mất khỏi báo cáo và ngân sách trông như còn dư trong khi thực tế đã vượt.

Cả hai động từ đều phải theo sau bằng một chữ bắt đầu bằng `qu`. Nhờ ràng buộc đó, lỗi gõ như `( lấy từ quxy sửa xe )` vẫn về đúng `quỹ sửa xe`, còn câu như *"Tuấn mượn tiền thi bằng lái xe"* không đẻ ra quỹ ma.

Tên quỹ trong ghi chú trùng với chính nhóm đang xét — ví dụ khoản của nhóm Thiết Yếu ghi `( lấy từ quỹ thiết yếu )` — là tiêu tiền của chính nó, không tính là mượn. Với `tính vào`, tên quỹ phải khớp một nhóm có thật trong bảng **Nhóm Quỹ Ngân Sách** thì mới có tác dụng.

Quy ước này dựa vào chữ viết tay nên phụ thuộc vào việc ghi đều. Muốn chắc chắn hơn thì tạo các túi đó thành nhóm quỹ thật trong bảng **Nhóm Quỹ Ngân Sách** và gắn nhãn `Nhóm Quỹ` cho giao dịch, khi đó bot biết được cả số dư từng túi.

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
