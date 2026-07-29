import os
from dotenv import load_dotenv

load_dotenv()


def _require(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise RuntimeError(f"Missing required env var: {name}")
    return value


TELEGRAM_BOT_TOKEN = _require("TELEGRAM_BOT_TOKEN")
TELEGRAM_ALLOWED_USER_ID = int(_require("TELEGRAM_ALLOWED_USER_ID"))

NOTION_TOKEN = _require("NOTION_TOKEN")

# "Báo Cáo Thu Nhập" (view "Lịch Sử Thu Nhập") — bảng chứa MỌI khoản thu,
# lọc theo nhãn Grab (xem GOAL_RELATION_PAGE_ID).
NOTION_INCOME_DB_ID = os.getenv("NOTION_INCOME_DB_ID", "1178ffb5-256b-81a1-8052-c91e72fb0eb6")
# "Mục Tiêu Và Thu Nhập" — nơi lưu mục tiêu tháng cho từng loại thu nhập
NOTION_GOAL_DB_ID = os.getenv("NOTION_GOAL_DB_ID", "1178ffb5-256b-815e-9f66-e18a90b48950")

# Tên cột trong bảng ghi tiền Grab mỗi ngày
PROP_DATE = os.getenv("NOTION_PROP_DATE", "Ngày")
PROP_AMOUNT = os.getenv("NOTION_PROP_AMOUNT", "Số Tiền")
PROP_TITLE = os.getenv("NOTION_PROP_TITLE", "Tên Khoản Thu")
PROP_INCOME_TYPE = os.getenv("NOTION_PROP_INCOME_TYPE", "Loại Khoản Thu")

# Tên cột trong bảng mục tiêu
PROP_GOAL_NAME = os.getenv("NOTION_PROP_GOAL_NAME", "Loại Khoản Thu")
PROP_GOAL_AMOUNT = os.getenv("NOTION_PROP_GOAL_AMOUNT", "Mục Tiêu Hàng Tháng")

# === Đối soát dòng tiền (Phase 2+3) ===
# "Báo Cáo Khoản Chi" — mỗi dòng là một khoản chi
NOTION_EXPENSE_DB_ID = os.getenv("NOTION_EXPENSE_DB_ID", "1178ffb5-256b-8138-b644-c4695753b4ea")
# "Chi Phí Và Ngân Sách" — ngân sách tháng cho từng loại chi
NOTION_BUDGET_DB_ID = os.getenv("NOTION_BUDGET_DB_ID", "1178ffb5-256b-81b5-ab95-d5f15bc3c9f1")

# Cột bảng chi
PROP_EXPENSE_AMOUNT = os.getenv("NOTION_PROP_EXPENSE_AMOUNT", "Số Tiền")
PROP_EXPENSE_DATE = os.getenv("NOTION_PROP_EXPENSE_DATE", "Ngày")
PROP_EXPENSE_TYPE = os.getenv("NOTION_PROP_EXPENSE_TYPE", "Loại Chi Phí")  # relation -> bảng ngân sách

# Cột bảng ngân sách
PROP_BUDGET_NAME = os.getenv("NOTION_PROP_BUDGET_NAME", "Loại Chi Phí")   # title
PROP_BUDGET_AMOUNT = os.getenv("NOTION_PROP_BUDGET_AMOUNT", "Ngân Sách Tháng")

# Dòng mục tiêu áp dụng cho bot này
GOAL_CATEGORY = os.getenv("NOTION_GOAL_CATEGORY", "Thu Nhập Ròng Grab (App)")
# Page ID của dòng mục tiêu đó (để gắn quan hệ khi ghi khoản thu mới)
GOAL_RELATION_PAGE_ID = os.getenv("NOTION_GOAL_RELATION_PAGE_ID", "39c8ffb5-256b-806f-a710-e022aabf703d")

REMINDER_TIME = os.getenv("REMINDER_TIME", "21:00")
TIMEZONE = os.getenv("TIMEZONE", "Asia/Ho_Chi_Minh")
