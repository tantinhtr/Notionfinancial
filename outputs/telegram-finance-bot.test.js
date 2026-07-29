const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const scriptPath = path.join(__dirname, 'telegram-finance-bot-fixed.js');

function loadBot(overrides = {}) {
  const values = new Map([
    ['TELEGRAM_TOKEN', 'test-token'],
    ['ALLOWED_USER_ID', '42'],
    ['NOTION_TOKEN', 'test-notion-token'],
  ]);
  const scriptProperties = {
    getProperty(key) { return values.has(key) ? values.get(key) : null; },
    setProperty(key, value) { values.set(key, String(value)); },
  };
  const response = overrides.response || {
    getResponseCode() { return 200; },
    getContentText() { return JSON.stringify({ ok: true }); },
  };
  const requests = [];
  const sandbox = {
    CacheService: {
      getScriptCache() {
        return { get() { return null; }, put() {}, remove() {} };
      },
    },
    ContentService: {
      MimeType: { TEXT: 'text/plain' },
      createTextOutput(text) {
        return { text, setMimeType() { return this; } };
      },
    },
    LockService: {
      getScriptLock() { return { waitLock() {}, tryLock() { return true; }, releaseLock() {} }; },
    },
    Logger: { log() {} },
    PropertiesService: { getScriptProperties() { return scriptProperties; } },
    ScriptApp: { getService() { return { getUrl() { return 'https://example.test/exec'; } }; } },
    Utilities: {
      formatDate() { return '2026-07-19'; },
      formatString(format, ...args) {
        let index = 0;
        return format.replace(/%0?(\d*)d/g, (_match, width) => {
          return String(args[index++]).padStart(Number(width) || 0, '0');
        });
      },
      sleep() {},
    },
    UrlFetchApp: {
      fetch(url, options) {
        requests.push({ url, options });
        return overrides.fetch ? overrides.fetch(url, options) : response;
      },
      fetchAll(requestsToFetch) {
        return overrides.fetchAll ? overrides.fetchAll(requestsToFetch) : [];
      },
    },
    console,
  };

  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(scriptPath, 'utf8'), sandbox, { filename: scriptPath });
  return { sandbox, values, requests };
}

function telegramEvent(updateId, text = '/muctieu') {
  return {
    postData: {
      contents: JSON.stringify({
        update_id: updateId,
        message: { chat: { id: 42 }, from: { id: 42 }, text },
      }),
    },
  };
}

function callbackEvent(updateId, data) {
  return {
    postData: {
      contents: JSON.stringify({
        update_id: updateId,
        callback_query: {
          id: `callback-${updateId}`,
          from: { id: 42 },
          message: { chat: { id: 42 } },
          data,
        },
      }),
    },
  };
}

function expenseRow(id, categoryId, accountId, amount) {
  return {
    id,
    properties: {
      'Nội Dung Khoản Chi': { title: [{ plain_text: id }] },
      'Số Tiền': { number: amount },
      'Ngày': { date: { start: '2026-07-20' } },
      'Loại Chi Phí': { relation: [{ id: categoryId }] },
      'Phương Thức Thanh Toán': { relation: [{ id: accountId }] },
    },
  };
}

function namedExpenseRow(id, name, categoryId, accountId, amount, note = '') {
  return {
    id,
    properties: {
      'Nội Dung Khoản Chi': { title: [{ plain_text: name }] },
      'Số Tiền': { number: amount },
      'Ngày': { date: { start: '2026-07-20' } },
      'Ghi Chú': { rich_text: note ? [{ plain_text: note }] : [] },
      'Loại Chi Phí': { relation: [{ id: categoryId }] },
      'Phương Thức Thanh Toán': { relation: [{ id: accountId }] },
    },
  };
}

function transferRow(id, note, amount, fromAccountId, toAccountId, fundGroupId) {
  return {
    id,
    properties: {
      'Ghi Chú': { title: [{ plain_text: note }] },
      'Số Tiền': { number: amount },
      'Ngày': { date: { start: '2026-07-04' } },
      'Loại Chuyển Đổi': { select: { name: 'Giao Dịch Giữa Các Tài Khoản' } },
      'Từ Tài Khoản': { relation: [{ id: fromAccountId }] },
      'Đến Tài Khoản': { relation: [{ id: toAccountId }] },
      'Nhóm Quỹ': { relation: fundGroupId ? [{ id: fundGroupId }] : [] },
    },
  };
}

function trackedCategoryRow(id, name, budget, fundGroupId) {
  return {
    id,
    properties: {
      'Loại Chi Phí': { title: [{ plain_text: name }] },
      'Ngân Sách Tháng': { number: budget },
      'Tính Trong 5,5 Triệu': { checkbox: true },
      'Nhóm Quỹ': { relation: fundGroupId ? [{ id: fundGroupId }] : [] },
    },
  };
}

function fundGroupRow(id, name, destinationAccountId, requiresAllocation) {
  return {
    id,
    properties: {
      'Tên Nhóm Quỹ': { title: [{ plain_text: name }] },
      'Tài Khoản Giữ Quỹ': { relation: destinationAccountId ? [{ id: destinationAccountId }] : [] },
      'Bắt Buộc Cấp Quỹ': { checkbox: requiresAllocation },
    },
  };
}

function cashflowIncomeRow(id, name, categoryId, accountId, amount, note = '') {
  return {
    id,
    properties: {
      'Tên Khoản Thu': { title: [{ plain_text: name }] },
      'Số Tiền': { number: amount },
      'Ngày': { date: { start: '2026-07-20' } },
      'Ghi Chú': { rich_text: note ? [{ plain_text: note }] : [] },
      'Loại Khoản Thu': { relation: categoryId ? [{ id: categoryId }] : [] },
      'Phương Thức Thanh Toán': { relation: accountId ? [{ id: accountId }] : [] },
    },
  };
}

function cashflowAccountRow(id, name, currentBalance = 0) {
  return {
    id,
    properties: {
      'Phương Thức Thanh Toán': { title: [{ plain_text: name }] },
      'Số Dư Hiện Tại': { formula: { type: 'number', number: currentBalance } },
    },
  };
}

function cashflowCategoryRow(id, property, name) {
  return {
    id,
    properties: {
      [property]: { title: [{ plain_text: name }] },
    },
  };
}

test('builds account-first monthly cashflow', () => {
  const { sandbox } = loadBot();
  const accountRows = [
    cashflowAccountRow('momo', 'Momo', 270000),
    cashflowAccountRow('cash', 'Grap Tiền Mặt', 2774000),
  ];
  const incomeCategoryRows = [
    cashflowCategoryRow('grab-net', 'Loại Khoản Thu', 'Thu nhập ròng Grap'),
    cashflowCategoryRow('grab-wallet', 'Loại Khoản Thu', 'Grab - Tiền Về Ví'),
  ];
  const otherIncomeCategoryRows = [
    cashflowCategoryRow('loan-return', 'Loại Khoản Thu', 'Vay Và Trả'),
    cashflowCategoryRow('grab-wallet-other', 'Loại Khoản Thu', '  grab - tiền về ví  '),
  ];
  const expenseCategoryRows = [
    cashflowCategoryRow('rent-cat', 'Loại Chi Phí', 'Nhà Trọ'),
    cashflowCategoryRow('market-cat', 'Loại Chi Phí', 'Đi Chợ'),
  ];

  const model = sandbox.buildMonthlyCashflowData_(
    { y: 2026, m: 7, d: 28 },
    accountRows,
    [
      cashflowIncomeRow(
        'grab-earned',
        'Thu nhập ròng Grap',
        '39c8ffb5-256b-806f-a710-e022aabf703d',
        null,
        500000,
      ),
      cashflowIncomeRow('legacy-cash', 'Grap tiền mặt', 'grab-wallet', 'cash', 300000),
    ],
    [
      cashflowIncomeRow('debt-return', 'Tố trả nợ', 'loan-return', 'momo', 200000),
      cashflowIncomeRow('wallet-cash', 'Grab tiền mặt', 'grab-wallet-other', 'cash', 400000),
    ],
    [
      namedExpenseRow('rent', 'Tiền phòng', 'rent-cat', 'cash', 2000000),
      namedExpenseRow('market', 'Đi chợ', 'market-cat', 'cash', 200000),
    ],
    [transferRow('withdraw', 'Rút tiền', 400000, 'momo', 'cash')],
    incomeCategoryRows,
    otherIncomeCategoryRows,
    expenseCategoryRows,
  );

  const cash = model.accounts.find((account) => account.id === 'cash');
  const momo = model.accounts.find((account) => account.id === 'momo');
  const cashWallet = cash.moneyIn.categories.find((category) => category.name === 'Grab - Tiền Về Ví');

  assert.equal(model.totalIn, 900000);
  assert.equal(model.totalOut, 2200000);
  assert.equal(model.net, -1300000);
  assert.equal(cash.moneyIn.total, 700000);
  assert.equal(cash.moneyOut.total, 2200000);
  assert.equal(cash.currentBalance, 2774000);
  assert.equal(momo.currentBalance, 270000);
  assert.equal(cash.transfersIn, 400000);
  assert.equal(momo.transfersOut, 400000);
  assert.deepEqual(JSON.parse(JSON.stringify(model.unknownAccount)), {
    moneyIn: { count: 0, total: 0 },
    moneyOut: { count: 0, total: 0 },
  });
  assert.equal(cashWallet.total, 700000);
  assert.equal(cashWallet.rows.length, 2);
  assert.equal(cashWallet.token, sandbox.cashflowCategoryToken_('in', 'grab - tien ve vi'));
});

test('configured Grab net goal income stays outside cashflow even with a payment account', () => {
  const { sandbox } = loadBot();
  const model = sandbox.buildMonthlyCashflowData_(
    { y: 2026, m: 7, d: 28 },
    [cashflowAccountRow('cash', 'Grap Tien Mat')],
    [
      cashflowIncomeRow(
        'grab-earned-with-account',
        'Thu Nhap Rong Grab App',
        '39c8ffb5-256b-806f-a710-e022aabf703d',
        'cash',
        500000,
      ),
    ],
    [],
    [],
    [],
    [
      cashflowCategoryRow(
        '39c8ffb5-256b-806f-a710-e022aabf703d',
        'Loáº¡i Khoáº£n Thu',
        'Thu Nhap Rong Grab App',
      ),
    ],
    [],
    [],
  );

  assert.equal(model.totalIn, 0);
  assert.equal(model.accounts[0].moneyIn.total, 0);
  assert.deepEqual(JSON.parse(JSON.stringify(model.accounts[0].moneyIn.categories)), []);
  assert.deepEqual(JSON.parse(JSON.stringify(model.unknownAccount.moneyIn)), { count: 0, total: 0 });
});

