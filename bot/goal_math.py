"""Pure goal-math: no Notion, no Telegram — easy to unit test."""
from dataclasses import dataclass
from datetime import date
import calendar


@dataclass
class DailyStatus:
    goal: float                # mục tiêu tháng
    earned_month: float        # đã kiếm từ đầu tháng tới hôm nay (gồm hôm nay)
    earned_today: float        # kiếm hôm nay
    base_daily: float          # mục tiêu ngày cố định = goal / số ngày trong tháng
    today_target: float        # mục tiêu cho riêng hôm nay (theo tiến độ)
    today_met: bool            # hôm nay đã đạt mục tiêu ngày chưa
    remaining: float           # còn thiếu để đạt mục tiêu tháng
    days_left_after_today: int # số ngày còn lại sau hôm nay
    tomorrow_target: float     # ngày mai cần kiếm bao nhiêu (đã tính bù)
    days_in_month: int


def compute(goal: float, earned_before_today: float, earned_today: float,
            today: date) -> DailyStatus:
    """
    earned_before_today: tổng đã kiếm từ ngày 1 đến hết hôm qua
    earned_today: kiếm riêng hôm nay
    """
    days_in_month = calendar.monthrange(today.year, today.month)[1]
    base_daily = goal / days_in_month

    earned_month = earned_before_today + earned_today

    # Mục tiêu cho riêng hôm nay = phần còn thiếu tính đến đầu hôm nay,
    # chia đều cho số ngày còn lại kể từ hôm nay.
    days_left_incl_today = days_in_month - today.day + 1
    remaining_before_today = max(goal - earned_before_today, 0)
    today_target = remaining_before_today / days_left_incl_today if days_left_incl_today > 0 else 0

    today_met = earned_today >= today_target

    remaining = max(goal - earned_month, 0)
    days_left_after_today = days_in_month - today.day
    tomorrow_target = remaining / days_left_after_today if days_left_after_today > 0 else 0

    return DailyStatus(
        goal=goal,
        earned_month=earned_month,
        earned_today=earned_today,
        base_daily=base_daily,
        today_target=today_target,
        today_met=today_met,
        remaining=remaining,
        days_left_after_today=days_left_after_today,
        tomorrow_target=tomorrow_target,
        days_in_month=days_in_month,
    )
