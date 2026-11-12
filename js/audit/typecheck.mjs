import { readdir, readFile, writeFile, rm, mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const roots = ['js'];
const files = [];
async function walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) await walk(path);
    else if (/\.(?:js|mjs)$/.test(entry.name)) files.push(path);
  }
}
for (const root of roots) await walk(root);
for (const file of files) await exec(process.execPath, ['--check', file]);

const htmlFiles = (await readdir('.')).filter(name => name.endsWith('.html') && !name.includes('.pre-rebuild.'));
const tempRoot = await mkdtemp(join(tmpdir(), 'spike-inline-audit-'));
let inlineBlocks = 0;
try {
  for (const file of htmlFiles) {
    const html = await readFile(file, 'utf8');
    const matches = html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi);
    let blockNo = 0;
    for (const match of matches) {
      const code = match[1].trim();
      if (!code) continue;
      inlineBlocks++;
      blockNo++;
      const tempFile = join(tempRoot, `${file.replace(/[^a-z0-9_.-]/gi, '_')}-${blockNo}.js`);
      await writeFile(tempFile, code, 'utf8');
      try {
        await exec(process.execPath, ['--check', tempFile]);
      } catch (error) {
        throw new Error(`${file}: inline script #${blockNo} syntax check failed: ${error.stderr || error.message}`);
      }
    }
  }
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}
console.log(`Syntax check passed: ${files.length} JavaScript files + ${inlineBlocks} inline HTML script blocks.`);
