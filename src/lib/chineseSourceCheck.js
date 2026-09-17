export function findPrivateUseCharacters(text) {
  return [...String(text || "")].filter((character) => /\p{Co}/u.test(character));
}

export function assertChineseSourceReadable(text) {
  const characters = findPrivateUseCharacters(text);
  if (!characters.length) return;
  const examples = [...new Set(characters)].slice(0, 3).join(" ");
  throw new Error(`Văn bản gốc có ${characters.length} ký tự bị mã hóa (ví dụ: ${examples}). Hãy dùng bản tiếng Trung đã giải mã hoặc sửa nguồn trước khi Dịch AI.`);
}
