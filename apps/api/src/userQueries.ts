/** Every user query selects through this so `isTutor` (active tutor badge) is always present. */
export const USER_SELECT = `SELECT u.*, EXISTS(SELECT 1 FROM tutors t WHERE t.user_id = u.id AND t.is_active = 1) AS is_tutor FROM users u`;
/** Visible in selectors/directories: not hidden (admins are never hidden). */
export const USER_VISIBLE = `(u.is_hidden = 0 OR u.role = 'admin')`;
