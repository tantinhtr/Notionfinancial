# Khảo sát toàn repo và bản đồ sở hữu đề xuất

Trạng thái: ảnh chụp khảo sát trước triển khai; giữ để đối chiếu. Cấu trúc hiện tại nằm trong module-map.md. Baseline Git: `5d55827`.

## Phạm vi đã kiểm kê

- 163 file tracked: 104 JavaScript production và 59 file hỗ trợ.
- Đã lập graph import/export cho cả 104 file; lần theo HTTP/router/coordinator, cashflow, income, fund-budget, ledger, đồng bộ Notion, cache và cron.
- Repo tracked hiện có một ứng dụng Cloudflare Worker, không có source frontend/CSS/Python đang được theo dõi. CI còn comment nhắc dự án Python cũ; không coi comment đó là bằng chứng có ứng dụng Python hiện tại.
- Tài liệu kế hoạch cũ là lịch sử, không phải tính năng đang chạy. Asset ảnh đại diện là tài nguyên, không phải module nghiệp vụ.
- Không đọc nội dung secret/cookie hay đưa file local bị ignore vào bản đồ public.
- Kết quả kiểm thử gần nhất trong phiên: 321/321 tests và 104 file syntax đạt; không chạy lại test vì khảo sát này chỉ viết tài liệu.

## Luồng được xác định từ code

| Luồng | Entry -> xử lý -> đầu ra | Ràng buộc cần giữ |
|---|---|---|
| Health và webhook | src/index -> app/index -> security -> coordinator gateway | GET health; secret; 401/400; processing_failed 200 |
| Chống trùng/ghi chưa rõ kết quả | UpdateCoordinator -> coordinator-handler -> execute/reconcile/complete | storage record, mutex, committed/retryable/needs_reconciliation; không tạo lại write mơ hồ |
| Trang chủ | bot-router /start -> một nút cash_home | Giữ giao diện đã thống nhất |
| Dòng tiền | cash callbacks -> cashflow component -> repo -> 8 queries -> model -> presenter | Toàn bộ tài khoản, direction/category navigation, callback legacy, cache refresh |
| Mục tiêu | /muctieu hoặc show_goal/refresh_goal -> goal query -> goal-model -> presenter | Múi giờ, mục tiêu điều chỉnh theo ngày, ngày còn lại |
| Ghi thu nhập | text parser -> update ID lookup -> Notion create -> invalidate -> goal confirmation | Schema hiện có, số tiền hợp lệ, chống trùng, lỗi write vs cache khác nhau |
| Ngân sách | show_funds -> current rows -> chọn history -> rollover -> ledger -> groups -> presenter | paidOutsideFund, loanFlow, personalSpendingTotal, quỹ còn chỉ nhãn con |
| Đối soát tài chính | rows -> validation -> personal/fund loans -> advances -> issues | Bằng chứng giao dịch/tài khoản/thời gian, không suy diễn trả nợ |
| Phân bổ đầu tháng | opening accounts + carryover -> rent reserve -> weights/rounding | 136972 override tháng 10/2026; rent 2150000; 2:2:2:1; không đổi tài khoản nguồn trong refactor |
| Đồng bộ sáu lọ | computed report -> schema check -> month-row selection -> create/update/no-op | Không tính tiền lần hai; giữ xử lý formula cũ, blank row, duplicate-month error |
| Cron ngày | 0 14 * * * UTC -> reminder -> goal status -> Telegram | 21:00 UTC+7 |
| Cron đồng bộ | */15 * * * * -> force fresh fund report -> six-jar sync | Cùng phép tính với nút bot, không thay lịch |
| Cache | report prefix + report/date key -> get/set/delete | TTL60; read/write failure fallback; đúng thứ tự invalidation |

## Ranh giới đề xuất và căn cứ

