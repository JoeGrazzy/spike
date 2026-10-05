import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = path.resolve(process.cwd());
for (const file of ['message.html', 'messages.html']) {
  const html = fs.readFileSync(path.join(root, file), 'utf8');
  assert.match(html, /id="context"/);
  assert.match(html, /\.context\{[^}]*background:linear-gradient\(145deg,var\(--spk-surface,var\(--surface\)\),var\(--spk-surface-2,var\(--surface\)\)\) !important/s);
  assert.match(html, /\.context button\{[^}]*color:var\(--spk-text,var\(--text\)\) !important/s);
  assert.match(html, /\.context button\{[^}]*opacity:1 !important/s);
  assert.match(html, /\.context \.danger\{color:var\(--spk-danger,var\(--danger,#ef476f\)\) !important/s);
}
console.log('message-context-menu-contrast: 4/4 passed');
