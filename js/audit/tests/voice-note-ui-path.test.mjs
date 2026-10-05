import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function extract(src, start, end){
  const a=src.indexOf(start); assert.ok(a>=0,`missing ${start}`);
  const b=src.indexOf(end,a+start.length); assert.ok(b>a,`missing ${end}`);
  return src.slice(a,b).trim();
}

for(const file of ['message.html','messages.html']){
  test(`${file}: UI Send click completes recording and sends the final blob`, async()=>{
    const html=fs.readFileSync(file,'utf8');
    const code=[
      extract(html,'function voiceMime()','function setVoicePanel(show)'),
      extract(html,'function voiceExt(mime)','function setVoicePanel(show)'),
      extract(html,'function setVoicePanel(show)','async function toggleRecording'),
      extract(html,'async function toggleRecording()','function stopVoiceRecording'),
      extract(html,'function stopVoiceRecording(cancel,autoSend=false)','function finishVoiceRecording'),
      extract(html,'function finishVoiceRecording()','function cleanupRecording'),
      extract(html,'function cleanupRecording(clearPreview=true)','async function sendVoiceNote'),
      extract(html,'async function uploadToSupabaseDmStorage(file)','async function uploadFiles'),
      extract(html,'async function sendVoiceNote()','async function subscribe')
    ].join('\n');

    const calls=[];
    const els={
      voiceSend:{disabled:false},voicePreviewSend:{disabled:false},voicePreview:{dataset:{},classList:new Set()},
      voicePreviewAudio:{src:'',load(){},removeAttribute(k){this[k]=''}},voiceRecTime:{textContent:''},
      voiceRecLabel:{textContent:''},voiceBtn:{classList:new Set()},voiceRecordPanel:{classList:new Set()}
    };
    let recorder;
    const stream={getTracks(){return[{stop(){calls.push(['track-stop'])}}]}};
    const sb={
      storage:{from(){return{
        upload:async(path,file,opts)=>{calls.push(['upload',path,file.type,opts.contentType,file.size]);return{error:null}},
        createSignedUrl:async path=>({data:{signedUrl:'https://signed/'+path},error:null}),
        remove:async paths=>{calls.push(['remove',paths]);return{error:null}}
      }}},
      from(table){return{insert(payload){calls.push(['insert',table,payload]);return{select(){return{single:async()=>({data:{id:'voice-msg-1',...payload},error:null})}}}}}}
    };

    class FakeMediaRecorder{
      constructor(){recorder=this;this.mimeType='audio/webm;codecs=opus';this.ondataavailable=null;this.onstop=null;this.onerror=null;this.state='inactive'}
      start(){this.state='recording';calls.push(['recorder-start'])}
      stop(){
        assert.equal(this.state,'recording','stop must be called while recording');
        this.state='inactive';
        this.ondataavailable?.({data:new Blob(['final-audio'],{type:'audio/webm;codecs=opus'})});
        this.onstop?.();
      }
      static isTypeSupported(){return true}
    }

    const ctx={
      console,sb,me:{id:'sender-1'},active:'recipient-1',recording:null,recordingStream:null,recordingMime:'',recordingChunks:[],recordingStartedAt:Date.now()-9000,recordingTimer:null,voiceBlob:null,sendVoiceAfterRecording:false,
      navigator:{mediaDevices:{getUserMedia:async()=>stream}},window:{MediaRecorder:FakeMediaRecorder},MediaRecorder:FakeMediaRecorder,
      Blob,File,URL:{createObjectURL:()=> 'blob:voice',revokeObjectURL:()=>{}},crypto:{randomUUID:()=> 'uuid-voice'},
      setInterval:()=>1,clearInterval:()=>{},Date,Math,Promise,
      $:id=>els[id],toggleClass:(id,cls,on)=>{on?els[id].classList.add(cls):els[id].classList.delete(cls)},addClass:(id,cls)=>els[id].classList.add(cls),removeClass:(id,cls)=>els[id].classList.delete(cls),
      toast:m=>calls.push(['toast',m]),upsertMessage:m=>calls.push(['upsert',m.id]),updateThread:m=>calls.push(['thread',m.id]),renderMessages:()=>calls.push(['render'])
    };
    vm.createContext(ctx);
    vm.runInContext(`var recording=globalThis.recording,recordingStream=globalThis.recordingStream,recordingMime=globalThis.recordingMime,recordingChunks=globalThis.recordingChunks,recordingStartedAt=globalThis.recordingStartedAt,recordingTimer=globalThis.recordingTimer,voiceBlob=globalThis.voiceBlob,sendVoiceAfterRecording=globalThis.sendVoiceAfterRecording;\n${code}`,ctx,{timeout:5000});

    // Exact UI binding used by both message surfaces.
    els.voiceSend.onclick=ctx.sendVoiceNote;

    await ctx.toggleRecording();
    assert.equal(recorder?.state,'recording','UI start must create an active MediaRecorder');

    // Exact user action: tap the visible Send button while recording.
    await els.voiceSend.onclick();
    await new Promise(r=>setTimeout(r,25));

    assert.equal(recorder.state,'inactive','Send must stop the active recorder');
    assert.equal(els.voiceSend.disabled,false,'Send must be re-enabled after completion');
    assert.equal(els.voicePreviewSend.disabled,false,'Preview Send must be re-enabled');
    assert.equal(calls.filter(x=>x[0]==='upload').length,1,'exactly one audio upload must occur');
    assert.equal(calls.filter(x=>x[0]==='insert'&&x[1]==='private_messages').length,1,'exactly one private message must be inserted');
    assert.equal(calls.filter(x=>x[0]==='insert'&&x[1]==='private_message_attachments').length,1,'exactly one attachment row must be inserted');
    const msg=calls.find(x=>x[0]==='insert'&&x[1]==='private_messages')?.[2];
    assert.equal(msg.recipient_id,'recipient-1','audio must be addressed to the active recipient');
    assert.equal(msg.message_type,'audio','persisted message must be audio');
    assert.equal(msg.media_mime_type,'audio/webm','persisted MIME must be normalized');
    assert.ok(calls.some(x=>x[0]==='upsert'&&x[1]==='voice-msg-1'),'sent voice message must enter renderer state');
    assert.ok(calls.some(x=>x[0]==='render'),'sent voice message must trigger rendering');
  });
}
