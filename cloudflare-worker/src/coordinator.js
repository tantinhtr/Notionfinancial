function validateDependencies({
  storage,
  runExclusive,
  classifyUpdate,
  executeUpdate,
  reconcileIncome,
  completeReconciledIncome,
  warnNeedsReconciliation,
  now
}) {
  for (const method of ["get", "put"]) {
    if (typeof storage?.[method] !== "function") {
      throw new TypeError(`storage.${method} must be a function`);
    }
  }
  for (const [name, dependency] of Object.entries({
    runExclusive,
    classifyUpdate,
    executeUpdate,
    reconcileIncome,
    completeReconciledIncome,
    warnNeedsReconciliation,
    now
  })) {
    if (typeof dependency !== "function") {
      throw new TypeError(`${name} must be a function`);
    }
  }
}

export function createCoordinatorHandler(dependencies) {
  validateDependencies(dependencies);
  const {
    storage,
    runExclusive,
    classifyUpdate,
    executeUpdate,
    reconcileIncome,
    completeReconciledIncome,
    warnNeedsReconciliation,
    now
  } = dependencies;

  function persist(updateId, kind, status) {
    return storage.put("record", {
      updateId,
      kind,
      status,
      updatedAt: now()
    });
  }

  async function reconcile(update, kind, warningError) {
    let row = null;
    try {
      row = await reconcileIncome(update.update_id);
    } catch (error) {
      warningError = error;
    }

    if (row !== null) {
      try {
        await completeReconciledIncome(update);
      } catch (error) {
        await persist(update.update_id, kind, "needs_reconciliation");
        try {
          await warnNeedsReconciliation(update, error);
        } catch {
          // Completion failures remain retryable even if warning delivery fails.
        }
        throw error;
      }
      await persist(update.update_id, kind, "committed");
      return { status: "committed", reconciled: true };
    }

    await persist(update.update_id, kind, "needs_reconciliation");
    try {
      await warnNeedsReconciliation(update, warningError);
    } catch {
      // Warning delivery must never reopen or recreate an ambiguous income write.
    }
    return { status: "needs_reconciliation" };
  }

  async function executeNormally(update) {
    const updateId = update.update_id;
    const kind = classifyUpdate(update);
    await persist(updateId, kind, "in_progress");
    try {
      await executeUpdate(update);
    } catch (error) {
      if (error?.code === "AMBIGUOUS_INCOME_WRITE") {
        return reconcile(update, kind, error);
      }
      await persist(updateId, kind, "retryable");
      throw error;
    }
    await persist(updateId, kind, "committed");
    return { status: "committed" };
  }

  return {
    async handle(update) {
      if (typeof update?.update_id !== "number" || !Number.isFinite(update.update_id)) {
        throw new TypeError("update must provide a finite numeric update_id");
      }
      return runExclusive(async () => {
        const record = await storage.get("record");
        if (record?.status === "committed") {
          return { status: "committed", duplicate: true };
        }
        if (record === undefined || record === null || record.status === "retryable") {
          return executeNormally(update);
        }
        if (record.status === "needs_reconciliation") {
          return reconcile(update, record.kind);
        }
        if (record.status === "in_progress" && record.kind === "income") {
          return reconcile(update, record.kind);
        }
        if (record.status === "in_progress" && record.kind !== "income") {
          await persist(update.update_id, record.kind, "retryable");
          return executeNormally(update);
        }
        throw new Error(`Unsupported coordinator status: ${record.status}`);
      });
    }
  };
}
