import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const html=await readFile('admin.html','utf8');

test('Admin Edge Functions workspace exposes the complete deployed function matrix',()=>{
  for(const name of ['create-private-call','spike-predictor-sync','admin-register-user','spike-media-download','spike-paystack-init','spike-b2-media','spike-webauthn','spike-paystack-verify','admin-user-ops']) assert.match(html,new RegExp(name));
  assert.match(html,/EDGE_FUNCTIONS/);
  assert.match(html,/edge-functions/);
});

test('Admin Edge Functions workspace preserves secure user-bound functions',()=>{
  assert.match(html,/Intentionally user-bound/);
  assert.match(html,/JWT validation stays enabled/);
  assert.match(html,/no admin impersonation/);
});

test('Admin Edge Functions workspace maps the current deployed versions',()=>{
  for(const version of [37,41,36,38,27,2,5]) assert.match(html,new RegExp(`version:${version}`));
});
