import logging
from datetime import date, time, timedelta

import pytz
from telegram import Update
from telegram.ext import Application, CommandHandler, MessageHandler, ContextTypes, filters

from . import config, notion_service, goal_math, cashflow
from .parser import parse_amount
from .formatting import money, progress_bar

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)


def _allowed(update: Update) -> bool:
    return update.effective_user is not None and update.effective_user.id == config.TELEGRAM_ALLOWED_USER_ID


def _build_status(today: date, extra_today: float = 0.0) -> goal_math.DailyStatus:
    """Đọc Notion và tính trạng thái. extra_today: khoản vừa nhập, chưa kịp lưu."""
    first_of_month = today.replace(day=1)
    goal = notion_service.get_monthly_goal()
    earned_before_today = notion_service.sum_income(first_of_month, today - timedelta(days=1)) if today.day > 1 else 0.0
    earned_today = notion_service.sum_income(today, today) + extra_today
    return goal_math.compute(goal, earned_before_today, earned_today, today)


def _progress_text(s: goal_math.DailyStatus, today: date) -> str:
    fraction = s.earned_month / s.goal if s.goal else 0
    lines = [
        f"📅 Tháng {today.month}/{today.year} — mục tiêu {money(s.goal)}",
        f"{progress_bar(fraction)} {fraction*100:.1f}%",
        f"✅ Đã kiếm: {money(s.earned_month)}",
        f"💰 Còn thiếu: {money(s.remaining)}",
        "",
        f"🎯 Mục tiêu mỗi ngày (đều): {money(s.base_daily)}",
    ]
    if s.days_left_after_today > 0:
        lines.append(f"🔥 Còn {s.days_left_after_today} ngày → mỗi ngày cần: {money(s.tomorrow_target)}")
    else:
        lines.append("🏁 Hôm nay là ngày cuối tháng!")
    return "\n".join(lines)


async def start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not _allowed(update):
        return
    await update.message.reply_text(
        "Xin chào! Bot theo dõi mục tiêu thu nhập Grab.\n\n"
        "• /muctieu — tiến độ mục tiêu thu nhập tháng này\n"
        "• /thang — dòng tiền tháng: thu, chi, còn lại, tiền đi đâu\n"
        "• Nhắn số tiền kiếm hôm nay (vd: 650000) → bot ghi vào Notion và cho biết "
        "hôm nay đủ chỉ tiêu chưa, mai cần chạy bao nhiêu."
    )


async def muctieu(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not _allowed(update):
        return
    today = date.today()
    status = _build_status(today)
    await update.message.reply_text(_progress_text(status, today))


def _cashflow_text(report: cashflow.CashflowReport, today: date) -> str:
    lines = [
        f"📊 Dòng tiền tháng {today.month}/{today.year}",
        f"Thu: {money(report.total_income)}",
        f"Chi: {money(report.total_expense)}",
        f"Còn lại: {money(report.net)}",
    ]
    if report.total_over_budget > 0:
        lines.append(f"\n⚠️ Vượt ngân sách tổng: {money(report.total_over_budget)}")
    lines.append("\n💸 Tiền đi đâu (chi theo loại):")
    for line in report.lines:
        if line.spent <= 0:
            continue
        row = f"• {line.name}: {money(line.spent)}"
        if line.has_budget:
            if line.over > 0:
                row += f" (ngân sách {money(line.budget)} → vượt {money(line.over)})"
            else:
                row += f" (ngân sách {money(line.budget)} ✅)"
        lines.append(row)
    return "\n".join(lines)


async def thang(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not _allowed(update):
        return
    today = date.today()
    first_of_month = today.replace(day=1)
    budget_categories = notion_service.get_budget_categories()
    by_category, total_expense = notion_service.sum_expenses_by_category(first_of_month, today)
    total_income = notion_service.get_total_income(first_of_month, today)
    report = cashflow.build(budget_categories, by_category, total_income, total_expense)
    await update.message.reply_text(_cashflow_text(report, today))


async def handle_message(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not _allowed(update):
        return
    amount = parse_amount(update.message.text or "")
    if amount is None:
        await update.message.reply_text(
            "Nhắn số tiền kiếm hôm nay (vd: 650000) hoặc /muctieu để xem tiến độ."
        )
        return

    today = date.today()
    notion_service.add_income(today, amount, note="Thu nhập Grab")
    status = _build_status(today)

    header = (
        f"Đã ghi {money(amount)} cho hôm nay ✅\n\n"
        f"Hôm nay kiếm: {money(status.earned_today)}\n"
        f"Mục tiêu hôm nay: {money(status.today_target)}\n"
    )
    if status.today_met:
        verdict = "🎉 Hôm nay ĐẠT chỉ tiêu! Ngày mai nhẹ nhàng hơn."
    else:
        thieu = status.today_target - status.earned_today
        verdict = f"⚠️ Hôm nay còn thiếu {money(thieu)} so với mục tiêu ngày."

    if status.days_left_after_today > 0:
        verdict += f"\n🔥 Ngày mai cần kiếm: {money(status.tomorrow_target)}"
    else:
        verdict += "\n🏁 Hết tháng rồi!"

    await update.message.reply_text(header + "\n" + verdict)


async def daily_reminder(context: ContextTypes.DEFAULT_TYPE) -> None:
    """Nhắc nhở cuối ngày: hôm nay kiếm được bao nhiêu, còn thiếu bao nhiêu."""
    today = date.today()
    status = _build_status(today)
    if status.today_met:
        head = f"🎉 Hôm nay đã đạt chỉ tiêu! Kiếm được {money(status.earned_today)}."
    elif status.earned_today > 0:
        thieu = status.today_target - status.earned_today
        head = f"💪 Hôm nay kiếm {money(status.earned_today)}, còn thiếu {money(thieu)} để đạt mục tiêu ngày."
    else:
        head = "📌 Hôm nay chưa ghi thu nhập nào. Nhắn số tiền để cập nhật nhé!"
    await context.bot.send_message(
        chat_id=config.TELEGRAM_ALLOWED_USER_ID,
        text=head + "\n\n" + _progress_text(status, today),
    )


def build_app() -> Application:
    application = Application.builder().token(config.TELEGRAM_BOT_TOKEN).build()
    application.add_handler(CommandHandler("start", start))
    application.add_handler(CommandHandler("muctieu", muctieu))
    application.add_handler(CommandHandler("thang", thang))
    application.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_message))

    hour, minute = (int(p) for p in config.REMINDER_TIME.split(":"))
    tz = pytz.timezone(config.TIMEZONE)
    application.job_queue.run_daily(daily_reminder, time=time(hour=hour, minute=minute, tzinfo=tz))

    return application


def main() -> None:
    app = build_app()
    logger.info("Bot starting (polling)...")
    app.run_polling()


if __name__ == "__main__":
    main()
