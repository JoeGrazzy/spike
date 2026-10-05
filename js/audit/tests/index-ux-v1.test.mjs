import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync('index.html','utf8');
const css = fs.readFileSync('css/index.css','utf8');

assert.equal((html.match(/class="auth-header"/g)||[]).length, 0, 'duplicate outer auth heading must be removed');
assert.equal((html.match(/<h3 class="title">Welcome back<\/h3>/g)||[]).length, 1, 'login needs one visible Welcome back heading');
assert.match(html, /<div class="tabs" role="tablist"/);
assert.match(html, /<section class="auth-card">/);
assert.match(css, /\.auth-header\{display:none\}/);
assert.match(css, /@media \(max-width:520px\)/);
assert.match(css, /\.feature-strip\{display:none\}/);
console.log('Index UX V1: 6/6 passed');
