# Telegram Account Spending Design

## Muc tieu

Thay man hinh `Chi thang nay` bang bao cao hai chieu:

1. Theo doi cac khoan ngan sach co dinh trong han muc 5.500.000 VND.
2. Cho biet moi tai khoan thuc te da thanh toan bao nhieu va cho nhung loai chi nao.

Tai khoan thanh toan khong bi gioi han vao mot loai chi. Mot khoan chi bang Grab Tien Mat
khong tu dong duoc coi la khoan muon.

## Ngan sach co dinh

Ban thu nghiem dung cau hinh trong Apps Script, khong thay doi schema Notion:

| Khoan | Ngan sach |
| --- | ---: |
| Nha Tro | 2.200.000 |
| Internet | 200.000 |
| Di Cho | 1.300.000 |
| Affiilate | 700.000 |
| Phat Sinh | 500.000 |
| Chua phan bo | 600.000 |
| Tong | 5.500.000 |

Ten loai chi phai khop dung ten trong Notion. `Affiilate` giu nguyen cach viet hien tai
trong Notion.

## Quy tac tinh

### Tien do khoan co dinh

Chi tieu cua mot khoan co dinh duoc cong tren tat ca tai khoan thanh toan.

Vi du:

- Di Cho bang Grab Tien Mat: 758.000
- Di Cho bang tai khoan khac: 43.000
- Tong Di Cho: 801.000
- Con lai: 1.300.000 - 801.000 = 499.000

### Chi theo tai khoan

Moi tai khoan hien:

- Tong chi trong thang.
- Tong theo tung `Loai Chi Phi`.
- Chi tiet giao dich khi bam vao mot loai chi.

Vi du Grab Tien Mat:

- Tong: 1.949.000
- Di Cho: 758.000
- Grab: 763.000
- Phat Sinh: 144.000
- Cac loai khac theo du lieu Notion.

Chi ngoai ke hoach van duoc cong vao tong chi thang va phan ngan sach chua phan bo.
No khong lam giam ngan sach cua mot khoan co dinh khac.

### Khoan muon

Khong suy dien khoan muon chi tu viec tai khoan thanh toan khac voi quy du kien.
Chi bao no/muon khi Notion co giao dich chuyen tai khoan hoac du lieu muon/tra ro rang.

## Giao dien Telegram

Menu chinh:

- Muc tieu
- Bao cao thang
- Chi theo tai khoan

Man hinh `Chi theo tai khoan`:

1. Tong chi va han muc 5.500.000.
2. Tien do cac khoan co dinh: ngan sach, da chi, con lai hoac vuot.
3. Cac nut tai khoan chi co phat sinh trong thang.

Khi bam mot tai khoan:

1. Tong chi cua tai khoan.
2. Danh sach loai chi va tong tien.
3. Nut tung loai chi de xem ngay, noi dung va so tien.
4. Nut quay lai danh sach tai khoan va trang chinh.

## Du lieu

- Khoan chi: `Báo Cáo Khoản Chi`.
- Loai chi: relation `Loại Chi Phí`.
- Tai khoan thanh toan: relation `Phương Thức Thanh Toán`.
- Ten tai khoan: database `Tài Khoản`.
- Khoang thoi gian: tu ngay dau thang den ngay hien tai.
- Ho tro phan trang Notion khi co hon 100 ban ghi.

## Loi va gioi han

- Giao dich thieu tai khoan vao nhom `(chưa chọn tài khoản)`.
- Giao dich thieu loai chi vao nhom `(chưa phân loại)`.
- Chi hien cac tai khoan va loai chi co tong lon hon 0.
- Telegram gioi han chi tiet toi da 30 giao dich moi man hinh.
- Neu ten khoan co dinh khong khop Notion, bot can hien canh bao thay vi am tham tinh 0.

## Kiem thu

- Menu co nut `Chi theo tài khoản`.
- Di Cho duoc cong tren nhieu tai khoan.
- Tong theo tai khoan bang tong cac loai chi cua tai khoan.
- Chi ngoai ke hoach khong tru vao ngan sach Di Cho.
- Khoan thieu tai khoan/loai chi khong bi mat.
- Callback tai khoan va loai chi tra dung man hinh va nut quay lai.
- Cac kiem thu `/muctieu` va `/thang` tiep tuc dat.
