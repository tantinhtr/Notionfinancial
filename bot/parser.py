import re

AMOUNT_RE = re.compile(r"([\d][\d.,]*)")


def parse_amount(text: str) -> float | None:
    """Tách số tiền từ tin nhắn. '650000', '650.000', '650,000' đều được."""
    match = AMOUNT_RE.search(text.strip())
    if not match:
        return None
    raw = match.group(1).replace(".", "").replace(",", "")
    try:
        value = float(raw)
    except ValueError:
        return None
    return value if value > 0 else None
