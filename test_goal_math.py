from datetime import date
from bot.goal_math import compute


def approx(a, b):
    return abs(a - b) < 1


def test_flat_daily_target():
    # 10tr / 31 ngày tháng 7
    s = compute(goal=10_000_000, earned_before_today=0, earned_today=0, today=date(2026, 7, 1))
    assert approx(s.base_daily, 10_000_000 / 31)


def test_today_met_when_hits_target():
    # ngày 1, mục tiêu ngày ~ 322k, kiếm 400k => đạt
    s = compute(goal=10_000_000, earned_before_today=0, earned_today=400_000, today=date(2026, 7, 1))
    assert s.today_met


def test_today_not_met_and_tomorrow_catches_up():
    # ngày 1 kiếm 100k (thiếu), ngày mai phải bù => tomorrow_target > base_daily
    s = compute(goal=10_000_000, earned_before_today=0, earned_today=100_000, today=date(2026, 7, 1))
    assert not s.today_met
    assert s.tomorrow_target > s.base_daily


def test_ahead_makes_tomorrow_lighter():
    # đã kiếm dư nhiều => ngày mai nhẹ hơn mức đều
    s = compute(goal=10_000_000, earned_before_today=5_000_000, earned_today=500_000, today=date(2026, 7, 2))
    assert s.tomorrow_target < s.base_daily


def test_goal_reached():
    s = compute(goal=10_000_000, earned_before_today=10_000_000, earned_today=0, today=date(2026, 7, 15))
    assert approx(s.remaining, 0)
    assert approx(s.tomorrow_target, 0)


if __name__ == "__main__":
    import sys
    passed = 0
    for name, fn in list(globals().items()):
        if name.startswith("test_") and callable(fn):
            fn()
            print(f"PASS {name}")
            passed += 1
    print(f"\n{passed} tests passed")
