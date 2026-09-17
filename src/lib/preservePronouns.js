const COMMON_PRONOUNS = [
  "ta", "ngươi", "mình", "tôi", "tớ", "cậu", "anh", "em", "chị", "cô", "chú", "bác",
  "ông", "bà", "con", "cháu", "huynh", "muội", "đệ", "tỷ", "nàng", "hắn", "y", "gã",
  "nó", "họ", "chúng ta", "chúng tôi", "chúng mình", "chúng tớ", "các ngươi", "các vị",
  "ngài", "thiếp", "bổn tọa", "bản tọa", "bổn vương", "bản vương", "trẫm", "thần", "thảo dân",
];

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function pronounSequence(text, rules = [], narrativeRules = [], glossaryTerms = []) {
  const words = new Set(COMMON_PRONOUNS);
  rules.forEach((rule) => [rule.self_word, rule.target_word].forEach((word) => word?.trim() && words.add(word.trim())));
  narrativeRules.forEach((rule) => rule.pronoun?.trim() && words.add(rule.pronoun.trim()));
  glossaryTerms.filter((term) => term.category === "Xưng hô").forEach((term) => {
    if (term.translation?.trim()) words.add(term.translation.trim());
  });
  const alternatives = [...words].sort((a, b) => b.length - a.length).map(escapeRegex).join("|");
  const regex = new RegExp(`(?<![\\p{L}\\p{N}_])(?:${alternatives})(?![\\p{L}\\p{N}_])`, "giu");
  return String(text || "").split("\n").map((line) =>
    [...line.matchAll(regex)].map((match) => match[0].normalize("NFC").toLocaleLowerCase("vi"))
  );
}

export function assertPronounsPreserved(source, result, rules = [], narrativeRules = [], glossaryTerms = []) {
  const before = pronounSequence(source, rules, narrativeRules, glossaryTerms);
  const after = pronounSequence(result, rules, narrativeRules, glossaryTerms);
  if (before.length !== after.length || before.some((line, index) =>
    line.length !== after[index].length || line.some((word, position) => word !== after[index][position])
  )) {
    throw new Error("AI đã đổi xưng hô hoặc số dòng. Bản Edit chưa được ghi; hãy kiểm tra QT và thử lại.");
  }
}
