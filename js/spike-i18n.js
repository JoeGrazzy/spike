/* SPIKE Local Languages — simple, offline-first translation engine. */
(() => {
  'use strict';

  const LANGS = Object.freeze({
    en: 'English',
    fr: 'Français',
    ig: 'Igbo',
    yo: 'Yorùbá',
    ha: 'Hausa',
    pcm: 'Nigerian Pidgin'
  });
  const STORAGE_KEY = 'spike-language';
  const BASE = 'assets/i18n/';
  const cache = new Map();
  const originals = new WeakMap();
  let current = 'en';
  let applying = false;
  let observer = null;

  function safeGet() {
    try {
      const v = localStorage.getItem(STORAGE_KEY);
      return LANGS[v] ? v : 'en';
    } catch (_) { return 'en'; }
  }

  function safeSet(lang) {
    try { localStorage.setItem(STORAGE_KEY, lang); } catch (_) {}
    try { document.cookie = STORAGE_KEY + '=' + encodeURIComponent(lang) + ';path=/;max-age=31536000;SameSite=Lax'; } catch (_) {}
  }

  function clean(value) {
    return String(value ?? '').replace(/\s+/g, ' ').trim();
  }

  async function load(lang) {
    if (lang === 'en') return {};
    if (cache.has(lang)) return cache.get(lang);
    const p = fetch(BASE + encodeURIComponent(lang) + '.json', {
      cache: 'force-cache',
      credentials: 'same-origin'
    }).then(r => {
      if (!r.ok) throw new Error('Translation pack unavailable: ' + lang);
      return r.json();
    }).then(data => {
      if (!validatePack(lang, data)) {
        throw new Error('Invalid translation pack: ' + lang);
      }
      cache.set(lang, data);
      return data;
    });
    cache.set(lang, p);
    return p;
  }

  function ignored(el) {
    if (!el || el.nodeType !== 1) return true;
    if (el.closest('[data-i18n-ignore],input,textarea,select,option,script,style,code,pre,[contenteditable="true"],.post-content,.post-body,.comment-body,[data-user-content],[data-generated-content]')) return true;
    if (el.matches('[data-i18n-ignore],input,textarea,select,option,script,style,code,pre,[contenteditable="true"],.post-content,.post-body,.comment-body,[data-user-content],[data-generated-content]')) return true;
    return false;
  }

  function originalText(node) {
    let state = originals.get(node);
    if (!state || typeof state !== 'object') {
      state = { original: node.nodeValue, last: null };
      originals.set(node, state);
    } else if (state.last !== null && node.nodeValue !== state.last) {
      state.original = node.nodeValue;
    }
    return state.original;
  }

  function rememberText(node, value) {
    const state = originals.get(node);
    if (state) state.last = value;
  }

  function originalAttr(el, attr) {
    let state = originals.get(el);
    if (!state || !state.attrs) {
      state = { attrs: Object.create(null), lastAttrs: Object.create(null) };
      originals.set(el, state);
    }
    if (!(attr in state.attrs)) state.attrs[attr] = el.getAttribute(attr);
    const currentValue = el.getAttribute(attr);
    if (state.lastAttrs[attr] !== undefined && currentValue !== state.lastAttrs[attr]) {
      state.attrs[attr] = currentValue;
    }
    return state.attrs[attr];
  }

  function rememberAttr(el, attr, value) {
    const state = originals.get(el);
    if (state?.lastAttrs) state.lastAttrs[attr] = value;
  }

  function translateText(node, dict) {
    if (!node || node.nodeType !== 3 || !node.parentElement || ignored(node.parentElement)) return;
    const raw = originalText(node);
    const key = clean(raw);
    if (!key) return;
    const translated = current === 'en' ? key : translationFor(key, dict);
    if (translated === key && raw.trim() !== key) return;
    const leading = raw.match(/^\s*/)?.[0] || '';
    const trailing = raw.match(/\s*$/)?.[0] || '';
    const next = leading + translated + trailing;
    if (node.nodeValue !== next) node.nodeValue = next;
    rememberText(node, next);
  }

  const ATTRS = ['placeholder', 'title', 'aria-label', 'aria-placeholder', 'data-tooltip'];

  function translateElement(el, dict) {
    if (!el || el.nodeType !== 1 || ignored(el)) return;
    for (const attr of ATTRS) {
      if (!el.hasAttribute(attr)) continue;
      const raw = originalAttr(el, attr);
      const key = clean(raw);
      if (!key) continue;
      const translated = current === 'en' ? key : translationFor(key, dict);
      if (el.getAttribute(attr) !== translated) el.setAttribute(attr, translated);
      rememberAttr(el, attr, translated);
    }
    for (const node of el.childNodes) {
      if (node.nodeType === 3) translateText(node, dict);
      else if (node.nodeType === 1) translateElement(node, dict);
    }
  }

  const ENGLISH_MARKERS = {
    fr: /\b(?:the|than|is|it|and|or|with|from|your|you|this|that|journey|learning|built|support|community|first|when|enabled|think|about|person|story|behind|founder|creator|one-time|powered|give|everyone|voice|connect|people|encourage|expression|choose|pick|custom|amount|means|fuel|builder|grow|vision)\b/gi,
    ig: /\b(?:the|than|is|it|and|or|with|from|your|you|this|that|journey|learning|built|support|community|first|when|enabled|think|about|person|story|behind|founder|creator|one-time|powered|give|everyone|voice|connect|people|encourage|expression|choose|pick|custom|amount|means|fuel|builder|grow|vision)\b/gi,
    yo: /\b(?:the|than|is|it|and|or|with|from|your|you|this|that|journey|learning|built|support|community|first|when|enabled|think|about|person|story|behind|founder|creator|one-time|powered|give|everyone|voice|connect|people|encourage|expression|choose|pick|custom|amount|means|fuel|builder|grow|vision)\b/gi,
    ha: /\b(?:the|than|is|it|and|or|with|from|your|you|this|that|journey|learning|built|support|community|first|when|enabled|think|about|person|story|behind|founder|creator|one-time|powered|give|everyone|voice|connect|people|encourage|expression|choose|pick|custom|amount|means|fuel|builder|grow|vision)\b/gi
  };

  function translationFor(key, dict) {
    if (current === 'en') return key;
    const value = typeof dict?.[key] === 'string' ? clean(dict[key]) : '';
    if (!value) return key;
    if (current === 'pcm') return value;
    const marker = ENGLISH_MARKERS[current];
    if (!marker || key.length < 24) return value;
    const hits = value.match(marker) || [];
    const unique = new Set(hits.map(x => x.toLowerCase())).size;
    return unique >= 3 ? key : value;
  }

  function validatePack(lang, dict) {
    if (lang === 'en') return true;
    if (!dict || typeof dict !== 'object' || Array.isArray(dict)) return false;
    return Object.keys(dict).length > 0;
  }

  function applySelectorValue() {
    const select = document.querySelector('[data-spike-language-select]');
    if (select && select.value !== current) select.value = current;
  }

  function applyDocument(dict) {
    if (!document.documentElement) return;
    applying = true;
    document.documentElement.lang = current;
    const title = document.querySelector('title');
    if (title) {
      if (!title.dataset.spikeI18nOriginal) title.dataset.spikeI18nOriginal = title.textContent;
      const key = clean(title.dataset.spikeI18nOriginal);
      if (key) title.textContent = current === 'en' ? key : translationFor(key, dict);
    }
    translateElement(document.body, dict);
    applySelectorValue();
    applying = false;
  }

  function injectSelector() {
    if (document.querySelector('[data-spike-language-panel]')) return;
    const page = (location.pathname || '').replace(/\/+$/, '').split('/').pop().toLowerCase();
    if (page !== 'settings.html' && page !== 'settings') return;

    const main = document.querySelector('main');
    if (!main) return;

    const account = Array.from(main.querySelectorAll('section.card')).find(s =>
      clean(s.querySelector('.section')?.textContent) === 'Account'
    );

    const section = document.createElement('section');
    section.className = 'card';
    section.setAttribute('data-spike-language-panel', '');
    section.innerHTML = `
      <div class="section">Language</div>
      <div class="row">
        <div>
          <strong>App language</strong>
          <small>Choose the language used by the SPIKE interface on this device.</small>
        </div>
        <select data-spike-language-select aria-label="App language" style="min-width:180px">
          ${Object.entries(LANGS).map(([code,name]) => `<option value="${code}">${name}</option>`).join('')}
        </select>
      </div>`;
    (account || main.querySelector('.nav') || main).before(section);

    const select = section.querySelector('[data-spike-language-select]');
    select.value = current;
    select.addEventListener('change', () => {
      setLanguage(select.value);
    });
  }

  async function setLanguage(lang) {
    if (!LANGS[lang]) lang = 'en';
    try {
      const dict = await load(lang);
      current = lang;
      safeSet(lang);
      applyDocument(dict);
      document.dispatchEvent(new CustomEvent('spike-language-change', {
        detail: { language: lang, name: LANGS[lang] }
      }));
      return lang;
    } catch (err) {
      console.warn('[SPIKE i18n]', err);
      if (lang !== 'en') {
        current = 'en';
        safeSet('en');
        applyDocument({});
      }
      return current;
    }
  }

  function observe() {
    if (observer || !document.body) return;
    observer = new MutationObserver(records => {
      if (applying) return;
      const dictPromise = load(current).catch(() => ({}));
      dictPromise.then(dict => {
        if (applying) return;
        applying = true;
        for (const record of records) {
          if (record.type === 'characterData') translateText(record.target, dict);
          for (const node of record.addedNodes || []) {
            if (node.nodeType === 3) translateText(node, dict);
            else if (node.nodeType === 1) translateElement(node, dict);
          }
        }
        applying = false;
      });
    });
    observer.observe(document.body, {subtree:true, childList:true, characterData:true});
  }

  async function init() {
    current = safeGet();
    if (document.readyState === 'loading') {
      await new Promise(resolve => document.addEventListener('DOMContentLoaded', resolve, {once:true}));
    }
    injectSelector();
    const dict = await load(current).catch(() => ({}));
    applyDocument(dict);
    observe();
    window.SPIKE_I18N = Object.freeze({
      languages: LANGS,
      getLanguage: () => current,
      setLanguage,
      translate: (key) => translationFor(String(key), cache.get(current) || {})
    });
  }

  init().catch(err => console.warn('[SPIKE i18n init]', err));
})();
