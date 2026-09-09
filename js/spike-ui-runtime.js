/* SPIKE shared UI runtime — cached once, reused across pages. */
(function(){
'use strict';
if(window.__SPIKE_UI_RUNTIME__)return;
window.__SPIKE_UI_RUNTIME__=true;

/* Premium toast */
var stack=function(){var s=document.getElementById('spikePremiumStack');if(!s){s=document.createElement('div');s.id='spikePremiumStack';s.className='spike-premium-stack';document.body.appendChild(s)}return s};
var classify=function(m,t){if(t)return t;m=String(m||'').toLowerCase();if(/error|failed|fail|could not|cannot|unable|denied|invalid|wrong|expired|blocked/.test(m))return'error';if(/warning|careful|required|please|maximum|limit|permission|future|choose|enter|complete/.test(m))return'warning';if(/success|successful|saved|sent|posted|updated|copied|accepted|declined|published|scheduled|started|signed in|welcome/.test(m))return'success';return'info'};
window.spikePremiumToast=function(m,t,ms){m=String(m??'');t=classify(m,t);ms=Number(ms)||3600;var s=stack(),k=t+'|'+m.trim().toLowerCase();if(s.dataset.k===k&&Date.now()-Number(s.dataset.at)<1200)return;s.dataset.k=k;s.dataset.at=Date.now();var e=document.createElement('div');e.className='spike-premium-toast '+t;e.style.setProperty('--spn-life',ms+'ms');var i=t==='success'?'✓':t==='error'?'×':t==='warning'?'⚠':'✦',title=t==='success'&&/welcome/i.test(m)?'Welcome to SPIKE':t==='success'?'Success':t==='error'?'Something needs attention':t==='warning'?'Please check this':'SPIKE update';e.innerHTML='<div class="spn-icon">'+i+'</div><div class="spn-copy"><div class="spn-title"></div><div class="spn-message"></div></div><button class="spn-close" type="button" aria-label="Dismiss">×</button>';e.querySelector('.spn-title').textContent=title;e.querySelector('.spn-message').textContent=m;e.querySelector('.spn-close').onclick=function(){e.remove()};s.appendChild(e);setTimeout(function(){e.remove()},ms)};

/* Network guard */
var last=0,isNet=function(e){var m=String(e&&e.message||e&&e.reason&&e.reason.message||e||'').toLowerCase();return !navigator.onLine||/failed to fetch|networkerror|network request failed|load failed|fetch failed|timeout|timed out/.test(m)},notice=function(msg){var now=Date.now();if(now-last<5000)return;last=now;try{if(typeof window.spikePremiumToast==='function')window.spikePremiumToast(msg,'warning',4500);else console.warn('[SPIKE network]',msg)}catch(_){console.warn('[SPIKE network]',msg)}};
window.addEventListener('offline',function(){notice('You are offline. Actions will resume when your connection returns.')});window.addEventListener('online',function(){notice('Connection restored. Retry the last action if needed.')});window.addEventListener('unhandledrejection',function(e){if(isNet(e)){e.preventDefault();notice(navigator.onLine?'SPIKE could not complete a network request. Please retry.':'You are offline. Please reconnect and retry.')}});

/* Shared menu/nav synchronization — event driven, no 750ms polling loop. */
(function(){var root=document.documentElement,body=document.body,menuButtonSelector='#menuBtn, #menuButton, .menu-btn, .spike-menu-left, [aria-label*="menu" i], [title*="menu" i]',closeSelector='[id*="menuClose" i], [id*="closeMenu" i], [data-close-menu], .spike-menu-close';
function navHidden(v){body.classList.toggle('spike-menu-nav-hidden',!!v);root.classList.toggle('spike-menu-nav-hidden',!!v)}
function openDetected(){return!!document.querySelector('.spike-menu-overlay.open, .spike-menu-overlay[aria-hidden="false"], .overlay.open[id*="menu" i], [id*="menu" i].open, .side-menu.open, .drawer.open')}
function sync(){navHidden(openDetected())}
document.addEventListener('click',function(e){var menu=e.target.closest&&e.target.closest(menuButtonSelector);if(menu){navHidden(true);requestAnimationFrame(sync);setTimeout(sync,80);return}var close=e.target.closest&&e.target.closest(closeSelector);if(close){setTimeout(sync,40);return}var overlay=e.target.closest&&e.target.closest('.spike-menu-overlay, .overlay[id*="menu" i]');if(overlay&&e.target===overlay)setTimeout(sync,40)},true);
document.addEventListener('keydown',function(e){if(e.key==='Escape')setTimeout(sync,40)});
if(window.MutationObserver){new MutationObserver(sync).observe(body,{subtree:true,attributes:true,attributeFilter:['class','aria-hidden','hidden']})}
sync();window.addEventListener('pagehide',function(){navHidden(false)},{once:true})})();
})();
