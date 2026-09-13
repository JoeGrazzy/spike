import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { test } from 'node:test';

const root = path.resolve(new URL('../../..', import.meta.url).pathname);
const source = fs.readFileSync(path.join(root, 'js/spike-navigation.js'), 'utf8');

function harness({ navigationType = 'navigate', pathname = '/profile.html' } = {}) {
  const listeners = new Map();
  const storage = new Map();
  let scrollY = 0;
  const window = {
    scrollY: 0,
    pageYOffset: 0,
    scrollTo(arg) { scrollY = typeof arg === 'number' ? arg : Number(arg.top || 0); },
    requestAnimationFrame(fn) { fn(); },
    addEventListener(type, fn) { listeners.set(type, fn); },
    SPIKENavigation: undefined,
  };
  const document = { visibilityState: 'visible' };
  const context = {
    window,
    document,
    performance: { getEntriesByType: () => [{ type: navigationType }] },
    location: { pathname, search: '' },
    sessionStorage: {
      getItem(k) { return storage.has(k) ? storage.get(k) : null; },
      setItem(k, v) { storage.set(k, String(v)); },
      removeItem(k) { storage.delete(k); },
    },
    requestAnimationFrame: window.requestAnimationFrame,
    console,
  };
  vm.runInNewContext(source, context, { filename: 'spike-navigation.js' });
  return { window, listeners, storage, getScroll: () => scrollY };
}

test('captures and restores scroll on a normal back/forward document load', () => {
  const h = harness({ navigationType: 'back_forward' });
  h.window.scrollY = 742;
  h.listeners.get('pagehide')({ persisted: false });
  h.window.scrollY = 0;
  h.listeners.get('pageshow')({ persisted: false });
  assert.equal(h.getScroll(), 742);
});

test('does not overwrite BFCache-restored pages', () => {
  const h = harness({ navigationType: 'back_forward' });
  h.window.scrollY = 500;
  h.listeners.get('pageshow')({ persisted: true });
  assert.equal(h.getScroll(), 0);
});

test('reload clears the generic navigation snapshot', () => {
  const h = harness({ navigationType: 'navigate' });
  h.window.scrollY = 321;
  h.listeners.get('pagehide')({ persisted: false });
  assert.notEqual(h.storage.size, 0);
  const reload = harness({ navigationType: 'reload' });
  assert.equal(reload.storage.size, 0);
});

test('every production HTML page loads the shared navigation layer', () => {
  const pages = fs.readdirSync(root).filter(name => name.endsWith('.html'));
  assert.ok(pages.length > 0);
  for (const page of pages) {
    const html = fs.readFileSync(path.join(root, page), 'utf8');
    assert.match(html, /js\/spike-navigation\.js/, `${page} is missing shared navigation restoration`);
  }
});
