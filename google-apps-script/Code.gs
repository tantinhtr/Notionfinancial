/**
 * Bot Telegram quản lý tài chính — bản Google Apps Script (webhook, miễn phí).
 *
 * Cách dùng: xem SETUP.md. Tóm tắt:
 *  1. Dán toàn bộ file này vào script.google.com
 *  2. Vào Project Settings > Script Properties, thêm: TELEGRAM_TOKEN, ALLOWED_USER_ID, NOTION_TOKEN
 *  3. Deploy > New deployment > Web app (Execute as: Me, Access: Anyone)
 *  4. Chạy hàm setWebhook() một lần
 *  5. (Tùy chọn) Đặt trigger theo giờ cho dailyReminder()
 */

// ===================== CẤU HÌNH =====================
function getConfig_() {
  var p = PropertiesService.getScriptProperties();
  return {
    TELEGRAM_TOKEN: p.getProperty('TELEGRAM_TOKEN'),
    ALLOWED_USER_ID: Number(p.getProperty('ALLOWED_USER_ID')),
    NOTION_TOKEN: p.getProperty('NOTION_TOKEN'),

    // ID các bảng Notion (đã khớp workspace của bạn)
    INCOME_DB: '1178ffb5-256b-81a1-8052-c91e72fb0eb6',   // Báo Cáo Thu Nhập
    GOAL_DB: '1178ffb5-256b-815e-9f66-e18a90b48950',     // Mục Tiêu Và Thu Nhập
    EXPENSE_DB: '1178ffb5-256b-8138-b644-c4695753b4ea',  // Báo Cáo Khoản Chi
    BUDGET_DB: '1178ffb5-256b-81b5-ab95-d5f15bc3c9f1',   // Chi Phí Và Ngân Sách

    GOAL_CATEGORY: 'Thu Nhập Ròng Grab (App)',
    GOAL_RELATION_PAGE_ID: '39c8ffb5-256b-806f-a710-e022aabf703d',
    TIMEZONE: 'Asia/Ho_Chi_Minh'
  };
}

var NOTION_VERSION = '2022-06-28';

