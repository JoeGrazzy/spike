/* SPIKE media storage: unsigned browser uploads to Cloudinary.
 * Never add a Cloudinary API secret to this file or any browser bundle.
 */
(() => {
  'use strict';

  const CONFIG = Object.freeze({
    cloudName: 'vhmoz6a0',
    uploadPreset: 'spike_present'
  });
  const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
  const MAX_VIDEO_BYTES = 100 * 1024 * 1024;
  const MAX_RAW_BYTES = 10 * 1024 * 1024;
  const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif', 'image/heic']);
  const VIDEO_TYPES = new Set(['video/mp4', 'video/webm', 'video/quicktime', 'video/ogg']);
  const AUDIO_TYPES = new Set(['audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/wav', 'audio/x-wav', 'audio/ogg', 'audio/webm', 'audio/mp4']);
  const RAW_TYPES = new Set([
    'application/pdf', 'application/zip', 'application/x-zip-compressed',
    'application/vnd.rar', 'application/x-rar-compressed', 'application/x-7z-compressed',
    'text/plain', 'text/csv', 'application/json',
    'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  ]);

  function resourceFor(file) {
    const type = String(file?.type || '').toLowerCase();
    if (IMAGE_TYPES.has(type)) return { resource: 'image', max: MAX_IMAGE_BYTES };
    if (VIDEO_TYPES.has(type)) return { resource: 'video', max: MAX_VIDEO_BYTES };
    if (AUDIO_TYPES.has(type)) return { resource: 'video', max: MAX_VIDEO_BYTES };
    if (RAW_TYPES.has(type) || !type) return { resource: 'raw', max: MAX_RAW_BYTES };
    throw new Error('This file type is not supported for upload.');
  }

  async function upload(file, options = {}) {
    if (!(file instanceof Blob) || !file.size) throw new Error('Choose a non-empty file to upload.');
    const { resource, max } = resourceFor(file);
    if (file.size > max) throw new Error(`File is too large. Maximum size is ${Math.round(max / 1024 / 1024)} MB.`);

    const folderPart = String(options.folder || 'media').toLowerCase().replace(/[^a-z0-9/_-]/g, '').replace(/^\/+|\/+$/g, '');
    const userPart = String(options.userId || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80);
    const folder = `spike/${folderPart || 'media'}${userPart ? `/${userPart}` : ''}`;
    const body = new FormData();
    body.append('file', file);
    body.append('upload_preset', CONFIG.uploadPreset);
    body.append('folder', folder);
    if (options.publicId) body.append('public_id', String(options.publicId).replace(/[^a-zA-Z0-9/_-]/g, '').slice(0, 180));

    const endpoint = `https://api.cloudinary.com/v1_1/${CONFIG.cloudName}/${resource}/upload`;
    const response = await fetch(endpoint, { method: 'POST', body });
    let result;
    try { result = await response.json(); } catch { throw new Error('Cloudinary returned an unreadable response.'); }
    if (!response.ok || !result?.secure_url) {
      throw new Error(result?.error?.message || `Upload failed (${response.status}).`);
    }
    return Object.freeze({
      url: result.secure_url,
      secure_url: result.secure_url,
      public_id: result.public_id,
      resource_type: result.resource_type,
      format: result.format || null,
      bytes: Number(result.bytes || file.size),
      width: result.width || null,
      height: result.height || null,
      duration: result.duration || null,
      original_filename: result.original_filename || file.name
    });
  }

  window.SPIKE_CLOUDINARY = Object.freeze({
    config: CONFIG,
    upload,
    uploadImage: (file, options = {}) => {
      if (!IMAGE_TYPES.has(String(file?.type || '').toLowerCase())) return Promise.reject(new Error('Choose a supported image file.'));
      return upload(file, { ...options, folder: options.folder || 'images' });
    },
    uploadVideo: (file, options = {}) => {
      if (!VIDEO_TYPES.has(String(file?.type || '').toLowerCase())) return Promise.reject(new Error('Choose a supported video file.'));
      return upload(file, { ...options, folder: options.folder || 'videos' });
    }
  });
})();
