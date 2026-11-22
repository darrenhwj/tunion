import { Route, Routes } from 'react-router-dom';
import AvailabilityPage from './pages/AvailabilityPage';
import StudyGroupPage from './pages/StudyGroupPage';
import { TutoringSessionPage } from './pages/TutoringActivity';
import ProtectedRoute, { MyProfileRoute } from './components/ProtectedRoute';
import Layout from './components/Layout';
import { CommunityProvider } from './demo/community';
import { CoursePage, CoursePeople, CoursesPage } from './pages/CoursesPage';
import DiscussionPage from './pages/DiscussionPage';
import { DiscussionsPage, NewDiscussionPage } from './pages/DiscussionsPage';
import { OneTimeSessionPage } from './pages/OneTimeSessions';
import GroupsPage from './pages/GroupsPage';
import HomePage from './pages/HomePage';
import NotFoundPage from './pages/NotFoundPage';
import { PeoplePage, ProfilePage } from './pages/PeoplePage';
import ResourcesPage from './pages/ResourcesPage';
import { TutorPage, TutoringPage } from './pages/TutoringPage';

export default function App() {
  return <CommunityProvider>
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route element={<ProtectedRoute />}>
          <Route path="my-profile" element={<MyProfileRoute />} />
          <Route path="courses" element={<CoursesPage />} />
          <Route path="courses/:courseId" element={<CoursePage />}>
            <Route index element={<DiscussionsPage />} />
            <Route path="resources" element={<ResourcesPage />} />
            <Route path="people" element={<CoursePeople />} />
          </Route>
          <Route path="discussions" element={<DiscussionsPage />} />
          <Route path="discussions/new" element={<NewDiscussionPage />} />
          <Route path="discussions/:discussionId" element={<DiscussionPage />} />
          <Route path="resources" element={<ResourcesPage />} />
          <Route path="tutoring" element={<TutoringPage />} />
          <Route path="tutoring/availability" element={<AvailabilityPage />} />
          <Route path="tutoring/sessions/:sessionId" element={<TutoringSessionPage />} />
          <Route path="tutoring/:tutorId" element={<TutorPage />} />
          <Route path="groups" element={<GroupsPage />} />
          <Route path="groups/one-time/:sessionId" element={<OneTimeSessionPage />} />
          <Route path="groups/:groupId" element={<StudyGroupPage />} />
          <Route path="people" element={<PeoplePage />} />
          <Route path="people/:userId" element={<ProfilePage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Route>
    </Routes>
  </CommunityProvider>;
}
