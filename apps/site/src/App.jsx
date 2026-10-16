import { Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "./Layout.jsx";
import {
  AboutPage,
  ArchivePage,
  ArticlesPage,
  AskRavPage,
  BiosPage,
  CurrentPage,
  HomePage,
  IssuePage,
  MaterialPage,
  RedirectHome,
  SearchPage,
} from "./pages.jsx";

export function App() {
  return (
    <Routes>
      <Route path="/" element={<RedirectHome />} />
      <Route path="/:lang" element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route path="current" element={<CurrentPage />} />
        <Route path="archive" element={<ArchivePage />} />
        <Route path="articles" element={<ArticlesPage />} />
        <Route path="ask-rav" element={<AskRavPage />} />
        <Route path="biographies" element={<BiosPage />} />
        <Route path="about" element={<AboutPage />} />
        <Route path="search" element={<SearchPage />} />
        <Route path="issue/:year/:slug" element={<IssuePage />} />
        <Route path="article/:slug" element={<MaterialPage kind="article" />} />
        <Route path="answer/:slug" element={<MaterialPage kind="answer" />} />
        <Route path="biography/:slug" element={<MaterialPage kind="bio" />} />
        <Route path="*" element={<Navigate to="." replace />} />
      </Route>
    </Routes>
  );
}
