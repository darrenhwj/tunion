import { randomUUID } from 'node:crypto';
import { mkdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { DB_PATH } from './db';
import { RESOURCE_UPLOAD_LIMITS } from '@tunion/shared';

/** Uploaded files live next to the SQLite file (apps/api/data/uploads by default). Gitignored; never committed. */
export const UPLOAD_DIR = join(dirname(DB_PATH), 'uploads');

interface FileKind {
  mime: string;
  /** Returns true if the bytes really look like this kind of file. */
  matches: (b: Buffer) => boolean;
}

const startsWith = (b: Buffer, sig: number[]) => b.length >= sig.length && sig.every((v, i) => b[i] === v);
const ascii = (b: Buffer, from: number, to: number) => b.subarray(from, to).toString('latin1');

function looksLikeText(b: Buffer): boolean {
  const head = b.subarray(0, 8192);
  if (head.includes(0)) return false;
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(head.length < b.length ? b.subarray(0, 8192 - 3) : head);
    return true;
  } catch {
    return false;
  }
}

const PNG: FileKind = { mime: 'image/png', matches: (b) => startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) };
const JPEG: FileKind = { mime: 'image/jpeg', matches: (b) => startsWith(b, [0xff, 0xd8, 0xff]) };

/** Allowed extensions and the content each must really contain. SVG/HTML are deliberately excluded (script risk). */
const KINDS: Record<string, FileKind> = {
  pdf: { mime: 'application/pdf', matches: (b) => ascii(b, 0, 5) === '%PDF-' },
  png: PNG,
  jpg: JPEG,
  jpeg: JPEG,
  gif: { mime: 'image/gif', matches: (b) => ['GIF87a', 'GIF89a'].includes(ascii(b, 0, 6)) },
  webp: { mime: 'image/webp', matches: (b) => ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 12) === 'WEBP' },
  txt: { mime: 'text/plain; charset=utf-8', matches: looksLikeText },
  md: { mime: 'text/markdown; charset=utf-8', matches: looksLikeText },
};

const PREVIEWABLE_MIMES = new Set(
  RESOURCE_UPLOAD_LIMITS.previewableExtensions.map((ext) => KINDS[ext].mime),
);
export const isPreviewable = (mime: string) => PREVIEWABLE_MIMES.has(mime);

export function extensionOf(filename: string): string {
  const m = /\.([A-Za-z0-9]{1,5})$/.exec(filename);
  return m ? m[1].toLowerCase() : '';
}

/** Display-safe original filename: no path parts or control characters, bounded length. */
export function cleanFilename(name: string): string {
  // eslint-disable-next-line no-control-regex
  const cleaned = basename(name.replace(/\\/g, '/')).replace(/[\u0000-\u001f\u007f"]/g, '').trim();
  return (cleaned || 'file').slice(-150);
}

/** Checks extension against the allow-list and the bytes against the matching signature. Returns the canonical MIME type. */
export function validateUpload(filename: string, data: Buffer): { ok: true; mime: string; ext: string } | { ok: false; reason: string } {
  const ext = extensionOf(filename);
  const kind = KINDS[ext];
  if (!kind) return { ok: false, reason: `File type not allowed. Allowed: ${RESOURCE_UPLOAD_LIMITS.extensions.join(', ')}` };
  if (data.length === 0) return { ok: false, reason: 'File is empty' };
  if (!kind.matches(data)) return { ok: false, reason: `File content does not match its .${ext} extension` };
  return { ok: true, mime: kind.mime, ext };
}

/** Writes bytes under a server-generated name (never derived from user input) and returns that name. */
export function storeFile(data: Buffer, ext: string): string {
  mkdirSync(UPLOAD_DIR, { recursive: true });
  const storedName = `${randomUUID()}.${ext}`;
  writeFileSync(join(UPLOAD_DIR, storedName), data, { flag: 'wx' });
  return storedName;
}

export function removeStoredFile(storedName: string): void {
  try {
    unlinkSync(join(UPLOAD_DIR, storedName));
  } catch {
    /* already gone */
  }
}

/** Content-Disposition value with an ASCII fallback and an RFC 5987 UTF-8 name. */
export function contentDisposition(kind: 'attachment' | 'inline', filename: string): string {
  const fallback = filename.replace(/[^\x20-\x7e]/g, '_').replace(/[%\\]/g, '_');
  return `${kind}; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}