test('monthly cashflow ignores zero and negative income before account, category, and unknown aggregation', () => {
  const { sandbox } = loadBot();
  const model = sandbox.buildMonthlyCashflowData_(
    { y: 2026, m: 7, d: 28 },
    [cashflowAccountRow('cash', 'Grap Tien Mat')],
    [
      cashflowIncomeRow('main-zero-known', 'Thu zero', 'main-income', 'cash', 0),
      cashflowIncomeRow('main-negative-unknown', 'Thu am', 'main-income', null, -120000),
    ],
    [
      cashflowIncomeRow('other-negative-known', 'Thu khac am', 'other-income', 'cash', -230000),
      cashflowIncomeRow('other-zero-unknown', 'Thu khac zero', 'other-income', null, 0),
    ],
    [],
    [],
    [cashflowCategoryRow('main-income', 'Loáº¡i Khoáº£n Thu', 'Thu Chinh')],
    [cashflowCategoryRow('other-income', 'Loáº¡i Khoáº£n Thu', 'Thu Khac')],
    [],
  );

  assert.equal(model.totalIn, 0);
  assert.equal(model.accounts[0].moneyIn.total, 0);
  assert.deepEqual(JSON.parse(JSON.stringify(model.accounts[0].moneyIn.categories)), []);
  assert.deepEqual(JSON.parse(JSON.stringify(model.unknownAccount.moneyIn)), { count: 0, total: 0 });
});

test('monthly cashflow preserves expense aggregation for zero and negative records', () => {
  const { sandbox } = loadBot();
  const model = sandbox.buildMonthlyCashflowData_(
    { y: 2026, m: 7, d: 28 },
    [cashflowAccountRow('cash', 'Grap Tien Mat')],
    [],
    [],
    [
      namedExpenseRow('negative-expense', 'Hoan mot phan tien chi', 'expense-cat', 'cash', -50000),
      namedExpenseRow('zero-unknown-expense', 'Chi zero chua ro tai khoan', 'expense-cat', null, 0),
    ],
    [],
    [],
    [],
    [cashflowCategoryRow('expense-cat', 'Loáº¡i Chi PhÃ­', 'Phat Sinh')],
  );

  assert.equal(model.totalOut, -50000);
  assert.equal(model.accounts[0].moneyOut.total, -50000);
  assert.equal(model.accounts[0].moneyOut.categories[0].total, -50000);
  assert.equal(model.accounts[0].moneyOut.categories[0].rows.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(model.unknownAccount.moneyOut)), { count: 1, total: 0 });
});

test('monthly cashflow records real accountless rows as unknown', () => {
  const { sandbox } = loadBot();
  const model = sandbox.buildMonthlyCashflowData_(
    { y: 2026, m: 7, d: 28 },
    [cashflowAccountRow('cash', 'Grap Tiền Mặt')],
    [cashflowIncomeRow('unknown-income', 'Thu chưa rõ', 'misc-income', null, 123000)],
    [],
    [{
      id: 'unknown-expense',
      properties: {
        'Nội Dung Khoản Chi': { title: [{ plain_text: 'Chi chưa rõ' }] },
        'Số Tiền': { number: 456000 },
        'Ngày': { date: { start: '2026-07-20' } },
        'Loại Chi Phí': { relation: [{ id: 'misc-expense' }] },
        'Phương Thức Thanh Toán': { relation: [] },
      },
    }],
    [],
    [cashflowCategoryRow('misc-income', 'Loại Khoản Thu', 'Thu Khác')],
    [],
    [cashflowCategoryRow('misc-expense', 'Loại Chi Phí', 'Phát Sinh')],
  );

  assert.equal(model.totalIn, 0);
  assert.equal(model.totalOut, 0);
  assert.deepEqual(JSON.parse(JSON.stringify(model.unknownAccount)), {
    moneyIn: { count: 1, total: 123000 },
    moneyOut: { count: 1, total: 456000 },
  });
});

function notionPage(rows, hasMore = false, nextCursor = null) {
  return {
    getResponseCode() { return 200; },
    getContentText() {
      return JSON.stringify({
        object: 'list',
        results: rows,
        has_more: hasMore,
        next_cursor: nextCursor,
      });
    },
  };
}

function monthlyCashflowInitialResponses() {
  return [
    notionPage([{ id: 'account' }]),
    notionPage([{ id: 'income' }]),
    notionPage([{ id: 'other-income' }]),
    notionPage([{ id: 'expense' }]),
    notionPage([{ id: 'income-category' }]),
    notionPage([{ id: 'other-income-category' }]),
    notionPage([{ id: 'expense-category' }]),
    notionPage([{ id: 'transfer' }]),
  ];
}

test('monthly cashflow sources use eight ordered requests and a shared month filter', () => {
  let batchRequests;
  const { sandbox } = loadBot({
    fetchAll(requestsToFetch) {
      batchRequests = requestsToFetch;
      return monthlyCashflowInitialResponses();
    },
  });
  sandbox.today_ = () => ({ y: 2026, m: 7, d: 28 });
  sandbox.buildMonthlyCashflowData_ = (...args) => ({ args });

  sandbox.monthlyCashflowData_(true);

  const cfg = sandbox.getConfig_();
  assert.equal(batchRequests.length, 8);
  assert.deepEqual(
    JSON.parse(JSON.stringify(batchRequests.map((request) => request.url))),
    [
      cfg.ACCOUNT_DB,
      cfg.INCOME_DB,
      cfg.OTHER_INCOME_DB,
      cfg.EXPENSE_DB,
      cfg.GOAL_DB,
      cfg.OTHER_INCOME_CATEGORY_DB,
      cfg.BUDGET_DB,
      cfg.TRANSFER_DB,
    ].map((dbId) => `https://api.notion.com/v1/databases/${dbId}/query`),
  );

  const filters = [1, 2, 3, 7].map((index) => JSON.parse(batchRequests[index].payload).filter);
  for (const filter of filters) {
    assert.deepEqual(filter, {
      and: [
        { property: 'Ng\u00e0y', date: { on_or_after: '2026-07-01' } },
        { property: 'Ng\u00e0y', date: { on_or_before: '2026-07-28' } },
      ],
    });
  }
  for (const index of [0, 4, 5, 6]) {
    assert.equal(JSON.parse(batchRequests[index].payload).filter, undefined);
  }
});

test('monthly cashflow forwards remaining Notion pages to its builder', () => {
  const { sandbox, requests } = loadBot({
    fetchAll() {
      const responses = monthlyCashflowInitialResponses();
      responses[1] = notionPage([{ id: 'income-page-one' }], true, 'income-cursor');
      return responses;
    },
    fetch() {
      return notionPage([{ id: 'income-page-two' }]);
    },
  });
  sandbox.today_ = () => ({ y: 2026, m: 7, d: 28 });
  let builderArgs;
  sandbox.buildMonthlyCashflowData_ = (...args) => {
    builderArgs = args;
    return { ok: true };
  };

  sandbox.monthlyCashflowData_(true);

  assert.deepEqual(JSON.parse(JSON.stringify(builderArgs[2])), [
    { id: 'income-page-one' },
    { id: 'income-page-two' },
  ]);
  assert.equal(JSON.parse(requests[0].options.payload).start_cursor, 'income-cursor');
});

test('monthly cashflow cache reuses the final model unless refresh is forced', () => {
  let fetchAllCalls = 0;
  let buildCalls = 0;
  const cache = new Map();
  const { sandbox } = loadBot({
    fetchAll() {
      fetchAllCalls += 1;
      return monthlyCashflowInitialResponses();
    },
  });
  sandbox.CacheService = {
    getScriptCache() {
      return {
        get(key) { return cache.get(key) || null; },
        put(key, value, seconds) { cache.set(key, value); assert.equal(seconds, 60); },
      };
    },
  };
  sandbox.today_ = () => ({ y: 2026, m: 7, d: 28 });
  sandbox.buildMonthlyCashflowData_ = () => ({ build: ++buildCalls });

  assert.deepEqual(JSON.parse(JSON.stringify(sandbox.monthlyCashflowData_())), { build: 1 });
  assert.deepEqual(JSON.parse(JSON.stringify(sandbox.monthlyCashflowData_())), { build: 1 });
  assert.deepEqual(JSON.parse(JSON.stringify(sandbox.monthlyCashflowData_(true))), { build: 2 });
  assert.equal(fetchAllCalls, 2);
  assert.equal(buildCalls, 2);
});

test('monthly cashflow returns its live model when cache storage fails', () => {
  const { sandbox } = loadBot({ fetchAll: () => monthlyCashflowInitialResponses() });
  sandbox.CacheService = {
    getScriptCache() {
      return {
        get() { throw new Error('cache unavailable'); },
        put() { throw new Error('cache too large'); },
      };
    },
  };
  sandbox.today_ = () => ({ y: 2026, m: 7, d: 28 });
  const model = { live: true };
  sandbox.buildMonthlyCashflowData_ = () => model;

  assert.equal(sandbox.monthlyCashflowData_(), model);
});

function levelOneCashflowData() {
  return {
    t: { y: 2026, m: 7, d: 28 },
    totalIn: 900000,
    totalOut: 2200000,
    net: -1300000,
    accounts: [
      {
        token: 'momo',
        name: 'Momo',
        currentBalance: 270000,
        moneyIn: {
          total: 200000,
          categories: [{ name: 'Vay Va Tra', rows: [{ name: 'Nguoi quen tra no' }] }],
        },
        moneyOut: { total: 0, categories: [] },
      },
      {
        token: 'cash',
        name: 'Grap Tien Mat',
        currentBalance: 2774000,
        moneyIn: {
          total: 700000,
          categories: [{ name: 'Grab - Tien Ve Vi', rows: [{ name: 'Grab ve vi 18/7' }] }],
        },
        moneyOut: {
          total: 2200000,
          categories: [
            { name: 'Nha Tro', rows: [{ name: 'Tien phong thang 7' }] },
            { name: 'Di Cho', rows: [{ name: 'Sieu thi cuoi tuan' }] },
          ],
        },
      },
      {
        token: 'inactive',
        name: 'Tai khoan trong',
        currentBalance: 0,
        moneyIn: { total: 0, categories: [] },
        moneyOut: { total: 0, categories: [] },
      },
    ],
  };
}

test('level 1 cashflow text is the exact monthly account summary', () => {
  const { sandbox } = loadBot();

  assert.equal(
    sandbox.monthlyCashflowText_(levelOneCashflowData()),
    '\u{1F4CA} D\u00f2ng ti\u1ec1n th\u00e1ng 7/2026',
  );
});

test('level 1 cashflow adds one compact unknown-account warning with both directions', () => {
  const { sandbox } = loadBot();
  const data = levelOneCashflowData();
  data.unknownAccount = {
    moneyIn: { count: 2, total: 123000 },
    moneyOut: { count: 3, total: 456000 },
  };

  const text = sandbox.monthlyCashflowText_(data);

  assert.equal((text.match(/Ch\u01b0a x\u00e1c \u0111\u1ecbnh t\u00e0i kho\u1ea3n/g) || []).length, 1);
  assert.match(
    text,
    /\n\n\u26a0\ufe0f Ch\u01b0a x\u00e1c \u0111\u1ecbnh t\u00e0i kho\u1ea3n: Thu 2 giao d\u1ecbch \u00b7 123\.000\u0111 \| Chi 3 giao d\u1ecbch \u00b7 456\.000\u0111$/,
  );
  assert.doesNotMatch(text, /\b(?:V\u00e0o|Ra)\b/);
});

