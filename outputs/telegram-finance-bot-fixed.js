/**
 * Bot Telegram quản lý tài chính — bản Google Apps Script (webhook, miễn phí).
 *
 * Cách dùng: xem SETUP.md. Tóm tắt:
 *  1. Dán toàn bộ file này vào script.google.com
 *  2. Vào Project Settings > Script Properties, thêm: TELEGRAM_TOKEN, ALLOWED_USER_ID, NOTION_TOKEN
 *  3. Chạy hàm installPolling() một lần để tạo trigger mỗi phút
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
    ACCOUNT_DB: '1178ffb5-256b-8175-9c74-cc19002c06fa',  // Tài Khoản
    TRANSFER_DB: '1178ffb5-256b-81cf-ae08-eb24b25d56dc', // Giao Dịch Các Tài Khoản
    FUND_GROUP_DB: 'c6dffa2b-d0b3-46a1-8200-12bbb0c66402', // Nhóm Quỹ Ngân Sách
    OTHER_INCOME_DB: '1358ffb5-256b-8088-98b8-e613306c995d', // Báo Cáo Khoản Thu Khác
    OTHER_INCOME_CATEGORY_DB: '1348ffb5-256b-80c1-ae97-c0115a1baf83', // Các Khoản Thu Khác

    GOAL_CATEGORY: 'Thu Nhập Ròng Grab (App)',
    GOAL_RELATION_PAGE_ID: '39c8ffb5-256b-806f-a710-e022aabf703d',
    WALLET_INCOME_RELATION_PAGE_ID: '3a08ffb5-256b-80a7-a68a-dc37d6dff53f',
    MONTHLY_EXPENSE_LIMIT: Number(p.getProperty('MONTHLY_EXPENSE_LIMIT') || 5500000),
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
function parseAmount_(text) {
  var m = String(text).match(/[\d][\d.,]*/);
  if (!m) return null;
  var v = Number(m[0].replace(/[.,]/g, ''));
  return (isFinite(v) && v > 0) ? v : null;
}

// ===================== NỘI DUNG TIN NHẮN =====================
function startText_() {
  return 'Nhắn số tiền kiếm hôm nay (vd 650000), hoặc /muctieu.';
}

