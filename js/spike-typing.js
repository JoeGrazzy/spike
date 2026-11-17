/* SPIKE Unified Typing Runtime v1
 * One shared realtime protocol for direct messages only.
 * No database rows are written: ephemeral, private Supabase Realtime Broadcast only.
 */
(()=>{'use strict';
  if(window.SpikeTyping?.version===1)return;
  const PREFIX='spike:typing:';
  const TTL=4200, HEARTBEAT=1500, MAX_INBOX=24;
  const channels=new Map(), active={channel:null,topic:null,meId:null,scope:null,lastSent:0,idleTimer:null,input:null,indicator:null,remote:new Map(),label:'Someone'};
  let paintTimer=0, disposed=false, activationSeq=0, pendingActivation=null, pendingTopic=null, pendingInput=null;
  const clean=s=>String(s||'').trim();
  const uuid=s=>/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(s||''));
  const sortedPair=(a,b)=>[String(a),String(b)].sort();
  const dmTopic=(a,b)=>`${PREFIX}dm:${sortedPair(a,b).join(':')}`;
  function ensureIndicator(anchor,kind){
    if(!anchor)return null;
    const host=anchor.parentElement||anchor;
    let el=host.querySelector(':scope > .spike-typing-indicator');
    if(!el){el=document.createElement('div');el.className='spike-typing-indicator';el.setAttribute('aria-live','polite');el.setAttribute('aria-atomic','true');el.hidden=true;
      anchor.insertAdjacentElement('afterend',el);
    }
    return el;
  }
  function drawRemote(remote,indicator,kind){
    if(!indicator)return;
    const now=Date.now();
    for(const [id,item] of remote){if(item.expiresAt<=now)remote.delete(id)}
    const names=[...remote.values()].map(x=>x.name||'Someone');
    let label='';
    if(names.length===1)label='Typing…';
    else if(names.length===2)label='Typing…';
    else if(names.length>2)label='Typing…';
    indicator.textContent=label;indicator.hidden=!label;
    indicator.classList.toggle('is-active',!!label);
  }
  function bindReceiver(ch,entry){
    ch.on('broadcast',{event:'typing'},({payload})=>{
      const p=payload||{},uid=String(p.user_id||'');if(!uuid(uid)||uid===String(entry.selfId))return;
      if(p.typing===false){entry.remote.delete(uid)}else entry.remote.set(uid,{name:clean(p.display_name)||'A member',expiresAt:Math.min(Number(p.expires_at)||Date.now()+TTL,Date.now()+TTL+1000)});
      drawRemote(entry.remote,entry.indicator,entry.kind);entry.onUpdate?.();
    });
  }
  async function openChannel(db,topic,remote,indicator,kind,selfId){
    if(!db?.channel)throw new Error('Supabase Realtime is unavailable');
    if(channels.has(topic)){const existing=channels.get(topic);return existing.promise||existing;}
    const ch=db.channel(topic,{config:{private:true,broadcast:{ack:false,self:false}}});
    const entry={db,ch,topic,remote,indicator,kind,selfId,ready:false,onUpdate:null};channels.set(topic,entry);
    bindReceiver(ch,entry);
    const readyPromise=new Promise((resolve,reject)=>{
      let settled=false;
      ch.subscribe((status,error)=>{
        if(status==='SUBSCRIBED'){entry.ready=true;if(!settled){settled=true;resolve(entry)}}
        else if((status==='CHANNEL_ERROR'||status==='TIMED_OUT'||status==='CLOSED')&&!settled){settled=true;channels.delete(topic);reject(error||new Error('Typing channel '+status))}
      });
      setTimeout(()=>{if(!settled){settled=true;channels.delete(topic);try{db.removeChannel(ch)}catch(_){}reject(new Error('Typing channel connection timed out'))}},12000);
    });
    entry.promise=readyPromise;
    await readyPromise;entry.promise=null;
    return entry;
  }
  async function publish(entry,typing){
    if(!entry?.ready)return;
    try{await entry.ch.send({type:'broadcast',event:'typing',payload:{user_id:entry.selfId,display_name:entry.displayName||'',typing:!!typing,expires_at:Date.now()+TTL}})}catch(e){if(!typing)console.debug('[SPIKE typing] stop broadcast unavailable',e?.message||e)}
  }
  function stopActive(){activationSeq++;pendingActivation=null;pendingTopic=null;pendingInput=null;if(active.idleTimer)clearTimeout(active.idleTimer);active.idleTimer=null;active.detach?.();active.detach=null;const old=active.channel,oldTopic=active.topic;if(old&&oldTopic){channels.delete(oldTopic);publish(old,false).finally(()=>{try{old.db.removeChannel(old.ch)}catch(_){}})}active.lastSent=0;active.remote.clear();drawRemote(active.remote,active.indicator,active.scope);active.channel=null;active.topic=null;active.input=null;active.indicator=null;active.meId=null;active.scope=null}
  async function activate({db,meId,peerId,input,anchor,displayName}){
    if(!uuid(meId)||!input)return false;
    const topic=dmTopic(meId,peerId);
    if(active.topic===topic&&active.input===input&&active.channel?.ready)return true;
    if(pendingActivation&&pendingTopic===topic&&pendingInput===input)return pendingActivation;
    stopActive();
    if(!uuid(peerId)||peerId===meId)return false;
    const token=++activationSeq;
    const task=(async()=>{
      const indicator=ensureIndicator(anchor,'dm'),remote=new Map();
      const entry=await openChannel(db,topic,remote,indicator,'dm',meId);
      if(token!==activationSeq){if(pendingTopic!==topic){channels.delete(topic);try{await db.removeChannel(entry.ch)}catch(_){}}return false;}
      entry.displayName=clean(displayName);
      Object.assign(active,{channel:entry,topic,meId,scope:'dm',lastSent:0,idleTimer:null,input,indicator,remote,label:clean(displayName)||'Someone'});
      const onInput=()=>setTyping(!!clean(input.value));
      const onBlur=()=>setTyping(false);
      input.addEventListener('input',onInput);input.addEventListener('blur',onBlur);
      active.detach=()=>{input.removeEventListener('input',onInput);input.removeEventListener('blur',onBlur)};
      const onKeydown=e=>{if(e.key==='Escape')setTyping(false)};input.addEventListener('keydown',onKeydown);
      const priorDetach=active.detach;active.detach=()=>{priorDetach?.();input.removeEventListener('keydown',onKeydown)};
      return true;
    })();
    pendingActivation=task;pendingTopic=topic;pendingInput=input;
    try{return await task}finally{if(pendingActivation===task){pendingActivation=null;pendingTopic=null;pendingInput=null}}
  }
  function setTyping(typing){
    const entry=active.channel;if(!entry)return;
    if(active.idleTimer)clearTimeout(active.idleTimer);
    if(!typing){publish(entry,false);active.lastSent=0;return}
    if(Date.now()-active.lastSent>=HEARTBEAT){active.lastSent=Date.now();publish(entry,true)}
    active.idleTimer=setTimeout(()=>{publish(entry,false);active.lastSent=0},2100);
  }
  async function startDM(opts){return activate({...opts,anchor:opts.anchor||document.querySelector('#sub')})}
  async function syncInbox({db,meId,peerIds}){
    const peers=[...new Set((peerIds||[]).map(String).filter(x=>uuid(x)&&x!==String(meId)))].slice(0,MAX_INBOX);
    const wanted=new Set(peers.map(peer=>dmTopic(meId,peer)));
    for(const [topic,entry] of [...channels])if(entry.kind==='inbox'&&!wanted.has(topic)){channels.delete(topic);try{await db.removeChannel(entry.ch)}catch(_){}}
    for(const peer of peers){const topic=dmTopic(meId,peer);if(channels.has(topic))continue;
      const remote=new Map();const indicator=document.createElement('span');
      try{const entry=await openChannel(db,topic,remote,indicator,'inbox',meId);entry.kind='inbox';entry.peerId=peer;entry.remote=remote;
        const render=()=>{const row=document.querySelector(`[data-typing-user="${CSS.escape(peer)}"] .preview`);if(!row)return;const names=[...remote.values()].filter(x=>x.expiresAt>Date.now());if(names.length){row.dataset.lastPreview=row.dataset.lastPreview||row.textContent;row.textContent='Typing…';row.classList.add('spike-preview-typing')}else{if(row.dataset.lastPreview!==undefined){row.textContent=row.dataset.lastPreview;delete row.dataset.lastPreview}row.classList.remove('spike-preview-typing')}};
        entry.onUpdate=render;entry.renderInbox=render;
      }catch(e){console.info('[SPIKE typing] inbox channel unavailable',peer,e?.message||e)}
    }
  }
  function cleanup(){if(disposed)return;disposed=true;if(paintTimer)clearInterval(paintTimer);stopActive();for(const entry of channels.values()){try{entry.db.removeChannel(entry.ch)}catch(_){}}channels.clear()}
  window.addEventListener('pagehide',cleanup,{once:true});
  paintTimer=setInterval(()=>{if(active.remote&&active.indicator)drawRemote(active.remote,active.indicator,active.scope);for(const entry of channels.values())entry.renderInbox?.()},700);
  window.SpikeTyping={version:1,startDM,setTyping,stop:stopActive,syncInbox,diagnostics:()=>({version:1,channels:channels.size,activeScope:active.scope,topic:active.topic})};
})();
