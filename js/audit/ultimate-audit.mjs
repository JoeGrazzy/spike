import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const htmlFiles = (await readdir(root)).filter(x => x.endsWith('.html'));
const sharedInline = new Map();
const referenced = new Set();
const issues = [];

for (const file of htmlFiles) {
  const html = await readFile(path.join(root, file), 'utf8');
  for (const m of html.matchAll(/<(?:script|link)[^>]+(?:src|href)=["']([^"']+)["'][^>]*>/gi)) {
    const ref = m[1];
    if (/^(?:js|css)\//.test(ref)) referenced.add(ref.split(/[?#]/)[0]);
  }
  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    const attrs = m[1];
    const body = m[2].replace(/\s+/g, ' ').trim();
    const id = attrs.match(/\bid=["']([^"']+)["']/i)?.[1];
    if (id && body.length > 180 && !['spike-theme-bootstrap','spike-performance-bootstrap'].includes(id)) {
      const key = `${id}|${body}`;
      const rows = sharedInline.get(key) ?? [];
      rows.push(file);
      sharedInline.set(key, rows);
    }
  }
  const imgs = [...html.matchAll(/<img\b[^>]*>/gi)].map(x => x[0]);
  for (const img of imgs) {
    const src = img.match(/\bsrc=[\"']([^\"']*)[\"']/i)?.[1] ?? '';
    const staticBrand = /(?:assets\/icon\/icon\.png|spike-loader-logo)/i.test(src + img);
    if (!staticBrand && !/\bloading=[\"'](?:lazy|eager)[\"']/i.test(img)) issues.push(`${file}: non-brand image missing explicit loading policy`);
    if (!staticBrand && !/\bdecoding=[\"'](?:async|sync|auto)[\"']/i.test(img)) issues.push(`${file}: non-brand image missing decoding policy`);
  }
}

for (const [key, files] of sharedInline) {
  if (files.length >= 2) issues.push(`duplicate inline block: ${key.slice(0, key.indexOf('|'))} (${files.length} pages)`);
}

for (const dir of ['js', 'css']) {
  for (const file of await readdir(path.join(root, dir), { withFileTypes: true })) {
    if (!file.isFile()) continue;
    const rel = `${dir}/${file.name}`;
    if (/\.(?:js|css)$/.test(file.name) && !referenced.has(rel) && !/^js\/audit/.test(rel)) issues.push(`unreferenced asset: ${rel}`);
  }
}

for (const file of htmlFiles) {
  const html = await readFile(path.join(root, file), 'utf8');
  for (const m of html.matchAll(/<(?:script|link|img)[^>]+(?:src|href)=[\"']([^\"']+)[\"'][^>]*>/gi)) {
    const ref = m[1].split(/[?#]/)[0];
    if (!ref || /^(?:https?:|data:|blob:|#|javascript:)/i.test(ref) || ref.startsWith('//') || ref.includes('${')) continue;
    const candidate = path.resolve(root, ref);
    try { await stat(candidate); } catch { issues.push(`${file}: missing local asset ${ref}`); }
  }
}

const distDev = [];
async function walk(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) await walk(p);
    else if (/\b(?:audit|docs)\b|(?:package\.json|build\.js|remove_legacy\.sql|dom\.txt)$/.test(p)) distDev.push(path.relative(root, p));
  }
}
await walk(path.join(root, 'dist'));
if (distDev.length) issues.push(`development artifacts leaked into dist: ${distDev.join(', ')}`);

const maxHtml = 350_000;
for (const file of htmlFiles) {
  const size = (await stat(path.join(root, file))).size;
  if (size > maxHtml) issues.push(`${file}: ${size} bytes exceeds ${maxHtml}`);
}

if (issues.length) {
  console.error('Ultimate audit found issues:');
  for (const issue of issues) console.error(`- ${issue}`);
  process.exitCode = 1;
} else {
  console.log(`Ultimate audit passed: ${htmlFiles.length} pages, no duplicated shared inline blocks, no unreferenced JS/CSS assets, no dev leakage, image loading policies present.`);
}
