# Feature Component Architecture Design

**Date:** 2026-09-23

## Goal

Refactor the Cloudflare Worker into feature components with explicit
responsibilities, dependencies, and public contracts. Each user-facing bot
feature must be understandable and testable in isolation without changing
Telegram behavior, financial calculations, Notion semantics, or callback
identifiers.

This is a behavior-preserving architecture change. The current 263 passing
tests are the baseline contract.

## Context

The Worker already separates its Cloudflare entrypoint, Telegram and Notion
clients, state storage, bot routing, repository, finance calculations, and
ledger calculations. The remaining problem is responsibility concentration:

- src/finance.js contains extraction, classification, aggregation, Telegram
  text formatting, keyboards, and callback parsing.
- src/bot.js contains update validation, routing, feature orchestration,
  presentation selection, and reminder behavior.
- src/repository.js contains unrelated report queries, cache policy, goal
  calculations, report assembly, and income writes.
- src/ledger.js contains multiple independent reconciliation families.

Large files are a symptom rather than the acceptance criterion. Completion is
defined by the responsibility and dependency rules below.

## Non-Goals

This refactor does not:

- Change any Telegram command, callback data, message text, keyboard layout,
  error wording, or daily reminder behavior.
- Change classification, aggregation, reconciliation, cache lifetime,
  pagination, retry behavior, or idempotency.
- Change Notion database IDs, property names, filters, or stored values.
- Deploy the Worker or claim live Notion or Telegram verification.
- Introduce a framework, dependency-injection container, shared component
  library, or speculative generic abstraction.
- Delete compatibility exports during migration.
- Reformat unrelated files or overwrite existing working-tree changes.

## Target Structure

    cloudflare-worker/src/
    |-- index.js
    |-- app/
    |   |-- runtime.js
    |   |-- webhook.js
    |   \-- update-coordinator.js
    |-- features/
    |   |-- cashflow/
    |   |   |-- component.js
    |   |   |-- model.js
    |   |   |-- presenter.js
    |   |   \-- callbacks.js
    |   |-- fund-budget/
    |   |   |-- component.js
    |   |   |-- model.js
    |   |   \-- presenter.js
    |   \-- income-goal/
    |       |-- component.js
    |       \-- presenter.js
    |-- domain/
    |   |-- finance/
    |   |   |-- expense-classifier.js
    |   |   \-- shared.js
    |   \-- ledger/
    |       |-- finance-ledger.js
    |       |-- fund-loan-ledger.js
    |       |-- personal-loan-ledger.js
    |       \-- previous-month-ledger.js
    |-- repositories/
    |   \-- finance-repository.js
    \-- adapters/
        |-- notion.js
        |-- telegram.js
        \-- state.js

The target is reached incrementally. Existing top-level files remain thin
facades while current tests or consumers import their named exports. Facades
must not duplicate business logic.

## Responsibility Rules

### Entrypoint and application

index.js remains the Cloudflare export surface. It delegates HTTP handling,
runtime construction, scheduled execution, and Durable Object processing.

app/runtime.js is the composition root. It creates adapters, repository,
feature components, and bot router, then injects their public contracts. It
contains no financial rules or Telegram presentation strings.

app/webhook.js validates the route, method, secret, and update shape before
forwarding the update. app/update-coordinator.js retains the existing
serialization, replay, reconciliation, and retry rules.

### Feature components

A feature component owns one complete user-facing capability. It coordinates
repository calls, invokes its model and presenter, and sends the result through
the Telegram adapter. It does not query Notion directly or implement financial
rules inline.

One feature must not import another feature's private modules.

### Domain

Domain modules are deterministic functions over plain data. They may import
other domain modules, but never Cloudflare, Telegram, Notion, repositories, or
feature components.

domain/finance/shared.js contains only genuinely shared pure helpers. Each
ledger module owns one reconciliation family. finance-ledger.js coordinates
those modules through explicit inputs and outputs without duplicating their
matching rules.

### Repository and adapters

repositories/finance-repository.js owns data-access orchestration and cache
policy. It returns domain models or source rows, never Telegram text or
keyboards.

Adapters translate local contracts to external APIs. They retain token
redaction, the no-retry write policy, Telegram truncation, Notion pagination,
and KV validation.

## Public Feature Contracts

