import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const pages=(await readdir('.')).filter(x=>x.endsWith('.html')&&!x.includes('.pre-rebuild.')).sort();

test('no duplicate literal HTML ids in initial DOM markup', async()=>{
  for(const page of pages){
    const html=await readFile(page,'utf8');
    const domParts=html.split(/<script\b[\s\S]*?<\/script>|<style\b[\s\S]*?<\/style>/gi).join('\n');
    const ids=[...domParts.matchAll(/\bid=["']([^"']+)["']/gi)].map(m=>m[1]).filter(Boolean);
    const seen=new Set(), dup=new Set();
    for(const id of ids){if(seen.has(id))dup.add(id);else seen.add(id)}
    assert.equal(dup.size,0,`${page}: duplicate literal ids: ${[...dup].join(', ')}`);
  }
});

test('every local feature asset referenced by Feed exists', async()=>{
  const feed=await readFile('feed.html','utf8');
  for(const asset of ['css/spike-feature-suite.css','js/spike-feature-suite.js']){
    const source=await readFile(asset,'utf8');
    assert.ok(source.length>100,`${asset}: asset is unexpectedly empty`);
    assert.match(feed,new RegExp(asset.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  }
});

test('production build contains feature assets and Feed integration', async()=>{
  const feed=await readFile('dist/feed.html','utf8');
  assert.match(feed,/id="spikePulseBtn"/);
  assert.match(feed,/id="spikeFeatureHub"/);
  assert.match(feed,/js\/spike-feature-suite\.js/);
  assert.match(feed,/css\/spike-feature-suite\.css/);
});
