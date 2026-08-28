// Positions are for selection/display only. Requests always carry stable chapter UUIDs.
export function selectChapterRange(chapters, expression) {
  if (!expression.trim()) throw new Error('Nhập số chương, ví dụ: 1-20, 25, 30-35.');
  const indexes = new Set();
  for (const part of expression.split(',')) {
    const match = part.trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/);
    if (!match) throw new Error('Dùng dạng 1-20, 25, 30-35.');
    const start = Number(match[1]), end = Number(match[2] || match[1]);
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 1 || end < start || end > chapters.length) throw new Error(`Số chương phải nằm trong 1–${chapters.length}, khoảng từ nhỏ đến lớn.`);
    for (let i = start; i <= end; i++) indexes.add(i - 1);
  }
  return chapters.filter((_, index) => indexes.has(index)).map(ch => ch.id);
}

export function chapterIdsForMode(chapters, mode, currentChapterId, selectedIds = []) {
  const selected = new Set(selectedIds);
  const available = new Set(chapters.map(ch => ch.id));
  if (mode === 'selected' && selectedIds.some(id => !available.has(id))) throw new Error('Danh sách chương vừa thay đổi. Hãy tải lại danh sách và chọn lại.');
  return chapters.filter(ch => mode === 'all' || (mode === 'current' ? ch.id === currentChapterId : mode === 'selected' ? selected.has(ch.id) : mode === 'new' ? !ch.synced : ch.changed)).map(ch => ch.id);
}
