# Feature Component Architecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development for delegated execution or superpowers:executing-plans for native execution. Implement this plan task-by-task and track its checkbox (- [ ]) steps.

**Goal:** Refactor the finance Worker into isolated feature components, pure domain modules, repository and adapter boundaries, and a thin Cloudflare entrypoint without changing observable behavior.

**Architecture:** Move behavior in small vertical slices while retaining top-level compatibility facades. Feature components coordinate repository calls, pure presenters return text plus replyMarkup, domain modules contain deterministic finance rules, and app/runtime.js composes every dependency.

**Tech Stack:** JavaScript ES modules, Node.js 22 test runner, Cloudflare Workers and Durable Objects, Notion API, Telegram Bot API, KV, Wrangler 4.

**Spec:** docs/superpowers/specs/2026-09-23-feature-component-architecture-design.md

## Global Constraints

- Preserve every current Telegram command, callback identifier, message string, keyboard layout, and reminder behavior.
- Preserve every finance classification, aggregation, reconciliation, cache, pagination, retry, and idempotency rule.
- Do not change Notion database IDs, property names, filters, or writes.
- Do not deploy or claim live Notion or Telegram verification.
- Add no production dependency or framework.
- Keep top-level compatibility exports throughout this plan.
- Never reset or overwrite the pre-existing uncommitted edits in cloudflare-worker/src/finance.js and cloudflare-worker/src/telegram.js.
- Before each commit, stage only the files named by that task and run the task's focused test plus the complete suite.
- A discovered behavior change stops this plan and requires its own design.

## Review Focus

1. Unauthorized callbacks must still be acknowledged but must not query finance data or send a report; Task 4 pins this in the router suite.
2. Malformed or stale cashflow callbacks must avoid unsafe lookups and return the existing safe navigation; Task 2 pins this in the cashflow component suite.
3. Ambiguous income writes must reconcile exactly once and never create a duplicate page; Tasks 4 and 7 retain the coordinator and repository integration tests.
4. Notion and Telegram failures must keep secrets redacted, and Notion writes must never retry; Task 7 keeps and extends adapter-boundary tests.
5. Cache read/write failures, pagination, and conditional history loading must still return the live model without changing query concurrency; Tasks 3 and 7 retain the repository regression suite.

---

## File Map

New feature files:

- cloudflare-worker/src/features/cashflow/model.js: monthly account model.
- cloudflare-worker/src/features/cashflow/callbacks.js: callback encoding and parsing.
- cloudflare-worker/src/features/cashflow/presenter.js: cashflow Telegram views.
- cloudflare-worker/src/features/cashflow/component.js: cashflow use-case orchestration.
- cloudflare-worker/src/features/fund-budget/model.js: fund-budget aggregation.
- cloudflare-worker/src/features/fund-budget/presenter.js: fund-budget Telegram views.
- cloudflare-worker/src/features/fund-budget/component.js: fund-budget orchestration.
- cloudflare-worker/src/features/income-goal/presenter.js: goal, confirmation, and reminder views.
- cloudflare-worker/src/features/income-goal/component.js: goal and income orchestration.

New domain files:

- cloudflare-worker/src/domain/finance/shared.js: date, currency, and normalized-text helpers.
- cloudflare-worker/src/domain/finance/expense-classifier.js: expense classification and row analysis.
- cloudflare-worker/src/domain/ledger/finance-ledger.js: ledger coordinator.
- cloudflare-worker/src/domain/ledger/fund-loan-ledger.js: virtual-fund loans.
- cloudflare-worker/src/domain/ledger/personal-loan-ledger.js: person-to-person loans.
- cloudflare-worker/src/domain/ledger/previous-month-ledger.js: account advances and reimbursements.
- cloudflare-worker/src/domain/ledger/opening-plan.js: opening allocation plan.
- cloudflare-worker/src/domain/ledger/rows.js: Notion row normalization and data-quality issues.

New application and infrastructure files:

- cloudflare-worker/src/app/runtime.js: composition root.
- cloudflare-worker/src/app/webhook.js: health and webhook HTTP handling.
- cloudflare-worker/src/app/update-coordinator.js: Durable Object boundary.
- cloudflare-worker/src/repositories/finance-repository.js: Notion query and cache orchestration.
- cloudflare-worker/src/adapters/notion.js: Notion client implementation.
- cloudflare-worker/src/adapters/telegram.js: Telegram client implementation.
- cloudflare-worker/src/adapters/state.js: KV state implementation.

