import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { apiGet, resolveCoverUrl } from "../lib/api";
import { useSeo } from "../lib/seo";
import { CatalogFile } from "../types";
import { useI18n } from "../lib/i18n";
import { SpiralHero } from "../components/SpiralHero";
import { buildPublicFilePath } from "../lib/slug";

function displayFileType(mimeType: string): string {
  const lower = mimeType.toLowerCase();
  if (lower.includes("pdf")) return "PDF";
  if (lower.includes("comicbook+zip") || lower.includes("x-cbz")) return "CBZ";
  if (lower.includes("comicbook-rar") || lower.includes("x-cbr")) return "CBR";
  if (lower.includes("zip")) return "ZIP";
  if (lower.includes("rar")) return "RAR";
  if (lower.includes("msword")) return "DOC";
  if (lower.includes("wordprocessingml")) return "DOCX";
  if (lower.includes("text/plain")) return "TXT";
  if (lower.includes("octet-stream")) return "BIN";
  return mimeType;
}

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
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const { t, locale } = useI18n();
  const cafeImageUrl = (import.meta.env.VITE_CAFE_IMAGE_URL as string | undefined)?.trim();
  const discordImageUrl = (import.meta.env.VITE_DISCORD_IMAGE_URL as string | undefined)?.trim();
  const discordInviteUrl = ((import.meta.env.VITE_DISCORD_INVITE_URL as string | undefined)?.trim() || "https://discord.gg/jURmbDXjnf");
  const sisterPlatformUrl = ((import.meta.env.VITE_SISTER_PLATFORM_URL as string | undefined)?.trim() ||
    "https://ideas.comunidaddelmanga.com");
  const siteUrl = ((import.meta.env.VITE_SITE_URL as string | undefined)?.trim().replace(/\/$/, "") ||
    "https://repoman.comunidaddelmanga.com");

  useEffect(() => {
    Promise.all([
      apiGet<{ items: CatalogFile[] }>("/public/files").then((res) => setItems(res.items)),
      apiGet<{ items: { username: string, count: number }[] }>("/public/top-uploaders").then((res) => setTopUploaders(res.items)).catch(() => { })
    ]).finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(
    () =>
      items.filter((item) => {
        const haystack = `${item.title} ${item.category} ${item.description}`.toLowerCase();
        return haystack.includes(search.toLowerCase());
      }),
    [items, search]
  );

  const heroItems = useMemo(
    () => {
      if (items.length === 0) return [];

      const source = items.map((item) => ({
        id: item.id,
        label: item.title,
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

  useSeo({
    title: t.catalogTitle,
    description: t.catalogLead,
    path: "/",
    lang: locale,
    index: true,
    follow: true,
    type: "website",
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: t.catalogTitle,
      description: t.catalogLead,
      inLanguage: "es",
      url: `${siteUrl}/`,
      isPartOf: {
        "@type": "WebSite",
        name: "RepoMan",
        url: siteUrl
      }
    }
  });

  if (loading) return <p>{t.catalogLoading}</p>;

  return (
    <section>
      <SpiralHero
        items={heroItems}
        badge={t.catalogMetaOnly}
        title={t.catalogTitle}
        description={t.catalogLead}
        ctaSecondaryLabel="¿Qué es RepoMan?"
        ctaSecondaryHref="/que-es-repoman"
        ctaLabel={t.heroCta}
        ctaHref="#catalog-content"
      />

      <div id="catalog-content" className="catalog-layout">
        <div className="catalog-main">
          <div className="catalog-toolbar">
            <span>
              {filtered.length} {t.catalogResultCount}
            </span>
            <small>{t.catalogMetaOnlyDesc}</small>
          </div>
          <div className="catalog-grid">
            {filtered.map((item) => (
              <article key={item.id} className="catalog-card">
                <div className="catalog-card-media">
                  <img src={resolveCoverUrl(item.id, item.cover_image_path)} alt={item.title} />
                </div>
                <div>
                  <h3>{item.title}</h3>
                  <p className="meta-line">{item.category}</p>
                  <p className="meta-line">
                    {t.contentOrigin}: {item.content_origin === "manhwa" ? t.contentOriginManhwa : item.content_origin === "manhua" ? t.contentOriginManhua : t.contentOriginManga}
                  </p>
                  {item.has_backup ? (
                    <>
                      <p className="meta-line">
                        {t.fileType}: {displayFileType(item.mime_type)}
                      </p>
                      <p className="meta-line">
                        {t.fileSize}: {(item.file_size_bytes / 1024 / 1024).toFixed(2)} MB
                      </p>
                    </>
                  ) : (
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
          {filtered.length === 0 && <p>{t.catalogNoResults}</p>}
        </div>

        <aside className="sidebar">
          <h3>{t.sidebarTitle}</h3>
          <p>{t.sidebarDesc}</p>
          <label htmlFor="catalog-search">{t.catalogSearchLabel}</label>
          <input
            id="catalog-search"
            className="search-input"
            placeholder={t.catalogSearch}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="stat-box">
            <strong>{t.quickStats}</strong>
            <div className="stat-item">
              <span>{t.totalItems}</span>
              <strong>{items.length}</strong>
            </div>
            <div className="stat-item">
              <span>{t.visibleItems}</span>
              <strong>{filtered.length}</strong>
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
