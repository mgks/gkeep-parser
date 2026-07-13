import * as cheerio from 'cheerio';
import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat.js';
import { KeepNote, KeepAttachment } from './types.js';

dayjs.extend(customParseFormat);

// Image MIME map. The format-detection rule for `.ext`:
const IMAGE_MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.svg': 'image/svg+xml',
  '.avif': 'image/avif',
  '.heic': 'image/heic',
  '.heif': 'image/heic'
};

// Google Keep exports use a handful of distinct date formats depending on
// browser locale and account age. Try each with strict parsing first; fall
// through to lenient parse at the end.
const KEEP_DATE_FORMATS = [
  'MMM D, YYYY, h:mm:ss A',
  'MMM D, YYYY, h:mm A',
  'MMM D, YYYY',
  'MMMM D, YYYY, h:mm:ss A',
  'MMMM D, YYYY, h:mm A',
  'MMMM D, YYYY',
  'dddd, MMMM D, YYYY',
  'YYYY-MM-DDTHH:mm:ss.SSSZ',
  'YYYY-MM-DDTHH:mm:ssZ'
];

// Drop query string and hash so the extension lookup ignores ?key= and #frag.
// Pure-string so it works in browser bundle without node:path.
function stripQueryAndHash(filePath: string): string {
  const q = filePath.indexOf('?');
  const h = filePath.indexOf('#');
  let end = filePath.length;
  if (q !== -1) end = Math.min(end, q);
  if (h !== -1) end = Math.min(end, h);
  return filePath.slice(0, end);
}

// Pick a mime for a file path by extension. Falls back to image/jpeg,
// matching the historical default that downstream consumers rely on.
function mimeFor(filePath: string): string {
  const clean = stripQueryAndHash(filePath);
  const dot = clean.lastIndexOf('.');
  const slash = clean.lastIndexOf('/');
  if (dot === -1 || dot < slash) return 'image/jpeg';
  const ext = clean.slice(dot).toLowerCase();
  return IMAGE_MIME[ext] || 'image/jpeg';
}

// Strictly parse a Keep-export date string. Returns the ISO string or null
// (no silent substitution).
function parseDate(input: string): string | undefined {
  if (!input) return undefined;
  const trimmed = input.trim();
  if (!trimmed) return undefined;
  for (const format of KEEP_DATE_FORMATS) {
    const d = dayjs(trimmed, format, true);
    if (d.isValid()) return d.toISOString();
  }
  // Final fallback: lenient parse.
  const lenient = dayjs(trimmed);
  return lenient.isValid() ? lenient.toISOString() : undefined;
}

// Tiny extname that doesn't import node:path so the dep stays browser-safe.
function extOf(filePath: string): string {
  const clean = stripQueryAndHash(filePath);
  const dot = clean.lastIndexOf('.');
  const slash = clean.lastIndexOf('/');
  if (dot === -1 || dot < slash) return '';
  return clean.slice(dot).toLowerCase();
}

const isImageExt = (ext: string): boolean => ext in IMAGE_MIME;

