import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { apiGet, apiPost } from "../../lib/api";
import { useI18n } from "../../lib/i18n";
import { useSeo } from "../../lib/seo";
import { buildPublicFilePath } from "../../lib/slug";
import { CatalogFile } from "../../types";

const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const AVATAR_ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

type ProfilePayload = {
  profile: {
    id: string;
    authUserId: string;
    role: "super_admin" | "uploader";
    displayName: string;
    email: string;
    avatarUrl: string | null;
    lastLoginAt: string | null;
  };
  stats: {
    total: number;
    active: number;
    pendingDeletion: number;
    deleted: number;
    pendingReview: number;
  };
  files: CatalogFile[];
};

export function MyProfilePage() {
  const { locale } = useI18n();
  const [data, setData] = useState<ProfilePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarMessage, setAvatarMessage] = useState("");
  const [filesPage, setFilesPage] = useState(1);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const headerImageUrl = (import.meta.env.VITE_HEADER_IMAGE_URL as string | undefined)?.trim() || "";
  const filesPageSize = 8;

  const ux = useMemo(
    () =>
      locale === "es"
        ? {
            title: "Mi perfil",
            lead: "Gestiona tu información personal y revisa tu actividad reciente en RepoMan.",
            loading: "Cargando perfil...",
            role: "Rol",
            email: "Correo",
            lastLogin: "Último inicio de sesión",
            neverLogin: "Sin registros todavía",
            avatarTitle: "Avatar",
            avatarInvalid: "El avatar debe ser PNG, JPG o WEBP y pesar máximo 2 MB.",
            avatarTap: "Haz clic en el avatar para actualizarlo",
            avatarSaving: "Subiendo avatar...",
            avatarSuccess: "Avatar actualizado correctamente.",
            statsTitle: "Resumen de actividad",
            statTotal: "Archivos",
            statActive: "Activos",
            statPendingReview: "Pendientes de revisión",
            statPendingDeletion: "Pendientes de eliminación",
            statDeleted: "Eliminados",
            filesTitle: "Mis archivos",
            noFiles: "Aún no tienes archivos publicados.",
            openDetail: "Ver detalle",
            pageInfo: "Página",
            of: "de",
            prev: "Anterior",
            next: "Siguiente"
          }
        : {
            title: "My Profile",
            lead: "Manage your personal information and review your recent RepoMan activity.",
            loading: "Loading profile...",
            role: "Role",
            email: "Email",
            lastLogin: "Last login",
            neverLogin: "No login records yet",
            avatarTitle: "Avatar",
            avatarInvalid: "Avatar must be PNG, JPG or WEBP and 2 MB max.",
            avatarTap: "Click the avatar to update it",
            avatarSaving: "Uploading avatar...",
            avatarSuccess: "Avatar updated successfully.",
            statsTitle: "Activity summary",
            statTotal: "Files",
            statActive: "Active",
            statPendingReview: "Pending review",
            statPendingDeletion: "Pending deletion",
            statDeleted: "Deleted",
            filesTitle: "My files",
            noFiles: "You have no uploaded files yet.",
            openDetail: "Open detail",
            pageInfo: "Page",
            of: "of",
            prev: "Previous",
            next: "Next"
          },
    [locale]
  );

  useSeo({
    title: ux.title,
    description: ux.lead,
    path: "/dashboard/profile",
    lang: locale,
    index: false,
    follow: false
  });

  useEffect(() => {
    let active = true;
    async function loadProfile() {
      setLoading(true);
      setError("");
      try {
        const payload = await apiGet<ProfilePayload>("/users/me", true);
        if (!active) return;
        setData(payload);
      } catch (err) {
        if (!active) return;
        setError((err as Error).message);
      } finally {
        if (active) setLoading(false);
      }
    }
    loadProfile();
    return () => {
      active = false;
    };
  }, []);

  async function uploadAvatar(file: File) {
    setAvatarUploading(true);
    setAvatarMessage("");
    setError("");
    try {
      const formData = new FormData();
      formData.set("avatar", file);
      const response = await apiPost<{ ok: boolean; avatarUrl: string | null }>("/users/me/avatar", formData, true);
      setData((prev) =>
        prev
          ? {
              ...prev,
              profile: {
                ...prev.profile,
                avatarUrl: response.avatarUrl
              }
            }
          : prev
      );
      setAvatarMessage(ux.avatarSuccess);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setAvatarUploading(false);
    }
  }

  async function handleAvatarSelected(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0] ?? null;
    if (file) {
      if (!AVATAR_ALLOWED_TYPES.has(file.type) || file.size > MAX_AVATAR_BYTES) {
        setAvatarMessage("");
        setError(ux.avatarInvalid);
        event.currentTarget.value = "";
        return;
      }
      await uploadAvatar(file);
    }
    event.currentTarget.value = "";
  }

  const lastLoginText = data?.profile.lastLoginAt
    ? new Date(data.profile.lastLoginAt).toLocaleString(locale === "es" ? "es-CO" : "en-US")
    : ux.neverLogin;

  const totalFilePages = data ? Math.max(1, Math.ceil(data.files.length / filesPageSize)) : 1;
  const safeFilesPage = Math.min(filesPage, totalFilePages);
  const pagedFiles = data
    ? data.files.slice((safeFilesPage - 1) * filesPageSize, safeFilesPage * filesPageSize)
    : [];
  const filesCanPrev = safeFilesPage > 1;
  const filesCanNext = safeFilesPage < totalFilePages;
  const filePageNumbers = buildVisiblePages(safeFilesPage, totalFilePages);

  if (loading) {
    return (
      <section className="profile-page">
        <h1>{ux.title}</h1>
        <p>{ux.loading}</p>
      </section>
    );
  }

  if (!data) {
    return (
      <section className="profile-page">
        <h1>{ux.title}</h1>
        <p className="upload-error">{error || "Profile unavailable"}</p>
      </section>
    );
  }

  return (
    <section className="profile-page">
      <h1>{ux.title}</h1>
      <p>{ux.lead}</p>

      <div className="profile-bento private-profile-bento">
        <article className="profile-card profile-main-card private-profile-main-card">
          <button
            type="button"
            className="profile-avatar-wrap profile-avatar-button"
            onClick={() => avatarInputRef.current?.click()}
            disabled={avatarUploading}
            title={ux.avatarTap}
          >
            <img
              className="profile-avatar"
              src={data.profile.avatarUrl || headerImageUrl}
              alt={data.profile.displayName}
            />
            <span className="profile-avatar-edit-icon" aria-hidden="true">✎</span>
          </button>
          <input
            ref={avatarInputRef}
            className="file-input-native"
            type="file"
            accept=".png,.jpg,.jpeg,.webp"
            onChange={handleAvatarSelected}
          />
          <div className="profile-main-info private-profile-info">
            <h2>{data.profile.displayName}</h2>
            <p className="meta-line">
              {ux.role}: <strong>{data.profile.role === "super_admin" ? "Super Admin" : "Uploader"}</strong>
            </p>
            <p className="meta-line">
              {ux.email}: <strong>{data.profile.email || "-"}</strong>
            </p>
            <p className="meta-line">
              {ux.lastLogin}: <strong>{lastLoginText}</strong>
            </p>
            {avatarUploading && <p className="meta-line profile-avatar-status">{ux.avatarSaving}</p>}
            {!avatarUploading && avatarMessage && <p className="upload-success">{avatarMessage}</p>}
          </div>
        </article>

        <article className="profile-card profile-stats-card private-profile-stats-card">
          <h3>{ux.statsTitle}</h3>
          <div className="profile-stats-grid">
            <div className="stat-box">
              <div className="stat-item"><span>{ux.statTotal}</span><strong>{data.stats.total}</strong></div>
            </div>
            <div className="stat-box">
              <div className="stat-item"><span>{ux.statActive}</span><strong>{data.stats.active}</strong></div>
            </div>
            <div className="stat-box">
              <div className="stat-item"><span>{ux.statPendingReview}</span><strong>{data.stats.pendingReview}</strong></div>
            </div>
            <div className="stat-box">
              <div className="stat-item"><span>{ux.statPendingDeletion}</span><strong>{data.stats.pendingDeletion}</strong></div>
            </div>
            <div className="stat-box">
              <div className="stat-item"><span>{ux.statDeleted}</span><strong>{data.stats.deleted}</strong></div>
            </div>
          </div>
        </article>

        <article className="profile-card profile-files-card private-profile-files-card">
          <h3>{ux.filesTitle}</h3>
          {data.files.length === 0 ? (
            <p className="meta-line">{ux.noFiles}</p>
          ) : (
            <div className="profile-files-list">
              {pagedFiles.map((file) => (
                <div key={file.id} className="profile-file-row">
                  <div>
                    <strong>{file.title}</strong>
                    <p className="meta-line">{file.category} · {file.status}</p>
                  </div>
                  <Link to={buildPublicFilePath(file.slug)} className="meta-link">{ux.openDetail}</Link>
                </div>
              ))}
            </div>
          )}
          {data.files.length > filesPageSize && (
            <div className="profile-pagination">
              <button
                type="button"
                className="chip-btn profile-page-btn"
                onClick={() => filesCanPrev && setFilesPage((p) => p - 1)}
                disabled={!filesCanPrev}
              >
                {ux.prev}
              </button>
              <span className="profile-page-status">
                {ux.pageInfo} {safeFilesPage} {ux.of} {totalFilePages}
              </span>
              <div className="profile-page-numbers">
                {filePageNumbers.map((value, idx) =>
                  value === "ellipsis" ? (
                    <span key={`private-ellipsis-${idx}`} className="profile-page-ellipsis">
                      ...
                    </span>
                  ) : (
                    <button
                      key={`private-page-${value}`}
                      type="button"
                      className={`chip-btn profile-page-number ${value === safeFilesPage ? "is-active" : ""}`}
                      onClick={() => setFilesPage(value)}
                      disabled={value === safeFilesPage}
                    >
                      {value}
                    </button>
                  )
                )}
              </div>
              <button
                type="button"
                className="chip-btn profile-page-btn"
                onClick={() => filesCanNext && setFilesPage((p) => p + 1)}
                disabled={!filesCanNext}
              >
                {ux.next}
              </button>
            </div>
          )}
        </article>
      </div>

      {error && <p className="upload-error">{error}</p>}
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
