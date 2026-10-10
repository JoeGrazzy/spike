import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile('admin.html', 'utf8');
const css = await readFile('css/admin-workspace-v1.css', 'utf8');

test('Admin workspace groups every existing navigation destination exactly once', () => {
  const expected = ['overview','posts','roomPurchases','packages','gems','rooms','users','broadcasts','maintenance','admins','audit','policyModeration','safetyRecovery'];
  for (const page of expected) {
    assert.equal((html.match(new RegExp(`data-page="${page}"`, 'g')) || []).length, 1, `${page} must have one navigation control`);
    assert.match(html, new RegExp(`<section id="${page}"`), `${page} content section must remain`);
  }
});

test('Admin workspace styling is page-scoped and loaded after shared theme authority', () => {
  assert.match(html, /<link rel="stylesheet" href="css\/admin-workspace-v1\.css">/);
  assert.ok(html.indexOf('css/admin-workspace-v1.css') > html.indexOf('css/spike-theme-runtime-v3.css'));
  assert.match(css, /body\[data-spike-page="admin"\]/);
  assert.match(css, /@media \(max-width: 800px\)/);
  assert.match(css, /@media \(max-width: 560px\)/);
});

test('Admin page navigation keeps the existing delegated event authority and RPC runtime', () => {
  assert.match(html, /side\.addEventListener\('click'/);
  assert.match(html, /function showAdminPage\(page, button\)/);
  assert.match(html, /async function safeRpc\(name,args,context=name\)/);
  assert.match(html, /is_super_admin/);
  assert.match(html, /admin_guard/);
});
