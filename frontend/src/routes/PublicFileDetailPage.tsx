import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { apiGet, resolveCoverUrl } from "../lib/api";
import { useSeo } from "../lib/seo";
import { CatalogFile } from "../types";
import { useI18n } from "../lib/i18n";
import { buildPublicFilePath, extractSlugParam } from "../lib/slug";

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

export function PublicFileDetailPage() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const [item, setItem] = useState<CatalogFile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [shareStatus, setShareStatus] = useState<string>("");
  const { t, locale } = useI18n();
  const discordInviteUrl =
    ((import.meta.env.VITE_DISCORD_INVITE_URL as string | undefined)?.trim() || "https://discord.gg/jURmbDXjnf");
  const siteUrl = ((import.meta.env.VITE_SITE_URL as string | undefined)?.trim().replace(/\/$/, "") ||
    "https://repoman.comunidaddelmanga.com");

  const fileSlug = slug ? extractSlugParam(slug) : null;

  useEffect(() => {
    if (!fileSlug) {
      setError(t.detailNotFound);
      return;
    }
    apiGet<{ item: CatalogFile }>(`/public/files/${encodeURIComponent(fileSlug)}`)
      .then((res) => setItem(res.item))
      .catch(() => setError(t.detailNotFound));
  }, [fileSlug, t.detailNotFound]);

  useEffect(() => {
    if (!item || !slug) return;
    const canonicalPath = buildPublicFilePath(item.slug);
    const currentPath = `/files/${slug}`;
    if (currentPath !== canonicalPath) {
      navigate(canonicalPath, { replace: true });
    }
  }, [slug, item, navigate]);

  const coverImageUrl = item ? resolveCoverUrl(item.id, item.cover_image_path) : undefined;
  const safeDescription = item ? item.description.slice(0, 160) : t.detailLoading;
  const seoTitle = item ? (((item.alternate_name || "").trim() || item.title)) : t.detailLoading;

  useSeo({
    title: item ? `${seoTitle} - ${t.viewMetadata}` : t.detailLoading,
    description: safeDescription,
    path: item ? buildPublicFilePath(item.slug) : "/",
    lang: locale,
    index: true,
    follow: true,
    type: "article",
    image: coverImageUrl,
    jsonLd: item
      ? [
          {
            "@context": "https://schema.org",
            "@type": "ComicStory",
            name: seoTitle,
            description: safeDescription,
            genre: item.category,
            keywords: item.tags?.join(", "),
            inLanguage: locale,
            image: coverImageUrl,
            datePublished: item.published_at,
            dateCreated: item.created_at
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
              },
              {
                "@type": "ListItem",
                position: 2,
                name: seoTitle,
                item: `${siteUrl}${buildPublicFilePath(item.slug)}`
              }
            ]
          }
        ]
      : undefined
  });

  if (error) return <p>{error}</p>;
  if (!item) return <p>{t.detailLoading}</p>;
  const currentItem = item;
  const displayTitle = (currentItem.alternate_name || "").trim() || currentItem.title;

  const shareMessage = currentItem.has_backup
    ? `'${displayTitle}'. Esta obra está conservada actualmente en nuestra web.`
    : `¿Reconoces esta obra? '${displayTitle}'. Si la tienes descargada, o crees que alguien más puede tenerla, comparte esta página con esa persona para ayudar a conservarla.`;

  async function shareEntry() {
    const url = window.location.href;
    const payload = { title: displayTitle, text: shareMessage, url };
    try {
      if (navigator.share) {
        await navigator.share(payload);
        setShareStatus(t.shareDone);
        return;
      }
      await navigator.clipboard.writeText(`${shareMessage}\n${url}`);
      setShareStatus(t.shareCopied);
    } catch {
      setShareStatus(t.shareFailed);
    }
  }

  return (
    <section className="detail-card">
      <h1 className="detail-title">{displayTitle}</h1>
      <div className="detail-layout">
        <div className="detail-cover">
          <img src={resolveCoverUrl(currentItem.id, currentItem.cover_image_path)} alt={currentItem.title} />
        </div>
        <div className="detail-side">
          <p>{currentItem.description}</p>
          <dl className="detail-meta">
            {!!currentItem.alternate_name?.trim() && (
              <div>
                <dt>{t.detailOriginalTitle}</dt>
                <dd>{currentItem.title}</dd>
              </div>
            )}
            {!!currentItem.alternate_name?.trim() && (
              <div>
                <dt>{t.detailAlternateName}</dt>
                <dd>{currentItem.alternate_name}</dd>
              </div>
            )}
            <div>
              <dt>{t.colCategory}</dt>
              <dd>{currentItem.category}</dd>
            </div>
            <div>
              <dt>{t.fileType}</dt>
              <dd>{currentItem.has_backup ? displayFileType(currentItem.mime_type) : t.noBackupLabel}</dd>
            </div>
            <div>
              <dt>{t.contentOrigin}</dt>
              <dd>
                {currentItem.content_origin === "manhwa"
                  ? t.contentOriginManhwa
                  : currentItem.content_origin === "manhua"
                    ? t.contentOriginManhua
                    : t.contentOriginManga}
              </dd>
            </div>
            <div>
              <dt>{t.fileSize}</dt>
              <dd>{currentItem.has_backup ? `${(currentItem.file_size_bytes / 1024 / 1024).toFixed(2)} MB` : "-"}</dd>
            </div>
            <div>
              <dt>{t.uploadedAt}</dt>
              <dd>{new Date(currentItem.created_at).toLocaleDateString()}</dd>
            </div>
          </dl>
          <div className="detail-actions-panel">
            {!currentItem.has_backup && (
              <div className="detail-backup-callout">
                <p className="detail-note">{t.noBackupDetail}</p>
                <div className="detail-action-buttons">
                  <a className="detail-discord-link" href={discordInviteUrl} target="_blank" rel="noopener noreferrer">
                    {t.discordCta}
                  </a>
                  <button type="button" className="chip-btn detail-share-btn" onClick={shareEntry}>
                    {t.shareEntry}
                  </button>
                </div>
              </div>
            )}
            <p className="detail-note">{t.detailNotice}</p>
            {currentItem.has_backup && (
              <div className="detail-share-row">
                <button type="button" className="chip-btn detail-share-btn" onClick={shareEntry}>
                  {t.shareEntry}
                </button>
              </div>
            )}
            {shareStatus && <span className="detail-share-status">{shareStatus}</span>}
          </div>
        </div>
      </div>
    </section>
  );
}
