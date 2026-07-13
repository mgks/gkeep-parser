#!/usr/bin/env node
import { Command } from 'commander';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { parseKeepHtml } from './index.js';
import { KeepNote } from './types.js';

const require = createRequire(import.meta.url);
const pkg = require('../package.json');

const program = new Command();

program
  .name('gkeep-parser')
  .description(pkg.description)
  .version(pkg.version, '-v, --version')
  .helpOption('-h, --help', 'Display help');

// Resolve the path argument to either a single HTML file or a directory
// containing one. Lets the same CLI command handle both "parse one note" and
// "parse a Takeout folder" cases the README promises.
function resolveInputs(target: string): string[] {
  const stat = fs.lstatSync(target);
  if (stat.isFile()) return [target];
  if (stat.isDirectory()) {
    return fs.readdirSync(target)
      .filter(f => f.toLowerCase().endsWith('.html'))
      .map(f => path.join(target, f));
  }
  throw new Error(`Not a file or directory: ${target}`);
}

program
  .command('to-json')
  .description('Convert a Keep HTML file (or a folder of HTML files) to JSON')
  .argument('<path>', 'Path to a single .html file or a Takeout/Keep folder')
  .option('-o, --output <file>', 'Output JSON file path', 'keep-notes.json')
  .option('-p, --pretty', 'Pretty print JSON', true)
  .action((target, options) => {
    try {
      if (!fs.existsSync(target)) {
        throw new Error(`Path not found: ${target}`);
      }

      const files = resolveInputs(target);
      if (files.length === 0) {
        throw new Error('No .html files found at this path.');
      }

      console.log(`📂 Reading ${files.length} file(s) from ${target}...`);

      const notes: KeepNote[] = [];
      const skipped: string[] = [];
      for (const file of files) {
        try {
          const content = fs.readFileSync(file, 'utf-8');
          const note = parseKeepHtml(content);
          notes.push(note);
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          skipped.push(`${file}: ${msg}`);
        }
      }

      for (const s of skipped) console.warn(`⚠️  Skipped ${s}`);

      const json = options.pretty
        ? JSON.stringify(notes, null, 2)
        : JSON.stringify(notes);

      fs.writeFileSync(options.output, json);
      const tail = skipped.length === 0 ? '' : ` (${skipped.length} skipped)`;
      console.log(`✅ Saved ${notes.length} notes to ${options.output}${tail}`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`❌ Error: ${msg}`);
      process.exit(1);
    }
  });

program.addHelpText('after', `
Examples:
  $ gkeep-parser to-json ./Takeout/Keep
  $ gkeep-parser to-json ./Takeout/Keep -o my-notes.json
  $ gkeep-parser to-json ./MyNote.html -o single.json
`);

program.parse();