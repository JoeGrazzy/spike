// @ts-check
/**
 * SPIKE structured client telemetry.
 * Public API: {@link window.SPIKETelemetry}.
 * Payloads are recursively redacted for common credential and form-field names.
 * @public
 */
(function(){
  'use strict';

  /** @typedef {{name:string,message:string,stack:string}} NormalizedError */
  /** @typedef {{type:string,timestamp:string,page:string,referrerOrigin:string|null,payload:unknown}} TelemetryEvent */
  /** @type {Set<string>} */
  const REDACT_KEYS=new Set(['authorization','cookie','password','passwd','token','access_token','refresh_token','api_key','apikey','secret','service_role_key','sb_'+'secret','supabase_privileged_key']);
  const ENDPOINT=window.SPIKE_TELEMETRY_ENDPOINT||'/__telemetry';
  /** @type {TelemetryEvent[]} */
  const queue=[];
  let flushing=false;

  /**
   * @param {unknown} value
   * @param {number} [depth]
   * @returns {unknown}
   */
  function redact(value,depth=0){
    if(depth>5)return '[redacted-depth]';
    if(Array.isArray(value))return value.slice(0,50).map(item=>redact(item,depth+1));
    if(value&&typeof value==='object'){
      /** @type {Record<string, unknown>} */
      const out={};
      for(const [key,item] of Object.entries(value)){
        out[REDACT_KEYS.has(key.toLowerCase())?'[redacted]':key]=REDACT_KEYS.has(key.toLowerCase())?'[redacted]':redact(item,depth+1);
      }
      return out;
    }
    if(typeof value==='string'&&/(?:bearer\s+ey|eyJ[a-z0-9_-]+\.[a-z0-9_-]+\.[a-z0-9_-]+)/i.test(value))return '[redacted-credential]';
    return value;
  }

  /**
   * @param {unknown} error
   * @returns {NormalizedError}
   */
  function normalizeError(error){
    const e=error instanceof Error?error:new Error(String(error||'Unknown error'));
    return {name:e.name,message:String(e.message).slice(0,500),stack:String(e.stack||'').slice(0,2000)};
  }

  /**
   * @param {string} type
   * @param {unknown} payload
   * @returns {void}
   */
  function record(type,payload){
    queue.push({
      type,
      timestamp:new Date().toISOString(),
      page:location.pathname.split('/').pop()||'index.html',
      referrerOrigin:document.referrer?new URL(document.referrer,location.href).origin:null,
      payload:redact(payload)
    });
    if(queue.length>20)queue.shift();
    flush();
  }

  /** @returns {void} */
  function flush(){
    if(flushing||!queue.length||!navigator.onLine)return;
    flushing=true;
    const batch=queue.splice(0,10);
    const body=JSON.stringify({events:batch});
    try{
      if(navigator.sendBeacon){
        const ok=navigator.sendBeacon(ENDPOINT,new Blob([body],{type:'application/json'}));
        if(!ok)queue.unshift(...batch);
      }else{
        fetch(ENDPOINT,{method:'POST',headers:{'content-type':'application/json'},body,keepalive:true})
          .catch(()=>queue.unshift(...batch));
      }
    }catch(_){queue.unshift(...batch)}
    finally{flushing=false}
  }

  window.addEventListener('error',event=>{
    record('error',{error:normalizeError(event.error||event.message),source:event.filename?String(event.filename).split('/').pop():null,line:event.lineno||null,column:event.colno||null});
  });
  window.addEventListener('unhandledrejection',event=>{
    record('unhandledrejection',{error:normalizeError(event.reason)});
  });
  window.addEventListener('online',flush);
  window.SPIKETelemetry=Object.freeze({record,flush});
})();
