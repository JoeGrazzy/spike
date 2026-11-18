import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const htmlFiles = fs.readdirSync(root).filter((name) => name.endsWith('.html'));

test('internal CSS and JS assets use canonical non-versioned filenames', () => {
  for (const folder of ['css', 'js']) {
    for (const name of fs.readdirSync(path.join(root, folder))) {
      assert.doesNotMatch(name, /-v\d+(?=\.)/i, `${folder}/${name} must not be a numbered patch variant`);
    }
  }
});

test('every page has unique element IDs and no duplicate local stylesheet or script references', () => {
  for (const file of htmlFiles) {
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    const markupOnly = source.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '');
    const ids = [...markupOnly.matchAll(/\bid=["']([^"']+)["']/gi)].map((match) => match[1]);
    assert.equal(new Set(ids).size, ids.length, `${file} contains duplicate IDs`);

    const assets = [
      ...[...source.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)].map((match) => match[1]),
      ...[...source.matchAll(/<link\b[^>]*\bhref=["']([^"']+\.css(?:\?[^"']*)?)["'][^>]*>/gi)].map((match) => match[1]),
    ].filter((asset) => !/^(?:https?:)?\/\//i.test(asset));
    const canonical = assets.map((asset) => asset.split('?')[0]);
    assert.equal(new Set(canonical).size, canonical.length, `${file} loads a local CSS/JS asset more than once`);
  }
});

test('all local CSS and JavaScript references resolve to files', () => {
  for (const file of htmlFiles) {
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    const assets = [
      ...[...source.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)].map((match) => match[1]),
      ...[...source.matchAll(/<link\b[^>]*\bhref=["']([^"']+\.css(?:\?[^"']*)?)["'][^>]*>/gi)].map((match) => match[1]),
    ];
    for (const asset of assets) {
      if (/^(?:https?:)?\/\//i.test(asset)) continue;
      const localPath = path.resolve(root, asset.split('?')[0]);
      assert.ok(localPath.startsWith(root + path.sep), `${file} references an asset outside the project`);
      assert.ok(fs.existsSync(localPath), `${file} references missing asset ${asset}`);
    }
  }
});

test('all external JavaScript files pass the Node syntax parser', async () => {
  const { spawnSync } = await import('node:child_process');
  for (const name of fs.readdirSync(path.join(root, 'js')).filter((entry) => entry.endsWith('.js'))) {
    const result = spawnSync(process.execPath, ['--check', path.join(root, 'js', name)], { encoding: 'utf8' });
    assert.equal(result.status, 0, `${name}: ${result.stderr}`);
  }
});

test('every JavaScript module is referenced by at least one HTML page', () => {
  const htmlSources = htmlFiles.map((file) => fs.readFileSync(path.join(root, file), 'utf8'));
  const references = htmlSources.flatMap((source) =>
    [...source.matchAll(/<script\b[^>]*\bsrc=["']([^"']+\.js(?:\?[^"']*)?)["'][^>]*>/gi)]
      .map((match) => match[1].split('?')[0])
  );
  const jsFiles = fs.readdirSync(path.join(root, 'js')).filter((entry) => entry.endsWith('.js'));
  const imported = jsFiles.flatMap((name) => {
    const source = fs.readFileSync(path.join(root, 'js', name), 'utf8');
    return [...source.matchAll(/from\s+["']\.\/([^"']+\.js)["']/g)].map((match) => `js/${match[1]}`);
  });
  for (const name of jsFiles) {
    assert.ok(references.includes(`js/${name}`) || imported.includes(`js/${name}`), `js/${name} is not referenced by a page or module`);
  }
});

test('all inline JavaScript blocks pass the Node syntax parser', async () => {
  const { spawnSync } = await import('node:child_process');
  for (const file of htmlFiles) {
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    for (const match of source.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
      const attributes = match[1];
      if (/\bsrc\s*=|\btype\s*=\s*["'](?:application\/(?:ld\+)?json|importmap|text\/template)/i.test(attributes)) continue;
      const code = match[2].trim();
      if (!code) continue;
      const result = spawnSync(process.execPath, ['--check'], { input: code, encoding: 'utf8' });
      assert.equal(result.status, 0, `${file} contains invalid inline JavaScript: ${result.stderr}`);
    }
  }
});


test('Supabase browser integration uses only the publishable key and no privileged secret', () => {
  const client = fs.readFileSync(path.join(root, 'js/spike-platform-bootstrap.js'), 'utf8');
  assert.match(client, /sb_publishable_/);
  assert.doesNotMatch(client, /service_role|sb_secret_/i);
  assert.match(client, /flowType:\s*'pkce'/);
});

test('auth pages and protected app pages load their Supabase controllers', () => {
  const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const reset = fs.readFileSync(path.join(root, 'reset-password.html'), 'utf8');
  assert.match(index, /spike-auth\.js/);
  assert.match(reset, /spike-password-reset\.js/);
  for (const file of ['feed.html','profile.html','friends.html','messages.html','message.html','notifications.html','rooms.html','room.html','wallet.html','settings.html','admin.html']) {
    assert.match(fs.readFileSync(path.join(root, file), 'utf8'), /spike-supabase-guard\.js/, `${file} must enforce an authenticated session`);
  }
});


test('legacy SPIKE platform bridge and social API are shipped before page controllers', () => {
  const bootstrap = fs.readFileSync(path.join(root, 'js/spike-platform-bootstrap.js'), 'utf8');
  assert.match(bootstrap, /window\.SPIKE_PLATFORM/);
  assert.match(bootstrap, /window\.SPIKE/);
  assert.match(bootstrap, /get_spike_follow_list/);
  for (const file of ['index.html','profile.html','user-profile.html','followers.html','following.html','friends.html']) {
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    assert.match(source, /spike-platform-bootstrap\.js/, `${file} must load the bridge before legacy scripts`);
  }
});


test('room discovery and room bootstrap are connected to Supabase controllers', () => {
  const rooms = fs.readFileSync(path.join(root, 'rooms.html'), 'utf8');
  const room = fs.readFileSync(path.join(root, 'room.html'), 'utf8');
  const discovery = fs.readFileSync(path.join(root, 'js/spike-rooms-controller.js'), 'utf8');
  const bootstrap = fs.readFileSync(path.join(root, 'js/spike-room-bootstrap.js'), 'utf8');
  assert.match(rooms, /spike-rooms-controller\.js/);
  assert.match(room, /spike-room-bootstrap\.js/);
  assert.match(discovery, /from\('rooms'\)/);
  assert.match(discovery, /spike_rooms|rooms/);
  assert.match(bootstrap, /spike:room-ready/);
  assert.match(bootstrap, /spike_room_accept_invite/);
});

test('all pages pin the Supabase browser SDK to one exact tested release', () => {
  const pages = htmlFiles.filter((file) => /@supabase\/supabase-js/.test(fs.readFileSync(path.join(root, file), 'utf8')));
  assert.equal(pages.length, 19);
  for (const file of pages) {
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    assert.match(source, /@supabase\/supabase-js@2\.119\.1/, `${file} must use the pinned SDK release`);
    assert.doesNotMatch(source, /@supabase\/supabase-js@2(?:['"/]|$)/, `${file} must not use the floating major tag`);
  }
});
