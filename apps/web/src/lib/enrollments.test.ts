import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { classifyCourses } from './enrollments';

const courses = [1, 2, 3, 4, 5].map((id) => ({ id }));
const ids = (list: { id: number }[]) => list.map((c) => c.id);

describe('classifyCourses', () => {
  it('produces three mutually exclusive sections that cover every course once', () => {
    const r = classifyCourses(courses, { current: [1, 2], completed: [3] });
    assert.deepEqual([ids(r.current), ids(r.previous), ids(r.other)], [[1, 2], [3], [4, 5]]);
    assert.deepEqual([...ids(r.current), ...ids(r.previous), ...ids(r.other)].sort(), [1, 2, 3, 4, 5]);
  });
  it('puts a course in only one section even if the ids overlap (current wins)', () => {
    const r = classifyCourses(courses, { current: [1], completed: [1, 2] });
    assert.deepEqual([ids(r.current), ids(r.previous)], [[1], [2]]);
  });
  it('treats an account with no enrollments as having only "other" courses', () => {
    const r = classifyCourses(courses, { current: [], completed: [] });
    assert.equal(r.other.length, 5);
  });
  it('takes no account information, so Tutor status cannot influence the result', () => {
    assert.equal(classifyCourses.length, 2);
  });
});
