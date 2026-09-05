const clean = (value) => String(value || "").trim();

const stripJsonFence = (value) => clean(value)
  .replace(/^```(?:json)?\s*/i, "")
  .replace(/\s*```$/i, "")
  .trim();

const normalizeCategory = (value) => {
  const category = clean(value);
  if (["Danh xưng", "Tự xưng"].includes(category)) return "Xưng hô";
  if (category === "Tổ chức") return "Khác";
  return ["Tên người", "Địa danh", "Chiêu thức", "Vật phẩm", "Xưng hô", "Cấp bậc", "Khác"].includes(category)
    ? category : "Khác";
};

export function buildTranslationBootstrapPrompt(chapters, existingTerms = [], existingRules = []) {
  const sources = (chapters || [])
    .map((chapter, index) => `=== ${chapter.title || `Chương ${index + 1}`} ===\n${clean(chapter.raw_original).slice(0, 6000)}`)
    .filter((item) => item.trim())
    .join("\n\n");
  const knownTerms = existingTerms.slice(0, 500).map((term) => `${term.source_term} → ${term.translation}`).join("\n");
  const knownRules = existingRules.slice(0, 300).map((rule) =>
    `${rule.speaker} → ${rule.listener || "*"}: ${rule.self_word}/${rule.target_word}`
  ).join("\n");

  return `Bạn là chuyên gia tiền xử lý truyện Trung → Việt. Hãy đọc các chương nguồn và lập BỘ QUY ƯỚC TRƯỚC KHI DỊCH.

Mục tiêu: (1) máy từ điển tạo QT ổn định; (2) AI biên tập sau đó có đủ giới tính, thân phận và quan hệ để áp đúng xưng hô.

QUY TẮC BẮT BUỘC:
1. glossaryTerms phải liệt kê CẢ đại từ nhân xưng đơn và các cụm xưng hô xuất hiện: 我, 你, 您, 他, 她, 它, 我们, 你们, 他们, 她们; huynh/tỷ/đệ/muội, cha/mẹ, sư đồ; chức vị; danh xưng; cách tự xưng đặc thù như 本王/朕/臣/奴婢; cùng tên riêng, địa danh và thuật ngữ cần khóa.
2. Với truyện cổ đại, ưu tiên hệ từ cổ đại nhất quán (ví dụ 我 → ta, 你 → ngươi, 他 → hắn, 她 → nàng) nếu văn cảnh không cho thấy quy ước khác. Phân biệt đúng chữ 他 và 她 dù cùng đọc là "ta" trong tiếng Trung.
3. Bản dịch tên riêng dùng âm Hán Việt và viết hoa đúng. Đại từ, danh xưng/cách tự xưng viết thường, tự nhiên. Mỗi đại từ/cách gọi là một mục riêng để người dùng có thể sửa trước khi máy dịch.
4. pronounRules chỉ ghi khi xác định có căn cứ rõ cả người nói và người nghe. self_word là cách người nói tự xưng; target_word là cách gọi người nghe.
5. narrativePronouns là đại từ ngôi ba trong lời kể cho nhân vật, không phải cách tự xưng trong thoại.
6. Không bịa giới tính, thân phận hay quan hệ. Mục chưa chắc vẫn có thể đề xuất nhưng confidence phải thấp và evidence phải nêu căn cứ.
7. Các mục xưng hô/đại từ đã có vẫn phải đưa vào glossaryTerms để người dùng rà soát và sửa đồng bộ. Với tên riêng/thuật ngữ khác thì không cần lặp lại mục đã có.

Trả về DUY NHẤT một JSON object hợp lệ, không markdown:
{
  "glossaryTerms": [{"source_term":"chữ Hán", "translation":"bản Việt", "category":"Tên người|Địa danh|Tổ chức|Danh xưng|Tự xưng|Cấp bậc|Vật phẩm|Chiêu thức|Khác", "confidence":0.0, "evidence":"căn cứ ngắn"}],
  "characters": [{"name":"tên Việt chuẩn", "source_name":"chữ Hán", "gender":"nam|nữ|không rõ", "identity":"thân phận ngắn", "narrative_pronoun":"hắn|nàng|y|cô|anh|ông|bà|nó|không rõ", "confidence":0.0, "evidence":"căn cứ ngắn"}],
  "pronounRules": [{"speaker":"tên Việt", "listener":"tên Việt hoặc *", "self_word":"cách tự xưng", "target_word":"cách gọi đối phương", "note":"bối cảnh áp dụng", "confidence":0.0, "evidence":"căn cứ ngắn"}]
}

GLOSSARY ĐÃ CÓ:
${knownTerms || "(chưa có)"}

MA TRẬN ĐÃ CÓ:
${knownRules || "(chưa có)"}

VĂN BẢN NGUỒN:
${sources}`;
}

