from datetime import date

from notion_client import Client

from . import config

client = Client(auth=config.NOTION_TOKEN)


def get_monthly_goal() -> float:
    """Đọc mục tiêu tháng của GOAL_CATEGORY từ bảng 'Mục Tiêu Và Thu Nhập'."""
    response = client.databases.query(
        database_id=config.NOTION_GOAL_DB_ID,
        filter={
            "property": config.PROP_GOAL_NAME,
            "title": {"equals": config.GOAL_CATEGORY},
        },
    )
    for page in response["results"]:
        amount = page["properties"].get(config.PROP_GOAL_AMOUNT, {}).get("number")
        if amount is not None:
            return float(amount)
    return 0.0


def sum_income(start: date, end: date) -> float:
    """Tổng 'Số Tiền' các khoản Grab trong 'Lịch Sử Thu Nhập', từ start đến end.

    Bảng này chứa mọi loại thu nhập nên phải lọc theo nhãn Grab
    (quan hệ 'Loại Khoản Thu' trỏ tới dòng mục tiêu Grab).
    """
    total = 0.0
    cursor = None
    conditions = [
        {"property": config.PROP_DATE, "date": {"on_or_after": start.isoformat()}},
        {"property": config.PROP_DATE, "date": {"on_or_before": end.isoformat()}},
    ]
    if config.GOAL_RELATION_PAGE_ID:
        conditions.append({
            "property": config.PROP_INCOME_TYPE,
            "relation": {"contains": config.GOAL_RELATION_PAGE_ID},
        })
    date_filter = {"and": conditions}
    while True:
        response = client.databases.query(
            database_id=config.NOTION_INCOME_DB_ID,
            filter=date_filter,
            start_cursor=cursor,
        )
        for page in response["results"]:
            total += page["properties"].get(config.PROP_AMOUNT, {}).get("number") or 0
        if not response.get("has_more"):
            break
        cursor = response.get("next_cursor")
    return total


def _iter_pages(database_id: str, filter_: dict):
    cursor = None
    while True:
        response = client.databases.query(
            database_id=database_id, filter=filter_, start_cursor=cursor
        )
        for page in response["results"]:
            yield page
        if not response.get("has_more"):
            break
        cursor = response.get("next_cursor")


def _month_filter(prop: str, start: date, end: date) -> dict:
    return {
        "and": [
            {"property": prop, "date": {"on_or_after": start.isoformat()}},
            {"property": prop, "date": {"on_or_before": end.isoformat()}},
        ]
    }


def get_budget_categories() -> dict:
    """{page_id: {'name': str, 'budget': float}} từ bảng 'Chi Phí Và Ngân Sách'."""
    result = {}
    cursor = None
    while True:
        response = client.databases.query(
            database_id=config.NOTION_BUDGET_DB_ID, start_cursor=cursor
        )
        for page in response["results"]:
            props = page["properties"]
            title = props.get(config.PROP_BUDGET_NAME, {}).get("title", [])
            name = title[0]["plain_text"] if title else "(không tên)"
            budget = props.get(config.PROP_BUDGET_AMOUNT, {}).get("number") or 0
            result[page["id"]] = {"name": name, "budget": float(budget)}
        if not response.get("has_more"):
            break
        cursor = response.get("next_cursor")
    return result


def sum_expenses_by_category(start: date, end: date) -> tuple[dict, float]:
    """Trả về ({category_page_id: tổng chi}, tổng chi toàn bộ) trong khoảng ngày."""
    by_category: dict = {}
    total = 0.0
    filter_ = _month_filter(config.PROP_EXPENSE_DATE, start, end)
    for page in _iter_pages(config.NOTION_EXPENSE_DB_ID, filter_):
        props = page["properties"]
        amount = props.get(config.PROP_EXPENSE_AMOUNT, {}).get("number") or 0
        total += amount
        relation = props.get(config.PROP_EXPENSE_TYPE, {}).get("relation", [])
        cat_id = relation[0]["id"] if relation else "(chưa phân loại)"
        by_category[cat_id] = by_category.get(cat_id, 0.0) + amount
    return by_category, total


def get_total_income(start: date, end: date) -> float:
    """Tổng MỌI khoản thu trong khoảng ngày (không lọc loại)."""
    total = 0.0
    filter_ = _month_filter(config.PROP_DATE, start, end)
    for page in _iter_pages(config.NOTION_INCOME_DB_ID, filter_):
        total += page["properties"].get(config.PROP_AMOUNT, {}).get("number") or 0
    return total


def add_income(entry_date: date, amount: float, note: str = "") -> None:
    """Ghi một khoản thu Grab mới vào bảng ghi tiền mỗi ngày."""
    properties = {
        config.PROP_TITLE: {"title": [{"text": {"content": note or "Thu nhập Grab"}}]},
        config.PROP_AMOUNT: {"number": amount},
        config.PROP_DATE: {"date": {"start": entry_date.isoformat()}},
    }
    if config.GOAL_RELATION_PAGE_ID:
        properties[config.PROP_INCOME_TYPE] = {
            "relation": [{"id": config.GOAL_RELATION_PAGE_ID}]
        }
    client.pages.create(
        parent={"database_id": config.NOTION_INCOME_DB_ID},
        properties=properties,
    )