Compatibility facades retained:

- cloudflare-worker/src/finance.js
- cloudflare-worker/src/ledger.js
- cloudflare-worker/src/repository.js
- cloudflare-worker/src/notion.js
- cloudflare-worker/src/telegram.js
- cloudflare-worker/src/state.js
- cloudflare-worker/src/coordinator.js

## Task 1: Shared Finance Domain and Dependency Guard

**Files:**

- Create: cloudflare-worker/src/domain/finance/shared.js
- Create: cloudflare-worker/test/architecture.test.js
- Modify: cloudflare-worker/src/finance.js:1-32
- Test: cloudflare-worker/test/finance-regression.test.js
- Test: cloudflare-worker/test/architecture.test.js

**Interfaces:**

- Consumes: no new interface.
- Produces: iso_(year, month, day), money_(value), and normalizeSearchText_(value) from domain/finance/shared.js; finance.js re-exports the same named functions.

- [ ] **Step 1: Write failing compatibility and dependency-direction tests**

Add these tests to architecture.test.js:

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

- [ ] **Step 2: Run the focused test and verify the missing module failure**

Run:

    cd cloudflare-worker
    node --test test/architecture.test.js

Expected: FAIL with ERR_MODULE_NOT_FOUND for src/domain/finance/shared.js.

- [ ] **Step 3: Move the three pure utilities without changing their bodies**

Create domain/finance/shared.js:

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

At the top of finance.js, import and re-export those exact symbols:

    import {
      iso_,
      money_,
      normalizeSearchText_
    } from "./domain/finance/shared.js";

    export { iso_, money_, normalizeSearchText_ };

Remove only their former local declarations. Preserve the current working-tree formatting and all other functions.

- [ ] **Step 4: Run focused and full verification**

Run:

    cd cloudflare-worker
    node --test test/architecture.test.js test/finance-regression.test.js
    npm run check
    npm test

Expected: architecture tests PASS, all existing finance assertions PASS, and the full suite reports zero failures.

- [ ] **Step 5: Commit Task 1**

    git add cloudflare-worker/src/domain/finance/shared.js cloudflare-worker/src/finance.js cloudflare-worker/test/architecture.test.js
    git commit -m "refactor(finance): extract shared domain utilities"

## Task 2: Cashflow Feature Component

**Files:**

- Create: cloudflare-worker/src/features/cashflow/callbacks.js
- Create: cloudflare-worker/src/features/cashflow/model.js
- Create: cloudflare-worker/src/features/cashflow/presenter.js
- Create: cloudflare-worker/src/features/cashflow/component.js
- Create: cloudflare-worker/test/cashflow-component.test.js
- Modify: cloudflare-worker/src/finance.js
- Test: cloudflare-worker/test/finance-regression.test.js

**Interfaces:**

- Consumes: repository.getMonthlyCashflow(forceRefresh) and telegram.sendMessage(chatId, text, replyMarkup).
- Produces:

      createCashflowComponent({ repository, telegram }) => ({
        showHome(chatId, { refresh }),
        showAccount(chatId, accountToken),
        showDirection(chatId, callbackData),
        showCategory(chatId, callbackData),
        handlesCallback(callbackData),
        handleCallback(chatId, callbackData)
      })

- Presenters return an object with text and replyMarkup; callback helpers retain the existing callback strings and parsers.

- [ ] **Step 1: Write failing component contract tests**

Create cashflow-component.test.js with repository and Telegram fakes:

    import assert from "node:assert/strict";
    import test from "node:test";
    import { createCashflowComponent } from "../src/features/cashflow/component.js";

    function fixture() {
      const calls = { reports: [], messages: [] };
      const report = {
        monthKey: "2026-09",
        accounts: [],
        totals: { income: 0, expense: 0, net: 0 }
      };
      const repository = {
        async getMonthlyCashflow(forceRefresh) {
          calls.reports.push(forceRefresh);
          return report;
        }
      };
      const telegram = {
        async sendMessage(chatId, text, options) {
          calls.messages.push({ chatId, text, options });
        }
      };
      return { calls, report, repository, telegram };
    }

    test("showHome loads once and sends one presenter result", async () => {
      const ctx = fixture();
      const component = createCashflowComponent(ctx);
      await component.showHome(42, { refresh: true });
      assert.deepEqual(ctx.calls.reports, [true]);
      assert.equal(ctx.calls.messages.length, 1);
      assert.equal(ctx.calls.messages[0].chatId, 42);
    });

    test("malformed direction callback uses safe navigation without loading data", async () => {
      const ctx = fixture();
      const component = createCashflowComponent(ctx);
      assert.equal(component.handlesCallback("cash_direction:bad"), true);
      await component.handleCallback(42, "cash_direction:bad");
      assert.equal(ctx.calls.reports.length, 0);
      assert.equal(ctx.calls.messages.length, 1);
    });

