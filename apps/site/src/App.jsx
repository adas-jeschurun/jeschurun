import { Route, Routes } from "react-router-dom";
import { LANGS } from "@jeschurun/shared";

export function App() {
  return (
    <Routes>
      <Route
        path="*"
        element={
          <main className="shell">
            <h1>Jeschurun</h1>
            <p>jes-v2 site shell · langs: {LANGS.join(", ")}</p>
          </main>
        }
      />
    </Routes>
  );
}
