export function countVietnameseWords(value) {
  const text = String(value || '').trim();
  return text ? text.split(/\s+/u).length : 0;
}

export function summarizeChapterWordCounts(wordCounts) {
  const counts = Object.values(wordCounts || {}).filter(count => Number.isFinite(count) && count > 0);
  return {
    sampleSize: counts.length,
    average: counts.length ? Math.round(counts.reduce((sum, count) => sum + count, 0) / counts.length) : 0,
  };
}

export function chapterLengthWarning(wordCount, average, sampleSize) {
  if (!wordCount || !average || sampleSize < 5) return null;
  if (wordCount < average * 0.6) return { type: 'short', label: 'Ít chữ bất thường' };
  if (wordCount > average * 1.6) return { type: 'long', label: 'Nhiều chữ bất thường' };
  return null;
}
