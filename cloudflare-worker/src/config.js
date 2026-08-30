const STABLE_IDS = Object.freeze({
  incomeDb: "1178ffb5-256b-81a1-8052-c91e72fb0eb6",
  goalDb: "1178ffb5-256b-815e-9f66-e18a90b48950",
  expenseDb: "1178ffb5-256b-8138-b644-c4695753b4ea",
  budgetDb: "1178ffb5-256b-81b5-ab95-d5f15bc3c9f1",
  accountDb: "1178ffb5-256b-8175-9c74-cc19002c06fa",
  transferDb: "1178ffb5-256b-81cf-ae08-eb24b25d56dc",
  fundGroupDb: "c6dffa2b-d0b3-46a1-8200-12bbb0c66402",
  otherIncomeDb: "1358ffb5-256b-8088-98b8-e613306c995d",
  otherIncomeCategoryDb: "1348ffb5-256b-80c1-ae97-c0115a1baf83",
  goalRelationPageId: "39c8ffb5-256b-806f-a710-e022aabf703d",
  walletIncomeRelationPageId: "3a08ffb5-256b-80a7-a68a-dc37d6dff53f"
});

const REQUIRED_STRING_BINDINGS = [
  "TELEGRAM_TOKEN",
  "NOTION_TOKEN",
  "WEBHOOK_SECRET"
];

export function getConfig(env) {
  for (const name of REQUIRED_STRING_BINDINGS) {
    if (typeof env?.[name] !== "string" || env[name].trim() === "") {
      throw new Error(`Missing required binding: ${name}`);
    }
  }

  if (typeof env?.ALLOWED_USER_ID !== "string" || env.ALLOWED_USER_ID.trim() === "") {
    throw new Error("Missing required binding: ALLOWED_USER_ID");
  }
  const allowedUserId = Number(env.ALLOWED_USER_ID);
  if (!Number.isFinite(allowedUserId)) {
    throw new Error("ALLOWED_USER_ID must be a finite number");
  }

  if (env?.BOT_STATE === undefined || env.BOT_STATE === null) {
    throw new Error("Missing required binding: BOT_STATE");
  }
  if (env?.UPDATE_COORDINATOR === undefined || env.UPDATE_COORDINATOR === null) {
    throw new Error("Missing required binding: UPDATE_COORDINATOR");
  }

  return {
    telegramToken: env.TELEGRAM_TOKEN,
    notionToken: env.NOTION_TOKEN,
    webhookSecret: env.WEBHOOK_SECRET,
    allowedUserId,
    botState: env.BOT_STATE,
    updateCoordinator: env.UPDATE_COORDINATOR,
    notionVersion: "2022-06-28",
    monthlyExpenseLimit: 5500000,
    // Giao dich le ngoai nhom quy tu muc nay tro len khong tinh vao tran 5tr5:
    // no la khoan bat thuong, khong phai chi tieu dinh ky cua thang.
    outsideBudgetThreshold: 500000,
    // Giao dich nhac toi mot trong may tu nay la tien di roi quay ve, khong phai chi
    // tieu: ung tien mua ho khach roi duoc hoan lai. Loai du to hay nho.
    // Khong dung tu "ung" tran: "1 vi trung ga" cung khop.
    //
    // Nap vi Grab CO tinh la chi tieu: do la tien that su ra khoi vi de chay xe.
    // Bao cao nay do dong tien di ra, khong phai tinh lai lo, nen khong tru no di.
    passThroughKeywords: ["code"],
    // Nhan nay khong bao gio la chi tieu: cho muon roi doi lai, hoac tra no cu.
    // Tien di roi ve, khong phai tieu mat.
    passThroughCategories: ["Vay Và Trả"],
    // Quy con nam trong Quy Momo ma tien LA cua thang nay. Tieu tui nay la chi tieu
    // that. Cac tui khac (tich luy, di choi voi em, mua may tinh cho chau) la tien
    // de danh tu truoc, tieu chung khong phai chi tieu cua thang nay.
    spendableSubFunds: ["sửa xe"],
    timezone: "Asia/Ho_Chi_Minh",
    ...STABLE_IDS
  };
}
