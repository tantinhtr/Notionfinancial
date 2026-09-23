import assert from "node:assert/strict";
import test from "node:test";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  iso_ as facadeIso,
  money_ as facadeMoney,
  normalizeSearchText_ as facadeNormalize
} from "../src/finance.js";
import {
  iso_,
  money_,
  normalizeSearchText_
} from "../src/domain/finance/shared.js";

test("finance facade preserves shared utility exports", () => {
  assert.equal(facadeIso, iso_);
  assert.equal(facadeMoney, money_);
  assert.equal(facadeNormalize, normalizeSearchText_);
  assert.equal(iso_(2026, 9, 3), "2026-09-03");
  assert.equal(money_(1250000), "1.250.000đ");
  assert.equal(normalizeSearchText_("Phát  Sinh"), "phat sinh");
});

test("domain modules never import outward layers", async () => {
  const root = fileURLToPath(new URL("../src/domain/", import.meta.url));
  const forbidden = [
    "cloudflare:workers",
    "/adapters/",
    "/repositories/",
    "/features/",
    "/app/"
  ];
  async function files(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    const nested = await Promise.all(entries.map((entry) => {
      const path = join(directory, entry.name);
      return entry.isDirectory() ? files(path) : [path];
    }));
    return nested.flat();
  }
  for (const path of await files(root)) {
    if (!path.endsWith(".js")) continue;
    const source = (await readFile(path, "utf8")).replaceAll("\\", "/");
    for (const token of forbidden) {
      assert.equal(source.includes(token), false, path + " imports " + token);
    }
  }
});

import { buildAccountSpendingData_ as facadeFundModel } from "../src/finance.js";
import { buildAccountSpendingData_ } from "../src/features/fund-budget/model.js";
import { classifyExpenseNature_ } from "../src/domain/finance/expense-classifier.js";
test("fund model facade preserves the public builder", () => {
  assert.equal(facadeFundModel, buildAccountSpendingData_);
});
test("expense classification keeps loan principal outside personal spending", () => {
  assert.deepEqual(classifyExpenseNature_("Vay Và Trả", "Cho Tuấn mượn", "", false),
    { kind: "loan", loanType: "lent", isUnusual: false });
  assert.deepEqual(classifyExpenseNature_("Phát Sinh", "Mua thuốc", "", false),
    { kind: "personal", isUnusual: true });
});

test("ledger public builders remain available through compatibility facade", async () => {
  const facade = await import("../src/ledger.js");
  const modules = {
    "rows": ["readFinanceRows_"],
    "fund-loan-ledger": ["buildFundLoanLedger_"],
    "personal-loan-ledger": ["buildPersonalLoanLedger_"],
    "previous-month-ledger": ["buildPreviousMonthAdvanceLedger_"],
    "opening-plan": ["buildOpeningPlan_"],
    "finance-ledger": ["buildFinanceLedger_"]
  };
  for (const [file, names] of Object.entries(modules)) {
    const direct = await import("../src/domain/ledger/" + file + ".js");
    for (const name of names) assert.equal(facade[name], direct[name], name);
  }
});
