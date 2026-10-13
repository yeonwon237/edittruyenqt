export const DEFAULT_POLISH_PROMPT = `Bạn là một biên tập viên tiểu thuyết mạng và dịch giả văn học Trung - Việt hàng đầu.
Nhiệm vụ: Làm mượt, trau chuốt và nâng cao chất lượng bản dịch tiếng Việt dưới đây thành văn phong thuần Việt, uyển chuyển, tự nhiên, lôi cuốn, đúng chất tiểu thuyết mạng.
YÊU CẦU BẮT BUỘC: tuân thủ Glossary và Ma trận xưng hô được cung cấp. Nếu xưng hô trong bản QT mâu thuẫn với bảng quy ước thì phải sửa theo bảng quy ước. KHÔNG thay đổi ý nghĩa của đoạn văn, chỉ làm mượt.

1. KHÔNG thay đổi cốt truyện, giữ đúng ngữ nghĩa và cảm xúc gốc của từng câu văn.
2. Chuẩn hóa tên riêng, địa danh, thuật ngữ và xưng hô đúng theo Glossary và Ma trận xưng hô; không tự đổi những tên không có quy ước.
3. Chỉnh sửa câu từ mượt mà, tự nhiên, loại bỏ các cấu trúc ngữ pháp thô cứng của bản dịch máy / convert.
4. Giữ nguyên các dòng ngắt đoạn và lời thoại của nhân vật.
5. CHỈ TRẢ VỀ TOÀN BỘ BẢN VĂN ĐÃ LÀM MƯỢT. Không viết thêm lời mở đầu, không kết luận, không giải thích hay ghi chú thêm bất cứ điều gì.`;

export const DEFAULT_TRANSLATE_PROMPT = `Bạn là dịch giả tiểu thuyết Trung - Việt. Dịch toàn bộ văn bản tiếng Trung dưới đây sang tiếng Việt tự nhiên, đúng nghĩa và đúng sắc thái. Giữ tên riêng, thuật ngữ theo Glossary nếu có. Giữ nguyên các dòng ngắt đoạn và lời thoại. Chỉ trả về bản dịch, không giải thích.

GLOSSARY:
{{GLOSSARY}}

MA TRẬN XƯNG HÔ:
{{PRONOUN_MATRIX}}`;

const POLISH_RULE_GUARD = `QUY TẮC ƯU TIÊN KHI LÀM MƯỢT QT (BẮT BUỘC):
- Glossary và Ma trận xưng hô là dữ liệu chuẩn, có ưu tiên cao hơn cách viết đang có trong bản QT.
- Khi vế trái của một mục Glossary xuất hiện, chuẩn hóa nó thành đúng vế phải; khi vế phải đã đúng thì giữ nguyên.
- Áp dụng đúng cách tự xưng/cách gọi theo từng cặp người nói → người nghe và đúng đại từ của nhân vật trong lời dẫn.
- Chỉ áp dụng quy tắc đối thoại khi xác định được người nói và người nghe; không gán tên hay quy tắc của nhân vật này cho nhân vật khác.
- Không tự thay một tên lạ/không có trong Glossary bằng tên nhân vật đã biết.`;

export function composeEditPrompt(template, sourceText, glossaryText = "", pronounMatrixText = "") {
  const source = String(template || "").trim();
  let prompt = `${source}\n\n${POLISH_RULE_GUARD}`
    .replaceAll("{{GLOSSARY}}", glossaryText || "(trống)")
    .replaceAll("{{PRONOUN_MATRIX}}", pronounMatrixText || "(trống)");
  // Saved/custom prompts from older app versions usually have no placeholders.
  // Still attach both project rule sets so the Polish button can never silently
  // ignore imported terminology or address conventions.
  if (!source.includes("{{GLOSSARY}}")) prompt += `\n\nGLOSSARY (TÊN VÀ THUẬT NGỮ CHUẨN):\n${glossaryText || "(trống)"}`;
  if (!source.includes("{{PRONOUN_MATRIX}}")) prompt += `\n\nMA TRẬN XƯNG HÔ VÀ NGÔI LỜI DẪN:\n${pronounMatrixText || "(trống)"}`;
  return prompt.includes("{{TEXT}}")
    ? prompt.replaceAll("{{TEXT}}", sourceText)
    : `${prompt}\n\nVĂN BẢN CẦN XỬ LÝ:\n${sourceText}`;
}

