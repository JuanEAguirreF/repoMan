import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { apiGet, resolveCoverUrl } from "../lib/api";
import { useI18n } from "../lib/i18n";
import { useSeo } from "../lib/seo";
import { buildPublicFilePath } from "../lib/slug";
import { CatalogFile } from "../types";

type ProfileStateFilter = "all" | "preserved" | "request_only";

type PublicProfilePayload = {
  profileId: string;
  displayName: string;
  role: "super_admin" | "uploader";
  createdAt: string;
  avatarUrl: string | null;
  files: CatalogFile[];
  total: number;
  page: number;
  pageSize: number;
  filters?: {
    category?: string;
    state?: ProfileStateFilter;
  };
};

export function PublicProfilePage() {
  const { profileId } = useParams();
  const { locale, t } = useI18n();
  const [item, setItem] = useState<PublicProfilePayload | null>(null);
  const [error, setError] = useState<string>("");
  const [page, setPage] = useState<number>(1);
  const [isPageLoading, setIsPageLoading] = useState<boolean>(false);
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [stateFilter, setStateFilter] = useState<ProfileStateFilter>("all");
  const headerImageUrl = (import.meta.env.VITE_HEADER_IMAGE_URL as string | undefined)?.trim() || "";

  const ux = useMemo(
    () =>
      locale === "es"
        ? {
            loading: "Cargando perfil...",
            notFound: "Perfil no encontrado",
            joined: "En comunidad desde",
            files: "Publicaciones públicas",
            empty: "Este uploader aún no tiene publicaciones públicas.",
            open: "Ver detalle",
            roleUploader: "Uploader",
            roleAdmin: "Super Admin",
            pageInfo: "Página",
            of: "de",
            prev: "Anterior",
            next: "Siguiente",
            filtersTitle: "Filtros",
            filterCategory: "Categoría",
            filterState: "Estado",
            filterAllCategories: "Todas",
            filterStateAll: "Todos",
            filterStatePreserved: "Con respaldo",
            filterStateRequestOnly: "Solicitud sin respaldo",
            pageLoading: "Actualizando lista..."
          }
        : {
            loading: "Loading profile...",
            notFound: "Profile not found",
            joined: "Community member since",
            files: "Public publications",
            empty: "This uploader has no public publications yet.",
            open: "Open detail",
            roleUploader: "Uploader",
            roleAdmin: "Super Admin",
            pageInfo: "Page",
            of: "of",
            prev: "Previous",
            next: "Next",
            filtersTitle: "Filters",
            filterCategory: "Category",
            filterState: "Status",
            filterAllCategories: "All",
            filterStateAll: "All",
            filterStatePreserved: "With backup",
            filterStateRequestOnly: "Request only",
            pageLoading: "Refreshing list..."
          },
    [locale]
  );

  const categories = useMemo(
    () =>
      [
        t.categoryShonen,
        t.categoryShojo,
        t.categorySeinen,
        t.categoryJosei,
        t.categoryIsekai,
        t.categoryClassicArchive,
        t.categoryLostMedia,
        t.categoryArtbook,
        t.categoryDoujinshi,
        t.categoryOneshot,
        t.categoryYuri,
        t.categoryYaoi,
        t.categoryMecha,
        t.categoryRomance,
        t.categoryComedy,
        t.categoryEcchi,
        t.categoryHentai,
        t.categorySliceOfLife,
        t.categoryFantasy,
        t.categoryHorror,
        t.categoryDrama
      ].sort((a, b) => a.localeCompare(b)),
    [t]
  );

  useSeo({
    title: item ? `${item.displayName} · RepoMan` : "RepoMan",
    description: item ? `${item.displayName} profile` : ux.loading,
    path: profileId ? `/profiles/${profileId}` : "/",
    lang: locale,
    index: true,
    follow: true
  });

  useEffect(() => {
    if (!profileId) return;
    setIsPageLoading(true);
    const query = new URLSearchParams();
    query.set("page", String(page));
    query.set("pageSize", "12");
    if (categoryFilter) query.set("category", categoryFilter);
    if (stateFilter !== "all") query.set("state", stateFilter);
    apiGet<{ item: PublicProfilePayload }>(
      `/public/profiles/${encodeURIComponent(profileId)}?${query.toString()}`
    )
      .then((res) => {
        setError("");
        setItem(res.item);
      })
      .catch(() => setError(ux.notFound))
      .finally(() => setIsPageLoading(false));
  }, [profileId, page, categoryFilter, stateFilter, ux.notFound]);

  useEffect(() => {
    setPage(1);
  }, [profileId]);

  useEffect(() => {
    setPage(1);
  }, [categoryFilter, stateFilter]);

  if (error) return <p>{error}</p>;
  if (!item) return <p>{ux.loading}</p>;
  const totalPages = Math.max(1, Math.ceil(item.total / item.pageSize));
  const canPrev = item.page > 1;
  const canNext = item.page < totalPages;
  const roleClass = item.role === "super_admin" ? "role-badge role-badge-admin" : "role-badge role-badge-uploader";
  const roleLabel = item.role === "super_admin" ? ux.roleAdmin : ux.roleUploader;
  const pageNumbers = buildVisiblePages(item.page, totalPages);

  return (
    <section className="profile-page public-profile-page">
      <div className="profile-card profile-main-card">
        <div className="profile-avatar-wrap">
          <img
            className="profile-avatar"
            src={item.avatarUrl || headerImageUrl}
            alt={item.displayName}
          />
        </div>
        <div>
          <h1>{item.displayName}</h1>
          <span className={roleClass}>{roleLabel}</span>
          <p className="meta-line">
            {ux.joined}: <strong>{new Date(item.createdAt).toLocaleDateString(locale === "es" ? "es-CO" : "en-US")}</strong>
          </p>
        </div>
      </div>

      <article className="profile-card">
        <h3>{ux.files}</h3>
        <div className="profile-filters">
          <label>
            {ux.filterCategory}
            <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
              <option value="">{ux.filterAllCategories}</option>
              {categories.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </label>
          <label>
            {ux.filterState}
            <select
              value={stateFilter}
              onChange={(e) => setStateFilter(e.target.value as ProfileStateFilter)}
            >
              <option value="all">{ux.filterStateAll}</option>
              <option value="preserved">{ux.filterStatePreserved}</option>
              <option value="request_only">{ux.filterStateRequestOnly}</option>
            </select>
          </label>
        </div>
        {isPageLoading ? (
          <div className="profile-files-list profile-skeleton-list" aria-live="polite" aria-busy="true">
            <span className="seo-hidden">{ux.pageLoading}</span>
            {Array.from({ length: 6 }).map((_, idx) => (
              <div key={`skeleton-${idx}`} className="profile-file-row profile-file-row-skeleton">
                <div className="profile-file-row-main">
                  <div className="profile-file-thumb profile-skeleton-block" />
                  <div className="profile-skeleton-meta">
                    <div className="profile-skeleton-line profile-skeleton-line-title" />
                    <div className="profile-skeleton-line profile-skeleton-line-sub" />
                  </div>
                </div>
                <div className="profile-skeleton-line profile-skeleton-line-btn" />
              </div>
            ))}
          </div>
        ) : item.files.length === 0 ? (
          <p className="meta-line">{ux.empty}</p>
        ) : (
          <div className="profile-files-list">
            {item.files.map((file) => (
              <div key={file.id} className="profile-file-row">
                <div className="profile-file-row-main">
                  <img
                    className="profile-file-thumb"
                    src={resolveCoverUrl(file.id, file.cover_image_path)}
                    alt={file.title}
                  />
                  <div>
                    <strong>{file.title}</strong>
                    <p className="meta-line">{file.category}</p>
                  </div>
                </div>
                <Link to={buildPublicFilePath(file.slug)} className="meta-link">{ux.open}</Link>
              </div>
            ))}
          </div>
        )}
        {item.total > item.pageSize && (
          <div className="profile-pagination">
            <button
              type="button"
              className="chip-btn profile-page-btn"
              onClick={() => canPrev && setPage((p) => p - 1)}
              disabled={!canPrev || isPageLoading}
            >
              {ux.prev}
            </button>
            <span className="profile-page-status">
              {ux.pageInfo} {item.page} {ux.of} {totalPages}
            </span>
            <div className="profile-page-numbers">
              {pageNumbers.map((value, idx) =>
                value === "ellipsis" ? (
                  <span key={`ellipsis-${idx}`} className="profile-page-ellipsis">
                    ...
                  </span>
                ) : (
                  <button
                    key={value}
                    type="button"
                    className={`chip-btn profile-page-number ${value === item.page ? "is-active" : ""}`}
                    onClick={() => setPage(value)}
                    disabled={value === item.page || isPageLoading}
                  >
                    {value}
                  </button>
                )
              )}
            </div>
            <button
              type="button"
              className="chip-btn profile-page-btn"
              onClick={() => canNext && setPage((p) => p + 1)}
              disabled={!canNext || isPageLoading}
            >
              {ux.next}
            </button>
          </div>
        )}
      </article>
    </section>
  );
}

function buildVisiblePages(current: number, total: number): Array<number | "ellipsis"> {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  const pages = new Set<number>([1, total, current, current - 1, current + 1]);
  const sorted = Array.from(pages).filter((n) => n >= 1 && n <= total).sort((a, b) => a - b);
  const result: Array<number | "ellipsis"> = [];
  for (let i = 0; i < sorted.length; i += 1) {
    const value = sorted[i];
    const prev = sorted[i - 1];
    if (i > 0 && value - prev > 1) {
      result.push("ellipsis");
    }
    result.push(value);
  }
  return result;
}
