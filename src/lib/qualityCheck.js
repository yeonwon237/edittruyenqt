const CJK_RUN_REGEX = /[一-鿿㐀-䶿]+/g;
const ASCII_WORD_REGEX = /(?<!\p{L})[A-Za-z][A-Za-z'’-]{1,}(?!\p{L})/gu;
const CAPITALIZED_NAME_REGEX = /\p{Lu}[\p{L}'’-]*(?:[ \t]+\p{Lu}[\p{L}'’-]*){1,3}/gu;

// A deliberately conservative list: QA should miss an obscure word rather
// than flood a Vietnamese chapter with false positives. This can grow from
// real user reports without changing the scanner contract.
const ENGLISH_WORDS = new Set(`
about after again against almost already although always another answer anything
around because before behind between brother business called cannot chapter
child children close come could daughter different door down during early enough
even every everyone everything family father finally first friend from girl give
good great happen have hello help here herself himself house however inside just
keep know last later leave left life little look love made make many maybe mother
much must name never next night nothing now often once only other people perhaps
please really right room said same saw school second see seemed should since sister
something still suddenly take than thank that their them then there these thing
think this those though through time together too under until very want water way
well were what when where which while who why will with without woman words world
would yes young boss manager master miss mister lady lord okay ok sorry thanks
phone computer email online offline game system level skill status error warning
loading save saved delete edit translate translation source target prompt result
chapter title content text start stop continue end complete completed
danger dangerous dangered dangerzone risk risky safe safety attack enemy kill
dead death blood hurt pain fight fighting run escape save warning careful
`.trim().split(/\s+/));

const VIETNAMESE_ASCII_WORDS = new Set(`
ai anh ba ban bay bi bo ca cai can chi cho chu co con cung da dang day de den di
do du duoc em gi ha hai hay he hon ho khi kia lai lam lan len lo luc ma may me minh
mot nam nang nay nghe nguoi nhu nhung noi nua o ong qua ra rang roi sau se ta tai
tam ten theo thi thoi toi trong tu va van ve vi voi vua xa xin
`.trim().split(/\s+/));

const ENGLISH_SUGGESTIONS = {
  suddenly: "đột nhiên", however: "tuy nhiên", although: "mặc dù",
  because: "bởi vì", perhaps: "có lẽ", finally: "cuối cùng",
  brother: "anh trai", sister: "chị/em gái", father: "cha", mother: "mẹ",
  daughter: "con gái", friend: "bạn", boss: "ông chủ", manager: "quản lý",
  master: "chủ nhân", miss: "cô", mister: "ông", lady: "quý cô",
  hello: "xin chào", sorry: "xin lỗi", thanks: "cảm ơn", please: "làm ơn",
  yes: "vâng", no: "không"
};

const SPEECH_VERBS = "nói|hỏi|đáp|trả lời|lên tiếng|thì thầm|quát|gọi|cười nói|tiếp lời";
const SELF_PRONOUNS = new Set(["ta", "tôi", "mình", "trẫm", "bổn vương", "bổn tọa", "bổn cung", "bản thân"]);

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const normalize = (value) => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/gi, "d").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

function contextAt(text, start, end) {
  const lineStart = text.lastIndexOf("\n", start - 1) + 1;
  const nextBreak = text.indexOf("\n", end);
  const lineEnd = nextBreak === -1 ? text.length : nextBreak;
  const rawLine = text.slice(lineStart, lineEnd);
  const leading = rawLine.length - rawLine.trimStart().length;
  const trailing = rawLine.length - rawLine.trimEnd().length;
  const trimmedStart = lineStart + leading;
  const trimmedEnd = lineEnd - trailing;
  const maxContext = 360;
  let contextStart = trimmedStart;
  let contextEnd = trimmedEnd;
  if (contextEnd - contextStart > maxContext) {
    contextStart = Math.max(trimmedStart, start - 170);
    contextEnd = Math.min(trimmedEnd, contextStart + maxContext);
    if (contextEnd < end) {
      contextEnd = Math.min(trimmedEnd, end + 170);
      contextStart = Math.max(trimmedStart, contextEnd - maxContext);
    }
  }
  const line = text.slice(contextStart, contextEnd);
  const lineNumber = text.slice(0, start).split("\n").length;
  return {
    context: line,
    contextStart,
    contextEnd,
    contextTargetStart: start - contextStart,
    contextTargetEnd: end - contextStart,
    contextClippedBefore: contextStart > trimmedStart,
    contextClippedAfter: contextEnd < trimmedEnd,
    line: lineNumber,
  };
}

