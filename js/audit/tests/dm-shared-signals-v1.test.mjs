import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync('js/spike-dm-signals.js','utf8');
function load(){const window={};vm.runInNewContext(source,{window,console,Promise});return window.SPIKEDMSignals}
test('canonical DM topic sorts both participant IDs case-insensitively',()=>{
 const api=load();
 assert.equal(api.pairTopic('BBBBBBBB-BBBB-4BBB-8BBB-BBBBBBBBBBBB','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),'spike:dm-typing:v1:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa:bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
 assert.equal(api.pairTopic('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','BBBBBBBB-BBBB-4BBB-8BBB-BBBBBBBBBBBB'),api.pairTopic('BBBBBBBB-BBBB-4BBB-8BBB-BBBBBBBBBBBB','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'));
});
test('shared subscriber filters the opposite participant and conversation recipient',()=>{
 const api=load();let handler,got=[];const channel={on(type,filter,cb){handler=cb;return this}};const client={channel(topic,options){assert.match(topic,/^spike:dm-typing:v1:/);assert.equal(options.config.private,true);return channel}};
 const result=api.subscribeTyping(client,'self-id','peer-id',(typing,payload)=>got.push([typing,payload.from]));
 assert.equal(result,channel);handler({payload:{from:'PEER-ID',to:'SELF-ID',typing:true}});handler({payload:{from:'intruder',to:'SELF-ID',typing:true}});handler({payload:{from:'PEER-ID',to:'other',typing:true}});
 assert.deepEqual(got,[[true,'PEER-ID']]);
});
test('publisher transmits only participant IDs and boolean typing state',async()=>{
 const api=load();let sent;const channel={send:async value=>{sent=value}};
 await api.publishTyping(channel,'SELF-ID','PEER-ID',true);
 assert.deepEqual(JSON.parse(JSON.stringify(sent)),{type:'broadcast',event:'typing',payload:{from:'self-id',to:'peer-id',typing:true}});
});