// ===================== NOTION =====================
function notionQuery_(dbId, filter) {
  var cfg = getConfig_();
  var results = [];
  var cursor = null;
  do {
    var payload = { page_size: 100 };
    if (filter) payload.filter = filter;
    if (cursor) payload.start_cursor = cursor;
    var res = UrlFetchApp.fetch('https://api.notion.com/v1/databases/' + dbId + '/query', {
      method: 'post',
      contentType: 'application/json',
      headers: { 'Authorization': 'Bearer ' + cfg.NOTION_TOKEN, 'Notion-Version': NOTION_VERSION },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
    var data = JSON.parse(res.getContentText());
    if (data.results) results = results.concat(data.results);
    cursor = data.has_more ? data.next_cursor : null;
  } while (cursor);
  return results;
}

function num_(prop) { return (prop && prop.number) || 0; }

function getMonthlyGoal_() {
  var cfg = getConfig_();
  var rows = notionQuery_(cfg.GOAL_DB, { property: 'Loại Khoản Thu', title: { equals: cfg.GOAL_CATEGORY } });
  for (var i = 0; i < rows.length; i++) {
    var n = rows[i].properties['Mục Tiêu Hàng Tháng'];
    if (n && n.number != null) return n.number;
  }
  return 0;
}

function sumGrabIncome_(startISO, endISO) {
  var cfg = getConfig_();
  var filter = { and: [
    { property: 'Ngày', date: { on_or_after: startISO } },
    { property: 'Ngày', date: { on_or_before: endISO } },
    { property: 'Loại Khoản Thu', relation: { contains: cfg.GOAL_RELATION_PAGE_ID } }
  ]};
  var rows = notionQuery_(cfg.INCOME_DB, filter);
  var total = 0;
  for (var i = 0; i < rows.length; i++) total += num_(rows[i].properties['Số Tiền']);
  return total;
}

function getTotalIncome_(startISO, endISO) {
  var cfg = getConfig_();
  var filter = { and: [
    { property: 'Ngày', date: { on_or_after: startISO } },
    { property: 'Ngày', date: { on_or_before: endISO } }
  ]};
  var rows = notionQuery_(cfg.INCOME_DB, filter);
  var total = 0;
  for (var i = 0; i < rows.length; i++) total += num_(rows[i].properties['Số Tiền']);
  return total;
}

function addGrabIncome_(dateISO, amount, note) {
  var cfg = getConfig_();
  var props = {
    'Tên Khoản Thu': { title: [{ text: { content: note || 'Thu nhập Grab' } }] },
    'Số Tiền': { number: amount },
    'Ngày': { date: { start: dateISO } },
    'Loại Khoản Thu': { relation: [{ id: cfg.GOAL_RELATION_PAGE_ID }] }
  };
  UrlFetchApp.fetch('https://api.notion.com/v1/pages', {
    method: 'post',
    contentType: 'application/json',
    headers: { 'Authorization': 'Bearer ' + cfg.NOTION_TOKEN, 'Notion-Version': NOTION_VERSION },
    payload: JSON.stringify({ parent: { database_id: cfg.INCOME_DB }, properties: props }),
    muteHttpExceptions: true
  });
}

function getBudgetCategories_() {
  var cfg = getConfig_();
  var rows = notionQuery_(cfg.BUDGET_DB, null);
  var map = {};
  for (var i = 0; i < rows.length; i++) {
    var props = rows[i].properties;
    var titleArr = (props['Loại Chi Phí'] && props['Loại Chi Phí'].title) || [];
    var name = titleArr.length ? titleArr[0].plain_text : '(không tên)';
    map[rows[i].id] = { name: name, budget: num_(props['Ngân Sách Tháng']) };
  }
  return map;
}

function sumExpensesByCategory_(startISO, endISO) {
  var cfg = getConfig_();
  var filter = { and: [
    { property: 'Ngày', date: { on_or_after: startISO } },
    { property: 'Ngày', date: { on_or_before: endISO } }
  ]};
  var rows = notionQuery_(cfg.EXPENSE_DB, filter);
  var byCat = {};
  var total = 0;
  for (var i = 0; i < rows.length; i++) {
    var props = rows[i].properties;
    var amt = num_(props['Số Tiền']);
    total += amt;
    var rel = (props['Loại Chi Phí'] && props['Loại Chi Phí'].relation) || [];
    var catId = rel.length ? rel[0].id : '(chưa phân loại)';
    byCat[catId] = (byCat[catId] || 0) + amt;
  }
  return { byCategory: byCat, total: total };
}

// ===================== NGÀY THÁNG (giờ VN) =====================
function today_() {
  var cfg = getConfig_();
  var now = new Date();
  return {
    y: Number(Utilities.formatDate(now, cfg.TIMEZONE, 'yyyy')),
    m: Number(Utilities.formatDate(now, cfg.TIMEZONE, 'MM')),
    d: Number(Utilities.formatDate(now, cfg.TIMEZONE, 'dd'))
  };
}
function iso_(y, m, d) { return Utilities.formatString('%04d-%02d-%02d', y, m, d); }
function daysInMonth_(y, m) { return new Date(y, m, 0).getDate(); }

// ===================== TÍNH MỤC TIÊU =====================
function computeStatus_() {
  var t = today_();
  var goal = getMonthlyGoal_();
  var firstISO = iso_(t.y, t.m, 1);
  var todayISO = iso_(t.y, t.m, t.d);
  var earnedMonth = sumGrabIncome_(firstISO, todayISO);
  var earnedToday = sumGrabIncome_(todayISO, todayISO);
  var earnedBefore = earnedMonth - earnedToday;

  var dim = daysInMonth_(t.y, t.m);
  var baseDaily = goal / dim;
  var daysLeftInclToday = dim - t.d + 1;
  var remainingBefore = Math.max(goal - earnedBefore, 0);
  var todayTarget = daysLeftInclToday > 0 ? remainingBefore / daysLeftInclToday : 0;
  var todayMet = earnedToday >= todayTarget;
  var remaining = Math.max(goal - earnedMonth, 0);
  var daysAfter = dim - t.d;
  var tomorrowTarget = daysAfter > 0 ? remaining / daysAfter : 0;

  return {
    t: t, goal: goal, earnedMonth: earnedMonth, earnedToday: earnedToday,
    baseDaily: baseDaily, todayTarget: todayTarget, todayMet: todayMet,
    remaining: remaining, daysAfter: daysAfter, tomorrowTarget: tomorrowTarget
  };
}

// ===================== ĐỊNH DẠNG =====================
function money_(n) {
  n = Math.round(n);
  var s = String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return s + 'đ';
}
function bar_(frac) {
  frac = Math.max(0, Math.min(frac, 1));
  var filled = Math.round(frac * 10);
  return repeat_('█', filled) + repeat_('░', 10 - filled);
}
function repeat_(ch, n) { var s = ''; for (var i = 0; i < n; i++) s += ch; return s; }
function parseAmount_(text) {
  var m = String(text).match(/[\d][\d.,]*/);
  if (!m) return null;
  var v = Number(m[0].replace(/[.,]/g, ''));
  return (isFinite(v) && v > 0) ? v : null;
}

// ===================== NỘI DUNG TIN NHẮN =====================
function startText_() {
  return 'Xin chào! Bot quản lý tài chính Notion.\n\n' +
    '• /muctieu — tiến độ mục tiêu thu nhập tháng\n' +
    '• /thang — dòng tiền tháng: thu, chi, tiền đi đâu\n' +
    '• Nhắn số tiền kiếm hôm nay (vd 650000) → ghi vào Notion + báo đủ/thiếu mục tiêu ngày.';
}

function progressText_(s) {
  var frac = s.goal ? s.earnedMonth / s.goal : 0;
  var lines = [
    '📅 Tháng ' + s.t.m + '/' + s.t.y + ' — mục tiêu ' + money_(s.goal),
    bar_(frac) + ' ' + (frac * 100).toFixed(1) + '%',
    '✅ Đã kiếm: ' + money_(s.earnedMonth),
    '💰 Còn thiếu: ' + money_(s.remaining),
    '',
    '🎯 Mục tiêu mỗi ngày (đều): ' + money_(s.baseDaily)
  ];
  if (s.daysAfter > 0) lines.push('🔥 Còn ' + s.daysAfter + ' ngày → mỗi ngày cần: ' + money_(s.tomorrowTarget));
  else lines.push('🏁 Hôm nay là ngày cuối tháng!');
  return lines.join('\n');
}

function loggedText_(amount) {
  var s = computeStatus_();
  var head = 'Đã ghi ' + money_(amount) + ' cho hôm nay ✅\n\n' +
    'Hôm nay kiếm: ' + money_(s.earnedToday) + '\n' +
    'Mục tiêu hôm nay: ' + money_(s.todayTarget) + '\n';
  var verdict;
  if (s.todayMet) verdict = '🎉 Hôm nay ĐẠT chỉ tiêu! Ngày mai nhẹ nhàng hơn.';
  else verdict = '⚠️ Hôm nay còn thiếu ' + money_(s.todayTarget - s.earnedToday) + ' so với mục tiêu ngày.';
  if (s.daysAfter > 0) verdict += '\n🔥 Ngày mai cần kiếm: ' + money_(s.tomorrowTarget);
  else verdict += '\n🏁 Hết tháng rồi!';
  return head + '\n' + verdict;
}

function cashflowText_() {
  var cfg = getConfig_();
  var t = today_();
  var firstISO = iso_(t.y, t.m, 1);
  var todayISO = iso_(t.y, t.m, t.d);
  var monthFilter = { and: [
    { property: 'Ngày', date: { on_or_after: firstISO } },
    { property: 'Ngày', date: { on_or_before: todayISO } }
  ]};
  function req(dbId, filter) {
    var payload = { page_size: 100 };
    if (filter) payload.filter = filter;
    return {
      url: 'https://api.notion.com/v1/databases/' + dbId + '/query',
      method: 'post', contentType: 'application/json',
      headers: { 'Authorization': 'Bearer ' + cfg.NOTION_TOKEN, 'Notion-Version': NOTION_VERSION },
      payload: JSON.stringify(payload), muteHttpExceptions: true
    };
  }
  // 3 truy vấn chạy SONG SONG cho nhanh (tránh Telegram cắt ngang)
  var r = UrlFetchApp.fetchAll([
    req(cfg.BUDGET_DB, null),
    req(cfg.EXPENSE_DB, monthFilter),
    req(cfg.INCOME_DB, monthFilter)
  ]);
  var budgetRows = (JSON.parse(r[0].getContentText()).results) || [];
  var expenseRows = (JSON.parse(r[1].getContentText()).results) || [];
  var incomeRows = (JSON.parse(r[2].getContentText()).results) || [];

  var budgets = {};
  for (var bi = 0; bi < budgetRows.length; bi++) {
    var bp = budgetRows[bi].properties;
    var ta = (bp['Loại Chi Phí'] && bp['Loại Chi Phí'].title) || [];
    budgets[budgetRows[bi].id] = { name: ta.length ? ta[0].plain_text : '(không tên)', budget: num_(bp['Ngân Sách Tháng']) };
  }
  var byCategory = {}, totalExpense = 0;
  for (var ei = 0; ei < expenseRows.length; ei++) {
    var ep = expenseRows[ei].properties;
    var amt = num_(ep['Số Tiền']); totalExpense += amt;
    var rel = (ep['Loại Chi Phí'] && ep['Loại Chi Phí'].relation) || [];
    var cid = rel.length ? rel[0].id : '(chưa phân loại)';
    byCategory[cid] = (byCategory[cid] || 0) + amt;
  }
  var income = 0;
  for (var ii = 0; ii < incomeRows.length; ii++) income += num_(incomeRows[ii].properties['Số Tiền']);

  var lines = [];
  for (var catId in byCategory) {
    var meta = budgets[catId] || { name: '(chưa phân loại)', budget: 0 };
    var spent = byCategory[catId];
    var over = meta.budget > 0 ? Math.max(spent - meta.budget, 0) : 0;
    lines.push({ name: meta.name, spent: spent, budget: meta.budget, over: over });
  }
  lines.sort(function (a, b) { return b.spent - a.spent; });

  var totalOver = 0;
  for (var i = 0; i < lines.length; i++) totalOver += lines[i].over;

  var out = [
    '📊 Dòng tiền tháng ' + t.m + '/' + t.y,
    'Thu: ' + money_(income),
    'Chi: ' + money_(totalExpense),
    'Còn lại: ' + money_(income - totalExpense)
  ];
  if (totalOver > 0) out.push('\n⚠️ Vượt ngân sách tổng: ' + money_(totalOver));
  out.push('\n💸 Tiền đi đâu (chi theo loại):');
  for (var j = 0; j < lines.length; j++) {
    var l = lines[j];
    if (l.spent <= 0) continue;
    var row = '• ' + l.name + ': ' + money_(l.spent);
    if (l.budget > 0) {
      if (l.over > 0) row += ' (ngân sách ' + money_(l.budget) + ' → vượt ' + money_(l.over) + ')';
      else row += ' (ngân sách ' + money_(l.budget) + ' ✅)';
    }
    out.push(row);
  }
  return out.join('\n');
}

// ===================== TELEGRAM =====================
function sendMessage_(chatId, text) {
  var cfg = getConfig_();
  UrlFetchApp.fetch('https://api.telegram.org/bot' + cfg.TELEGRAM_TOKEN + '/sendMessage', {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({ chat_id: chatId, text: text }),
    muteHttpExceptions: true
  });
}

// Telegram gọi vào đây mỗi khi có tin nhắn
function doPost(e) {
  var cfg = getConfig_();
  var update;
  try { update = JSON.parse(e.postData.contents); } catch (err) { return ok_(); }

  // Chống gửi lặp: mỗi update chỉ xử lý 1 lần (Telegram hay gửi lại khi thấy chậm)
  if (update.update_id != null) {
    var cache = CacheService.getScriptCache();
    if (cache.get('u_' + update.update_id)) return ok_();
    cache.put('u_' + update.update_id, '1', 3600);
  }

  var msg = update.message || update.edited_message;
  if (!msg || !msg.text) return ok_();
  if (!msg.from || msg.from.id !== cfg.ALLOWED_USER_ID) return ok_();

  var chatId = msg.chat.id;
  var text = String(msg.text).trim();
  try {
    if (text === '/start') sendMessage_(chatId, startText_());
    else if (text === '/muctieu') sendMessage_(chatId, progressText_(computeStatus_()));
    else if (text === '/thang') sendMessage_(chatId, cashflowText_());
    else {
      var amount = parseAmount_(text);
      if (amount == null) sendMessage_(chatId, 'Nhắn số tiền kiếm hôm nay (vd 650000), hoặc /muctieu, /thang.');
      else {
        var t = today_();
        addGrabIncome_(iso_(t.y, t.m, t.d), amount, 'Thu nhập Grab');
        sendMessage_(chatId, loggedText_(amount));
      }
    }
  } catch (err) {
    sendMessage_(chatId, 'Lỗi: ' + err.message);
  }
  return ok_();
}
function ok_() { return ContentService.createTextOutput('ok'); }

// ===================== NHẮC NHỞ HÀNG NGÀY (Phase 4) =====================
// Đặt trigger theo giờ (vd 21:00) gọi hàm này.
function dailyReminder() {
  var cfg = getConfig_();
  var s = computeStatus_();
  var head;
  if (s.todayMet) head = '🎉 Hôm nay đã đạt chỉ tiêu! Kiếm được ' + money_(s.earnedToday) + '.';
  else if (s.earnedToday > 0) head = '💪 Hôm nay kiếm ' + money_(s.earnedToday) + ', còn thiếu ' + money_(s.todayTarget - s.earnedToday) + '.';
  else head = '📌 Hôm nay chưa ghi thu nhập nào. Nhắn số tiền để cập nhật nhé!';
  sendMessage_(cfg.ALLOWED_USER_ID, head + '\n\n' + progressText_(s));
}

// ===================== CÀI ĐẶT (chạy 1 lần) =====================
// Chạy hàm này SAU khi đã Deploy web app, để đăng ký webhook với Telegram.
function setWebhook() {
  var cfg = getConfig_();
  var url = ScriptApp.getService().getUrl();
  var res = UrlFetchApp.fetch(
    'https://api.telegram.org/bot' + cfg.TELEGRAM_TOKEN + '/setWebhook?drop_pending_updates=true&url=' + encodeURIComponent(url),
    { muteHttpExceptions: true }
  );
  Logger.log(res.getContentText());
}

// Kiểm tra nhanh Notion có đọc được không (chạy thử, xem Log).
function testNotion() {
  var t = today_();
  Logger.log('Mục tiêu tháng: ' + getMonthlyGoal_());
  Logger.log('Grab kiếm tháng này: ' + sumGrabIncome_(iso_(t.y, t.m, 1), iso_(t.y, t.m, t.d)));
}
