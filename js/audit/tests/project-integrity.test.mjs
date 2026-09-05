import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFile as readTextFile } from 'node:fs/promises';

const nodeCheck = file => new Promise((resolve, reject) => {
  const child = spawn(process.execPath, ['--check', file], { stdio: ['ignore', 'pipe', 'pipe'] });
  let stderr = ''; child.stderr.on('data', d => { stderr += d; });
  child.on('error', reject); child.on('close', code => resolve({ code, stderr }));
});

const pages = ['index.html','feed.html','friends.html','messages.html','message.html','notifications.html','profile.html','rooms.html','room.html','room_chat.html','chat_room.html','settings.html','help.html','spike_predictor.html','admin.html'];

test('development dependencies are explicitly pinned', async () => {
  const pkg = JSON.parse(await readTextFile('package.json', 'utf8'));
  for (const [name, version] of Object.entries(pkg.devDependencies || {})) {
    assert.match(version, /^\d+\.\d+\.\d+$/, `${name}: dependency version must be exact, not a range`);
  }
});

test('project contains no orphaned root implementation pages', async () => {
  const js = await readdir('js');
  assert.ok(!js.includes('room_chat_final.html'), 'historical duplicate room-chat implementation must not return');
});

test('Supabase CDN is pinned consistently', async () => {
  for (const page of pages) {
    const html = await readFile(page, 'utf8');
    for (const match of html.matchAll(/@supabase\/supabase-js@([^/"']+)/g)) assert.equal(match[1], '2.112.4', `${page}: unpinned/mismatched Supabase version`);
  }
});

test('Font Awesome CDN is pinned consistently', async () => {
  for (const page of pages) {
    const html = await readFile(page, 'utf8');
    for (const match of html.matchAll(/fontawesome-free@([0-9.]+)/g)) assert.equal(match[1], '7.2.0', `${page}: mismatched Font Awesome version`);
    assert.doesNotMatch(html, /cdnjs\.cloudflare\.com\/ajax\/libs\/font-awesome\//i, `${page}: legacy Font Awesome CDN remains`);
  }
});

test('Feed has no private duplicate theme registry', async () => {
  const feed = await readFile('feed.html', 'utf8');
  assert.doesNotMatch(feed, /SPIKE CORE THEME SYSTEM/);
  assert.doesNotMatch(feed, /const KEY\s*=\s*["']spike-feed-style["']/);
});


test('all inline HTML JavaScript blocks are syntactically valid', async () => {
  const { readdir: readDir } = await import('node:fs/promises');
  const files = (await readDir('.')).filter(x => x.endsWith('.html'));
  const root = tmpdir();
  let checked = 0;
  for (const page of files) {
    const html = await readFile(page, 'utf8');
    const blocks = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>(.*?)<\/script>/gis)];
    for (let i = 0; i < blocks.length; i++) {
      const source = blocks[i][1].trim();
      if (!source) continue;
      const path = join(root, `spike-inline-${process.pid}-${checked++}.mjs`);
      await writeFile(path, source);
      const result = await nodeCheck(path);
      assert.equal(result.code, 0, `${page} inline script ${i + 1} failed syntax check: ${result.stderr}`);
    }
  }
  assert.equal(checked, 105);
});
