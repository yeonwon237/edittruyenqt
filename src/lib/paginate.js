// Fetch all pages of a Base44 entity query while capping total egress.
// fetchPage(limit, skip) must return an array (a single page of results).
// Stops as soon as a page comes back shorter than `pageSize` (no more data),
// or once `maxItems` is reached (safety cap so a huge/corrupt dataset can't
// trigger unbounded requests).
export async function fetchAllPages(fetchPage, { pageSize = 500, maxItems = 5000 } = {}) {
  let all = [];
  let skip = 0;
  while (all.length < maxItems) {
    const remaining = maxItems - all.length;
    const limit = Math.min(pageSize, remaining);
    const batch = await fetchPage(limit, skip);
    if (!batch || batch.length === 0) break;
    all = all.concat(batch);
    if (batch.length < limit) break;
    skip += limit;
  }
  return all;
}
