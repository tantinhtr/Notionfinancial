import test from "node:test";
import assert from "node:assert/strict";
import { loadReport, reportCacheKey, invalidateReportCaches } from "../src/services/report-cache.js";
import { dateParts } from "../src/domain/finance/income-input.js";
import { createDateParts, createReportDateFormatter } from "../src/features/shared/report-data.js";
import { propertyText_, relationId_ } from "../src/domain/ledger/rows.js";
import { historyLookupRequired_ } from "../src/features/fund-budget/index.js";
import { FUND_REPAYMENT, REIMBURSEMENT, PERSONAL_LOAN_HINT } from "../src/domain/ledger/transaction-language.js";

test("report cache retains hits, bypasses on refresh, and invalidates actual stored keys", async () => {
  const entries = new Map(), writes = [];
  const state = {
    async getReportCache(key) { return entries.get(key); },
    async putReportCache(key, value, ttl) { writes.push([key, ttl]); entries.set(key, value); },
    async deleteReportCache(key) { entries.delete(key); }
  };
  let reads = 0;
  for (const kind of ["cashflow", "fundBudget"]) {
    const key = reportCacheKey(kind, "2026-10-03");
    const load = async () => ({ revision: ++reads });
    const first = await loadReport(state, key, false, load);
    assert.equal(await loadReport(state, key, false, load), first);
    assert.notEqual(await loadReport(state, key, true, load), first);
  }
  assert.equal(reads, 4);
  assert.ok(writes.every(([, ttl]) => ttl === 60));
  await invalidateReportCaches(state, "2026-10-03");
  assert.equal(entries.size, 0);
});

test("optional cache failures preserve live result but report loading failures propagate", async () => {
  const state = {
    async getReportCache() { throw new Error("cache read"); },
    async putReportCache() { throw new Error("cache write"); }
  };
  const result = { amount: 136972 };
  assert.equal(await loadReport(state, "key", false, async () => result), result);
  const failure = new Error("Notion unavailable");
  await assert.rejects(loadReport(state, "key", false, async () => { throw failure; }), error => error === failure);
});

test("income and report calendars agree at the local month boundary", () => {
  for (const [iso, expected] of [
    ["2026-09-30T16:59:59Z", { y: 2026, m: 9, d: 30 }],
    ["2026-09-30T17:00:00Z", { y: 2026, m: 10, d: 1 }]
  ]) {
    const date = new Date(iso), zone = "Asia/Ho_Chi_Minh";
    assert.deepEqual(dateParts(date, zone), expected);
    assert.deepEqual(createDateParts(() => date, createReportDateFormatter(zone)), expected);
  }
  assert.throws(() => dateParts(new Date("invalid"), "UTC"), /valid Date/);
});

test("Notion text and first relation retain rich text fallback and empty values", () => {
  assert.equal(propertyText_({ title: [{ plain_text: "a" }, { text: { content: "b" } }] }), "ab");
  assert.equal(propertyText_(null), "");
  assert.equal(relationId_({ relation: [{ id: "first" }, { id: "second" }] }), "first");
  assert.equal(relationId_(null), "");
});

test("history lookup covers shared repayment vocabulary while preserving distinct intents", () => {
  for (const text of ["tra no", "tra lai", "hoan lai", "cap bu", "tra tien muon", "nhan lai", "hoan tien", "dao giao dich", "dieu chinh", "truoc do"]) {
    assert.equal(historyLookupRequired_([{ normalizedText: text + " tien mat" }]), true, text);
  }
  assert.equal(FUND_REPAYMENT.test("tra no quy"), true);
  assert.equal(FUND_REPAYMENT.test("cap bu"), false);
  assert.equal(REIMBURSEMENT.test("cap bu"), true);
  assert.equal(REIMBURSEMENT.test("tra no"), false);
  assert.equal(PERSONAL_LOAN_HINT.test("muon"), true);
  assert.equal(historyLookupRequired_([{ normalizedText: "muon" }]), false);
  assert.equal(historyLookupRequired_([{ normalizedText: "mua rau" }]), false);
});
