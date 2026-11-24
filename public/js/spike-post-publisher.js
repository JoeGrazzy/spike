/* SPIKE post publishing service. Post media stays private in Supabase Storage. */
(() => {
  'use strict';

  const BUCKET = 'post-media';
  const MAX_FILE_BYTES = 6 * 1024 * 1024;
  const MAX_FILES = 8;
  const TYPES = new Set([
    'image/jpeg', 'image/png', 'image/webp', 'image/avif',
    'video/mp4', 'audio/mpeg', 'audio/mp4', 'audio/webm'
  ]);

  const client = () => window.SPIKE_SUPABASE || window.db;
  const uuid = () => window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const safeName = value => String(value || 'media').normalize('NFKD').replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^\.+/, '').slice(-100) || 'media';
  const mediaType = file => file.type.startsWith('image/') ? 'image' : file.type.startsWith('video/') ? 'video' : 'audio';

  function validate({ body = '', files = [], visibility = 'public' } = {}) {
    if (!['public', 'followers', 'private'].includes(visibility)) throw new Error('Choose a valid post visibility.');
    if (!Array.isArray(files) || files.length > MAX_FILES) throw new Error(`Choose up to ${MAX_FILES} media files.`);
    const text = String(body || '').trim();
    if (text.length > 10000) throw new Error('Post text must be 10,000 characters or fewer.');
    if (!text && !files.length) throw new Error('Write something or attach media before publishing.');
    for (const file of files) {
      if (!(file instanceof Blob) || !file.size) throw new Error('One of the selected files is empty or invalid.');
      if (!TYPES.has(String(file.type || '').toLowerCase())) throw new Error(`Unsupported post media type: ${file.type || 'unknown'}.`);
      if (file.size > MAX_FILE_BYTES) throw new Error('Each post media file must be 6 MB or smaller until resumable uploads are enabled.');
    }
    return { body: text, files, visibility };
  }

  async function publishPost(options = {}) {
    const input = validate(options);
    const db = client();
    if (!db) throw new Error('SPIKE database connection is not ready.');
    const { data: auth, error: authError } = await db.auth.getUser();
    if (authError) throw authError;
    const user = auth?.user;
    if (!user?.id) throw new Error('Sign in to publish a post.');
    const sharedLocation = options.shareLocation === true ? options.location : null;
    if (sharedLocation && (!Number.isFinite(sharedLocation.latitude) || !Number.isFinite(sharedLocation.longitude) || Math.abs(sharedLocation.latitude) > 90 || Math.abs(sharedLocation.longitude) > 180)) throw new Error('The selected post location is invalid.');

    const postId = uuid();
    const post = {
      id: postId,
      author_id: user.id,
      body: input.body,
      visibility: input.visibility,
      comments_enabled: options.commentsEnabled !== false,
      status: 'published'
    };
    // Do not request INSERT \... RETURNING here. The posts SELECT policy is
    // visibility-aware and PostgREST's representation response can cause an
    // RLS rejection during publish. The client already generated the UUID and
    // knows the inserted values, so a minimal INSERT is sufficient.
    const { error: postError } = await db.from('posts').insert(post);
    if (postError) throw postError;
    post.created_at = new Date().toISOString();

    const uploaded = [];
    try {
      for (let index = 0; index < input.files.length; index += 1) {
        const file = input.files[index];
        const path = `${user.id}/${postId}/${uuid()}-${safeName(file.name)}`;
        const { data, error } = await db.storage.from(BUCKET).upload(path, file, {
          contentType: file.type,
          cacheControl: '3600',
          upsert: false
        });
        if (error) throw error;
        uploaded.push({
          post_id: postId,
          owner_id: user.id,
          object_path: data.path,
          media_type: mediaType(file),
          mime_type: file.type,
          byte_size: file.size,
          position: index
        });
      }
      if (sharedLocation) {
        const { error: locationError } = await db.from('post_locations').insert({ post_id: postId, author_id: user.id, latitude: sharedLocation.latitude, longitude: sharedLocation.longitude });
        if (locationError) throw locationError;
      }
      if (uploaded.length) {
        const { data: media, error: mediaError } = await db.from('post_media').insert(uploaded)
          .select('id,post_id,owner_id,object_path,media_type,mime_type,byte_size,position,created_at');
        if (mediaError) throw mediaError;
        return { post, media: media || [] };
      }
      return { post, media: [] };
    } catch (error) {
      // Best-effort rollback: remove uploaded objects, then remove the post row.
      if (uploaded.length) {
        try { await db.storage.from(BUCKET).remove(uploaded.map(item => item.object_path)); }
        catch (cleanupError) { console.error('[SPIKE post media] object cleanup failed', cleanupError); }
      }
      try { await db.from('post_locations').delete().eq('post_id', postId).eq('author_id', user.id); } catch (cleanupError) { console.error('[SPIKE post location] cleanup failed', cleanupError); }
      try { await db.from('posts').delete().eq('id', postId).eq('author_id', user.id); }
      catch (cleanupError) { console.error('[SPIKE post media] post rollback failed', cleanupError); }
      throw error;
    }
  }

  async function createMediaUrls(mediaRows, expiresIn = 300) {
    const db = client();
    if (!db) throw new Error('SPIKE database connection is not ready.');
    if (!Array.isArray(mediaRows)) return [];
    return Promise.all(mediaRows.map(async row => {
      const { data, error } = await db.storage.from(BUCKET).createSignedUrl(row.object_path, expiresIn);
      if (error) throw error;
      return { ...row, signedUrl: data.signedUrl };
    }));
  }

  window.SPIKE_POSTS = Object.freeze({ publishPost, createMediaUrls, validate, bucket: BUCKET, maxFileBytes: MAX_FILE_BYTES });
})();
