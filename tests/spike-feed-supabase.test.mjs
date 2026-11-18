import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const root=new URL('../',import.meta.url);const read=p=>fs.readFileSync(new URL(p,root),'utf8');

test('Feed loads its Supabase publisher and feed controller',()=>{
 const html=read('feed.html');
 assert.match(html,/js\/spike-post-publisher\.js/);
 assert.match(html,/js\/spike-feed-supabase\.js/);
 assert.match(html,/css\/spike-feed-supabase\.css/);
});

test('Feed reads RLS-visible published posts, filters Following, and signs private media URLs',()=>{
 const js=read('js/spike-feed-supabase.js');
 assert.match(js,/from\('posts'\)/);assert.match(js,/eq\('status','published'\)/);
 assert.match(js,/from\('follows'\)/);assert.match(js,/from\('post_media'\)/);
 assert.match(js,/createSignedUrl\(item\.object_path,300\)/);
});

test('Feed composer invokes the validated publisher and exposes supported visibility values',()=>{
 const js=read('js/spike-feed-supabase.js');
 assert.match(js,/window\.SPIKE_POSTS\.publishPost/);
 assert.match(js,/\['public','Public'\]/);assert.match(js,/\['followers','Followers'\]/);assert.match(js,/\['private','Only me'\]/);
});

test('Feed loader is always released after auth or feed startup succeeds or fails',()=>{
 const js=read('js/spike-feed-supabase.js');
 assert.match(js,/finally\s*\{\s*\/\/ The feed overlay must never depend on a successful data request to disappear\./);
 assert.match(js,/SPIKE_HIDE_FEED_LOADER\?\.\(\)/);
 assert.match(js,/withTimeout\(db\(\)\.auth\.getUser\(\),12000/);
 assert.match(js,/withTimeout\(loadFeed\(\),18000/);
});

test('Login and secure-session checks have bounded timeouts without bypassing MFA',()=>{
 const auth=read('js/spike-auth.js');
 assert.match(auth,/withTimeout\(supabase\.auth\.signInWithPassword\([\s\S]*?15000/);
 assert.match(auth,/withTimeout\(continueAfterAuth\('feed\.html'\), 12000/);
 assert.doesNotMatch(auth,/catch\(\)\s*=>\s*window\.location\.replace\('feed\.html'\)/);
});