function progressText_(s) {
  var frac = s.goal ? s.earnedMonth / s.goal : 0;
  var lines = [
    '📅 Mục tiêu Thu Nhập Ròng Grab (App) — tháng ' + s.t.m + '/' + s.t.y,
    'Mục tiêu tháng: ' + money_(s.goal),
    '📈 Tiến độ: ' + (frac * 100).toFixed(1).replace('.', ',') + '%',
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
  var otherIncomeFilter = monthFilter;
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
  // Các truy vấn chạy song song để /thang phản hồi nhanh hơn.
  var r = UrlFetchApp.fetchAll([
    req(cfg.BUDGET_DB, null),
    req(cfg.EXPENSE_DB, monthFilter),
    req(cfg.INCOME_DB, monthFilter),
    req(cfg.OTHER_INCOME_DB, otherIncomeFilter),
    req(cfg.OTHER_INCOME_CATEGORY_DB, null),
    req(cfg.GOAL_DB, null)
  ]);
  var budgetRows = completeNotionRows_(cfg.BUDGET_DB, null, r[0], 'BUDGET_DB');
  var expenseRows = completeNotionRows_(cfg.EXPENSE_DB, monthFilter, r[1], 'EXPENSE_DB');
  var incomeRows = completeNotionRows_(cfg.INCOME_DB, monthFilter, r[2], 'INCOME_DB');
  var otherIncomeRows = completeNotionRows_(cfg.OTHER_INCOME_DB, otherIncomeFilter, r[3], 'OTHER_INCOME_DB');
  var otherIncomeCategoryRows = completeNotionRows_(cfg.OTHER_INCOME_CATEGORY_DB, null, r[4], 'OTHER_INCOME_CATEGORY_DB');
  var goalCategoryRows = completeNotionRows_(cfg.GOAL_DB, null, r[5], 'GOAL_DB');

  var goalIncomeTypes = {}, goalIncomeSummary = [], totalGoalIncome = 0;
  for (var gci = 0; gci < goalCategoryRows.length; gci++) {
    var gcp = goalCategoryRows[gci].properties || {};
    var gct = (gcp['Loại Khoản Thu'] && gcp['Loại Khoản Thu'].title) || [];
    var goalName = gct.length ? gct[0].plain_text : '(không tên)';
    // Grab về ví là dòng tiền đối soát, không phải thu nhập dùng để đo mục tiêu.
    if (goalCategoryRows[gci].id === cfg.WALLET_INCOME_RELATION_PAGE_ID ||
        goalName === 'Grab - Tiền Về Ví') continue;
    var goalType = {
      id: goalCategoryRows[gci].id,
      name: goalName,
      amount: 0
    };
    goalIncomeTypes[goalType.id] = goalType;
    goalIncomeSummary.push(goalType);
  }

  var otherTypeNames = {}, otherTypeTotals = {};
  for (var oci = 0; oci < otherIncomeCategoryRows.length; oci++) {
    var ocp = otherIncomeCategoryRows[oci].properties || {};
    var oct = (ocp['Loại Khoản Thu'] && ocp['Loại Khoản Thu'].title) || [];
    otherTypeNames[otherIncomeCategoryRows[oci].id] = oct.length ? oct[0].plain_text : '(không tên)';
    otherTypeTotals[otherIncomeCategoryRows[oci].id] = 0;
  }

  var budgets = {};
  var expenseCategoryNames = {};
  var expenseFixedIdMap = {};
  for (var bi = 0; bi < budgetRows.length; bi++) {
    var bp = budgetRows[bi].properties;
    var ta = (bp['Loại Chi Phí'] && bp['Loại Chi Phí'].title) || [];
    var expenseCategoryName = ta.length ? ta[0].plain_text : '(không tên)';
    var expenseBudget = num_(bp['Ngân Sách Tháng']);
    budgets[budgetRows[bi].id] = { name: expenseCategoryName, budget: expenseBudget };
    expenseCategoryNames[budgetRows[bi].id] = expenseCategoryName;
    if ((bp['Tính Trong 5,5 Triệu'] && bp['Tính Trong 5,5 Triệu'].checkbox === true) ||
        expenseBudget > 0) {
      expenseFixedIdMap[budgetRows[bi].id] = true;
    }
  }
  var expenseFlow = analyzeExpenseRows_(
    expenseRows,
    expenseCategoryNames,
    expenseFixedIdMap,
    {}
  );
  var byCategory = {};
  for (var ei = 0; ei < expenseRows.length; ei++) {
    var ep = expenseRows[ei].properties;
    var amt = num_(ep['Số Tiền']);
    var rel = (ep['Loại Chi Phí'] && ep['Loại Chi Phí'].relation) || [];
    var cid = rel.length ? rel[0].id : '(chưa phân loại)';
    byCategory[cid] = (byCategory[cid] || 0) + amt;
  }
  for (var ii = 0; ii < incomeRows.length; ii++) {
    var incomeProps = incomeRows[ii].properties || {};
    var incomeRelation = (incomeProps['Loại Khoản Thu'] && incomeProps['Loại Khoản Thu'].relation) || [];
    var incomeTypeId = incomeRelation.length ? incomeRelation[0].id : '';
    if (!goalIncomeTypes[incomeTypeId]) continue;
    var incomeAmount = num_(incomeProps['Số Tiền']);
    goalIncomeTypes[incomeTypeId].amount += incomeAmount;
    totalGoalIncome += incomeAmount;
  }

  var totalOtherIncome = 0, unclearOtherIncome = [];
  for (var oi = 0; oi < otherIncomeRows.length; oi++) {
    var op = otherIncomeRows[oi].properties || {};
    var otherAmount = num_(op['Số Tiền']);
    var otherType = (op['Loại Khoản Thu'] && op['Loại Khoản Thu'].relation) || [];
    var otherTypeId = otherType.length ? otherType[0].id : '(chưa phân loại)';
    var otherTypeName = otherTypeNames[otherTypeId] || '(chưa phân loại)';
    otherTypeTotals[otherTypeId] = (otherTypeTotals[otherTypeId] || 0) + otherAmount;
    var title = (op['Tên Khoản Thu'] && op['Tên Khoản Thu'].title) || [];
    var titleText = title.length ? title[0].plain_text : '(không tên)';
    var date = op['Ngày'] && op['Ngày'].date && op['Ngày'].date.start;
    totalOtherIncome += otherAmount;
    var missing = [];
    var paymentAccount = (op['Phương Thức Thanh Toán'] && op['Phương Thức Thanh Toán'].relation) || [];
    if (!otherType.length) missing.push('loại thu');
    if (!paymentAccount.length) missing.push('tài khoản nhận');
    if (/chả biết|không rõ|chưa rõ|không biết/i.test(titleText)) {
      missing.push('nội dung khoản thu chưa rõ');
    }
    var dateInTitle = titleText.match(/(\d{1,2})\s*[\/-]\s*(\d{1,2})/);
    if (date && dateInTitle &&
        (Number(dateInTitle[1]) !== Number(date.slice(8, 10)) ||
         Number(dateInTitle[2]) !== Number(date.slice(5, 7)))) {
      missing.push('ngày trong tên không khớp cột Ngày');
    }
    if (otherAmount > 0 && missing.length) {
      unclearOtherIncome.push({
        name: titleText,
        date: date || '(không ngày)',
        amount: otherAmount,
        missing: missing.join(', ')
      });
    }
  }
  for (var budgetId in budgets) {
    if (byCategory[budgetId] == null) byCategory[budgetId] = 0;
  }
  var lines = [];
  for (var catId in byCategory) {
    var meta = budgets[catId] || { name: '(chưa phân loại)', budget: 0 };
    var spent = byCategory[catId];
    var over = meta.budget > 0 ? Math.max(spent - meta.budget, 0) : 0;
    lines.push({ name: meta.name, spent: spent, budget: meta.budget, over: over });
  }
  lines.sort(function (a, b) { return b.spent - a.spent; });

  var out = [
    '📊 Báo cáo tháng ' + t.m + '/' + t.y,
    '',
    '🎯 Mục tiêu thu nhập — tổng: ' + money_(totalGoalIncome)
  ];
  for (var gsi = 0; gsi < goalIncomeSummary.length; gsi++) {
    out.push('• ' + goalIncomeSummary[gsi].name + ': ' + money_(goalIncomeSummary[gsi].amount));
  }
  out.push('\n📥 Khoản thu khác — tổng: ' + money_(totalOtherIncome));
  var otherTypeSummary = [];
  for (var typeId in otherTypeNames) {
    otherTypeSummary.push({
      id: typeId,
      name: otherTypeNames[typeId],
      amount: otherTypeTotals[typeId] || 0
    });
  }
  otherTypeSummary.sort(function(a, b) {
    if (a.id === cfg.WALLET_INCOME_RELATION_PAGE_ID) return -1;
    if (b.id === cfg.WALLET_INCOME_RELATION_PAGE_ID) return 1;
    return a.name < b.name ? -1 : (a.name > b.name ? 1 : 0);
  });
  for (var tsi = 0; tsi < otherTypeSummary.length; tsi++) {
    out.push('• ' + otherTypeSummary[tsi].name + ': ' + money_(otherTypeSummary[tsi].amount));
  }
  if (unclearOtherIncome.length) {
    out.push('\n⚠️ Lịch sử thu nhập có khoản chưa rõ:');
    var maxWarnings = 5;
    for (var wi = 0; wi < unclearOtherIncome.length && wi < maxWarnings; wi++) {
      var warning = unclearOtherIncome[wi];
      out.push('• ' + warning.name + ': ' + money_(warning.amount) + ' (' + warning.date + ')');
    }
    if (unclearOtherIncome.length > maxWarnings) {
      out.push('... còn ' + (unclearOtherIncome.length - maxWarnings) + ' khoản chưa rõ khác.');
    }
  }
  var expenseOverview = expenseBudgetOverviewLines_(
    expenseFlow,
    cfg.MONTHLY_EXPENSE_LIMIT,
    '💸 Ngân sách chi'
  );
  out.push('');
  for (var eoi = 0; eoi < expenseOverview.length; eoi++) {
    out.push(expenseOverview[eoi]);
  }
  return out.join('\n');
}

function analyzeExpenseRows_(expenseRows, categoryNames, fixedIdMap, accountNames) {
  var summary = {
    cashOutflowTotal: 0,
    personalSpendingTotal: 0,
    unplannedTotal: 0,
    loanFlow: { total: 0, lent: 0, repaid: 0, other: 0 },
    grabFlow: { total: 0, capital: 0, operating: 0 },
    unusualSpending: { total: 0, rows: [] },
    rowsById: {}
  };
  categoryNames = categoryNames || {};
  fixedIdMap = fixedIdMap || {};
  accountNames = accountNames || {};

  for (var i = 0; i < expenseRows.length; i++) {
    var props = expenseRows[i].properties || {};
    var amount = num_(props['Số Tiền']);
    var categoryRelation = (props['Loại Chi Phí'] && props['Loại Chi Phí'].relation) || [];
    var accountRelation = (props['Phương Thức Thanh Toán'] && props['Phương Thức Thanh Toán'].relation) || [];
    var categoryId = categoryRelation.length ? categoryRelation[0].id : '(chưa phân loại)';
    var accountId = accountRelation.length ? accountRelation[0].id : '(chưa chọn tài khoản)';
    var categoryName = categoryNames[categoryId] || '(chưa phân loại)';
    var accountName = accountNames[accountId] || '(chưa chọn tài khoản)';
    var expenseTitle = (props['Nội Dung Khoản Chi'] && props['Nội Dung Khoản Chi'].title) || [];
    var expenseName = expenseTitle.length ? expenseTitle[0].plain_text : '(không có nội dung)';
    var expenseDate = props['Ngày'] && props['Ngày'].date && props['Ngày'].date.start;
    var noteParts = (props['Ghi Chú'] && props['Ghi Chú'].rich_text) || [];
    var expenseNote = '';
    for (var npi = 0; npi < noteParts.length; npi++) {
      expenseNote += noteParts[npi].plain_text || '';
    }
    var nature = classifyExpenseNature_(
      categoryName,
      expenseName,
      expenseNote,
      !!fixedIdMap[categoryId]
    );
    var rowInfo = {
      id: expenseRows[i].id,
      name: expenseName,
      amount: amount,
      date: expenseDate || '',
      note: expenseNote,
      categoryId: categoryId,
      categoryName: categoryName,
      accountId: accountId,
      accountName: accountName,
      nature: nature
    };
    summary.rowsById[expenseRows[i].id] = rowInfo;
    summary.cashOutflowTotal += amount;

    if (nature.kind === 'loan') {
      summary.loanFlow.total += amount;
      summary.loanFlow[nature.loanType] += amount;
    } else if (nature.kind === 'grab') {
      summary.grabFlow.total += amount;
      summary.grabFlow[nature.grabType] += amount;
    } else {
      summary.personalSpendingTotal += amount;
      if (!fixedIdMap[categoryId]) summary.unplannedTotal += amount;
      if (nature.isUnusual) {
        summary.unusualSpending.total += amount;
        summary.unusualSpending.rows.push(rowInfo);
      }
    }
  }
  summary.unusualSpending.rows.sort(function(a, b) { return b.amount - a.amount; });
  return summary;
}

function classifyExpenseNature_(categoryName, expenseName, expenseNote, isFixedBudget) {
  var normalizedCategory = normalizeSearchText_(categoryName);
  var normalizedName = normalizeSearchText_(expenseName);
  var normalizedNote = normalizeSearchText_(expenseNote);
  if (normalizedCategory === 'vay va tra') {
    var loanType = 'other';
    if (normalizedName.indexOf('cho ') === 0 && normalizedName.indexOf(' muon') >= 0) {
      loanType = 'lent';
    } else if (normalizedName.indexOf('tra') === 0 && normalizedName.indexOf('muon') >= 0) {
      loanType = 'repaid';
    }
    return { kind: 'loan', loanType: loanType, isUnusual: false };
  }
  if (normalizedCategory === 'grap' || normalizedCategory === 'grab') {
    var isCapital =
      (normalizedName.indexOf('nap') >= 0 &&
       (normalizedName.indexOf('grap') >= 0 || normalizedName.indexOf('grab') >= 0)) ||
      (normalizedName.indexOf('chuyen tien') >= 0 &&
       normalizedName.indexOf('nap ho') >= 0);
    return {
      kind: 'grab',
      grabType: isCapital ? 'capital' : 'operating',
      isUnusual: false
    };
  }
  return {
    kind: 'personal',
    isUnusual:
      normalizedCategory === 'phat sinh' ||
      normalizedNote.indexOf('quy phat sinh') >= 0 ||
      (!isFixedBudget && !isRoutineExpenseCategory_(normalizedCategory))
  };
}

function buildAccountSpendingData_(
  t,
  categoryRows,
  expenseRows,
  accountRows,
  monthlyLimit,
  transferRows,
  fundGroupRows
) {
  transferRows = transferRows || [];
  fundGroupRows = fundGroupRows || [];
  var categoryNames = {};
  var categoryGroupIds = {};
  var accountNames = {};
  var globalCategoryTotals = {};
  var accountMap = {};
  var fixedIdMap = {};
  var fixedBudgets = [];
  var totalFixedBudget = 0;
  var i;

  for (i = 0; i < categoryRows.length; i++) {
    var categoryProps = categoryRows[i].properties || {};
    var categoryTitle = (categoryProps['Loại Chi Phí'] && categoryProps['Loại Chi Phí'].title) || [];
    var categoryName = categoryTitle.length ? categoryTitle[0].plain_text : '(chưa phân loại)';
    categoryNames[categoryRows[i].id] = categoryName;
    var categoryGroupRelation = (categoryProps['Nhóm Quỹ'] && categoryProps['Nhóm Quỹ'].relation) || [];
    categoryGroupIds[categoryRows[i].id] =
      categoryGroupRelation.length ? categoryGroupRelation[0].id : '';
    if (!(categoryProps['Tính Trong 5,5 Triệu'] &&
          categoryProps['Tính Trong 5,5 Triệu'].checkbox === true)) continue;
    var fixedBudget = num_(categoryProps['Ngân Sách Tháng']);
    var fixed = {
      id: categoryRows[i].id,
      groupId: categoryGroupIds[categoryRows[i].id],
      name: categoryName,
      budget: fixedBudget,
      spent: 0,
      remaining: fixedBudget,
      over: 0,
      missingCategory: false,
      paidByAccount: {},
      accountBreakdown: []
    };
    fixedBudgets.push(fixed);
    fixedIdMap[fixed.id] = fixed;
    totalFixedBudget += fixed.budget;
  }
  for (i = 0; i < accountRows.length; i++) {
    var accountProps = accountRows[i].properties || {};
    var accountTitle = (accountProps['Phương Thức Thanh Toán'] && accountProps['Phương Thức Thanh Toán'].title) || [];
    accountNames[accountRows[i].id] = accountTitle.length ? accountTitle[0].plain_text : '(chưa chọn tài khoản)';
  }

  var flowAnalysis = analyzeExpenseRows_(expenseRows, categoryNames, fixedIdMap, accountNames);
  for (i = 0; i < expenseRows.length; i++) {
    var rowInfo = flowAnalysis.rowsById[expenseRows[i].id];
    var amount = rowInfo.amount;
    var categoryId = rowInfo.categoryId;
    var accountId = rowInfo.accountId;
    var categoryName = rowInfo.categoryName;
    var accountName = rowInfo.accountName;
    globalCategoryTotals[categoryName] = (globalCategoryTotals[categoryName] || 0) + amount;
    if (fixedIdMap[categoryId]) {
      var fixedForExpense = fixedIdMap[categoryId];
      fixedForExpense.paidByAccount[accountName] =
        (fixedForExpense.paidByAccount[accountName] || 0) + amount;
    }

    if (!accountMap[accountId]) {
      accountMap[accountId] = {
        id: accountId,
        name: accountName,
        total: 0,
        personalTotal: 0,
        unusualTotal: 0,
        loanTotal: 0,
        grabTotal: 0,
        categoryMap: {},
        categories: []
      };
    }
    var account = accountMap[accountId];
    account.total += amount;
    if (rowInfo.nature.kind === 'loan') account.loanTotal += amount;
    else if (rowInfo.nature.kind === 'grab') account.grabTotal += amount;
    else {
      account.personalTotal += amount;
      if (rowInfo.nature.isUnusual) account.unusualTotal += amount;
    }
    if (!account.categoryMap[categoryId]) {
      account.categoryMap[categoryId] = {
        id: categoryId,
        name: categoryName,
        total: 0,
        rows: []
      };
    }
    var category = account.categoryMap[categoryId];
    category.total += amount;
    category.rows.push({
      id: expenseRows[i].id,
      name: rowInfo.name,
      amount: amount,
      date: rowInfo.date,
      nature: rowInfo.nature.kind,
      isUnusual: rowInfo.nature.isUnusual
    });
  }

  for (i = 0; i < fixedBudgets.length; i++) {
    var fixedItem = fixedBudgets[i];
    fixedItem.spent = globalCategoryTotals[fixedItem.name] || 0;
    fixedItem.remaining = Math.max(fixedItem.budget - fixedItem.spent, 0);
    fixedItem.over = Math.max(fixedItem.spent - fixedItem.budget, 0);
    for (var paidAccountName in fixedItem.paidByAccount) {
      var paidAmount = fixedItem.paidByAccount[paidAccountName];
      if (paidAmount <= 0) continue;
      fixedItem.accountBreakdown.push({ account: paidAccountName, amount: paidAmount });
    }
    fixedItem.accountBreakdown.sort(function(a, b) { return b.amount - a.amount; });
    delete fixedItem.paidByAccount;
  }

  var accounts = [];
  for (var accountIdKey in accountMap) {
    var accountItem = accountMap[accountIdKey];
    for (var categoryIdKey in accountItem.categoryMap) {
      var categoryItem = accountItem.categoryMap[categoryIdKey];
      categoryItem.rows.sort(function(a, b) {
        return a.date < b.date ? 1 : (a.date > b.date ? -1 : 0);
      });
      accountItem.categories.push(categoryItem);
    }
    accountItem.categories.sort(function(a, b) { return b.total - a.total; });
    delete accountItem.categoryMap;
    accounts.push(accountItem);
  }
  accounts.sort(function(a, b) { return b.total - a.total; });
  var fundGroups = [];
  var knownGroupIds = {};
  for (i = 0; i < fundGroupRows.length; i++) {
    knownGroupIds[fundGroupRows[i].id] = true;
  }
  for (i = 0; i < fundGroupRows.length; i++) {
    var groupProps = fundGroupRows[i].properties || {};
    var groupTitle = (groupProps['Tên Nhóm Quỹ'] && groupProps['Tên Nhóm Quỹ'].title) || [];
    var destinationRelation =
      (groupProps['Tài Khoản Giữ Quỹ'] && groupProps['Tài Khoản Giữ Quỹ'].relation) || [];
    var destinationAccountId = destinationRelation.length ? destinationRelation[0].id : '';
    var requiresAllocation = !!(
      groupProps['Bắt Buộc Cấp Quỹ'] && groupProps['Bắt Buộc Cấp Quỹ'].checkbox === true
    );
    var groupId = fundGroupRows[i].id;
    var group = {
      name: groupTitle.length ? groupTitle[0].plain_text : '(nhóm quỹ chưa đặt tên)',
      budget: 0,
      spent: 0,
      over: 0,
      allocated: 0,
      paidOutsideFund: 0,
      transferNeeded: 0,
      requiresAllocation: requiresAllocation,
      unmatchedCategories: []
    };
    for (var gci = 0; gci < fixedBudgets.length; gci++) {
      var groupFixed = fixedBudgets[gci];
      if (groupFixed.groupId !== groupId) continue;
      group.budget += groupFixed.budget;
      group.spent += groupFixed.spent;
      for (var abi = 0; abi < groupFixed.accountBreakdown.length; abi++) {
        var accountBreakdown = groupFixed.accountBreakdown[abi];
        if (accountBreakdown.account !== accountNames[destinationAccountId]) {
          group.paidOutsideFund += accountBreakdown.amount;
        }
      }
    }

    var netAllocated = 0;
    for (var tri = 0; tri < transferRows.length; tri++) {
      var transferProps = transferRows[tri].properties || {};
      var transferGroupRelation =
        (transferProps['Nhóm Quỹ'] && transferProps['Nhóm Quỹ'].relation) || [];
      if (!transferGroupRelation.length || transferGroupRelation[0].id !== groupId) continue;

      var transferAmount = num_(transferProps['Số Tiền']);
      var toRelation = (transferProps['Đến Tài Khoản'] && transferProps['Đến Tài Khoản'].relation) || [];
      var fromRelation = (transferProps['Từ Tài Khoản'] && transferProps['Từ Tài Khoản'].relation) || [];
      var toId = toRelation.length ? toRelation[0].id : '';
      var fromId = fromRelation.length ? fromRelation[0].id : '';
      if (toId === destinationAccountId) netAllocated += transferAmount;
      if (fromId === destinationAccountId) netAllocated -= transferAmount;
    }
    group.allocated = Math.max(netAllocated, 0);
    group.over = Math.max(group.spent - group.budget, 0);
    if (requiresAllocation) {
      group.transferNeeded = Math.max(
        group.budget - group.allocated - group.paidOutsideFund,
        0
      );
    }
    fundGroups.push(group);
  }
  for (i = 0; i < fixedBudgets.length; i++) {
    if (fixedBudgets[i].groupId && !knownGroupIds[fixedBudgets[i].groupId]) {
      fixedBudgets[i].missingCategory = true;
    }
    delete fixedBudgets[i].id;
    delete fixedBudgets[i].groupId;
  }

  return {
    t: t,
    total: flowAnalysis.cashOutflowTotal,
    cashOutflowTotal: flowAnalysis.cashOutflowTotal,
    personalSpendingTotal: flowAnalysis.personalSpendingTotal,
    loanFlow: flowAnalysis.loanFlow,
    grabFlow: flowAnalysis.grabFlow,
    unusualSpending: flowAnalysis.unusualSpending,
    accounts: accounts,
    fixedBudgets: fixedBudgets,
    unplannedTotal: flowAnalysis.unplannedTotal,
    unallocatedBudget: Math.max(monthlyLimit - totalFixedBudget, 0),
    monthlyLimit: monthlyLimit,
    fundGroups: fundGroups
  };
}

function normalizeSearchText_(value) {
  var text = String(value || '').toLowerCase();
  if (text.normalize) text = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return text.replace(/đ/g, 'd').replace(/\s+/g, ' ').trim();
}

function cashflowPropertyText_(prop) {
  var parts = (prop && (prop.title || prop.rich_text)) || [];
  var text = '';
  for (var i = 0; i < parts.length; i++) {
    text += parts[i].plain_text || (parts[i].text && parts[i].text.content) || '';
  }
  return text;
}

function cashflowFirstRelationId_(prop) {
  var relation = (prop && prop.relation) || [];
  return relation.length ? relation[0].id : '';
}

function cashflowDate_(prop) {
  return (prop && prop.date && prop.date.start) || '';
}

function cashflowNumber_(prop) {
  if (!prop) return 0;
  if (prop.number != null) return Number(prop.number) || 0;
  if (prop.formula && prop.formula.number != null) return Number(prop.formula.number) || 0;
  if (prop.rollup && prop.rollup.number != null) return Number(prop.rollup.number) || 0;
  return 0;
}

function cashflowCategoryToken_(direction, normalizedName) {
  var hash = 2166136261;
  var text = String(normalizedName || '');
  for (var i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return String(direction || '').toLowerCase() + '-' + (hash >>> 0).toString(36);
}

function buildMonthlyCashflowData_(
  t,
  accountRows,
  incomeRows,
  otherIncomeRows,
  expenseRows,
  transferRows,
  incomeCategoryRows,
  otherIncomeCategoryRows,
  expenseCategoryRows
) {
  accountRows = accountRows || [];
  incomeRows = incomeRows || [];
  otherIncomeRows = otherIncomeRows || [];
  expenseRows = expenseRows || [];
  transferRows = transferRows || [];
  incomeCategoryRows = incomeCategoryRows || [];
  otherIncomeCategoryRows = otherIncomeCategoryRows || [];
  expenseCategoryRows = expenseCategoryRows || [];

  var cfg = getConfig_();
  var model = {
    t: t,
    totalIn: 0,
    totalOut: 0,
    net: 0,
    unknownAccount: {
      moneyIn: { count: 0, total: 0 },
      moneyOut: { count: 0, total: 0 }
    },
    accounts: []
  };
  var accountMap = {};

  function accountFor_(id, name, fallback, currentBalance) {
    var accountId = id || fallback;
    if (!accountMap[accountId]) {
      var account = {
        id: accountId,
        token: notionIdToken_(accountId, fallback),
        name: name || '(chưa chọn tài khoản)',
        currentBalance: Number(currentBalance) || 0,
        moneyIn: { total: 0, categories: [], categoryMap: {} },
        moneyOut: { total: 0, categories: [], categoryMap: {} },
        transfersIn: 0,
        transfersOut: 0
      };
      accountMap[accountId] = account;
      model.accounts.push(account);
    } else if (currentBalance != null) {
      accountMap[accountId].currentBalance = Number(currentBalance) || 0;
    }
    return accountMap[accountId];
  }

  function categoryNames_(rows, propertyName) {
    var names = {};
    for (var i = 0; i < rows.length; i++) {
      var props = rows[i].properties || {};
      names[rows[i].id] = cashflowPropertyText_(props[propertyName]) || '(chưa phân loại)';
    }
    return names;
  }

  function addCategoryRow_(account, direction, categoryName, row) {
    var bucket = direction === 'in' ? account.moneyIn : account.moneyOut;
    var normalizedName = normalizeSearchText_(categoryName);
    var category = bucket.categoryMap[normalizedName];
    if (!category) {
      category = {
        token: cashflowCategoryToken_(direction, normalizedName),
        name: categoryName,
        total: 0,
        rows: []
      };
      bucket.categoryMap[normalizedName] = category;
    }
    bucket.total += row.amount;
    category.total += row.amount;
    category.rows.push(row);
  }

  for (var ai = 0; ai < accountRows.length; ai++) {
    var accountProps = accountRows[ai].properties || {};
    accountFor_(
      accountRows[ai].id,
      cashflowPropertyText_(accountProps['Phương Thức Thanh Toán']),
      'account-' + ai,
      cashflowNumber_(accountProps['Số Dư Hiện Tại'])
    );
  }

  var incomeCategoryNames = categoryNames_(incomeCategoryRows, 'Loại Khoản Thu');
  var otherIncomeCategoryNames = categoryNames_(otherIncomeCategoryRows, 'Loại Khoản Thu');
  var expenseCategoryNames = categoryNames_(expenseCategoryRows, 'Loại Chi Phí');

  function addIncomeRows_(rows, categoryNames) {
    for (var i = 0; i < rows.length; i++) {
      var props = rows[i].properties || {};
      var categoryId = cashflowFirstRelationId_(props['Loại Khoản Thu']);
      var accountId = cashflowFirstRelationId_(props['Phương Thức Thanh Toán']);
      var amount = num_(props['Số Tiền']);
      if (categoryId === cfg.GOAL_RELATION_PAGE_ID || amount <= 0) continue;
      if (!accountId) {
        model.unknownAccount.moneyIn.count += 1;
        model.unknownAccount.moneyIn.total += amount;
        continue;
      }
      var account = accountFor_(accountId, '', 'account-' + i);
      addCategoryRow_(account, 'in', categoryNames[categoryId] || '(chưa phân loại)', {
        id: rows[i].id,
        name: cashflowPropertyText_(props['Tên Khoản Thu']) || '(không có nội dung)',
        amount: amount,
        date: cashflowDate_(props['Ngày']),
        note: cashflowPropertyText_(props['Ghi Chú'])
      });
      model.totalIn += amount;
    }
  }

  addIncomeRows_(incomeRows, incomeCategoryNames);
  addIncomeRows_(otherIncomeRows, otherIncomeCategoryNames);

  for (var ei = 0; ei < expenseRows.length; ei++) {
    var expenseProps = expenseRows[ei].properties || {};
    var expenseCategoryId = cashflowFirstRelationId_(expenseProps['Loại Chi Phí']);
    var expenseAccountId = cashflowFirstRelationId_(expenseProps['Phương Thức Thanh Toán']);
    var expenseAmount = num_(expenseProps['Số Tiền']);
    if (!expenseAccountId) {
      model.unknownAccount.moneyOut.count += 1;
      model.unknownAccount.moneyOut.total += expenseAmount;
      continue;
    }
    var expenseAccount = accountFor_(expenseAccountId, '', 'account-' + ei);
    addCategoryRow_(expenseAccount, 'out', expenseCategoryNames[expenseCategoryId] || '(chưa phân loại)', {
      id: expenseRows[ei].id,
      name: cashflowPropertyText_(expenseProps['Nội Dung Khoản Chi']) || '(không có nội dung)',
      amount: expenseAmount,
      date: cashflowDate_(expenseProps['Ngày']),
      note: cashflowPropertyText_(expenseProps['Ghi Chú'])
    });
    model.totalOut += expenseAmount;
  }

  for (var ti = 0; ti < transferRows.length; ti++) {
    var transferProps = transferRows[ti].properties || {};
    var transferAmount = num_(transferProps['Số Tiền']);
    var fromAccountId = cashflowFirstRelationId_(transferProps['Từ Tài Khoản']);
    var toAccountId = cashflowFirstRelationId_(transferProps['Đến Tài Khoản']);
    if (fromAccountId) accountFor_(fromAccountId, '', 'transfer-from-' + ti).transfersOut += transferAmount;
    if (toAccountId) accountFor_(toAccountId, '', 'transfer-to-' + ti).transfersIn += transferAmount;
  }

  for (var mi = 0; mi < model.accounts.length; mi++) {
    var modelAccount = model.accounts[mi];
    var buckets = [modelAccount.moneyIn, modelAccount.moneyOut];
    for (var bi = 0; bi < buckets.length; bi++) {
      var bucket = buckets[bi];
      for (var normalizedName in bucket.categoryMap) {
        var category = bucket.categoryMap[normalizedName];
        category.rows.sort(function(a, b) {
          return a.date < b.date ? 1 : (a.date > b.date ? -1 : 0);
        });
        bucket.categories.push(category);
      }
      bucket.categories.sort(function(a, b) { return b.total - a.total; });
      delete bucket.categoryMap;
    }
  }

  model.net = model.totalIn - model.totalOut;
  return model;
}

function monthlyCashflowData_(forceRefresh) {
  var cfg = getConfig_();
  var t = today_();
  var cacheKey = 'MONTHLY_CASHFLOW_' + iso_(t.y, t.m, t.d);
  if (!forceRefresh) {
    try {
      var cached = CacheService.getScriptCache().get(cacheKey);
      if (cached) return JSON.parse(cached);
    } catch (err) {
      Logger.log('Monthly cashflow cache read failed: ' + err);
    }
  }

  var monthFilter = { and: [
    { property: 'Ng\u00e0y', date: { on_or_after: iso_(t.y, t.m, 1) } },
    { property: 'Ng\u00e0y', date: { on_or_before: iso_(t.y, t.m, t.d) } }
  ]};
  function request_(dbId, filter) {
    var payload = { page_size: 100 };
    if (filter) payload.filter = filter;
    return {
      url: 'https://api.notion.com/v1/databases/' + dbId + '/query',
      method: 'post',
      contentType: 'application/json',
      headers: { 'Authorization': 'Bearer ' + cfg.NOTION_TOKEN, 'Notion-Version': NOTION_VERSION },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };
  }

  var responses = UrlFetchApp.fetchAll([
    request_(cfg.ACCOUNT_DB, null),
    request_(cfg.INCOME_DB, monthFilter),
    request_(cfg.OTHER_INCOME_DB, monthFilter),
    request_(cfg.EXPENSE_DB, monthFilter),
    request_(cfg.GOAL_DB, null),
    request_(cfg.OTHER_INCOME_CATEGORY_DB, null),
    request_(cfg.BUDGET_DB, null),
    request_(cfg.TRANSFER_DB, monthFilter)
  ]);
  var accountRows = completeNotionRows_(cfg.ACCOUNT_DB, null, responses[0], 'ACCOUNT_DB');
  var incomeRows = completeNotionRows_(cfg.INCOME_DB, monthFilter, responses[1], 'INCOME_DB');
  var otherIncomeRows = completeNotionRows_(cfg.OTHER_INCOME_DB, monthFilter, responses[2], 'OTHER_INCOME_DB');
  var expenseRows = completeNotionRows_(cfg.EXPENSE_DB, monthFilter, responses[3], 'EXPENSE_DB');
  var incomeCategoryRows = completeNotionRows_(cfg.GOAL_DB, null, responses[4], 'GOAL_DB');
  var otherIncomeCategoryRows = completeNotionRows_(
    cfg.OTHER_INCOME_CATEGORY_DB, null, responses[5], 'OTHER_INCOME_CATEGORY_DB'
  );
  var expenseCategoryRows = completeNotionRows_(cfg.BUDGET_DB, null, responses[6], 'BUDGET_DB');
  var transferRows = completeNotionRows_(cfg.TRANSFER_DB, monthFilter, responses[7], 'TRANSFER_DB');
  var model = buildMonthlyCashflowData_(
    t,
    accountRows,
    incomeRows,
    otherIncomeRows,
    expenseRows,
    transferRows,
    incomeCategoryRows,
    otherIncomeCategoryRows,
    expenseCategoryRows
  );

  try {
    CacheService.getScriptCache().put(cacheKey, JSON.stringify(model), 60);
  } catch (err) {
    Logger.log('Monthly cashflow cache write failed: ' + err);
  }
  return model;
}

function isRoutineExpenseCategory_(normalizedCategory) {
  var routine = {
    'di cho': true,
    'sieu thi': true,
    'an ngoai': true,
    'tap hoa': true,
    'dien thoai': true,
    'ca phe': true,
    'phi gui xe': true
  };
  return !!routine[normalizedCategory];
}

function accountSpendingData_() {
  var cfg = getConfig_();
  var t = today_();
  var monthFilter = { and: [
    { property: 'Ngày', date: { on_or_after: iso_(t.y, t.m, 1) } },
    { property: 'Ngày', date: { on_or_before: iso_(t.y, t.m, t.d) } }
  ]};
  function req(dbId, filter) {
    var payload = { page_size: 100 };
    if (filter) payload.filter = filter;
    return {
      url: 'https://api.notion.com/v1/databases/' + dbId + '/query',
      method: 'post',
      contentType: 'application/json',
      headers: { 'Authorization': 'Bearer ' + cfg.NOTION_TOKEN, 'Notion-Version': NOTION_VERSION },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };
  }
  var responses = UrlFetchApp.fetchAll([
    req(cfg.BUDGET_DB, null),
    req(cfg.EXPENSE_DB, monthFilter),
    req(cfg.ACCOUNT_DB, null),
    req(cfg.TRANSFER_DB, monthFilter),
    req(cfg.FUND_GROUP_DB, null)
  ]);
  return buildAccountSpendingData_(
    t,
    completeNotionRows_(cfg.BUDGET_DB, null, responses[0], 'BUDGET_DB'),
    completeNotionRows_(cfg.EXPENSE_DB, monthFilter, responses[1], 'EXPENSE_DB'),
    completeNotionRows_(cfg.ACCOUNT_DB, null, responses[2], 'ACCOUNT_DB'),
    cfg.MONTHLY_EXPENSE_LIMIT,
    completeNotionRows_(cfg.TRANSFER_DB, monthFilter, responses[3], 'TRANSFER_DB'),
    completeNotionRows_(cfg.FUND_GROUP_DB, null, responses[4], 'FUND_GROUP_DB')
  );
}

function expenseMonthData_() {
  var t = today_();
  var totals = sumExpensesByCategory_(iso_(t.y, t.m, 1), iso_(t.y, t.m, t.d));
  var categories = getBudgetCategories_();
  var items = [];
  for (var categoryId in totals.byCategory) {
    var amount = totals.byCategory[categoryId] || 0;
    if (amount <= 0) continue;
    items.push({
      id: categoryId,
      name: categories[categoryId] ? categories[categoryId].name : '(chưa phân loại)',
      amount: amount
    });
  }
  items.sort(function(a, b) { return b.amount - a.amount; });
  return { t: t, total: totals.total, items: items };
}

function expenseMonthText_(data) {
  var out = ['💸 Chi tháng ' + data.t.m + '/' + data.t.y + ': ' + money_(data.total)];
  if (!data.items.length) {
    out.push('', 'Chưa có khoản chi nào trong tháng này.');
    return out.join('\n');
  }
  out.push('');
  for (var i = 0; i < data.items.length; i++) {
    out.push('• ' + data.items[i].name + ': ' + money_(data.items[i].amount));
  }
  out.push('', 'Chọn một loại chi bên dưới để xem từng giao dịch.');
  return out.join('\n');
}

function expenseCategoryData_(categoryId) {
  var cfg = getConfig_();
  var t = today_();
  var filters = [
    { property: 'Ngày', date: { on_or_after: iso_(t.y, t.m, 1) } },
    { property: 'Ngày', date: { on_or_before: iso_(t.y, t.m, t.d) } }
  ];
  if (categoryId !== '(chưa phân loại)') {
    filters.push({ property: 'Loại Chi Phí', relation: { contains: categoryId } });
  }
  var rows = notionQuery_(cfg.EXPENSE_DB, { and: filters });
  var categories = getBudgetCategories_();
  var items = [];
  var total = 0;
  for (var i = 0; i < rows.length; i++) {
    var props = rows[i].properties || {};
    var relation = (props['Loại Chi Phí'] && props['Loại Chi Phí'].relation) || [];
    var rowCategoryId = relation.length ? relation[0].id : '(chưa phân loại)';
    if (rowCategoryId !== categoryId) continue;
    var title = (props['Nội Dung Khoản Chi'] && props['Nội Dung Khoản Chi'].title) || [];
    var amount = num_(props['Số Tiền']);
    var date = props['Ngày'] && props['Ngày'].date && props['Ngày'].date.start;
    total += amount;
    items.push({
      name: title.length ? title[0].plain_text : '(không có nội dung)',
      amount: amount,
      date: date || ''
    });
  }
  items.sort(function(a, b) { return a.date < b.date ? 1 : (a.date > b.date ? -1 : 0); });
  return {
    t: t,
    name: categories[categoryId] ? categories[categoryId].name : '(chưa phân loại)',
    total: total,
    items: items
  };
}

function expenseCategoryText_(data) {
  var out = ['💸 ' + data.name + ' — tháng ' + data.t.m + '/' + data.t.y + ': ' + money_(data.total), ''];
  var maxRows = 30;
  for (var i = 0; i < data.items.length && i < maxRows; i++) {
    var item = data.items[i];
    var dateText = item.date && item.date.length >= 10
      ? item.date.slice(8, 10) + '/' + item.date.slice(5, 7)
      : '(không ngày)';
    out.push('• ' + dateText + ' — ' + item.name + ': ' + money_(item.amount));
  }
  if (!data.items.length) out.push('Không tìm thấy giao dịch nào.');
  if (data.items.length > maxRows) out.push('... còn ' + (data.items.length - maxRows) + ' giao dịch khác.');
  return out.join('\n');
}

function notionIdToken_(id, fallback) {
  var normalized = String(id || '').replace(/-/g, '');
  if (!normalized || normalized.charAt(0) === '(') return fallback;
  return normalized.slice(-8);
}

function findByToken_(items, token, fallback) {
  for (var i = 0; i < items.length; i++) {
    if (notionIdToken_(items[i].id, fallback) === token) return items[i];
  }
  return null;
}

function expenseBudgetOverviewLines_(data, monthlyLimit, heading) {
  var spendingTotal = data.personalSpendingTotal == null ? data.total : data.personalSpendingTotal;
  var unusualTotal = data.unusualSpending ? data.unusualSpending.total : 0;
  var routineTotal = Math.max(spendingTotal - unusualTotal, 0);
  var out = [
    heading,
    'Hạn mức: ' + money_(monthlyLimit),
    'Đã dùng: ' + money_(spendingTotal)
  ];
  if (spendingTotal > monthlyLimit) {
    out.push('⚠️ Vượt: ' + money_(spendingTotal - monthlyLimit));
  } else {
    out.push('Còn: ' + money_(monthlyLimit - spendingTotal));
  }
  out.push('', 'Trong số đã dùng:');
  out.push('• Chi bình thường: ' + money_(routineTotal));
  if (unusualTotal > 0) {
    out.push('⚠️ Chi bất thường: ' + money_(unusualTotal));
  }
  var hasNonBudgetFlow =
    (data.loanFlow && data.loanFlow.total > 0) ||
    (data.grabFlow && data.grabFlow.total > 0);
  if (hasNonBudgetFlow) out.push('', 'Không tính vào ngân sách 5,5 triệu:');
  if (data.loanFlow && data.loanFlow.total > 0) {
    var loanLine = '↔️ Cho mượn/trả nợ: ' + money_(data.loanFlow.total);
    var loanDetails = [];
    if (data.loanFlow.lent > 0) loanDetails.push('cho mượn ' + money_(data.loanFlow.lent));
    if (data.loanFlow.repaid > 0) loanDetails.push('trả nợ ' + money_(data.loanFlow.repaid));
    if (data.loanFlow.other > 0) loanDetails.push('khác ' + money_(data.loanFlow.other));
    if (loanDetails.length) loanLine += ' (' + loanDetails.join('; ') + ')';
    out.push(loanLine);
  }
  if (data.grabFlow && data.grabFlow.total > 0) {
    var grabLine = '🛵 Chạy Grab: ' + money_(data.grabFlow.total);
    var grabDetails = [];
    if (data.grabFlow.capital > 0) grabDetails.push('nạp ví ' + money_(data.grabFlow.capital));
    if (data.grabFlow.operating > 0) grabDetails.push('xăng/phí ' + money_(data.grabFlow.operating));
    if (grabDetails.length) grabLine += ' (' + grabDetails.join('; ') + ')';
    out.push(grabLine);
  }
  return out;
}

function accountSpendingText_(data) {
  var out = expenseBudgetOverviewLines_(
    data,
    data.monthlyLimit,
    '💰 Ngân sách tháng ' + data.t.m + '/' + data.t.y
  );
  var i;
  if (data.fundGroups && data.fundGroups.length) {
    out.push('', '📦 Quỹ tháng này:');
    for (i = 0; i < data.fundGroups.length; i++) {
      var fundGroup = data.fundGroups[i];
      var fundRow;
      if (fundGroup.over > 0) {
        fundRow = '⛔ ' + fundGroup.name + ': ' + money_(fundGroup.spent) + ' / ' +
          money_(fundGroup.budget) + ' | vượt, cần hoàn ' + money_(fundGroup.over) +
          ' | DỪNG CHI';
      } else if (fundGroup.transferNeeded > 0) {
        fundRow = '⚠️ ' + fundGroup.name + ': ' + money_(fundGroup.spent) + ' / ' +
          money_(fundGroup.budget) + ' | cần cấp ' + money_(fundGroup.transferNeeded);
      } else {
        fundRow = '✅ ' + fundGroup.name + ': ' + money_(fundGroup.spent) + ' / ' +
          money_(fundGroup.budget);
        if (fundGroup.requiresAllocation && fundGroup.allocated > 0) {
          fundRow += ' | đã cấp ' + money_(fundGroup.allocated);
        }
      }
      if (fundGroup.unmatchedCategories.length) {
        fundRow += ' | ⚠️ thiếu loại chi';
      }
      out.push(fundRow);
    }
  } else {
    out.push('', '📌 Các khoản cố định:');
    for (i = 0; i < data.fixedBudgets.length; i++) {
      var fixed = data.fixedBudgets[i];
      var row = '• ' + fixed.name + ': ' + money_(fixed.spent) + ' / ' + money_(fixed.budget);
      if (fixed.over > 0) row += ' — vượt ' + money_(fixed.over);
      else row += ' — còn ' + money_(fixed.remaining);
      if (fixed.missingCategory) row += ' ⚠️ không tìm thấy loại chi';
      out.push(row);
    }
  }
  out.push('', 'Chọn tài khoản để xem tiền đã chi vào đâu:');
  return out.join('\n');
}

function accountSpendingKeyboard_(data) {
  var rows = [];
  if (data.unusualSpending && data.unusualSpending.total > 0) {
    rows.push([{
      text: '⚠️ Khoản bất thường — ' + money_(data.unusualSpending.total),
      callback_data: 'show_unusual'
    }]);
  }
  for (var i = 0; i < data.accounts.length; i++) {
    rows.push([{
      text: '💳 ' + data.accounts[i].name + ' — tiền ra ' + money_(data.accounts[i].total),
      callback_data: 'spend_account:' + notionIdToken_(data.accounts[i].id, 'noneacct')
    }]);
  }
  rows.push([
    { text: '🔄 Cập nhật', callback_data: 'refresh_accounts' },
    { text: '📊 Báo cáo tháng', callback_data: 'show_month' }
  ]);
  rows.push([{ text: '🏠 Trang chính', callback_data: 'show_home' }]);
  return { inline_keyboard: rows };
}

function unusualSpendingText_(data) {
  var unusual = data.unusualSpending || { total: 0, rows: [] };
  var out = [
    '⚠️ Chi không thường xuyên — tháng ' + data.t.m + '/' + data.t.y,
    'Tổng: ' + money_(unusual.total)
  ];
  var maxRows = 20;
  for (var i = 0; i < unusual.rows.length && i < maxRows; i++) {
    var row = unusual.rows[i];
    var dateText = row.date && row.date.length >= 10
      ? row.date.slice(8, 10) + '/' + row.date.slice(5, 7)
      : '(không ngày)';
    out.push('• ' + dateText + ' — ' + row.name + ': ' + money_(row.amount));
  }
  if (!unusual.rows.length) out.push('Không có khoản nào.');
  if (unusual.rows.length > maxRows) {
    out.push('... còn ' + (unusual.rows.length - maxRows) + ' giao dịch khác.');
  }
  return out.join('\n');
}

function unusualSpendingKeyboard_() {
  return {
    inline_keyboard: [
      [{ text: '⬅️ Dòng tiền', callback_data: 'show_accounts' }],
      [{ text: '🏠 Trang chính', callback_data: 'show_home' }]
    ]
  };
}

function accountDetailText_(data, account) {
  var out = [
    '💳 ' + account.name + ' — tháng ' + data.t.m + '/' + data.t.y,
    'Tổng tiền ra: ' + money_(account.total),
    '• Chi cá nhân: ' + money_(account.personalTotal || 0)
  ];
  if (account.unusualTotal > 0) out.push('  ⚠️ Trong đó bất thường: ' + money_(account.unusualTotal));
  if (account.loanTotal > 0) out.push('• Cho mượn/trả nợ: ' + money_(account.loanTotal));
  if (account.grabTotal > 0) out.push('• Chạy Grab: ' + money_(account.grabTotal));
  out.push('', 'Tiền đã đi vào:');
  for (var i = 0; i < account.categories.length; i++) {
    out.push('• ' + account.categories[i].name + ': ' + money_(account.categories[i].total));
  }
  out.push('', 'Chọn loại chi để xem từng giao dịch.');
  return out.join('\n');
}

function accountDetailKeyboard_(account) {
  var rows = [];
  var accountToken = notionIdToken_(account.id, 'noneacct');
  for (var i = 0; i < account.categories.length; i++) {
    rows.push([{
      text: '📌 ' + account.categories[i].name + ' — ' + money_(account.categories[i].total),
      callback_data: 'spend_category:' + accountToken + ':' +
        notionIdToken_(account.categories[i].id, 'nonecat')
    }]);
  }
  rows.push([{ text: '⬅️ Các tài khoản', callback_data: 'show_accounts' }]);
  rows.push([{ text: '🏠 Trang chính', callback_data: 'show_home' }]);
  return { inline_keyboard: rows };
}

function accountCategoryText_(account, category) {
  var out = ['💳 ' + account.name + ' → ' + category.name + ': ' + money_(category.total), ''];
  var maxRows = 30;
  for (var i = 0; i < category.rows.length && i < maxRows; i++) {
    var row = category.rows[i];
    var dateText = row.date && row.date.length >= 10
      ? row.date.slice(8, 10) + '/' + row.date.slice(5, 7)
      : '(không ngày)';
    out.push('• ' + dateText + ' — ' + row.name + ': ' + money_(row.amount));
  }
  if (category.rows.length > maxRows) {
    out.push('... còn ' + (category.rows.length - maxRows) + ' giao dịch khác.');
  }
  return out.join('\n');
}

function accountCategoryKeyboard_(account) {
  return {
    inline_keyboard: [
      [{
        text: '⬅️ ' + account.name,
        callback_data: 'spend_account:' + notionIdToken_(account.id, 'noneacct')
      }],
      [{ text: '🏠 Trang chính', callback_data: 'show_home' }]
    ]
  };
}

// ===================== TELEGRAM =====================
function parseNotionPage_(response, label) {
  var code = response.getResponseCode();
  var body = response.getContentText();
  Logger.log(label + ' status=' + code + ' body=' + body);
  var data = JSON.parse(body);

  if (code < 200 || code >= 300 || data.object === 'error') {
    var msg = data.message || body;
    throw new Error(label + ' Notion lỗi: ' + msg);
  }
  return data;
}

function parseNotionRows_(response, label) {
  return parseNotionPage_(response, label).results || [];
}

function completeNotionRows_(dbId, filter, firstResponse, label) {
  var cfg = getConfig_();
  var data = parseNotionPage_(firstResponse, label);
  var rows = data.results || [];
  var cursor = data.has_more ? data.next_cursor : null;

  while (cursor) {
    var payload = { page_size: 100, start_cursor: cursor };
    if (filter) payload.filter = filter;
    var response = UrlFetchApp.fetch('https://api.notion.com/v1/databases/' + dbId + '/query', {
      method: 'post',
      contentType: 'application/json',
      headers: { 'Authorization': 'Bearer ' + cfg.NOTION_TOKEN, 'Notion-Version': NOTION_VERSION },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
    data = parseNotionPage_(response, label + ' trang tiếp');
    rows = rows.concat(data.results || []);
    cursor = data.has_more ? data.next_cursor : null;
  }
  return rows;
}

function telegramSafeText_(text) {
  text = String(text || '');
  var limit = 3900; // Telegram giới hạn 4096 ký tự, chừa chỗ cho dòng báo cắt.
  if (text.length <= limit) return text;
  return text.slice(0, limit) + '\n\n... Tin nhắn quá dài nên đã rút gọn.';
}

function telegramApi_(method, payload) {
  var cfg = getConfig_();
  var res = UrlFetchApp.fetch('https://api.telegram.org/bot' + cfg.TELEGRAM_TOKEN + '/' + method, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload || {}),
    muteHttpExceptions: true
  });
  var code = res.getResponseCode();
  var body = res.getContentText();
  var data;
  try { data = JSON.parse(body); } catch (err) { data = {}; }
  Logger.log('Telegram ' + method + ' status=' + code + ' body=' + body);
  if (code < 200 || code >= 300 || data.ok !== true) {
    throw new Error('Telegram ' + method + ' lỗi (' + code + '): ' + (data.description || body));
  }
  return data;
}

function sendMessage_(chatId, text, replyMarkup) {
  var payload = { chat_id: chatId, text: telegramSafeText_(text) };
  if (replyMarkup) payload.reply_markup = replyMarkup;
  return telegramApi_('sendMessage', payload);
}

function mainMenuKeyboard_() {
  return {
    inline_keyboard: [
      [
        { text: '🎯 Mục tiêu', callback_data: 'show_goal' },
        { text: '📊 Dòng tiền', callback_data: 'cash_home' }
      ],
      [{ text: '📦 Quỹ & ngân sách', callback_data: 'show_funds' }]
    ]
  };
}

function goalKeyboard_() {
  return {
    inline_keyboard: [
      [
        { text: '🔄 Cập nhật', callback_data: 'refresh_goal' },
        { text: '📊 Dòng tiền', callback_data: 'cash_home' }
      ],
      [{ text: '📦 Quỹ & ngân sách', callback_data: 'show_funds' }],
      [{ text: '🏠 Trang chính', callback_data: 'show_home' }]
    ]
  };
}

function monthKeyboard_() {
  return {
    inline_keyboard: [
      [
        { text: '🔄 Cập nhật', callback_data: 'refresh_month' },
        { text: '🎯 Xem mục tiêu', callback_data: 'show_goal' }
      ],
      [{ text: '📦 Quỹ & ngân sách', callback_data: 'show_funds' }],
      [{ text: '🏠 Trang chính', callback_data: 'show_home' }]
    ]
  };
}

function expenseKeyboard_(items) {
  var rows = [];
  for (var i = 0; i < items.length; i++) {
    rows.push([{
      text: '📌 ' + items[i].name + ' — ' + money_(items[i].amount),
      callback_data: 'expense_cat:' + items[i].id
    }]);
  }
  rows.push([
    { text: '🔄 Cập nhật', callback_data: 'refresh_expenses' },
    { text: '📊 Báo cáo tháng', callback_data: 'show_month' }
  ]);
  rows.push([{ text: '🏠 Trang chính', callback_data: 'show_home' }]);
  return { inline_keyboard: rows };
}

function expenseCategoryKeyboard_() {
  return {
    inline_keyboard: [
      [{ text: '⬅️ Các loại chi', callback_data: 'show_expenses' }],
      [{ text: '🏠 Trang chính', callback_data: 'show_home' }]
    ]
  };
}

function sendStartMenu_(chatId) {
  sendMonthlyCashflowReport_(chatId, false);
}

function sendGoalReport_(chatId) {
  sendMessage_(chatId, progressText_(computeStatus_()), goalKeyboard_());
}

function monthlyCashflowText_(data) {
  data = data || {};
  var t = data.t || {};
  var text = '\ud83d\udcca D\u00f2ng ti\u1ec1n th\u00e1ng ' + t.m + '/' + t.y;
  var unknown = data.unknownAccount || {};
  var directions = [];
  var moneyIn = unknown.moneyIn || {};
  var moneyOut = unknown.moneyOut || {};
  if ((moneyIn.count || 0) > 0 || (moneyIn.total || 0) > 0) {
    directions.push(
      'Thu ' + (moneyIn.count || 0) + ' giao d\u1ecbch \u00b7 ' + money_(moneyIn.total || 0)
    );
  }
  if ((moneyOut.count || 0) > 0 || (moneyOut.total || 0) > 0) {
    directions.push(
      'Chi ' + (moneyOut.count || 0) + ' giao d\u1ecbch \u00b7 ' + money_(moneyOut.total || 0)
    );
  }
  if (directions.length) {
    text += '\n\n\u26a0\ufe0f Ch\u01b0a x\u00e1c \u0111\u1ecbnh t\u00e0i kho\u1ea3n: ' +
      directions.join(' | ');
  }
  return text;
}

function cashflowCallbackData_(value) {
  value = String(value || '');
  if (!value) return null;
  var bytes = encodeURIComponent(value).replace(/%[0-9A-F]{2}|./g, '_').length;
  return bytes < 64 ? value : null;
}

function monthlyCashflowKeyboard_(data) {
  var rows = [];
  var accounts = ((data && data.accounts) || []).slice();
  var preferredOrder = {
    'tien mat': 0,
    'banking': 1,
    'grap tien mat': 2,
    'momo': 3,
    'quy momo': 4
  };
  accounts.sort(function(a, b) {
    var aOrder = preferredOrder[normalizeSearchText_(a.name)];
    var bOrder = preferredOrder[normalizeSearchText_(b.name)];
    if (aOrder == null) aOrder = 100;
    if (bOrder == null) bOrder = 100;
    return aOrder - bOrder;
  });
  for (var i = 0; i < accounts.length; i++) {
    var account = accounts[i];
    var moneyIn = (account.moneyIn && account.moneyIn.total) || 0;
    var moneyOut = (account.moneyOut && account.moneyOut.total) || 0;
    var transfersIn = account.transfersIn || 0;
    var transfersOut = account.transfersOut || 0;
    if (!moneyIn && !moneyOut && !transfersIn && !transfersOut) continue;
    var callbackData = cashflowCallbackData_(
      account.token ? 'cash_account:' + account.token : ''
    );
    if (!callbackData) continue;
    rows.push([{
      text: account.name + ' \u00b7 ' + money_(account.currentBalance || 0),
      callback_data: callbackData
    }]);
  }
  rows.push([{ text: '\ud83c\udfaf M\u1ee5c ti\u00eau', callback_data: 'show_goal' }]);
  rows.push([{ text: '\ud83d\udce6 Qu\u1ef9 & ng\u00e2n s\u00e1ch', callback_data: 'show_funds' }]);
  return { inline_keyboard: rows };
}

function cashflowAccountCategories_(bucket) {
  var categories = (bucket && bucket.categories) || [];
  var visible = [];
  for (var i = 0; i < categories.length; i++) {
    if ((categories[i].total || 0) > 0) visible.push(categories[i]);
  }
  visible.sort(function(a, b) { return (b.total || 0) - (a.total || 0); });
  return visible;
}

function cashflowAccountText_(data, account) {
  var t = (data && data.t) || {};
  return '\ud83d\udcb3 ' + account.name + ' \u2014 th\u00e1ng ' + t.m + '/' + t.y;
}

function cashflowAccountKeyboard_(account) {
  var rows = [];
  var directions = [
    { key: 'in', label: 'Ti\u1ec1n v\u00e0o', bucket: account && account.moneyIn },
    { key: 'out', label: 'Ti\u1ec1n ra', bucket: account && account.moneyOut }
  ];
  for (var di = 0; di < directions.length; di++) {
    var direction = directions[di];
    var callbackData = cashflowCallbackData_(
      account && account.token ? 'cash_direction:' + account.token + ':' + direction.key : ''
    );
    if (callbackData) {
      rows.push([{
        text: direction.key === 'in' ? 'T\u1ed5ng Thu \u00b7 ' + money_(direction.bucket && direction.bucket.total || 0) :
          'T\u1ed5ng Chi \u00b7 ' + money_(direction.bucket && direction.bucket.total || 0),
        callback_data: callbackData
      }]);
    }
  }
  rows.push([{ text: '\u2b05\ufe0f C\u00e1c t\u00e0i kho\u1ea3n', callback_data: 'cash_home' }]);
  return { inline_keyboard: rows };
}

function cashflowUnclearTitle_(value) {
  var normalized = normalizeSearchText_(value);
  return !normalized ||
    normalized === '(khong co noi dung)' ||
    /^(khong ro|chua ro|khong biet|cha biet)$/.test(normalized);
}

function cashflowCategoryText_(data, account, direction, category) {
  var rows = ((category && category.rows) || []).slice();
  rows.sort(function(a, b) {
    var aDate = String(a.date || '');
    var bDate = String(b.date || '');
    return aDate < bDate ? 1 : (aDate > bDate ? -1 : 0);
  });
  var out = [
    (direction === 'in' ? '\ud83d\udce5 ' : '\ud83d\udcb8 ') + account.name + ' \u2192 ' + category.name + ': ' + money_(category.total || 0)
  ];
  var limit = Math.min(rows.length, 30);
  for (var i = 0; i < limit; i++) {
    var row = rows[i];
    var date = String(row.date || '');
    var displayDate = /^\d{4}-\d{2}-\d{2}/.test(date)
      ? date.slice(8, 10) + '/' + date.slice(5, 7)
      : (date || '(kh\u00f4ng ng\u00e0y)');
    var rowName = String(row.name || '') || '(kh\u00f4ng c\u00f3 n\u1ed9i dung)';
    var line = '\u2022 ' + displayDate + ' \u2014 ' + rowName + ': ' + money_(row.amount || 0);
    var note = String(row.note || '').trim();
    if (note && cashflowUnclearTitle_(row.name)) line += ' \u00b7 Ghi ch\u00fa: ' + note;
    out.push(line);
  }
  if (rows.length > limit) out.push('... c\u00f2n ' + (rows.length - limit) + ' giao d\u1ecbch.');
  return out.join('\n');
}

function cashflowCategoryKeyboard_(account, direction) {
  var rows = [];
  var directionLabel = direction === 'in' ? 'T\u1ed5ng Thu' :
    direction === 'out' ? 'T\u1ed5ng Chi' : '';
  var directionCallback = cashflowCallbackData_(
    account && account.token && directionLabel
      ? 'cash_direction:' + account.token + ':' + direction
      : ''
  );
  if (directionCallback) {
    rows.push([{ text: '\u2b05\ufe0f ' + directionLabel, callback_data: directionCallback }]);
  }
  rows.push([{ text: '\ud83c\udfe0 C\u00e1c t\u00e0i kho\u1ea3n', callback_data: 'cash_home' }]);
  return { inline_keyboard: rows };
}

function cashflowCategoryErrorText_() {
  return 'Lo\u1ea1i giao d\u1ecbch kh\u00f4ng c\u00f2n t\u1ed3n t\u1ea1i trong d\u1eef li\u1ec7u th\u00e1ng n\u00e0y.';
}

function parseCashflowCategoryCallback_(value) {
  var match = /^cash_cat:([A-Za-z0-9-]+):(in|out):([A-Za-z0-9-]+)$/.exec(String(value || ''));
  if (!match) return null;
  return { accountToken: match[1], direction: match[2], categoryToken: match[3] };
}

function parseCashflowDirectionCallback_(value) {
  var match = /^cash_direction:([A-Za-z0-9-]+):(in|out)$/.exec(String(value || ''));
  if (!match) return null;
  return { accountToken: match[1], direction: match[2] };
}

function cashflowDirectionText_(account, direction) {
  return (direction === 'in' ? '\ud83d\udce5 ' : '\ud83d\udcb8 ') + account.name + ' \u2014 ' +
    (direction === 'in' ? 'T\u1ed5ng Thu' : 'T\u1ed5ng Chi');
}

function cashflowDirectionKeyboard_(account, direction) {
  var rows = [];
  var bucket = direction === 'in' ? account && account.moneyIn : account && account.moneyOut;
  var categories = cashflowAccountCategories_(bucket);
  for (var i = 0; i < categories.length; i++) {
    var category = categories[i];
    var categoryCallback = cashflowCallbackData_(
      account && account.token && category.token
        ? 'cash_cat:' + account.token + ':' + direction + ':' + category.token
        : ''
    );
    if (!categoryCallback) continue;
    rows.push([{
      text: category.name + ' \u00b7 ' + money_(category.total),
      callback_data: categoryCallback
    }]);
  }
  var accountCallback = cashflowCallbackData_(
    account && account.token ? 'cash_account:' + account.token : ''
  );
  if (accountCallback) rows.push([{ text: '\u2b05\ufe0f ' + account.name, callback_data: accountCallback }]);
  rows.push([{ text: '\ud83c\udfe0 C\u00e1c t\u00e0i kho\u1ea3n', callback_data: 'cash_home' }]);
  return { inline_keyboard: rows };
}

function cashflowDirectionErrorText_() {
  return 'H\u01b0\u1edbng d\u00f2ng ti\u1ec1n kh\u00f4ng c\u00f2n t\u1ed3n t\u1ea1i trong d\u1eef li\u1ec7u th\u00e1ng n\u00e0y.';
}

function findCashflowCategoryByToken_(categories, categoryToken) {
  categories = categories || [];
  for (var i = 0; i < categories.length; i++) {
    if (categories[i].token === categoryToken) return categories[i];
  }
  return null;
}

function sendCashflowCategoryReport_(chatId, accountToken, direction, categoryToken) {
  if (direction !== 'in' && direction !== 'out') {
    sendMessage_(chatId, cashflowCategoryErrorText_(), cashflowCategoryKeyboard_(null, direction));
    return;
  }
  var data = monthlyCashflowData_(false);
  var account = findCashflowAccountByToken_(data.accounts, accountToken);
  if (!account) {
    sendMessage_(chatId, cashflowCategoryErrorText_(), cashflowCategoryKeyboard_(null, direction));
    return;
  }
  var bucket = direction === 'in' ? account.moneyIn : account.moneyOut;
  var category = findCashflowCategoryByToken_(bucket && bucket.categories, categoryToken);
  if (!category) {
    sendMessage_(chatId, cashflowCategoryErrorText_(), cashflowCategoryKeyboard_(account, direction));
    return;
  }
  sendMessage_(
    chatId,
    cashflowCategoryText_(data, account, direction, category),
    cashflowCategoryKeyboard_(account, direction)
  );
}

function sendCashflowDirectionReport_(chatId, accountToken, direction) {
  if (direction !== 'in' && direction !== 'out') {
    sendMessage_(chatId, cashflowDirectionErrorText_(), cashflowDirectionKeyboard_());
    return;
  }
  var data = monthlyCashflowData_(false);
  var account = findCashflowAccountByToken_(data.accounts, accountToken);
  if (!account) {
    sendMessage_(chatId, cashflowDirectionErrorText_(), cashflowDirectionKeyboard_());
    return;
  }
  sendMessage_(
    chatId,
    cashflowDirectionText_(account, direction),
    cashflowDirectionKeyboard_(account, direction)
  );
}

function sendMonthlyCashflowReport_(chatId, forceRefresh) {
  var data = monthlyCashflowData_(forceRefresh);
  sendMessage_(chatId, monthlyCashflowText_(data), monthlyCashflowKeyboard_(data));
}

function fundBudgetText_(data) {
  data = data || {};
  var t = data.t || {};
  var groups = data.fundGroups || [];
  var out = ['📦 Quỹ & ngân sách — tháng ' + t.m + '/' + t.y];
  if (!groups.length) {
    out.push('', 'Chưa có nhóm quỹ nào trong tháng này.');
    return out.join('\n');
  }
  for (var i = 0; i < groups.length; i++) {
    var group = groups[i];
    var row;
    if ((group.over || 0) > 0) {
      row = '⛔ ' + group.name + ': ' + money_(group.spent) + ' / ' + money_(group.budget) +
        ' | vượt, cần hoàn ' + money_(group.over);
    } else {
      row = '✅ ' + group.name + ': ' + money_(group.spent) + ' / ' + money_(group.budget) +
        ' | còn ' + money_(Math.max((group.budget || 0) - (group.spent || 0), 0));
    }
    if ((group.transferNeeded || 0) > 0) {
      row += ' | cần cấp ' + money_(group.transferNeeded);
    } else if (group.requiresAllocation && (group.allocated || 0) > 0) {
      row += ' | đã cấp ' + money_(group.allocated);
    }
    if (group.unmatchedCategories && group.unmatchedCategories.length) {
      row += ' | ⚠️ thiếu loại chi';
    }
    out.push(row);
  }
  return out.join('\n');
}

function fundBudgetKeyboard_() {
  return {
    inline_keyboard: [
      [{ text: '🔄 Cập nhật', callback_data: 'show_funds' }],
      [{ text: '⬅️ Dòng tiền', callback_data: 'cash_home' }]
    ]
  };
}

function sendFundBudgetReport_(chatId) {
  sendMessage_(chatId, fundBudgetText_(accountSpendingData_()), fundBudgetKeyboard_());
}

function findCashflowAccountByToken_(accounts, accountToken) {
  accounts = accounts || [];
  for (var i = 0; i < accounts.length; i++) {
    if (accounts[i].token === accountToken) return accounts[i];
  }
  return null;
}

function sendCashflowAccountReport_(chatId, accountToken) {
  var data = monthlyCashflowData_(false);
  var account = findCashflowAccountByToken_(data.accounts, accountToken);
  if (!account) {
    sendMessage_(
      chatId,
      'T\u00e0i kho\u1ea3n kh\u00f4ng c\u00f2n t\u1ed3n t\u1ea1i trong d\u1eef li\u1ec7u th\u00e1ng n\u00e0y.',
      cashflowAccountKeyboard_()
    );
    return;
  }
  sendMessage_(chatId, cashflowAccountText_(data, account), cashflowAccountKeyboard_(account));
}

function sendMonthReport_(chatId) {
  sendMessage_(chatId, cashflowText_(), monthKeyboard_());
}

function sendExpenseReport_(chatId) {
  var data = expenseMonthData_();
  sendMessage_(chatId, expenseMonthText_(data), expenseKeyboard_(data.items));
}

function sendExpenseCategoryReport_(chatId, categoryId) {
  sendMessage_(chatId, expenseCategoryText_(expenseCategoryData_(categoryId)), expenseCategoryKeyboard_());
}

function sendAccountSpendingReport_(chatId) {
  var data = accountSpendingData_();
  sendMessage_(chatId, accountSpendingText_(data), accountSpendingKeyboard_(data));
}

function sendUnusualSpendingReport_(chatId) {
  var data = accountSpendingData_();
  sendMessage_(chatId, unusualSpendingText_(data), unusualSpendingKeyboard_());
}

function sendAccountDetailReport_(chatId, accountToken) {
  var data = accountSpendingData_();
  var account = findByToken_(data.accounts, accountToken, 'noneacct');
  if (!account) throw new Error('Không tìm thấy tài khoản đã chọn.');
  sendMessage_(chatId, accountDetailText_(data, account), accountDetailKeyboard_(account));
}

function sendAccountCategoryReport_(chatId, accountToken, categoryToken) {
  var data = accountSpendingData_();
  var account = findByToken_(data.accounts, accountToken, 'noneacct');
  if (!account) throw new Error('Không tìm thấy tài khoản đã chọn.');
  var category = findByToken_(account.categories, categoryToken, 'nonecat');
  if (!category) throw new Error('Không tìm thấy loại chi đã chọn.');
  sendMessage_(chatId, accountCategoryText_(account, category), accountCategoryKeyboard_(account));
}

function lastProcessedUpdateId_() {
  var raw = PropertiesService.getScriptProperties().getProperty('LAST_TELEGRAM_UPDATE_ID');
  return raw == null ? null : Number(raw);
}

function markUpdateProcessed_(updateId) {
  PropertiesService.getScriptProperties().setProperty('LAST_TELEGRAM_UPDATE_ID', String(updateId));
}

function processUpdate_(update) {
  var cfg = getConfig_();
  var updateId = update.update_id;
  var lastId = lastProcessedUpdateId_();
  if (updateId != null && lastId != null && updateId <= lastId) return;

  var callback = update.callback_query;
  if (callback) {
    try {
      telegramApi_('answerCallbackQuery', { callback_query_id: callback.id });
    } catch (answerErr) {
      Logger.log('answerCallbackQuery lỗi: ' + answerErr.message);
    }

    var callbackChatId = callback.message && callback.message.chat && callback.message.chat.id;
    if (!callback.from || callback.from.id !== cfg.ALLOWED_USER_ID || callbackChatId == null) {
      if (updateId != null) markUpdateProcessed_(updateId);
      return;
    }

    try {
      if (callback.data === 'show_goal' || callback.data === 'refresh_goal') {
        sendGoalReport_(callbackChatId);
      } else if (callback.data === 'cash_refresh') {
        sendMonthlyCashflowReport_(callbackChatId, true);
      } else if (callback.data === 'cash_home' || callback.data === 'show_home') {
        sendMonthlyCashflowReport_(callbackChatId, false);
      } else if (callback.data === 'show_funds') {
        sendFundBudgetReport_(callbackChatId);
      } else if (String(callback.data) === 'cash_cat' || String(callback.data).indexOf('cash_cat:') === 0) {
        var cashflowCategoryCallback = parseCashflowCategoryCallback_(callback.data);
        if (!cashflowCategoryCallback) {
          sendMessage_(callbackChatId, cashflowCategoryErrorText_(), cashflowCategoryKeyboard_(null, null));
        } else {
          sendCashflowCategoryReport_(
            callbackChatId,
            cashflowCategoryCallback.accountToken,
            cashflowCategoryCallback.direction,
            cashflowCategoryCallback.categoryToken
          );
        }
      } else if (String(callback.data) === 'cash_direction' || String(callback.data).indexOf('cash_direction:') === 0) {
        var cashflowDirectionCallback = parseCashflowDirectionCallback_(callback.data);
        if (!cashflowDirectionCallback) {
          sendMessage_(callbackChatId, cashflowDirectionErrorText_(), cashflowDirectionKeyboard_());
        } else {
          sendCashflowDirectionReport_(
            callbackChatId,
            cashflowDirectionCallback.accountToken,
            cashflowDirectionCallback.direction
          );
        }
      } else if (String(callback.data).indexOf('cash_account:') === 0) {
        sendCashflowAccountReport_(
          callbackChatId,
          String(callback.data).slice('cash_account:'.length)
        );
      } else if (callback.data === 'show_month' || callback.data === 'refresh_month') {
        sendMonthlyCashflowReport_(callbackChatId, false);
      } else if (
        callback.data === 'show_accounts' ||
        callback.data === 'refresh_accounts' ||
        callback.data === 'show_unusual' ||
        String(callback.data).indexOf('spend_account:') === 0 ||
        String(callback.data).indexOf('spend_category:') === 0
      ) {
        sendMonthlyCashflowReport_(callbackChatId, false);
      } else {
        sendStartMenu_(callbackChatId);
      }
    } catch (callbackErr) {
      Logger.log('Xử lý callback ' + updateId + ' lỗi: ' + callbackErr.stack);
      sendMessage_(callbackChatId, 'Lỗi: ' + callbackErr.message, cashflowDirectionKeyboard_());
    }

    if (updateId != null) markUpdateProcessed_(updateId);
    return;
  }

  var msg = update.message || update.edited_message;
  if (!msg || !msg.text || !msg.from || msg.from.id !== cfg.ALLOWED_USER_ID) {
    if (updateId != null) markUpdateProcessed_(updateId);
    return;
  }

  var chatId = msg.chat.id;
  var text = String(msg.text).trim();
  var command = text.split(/\s+/)[0].split('@')[0].toLowerCase();
  try {
    if (command === '/start') sendMonthlyCashflowReport_(chatId, false);
    else if (command === '/muctieu') sendGoalReport_(chatId);
    else {
      var amount = parseAmount_(text);
      if (amount == null) sendMessage_(chatId, 'Nhắn số tiền kiếm hôm nay (vd 650000), hoặc /muctieu.');
      else {
        var t = today_();
        addGrabIncome_(iso_(t.y, t.m, t.d), amount, 'Thu nhập Grab');
        sendMessage_(chatId, loggedText_(amount));
      }
    }
  } catch (err) {
    Logger.log('Xử lý update ' + updateId + ' lỗi: ' + err.stack);
    sendMessage_(chatId, 'Lỗi: ' + err.message);
  }

  if (updateId != null) markUpdateProcessed_(updateId);
}

// Giữ lại để chẩn đoán deployment cũ; chế độ chính dùng pollTelegram().
function doPost(e) {
  var update;
  try { update = JSON.parse(e.postData.contents); } catch (err) { return ok_(); }

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    processUpdate_(update);
    return ok_();
  } finally {
    lock.releaseLock();
  }
}

function pollTelegram() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return;
  try {
    var lastId = lastProcessedUpdateId_();
    var payload = {
      limit: 100,
      timeout: 0,
      allowed_updates: ['message', 'edited_message', 'callback_query']
    };
    if (lastId != null) payload.offset = lastId + 1;
    var updates = telegramApi_('getUpdates', payload).result || [];
    updates.sort(function(a, b) { return a.update_id - b.update_id; });
    updates.forEach(processUpdate_);
  } finally {
    lock.releaseLock();
  }
}

