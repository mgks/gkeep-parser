// Pure-API tests for parseKeepJson. The library now ships the proven
// JSON-export parser that NotesMigrator used to reimplement inline.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseKeepJson } from '../dist/index.js';

const SAMPLE = JSON.stringify({
  title: 'Shopping',
  listContent: [
    { text: 'Milk', isChecked: true },
    { text: 'Bread', isChecked: false },
    { text: '<script>alert(1)</script>', isChecked: false }
  ],
  labels: [{ name: 'errands' }, { name: 'home' }, { name: 'errands' }],
  createdTimestampUsec: 1609459200000000,
  userEditedTimestampUsec: 1609545600000000,
  isPinned: true,
  isArchived: false,
  isTrashed: false,
  color: '#fff8dc',
  attachments: [
    { filePath: 'photo.png', mimetype: 'image/png' },
    { filepath: 'image.jpg' }
  ]
});

test('parseKeepJson: maps checklist to HTML checkboxes', () => {
  const n = parseKeepJson(SAMPLE);
  assert.match(n.content, /<input type="checkbox" checked="true"\/> Milk/);
  assert.match(n.content, /<input type="checkbox"\/> Bread/);
});

test('parseKeepJson: escapes HTML in checklist text (XSS-safe)', () => {
  const n = parseKeepJson(SAMPLE);
  assert.doesNotMatch(n.content, /<script>/);
  assert.match(n.content, /&lt;script&gt;/);
});

test('parseKeepJson: maps labels to tags, dedupes', () => {
  const n = parseKeepJson(SAMPLE);
  assert.deepEqual(n.tags, ['errands', 'home']);
});

test('parseKeepJson: microsecond timestamps become ISO', () => {
  const n = parseKeepJson(SAMPLE);
  assert.equal(n.created, '2021-01-01T00:00:00.000Z');
  assert.equal(n.updated, '2021-01-02T00:00:00.000Z');
});

test('parseKeepJson: distinguishes missing/zero/malformed timestamps as undefined', () => {
  const n = parseKeepJson('{}');
  assert.equal(n.created, undefined);
  assert.equal(n.updated, undefined);

  const m = parseKeepJson(JSON.stringify({ createdTimestampUsec: 0 }));
  assert.equal(m.created, undefined);
});

test('parseKeepJson: maps boolean flags + colour', () => {
  const n = parseKeepJson(SAMPLE);
  assert.equal(n.isPinned, true);
  assert.equal(n.isArchived, false);
  assert.equal(n.isTrashed, false);
  assert.equal(n.color, '#fff8dc');
});

test('parseKeepJson: maps attachments, supports both filePath and filepath casing', () => {
  const n = parseKeepJson(SAMPLE);
  assert.equal(n.attachments.length, 2);
  assert.equal(n.attachments[0].filePath, 'photo.png');
  assert.equal(n.attachments[0].mimeType, 'image/png');
  // Second one has lowercase `filepath` and no mimetype -> sniffed default.
  assert.equal(n.attachments[1].filePath, 'image.jpg');
  assert.equal(n.attachments[1].mimeType, 'image/jpeg');
});

test('parseKeepJson: text-only note (newlines -> <br/>)', () => {
  const n = parseKeepJson(JSON.stringify({ title: 'T', textContent: 'a\nb\nc' }));
  assert.equal(n.content, 'a<br/>b<br/>c');
});

test('parseKeepJson: emoji and CJK survive', () => {
  const n = parseKeepJson(JSON.stringify({ textContent: '✨ Note 日本語' }));
  assert.match(n.content, /✨ Note 日本語/);
});

test('parseKeepJson: malformed JSON throws SyntaxError', () => {
  assert.throws(() => parseKeepJson('{nope'), SyntaxError);
});

// Fuzz: 200 random shapes must not crash uncaught.
test('fuzz: 200 random note shapes', () => {
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];
  let parsed = 0;
  for (let i = 0; i < 200; i++) {
    const o = {};
    if (Math.random() > 0.3) o.title = pick(['', 'T', '✨', null, 123]);
    if (Math.random() > 0.5) o.textContent = pick(['', 'hi\nbye', '<x>']);
    if (Math.random() > 0.7)
      o.listContent = [{ text: pick(['a', null, '<i>']), isChecked: Math.random() > 0.5 }];
    if (Math.random() > 0.8) o.labels = [{ name: pick(['x', '', null]) }];
    if (Math.random() > 0.9) o.attachments = [{ filepath: 'a.png' }];
    try {
      const n = parseKeepJson(JSON.stringify(o));
      assert.ok(typeof n.content === 'string');
      assert.ok(Array.isArray(n.tags));
      parsed++;
    } catch (e) {
      assert.ok(e instanceof SyntaxError);
    }
  }
  assert.ok(parsed > 100);
});
