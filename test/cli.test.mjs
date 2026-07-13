// CLI smoke test: writes a synthetic Keep Takeout folder to test/tmp/, runs the
// CLI as a child process, reads the produced JSON, and asserts content.
// Tests in this file mutate the shared test/tmp/ directory, so wrap them in a
// describe() with concurrency: 1 to run them serially.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const cliJs = join(root, '..', 'dist', 'cli.js');

// Each test gets its own tmp dir under test/tmp/<random>/ so they can run in
// parallel without stepping on each other.
function freshTmp() {
  const dir = join(root, 'tmp', Math.random().toString(36).slice(2, 10));
  mkdirSync(dir, { recursive: true });
  return dir;
}

function runCli(cwd, args) {
  return spawnSync('node', [cliJs, ...args], { encoding: 'utf-8', cwd });
}

describe('cli', () => {
  test('parses a single HTML file passed as an argument', () => {
    const dir = freshTmp();
    const html = join(dir, 'note.html');
    const json = join(dir, 'note.json');
    writeFileSync(html, `<html><body>
      <div class="title">Single</div>
      <div class="heading"><span class="date">Feb 1, 2026, 12:00 PM</span></div>
      <div class="content">hi <img src="a.png"/></div>
      <span class="label">x</span>
    </body></html>`);

    const r = runCli(dir, ['to-json', html, '-o', json]);
    assert.equal(r.status, 0, `cli failed: ${r.stderr}`);
    const out = JSON.parse(readFileSync(json, 'utf-8'));
    assert.equal(out.length, 1);
    assert.equal(out[0].title, 'Single');
    assert.deepEqual(out[0].tags, ['x']);
    assert.ok(out[0].created);
    // Use noon to avoid the local-midnight rolls-back-a-day UTC interpretation.
    const d = new Date(out[0].created);
    assert.equal(d.getUTCFullYear(), 2026);
    assert.equal(d.getUTCMonth(), 1);
    assert.equal(out[0].attachments[0].mimeType, 'image/png');
  });

  test('parses a directory of HTML files', () => {
    const dir = freshTmp();
    const subdir = join(dir, 'Takeout');
    mkdirSync(subdir, { recursive: true });
    for (const name of ['a.html', 'b.html']) {
      writeFileSync(
        join(subdir, name),
        `<html><body><div class="title">${name}</div><div class="content">x</div></body></html>`
      );
    }
    const json = join(dir, 'all.json');
    const r = runCli(dir, ['to-json', subdir, '-o', json]);
    assert.equal(r.status, 0, `cli failed: ${r.stderr}`);
    const out = JSON.parse(readFileSync(json, 'utf-8'));
    assert.equal(out.length, 2);
    const titles = out.map(n => n.title).sort();
    assert.deepEqual(titles, ['a.html', 'b.html']);
  });

  test('per-file errors are logged to stderr but do not fail the run', () => {
    const dir = freshTmp();
    const subdir = join(dir, 'Takeout');
    mkdirSync(subdir, { recursive: true });
    writeFileSync(join(subdir, 'good.html'), `<html><body><div class="content">x</div></body></html>`);
    writeFileSync(join(subdir, 'bad.html'), '<html><body><broken');
    const json = join(dir, 'all.json');
    const r = runCli(dir, ['to-json', subdir, '-o', json]);
    assert.equal(r.status, 0, `cli failed: ${r.stderr}`);
    const out = JSON.parse(readFileSync(json, 'utf-8'));
    assert.equal(out.length, 2);
  });

  test('missing path exits non-zero with a clear error', () => {
    const dir = freshTmp();
    const r = runCli(dir, ['to-json', join(dir, 'does-not-exist')]);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /not found|not a directory|no such/i);
  });
});
