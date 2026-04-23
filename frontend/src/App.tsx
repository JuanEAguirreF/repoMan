import { BrowserRouter, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { LoginPage } from "./routes/LoginPage";
import { PublicCatalogPage } from "./routes/PublicCatalogPage";
import { PublicFileDetailPage } from "./routes/PublicFileDetailPage";
import { AboutRepoManPage } from "./routes/AboutRepoManPage";
import { FaqPage } from "./routes/FaqPage";
import { RequireAuth } from "./routes/RequireAuth";
import { RequireRole } from "./routes/RequireRole";
import { MyFilesPage } from "./routes/dashboard/MyFilesPage";
import { NewFilePage } from "./routes/dashboard/NewFilePage";
import { AdminDeletionRequestsPage } from "./routes/dashboard/AdminDeletionRequestsPage";
import { AdminFilesPage } from "./routes/dashboard/AdminFilesPage";

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<PublicCatalogPage />} />
          <Route path="/que-es-repoman" element={<AboutRepoManPage />} />
          <Route path="/faq" element={<FaqPage />} />
          <Route path="/files/:slug" element={<PublicFileDetailPage />} />
          <Route path="/login" element={<LoginPage />} />

          <Route element={<RequireAuth />}>
            <Route path="/dashboard/files" element={<MyFilesPage />} />
            <Route path="/dashboard/new" element={<NewFilePage />} />

            <Route element={<RequireRole allowed={["super_admin"]} />}>
              <Route path="/dashboard/admin/deletions" element={<AdminDeletionRequestsPage />} />
              <Route path="/dashboard/admin/files" element={<AdminFilesPage />} />
            </Route>
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