export function parseTranslationBootstrapResult(raw) {
  const parsed = JSON.parse(stripJsonFence(raw));
  const glossaryTerms = (Array.isArray(parsed.glossaryTerms) ? parsed.glossaryTerms : [])
    .map((term) => ({
      source_term: clean(term.source_term),
      translation: clean(term.translation),
      category: normalizeCategory(term.category),
      confidence: Math.max(0, Math.min(1, Number(term.confidence) || 0)),
      evidence: clean(term.evidence),
    }))
    .filter((term) => term.source_term && term.translation);
  const characters = (Array.isArray(parsed.characters) ? parsed.characters : [])
    .map((character) => ({
      name: clean(character.name), source_name: clean(character.source_name),
      gender: clean(character.gender) || "không rõ", identity: clean(character.identity),
      narrative_pronoun: clean(character.narrative_pronoun) || "không rõ",
      confidence: Math.max(0, Math.min(1, Number(character.confidence) || 0)),
      evidence: clean(character.evidence),
    }))
    .filter((character) => character.name);
  const pronounRules = (Array.isArray(parsed.pronounRules) ? parsed.pronounRules : [])
    .map((rule) => ({
      speaker: clean(rule.speaker), listener: clean(rule.listener) || "*",
      self_word: clean(rule.self_word), target_word: clean(rule.target_word),
      note: clean(rule.note), confidence: Math.max(0, Math.min(1, Number(rule.confidence) || 0)),
      evidence: clean(rule.evidence),
    }))
    .filter((rule) => rule.speaker && rule.self_word && rule.target_word);
  return { glossaryTerms, characters, pronounRules };
}

export function dedupeTranslationBootstrap(result, existingTerms = [], existingRules = []) {
  const existingTermByKey = new Map(existingTerms.map((term) => [clean(term.source_term).toLocaleLowerCase("vi"), term]));
  const ruleKeys = new Set(existingRules.map((rule) =>
    [rule.speaker, rule.listener || "*", rule.self_word, rule.target_word].map((part) => clean(part).toLocaleLowerCase("vi")).join("\u0000")
  ));
  const proposedTerms = result.glossaryTerms.map((term) => {
    const existing = existingTermByKey.get(term.source_term.toLocaleLowerCase("vi"));
    return existing ? {
      ...term,
      translation: clean(existing.translation) || term.translation,
      existing_id: existing.id,
      existing_translation: clean(existing.translation),
      existing_category: clean(existing.category),
    } : term;
  });
  const proposedKeys = new Set(proposedTerms.map((term) => term.source_term.toLocaleLowerCase("vi")));
  const savedAddressTerms = existingTerms
    .filter((term) => term.category === "Xưng hô" && term.source_term && term.translation)
    .filter((term) => !proposedKeys.has(clean(term.source_term).toLocaleLowerCase("vi")))
    .map((term) => ({
      source_term: clean(term.source_term), translation: clean(term.translation), category: "Xưng hô",
      confidence: Number(term.custom_fields?.confidence) || 1,
      evidence: "Đã có trong Glossary của truyện",
      existing_id: term.id, existing_translation: clean(term.translation), existing_category: term.category,
    }));
  return {
    ...result,
    glossaryTerms: [...savedAddressTerms, ...proposedTerms],
    pronounRules: result.pronounRules.filter((rule) => !ruleKeys.has(
      [rule.speaker, rule.listener || "*", rule.self_word, rule.target_word].map((part) => clean(part).toLocaleLowerCase("vi")).join("\u0000")
    )),
  };
}
