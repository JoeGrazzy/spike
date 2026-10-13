import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Inbox caches public profiles and deduplicates realtime message IDs', async () => {
  const inbox = await readFile(new URL('../../../messages.html', import.meta.url), 'utf8');
  assert.match(inbox, /profileCache=new Map\(\)/);
  assert.match(inbox, /const missing=wanted\.filter\(id=>!profileCache\.has\(id\)\)/);
  assert.match(inbox, /seenIncomingIds=new Set\(inbox\.summaries\?/);
  assert.match(inbox, /seenIncomingIds\.has\(messageId\)/);
});

test('Inbox defers startup until external presence scripts can initialize', async () => {
  const inbox = await readFile(new URL('../../../messages.html', import.meta.url), 'utf8');
  assert.match(inbox, /document\.readyState==='complete'\)load\(\);else window\.addEventListener\('load',load,\{once:true\}\)/);
});

test('Inbox uses delegated pin/archive handlers and debounces search rendering', async () => {
  const inbox = await readFile(new URL('../../../messages.html', import.meta.url), 'utf8');
  assert.match(inbox, /setTimeout\(render,120\)/);
  assert.match(inbox, /\$\('list'\)\.addEventListener\('click'/);
  assert.doesNotMatch(inbox, /querySelectorAll\('\[data-pin\]'\)\.forEach/);
});
