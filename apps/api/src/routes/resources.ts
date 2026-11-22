import { Router } from 'express';
import type { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import type {
  CreateResourceResponse, GetResourceResponse, ListResourcesResponse, ResourceType,
} from '@tunion/shared';
import { RESOURCE_UPLOAD_LIMITS } from '@tunion/shared';
import { getDb } from '../db';
import { toResourceSummary } from '../mappers';
import {
  HttpError, bodyObject, likePattern, optionalDemoUser, parseId, queryInt, queryString, requireDemoUser, str,
} from '../http';
import { RESOURCE_VOTE, addVote, removeVote } from '../votes';
import { UPLOAD_DIR, cleanFilename, contentDisposition, removeStoredFile, storeFile, validateUpload } from '../uploads';

export const resourcesRouter = Router();
resourcesRouter.use(optionalDemoUser);

const TYPES: ResourceType[] = ['notes', 'link', 'cheatsheet', 'practice', 'other'];

const RESOURCE_SELECT = `
  SELECT r.*, c.code AS course_code, u.name AS author_name, u.role AS author_role,
    (SELECT COUNT(*) FROM resource_votes v WHERE v.resource_id = r.id) AS upvote_count,
    EXISTS (SELECT 1 FROM resource_votes v WHERE v.resource_id = r.id AND v.user_id = :viewer) AS has_upvoted
  FROM resources r JOIN courses c ON c.id = r.course_id JOIN users u ON u.id = r.author_id`;

function loadResource(id: number, viewer: number) {
  const row = getDb().prepare(`${RESOURCE_SELECT} WHERE r.id = :id`).get({ id, viewer });
  if (!row) throw new HttpError(404, 'Resource not found');
  return row;
}

// GET /api/resources?courseId=&q=&type=&sort=&limit=&offset=
resourcesRouter.get('/', (req, res) => {
  const where: string[] = [];
  const params: Record<string, string | number> = { viewer: req.demoUser?.id ?? 0 };
  if (req.query.courseId !== undefined) {
    where.push('r.course_id = :courseId');
    params.courseId = parseId(req.query.courseId, 'courseId');
  }
  const q = queryString(req.query.q, 'q');
  if (q) {
    where.push("(r.title LIKE :q ESCAPE '\\' OR r.description LIKE :q ESCAPE '\\')");
    params.q = likePattern(q);
  }
  const type = queryString(req.query.type, 'type', 20);
  if (type !== undefined) {
    if (!TYPES.includes(type as ResourceType)) throw new HttpError(400, `type must be one of ${TYPES.join(', ')}`);
    where.push('r.type = :type');
    params.type = type;
  }
  const sort = queryString(req.query.sort, 'sort', 10) ?? 'recent';
  if (sort !== 'recent' && sort !== 'top') throw new HttpError(400, "sort must be 'recent' or 'top'");
  params.limit = queryInt(req.query.limit, 'limit', 1, 100, 50);
  params.offset = queryInt(req.query.offset, 'offset', 0, 1_000_000, 0);
  const order = sort === 'top' ? 'upvote_count DESC, r.created_at DESC, r.id DESC' : 'r.created_at DESC, r.id DESC';
  const sql = `${RESOURCE_SELECT} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY ${order} LIMIT :limit OFFSET :offset`;
  res.json({ resources: getDb().prepare(sql).all(params).map(toResourceSummary) } satisfies ListResourcesResponse);
});

// ---- create (JSON link, or multipart upload) ----

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: RESOURCE_UPLOAD_LIMITS.maxBytes, files: 1, fields: 10, parts: 12 },
}).single('file');

/** Runs multer only for multipart requests; JSON bodies are already parsed by express.json. */
function parseMultipart(req: Request, res: Response, next: NextFunction) {
  if (req.is('multipart/form-data')) return upload(req, res, next);
  next();
}

function parseHttpUrl(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length > 2000) throw new HttpError(400, 'url must be an http(s) link of at most 2000 characters');
  try {
    const u = new URL(value.trim());
    if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('scheme');
    return u.toString();
  } catch {
    throw new HttpError(400, 'url must be a valid http or https link');
  }
}

