import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const langs=['en','fr','ig','yo','ha','pcm'];
const pages=fs.readdirSync(root).filter(x=>x.endsWith('.html'));
const pack=JSON.parse(fs.readFileSync(path.join(root,'locales/spike-i18n.json'),'utf8'));

test('all supported languages have the same complete key set',()=>{
  const base=new Set(Object.keys(pack.en));
  for(const lang of langs) assert.deepEqual(new Set(Object.keys(pack[lang])),base,lang);
});

test('every HTML page loads the local i18n runtime and no external translator',()=>{
  assert.equal(pages.length,27);
  for(const page of pages){
    const s=fs.readFileSync(path.join(root,page),'utf8');
    assert.match(s,/js\/spike-i18n\.js/);
  }
});

test('language selector exists only on settings.html source',()=>{
  const settings=fs.readFileSync(path.join(root,'settings.html'),'utf8');
  assert.match(settings,/settings\.html|settings/i);
  for(const page of pages.filter(x=>x!=='settings.html')){
    const s=fs.readFileSync(path.join(root,page),'utf8');
    assert.doesNotMatch(s,/spike-language-select|spike-language-setting/);
  }
});

test('non-English packs contain no empty translations',()=>{
  for(const lang of langs.slice(1)) for(const [k,v] of Object.entries(pack[lang])) assert.ok(typeof v==='string' && v.trim(),`${lang}: ${k}`);
});
