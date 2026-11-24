/* SPIKE media routing: Cloudinary for public profile media; Supabase Storage for private chat files. */
(() => {
  'use strict';

  const MAX_PRIVATE_BYTES = 50 * 1024 * 1024;
  const PRIVATE_MIME_TYPES = new Set([
    'image/jpeg','image/png','image/webp','image/avif',
    'video/mp4','audio/mpeg','audio/mp4','audio/webm','application/pdf',
    'application/zip','application/x-zip-compressed','application/vnd.rar','application/x-rar-compressed','application/x-7z-compressed',
    'text/plain','text/csv','application/json',
    'application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation'
  ]);

  const client = () => window.SPIKE_SUPABASE || window.db;
  const safeName = (name) => String(name || 'attachment').normalize('NFKD').replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^\.+/, '').slice(-120) || 'attachment';
  const uuid = () => (window.crypto?.randomUUID ? window.crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const MIME_BY_EXTENSION = { zip:'application/zip', rar:'application/vnd.rar', '7z':'application/x-7z-compressed', pdf:'application/pdf', txt:'text/plain', csv:'text/csv', json:'application/json', doc:'application/msword', docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document', xls:'application/vnd.ms-excel', xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', ppt:'application/vnd.ms-powerpoint', pptx:'application/vnd.openxmlformats-officedocument.presentationml.presentation' };
  const mimeFor = (file) => {
    const declared = String(file?.type || '').toLowerCase().split(';', 1)[0].trim();
    if (declared && declared !== 'application/octet-stream') return declared;
    const ext = String(file?.name || '').split('.').pop().toLowerCase();
    return MIME_BY_EXTENSION[ext] || declared || 'application/octet-stream';
  };
  const typeFor = (file) => {
    const type = mimeFor(file);
    if (type.startsWith('image/')) return 'image';
    if (type.startsWith('video/')) return 'video';
    if (type.startsWith('audio/')) return 'audio';
    return 'file';
  };

  async function uploadPrivate(file, { userId, conversationId, bucket = 'chat-attachments' } = {}) {
    const db = client();
    if (!db) throw new Error('SPIKE database connection is not ready.');
    if (!(file instanceof Blob) || !file.size) throw new Error('Choose a non-empty file.');
    if (file.size > MAX_PRIVATE_BYTES) throw new Error('Private attachments must be 50 MB or smaller.');
    const mime = mimeFor(file);
    if (!PRIVATE_MIME_TYPES.has(mime)) throw new Error('This file type is not enabled for private attachments.');
    if (!userId || !conversationId) throw new Error('A signed-in user and conversation are required.');
    if (bucket !== 'chat-attachments') throw new Error('This upload route is reserved for private chat attachments.');
    const path = `${userId}/${conversationId}/${uuid()}-${safeName(file.name)}`;
    const { data, error } = await db.storage.from(bucket).upload(path, file, {
      contentType: mime,
      cacheControl: '3600',
      upsert: false
    });
    if (error) throw error;
    return Object.freeze({ path: data.path, bucket, mimeType: mime, size: file.size, fileName: safeName(file.name), type: typeFor(file) });
  }

  async function createPrivateUrl(path, { bucket = 'chat-attachments', expiresIn = 300 } = {}) {
    const db = client();
    if (!db || !path) throw new Error('A private attachment path is required.');
    const { data, error } = await db.storage.from(bucket).createSignedUrl(path, expiresIn);
    if (error) throw error;
    return data.signedUrl;
  }

  async function uploadPublic(file, { userId, folder = 'post-media' } = {}) {
    if (!window.SPIKE_CLOUDINARY) throw new Error('Cloudinary media service is not ready.');
    return window.SPIKE_CLOUDINARY.upload(file, { userId, folder });
  }

  window.SPIKE_MEDIA = Object.freeze({ uploadPublic, uploadPrivate, createPrivateUrl, typeFor });

  function notify(message, kind = 'info') {
    if (typeof window.spikePremiumToast === 'function') window.spikePremiumToast(message, kind, 4200);
    else {
      const status = document.getElementById('status');
      if (status) status.textContent = message;
      else console[kind === 'error' ? 'error' : 'info']('[SPIKE media]', message);
    }
  }

  async function currentUser() {
    const db = client();
    if (!db) throw new Error('SPIKE database connection is not ready.');
    const { data, error } = await db.auth.getUser();
    if (error) throw error;
    if (!data?.user) throw new Error('Sign in to upload media.');
    return data.user;
  }

  function initProfileUploads() {
    const inputs = [
      ['avatarFile', 'avatar_path', 'profiles'], ['editAvatarFile', 'avatar_path', 'profiles'],
      ['coverFile', 'cover_path', 'profiles'], ['editCoverFile', 'cover_path', 'profiles']
    ].map(([id, column, folder]) => ({ input: document.getElementById(id), column, folder })).filter(x => x.input);
    if (!inputs.length || !window.SPIKE_CLOUDINARY) return;

    document.getElementById('coverEdit')?.addEventListener('click', () => document.getElementById('coverFile')?.click());

    const setBusy = (column, busy) => {
      const target = column === 'avatar_path' ? document.getElementById('avatar') : document.getElementById('coverArea');
      target?.classList.toggle('uploading', busy);
      inputs.filter(x => x.column === column).forEach(x => { x.input.disabled = busy; });
    };
    const paint = (column, url) => {
      if (column === 'avatar_path') {
        const button = document.getElementById('avatar');
        if (button) {
          button.replaceChildren();
          const img = document.createElement('img'); img.src = url; img.alt = 'Profile picture';
          button.append(img);
        }
      } else {
        const image = document.getElementById('coverImg');
        if (image) { image.src = url; image.classList.remove('hidden'); }
      }
    };

    inputs.forEach(({ input, column, folder }) => input.addEventListener('change', async () => {
      const file = input.files?.[0];
      if (!file) return;
      if (!String(file.type).startsWith('image/')) { notify('Choose an image file.', 'error'); input.value = ''; return; }
      setBusy(column, true);
      try {
        const user = await currentUser();
        const params = new URLSearchParams(location.search);
        const targetId = params.get('uid') || params.get('user_id') || params.get('id');
        if (targetId && targetId !== user.id) throw new Error('You can only change your own profile photos.');
        const asset = await window.SPIKE_CLOUDINARY.uploadImage(file, { userId: user.id, folder });
        const db = client();
        const { error } = await db.from('profiles').update({ [column]: asset.secure_url, updated_at: new Date().toISOString() }).eq('id', user.id);
        if (error) throw error;
        paint(column, asset.secure_url);
        window.dispatchEvent(new CustomEvent('spike:profile-media-updated', { detail: { column, url: asset.secure_url } }));
        notify(column === 'avatar_path' ? 'Profile photo updated.' : 'Cover photo updated.', 'success');
      } catch (error) {
        console.error('[SPIKE profile media]', error);
        notify(error?.message || 'Could not upload this image.', 'error');
      } finally {
        input.value = '';
        setBusy(column, false);
      }
    }));
  }

  function initMessageUploads() {
    const input = document.getElementById('mediaInput');
    const form = document.getElementById('form');
    if (!input || !form) return;
    const preview = document.getElementById('mediaPreview');
    const name = document.getElementById('mediaPreviewName');
    const meta = document.getElementById('mediaPreviewMeta');
    const status = document.getElementById('status');
    let selected = null;
    const showStatus = (message, error = false) => {
      if (status) { status.textContent = message; status.classList.toggle('error', error); }
    };
    const clear = () => {
      selected = null; input.value = '';
      preview?.classList.remove('show');
      if (name) name.textContent = '';
      if (meta) meta.textContent = '';
    };
    const shade = document.getElementById('mediaShade');
    const sheet = shade?.querySelector('[role="dialog"]');
    const closeButton = document.getElementById('closeMediaSheet');
    let returnFocus = null;
    const closeSheet = () => {
      if (!shade?.classList.contains('show')) return;
      shade.classList.remove('show');
      shade.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('msg-private-share-open');
      if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
    };
    document.getElementById('mediaPlus')?.addEventListener('click', event => {
      if (!shade) return;
      returnFocus = event.currentTarget;
      shade.classList.add('show');
      shade.setAttribute('aria-hidden', 'false');
      document.body.classList.add('msg-private-share-open');
      requestAnimationFrame(() => closeButton?.focus({ preventScroll: true }));
    });
    closeButton?.addEventListener('click', closeSheet);
    shade?.addEventListener('click', event => { if (event.target === shade) closeSheet(); });
    document.addEventListener('keydown', event => {
      if (!shade?.classList.contains('show')) return;
      if (event.key === 'Escape') { event.preventDefault(); closeSheet(); return; }
      if (event.key !== 'Tab' || !sheet) return;
      const focusable = [...sheet.querySelectorAll('button:not([disabled]),[href],input:not([disabled]),[tabindex]:not([tabindex="-1"])')].filter(node => node.getClientRects().length);
      if (!focusable.length) { event.preventDefault(); sheet.focus(); return; }
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    });
    document.querySelectorAll('[data-media-kind]').forEach(button => button.addEventListener('click', () => {
      const kind = button.dataset.mediaKind;
      const accepts = {
        image: 'image/jpeg,image/png,image/webp,image/avif',
        video: 'video/mp4',
        audio: 'audio/mpeg,audio/mp4,audio/webm',
        pdf: 'application/pdf,.pdf',
        archive: '.zip,.rar,.7z',
        any: 'image/jpeg,image/png,image/webp,image/avif,video/mp4,audio/mpeg,audio/mp4,audio/webm,application/pdf,.zip,.rar,.7z,.txt,.csv,.json,.doc,.docx,.xls,.xlsx,.ppt,.pptx'
      };
      input.accept = accepts[kind] || accepts.any;
      closeSheet();
      input.click();
    }));
    input.addEventListener('change', () => {
      selected = input.files?.[0] || null;
      if (!selected) { clear(); return; }
      if (name) name.textContent = selected.name;
      if (meta) meta.textContent = `${(selected.size / 1024 / 1024).toFixed(2)} MB · Private attachment`;
      preview?.classList.add('show');
      showStatus('Attachment ready. Tap Send to share it privately.');
    });
    document.getElementById('removeMedia')?.addEventListener('click', clear);

    form.addEventListener('submit', async event => {
      if (!selected) return;
      event.preventDefault();
      const send = document.getElementById('send');
      if (send?.disabled) return;
      if (send) send.disabled = true;
      try {
        const user = await currentUser();
        const params = new URLSearchParams(location.search);
        const conversationId = params.get('conversation_id') || params.get('conversation') || params.get('thread') || params.get('id');
        if (!conversationId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(conversationId)) {
          throw new Error('This chat link is missing a valid conversation ID. Open the conversation from your messages list and try again.');
        }
        const file = selected;
        showStatus('Uploading private attachment…');
        const asset = await window.SPIKE_MEDIA.uploadPrivate(file, { userId: user.id, conversationId });
        const db = client();
        const bodyText = String(document.getElementById('body')?.value || '').trim();
        const { data: row, error } = await db.from('messages').insert({
          conversation_id: conversationId,
          sender_id: user.id,
          body: bodyText || `[Attachment: ${asset.fileName}]`,
          attachment_path: asset.path,
          attachment_type: asset.type,
          reply_to_id: document.getElementById('replyPreview')?.classList.contains('show') ? (window.SPIKE_MESSAGING?.getReplyToId?.() || null) : null
        }).select('id,conversation_id,sender_id,body,reply_to_id,attachment_path,attachment_type,is_edited,deleted_at,created_at').single();
        if (error) {
          await db.storage.from('chat-attachments').remove([asset.path]).catch(() => {});
          throw error;
        }
        if (window.SPIKE_MESSAGING?.appendMessage) {
          try { await window.SPIKE_MESSAGING.appendMessage(row); }
          catch (renderError) { console.warn('[SPIKE private attachment] sent but local render failed', renderError); showStatus('Attachment sent. Refresh the conversation if it does not appear.'); }
        } else {
          showStatus('Attachment sent. Refresh the conversation to view it.');
        }
        const bodyInput = document.getElementById('body'); if (bodyInput) bodyInput.value = '';
        clear();
        window.SPIKE_MESSAGING?.clearReply?.();
        showStatus('Private attachment sent. Only conversation members can access it.');
      } catch (error) {
        console.error('[SPIKE private attachment]', error);
        showStatus(error?.message || 'Could not send this attachment.', true);
      } finally {
        if (send) send.disabled = false;
      }
    });
  }

  const start = () => { initProfileUploads(); initMessageUploads(); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