Add assertions using the current regression fixtures for a stale account token and malformed category callback. Pin the exact existing safe-navigation text and keyboard instead of inventing a new fallback.

- [ ] **Step 2: Run the component test and verify the missing-module failure**

    cd cloudflare-worker
    node --test test/cashflow-component.test.js

Expected: FAIL with ERR_MODULE_NOT_FOUND for src/features/cashflow/component.js.

- [ ] **Step 3: Extract callback and model code by exact move**

Move these existing exports and their private helpers from finance.js:

- callbacks.js: cashflowCallbackData_, parseCashflowDirectionCallback_, parseCashflowCategoryCallback_.
- model.js: buildMonthlyCashflowData_, cashflowCategoryToken_, and only the private aggregation helpers they call.

Use shared utilities directly:

    import {
      iso_,
      money_,
      normalizeSearchText_
    } from "../../domain/finance/shared.js";

Re-export every moved public symbol from finance.js. Do not rename callback prefixes, tokens, directions, category identifiers, or report fields.

- [ ] **Step 4: Extract presenters and add the orchestration component**

Move these functions and their presentation-only helpers to presenter.js:

- monthlyCashflowText_ and monthlyCashflowKeyboard_
- accountSpendingText_ and accountSpendingKeyboard_
- cashflowAccountText_ and cashflowAccountKeyboard_
- cashflowDirectionText_ and cashflowDirectionKeyboard_
- cashflowCategoryText_ and cashflowCategoryKeyboard_

Keep their legacy signatures as named exports. Add thin result functions used by the component:

    export function presentCashflowHome(report) {
      return {
        text: monthlyCashflowText_(report),
        replyMarkup: monthlyCashflowKeyboard_(report)
      };
    }

Implement component.js as orchestration only:

    export function createCashflowComponent({ repository, telegram }) {
      async function send(chatId, view) {
        return telegram.sendMessage(chatId, view.text, view.replyMarkup);
      }

      return {
        showHome,
        showAccount,
        showDirection,
        showCategory,
        handlesCallback,
        handleCallback
      };
    }

Copy the current account/category lookup, stale-selection fallback, and callback dispatch branches from bot.js without changing their order or user-visible output. Re-export all moved presenter symbols from finance.js.

- [ ] **Step 5: Verify the feature and its compatibility facade**

    cd cloudflare-worker
    node --test test/cashflow-component.test.js test/finance-regression.test.js
    npm run check
    npm test

Expected: component tests PASS; existing finance tests continue importing from src/finance.js unchanged; full suite has zero failures.

- [ ] **Step 6: Commit Task 2**

    git add cloudflare-worker/src/features/cashflow cloudflare-worker/src/finance.js cloudflare-worker/test/cashflow-component.test.js
    git commit -m "refactor(cashflow): add feature component"

## Task 3: Fund-Budget Feature Component

**Files:**

- Create: cloudflare-worker/src/features/fund-budget/presenter.js
- Create: cloudflare-worker/src/features/fund-budget/component.js
- Create: cloudflare-worker/test/fund-budget-component.test.js
- Modify: cloudflare-worker/src/finance.js
- Test: cloudflare-worker/test/finance-regression.test.js
- Test: cloudflare-worker/test/repository.test.js

**Interfaces:**

- Consumes: repository.getFundBudgetReport(forceRefresh) and telegram.sendMessage(chatId, text, replyMarkup).
- Produces:

      createFundBudgetComponent({ repository, telegram }) => ({
        show(chatId, { refresh }),
        handlesCallback(callbackData),
        handleCallback(chatId, callbackData)
      })

- [ ] **Step 1: Write failing orchestration tests**