| Nơi sở hữu | Căn cứ trong mã nguồn | Public capability |
|---|---|---|
| modules/cashflow | Bộ callback, 8 nguồn query, builder và presenter riêng | getMonthlyCashflow, điều hướng tài khoản, invalidate |
| modules/income-goal | Ghi Grab và mục tiêu dùng chung dataset/category; không cần tách thành hai module lúc này | recordIncome, getGoalStatus, findByUpdateId, reminder |
| modules/fund-budget | Catalog/nhãn con/expense/funding/rollover/opening plan kết hợp trong một báo cáo | getFundBudgetReport, pure budget builders, invalidate |
| modules/financial-ledger | 12 file ledger hiện tại chứa nhiều loại nghĩa vụ và validation; không chỉ một hàm debt | evaluate(input, openingPlan), history eligibility, evidence predicates |
| modules/six-jar-sync | Có read/update schema, row selection, create/update/no-op và hai caller (interactive, cron) | sync(report), không lấy lại hoặc tính lại report |
| modules/telegram-bot | Router, authentication người dùng, callback acknowledgment và view chung | processUpdate, public classification hooks |
| modules/update-processing | State machine độc lập đã inject storage/mutex/execute/reconcile | handle(update); không chứa phép tính nợ |
| modules/shared | Transport/cache/primitive thực sự nhiều nơi sử dụng | Các contract hẹp; không biết module nghiệp vụ |
| app + jobs | HTTP, Durable Object shell, config, DI và lịch thực thi | Host platform; lắp các capability public |

Danh sách này được rút từ luồng đang có; không tạo module riêng cho mỗi database, mỗi bảng hoặc mỗi hàm. Thu nhập/mục tiêu ở cùng module vì hiện có cùng dữ liệu và quy trình. Ledger không có controller/repository riêng vì đang là tính toán trên dữ liệu do report service cung cấp. Shared chia cache, transport và finance; không dồn mọi helper vào một file.

## Bản đồ từng file production

Mọi đường dẫn dưới đây tương đối với cloudflare-worker/src. Với dòng Tách, service/repository là các file cùng thư mục module. Facade là đường dẫn tương thích, không chứa bản sao logic.

