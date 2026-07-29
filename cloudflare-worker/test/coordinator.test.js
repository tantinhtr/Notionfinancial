import test from "node:test";
import assert from "node:assert/strict";
import { createCoordinatorHandler } from "../src/coordinator.js";

function createStorage(initialRecord = null) {
  const values = new Map();
  if (initialRecord !== null) {
    values.set("record", structuredClone(initialRecord));
  }
  const puts = [];
  return {
    puts,
    async get(key) {
      const value = values.get(key);
      return value === undefined ? undefined : structuredClone(value);
    },
    async put(key, value) {
      puts.push([key, structuredClone(value)]);
      values.set(key, structuredClone(value));
    },
    record() {
      const value = values.get("record");
      return value === undefined ? undefined : structuredClone(value);
    }
  };
}

function createDependencies(overrides = {}) {
  return {
    storage: createStorage(),
    runExclusive: (callback) => callback(),
    classifyUpdate: () => "other",
    executeUpdate: async () => {},
    reconcileIncome: async () => null,
    warnNeedsReconciliation: async () => {},
    now: () => "2026-07-29T00:00:00.000Z",
    ...overrides
  };
}

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function createMutex() {
  let tail = Promise.resolve();
  return (callback) => {
    const previous = tail;
    const release = createDeferred();
    tail = release.promise;
    return previous.then(callback).finally(release.resolve);
  };
}

function ambiguousIncomeError() {
  const error = new Error("redacted ambiguous write");
  error.code = "AMBIGUOUS_INCOME_WRITE";
  return error;
}

test("coordinator validates every dependency when the factory is created", () => {
  const dependencies = createDependencies();
  for (const name of [
    "storage",
    "runExclusive",
    "classifyUpdate",
    "executeUpdate",
    "reconcileIncome",
    "warnNeedsReconciliation",
    "now"
  ]) {
    const invalid = { ...dependencies, [name]: undefined };
    assert.throws(() => createCoordinatorHandler(invalid), TypeError, name);
  }
  assert.throws(
    () => createCoordinatorHandler(createDependencies({ storage: { get() {} } })),
    /storage\.put/
  );
});

test("coordinator rejects updates without a finite numeric update_id", async () => {
  let exclusiveCalls = 0;
  const coordinator = createCoordinatorHandler(createDependencies({
    runExclusive(callback) {
      exclusiveCalls += 1;
      return callback();
    }
  }));

  for (const update of [
    null,
    {},
    { update_id: "123" },
    { update_id: Number.NaN },
    { update_id: Number.POSITIVE_INFINITY }
  ]) {
    await assert.rejects(() => coordinator.handle(update), /finite numeric update_id/);
  }
  assert.equal(exclusiveCalls, 0);
});

test("two concurrent calls for one update serialize async execution and commit once", async () => {
  const storage = createStorage();
  const executionStarted = createDeferred();
  const releaseExecution = createDeferred();
  let executeCalls = 0;
  let classifyCalls = 0;
  const coordinator = createCoordinatorHandler(createDependencies({
    storage,
    runExclusive: createMutex(),
    classifyUpdate() {
      classifyCalls += 1;
      return "other";
    },
    async executeUpdate() {
      executeCalls += 1;
      executionStarted.resolve();
      await releaseExecution.promise;
    }
  }));
  const update = { update_id: 101, message: { text: "thu 500000" } };

  const first = coordinator.handle(update);
  const second = coordinator.handle(update);
  await executionStarted.promise;

  assert.equal(executeCalls, 1);
  releaseExecution.resolve();
  const results = await Promise.all([first, second]);

  assert.deepEqual(results, [
    { status: "committed" },
    { status: "committed", duplicate: true }
  ]);
  assert.equal(classifyCalls, 1);
  assert.equal(executeCalls, 1);
  assert.deepEqual(storage.record(), {
    updateId: 101,
    kind: "other",
    status: "committed",
    updatedAt: "2026-07-29T00:00:00.000Z"
  });
});

