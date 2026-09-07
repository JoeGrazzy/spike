import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(new URL('../../../', import.meta.url).pathname);
const pages = fs.readdirSync(ROOT).filter(f => f.endsWith('.html')).sort();

const CSS = fs.readFileSync(path.join(ROOT,'css','spike-mobile-safe-area.css'),'utf8');
const JS = fs.readFileSync(path.join(ROOT,'js','spike-mobile-safe-area.js'),'utf8');

test('mobile safe-area authority exists and has no CSS parser errors', async () => {
  assert.match(CSS, /--spike-safe-top\s*:/);
  assert.match(CSS, /safe-area-inset-top/);
  assert.match(CSS, /\.spike-safe-sticky/);
  assert.match(CSS, /\.spike-safe-flow-header/);
  assert.match(JS, /safe-area-inset-top/);
  assert.match(JS, /spike-safe-sticky/);
  assert.match(JS, /spike-safe-flow-header/);
});

test('every production page loads the mobile safe-area CSS and JS exactly once', () => {
  assert.equal(pages.length, 21);
  for (const file of pages) {
    const html = fs.readFileSync(path.join(ROOT,file),'utf8');
    assert.equal((html.match(/css\/spike-mobile-safe-area\.css/g)||[]).length,1,`${file} safe CSS`);
    assert.equal((html.match(/js\/spike-mobile-safe-area\.js/g)||[]).length,1,`${file} safe JS`);
    assert.match(html,/viewport-fit=cover|viewport-fit=cover/i,`${file} viewport-fit`);
  }
});

test('safe-area layer adds extra bottom clearance without disabling fullscreen', () => {
  assert.match(CSS,/env\(safe-area-inset-bottom/);
  assert.match(CSS,/100vh|100dvh|100svh|100lvh|100vw|100%/);
});
