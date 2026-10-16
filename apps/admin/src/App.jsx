import { Route, Routes } from "react-router-dom";

export function App() {
  return (
    <Routes>
      <Route
        path="*"
        element={
          <main className="shell">
            <h1>Jeschurun Admin</h1>
            <p>jes-v2 admin shell (fail-closed auth in later phase)</p>
          </main>
        }
      />
    </Routes>
  );
}
