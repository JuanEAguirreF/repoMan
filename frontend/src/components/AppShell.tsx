import { Link, Outlet, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useEffect, useState } from "react";
import { apiGet } from "../lib/api";
import { SessionUser } from "../types";
import { useI18n } from "../lib/i18n";

export function AppShell() {
  const [me, setMe] = useState<SessionUser | null>(null);
  const navigate = useNavigate();
  const { t } = useI18n();
  const headerImageUrl = (import.meta.env.VITE_HEADER_IMAGE_URL as string | undefined)?.trim();
  const sisterPlatformUrl = ((import.meta.env.VITE_SISTER_PLATFORM_URL as string | undefined)?.trim() ||
    "https://ideas.comunidaddelmanga.com");

  useEffect(() => {
    let active = true;

    async function loadCurrentUser() {
      try {
        const res = await apiGet<{ user: SessionUser }>("/auth/session", true);
        if (active) setMe(res.user);
      } catch {
        if (active) setMe(null);
      }
    }

    loadCurrentUser();

    const { data } = supabase.auth.onAuthStateChange(() => {
      loadCurrentUser();
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  async function logout() {
    setMe(null);
    await supabase.auth.signOut();
    navigate("/");
  }

  return (
    <div className="app-shell">
      <header className="shell-header">
        <Link className="brand-wrap" to="/" style={{ textDecoration: "none", color: "inherit" }}>
          {headerImageUrl && <img src={headerImageUrl} alt="" className="header-side-image" aria-hidden="true" />}
          <div className="brand-line">
            <h1>{t.brand}</h1>
            <p>{t.parentSite}</p>
          </div>
        </Link>
        <nav className="nav-links">
          <Link className="chip-link" to="/">
            {t.navPublicCatalog}
          </Link>
          {me ? (
            <>
              <Link className="chip-link" to="/dashboard/files">
                {t.navMyFiles}
              </Link>
              <Link className="chip-link" to="/dashboard/new">
                {t.navNewFile}
              </Link>
              {me.role === "super_admin" && (
                <Link className="chip-link" to="/dashboard/admin/deletions">
                  {t.navAdminRequests}
                </Link>
              )}
              {me.role === "super_admin" && (
                <Link className="chip-link" to="/dashboard/admin/files">
                  {t.navAllFiles}
                </Link>
              )}
              <button className="chip-btn" onClick={logout}>
                {t.navLogout}
              </button>
            </>
          ) : (
            <>
              <a className="chip-link" href={sisterPlatformUrl} target="_blank" rel="noopener noreferrer">
                {t.navReadOnline}
              </a>
              <Link className="chip-link" to="/login">
                {t.navLogin}
              </Link>
            </>
          )}
        </nav>
      </header>
      <Outlet />
      <footer className="site-footer" role="contentinfo">
        <p>{t.footerDisclaimerLine1}</p>
        <p>{t.footerDisclaimerLine2}</p>
      </footer>
    </div>
  );
}