test("a committed update never classifies, executes, reconciles, or warns again", async () => {
  const storage = createStorage({
    updateId: 102,
    kind: "income",
    status: "committed",
    updatedAt: "2026-07-28T00:00:00.000Z"
  });
  const calls = [];
  const coordinator = createCoordinatorHandler(createDependencies({
    storage,
    classifyUpdate() {
      calls.push("classify");
      return "income";
    },
    async executeUpdate() {
      calls.push("execute");
    },
    async reconcileIncome() {
      calls.push("reconcile");
      return { id: "existing" };
    },
    async warnNeedsReconciliation() {
      calls.push("warn");
    }
  }));

  const result = await coordinator.handle({ update_id: 102 });

  assert.deepEqual(result, { status: "committed", duplicate: true });
  assert.deepEqual(calls, []);
  assert.deepEqual(storage.puts, []);
});

test("persistent records contain only coordination metadata", async () => {
  const storage = createStorage();
  const coordinator = createCoordinatorHandler(createDependencies({
    storage,
    classifyUpdate: () => "income"
  }));

  await coordinator.handle({
    update_id: 103,
    message: {
      text: "thu 987654",
      token: "telegram-secret"
    }
  });

  assert.equal(storage.puts.length, 2);
  for (const [key, record] of storage.puts) {
    assert.equal(key, "record");
    assert.deepEqual(Object.keys(record).sort(), [
      "kind",
      "status",
      "updateId",
      "updatedAt"
    ]);
    assert.doesNotMatch(JSON.stringify(record), /987654|telegram-secret|message|text|amount/);
  }
});

test("an ordinary execution failure becomes retryable and a later call executes", async () => {
  const storage = createStorage();
  const failure = new Error("temporary failure");
  let executeCalls = 0;
  const coordinator = createCoordinatorHandler(createDependencies({
    storage,
    async executeUpdate() {
      executeCalls += 1;
      if (executeCalls === 1) {
        throw failure;
      }
    }
  }));
  const update = { update_id: 104 };

  await assert.rejects(() => coordinator.handle(update), (error) => error === failure);
  assert.equal(storage.record().status, "retryable");

  const result = await coordinator.handle(update);

  assert.deepEqual(result, { status: "committed" });
  assert.equal(executeCalls, 2);
  assert.deepEqual(storage.puts.map(([, record]) => record.status), [
    "in_progress",
    "retryable",
    "in_progress",
    "committed"
  ]);
});

test("an interrupted in_progress non-income update is marked retryable then executes", async () => {
  const storage = createStorage({
    updateId: 105,
    kind: "other",
    status: "in_progress",
    updatedAt: "2026-07-28T00:00:00.000Z"
  });
  let executeCalls = 0;
  const coordinator = createCoordinatorHandler(createDependencies({
    storage,
    async executeUpdate() {
      executeCalls += 1;
    }
  }));

  const result = await coordinator.handle({ update_id: 105 });

  assert.deepEqual(result, { status: "committed" });
  assert.equal(executeCalls, 1);
  assert.deepEqual(storage.puts.map(([, record]) => record.status), [
    "retryable",
    "in_progress",
    "committed"
  ]);
});

test("an ambiguous income create reconciles to committed when the row exists", async () => {
  const storage = createStorage();
  const error = ambiguousIncomeError();
  const reconciledRow = { id: "notion-page" };
  const reconciledUpdateIds = [];
  const coordinator = createCoordinatorHandler(createDependencies({
    storage,
    classifyUpdate: () => "income",
    executeUpdate: async () => {
      throw error;
    },
    async reconcileIncome(updateId) {
      reconciledUpdateIds.push(updateId);
      return reconciledRow;
    }
  }));

  const result = await coordinator.handle({ update_id: 106 });

  assert.deepEqual(result, { status: "committed", reconciled: true });
  assert.deepEqual(reconciledUpdateIds, [106]);
  assert.deepEqual(storage.puts.map(([, record]) => record.status), [
    "in_progress",
    "committed"
  ]);
});

test("an ambiguous income create with no row needs reconciliation and warns once", async () => {
  const storage = createStorage();
  const error = ambiguousIncomeError();
  const update = { update_id: 107, message: { text: "thu 100" } };
  const warnings = [];
  const coordinator = createCoordinatorHandler(createDependencies({
    storage,
    classifyUpdate: () => "income",
    executeUpdate: async () => {
      throw error;
    },
    reconcileIncome: async () => null,
    async warnNeedsReconciliation(warnedUpdate, warnedError) {
      warnings.push([warnedUpdate, warnedError]);
    }
  }));

  const result = await coordinator.handle(update);

  assert.deepEqual(result, { status: "needs_reconciliation" });
  assert.equal(storage.record().status, "needs_reconciliation");
  assert.deepEqual(warnings, [[update, error]]);
});