| File hiện tại | Chủ sở hữu/đích đề xuất | Hành động | Lý do |
|---|---|---|---|
| adapters/http-response.js | modules/shared/transport/http-response.js | Chuyển | Transport/serialization chung; không sở hữu nghiệp vụ. |
| adapters/kv-cache-adapter.js | modules/shared/cache/kv-cache-adapter.js | Chuyển | Transport/serialization chung; không sở hữu nghiệp vụ. |
| adapters/notion-adapter.js | modules/shared/transport/notion-adapter.js | Chuyển | Transport/serialization chung; không sở hữu nghiệp vụ. |
| adapters/notion.js | adapters/notion.js | Facade | Giữ alias cũ tới transport mới. |
| adapters/state.js | modules/shared/cache/legacy-state.adapter.js | Tương thích | Giữ API state cũ; không thay Durable Object bằng KV. |
| adapters/telegram-adapter.js | modules/shared/transport/telegram-adapter.js | Chuyển | Transport/serialization chung; không sở hữu nghiệp vụ. |
| adapters/telegram.js | adapters/telegram.js | Facade | Giữ alias cũ tới transport mới. |
| app/bot-presenter.js | modules/telegram-bot/bot-presenter.js | Chuyển | Định tuyến/xác thực người dùng, phản hồi chung hoặc giới hạn text. |
| app/bot-router.js | modules/telegram-bot/bot-router.js | Chuyển | Định tuyến/xác thực người dùng, phản hồi chung hoặc giới hạn text. |
| app/coordinator-gateway.js | app/coordinator-gateway.js | Giữ/đấu nối | Host HTTP/Cloudflare và DI; gọi API module, không thêm luật tài chính. |
| app/coordinator-handler.js | modules/update-processing/update-processing.service.js | Chuyển | State machine độc lập Cloudflare; inject storage, mutex, handlers, clock. |
| app/http-response.js | app/http-response.js | Giữ/đấu nối | Host HTTP/Cloudflare và DI; gọi API module, không thêm luật tài chính. |
| app/http-security.js | app/http-security.js | Giữ/đấu nối | Host HTTP/Cloudflare và DI; gọi API module, không thêm luật tài chính. |
| app/index.js | app/index.js | Giữ/đấu nối | Host HTTP/Cloudflare và DI; gọi API module, không thêm luật tài chính. |
| app/legacy-bot.js | app/legacy-bot.js | Tương thích | Factory cũ nối qua public API module mới. |
| app/runtime.js | app/runtime.js | Giữ/đấu nối | Host HTTP/Cloudflare và DI; gọi API module, không thêm luật tài chính. |
| app/scheduled.js | app/scheduled.js | Giữ/đấu nối | Host HTTP/Cloudflare và DI; gọi API module, không thêm luật tài chính. |
| app/telegram-presenter.js | modules/telegram-bot/telegram-presenter.js | Chuyển | Định tuyến/xác thực người dùng, phản hồi chung hoặc giới hạn text. |
| app/update-coordinator.js | app/update-coordinator.js | Giữ/đấu nối | Host HTTP/Cloudflare và DI; gọi API module, không thêm luật tài chính. |
| app/webhook.js | app/webhook.js | Facade | Export tương thích app/index.js. |
| bot.js | bot.js | Facade | Giữ hợp đồng import cũ, chuyển export sang chủ sở hữu mới. |
| config.js | config.js | Giữ | Đọc binding/config; runtime chỉ truyền phần config cần thiết. |
| coordinator.js | coordinator.js | Facade | Giữ hợp đồng import cũ, chuyển export sang chủ sở hữu mới. |
| domain/budget/assignment.js | modules/fund-budget/rules/assignment.js | Chuyển | Luật ngân sách/nhãn con/rollover; model nhận kết quả ledger qua tham số. |
| domain/budget/catalog.js | modules/fund-budget/rules/catalog.js | Chuyển | Luật ngân sách/nhãn con/rollover; model nhận kết quả ledger qua tham số. |
| domain/budget/child-matching.js | modules/fund-budget/rules/child-matching.js | Chuyển | Luật ngân sách/nhãn con/rollover; model nhận kết quả ledger qua tham số. |
| domain/budget/children.js | modules/fund-budget/rules/children.js | Chuyển | Luật ngân sách/nhãn con/rollover; model nhận kết quả ledger qua tham số. |
| domain/budget/expenses.js | modules/fund-budget/rules/expenses.js | Chuyển | Luật ngân sách/nhãn con/rollover; model nhận kết quả ledger qua tham số. |
| domain/budget/funding.js | modules/fund-budget/rules/funding.js | Chuyển | Luật ngân sách/nhãn con/rollover; model nhận kết quả ledger qua tham số. |
| domain/budget/groups.js | modules/fund-budget/rules/groups.js | Chuyển | Luật ngân sách/nhãn con/rollover; model nhận kết quả ledger qua tham số. |
| domain/budget/history.js | modules/fund-budget/rules/history.js | Chuyển | Luật ngân sách/nhãn con/rollover; model nhận kết quả ledger qua tham số. |
| domain/budget/model.js | modules/fund-budget/rules/model.js | Chuyển | Luật ngân sách/nhãn con/rollover; model nhận kết quả ledger qua tham số. |
| domain/budget/rollover.js | modules/fund-budget/rules/rollover.js | Chuyển | Luật ngân sách/nhãn con/rollover; model nhận kết quả ledger qua tham số. |
| domain/budget/totals.js | modules/fund-budget/rules/totals.js | Chuyển | Luật ngân sách/nhãn con/rollover; model nhận kết quả ledger qua tham số. |
| domain/budget/transfers.js | modules/fund-budget/rules/transfers.js | Chuyển | Luật ngân sách/nhãn con/rollover; model nhận kết quả ledger qua tham số. |
| domain/cashflow/model.js | modules/cashflow/cashflow.rules.js | Chuyển | Tổng hợp tài khoản, thu/chi và phân loại dòng tiền. |
| domain/debt-resolver.js | domain/debt-resolver.js | Facade | API tính toán cũ export từ module sở hữu; production không import ngược facade. |
| domain/finance-rules.js | domain/finance-rules.js | Facade | API tính toán cũ export từ module sở hữu; production không import ngược facade. |
| domain/finance/calendar.js | modules/shared/finance/calendar.js | Chuyển | Primitive định dạng/ngày/Notion property dùng chung; giữ khác biệt coercion hiện có. |
| domain/finance/expense-classifier.js | modules/fund-budget/rules/expense-classifier.js | Chuyển | Luật loại chi, tiền đi hộ, vốn vay và chi tiêu cá nhân của báo cáo ngân sách. |
| domain/finance/goal-model.js | modules/income-goal/income-goal.rules.js | Chuyển | Tính mục tiêu ngày/tháng từ dữ liệu cung cấp. |
| domain/finance/income-input.js | modules/income-goal/income-input.js + modules/shared/finance/calendar.js | Tách | Parser tiền thuộc income; ngày/tháng dùng chung; router gọi public income parser. |
| domain/finance/notion-properties.js | modules/shared/finance/notion-properties.js | Chuyển | Primitive định dạng/ngày/Notion property dùng chung; giữ khác biệt coercion hiện có. |
| domain/finance/report-data.js | modules/shared/finance/report-data.js | Chuyển | Primitive định dạng/ngày/Notion property dùng chung; giữ khác biệt coercion hiện có. |
| domain/finance/shared.js | modules/shared/finance/shared.js | Chuyển | Primitive định dạng/ngày/Notion property dùng chung; giữ khác biệt coercion hiện có. |
| domain/ledger/advance-evidence.js | modules/financial-ledger/rules/advance-evidence.js | Chuyển | Ledger tài chính thuần: vay/quỹ/ứng/hoàn trả và vấn đề dữ liệu; không truy vấn Notion. |
| domain/ledger/advance-state.js | modules/financial-ledger/rules/advance-state.js | Chuyển | Ledger tài chính thuần: vay/quỹ/ứng/hoàn trả và vấn đề dữ liệu; không truy vấn Notion. |
| domain/ledger/evidence.js | modules/financial-ledger/rules/evidence.js | Chuyển | Ledger tài chính thuần: vay/quỹ/ứng/hoàn trả và vấn đề dữ liệu; không truy vấn Notion. |
| domain/ledger/finance-ledger.js | modules/financial-ledger/financial-ledger.service.js | Chuyển/tách | Ledger tài chính thuần: vay/quỹ/ứng/hoàn trả và vấn đề dữ liệu; không truy vấn Notion. |
| domain/ledger/fund-loan-ledger.js | modules/financial-ledger/rules/fund-loan-ledger.js | Chuyển | Ledger tài chính thuần: vay/quỹ/ứng/hoàn trả và vấn đề dữ liệu; không truy vấn Notion. |
| domain/ledger/opening-plan.js | modules/fund-budget/rules/opening-plan.js | Chuyển | Phân bổ đầu tháng thuộc ngân sách; truyền openingPlan cho ledger, tránh vòng phụ thuộc. |
| domain/ledger/personal-loan-ledger.js | modules/financial-ledger/rules/personal-loan-ledger.js | Chuyển | Ledger tài chính thuần: vay/quỹ/ứng/hoàn trả và vấn đề dữ liệu; không truy vấn Notion. |
| domain/ledger/previous-month-ledger.js | modules/financial-ledger/rules/previous-month-ledger.js | Chuyển | Ledger tài chính thuần: vay/quỹ/ứng/hoàn trả và vấn đề dữ liệu; không truy vấn Notion. |
| domain/ledger/rows.js | modules/shared/finance/transaction-rows.js | Chuyển | Giải mã giao dịch dùng bởi ledger và bước quyết định lịch sử của ngân sách. |
| domain/ledger/transaction-language.js | modules/financial-ledger/rules/transaction-language.js | Chuyển | Ledger tài chính thuần: vay/quỹ/ứng/hoàn trả và vấn đề dữ liệu; không truy vấn Notion. |
| domain/ledger/validation.js | modules/financial-ledger/rules/validation.js | Chuyển | Ledger tài chính thuần: vay/quỹ/ứng/hoàn trả và vấn đề dữ liệu; không truy vấn Notion. |
| domain/string-parser.js | domain/string-parser.js | Facade | API tính toán cũ export từ module sở hữu; production không import ngược facade. |
| features/cashflow/callbacks.js | modules/cashflow/callbacks.js | Chuyển | Presentation/callback giữ nguyên text, nút và data contract. |
| features/cashflow/component.js | modules/cashflow/cashflow.controller.js + cashflow.service.js | Tách | Controller nhận/sending view; service điều phối dùng repository và injected ports. |
| features/cashflow/index.js | features/cashflow/index.js | Facade | Giữ đường dẫn cũ; implementation chỉ có ở modules. |
| features/cashflow/model.js | features/cashflow/model.js | Facade | Giữ đường dẫn cũ; implementation chỉ có ở modules. |
| features/cashflow/presenter.js | modules/cashflow/presenter.js | Chuyển | Presentation/callback giữ nguyên text, nút và data contract. |
| features/cashflow/repository.js | features/cashflow/repository.js | Facade | Giữ đường dẫn cũ; implementation chỉ có ở modules. |
| features/fund-budget/component.js | modules/fund-budget/fund-budget.controller.js + fund-budget.service.js | Tách | Controller nhận/sending view; service điều phối dùng repository và injected ports. |
| features/fund-budget/index.js | features/fund-budget/index.js | Facade | Giữ đường dẫn cũ; implementation chỉ có ở modules. |
| features/fund-budget/model.js | features/fund-budget/model.js | Facade | Giữ đường dẫn cũ; implementation chỉ có ở modules. |
| features/fund-budget/models/assignment.js | features/fund-budget/models/assignment.js | Facade | Giữ đường dẫn cũ; implementation chỉ có ở modules. |
| features/fund-budget/models/catalog.js | features/fund-budget/models/catalog.js | Facade | Giữ đường dẫn cũ; implementation chỉ có ở modules. |
| features/fund-budget/models/child-matching.js | features/fund-budget/models/child-matching.js | Facade | Giữ đường dẫn cũ; implementation chỉ có ở modules. |
| features/fund-budget/models/children.js | features/fund-budget/models/children.js | Facade | Giữ đường dẫn cũ; implementation chỉ có ở modules. |
| features/fund-budget/models/expenses.js | features/fund-budget/models/expenses.js | Facade | Giữ đường dẫn cũ; implementation chỉ có ở modules. |
| features/fund-budget/models/funding.js | features/fund-budget/models/funding.js | Facade | Giữ đường dẫn cũ; implementation chỉ có ở modules. |
| features/fund-budget/models/groups.js | features/fund-budget/models/groups.js | Facade | Giữ đường dẫn cũ; implementation chỉ có ở modules. |
| features/fund-budget/models/history.js | features/fund-budget/models/history.js | Facade | Giữ đường dẫn cũ; implementation chỉ có ở modules. |
| features/fund-budget/models/rollover.js | features/fund-budget/models/rollover.js | Facade | Giữ đường dẫn cũ; implementation chỉ có ở modules. |
| features/fund-budget/models/totals.js | features/fund-budget/models/totals.js | Facade | Giữ đường dẫn cũ; implementation chỉ có ở modules. |
| features/fund-budget/models/transfers.js | features/fund-budget/models/transfers.js | Facade | Giữ đường dẫn cũ; implementation chỉ có ở modules. |
| features/fund-budget/presenter.js | modules/fund-budget/presenter.js | Chuyển | Presentation/callback giữ nguyên text, nút và data contract. |
| features/fund-budget/presenters/account-spending.js | modules/fund-budget/presenters/account-spending.js | Chuyển | Presentation/callback giữ nguyên text, nút và data contract. |
| features/fund-budget/presenters/data-issues.js | modules/fund-budget/presenters/data-issues.js | Chuyển | Presentation/callback giữ nguyên text, nút và data contract. |
| features/fund-budget/presenters/group-lines.js | modules/fund-budget/presenters/group-lines.js | Chuyển | Presentation/callback giữ nguyên text, nút và data contract. |
| features/fund-budget/repository.js | features/fund-budget/repository.js | Facade | Giữ đường dẫn cũ; implementation chỉ có ở modules. |
| features/fund-budget/six-jar-sync.js | modules/six-jar-sync/six-jar-sync.service.js + six-jar-sync.repository.js + six-jar-sync.rules.js | Tách | Projection sáu lọ, chọn dòng tháng và persistence/schema tách riêng; không tính lại tiền. |
| features/income-goal/component.js | modules/income-goal/income-goal.controller.js + income-goal.service.js | Tách | Controller nhận/sending view; service điều phối dùng repository và injected ports. |
| features/income-goal/index.js | features/income-goal/index.js | Facade | Giữ đường dẫn cũ; implementation chỉ có ở modules. |
| features/income-goal/model.js | features/income-goal/model.js | Facade | Giữ đường dẫn cũ; implementation chỉ có ở modules. |
| features/income-goal/presenter.js | modules/income-goal/presenter.js | Chuyển | Presentation/callback giữ nguyên text, nút và data contract. |
| features/income-goal/repository.js | features/income-goal/repository.js | Facade | Giữ đường dẫn cũ; implementation chỉ có ở modules. |
| features/shared/report-data.js | features/shared/report-data.js | Facade | Trỏ tới shared finance mới. |
| finance.js | finance.js | Facade | Giữ hợp đồng import cũ, chuyển export sang chủ sở hữu mới. |
| index.js | index.js | Giữ | Entrypoint Wrangler; giữ export Durable Object. |
| jobs/cron-reminder.js | jobs/cron-reminder.js | Đấu nối | Cron bridge gọi service public; không phụ thuộc controller Telegram. |
| jobs/six-jar-sync.js | jobs/six-jar-sync.js | Đấu nối | Cron bridge gọi service public; không phụ thuộc controller Telegram. |
| ledger.js | ledger.js | Facade | Giữ hợp đồng import cũ, chuyển export sang chủ sở hữu mới. |
| notion.js | notion.js | Facade | Giữ hợp đồng import cũ, chuyển export sang chủ sở hữu mới. |
| repositories/cashflow-repository.js | modules/cashflow/cashflow.repository.js + cashflow.service.js | Tách | Repository giữ query/schema; service nhận điều phối/cache/validation và gọi rule. |
| repositories/finance-repository.js | app/runtime.js + repositories/finance-repository.js | Tách | DI vào runtime; giữ factory aggregate cũ làm lớp tương thích có kiểm thử. |
| repositories/fund-budget-repository.js | modules/fund-budget/fund-budget.repository.js + fund-budget.service.js | Tách | Repository giữ query/schema; service nhận điều phối/cache/validation và gọi rule. |
| repositories/grab-repository.js | modules/income-goal/income-goal.repository.js + income-goal.service.js | Tách | Repository giữ query/schema; service nhận điều phối/cache/validation và gọi rule. |
| repository.js | repository.js | Facade | Giữ hợp đồng import cũ, chuyển export sang chủ sở hữu mới. |
| services/cache-port.js | modules/shared/cache/cache-port.js | Tương thích | TTL/fallback dùng chung; key do module báo cáo sở hữu, invalidation nối tại runtime. |
| services/report-cache.js | modules/shared/cache/report-cache.js | Chuyển/tách | TTL/fallback dùng chung; key do module báo cáo sở hữu, invalidation nối tại runtime. |
| state.js | state.js | Facade | Giữ hợp đồng import cũ, chuyển export sang chủ sở hữu mới. |
| telegram.js | telegram.js | Facade | Giữ hợp đồng import cũ, chuyển export sang chủ sở hữu mới. |

