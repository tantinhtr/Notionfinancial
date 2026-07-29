def money(amount: float) -> str:
    return f"{amount:,.0f}".replace(",", ".") + "đ"


def progress_bar(fraction: float, length: int = 10) -> str:
    fraction = max(0.0, min(fraction, 1.0))
    filled = round(fraction * length)
    return "█" * filled + "░" * (length - filled)
