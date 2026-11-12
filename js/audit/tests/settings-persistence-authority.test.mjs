import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const settings = await readFile('settings.html', 'utf8');

test('Settings preserves the current browser theme before falling back to the account value', () => {
  assert.match(settings, /spike-theme-choice-v3/);
  assert.match(settings, /localStorage\.getItem\('spike-theme-choice-v3'\)/);
  assert.match(settings, /let theme=null;try\{const shared=Number\(localStorage\.getItem\('spike-theme-choice-v3'\)\)/);
  assert.match(settings, /if\(theme===null\)\{const dbTheme=Number\(appResult\.data\?\.theme_style\)/);
  const themeLine = settings.split('\n').find(line => line.includes("let theme=null;try{const shared=Number(localStorage.getItem('spike-theme-choice-v3'))"));
  assert.ok(themeLine);
  assert.ok(themeLine.indexOf('localStorage.getItem') < themeLine.indexOf('const dbTheme='));
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