resourcesRouter.post('/', requireDemoUser, parseMultipart, (req, res) => {
  const body = bodyObject(req.body ?? {});
  const courseId = parseId(body.courseId, 'courseId');
  const title = str(body, 'title', 3, 200);
  const description = body.description === undefined || body.description === '' ? '' : str(body, 'description', 0, 2000);
  if (typeof body.type !== 'string' || !TYPES.includes(body.type as ResourceType)) throw new HttpError(400, `type must be one of ${TYPES.join(', ')}`);
  const file = req.file;
  const hasUrl = body.url !== undefined && body.url !== '';
  if (file && hasUrl) throw new HttpError(400, 'Provide either a file or a url, not both');
  if (!file && !hasUrl) throw new HttpError(400, 'Provide a file upload or an http(s) url');
  const url = hasUrl ? parseHttpUrl(body.url) : null;

  const db = getDb();
  if (!db.prepare('SELECT 1 FROM courses WHERE id = ?').get(courseId)) throw new HttpError(404, 'Course not found');

  let stored: { name: string; original: string; mime: string; size: number } | null = null;
  if (file) {
    const original = cleanFilename(Buffer.from(file.originalname, 'latin1').toString('utf8'));
    const checked = validateUpload(original, file.buffer);
    if (!checked.ok) throw new HttpError(415, checked.reason);
    stored = { name: storeFile(file.buffer, checked.ext), original, mime: checked.mime, size: file.size };
  }
  try {
    const { lastInsertRowid } = db
      .prepare(
        `INSERT INTO resources (course_id, author_id, title, description, type, url, created_at, stored_name, original_filename, mime_type, size_bytes)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(courseId, req.demoUser!.id, title, description, body.type, url, new Date().toISOString(),
        stored?.name ?? null, stored?.original ?? null, stored?.mime ?? null, stored?.size ?? null);
    const row = loadResource(Number(lastInsertRowid), req.demoUser!.id);
    res.status(201).json({ resource: toResourceSummary(row) } satisfies CreateResourceResponse);
  } catch (err) {
    if (stored) removeStoredFile(stored.name); // don't leave an orphan file behind
    throw err;
  }
});

// ---- read / votes / file access ----

resourcesRouter.get('/:id', (req, res) => {
  const row = loadResource(parseId(req.params.id, 'resource id'), req.demoUser?.id ?? 0);
  res.json({ resource: toResourceSummary(row) } satisfies GetResourceResponse);
});

resourcesRouter.post('/:id/upvote', requireDemoUser, addVote(RESOURCE_VOTE, 'resource'));
resourcesRouter.delete('/:id/upvote', requireDemoUser, removeVote(RESOURCE_VOTE, 'resource'));

/** Streams an uploaded file for download (attachment) or preview (inline). Requires a demo user. */
function serveFile(mode: 'attachment' | 'inline') {
  return (req: Request, res: Response, next: NextFunction) => {
    const resource = toResourceSummary(loadResource(parseId(req.params.id, 'resource id'), req.demoUser!.id));
    if (!resource.file) throw new HttpError(404, 'This resource is a link and has no uploaded file');
    if (mode === 'inline' && !resource.file.previewable) throw new HttpError(415, 'This file type cannot be previewed; use download');
    const stored = (getDb().prepare('SELECT stored_name FROM resources WHERE id = ?').get(resource.id) as { stored_name: string }).stored_name;
    if (!/^[A-Za-z0-9._-]+$/.test(stored)) throw new HttpError(404, 'File not found');
    res.setHeader('Content-Type', resource.file.mimeType);
    res.setHeader('Content-Disposition', contentDisposition(mode, resource.file.filename));
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, max-age=0, must-revalidate');
    res.sendFile(stored, { root: UPLOAD_DIR, dotfiles: 'deny', cacheControl: false }, (err) => {
      if (!err) return;
      next(res.headersSent ? err : new HttpError(404, 'The file is missing from storage'));
    });
  };
}

resourcesRouter.get('/:id/download', requireDemoUser, serveFile('attachment'));
resourcesRouter.get('/:id/preview', requireDemoUser, serveFile('inline'));
