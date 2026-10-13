import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
const root=process.cwd();const themeCss=fs.readFileSync(path.join(root,'css/theme.css'),'utf8');const palette=fs.readFileSync(path.join(root,'css/spike-three-theme-authority.css'),'utf8');const v3Css=fs.readFileSync(path.join(root,'css/spike-theme-experience-v3.css'),'utf8');const themeJs=fs.readFileSync(path.join(root,'js/theme.js'),'utf8');
assert.deepEqual([...themeJs.matchAll(/id:(\d+),name:'([^']+)'/g)].map(m=>[+m[1],m[2]]),[[1,'Theme 1'],[2,'Theme 2'],[3,'Premium Neon Red']]);
assert.match(palette,/data-spike-style="1"/);assert.match(palette,/data-spike-style="2"/);assert.match(palette,/data-spike-style="3"/);assert.doesNotMatch(palette,/data-spike-style="(?:[4-9]|10)"/);assert.doesNotMatch(themeCss,/data-spike-style="(?:[4-9]|10)"/);
assert.match(themeCss,/--spike-font:Inter/);assert.doesNotMatch(v3Css,/font-family:Georgia/i);assert.match(palette,/var\(--spike-accent\)/);assert.match(palette,/var\(--spike-action-bg\)/);assert.match(palette,/var\(--spike-surface\)/);
const htmlFiles=fs.readdirSync(root).filter(x=>x.endsWith('.html'));for(const file of htmlFiles){const s=fs.readFileSync(path.join(root,file),'utf8');assert.match(s,/spike-three-theme-authority\.css/,`${file} missing canonical three-theme authority`);}
for(const file of ['css/spike-menu-v3.css','css/spike-surface-controls.css','css/feed-features.css','css/spike-final-polish.css'])assert.ok(fs.existsSync(path.join(root,file)),`${file} missing`);
console.log('Three-theme experience checks passed');
