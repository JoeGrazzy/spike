import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const settings = await readFile('settings.html', 'utf8');

test('Settings treats the database theme as authoritative over cached theme state', () => {
  assert.match(settings, /const dbTheme=Number\(appResult\.data\?\.theme_style\)/);
  assert.match(settings, /ALLOWED_THEMES\.includes\(dbTheme\)\?dbTheme:null/);
  assert.match(settings, /const cached=Number\(getLocal\('theme_style',DEFAULTS\.theme_style\)\)/);
  assert.match(settings, /localStorage\.getItem\('spike-feed-style'\)/);
  const themeLine = settings.split('\n').find(line => line.includes('const dbTheme=Number(appResult.data?.theme_style)'));
  assert.ok(themeLine);
  assert.ok(themeLine.indexOf('const dbTheme=') < themeLine.indexOf("localStorage.getItem('spike-feed-style')"));
});

test('Settings only reports full save success when all persistence operations succeed', () => {
  assert.match(settings, /const failures=\[\];if\(pr\.error\)failures\.push\('privacy'\);if\(ar\.error\)failures\.push\('app settings'\);if\(nr\.error\)failures\.push\('notification preferences'\)/);
  assert.match(settings, /if\(failures\.length\)\{/);
  assert.match(settings, /setStatus\(succeeded\.length\?`Saved \$\{succeeded\.join\(' and '\)\}, but \$\{failures\.join\(', '\)\} failed\. Please retry\.`/);
  assert.match(settings, /setStatus\('Saved\.'\);updateSetupSummary\(\);/);
  const saveLine = settings.split('\n').find(line => line.includes('const [pr,ar,nr,fr]=await Promise.all'));
  assert.ok(saveLine);
  assert.ok(saveLine.includes('db.rpc(\'set_notification_preferences\''));
});
