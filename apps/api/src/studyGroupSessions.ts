import { getDb } from './db';
import { HttpError } from './http';
import { toStudyGroupSession } from './mappers';
import type { StudyGroupSession } from '@tunion/shared';

/** Select with the viewer's membership flag. Bind :viewer (use 0 for "nobody"). */
export const GROUP_SESSION_SELECT = `
  SELECT gs.*, g.name AS group_name, g.course_id, c.code AS course_code,
    EXISTS (SELECT 1 FROM study_group_members m WHERE m.group_id = gs.group_id AND m.user_id = :viewer) AS is_member
  FROM study_group_sessions gs
  JOIN study_groups g ON g.id = gs.group_id
  JOIN courses c ON c.id = g.course_id`;

export function loadGroupSession(id: number, viewer: number): StudyGroupSession {
  const row = getDb().prepare(`${GROUP_SESSION_SELECT} WHERE gs.id = :id`).get({ id, viewer });
  if (!row) throw new HttpError(404, 'Study group session not found');
  return toStudyGroupSession(row);
}
