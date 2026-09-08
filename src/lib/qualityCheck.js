const CJK_RUN_REGEX = /[一-鿿㐀-䶿]+/g;
const ASCII_WORD_REGEX = /(?<!\p{L})[A-Za-z][A-Za-z'’-]{1,}(?!\p{L})/gu;

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

// Vietnamese narrative/address pronouns are single free-standing syllables,
// but several of them are also the first syllable of an unrelated, common
// two-syllable word ("cô bé", "chị em", "anh em"...). A syllable-boundary
// regex can't tell "cô" the pronoun apart from "cô" in "cô bé" — both have a
// space (a non-letter) right after "cô". This closed list of known second
// syllables blocks exactly those combinations; a combination not listed
// here still matches, same as before this guard existed — real-chapter
// testing found "cô bé" was misread as the pronoun "cô" and (at "cao"
// confidence) proposed rewriting it into the nonsense "cô nàng bé".
const PRONOUN_COMPOUND_CONTINUATIONS = {
  "co": ["be", "ay", "gai", "dau", "nuong", "don", "doc", "hon"],
  "ba": ["ay", "con", "noi", "ngoai", "cu", "lao", "xa"],
  "nang": ["ta", "dau", "tien"],
  "cau": ["ay", "be", "ta"],
  "chi": ["ay", "em"],
  "em": ["ay", "be", "ut"],
  "anh": ["ay", "em"],
  "ong": ["ay", "ba", "noi", "ngoai", "cu"],
};

function isSwallowedByCompound(text, matchEnd, foundWord) {
  const continuations = PRONOUN_COMPOUND_CONTINUATIONS[normalize(foundWord)];
  if (!continuations) return false;
  const after = text.slice(matchEnd).match(/^\s+(\p{L}+)/u);
  return after ? continuations.includes(normalize(after[1])) : false;
}
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

// Resolve only explicit dialogue attribution; abstain on ambiguous prose.
function resolveSpeakerAndRule(text, quoteStart, quoteEnd, validRules) {
  if (!validRules.length) return null;
  // Only explicit attribution attached to this quote is evidence.
  const before = text.slice(text.lastIndexOf('\n', quoteStart - 1) + 1, quoteStart - 1);
  const matches = validRules.filter((rule) => {
    const listener = rule.listener?.trim();
    const address = listener && listener !== '*' ? '\\s+với\\s+' + escapeRegex(listener) : '';
    const pattern = new RegExp('(?:^|[.!?]\\s*)' + escapeRegex(rule.speaker.trim()) + '\\s+(?:' + SPEECH_VERBS + ')' + address + '\\s*:\\s*$', 'iu');
    return pattern.test(before);
  });
  if (matches.length !== 1) return null;
  const rule = matches[0];
  return { speaker: rule.speaker.trim(), speakerRules: [rule], rule };
}

const CONFIDENCE_RANK = { "cao": 3, "trung bình": 2, "thấp": 1 };
const weaker = (a, b) => (CONFIDENCE_RANK[a] <= CONFIDENCE_RANK[b] ? a : b);

// Best rule for an already-known (speaker, listener) pair: an exact
// listener match wins; otherwise fall back to that speaker's default rule
// ("Mọi người khác" — empty/"*" listener), same priority the matrix UI uses.
function pickRule(validRules, speakerName, listenerName) {
  const bySpeaker = validRules.filter((r) => r.speaker.trim() === speakerName);
  const exact = bySpeaker.find((r) => r.listener?.trim() === listenerName);
  if (exact) return exact;
  return bySpeaker.find((r) => !r.listener?.trim() || r.listener.trim() === "*") || null;
}

// Same "Name + speech verb + :" shape resolveSpeakerAndRule looks for, but
// without requiring "với <listener>" — used to identify WHO is speaking
// when there's no explicit listener named.
function findLooseSpeakerTag(before, candidateNames) {
  const matches = candidateNames.filter((name) => {
    const pattern = new RegExp("(?:^|[.!?]\\s*)" + escapeRegex(name) + "\\s+(?:" + SPEECH_VERBS + ")\\s*:\\s*$", "iu");
    return pattern.test(before);
  });
  return matches.length === 1 ? matches[0] : null;
}

// Real Vietnamese web-novel dialogue overwhelmingly tags a quote with an
// ACTION BEAT, not a "Name verb:" line — "Kỷ Khê ôm chặt Trịnh Nặc, "..."",
// comma before the quote, no speech verb anywhere. findLooseSpeakerTag (and
// the original colon-anchored resolveSpeakerAndRule) never match this at
// all, which is why sessions rarely got seeded from real chapters. This
// finds the sole registered name mentioned in `before` — the whole action
// beat, not just its last clause — as long as it isn't the grammatical
// OBJECT of what's happening (reusing looksLikeObjectMention, the same
// subject-preference check the narrator-pronoun scanner uses). Two or more
// registered names in the beat is genuinely ambiguous and abstains, same as
// everywhere else in this file.
function findActionBeatSpeaker(before, candidateNames) {
  const matches = candidateNames
    .map((name) => {
      const found = [...before.matchAll(new RegExp(`(?<!\\p{L})${escapeRegex(name)}(?!\\p{L})`, "gu"))];
      return found.length ? { name, idx: found.at(-1).index } : null;
    })
    .filter(Boolean);
  if (matches.length !== 1) return null;
  return looksLikeObjectMention(before, matches[0].idx) ? null : matches[0].name;
}

// Given a candidate speaker name (from a tag or action beat), who are they
// talking to? Prefers the active session (same pair if the speaker repeats,
// swapped if the other party replies) — resolved this way, confidence is
// capped by whichever is weaker: the tag's own strength or the session's.
// Without a session, only resolvable if that speaker has exactly one
// listener across the whole matrix (a single specific rule, or a lone
// default "Mọi người khác") — anything more and there's no way to tell
// which listener without a session, so it abstains rather than guessing;
// when it does resolve this way it's capped at "thấp" regardless of the
// tag's own strength, since there's no session corroborating it at all.
function resolveListenerForSpeaker(speakerName, activeSession, validRules, tagConfidence) {
  if (activeSession && (speakerName === activeSession.speaker || speakerName === activeSession.listener)) {
    const listener = speakerName === activeSession.speaker ? activeSession.listener : activeSession.speaker;
    return { listener, rule: pickRule(validRules, speakerName, listener), confidence: weaker(tagConfidence, activeSession.confidence) };
  }
  const speakerRules = validRules.filter((r) => r.speaker.trim() === speakerName);
  const distinctListeners = [...new Set(speakerRules.map((r) => r.listener?.trim() || "*"))];
  if (distinctListeners.length !== 1) return null;
  return { listener: distinctListeners[0] === "*" ? "" : distinctListeners[0], rule: speakerRules[0], confidence: "thấp" };
}

// Resolves a quote's speaker/listener the way resolveSpeakerAndRule does,
// but keeps a running "conversation session" across quotes in a chapter so
// later turns don't need to repeat a full "X nói với Y:" tag — real
// Vietnamese web-novel dialogue almost never does. Four confidence tiers,
// weakest anchor wins throughout (a resolution built on a weaker session
// never comes out stronger than that session — uncertainty doesn't heal
// itself going forward):
//
// "cao" — explicit "<Speaker> <verb> với <Listener>:" right before the
// quote (resolveSpeakerAndRule, unchanged). Re-anchors the session.
//
// "trung bình" — a tag names a speaker without "với <listener>" (e.g. just
// "Trịnh Nặc đáp:"). The listener comes from the active session, or — with
// no session — only if that speaker has just one possible listener anyway.
//
// "thấp" — either (a) an action beat names the sole, non-object subject
// without any speech verb at all (findActionBeatSpeaker), or (b) no name is
// mentioned at all but a session is active, so the turn is assumed to
// alternate to the other party. Both are the riskiest tier — a third
// character cutting in, or the same speaker continuing over a paragraph
// break, can fool either — so every issue built on "thấp" is labeled
// accordingly and never auto-applied in bulk.
//
// The session resets after a paragraph gap (2+ newlines) since that's the
// cheapest available signal for "the scene may have moved on" — no scene
// boundary detector exists to do better.
function resolveSpeakerSession(text, quoteStart, quoteEnd, validRules, session) {
  const before = text.slice(text.lastIndexOf("\n", quoteStart - 1) + 1, quoteStart - 1);
  const gapBeforeQuote = text.slice(session?.end ?? 0, quoteStart);
  const activeSession = session && !/\n\s*\n/.test(gapBeforeQuote) ? session : null;

  const explicit = resolveSpeakerAndRule(text, quoteStart, quoteEnd, validRules);
  if (explicit) {
    const listener = explicit.rule?.listener?.trim() || "";
    return { speaker: explicit.speaker, listener, rule: explicit.rule, speakerRules: explicit.speakerRules, confidence: "cao", end: quoteEnd };
  }

  const names = [...new Set(validRules.flatMap((r) => [r.speaker.trim(), r.listener?.trim()]).filter((n) => n && n !== "*"))];

  const looseSpeaker = findLooseSpeakerTag(before, names);
  if (looseSpeaker) {
    const resolvedListener = resolveListenerForSpeaker(looseSpeaker, activeSession, validRules, "trung bình");
    if (resolvedListener) {
      const speakerRules = validRules.filter((r) => r.speaker.trim() === looseSpeaker);
      return { speaker: looseSpeaker, listener: resolvedListener.listener, rule: resolvedListener.rule, speakerRules, confidence: resolvedListener.confidence, end: quoteEnd };
    }
  }

  const beatSpeaker = !looseSpeaker ? findActionBeatSpeaker(before, names) : null;
  if (beatSpeaker) {
    const resolvedListener = resolveListenerForSpeaker(beatSpeaker, activeSession, validRules, "thấp");
    if (resolvedListener) {
      const speakerRules = validRules.filter((r) => r.speaker.trim() === beatSpeaker);
      return { speaker: beatSpeaker, listener: resolvedListener.listener, rule: resolvedListener.rule, speakerRules, confidence: resolvedListener.confidence, end: quoteEnd };
    }
  }

  // No usable name at all — assume the turn alternates, but only if the
  // action beat doesn't name a THIRD registered character (that's still a
  // real signal something may have changed) and only when a session exists
  // to alternate from in the first place.
  if (activeSession && !looseSpeaker && !beatSpeaker) {
    const introducesOther = names.some((name) =>
      name !== activeSession.speaker && name !== activeSession.listener &&
      new RegExp(`(?<!\\p{L})${escapeRegex(name)}(?!\\p{L})`, "u").test(before)
    );
    if (!introducesOther) {
      const speaker = activeSession.listener;
      const listener = activeSession.speaker;
      const rule = pickRule(validRules, speaker, listener);
      const speakerRules = validRules.filter((r) => r.speaker.trim() === speaker);
      const confidence = weaker("thấp", activeSession.confidence);
      return { speaker, listener, rule, speakerRules, confidence, end: quoteEnd };
    }
  }

  return null;
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
const looksLikeDirectAddress = (after) =>
  /^\s*(?:là\s+đồ(?=\s|[,.:;!?]|$)|đối\s+với\b|đừng\b|hãy\b)/iu.test(after);

export function resolveAddressRole(quoteText, relativeStart, relativeEnd, selfWordHint) {
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
  const listenerQuestion = atClauseStart && (looksLikeQuestionAboutListener(after) || looksLikeDirectAddress(after));
  const startsStatement = atClauseStart && !/^\s*[,!:?]/u.test(after) && !listenerQuestion;
  const vocative = (atClauseStart && /^\s*[,!:?]/u.test(after)) || targetCue || listenerQuestion;
  if (startsStatement && !vocative) return "self";
  if (vocative || selfWordBefore) return "target";
  return "unknown";
}

function resolveQaAddressRole(quoteText, start, end) {
  const word = quoteText.slice(start, end).toLocaleLowerCase('vi');
  if (SELF_PRONOUNS.has(word) && word !== 'mình' && word !== 'bản thân') return 'self';
  const before = quoteText.slice(0, start);
  const after = quoteText.slice(end);
  const clauseStart = !before.split(/[.!?…]/u).at(-1).trim();
  if (TARGET_ADDRESS_TERMS.has(word) && clauseStart &&
      (looksLikeQuestionAboutListener(after) || looksLikeDirectAddress(after) || /^\s*[,!]/u.test(after))) return 'target';
  return 'unknown';
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
  const role = resolveQaAddressRole(quote.text, relativeStart, relativeStart + (end - start));
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
      if (contextual && (!matrix?.replacement || matrix.replacement.toLocaleLowerCase("vi") === value.toLocaleLowerCase("vi"))) continue;
      issues.push(makeIssue(text, {
        type: "glossary",
        severity: contextual ? "review" : "high",
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

  return directIssues;
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

// Check dialogue only when participants and lexical role are supported.
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
  let session = null;
  for (const quoteMatch of text.matchAll(quoteRegex)) {
    const quoteText = quoteMatch[1];
    if (!quoteText.trim()) continue;
    const quoteStart = quoteMatch.index + 1;
    const quoteEnd = quoteStart + quoteText.length;
    const resolved = resolveSpeakerSession(text, quoteStart, quoteEnd, validRules, session);
    if (!resolved) continue;
    session = resolved;
    const { speaker, speakerRules, rule, confidence } = resolved;
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
        if (isSwallowedByCompound(quoteText, relativeEnd, found)) continue;
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
        const role = resolveQaAddressRole(quoteText, relativeStart, relativeEnd);
        if (rule) {
          const normFound = normalize(found);
          const matchesSelf = normFound === normalize(rule.self_word);
          const matchesTarget = normFound === normalize(rule.target_word);
          if (matchesSelf || matchesTarget) {
            confirmedSpans.add(dedupeKey);
            continue;
          }
        }
        if (role === "unknown") continue;

        if (!rule) {
          // Listener unresolved — too ambiguous to name a single correct
          // word, but still worth flagging since a real error is likely.
          seen.add(dedupeKey);
          issues.push(makeIssue(text, {
            type: "pronoun", severity: "review", label: "Xưng hô cần xem lại",
            value: found, replacement: "", suggestions: speakerWords, confidence,
            detail: `Đã nhận ra ${speaker} đang nói, nhưng chưa xác định được người nghe nên chưa chắc từ nào đúng ở đây (độ tin cậy: ${confidence}).`,
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
          value: found, replacement: expected, suggestions: [...new Set([expected, ...speakerWords])], confidence,
          detail: (role === "self"
            ? `${speaker} nên tự xưng là "${expected}" khi nói với ${listenerLabel} (đang thấy "${found}").`
            : `${speaker} nên gọi ${listenerLabel} là "${expected}" (đang thấy "${found}").`) + ` (độ tin cậy: ${confidence})`,
          start, end,
        }));
      }
    });
  }
  return { issues, confirmedSpans };
}

// Common Vietnamese narrative nouns that typically take a possessive pronoun
// right after them ("ánh mắt cô", "giọng nói nàng") — one of the two strict
// syntactic anchors scanNarrativeAddress requires before it will attribute a
// narrator pronoun to a character. Deliberately a closed, conservative list:
// an unlisted construction abstains rather than guesses.
const POSSESSIVE_ANCHOR_NOUNS = [
  "ánh mắt", "khóe mắt", "đôi mắt", "gương mặt", "khuôn mặt", "sắc mặt",
  "giọng nói", "khóe môi", "vành môi", "đôi môi", "nụ cười", "nét mặt",
  "mái tóc", "bờ vai", "dáng người", "thân hình", "bàn tay", "ngón tay",
  "cổ tay", "trong lòng", "trong tim", "trong đầu", "trong mắt", "trái tim",
  "tâm trí", "nội tâm", "cõi lòng",
];

// Verbs/prepositions whose following NP is typically the grammatical OBJECT
// (or another oblique role) of a Vietnamese clause, not its subject —
// "Kỷ Khê nhìn Trịnh Nặc" puts Trịnh Nặc here. Used to down-rank a nearby
// name as an unlikely antecedent, approximating Hobbs/Centering theory's
// "subject preferred over object" salience rule from Vietnamese's fairly
// regular SVO surface order, since no dependency parser is available to
// read the real grammatical role from. Deliberately closed and short: a
// preceder this list doesn't recognize just abstains, same as before.
const OBJECT_MARKING_PRECEDERS = [
  "với", "cho", "của", "cùng", "về phía", "đến bên", "cạnh", "bên",
  "nhìn", "ngắm", "gọi", "hỏi", "bảo", "ôm", "nắm", "kéo", "đẩy", "lấy",
  "bế", "hôn", "chạm", "sờ", "nhớ", "đợi", "chờ", "tìm", "dõi theo", "theo dõi",
];

function findNamesIn(segment, names) {
  return names
    .flatMap((name) => {
      const regex = new RegExp(`(?<!\\p{L})${escapeRegex(name)}(?!\\p{L})`, "gu");
      return [...segment.matchAll(regex)].map((m) => ({ name, start: m.index, end: m.index + name.length }));
    })
    .sort((a, b) => a.start - b.start);
}

// Is the name mention starting at `start` in `segment` immediately preceded
// (a short lookback, ignoring only trailing whitespace — a trailing comma
// still blocks the match, so "..., Tên" isn't mistaken for "...với Tên")
// by one of OBJECT_MARKING_PRECEDERS?
function looksLikeObjectMention(segment, start) {
  const before = segment.slice(Math.max(0, start - 20), start).replace(/\s+$/, "").toLocaleLowerCase("vi");
  return OBJECT_MARKING_PRECEDERS.some((word) => before.endsWith(word));
}

// Which single registered character does the narrator pronoun at `start`
// resume/attach to, and how sure are we? Returns { name, confidence } or
// null (abstain — still possible, e.g. no registered name anywhere nearby).
// Three confidence tiers, each a progressively less certain anchor:
//
// "cao" — the possessive/comma anchor ("<Name> ... <anchor noun/,>
// <PRONOUN>") with exactly ONE registered name in the sentence, or the
// sentence-initial resumptive ("<Name> [...]. <PRONOUN> ...") with exactly
// one name in the PREVIOUS sentence. Nothing in real-chapter testing has
// contradicted these.
//
// "trung bình" — sentence-initial resumptive when the PREVIOUS sentence
// names exactly two characters: Centering theory's "continued topic is the
// previous clause's subject" picks whichever of the two wasn't a
// grammatical object (looksLikeObjectMention); abstains if both or neither
// qualify. Only ever chooses between the sentence's own two names.
//
// "thấp" — the possessive/comma anchor binding to the NEAREST registered
// name even when an earlier, different registered name also appears in the
// sentence (skipped only if that nearest name itself looks like a
// grammatical object). Real-chapter testing caught this guessing wrong:
// "ánh mắt Trình Nặc ... rơi trên khuôn mặt cô" bound "khuôn mặt" to the
// nearest name (Trịnh Nặc) when it actually belonged to Kỷ Khê, the more
// distant name and the semantic target of "rơi trên" (fell upon) — a
// transitive/causative verb can introduce an anchor's possessor from
// anywhere in the clause, not just the nearest name, and no cheap surface
// signal tells the two apart. Flagged anyway (worth a human glance) but
// never silently trusted — every caller must surface this tier's confidence.
function resolveNarrativeGovernor(text, start, names) {
  const sentenceBoundary = (from) => Math.max(
    text.lastIndexOf(".", from - 1), text.lastIndexOf("!", from - 1),
    text.lastIndexOf("?", from - 1), text.lastIndexOf("\n", from - 1)
  ) + 1;
  const matchesAnchor = (sentence, nameEnd) => {
    const gap = sentence.slice(nameEnd);
    const gapTrimmedEnd = gap.replace(/\s+$/, "").toLocaleLowerCase("vi");
    return /,\s*$/.test(gap) || POSSESSIVE_ANCHOR_NOUNS.some((noun) => gapTrimmedEnd.endsWith(noun));
  };

  const sentenceStart = sentenceBoundary(start);
  const sentence = text.slice(sentenceStart, start);

  if (!sentence.trim()) {
    const prevEnd = sentenceStart;
    const prevStart = sentenceBoundary(Math.max(prevEnd - 1, 0));
    const prevSentence = text.slice(prevStart, prevEnd);
    const found = findNamesIn(prevSentence, names);
    if (found.length === 1) return { name: found[0].name, confidence: "cao" };
    if (found.length === 2) {
      const [a, b] = found;
      const aIsObject = looksLikeObjectMention(prevSentence, a.start);
      const bIsObject = looksLikeObjectMention(prevSentence, b.start);
      if (aIsObject !== bIsObject) return { name: aIsObject ? b.name : a.name, confidence: "trung bình" };
    }
    return null;
  }

  const found = findNamesIn(sentence, names);
  if (!found.length) return null;
  if (found.length === 1) {
    return matchesAnchor(sentence, found[0].end) ? { name: found[0].name, confidence: "cao" } : null;
  }
  const nearest = found.at(-1);
  if (looksLikeObjectMention(sentence, nearest.start)) return null;
  return matchesAnchor(sentence, nearest.end) ? { name: nearest.name, confidence: "thấp" } : null;
}

// Check narrator-voice pronouns (outside dialogue) against "Ngôi Lời Dẫn":
// each registered character has ONE third-person pronoun. A pronoun that's
// attached to a character via a strict anchor (see resolveNarrativeGovernor)
// but doesn't match THAT character's registered pronoun is a likely mix-up.
// Two characters sharing the same pronoun word elsewhere in the story (e.g.
// several women all called "cô") is common and irrelevant here — the anchor
// already resolved a single governor for THIS occurrence, so global reuse of
// the word doesn't make this occurrence ambiguous.
function scanNarrativeAddress(text, narrativeRules) {
  const valid = (narrativeRules || [])
    .map((rule) => ({ character: String(rule.character || "").trim(), pronoun: String(rule.pronoun || "").trim() }))
    .filter((rule) => rule.character && rule.pronoun);
  if (valid.length < 2) return [];

  const expectedByCharacter = new Map(valid.map((r) => [r.character, r.pronoun]));
  const names = [...new Set(valid.map((r) => r.character))];
  // Longest first: without this, a shorter registered pronoun that's a
  // prefix of a longer one ("cô" vs. "cô nàng") wins the alternation at the
  // same starting position and the longer one's own, correctly-written text
  // gets misread as the shorter word wearing a false mismatch.
  const candidateWords = [...new Set(valid.map((r) => r.pronoun))].sort((a, b) => b.length - a.length);

  const quoteRanges = [...text.matchAll(/[“"]([^”"]+)[”"]/gu)].map((m) => [m.index, m.index + m[0].length]);
  const insideQuote = (pos) => quoteRanges.some(([a, b]) => pos >= a && pos < b);

  const regex = new RegExp(`(?<!\\p{L})(${candidateWords.map(escapeRegex).join("|")})(?!\\p{L})`, "giu");
  const issues = [];
  for (const match of text.matchAll(regex)) {
    const start = match.index;
    const end = start + match[0].length;
    if (insideQuote(start)) continue;
    const found = match[0];
    if (isSwallowedByCompound(text, end, found)) continue;
    const resolved = resolveNarrativeGovernor(text, start, names);
    if (!resolved) continue;
    const { name: governor, confidence } = resolved;
    const expected = expectedByCharacter.get(governor);
    if (!expected || normalize(found) === normalize(expected)) continue;
    issues.push(makeIssue(text, {
      type: "narrative", severity: "review", label: "Ngôi lời dẫn có thể bị nhầm",
      value: found, replacement: expected, suggestions: [expected], confidence,
      detail: `"${governor}" đang được gọi là "${found}", nhưng theo Ngôi Lời Dẫn "${governor}" nên là "${expected}" (độ tin cậy: ${confidence}).`,
      start, end,
    }));
  }
  return issues;
}

const ANCIENT_SUSPICIOUS_WORDS = [
  "tôi", "anh", "em", "chị", "cậu", "tớ", "mình", "bạn", "ông xã", "bà xã",
  "chồng yêu", "vợ yêu", "ok", "okay", "online", "deadline"
];

function scanConfiguredWords(text, qaSettings) {
  const ancient = qaSettings?.era === "ancient" ? ANCIENT_SUSPICIOUS_WORDS.map((find) => ({ find, source:"Bối cảnh cổ đại" })) : [];
  const custom = (qaSettings?.forbiddenWords || []).map((item) => typeof item === "string" ? { find:item, source:"Từ cấm QA" } : { ...item, source:"Từ cấm QA" });
  const allowed = new Set((qaSettings?.allowedWords || []).map((item) => String(item).normalize("NFC").toLocaleLowerCase("vi").trim()));
  const issues = [];
  const wordKey = (value) => String(value).normalize("NFC").toLocaleLowerCase("vi").trim();
  const customKeys = new Set(custom.map((rule) => wordKey(rule.find || "")));
  [...custom, ...ancient.filter((rule) => !customKeys.has(wordKey(rule.find)))].filter((rule) => String(rule.find || "").trim()).forEach((rule) => {
    const find = String(rule.find).trim();
    if (rule.source !== "Từ cấm QA" && allowed.has(wordKey(find))) return;
    const regex = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegex(find)}(?![\\p{L}\\p{N}])`, "giu");
    for (const match of text.matchAll(regex)) {
      const start = match.index, end = start + match[0].length;
      // Era vocabulary and explicit forbidden words are independent of dialogue attribution.
      issues.push(makeIssue(text, {
        type:"style", severity:"review", label: rule.source === "Bối cảnh cổ đại" ? "Xưng hô/từ hiện đại cần xem lại" : "Từ cấm cần xem lại",
        value:match[0], replacement:String(rule.replace || ""), suggestions:rule.replace ? [String(rule.replace)] : [],
        detail:`${rule.source}: chỉ cảnh báo để duyệt theo ngữ cảnh, không tự sửa.`, start, end
      }));
    }
  });
  return issues;
}

export function runQualityCheck(text, { glossaryTerms = [], pronounRules = [], narrativeRules = [], qaSettings = {} } = {}) {
  const source = String(text || "");
  const { issues: addressIssues } = scanContextualAddress(source, pronounRules);
  const issues = [
    ...scanConfiguredWords(source, qaSettings),
    ...scanGlossaryRules(source, glossaryTerms, pronounRules),
    ...scanCjk(source, glossaryTerms),
    ...scanEnglish(source, glossaryTerms),
    ...scanNames(source, glossaryTerms),
    ...addressIssues,
    ...scanNarrativeAddress(source, narrativeRules),
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
  glossary: "Glossary", cjk: "Hán/Trung", english: "Tiếng Anh", name: "Tên riêng", pronoun: "Xưng hô",
  narrative: "Ngôi lời dẫn", style:"Thể loại/Từ cấm"
};
