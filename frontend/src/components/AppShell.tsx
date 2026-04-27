import { Link, Outlet, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useEffect, useRef, useState } from "react";
import { apiGet } from "../lib/api";
import { SessionUser } from "../types";
import { useI18n } from "../lib/i18n";
import { trackEvent } from "../lib/analytics";

export function AppShell() {
  const [me, setMe] = useState<SessionUser | null>(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const accountMenuRef = useRef<HTMLDivElement | null>(null);
  const navigate = useNavigate();
  const { t } = useI18n();
  const headerImageUrl = (import.meta.env.VITE_HEADER_IMAGE_URL as string | undefined)?.trim();
  const sisterPlatformUrl = ((import.meta.env.VITE_SISTER_PLATFORM_URL as string | undefined)?.trim() ||
    "https://ideas.comunidaddelmanga.com");
  const discordInviteUrl = ((import.meta.env.VITE_DISCORD_INVITE_URL as string | undefined)?.trim() || "https://discord.gg/jURmbDXjnf");

  useEffect(() => {
    let active = true;
    const inFlight = { current: null as Promise<void> | null };

    async function loadCurrentUser() {
      if (inFlight.current) return inFlight.current;
      inFlight.current = (async () => {
        try {
          const res = await apiGet<{ user: SessionUser }>("/auth/session", true);
          if (active) setMe(res.user);
        } catch {
          if (active) setMe(null);
        }
      })().finally(() => {
        inFlight.current = null;
      });
      return inFlight.current;
    }

    function scheduleLoadCurrentUser() {
      window.setTimeout(() => {
        if (active) void loadCurrentUser();
      }, 0);
    }

    void loadCurrentUser();

    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        setMe(null);
        return;
      }

      if (event === "SIGNED_IN" || event === "INITIAL_SESSION" || event === "USER_UPDATED") {
        scheduleLoadCurrentUser();
      }
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!accountOpen) return;

    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (accountMenuRef.current && !accountMenuRef.current.contains(target)) {
        setAccountOpen(false);
      }
    }

    function onEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setAccountOpen(false);
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onEscape);
    };
  }, [accountOpen]);

  async function logout() {
    setMe(null);
    setAccountOpen(false);
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
            <span className="nav-glyph" aria-hidden="true">⌘</span>
            <span>{t.navPublicCatalog}</span>
          </Link>
          <Link className="chip-link" to="/que-es-repoman">
            <span className="nav-glyph" aria-hidden="true">◈</span>
            <span>{t.navAbout}</span>
          </Link>
          {me ? (
            <>
              <Link className="chip-link" to="/dashboard/files">
                <span className="nav-glyph" aria-hidden="true">⌗</span>
                <span>{t.navMyFiles}</span>
              </Link>
              <Link className="chip-link" to="/dashboard/new">
                <span className="nav-glyph" aria-hidden="true">✦</span>
                <span>{t.navNewFile}</span>
              </Link>
              <div className="nav-account" ref={accountMenuRef}>
                <button
                  className={`chip-btn nav-account-trigger ${accountOpen ? "is-open" : ""}`}
                  onClick={() => setAccountOpen((prev) => !prev)}
                  aria-expanded={accountOpen}
                  aria-haspopup="menu"
                >
                  <span className="nav-glyph" aria-hidden="true">⌬</span>
                  <span>{t.navMyAccount}</span>
                </button>
                {accountOpen && (
                  <div className="nav-account-menu" role="menu">
                    <Link className="nav-account-item" to="/dashboard/profile" onClick={() => setAccountOpen(false)}>
                      <span className="nav-glyph" aria-hidden="true">◍</span>
                      {t.navMyProfile}
                    </Link>
                    {me.role === "super_admin" && (
                      <>
                        <Link className="nav-account-item" to="/dashboard/admin/publications" onClick={() => setAccountOpen(false)}>
                          <span className="nav-glyph" aria-hidden="true">⍟</span>
                          {t.navAdminPublications}
                        </Link>
                        <Link className="nav-account-item" to="/dashboard/admin/deletions" onClick={() => setAccountOpen(false)}>
                          <span className="nav-glyph" aria-hidden="true">⌫</span>
                          {t.navAdminRequests}
                        </Link>
                        <Link className="nav-account-item" to="/dashboard/admin/edits" onClick={() => setAccountOpen(false)}>
                          <span className="nav-glyph" aria-hidden="true">⌥</span>
                          {t.navAdminEdits}
                        </Link>
                        <Link className="nav-account-item" to="/dashboard/admin/audit" onClick={() => setAccountOpen(false)}>
                          <span className="nav-glyph" aria-hidden="true">◇</span>
                          {t.navAdminAudit}
                        </Link>
                        <Link className="nav-account-item" to="/dashboard/admin/files" onClick={() => setAccountOpen(false)}>
                          <span className="nav-glyph" aria-hidden="true">◉</span>
                          {t.navAllFiles}
                        </Link>
                      </>
                    )}
                    <button className="nav-account-item nav-account-logout" onClick={logout}>
                      <span className="nav-glyph" aria-hidden="true">⊖</span>
                      {t.navLogout}
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              <a
                className="chip-link"
                href={sisterPlatformUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => trackEvent("sister_platform_click", { location: "header" })}
              >
                <span className="nav-glyph" aria-hidden="true">⌁</span>
                <span>{t.navReadOnline}</span>
              </a>
              <Link className="chip-link" to="/login">
                <span className="nav-glyph" aria-hidden="true">⊙</span>
                <span>{t.navLogin}</span>
              </Link>
            </>
          )}
        </nav>
      </header>
      <main className="shell-main">
        <Outlet />
      </main>
      <footer className="site-footer" role="contentinfo">
        <div className="site-footer-grid">
          <section>
            <h3>{t.footerProjectTitle}</h3>
            <nav className="site-footer-links" aria-label={t.footerProjectTitle}>
              <Link to="/que-es-repoman">{t.footerLinkAbout}</Link>
              <Link to="/que-es-repoman">{t.footerLinkHowToJoin}</Link>
              <Link to="/faq">{t.footerLinkFaq}</Link>
            </nav>
          </section>
          <section>
            <h3>{t.footerCommunityTitle}</h3>
            <nav className="site-footer-links" aria-label={t.footerCommunityTitle}>
              <a
                href={discordInviteUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => trackEvent("discord_click", { location: "footer" })}
              >
                {t.footerLinkDiscord}
              </a>
              <a
                href={sisterPlatformUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => trackEvent("sister_platform_click", { location: "footer" })}
              >
                {t.footerLinkIdeas}
              </a>
              <a
                href="https://ko-fi.com/comunidaddelmanga"
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => trackEvent("kofi_click", { location: "footer" })}
              >
                {t.footerLinkSupport}
              </a>
            </nav>
          </section>
          <section>
            <h3>{t.footerOpsTitle}</h3>
            <p>{t.footerOpsLine1}</p>
            <p>{t.footerOpsLine2}</p>
          </section>
        </div>
        <div className="site-footer-bottom">© {new Date().getFullYear()} · {t.footerBottom}</div>
      </footer>
    </div>
  );
}
