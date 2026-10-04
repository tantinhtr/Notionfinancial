import { normalizeSearchText_ } from "../../shared/finance/shared.js";
const DEBT_TARGET_STOP_WORDS_ = new Set(['quy', 'tien', 'thang', 'nam']);

function debtTargetPhraseScore_(source, target) {
  const words = normalizeSearchText_(source).match(/[a-z0-9]+/g) || [];
  const targetWords = normalizeSearchText_(target).match(/[a-z0-9]+/g) || [];
  const haystack = ' ' + targetWords.join(' ') + ' ';
  for (let size = words.length; size >= 1; size -= 1) {
    for (let start = 0; start + size <= words.length; start += 1) {
      const phraseWords = words.slice(start, start + size);
      if (
        phraseWords.every(
          (word) => DEBT_TARGET_STOP_WORDS_.has(word) || /^\d+$/.test(word),
        )
      )
        continue;
      if (haystack.includes(' ' + phraseWords.join(' ') + ' ')) return size;
    }
  }
  return 0;
}

export function debtTargetChildName_(debtText, candidates) {
  let bestScore = 0;
  let matches = [];
  for (const candidate of candidates) {
    let score = 0;
    for (const source of candidate.sources) {
      score = Math.max(score, debtTargetPhraseScore_(source, debtText));
    }
    if (score > bestScore) {
      bestScore = score;
      matches = [candidate.name];
    } else if (score > 0 && score === bestScore) {
      matches.push(candidate.name);
    }
  }
  return matches.length === 1 ? matches[0] : '';
}
