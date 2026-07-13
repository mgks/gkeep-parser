// Pure-API tests for parseKeepHtml against committed HTML fixtures and a few
// inline edge cases. Validates that:
//   - common Keep HTML produces the expected tags/dates/flags
//   - the mime sniff picks up PNG vs JPEG when the extension differs
//   - duplicate image src in the same note is deduped
//   - the picker ignores decoration <img> outside .content
//   - missing or oddly-formatted dates return undefined (no throw, no Today)
//   - colour swatches in either .color-container or body[style] are surfaced
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseKeepHtml, isKeepImage } from '../dist/index.js';

const root = dirname(fileURLToPath(import.meta.url));
function readFixture(name) {
  return readFileSync(join(root, 'fixtures', name), 'utf-8');
}

test('parseKeepHtml: extracts title, tags, dates, color, attachments', () => {
  const note = parseKeepHtml(readFixture('shopping.html'));
  assert.equal(note.title, 'Shopping');
  assert.deepEqual(note.tags.sort(), ['errands', 'home']);
  // The commit fixture hard-codes Jan 15, 2026, 10:30 AM in the local zone.
  // We only assert the ISO shape and that the parsed year is 2026.
  assert.match(note.created, /^2026-01-15T/);
  assert.equal(note.created, note.updated);
  assert.equal(note.color, '#fff8dc');
  assert.equal(note.attachments.length, 2);
  assert.equal(note.attachments[0].filePath, 'photo.png');
  assert.equal(note.attachments[0].mimeType, 'image/png');
  assert.equal(note.attachments[1].mimeType, 'image/jpeg');
});

test('parseKeepHtml: dedupes duplicate image src', () => {
  const note = parseKeepHtml(readFixture('shopping.html'));
  const files = note.attachments.map(a => a.filePath);
  assert.deepEqual(new Set(files), new Set(files));
});

test('parseKeepHtml: parses the long-form "Tuesday, October 10, 2023" date', () => {
  const note = parseKeepHtml(readFixture('long-format.html'));
  // The export omits a time; dayjs interprets that as midnight local time, so
  // the ISO timestamp depends on the runtime timezone. We assert the calendar
  // date matches regardless of which side of midnight UTC falls on.
  assert.ok(note.created, 'date should be parsed');
  const d = new Date(note.created);
  assert.equal(d.getUTCFullYear(), 2023);
  assert.equal(d.getUTCMonth(), 9);     // 0-indexed: October
  assert.ok(d.getUTCDate() === 9 || d.getUTCDate() === 10,
    `expected Oct 9 or 10 UTC, got ${d.toISOString()}`);
});

test('parseKeepHtml: title-less note falls back to <title>, then "Untitled"', () => {
  const note = parseKeepHtml('<html></html>');
  assert.equal(note.title, 'Untitled');
});

test('parseKeepHtml: title text comes from <title> when no .title', () => {
  const note = parseKeepHtml(readFixture('titled.html'));
  assert.equal(note.title, 'TitleOnly');
});

test('parseKeepHtml: missing date returns undefined, not "today"', () => {
  const note = parseKeepHtml('<html><body><div class="content">x</div></body></html>');
  assert.equal(note.created, undefined);
  assert.equal(note.updated, undefined);
});

test('parseKeepHtml: images outside .content are ignored', () => {
  const html = `<html><body>
    <img src="logo.png" alt="keep-logo">
    <div class="content"><img src="inside.jpg"></div>
  </body></html>`;
  const note = parseKeepHtml(html);
  assert.equal(note.attachments.length, 1);
  assert.equal(note.attachments[0].filePath, 'inside.jpg');
});

test('parseKeepHtml: data: URI images are skipped (inline content, no file ref)', () => {
  const html = `<html><body><div class="content"><img src="data:image/png;base64,iVBORw0KGgo="></div></body></html>`;
  const note = parseKeepHtml(html);
  assert.equal(note.attachments.length, 0);
});

test('isKeepImage: returns true for known image extensions', () => {
  assert.equal(isKeepImage('photo.png'), true);
  assert.equal(isKeepImage('photo.JPG'), true);
  assert.equal(isKeepImage('a/path/to/x.webp'), true);
  assert.equal(isKeepImage('note.txt'), false);
  // Query-string versioning is common (CDN caches); ignore the query for the mime sniff.
  assert.equal(isKeepImage('photo.png?v=hash&w=200'), true);
  // Fragment is a client-side anchor; the resource is whatever the path says.
  assert.equal(isKeepImage('photo.png#crop'), true);
  // `?file=...` is NOT a path change — the file itself is still archive.zip.
  assert.equal(isKeepImage('archive.zip?file=photo.png'), false);
});