function makeIssue(text, data) {
  return { id: `${data.type}-${data.start}-${data.value}`, ...contextAt(text, data.start, data.end), ...data };
}

function levenshtein(a, b) {
  const previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    let diagonal = previous[0];
    previous[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const old = previous[j];
      previous[j] = Math.min(previous[j] + 1, previous[j - 1] + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1));
      diagonal = old;
    }
  }
  return previous[b.length];
}

function glossaryAliases(terms) {
  const values = new Set();
  (terms || []).forEach((term) => {
    [term.translation, ...Object.values(term.custom_fields || {})].forEach((value) => {
      String(value || "").split(/[,;|/]/).map((part) => normalize(part)).filter(Boolean).forEach((part) => values.add(part));
    });
  });
  return values;
}

function splitSuggestions(value) {
  return String(value || "").split(/[,;|/]/).map((part) => part.trim()).filter(Boolean);
}

function quoteAt(text, position) {
  const regex = /[“"]([^”"]+)[”"]/gu;
  for (const match of text.matchAll(regex)) {
    const start = match.index + 1;
    const end = start + match[1].length;
    if (position >= start && position < end) return { text: match[1], start, end };
  }
  return null;
}

function matrixSuggestionAt(text, start, end, rules) {
  const quote = quoteAt(text, start);
  const validRules = (rules || []).filter((rule) =>
    rule?.speaker?.trim() && rule?.self_word?.trim() && rule?.target_word?.trim()
  );
  const allSuggestions = [...new Set(validRules.flatMap((rule) => [rule.self_word.trim(), rule.target_word.trim()]))];
  if (!quote || !validRules.length) return { suggestions: allSuggestions, detail: "Không xác định được câu thoại hoặc người nói; hãy chọn thủ công." };

  const nearbyStart = Math.max(0, quote.start - 120);
  const nearbyEnd = Math.min(text.length, quote.end + 120);
  const nearby = text.slice(nearbyStart, nearbyEnd);
  const speakers = [...new Set(validRules.map((rule) => rule.speaker.trim()))];
  const speaker = speakers.find((name) => {
    const escaped = escapeRegex(name);
    const beforePattern = new RegExp(`${escaped}[^“”"]{0,70}(?:${SPEECH_VERBS})[^“”"]{0,25}[“"]`, "iu");
    const afterPattern = new RegExp(`[”"][^“”"]{0,35}${escaped}[^“”"]{0,35}(?:${SPEECH_VERBS})`, "iu");
    return beforePattern.test(nearby) || afterPattern.test(nearby);
  });
  if (!speaker) return { suggestions: allSuggestions, detail: "Chưa nhận ra người nói trong câu này; hãy chọn thủ công." };

  const speakerRules = validRules.filter((rule) => rule.speaker.trim() === speaker);
  const specificRule = speakerRules.find((rule) => {
    const listener = rule.listener?.trim();
    return listener && listener !== "*" && nearby.includes(listener);
  });
  const defaultRule = speakerRules.find((rule) => !rule.listener?.trim() || rule.listener.trim() === "*");
  const rule = specificRule || defaultRule || (speakerRules.length === 1 ? speakerRules[0] : null);
  const speakerSuggestions = [...new Set(speakerRules.flatMap((item) => [item.self_word.trim(), item.target_word.trim()]))];
  if (!rule) return { suggestions: speakerSuggestions, detail: `Đã nhận ra ${speaker} nhưng chưa xác định được người nghe.` };

  const relativeStart = start - quote.start;
  const before = quote.text.slice(0, relativeStart);
  const after = quote.text.slice(relativeStart + (end - start));
  const selfWordBefore = new RegExp(`(?:^|[^\\p{L}])${escapeRegex(rule.self_word.trim())}(?=$|[^\\p{L}])`, "iu").test(before);
  const targetCue = /(?:với|cho|gọi|hỏi|bảo|nhờ|giúp|cứu|đợi|chờ|tìm|theo|của|đến|về|nhìn|thấy|yêu|ghét)\s*$/iu.test(before);
  const startsStatement = !before.trim() && !/^\s*[,!:?]/u.test(after);
  const vocative = (!before.trim() && /^\s*[,!:?]/u.test(after)) || targetCue;
  const role = startsStatement && !vocative ? "self" : (vocative || selfWordBefore ? "target" : "unknown");
  const listenerLabel = rule.listener?.trim() && rule.listener.trim() !== "*" ? rule.listener.trim() : "mọi người";
  if (role === "self") {
    return { replacement: rule.self_word.trim(), suggestions: speakerSuggestions, detail: `${speaker} đang tự xưng khi nói với ${listenerLabel}.` };
  }
  if (role === "target") {
    return { replacement: rule.target_word.trim(), suggestions: speakerSuggestions, detail: `${speaker} đang gọi người nghe (${listenerLabel}).` };
  }
  return { suggestions: speakerSuggestions, detail: `Đã nhận ra người nói là ${speaker}, nhưng vai trò của từ này chưa chắc chắn.` };
}

