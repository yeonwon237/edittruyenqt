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

const hasSpeakerSelfTarget = (rule) =>
  Boolean(rule?.speaker?.trim() && rule?.self_word?.trim() && rule?.target_word?.trim());

// Shared by matrixSuggestionAt (a single already-located glossary match) and
// scanContextualAddress (every address-term occurrence in every quote): who
// is speaking near this quote, and — if the listener can also be pinned
// down from nearby text — which specific (speaker, listener) rule applies.
function resolveSpeakerAndRule(text, quoteStart, quoteEnd, validRules) {
  if (!validRules.length) return null;
  const nearbyStart = Math.max(0, quoteStart - 120);
  const nearbyEnd = Math.min(text.length, quoteEnd + 120);
  const nearby = text.slice(nearbyStart, nearbyEnd);
  const quoteRelStart = quoteStart - nearbyStart;
  const quoteRelEnd = quoteEnd - nearbyStart;
  const speakers = [...new Set(validRules.map((rule) => rule.speaker.trim()))];

  // A multi-speaker paragraph ("Nam nói: ... Linh đáp: ...") can put more
  // than one candidate's attribution inside the same ±120-char window, so
  // picking the first speaker that merely *appears* anywhere nearby would
  // misattribute the second quote back to the first speaker. Instead score
  // every attribution match by how close it sits to THIS quote and take the
  // closest one, across all speakers.
  let best = null;
  speakers.forEach((name) => {
    const escaped = escapeRegex(name);
    const beforePattern = new RegExp(`${escaped}[^“”"]{0,70}(?:${SPEECH_VERBS})[^“”"]{0,25}[“"]`, "giu");
    const afterPattern = new RegExp(`[”"][^“”"]{0,35}${escaped}[^“”"]{0,35}(?:${SPEECH_VERBS})`, "giu");
    for (const match of nearby.matchAll(beforePattern)) {
      const distance = Math.abs(quoteRelStart - (match.index + match[0].length));
      if (!best || distance < best.distance) best = { speaker: name, distance };
    }
    for (const match of nearby.matchAll(afterPattern)) {
      const distance = Math.abs(match.index - quoteRelEnd);
      if (!best || distance < best.distance) best = { speaker: name, distance };
    }
  });
  if (!best) return null;
  const speaker = best.speaker;

  const speakerRules = validRules.filter((rule) => rule.speaker.trim() === speaker);
  const specificRule = speakerRules.find((rule) => {
    const listener = rule.listener?.trim();
    return listener && listener !== "*" && nearby.includes(listener);
  });
  const defaultRule = speakerRules.find((rule) => !rule.listener?.trim() || rule.listener.trim() === "*");
  const rule = specificRule || defaultRule || (speakerRules.length === 1 ? speakerRules[0] : null);
  return { speaker, speakerRules, rule };
}

// Is the word at [relativeStart, relativeEnd) inside `quoteText` the speaker
// referring to themself ("self"), addressing the listener ("target"), or
// unclear ("unknown" — e.g. third-person narration bleeding into the quote)?
// selfWordHint is the resolved rule's self_word, when known — it sharpens
// the "already said their self-word earlier, so this later word must be the
// target" signal; without it (listener unresolved) that one signal is lost
// but the position-based signals still work.
// "X là ai?" / "X là gì?" / "X làm gì?" / "X muốn gì?" — a pronoun opening a
// direct question ABOUT the listener ("Ngươi là ai?" = "Who are you?"). This
// has to be excluded from the generic "opens the quote → self" default,
// since it's grammatically identical (pronoun as the leading subject) to a
// genuine self-statement like "Ta sẽ đi." but means the opposite role.
const LISTENER_QUESTION_AFTER = /^\s*(là\s+(ai|gì|sao|người nào|ai vậy|ai thế)|làm\s+gì|muốn\s+gì|có\s+(biết|phải)\b)/iu;
// Does the clause that starts right at `after` end in "?" — i.e. is *this*
// sentence a question, not just "does the quote end in ?" (a multi-sentence
// quote's later clause can easily be declarative even if an earlier or
// later clause happens to be a question).
const clauseEndPunctuation = (after) => {
  const match = /[.?!…]/u.exec(after);
  return match ? match[0] : after.trim().slice(-1);
};
const looksLikeQuestionAboutListener = (after) =>
  clauseEndPunctuation(after) === "?" && LISTENER_QUESTION_AFTER.test(after);

