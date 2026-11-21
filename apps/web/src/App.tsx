import { Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import { CommunityProvider } from './demo/community';
import { CoursePage, CoursePeople, CoursesPage } from './pages/CoursesPage';
import { DiscussionPage, DiscussionsPage, NewDiscussionPage } from './pages/DiscussionsPage';
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
        <Route path="tutoring/:tutorId" element={<TutorPage />} />
        <Route path="groups" element={<GroupsPage />} />
        <Route path="people" element={<PeoplePage />} />
        <Route path="people/:userId" element={<ProfilePage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  </CommunityProvider>;
}
