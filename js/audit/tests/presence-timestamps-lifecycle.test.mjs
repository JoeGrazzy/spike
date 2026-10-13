import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../../presence-timestamps.js', import.meta.url), 'utf8');
test('presence timestamp helper starts once and centralizes timer cleanup', () => {
  assert.match(source, /if\(started\)return/);
  assert.match(source, /function stopTimers\(\)/);
  assert.match(source, /function scheduleTimers\(\)/);
});
test('presence timestamp polling resumes after page is restored from browser cache', () => {
  assert.match(source, /addEventListener\('pageshow'/);
  assert.match(source, /addEventListener\('pagehide',\(\)=>\{stopTimers\(\)\}\)/);
  assert.match(source, /visibilitychange'[\s\S]*scheduleTimers\(\)/);
});
test('presence timestamp helper does not start the shared presence runtime a second time', () => {
  assert.doesNotMatch(source, /AppPresence\?\.start\s*\(/);
  assert.match(source, /AppPresence\?\.isPublishing\?\.\(\)/);
});