test('level 1 cashflow warning includes only the applicable unknown-account direction', () => {
  const { sandbox } = loadBot();
  const data = levelOneCashflowData();
  data.unknownAccount = {
    moneyIn: { count: 0, total: 0 },
    moneyOut: { count: 1, total: 89000 },
  };

  const warning = sandbox.monthlyCashflowText_(data).split('\n\n').at(-1);

  assert.equal(
    warning,
    '\u26a0\ufe0f Ch\u01b0a x\u00e1c \u0111\u1ecbnh t\u00e0i kho\u1ea3n: Chi 1 giao d\u1ecbch \u00b7 89.000\u0111',
  );
  assert.doesNotMatch(warning, /\b(?:V\u00e0o|Ra)\b/);
});

test('level 1 cashflow hides categories and transaction titles', () => {
  const { sandbox } = loadBot();
  const text = sandbox.monthlyCashflowText_(levelOneCashflowData());

  for (const detail of [
    'Vay Va Tra',
    'Nguoi quen tra no',
    'Grab - Tien Ve Vi',
    'Grab ve vi 18/7',
    'Nha Tro',
    'Tien phong thang 7',
    'Di Cho',
    'Sieu thi cuoi tuan',
    'Thiết Yếu',
    'Đi Chợ',
    'Làm YouTube',
    'Phát Sinh',
  ]) {
    assert.doesNotMatch(text, new RegExp(detail));
  }
});

test('level 1 cashflow keyboard lists active accounts followed by goal and fund navigation rows', () => {
  const { sandbox } = loadBot();
  const keyboard = sandbox.monthlyCashflowKeyboard_(levelOneCashflowData());

  assert.deepEqual(JSON.parse(JSON.stringify(keyboard)), {
    inline_keyboard: [
      [{ text: 'Grap Tien Mat \u00b7 2.774.000\u0111', callback_data: 'cash_account:cash' }],
      [{ text: 'Momo \u00b7 270.000\u0111', callback_data: 'cash_account:momo' }],
      [{ text: '\u{1F3AF} M\u1ee5c ti\u00eau', callback_data: 'show_goal' }],
      [{ text: '\u{1F4E6} Qu\u1ef9 & ng\u00e2n s\u00e1ch', callback_data: 'show_funds' }],
    ],
  });
  for (const row of keyboard.inline_keyboard) {
    for (const button of row) assert.ok(Buffer.byteLength(button.callback_data, 'utf8') < 64);
  }
});

test('level 1 cashflow orders the five active accounts and shows balances only', () => {
  const { sandbox } = loadBot();
  const account = (name, currentBalance, token, active = true) => ({
    name,
    currentBalance,
    token,
    moneyIn: { total: active ? 1 : 0, categories: [] },
    moneyOut: { total: 0, categories: [] },
    transfersIn: 0,
    transfersOut: 0,
  });
  const keyboard = sandbox.monthlyCashflowKeyboard_({
    accounts: [
      account('Quỹ Momo', 1342556, 'fund'),
      account('PayPal', 0, 'paypal', false),
      account('Momo', 1030000, 'momo'),
      account('Grap Tiền Mặt', 2774000, 'grab'),
      account('Banking', 150336, 'banking'),
      account('Tiền Mặt', 400000, 'cash'),
    ],
  });
  const labels = keyboard.inline_keyboard.slice(0, -2).map((row) => row[0].text);

  assert.deepEqual(JSON.parse(JSON.stringify(labels)), [
    'Tiền Mặt · 400.000đ',
    'Banking · 150.336đ',
    'Grap Tiền Mặt · 2.774.000đ',
    'Momo · 1.030.000đ',
    'Quỹ Momo · 1.342.556đ',
  ]);
  assert.ok(labels.every((label) => !label.includes('Vào') && !label.includes('Ra')));
  assert.ok(labels.every((label) => !label.includes('PayPal')));
});

test('cashflow callback data accepts 63 UTF-8 bytes and rejects 64', () => {
  const { sandbox } = loadBot();
  const accepted = 'a'.repeat(63);
  const rejected = 'a'.repeat(64);

  assert.equal(sandbox.cashflowCallbackData_(accepted), accepted);
  assert.equal(sandbox.cashflowCallbackData_(rejected), null);
});

test('/thang falls back while /chi is no longer a command', () => {
  const { sandbox } = loadBot();
  const cashflowCalls = [];
  const messages = [];
  sandbox.sendMonthlyCashflowReport_ = (chatId, forceRefresh) => cashflowCalls.push({ chatId, forceRefresh });
  sandbox.sendMessage_ = (chatId, text) => messages.push({ chatId, text });

  sandbox.doPost(telegramEvent(130, '/thang'));
  sandbox.doPost(telegramEvent(131, '/chi'));

  assert.deepEqual(cashflowCalls, []);
  assert.deepEqual(messages, [
    { chatId: 42, text: 'Nh\u1eafn s\u1ed1 ti\u1ec1n ki\u1ebfm h\u00f4m nay (vd 650000), ho\u1eb7c /muctieu.' },
    { chatId: 42, text: 'Nh\u1eafn s\u1ed1 ti\u1ec1n ki\u1ebfm h\u00f4m nay (vd 650000), ho\u1eb7c /muctieu.' },
  ]);
});

test('cash_refresh rerenders the Level 1 cashflow report with a forced reload', () => {
  const { sandbox } = loadBot();
  const calls = [];
  sandbox.telegramApi_ = () => ({ ok: true, result: true });
  sandbox.sendMonthlyCashflowReport_ = (chatId, forceRefresh) => calls.push({ chatId, forceRefresh });

  sandbox.doPost(callbackEvent(132, 'cash_refresh'));

  assert.deepEqual(calls, [{ chatId: 42, forceRefresh: true }]);
});

test('cash_home rerenders Level 1 from the monthly cashflow cache', () => {
  const { sandbox } = loadBot();
  const calls = [];
  sandbox.telegramApi_ = () => ({ ok: true, result: true });
  sandbox.sendMonthlyCashflowReport_ = (chatId, forceRefresh) => calls.push({ chatId, forceRefresh });

  sandbox.doPost(callbackEvent(133, 'cash_home'));

  assert.deepEqual(calls, [{ chatId: 42, forceRefresh: false }]);
});

test('keeps fund report separate from Level 1 monthly cashflow', () => {
  const { sandbox } = loadBot();
  let sent;
  sandbox.telegramApi_ = () => ({ ok: true, result: true });
  sandbox.accountSpendingData_ = () => ({
    t: { y: 2026, m: 7, d: 28 },
    fundGroups: [
      { name: 'Thiết Yếu', budget: 2400000, spent: 2277400, over: 0, allocated: 2400000, transferNeeded: 0, requiresAllocation: true, unmatchedCategories: [] },
      { name: 'Đi Chợ', budget: 1300000, spent: 801000, over: 0, allocated: 0, transferNeeded: 0, requiresAllocation: false, unmatchedCategories: [] },
      { name: 'Làm YouTube', budget: 500000, spent: 554444, over: 54444, allocated: 555000, transferNeeded: 0, requiresAllocation: true, unmatchedCategories: [] },
      { name: 'Phát Sinh', budget: 600000, spent: 861790, over: 261790, allocated: 200000, transferNeeded: 0, requiresAllocation: true, unmatchedCategories: [] },
    ],
  });
  sandbox.sendMessage_ = (chatId, text, replyMarkup) => { sent = { chatId, text, replyMarkup }; };

  sandbox.doPost(callbackEvent(136, 'show_funds'));

  assert.equal(sent.chatId, 42);
  assert.match(sent.text, /Thiết Yếu: 2\.277\.400đ \/ 2\.400\.000đ/);
  assert.match(sent.text, /Đi Chợ: 801\.000đ \/ 1\.300\.000đ/);
  assert.match(sent.text, /Đi Chợ: 801\.000đ \/ 1\.300\.000đ \| còn 499\.000đ/);
  assert.match(sent.text, /Làm YouTube: 554\.444đ \/ 500\.000đ/);
  assert.match(sent.text, /Phát Sinh: 861\.790đ \/ 600\.000đ/);
  const callbacks = JSON.parse(JSON.stringify(sent.replyMarkup.inline_keyboard)).flat().map((button) => button.callback_data);
  assert.deepEqual(callbacks, ['show_funds', 'cash_home']);
});

function levelTwoCashAccount() {
  return {
    token: 'cash',
    name: 'Grap Ti\u1ec1n M\u1eb7t',
    moneyIn: {
      total: 700000,
      categories: [{
        token: 'in-grab',
        name: 'Grab - Ti\u1ec1n V\u1ec1 V\u00ed',
        total: 700000,
        rows: [{ name: 'Grab v\u1ec1 v\u00ed 18/7', date: '2026-07-18', note: 'Kh\u00f4ng hi\u1ec3n th\u1ecb' }],
      }],
    },
    moneyOut: {
      total: 2200000,
      categories: [
        {
          token: 'out-market',
          name: '\u0110i Ch\u1ee3',
          total: 200000,
          rows: [{ name: 'Si\u00eau th\u1ecb cu\u1ed1i tu\u1ea7n', date: '2026-07-26', note: 'Kh\u00f4ng hi\u1ec3n th\u1ecb' }],
        },
        {
          token: 'out-rent',
          name: 'Nh\u00e0 Tr\u1ecd',
          total: 2000000,
          rows: [{ name: 'Ti\u1ec1n ph\u00f2ng th\u00e1ng 7', date: '2026-07-01', note: 'Kh\u00f4ng hi\u1ec3n th\u1ecb' }],
        },
        { token: 'out-zero', name: 'Kh\u00f4ng ph\u00e1t sinh', total: 0, rows: [] },
      ],
    },
    transfersIn: 400000,
    transfersOut: 0,
  };
}

function levelTwoCashflowData() {
  return { t: { y: 2026, m: 7, d: 28 }, accounts: [levelTwoCashAccount()] };
}

test('level 2 account cashflow text is the exact heading only', () => {
  const { sandbox } = loadBot();

  assert.equal(
    sandbox.cashflowAccountText_(levelTwoCashflowData(), levelTwoCashAccount()),
    '\u{1F4B3} Grap Ti\u1ec1n M\u1eb7t \u2014 th\u00e1ng 7/2026',
  );
});

test('level 2 account cashflow text excludes totals, categories, transactions, and transfers', () => {
  const { sandbox } = loadBot();
  const text = sandbox.cashflowAccountText_(levelTwoCashflowData(), levelTwoCashAccount());

  for (const detail of [
    '700.000\u0111',
    '2.200.000\u0111',
    'Ti\u1ec1n v\u00e0o',
    'Ti\u1ec1n ra',
    'Grab - Ti\u1ec1n V\u1ec1 V\u00ed',
    'Nh\u00e0 Tr\u1ecd',
    '\u0110i Ch\u1ee3',
    'Chuy\u1ec3n n\u1ed9i b\u1ed9',
    'Grab v\u1ec1 v\u00ed 18/7',
    'Si\u00eau th\u1ecb cu\u1ed1i tu\u1ea7n',
    'Ti\u1ec1n ph\u00f2ng th\u00e1ng 7',
    '2026-07-18',
    'Kh\u00f4ng hi\u1ec3n th\u1ecb',
    'Kh\u00f4ng ph\u00e1t sinh',
  ]) {
    assert.doesNotMatch(text, new RegExp(detail));
  }
});

