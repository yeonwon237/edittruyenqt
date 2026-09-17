const COMMON_PRONOUNS = [
  "ta", "ngươi", "mình", "tôi", "tớ", "cậu", "anh", "em", "chị", "cô", "chú", "bác",
  "ông", "bà", "con", "cháu", "huynh", "muội", "đệ", "tỷ", "nàng", "hắn", "y", "gã",
  "nó", "họ", "chúng ta", "chúng tôi", "chúng mình", "chúng tớ", "các ngươi", "các vị",
  "ngài", "thiếp", "bổn tọa", "bản tọa", "bổn vương", "bản vương", "trẫm", "thần", "thảo dân",
];

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function pronounRegex(rules = [], narrativeRules = [], glossaryTerms = []) {
  const words = new Set(COMMON_PRONOUNS);
  rules.forEach((rule) => [rule.self_word, rule.target_word].forEach((word) => word?.trim() && words.add(word.trim())));
  narrativeRules.forEach((rule) => rule.pronoun?.trim() && words.add(rule.pronoun.trim()));
  glossaryTerms.filter((term) => term.category === "Xưng hô").forEach((term) => {
    if (term.translation?.trim()) words.add(term.translation.trim());
  });
  const alternatives = [...words].sort((a, b) => b.length - a.length).map(escapeRegex).join("|");
  return new RegExp(`(?<![\\p{L}\\p{N}_])(?:${alternatives})(?![\\p{L}\\p{N}_])`, "giu");
}

export function protectPronouns(text, rules = [], narrativeRules = [], glossaryTerms = []) {
  const tokens = [];
  const protectedText = String(text || "").replace(pronounRegex(rules, narrativeRules, glossaryTerms), (word) => {
    const marker = `⟦XH${tokens.length + 1}⟧`;
    tokens.push({ marker, word });
    return marker;
  });
  return { text: protectedText, tokens };
}

export function restoreProtectedPronouns(result, tokens) {
  const markers = [...String(result || "").matchAll(/⟦XH\d+⟧/g)].map((match) => match[0]);
  const complete = markers.length === tokens.length && markers.every((marker, index) => marker === tokens[index].marker);
  const byMarker = new Map(tokens.map((token) => [token.marker, token.word]));
  let index = 0;
  const text = String(result || "").replace(/⟦XH\d+⟧/g, (marker) => {
    const word = markers.length === tokens.length ? tokens[index]?.word : byMarker.get(marker);
    index += 1;
    return word || marker;
  });
  return { text, complete };
}
