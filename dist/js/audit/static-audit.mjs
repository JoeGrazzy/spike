import { readdir, readFile } from 'node:fs/promises';

const expected = ['index.html','feed.html','friends.html','messages.html','message.html','notifications.html','profile.html','rooms.html','room.html','room_chat.html','chat_room.html','settings.html','help.html','spike_predictor.html','admin.html'];
const actual = (await readdir('.')).filter(x => x.endsWith('.html')).sort();
const missing = expected.filter(x => !actual.includes(x));
if (missing.length) throw new Error(`Missing pages: ${missing.join(', ')}`);

const entryPages = new Set(['index.html', 'feed.html']);

for (const file of ['js/telemetry.js', 'js/premium-back.js', 'js/theme.js', 'js/ui-fix.js']) {
  const source = await readFile(file, 'utf8');
  if (/\b(?:as\s+any|:\s*any\b|<any>)/.test(source)) {
    throw new Error(`${file}: explicit any is forbidden`);
  }
}
for (const page of expected) {
  const html = await readFile(page, 'utf8');
  const backCount = (html.match(/data-spike-premium-back=/g) ?? []).length;

  if (!entryPages.has(page)) {
    if (!html.includes('css/premium-back.css') || !html.includes('js/premium-back.js')) {
      throw new Error(`${page}: missing unified back assets`);
    }
    if (backCount !== 1) throw new Error(`${page}: expected exactly one back control, found ${backCount}`);
  } else if (backCount !== 0) {
    throw new Error(`${page}: entry page must not contain a back control`);
  }

  if (/<script[^>]+src=["']http:/i.test(html)) {
    throw new Error(`${page}: insecure HTTP script source`);
  }
  if (/<form[^>]*action=["']javascript:/i.test(html)) {
    throw new Error(`${page}: javascript: form action`);
  }
  if (/SUPABASE_SERVICE_ROLE_KEY|sb_secret_[A-Za-z0-9_-]+|service_role["']?\s*[:=]/i.test(html)) {
    throw new Error(`${page}: possible privileged Supabase credential exposure`);
  }
}

console.log(`Static audit passed: ${expected.length} required pages, back-navigation and credential checks.`);

