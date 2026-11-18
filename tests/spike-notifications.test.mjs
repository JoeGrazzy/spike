import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
const root=new URL('../',import.meta.url),read=p=>fs.readFileSync(new URL(p,root),'utf8');
test('Notifications page loads the Supabase notification controller',()=>{const h=read('notifications.html');assert.match(h,/js\/spike-platform-bootstrap\.js/);assert.match(h,/js\/spike-notifications\.js/);});
test('Notifications controller scopes reads, updates and deletes to the signed-in user',()=>{const j=read('js/spike-notifications.js');assert.match(j,/eq\('user_id',user\.id\)/);assert.match(j,/from\('notifications'\)/);assert.match(j,/update\(\{is_read:true\}\)/);assert.match(j,/delete\(\)/);assert.match(j,/postgres_changes/);});
test('Notification filters and search are connected to live rendered data',()=>{const j=read('js/spike-notifications.js');assert.match(j,/data-filter/);assert.match(j,/notificationSearch/);assert.match(j,/function render\(/);});
