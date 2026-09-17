export const DEFAULT_POLISH_PROMPT = `Bạn là một biên tập viên tiểu thuyết mạng và dịch giả văn học Trung - Việt hàng đầu.
Nhiệm vụ: Làm mượt, trau chuốt và nâng cao chất lượng bản dịch tiếng Việt dưới đây thành văn phong thuần Việt, uyển chuyển, tự nhiên, lôi cuốn, đúng chất tiểu thuyết mạng.
YÊU CẦU BẮT BUỘC: giữ nguyên xưng hô gốc, KHÔNG được tự ý chuyển đổi (ví dụ ta-ngươi phải để nguyên ta - ngươi). KHÔNG thay đổi ý nghĩa của đoạn văn, chỉ làm mượt

1. KHÔNG thay đổi cốt truyện, giữ đúng ngữ nghĩa và cảm xúc gốc của từng câu văn.
2. Giữ nguyên tất cả tên riêng nhân vật, địa danh, môn phái, xưng hô đã dịch.
3. Chỉnh sửa câu từ mượt mà, tự nhiên, loại bỏ các cấu trúc ngữ pháp thô cứng của bản dịch máy / convert.
4. Giữ nguyên các dòng ngắt đoạn và lời thoại của nhân vật.
5. CHỈ TRẢ VỀ TOÀN BỘ BẢN VĂN ĐÃ LÀM MƯỢT. Không viết thêm lời mở đầu, không kết luận, không giải thích hay ghi chú thêm bất cứ điều gì.`;

export const DEFAULT_TRANSLATE_PROMPT = `Bạn là dịch giả tiểu thuyết Trung - Việt. Dịch toàn bộ văn bản tiếng Trung dưới đây sang tiếng Việt tự nhiên, đúng nghĩa và đúng sắc thái. Giữ tên riêng, thuật ngữ theo Glossary nếu có. Giữ nguyên các dòng ngắt đoạn và lời thoại. Chỉ trả về bản dịch, không giải thích.

GLOSSARY:
{{GLOSSARY}}

MA TRẬN XƯNG HÔ:
{{PRONOUN_MATRIX}}`;

export function composeEditPrompt(template, sourceText, glossaryText = "") {
  const prompt = String(template || "").trim().replaceAll("{{GLOSSARY}}", glossaryText || "(trống)");
  return prompt.includes("{{TEXT}}")
    ? prompt.replaceAll("{{TEXT}}", sourceText)
    : `${prompt}\n\nVĂN BẢN CẦN XỬ LÝ:\n${sourceText}`;
}

export function composeTranslationPrompt(template, sourceText, glossaryText = "", pronounMatrixText = "") {
  const source = String(template || "").trim();
  let prompt = source
    .replaceAll("{{GLOSSARY}}", glossaryText || "(trống)")
    .replaceAll("{{PRONOUN_MATRIX}}", pronounMatrixText || "(trống)");
  if (!source.includes("{{GLOSSARY}}")) prompt += `\n\nGLOSSARY:\n${glossaryText || "(trống)"}`;
  if (!source.includes("{{PRONOUN_MATRIX}}")) prompt += `\n\nMA TRẬN XƯNG HÔ:\n${pronounMatrixText || "(trống)"}`;
  return prompt.includes("{{TEXT}}")
    ? prompt.replaceAll("{{TEXT}}", sourceText)
    : `${prompt}\n\nVĂN BẢN CẦN DỊCH:\n${sourceText}`;
}
