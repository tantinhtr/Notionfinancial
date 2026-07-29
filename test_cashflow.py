from bot import cashflow


def test_net_and_overbudget():
    budgets = {
        "a": {"name": "Ăn uống", "budget": 2_000_000},
        "b": {"name": "Phát Sinh", "budget": 600_000},
    }
    by_cat = {"a": 3_200_000, "b": 581_200}
    report = cashflow.build(budgets, by_cat, total_income=10_000_000, total_expense=3_781_200)

    assert report.net == 10_000_000 - 3_781_200
    # Ăn uống vượt 1.2tr, Phát Sinh không vượt
    assert report.total_over_budget == 1_200_000
    # sắp xếp giảm dần theo chi
    assert report.lines[0].name == "Ăn uống"


def test_uncategorized_has_no_budget():
    budgets = {}
    by_cat = {"(chưa phân loại)": 500_000}
    report = cashflow.build(budgets, by_cat, total_income=0, total_expense=500_000)
    assert not report.lines[0].has_budget
    assert report.total_over_budget == 0


if __name__ == "__main__":
    passed = 0
    for name, fn in list(globals().items()):
        if name.startswith("test_") and callable(fn):
            fn()
            print(f"PASS {name}")
            passed += 1
    print(f"\n{passed} tests passed")