test('level 2 account keyboard always shows total income, total expense, and account navigation', () => {
  const { sandbox } = loadBot();
  const keyboard = sandbox.cashflowAccountKeyboard_(levelTwoCashAccount());

  assert.deepEqual(JSON.parse(JSON.stringify(keyboard)), {
    inline_keyboard: [
      [{ text: 'T\u1ed5ng Thu \u00b7 700.000\u0111', callback_data: 'cash_direction:cash:in' }],
      [{ text: 'T\u1ed5ng Chi \u00b7 2.200.000\u0111', callback_data: 'cash_direction:cash:out' }],
      [{ text: '\u2b05\ufe0f C\u00e1c t\u00e0i kho\u1ea3n', callback_data: 'cash_home' }],
    ],
  });
  for (const row of keyboard.inline_keyboard) {
    for (const button of row) assert.ok(Buffer.byteLength(button.callback_data, 'utf8') < 64);
  }
});

test('level 2 account keyboard keeps zero-total direction buttons visible', () => {
  const { sandbox } = loadBot();
  const account = levelTwoCashAccount();
  account.moneyIn.total = 0;
  account.moneyOut.total = 0;
  const keyboard = sandbox.cashflowAccountKeyboard_(account);

  assert.deepEqual(JSON.parse(JSON.stringify(keyboard.inline_keyboard.slice(0, 2))), [
    [{ text: 'T\u1ed5ng Thu \u00b7 0\u0111', callback_data: 'cash_direction:cash:in' }],
    [{ text: 'T\u1ed5ng Chi \u00b7 0\u0111', callback_data: 'cash_direction:cash:out' }],
  ]);
  for (const row of keyboard.inline_keyboard) {
    for (const button of row) assert.ok(Buffer.byteLength(button.callback_data, 'utf8') < 64);
  }
});

test('cashflow direction callback parser accepts only the exact account and direction format', () => {
  const { sandbox } = loadBot();

  assert.deepEqual(
    JSON.parse(JSON.stringify(sandbox.parseCashflowDirectionCallback_('cash_direction:cash:in'))),
    { accountToken: 'cash', direction: 'in' },
  );
  for (const invalid of [
    'cash_direction:cash:out:extra',
    'cash_direction:cash:sideways',
    'cash_direction::in',
    'cash_account:cash',
  ]) {
    assert.equal(sandbox.parseCashflowDirectionCallback_(invalid), null);
  }
});

function levelThreeCashflowData() {
  const account = levelTwoCashAccount();
  account.moneyIn = {
    total: 300000,
    categories: [{
      token: 'in-loan',
      name: 'Vay V\u00e0 Tr\u1ea3',
      total: 300000,
      rows: [
        { name: 'Qu\u1ea3ng tr\u1ea3 ti\u1ec1n m\u01b0\u1ee3n', amount: 100000, date: '2026-07-02' },
        { name: 'T\u1ed1 tr\u1ea3 n\u1ee3', amount: 200000, date: '2026-07-14' },
      ],
    }],
  };
  account.moneyOut = {
    total: 200000,
    categories: [{
      token: 'out-market',
      name: '\u0110i Ch\u1ee3',
      total: 200000,
      rows: [{ name: '\u0110i ch\u1ee3 2 ng\u00e0y', amount: 73000, date: '2026-07-05' }],
    }],
  };
  return { t: { y: 2026, m: 7, d: 28 }, accounts: [account] };
}

test('level 3 direction text is the exact heading only', () => {
  const { sandbox } = loadBot();
  const account = levelTwoCashAccount();

  assert.equal(sandbox.cashflowDirectionText_(account, 'in'), '\u{1F4E5} Grap Ti\u1ec1n M\u1eb7t \u2014 T\u1ed5ng Thu');
  assert.equal(sandbox.cashflowDirectionText_(account, 'out'), '\u{1F4B8} Grap Ti\u1ec1n M\u1eb7t \u2014 T\u1ed5ng Chi');
});

test('level 3 direction keyboard lists nonzero categories in descending totals with account navigation', () => {
  const { sandbox } = loadBot();
  const account = levelTwoCashAccount();

  const keyboard = sandbox.cashflowDirectionKeyboard_(account, 'out');

  assert.deepEqual(JSON.parse(JSON.stringify(keyboard)), {
    inline_keyboard: [
      [{ text: 'Nh\u00e0 Tr\u1ecd \u00b7 2.000.000\u0111', callback_data: 'cash_cat:cash:out:out-rent' }],
      [{ text: '\u0110i Ch\u1ee3 \u00b7 200.000\u0111', callback_data: 'cash_cat:cash:out:out-market' }],
      [{ text: '\u2b05\ufe0f Grap Ti\u1ec1n M\u1eb7t', callback_data: 'cash_account:cash' }],
      [{ text: '\ud83c\udfe0 C\u00e1c t\u00e0i kho\u1ea3n', callback_data: 'cash_home' }],
    ],
  });
  for (const row of keyboard.inline_keyboard) {
    for (const button of row) assert.ok(Buffer.byteLength(button.callback_data, 'utf8') < 64);
  }
});

test('cash_direction callback routes to the direction report before account handling', () => {
  const { sandbox } = loadBot();
  const calls = [];
  sandbox.telegramApi_ = () => ({ ok: true, result: true });
  sandbox.sendCashflowDirectionReport_ = (chatId, accountToken, direction) => {
    calls.push({ chatId, accountToken, direction });
  };
  sandbox.sendCashflowAccountReport_ = () => {
    throw new Error('cash_direction must not be handled as cash_account');
  };

  sandbox.doPost(callbackEvent(138, 'cash_direction:cash:out'));

  assert.deepEqual(calls, [{ chatId: 42, accountToken: 'cash', direction: 'out' }]);
});

test('cash_direction callback renders the selected direction from the cached monthly model', () => {
  const { sandbox } = loadBot();
  const sent = [];
  sandbox.telegramApi_ = () => ({ ok: true, result: true });
  sandbox.monthlyCashflowData_ = (forceRefresh) => {
    assert.equal(forceRefresh, false);
    return levelTwoCashflowData();
  };
  sandbox.sendMessage_ = (chatId, text, replyMarkup) => {
    sent.push({ chatId, text, replyMarkup });
  };

  sandbox.doPost(callbackEvent(139, 'cash_direction:cash:in'));

  assert.equal(sent.length, 1);
  assert.equal(sent[0].chatId, 42);
  assert.equal(sent[0].text, '\u{1F4E5} Grap Ti\u1ec1n M\u1eb7t \u2014 T\u1ed5ng Thu');
  assert.deepEqual(JSON.parse(JSON.stringify(sent[0].replyMarkup)), {
    inline_keyboard: [
      [{ text: 'Grab - Ti\u1ec1n V\u1ec1 V\u00ed \u00b7 700.000\u0111', callback_data: 'cash_cat:cash:in:in-grab' }],
      [{ text: '\u2b05\ufe0f Grap Ti\u1ec1n M\u1eb7t', callback_data: 'cash_account:cash' }],
      [{ text: '\ud83c\udfe0 C\u00e1c t\u00e0i kho\u1ea3n', callback_data: 'cash_home' }],
    ],
  });
});

test('zero-total cash_direction callback sends one heading with no categories and safe back navigation', () => {
  const { sandbox } = loadBot();
  const data = levelTwoCashflowData();
  data.accounts[0].moneyIn = { total: 0, categories: [] };
  const sent = [];
  sandbox.telegramApi_ = () => ({ ok: true, result: true });
  sandbox.monthlyCashflowData_ = (forceRefresh) => {
    assert.equal(forceRefresh, false);
    return data;
  };
  sandbox.sendMessage_ = (chatId, text, replyMarkup) => {
    sent.push({ chatId, text, replyMarkup });
  };

  sandbox.doPost(callbackEvent(182, 'cash_direction:cash:in'));

  assert.equal(sent.length, 1);
  assert.equal(sent[0].chatId, 42);
  assert.equal(sent[0].text, '\u{1F4E5} Grap Ti\u1ec1n M\u1eb7t \u2014 T\u1ed5ng Thu');
  const buttons = JSON.parse(JSON.stringify(sent[0].replyMarkup.inline_keyboard)).flat();
  assert.deepEqual(buttons, [
    { text: '\u2b05\ufe0f Grap Ti\u1ec1n M\u1eb7t', callback_data: 'cash_account:cash' },
    { text: '\u{1F3E0} C\u00e1c t\u00e0i kho\u1ea3n', callback_data: 'cash_home' },
  ]);
  assert.ok(buttons.every((button) => !button.callback_data.startsWith('cash_cat:')));
  assert.ok(buttons.every((button) => Buffer.byteLength(button.callback_data, 'utf8') < 64));
});

test('cash_direction callbacks reject invalid and stale directions with safe home navigation', () => {
  const scenarios = [
    { callback: 'cash_direction:cash:sideways', data: null },
    { callback: 'cash_direction:missing:in', data: levelTwoCashflowData() },
  ];

  for (const [index, scenario] of scenarios.entries()) {
    const { sandbox } = loadBot();
    const sent = [];
    sandbox.telegramApi_ = () => ({ ok: true, result: true });
    sandbox.monthlyCashflowData_ = () => {
      if (scenario.data === null) throw new Error('invalid direction must not load cashflow data');
      return scenario.data;
    };
    sandbox.sendMessage_ = (chatId, text, replyMarkup) => {
      sent.push({ chatId, text, replyMarkup });
    };

    sandbox.doPost(callbackEvent(140 + index, scenario.callback));

    assert.equal(sent.length, 1);
    assert.equal(sent[0].chatId, 42);
    assert.equal(sent[0].text, 'H\u01b0\u1edbng d\u00f2ng ti\u1ec1n kh\u00f4ng c\u00f2n t\u1ed3n t\u1ea1i trong d\u1eef li\u1ec7u th\u00e1ng n\u00e0y.');
    assert.deepEqual(JSON.parse(JSON.stringify(sent[0].replyMarkup)), {
      inline_keyboard: [[{ text: '\ud83c\udfe0 C\u00e1c t\u00e0i kho\u1ea3n', callback_data: 'cash_home' }]],
    });
  }
});

test('level 3 income detail sorts transactions by date descending', () => {
  const { sandbox } = loadBot();
  const data = levelThreeCashflowData();
  const account = data.accounts[0];

  assert.equal(
    sandbox.cashflowCategoryText_(data, account, 'in', account.moneyIn.categories[0]),
    '\u{1F4E5} Grap Ti\u1ec1n M\u1eb7t \u2192 Vay V\u00e0 Tr\u1ea3: 300.000\u0111\n' +
      '\u2022 14/07 \u2014 T\u1ed1 tr\u1ea3 n\u1ee3: 200.000\u0111\n' +
      '\u2022 02/07 \u2014 Qu\u1ea3ng tr\u1ea3 ti\u1ec1n m\u01b0\u1ee3n: 100.000\u0111',
  );
});