function resolveAddressRole(quoteText, relativeStart, relativeEnd, selfWordHint) {
  const before = quoteText.slice(0, relativeStart);
  const after = quoteText.slice(relativeEnd);
  // A quote is often several sentences ("Ta yêu nàng, nàng biết không? Huynh
  // sẽ luôn ở bên nàng."). Self/target cues from an EARLIER clause (e.g. a
  // self_word said before an internal "?") shouldn't leak into a later,
  // independent clause — so the positional signals below only look back to
  // the start of the CURRENT clause, not the whole quote so far.
  const lastBreak = Math.max(before.lastIndexOf("."), before.lastIndexOf("?"), before.lastIndexOf("!"), before.lastIndexOf("…"));
  const clauseBefore = lastBreak === -1 ? before : before.slice(lastBreak + 1);
  const atClauseStart = !clauseBefore.trim();
  const selfWordBefore = selfWordHint
    ? new RegExp(`(?:^|[^\\p{L}])${escapeRegex(selfWordHint)}(?=$|[^\\p{L}])`, "iu").test(clauseBefore)
    : false;
  const targetCue = /(?:với|cho|gọi|hỏi|bảo|nhờ|giúp|cứu|đợi|chờ|tìm|theo|của|đến|về|nhìn|thấy|yêu|ghét)\s*$/iu.test(clauseBefore);
  const listenerQuestion = atClauseStart && looksLikeQuestionAboutListener(after);
  const startsStatement = atClauseStart && !/^\s*[,!:?]/u.test(after) && !listenerQuestion;
  const vocative = (atClauseStart && /^\s*[,!:?]/u.test(after)) || targetCue || listenerQuestion;
  if (startsStatement && !vocative) return "self";
  if (vocative || selfWordBefore) return "target";
  return "unknown";
}

