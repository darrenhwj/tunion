import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Course, ListCoursesResponse } from '@tunion/shared';
import { api } from '../lib/api';
import { initialCommunity, type Community } from './data';

const storageKey = 'tunion.community.v1';
interface CommunityContext {
  courses: Course[];
  loading: boolean;
  courseError: string;
  storageError: string;
  data: Community;
  update: (change: (previous: Community) => Community) => void;
}
const Context = createContext<CommunityContext | null>(null);

export function CommunityProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<Community>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      return saved ? JSON.parse(saved) as Community : initialCommunity;
    } catch {
      return initialCommunity;
    }
  });
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [courseError, setCourseError] = useState('');
  const [storageError, setStorageError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    api<ListCoursesResponse>('/courses', { signal: controller.signal })
      .then(({ courses }) => setCourses(courses))
      .catch((error: Error) => {
        if (!controller.signal.aborted) setCourseError(error.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(data));
      setStorageError('');
    } catch {
      setStorageError('Browser storage is unavailable or full. Changes will last until the page is closed.');
    }
  }, [data]);

  return <Context.Provider value={{ courses, loading, courseError, storageError, data, update: setData }}>{children}</Context.Provider>;
}

export function useCommunity() {
  const context = useContext(Context);
  if (!context) throw new Error('CommunityProvider is missing');
  return context;
}

export function nextId(items: { id: number }[]) {
  return items.reduce((largest, item) => Math.max(largest, item.id), 0) + 1;
}