test('level 3 expense detail renders the selected expense category', () => {
  const { sandbox } = loadBot();
  const data = levelThreeCashflowData();
  const account = data.accounts[0];

  assert.equal(
    sandbox.cashflowCategoryText_(data, account, 'out', account.moneyOut.categories[0]),
    '\u{1F4B8} Grap Ti\u1ec1n M\u1eb7t \u2192 \u0110i Ch\u1ee3: 200.000\u0111\n' +
      '\u2022 05/07 \u2014 \u0110i ch\u1ee3 2 ng\u00e0y: 73.000\u0111',
  );
});

test('level 3 shows notes for normalized unclear titles, including an empty title', () => {
  const { sandbox } = loadBot();
  const category = {
    name: 'Thu khac',
    total: 150000,
    rows: [
      { name: 'Kh\u00f4ng r\u00f5', amount: 10000, date: '2026-07-01', note: 'Tien dien' },
      { name: 'CH\u01afA R\u00d5', amount: 20000, date: '2026-07-02', note: 'Tien nuoc' },
      { name: 'Kh\u00f4ng bi\u1ebft', amount: 30000, date: '2026-07-03', note: 'Tien mang' },
      { name: 'Ch\u1ea3 bi\u1ebft', amount: 40000, date: '2026-07-04', note: 'Tien sua xe' },
      { name: '', amount: 50000, date: '2026-07-05', note: 'Tien gui xe' },
    ],
  };

  const text = sandbox.cashflowCategoryText_(
    { t: { y: 2026, m: 7, d: 28 } },
    { name: 'Momo' },
    'in',
    category,
  );

  for (const note of ['Tien dien', 'Tien nuoc', 'Tien mang', 'Tien sua xe', 'Tien gui xe']) {
    assert.match(text, new RegExp('Ghi ch\u00fa: ' + note));
  }
  assert.match(text, /\(kh\u00f4ng c\u00f3 n\u1ed9i dung\): 50\.000\u0111 \u00b7 Ghi ch\u00fa: Tien gui xe/);
});

test('level 3 hides notes for a normal transaction title', () => {
  const { sandbox } = loadBot();
  const text = sandbox.cashflowCategoryText_(
    { t: { y: 2026, m: 7, d: 28 } },
    { name: 'Momo' },
    'out',
    {
      name: 'Di Cho',
      total: 73000,
      rows: [{
        name: 'Di cho 2 ngay',
        amount: 73000,
        date: '2026-07-05',
        note: 'Ghi chu noi bo khong can hien thi',
      }],
    },
  );

  assert.doesNotMatch(text, /Ghi ch\u00fa/);
  assert.doesNotMatch(text, /Ghi chu noi bo khong can hien thi/);
});

test('level 3 caps transaction details at 30 rows and reports the remainder', () => {
  const { sandbox } = loadBot();
  const rows = Array.from({ length: 31 }, (_value, index) => ({
    name: `Giao d\u1ecbch ${index + 1}`,
    amount: 1000,
    date: `2026-07-${String((index % 28) + 1).padStart(2, '0')}`,
  }));
  const category = { token: 'in-many', name: 'Thu kh\u00e1c', total: 31000, rows };
  const text = sandbox.cashflowCategoryText_(
    { t: { y: 2026, m: 7, d: 28 } },
    { name: 'Momo' },
    'in',
    category,
  );

  assert.equal(text.match(/^\u2022 /gm).length, 30);
  assert.match(text, /\.\.\. c\u00f2n 1 giao d\u1ecbch\.$/);
});

test('level 3 detail navigation returns to the selected direction and cash home', () => {
  const { sandbox } = loadBot();
  const data = levelThreeCashflowData();
  let sent;
  sandbox.telegramApi_ = () => ({ ok: true, result: true });
  sandbox.monthlyCashflowData_ = (forceRefresh) => {
    assert.equal(forceRefresh, false);
    return data;
  };
  sandbox.sendMessage_ = (chatId, text, replyMarkup) => {
    sent = { chatId, text, replyMarkup };
  };

  sandbox.doPost(callbackEvent(135, 'cash_cat:cash:in:in-loan'));

  assert.equal(sent.chatId, 42);
  assert.match(sent.text, /Vay V\u00e0 Tr\u1ea3: 300\.000\u0111/);
  assert.deepEqual(JSON.parse(JSON.stringify(sent.replyMarkup)), {
    inline_keyboard: [
      [{ text: '\u2b05\ufe0f T\u1ed5ng Thu', callback_data: 'cash_direction:cash:in' }],
      [{ text: '\ud83c\udfe0 C\u00e1c t\u00e0i kho\u1ea3n', callback_data: 'cash_home' }],
    ],
  });
});

test('level 3 detail keyboard uses the matching direction and never transaction buttons', () => {
  const { sandbox } = loadBot();
  const account = levelThreeCashflowData().accounts[0];

  for (const direction of ['in', 'out']) {
    const keyboard = sandbox.cashflowCategoryKeyboard_(account, direction);
    const buttons = JSON.parse(JSON.stringify(keyboard.inline_keyboard)).flat();
    const directionLabel = direction === 'in' ? 'T\u1ed5ng Thu' : 'T\u1ed5ng Chi';

    assert.deepEqual(buttons, [
      { text: '\u2b05\ufe0f ' + directionLabel, callback_data: 'cash_direction:cash:' + direction },
      { text: '\ud83c\udfe0 C\u00e1c t\u00e0i kho\u1ea3n', callback_data: 'cash_home' },
    ]);
    assert.ok(buttons.every((button) => !button.callback_data.startsWith('cash_cat:')));
  }
});

test('level 3 callback rejects an invalid direction before loading data', () => {
  const { sandbox } = loadBot();
  let sent;
  sandbox.telegramApi_ = () => ({ ok: true, result: true });
  sandbox.monthlyCashflowData_ = () => {
    throw new Error('invalid direction must not load cashflow data');
  };
  sandbox.sendMessage_ = (chatId, text, replyMarkup) => {
    sent = { chatId, text, replyMarkup };
  };

  sandbox.doPost(callbackEvent(136, 'cash_cat:cash:sideways:in-loan'));

  assert.equal(sent.chatId, 42);
  assert.equal(sent.text, 'Lo\u1ea1i giao d\u1ecbch kh\u00f4ng c\u00f2n t\u1ed3n t\u1ea1i trong d\u1eef li\u1ec7u th\u00e1ng n\u00e0y.');
  assert.deepEqual(JSON.parse(JSON.stringify(sent.replyMarkup)), {
    inline_keyboard: [[{ text: '\ud83c\udfe0 C\u00e1c t\u00e0i kho\u1ea3n', callback_data: 'cash_home' }]],
  });
});

test('level 3 callback rejects stale account and category tokens', () => {
  const scenarios = [
    { callback: 'cash_cat:missing:in:in-loan', data: levelThreeCashflowData() },
    { callback: 'cash_cat:cash:in:stale-category', data: levelThreeCashflowData() },
  ];

  for (let index = 0; index < scenarios.length; index += 1) {
    const { sandbox } = loadBot();
    let sent;
    sandbox.telegramApi_ = () => ({ ok: true, result: true });
    sandbox.monthlyCashflowData_ = () => scenarios[index].data;
    sandbox.sendMessage_ = (chatId, text, replyMarkup) => {
      sent = { chatId, text, replyMarkup };
    };

    sandbox.doPost(callbackEvent(137 + index, scenarios[index].callback));

    assert.equal(sent.chatId, 42);
    assert.equal(sent.text, 'Lo\u1ea1i giao d\u1ecbch kh\u00f4ng c\u00f2n t\u1ed3n t\u1ea1i trong d\u1eef li\u1ec7u th\u00e1ng n\u00e0y.');
  }
});

test('callback length stays strictly below 64 UTF-8 bytes for every generated Level 3 button', () => {
  const { sandbox } = loadBot();
  const data = levelThreeCashflowData();
  const account = data.accounts[0];
  const keyboards = [
    sandbox.monthlyCashflowKeyboard_(data),
    sandbox.cashflowAccountKeyboard_(account),
    sandbox.cashflowDirectionKeyboard_(account, 'in'),
    sandbox.cashflowDirectionKeyboard_(account, 'out'),
    sandbox.cashflowCategoryKeyboard_(account, 'in'),
    sandbox.cashflowCategoryKeyboard_(account, 'out'),
  ];

  for (const keyboard of keyboards) {
    for (const row of keyboard.inline_keyboard) {
      for (const button of row) assert.ok(Buffer.byteLength(button.callback_data, 'utf8') < 64);
    }
  }
});

test('cash_account callback uses the cached monthly model and renders Level 2', () => {
  const { sandbox } = loadBot();
  const calls = [];
  let sent;
  sandbox.telegramApi_ = (method, payload) => {
    calls.push({ method, payload });
    return { ok: true, result: true };
  };
  sandbox.monthlyCashflowData_ = (forceRefresh) => {
    assert.equal(forceRefresh, false);
    return levelTwoCashflowData();
  };
  sandbox.sendMessage_ = (chatId, text, replyMarkup) => {
    sent = { chatId, text, replyMarkup };
  };

  sandbox.doPost(callbackEvent(133, 'cash_account:cash'));

  assert.deepEqual(JSON.parse(JSON.stringify(calls)), [
    { method: 'answerCallbackQuery', payload: { callback_query_id: 'callback-133' } },
  ]);
  assert.equal(sent.chatId, 42);
  assert.match(sent.text, /Grap Ti\u1ec1n M\u1eb7t/);
  assert.equal(sent.replyMarkup.inline_keyboard.at(-1)[0].callback_data, 'cash_home');
});

test('cash_account callback reports a missing account with cash-home navigation', () => {
  const { sandbox } = loadBot();
  let sent;
  sandbox.telegramApi_ = () => ({ ok: true, result: true });
  sandbox.monthlyCashflowData_ = (forceRefresh) => {
    assert.equal(forceRefresh, false);
    return { t: { y: 2026, m: 7, d: 28 }, accounts: [] };
  };
  sandbox.sendMessage_ = (chatId, text, replyMarkup) => {
    sent = { chatId, text, replyMarkup };
  };

  sandbox.doPost(callbackEvent(134, 'cash_account:missing'));

  assert.equal(sent.chatId, 42);
  assert.equal(sent.text, 'T\u00e0i kho\u1ea3n kh\u00f4ng c\u00f2n t\u1ed3n t\u1ea1i trong d\u1eef li\u1ec7u th\u00e1ng n\u00e0y.');
  assert.deepEqual(JSON.parse(JSON.stringify(sent.replyMarkup)), {
    inline_keyboard: [[{ text: '\u2b05\ufe0f C\u00e1c t\u00e0i kho\u1ea3n', callback_data: 'cash_home' }]],
  });
});