function scanGlossaryRules(text, terms, pronounRules) {
  const occupied = [];
  const seenRules = new Set();
  const validTerms = (terms || [])
    .map((term) => ({
      source: String(term.source_term || "").trim(),
      target: String(term.translation || "").trim(),
      category: term.category || "Khác",
      customFields: term.custom_fields || {},
    }))
    .filter(({ source, target }) => source && target && source !== target)
    .sort((a, b) => b.source.length - a.source.length);

  const issues = [];
  validTerms.forEach(({ source, target, category, customFields }) => {
    const ruleKey = source.toLocaleLowerCase("vi");
    if (seenRules.has(ruleKey)) return;
    seenRules.add(ruleKey);

    const startsWithWord = /^[\p{L}\p{N}]/u.test(source);
    const endsWithWord = /[\p{L}\p{N}]$/u.test(source);
    const pattern = `${startsWithWord ? "(?<![\\p{L}\\p{N}])" : ""}${escapeRegex(source)}${endsWithWord ? "(?![\\p{L}\\p{N}])" : ""}`;
    const regex = new RegExp(pattern, "giu");
    const capitalizationOnly = source.toLocaleLowerCase("vi") === target.toLocaleLowerCase("vi");

    for (const match of text.matchAll(regex)) {
      const value = match[0];
      const start = match.index;
      const end = start + value.length;
      if (capitalizationOnly && value === target) continue;
      if (occupied.some(([from, to]) => start < to && end > from)) continue;
      occupied.push([start, end]);
      const contextual = customFields.__qa_mode === "contextual" || (customFields.__qa_mode !== "strict" && category === "Xưng hô");
      const configuredSuggestions = [target, ...splitSuggestions(customFields.__qa_alternatives)];
      const matrix = contextual ? matrixSuggestionAt(text, start, end, pronounRules) : null;
      const suggestions = [...new Set([...configuredSuggestions, ...(matrix?.suggestions || [])])];
      issues.push(makeIssue(text, {
        type: "glossary",
        severity: "high",
        label: "Chưa theo quy tắc Glossary",
        value,
        replacement: matrix?.replacement || target,
        suggestions,
        contextual,
        detail: contextual
          ? `${category}: “${source}” cần xét theo ngữ cảnh. ${matrix?.detail || ""}`.trim()
          : `${category}: Glossary quy định “${source}” → “${target}”`,
        start,
        end,
      }));
    }
  });
  return issues;
}

function scanCjk(text, terms) {
  const translations = new Map((terms || []).map((term) => [term.source_term, term.translation]));
  return [...text.matchAll(CJK_RUN_REGEX)].map((match) => makeIssue(text, {
    type: "cjk", severity: "high", label: "Ký tự Hán/Trung còn sót",
    value: match[0], replacement: translations.get(match[0]) || "",
    start: match.index, end: match.index + match[0].length
  }));
}

