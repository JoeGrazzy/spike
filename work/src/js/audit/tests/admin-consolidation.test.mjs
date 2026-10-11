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

test('Room Members is owned by Rooms, not duplicated inside Users', () => {
  const rooms = section('rooms');
  const users = section('users');
  assert.match(rooms, /id="memberRoom"/);
  assert.match(rooms, /id="roomMembersList"/);
  assert.doesNotMatch(users, /id="memberRoom"/);
  assert.doesNotMatch(users, /id="roomMembersList"/);
});

test('Room Members runtime remains wired after relocation', () => {
  assert.match(html, /admin_list_room_members/);
  assert.match(html, /on\('memberRoom','change',loadRoomMembers\)/);
  assert.match(html, /on\('refreshRoomMembers','click',loadRoomMembers\)/);
  assert.match(html, /page==='rooms'\)\{ loadRooms\(\); loadRoomChoices\(\); \}/);
});

test('User registration action remains available while redundant explanatory panel is removed', () => {
  const users = section('users');
  assert.match(users, /id="registerUser"/);
  assert.doesNotMatch(users, /Auth Registration/);
  assert.match(html, /function openRegisterUser/);
  assert.match(html, /on\('registerUser','click',openRegisterUser\)/);
});

test('Admin identity is no longer mislabeled as Rooms Admin', () => {
  assert.ok(html.includes('<div class="brand"><b>SPIKE</b> ADMIN</div>'));
  assert.ok(!html.includes('<div class="brand"><b>SPIKE</b> ROOMS ADMIN</div>'));
});

test('shared modal close control is wired and backdrop closes the modal', () => {
  assert.match(html, /on\('close','click',\(\)=>\$\('#modal'\)\?\.classList\.remove\('show'\)\)/);
  assert.match(html, /\$\('#modal'\)\?\.addEventListener\('click',e=>\{if\(e\.target\.id==='modal'\)\$\('#modal'\)\.classList\.remove\('show'\)\}\)/);
});

test('dashboard refresh does not report success when stats refresh fails', () => {
  assert.match(html, /const refreshed=await stats\(\);if\(refreshed===null\)\{toast\('Dashboard refresh failed — check connection and retry','error'\);return\}/);
});

test('user cards do not expose the removed gamification level field', () => {
  assert.match(html, /Coins unavailable/);
  const start=html.indexOf('function userCard'); const end=html.indexOf('let registerBusy',start); const card=html.slice(start,end); assert.doesNotMatch(card, /Level unavailable|Number\(u\.level\|\|1\)|levelValue/);
});
