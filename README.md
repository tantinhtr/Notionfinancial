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

Báo cáo tách ngân sách, số quỹ còn, nợ ghi rõ và tiền tháng trước cần cấp bù.
Ví dụ dưới đây là dữ liệu kiểm thử tháng 9/2026, không phải số dư live:

```
Nhà Trọ: 2.017.000đ / 2.150.000đ
Quỹ còn: 133.004đ

📅 TIỀN DƯ THÁNG TRƯỚC
4 nguồn: 3.849.710đ · Nhà trọ: 2.150.000đ
Ba lọ 10%: 566.570đ/lọ

🤝 NỢ GHI RÕ
Nhu cầu thiết yếu mượn Tiết kiệm dài hạn: 750.000đ
Đã trả: 0đ · Còn nợ: 750.000đ
Nợ Em: 500.000đ

♻️ CẦN CẤP BÙ TIỀN THÁNG TRƯỚC
Tiền Mặt: cần cấp bù 1.356.000đ
Banking: cần cấp bù 170.000đ
Momo: cần cấp bù 100.000đ
```

- **NGÂN SÁCH / QUỸ CÒN** — chi so với kế hoạch và số tiền đã cấp còn lại là hai số riêng. **CẦN CẤP THÊM** chỉ tính phần ngân sách chưa dùng; không cấp lại khoản đã tiêu.
- **TIỀN DƯ THÁNG TRƯỚC** — lấy `Số Dư Ban Đầu` của Tiền Mặt, Banking, Grap Tiền Mặt và Momo; loại Quỹ Momo. Dành trước tiền Nhà Trọ rồi chia phần còn lại một lần cho Tiết kiệm dài hạn, Đầu tư tài chính và Hưởng thụ. Số dư hiện tại không kích hoạt chia lại.
- **NỢ GHI RÕ** — đọc tên, ghi chú và quan hệ của giao dịch. Chuyển giữa hai lọ cùng nằm trong Quỹ Momo vẫn có thể mở khoản vay. Số quỹ còn 133.004đ không giảm khoản nợ 750.000đ; chỉ giao dịch trả nợ rõ bên nhận mới giảm nợ.
- **CẦN CẤP BÙ TIỀN THÁNG TRƯỚC** — theo dõi phần chi dùng nguồn đầu tháng theo ngày giao dịch và thứ tự tạo trong ngày. Miễn khoản dự phòng Nhà Trọ. Nếu nguồn tiền trộn lẫn, chỉ ghi phần tối thiểu chắc chắn dùng tiền tháng trước; không gán một khoản thu cụ thể cho một khoản chi.
- **CHƯA ĐỦ DỮ KIỆN** — giao dịch chưa khớp được in ngày, tên và số tiền. Thiếu nguồn cấp quỹ không tự biến thành nợ với Quỹ Momo.

Tuấn trả 100.000đ vào Momo vẫn khép khoản cho Tuấn mượn từ Banking. Khoản Em cho mượn 500.000đ và khoản trả Tố 500.000đ được theo dõi độc lập. Thu nhập Grab, tiền khách trả và số dư tài khoản không tự trả nợ hay cấp bù.

Các hành vi này được kiểm tra tự động cục bộ; chưa xác minh Telegram live cho đến lần triển khai được duyệt và bấm nút thật. Không có thay đổi schema hay ghi dữ liệu Notion trong đợt sửa ledger.

### Lọ và nhãn con

**Nhóm quỹ = một lọ** trong 6 lọ tài chính, đó là tên lớn. **Nhãn `Loại Chi Phí` trong Notion là con của lọ** — nó giữ ngân sách chi tiết.

```
✅ Nhu cầu thiết yếu: 3.614.400đ / 4.400.000đ · quỹ còn 31.600đ
   • Nhà Trọ: 2.122.000đ / 2.150.000đ
   • Đi Chợ: 669.000đ / 1.400.000đ
   • Phát Sinh: 647.000đ / 600.000đ ⛔ vượt 47.000đ
   • Internet: 176.400đ / 180.000đ
   • Khác: 0đ / 70.000đ
   ↳ đã cấp 2.330.000đ / 4.400.000đ
```

Lọ nào có từ 2 nhãn con trở lên thì in thêm dòng con, nên gộp nhiều nhãn vào một lọ vẫn thấy được nhãn nào vượt. Lọ chưa dùng tới — chưa đặt ngân sách, chưa tiêu, chưa cấp — thì không in, nên Notion giữ đủ 6 lọ mà báo cáo chỉ nói những lọ đang chạy.

