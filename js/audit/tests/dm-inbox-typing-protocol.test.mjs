import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const inbox = await readFile('messages.html', 'utf8');
const thread = await readFile('message.html', 'utf8');

test('Inbox typing listens on the same pair-scoped topic as the conversation composer', () => {
  assert.match(thread, /const typingTopic='spike:dm-typing:v1:'/);
  assert.match(inbox, /const topic='spike:dm-typing:v1:'\+pair\.join\(':'\)/);
});

test('Inbox typing validates the same from/to payload contract emitted by the conversation', () => {
  assert.match(thread, /payload\?\.from!==other\|\|payload\?\.to!==me\.id/);
  assert.match(inbox, /payload\.from\|\|''/);
  assert.match(inbox, /String\(payload\.from\|\|''\)\.toLowerCase\(\)!==String\(id\)/);
  assert.match(inbox, /payload\.to\|\|''/);
  assert.match(inbox, /String\(payload\.to\|\|''\)\.toLowerCase\(\)!==String\(me\.id\)/);
  assert.match(inbox, /setPeerTyping\(id,payload\.typing===true\)/);
});
