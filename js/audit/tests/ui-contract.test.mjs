import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';

const pages = (await readdir('.')).filter((x) => x.endsWith('.html')).sort();
for (const page of pages) {
  test(`UI contract: ${page}`, async () => {
    const html = await readFile(page, 'utf8');
    assert.match(html, /<!doctype html>/i);
    assert.match(html, /<html\b[^>]*\blang=["'][^"']+["']/i);
    assert.match(html, /<meta\b[^>]*name=["']viewport["']/i);
    assert.match(html, /<title>[^<]+<\/title>/i);
    assert.doesNotMatch(html, /<script[^>]+src=["'](?:js\/spike-core|js\/security-hardening|js\/media-guard)\.js["']/i);
  });
}
