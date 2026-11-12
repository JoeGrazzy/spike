import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const runtime = fs.readFileSync(path.join(root, 'js/spike-typing.js'), 'utf8');

test('all chat surfaces use the one shared typing runtime', () => {
  for (const page of ['message.html', 'messages.html', ]) {
    const html = fs.readFileSync(path.join(root, page), 'utf8');
    assert.equal((html.match(/js\/spike-typing\.js/g) || []).length, 1, `${page} must load the runtime once`);
    assert.match(html, /SpikeTyping/, `${page} must call the shared API`);
  }
});

test('runtime has one central broadcast sender and receiver', () => {
  assert.equal((runtime.match(/\.on\('broadcast',\s*\{\s*event:\s*'typing'/g) || []).length, 1);
  assert.equal((runtime.match(/\.send\(\{\s*type:\s*'broadcast',\s*event:\s*'typing'/g) || []).length, 1);
});


test('concurrent same-conversation startup shares the pending subscription', async () => {
  const channels = [];
  const makeNode = () => ({ hidden: true, textContent: '', classList: { toggle() {} }, parentElement: null,
    querySelector() { return null; }, insertBefore() {}, insertAdjacentElement() {}, setAttribute() {} });
  const document = { querySelector() { return null; }, createElement() { return makeNode(); } };
  const window = { addEventListener() {} };
  const context = { window, document, console, Date, Map, Set, Math, String, Number, Array, Promise, Error, RegExp,
    setInterval() { return 1; }, clearInterval() {}, setTimeout() { return 1; }, clearTimeout() {}, CSS: { escape: x => x } };
  vm.createContext(context); vm.runInContext(runtime, context);
  const db = { channel(topic) {
    const channel = { topic, listeners: [], status: null, on(type, filter, cb) { if (filter?.event === 'typing') this.listeners.push(cb); return this; },
      subscribe(cb) { this.status = cb; return this; }, send() { return Promise.resolve('ok'); } };
    channels.push(channel); return channel;
  }, removeChannel() { return Promise.resolve(); } };
  const input = { value: '', addEventListener() {}, removeEventListener() {} };
  const args = { db, meId: '11111111-1111-4111-8111-111111111111', peerId: '22222222-2222-4222-8222-222222222222', input, anchor: makeNode() };
  const first = window.SpikeTyping.startDM(args), second = window.SpikeTyping.startDM(args);
  assert.equal(channels.length, 1, 'only one channel is created while connecting');
  channels[0].status('SUBSCRIBED');
  assert.deepEqual(await Promise.all([first, second]), [true, true]);
  assert.equal(channels[0].listeners.length, 1, 'concurrent activation must not duplicate listeners');
});

test('same conversation activation reuses its channel and listener', async () => {
  const channels = [], sent = [], removed = [];
  const makeNode = () => ({ hidden: true, textContent: '', classList: { toggle() {} }, dataset: {},
    parentElement: null, querySelector() { return null; }, insertBefore(el) { this.first = el; el.parentElement = this; },
    insertAdjacentElement() {}, addEventListener() {}, removeEventListener() {}, setAttribute() {} });
  const document = { querySelector() { return null; }, createElement() { return makeNode(); } };
  const window = { addEventListener() {} };
  const context = { window, document, console, Date, Map, Set, Math, String, Number, Array, Promise, Error, RegExp,
    setInterval() { return 1; }, clearInterval() {}, setTimeout() { return 1; }, clearTimeout() {}, CSS: { escape: x => x } };
  vm.createContext(context);
  vm.runInContext(runtime, context);
  const db = { channel(topic) {
    const channel = { topic, listeners: [], on(type, filter, cb) { if (filter?.event === 'typing') this.listeners.push(cb); return this; },
      subscribe(cb) { cb('SUBSCRIBED'); return this; }, send(payload) { sent.push({ topic, payload }); return Promise.resolve('ok'); } };
    channels.push(channel); return channel;
  }, removeChannel(channel) { removed.push(channel); return Promise.resolve(); } };
  const parent = makeNode(), anchor = makeNode(); anchor.parentElement = parent;
  const input = { value: 'hello', addEventListener() {}, removeEventListener() {} };
  const ids = { meId: '11111111-1111-4111-8111-111111111111', peerId: '22222222-2222-4222-8222-222222222222' };
  assert.equal(await window.SpikeTyping.startDM({ db, ...ids, input, anchor }), true);
  assert.equal(await window.SpikeTyping.startDM({ db, ...ids, input, anchor }), true);
  assert.equal(channels.length, 1);
  assert.equal(channels[0].listeners.length, 1);
  assert.doesNotThrow(() => channels[0].listeners[0]({ payload: { user_id: ids.peerId, typing: true, expires_at: Date.now() + 3000, display_name: 'Peer' } }));
  assert.doesNotThrow(() => channels[0].listeners[0]({ payload: { user_id: ids.peerId, typing: false } }));
  window.SpikeTyping.setTyping(true);
  window.SpikeTyping.setTyping(false);
  assert.equal(sent.length, 2);
  assert.equal(window.SpikeTyping.diagnostics().channels, 1, 'only the current direct conversation remains subscribed');
});
