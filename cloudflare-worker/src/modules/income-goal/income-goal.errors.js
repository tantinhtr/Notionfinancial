export class AmbiguousIncomeWriteError extends Error {
  constructor(updateId, { cause } = {}) {
    super(
      "Income write outcome is ambiguous and requires reconciliation",
      cause === undefined ? undefined : { cause }
    );
    this.name = "AmbiguousIncomeWriteError";
    this.code = "AMBIGUOUS_INCOME_WRITE";
    this.updateId = updateId;
  }
}
