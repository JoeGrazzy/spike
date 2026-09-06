import { mkdir, cp, rm, readdir, access } from 'node:fs/promises';

await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });

// Production artifact: every root application page plus shared runtime assets
// and Cloudflare Pages headers. Keep the page list dynamic so new pages cannot
// silently disappear from the deployable artifact.
const htmlPages = (await readdir('.')).filter(name => name.endsWith('.html')).sort();
for (const page of htmlPages) await cp(page, `dist/${page}`);
for (const item of ['css', 'js', 'assets']) await cp(item, `dist/${item}`, { recursive: true });
for (const optional of ['_headers', '_redirects']) {
  try { await access(optional); await cp(optional, `dist/${optional}`); } catch (_) {}
}

console.log(`Production artifact generated in dist/: ${htmlPages.length} HTML pages + css/js/assets + deployment config.`);
