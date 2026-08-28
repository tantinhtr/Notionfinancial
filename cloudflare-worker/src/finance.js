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
  if (status.daysLeftIncludingToday > 0) {
    lines.push(
      "🔥 Còn " + status.daysLeftIncludingToday +
      " ngày (tính cả hôm nay) → mỗi ngày cần: " +
      money_(status.requiredPerDay)
    );
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
    // Sua xe deo nhan Grap nhung khong phai von chay xe — tach ra de bao cao rieng.
    const isRepair = [
      "sua xe", "thay nhot", "va banh", "va 1 lo", "va xe",
      "thay ruot", "bom xe", "thay lop"
    ].some((keyword) => normalizedName.indexOf(keyword) >= 0);
    return {
      kind: "grab",
      grabType: isRepair ? "repair" : (isCapital ? "capital" : "operating"),
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
    grabFlow: { total: 0, capital: 0, operating: 0, repair: 0 },
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

function plainText_(property) {
  const parts = (property && (property.title || property.rich_text)) || [];
  return parts.map((part) => part.plain_text || "").join("");
}

function stripFundPrefix_(name) {
  return String(name || "").toLowerCase().replace(/\s+/g, " ").replace(/^qu\S*\s+/, "").trim();
}

// Anh ghi chu bang tay theo quy uoc "( lay tu quy X )" / "( tinh vao quy X )".
// Uu tien doc phan trong ngoac, roi moi den ca cau. Chi nhan khi sau dong tu la
// mot chu bat dau bang "qu", nho vay loi go "quxy sua xe" van ve "quy sua xe",
// con "Tuan muon tien thi bang lai xe" khong de ra mot quy ma.
function fundMentionedAfter_(expenseRow, verbPattern, requireFundWord = true) {
  const props = expenseRow.properties || {};
  const text = plainText_(props["Nội Dung Khoản Chi"]) + " | " + plainText_(props["Ghi Chú"]);
  const candidates = [];
  const paren = /\(([^)]*)\)/g;
  let found;
  while ((found = paren.exec(text)) !== null) candidates.push(found[1]);
  candidates.push(text);
  for (const candidate of candidates) {
    const match = candidate.match(verbPattern);
    if (!match) continue;
    const cleaned = match[1].replace(/[()]/g, " ").replace(/\s+/g, " ").trim();
    const hasFundWord = /^qu\S*\s+/i.test(cleaned);
    if (requireFundWord && !hasFundWord) continue;
    const name = (hasFundWord ? cleaned.replace(/^qu\S*\s+/i, "") : cleaned)
      .trim().slice(0, 60);
    if (name !== "") return "quỹ " + name;
  }
  return "";
}

// "lay tu / muon quy X" — khoan nay tieu tien cua quy X, sinh ra mon no voi quy do.
function borrowedFrom_(expenseRow) {
  return fundMentionedAfter_(expenseRow, /(?:lấy\s+từ|mượn(?:\s+từ)?)\s+(.+)$/i);
}

// Khoan nay thuoc ngan sach nhom nao. Uu tien cum "tinh vao quy X"; neu khong co
// thi chi can tieu de/ghi chu NHAC TOI ten mot nhom quy co that la du — anh viet tat
// kieu "( phat sinh )" van phai an. Khong nhan khi ten do chinh la ben cho muon
// ("lay tu quy X"), vi do la nguon tien chu khong phai ngan sach.
// Ten nhom quy chi tinh la duoc nhac toi khi no DI SAU chu "quy" va KET THUC tron
// ven. Thieu hai dieu kien do thi "Gửi xe đi chợ" bi keo vao nhom Đi Chợ, va
// "( lấy từ quỹ đi chơi với em )" cung bi cat thanh "quỹ đi chợ".
function mentionsFund_(normalizedText, key) {
  const needle = normalizeSearchText_(key);
  if (needle === "") return false;
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp("qu\\S*\\s+" + escaped + "(?![a-z0-9])").test(normalizedText);
}

// Ghi chu co the goi ten LO ("quỹ nhu cầu thiết yếu") hoac ten NHAN CON
// ("quỹ phát sinh"). Ca hai deu hop le: nhan con thuoc lo nao thi khoan do ve lo do,
// va con duoc ghi dung vao dong con — nho vay bao cao khong mat chi tiet.
function assignedFund_(expenseRow, assignmentKeys) {
  // "tinh vao X" khong bat buoc phai co chu "quỹ": X da duoc doi chieu voi danh sach
  // ten co that ngay duoi, ten bia ra thi khong khop nen khong can canh gac do nua.
  // Viet "( tính vào phát triển bản thân )" phai an nhu "( tính vào quỹ phát sinh )".
  const explicit = stripFundPrefix_(
    fundMentionedAfter_(expenseRow, /tính\s+vào\s+(.+)$/i, false)
  );
  if (explicit !== "") {
    if (assignmentKeys[explicit]) return explicit;
    // Ghi chu con chu thua phia sau ("tính vào phát sinh nhé") thi lay ten dai nhat
    // ma cau do bat dau bang.
    const normalized = normalizeSearchText_(explicit);
    let matched = "";
    for (const key of Object.keys(assignmentKeys)) {
      const candidate = normalizeSearchText_(key);
      if (candidate === "" || !normalized.startsWith(candidate + " ")) continue;
      if (candidate.length > matched.length) matched = key;
    }
    if (matched !== "") return matched;
  }
  const props = expenseRow.properties || {};
  const text = normalizeSearchText_(
    plainText_(props["Nội Dung Khoản Chi"]) + " " + plainText_(props["Ghi Chú"])
  );
  const lenderKey = stripFundPrefix_(borrowedFrom_(expenseRow));
  let best = "";
  for (const key of Object.keys(assignmentKeys)) {
    if (key === "" || key === lenderKey) continue;
    if (!mentionsFund_(text, key)) continue;
    if (key.length > best.length) best = key;
  }
  return best;
}

function buildMonthlyBudget_(tiers, monthlyLimit) {
  const total = tiers.groupSpending + tiers.looseSpending;
  return {
    limit: monthlyLimit,
    groupSpending: tiers.groupSpending,
    looseSpending: tiers.looseSpending,
    looseByCategory: Object.keys(tiers.looseByCategory)
      .map((category) => ({ category, amount: tiers.looseByCategory[category] }))
      .sort((a, b) => b.amount - a.amount),
    total,
    over: Math.max(total - monthlyLimit, 0),
    remaining: Math.max(monthlyLimit - total, 0)
  };
}

function attachThreshold_(excluded, outsideThreshold) {
  excluded.threshold = outsideThreshold;
  return excluded;
}

// Giao dich le ngoai nhom quy tu nguong tro len: khong tinh la chi tieu cua thang,
// chi liet ke ra de anh tu quyet.
function buildExcluded_(tiers) {
  const rows = tiers.outsideLargeRows.slice().sort((a, b) => b.amount - a.amount);
  return { rows, total: rows.reduce((sum, row) => sum + row.amount, 0) };
}

// Thu nhap that chi la bang Bao Cao Thu Nhap. Bang Khoan Thu Khac la tien chay qua:
// doanh thu gop Grab (doi ung voi chi phi nap vi/xang) va tien muon/tra/thu ho.
function buildIncomeSplit_(incomeRows, otherIncomeRows) {
  const sum = (rows) => (rows || []).reduce(
    (total, row) => total + num_((row.properties || {})["Số Tiền"]),
    0
  );
  let grabGross = 0;
  let other = 0;
  for (const row of otherIncomeRows || []) {
    const props = row.properties || {};
    const name = normalizeSearchText_(plainText_(props["Tên Khoản Thu"]));
    const amount = num_(props["Số Tiền"]);
    if (name.indexOf("grap") >= 0 || name.indexOf("grab") >= 0) grabGross += amount;
    else other += amount;
  }
  return { real: sum(incomeRows), grabGross, other };
}

export function buildAccountSpendingData_(
  t,
  categoryRows,
  expenseRows,
  accountRows,
  monthlyLimit,
  transferRows,
  fundGroupRows,
  options
) {
  transferRows = transferRows || [];
  fundGroupRows = fundGroupRows || [];
  options = options || {};
  const fundingSourceKeys = {};
  for (const name of options.fundingSourceAccounts || []) {
    fundingSourceKeys[normalizeSearchText_(name)] = true;
  }
  const isFundingSource = (accountName) =>
    fundingSourceKeys[normalizeSearchText_(accountName)] === true;
  const passThroughNeedles = (options.passThroughKeywords || [])
    .map((word) => normalizeSearchText_(word))
    .filter((word) => word !== "");
  const isPassThrough = (text) => {
    if (!passThroughNeedles.length) return false;
    const haystack = normalizeSearchText_(text);
    return passThroughNeedles.some((needle) => haystack.indexOf(needle) >= 0);
  };
  const outsideThreshold = Number.isFinite(options.outsideThreshold)
    ? options.outsideThreshold
    : 500000;
  const categoryNames = {};
  const categoryGroupIds = {};
  const fundGroupIdByName = {};
  const pendingAliases = [];
  const extraRowsByGroupId = {};
  // Doi ten lo thi ghi chu cu ("lấy từ quỹ thiết yếu") van phai khop. Cot "Tên Cũ"
  // trong Notion liet ke cac ten cu, cach nhau bang dau phay.
  const groupAliasKeys = {};
  for (const fundGroupRow of fundGroupRows) {
    const props = fundGroupRow.properties || {};
    const title = (props["Tên Nhóm Quỹ"] && props["Tên Nhóm Quỹ"].title) || [];
    if (!title.length) continue;
    const realKey = stripFundPrefix_(title[0].plain_text);
    fundGroupIdByName[realKey] = fundGroupRow.id;
    groupAliasKeys[fundGroupRow.id] = { [realKey]: true };
    for (const alias of plainText_(props["Tên Cũ"]).split(",")) {
      const key = stripFundPrefix_(alias);
      if (key === "") continue;
      groupAliasKeys[fundGroupRow.id][key] = true;
      pendingAliases.push({ key, groupId: fundGroupRow.id });
    }
  }
  const groupNameKeys = Object.keys(fundGroupIdByName);
  const groupIdSet = {};
  for (const key of groupNameKeys) groupIdSet[fundGroupIdByName[key]] = true;
  // Ten goi duoc phep viet trong ghi chu: ten lo -> ca lo, ten nhan con -> dung nhan do.
  const assignmentKeys = {};
  for (const key of groupNameKeys) {
    assignmentKeys[key] = { groupId: fundGroupIdByName[key], categoryId: "" };
  }
  const tiers = {
    groupSpending: 0,
    looseSpending: 0,
    looseByCategory: {},
    outsideLargeRows: []
  };
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
    // Nhan con tick "Chi Thang Khong Qua Quy" thi khong bao gio can bom truoc vao
    // tai khoan giu quy — vi du Đi Chợ tra thang bang tien mat. Notion tra ve false
    // cho o chua tick, nen phai hoi nguoc kieu nay: mac dinh la VAN theo co cua lo.
    const skipsFund = !!(props["Chi Thẳng Không Qua Quỹ"] &&
      props["Chi Thẳng Không Qua Quỹ"].checkbox === true);
    const fixed = {
      id: categoryRow.id,
      groupId: categoryGroupIds[categoryRow.id],
      name,
      budget,
      skipsFund,
      spent: 0,
      remaining: budget,
      over: 0,
      missingCategory: false,
      paidByAccount: {},
      accountBreakdown: [],
      spendRows: []
    };
    fixedBudgets.push(fixed);
    fixedIdMap[fixed.id] = fixed;
    totalFixedBudget += fixed.budget;
    const childKey = stripFundPrefix_(name);
    // Ten lo uu tien hon: neu trung ten thi giu nghia "ca lo".
    if (childKey !== "" && !assignmentKeys[childKey]) {
      assignmentKeys[childKey] = { groupId: fixed.groupId, categoryId: fixed.id };
    }
  }

  // Ten cu cua lo chi duoc dung khi khong dung ten nhan con nao. Vi du doi ten
  // "Phát Sinh" tu lo thanh nhan con: ghi chu "quỹ phát sinh" phai ve dung nhan do,
  // khong duoc ve chung ca lo.
  for (const alias of pendingAliases) {
    if (!assignmentKeys[alias.key]) {
      assignmentKeys[alias.key] = { groupId: alias.groupId, categoryId: "" };
    }
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
    const lender = borrowedFrom_(expenseRow);
    const assignedName = assignedFund_(expenseRow, assignmentKeys);
    const assigned = assignedName === "" ? null : assignmentKeys[assignedName];
    const assignedGroupId = assigned ? assigned.groupId : "";
    const assignedCategoryId = assigned ? assigned.categoryId : "";
    // Ghi chu keu tinh vao cho khac thi khoan nay ROI KHOI nhan cua no hoan toan:
    // khong cong vao tong cua loai chi do nua, chi tinh cho noi duoc chi dinh.
    const movedAway = assignedCategoryId !== ""
      ? assignedCategoryId !== categoryId
      : (assignedGroupId !== "" && categoryGroupIds[categoryId] !== assignedGroupId);
    const spendRow = {
      account: accountName,
      amount,
      lender,
      name: rowInfo.name,
      date: rowInfo.date
    };
    if (movedAway && assignedCategoryId !== "" && fixedIdMap[assignedCategoryId]) {
      // Ghi chu goi ten mot nhan con co that -> khoan nay chinh la chi tieu cua nhan do.
      const target = fixedIdMap[assignedCategoryId];
      globalCategoryTotals[target.name] = (globalCategoryTotals[target.name] || 0) + amount;
      target.paidByAccount[accountName] = (target.paidByAccount[accountName] || 0) + amount;
      target.spendRows.push(spendRow);
    } else if (movedAway) {
      if (!extraRowsByGroupId[assignedGroupId]) extraRowsByGroupId[assignedGroupId] = [];
      extraRowsByGroupId[assignedGroupId].push(spendRow);
    } else {
      globalCategoryTotals[categoryName] = (globalCategoryTotals[categoryName] || 0) + amount;
      if (fixedIdMap[categoryId]) {
        const fixed = fixedIdMap[categoryId];
        fixed.paidByAccount[accountName] = (fixed.paidByAccount[accountName] || 0) + amount;
        fixed.spendRows.push(spendRow);
      }
    }

    // Hai nhom duy nhat: trong nhom quy va ngoai nhom quy.
    // Khoan trong nhom quy luon tinh, du to nho. Khoan ngoai nhom quy bi loai khi
    // tung giao dich tu nguong tro len, HOAC khi ghi chu noi ro do la tien ung code
    // mua ho khach — thu do se duoc hoan lai nen khong phai chi tieu, du to hay nho.
    const ownGroupId = fixedIdMap[categoryId] && groupIdSet[categoryGroupIds[categoryId]]
      ? categoryGroupIds[categoryId]
      : "";
    if (ownGroupId !== "" || assignedGroupId !== "") {
      tiers.groupSpending += amount;
    } else if (
      amount >= outsideThreshold ||
      isPassThrough(rowInfo.name + " " + rowInfo.note)
    ) {
      tiers.outsideLargeRows.push({
        name: rowInfo.name,
        amount,
        date: rowInfo.date,
        account: accountName,
        category: categoryName
      });
    } else {
      tiers.looseSpending += amount;
      tiers.looseByCategory[categoryName] =
        (tiers.looseByCategory[categoryName] || 0) + amount;
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
      destinationAccount: accountNames[destinationAccountId] || "",
      budget: 0,
      spent: 0,
      over: 0,
      allocated: 0,
      paidFromFund: 0,
      paidOutsideFund: 0,
      fundBalance: 0,
      fundRemaining: 0,
      fundDebt: 0,
      borrowedFunds: [],
      advances: [],
      children: [],
      transferNeeded: 0,
      requiresAllocation,
      unmatchedCategories: []
    };
    const advanceByAccount = {};
    const borrowByFund = {};
    const ownKeys = groupAliasKeys[fundGroupRow.id] || {};
    const addDebtRow = (bucket, key, spendRow, amount, partial) => {
      if (!bucket[key]) bucket[key] = { amount: 0, rows: [] };
      bucket[key].amount += amount;
      bucket[key].rows.push({
        name: spendRow.name,
        amount,
        date: spendRow.date,
        partial: partial === true
      });
    };

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

    const groupRows = [];
    let unfundedBudget = 0;
    let unfundedSpent = 0;
    for (const fixed of fixedBudgets) {
      if (fixed.groupId !== fundGroupRow.id) continue;
      group.budget += fixed.budget;
      group.spent += fixed.spent;
      group.children.push({
        name: fixed.name,
        budget: fixed.budget,
        spent: fixed.spent,
        over: Math.max(fixed.spent - fixed.budget, 0)
      });
      // Chi nhung nhan con thuc su phai di qua tai khoan giu quy moi tinh vao so
      // can cap them. Đi Chợ tra thang bang tien mat thi khong doi bom truoc.
      if (fixed.skipsFund) {
        unfundedBudget += fixed.budget;
        unfundedSpent += fixed.spent;
      }
      for (const spendRow of fixed.spendRows) groupRows.push(spendRow);
    }
    // Khoan chi duoc ghi chu "tinh vao quy X" keo vao day, du Loai Chi Phi khac.
    for (const extraRow of extraRowsByGroupId[fundGroupRow.id] || []) {
      group.spent += extraRow.amount;
      groupRows.push(extraRow);
    }
    groupRows.sort((a, b) => (a.date < b.date ? -1 : (a.date > b.date ? 1 : 0)));

    // Luot 1: xep moi khoan chi vao dung nguon tien da tra no.
    const paidOutsideRows = [];
    for (const spendRow of groupRows) {
      // Ghi chu chi ro muon quy nao thi do la tien cua tui khac, phai tra du
      // ke ca khi con trong han muc. Ghi chu tro ve chinh nhom thi khong phai muon.
      const lender = spendRow.lender !== "" && ownKeys[stripFundPrefix_(spendRow.lender)] !== true
        ? spendRow.lender
        : "";
      if (lender !== "") {
        addDebtRow(borrowByFund, lender, spendRow, spendRow.amount, false);
      } else if (spendRow.account === accountNames[destinationAccountId]) {
        group.paidFromFund += spendRow.amount;
      } else if (isFundingSource(spendRow.account)) {
        // Momo va Grap Tien Mat la NGUON cap quy. Chi thang bang chung thi coi nhu
        // da cap cho nhom roi, khong ai phai tra lai ai — chi la bo qua buoc chuyen.
        group.paidOutsideFund += spendRow.amount;
      } else {
        group.paidOutsideFund += spendRow.amount;
        paidOutsideRows.push(spendRow);
      }
    }

    // Luot 2: con lai la tai khoan KHONG phai nguon cap quy da bo tien ra ho —
    // tien cua tui khac, phai tra lai, khong phu thuoc quy da co tien hay chua.
    for (const spendRow of paidOutsideRows) {
      addDebtRow(advanceByAccount, spendRow.account, spendRow, spendRow.amount, false);
    }

    group.allocated = Math.max(netAllocated, 0);
    group.over = Math.max(group.spent - group.budget, 0);
    // Tiền của nhóm còn nằm thật trong tài khoản giữ quỹ: đã cấp trừ phần đã chi từ
    // chính tài khoản đó. Âm nghĩa là quỹ đã ứng tiền của nhóm khác để chi hộ.
    group.fundBalance = netAllocated - group.paidFromFund;
    // Hai khoản này khác bản chất, không được cộng chung:
    //   fundDebt      — quỹ đã ứng tiền chi hộ, phải TRẢ LẠI. Tiền đã tiêu rồi.
    //   transferNeeded— phần ngân sách CHƯA tiêu, phải CẤP vào quỹ trước khi chi.
    // Đã ứng trước rồi thì thôi không cần cấp nữa, nên transferNeeded chỉ tính
    // trên số dư dương của quỹ.
    if (requiresAllocation) {
      group.fundDebt = Math.max(-group.fundBalance, 0);
      const bucketToList = (bucket, key) => Object.keys(bucket)
        .map((name) => ({
          [key]: name,
          amount: bucket[name].amount,
          rows: bucket[name].rows.slice().sort((a, b) => (a.date < b.date ? -1 : 1))
        }))
        .filter((entry) => entry.amount > 0)
        .sort((a, b) => b.amount - a.amount);
      group.borrowedFunds = bucketToList(borrowByFund, "fund");
      group.advances = bucketToList(advanceByAccount, "account");
      // So du quy con RANH: tru di phan da hen tra lai cho cac tai khoan da ung.
      // Khong tru thi bot vua khoe "quy con X" vua doi tra dung X o muc UNG TRUOC.
      const advancesTotal = group.advances.reduce((sum, entry) => sum + entry.amount, 0);
      group.fundRemaining = Math.max(group.fundBalance - advancesTotal, 0);
      // Tien tieu bang tui khac CUNG COI NHU DA CAP: dang le no phai di qua quy,
      // chi la chua co giao dich chuyen thoi. Viec tra lai cho ben da ung nam o muc
      // UNG TRUOC, khong phai cap lai lan hai. Nen can cap them chi con la phan
      // ngan sach chua dung toi, tru di so quy dang giu.
      const remainingBudget = Math.max(
        (group.budget - unfundedBudget) - (group.spent - unfundedSpent),
        0
      );
      group.transferNeeded = Math.max(
        remainingBudget - Math.max(group.fundBalance, 0),
        0
      );
    }
    group.children.sort((a, b) => b.budget - a.budget);
    // Lo chua dung toi — chua dat ngan sach, chua tieu, chua cap — thi khong in.
    // Nho vay dung du 6 lo trong Notion ma bao cao van chi noi nhung lo dang chay.
    if (group.budget === 0 && group.spent === 0 && group.allocated === 0) continue;
    fundGroups.push(group);
  }

  for (const fixed of fixedBudgets) {
    if (fixed.groupId && !knownGroupIds[fixed.groupId]) fixed.missingCategory = true;
    delete fixed.id;
    delete fixed.groupId;
    delete fixed.spendRows;
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
    fundGroups,
    monthlyBudget: buildMonthlyBudget_(tiers, monthlyLimit),
    excluded: attachThreshold_(buildExcluded_(tiers), outsideThreshold),
    income: buildIncomeSplit_(options.incomeRows, options.otherIncomeRows)
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
  rows.push([{ text: "📊 Báo cáo tháng", callback_data: "show_month" }]);
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

function budgetLine_(group) {
  const over = group.over || 0;
  let row = (over > 0 ? "⛔ " : "✅ ") + group.name + ": " +
    money_(group.spent) + " / " + money_(group.budget);
  if (over > 0) {
    row += " · vượt " + money_(over);
  } else if (group.requiresAllocation) {
    // Nhóm có quỹ riêng thì "còn" phải là TIỀN THẬT đang nằm trong tài khoản giữ
    // quỹ, không phải ngân sách trừ đã tiêu. Phần ngân sách chưa cấp vào quỹ thì
    // chưa phải tiền của nhóm — nó nằm ở mục CẦN CẤP THÊM cho tới khi được cấp.
    const held = group.fundRemaining || 0;
    if (held > 0) row += " · quỹ còn " + money_(held);
  } else {
    row += " · còn " + money_(Math.max((group.budget || 0) - (group.spent || 0), 0));
  }
  if (group.unmatchedCategories && group.unmatchedCategories.length) {
    row += " · ⚠️ thiếu loại chi";
  }
  return row;
}

// Lo la ten lon, nhan Notion la con cua lo. Lo nao co nhieu hon mot nhan thi in
// them dong con, khong thi dong tong da noi du roi.
function childLines_(group) {
  const children = group.children || [];
  if (children.length < 2) return [];
  return children.map((child) => "   • " + child.name + ": " +
    money_(child.spent) + " / " + money_(child.budget) +
    (child.over > 0 ? " ⛔ vượt " + money_(child.over) : ""));
}

const DEBT_ROWS_SHOWN = 6;

function collectDebts_(groups) {
  const debts = [];
  for (const group of groups) {
    const account = group.destinationAccount || "Tài khoản giữ quỹ";
    for (const borrowed of group.borrowedFunds || []) {
      debts.push({
        group: group.name,
        account: borrowed.fund,
        amount: borrowed.amount,
        rows: borrowed.rows || []
      });
    }
    if ((group.fundDebt || 0) > 0) {
      // Day la phan hut so du cua quy, khong gan voi giao dich cu the nao.
      debts.push({ group: group.name, account, amount: group.fundDebt, rows: [] });
    }
    for (const advance of group.advances || []) {
      debts.push({
        group: group.name,
        account: advance.account,
        amount: advance.amount,
        rows: advance.rows || []
      });
    }
  }
  return debts;
}

// Bo phan chu thich quy trong ngoac khoi ten hien thi: dong tren da noi ro nhom
// va ben cho muon roi, giu lai chi ton cho. Ngoac khong nhac quy — vi du
// "( mua do cho em )" — la ngu canh that, phai giu.
function displayName_(name) {
  return String(name || "")
    .replace(/\([^)]*\)/g, (chunk) => (/(^|\s)qu\S+/i.test(chunk) ? " " : chunk))
    .replace(/\s+/g, " ")
    .trim();
}

function debtRowLines_(rows) {
  const lines = [];
  for (const row of rows.slice(0, DEBT_ROWS_SHOWN)) {
    const day = typeof row.date === "string" && row.date.length >= 10
      ? row.date.slice(8, 10) + "/" + row.date.slice(5, 7) + " "
      : "";
    const name = displayName_(row.name).slice(0, 42);
    lines.push(
      "    " + day + name + ": " + money_(row.amount) + (row.partial ? " (một phần)" : "")
    );
  }
  const hidden = rows.length - DEBT_ROWS_SHOWN;
  if (hidden > 0) lines.push("    … và " + hidden + " khoản nữa");
  return lines;
}

const LOOSE_CATEGORIES_SHOWN = 12;

// Tien DI VAO nhom quy: da cap bao nhieu, con lai bao nhieu trong tai khoan giu quy.
function fundInflowLine_(group) {
  if (!group.requiresAllocation) return "";
  // "Quy con" da nam o dong tren roi, day chi noi da bom vao bao nhieu.
  const allocated = group.allocated || 0;
  return "   ↳ " + (allocated > 0
    ? "đã cấp " + money_(allocated) + " / " + money_(group.budget || 0)
    : "chưa cấp");
}

function budgetHeadline_(budget, groups) {
  const spent = (groups || []).reduce((sum, group) => sum + (group.spent || 0), 0);
  const planned = (groups || []).reduce((sum, group) => sum + (group.budget || 0), 0);
  const diff = planned - spent;
  const mark = diff < 0 ? "⛔ vượt " + money_(-diff) : "✅ còn " + money_(diff);
  return "📊 NHÓM QUỸ — " + money_(spent) + " / " + money_(planned) + " · " + mark;
}

export function fundBudgetText_(data) {
  data = data || {};
  const t = data.t || {};
  const groups = data.fundGroups || [];
  const lines = ["📦 QUỸ & NGÂN SÁCH — tháng " + t.m + "/" + t.y];

  if (data.income && data.income.real > 0) {
    lines.push("", "💵 Thu nhập thật: " + money_(data.income.real));
  }

  const budget = data.monthlyBudget;
  if (groups.length) {
    lines.push("", budgetHeadline_(budget || { total: 0, limit: 0 }, groups));
    for (const group of groups) {
      lines.push(budgetLine_(group));
      for (const childLine of childLines_(group)) lines.push(childLine);
      const inflow = fundInflowLine_(group);
      if (inflow !== "") lines.push(inflow);
    }
    const allocated = groups.reduce((sum, group) => sum + (group.allocated || 0), 0);
    const held = groups.reduce(
      (sum, group) => sum + Math.max(group.fundRemaining || 0, 0),
      0
    );
    // Khong so voi tong ngan sach: phan da tieu roi thi cap vao lam gi nua. Chi noi
    // da bom bao nhieu va quy con giu bao nhieu; so can cap nam o muc CAN CAP THEM.
    if (allocated > 0 || held > 0) {
      lines.push(
        "💵 Đã cấp vào quỹ: " + money_(allocated) + " · quỹ đang giữ: " + money_(held)
      );
    }
  }

  if (budget && budget.looseByCategory.length) {
    lines.push("", "🧾 NGOÀI NHÓM QUỸ — " + money_(budget.looseSpending));
    for (const entry of budget.looseByCategory.slice(0, LOOSE_CATEGORIES_SHOWN)) {
      lines.push("• " + entry.category + ": " + money_(entry.amount));
    }
    const hidden = budget.looseByCategory.length - LOOSE_CATEGORIES_SHOWN;
    if (hidden > 0) lines.push("• … và " + hidden + " loại nữa");
  }

  if (budget) {
    lines.push("", "💰 TỔNG CHI TIÊU: " + money_(budget.total));
    // Tien nay van ra khoi vi that, chi la khong phai chi tieu ca nhan. Van phai
    // nhin thay so, nhung khong liet ke tung khoan cho do dai bao cao.
    const excluded = data.excluded;
    if (excluded && excluded.total > 0) {
      lines.push(
        "🚫 Không tính: " + money_(excluded.total) +
        " · " + excluded.rows.length + " khoản (ứng code, giao dịch lẻ ≥500k)"
      );
    }
  }

  const debts = collectDebts_(groups);
  if (debts.length) {
    lines.push("", "💸 ỨNG TRƯỚC — cần trả lại");
    let total = 0;
    for (const debt of debts) {
      total += debt.amount;
      lines.push("• " + debt.group + " → " + debt.account + ": " + money_(debt.amount));
      for (const line of debtRowLines_(debt.rows || [])) lines.push(line);
    }
    lines.push("Tổng: " + money_(total));
  }

  const funding = groups.filter((group) => (group.transferNeeded || 0) > 0);
  if (funding.length) {
    lines.push("", "💰 CẦN CẤP THÊM");
    for (const group of funding) {
      lines.push(
        "• " + group.name + " → " + (group.destinationAccount || "Tài khoản giữ quỹ") +
        ": " + money_(group.transferNeeded)
      );
    }
  }

  if (!groups.length && !budget) {
    lines.push("", "Chưa có dữ liệu tháng này.");
  }
  return lines.join("\n");
}

export function fundBudgetKeyboard_() {
  return {
    inline_keyboard: [
      [{ text: "⬅️ Dòng tiền", callback_data: "cash_home" }]
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