Sáu lọ trong Notion và phần 5,5 triệu chi tiêu hiện rơi vào:

| Lọ | Nhãn con | Ngân sách |
|---|---|---|
| Nhu cầu thiết yếu (55%) | Nhà Trọ · Đi Chợ · Phát Sinh · Internet · Khác | 4.400.000 |
| Giáo dục phát triển (10%) | Affiilate · Phát triển bản thân | 1.100.000 |
| Tiết kiệm dài hạn (10%) | — (ứng với quỹ sửa xe, quỹ mua máy tính cho cháu) | 0 |
| Đầu tư tài chính (10%) | — (ứng với quỹ tích lũy cá nhân) | 0 |
| Hưởng thụ (10%) | — (ứng với quỹ đi chơi với em) | 0 |
| Cho đi (5%) | — | 0 |

Ghi chú `( tính vào X )` nhận **cả tên lọ lẫn tên nhãn con**. Tên nhãn con thì khoản đó vào đúng dòng con ấy; tên lọ thì chỉ vào lọ. Thứ tự ưu tiên khi trùng tên: tên lọ → tên nhãn con → tên cũ.

Với dạng `tính vào X`, chữ `quỹ` **không bắt buộc** — `( tính vào phát triển bản thân )` chạy y như `( tính vào quỹ phát sinh )`. Không cần canh gác ở đây vì X luôn được đối chiếu với danh sách tên có thật; viết `( tính vào quỹ du thuyền )` thì không khớp gì cả, khoản đó nằm nguyên ở nhãn của nó. Chữ thừa phía sau cũng không sao: `( tính vào phát triển bản thân nhé )` vẫn nhận ra.

Riêng dạng `lấy từ / mượn X` thì **vẫn bắt buộc** chữ `quỹ`, vì nó tạo ra một món nợ với cái tên tự do không đối chiếu được — thiếu canh gác thì `Tuấn mượn tiền thi bằng lái xe` sẽ đẻ ra một quỹ ma.

Tên trong ghi chú chỉ được tính khi nó đứng **sau chữ `quỹ`** và **kết thúc trọn vẹn**. Nhờ vậy `Gửi xe đi chợ` không bị kéo vào lọ Đi Chợ, và `( lấy từ quỹ đi chơi với em )` không bị cắt thành `quỹ Đi Chợ`.

### Hai cột phụ trong Notion

| Cột | Ở đâu | Để làm gì |
|---|---|---|
| `Tên Cũ` | Nhóm Quỹ Ngân Sách | Tên cũ của lọ, cách nhau bằng dấu phẩy. Đổi tên lọ mà ghi chú cũ vẫn khớp, không phải sửa lại giao dịch cũ |
| `Chi Thẳng Không Qua Quỹ` | Chi Phí Và Ngân Sách | Tick cho nhãn con trả thẳng bằng tiền mặt (như Đi Chợ). Phần ngân sách chưa tiêu của nhãn đó không bị đòi bơm vào tài khoản giữ quỹ |

Mỗi món liệt kê tối đa 6 giao dịch rồi gộp phần còn lại thành `… và N khoản nữa`. Tên hiển thị được cắt bỏ chú thích quỹ trong ngoặc cho gọn, nhưng ngoặc mang ngữ cảnh thật như `( mua đồ cho em )` thì giữ nguyên.

`vượt 74.444đ` ở mục NGÂN SÁCH chỉ là thông tin: tháng này nhóm đó xài lố so với dự tính.

`Bắt Buộc Cấp Quỹ` điều khiển phần cấp quỹ; sổ vay và cấp bù tiền tháng trước được tính độc lập từ giao dịch.

### Tiền vào quỹ

Mỗi nhóm quỹ có hai chiều tiền, báo cáo hiện cả hai:

```
✅ Thiết Yếu: 2.298.400đ / 2.400.000đ · quỹ còn 31.600đ
   ↳ đã cấp 2.330.000đ / 2.400.000đ
```

- Dòng trên là **tiền ra**: đã tiêu bao nhiêu so với ngân sách, và trong quỹ còn **tiền thật** bao nhiêu.
- Dòng `↳` là **tiền vào**: đã chuyển được bao nhiêu trên tổng ngân sách của lọ. Chưa cấp đồng nào thì ghi `đã cấp 0đ / 1.100.000đ` chứ không ghi trống "chưa cấp" — phải thấy được còn thiếu bao nhiêu.

