import { mkdir, cp, rm } from 'node:fs/promises';
await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });
for (const item of ['index.html','feed.html','friends.html','messages.html','message.html','notifications.html','profile.html','rooms.html','room.html','room_chat.html','chat_room.html','settings.html','help.html','spike_predictor.html','admin.html','css','js','assets']) await cp(item, `dist/${item}`, { recursive: true });
console.log('Production artifact generated in dist/.');