Create fund-budget-component.test.js:

    import assert from "node:assert/strict";
    import test from "node:test";
    import { createFundBudgetComponent } from "../src/features/fund-budget/component.js";

    test("show loads one report and sends one message", async () => {
      const calls = [];
      const report = { funds: [], accounts: [], unusual: [] };
      const component = createFundBudgetComponent({
        repository: {
          async getFundBudgetReport(forceRefresh) {
            calls.push(["report", forceRefresh]);
            return report;
          }
        },
        telegram: {
          async sendMessage(chatId, text, options) {
            calls.push(["send", chatId, text, options]);
          }
        }
      });
      await component.show(7, { refresh: false });
      assert.deepEqual(calls[0], ["report", false]);
      assert.equal(calls.filter(([kind]) => kind === "send").length, 1);
    });

    test("repository errors propagate to the router error boundary", async () => {
      const expected = new Error("query failed");
      const component = createFundBudgetComponent({
        repository: { async getFundBudgetReport() { throw expected; } },
        telegram: { async sendMessage() { assert.fail("must not send"); } }
      });
      await assert.rejects(() => component.show(7, { refresh: true }), expected);
    });

Add a presenter assertion using the existing empty-report fixture and exact current text and keyboard.

- [ ] **Step 2: Run the test and verify the missing-module failure**

    cd cloudflare-worker
    node --test test/fund-budget-component.test.js

Expected: FAIL with ERR_MODULE_NOT_FOUND for features/fund-budget/component.js.

- [ ] **Step 3: Extract fund-budget presenters**

Move fundBudgetText_, fundBudgetKeyboard_, unusualSpendingText_, unusualSpendingKeyboard_, and any account-spending presenter still owned by this flow to presenter.js. Add:

    export function presentFundBudget(report) {
      return {
        text: fundBudgetText_(report),
        replyMarkup: fundBudgetKeyboard_(report)
      };
    }

Re-export all legacy names from finance.js. Preserve exact strings, number formatting, row ordering, callback data, and keyboard shapes.

- [ ] **Step 4: Implement the thin component**

    export function createFundBudgetComponent({ repository, telegram }) {
      async function show(chatId, { refresh = false } = {}) {
        const report = await repository.getFundBudgetReport(refresh);
        const view = presentFundBudget(report);
        return telegram.sendMessage(chatId, view.text, view.replyMarkup);
      }

      return { show, handlesCallback, handleCallback };
    }

handlesCallback and handleCallback must recognize only the existing bot callback values and preserve its current account-detail and unusual-spending navigation.

- [ ] **Step 5: Verify presentation and repository behavior**

    cd cloudflare-worker
    node --test test/fund-budget-component.test.js test/finance-regression.test.js test/repository.test.js
    npm run check
    npm test

Expected: focused tests PASS, including cache failures, pagination, and conditional history loading; full suite has zero failures.

- [ ] **Step 6: Commit Task 3**

    git add cloudflare-worker/src/features/fund-budget cloudflare-worker/src/finance.js cloudflare-worker/test/fund-budget-component.test.js
    git commit -m "refactor(funds): add budget feature component"

## Task 4: Income-Goal Component and Thin Bot Router

**Files:**

- Create: cloudflare-worker/src/features/income-goal/presenter.js
- Create: cloudflare-worker/src/features/income-goal/component.js
- Create: cloudflare-worker/test/income-goal-component.test.js
- Modify: cloudflare-worker/src/bot.js
- Modify: cloudflare-worker/src/finance.js
- Modify: cloudflare-worker/test/bot.test.js
- Test: cloudflare-worker/test/coordinator.test.js

**Interfaces:**

- Produces:

      createIncomeGoalComponent({ repository, telegram, config, now }) => ({
        show(chatId),
        recordIncome(update),
        completeReconciledIncome(update),
        sendDailyReminder(),
        handlesCommand(command)
      })

- bot.js adds createBotRouter({ telegram, config, cashflow, fundBudget, incomeGoal }); its existing createBot export remains compatible until Task 7.

- [ ] **Step 1: Write failing component and router tests**

Create income-goal-component.test.js. Test that show loads once and sends the exact goal view; recordIncome writes once and sends the existing confirmation; AmbiguousIncomeWriteError is rethrown with reconciliation context and is never retried inside the component; and sendDailyReminder uses injected now() with the current timezone boundary.

