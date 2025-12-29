export interface KeepNote {
  title: string;
  content: string; // HTML content
  textContent: string; // Plain text
  tags: string[];
  created: string; // ISO Date
  updated: string; // ISO Date
  isArchived: boolean;
  isPinned: boolean;
  isTrashed: boolean;
  color?: string;
  attachments: KeepAttachment[];
}

export interface KeepAttachment {
  filePath: string;
  mimeType: string;
}