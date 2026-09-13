import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';

const root = process.cwd();
const source = fs.readFileSync(path.join(root, 'js/spike-safety-center-v5.js'), 'utf8');
const feed = fs.readFileSync(path.join(root, 'feed.html'), 'utf8');

// Regression guards for the failures reported in the real browser.
assert.equal(/(?:^|[^.\w])(?:alert|confirm|prompt)\s*\(/.test(source), false, 'Safety Center must not use native dialogs');
assert.equal(/window\.toast\s*\(/.test(source), false, 'Safety Center must not call window.toast');
assert.equal((source.match(/async function passkey\(/g) || []).length, 1, 'Passkey handler must exist exactly once');
assert.match(feed, /js\/spike-safety-center-v5\.js\?v=20260912-6/);
assert.doesNotMatch(feed, /spike-safety-center-v4\.js/);

const features = [
  ['1. Safety Activity Timeline','activity'],
  ['2. Suspicious Activity Detection','scan:activity'],
  ['3. Anti-Scam Protection','scan:scam'],
  ['4. Impersonation Protection','scan:impersonation'],
  ['5. Personal Safety Code','recovery:generate'],
  ['6. Trusted Contacts','recovery:contacts'],
  ['7. Safety Mode','mode'],
  ['8. Harassment Protection Mode','toggle:harassment'],
  ['9. Interaction Rate Protection','toggle:rate'],
  ['10. Suspicious Link Scanner','toggle:links'],
  ['11. Sensitive Information Warning','toggle:sensitive'],
  ['12. Sensitive Screen Protection','toggle:screen'],
  ['13. Passkey Protection','passkey'],
  ['14. Safety Automation Rules','rule:add'],
  ['15. Safety Diagnostics','diagnostics:run'],
];
for (const [feature, action] of features) {
  assert.ok(source.includes(feature), `${feature} is missing`);
  assert.ok(source.includes(action), `${feature} action is missing`);
}

const persisted = new Map();
const mockWindow = {
  __SPIKE_SAFETY_TEST__: true,
  state: { user: { id: 'u-test' }, profile: { username: 'alice' }, posts: [], users: new Map() },
  crypto: globalThis.crypto,
  isSecureContext: true,
  PublicKeyCredential: undefined,
  navigator: { credentials: {} },
  sb: { auth: { getSession: async () => ({data:{session:{user:{id:'u-test'}}},error:null}) }, rpc: async () => ({data:{ok:true},error:null}), functions: { invoke: async (name,{body}) => { if(body.action==='registration-options') return {data:{challenge:'AQIDBA',rp:{name:'SPIKE',id:'localhost'},user:{id:'AQIDBA',name:'spike-u-test',displayName:'SPIKE User'},pubKeyCredParams:[{type:'public-key',alg:-7}],timeout:60000,attestation:'none',authenticatorSelection:{residentKey:'required',userVerification:'required'},excludeCredentials:[]},error:null}; if(body.action==='registration-verify') return {data:{ok:true,credentialId:'AQIDBA'},error:null}; if(body.action==='authentication-options') return {data:{challenge:'AQIDBA',rpId:'localhost',allowCredentials:[{id:'AQIDBA',type:'public-key'}],userVerification:'required'},error:null}; if(body.action==='authentication-verify') return {data:{ok:true,credentialId:'AQIDBA'},error:null}; return {data:null,error:new Error('Unknown test action')}; } } },
  location: { hostname: 'localhost' },
  openPremiumSheet() {},
  spikePremiumToast() {},
  closePremiumSheet() {},
  getDoc: async key => persisted.get(key) ?? null,
  putDoc: async (key, value) => { persisted.set(key, structuredClone(value)); return value; },
};
const mockDocument = {
  readyState: 'loading',
  addEventListener() {},
  getElementById() { return null; },
  createElement() { return {}; },
  querySelectorAll() { return []; },
};
const context = vm.createContext({
  window: mockWindow,
  navigator: mockWindow.navigator,
  location: mockWindow.location,
  document: mockDocument,
  console,
  crypto: globalThis.crypto,
  URL,
  Uint8Array,
  Uint32Array,
  Date,
  Math,
  btoa,
  atob,
  structuredClone,
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
});
vm.runInContext(source, context);
const api = mockWindow.__SPIKE_SAFETY_CENTER_TEST__;
assert.ok(api, 'Safety test API should be available in test mode');

// Scanner correctness.
const scam = await api.scanText('URGENT verify your password at https://xn--example-9za.com/reset?token=abc');
assert.equal(scam.level, 'high');
assert.ok(scam.score >= 70);
const clear = await api.scanText('Hello SPIKE community');
assert.equal(clear.level, 'low');
const payment = await api.scanText('Please send money in USDT immediately');
assert.ok(payment.score >= 35);

// Safety code generation must use the real app client exposed as window.sb, not the Supabase namespace.
await api.generateCode();
assert.match(api.getData().safetyCode, /^\d{4}-\d{4}-\d{4}$/);
const firstGenerated = api.getData().safetyCode;
// Safety code format and persistence.
const code = api.randomCode();
assert.match(code, /^\d{4}-\d{4}-\d{4}$/);
api.setData({ safetyCode: code, trustedContacts: ['friend-1'] });
assert.equal(api.getData().safetyCode, code);
assert.deepEqual(api.getData().trustedContacts, ['friend-1']);

// Automation engine: a risky-link event must enable configured protection.
api.setData({ automationRules: [{ when:'risky_link', then:'screen', whenLabel:'High-risk link detected', thenLabel:'Enable screen protection' }], screenProtection:false });
await api.applyRules('risky_link');
assert.equal(api.getData().screenProtection, true);

// Passkey registration + local browser retrieval path, using deterministic browser mocks.
mockWindow.PublicKeyCredential = function PublicKeyCredential() {};
let createCalled = false;
let getCalled = false;
mockWindow.navigator.credentials.create = async () => {
  createCalled = true;
  return { id:'AQIDBA', rawId: Uint8Array.from([1,2,3,4]), type:'public-key', response:{clientDataJSON:Uint8Array.from([1]),attestationObject:Uint8Array.from([2]),getTransports:()=>[]} };
};
mockWindow.navigator.credentials.get = async () => {
  getCalled = true;
  return { id:'AQIDBA', rawId: Uint8Array.from([1,2,3,4]), type:'public-key', response:{clientDataJSON:Uint8Array.from([1]),authenticatorData:Uint8Array.from([2]),signature:Uint8Array.from([3]),userHandle:null} };
};
await api.passkey();
assert.equal(createCalled, true);
assert.equal(api.getData().passkey.registered, true);
assert.ok(api.getData().passkey.credentialId);
await api.verifyPasskey();
assert.equal(getCalled, true);
assert.ok(api.getData().passkey.lastVerifiedAt);

console.log('Safety Center v5 tests: PASS');
