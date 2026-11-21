import type { Course, User, UserRole } from '@tunion/shared';

type Row = Record<string, unknown>;

export function toUser(r: Row): User {
  return {
    id: r.id as number,
    name: r.name as string,
    email: r.email as string,
    role: r.role as UserRole,
    major: r.major as string,
    year: r.year as number,
    bio: r.bio as string,
    createdAt: r.created_at as string,
  };
}

export function toCourse(r: Row): Course {
  return {
    id: r.id as number,
    code: r.code as string,
    title: r.title as string,
    description: r.description as string,
    level: r.level as Course['level'],
    createdAt: r.created_at as string,
  };
}