test("a later needs_reconciliation call reconciles only and never executes", async () => {
  const storage = createStorage({
    updateId: 108,
    kind: "income",
    status: "needs_reconciliation",
    updatedAt: "2026-07-28T00:00:00.000Z"
  });
  let classifyCalls = 0;
  let executeCalls = 0;
  let warnCalls = 0;
  const coordinator = createCoordinatorHandler(createDependencies({
    storage,
    classifyUpdate() {
      classifyCalls += 1;
      return "income";
    },
    async executeUpdate() {
      executeCalls += 1;
    },
    reconcileIncome: async () => ({ id: "existing-page" }),
    async warnNeedsReconciliation() {
      warnCalls += 1;
    }
  }));

  const result = await coordinator.handle({ update_id: 108 });

  assert.deepEqual(result, { status: "committed", reconciled: true });
  assert.equal(classifyCalls, 0);
  assert.equal(executeCalls, 0);
  assert.equal(warnCalls, 0);
  assert.deepEqual(storage.puts.map(([, record]) => record.status), ["committed"]);
});

test("a reconciliation error remains needs_reconciliation and warns with that error", async () => {
  const storage = createStorage({
    updateId: 109,
    kind: "income",
    status: "needs_reconciliation",
    updatedAt: "2026-07-28T00:00:00.000Z"
  });
  const reconciliationError = new Error("Notion unavailable");
  const warnings = [];
  const coordinator = createCoordinatorHandler(createDependencies({
    storage,
    async reconcileIncome() {
      throw reconciliationError;
    },
    async warnNeedsReconciliation(update, error) {
      warnings.push([update, error]);
    }
  }));
  const update = { update_id: 109 };

  const result = await coordinator.handle(update);

  assert.deepEqual(result, { status: "needs_reconciliation" });
  assert.equal(storage.record().status, "needs_reconciliation");
  assert.deepEqual(warnings, [[update, reconciliationError]]);
});

test("a warning failure preserves needs_reconciliation and never recreates income", async () => {
  const storage = createStorage();
  let executeCalls = 0;
  let reconcileCalls = 0;
  let warnCalls = 0;
  const coordinator = createCoordinatorHandler(createDependencies({
    storage,
    classifyUpdate: () => "income",
    async executeUpdate() {
      executeCalls += 1;
      throw ambiguousIncomeError();
    },
    async reconcileIncome() {
      reconcileCalls += 1;
      return null;
    },
    async warnNeedsReconciliation() {
      warnCalls += 1;
      throw new Error("Telegram unavailable");
    }
  }));
  const update = { update_id: 110 };

  assert.deepEqual(
    await coordinator.handle(update),
    { status: "needs_reconciliation" }
  );
  assert.deepEqual(
    await coordinator.handle(update),
    { status: "needs_reconciliation" }
  );

  assert.equal(executeCalls, 1);
  assert.equal(reconcileCalls, 2);
  assert.equal(warnCalls, 2);
  assert.equal(storage.record().status, "needs_reconciliation");
});

test("an interrupted in_progress income reconciles without execution", async () => {
  const storage = createStorage({
    updateId: 111,
    kind: "income",
    status: "in_progress",
    updatedAt: "2026-07-28T00:00:00.000Z"
  });
  let executeCalls = 0;
  let reconcileCalls = 0;
  const coordinator = createCoordinatorHandler(createDependencies({
    storage,
    async executeUpdate() {
      executeCalls += 1;
    },
    async reconcileIncome(updateId) {
      reconcileCalls += 1;
      assert.equal(updateId, 111);
      return { id: "existing-page" };
    }
  }));

  const result = await coordinator.handle({ update_id: 111 });

  assert.deepEqual(result, { status: "committed", reconciled: true });
  assert.equal(executeCalls, 0);
  assert.equal(reconcileCalls, 1);
  assert.deepEqual(storage.puts.map(([, record]) => record.status), ["committed"]);
});
