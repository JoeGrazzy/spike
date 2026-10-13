import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const html = fs.readFileSync(path.join(root, 'message.html'), 'utf8');

test('direct-message history starts with the newest page using stable descending query order', () => {
  assert.match(html, /order\('created_at',\{ascending:false\}\)\.order\('id',\{ascending:false\}\)\.range\(offset,offset\+messagePageSize-1\)/);
  assert.match(html, /messagePageSize=500/);
  assert.match(html, /function compareMessageOrder\(a,b\)/);
  assert.match(html, /items\.sort\(compareMessageOrder\)/);
});

test('older-message pagination advances by fetched rows and merges without duplicate IDs', () => {
  assert.match(html, /const offset=older\?messageOffset:0/);
  assert.match(html, /messageOffset=offset\+page\.length/);
  assert.match(html, /const existing=new Set\(items\.map\(m=>String\(m\.id\)\)\)/);
  assert.match(html, /if\(!m\.deleted_at&&!existing\.has\(String\(m\.id\)\)\)items\.push\(m\)/);
  assert.match(html, /page\.length===messagePageSize\?'block':'none'/);
});

test('older-page loading preserves the reader scroll position and exposes a retryable control', () => {
  assert.match(html, /id="loadOlderMessages"/);
  assert.match(html, /previousTop\+\(newHeight-previousHeight\)/);
  assert.match(html, /Could not load older messages:/);
  assert.match(html, /loadOlderMessages'\)\.addEventListener\('click'/);
});
