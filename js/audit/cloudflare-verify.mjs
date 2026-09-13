import { access } from 'node:fs/promises';
for (const path of ['dist/index.html','dist/feed.html','dist/spike_world.html','dist/leveling.html','dist/css/feed-features.css','dist/css/premium-back.css','dist/js/premium-back.js','dist/_headers']) await access(path);
console.log('Cloudflare artifact verification passed.');