function scanEnglish(text, terms) {
  const glossary = glossaryAliases(terms);
  return [...text.matchAll(ASCII_WORD_REGEX)].flatMap((match) => {
    const lower = match[0].toLowerCase();
    if (!ENGLISH_WORDS.has(lower) || VIETNAMESE_ASCII_WORDS.has(lower) || glossary.has(normalize(match[0]))) return [];
    return [makeIssue(text, {
      type: "english", severity: "medium", label: "Từ tiếng Anh nghi vấn",
      value: match[0], replacement: ENGLISH_SUGGESTIONS[lower] || "",
      start: match.index, end: match.index + match[0].length
    })];
  });
}

function scanNames(text, terms) {
  const nameTerms = (terms || []).filter((term) => ["Tên người", "Địa danh"].includes(term.category) && term.translation?.trim());
  const canonicals = nameTerms.map((term) => ({ value: term.translation.trim(), normalized: normalize(term.translation) }));
  if (!canonicals.length) return [];
  const aliases = glossaryAliases(nameTerms);
  const directIssues = [];
  const occupied = [];

  // Glossary is authoritative: if its exact source form survives in the
  // edited Vietnamese text, suggest the configured translation immediately.
  nameTerms.forEach((term) => {
    const source = term.source_term?.trim();
    const target = term.translation.trim();
    if (!source || source === target || CJK_RUN_REGEX.test(source)) {
      CJK_RUN_REGEX.lastIndex = 0;
      return;
    }
    CJK_RUN_REGEX.lastIndex = 0;
    let from = 0;
    while (from < text.length) {
      const start = text.indexOf(source, from);
      if (start === -1) break;
      const end = start + source.length;
      directIssues.push(makeIssue(text, {
        type: "name", severity: "high", label: "Tên chưa theo Glossary",
        value: source, replacement: target, detail: `Glossary quy định “${source}” → “${target}”`, start, end
      }));
      occupied.push([start, end]);
      from = end;
    }
  });

  // Catch capitalization-only mistakes in the canonical translated name.
  canonicals.forEach((canonical) => {
    const regex = new RegExp(`(?<!\\p{L})${escapeRegex(canonical.value)}(?!\\p{L})`, "giu");
    for (const match of text.matchAll(regex)) {
      if (match[0] === canonical.value || occupied.some(([a, b]) => match.index < b && match.index + match[0].length > a)) continue;
      const start = match.index, end = start + match[0].length;
      directIssues.push(makeIssue(text, {
        type: "name", severity: "high", label: "Tên viết hoa chưa đúng",
        value: match[0], replacement: canonical.value, detail: `Tên chuẩn trong Glossary là “${canonical.value}”`, start, end
      }));
      occupied.push([start, end]);
    }
  });

  const fuzzyIssues = [...text.matchAll(CAPITALIZED_NAME_REGEX)].flatMap((match) => {
    const candidate = match[0].trim();
    const normalizedCandidate = normalize(candidate);
    if (aliases.has(normalizedCandidate) || occupied.some(([a, b]) => match.index < b && match.index + match[0].length > a)) return [];
    let closest = null;
    for (const canonical of canonicals) {
      if (canonical.normalized.split(" ").length !== normalizedCandidate.split(" ").length) continue;
      const distance = levenshtein(normalizedCandidate, canonical.normalized);
      const limit = canonical.normalized.length >= 10 ? 2 : 1;
      if (distance > 0 && distance <= limit && (!closest || distance < closest.distance)) closest = { ...canonical, distance };
    }
    if (!closest) return [];
    return [makeIssue(text, {
      type: "name", severity: "high", label: "Tên có thể viết sai",
      value: candidate, replacement: closest.value, detail: `Gần với tên chuẩn “${closest.value}” trong Glossary`,
      start: match.index, end: match.index + match[0].length
    })];
  });
  return [...directIssues, ...fuzzyIssues];
}

