import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { apiGet, resolveCoverUrl } from "../lib/api";
import { useSeo } from "../lib/seo";
import { CatalogFile } from "../types";
import { useI18n } from "../lib/i18n";
import { SpiralHero } from "../components/SpiralHero";
import { buildPublicFilePath } from "../lib/slug";

function shuffled<T>(input: T[]): T[] {
  const arr = [...input];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function PublicCatalogPage() {
  const [items, setItems] = useState<CatalogFile[]>([]);
  const [topUploaders, setTopUploaders] = useState<{ username: string, count: number }[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize] = useState(24);
  const [totalItems, setTotalItems] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const { t, locale } = useI18n();
  const cafeImageUrl = (import.meta.env.VITE_CAFE_IMAGE_URL as string | undefined)?.trim();
  const discordImageUrl = (import.meta.env.VITE_DISCORD_IMAGE_URL as string | undefined)?.trim();
  const discordInviteUrl = ((import.meta.env.VITE_DISCORD_INVITE_URL as string | undefined)?.trim() || "https://discord.gg/jURmbDXjnf");
  const sisterPlatformUrl = ((import.meta.env.VITE_SISTER_PLATFORM_URL as string | undefined)?.trim() ||
    "https://ideas.comunidaddelmanga.com");
  const siteUrl = ((import.meta.env.VITE_SITE_URL as string | undefined)?.trim().replace(/\/$/, "") ||
    "https://repoman.comunidaddelmanga.com");
  const didFirstLoadRef = useRef(false);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const shouldRestoreFocusRef = useRef(false);
  const caretPosRef = useRef<number | null>(null);
  const skeletonItems = useMemo(() => Array.from({ length: 9 }, (_, i) => i), []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const normalized = searchInput.trim();
      setSearch((prev) => (prev === normalized ? prev : normalized));
    }, 600);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  async function loadCatalog(targetPage: number, append = false) {
    const params = new URLSearchParams({
      page: String(targetPage),
      pageSize: String(pageSize)
    });
    if (search) params.set("q", search);

    const res = await apiGet<{ items: CatalogFile[]; total: number; page: number; pageSize: number }>(
      `/public/files?${params.toString()}`
    );

    setItems((prev) => (append ? [...prev, ...res.items] : res.items));
    setTotalItems(res.total);
    setHasMore(targetPage * res.pageSize < res.total);
  }

  useEffect(() => {
    apiGet<{ items: { username: string; count: number }[] }>("/public/top-uploaders")
      .then((res) => setTopUploaders(res.items))
      .catch(() => {});
  }, []);

  useEffect(() => {
    setPage(1);
    const isFirstLoad = !didFirstLoadRef.current;
    if (isFirstLoad) {
      setInitialLoading(true);
    } else {
      setSearching(true);
    }

    loadCatalog(1, false)
      .finally(() => {
        if (isFirstLoad) {
          didFirstLoadRef.current = true;
          setInitialLoading(false);
        } else {
          setSearching(false);
        }

        if (shouldRestoreFocusRef.current && searchInputRef.current) {
          const input = searchInputRef.current;
          if (document.activeElement !== input) {
            input.focus({ preventScroll: true });
            const targetPos = caretPosRef.current ?? input.value.length;
            input.setSelectionRange(targetPos, targetPos);
          }
        }
      });
  }, [search]);

  const heroItems = useMemo(
    () => {
      if (items.length === 0) return [];

      const source = items.map((item) => ({
        id: item.id,
        label: (item.alternate_name || "").trim() || item.title,
        imageUrl: resolveCoverUrl(item.id, item.cover_image_path),
        href: buildPublicFilePath(item.slug)
      }));

      const randomPool = shuffled(source);
      const selected: typeof source = [];

      while (selected.length < 10) {
        for (const candidate of shuffled(randomPool)) {
          selected.push({
            ...candidate,
            id: `${candidate.id}-${selected.length}`
          });
          if (selected.length >= 10) break;
        }
      }

      return selected;
    },
    [items]
  );

  async function loadMore() {
    const nextPage = page + 1;
    setLoadingMore(true);
    try {
      await loadCatalog(nextPage, true);
      setPage(nextPage);
    } finally {
      setLoadingMore(false);
    }
  }

  useSeo({
    title: t.catalogTitle,
    description: t.catalogLead,
    path: "/",
    lang: locale,
    index: true,
    follow: true,
    type: "website",
    jsonLd: [
      {
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        name: t.catalogTitle,
        description: t.catalogLead,
        inLanguage: locale,
        url: `${siteUrl}/`,
        isPartOf: {
          "@type": "WebSite",
          name: "RepoMan",
          url: siteUrl
        }
      },
      {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: [
          {
            "@type": "ListItem",
            position: 1,
            name: t.navPublicCatalog,
            item: `${siteUrl}/`
          }
        ]
      }
    ]
  });

  if (initialLoading) return <p>{t.catalogLoading}</p>;

  return (
    <section>
      <SpiralHero
        items={heroItems}
        badge={t.catalogMetaOnly}
        title={t.catalogTitle}
        description={t.catalogLead}
        ctaSecondaryLabel={t.navAbout}
        ctaSecondaryHref="/que-es-repoman"
        ctaLabel={t.heroCta}
        ctaHref="#catalog-content"
      />

      <div id="catalog-content" className="catalog-layout">
        <div className="catalog-main">
          <div className="catalog-toolbar">
            <span>
              {totalItems} {t.catalogResultCount}
            </span>
            <small>{searching ? t.loading : t.catalogMetaOnlyDesc}</small>
          </div>
          <div className={`catalog-grid-wrap ${searching ? "is-searching" : ""}`}>
            <div className="catalog-grid catalog-grid-base">
              {items.map((item) => (
                <article key={item.id} className="catalog-card">
                  <div className="catalog-card-media">
                    <img src={resolveCoverUrl(item.id, item.cover_image_path)} alt={item.title} />
                  </div>
                  <div>
                    <h3>{(item.alternate_name || "").trim() || item.title}</h3>
                    {!!item.alternate_name?.trim() && <p className="meta-line">{item.title}</p>}
                    {!!item.author?.trim() && <p className="meta-line">{t.detailAuthor}: {item.author}</p>}
                    <p className="meta-line">{item.category}</p>
                    <p className="meta-line">
                      {t.contentOrigin}: {item.content_origin === "manhwa" ? t.contentOriginManhwa : item.content_origin === "manhua" ? t.contentOriginManhua : t.contentOriginManga}
                    </p>
                    {!item.has_backup && (
                      <p className="meta-line" style={{ color: "var(--danger, #c0392b)", fontWeight: 600 }}>
                        {t.noBackupLabel}
                      </p>
                    )}
                    <Link className="meta-link" to={buildPublicFilePath(item.slug)}>
                      {t.viewMetadata}
                    </Link>
                  </div>
                </article>
              ))}
            </div>

            <div className="catalog-grid catalog-grid-overlay" aria-hidden="true">
              {skeletonItems.map((idx) => (
                <article key={`skeleton-${idx}`} className="catalog-card catalog-card-skeleton">
                  <div className="catalog-card-media skeleton-block" />
                  <div>
                    <div className="skeleton-line skeleton-title" />
                    <div className="skeleton-line" />
                    <div className="skeleton-line skeleton-short" />
                    <div className="skeleton-line skeleton-short" />
                  </div>
                </article>
              ))}
            </div>
          </div>
          {!searching && items.length === 0 && <p>{t.catalogNoResults}</p>}
          {!searching && hasMore && (
            <div style={{ marginTop: 12 }}>
              <button className="chip-btn" onClick={loadMore} disabled={loadingMore}>
                {loadingMore ? t.loading : t.catalogLoadMore}
              </button>
            </div>
          )}
        </div>

        <aside className="sidebar">
          <h3>{t.sidebarTitle}</h3>
          <p>{t.sidebarDesc}</p>
          <label htmlFor="catalog-search">{t.catalogSearchLabel}</label>
          <input
            ref={searchInputRef}
            id="catalog-search"
            className="search-input"
            placeholder={t.catalogSearch}
            value={searchInput}
            onChange={(e) => {
              shouldRestoreFocusRef.current = document.activeElement === e.target;
              caretPosRef.current = e.target.selectionStart ?? e.target.value.length;
              setSearchInput(e.target.value);
            }}
            onBlur={() => {
              shouldRestoreFocusRef.current = false;
            }}
          />
          <div className="stat-box">
            <strong>{t.quickStats}</strong>
            <div className="stat-item">
              <span>{t.totalItems}</span>
              <strong>{totalItems}</strong>
            </div>
            <div className="stat-item">
              <span>{t.visibleItems}</span>
              <strong>{items.length}</strong>
            </div>
          </div>

          <div className="sister-card">
            <strong>{t.sisterTitle}</strong>
            <p>{t.sisterLead}</p>
            <a className="sister-link" href={sisterPlatformUrl} target="_blank" rel="noopener noreferrer">
              {t.sisterCta}
            </a>
          </div>

          {topUploaders.length > 0 && (
            <div className="top-uploaders-card">
              <strong>{t.topUploadersTitle || "RepoMans Destacados"}</strong>
              <div className="top-uploaders-list">
                {topUploaders.map((u, i) => (
                  <div key={i} className={`top-uploader-row top-uploader-rank-${i + 1}`}>
                    {i === 0 && (
                      <div>
                        🥇 {u.username} <span>({u.count})</span>
                      </div>
                    )}
                    {i === 1 && (
                      <div>
                        🥈 {u.username}
                      </div>
                    )}
                    {i === 2 && (
                      <div>
                        🥉 {u.username}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="kofi-card">
            {cafeImageUrl && <img src={cafeImageUrl} alt="" className="kofi-image" aria-hidden="true" />}
            <strong>{t.supportTitle}</strong>
            <p>{t.supportLead}</p>
            <a
              className="kofi-link"
              href="https://ko-fi.com/comunidaddelmanga"
              target="_blank"
              rel="noopener noreferrer"
            >
              {t.supportCta}
            </a>
          </div>

          <div className="discord-card">
            {discordImageUrl && <img src={discordImageUrl} alt="" className="discord-image" aria-hidden="true" />}
            <strong>{t.discordTitle}</strong>
            <p>{t.discordLead}</p>
            <a className="discord-link" href={discordInviteUrl} target="_blank" rel="noopener noreferrer">
              {t.discordCta}
            </a>
          </div>
        </aside>
      </div>
    </section>
  );
}
