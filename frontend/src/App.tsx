import { useEffect, useRef } from "react";
import { BrowserRouter, Route, Routes, useLocation } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { LoginPage } from "./routes/LoginPage";
import { PublicCatalogPage } from "./routes/PublicCatalogPage";
import { PublicFileDetailPage } from "./routes/PublicFileDetailPage";
import { PublicProfilePage } from "./routes/PublicProfilePage";
import { AboutRepoManPage } from "./routes/AboutRepoManPage";
import { FaqPage } from "./routes/FaqPage";
import { RequireAuth } from "./routes/RequireAuth";
import { RequireRole } from "./routes/RequireRole";
import { MyFilesPage } from "./routes/dashboard/MyFilesPage";
import { NewFilePage } from "./routes/dashboard/NewFilePage";
import { AdminDeletionRequestsPage } from "./routes/dashboard/AdminDeletionRequestsPage";
import { AdminFilesPage } from "./routes/dashboard/AdminFilesPage";
import { AdminPublicationRequestsPage } from "./routes/dashboard/AdminPublicationRequestsPage";
import { AdminEditRequestsPage } from "./routes/dashboard/AdminEditRequestsPage";
import { AdminAuditLogsPage } from "./routes/dashboard/AdminAuditLogsPage";
import { MyProfilePage } from "./routes/dashboard/MyProfilePage";
import { trackPageView } from "./lib/analytics";

function RouteAnalytics() {
  const location = useLocation();
  const lastTrackedPathRef = useRef<string>("");

  useEffect(() => {
    const fullPath = `${location.pathname}${location.search}${location.hash}`;
    if (lastTrackedPathRef.current === fullPath) return;
    lastTrackedPathRef.current = fullPath;
    trackPageView(fullPath);
  }, [location.pathname, location.search, location.hash]);

  return null;
}

export function App() {
  return (
    <BrowserRouter>
      <RouteAnalytics />
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<PublicCatalogPage />} />
          <Route path="/que-es-repoman" element={<AboutRepoManPage />} />
          <Route path="/faq" element={<FaqPage />} />
          <Route path="/files/:slug" element={<PublicFileDetailPage />} />
          <Route path="/profiles/:profileId" element={<PublicProfilePage />} />
          <Route path="/login" element={<LoginPage />} />

          <Route element={<RequireAuth />}>
            <Route path="/dashboard/profile" element={<MyProfilePage />} />
            <Route path="/dashboard/files" element={<MyFilesPage />} />
            <Route path="/dashboard/new" element={<NewFilePage />} />

            <Route element={<RequireRole allowed={["super_admin"]} />}>
              <Route path="/dashboard/admin/publications" element={<AdminPublicationRequestsPage />} />
              <Route path="/dashboard/admin/deletions" element={<AdminDeletionRequestsPage />} />
              <Route path="/dashboard/admin/edits" element={<AdminEditRequestsPage />} />
              <Route path="/dashboard/admin/audit" element={<AdminAuditLogsPage />} />
              <Route path="/dashboard/admin/files" element={<AdminFilesPage />} />
            </Route>
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
