# Thiết kế module theo nghiệp vụ và phân trách nhiệm từng file

Trạng thái: thiết kế đã duyệt và triển khai; kiểm chứng trong kế hoạch và docs/architecture.md. Thay thế đề xuất ba feature/bốn thư mục đồng loạt trước đây. Căn cứ: [kiểm kê, luồng và ánh xạ toàn bộ 163 file](../../project-architecture-audit.md), baseline `5d55827`.

## Mục tiêu

Mỗi năng lực đang có có chủ sở hữu rõ, hợp đồng rõ và file tập trung một trách nhiệm. Giữ JavaScript và factory/object injection. Không sao chép module/tên file/TypeScript từ ví dụ. Không thay logic tài chính, giao diện, schema, cache, lịch cron hoặc chính sách ACK trong refactor.

## Các phương án

1. Đề xuất: modules theo năng lực thực tế, file đặt tên theo trách nhiệm; chỉ có thư mục con rules/presenters khi module đã có nhiều file. Đủ ownership, không dựng tầng rỗng.
2. Chia mọi module thành bốn thư mục tầng cứng: nhất quán hình thức nhưng ledger thuần và module kỹ thuật không có đủ bốn trách nhiệm.
3. Giữ global domain/repositories và chỉ đổi import guard: ít chuyển file, nhưng không đáp ứng ownership theo module người dùng yêu cầu.

## Sơ đồ đích

```text
src/
  app/                         HTTP/security, Durable Object shell, DI, platform scheduling
    runtime.js
  modules/
    cashflow/                  controller, presenter, service, repository, contracts, rules
    income-goal/               controller, presenter, service, repository, contracts, rules
    fund-budget/               controller, service, repository, contracts, rules/, presenters/
    financial-ledger/          service thuần, contracts, rules/; không thêm UI/I/O giả
    six-jar-sync/              service, repository, contracts, projection rules
    telegram-bot/              router, shared response presentation, contracts
    update-processing/         state machine service và contracts
    shared/
      cache/                   KV adapter, cache contract/policy, legacy bridge
      transport/               raw Notion/Telegram HTTP và response helpers
      finance/                 ngày, định dạng, đọc property/transaction dùng chung
  jobs/                        cron bridges -> public application capability
  config.js
  index.js
```

Mỗi module có index.js công khai; contract dùng JSDoc. Không cần abstract class, DI framework, event bus, DTO conversion toàn hệ thống hoặc thay parser chỉ để khớp một ví dụ. Những dữ liệu có hình dạng Notion đang được pure rules đọc phải được mô tả trung thực trong contract; chưa tuyên bố thay DB sẽ không cần mapper.

## Các hợp đồng cần chốt trước implementation

| Contract | Input/output và bảo đảm |
|---|---|
| Cashflow data port | load current-month account/transaction/category datasets; giữ 8 queries và filter/concurrency |
| Budget data port | load current datasets; explicit history reads; trả dữ liệu, không tính report |
| Income data port | read goals/incomes, find by update ID, create prepared income; trả page/id; write mơ hồ không tự retry |
| Income service | update ID + amount + injected date; validate, duplicate lookup, create, invalidate, goal result; giữ semantics lỗi hiện tại |
| Ledger evaluator | supplied current/history rows + openingPlan/options -> loans, advances, issues; không I/O hoặc clock toàn cục |
| Budget report service | injected data/cache/ledger evaluator/clock -> report; quyết định history, rollover, opening allocation |
| Six-jar sync port | schema/read rows/create/update operations; service chọn tháng và xử lý trùng/blank/no-op; projection không tính lại phân bổ |
| Cache | get/set/delete, serialization và TTL hiện tại; lỗi cache không đổi thành lỗi ghi Notion |
| Update processing | storage get/put, mutex, execute/classify/reconcile/complete/warn, injected clock; giữ state machine và record format |
| Delivery | sendMessage/answerCallbackQuery theo đối tượng đã chuẩn bị; presentation sở hữu text/keyboard |

Hợp đồng phải có shape, lỗi và side effect; contract test chạy với object giả lập. Một chữ interface hay constructor injection đơn lẻ chưa đủ chứng minh DIP.

## Luồng phụ thuộc

Controller -> injected application service -> injected repository/clock/cache và pure rules. Repository -> injected raw adapter. Domain không import repository/adapter/app. Module không import nội bộ module khác.

Budget application được inject ledger evaluator và tính openingPlan trước; ledger không import ngược budget. Các luật history dùng chung với ledger đi qua public pure API hoặc predicate được inject. Historical rollover gọi cùng bộ pure budget calculation với evaluator đã cấp; không tạo dependency cycle khi tách opening-plan.

Income service được inject invalidation callback. Runtime nối callback cashflow rồi budget theo thứ tự hiện tại, giữ hành vi nếu lần xóa đầu tiên lỗi. Không để income biết cache key của module khác.

Interactive budget workflow gọi budget report service rồi six-jar sync service được inject; trả sync status để presenter thêm cảnh báo cũ. Cron sync dùng chính hai service đó, refresh bắt buộc. Reminder gọi income service và delivery/presenter qua job wiring, không biến Telegram controller thành nghiệp vụ.

Update processing xử lý độ tin cậy delivery, financial ledger xử lý tiền; hai module không nhập làm một. HTTP/Durable Object host giữ tên binding/class/record format. HTTP200 không là xác nhận write thành công; không thêm queue trong công việc này.

## Bảo toàn và tương thích

- Đường dẫn export cũ giữ dưới dạng facade; factory cũ có shim chuyển tiếp nếu cần. Không giữ hai implementation.
- Giữ mọi callback legacy, text, Notion properties, timezone, cache prefix/TTL, update ID và lịch cron.
- Không sửa 136972 override, 2150000 rent, 2:2:2:1, account source set hay thuật toán rounding khi chuyển ownership.
- Pure function contract cũ được giữ bằng wrapper khi tách ledger/openingPlan; không đổi cả API công khai và thuật toán cùng lúc.
- assets/config/CI/tests/docs có ownership hỗ trợ riêng theo bảng kiểm kê; không ép tất cả vào module nghiệp vụ.

## Thứ tự chuyển đổi và kiểm chứng

1. Khóa baseline outputs/contracts; hoàn thiện port shapes từ caller hiện tại.
2. Shared transports và primitives; giữ public facades.
3. Income-goal, cashflow: tách data access khỏi application; kiểm thử DI không mạng.
4. Financial ledger + fund-budget theo cùng một bước ranh giới để tránh vòng openingPlan; giữ kết quả differential.
5. Six-jar sync: projection/service/repository, kiểm tra exact writes và no-op/schema cases.
6. Telegram routing/update processing/cron: nối qua public capabilities; giữ duplicate/reconciliation/auth tests.
7. Guard toàn bộ graph, tài liệu mapping thực tế, syntax/full suite/build và review độc lập.

Tiêu chí: 321 test baseline không nới assertions tài chính; thêm contract/boundary tests; so full outputs và input effects với 5d55827; giữ 145 comparison calls hiện có và bổ sung khi đổi contract. Kiểm tra cache error ordering, post-write recovery, UTC+7 dates và hai cron. Live Telegram phải ghi rõ đã/ chưa thử. Không triển khai production trong bước khảo sát này.