function matrixSuggestionAt(text, start, end, rules) {
  const quote = quoteAt(text, start);
  const validRules = (rules || []).filter(hasSpeakerSelfTarget);
  const allSuggestions = [...new Set(validRules.flatMap((rule) => [rule.self_word.trim(), rule.target_word.trim()]))];
  if (!quote || !validRules.length) return { suggestions: allSuggestions, detail: "Không xác định được câu thoại hoặc người nói; hãy chọn thủ công." };

  const resolved = resolveSpeakerAndRule(text, quote.start, quote.end, validRules);
  if (!resolved) return { suggestions: allSuggestions, detail: "Chưa nhận ra người nói trong câu này; hãy chọn thủ công." };

  const { speaker, speakerRules, rule } = resolved;
  const speakerSuggestions = [...new Set(speakerRules.flatMap((item) => [item.self_word.trim(), item.target_word.trim()]))];
  if (!rule) return { suggestions: speakerSuggestions, detail: `Đã nhận ra ${speaker} nhưng chưa xác định được người nghe.` };

  const relativeStart = start - quote.start;
  const role = resolveAddressRole(quote.text, relativeStart, relativeStart + (end - start), rule.self_word.trim());
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

// Common Vietnamese address terms — used both as a fallback vocabulary (a
// word never configured in any rule still gets checked if it's plausibly an
// address term) and, via ANCIENT_SUSPICIOUS_WORDS below, era-checking. These
// are exactly the words that are ambiguous between self-reference and
// addressing-the-listener depending on sentence position (anh/em/chị most of
// all), which is why a flat find/replace can't fix them — role has to be
// resolved per occurrence.
const TARGET_ADDRESS_TERMS = new Set([
  "ngươi", "ngài", "nàng", "chàng", "muội", "huynh", "tỷ", "đệ",
  "ca", "ca ca", "tỷ tỷ", "muội muội", "đệ đệ", "khanh", "ái khanh",
  "thiếp", "nô tỳ", "nô gia", "hạ quan", "công tử", "cô nương",
  "tiểu thư", "thiếu gia", "anh", "em", "chị", "cậu", "tớ",
]);

// Replaces the old scanPronouns (self-word-only, one match per line). Walks
// every quoted line of dialogue in the whole text, resolves speaker+listener
// via resolveSpeakerAndRule (the same ±120-char nearby-text search already
// proven out for matrixSuggestionAt, not just same-line), and — the actual
// gap this closes — checks BOTH self_word and target_word against whichever
// address term actually appears, so a Huynh/Muội-style mixup or an
// era-wrong "em"/"chị" used as either subject or object gets one concrete
// correct suggestion instead of a generic "review this" warning.
function scanContextualAddress(text, rules) {
  const validRules = (rules || []).filter(hasSpeakerSelfTarget);
  if (!validRules.length) return { issues: [], confirmedSpans: new Set() };

  const issues = [];
  const seen = new Set();
  // Spans this scanner actually checked and found already correct — passed
  // to scanConfiguredWords so it doesn't separately nag about a modern-word
  // era mismatch on a word the matrix just confirmed is the right one here.
  const confirmedSpans = new Set();
  const quoteRegex = /[“"]([^”"]+)[”"]/gu;
  for (const quoteMatch of text.matchAll(quoteRegex)) {
    const quoteText = quoteMatch[1];
    if (!quoteText.trim()) continue;
    const quoteStart = quoteMatch.index + 1;
    const quoteEnd = quoteStart + quoteText.length;
    const resolved = resolveSpeakerAndRule(text, quoteStart, quoteEnd, validRules);
    if (!resolved) continue;
    const { speaker, speakerRules, rule } = resolved;
    const speakerWords = [...new Set(speakerRules.flatMap((item) => [item.self_word.trim(), item.target_word.trim()]).filter(Boolean))];
    const candidateWords = [...new Set([...speakerWords, ...SELF_PRONOUNS, ...TARGET_ADDRESS_TERMS])];

    candidateWords.forEach((word) => {
      const regex = new RegExp(`(?:^|[^\\p{L}])(${escapeRegex(word)})(?=$|[^\\p{L}])`, "giu");
      for (const wordMatch of quoteText.matchAll(regex)) {
        const found = wordMatch[1];
        const relativeStart = wordMatch.index + wordMatch[0].indexOf(found);
        const relativeEnd = relativeStart + found.length;
        const start = quoteStart + relativeStart;
        const end = quoteStart + relativeEnd;
        const dedupeKey = `${start}:${end}`;
        if (seen.has(dedupeKey)) continue;

        // If the found word already IS one of this rule's two configured
        // words (self_word or target_word), trust it outright and skip
        // straight to "confirmed" — no need to guess self-vs-target from
        // sentence position at all. This matters: position alone can't
        // reliably tell "Nàng thật xinh đẹp." (correctly addressing her)
        // apart from "Ta thật xin lỗi." (self-statement) — both are just a
        // leading pronoun + adjective. Guessing is only needed below, for a
        // word that matches NEITHER configured slot (a genuine mix-up).
        if (rule) {
          const normFound = normalize(found);
          if (normFound === normalize(rule.self_word) || normFound === normalize(rule.target_word)) {
            confirmedSpans.add(dedupeKey);
            continue;
          }
        }

        const role = resolveAddressRole(quoteText, relativeStart, relativeEnd, rule?.self_word?.trim());
        if (role === "unknown") continue;

        if (!rule) {
          // Listener unresolved — too ambiguous to name a single correct
          // word, but still worth flagging since a real error is likely.
          seen.add(dedupeKey);
          issues.push(makeIssue(text, {
            type: "pronoun", severity: "review", label: "Xưng hô cần xem lại",
            value: found, replacement: "", suggestions: speakerWords,
            detail: `Đã nhận ra ${speaker} đang nói, nhưng chưa xác định được người nghe nên chưa chắc từ nào đúng ở đây.`,
            start, end,
          }));
          continue;
        }

        const expected = (role === "self" ? rule.self_word : rule.target_word)?.trim();
        if (!expected) continue;
        seen.add(dedupeKey);
        const listenerLabel = rule.listener?.trim() && rule.listener.trim() !== "*" ? rule.listener.trim() : "mọi người";
        issues.push(makeIssue(text, {
          type: "pronoun", severity: "review", label: "Xưng hô cần xem lại",
          value: found, replacement: expected, suggestions: [...new Set([expected, ...speakerWords])],
          detail: role === "self"
            ? `${speaker} nên tự xưng là "${expected}" khi nói với ${listenerLabel} (đang thấy "${found}").`
            : `${speaker} nên gọi ${listenerLabel} là "${expected}" (đang thấy "${found}").`,
          start, end,
        }));
      }
    });
  }
  return { issues, confirmedSpans };
}

const ANCIENT_SUSPICIOUS_WORDS = [
  "anh", "em", "chị", "cậu", "tớ", "mình", "bạn", "ông xã", "bà xã",
  "chồng yêu", "vợ yêu", "ok", "okay", "online", "deadline"
];

function scanConfiguredWords(text, qaSettings, confirmedSpans) {
  const ancient = qaSettings?.era === "ancient" ? ANCIENT_SUSPICIOUS_WORDS.map((find) => ({ find, source:"Bối cảnh cổ đại" })) : [];
  const custom = (qaSettings?.forbiddenWords || []).map((item) => typeof item === "string" ? { find:item, source:"Từ cấm QA" } : { ...item, source:"Từ cấm QA" });
  const allowed = new Set((qaSettings?.allowedWords || []).map((item) => normalize(item)));
  const issues = [];
  [...ancient, ...custom].filter((rule) => String(rule.find || "").trim()).forEach((rule) => {
    const find = String(rule.find).trim();
    if (allowed.has(normalize(find))) return;
    const regex = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegex(find)}(?![\\p{L}\\p{N}])`, "giu");
    for (const match of text.matchAll(regex)) {
      const start = match.index, end = start + match[0].length;
      // The contextual scanner already confirmed this exact word here is
      // the correct self/target term per the Ma Trận Xưng Hô — don't nag
      // about it just for being an era-suspicious word in the abstract.
      if (confirmedSpans?.has(`${start}:${end}`)) continue;
      issues.push(makeIssue(text, {
        type:"style", severity:"review", label: rule.source === "Bối cảnh cổ đại" ? "Xưng hô/từ hiện đại cần xem lại" : "Từ cấm cần xem lại",
        value:match[0], replacement:String(rule.replace || ""), suggestions:rule.replace ? [String(rule.replace)] : [],
        detail:`${rule.source}: chỉ cảnh báo để duyệt theo ngữ cảnh, không tự sửa.`, start, end
      }));
    }
  });
  return issues;
}

export function runQualityCheck(text, { glossaryTerms = [], pronounRules = [], qaSettings = {} } = {}) {
  const source = String(text || "");
  const { issues: addressIssues, confirmedSpans } = scanContextualAddress(source, pronounRules);
  const issues = [
    ...scanGlossaryRules(source, glossaryTerms, pronounRules),
    ...scanCjk(source, glossaryTerms),
    ...scanEnglish(source, glossaryTerms),
    ...scanNames(source, glossaryTerms),
    ...addressIssues,
    ...scanConfiguredWords(source, qaSettings, confirmedSpans)
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
