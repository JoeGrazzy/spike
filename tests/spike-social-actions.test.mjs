import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const root=new URL('../',import.meta.url);
const read=p=>fs.readFileSync(new URL(p,root),'utf8');
test('Feed loads the social actions controller and stylesheet',()=>{const html=read('feed.html');assert.match(html,/js\/spike-social-actions\.js/);assert.match(html,/css\/spike-social-actions\.css/);});
test('Feed cards attach RLS-backed like, comment, save and share actions',()=>{const js=read('js/spike-social-actions.js');for(const table of ["'post_likes'","'comments'","'saved_posts'"])assert.ok(js.includes(table));for(const action of ['like','comments','save','share'])assert.ok(js.includes(`data.action='${action}'`)||js.includes(`data.action="${action}"`)||js.includes(`dataset.action='${action}'`));assert.match(js,/el\('p','',row\.body\)/);assert.match(js,/\.from\('comments'\)\.insert/);});
test('Social actions scope mutations to the current user and visible post',()=>{const js=read('js/spike-social-actions.js');assert.match(js,/eq\('user_id',userId\)/);assert.match(js,/post_id:post\.id,user_id:userId/);assert.match(js,/author_id:userId/);});