Add spy-based tests to bot.test.js:

    test("unauthorized callback is acknowledged without feature work", async () => {
      const calls = [];
      const bot = createBotRouter(routerFixture({
        telegram: {
          async answerCallbackQuery(id) { calls.push(["ack", id]); }
        },
        cashflow: rejectingFeature(calls),
        fundBudget: rejectingFeature(calls)
      }));
      await bot.processUpdate(unauthorizedCallbackUpdate());
      assert.deepEqual(calls, [["ack", "callback-id"]]);
    });

    test("authorized callback is acknowledged before delegation", async () => {
      const calls = [];
      const bot = createBotRouter(routerFixture({
        telegram: {
          async answerCallbackQuery(id) { calls.push(["ack", id]); }
        },
        cashflow: {
          handlesCallback: () => true,
          async handleCallback() { calls.push(["cashflow"]); }
        }
      }));
      await bot.processUpdate(authorizedCashflowCallbackUpdate());
      assert.deepEqual(calls.map(([kind]) => kind), ["ack", "cashflow"]);
    });

Use the existing update fixtures and callback IDs when implementing these examples.

- [ ] **Step 2: Run focused tests and verify missing exports**

    cd cloudflare-worker
    node --test test/income-goal-component.test.js test/bot.test.js

Expected: FAIL because income-goal/component.js and createBotRouter do not exist.

- [ ] **Step 3: Extract the income presenter and component**

Move progressText_ from finance.js to income-goal/presenter.js and re-export it. Move goalKeyboard_, logged-income confirmation text, reminder text, date parsing, goal display, income write, reconciliation continuation, and scheduled reminder orchestration from bot.js into the feature.

    export function presentIncomeGoal(goal) {
      return {
        text: progressText_(goal),
        replyMarkup: goalKeyboard_(goal)
      };
    }

The component owns use-case ordering but not HTTP routing, authorization, callback acknowledgement, raw Notion calls, or Durable Object serialization.

- [ ] **Step 4: Reduce bot.js to routing**

Implement createBotRouter with the current observable order: ignore unsupported shapes; acknowledge callback queries; reject unauthorized chats before feature data access; delegate callbacks; delegate goal and income commands; send the current unknown-command fallback.

Keep createBot as a compatibility wrapper that constructs the three components from its current dependencies. Remove only imports and helpers made unused by this extraction.

- [ ] **Step 5: Verify routing and reconciliation**

    cd cloudflare-worker
    node --test test/income-goal-component.test.js test/bot.test.js test/coordinator.test.js
    npm run check
    npm test

Expected: acknowledgement-order tests PASS; ambiguous-write and coordinator idempotency tests PASS; all former bot output assertions remain unchanged; full suite has zero failures.

- [ ] **Step 6: Commit Task 4**

    git add cloudflare-worker/src/features/income-goal cloudflare-worker/src/bot.js cloudflare-worker/src/finance.js cloudflare-worker/test/income-goal-component.test.js cloudflare-worker/test/bot.test.js
    git commit -m "refactor(bot): route updates through feature components"

## Task 5: Fund-Budget Domain Model and Expense Classifier

**Files:**

- Create: cloudflare-worker/src/domain/finance/expense-classifier.js
- Create: cloudflare-worker/src/features/fund-budget/model.js
- Modify: cloudflare-worker/src/features/fund-budget/presenter.js
- Modify: cloudflare-worker/src/finance.js
- Modify: cloudflare-worker/test/architecture.test.js
- Test: cloudflare-worker/test/finance-regression.test.js

**Interfaces:**

- expense-classifier.js produces classifyExpenseNature_ and analyzeExpenseRows_ for direct internal use with their current argument and result shapes.
- fund-budget/model.js produces buildAccountSpendingData_(input) and the exact report structure already consumed by fund-budget presenters.
- finance.js remains the compatibility facade for all moved public exports.

- [ ] **Step 1: Add failing direct-module compatibility tests**

Extend architecture.test.js:

    import {
      buildAccountSpendingData_ as facadeBuildAccountSpending
    } from "../src/finance.js";
    import {
      classifyExpenseNature_
    } from "../src/domain/finance/expense-classifier.js";
    import {
      buildAccountSpendingData_
    } from "../src/features/fund-budget/model.js";

    test("finance facade preserves classifier and fund model exports", () => {
      assert.equal(facadeBuildAccountSpending, buildAccountSpendingData_);
    });

Add a direct classifier test by copying one existing Phát Sinh fixture from finance-regression.test.js. Do not add classifyExpenseNature_ or analyzeExpenseRows_ to the top-level public facade because both are private today.

- [ ] **Step 2: Run the test and verify both modules are missing**

    cd cloudflare-worker
    node --test test/architecture.test.js

Expected: FAIL with ERR_MODULE_NOT_FOUND for the new classifier or model.

- [ ] **Step 3: Move the classifier as a pure domain module**

