import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function extract(src,name,nextNames){
  const start=src.indexOf(name);
  assert.ok(start>=0,`missing ${name}`);
  let end=src.length;
  for(const n of nextNames){const i=src.indexOf(n,start+name.length);if(i>=0)end=Math.min(end,i)}
  return src.slice(start,end).trim();
}

async function run(file){
  const src=fs.readFileSync(file,'utf8');
  const code=[
    extract(src,'function voiceExt(mime)', ['function setVoicePanel']),
    extract(src,'function setVoicePanel(show)', ['function updateVoiceTimer']),
    extract(src,'function stopVoiceRecording(cancel,autoSend=false)', ['function finishVoiceRecording']),
    extract(src,'function finishVoiceRecording()', ['function cleanupRecording']),
    extract(src,'function cleanupRecording(clearPreview=true)', ['async function sendVoiceNote']),
    extract(src,'async function uploadToSupabaseDmStorage(file)', ['async function uploadFiles']),
    extract(src,'async function sendVoiceNote()', ['async function subscribe'])
  ].join('\n');

  const els={
    voiceSend:{disabled:false}, voicePreviewSend:{disabled:false}, voicePreview:{dataset:{},classList:new Set()},
    voicePreviewAudio:{src:'',load(){},removeAttribute(k){this[k]=''}}, voiceRecTime:{textContent:''},
    voiceRecLabel:{textContent:''}, voiceBtn:{classList:new Set()}, voiceRecordPanel:{classList:new Set()}
  };
  const calls=[];
  let uploadCount=0, insertCount=0, attachmentCount=0, removed=[];
  const sb={
    storage:{from(){return {upload:async(path,file,opts)=>{uploadCount++;calls.push(['upload',path,file.type,opts.contentType]);return {error:null}},createSignedUrl:async(path)=>({data:{signedUrl:'https://signed/'+path},error:null}),remove:async(paths)=>{removed.push(...paths);return {error:null}}}}},
    from(table){return {insert(payload){calls.push(['insert',table,payload]);if(table==='private_messages')insertCount++;if(table==='private_message_attachments')attachmentCount++;return {select(){return {single:async()=>({data:{id:'msg-1',...payload},error:null})}}};}}}
  };
  const ctx={
    console, sb, me:{id:'me-1'}, active:'friend-1', voiceBlob:null, recordingMime:'audio/webm;codecs=opus', recordingChunks:[new Blob(['abc'])], recordingStartedAt:Date.now()-9000,
    sendVoiceAfterRecording:false, recording:{mimeType:'audio/webm;codecs=opus'}, recordingStream:{getTracks(){return[{stop(){}}]}}, recordingTimer:null,
    URL:{createObjectURL:()=> 'blob:voice',revokeObjectURL:()=>{}}, Blob, File, crypto:{randomUUID:()=> 'uuid-1'},
    $:id=>els[id], toggleClass:(id,cls,on)=>{const s=els[id].classList;if(on)s.add(cls);else s.delete(cls)}, addClass:(id,cls)=>els[id].classList.add(cls), removeClass:(id,cls)=>els[id].classList.delete(cls),
    toast:m=>calls.push(['toast',m]), upsertMessage:()=>{},updateThread:()=>{},renderMessages:()=>{},
    window:{}, navigator:{},
    setInterval,clearInterval,Date,Math,Promise,
  };
  // Fake recorder: the exact Send-while-recording path invokes onstop.
  ctx.recording={mimeType:'audio/webm;codecs=opus',stop(){calls.push(['stop-called',typeof this.onstop]);this.onstop?.()}};
  vm.createContext(ctx); vm.runInContext(`var recording=globalThis.recording, recordingStream=globalThis.recordingStream, recordingMime=globalThis.recordingMime, recordingChunks=globalThis.recordingChunks, recordingStartedAt=globalThis.recordingStartedAt, recordingTimer=globalThis.recordingTimer, sendVoiceAfterRecording=globalThis.sendVoiceAfterRecording, voiceBlob=globalThis.voiceBlob;\n${code}`,ctx,{timeout:5000});
  assert.equal(typeof ctx.sendVoiceNote,'function',`${file}: sendVoiceNote exists`);
  ctx.recording.onstop=()=>ctx.finishVoiceRecording();
  await ctx.sendVoiceNote();
  // allow the auto-send promise spawned from finishVoiceRecording to settle.
  await new Promise(r=>setTimeout(r,20));
  if(uploadCount!==1) console.log('DEBUG',file,calls,ctx.voiceBlob,ctx.active); assert.equal(uploadCount,1,`${file}: exactly one storage upload`);
  assert.equal(insertCount,1,`${file}: exactly one private_messages insert`);
  assert.equal(attachmentCount,1,`${file}: exactly one attachment insert`);
  const upload=calls.find(x=>x[0]==='upload'); assert.equal(upload?.[3],'audio/webm',`${file}: storage content type normalized from codec MIME`);
  const messageInsert=calls.find(x=>x[0]==='insert'&&x[1]==='private_messages'); assert.equal(messageInsert?.[2]?.media_mime_type,'audio/webm',`${file}: persisted MIME normalized`);
  assert.equal(els.voiceSend.disabled,false,`${file}: Send re-enabled`);
  assert.equal(els.voicePreviewSend.disabled,false,`${file}: preview Send re-enabled`);
  assert.ok(calls.some(x=>x[0]==='insert'&&x[1]==='private_messages'&&x[2].message_type==='audio'),`${file}: audio message persisted`);
  return {file,uploadCount,insertCount,attachmentCount,removed};
}

import test from 'node:test';
for(const file of ['message.html','messages.html']) test(`live voice send path: ${file}`, async()=>{await run(file)});
