# gkeep-parser

**Parse Google Keep Takeout exports (HTML / ._keep) into structured JSON.**

<p>
  <img src="https://img.shields.io/npm/v/gkeep-parser.svg?style=flat-square&color=d25353" alt="npm version">
  <img src="https://img.shields.io/bundlephobia/minzip/gkeep-parser?style=flat-square&color=38bd24" alt="size">
  <img src="https://img.shields.io/npm/dt/gkeep-parser.svg?style=flat-square&color=38bd24" alt="npm downloads">
  <img src="https://img.shields.io/github/license/mgks/gkeep-parser.svg?style=flat-square&color=blue" alt="license">
</p>

A lightweight Node.js library and CLI tool that turns the messy HTML files from a Google Takeout export into clean, structured JSON — ready for import into Apple Notes, Evernote, Obsidian, or any other note-taking tool.

## What's New in v0.2.0

*   **Accurate date extraction:** The parser now targets `.heading .date` and `.date` CSS classes specifically, avoiding false positives from surrounding heading text.
*   **Explicit parse failure signal:** `created` and `updated` are now `undefined` when the date cannot be parsed (instead of silently defaulting to today). Consumer apps can detect this and fall back to the file's own last-modified timestamp, so notes always get a meaningful date.
*   **`._keep` file support:** Recognises both `.html` and `._keep` extensions from Takeout exports.

## Installation

```bash
# Install globally for CLI
npm install -g gkeep-parser

# Install as a project dependency
npm install gkeep-parser
```

## Usage

### CLI

```bash
# Parse a single HTML file
gkeep-parser to-json "My Note.html"

# Parse an entire Keep Takeout folder
gkeep-parser to-json ./Takeout/Keep -o notes.json
```

### API

```javascript
import { parseKeepHtml } from 'gkeep-parser';
import fs from 'fs';

const html = fs.readFileSync('My Note.html', 'utf-8');
const note = parseKeepHtml(html);

console.log(note.title);
console.log(note.tags);        // ['Personal', 'Ideas']
console.log(note.created);     // ISO 8601 string, or undefined if not found
console.log(note.attachments); // [{ filePath: '...', mimeType: '...' }]
```

### Handling Missing Dates

Because `created` / `updated` can be `undefined`, always apply a fallback in your own code:

```javascript
const note = parseKeepHtml(html);
const fileDate = new Date(file.lastModified).toISOString();

note.created = note.created ?? fileDate;
note.updated = note.updated ?? fileDate;
```

### Output Format

```typescript
interface KeepNote {
  title: string;
  content: string;        // HTML content
  textContent: string;    // Plain text
  tags: string[];
  created?: string;       // ISO 8601, undefined when not parseable
  updated?: string;       // ISO 8601, undefined when not parseable
  isArchived: boolean;
  isPinned: boolean;
  isTrashed: boolean;
  attachments: { filePath: string; mimeType: string; }[];
}
```

## License

MIT

> **{ github.com/mgks }**
> 
> ![Website Badge](https://img.shields.io/badge/Visit-mgks.dev-blue?style=flat&link=https%3A%2F%2Fmgks.dev) ![Sponsor Badge](https://img.shields.io/badge/%20%20Become%20a%20Sponsor%20%20-red?style=flat&logo=github&link=https%3A%2F%2Fgithub.com%2Fsponsors%2Fmgks)