function scanPronouns(text, rules) {
  const validRules = (rules || []).filter((rule) => rule.speaker?.trim() && rule.self_word?.trim());
  const issues = [];
  const speakers = [...new Set(validRules.map((rule) => rule.speaker.trim()))];
  let offset = 0;
  text.split("\n").forEach((line) => {
    speakers.forEach((speaker) => {
      const attribution = new RegExp(`${escapeRegex(speaker)}[^“”\"]{0,70}(?:${SPEECH_VERBS})[^“”\"]{0,20}[“\"]([^”\"]+)[”\"]`, "iu");
      const matched = line.match(attribution);
      if (!matched) return;
      const quote = matched[1];
      const quoteStart = offset + matched.index + matched[0].indexOf(quote);
      const speakerRules = validRules.filter((item) => item.speaker.trim() === speaker);
      const allowedSelfWords = [...new Set(speakerRules.map((item) => item.self_word.trim()))];
      const allowedSelf = new Set(allowedSelfWords.map(normalize));
      const uniqueSuggestion = allowedSelfWords.length === 1 ? allowedSelfWords[0] : "";
      SELF_PRONOUNS.forEach((pronoun) => {
        const regex = new RegExp(`(^|[^\\p{L}])(${escapeRegex(pronoun)})(?=$|[^\\p{L}])`, "giu");
        for (const pronounMatch of quote.matchAll(regex)) {
          const found = pronounMatch[2];
          if (allowedSelf.has(normalize(found))) continue;
          const start = quoteStart + pronounMatch.index + pronounMatch[1].length;
          issues.push(makeIssue(text, {
            type: "pronoun", severity: "review", label: "Xưng hô cần xem lại",
            value: found, replacement: uniqueSuggestion,
            detail: `${speaker} được cấu hình tự xưng: ${allowedSelfWords.join(" / ")}. Chỉ là cảnh báo theo câu có ghi rõ người nói.`,
            start, end: start + found.length
          }));
        }
      });
    });
    offset += line.length + 1;
  });
  return issues;
}

const ANCIENT_SUSPICIOUS_WORDS = [
  "anh", "em", "chị", "cậu", "tớ", "mình", "bạn", "ông xã", "bà xã",
  "chồng yêu", "vợ yêu", "ok", "okay", "online", "deadline"
];

function scanConfiguredWords(text, qaSettings) {
  const ancient = qaSettings?.era === "ancient" ? ANCIENT_SUSPICIOUS_WORDS.map((find) => ({ find, source:"Bối cảnh cổ đại" })) : [];
  const custom = (qaSettings?.forbiddenWords || []).map((item) => typeof item === "string" ? { find:item, source:"Từ cấm QA" } : { ...item, source:"Từ cấm QA" });
  const issues = [];
  [...ancient, ...custom].filter((rule) => String(rule.find || "").trim()).forEach((rule) => {
    const find = String(rule.find).trim();
    const regex = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegex(find)}(?![\\p{L}\\p{N}])`, "giu");
    for (const match of text.matchAll(regex)) {
      issues.push(makeIssue(text, {
        type:"style", severity:"review", label: rule.source === "Bối cảnh cổ đại" ? "Xưng hô/từ hiện đại cần xem lại" : "Từ cấm cần xem lại",
        value:match[0], replacement:String(rule.replace || ""), suggestions:rule.replace ? [String(rule.replace)] : [],
        detail:`${rule.source}: chỉ cảnh báo để duyệt theo ngữ cảnh, không tự sửa.`, start:match.index, end:match.index + match[0].length
      }));
    }
  });
  return issues;
}

export function runQualityCheck(text, { glossaryTerms = [], pronounRules = [], qaSettings = {} } = {}) {
  const source = String(text || "");
  const issues = [
    ...scanGlossaryRules(source, glossaryTerms, pronounRules),
    ...scanCjk(source, glossaryTerms),
    ...scanEnglish(source, glossaryTerms),
    ...scanNames(source, glossaryTerms),
    ...scanPronouns(source, pronounRules),
    ...scanConfiguredWords(source, qaSettings)
  ];
  const occupied = new Set();
  return issues.filter((issue) => {
    const key = `${issue.start}:${issue.end}`;
    if (occupied.has(key)) return false;
    occupied.add(key);
    return true;
  }).sort((a, b) => a.start - b.start || a.type.localeCompare(b.type));
}

export function applyQualitySuggestion(text, issue, replacement) {
  const source = String(text || "");
  if (!issue || source.slice(issue.start, issue.end) !== issue.value) {
    throw new Error("Vị trí đề xuất đã thay đổi. Hãy quét QA lại.");
  }
  return source.slice(0, issue.start) + replacement + source.slice(issue.end);
}

export const QUALITY_LABELS = {
  glossary: "Glossary", cjk: "Hán/Trung", english: "Tiếng Anh", name: "Tên riêng", pronoun: "Xưng hô", style:"Thể loại/Từ cấm"
};