test('a successfully handled update stays deduplicated after cache expiry', () => {
  const { sandbox, values } = loadBot();
  let sends = 0;
  sandbox.computeStatus_ = () => ({});
  sandbox.progressText_ = () => 'status';
  sandbox.sendMessage_ = () => { sends += 1; };

  sandbox.doPost(telegramEvent(123));
  sandbox.doPost(telegramEvent(123));

  assert.equal(sends, 1);
  assert.equal(values.get('LAST_TELEGRAM_UPDATE_ID'), '123');
});

test('pollTelegram processes queued updates once and advances the offset', () => {
  const { sandbox, values } = loadBot();
  let sends = 0;
  sandbox.telegramApi_ = (method, payload) => {
    if (method === 'getUpdates') {
      assert.equal(payload.offset, undefined);
      return { ok: true, result: [JSON.parse(telegramEvent(124).postData.contents)] };
    }
    throw new Error('Unexpected Telegram method: ' + method);
  };
  sandbox.computeStatus_ = () => ({});
  sandbox.progressText_ = () => 'status';
  sandbox.sendMessage_ = () => { sends += 1; };

  sandbox.pollTelegram();

  assert.equal(sends, 1);
  assert.equal(values.get('LAST_TELEGRAM_UPDATE_ID'), '124');
});

test('/start opens the monthly cashflow report', () => {
  const { sandbox } = loadBot();
  const calls = [];
  sandbox.sendMonthlyCashflowReport_ = (chatId, forceRefresh) => calls.push({ chatId, forceRefresh });

  sandbox.doPost(telegramEvent(125, '/start'));

  assert.deepEqual(calls, [{ chatId: 42, forceRefresh: false }]);
});

test('legacy start helper contains no removed help and delegates to the monthly overview once', () => {
  const { sandbox } = loadBot();
  const calls = [];
  sandbox.sendMonthlyCashflowReport_ = (chatId, forceRefresh) => calls.push({ chatId, forceRefresh });

  assert.doesNotMatch(sandbox.startText_(), /\/thang|ti\u1ec1n v\u00e0o|ti\u1ec1n ra/i);
  sandbox.sendStartMenu_(42);

  assert.deepEqual(calls, [{ chatId: 42, forceRefresh: false }]);
});

test('goal home and generic legacy callback fallback route to the monthly overview once', () => {
  const goalHome = JSON.parse(JSON.stringify(loadBot().sandbox.goalKeyboard_()))
    .inline_keyboard.flat().find((button) => button.callback_data === 'show_home');
  assert.deepEqual(goalHome, { text: '\u{1F3E0} Trang ch\u00ednh', callback_data: 'show_home' });

  for (const [index, callbackData] of ['show_home', 'legacy_unknown_callback'].entries()) {
    const { sandbox } = loadBot();
    const calls = [];
    sandbox.telegramApi_ = () => ({ ok: true, result: true });
    sandbox.sendMonthlyCashflowReport_ = (chatId, forceRefresh) => {
      calls.push({ chatId, forceRefresh });
    };
    sandbox.sendMessage_ = () => {
      throw new Error('home routing must not render the legacy start message');
    };

    sandbox.doPost(callbackEvent(180 + index, callbackData));

    assert.deepEqual(calls, [{ chatId: 42, forceRefresh: false }]);
  }
});

test('callback error fallback exposes only current account-overview navigation', () => {
  const { sandbox } = loadBot();
  const sent = [];
  sandbox.telegramApi_ = () => ({ ok: true, result: true });
  sandbox.sendGoalReport_ = () => {
    throw new Error('goal unavailable');
  };
  sandbox.sendMessage_ = (chatId, text, replyMarkup) => {
    sent.push({ chatId, text, replyMarkup });
  };

  sandbox.doPost(callbackEvent(183, 'show_goal'));

  assert.equal(sent.length, 1);
  assert.equal(sent[0].chatId, 42);
  assert.equal(sent[0].text, 'L\u1ed7i: goal unavailable');
  assert.deepEqual(JSON.parse(JSON.stringify(sent[0].replyMarkup)), {
    inline_keyboard: [[{
      text: '\u{1F3E0} C\u00e1c t\u00e0i kho\u1ea3n',
      callback_data: 'cash_home',
    }]],
  });
});

test('legacy account callbacks return to the new cashflow home without opening the duplicate drill-down', () => {
  for (const callbackData of [
    'show_accounts',
    'refresh_accounts',
    'show_unusual',
    'spend_account:abcdef12',
    'spend_category:abcdef12:12345678',
  ]) {
    const { sandbox } = loadBot();
    let sent;
    sandbox.telegramApi_ = () => ({ ok: true, result: true });
    sandbox.accountSpendingData_ = () => { throw new Error('legacy report must not load'); };
    sandbox.monthlyCashflowData_ = (forceRefresh) => {
      assert.equal(forceRefresh, false);
      return levelOneCashflowData();
    };
    sandbox.sendMessage_ = (chatId, text, replyMarkup) => { sent = { chatId, text, replyMarkup }; };

    sandbox.doPost(callbackEvent(140 + callbackData.length, callbackData));

    assert.equal(sent.chatId, 42);
    assert.equal(sent.text, sandbox.monthlyCashflowText_(levelOneCashflowData()));
    const callbacks = JSON.parse(JSON.stringify(sent.replyMarkup.inline_keyboard)).flat().map((button) => button.callback_data);
    assert.ok(callbacks.includes('show_funds'));
    assert.ok(callbacks.every((callback) => !callback.startsWith('spend_')));
  }
});

test('account spending keeps fixed budget progress global and account categories separate', () => {
  const { sandbox } = loadBot();
  const categoryRows = [
    trackedCategoryRow('market', 'Đi Chợ', 1300000, 'market-fund'),
    { id: 'grab', properties: { 'Loại Chi Phí': { title: [{ plain_text: 'Grap' }] } } },
    { id: 'other', properties: { 'Loại Chi Phí': { title: [{ plain_text: 'Khác' }] } } },
  ];
  const accountRows = [
    { id: 'cash-account', properties: { 'Phương Thức Thanh Toán': { title: [{ plain_text: 'Grab Tiền Mặt' }] } } },
    { id: 'momo-account', properties: { 'Phương Thức Thanh Toán': { title: [{ plain_text: 'Momo' }] } } },
  ];
  const expenseRows = [
    {
      id: 'cash-market',
      properties: {
        'Nội Dung Khoản Chi': { title: [{ plain_text: 'Đi chợ tiền mặt' }] },
        'Số Tiền': { number: 758000 },
        'Ngày': { date: { start: '2026-07-20' } },
        'Loại Chi Phí': { relation: [{ id: 'market' }] },
        'Phương Thức Thanh Toán': { relation: [{ id: 'cash-account' }] },
      },
    },
    {
      id: 'momo-market',
      properties: {
        'Nội Dung Khoản Chi': { title: [{ plain_text: 'Đi chợ QR' }] },
        'Số Tiền': { number: 43000 },
        'Ngày': { date: { start: '2026-07-21' } },
        'Loại Chi Phí': { relation: [{ id: 'market' }] },
        'Phương Thức Thanh Toán': { relation: [{ id: 'momo-account' }] },
      },
    },
    {
      id: 'cash-grab',
      properties: {
        'Nội Dung Khoản Chi': { title: [{ plain_text: 'Đổ xăng' }] },
        'Số Tiền': { number: 763000 },
        'Ngày': { date: { start: '2026-07-22' } },
        'Loại Chi Phí': { relation: [{ id: 'grab' }] },
        'Phương Thức Thanh Toán': { relation: [{ id: 'cash-account' }] },
      },
    },
    {
      id: 'cash-other',
      properties: {
        'Nội Dung Khoản Chi': { title: [{ plain_text: 'Mua cốc nước' }] },
        'Số Tiền': { number: 10000 },
        'Ngày': { date: { start: '2026-07-22' } },
        'Loại Chi Phí': { relation: [{ id: 'other' }] },
        'Phương Thức Thanh Toán': { relation: [{ id: 'cash-account' }] },
      },
    },
  ];
  const data = sandbox.buildAccountSpendingData_(
    { y: 2026, m: 7, d: 23 },
    categoryRows,
    expenseRows,
    accountRows,
    5500000,
    [],
    [fundGroupRow('market-fund', 'Đi Chợ', 'cash-account', false)],
  );

  const marketBudget = data.fixedBudgets.find((item) => item.name === 'Đi Chợ');
  const cash = data.accounts.find((item) => item.name === 'Grab Tiền Mặt');
  assert.equal(marketBudget.spent, 801000);
  assert.equal(marketBudget.remaining, 499000);
  assert.equal(cash.total, 1531000);
  assert.equal(cash.categories.find((item) => item.name === 'Đi Chợ').total, 758000);
  assert.equal(cash.categories.find((item) => item.name === 'Grap').total, 763000);
  assert.equal(data.unplannedTotal, 10000);
});

test('cash-flow analysis separates personal spending, loans, Grab capital and unusual spending', () => {
  const { sandbox } = loadBot();
  const categoryRows = [
    trackedCategoryRow('rent', 'Nhà Trọ', 2200000, 'essential'),
    trackedCategoryRow('incidental', 'Phát Sinh', 600000, 'incidental-fund'),
    { id: 'loan', properties: { 'Loại Chi Phí': { title: [{ plain_text: 'Vay Và Trả' }] } } },
    { id: 'grab', properties: { 'Loại Chi Phí': { title: [{ plain_text: 'Grap' }] } } },
    { id: 'relative', properties: { 'Loại Chi Phí': { title: [{ plain_text: 'Người Thân' }] } } },
    { id: 'market', properties: { 'Loại Chi Phí': { title: [{ plain_text: 'Đi Chợ' }] } } },
    { id: 'coffee', properties: { 'Loại Chi Phí': { title: [{ plain_text: 'Cà Phê' }] } } },
  ];
  const accountRows = [
    { id: 'cash', properties: { 'Phương Thức Thanh Toán': { title: [{ plain_text: 'Grap Tiền Mặt' }] } } },
    { id: 'momo', properties: { 'Phương Thức Thanh Toán': { title: [{ plain_text: 'Momo' }] } } },
  ];
  const expenseRows = [
    namedExpenseRow('rent-row', 'Tiền phòng', 'rent', 'momo', 2101000),
    namedExpenseRow('market-row', 'Đi chợ', 'market', 'cash', 800000),
    namedExpenseRow('lend-row', 'Cho Bình mượn tiền', 'loan', 'momo', 1500000),
    namedExpenseRow('repay-row', 'Trả lại tiền mượn cho em', 'loan', 'momo', 150000),
    namedExpenseRow('grab-topup', 'Nạp tiền vào ví grap', 'grab', 'momo', 186000),
    namedExpenseRow('fuel-row', 'Đổ xăng', 'grab', 'cash', 50000),
    namedExpenseRow('knife-row', 'Mua bộ dao', 'incidental', 'momo', 155200),
    namedExpenseRow('relative-row', 'Cho em', 'relative', 'momo', 200000),
    namedExpenseRow('tea-row', 'Mua ly trà tắc', 'coffee', 'cash', 10000, 'thuộc quỹ phát sinh'),
  ];

  const data = sandbox.buildAccountSpendingData_(
    { y: 2026, m: 7, d: 23 },
    categoryRows,
    expenseRows,
    accountRows,
    5500000,
    [],
    [],
  );

  assert.equal(data.cashOutflowTotal, 5152200);
  assert.equal(data.personalSpendingTotal, 3266200);
  assert.equal(data.loanFlow.total, 1650000);
  assert.equal(data.loanFlow.lent, 1500000);
  assert.equal(data.loanFlow.repaid, 150000);
  assert.equal(data.grabFlow.total, 236000);
  assert.equal(data.grabFlow.capital, 186000);
  assert.equal(data.grabFlow.operating, 50000);
  assert.equal(data.unusualSpending.total, 365200);
  const momoAccount = data.accounts.find((item) => item.name === 'Momo');
  assert.equal(momoAccount.personalTotal, 2456200);
  assert.equal(momoAccount.unusualTotal, 355200);
  assert.equal(momoAccount.loanTotal, 1650000);
  assert.equal(momoAccount.grabTotal, 186000);

  const text = sandbox.accountSpendingText_(data);
  assert.match(text, /Hạn mức: 5\.500\.000đ[\s\S]*Đã dùng: 3\.266\.200đ[\s\S]*Còn: 2\.233\.800đ/);
  assert.match(text, /Chi bình thường: 2\.901\.000đ/);
  assert.match(text, /Chi bất thường: 365\.200đ/);
  assert.match(text, /Cho mượn\/trả nợ: 1\.650\.000đ .*cho mượn 1\.500\.000đ.*trả nợ 150\.000đ/);
  assert.match(text, /Chạy Grab: 236\.000đ .*nạp ví 186\.000đ.*xăng\/phí 50\.000đ/);
  assert.doesNotMatch(text, /Vượt hạn mức tổng/);
  assert.match(sandbox.unusualSpendingText_(data), /Mua bộ dao: 155\.200đ/);
  assert.equal(sandbox.accountSpendingKeyboard_(data).inline_keyboard[0][0].callback_data, 'show_unusual');
});

