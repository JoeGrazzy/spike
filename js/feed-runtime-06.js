
(()=>{
  const lock=()=>{
    const h=document.querySelector('body > header.header');
    if(!h)return;
    h.hidden=false;
    h.removeAttribute('aria-hidden');
    h.style.removeProperty('display');
    h.style.removeProperty('visibility');
    h.style.removeProperty('opacity');
    h.style.removeProperty('transform');
    h.style.removeProperty('filter');
  };
  const boot=()=>{
    lock();
    const h=document.querySelector('body > header.header');
    if(h)new MutationObserver(lock).observe(h,{attributes:true,attributeFilter:['hidden','aria-hidden','style','class']});
    new MutationObserver(lock).observe(document.body,{attributes:true,attributeFilter:['class','style','data-theme','data-spikestyle']});
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