Move classifyExpenseNature_, analyzeExpenseRows_, and only the normalization and predicate helpers they call to expense-classifier.js. Import normalizeSearchText_ from domain/finance/shared.js. The module must not import features, repositories, adapters, app, Telegram, Notion, KV, or Cloudflare APIs.

Preserve all current semantic rules, especially Phát Sinh classification, personal-spending totals, loanFlow, paidOutsideFund, virtual-fund attribution, and exclusion of lending principal from the personal ceiling.

- [ ] **Step 4: Move fund aggregation into model.js**

Move buildAccountSpendingData_ and its aggregation-only helpers from finance.js to features/fund-budget/model.js. Import the classifier and shared utilities directly. Update presenter.js to consume the model shape without recalculating business rules.

Remove only declarations moved in this task, then re-export their existing public names from finance.js.

- [ ] **Step 5: Verify all finance semantics**

    cd cloudflare-worker
    node --test test/architecture.test.js test/finance-regression.test.js
    npm run check
    npm test

Expected: the facade identity test and all 78 existing finance regression tests PASS; full suite has zero failures.

- [ ] **Step 6: Commit Task 5**

    git add cloudflare-worker/src/domain/finance/expense-classifier.js cloudflare-worker/src/features/fund-budget/model.js cloudflare-worker/src/features/fund-budget/presenter.js cloudflare-worker/src/finance.js cloudflare-worker/test/architecture.test.js
    git commit -m "refactor(finance): isolate fund budget domain model"

## Task 6: Split Ledger Families Behind a Compatibility Facade

**Files:**

- Create: cloudflare-worker/src/domain/ledger/rows.js
- Create: cloudflare-worker/src/domain/ledger/fund-loan-ledger.js
- Create: cloudflare-worker/src/domain/ledger/personal-loan-ledger.js
- Create: cloudflare-worker/src/domain/ledger/previous-month-ledger.js
- Create: cloudflare-worker/src/domain/ledger/opening-plan.js
- Create: cloudflare-worker/src/domain/ledger/finance-ledger.js
- Modify: cloudflare-worker/src/ledger.js
- Modify: cloudflare-worker/test/architecture.test.js
- Test: cloudflare-worker/test/ledger.test.js

**Interfaces:**

- rows.js produces readFinanceRows_ and the normalized row/data-issue structures.
- Each ledger family keeps its current exported builder signature.
- finance-ledger.js produces buildFinanceLedger_ and coordinates the family builders.
- ledger.js re-exports buildFundLoanLedger_, buildFinanceLedger_, buildOpeningPlan_, readFinanceRows_, buildPersonalLoanLedger_, and buildPreviousMonthAdvanceLedger_.

- [ ] **Step 1: Write failing facade identity tests**

Add imports from src/ledger.js and every new direct module to architecture.test.js, then assert strict equality for all six public exports:

    test("ledger facade preserves public builder exports", () => {
      assert.equal(facadeReadFinanceRows, readFinanceRows_);
      assert.equal(facadeBuildFundLoan, buildFundLoanLedger_);
      assert.equal(facadeBuildPersonalLoan, buildPersonalLoanLedger_);
      assert.equal(facadeBuildPreviousMonth, buildPreviousMonthAdvanceLedger_);
      assert.equal(facadeBuildOpeningPlan, buildOpeningPlan_);
      assert.equal(facadeBuildFinanceLedger, buildFinanceLedger_);
    });

- [ ] **Step 2: Run the test and verify the missing-module failure**

    cd cloudflare-worker
    node --test test/architecture.test.js

Expected: FAIL because src/domain/ledger modules do not exist.

- [ ] **Step 3: Extract row normalization first**

Move property readers, finance-row parsing, data-quality issue creation, and readFinanceRows_ to rows.js. Keep row ordering, property fallback precedence, ignored-row behavior, issue codes, and issue messages exact. Run:

    node --test test/ledger.test.js

Expected: all ledger tests PASS through the compatibility facade.

- [ ] **Step 4: Extract each independent ledger family**

Move exact call graphs in this order:

1. fund-loan-ledger.js: fund resolution, evidence matching, and buildFundLoanLedger_.
2. personal-loan-ledger.js: party resolution, fallback matching, repayments, and buildPersonalLoanLedger_.
3. previous-month-ledger.js: cohorts, source tracing, reimbursements, and buildPreviousMonthAdvanceLedger_.
4. opening-plan.js: allocation helpers and buildOpeningPlan_.

