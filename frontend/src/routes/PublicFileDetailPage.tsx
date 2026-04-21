import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { apiGet, resolveCoverUrl } from "../lib/api";
import { useSeo } from "../lib/seo";
import { CatalogFile } from "../types";
import { useI18n } from "../lib/i18n";

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
  const { id } = useParams();
  const [item, setItem] = useState<CatalogFile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { t, locale } = useI18n();

  useEffect(() => {
    if (!id) return;
    apiGet<{ item: CatalogFile }>(`/public/files/${id}`)
      .then((res) => setItem(res.item))
      .catch(() => setError(t.detailNotFound));
  }, [id]);

  const coverImageUrl = item ? resolveCoverUrl(item.id, item.cover_image_path) : undefined;
  const safeDescription = item ? item.description.slice(0, 160) : t.detailLoading;

  useSeo({
    title: item ? `${item.title} - ${t.viewMetadata}` : t.detailLoading,
    description: safeDescription,
    path: id ? `/files/${id}` : "/",
    lang: locale,
    index: true,
    follow: true,
    type: "article",
    image: coverImageUrl,
    jsonLd: item
      ? {
          "@context": "https://schema.org",
          "@type": "ComicStory",
          name: item.title,
          description: safeDescription,
          genre: item.category,
          keywords: item.tags?.join(", "),
          inLanguage: "es",
          image: coverImageUrl,
          datePublished: item.published_at,
          dateCreated: item.created_at
        }
      : undefined
  });

  if (error) return <p>{error}</p>;
  if (!item) return <p>{t.detailLoading}</p>;

  return (
    <section className="detail-card">
      <h1 className="detail-title">{item.title}</h1>
      <div className="detail-layout">
        <div className="detail-cover">
          <img src={resolveCoverUrl(item.id, item.cover_image_path)} alt={item.title} />
        </div>
        <div className="detail-side">
          <p>{item.description}</p>
          <dl className="detail-meta">
            <div>
              <dt>{t.colCategory}</dt>
              <dd>{item.category}</dd>
            </div>
            <div>
              <dt>{t.fileType}</dt>
              <dd>{displayFileType(item.mime_type)}</dd>
            </div>
            <div>
              <dt>{t.fileSize}</dt>
              <dd>{(item.file_size_bytes / 1024 / 1024).toFixed(2)} MB</dd>
            </div>
            <div>
              <dt>{t.uploadedAt}</dt>
              <dd>{new Date(item.created_at).toLocaleDateString()}</dd>
            </div>
          </dl>
          <p className="detail-note">{t.detailNotice}</p>
        </div>
      </div>
    </section>
  );
}
