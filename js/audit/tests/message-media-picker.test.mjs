import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../../../message.html', import.meta.url), 'utf8');

test('conversation page retains the media picker entry point and supported phone media types', () => {
  assert.match(source, /id="mediaPlus"/, 'attachment picker button must exist');
  assert.match(source, /id="mediaInput" type="file"/, 'native file picker input must exist');
  assert.match(source, /image\/\*,video\/\*,audio\/\*/, 'images, videos, and audio must be selectable');
  assert.match(source, /data-media-kind/, 'media type menu actions must be wired');
  assert.match(source, /addEventListener\('change',\(\)=>chooseMedia/, 'selected files must enter the attachment preview flow');
  assert.match(source, /function chooseMedia\(/, 'selected media must be handled before sending');
  assert.match(source, /function openAttachment\(/, 'sent attachments must be openable');
});
