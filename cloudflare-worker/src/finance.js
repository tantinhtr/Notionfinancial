function num_(prop) {
  return (prop && prop.number) || 0;
}

function notionIdToken_(id, fallback) {
  const normalized = String(id || "").replace(/-/g, "");
  if (!normalized || normalized.charAt(0) === "(") return fallback;
  return normalized.slice(-8);
}

export function iso_(year, month, day) {
  return [
    String(year).padStart(4, "0"),
    String(month).padStart(2, "0"),
    String(day).padStart(2, "0")
  ].join("-");
}

export function money_(value) {
  const rounded = Math.round(value);
  return String(rounded).replace(/\B(?=(\d{3})+(?!\d))/g, ".") + "đ";
}

export function normalizeSearchText_(value) {
  let text = String(value || "").toLowerCase();
  if (text.normalize) {
    text = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }
  return text.replace(/đ/g, "d").replace(/\s+/g, " ").trim();
}

export function progressText_(status) {
  const fraction = status.goal ? status.earnedMonth / status.goal : 0;
  const lines = [
    "📅 Mục tiêu Thu Nhập Ròng Grab (App) — tháng " + status.t.m + "/" + status.t.y,
    "Mục tiêu tháng: " + money_(status.goal),
    "📈 Tiến độ: " + (fraction * 100).toFixed(1).replace(".", ",") + "%",
    "✅ Đã kiếm: " + money_(status.earnedMonth),
    "💰 Còn thiếu: " + money_(status.remaining),
    "",
    "🎯 Mục tiêu mỗi ngày (đều): " + money_(status.baseDaily)
  ];
  if (status.daysAfter > 0) {
    lines.push("🔥 Còn " + status.daysAfter + " ngày → mỗi ngày cần: " + money_(status.tomorrowTarget));
  } else {
    lines.push("🏁 Hôm nay là ngày cuối tháng!");
  }
  return lines.join("\n");
}

function cashflowPropertyText_(prop) {
  const parts = (prop && (prop.title || prop.rich_text)) || [];
  let text = "";
  for (const part of parts) {
    text += part.plain_text || (part.text && part.text.content) || "";
  }
  return text;
}

function cashflowFirstRelationId_(prop) {
  const relation = (prop && prop.relation) || [];
  return relation.length ? relation[0].id : "";
}

function cashflowDate_(prop) {
  return (prop && prop.date && prop.date.start) || "";
}

function cashflowNumber_(prop) {
  if (!prop) return 0;
  if (prop.number != null) return Number(prop.number) || 0;
  if (prop.formula && prop.formula.number != null) return Number(prop.formula.number) || 0;
  if (prop.rollup && prop.rollup.number != null) return Number(prop.rollup.number) || 0;
  return 0;
}

export function cashflowCategoryToken_(direction, normalizedName) {
  let hash = 2166136261;
  const text = String(normalizedName || "");
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return String(direction || "").toLowerCase() + "-" + (hash >>> 0).toString(36);
}

