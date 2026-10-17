import { Navigate, Route, Routes, useParams } from "react-router-dom";
import { LANGS } from "@jeschurun/shared";
import { PUBLIC_BIOS } from "./features.js";
import { Layout } from "./Layout.jsx";
import {
  AboutPage,
  ArchivePage,
  ArticlesPage,
  AskRavPage,
  BiosPage,
  HomePage,
  IssuePage,
  MaterialPage,
  RedirectHome,
  SearchPage,
} from "./pages.jsx";

/** Client redirect to /:lang/ (same pattern as former /current). */
function RedirectLangHome() {
  const { lang: raw } = useParams();
  const lang = LANGS.includes(raw) ? raw : "en";
  return <Navigate to={`/${lang}/`} replace />;
}

export function App() {
  return (
    <Routes>
      <Route path="/" element={<RedirectHome />} />
      <Route path="/:lang" element={<Layout />}>
        <Route index element={<HomePage />} />
        {/* /current removed permanently — old URLs go home */}
        <Route path="current" element={<Navigate to=".." replace />} />
        <Route path="archive" element={<ArchivePage />} />
        <Route path="articles" element={<ArticlesPage />} />
        <Route path="ask-rav" element={<AskRavPage />} />
        {/* Biographies temporarily hidden (content empty) — restore via PUBLIC_BIOS */}
        <Route
          path="biographies"
          element={PUBLIC_BIOS ? <BiosPage /> : <RedirectLangHome />}
        />
        <Route path="about" element={<AboutPage />} />
        <Route path="search" element={<SearchPage />} />
        <Route path="issue/:year/:slug" element={<IssuePage />} />
        <Route path="article/:slug" element={<MaterialPage kind="article" />} />
        <Route path="answer/:slug" element={<MaterialPage kind="answer" />} />
        <Route
          path="biography/:slug"
          element={
            PUBLIC_BIOS ? <MaterialPage kind="bio" /> : <RedirectLangHome />
          }
        />
        <Route path="*" element={<Navigate to="." replace />} />
      </Route>
    </Routes>
  );
}
