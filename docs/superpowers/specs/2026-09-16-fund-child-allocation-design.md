# Fund Child Allocation Design

## Goal

Record money transferred into a fund as allocated immediately, without requiring a current-month expense, and resolve the intended child budget consistently for every multi-child fund group.

## Rules

- A transfer into a fund account with `Nhóm Quỹ` is allocated to that fund group as soon as it is recorded.
- Spending never determines whether funding happened. It only reduces the funded balance or the remaining budget.
- A child budget is resolved from, in order: its Notion category name, the transfer title/note, and unique aliases learned from real expense rows that are related to that category, including earlier months.
- Matching must produce exactly one child. Amounts are never used to guess a child.
- A one-child group may use that sole child as the unambiguous fallback.
- Money whose child cannot be resolved remains allocated at group level. It must not be invented as funding for a particular child; the source record is reported under `CHƯA ĐỦ DỮ KIỆN`.
- When unresolved group money exists, it must not reduce or erase any child-specific need until its child is identified.
- Direct spending from an allowed current-month source continues to satisfy that part of the budget without requiring a second transfer into the fund.
- Existing debt, previous-month advance, rent, and internal fund-loan behavior must remain unchanged.
- Do not add a new `quỹ còn 180.000đ` line or otherwise expand the report format for this change.

## Data Flow

The repository loads current-month data as before. When current transfers include a fund-group relation, it also loads pre-month expense rows so their real `Loại Chi Phí` relations can supply stable aliases. The finance builder combines the category name, current expense titles, and historical expense titles/notes into one candidate set per child.

Each fund transfer first changes the group allocation. A separate child resolver then assigns it to one child only when the evidence is unique. Unresolved funding is retained at group level and recorded as a data issue, but it is not distributed across child budgets.

## Verification

- A `Tiền wifi ở nhà` transfer resolves to `Internet` from historical Notion-linked expenses even when Internet has no current-month spending.
- A second multi-child group resolves its own historical alias through the same code path.
- An ambiguous transfer counts at group level, produces a data issue, and does not fabricate a child assignment.
- Existing rent, direct-spend, debt, and full regression suites remain green.