test('Phát Sinh is a virtual budget and shows where the overspend was paid from', () => {
  const { sandbox } = loadBot();
  const categoryRows = [
    trackedCategoryRow('incidental', 'Phát Sinh', 600000, 'incidental-fund'),
  ];
  const accountRows = [
    { id: 'fund', properties: { 'Phương Thức Thanh Toán': { title: [{ plain_text: 'Quỹ Momo' }] } } },
    { id: 'momo', properties: { 'Phương Thức Thanh Toán': { title: [{ plain_text: 'Momo' }] } } },
    { id: 'cash', properties: { 'Phương Thức Thanh Toán': { title: [{ plain_text: 'Grap Tiền Mặt' }] } } },
  ];
  const expenseRows = [
    {
      id: 'fund-paid',
      properties: {
        'Nội Dung Khoản Chi': { title: [{ plain_text: 'Quỹ trả trực tiếp' }] },
        'Số Tiền': { number: 146000 },
        'Ngày': { date: { start: '2026-07-20' } },
        'Loại Chi Phí': { relation: [{ id: 'incidental' }] },
        'Phương Thức Thanh Toán': { relation: [{ id: 'fund' }] },
      },
    },
    {
      id: 'momo-paid',
      properties: {
        'Nội Dung Khoản Chi': { title: [{ plain_text: 'Momo trả hộ' }] },
        'Số Tiền': { number: 571790 },
        'Ngày': { date: { start: '2026-07-21' } },
        'Loại Chi Phí': { relation: [{ id: 'incidental' }] },
        'Phương Thức Thanh Toán': { relation: [{ id: 'momo' }] },
      },
    },
    {
      id: 'cash-paid',
      properties: {
        'Nội Dung Khoản Chi': { title: [{ plain_text: 'Tiền mặt trả hộ' }] },
        'Số Tiền': { number: 144000 },
        'Ngày': { date: { start: '2026-07-22' } },
        'Loại Chi Phí': { relation: [{ id: 'incidental' }] },
        'Phương Thức Thanh Toán': { relation: [{ id: 'cash' }] },
      },
    },
  ];

  const data = sandbox.buildAccountSpendingData_(
    { y: 2026, m: 7, d: 23 },
    categoryRows,
    expenseRows,
    accountRows,
    5500000,
    [],
    [fundGroupRow('incidental-fund', 'Phát Sinh', 'fund', true)],
  );

  const incidental = data.fixedBudgets.find((item) => item.name === 'Phát Sinh');
  assert.equal(incidental.budget, 600000);
  assert.equal(incidental.spent, 861790);
  assert.equal(incidental.over, 261790);
  assert.deepEqual(
    JSON.parse(JSON.stringify(incidental.accountBreakdown)),
    [
      { account: 'Momo', amount: 571790 },
      { account: 'Quỹ Momo', amount: 146000 },
      { account: 'Grap Tiền Mặt', amount: 144000 }
    ],
  );

  const text = sandbox.accountSpendingText_(data);
  assert.match(text, /⛔ Phát Sinh: 861\.790đ \/ 600\.000đ \| vượt, cần hoàn 261\.790đ \| DỪNG CHI/);
  assert.equal((text.match(/Phát Sinh/g) || []).length, 1);
  assert.doesNotMatch(text, /Momo: 571\.790đ|Quỹ Momo: 146\.000đ|Grap Tiền Mặt: 144\.000đ/);
  assert.doesNotMatch(text, /trả hộ|Thiếu nguồn/);
});

test('fund groups reconcile Notion transfers with spending paid outside the virtual fund', () => {
  const { sandbox } = loadBot();
  const categoryRows = [
    trackedCategoryRow('rent', 'Nhà Trọ', 2200000, 'essential-fund'),
    trackedCategoryRow('internet', 'Internet', 200000, 'essential-fund'),
    trackedCategoryRow('affiliate', 'Affiilate', 500000, 'youtube-fund'),
    trackedCategoryRow('incidental', 'Phát Sinh', 600000, 'incidental-fund'),
  ];
  const accountRows = [
    { id: 'fund', properties: { 'Phương Thức Thanh Toán': { title: [{ plain_text: 'Quỹ Momo' }] } } },
    { id: 'momo', properties: { 'Phương Thức Thanh Toán': { title: [{ plain_text: 'Momo' }] } } },
    { id: 'cash', properties: { 'Phương Thức Thanh Toán': { title: [{ plain_text: 'Grap Tiền Mặt' }] } } },
  ];
  const expenseRows = [
    expenseRow('rent-paid', 'rent', 'fund', 2101000),
    expenseRow('internet-paid', 'internet', 'fund', 176400),
    expenseRow('affiliate-paid', 'affiliate', 'fund', 554444),
    expenseRow('incidental-fund', 'incidental', 'fund', 146000),
    expenseRow('incidental-momo', 'incidental', 'momo', 571790),
    expenseRow('incidental-cash', 'incidental', 'cash', 144000),
  ];
  const transferRows = [
    transferRow('essential', 'Không cần từ khóa', 2400000, 'momo', 'fund', 'essential-fund'),
    transferRow('youtube', 'Nội dung tùy ý', 500000, 'momo', 'fund', 'youtube-fund'),
    transferRow('youtube-extra', 'Khoản bổ sung', 55000, 'momo', 'fund', 'youtube-fund'),
    transferRow('incidental', 'Cấp một phần', 200000, 'momo', 'fund', 'incidental-fund'),
    transferRow('unrelated', 'Chuyển tiền vào quỹ tích lũy', 100000, 'momo', 'fund'),
  ];
  const fundGroups = [
    fundGroupRow('essential-fund', 'Thiết Yếu', 'fund', true),
    fundGroupRow('youtube-fund', 'Làm YouTube', 'fund', true),
    fundGroupRow('incidental-fund', 'Phát Sinh', 'fund', true),
  ];

  const data = sandbox.buildAccountSpendingData_(
    { y: 2026, m: 7, d: 23 },
    categoryRows,
    expenseRows,
    accountRows,
    5500000,
    transferRows,
    fundGroups,
  );

  const essential = data.fundGroups.find((group) => group.name === 'Thiết Yếu');
  const youtube = data.fundGroups.find((group) => group.name === 'Làm YouTube');
  const incidental = data.fundGroups.find((group) => group.name === 'Phát Sinh');
  assert.deepEqual(
    JSON.parse(JSON.stringify(essential)),
    {
      name: 'Thiết Yếu',
      budget: 2400000,
      spent: 2277400,
      over: 0,
      allocated: 2400000,
      paidOutsideFund: 0,
      transferNeeded: 0,
      requiresAllocation: true,
      unmatchedCategories: [],
    },
  );
  assert.equal(youtube.allocated, 555000);
  assert.equal(youtube.spent, 554444);
  assert.equal(youtube.over, 54444);
  assert.equal(youtube.transferNeeded, 0);
  assert.equal(incidental.allocated, 200000);
  assert.equal(incidental.spent, 861790);
  assert.equal(incidental.over, 261790);
  assert.equal(incidental.paidOutsideFund, 715790);
  assert.equal(incidental.transferNeeded, 0);
  assert.equal(data.unallocatedBudget, 2000000);

  const text = sandbox.accountSpendingText_(data);
  assert.match(text, /✅ Thiết Yếu: 2\.277\.400đ \/ 2\.400\.000đ \| đã cấp 2\.400\.000đ/);
  assert.match(text, /⛔ Làm YouTube: 554\.444đ \/ 500\.000đ \| vượt, cần hoàn 54\.444đ \| DỪNG CHI/);
  assert.match(text, /⛔ Phát Sinh: 861\.790đ \/ 600\.000đ \| vượt, cần hoàn 261\.790đ \| DỪNG CHI/);
  assert.equal((text.match(/Thiết Yếu/g) || []).length, 1);
  assert.equal((text.match(/Làm YouTube/g) || []).length, 1);
  assert.equal((text.match(/Phát Sinh/g) || []).length, 1);
  assert.doesNotMatch(text, /quỹ tích lũy/);
});

test('a managed fund with no transfer or outside spending warns the amount to transfer', () => {
  const { sandbox } = loadBot();
  const data = sandbox.buildAccountSpendingData_(
    { y: 2026, m: 7, d: 23 },
    [trackedCategoryRow('incidental', 'Phát Sinh', 600000, 'incidental-fund')],
    [],
    [{ id: 'fund', properties: { 'Phương Thức Thanh Toán': { title: [{ plain_text: 'Quỹ Momo' }] } } }],
    5500000,
    [],
    [fundGroupRow('incidental-fund', 'Phát Sinh', 'fund', true)],
  );

  assert.equal(data.fundGroups[0].transferNeeded, 600000);
  assert.match(sandbox.accountSpendingText_(data), /⚠️ Phát Sinh: 0đ \/ 600\.000đ \| cần cấp 600\.000đ/);
});

