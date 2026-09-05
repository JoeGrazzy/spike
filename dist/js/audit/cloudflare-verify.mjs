import { access } from 'node:fs/promises';
for (const path of ['dist/index.html','dist/feed.html','dist/css/premium-back.css','dist/js/premium-back.js']) await access(path);
console.log('Cloudflare artifact verification passed.');
