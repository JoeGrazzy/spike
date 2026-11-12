import { readdir, readFile, writeFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

const root = process.cwd();
const manifestPath = path.join(root, 'js', 'audit', 'protected-baseline.json');
const excluded = new Set([
  'js/audit/protected-baseline.json',
  'js/audit/create-protected-baseline.mjs',
  'js/audit/tests/protected-baseline.test.mjs',
]);

async function walk(dir, out=[]) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) await walk(abs, out);
    else out.push(abs);
  }
  return out;
}

const files = (await walk(root))
  .map(f => path.relative(root, f).split(path.sep).join('/'))
  .filter(f => !excluded.has(f))
  .sort();

const entries = {};
for (const rel of files) {
  const data = await readFile(path.join(root, rel));
  const s = await stat(path.join(root, rel));
  entries[rel] = {
    bytes: s.size,
    sha256: createHash('sha256').update(data).digest('hex'),
  };
}

const manifest = {
  schema: 1,
  created_from: 'SPIKE_PROJECT_BEAUTIFUL_2026-09-22',
  policy: 'Existing baseline files are protected. New files are allowed. Intentional baseline changes require regenerating this manifest and reviewing the resulting diff.',
  file_count: files.length,
  files: entries,
};
await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
console.log(`Protected baseline created: ${files.length} files`);
