import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const html = readFileSync(new URL('../../../impact.html', import.meta.url), 'utf8');
test('Impact page explains campaign-based community support', () => { assert.match(html, /Create a help campaign/); assert.match(html, /Only Verified Badge users can publish campaigns/); assert.match(html, /Choose your support/); });
test('Impact lets everyone discover campaigns without creating one', () => { assert.match(html, /Everyone on SPIKE can discover campaigns/); assert.match(html, /People asking for help/); });