function installPolling() {
  telegramApi_('deleteWebhook', { drop_pending_updates: false });
  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    if (trigger.getHandlerFunction() === 'pollTelegram') ScriptApp.deleteTrigger(trigger);
  });
  ScriptApp.newTrigger('pollTelegram').timeBased().everyMinutes(1).create();
  pollTelegram();
  Logger.log('Đã bật chế độ polling mỗi phút; webhook đã tắt.');
}

function stopPolling() {
  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    if (trigger.getHandlerFunction() === 'pollTelegram') ScriptApp.deleteTrigger(trigger);
  });
}
function ok_() { return ContentService.createTextOutput('ok').setMimeType(ContentService.MimeType.TEXT); }

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

// Webhook trực tiếp tới Apps Script không dùng được vì Content Service trả HTTP 302.
function setWebhook() {
  throw new Error('Apps Script trả HTTP 302 cho webhook. Hãy chạy installPolling() thay thế.');
}

// Kiểm tra nhanh Notion có đọc được không (chạy thử, xem Log).
function testNotion() {
  var t = today_();
  Logger.log('Mục tiêu tháng: ' + getMonthlyGoal_());
  Logger.log('Grab kiếm tháng này: ' + sumGrabIncome_(iso_(t.y, t.m, 1), iso_(t.y, t.m, t.d)));
}

function resetWebhook() {
  telegramApi_('deleteWebhook', { drop_pending_updates: true });
  PropertiesService.getScriptProperties().deleteProperty('LAST_TELEGRAM_UPDATE_ID');
  Logger.log('Đã xóa webhook + bỏ tin tồn. Flood dừng.');
}

function getWebhookInfo() {
  var data = telegramApi_('getWebhookInfo', {});
  Logger.log(JSON.stringify(data.result));
  return data.result;
}
