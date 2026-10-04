import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { checkArchitecture } from "./helpers/architecture-policy.js";

async function sourcesAt(directory = new URL("../src/", import.meta.url), prefix = "") {
  const sources = new Map();
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const url = new URL(entry.name + (entry.isDirectory() ? "/" : ""), directory);
    if (entry.isDirectory()) {
      for (const [path, text] of await sourcesAt(url, prefix + entry.name + "/")) sources.set(path, text);
    } else if (entry.name.endsWith(".js")) sources.set(prefix + entry.name, await readFile(url, "utf8"));
  }
  return sources;
}

test("every production module follows the dependency matrix with no cycles", async () => {
  const sources = await sourcesAt();
  const result = checkArchitecture(sources);
  assert.equal(result.files, sources.size);
  assert.ok(result.edges > 0);
});

test("architecture policy rejects forbidden dependencies and unknown ownership", () => {
  for (const [origin, target, expected] of [
    ["features/cashflow/model.js", "adapters/notion.js", /forbidden/],
    ["features/cashflow/presenter.js", "features/cashflow/model.js", /forbidden/],
    ["features/cashflow/component.js", "features/fund-budget/index.js", /cross-feature/],
    ["app/runtime.js", "features/cashflow/model.js", /bypasses public API/],
    ["services/report-cache.js", "features/cashflow/index.js", /forbidden/],
    ["domain/finance/shared.js", "domain/ledger/evidence.js", /forbidden/],
    ["adapters/notion.js", "app/runtime.js", /forbidden/],
    ["domain/finance-rules.js", "adapters/notion-adapter.js", /forbidden/],
    ["domain/budget/model.js", "repositories/finance-repository.js", /forbidden/],
    ["domain/debt-resolver.js", "services/report-cache.js", /forbidden/]
  ]) {
    // Absolute-from-src relative path resolved by the same policy as production imports.
    const depth = origin.split("/").length - 1;
    const specifier = "../".repeat(depth) + target;
    assert.throws(() => checkArchitecture(new Map([
      [origin, 'import "' + specifier + '";'],
      [target, ""]
    ])), expected);
  }
  assert.throws(() => checkArchitecture(new Map([["misc/unowned.js", ""]])), /Unowned/);
});

test("architecture policy detects cycles and I/O hidden inside pure modules", () => {
  assert.throws(() => checkArchitecture(new Map([
    ["domain/finance/a.js", 'import "./b.js";'],
    ["domain/finance/b.js", 'import "./a.js";']
  ])), /Dependency cycle/);
  assert.throws(() => checkArchitecture(new Map([
    ["features/fund-budget/models/funding.js", 'fetch("https://example.invalid")']
  ])), /pure module/);
  assert.throws(() => checkArchitecture(new Map([
    ["domain/finance/shared.js", "import(variablePath)"]
  ])), /computed import/);
});

test("feature layers reject concrete service dependencies and cross-module internals", () => {
  for (const [origin,target] of [
    ["modules/income-goal/income-goal.service.js","modules/income-goal/income-goal.repository.js"],
    ["modules/fund-budget/rules/model.js","modules/fund-budget/fund-budget.repository.js"],
    ["modules/cashflow/cashflow.service.js","modules/fund-budget/fund-budget.service.js"],
    ["modules/cashflow/cashflow.controller.js","modules/cashflow/cashflow.repository.js"],
    ["modules/financial-ledger/financial-ledger.service.js","app/runtime.js"]
  ]) {
    const specifier="../".repeat(origin.split("/").length-1)+target;
    assert.throws(()=>checkArchitecture(new Map([[origin,'import "'+specifier+'";'],[target,""]])),/forbidden|bypasses|module imports/);
  }
});

test("canonical runtime cannot import legacy composition and import-free services cannot call concrete IO", () => {
  assert.throws(()=>checkArchitecture(new Map([
    ["app/runtime.js",'import "../repositories/finance-repository.js";'],["repositories/finance-repository.js",""]
  ])),/legacy/);
  assert.throws(()=>checkArchitecture(new Map([
    ["modules/income-goal/income-goal.service.js","export function write(repository) { return repository.queryDatabase(1); }"]
  ])),/concrete I\/O/);
});