After each move, re-export the public builder from ledger.js and run node --test test/ledger.test.js before continuing.

- [ ] **Step 5: Extract the ledger coordinator**

Move buildFinanceLedger_ and its cross-family conflict/reimbursement validation to finance-ledger.js. It may import rows.js and the four ledger family modules, but no repository, adapter, feature, app, or Cloudflare module. Replace ledger.js with named re-exports only.

- [ ] **Step 6: Verify dependency direction and ledger behavior**

    cd cloudflare-worker
    node --test test/architecture.test.js test/ledger.test.js
    npm run check
    npm test

Expected: all 80 ledger tests PASS, facade exports retain identity, domain dependency guard passes, and full suite has zero failures.

- [ ] **Step 7: Commit Task 6**

    git add cloudflare-worker/src/domain/ledger cloudflare-worker/src/ledger.js cloudflare-worker/test/architecture.test.js
    git commit -m "refactor(ledger): split reconciliation components"

## Task 7: Repository, Adapter, and Application Boundaries

**Files:**

- Create: cloudflare-worker/src/repositories/finance-repository.js
- Create: cloudflare-worker/src/adapters/notion.js
- Create: cloudflare-worker/src/adapters/telegram.js
- Create: cloudflare-worker/src/adapters/state.js
- Create: cloudflare-worker/src/app/runtime.js
- Create: cloudflare-worker/src/app/webhook.js
- Create: cloudflare-worker/src/app/update-coordinator.js
- Modify: cloudflare-worker/src/repository.js
- Modify: cloudflare-worker/src/notion.js
- Modify: cloudflare-worker/src/telegram.js
- Modify: cloudflare-worker/src/state.js
- Modify: cloudflare-worker/src/coordinator.js
- Modify: cloudflare-worker/src/index.js
- Modify: cloudflare-worker/test/architecture.test.js
- Test: cloudflare-worker/test/adapters.test.js
- Test: cloudflare-worker/test/repository.test.js
- Test: cloudflare-worker/test/coordinator.test.js
- Test: cloudflare-worker/test/worker.test.js

**Interfaces:**

- repositories/finance-repository.js keeps createFinanceRepository and AmbiguousIncomeWriteError.
- adapter modules keep their current public factories and method contracts.
- app/runtime.js produces createRuntime(env, now) with explicit adapter, repository, feature, and router composition.
- app/webhook.js produces the default fetch and scheduled handlers.
- app/update-coordinator.js keeps the Durable Object class contract.
- Every former top-level module remains a named re-export facade.

- [ ] **Step 1: Add failing facade and composition tests**

Extend architecture.test.js with strict identity checks between each legacy module and direct target:

    test("infrastructure facades preserve public exports", async () => {
      const pairs = [
        ["../src/repository.js", "../src/repositories/finance-repository.js"],
        ["../src/notion.js", "../src/adapters/notion.js"],
        ["../src/telegram.js", "../src/adapters/telegram.js"],
        ["../src/state.js", "../src/adapters/state.js"],
        ["../src/coordinator.js", "../src/app/update-coordinator.js"]
      ];
      for (const [facadePath, directPath] of pairs) {
        const facade = await import(facadePath);
        const direct = await import(directPath);
        for (const name of Object.keys(facade)) {
          assert.equal(facade[name], direct[name], facadePath + " export " + name);
        }
      }
    });

Add a worker test that injects fake adapter factories into createRuntime and asserts one instance each of repository, cashflow, fundBudget, incomeGoal, and bot router is composed.

- [ ] **Step 2: Run focused tests and verify the missing-module failure**

    cd cloudflare-worker
    node --test test/architecture.test.js test/worker.test.js

Expected: FAIL because the new repository, adapter, and app modules do not exist.

- [ ] **Step 3: Move repository and adapter implementations**

Move implementation bodies without semantic changes:

- repository.js to repositories/finance-repository.js.
- notion.js to adapters/notion.js.
- telegram.js to adapters/telegram.js.
- state.js to adapters/state.js.
- coordinator.js to app/update-coordinator.js.

Correct only relative import paths required by the move. Replace the five original modules with named re-exports. Preserve the pre-existing working-tree edits in src/telegram.js when converting it to a facade by carrying the effective behavior into adapters/telegram.js.

- [ ] **Step 4: Build an explicit composition root**

