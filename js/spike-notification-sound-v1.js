/* SPIKE notification sound v1
 * One shared notifications.mp3 playback path for notifications and private messages.
 * Respects the existing message_tone preference stored by Settings.
 */
(()=>{
  'use strict';
  const SRC='assets/mp3/notifications.mp3';
  let audio=null, unlocked=false, pending=false;
  const enabled=()=>{try{return localStorage.getItem('spike-setting-messageTone')!=='0'}catch{return true}};
  function ensure(){
    if(audio)return audio;
    audio=new Audio(SRC);
    audio.preload='auto';
    audio.setAttribute('aria-hidden','true');
    return audio;
  }
  async function unlock(){
    if(unlocked)return true;
    const a=ensure();
    try{
      a.muted=true; a.currentTime=0;
      await a.play();
      a.pause(); a.currentTime=0; a.muted=false;
      unlocked=true;
      if(pending){pending=false; play();}
      return true;
    }catch(_){
      try{a.pause();a.currentTime=0;a.muted=false}catch{}
      return false;
    }
  }
  function play(){
    if(!enabled())return false;
    const a=ensure();
    try{
      a.currentTime=0; a.muted=false;
      const p=a.play();
      if(p?.catch)p.catch(()=>{pending=true;});
      return true;
    }catch(_){pending=true;return false}
  }
  function onGesture(){unlock().catch(()=>{});}
  ['pointerdown','touchstart','keydown'].forEach(type=>window.addEventListener(type,onGesture,{passive:true,capture:true}));
  window.SPIKENotificationSound=Object.freeze({unlock,play,enabled:()=>enabled(),src:SRC});
})();
