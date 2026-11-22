import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Course, ListCoursesResponse, ListEnrollmentsResponse, SetEnrollmentResponse, EnrollmentStatus } from '@tunion/shared';
import { useDemoAuth } from '../lib/demoAuth';
import { api } from '../lib/api';
import { initialCommunity, type Community } from './data';

const storageKey = 'tunion.community.v1';
interface CommunityContext {
  courses: Course[];
  loading: boolean;
  courseError: string;
  storageError: string;
  /** The signed-in user's enrollments, read from the database (not browser storage). */
  myCourses: { current: number[]; completed: number[] };
  setEnrollment: (courseId: number, status: EnrollmentStatus) => Promise<void>;
  data: Community;
  update: (change: (previous: Community) => Community) => void;
}
const Context = createContext<CommunityContext | null>(null);

export function CommunityProvider({ children }: { children: ReactNode }) {
  const { current } = useDemoAuth();
  const signedIn = !!current;
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
  const [enrollments, setEnrollments] = useState<ListEnrollmentsResponse['enrollments']>([]);

  useEffect(() => {
    if (!signedIn) return;
    setLoading(true);
    setCourseError('');
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
  }, [signedIn]);

  useEffect(() => {
    setEnrollments([]);
    if (!current) return;
    const controller = new AbortController();
    api<ListEnrollmentsResponse>('/users/' + current.id + '/enrollments', { signal: controller.signal })
      .then((r) => setEnrollments(r.enrollments))
      .catch(() => undefined);
    return () => controller.abort();
  }, [current?.id]);

  const myCourses = {
    current: enrollments.filter((e) => e.status === 'current').map((e) => e.courseId),
    completed: enrollments.filter((e) => e.status === 'completed').map((e) => e.courseId),
  };
  async function setEnrollment(courseId: number, status: EnrollmentStatus) {
    const { enrollment } = await api<SetEnrollmentResponse>(`/courses/${courseId}/enrollment`, {
      method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status }),
    });
    setEnrollments((previous) => [...previous.filter((e) => e.courseId !== courseId), enrollment]);
  }

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(data));
      setStorageError('');
    } catch {
      setStorageError('Browser storage is unavailable or full. Changes will last until the page is closed.');
    }
  }, [data]);

  return <Context.Provider value={{ courses, loading, courseError, storageError, myCourses, setEnrollment, data, update: setData }}>{children}</Context.Provider>;
}

export function useCommunity() {
  const context = useContext(Context);
  if (!context) throw new Error('CommunityProvider is missing');
  return context;
}

export function nextId(items: { id: number }[]) {
  return items.reduce((largest, item) => Math.max(largest, item.id), 0) + 1;
}
