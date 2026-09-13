import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../..');
const pack = JSON.parse(fs.readFileSync(path.join(root, 'locales', 'spike-i18n.json'), 'utf8'));
const langs = ['en','fr','ig','yo','ha','pcm'];
const critical = [
  'Meet the builder. Support the journey.',
  'SPIKE is more than an app. It is a 9-year journey of learning, persistence and dedication — built to connect people, encourage expression and give everyone a voice.',
  'Founder & Creator of SPIKE',
  'The 9-year journey'
];

test('all supported language packs exist and cover critical founder strings', () => {
  for (const lang of langs) {
    assert.ok(pack[lang], `missing ${lang} pack`);
    for (const key of critical) assert.ok(typeof pack[lang][key] === 'string', `${lang} missing: ${key}`);
  }
});

test('founder translations are not the old mixed-language substitutions', () => {
  const banned = ['Meet the builder', 'Support the journey', 'more than an app', 'Founder & Creator'];
  for (const lang of ['fr','ig','yo','ha']) {
    for (const key of critical) {
      const value = pack[lang][key];
      for (const phrase of banned) assert.equal(value.includes(phrase), false, `${lang} still contains old English phrase: ${phrase}`);
    }
  }
});

test('production pages load local i18n and build copies translation packs', () => {
  const pages = fs.readdirSync(root).filter(f => f.endsWith('.html'));
  assert.equal(pages.length, 27);
  for (const page of pages) {
    const html = fs.readFileSync(path.join(root,page),'utf8');
    assert.match(html, /js\/spike-i18n\.js/);
  }
  const build = fs.readFileSync(path.join(root,'build.js'),'utf8');
  assert.match(build, /\["css", "assets", "locales"\]/);
});
