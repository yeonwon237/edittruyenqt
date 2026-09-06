const STORAGE_KEY = "edittruyenqt:hanviet-personal-vocabulary:v1";

const clean = (value) => String(value || "").trim().replace(/\s+/g, " ");
const isCjk = (character) => {
  const code = character.codePointAt(0);
  return (code >= 0x3400 && code <= 0x4dbf) || (code >= 0x4e00 && code <= 0x9fff);
};

export function normalizeHanVietVocabularyTerm(term) {
  const sourceTerm = clean(term?.source_term);
  const translation = clean(term?.translation);
  if (!sourceTerm || !translation || ![...sourceTerm].every(isCjk)) return null;
  return {
    source_term: sourceTerm,
    translation,
    category: clean(term?.category),
    source_project_id: term?.source_project_id || null,
    learned_at: term?.learned_at || new Date().toISOString(),
  };
}

export function mergeHanVietVocabulary(projectTerms = [], personalTerms = []) {
  const merged = new Map();
  for (const term of [...projectTerms, ...personalTerms]) {
    const normalized = normalizeHanVietVocabularyTerm(term);
    if (normalized) merged.set(normalized.source_term, { ...term, ...normalized });
  }
  return [...merged.values()];
}

export function loadHanVietVocabulary(storage = globalThis.localStorage) {
  try {
    const parsed = JSON.parse(storage?.getItem(STORAGE_KEY) || "[]");
    return mergeHanVietVocabulary([], Array.isArray(parsed) ? parsed : []);
  } catch {
    return [];
  }
}

export function saveHanVietVocabulary(terms, storage = globalThis.localStorage) {
  const normalized = mergeHanVietVocabulary([], terms);
  storage?.setItem(STORAGE_KEY, JSON.stringify(normalized));
  return normalized;
}

export function addHanVietVocabulary(existingTerms, selectedTerms, projectId) {
  const before = new Map((existingTerms || []).map((term) => [clean(term.source_term), clean(term.translation)]));
  const additions = (selectedTerms || []).map((term) => ({
    ...term,
    source_project_id: projectId || null,
    learned_at: new Date().toISOString(),
  }));
  const terms = mergeHanVietVocabulary(existingTerms, additions);
  let added = 0;
  let updated = 0;
  let ignored = 0;
  for (const term of selectedTerms || []) {
    const normalized = normalizeHanVietVocabularyTerm(term);
    if (!normalized) ignored += 1;
    else if (!before.has(normalized.source_term)) added += 1;
    else if (before.get(normalized.source_term) !== normalized.translation) updated += 1;
  }
  return { terms, added, updated, ignored };
}

export function removeHanVietVocabulary(existingTerms, sourceTerms) {
  const removed = new Set((sourceTerms || []).map(clean).filter(Boolean));
  return (existingTerms || []).filter((term) => !removed.has(clean(term.source_term)));
}

export function isInHanVietVocabulary(term, vocabulary) {
  const source = clean(term?.source_term);
  const translation = clean(term?.translation);
  return (vocabulary || []).some(
    (entry) => clean(entry.source_term) === source && clean(entry.translation) === translation
  );
}

