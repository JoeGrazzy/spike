import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
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
console.log(`Syntax check passed: ${files.length} JavaScript files.`);
