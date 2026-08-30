# Bối cảnh dự án

Bot Telegram cá nhân đọc Notion để theo dõi tài chính. Chủ dự án chạy Grab kiếm
sống. File này ghi những quy ước **của riêng hệ thống tiền của anh ấy** — thứ không
đọc ra được từ code hay từ dữ liệu Notion. Đọc kỹ trước khi sửa gì liên quan đến
cách tính tiền, và **đừng hỏi lại những điều đã ghi ở đây**.

## Dòng tiền thật sự vận hành thế nào

**Tiền nhà trọ đầu tháng lấy từ thu nhập THÁNG TRƯỚC**, không phải tháng mới. Đầu
tháng chuyển một cục vào Quỹ Momo để trả tiền phòng. Một phần tiền mặt dùng đi chợ
cũng vậy. Trong tháng chạy Grab có tiền thì đắp ngược lại vào các quỹ đó.

Hệ quả khi phân tích: **không được so thẳng "chi tiêu tháng này" với "thu nhập tháng
này" rồi kết luận lãi lỗ.** Tiền phòng 2,1 triệu nằm trong chi tiêu tháng 8 nhưng
nguồn của nó là thu nhập tháng 7.

## Các nguồn tiền

| Tài khoản | Là gì |
|---|---|
| **Quỹ Momo** | Tài khoản giữ quỹ. Bên trong chứa nhiều túi nhỏ không tồn tại trong Notion |
| Momo, Banking, Tiền Mặt, Grap Tiền Mặt | Tiền của chính mình. Chi bằng chúng **không sinh món nợ nào** |
| Grap Tiền Mặt | Tiền mặt khách trả. Không phải thu nhập riêng — đã nằm trong "Thu nhập ròng app" rồi |

### Túi nhỏ trong Quỹ Momo

Chỉ tồn tại trong chữ ghi ở tên/ghi chú giao dịch: `quỹ sửa xe`, `quỹ tích lũy`,
`quỹ đi chơi với em`, `quỹ mua máy tính cho cháu`.

- **`quỹ sửa xe` nạp bằng thu nhập tháng này** (mỗi ngày 50k) → tiêu nó **là chi tiêu thật**
- Các túi còn lại là **tiền để dành từ trước** → tiêu chúng **không tính** vào chi tiêu tháng
- Khai ở `spendableSubFunds` trong `cloudflare-worker/src/config.js`

## Thu nhập

**Chỉ `Thu nhập ròng app` trong bảng Báo Cáo Thu Nhập mới là thu nhập thật.** Đó là
số tiền kiếm được trong ngày, khách trả tiền mặt hay chuyển khoản đều đã gộp vào,
và **đã bị Grab trừ chiết khấu** trước khi ghi.

Mọi thứ trong bảng Khoản Thu Khác là tiền chạy qua: doanh thu gộp Grab, mượn, trả,
thu hộ.

## Chi tiêu

**Nạp ví Grab CÓ tính là chi tiêu.** Đó là tiền thật ra khỏi ví để chạy được xe.
Đừng lập luận "chiết khấu đã trừ trong thu nhập ròng nên tính nữa là trừ hai lần" —
lập luận đó chỉ đúng khi tính lãi lỗ, còn báo cáo này đo dòng tiền đi ra.

Không tính là chi tiêu:

- Nhãn `Vay Và Trả` — cho mượn rồi đòi lại, hoặc trả nợ cũ
- Ghi chú có chữ `code` — ứng tiền mua hộ khách, được hoàn lại
- Giao dịch lẻ **ngoài lọ** từ 500.000đ trở lên
- Tiêu tiền của một túi để dành (xem bảng trên)

Khoản **trong lọ** thì luôn tính, dù to hay nhỏ.

## Món nợ

Chỉ có **một** trường hợp sinh nợ: chi bằng chính Quỹ Momo mà ghi chú nói `lấy từ
quỹ X`, với X không phải tên một lọ. Trả bằng Momo, Banking, Tiền Mặt, Grap Tiền Mặt
đều **không** sinh nợ — đó là tiền của chính mình.

## Lọ và nhãn con

**Nhóm quỹ = một lọ** trong 6 lọ tài chính, đó là tên lớn. **Nhãn `Loại Chi Phí`
trong Notion là con của lọ.** Đừng lẫn hai thứ.

Sáu lọ: Nhu cầu thiết yếu (55%) · Tiết kiệm dài hạn (10%) · Đầu tư tài chính (10%) ·
Giáo dục phát triển (10%) · Hưởng thụ (10%) · Cho đi (5%).

Hiện chỉ 2 lọ có ngân sách, tổng đúng 5.500.000đ:

| Lọ | Nhãn con | Ngân sách |
|---|---|---|
| Nhu cầu thiết yếu | Nhà Trọ 2.150.000 · Đi Chợ 1.400.000 · Phát Sinh 600.000 · Internet 180.000 · Khác 70.000 | 4.400.000 |
| Giáo dục phát triển | Affiilate 600.000 · Phát triển bản thân 500.000 | 1.100.000 |

18 nhãn còn lại (Grap, Đà Nẵng, Người Thân, Điện Thoại, Ăn Ngoài, Vay Và Trả…) **cố
ý để ngoài lọ**. Đừng tự gán chúng vào lọ.

## Quy tắc làm việc

- **Không bao giờ tự bịa số.** Kéo dữ liệu thật từ Notion rồi chạy code thật. Đã sai
  vì chuyện này nhiều lần.
- **Không dán preview từ snapshot cũ** như thể là số hiện tại. Kéo lại, hoặc ghi rõ
  là số của ngày nào.
- Đọc **toàn bộ giao dịch**, không chỉ cột `Loại Chi Phí`. Tiêu đề và Ghi Chú mang
  ý nghĩa bắt buộc phải tôn trọng.
- Nguyên tắc gốc: **tiền đã tiêu rồi thì thôi, đừng bắt cấp bù.** Chỉ trả lại cho ai
  đã ứng ra.
- Báo cáo phải **gọn**. Nút Quỹ chỉ nói về quỹ; chi tiêu theo loại đã có ở nút Dòng tiền.

## Triển khai

- Code chạy ở `cloudflare-worker/`, deploy tự động từ nhánh `main` qua Workers Builds
- Root directory trong Cloudflare phải là `cloudflare-worker`
- Worker tên `notion-finance-bot`, tại `notion-finance-bot.hongthamcute04.workers.dev`
- Kiểm tra deploy: check-run `Workers Builds: notion-finance-bot` trên commit
- Chạy test: `cd cloudflare-worker && npm test`
- Báo cáo có cache 60 giây trong KV, nên bấm lại ngay sẽ thấy số cũ
