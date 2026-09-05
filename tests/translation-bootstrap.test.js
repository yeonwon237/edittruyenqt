import test from "node:test";
import assert from "node:assert/strict";
import { dedupeTranslationBootstrap, parseTranslationBootstrapResult } from "../src/lib/translationBootstrap.js";

test("bootstrap parser keeps standalone Chinese pronouns for machine-level review", () => {
  const result = parseTranslationBootstrapResult(JSON.stringify({
    glossaryTerms: [
      { source_term: "我", translation: "ta", confidence: 1 },
      { source_term: "本王", translation: "bổn vương", category: "Tự xưng", confidence: 0.9 },
    ],
    characters: [], pronounRules: [],
  }));
  assert.deepEqual(result.glossaryTerms.map((term) => term.source_term), ["我", "本王"]);
});

test("bootstrap keeps an existing machine term for review but deduplicates a saved rule", () => {
  const result = dedupeTranslationBootstrap({
    glossaryTerms: [{ source_term: "陆未晞", translation: "Lục Vị Hi" }],
    characters: [],
    pronounRules: [{ speaker: "A", listener: "B", self_word: "ta", target_word: "ngươi" }],
  }, [{ source_term: "陆未晞" }], [{ speaker: "A", listener: "B", self_word: "ta", target_word: "ngươi" }]);
  assert.equal(result.glossaryTerms.length, 1);
  assert.equal(result.glossaryTerms[0].existing_id, undefined);
  assert.equal(result.pronounRules.length, 0);
});