export function buildMonthlyCashflowData_(
  t,
  accountRows,
  incomeRows,
  otherIncomeRows,
  expenseRows,
  transferRows,
  incomeCategoryRows,
  otherIncomeCategoryRows,
  expenseCategoryRows,
  goalRelationPageId = "39c8ffb5-256b-806f-a710-e022aabf703d"
) {
  accountRows = accountRows || [];
  incomeRows = incomeRows || [];
  otherIncomeRows = otherIncomeRows || [];
  expenseRows = expenseRows || [];
  transferRows = transferRows || [];
  incomeCategoryRows = incomeCategoryRows || [];
  otherIncomeCategoryRows = otherIncomeCategoryRows || [];
  expenseCategoryRows = expenseCategoryRows || [];

  const model = {
    t,
    totalIn: 0,
    totalOut: 0,
    net: 0,
    unknownAccount: {
      moneyIn: { count: 0, total: 0 },
      moneyOut: { count: 0, total: 0 }
    },
    accounts: []
  };
  const accountMap = {};

  function accountFor_(id, name, fallback, currentBalance) {
    const accountId = id || fallback;
    if (!accountMap[accountId]) {
      const account = {
        id: accountId,
        token: notionIdToken_(accountId, fallback),
        name: name || "(chưa chọn tài khoản)",
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
    const names = {};
    for (const row of rows) {
      const props = row.properties || {};
      names[row.id] = cashflowPropertyText_(props[propertyName]) || "(chưa phân loại)";
    }
    return names;
  }

  function addCategoryRow_(account, direction, categoryName, row) {
    const bucket = direction === "in" ? account.moneyIn : account.moneyOut;
    const normalizedName = normalizeSearchText_(categoryName);
    let category = bucket.categoryMap[normalizedName];
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

  for (let index = 0; index < accountRows.length; index += 1) {
    const row = accountRows[index];
    const props = row.properties || {};
    accountFor_(
      row.id,
      cashflowPropertyText_(props["Phương Thức Thanh Toán"]),
      "account-" + index,
      cashflowNumber_(props["Số Dư Hiện Tại"])
    );
  }

  const incomeCategoryNames = categoryNames_(incomeCategoryRows, "Loại Khoản Thu");
  const otherIncomeCategoryNames = categoryNames_(otherIncomeCategoryRows, "Loại Khoản Thu");
  const expenseCategoryNames = categoryNames_(expenseCategoryRows, "Loại Chi Phí");

  function addIncomeRows_(rows, categoryNames) {
    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      const props = row.properties || {};
      const categoryId = cashflowFirstRelationId_(props["Loại Khoản Thu"]);
      const accountId = cashflowFirstRelationId_(props["Phương Thức Thanh Toán"]);
      const amount = num_(props["Số Tiền"]);
      if (categoryId === goalRelationPageId || amount <= 0) continue;
      if (!accountId) {
        model.unknownAccount.moneyIn.count += 1;
        model.unknownAccount.moneyIn.total += amount;
        continue;
      }
      const account = accountFor_(accountId, "", "account-" + index);
      addCategoryRow_(account, "in", categoryNames[categoryId] || "(chưa phân loại)", {
        id: row.id,
        name: cashflowPropertyText_(props["Tên Khoản Thu"]) || "(không có nội dung)",
        amount,
        date: cashflowDate_(props["Ngày"]),
        note: cashflowPropertyText_(props["Ghi Chú"])
      });
      model.totalIn += amount;
    }
  }

  addIncomeRows_(incomeRows, incomeCategoryNames);
  addIncomeRows_(otherIncomeRows, otherIncomeCategoryNames);

  for (let index = 0; index < expenseRows.length; index += 1) {
    const row = expenseRows[index];
    const props = row.properties || {};
    const categoryId = cashflowFirstRelationId_(props["Loại Chi Phí"]);
    const accountId = cashflowFirstRelationId_(props["Phương Thức Thanh Toán"]);
    const amount = num_(props["Số Tiền"]);
    if (!accountId) {
      model.unknownAccount.moneyOut.count += 1;
      model.unknownAccount.moneyOut.total += amount;
      continue;
    }
    const account = accountFor_(accountId, "", "account-" + index);
    addCategoryRow_(account, "out", expenseCategoryNames[categoryId] || "(chưa phân loại)", {
      id: row.id,
      name: cashflowPropertyText_(props["Nội Dung Khoản Chi"]) || "(không có nội dung)",
      amount,
      date: cashflowDate_(props["Ngày"]),
      note: cashflowPropertyText_(props["Ghi Chú"])
    });
    model.totalOut += amount;
  }

  for (let index = 0; index < transferRows.length; index += 1) {
    const props = transferRows[index].properties || {};
    const amount = num_(props["Số Tiền"]);
    const fromAccountId = cashflowFirstRelationId_(props["Từ Tài Khoản"]);
    const toAccountId = cashflowFirstRelationId_(props["Đến Tài Khoản"]);
    if (fromAccountId) {
      accountFor_(fromAccountId, "", "transfer-from-" + index).transfersOut += amount;
    }
    if (toAccountId) {
      accountFor_(toAccountId, "", "transfer-to-" + index).transfersIn += amount;
    }
  }

  for (const account of model.accounts) {
    for (const bucket of [account.moneyIn, account.moneyOut]) {
      for (const normalizedName in bucket.categoryMap) {
        const category = bucket.categoryMap[normalizedName];
        category.rows.sort((a, b) => (
          a.date < b.date ? 1 : (a.date > b.date ? -1 : 0)
        ));
        bucket.categories.push(category);
      }
      bucket.categories.sort((a, b) => b.total - a.total);
      delete bucket.categoryMap;
    }
  }

  model.net = model.totalIn - model.totalOut;
  return model;
}

function isRoutineExpenseCategory_(normalizedCategory) {
  return !!{
    "di cho": true,
    "sieu thi": true,
    "an ngoai": true,
    "tap hoa": true,
    "dien thoai": true,
    "ca phe": true,
    "phi gui xe": true
  }[normalizedCategory];
}

function classifyExpenseNature_(categoryName, expenseName, expenseNote, isFixedBudget) {
  const normalizedCategory = normalizeSearchText_(categoryName);
  const normalizedName = normalizeSearchText_(expenseName);
  const normalizedNote = normalizeSearchText_(expenseNote);
  if (normalizedCategory === "vay va tra") {
    let loanType = "other";
    if (normalizedName.indexOf("cho ") === 0 && normalizedName.indexOf(" muon") >= 0) {
      loanType = "lent";
    } else if (normalizedName.indexOf("tra") === 0 && normalizedName.indexOf("muon") >= 0) {
      loanType = "repaid";
    }
    return { kind: "loan", loanType, isUnusual: false };
  }
  if (normalizedCategory === "grap" || normalizedCategory === "grab") {
    const isCapital =
      (normalizedName.indexOf("nap") >= 0 &&
       (normalizedName.indexOf("grap") >= 0 || normalizedName.indexOf("grab") >= 0)) ||
      (normalizedName.indexOf("chuyen tien") >= 0 && normalizedName.indexOf("nap ho") >= 0);
    return {
      kind: "grab",
      grabType: isCapital ? "capital" : "operating",
      isUnusual: false
    };
  }
  return {
    kind: "personal",
    isUnusual:
      normalizedCategory === "phat sinh" ||
      normalizedNote.indexOf("quy phat sinh") >= 0 ||
      (!isFixedBudget && !isRoutineExpenseCategory_(normalizedCategory))
  };
}

function analyzeExpenseRows_(expenseRows, categoryNames, fixedIdMap, accountNames) {
  const summary = {
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

  for (const expenseRow of expenseRows) {
    const props = expenseRow.properties || {};
    const amount = num_(props["Số Tiền"]);
    const categoryRelation = (props["Loại Chi Phí"] && props["Loại Chi Phí"].relation) || [];
    const accountRelation =
      (props["Phương Thức Thanh Toán"] && props["Phương Thức Thanh Toán"].relation) || [];
    const categoryId = categoryRelation.length ? categoryRelation[0].id : "(chưa phân loại)";
    const accountId = accountRelation.length ? accountRelation[0].id : "(chưa chọn tài khoản)";
    const categoryName = categoryNames[categoryId] || "(chưa phân loại)";
    const accountName = accountNames[accountId] || "(chưa chọn tài khoản)";
    const title = (props["Nội Dung Khoản Chi"] && props["Nội Dung Khoản Chi"].title) || [];
    const expenseName = title.length ? title[0].plain_text : "(không có nội dung)";
    const expenseDate = props["Ngày"] && props["Ngày"].date && props["Ngày"].date.start;
    const noteParts = (props["Ghi Chú"] && props["Ghi Chú"].rich_text) || [];
    let expenseNote = "";
    for (const notePart of noteParts) {
      expenseNote += notePart.plain_text || "";
    }
    const nature = classifyExpenseNature_(
      categoryName,
      expenseName,
      expenseNote,
      !!fixedIdMap[categoryId]
    );
    const rowInfo = {
      id: expenseRow.id,
      name: expenseName,
      amount,
      date: expenseDate || "",
      note: expenseNote,
      categoryId,
      categoryName,
      accountId,
      accountName,
      nature
    };
    summary.rowsById[expenseRow.id] = rowInfo;
    summary.cashOutflowTotal += amount;

    if (nature.kind === "loan") {
      summary.loanFlow.total += amount;
      summary.loanFlow[nature.loanType] += amount;
    } else if (nature.kind === "grab") {
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
  summary.unusualSpending.rows.sort((a, b) => b.amount - a.amount);
  return summary;
}

export function buildAccountSpendingData_(
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
  const categoryNames = {};
  const categoryGroupIds = {};
  const accountNames = {};
  const globalCategoryTotals = {};
  const accountMap = {};
  const fixedIdMap = {};
  const fixedBudgets = [];
  let totalFixedBudget = 0;

  for (const categoryRow of categoryRows) {
    const props = categoryRow.properties || {};
    const title = (props["Loại Chi Phí"] && props["Loại Chi Phí"].title) || [];
    const name = title.length ? title[0].plain_text : "(chưa phân loại)";
    categoryNames[categoryRow.id] = name;
    const groupRelation = (props["Nhóm Quỹ"] && props["Nhóm Quỹ"].relation) || [];
    categoryGroupIds[categoryRow.id] = groupRelation.length ? groupRelation[0].id : "";
    if (!(props["Tính Trong 5,5 Triệu"] && props["Tính Trong 5,5 Triệu"].checkbox === true)) {
      continue;
    }
    const budget = num_(props["Ngân Sách Tháng"]);
    const fixed = {
      id: categoryRow.id,
      groupId: categoryGroupIds[categoryRow.id],
      name,
      budget,
      spent: 0,
      remaining: budget,
      over: 0,
      missingCategory: false,
      paidByAccount: {},
      accountBreakdown: []
    };
    fixedBudgets.push(fixed);
    fixedIdMap[fixed.id] = fixed;
    totalFixedBudget += fixed.budget;
  }

  for (const accountRow of accountRows) {
    const props = accountRow.properties || {};
    const title =
      (props["Phương Thức Thanh Toán"] && props["Phương Thức Thanh Toán"].title) || [];
    accountNames[accountRow.id] = title.length ? title[0].plain_text : "(chưa chọn tài khoản)";
  }

  const flowAnalysis = analyzeExpenseRows_(expenseRows, categoryNames, fixedIdMap, accountNames);
  for (const expenseRow of expenseRows) {
    const rowInfo = flowAnalysis.rowsById[expenseRow.id];
    const { amount, categoryId, accountId, categoryName, accountName } = rowInfo;
    globalCategoryTotals[categoryName] = (globalCategoryTotals[categoryName] || 0) + amount;
    if (fixedIdMap[categoryId]) {
      const fixed = fixedIdMap[categoryId];
      fixed.paidByAccount[accountName] = (fixed.paidByAccount[accountName] || 0) + amount;
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
    const account = accountMap[accountId];
    account.total += amount;
    if (rowInfo.nature.kind === "loan") {
      account.loanTotal += amount;
    } else if (rowInfo.nature.kind === "grab") {
      account.grabTotal += amount;
    } else {
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
    const category = account.categoryMap[categoryId];
    category.total += amount;
    category.rows.push({
      id: expenseRow.id,
      name: rowInfo.name,
      amount,
      date: rowInfo.date,
      nature: rowInfo.nature.kind,
      isUnusual: rowInfo.nature.isUnusual
    });
  }

  for (const fixed of fixedBudgets) {
    fixed.spent = globalCategoryTotals[fixed.name] || 0;
    fixed.remaining = Math.max(fixed.budget - fixed.spent, 0);
    fixed.over = Math.max(fixed.spent - fixed.budget, 0);
    for (const accountName in fixed.paidByAccount) {
      const amount = fixed.paidByAccount[accountName];
      if (amount > 0) fixed.accountBreakdown.push({ account: accountName, amount });
    }
    fixed.accountBreakdown.sort((a, b) => b.amount - a.amount);
    delete fixed.paidByAccount;
  }

  const accounts = [];
  for (const accountId in accountMap) {
    const account = accountMap[accountId];
    for (const categoryId in account.categoryMap) {
      const category = account.categoryMap[categoryId];
      category.rows.sort((a, b) => (
        a.date < b.date ? 1 : (a.date > b.date ? -1 : 0)
      ));
      account.categories.push(category);
    }
    account.categories.sort((a, b) => b.total - a.total);
    delete account.categoryMap;
    accounts.push(account);
  }
  accounts.sort((a, b) => b.total - a.total);

  const fundGroups = [];
  const knownGroupIds = {};
  for (const row of fundGroupRows) knownGroupIds[row.id] = true;

  for (const fundGroupRow of fundGroupRows) {
    const props = fundGroupRow.properties || {};
    const title = (props["Tên Nhóm Quỹ"] && props["Tên Nhóm Quỹ"].title) || [];
    const destinationRelation =
      (props["Tài Khoản Giữ Quỹ"] && props["Tài Khoản Giữ Quỹ"].relation) || [];
    const destinationAccountId = destinationRelation.length ? destinationRelation[0].id : "";
    const requiresAllocation = !!(
      props["Bắt Buộc Cấp Quỹ"] && props["Bắt Buộc Cấp Quỹ"].checkbox === true
    );
    const group = {
      name: title.length ? title[0].plain_text : "(nhóm quỹ chưa đặt tên)",
      budget: 0,
      spent: 0,
      over: 0,
      allocated: 0,
      paidOutsideFund: 0,
      transferNeeded: 0,
      requiresAllocation,
      unmatchedCategories: []
    };
    for (const fixed of fixedBudgets) {
      if (fixed.groupId !== fundGroupRow.id) continue;
      group.budget += fixed.budget;
      group.spent += fixed.spent;
      for (const accountBreakdown of fixed.accountBreakdown) {
        if (accountBreakdown.account !== accountNames[destinationAccountId]) {
          group.paidOutsideFund += accountBreakdown.amount;
        }
      }
    }

    let netAllocated = 0;
    for (const transferRow of transferRows) {
      const transferProps = transferRow.properties || {};
      const groupRelation =
        (transferProps["Nhóm Quỹ"] && transferProps["Nhóm Quỹ"].relation) || [];
      if (!groupRelation.length || groupRelation[0].id !== fundGroupRow.id) continue;
      const amount = num_(transferProps["Số Tiền"]);
      const toRelation =
        (transferProps["Đến Tài Khoản"] && transferProps["Đến Tài Khoản"].relation) || [];
      const fromRelation =
        (transferProps["Từ Tài Khoản"] && transferProps["Từ Tài Khoản"].relation) || [];
      const toId = toRelation.length ? toRelation[0].id : "";
      const fromId = fromRelation.length ? fromRelation[0].id : "";
      if (toId === destinationAccountId) netAllocated += amount;
      if (fromId === destinationAccountId) netAllocated -= amount;
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

  for (const fixed of fixedBudgets) {
    if (fixed.groupId && !knownGroupIds[fixed.groupId]) fixed.missingCategory = true;
    delete fixed.id;
    delete fixed.groupId;
  }

  return {
    t,
    total: flowAnalysis.cashOutflowTotal,
    cashOutflowTotal: flowAnalysis.cashOutflowTotal,
    personalSpendingTotal: flowAnalysis.personalSpendingTotal,
    loanFlow: flowAnalysis.loanFlow,
    grabFlow: flowAnalysis.grabFlow,
    unusualSpending: flowAnalysis.unusualSpending,
    accounts,
    fixedBudgets,
    unplannedTotal: flowAnalysis.unplannedTotal,
    unallocatedBudget: Math.max(monthlyLimit - totalFixedBudget, 0),
    monthlyLimit,
    fundGroups
  };
}

function expenseBudgetOverviewLines_(data, monthlyLimit, heading) {
  const spendingTotal =
    data.personalSpendingTotal == null ? data.total : data.personalSpendingTotal;
  const unusualTotal = data.unusualSpending ? data.unusualSpending.total : 0;
  const routineTotal = Math.max(spendingTotal - unusualTotal, 0);
  const lines = [
    heading,
    "Hạn mức: " + money_(monthlyLimit),
    "Đã dùng: " + money_(spendingTotal)
  ];
  if (spendingTotal > monthlyLimit) {
    lines.push("⚠️ Vượt: " + money_(spendingTotal - monthlyLimit));
  } else {
    lines.push("Còn: " + money_(monthlyLimit - spendingTotal));
  }
  lines.push("", "Trong số đã dùng:");
  lines.push("• Chi bình thường: " + money_(routineTotal));
  if (unusualTotal > 0) lines.push("⚠️ Chi bất thường: " + money_(unusualTotal));

  const hasNonBudgetFlow =
    (data.loanFlow && data.loanFlow.total > 0) ||
    (data.grabFlow && data.grabFlow.total > 0);
  if (hasNonBudgetFlow) lines.push("", "Không tính vào ngân sách 5,5 triệu:");
  if (data.loanFlow && data.loanFlow.total > 0) {
    let line = "↔️ Cho mượn/trả nợ: " + money_(data.loanFlow.total);
    const details = [];
    if (data.loanFlow.lent > 0) details.push("cho mượn " + money_(data.loanFlow.lent));
    if (data.loanFlow.repaid > 0) details.push("trả nợ " + money_(data.loanFlow.repaid));
    if (data.loanFlow.other > 0) details.push("khác " + money_(data.loanFlow.other));
    if (details.length) line += " (" + details.join("; ") + ")";
    lines.push(line);
  }
  if (data.grabFlow && data.grabFlow.total > 0) {
    let line = "🛵 Chạy Grab: " + money_(data.grabFlow.total);
    const details = [];
    if (data.grabFlow.capital > 0) details.push("nạp ví " + money_(data.grabFlow.capital));
    if (data.grabFlow.operating > 0) details.push("xăng/phí " + money_(data.grabFlow.operating));
    if (details.length) line += " (" + details.join("; ") + ")";
    lines.push(line);
  }
  return lines;
}

export function accountSpendingText_(data) {
  const lines = expenseBudgetOverviewLines_(
    data,
    data.monthlyLimit,
    "💰 Ngân sách tháng " + data.t.m + "/" + data.t.y
  );
  if (data.fundGroups && data.fundGroups.length) {
    lines.push("", "📦 Quỹ tháng này:");
    for (const group of data.fundGroups) {
      let row;
      if (group.over > 0) {
        row = "⛔ " + group.name + ": " + money_(group.spent) + " / " +
          money_(group.budget) + " | vượt, cần hoàn " + money_(group.over) + " | DỪNG CHI";
      } else if (group.transferNeeded > 0) {
        row = "⚠️ " + group.name + ": " + money_(group.spent) + " / " +
          money_(group.budget) + " | cần cấp " + money_(group.transferNeeded);
      } else {
        row = "✅ " + group.name + ": " + money_(group.spent) + " / " + money_(group.budget);
        if (group.requiresAllocation && group.allocated > 0) {
          row += " | đã cấp " + money_(group.allocated);
        }
      }
      if (group.unmatchedCategories.length) row += " | ⚠️ thiếu loại chi";
      lines.push(row);
    }
  } else {
    lines.push("", "📌 Các khoản cố định:");
    for (const fixed of data.fixedBudgets) {
      let row = "• " + fixed.name + ": " + money_(fixed.spent) + " / " + money_(fixed.budget);
      if (fixed.over > 0) row += " — vượt " + money_(fixed.over);
      else row += " — còn " + money_(fixed.remaining);
      if (fixed.missingCategory) row += " ⚠️ không tìm thấy loại chi";
      lines.push(row);
    }
  }
  lines.push("", "Chọn tài khoản để xem tiền đã chi vào đâu:");
  return lines.join("\n");
}

export function accountSpendingKeyboard_(data) {
  const rows = [];
  if (data.unusualSpending && data.unusualSpending.total > 0) {
    rows.push([{
      text: "⚠️ Khoản bất thường — " + money_(data.unusualSpending.total),
      callback_data: "show_unusual"
    }]);
  }
  for (const account of data.accounts) {
    rows.push([{
      text: "💳 " + account.name + " — tiền ra " + money_(account.total),
      callback_data: "spend_account:" + notionIdToken_(account.id, "noneacct")
    }]);
  }
  rows.push([
    { text: "🔄 Cập nhật", callback_data: "refresh_accounts" },
    { text: "📊 Báo cáo tháng", callback_data: "show_month" }
  ]);
  rows.push([{ text: "🏠 Trang chính", callback_data: "show_home" }]);
  return { inline_keyboard: rows };
}

export function unusualSpendingText_(data) {
  const unusual = data.unusualSpending || { total: 0, rows: [] };
  const lines = [
    "⚠️ Chi không thường xuyên — tháng " + data.t.m + "/" + data.t.y,
    "Tổng: " + money_(unusual.total)
  ];
  const maxRows = 20;
  for (let index = 0; index < unusual.rows.length && index < maxRows; index += 1) {
    const row = unusual.rows[index];
    const dateText = row.date && row.date.length >= 10
      ? row.date.slice(8, 10) + "/" + row.date.slice(5, 7)
      : "(không ngày)";
    lines.push("• " + dateText + " — " + row.name + ": " + money_(row.amount));
  }
  if (!unusual.rows.length) lines.push("Không có khoản nào.");
  if (unusual.rows.length > maxRows) {
    lines.push("... còn " + (unusual.rows.length - maxRows) + " giao dịch khác.");
  }
  return lines.join("\n");
}

export function unusualSpendingKeyboard_() {
  return {
    inline_keyboard: [
      [{ text: "⬅️ Dòng tiền", callback_data: "show_accounts" }],
      [{ text: "🏠 Trang chính", callback_data: "show_home" }]
    ]
  };
}

export function monthlyCashflowText_(data) {
  data = data || {};
  const t = data.t || {};
  let text = "📊 Dòng tiền tháng " + t.m + "/" + t.y;
  const unknown = data.unknownAccount || {};
  const directions = [];
  const moneyIn = unknown.moneyIn || {};
  const moneyOut = unknown.moneyOut || {};
  if ((moneyIn.count || 0) > 0 || (moneyIn.total || 0) > 0) {
    directions.push("Thu " + (moneyIn.count || 0) + " giao dịch · " + money_(moneyIn.total || 0));
  }
  if ((moneyOut.count || 0) > 0 || (moneyOut.total || 0) > 0) {
    directions.push("Chi " + (moneyOut.count || 0) + " giao dịch · " + money_(moneyOut.total || 0));
  }
  if (directions.length) {
    text += "\n\n⚠️ Chưa xác định tài khoản: " + directions.join(" | ");
  }
  return text;
}

export function cashflowCallbackData_(value) {
  value = String(value || "");
  if (!value) return null;
  return new TextEncoder().encode(value).length < 64 ? value : null;
}

export function monthlyCashflowKeyboard_(data) {
  const rows = [];
  const accounts = ((data && data.accounts) || []).slice();
  const preferredOrder = {
    "tien mat": 0,
    banking: 1,
    "grap tien mat": 2,
    momo: 3,
    "quy momo": 4
  };
  accounts.sort((a, b) => {
    let aOrder = preferredOrder[normalizeSearchText_(a.name)];
    let bOrder = preferredOrder[normalizeSearchText_(b.name)];
    if (aOrder == null) aOrder = 100;
    if (bOrder == null) bOrder = 100;
    return aOrder - bOrder;
  });
  for (const account of accounts) {
    const moneyIn = (account.moneyIn && account.moneyIn.total) || 0;
    const moneyOut = (account.moneyOut && account.moneyOut.total) || 0;
    const transfersIn = account.transfersIn || 0;
    const transfersOut = account.transfersOut || 0;
    if (!moneyIn && !moneyOut && !transfersIn && !transfersOut) continue;
    const callbackData = cashflowCallbackData_(
      account.token ? "cash_account:" + account.token : ""
    );
    if (!callbackData) continue;
    rows.push([{
      text: account.name + " · " + money_(account.currentBalance || 0),
      callback_data: callbackData
    }]);
  }
  rows.push([{ text: "🎯 Mục tiêu", callback_data: "show_goal" }]);
  rows.push([{ text: "📦 Quỹ & ngân sách", callback_data: "show_funds" }]);
  return { inline_keyboard: rows };
}

function cashflowAccountCategories_(bucket) {
  const visible = [];
  for (const category of (bucket && bucket.categories) || []) {
    if ((category.total || 0) > 0) visible.push(category);
  }
  visible.sort((a, b) => (b.total || 0) - (a.total || 0));
  return visible;
}

export function cashflowAccountText_(data, account) {
  const t = (data && data.t) || {};
  return "💳 " + account.name + " — tháng " + t.m + "/" + t.y;
}

export function cashflowAccountKeyboard_(account) {
  const rows = [];
  const directions = [
    { key: "in", bucket: account && account.moneyIn },
    { key: "out", bucket: account && account.moneyOut }
  ];
  for (const direction of directions) {
    const callbackData = cashflowCallbackData_(
      account && account.token ? "cash_direction:" + account.token + ":" + direction.key : ""
    );
    if (callbackData) {
      rows.push([{
        text: direction.key === "in"
          ? "Tổng Thu · " + money_((direction.bucket && direction.bucket.total) || 0)
          : "Tổng Chi · " + money_((direction.bucket && direction.bucket.total) || 0),
        callback_data: callbackData
      }]);
    }
  }
  rows.push([{ text: "⬅️ Các tài khoản", callback_data: "cash_home" }]);
  return { inline_keyboard: rows };
}

function cashflowUnclearTitle_(value) {
  const normalized = normalizeSearchText_(value);
  return !normalized ||
    normalized === "(khong co noi dung)" ||
    /^(khong ro|chua ro|khong biet|cha biet)$/.test(normalized);
}

export function cashflowCategoryText_(data, account, direction, category) {
  const rows = ((category && category.rows) || []).slice();
  rows.sort((a, b) => {
    const aDate = String(a.date || "");
    const bDate = String(b.date || "");
    return aDate < bDate ? 1 : (aDate > bDate ? -1 : 0);
  });
  const lines = [
    (direction === "in" ? "📥 " : "💸 ") + account.name + " → " +
      category.name + ": " + money_(category.total || 0)
  ];
  const limit = Math.min(rows.length, 30);
  for (let index = 0; index < limit; index += 1) {
    const row = rows[index];
    const date = String(row.date || "");
    const displayDate = /^\d{4}-\d{2}-\d{2}/.test(date)
      ? date.slice(8, 10) + "/" + date.slice(5, 7)
      : (date || "(không ngày)");
    const rowName = String(row.name || "") || "(không có nội dung)";
    let line = "• " + displayDate + " — " + rowName + ": " + money_(row.amount || 0);
    const note = String(row.note || "").trim();
    if (note && cashflowUnclearTitle_(row.name)) line += " · Ghi chú: " + note;
    lines.push(line);
  }
  if (rows.length > limit) lines.push("... còn " + (rows.length - limit) + " giao dịch.");
  return lines.join("\n");
}

export function cashflowCategoryKeyboard_(account, direction) {
  const rows = [];
  const directionLabel = direction === "in" ? "Tổng Thu" :
    direction === "out" ? "Tổng Chi" : "";
  const directionCallback = cashflowCallbackData_(
    account && account.token && directionLabel
      ? "cash_direction:" + account.token + ":" + direction
      : ""
  );
  if (directionCallback) {
    rows.push([{ text: "⬅️ " + directionLabel, callback_data: directionCallback }]);
  }
  rows.push([{ text: "🏠 Các tài khoản", callback_data: "cash_home" }]);
  return { inline_keyboard: rows };
}

export function parseCashflowCategoryCallback_(value) {
  const match = /^cash_cat:([A-Za-z0-9-]+):(in|out):([A-Za-z0-9-]+)$/.exec(
    String(value || "")
  );
  if (!match) return null;
  return { accountToken: match[1], direction: match[2], categoryToken: match[3] };
}

export function parseCashflowDirectionCallback_(value) {
  const match = /^cash_direction:([A-Za-z0-9-]+):(in|out)$/.exec(String(value || ""));
  if (!match) return null;
  return { accountToken: match[1], direction: match[2] };
}

export function cashflowDirectionText_(account, direction) {
  return (direction === "in" ? "📥 " : "💸 ") + account.name + " — " +
    (direction === "in" ? "Tổng Thu" : "Tổng Chi");
}

export function cashflowDirectionKeyboard_(account, direction) {
  const rows = [];
  const bucket = direction === "in" ? account && account.moneyIn : account && account.moneyOut;
  for (const category of cashflowAccountCategories_(bucket)) {
    const callbackData = cashflowCallbackData_(
      account && account.token && category.token
        ? "cash_cat:" + account.token + ":" + direction + ":" + category.token
        : ""
    );
    if (!callbackData) continue;
    rows.push([{
      text: category.name + " · " + money_(category.total),
      callback_data: callbackData
    }]);
  }
  const accountCallback = cashflowCallbackData_(
    account && account.token ? "cash_account:" + account.token : ""
  );
  if (accountCallback) {
    rows.push([{ text: "⬅️ " + account.name, callback_data: accountCallback }]);
  }
  rows.push([{ text: "🏠 Các tài khoản", callback_data: "cash_home" }]);
  return { inline_keyboard: rows };
}
