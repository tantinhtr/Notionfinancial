import test from "node:test";
import assert from "node:assert/strict";
import { syncSixJarTable } from "../src/features/fund-budget/six-jar-sync.js";

const properties = Object.fromEntries([
  "Nhu cầu thiết yếu (55%)", "Giáo dục phát triển (10%)",
  "Tiết kiệm dài hạn (10%)", "Đầu tư tài chính (10%)",
  "Hưởng thụ (10%)", "Cho đi (5%)"
].map((name) => [name, { type: "formula" }]));
properties["Tháng"] = { type: "title" };

const report = {
  t: { y: 2026, m: 10 },
  fundGroups: [
    { name: "Nhu cầu thiết yếu", budget: 4400000 },
    { name: "Giáo dục phát triển", budget: 1100000 }
  ],
  openingPlan: { allocations: [
    { fund: "Tiết kiệm dài hạn", amount: 353999 },
    { fund: "Đầu tư tài chính", amount: 353999 },
    { fund: "Hưởng thụ", amount: 353998 },
    { fund: "Cho đi", amount: 176999 }
  ] }
};

test("six-jar sync replaces old subtracting formulas and updates the existing blank row", async () => {
  const calls = [];
  const notion = {
    async retrieveDatabase(id) { calls.push(["retrieve", id]); return { properties }; },
    async updateDatabase(id, values) { calls.push(["schema", id, values]); return { properties: Object.fromEntries(Object.keys(properties).map((name) => [name, { type: name === "Tháng" ? "title" : "number" }])) }; },
    async queryDatabase(id) { calls.push(["query", id]); return [{ id: "blank", properties: { "Tháng": { title: [] } } }]; },
    async updatePage(id, values) { calls.push(["page", id, values]); return { id }; }
  };
  await syncSixJarTable(notion, "six-jars", report);
  assert.equal(calls[1][0], "schema");
  assert.equal(Object.keys(calls[1][2].properties).length, 6);
  assert.deepEqual(calls[3], ["page", "blank", { properties: {
    "Tháng": { title: [{ text: { content: "10/2026" } }] },
    "Nhu cầu thiết yếu (55%)": { number: 4400000 },
    "Giáo dục phát triển (10%)": { number: 1100000 },
    "Tiết kiệm dài hạn (10%)": { number: 353999 },
    "Đầu tư tài chính (10%)": { number: 353999 },
    "Hưởng thụ (10%)": { number: 353998 },
    "Cho đi (5%)": { number: 176999 }
  } }]);
});

test("six-jar sync writes changed balances to the month row without changing schema", async () => {
  const calls = [];
  const notion = {
    async retrieveDatabase() { return { properties: Object.fromEntries(Object.keys(properties).map((name) => [name, { type: name === "Tháng" ? "title" : "number" }])) }; },
    async updateDatabase() { assert.fail("schema already numeric"); },
    async queryDatabase() { return [{ id: "oct", properties: { "Tháng": { title: [{ plain_text: "10/2026" }] } } }]; },
    async updatePage(id, values) { calls.push([id, values]); }
  };
  await syncSixJarTable(notion, "six-jars", report);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], "oct");
  assert.equal(calls[0][1].properties["Hưởng thụ (10%)"].number, 353998);
});