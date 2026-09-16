import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');

test('home exposes the primary path', () => {
  const html = readFileSync(resolve(root, 'index.html'), 'utf8');
  assert.match(html, /paipan\.html/iu);
  assert.match(html, /前事|排盘|服务/iu);
});

test('paipan exposes required inputs and action', () => {
  const html = readFileSync(resolve(root, 'paipan.html'), 'utf8');
  for (const id of ['name', 'gender', 'date', 'time', 'city', 'lng', 'go', 'result']) {
    assert.match(html, new RegExp(`id=["']${id}["']`, 'iu'), id);
  }
});

test('calculation modules stay free of browser-only imports', () => {
  for (const file of ['bazi.js', 'analysis.js']) {
    const source = readFileSync(resolve(root, file), 'utf8');
    assert.doesNotMatch(source, /fetch\(|localStorage|document\.getElementById/iu, file);
  }
});
