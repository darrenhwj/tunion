/**
 * Splits courses into three mutually exclusive groups from the enrollment ids the API returns.
 * Classification depends ONLY on enrollment status: never on Tutor badges or any other account property.
 * If an id were somehow in both lists, "current" wins, so a course can never appear twice.
 */
export function classifyCourses<T extends { id: number }>(courses: T[], myCourses: { current: number[]; completed: number[] }) {
  const result = { current: [] as T[], previous: [] as T[], other: [] as T[] };
  for (const course of courses) {
    if (myCourses.current.includes(course.id)) result.current.push(course);
    else if (myCourses.completed.includes(course.id)) result.previous.push(course);
    else result.other.push(course);
  }
  return result;
}
