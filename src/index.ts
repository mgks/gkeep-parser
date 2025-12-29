import * as cheerio from 'cheerio';
import dayjs from 'dayjs';
import { KeepNote } from './types.js';

/**
 * Parses a single Google Keep HTML string.
 */
export function parseKeepHtml(htmlContent: string): KeepNote {
  const $ = cheerio.load(htmlContent);
  
  // 1. Basic Metadata
  // Google Keep titles are often just in the body or title tag
  let title = $('.title').text().trim();
  if (!title) title = $('title').text().trim();
  if (!title) title = 'Untitled';

  const contentHtml = $('.content').html() || '';
  const textContent = $('.content').text().trim() || '';
  
  // 2. Tags/Labels
  const tags: string[] = [];
  $('.label').each((_, el) => {
    const tagText = $(el).text().trim();
    if (tagText) tags.push(tagText);
  });

  // 3. Status flags
  const isArchived = $('.archived').length > 0;
  const isPinned = $('.pinned').length > 0;
  const isTrashed = $('.trashed').length > 0;

  // 4. Dates
  // Keep HTML structure: <div class="heading"> ... <div class="date">Oct 10, 2023, 1:00 PM</div> ... </div>
  const dateStr = $('.heading').text().trim(); 
  
  // Parse date - fallback to current if parsing fails
  const created = parseDate(dateStr);
  const updated = created; // Keep doesn't distinguish nicely in HTML export

  // 5. Attachments
  const attachments: any[] = [];
  $('img').each((_, el) => {
    const src = $(el).attr('src');
    if (src) {
      attachments.push({
        filePath: src,
        mimeType: 'image/jpeg' // Default assumption
      });
    }
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
    attachments
  };
}

/**
 * Helper to parse loose date strings from Google Takeout
 */
function parseDate(dateStr: string): string {
  if (!dateStr) return new Date().toISOString();
  
  // Try DayJS standard parsing first
  const d = dayjs(dateStr);
  if (d.isValid()) return d.toISOString();

  return new Date().toISOString();
}