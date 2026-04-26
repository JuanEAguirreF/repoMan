import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { apiGet, apiPost } from "../../lib/api";
import { useI18n } from "../../lib/i18n";
import { useSeo } from "../../lib/seo";
import { buildPublicFilePath } from "../../lib/slug";
import { CatalogFile } from "../../types";

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
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const headerImageUrl = (import.meta.env.VITE_HEADER_IMAGE_URL as string | undefined)?.trim() || "";

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
            avatarHint: "PNG, JPG o WEBP. Máximo 2 MB.",
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
            openDetail: "Ver detalle"
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
            avatarHint: "PNG, JPG or WEBP. Max 2 MB.",
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
            openDetail: "Open detail"
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
      await uploadAvatar(file);
    }
    event.currentTarget.value = "";
  }

  const lastLoginText = data?.profile.lastLoginAt
    ? new Date(data.profile.lastLoginAt).toLocaleString(locale === "es" ? "es-CO" : "en-US")
    : ux.neverLogin;

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

      <div className="profile-bento">
        <article className="profile-card profile-main-card">
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
          </button>
          <input
            ref={avatarInputRef}
            className="file-input-native"
            type="file"
            accept=".png,.jpg,.jpeg,.webp"
            onChange={handleAvatarSelected}
          />
          <div>
            <h2>{data.profile.displayName}</h2>
            <p className="meta-line profile-avatar-help">{ux.avatarTap}</p>
            <p className="meta-line">{ux.avatarHint}</p>
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

        <article className="profile-card profile-stats-card">
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

        <article className="profile-card profile-files-card">
          <h3>{ux.filesTitle}</h3>
          {data.files.length === 0 ? (
            <p className="meta-line">{ux.noFiles}</p>
          ) : (
            <div className="profile-files-list">
              {data.files.slice(0, 16).map((file) => (
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
        </article>
      </div>

      {error && <p className="upload-error">{error}</p>}
    </section>
  );
}
