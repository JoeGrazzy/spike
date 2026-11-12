import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const html = await readFile(path.join(root, 'admin.html'), 'utf8');

const section = id => {
  const m = html.match(new RegExp(`<section id="${id}"[\\s\\S]*?<\\/section>`));
  assert.ok(m, `Missing admin section: ${id}`);
  return m[0];
};

test('admin overview removes duplicate quick-action launcher but keeps operational snapshot', () => {
  const overview = section('overview');
  assert.doesNotMatch(overview, /data-admin-go=/);
  assert.match(overview, /Control center/);
});

test('User registration action remains available while redundant explanatory panel is removed', () => {
  const users = section('users');
  assert.match(users, /id="registerUser"/);
  assert.doesNotMatch(users, /Auth Registration/);
  assert.match(html, /function openRegisterUser/);
  assert.match(html, /on\('registerUser','click',openRegisterUser\)/);
});

test('Admin identity uses the canonical SPIKE ADMIN brand', () => {
  assert.ok(html.includes('<div class="brand"><b>SPIKE</b> ADMIN</div>'));
});

test('shared modal close control is wired and backdrop closes the modal', () => {
  assert.match(html, /on\('close','click',\(\)=>closeAdminDialog\(null\)\)/);
  assert.match(html, /\$\('#modal'\)\?\.addEventListener\('click',e=>\{if\(e\.target\.id==='modal'\)closeAdminDialog\(null\)\}\)/);
});

test('dashboard refresh does not report success when stats refresh fails', () => {
  assert.match(html, /const refreshed=await stats\(\);if\(refreshed===null\)\{toast\('Dashboard refresh failed — check connection and retry','error'\);return\}/);
});

test('user cards do not expose the removed gamification level field', () => {
  assert.match(html, /Coins unavailable/);
  const start=html.indexOf('function userCard'); const end=html.indexOf('let registerBusy',start); const card=html.slice(start,end); assert.doesNotMatch(card, /Level unavailable|Number\(u\.level\|\|1\)|levelValue/);
});
