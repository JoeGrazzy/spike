import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('telemetry redaction contract remains present', async () => {
  const source = await readFile('js/telemetry.js', 'utf8');
  assert.match(source, /function redact\(/);
  assert.match(source, /authorization/);
  assert.match(source, /password/);
  assert.match(source, /access_token/);
  assert.match(source, /refresh_token/);
  assert.match(source, /sendBeacon/);
  assert.doesNotMatch(source, /FormData/);
});