## File hỗ trợ: kiểm kê đầy đủ

Không chuyển các file hỗ trợ vào module runtime. Kiểm thử sửa import/contract nếu cần, giữ assertions nghiệp vụ. Các tài liệu lịch sử giữ nguyên; cập nhật tài liệu kiến trúc hiện hành khi triển khai.

| File | Xử lý |
|---|---|
| .env.example | Giữ vai trò config/build/CI/hướng dẫn; chỉ sửa nếu wiring mới thực sự cần. |
| .github/workflows/ci.yml | Giữ vai trò config/build/CI/hướng dẫn; chỉ sửa nếu wiring mới thực sự cần. |
| .gitignore | Giữ vai trò config/build/CI/hướng dẫn; chỉ sửa nếu wiring mới thực sự cần. |
| AGENTS.md | Giữ vai trò config/build/CI/hướng dẫn; chỉ sửa nếu wiring mới thực sự cần. |
| CONTRIBUTING.md | Cập nhật ownership, luồng và cách chạy kiểm chứng sau triển khai. |
| README.md | Cập nhật ownership, luồng và cách chạy kiểm chứng sau triển khai. |
| assets/images/telegram-finance-bot-avatar.png | Giữ nguyên tài nguyên. |
| cloudflare-worker/package-lock.json | Giữ dependency/toolchain; không chuyển TypeScript hay thêm framework. |
| cloudflare-worker/package.json | Giữ dependency/toolchain; không chuyển TypeScript hay thêm framework. |
| cloudflare-worker/scripts/check-syntax.js | Giữ vai trò config/build/CI/hướng dẫn; chỉ sửa nếu wiring mới thực sự cần. |
| cloudflare-worker/test/adapters.test.js | Giữ; cập nhật đường dẫn/contract theo module, không nới kỳ vọng tài chính. |
| cloudflare-worker/test/architecture.test.js | Giữ; cập nhật đường dẫn/contract theo module, không nới kỳ vọng tài chính. |
| cloudflare-worker/test/bot.test.js | Giữ; cập nhật đường dẫn/contract theo module, không nới kỳ vọng tài chính. |
| cloudflare-worker/test/cashflow-component.test.js | Giữ; cập nhật đường dẫn/contract theo module, không nới kỳ vọng tài chính. |
| cloudflare-worker/test/config.test.js | Giữ; cập nhật đường dẫn/contract theo module, không nới kỳ vọng tài chính. |
| cloudflare-worker/test/coordinator.test.js | Giữ; cập nhật đường dẫn/contract theo module, không nới kỳ vọng tài chính. |
| cloudflare-worker/test/finance-regression.test.js | Giữ; cập nhật đường dẫn/contract theo module, không nới kỳ vọng tài chính. |
| cloudflare-worker/test/fund-budget-component.test.js | Giữ; cập nhật đường dẫn/contract theo module, không nới kỳ vọng tài chính. |
| cloudflare-worker/test/helpers/architecture-policy.js | Giữ; cập nhật đường dẫn/contract theo module, không nới kỳ vọng tài chính. |
| cloudflare-worker/test/helpers/feature-fixtures.js | Giữ; cập nhật đường dẫn/contract theo module, không nới kỳ vọng tài chính. |
| cloudflare-worker/test/income-goal-component.test.js | Giữ; cập nhật đường dẫn/contract theo module, không nới kỳ vọng tài chính. |
| cloudflare-worker/test/layer-contracts.test.js | Giữ; cập nhật đường dẫn/contract theo module, không nới kỳ vọng tài chính. |
| cloudflare-worker/test/ledger.test.js | Giữ; cập nhật đường dẫn/contract theo module, không nới kỳ vọng tài chính. |
| cloudflare-worker/test/module-boundaries.test.js | Giữ; cập nhật đường dẫn/contract theo module, không nới kỳ vọng tài chính. |
| cloudflare-worker/test/module-contracts.test.js | Giữ; cập nhật đường dẫn/contract theo module, không nới kỳ vọng tài chính. |
| cloudflare-worker/test/project-architecture.test.js | Giữ; cập nhật đường dẫn/contract theo module, không nới kỳ vọng tài chính. |
| cloudflare-worker/test/repository.test.js | Giữ; cập nhật đường dẫn/contract theo module, không nới kỳ vọng tài chính. |
| cloudflare-worker/test/shared-policies.test.js | Giữ; cập nhật đường dẫn/contract theo module, không nới kỳ vọng tài chính. |
| cloudflare-worker/test/six-jar-sync.test.js | Giữ; cập nhật đường dẫn/contract theo module, không nới kỳ vọng tài chính. |
| cloudflare-worker/test/webhook-ack.test.js | Giữ; cập nhật đường dẫn/contract theo module, không nới kỳ vọng tài chính. |
| cloudflare-worker/test/worker.test.js | Giữ; cập nhật đường dẫn/contract theo module, không nới kỳ vọng tài chính. |
| cloudflare-worker/wrangler.jsonc | Giữ vai trò config/build/CI/hướng dẫn; chỉ sửa nếu wiring mới thực sự cần. |
| docs/architecture.md | Cập nhật ownership, luồng và cách chạy kiểm chứng sau triển khai. |
| docs/module-map.md | Cập nhật ownership, luồng và cách chạy kiểm chứng sau triển khai. |
| docs/superpowers/plans/2026-07-23-telegram-account-spending-plan.md | Giữ lịch sử thiết kế/kế hoạch; không xem là runtime. |
| docs/superpowers/plans/2026-07-28-telegram-account-first-cashflow-plan.md | Giữ lịch sử thiết kế/kế hoạch; không xem là runtime. |
| docs/superpowers/plans/2026-07-28-telegram-finance-navigation.md | Giữ lịch sử thiết kế/kế hoạch; không xem là runtime. |
| docs/superpowers/plans/2026-07-29-telegram-finance-cloudflare-migration-plan.md | Giữ lịch sử thiết kế/kế hoạch; không xem là runtime. |
| docs/superpowers/plans/2026-09-10-explicit-finance-ledger.md | Giữ lịch sử thiết kế/kế hoạch; không xem là runtime. |
| docs/superpowers/plans/2026-09-14-notion-data-quality-filter.md | Giữ lịch sử thiết kế/kế hoạch; không xem là runtime. |
| docs/superpowers/plans/2026-09-15-current-month-fund-source-and-account-debt.md | Giữ lịch sử thiết kế/kế hoạch; không xem là runtime. |
| docs/superpowers/plans/2026-09-16-fund-child-allocation.md | Giữ lịch sử thiết kế/kế hoạch; không xem là runtime. |
| docs/superpowers/plans/2026-09-21-structured-account-debt-reconciliation.md | Giữ lịch sử thiết kế/kế hoạch; không xem là runtime. |
| docs/superpowers/plans/2026-09-23-feature-component-architecture.md | Giữ lịch sử thiết kế/kế hoạch; không xem là runtime. |
| docs/superpowers/plans/2026-10-03-modular-monolith.md | Giữ lịch sử thiết kế/kế hoạch; không xem là runtime. |
| docs/superpowers/plans/2026-10-03-project-wide-modularity.md | Giữ lịch sử thiết kế/kế hoạch; không xem là runtime. |
| docs/superpowers/plans/2026-10-04-worker-layer-refactor.md | Giữ lịch sử thiết kế/kế hoạch; không xem là runtime. |
| docs/superpowers/specs/2026-07-23-telegram-account-spending-design.md | Giữ lịch sử thiết kế/kế hoạch; không xem là runtime. |
| docs/superpowers/specs/2026-07-28-telegram-account-first-cashflow-design.md | Giữ lịch sử thiết kế/kế hoạch; không xem là runtime. |
| docs/superpowers/specs/2026-07-28-telegram-finance-navigation-design.md | Giữ lịch sử thiết kế/kế hoạch; không xem là runtime. |
| docs/superpowers/specs/2026-07-29-telegram-finance-cloudflare-migration-design.md | Giữ lịch sử thiết kế/kế hoạch; không xem là runtime. |
| docs/superpowers/specs/2026-09-09-explicit-finance-ledger-design.md | Giữ lịch sử thiết kế/kế hoạch; không xem là runtime. |
| docs/superpowers/specs/2026-09-14-notion-data-quality-filter-design.md | Giữ lịch sử thiết kế/kế hoạch; không xem là runtime. |
| docs/superpowers/specs/2026-09-15-current-month-fund-source-and-account-debt-design.md | Giữ lịch sử thiết kế/kế hoạch; không xem là runtime. |
| docs/superpowers/specs/2026-09-16-fund-child-allocation-design.md | Giữ lịch sử thiết kế/kế hoạch; không xem là runtime. |
| docs/superpowers/specs/2026-09-21-structured-account-debt-reconciliation-design.md | Giữ lịch sử thiết kế/kế hoạch; không xem là runtime. |
| docs/superpowers/specs/2026-09-23-feature-component-architecture-design.md | Giữ lịch sử thiết kế/kế hoạch; không xem là runtime. |
| docs/superpowers/specs/2026-10-03-modular-monolith-design.md | Giữ lịch sử thiết kế/kế hoạch; không xem là runtime. |
| docs/superpowers/specs/2026-10-03-project-wide-modularity.md | Giữ lịch sử thiết kế/kế hoạch; không xem là runtime. |