`quỹ còn X` **không phải** là ngân sách trừ đã tiêu. Nó là phần còn dương của `đã cấp − đã chi từ quỹ`, không lấy khoản chi bằng tài khoản khác để giảm số dư hay nợ. Số dư vật lý của Quỹ Momo cũng không được dùng thay số tiền của từng lọ.

Phần chênh lệch đó chính là mục **CẦN CẤP THÊM**: `ngân sách chưa dùng tới − quỹ đang giữ` (xem ở trên).

`quỹ còn X` được hiển thị độc lập với nợ và cấp bù; không trừ số dư này khỏi khoản nợ khi chưa có giao dịch trả rõ ràng.

Nhóm không bật `Bắt Buộc Cấp Quỹ` (như Đi Chợ) không có quỹ riêng, nên dòng của nó vẫn là `còn X` theo ngân sách.

Dòng tổng **không so với tổng ngân sách 5tr5**, vì phần ngân sách đã tiêu rồi thì cấp vào cũng vô nghĩa — tiền đi mất rồi.

Tiền vào lấy từ bảng **Giao Dịch Các Tài Khoản**, theo `Nhóm Quỹ` và tài khoản giữ quỹ. Chuyển ra thì trừ đi; khoản vay rõ giữa hai lọ cùng tài khoản vẫn cấp tiền cho lọ nhận đúng một lần.

Nhóm không bật `Bắt Buộc Cấp Quỹ` (như Đi Chợ) không có dòng `↳`, vì nó vốn chi thẳng không cần cấp trước.

### Hai nhóm chi tiêu

Bot chia mọi khoản chi làm đúng hai nhóm:

| Nhóm | Gồm gì | Quy tắc |
|---|---|---|
| **Nhóm quỹ** | Khoản thuộc một lọ — theo `Loại Chi Phí` hoặc theo ghi chú nhắc tên lọ / tên nhãn con | Tính hết, không phân biệt to nhỏ |
| **Ngoài nhóm quỹ** | Mọi khoản còn lại | Chỉ tính giao dịch **dưới 500.000đ** |


Ngưỡng áp cho **từng giao dịch riêng lẻ**, không phải cho tổng của một loại chi. Một loại chi có tổng 2 triệu gồm nhiều khoản nhỏ vẫn được tính trọn; chỉ khoản đơn lẻ vượt ngưỡng mới bị tách. Đổi ngưỡng ở `outsideBudgetThreshold` trong `src/config.js`.

Không có ngoại lệ theo loại: nạp ví Grab, đổ xăng, sửa xe, cho mượn — tất cả đều theo đúng luật trên. Ngoài ngưỡng tiền, còn một luật nữa: giao dịch nào nhắc tới một trong các từ khoá ở `passThroughKeywords` (`src/config.js`) thì bị loại **dù to hay nhỏ**:

| Từ khoá | Vì sao không phải chi tiêu |
|---|---|
| `code` | Ứng tiền mua hộ khách rồi **được hoàn lại**. Ví dụ `Nạp ví grap ( trừ tiền ứng code )` |

Ngoài ra cả nhãn `Vay Và Trả` bị loại (khai ở `passThroughCategories`): cho mượn rồi đòi lại, hoặc trả nợ cũ — tiền đi rồi về, không phải tiêu mất.

**Quỹ con trong Quỹ Momo** thì tuỳ nguồn tiền. Khai ở `spendableSubFunds` những túi được nạp bằng thu nhập **của chính tháng này**:

| Túi | Nguồn | Tiêu nó |
|---|---|---|
| `quỹ sửa xe` | nạp từ thu nhập tháng này, mỗi ngày 50k | **là chi tiêu** — không dùng tới thì tốt, dùng tới là đã tiêu thật |
| `quỹ đi chơi với em`, `quỹ tích lũy`, `quỹ mua máy tính cho cháu` | để dành từ trước | **không tính** vào chi tiêu tháng này |

Mặc định là **không tính**; túi nào là tiền của tháng thì phải khai tên vào `spendableSubFunds`. Luật này chỉ áp cho khoản **ngoài lọ** — khoản trong lọ vẫn tính bình thường; món nợ ghi rõ với túi đó được theo dõi riêng ở mục NỢ GHI RÕ.

Cố ý bắt `code` chứ không bắt `ứng`, vì `1 vỉ trứng gà` cũng chứa `ứng`.

**Nạp ví Grab thì vẫn tính là chi tiêu.** Đó là tiền thật ra khỏi ví để chạy xe, không quay về. Báo cáo này đo dòng tiền đi ra, không phải tính lãi lỗ, nên không trừ nó đi.

