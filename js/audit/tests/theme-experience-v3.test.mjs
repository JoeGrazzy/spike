import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = process.cwd();
const themeCss = fs.readFileSync(path.join(root,'css','theme.css'),'utf8');
const v3Css = fs.readFileSync(path.join(root,'css','spike-theme-experience-v3.css'),'utf8');
const themeJs = fs.readFileSync(path.join(root,'js','theme.js'),'utf8');

assert.equal((themeJs.match(/id:\d+/g)||[]).length,10,'theme registry must retain 10 themes');
assert.match(themeJs,/SPIKE_THEME/);
for(const id of Array.from({length:10},(_,i)=>String(i+1))){
  assert.match(themeCss,new RegExp(`data-spike-style="${id}"`),`theme ${id} missing`);
}
assert.match(themeCss,/--spike-font:Inter/);
assert.doesNotMatch(v3Css,/font-family:Georgia/i,'V3 must not introduce novelty typography');
assert.match(v3Css,/var\(--spike-accent\)/);
assert.match(v3Css,/var\(--spike-action-bg\)/);
assert.match(v3Css,/var\(--spike-surface\)/);

const htmlFiles=fs.readdirSync(root).filter(x=>x.endsWith('.html'));
const themed=htmlFiles.filter(x=>fs.readFileSync(path.join(root,x),'utf8').includes('css/theme.css'));
assert.ok(themed.length>=25,'expected broad theme coverage');
for(const file of themed){
  const s=fs.readFileSync(path.join(root,file),'utf8');
  assert.match(s,/spike-theme-experience-v3\.css\?v=theme-v3/ , `${file} missing final theme authority`);
}

// These are theme-owned accents that previously leaked the old purple identity.
for(const file of ['css/spike-live.css','css/spike-menu-v3.css','css/spike-surface-controls.css','css/feed-features.css','css/spike-final-polish.css']){
  assert.ok(fs.existsSync(path.join(root,file)),`${file} missing`);
}
assert.match(v3Css,/spike-menu-v3/);
assert.match(v3Css,/spike-control-select-trigger/);
assert.match(v3Css,/category-picker-sheet/);
assert.match(v3Css,/brand-title/);
console.log('Theme Experience V3: 100% targeted checks passed');
