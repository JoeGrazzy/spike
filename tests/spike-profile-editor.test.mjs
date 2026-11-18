import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const root=new URL('../',import.meta.url);const read=p=>fs.readFileSync(new URL(p,root),'utf8');
test('Own profile page loads the authenticated profile editor after Supabase bootstrap',()=>{const html=read('profile.html');assert.ok(html.indexOf('spike-platform-bootstrap.js')<html.indexOf('spike-profile-editor.js'));assert.match(html,/js\/spike-profile-editor\.js/);});
test('Profile editor reads and updates only the signed-in profile with validated fields',()=>{const js=read('js/spike-profile-editor.js');assert.match(js,/auth\.getUser/);assert.match(js,/\.eq\('id',user\.id\)/);assert.match(js,/display_name,username,bio,website:website\|\|null,location:location\|\|null/);assert.match(js,/\^\[a-z0-9\._-\]\{2,40\}\$/);assert.match(js,/23505/);});