Cách chia này vẫn được tính bên trong, nhưng **báo cáo Quỹ & ngân sách không in ra** — nút Dòng tiền đã có sẵn chi tiêu theo từng loại rồi, in lại là thừa. Nút quỹ chỉ nói về quỹ: từng lọ và nhãn con, món nợ, và số cần cấp thêm.

### Thu nhập thật và tiền chạy qua

| Nguồn | Bot hiểu là |
|---|---|
| Bảng **Báo Cáo Thu Nhập** | **Thu nhập thật** |
| Bảng **Khoản Thu Khác**, tên chứa `Grap` | Doanh thu gộp — đối ứng với chi phí nạp ví/xăng, không phải kiếm được |
| Bảng **Khoản Thu Khác**, còn lại | Mượn / trả / thu hộ |

Chỉ dòng đầu được cộng vào thu nhập tháng. Hai dòng sau là tiền chạy qua tài khoản.

Báo cáo **Quỹ & ngân sách không in dòng thu nhập** — con số đó đã có ở nút Dòng tiền. Việc phân loại vẫn chạy, vì nó cần để tách thu nhập thật khỏi tiền chạy qua.

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

## Deploy

Repo đã nối với Cloudflare Workers Builds. **Đẩy code lên nhánh `main` là tự động deploy**, không cần làm gì thêm.

Cấu hình build trong dashboard Cloudflare (Worker `notion-finance-bot` → Settings → Build):

| Ô | Giá trị |
|---|---|
| Production branch | `main` |
| Root directory | `cloudflare-worker` |
| Build command | để trống |
| Deploy command | `npx wrangler deploy` |

`Root directory` phải là `cloudflare-worker` để Cloudflare chạy đúng dự án Worker và dùng đúng `package.json` cùng `wrangler.jsonc`.

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

### Cache báo cáo

Cả hai báo cáo nặng đều được cache **60 giây** trong KV, theo ngày:

| Khoá | Báo cáo |
|---|---|
| `monthly-cashflow:YYYY-MM-DD` | Dòng tiền tháng |
| `fund-budget:YYYY-MM-DD` | Quỹ & ngân sách |

Quỹ & ngân sách đọc **8 bảng Notion**, và bảng Báo Cáo Khoản Chi vượt 100 dòng từ giữa tháng nên phải phân trang — càng cuối tháng càng lâu. Cache làm lần bấm thứ hai trở đi trả về ngay.

Ghi một khoản thu Grab mới sẽ xoá **cả hai** khoá của ngày đó, vì cả hai báo cáo đều dùng số thu nhập.

### Gọi Notion

Notion cho trung bình **3 request/giây**. Báo cáo Quỹ & ngân sách bắn 8 truy vấn song song, và bảng Báo Cáo Khoản Chi vượt 100 dòng từ giữa tháng nên phải phân trang — dễ dính **429**.

| | |
|---|---|
| **Hết giờ** | 8 giây mỗi request, xấu nhất cả 3 lượt khoảng 25 giây — phải nằm gọn trong hạn chờ ~60 giây của Telegram. Không có thì một request treo sẽ treo luôn nút bấm và người dùng không nhận được gì |
| **Thử lại 429** | Tối đa 3 lượt, chờ theo `Retry-After` của Notion, không có thì lùi 0,4s rồi 0,8s |
| **Không thử lại lệnh ghi** | `createPage` chỉ gọi một lần. Thử lại một lệnh ghi là tạo khoản thu trùng — đúng thứ `UpdateCoordinator` sinh ra để chống |
| **5xx vẫn nổi lên trên** | Coordinator đánh dấu update là `retryable`, Telegram gửi lại, không mất giao dịch nào |

### CI

`.github/workflows/ci.yml` chạy mỗi lần push lên `main` và mỗi pull request: `npm ci`, kiểm tra cú pháp, rồi toàn bộ bài test. Kết quả hiện thành dấu ✓ hoặc ✗ ngay cạnh commit trên GitHub.

**CI không chặn được deploy.** GitHub Actions và Cloudflare Workers Builds chạy song song, độc lập nhau — test đỏ thì Cloudflare vẫn đẩy code lên. Muốn chặn thật thì đổi deploy command trong Cloudflare dashboard thành:

```
npm test && npx wrangler deploy
```

Lúc đó test đỏ sẽ làm build fail, và bot giữ nguyên bản cũ đang chạy.