test('a fund that does not require allocation never asks for a transfer', () => {
  const { sandbox } = loadBot();
  const data = sandbox.buildAccountSpendingData_(
    { y: 2026, m: 7, d: 23 },
    [trackedCategoryRow('market', 'Đi Chợ', 1300000, 'market-fund')],
    [],
    [{ id: 'cash', properties: { 'Phương Thức Thanh Toán': { title: [{ plain_text: 'Grab Tiền Mặt' }] } } }],
    5500000,
    [],
    [fundGroupRow('market-fund', 'Đi Chợ', 'cash', false)],
  );

  assert.equal(data.fundGroups[0].requiresAllocation, false);
  assert.equal(data.fundGroups[0].transferNeeded, 0);
  const text = sandbox.accountSpendingText_(data);
  assert.match(text, /✅ Đi Chợ: 0đ \/ 1\.300\.000đ/);
  assert.doesNotMatch(text, /Cần chuyển thêm vào Đi Chợ/);
});

test('legacy month callbacks are acknowledged and return cached Level 1 navigation', () => {
  for (const [index, callbackData] of ['show_month', 'refresh_month'].entries()) {
    const { sandbox } = loadBot();
    const apiCalls = [];
    let sent;
    sandbox.telegramApi_ = (method, payload) => {
      apiCalls.push({ method, payload });
      return { ok: true, result: true };
    };
    sandbox.monthlyCashflowData_ = (forceRefresh) => {
      assert.equal(forceRefresh, false);
      return levelOneCashflowData();
    };
    sandbox.sendMessage_ = (chatId, text, replyMarkup) => {
      sent = { chatId, text, replyMarkup };
    };

    sandbox.doPost(callbackEvent(126 + index, callbackData));

    assert.deepEqual(JSON.parse(JSON.stringify(apiCalls[0])), {
      method: 'answerCallbackQuery',
      payload: { callback_query_id: `callback-${126 + index}` },
    });
    assert.equal(sent.text, sandbox.monthlyCashflowText_(levelOneCashflowData()));
    assert.equal(sent.replyMarkup.inline_keyboard.at(-1)[0].callback_data, 'show_funds');
  }
});

test('remaining Notion pages are loaded when the first page has more than 100 rows', () => {
  const secondPage = {
    getResponseCode() { return 200; },
    getContentText() {
      return JSON.stringify({
        object: 'list',
        results: [{ id: 'row-101' }],
        has_more: false,
        next_cursor: null,
      });
    },
  };
  const { sandbox, requests } = loadBot({ fetch: () => secondPage });
  const firstPage = {
    getResponseCode() { return 200; },
    getContentText() {
      return JSON.stringify({
        object: 'list',
        results: [{ id: 'row-1' }, { id: 'row-100' }],
        has_more: true,
        next_cursor: 'cursor-100',
      });
    },
  };

  const rows = sandbox.completeNotionRows_('database-id', null, firstPage, 'TEST_DB');

  assert.deepEqual(JSON.parse(JSON.stringify(rows.map((row) => row.id))), [
    'row-1',
    'row-100',
    'row-101',
  ]);
  assert.equal(JSON.parse(requests[0].options.payload).start_cursor, 'cursor-100');
});

test('sendMessage throws when Telegram rejects the request', () => {
  const { sandbox } = loadBot({
    response: {
      getResponseCode() { return 429; },
      getContentText() {
        return JSON.stringify({ ok: false, description: 'Too Many Requests' });
      },
    },
  });

  assert.throws(
    () => sandbox.sendMessage_(42, 'hello'),
    /Telegram sendMessage lỗi \(429\): Too Many Requests/,
  );
});

test('/thang summarizes income and total spending without the expense category list', () => {
  function notionResponse(rows) {
    return {
      getResponseCode() { return 200; },
      getContentText() {
        return JSON.stringify({ object: 'list', results: rows, has_more: false, next_cursor: null });
      },
    };
  }

  let batchRequests;
  const { sandbox } = loadBot({
    fetchAll(requestsToFetch) {
      batchRequests = requestsToFetch;
      return [
        notionResponse([
          {
            id: 'grab-expense',
            properties: {
              'Loại Chi Phí': { title: [{ plain_text: 'Grap' }] },
              'Ngân Sách Tháng': { number: 100000 },
            },
          },
          {
            id: 'food-expense',
            properties: {
              'Loại Chi Phí': { title: [{ plain_text: 'Ăn uống' }] },
              'Ngân Sách Tháng': { number: 50000 },
            },
          },
        ]),
        notionResponse([{
          id: 'expense-row',
          properties: {
            'Số Tiền': { number: 20000 },
            'Loại Chi Phí': { relation: [{ id: 'grab-expense' }] },
          },
        }]),
        notionResponse([
          {
            id: 'grab-net',
            properties: {
              'Số Tiền': { number: 100000 },
              'Loại Khoản Thu': { relation: [{ id: '39c8ffb5-256b-806f-a710-e022aabf703d' }] },
            },
          },
          {
            id: 'salary-income',
            properties: {
              'Số Tiền': { number: 200000 },
              'Loại Khoản Thu': { relation: [{ id: 'salary' }] },
            },
          },
          {
            id: 'old-wallet-income',
            properties: {
              'Số Tiền': { number: 500000 },
              'Loại Khoản Thu': { relation: [{ id: 'old-wallet' }] },
            },
          },
        ]),
        notionResponse([
          {
            id: 'other-unclear-name',
            properties: {
              'Tên Khoản Thu': { title: [{ plain_text: 'Chả biết khoản gì' }] },
              'Số Tiền': { number: 10000 },
              'Ngày': { date: { start: '2026-07-16' } },
              'Loại Khoản Thu': { relation: [{ id: 'other' }] },
              'Phương Thức Thanh Toán': { relation: [{ id: 'cash' }] },
            },
          },
          {
            id: 'loan-income',
            properties: {
              'Tên Khoản Thu': { title: [{ plain_text: 'Người quen trả nợ' }] },
              'Số Tiền': { number: 30000 },
              'Ngày': { date: { start: '2026-07-02' } },
              'Loại Khoản Thu': { relation: [{ id: 'loan' }] },
              'Phương Thức Thanh Toán': { relation: [{ id: 'momo' }] },
            },
          },
          {
            id: 'grab-wallet-flow',
            properties: {
              'Tên Khoản Thu': { title: [{ plain_text: 'Grap tiền mặt 18/7' }] },
              'Số Tiền': { number: 70000 },
              'Ngày': { date: { start: '2026-07-18' } },
              'Loại Khoản Thu': { relation: [{ id: '3a08ffb5-256b-80a7-a68a-dc37d6dff53f' }] },
              'Phương Thức Thanh Toán': { relation: [{ id: 'cash' }] },
            },
          },
          {
            id: 'empty-placeholder',
            properties: {
              'Tên Khoản Thu': { title: [{ plain_text: 'Nguồn thu mới' }] },
              'Số Tiền': { number: 0 },
              'Ngày': { date: { start: '2026-07-20' } },
              'Loại Khoản Thu': { relation: [] },
              'Phương Thức Thanh Toán': { relation: [] },
            },
          },
        ]),
        notionResponse([
          {
            id: '3a08ffb5-256b-80a7-a68a-dc37d6dff53f',
            properties: { 'Loại Khoản Thu': { title: [{ plain_text: 'Grab - Tiền Về Ví' }] } },
          },
          {
            id: 'other',
            properties: { 'Loại Khoản Thu': { title: [{ plain_text: 'Khoản Thu Khác' }] } },
          },
          {
            id: 'loan',
            properties: { 'Loại Khoản Thu': { title: [{ plain_text: 'Vay Và Trả' }] } },
          },
        ]),
        notionResponse([
          {
            id: '39c8ffb5-256b-806f-a710-e022aabf703d',
            properties: {
              'Loại Khoản Thu': { title: [{ plain_text: 'Thu Nhập Ròng Grab (App)' }] },
              'Mục Tiêu Hàng Tháng': { number: 10000000 },
            },
          },
          {
            id: 'salary',
            properties: {
              'Loại Khoản Thu': { title: [{ plain_text: 'Tiền Lương' }] },
              'Mục Tiêu Hàng Tháng': { number: 0 },
            },
          },
          {
            id: 'passive',
            properties: {
              'Loại Khoản Thu': { title: [{ plain_text: 'Thu Nhập Thụ Động' }] },
              'Mục Tiêu Hàng Tháng': { number: 50000000 },
            },
          },
          {
            id: 'old-wallet',
            properties: {
              'Loại Khoản Thu': { title: [{ plain_text: 'Grab - Tiền Về Ví' }] },
              'Mục Tiêu Hàng Tháng': { number: 0 },
            },
          },
        ]),
      ];
    },
  });
  sandbox.today_ = () => ({ y: 2026, m: 7, d: 19 });

  const report = sandbox.cashflowText_();

  assert.match(report, /Mục tiêu thu nhập — tổng: 300\.000đ/);
  assert.match(report, /Thu Nhập Ròng Grab \(App\): 100\.000đ/);
  assert.match(report, /Tiền Lương: 200\.000đ/);
  assert.match(report, /Thu Nhập Thụ Động: 0đ/);
  assert.doesNotMatch(report, /Mục tiêu thu nhập[\s\S]*Grab - Tiền Về Ví: 500\.000đ/);
  assert.match(report, /Khoản thu khác — tổng: 110\.000đ/);
  assert.match(report, /Grab - Tiền Về Ví: 70\.000đ/);
  assert.match(report, /Khoản Thu Khác: 10\.000đ/);
  assert.match(report, /Vay Và Trả: 30\.000đ/);
  assert.doesNotMatch(report, /Nguồn Grab - Tiền Về Ví:/);
  assert.doesNotMatch(report, /Người quen trả nợ/);
  assert.equal((report.match(/Chả biết khoản gì/g) || []).length, 1);
  assert.doesNotMatch(report, /Nguồn thu mới/);
  assert.match(report, /Ngân sách chi[\s\S]*Hạn mức: 5\.500\.000đ/);
  assert.match(report, /Đã dùng: 0đ[\s\S]*Còn: 5\.500\.000đ/);
  assert.match(report, /Chạy Grab: 20\.000đ \(xăng\/phí 20\.000đ\)/);
  assert.doesNotMatch(report, /Grap: 20\.000đ \(ngân sách 100\.000đ/);
  assert.doesNotMatch(report, /Ăn uống: 0đ \(ngân sách 50\.000đ/);

  const incomeFilter = JSON.parse(batchRequests[2].payload).filter;
  assert.equal(incomeFilter.and.length, 2);
  const otherFilter = JSON.parse(batchRequests[3].payload).filter;
  assert.equal(otherFilter.and[0].date.on_or_after, '2026-07-01');
});

test('/muctieu names the exact income target being tracked', () => {
  const { sandbox } = loadBot();
  const text = sandbox.progressText_({
    t: { y: 2026, m: 7 },
    goal: 10000000,
    earnedMonth: 1000000,
    remaining: 9000000,
    baseDaily: 322581,
    daysAfter: 12,
    tomorrowTarget: 750000,
  });

  assert.match(text, /Mục tiêu Thu Nhập Ròng Grab \(App\)/);
  assert.match(text, /Tiến độ: 10,0%/);
  assert.doesNotMatch(text, /[█░]/);
});
