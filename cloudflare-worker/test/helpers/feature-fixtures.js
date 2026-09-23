export function cashflowFixture() {
  return {
    t: { y: 2026, m: 7, d: 29 },
    unknownAccount: {
      moneyIn: { count: 0, total: 0 },
      moneyOut: { count: 0, total: 0 }
    },
    accounts: [{
      token: "cash",
      name: "Grap Tiền Mặt",
      currentBalance: 2500000,
      moneyIn: {
        total: 700000,
        categories: [{
          token: "in-grab",
          name: "Grab - Tiền Về Ví",
          total: 700000,
          rows: [{
            name: "Grab về ví 28/7",
            amount: 700000,
            date: "2026-07-28",
            note: ""
          }]
        }]
      },
      moneyOut: {
        total: 2200000,
        categories: [{
          token: "out-rent",
          name: "Nhà Trọ",
          total: 2000000,
          rows: [{
            name: "Tiền phòng tháng 7",
            amount: 2000000,
            date: "2026-07-01",
            note: ""
          }]
        }, {
          token: "out-market",
          name: "Đi Chợ",
          total: 200000,
          rows: [{
            name: "Siêu thị cuối tuần",
            amount: 200000,
            date: "2026-07-26",
            note: ""
          }]
        }]
      },
      transfersIn: 0,
      transfersOut: 0
    }]
  };
}

export function fundFixture() {
  return {
    t: { y: 2026, m: 7, d: 29 },
    fundGroups: [{
      name: "Thiết Yếu",
      budget: 2400000,
      spent: 2277400,
      over: 0,
      allocated: 2400000,
      transferNeeded: 0,
      requiresAllocation: true,
      unmatchedCategories: []
    }]
  };
}

export function goalFixture(overrides = {}) {
  return {
    t: { y: 2026, m: 7, d: 29 },
    goal: 12000000,
    earnedMonth: 6000000,
    earnedToday: 300000,
    baseDaily: 387096.774,
    todayTarget: 500000,
    todayMet: false,
    remaining: 6000000,
    daysAfter: 2,
    tomorrowTarget: 3000000,
    ...overrides
  };
}

export function messageUpdate(updateId, text, userId = 42, key = "message") {
  return {
    update_id: updateId,
    [key]: {
      text,
      from: { id: userId },
      chat: { id: 9001 }
    }
  };
}

export function callbackUpdate(updateId, data, userId = 42) {
  return {
    update_id: updateId,
    callback_query: {
      id: `callback-${updateId}`,
      data,
      from: { id: userId },
      message: { chat: { id: 9001 } }
    }
  };
}