// Always appended to translation prompts (custom templates included): Gemini
// tends to "reuse" a known character name from the Glossary/matrix for an
// unknown name in the text instead of transliterating it.
const NAME_GUARD_RULE = `QUY TẮC TÊN RIÊNG (BẮT BUỘC):
- Chỉ dùng bản dịch trong Glossary khi ĐÚNG chữ Hán đó xuất hiện trong văn bản.
- Tên người/địa danh không có trong Glossary phải phiên âm Hán Việt theo đúng chữ Hán gốc (ví dụ 戚林 → Thích Lâm).
- TUYỆT ĐỐI không thay tên một nhân vật bằng tên của nhân vật khác trong Glossary hay Ma trận xưng hô.`;

// Keep only glossary entries whose Chinese source actually occurs in the
// text being translated, so unrelated names don't bleed into the output.
export function filterTermsForSource(terms, sourceText) {
  const text = String(sourceText || "");
  return (terms || []).filter((term) => {
    const src = String(term?.source_term || "").trim();
    return src && text.includes(src);
  });
}

// A QT draft is already Vietnamese/Hán-Việt. Keep mappings when either the
// rough/alias form (source_term) or the canonical form (translation) occurs,
// instead of sending the entire story glossary and risking unrelated names
// bleeding into the current chapter.
export function filterTermsForPolish(terms, sourceText) {
  const text = String(sourceText || "").toLocaleLowerCase("vi");
  return (terms || []).filter((term) => {
    const src = String(term?.source_term || "").trim().toLocaleLowerCase("vi");
    const dest = String(term?.translation || "").trim().toLocaleLowerCase("vi");
    return (src && text.includes(src)) || (dest && text.includes(dest));
  });
}

// Drop pronoun/narrative rules for characters that the glossary maps to a
// Chinese name absent from this text. Rules for names we can't map are kept.
export function filterRulesForSource(rules, getName, allTerms, sourceText) {
  const text = String(sourceText || "");
  const present = new Set();
  const absent = new Set();
  (allTerms || []).forEach((term) => {
    const src = String(term?.source_term || "").trim();
    const name = String(term?.translation || "").trim().toLocaleLowerCase("vi");
    if (!src || !name) return;
    (text.includes(src) ? present : absent).add(name);
  });
  return (rules || []).filter((rule) => {
    const name = String(getName(rule) || "").trim().toLocaleLowerCase("vi");
    return !name || present.has(name) || !absent.has(name);
  });
}

export function composeTranslationPrompt(template, sourceText, glossaryText = "", pronounMatrixText = "") {
  const source = `${String(template || "").trim()}\n\n${NAME_GUARD_RULE}`;
  let prompt = source
    .replaceAll("{{GLOSSARY}}", glossaryText || "(trống)")
    .replaceAll("{{PRONOUN_MATRIX}}", pronounMatrixText || "(trống)");
  if (!source.includes("{{GLOSSARY}}")) prompt += `\n\nGLOSSARY:\n${glossaryText || "(trống)"}`;
  if (!source.includes("{{PRONOUN_MATRIX}}")) prompt += `\n\nMA TRẬN XƯNG HÔ:\n${pronounMatrixText || "(trống)"}`;
  return prompt.includes("{{TEXT}}")
    ? prompt.replaceAll("{{TEXT}}", sourceText)
    : `${prompt}\n\nVĂN BẢN CẦN DỊCH:\n${sourceText}`;
}
