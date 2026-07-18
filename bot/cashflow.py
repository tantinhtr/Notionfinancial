"""Tổng hợp dòng tiền tháng — thuần logic, không gọi Notion."""
from dataclasses import dataclass, field


@dataclass
class CategoryLine:
    name: str
    spent: float
    budget: float

    @property
    def over(self) -> float:
        # Không đặt ngân sách (budget=0) => không tính là vượt.
        if self.budget <= 0:
            return 0.0
        return max(self.spent - self.budget, 0.0)

    @property
    def has_budget(self) -> bool:
        return self.budget > 0


@dataclass
class CashflowReport:
    total_income: float
    total_expense: float
    lines: list[CategoryLine] = field(default_factory=list)

    @property
    def net(self) -> float:
        return self.total_income - self.total_expense

    @property
    def total_over_budget(self) -> float:
        return sum(line.over for line in self.lines)


def build(budget_categories: dict, by_category: dict,
          total_income: float, total_expense: float) -> CashflowReport:
    """
    budget_categories: {page_id: {'name', 'budget'}}
    by_category: {page_id: tổng chi}
    """
    lines: list[CategoryLine] = []
    for cat_id, spent in by_category.items():
        meta = budget_categories.get(cat_id, {"name": "(chưa phân loại)", "budget": 0.0})
        lines.append(CategoryLine(name=meta["name"], spent=spent, budget=meta["budget"]))

    lines.sort(key=lambda l: l.spent, reverse=True)
    return CashflowReport(total_income=total_income, total_expense=total_expense, lines=lines)