## Khoảng trống được phát hiện trong thiết kế cũ

1. Chỉ chuyển model vào domain toàn cục không tạo ownership theo module.
2. Report repository hiện điều phối cache/lịch sử/tính toán; cần tách service khỏi data access.
3. Component ngân sách hiện thực hiện đồng bộ và format cảnh báo; service trả sync outcome, presentation giữ đúng thông báo.
4. Six-jar sync trộn chọn giá trị từ báo cáo, chính sách dòng tháng và HTTP persistence; cần tách ngay trong module sync.
5. Ledger đang tự gọi opening-plan thuộc ngân sách. Nếu chỉ chuyển file sẽ tạo vòng module: fund-budget -> ledger -> fund-budget. Service ngân sách phải tính rồi truyền openingPlan vào ledger.
6. Router và cron hiện dùng component để chạy nghiệp vụ thu nhập; tách service public để host và cron gọi đúng trách nhiệm.
7. Có nhiều facade do các lần refactor trước; giữ tương thích có chủ đích và cấm production gọi ngược, không nhân đôi logic.
8. Không có căn cứ để tạo controller/repository giả cho ledger hoặc chuyển toàn repo sang TypeScript.

## Độ chắc chắn và giới hạn

Bản đồ bao phủ toàn bộ file tracked và import/export production; các luồng chính đã được đọc theo caller/callee. Đây là đánh giá kiến trúc tĩnh, không xác nhận dữ liệu Notion hiện tại hay thao tác Telegram live. Những thay đổi hợp đồng nội bộ phải chứng minh bằng regression/differential test khi triển khai. Không hứa thay một module sẽ không bao giờ ảnh hưởng module khác: thay hợp đồng hoặc primitive chung vẫn cần kiểm tra các caller.
