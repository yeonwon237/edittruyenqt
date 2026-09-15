// Offline diagnostic: run the production zero-AI engine (src/lib/hanviet.js)
// against Gemini-teacher reference translations from the tran-vi-teacher
// corpus, and bucket source lines by grammatical trigger marker so we can
// find which structural patterns our rule set still gets wrong, at scale.
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { build } from 'esbuild';

const REPO_ROOT = new URL('../../', import.meta.url).pathname;

const bundled = await build({
  entryPoints: [`${REPO_ROOT}src/lib/hanviet.js`],
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
  logLevel: 'silent',
});
const { translateHanViet } = await import(
  `data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`
);

const MAX_ROWS = Number(process.argv[2] || 15000);

const MARKERS = {
  ba_jiang: (s) => s.includes('把') || s.includes('将'),
  bei_passive: (s) => s.includes('被'),
  causative: (s) => s.includes('让') || s.includes('使'),
  adverbial_de: (s) => s.includes('地'),
  attributive_de: (s) => s.includes('的'),
  coverb_dui: (s) => s.includes('对'),
  concessive: (s) => s.includes('虽然') || s.includes('但是') || s.includes('尽管'),
  correlative: (s) => (s.includes('越') && s.split('越').length > 2) || s.includes('不但') || s.includes('而且'),
};

const buckets = Object.fromEntries(Object.keys(MARKERS).map((k) => [k, []]));
const counts = Object.fromEntries(Object.keys(MARKERS).map((k) => [k, 0]));
let linePairs = 0;
let rowsUsed = 0;

const raw = readFileSync(`${new URL('.', import.meta.url).pathname}data/sample_large.jsonl`, 'utf8');
const lines = raw.split('\n').filter(Boolean);

for (const jsonLine of lines) {
  if (rowsUsed >= MAX_ROWS) break;
  let row;
  try {
    row = JSON.parse(jsonLine);
  } catch {
    continue;
  }
  const srcLines = row.source_zh.split('\n').filter(Boolean);
  const tgtLines = row.target_vi.split('\n').filter(Boolean);
  if (srcLines.length !== tgtLines.length) continue;
  rowsUsed += 1;

  for (let i = 0; i < srcLines.length; i += 1) {
    const src = srcLines[i];
    const tgt = tgtLines[i];
    if (src.length < 4 || src.length > 120) continue; // skip trivial/very long lines for now
    linePairs += 1;

    const tags = Object.entries(MARKERS)
      .filter(([, test]) => test(src))
      .map(([name]) => name);
    if (tags.length === 0) continue;

    let ours;
    try {
      ours = (await translateHanViet(src)).text;
    } catch {
      continue;
    }

    for (const tag of tags) {
      counts[tag] += 1;
      if (buckets[tag].length < 60) {
        buckets[tag].push({ source: src, ours, teacher: tgt });
      }
    }
  }
}

mkdirSync(`${new URL('.', import.meta.url).pathname}out`, { recursive: true });
for (const [tag, examples] of Object.entries(buckets)) {
  writeFileSync(
    `${new URL('.', import.meta.url).pathname}out/${tag}.json`,
    JSON.stringify(examples, null, 2),
    'utf8'
  );
}

console.log(`rows scanned: ${rowsUsed}, line pairs considered: ${linePairs}`);
console.log('marker frequency (lines with marker present, before line-length filter excluded some):');
for (const [tag, n] of Object.entries(counts)) {
  console.log(`  ${tag.padEnd(16)} ${n}`);
}
