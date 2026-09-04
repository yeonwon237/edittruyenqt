const clean = (value) => String(value || "").trim().replace(/\s+/g, " ");
const keyOf = (...parts) => parts.map((part) => clean(part).toLocaleLowerCase("vi")).join("\u0001");

export function buildStoryLearningPrompt({ title, sourceText, editedText, existingRules = [], existingTerms = [] }) {
  const rules = existingRules
    .slice(0, 120)
    .map((rule) => `- ${rule.speaker} → ${rule.listener || "*"}: xưng "${rule.self_word}", gọi "${rule.target_word}"`)
    .join("\n");
  const terms = existingTerms
    .slice(0, 160)
    .map((term) => `- ${term.source_term} → ${term.translation}`)
    .join("\n");

  return `Bạn là bộ máy xây dựng "bộ nhớ xuyên chương" cho một bộ truyện dịch. Hãy đọc văn bản nguồn và bản Edit, chỉ trích xuất dữ kiện có bằng chứng trực tiếp trong chương. Không suy đoán để điền cho đủ.

QUY TẮC AN TOÀN:
1. Chỉ ghi một cặp xưng hô khi xác định rõ cả người nói lẫn người nghe và thấy trực tiếp cách tự xưng/cách gọi trong lời thoại.
2. "evidence" phải là một trích dẫn ngắn, nguyên văn từ BẢN EDIT. Không có trích dẫn thì bỏ mục đó.
3. confidence chỉ từ 0 đến 1. Chỉ dùng >= 0.90 khi bằng chứng hoàn toàn rõ.
4. Không lặp lại dữ liệu đã có. Nếu dữ kiện mới mâu thuẫn dữ liệu cũ, vẫn trả về nhưng đặt confidence <= 0.80 và giải thích trong note.
5. Thuật ngữ chỉ lấy tên riêng/địa danh/tông môn/cảnh giới/vật phẩm quan trọng có dạng nguồn và bản dịch tương ứng rõ ràng.
6. Tóm tắt đúng 1-2 câu, không thêm diễn biến không có trong chương.

MA TRẬN ĐÃ CÓ:
${rules || "(trống)"}

GLOSSARY ĐÃ CÓ:
${terms || "(trống)"}

CHƯƠNG: ${title || "(không tên)"}

VĂN BẢN NGUỒN:
${String(sourceText || "").slice(0, 7000)}

BẢN EDIT:
${String(editedText || "").slice(0, 7000)}

Trả về DUY NHẤT JSON hợp lệ, không markdown:
{
  "summary": "...",
  "pronounRules": [
    {
      "speaker": "tên nhân vật nói trong bản Edit",
      "listener": "tên nhân vật nghe trong bản Edit",
      "self_word": "cách người nói tự xưng",
      "target_word": "cách người nói gọi người nghe",
      "note": "sắc thái hoặc điều kiện áp dụng",
      "evidence": "trích dẫn nguyên văn ngắn",
      "confidence": 0.0
    }
  ],
  "terms": [
    {
      "source_term": "từ trong văn bản nguồn",
      "translation": "cách dùng trong bản Edit",
      "category": "Tên người|Địa danh|Cấp bậc|Chiêu thức|Vật phẩm|Khác",
      "evidence": "trích dẫn nguyên văn ngắn",
      "confidence": 0.0
    }
  ]
}`;
}

export function parseStoryLearningResult(raw) {
  const text = String(raw || "").trim().replace(/^\`\`\`(?:json)?\s*/i, "").replace(/\s*\`\`\`$/i, "");
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("AI không trả về JSON bộ nhớ hợp lệ");
  const parsed = JSON.parse(text.slice(start, end + 1));
  return {
    summary: clean(parsed.summary),
    pronounRules: Array.isArray(parsed.pronounRules) ? parsed.pronounRules : [],
    terms: Array.isArray(parsed.terms) ? parsed.terms : [],
  };
}

export function mergeStoryLearning({ existingRules = [], existingTerms = [], learned, chapter }) {
  const rules = [...existingRules];
  const terms = [...existingTerms];
  const candidates = [];
  const acceptedRules = [];
  const acceptedTerms = [];
  const ruleByPair = new Map(rules.map((rule) => [keyOf(rule.speaker, rule.listener || "*"), rule]));
  const termBySource = new Map(terms.map((term) => [keyOf(term.source_term), term]));

  for (const raw of learned.pronounRules || []) {
    const item = {
      speaker: clean(raw.speaker),
      listener: clean(raw.listener),
      self_word: clean(raw.self_word),
      target_word: clean(raw.target_word),
      note: clean(raw.note),
      evidence: clean(raw.evidence),
      confidence: Number(raw.confidence) || 0,
    };
    if (!item.speaker || !item.listener || !item.self_word || !item.target_word || !item.evidence) continue;
    const pairKey = keyOf(item.speaker, item.listener);
    const existing = ruleByPair.get(pairKey);
    const conflicts = existing && (
      keyOf(existing.self_word) !== keyOf(item.self_word) ||
      keyOf(existing.target_word) !== keyOf(item.target_word)
    );
    if (existing && !conflicts) continue;
    const enriched = {
      ...item,
      source: "ai_chapter_learning",
      chapter_id: chapter.id,
      chapter_title: chapter.title,
      detected_at: new Date().toISOString(),
      status: conflicts ? "conflict" : item.confidence >= 0.9 ? "confirmed" : "candidate",
    };
    if (!conflicts && item.confidence >= 0.9) {
      const rule = {
        speaker: item.speaker,
        listener: item.listener,
        self_word: item.self_word,
        target_word: item.target_word,
        note: item.note,
        source: enriched.source,
        confidence: item.confidence,
        evidence: item.evidence,
        learned_from_chapter_id: chapter.id,
      };
      rules.push(rule);
      ruleByPair.set(pairKey, rule);
      acceptedRules.push(rule);
    } else {
      candidates.push({ type: "pronoun_rule", ...enriched });
    }
  }

  for (const raw of learned.terms || []) {
    const item = {
      source_term: clean(raw.source_term),
      translation: clean(raw.translation),
      category: clean(raw.category) || "Khác",
      evidence: clean(raw.evidence),
      confidence: Number(raw.confidence) || 0,
    };
    if (!item.source_term || !item.translation || !item.evidence) continue;
    const termKey = keyOf(item.source_term);
    const existing = termBySource.get(termKey);
    const conflicts = existing && keyOf(existing.translation) !== keyOf(item.translation);
    if (existing && !conflicts) continue;
    const enriched = {
      ...item,
      source: "ai_chapter_learning",
      chapter_id: chapter.id,
      chapter_title: chapter.title,
      detected_at: new Date().toISOString(),
      status: conflicts ? "conflict" : item.confidence >= 0.92 ? "confirmed" : "candidate",
    };
    if (!conflicts && item.confidence >= 0.92) {
      acceptedTerms.push(enriched);
      termBySource.set(termKey, enriched);
    } else {
      candidates.push({ type: "glossary_term", ...enriched });
    }
  }

  return { rules, terms, acceptedRules, acceptedTerms, candidates };
}
