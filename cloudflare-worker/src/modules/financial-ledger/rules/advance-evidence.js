import { REIMBURSEMENT_ACTIONS } from "./transaction-language.js";
import { positiveEvidenceText_, accountName_ } from "./evidence.js";
import { normalizeSearchText_ } from "../../shared/finance/shared.js";

export function isRentReserveTransfer_(row, categoryNamesById) {
  if (row.kind !== "transfer") return false;
  const category = normalizeSearchText_(accountName_(categoryNamesById, row.categoryId));
  const text = row.normalizedText || normalizeSearchText_(row.text || row.title);
  return category === "nha tro" || /\b(?:nha tro|tien phong)\b/.test(text);
}

export function matchingSourceStates_(row, states) {
  const text = row.normalizedText || normalizeSearchText_(row.text || [row.title, row.note].filter(Boolean).join(" | "));
  const beneficiaries = [...text.matchAll(new RegExp("\\b(?:" + REIMBURSEMENT_ACTIONS + ")\\s+(?:[\\d.,]+\\s*(?:d|dong)?\\s*)?(?:tien\\s+)?(?:cho\\s+)?(.+?)(?=\\s+(?:tu|bang|thanh toan)\\s+|[|;]|$)", "g"))]
    .map((match) => match[1].trim().replace(/[.,]+$/, ""));
  const named = [...states.values()].filter((state) => beneficiaries.includes(normalizeSearchText_(state.account.accountName)));
  if (named.length) return named
    .filter((state) => row.kind !== "transfer" || state.account.accountId === row.toAccountId)
    .map((state) => ({ state }));
  if (row.kind !== "transfer") return [];
  const destination = states.get(row.toAccountId);
  if (!destination) return [];
  const account = normalizeSearchText_(destination.account.accountName).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (row.fromAccountId === row.toAccountId) return [];
  const namesAnotherDebtAccount = [...states.values()].some((state) => {
    if (state === destination) return false;
    const name = normalizeSearchText_(state.account.accountName).replace(/[^a-z0-9 ]/g, "\\$&");
    return new RegExp("\\b(?:no|muon)(?:\\s+tien)?\\s+" + name + "\\b").test(text);
  });
  if (namesAnotherDebtAccount) return [];
  if (!new RegExp("\\bmuon(?:\\s+tien)?\\s+" + account + "\\b").test(text)) {
    return destination.obligations.some((obligation) => obligation.principal > obligation.repaid)
      ? [{ state: destination }] : [];
  }

  const noise = new Set(["tra", "lai", "tien", "no", "muon", "hom", "truoc", "ung", "cho", "cap", "bu", "hoan"]);
  const accountWords = new Set(normalizeSearchText_(destination.account.accountName).match(/[a-z0-9]+/g) || []);
  const words = (value) => (normalizeSearchText_(value).match(/[a-z0-9]+/g) || [])
    .filter((word) => !noise.has(word) && !accountWords.has(word));
  const repaymentWords = words(text);
  const phraseScore = (obligation) => {
    const debtWords = words(obligation.normalizedText);
    let best = 0;
    for (let left = 0; left < repaymentWords.length; left += 1) {
      for (let right = 0; right < debtWords.length; right += 1) {
        let length = 0;
        while (repaymentWords[left + length]
          && repaymentWords[left + length] === debtWords[right + length]) length += 1;
        best = Math.max(best, length);
      }
    }
    return best;
  };
  const ranked = destination.obligations
    .filter((obligation) => obligation.principal - obligation.repaid > 0)
    .map((obligation) => ({ obligation, score: phraseScore(obligation) }))
    .filter((entry) => entry.score >= 2)
    .sort((a, b) => b.score - a.score);
  if (!ranked.length || (ranked[1] && ranked[1].score === ranked[0].score)) return [];
  return [{ state: destination, openedBy: ranked[0].obligation.rowId }];
}

export function isExplicitAccountDebt_(row, state, categoryNamesById) {
  if (normalizeSearchText_(accountName_(categoryNamesById, row.categoryId)) === "vay va tra") return false;
  const account = normalizeSearchText_(state.account.accountName);
  const text = positiveEvidenceText_(row.normalizedText || normalizeSearchText_([row.title, row.note].filter(Boolean).join(" | ")));
  const note = normalizeSearchText_(row.note);
  return /\bung(?:\s+truoc)?\s+tien\b/.test(text)
    || (/\bno\b/.test(text) && (text.includes("no " + account) || /^no(?:\s+\d[\d.,]*(?:\s*(?:d|dong))?)?$/.test(note)));
}

export function isNetAppTarget_(row, otherIncomeCategoryNamesById) {
  const text = normalizeSearchText_([row.title, row.note,
    accountName_(otherIncomeCategoryNamesById, row.categoryId)].filter(Boolean).join(" | "));
  return /\b(?:thu nhap rong (?:grap|grab)|(?:grap|grab) thu nhap rong)\b/.test(text);
}

export function isCurrentMonthReceipt_(row, state, otherIncomeCategoryNamesById, passThroughKeywords, passThroughCategories) {
  const account = normalizeSearchText_(state.account.accountName);
  if (account !== "momo" && account !== "grap tien mat" && account !== "grab tien mat") return false;
  const text = positiveEvidenceText_(row.normalizedText || normalizeSearchText_([row.title, row.note].filter(Boolean).join(" | ")));
  if (isNetAppTarget_(row, otherIncomeCategoryNamesById)) return false;
  if (row.kind === "income") return true;
  const category = normalizeSearchText_(accountName_(otherIncomeCategoryNamesById, row.categoryId));
  if ((passThroughKeywords || []).some((word) => text.includes(normalizeSearchText_(word)))
    || (passThroughCategories || []).some((name) => category === normalizeSearchText_(name))) return false;
  if (/\b(?:vay|muon|hoan|tam ung|pass through)\b/.test(category)
    || /\b(?:vay|muon|hoan lai|tra no|cap bu|chi ho|ung ho)\b/.test(text)) return false;
  return category !== "" || /\b(?:grap|grab)\s+(?:qr|tien mat)\b/.test(text);
}