// Parse a Google Keep HTML export. Returns the structured KeepNote
// representation that NotesMigrator and other consumers normalise to.
export function parseKeepHtml(htmlContent: string): KeepNote {
  const $ = cheerio.load(htmlContent);

  // 1. Title. Keep writes the title into a <div class="title"> or falls back
  // to <title> when there's no body title.
  let title = $('.title').first().text().trim();
  if (!title) title = $('title').text().trim();
  if (!title) title = 'Untitled';

  // 2. Content + plain text. The body sits in <div class="content">.
  const contentRoot = $('.content').first();
  const contentHtml = contentRoot.html() || '';
  const textContent = contentRoot.text().trim();

  // 3. Tags / labels.
  const tags: string[] = [];
  $('.label').each((_, el) => {
    const t = $(el).text().trim();
    if (t && !tags.includes(t)) tags.push(t);
  });

  // 4. Status flags. The HTML body class is the most reliable indicator;
  // legacy exports sometimes use a parent <div class="archived"> etc.
  const isArchived = $('.archived').length > 0 || $('body.archived').length > 0;
  const isPinned = $('.pinned').length > 0 || $('body.pinned').length > 0;
  const isTrashed = $('.trashed').length > 0 || $('body.trashed').length > 0;

  // 5. Date. Limit the search to inside `.heading` because loose `.date`
  // matching on the document tree picks up unrelated labels in some exports.
  let dateText =
    $('.heading .date').first().text().trim() ||
    $('.heading [class*="date"]').first().text().trim() ||
    $('.date').first().text().trim();
  if (!dateText) dateText = $('.heading').first().text().trim();

  const created = parseDate(dateText);
  // Keep HTML doesn't separate edited from created; use the same value as a
  // best-effort default. Consumers should fall back to file mtime when they
  // need a precise "updated" timestamp.
  const updated = created;

  // 6. Color swatch. Keep renders the chosen note background as a coloured
  // container; pull the hex/rgb from the inline style.
  let color: string | undefined;
  const swatch = $('.color-container, [class*="color-"]').first();
  if (swatch.length > 0) {
    const style = (swatch.attr('style') || '').toLowerCase();
    const m =
      /background-color\s*:\s*(#[0-9a-f]{3,8}|rgba?\([^)]+\)|[a-z]+)/.exec(style);
    if (m) color = m[1];
  }
  if (!color) {
    // Some exports nest the colour on the body element.
    const bodyStyle = ($('body').attr('style') || '').toLowerCase();
    const bm =
      /background-color\s*:\s*(#[0-9a-f]{3,8}|rgba?\([^)]+\)|[a-z]+)/.exec(bodyStyle);
    if (bm) color = bm[1];
  }

  // 7. Attachments. Only inside `.content` (the previous version matched
  // every <img> on the page, which pulled in the Keep UI logo). The
  // <img> keeps its original Keep file path; mime is sniffed from the
  // extension and deduped.
  const seen = new Set<string>();
  const attachments: KeepAttachment[] = [];
  contentRoot.find('img').each((_, el) => {
    const src = $(el).attr('src');
    if (!src || src.startsWith('data:')) return;
    if (seen.has(src)) return;
    seen.add(src);
    attachments.push({ filePath: src, mimeType: mimeFor(src) });
  });

  return {
    title,
    content: contentHtml,
    textContent,
    tags,
    created,
    updated,
    isArchived,
    isPinned,
    isTrashed,
    color,
    attachments
  };
}

// Parse Google Keep's native JSON export. Mirrors the proven logic from
// NotesMigrator/src/lib/keep.js parseKeepJson so library consumers don't have
// to reimplement it.
export function parseKeepJson(content: string): KeepNote {
  const data = JSON.parse(content);

  // Checklist vs text. Render checkboxes as HTML inputs; render text as
  // escaped paragraphs with newline -> <br/>. Both forms pass into the same
  // downstream ENEX / Markdown normalisers.
  let htmlContent = '';
  if (Array.isArray(data.listContent)) {
    htmlContent = '<ul>';
    for (const item of data.listContent) {
      const checkedAttr = item && item.isChecked ? ' checked="true"' : '';
      const text =
        item && item.text != null
          ? String(item.text)
              .replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;')
          : '';
      htmlContent += `<li><input type="checkbox"${checkedAttr}/> ${text}</li>`;
    }
    htmlContent += '</ul>';
  } else if (data.textContent) {
    htmlContent = String(data.textContent)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\n/g, '<br/>');
  }

  const tags: string[] = [];
  if (Array.isArray(data.labels)) {
    for (const l of data.labels) {
      if (l && l.name) {
        const name = String(l.name);
        if (!tags.includes(name)) tags.push(name);
      }
    }
  }

  const attachments: KeepAttachment[] = [];
  if (Array.isArray(data.attachments)) {
    for (const att of data.attachments) {
      if (!att) continue;
      const filePath = (att.filePath || att.filepath || '').toString();
      if (!filePath) continue;
      attachments.push({
        filePath,
        mimeType: att.mimetype ? String(att.mimetype) : mimeFor(filePath)
      });
    }
  }

  // Keep timestamps come as microseconds since epoch.
  function isoFromUsec(usec: unknown): string | undefined {
    const n = Number(usec);
    if (!Number.isFinite(n) || n <= 0) return undefined;
    const ms = Math.floor(n / 1000);
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
  }

  return {
    title: data.title == null ? '' : String(data.title),
    content: htmlContent,
    textContent: data.textContent ? String(data.textContent) : '',
    tags,
    created: isoFromUsec(data.createdTimestampUsec),
    updated: isoFromUsec(data.userEditedTimestampUsec),
    isArchived: !!data.isArchived,
    isPinned: !!data.isPinned,
    isTrashed: !!data.isTrashed,
    color: data.color ? String(data.color) : undefined,
    attachments
  };
}

// Tiny helper: returns true when the file path looks like a supported image.
export function isKeepImage(filePath: string): boolean {
  return isImageExt(extOf(filePath));
}