### Cashflow

    createCashflowComponent({ repository, telegram }) => ({
      showHome(chatId, { refresh }),
      showAccount(chatId, accountToken),
      showDirection(chatId, callbackData),
      showCategory(chatId, callbackData),
      handlesCallback(callbackData),
      handleCallback(chatId, callbackData)
    })

The component owns navigation from the monthly overview through account,
direction, and category detail. Callback parsers and keyboard builders are
pure modules under the feature.

### Fund budget

    createFundBudgetComponent({ repository, telegram }) => ({
      show(chatId, { refresh }),
      handlesCallback(callbackData),
      handleCallback(chatId, callbackData)
    })

The component loads and presents the fund report. Classification and ledger
reconciliation stay in domain modules.

### Income goal

    createIncomeGoalComponent({ repository, telegram, config, now }) => ({
      show(chatId),
      recordIncome(update),
      completeReconciledIncome(update),
      sendDailyReminder(),
      handlesCommand(command)
    })

This component owns the /muctieu view, numeric income recording,
post-reconciliation confirmation, and scheduled reminder. Idempotency and
reconciliation remain unchanged at repository and coordinator boundaries.

### Bot router

The bot router validates authorized messages and callbacks, then delegates to
one feature component. It does not load reports, search accounts or
categories, build keyboards, calculate goals, or format financial output.

## Presentation Contract

Presenters are pure functions. They receive an already-built model and return:

    {
      text,
      replyMarkup
    }

replyMarkup may be undefined. Feature components pass this result to
telegram.sendMessage. Existing text and keyboard exports remain available
through compatibility facades until internal consumers and tests migrate.

## Data Flow

    Telegram update
      -> webhook
      -> update coordinator
      -> bot router
      -> feature component
      -> repository
      -> Notion and KV adapters
      -> domain model
      -> presenter
      -> Telegram adapter

Dependencies point inward toward pure domain code. Domain code never calls
outward.

## Error Handling

- Notion and Telegram adapters continue to redact sensitive values.
- The Notion adapter never retries writes that could duplicate income.
- Repositories propagate failures without producing Telegram messages.
- Feature components choose user-facing fallbacks for known feature failures.
- The bot router does not swallow feature errors.
- The coordinator retains retry, reconciliation, persisted status, and warning
  responsibilities.
- Logs remain structured and bounded and never expose secrets.

## Migration Sequence

1. Add characterization tests for the public contracts being moved.
2. Extract cashflow presentation and callback modules, introduce the cashflow
   component, and delegate existing bot routes to it.
3. Extract the fund-budget presenter, model boundary, and component.
4. Extract the income-goal presenter and component, including income and
   reminder flows.
5. Reduce bot.js to update validation and feature routing.
6. Split finance classification and shared helpers into domain modules.
7. Split each ledger family behind the finance-ledger coordinator.
8. Move repository and adapters to their target directories while retaining
   top-level facades.
9. Move runtime, webhook, and coordinator wiring under app/ while keeping
   index.js as the Worker export surface.
10. Run checks and tests, inspect the import graph and diff, and update
    architecture documentation.

Every step must pass focused tests and the complete suite before the next step.
If a necessary behavior change appears, stop the refactor and design that
change separately.

## Testing Strategy

The 263 passing tests remain regression coverage. Add tests proving:

1. Every feature factory validates its required dependencies.
2. Every feature action performs its repository call, presentation, and
   Telegram send exactly once.
3. The router delegates every existing command and callback correctly.
4. Presenters return text and replyMarkup without external I/O.
5. Callback parsers preserve accepted and rejected formats and byte limits.
6. Domain modules do not import adapters, repositories, features, or
   Cloudflare APIs.
7. Compatibility facades retain existing named exports.
8. Existing exact output assertions remain unchanged.

Verification commands:

    cd cloudflare-worker
    npm run check
    npm test

No deployment or live-data claim is part of this refactor.

## Acceptance Criteria

- Cashflow, fund budget, and income goal each have an explicit feature
  component with the approved contract.
- bot.js is a router with no report fetching, calculation, or presentation.
- Domain modules have no infrastructure imports.
- Repositories return data rather than Telegram presentation objects.
- index.js remains the only Worker export surface and delegates composition.
- Existing imports work through compatibility facades.
- npm run check passes.
- All existing and new component-contract tests pass.
- The final diff contains no unrelated cleanup and preserves existing
  working-tree changes.