Move createRuntime from index.js to app/runtime.js. Compose in this order:

    const config = getConfig(env);
    const telegram = createTelegramClient(config);
    const notion = createNotionClient(config);
    const state = createStateStore(config.botState);
    const repository = createFinanceRepository({ notion, state, config, now });
    const cashflow = createCashflowComponent({ repository, telegram });
    const fundBudget = createFundBudgetComponent({ repository, telegram });
    const incomeGoal = createIncomeGoalComponent({
      repository,
      telegram,
      config,
      now
    });
    const bot = createBotRouter({
      telegram,
      config,
      cashflow,
      fundBudget,
      incomeGoal
    });

Return the same externally consumed runtime surface as today. Dependency injection used by tests must be optional and must not alter production construction.

- [ ] **Step 5: Move HTTP and schedule handling**

Move health response, Telegram webhook validation/dispatch, and scheduled-event delegation from index.js to app/webhook.js. Keep status codes, response bodies, error redaction, waitUntil behavior, coordinator routing, and scheduled reminder timing exact.

Reduce index.js to imports/re-exports for createRuntime, UpdateCoordinator, and the default Worker handlers.

- [ ] **Step 6: Run boundary and regression verification**

    cd cloudflare-worker
    node --test test/architecture.test.js test/adapters.test.js test/repository.test.js test/coordinator.test.js test/worker.test.js
    npm run check
    npm test

Expected: all focused suites PASS. Specifically verify redacted Telegram and Notion errors, no retry for Notion writes, permitted read retries, pagination, cache-failure fallback, ambiguous-income reconciliation, callback authorization, and Durable Object idempotency.

- [ ] **Step 7: Commit Task 7**

    git add cloudflare-worker/src/adapters cloudflare-worker/src/repositories cloudflare-worker/src/app cloudflare-worker/src/repository.js cloudflare-worker/src/notion.js cloudflare-worker/src/telegram.js cloudflare-worker/src/state.js cloudflare-worker/src/coordinator.js cloudflare-worker/src/index.js cloudflare-worker/test/architecture.test.js cloudflare-worker/test/worker.test.js
    git commit -m "refactor(app): compose worker from component boundaries"

## Task 8: Architecture Documentation and Final Verification

**Files:**

- Modify: README.md
- Modify: cloudflare-worker/README.md if it exists and currently documents source layout
- Verify: all files changed by Tasks 1 through 7

**Interfaces:**

- No runtime interface changes.
- Documentation identifies component ownership, dependency direction, compatibility facades, and where new behavior belongs.

- [ ] **Step 1: Update the repository architecture section**

Document this dependency direction:

    app -> features -> repositories/adapters
                   -> domain
    repositories -> adapters + domain
    domain -> domain only

List the three feature components and their public responsibilities. State that top-level finance.js, ledger.js, repository.js, notion.js, telegram.js, state.js, and coordinator.js are temporary compatibility facades and are not the destination for new implementation code.

- [ ] **Step 2: Run static and complete verification**

    cd cloudflare-worker
    npm run check
    npm test
    git diff --check

Expected: syntax/check command exits zero, the complete suite has zero failures, and git diff reports no whitespace errors.

- [ ] **Step 3: Audit dependency direction and compatibility imports**

From the repository root:

    rg -n "from .*src/(finance|ledger|repository|notion|telegram|state|coordinator)\.js" cloudflare-worker/test
    rg -n "from .*(features|repositories|adapters|app)" cloudflare-worker/src/domain
    rg -n "cloudflare:workers|fetch\(" cloudflare-worker/src/domain cloudflare-worker/src/features

Expected: legacy tests may still import facade files; domain has no outward imports; feature modules do not call raw fetch or Cloudflare bindings.

- [ ] **Step 4: Review the working-tree boundary**

    git status --short
    git diff --stat
    git diff -- cloudflare-worker/src/finance.js cloudflare-worker/src/telegram.js

Confirm every changed line traces to this refactor and that the user's pre-existing uncommitted edits in finance.js and telegram.js remain represented rather than overwritten. Do not stage unrelated files.

- [ ] **Step 5: Commit documentation**

    git add README.md cloudflare-worker/README.md
    git commit -m "docs: document feature component architecture"

If cloudflare-worker/README.md does not exist or needs no change, omit it from git add.

- [ ] **Step 6: Perform the selected final review workflow**

Use the execution method selected after plan approval. Review the complete branch against the approved spec, run the full verification commands again after review fixes, and report the validation boundary explicitly: local automated tests only, with no Cloudflare deployment and no live Telegram or Notion write.
