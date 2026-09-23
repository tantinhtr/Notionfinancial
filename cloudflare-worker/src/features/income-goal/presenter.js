import { money_ } from "../../domain/finance/shared.js";

export function progressText_(status) {
  const fraction = status.goal ? status.earnedMonth / status.goal : 0;
  const lines = [
    '📅 Mục tiêu Thu Nhập Ròng Grab (App) — tháng ' +
      status.t.m +
      '/' +
      status.t.y,
    'Mục tiêu tháng: ' + money_(status.goal),
    '📈 Tiến độ: ' + (fraction * 100).toFixed(1).replace('.', ',') + '%',
    '✅ Đã kiếm: ' + money_(status.earnedMonth),
    '💰 Còn thiếu: ' + money_(status.remaining),
    '',
    '🎯 Mục tiêu mỗi ngày (đều): ' + money_(status.baseDaily),
  ];
  if (status.daysLeftIncludingToday > 0) {
    lines.push(
      '🔥 Còn ' +
        status.daysLeftIncludingToday +
        ' ngày (tính cả hôm nay) → mỗi ngày cần: ' +
        money_(status.requiredPerDay),
    );
  } else {
    lines.push('🏁 Hôm nay là ngày cuối tháng!');
  }
  return lines.join('\n');
}

function goalKeyboard() {
  return {
    inline_keyboard: [
      [{ text: "📊 Dòng tiền", callback_data: "cash_home" }],
      [{ text: "📦 Quỹ & ngân sách", callback_data: "show_funds" }],
      [{ text: "🏠 Trang chính", callback_data: "show_home" }]
    ]
  };
}

function loggedText(amount, status) {
  const lines = [
    `Đã ghi ${money_(amount)} cho hôm nay ✅`,
    "",
    `Hôm nay kiếm: ${money_(status.earnedToday)}`,
    `Mục tiêu hôm nay: ${money_(status.todayTarget)}`,
    ""
  ];
  if (status.todayMet) {
    lines.push("🎉 Hôm nay ĐẠT chỉ tiêu! Ngày mai nhẹ nhàng hơn.");
  } else {
    lines.push(
      `⚠️ Hôm nay còn thiếu ${money_(status.todayTarget - status.earnedToday)} ` +
      "so với mục tiêu ngày."
    );
  }
  lines.push(
    status.daysAfter > 0
      ? `🔥 Ngày mai cần kiếm: ${money_(status.tomorrowTarget)}`
      : "🏁 Hết tháng rồi!"
  );
  return lines.join("\n");
}


export function presentIncomeGoal(status) {
  return { text: progressText_(status), replyMarkup: goalKeyboard() };
}
export function presentIncomeConfirmation(amount, status) {
  return { text: loggedText(amount, status), replyMarkup: undefined };
}

export function presentDailyReminder(status) {
    let heading;
    if (status.todayMet) {
      heading = `🎉 Hôm nay đã đạt chỉ tiêu! Kiếm được ${money_(status.earnedToday)}.`;
    } else if (status.earnedToday > 0) {
      heading =
        `💪 Hôm nay kiếm ${money_(status.earnedToday)}, còn thiếu ` +
        `${money_(status.todayTarget - status.earnedToday)}.`;
    } else {
      heading = "📌 Hôm nay chưa ghi thu nhập nào. Nhắn số tiền để cập nhật nhé!";
    }
  return { text: heading + "\n\n" + progressText_(status), replyMarkup: undefined };
}
