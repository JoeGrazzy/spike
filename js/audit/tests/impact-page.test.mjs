import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve(new URL('../../..',import.meta.url).pathname);
const read=f=>fs.readFile(path.join(root,f),'utf8');
test('Impact is a campaign experience, not the old mission UI',async()=>{const h=await read('impact.html');assert.match(h,/Create a help campaign/);assert.match(h,/Only Verified Badge users can publish campaigns/);assert.match(h,/spike_impact_campaign_create/);assert.doesNotMatch(h,/spike_mission_create/);assert.doesNotMatch(h,/Completion XP/);assert.doesNotMatch(h,/Record contribution/)});
test('Impact campaign form explains targets and help types',async()=>{const h=await read('impact.html');for(const s of ['Money donation','Items or supplies','Professional or practical services','Volunteers','Target amount','Target quantity'])assert.match(h,new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));});
