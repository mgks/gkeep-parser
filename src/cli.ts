#!/usr/bin/env node
import { Command } from 'commander';
import fs from 'fs';
import path from 'path';
import { createRequire } from 'node:module';
import { parseKeepHtml } from './index.js';
import { KeepNote } from './types.js';

// 1. Clean Metadata Loading
const require = createRequire(import.meta.url);
const pkg = require('../package.json');

const program = new Command();

program
  .name('gkeep-parser')
  .description(pkg.description)
  .version(pkg.version, '-v, --version')
  .helpOption('-h, --help', 'Display help');

program
  .command('to-json')
  .description('Convert a directory of Google Keep HTML files to a JSON file')
  .argument('<directory>', 'Path to "Takeout/Keep" folder')
  .option('-o, --output <file>', 'Output JSON file path', 'keep-notes.json')
  .option('-p, --pretty', 'Pretty print JSON', true)
  .action((dir, options) => {
    try {
      if (!fs.existsSync(dir) || !fs.lstatSync(dir).isDirectory()) {
        throw new Error(`Directory not found: ${dir}`);
      }

      console.log(`📂 Reading files from ${dir}...`);
      
      // Filter for HTML files only
      const files = fs.readdirSync(dir).filter(f => f.toLowerCase().endsWith('.html'));
      
      if (files.length === 0) {
        throw new Error("No HTML files found in this directory.");
      }

      console.log(`⏳ Parsing ${files.length} notes...`);
      const notes: KeepNote[] = [];

      for (const file of files) {
        try {
          const content = fs.readFileSync(path.join(dir, file), 'utf-8');
          const note = parseKeepHtml(content);
          if (note) notes.push(note);
        } catch (e) {
          // Skip individual corrupt files but continue
        }
      }

      const json = options.pretty 
        ? JSON.stringify(notes, null, 2) 
        : JSON.stringify(notes);

      fs.writeFileSync(options.output, json);
      console.log(`✅ Success! Saved ${notes.length} notes to ${options.output}`);

    } catch (e: any) {
      console.error(`❌ Error: ${e.message}`);
      process.exit(1);
    }
  });

program.addHelpText('after', `
Examples:
  $ gkeep-parser to-json ./Takeout/Keep
  $ gkeep-parser to-json ./Takeout/Keep -o my-notes.json
`);

program.parse();