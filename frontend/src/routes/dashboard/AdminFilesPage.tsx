import { useEffect, useState } from "react";
import { apiGet, apiPost } from "../../lib/api";
import { StatusBadge } from "../../components/StatusBadge";
import { useI18n } from "../../lib/i18n";
import { useSeo } from "../../lib/seo";

type AdminFile = {
  id: string;
  title: string;
  category: string;
  status: "active" | "pending_deletion" | "deleted";
  owner_user_id: string;
  owner_email?: string | null;
  owner_display_name?: string | null;
  owner_label?: string | null;
};

export function AdminFilesPage() {
  const [items, setItems] = useState<AdminFile[]>([]);
  const [maxFileSizeMb, setMaxFileSizeMb] = useState<number>(200);
  const [draftMaxMb, setDraftMaxMb] = useState<string>("200");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const { t, locale } = useI18n();

  useSeo({
    title: t.adminAllFilesTitle,
    description: t.adminAllFilesTitle,
    path: "/dashboard/admin/files",
    lang: locale,
    index: false,
    follow: false
  });

  useEffect(() => {
    apiGet<{ items: AdminFile[] }>("/admin/files", true).then((res) => setItems(res.items));
    apiGet<{ maxFileSizeMb: number }>("/admin/settings/upload-limits", true).then((res) => {
      setMaxFileSizeMb(res.maxFileSizeMb);
      setDraftMaxMb(String(res.maxFileSizeMb));
    });
  }, []);

  async function saveLimit() {
    setMessage("");
    setError("");
    const parsed = Number(draftMaxMb);
    if (!Number.isFinite(parsed) || parsed < 5 || parsed > 1024) {
      setError(t.adminLimitValidation);
      return;
    }

    try {
      setSaving(true);
      const res = await apiPost<{ maxFileSizeMb: number }>(
        "/admin/settings/upload-limits",
        { maxFileSizeMb: Math.floor(parsed) },
        true
      );
      setMaxFileSizeMb(res.maxFileSizeMb);
      setDraftMaxMb(String(res.maxFileSizeMb));
      setMessage(`${t.adminSavedPrefix} ${res.maxFileSizeMb} MB.`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="admin-page">
      <h1>{t.adminAllFilesTitle}</h1>
      <p className="admin-lead">{t.adminAllFilesLead}</p>

      <div className="admin-grid">
        <article className="admin-panel">
          <h2>{t.adminUploadLimitsTitle}</h2>
          <p>{t.adminCurrentMainLimit}: <strong>{maxFileSizeMb} MB</strong></p>
          <div className="admin-form-row">
            <label htmlFor="maxFileSizeMb">{t.adminMaxFileSizeLabel}</label>
            <input
              id="maxFileSizeMb"
              type="number"
              min={5}
              max={1024}
              step={1}
              value={draftMaxMb}
              onChange={(e) => setDraftMaxMb(e.target.value)}
            />
            <button type="button" className="chip-btn" onClick={saveLimit} disabled={saving}>
              {saving ? t.adminSaving : t.adminSaveLimit}
            </button>
          </div>
          {message && <p className="admin-message-ok">{message}</p>}
          {error && <p className="admin-message-error">{error}</p>}
        </article>

        <article className="admin-panel">
          <h2>{t.adminQuickSummary}</h2>
          <div className="admin-kpi-row">
            <span>{t.adminTotalFiles}</span>
            <strong>{items.length}</strong>
          </div>
          <div className="admin-kpi-row">
            <span>{t.adminActiveFiles}</span>
            <strong>{items.filter((x) => x.status === "active").length}</strong>
          </div>
          <div className="admin-kpi-row">
            <span>{t.adminPendingFiles}</span>
            <strong>{items.filter((x) => x.status === "pending_deletion").length}</strong>
          </div>
          <div className="admin-kpi-row">
            <span>{t.adminDeletedFiles}</span>
            <strong>{items.filter((x) => x.status === "deleted").length}</strong>
          </div>
        </article>
      </div>

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>{t.colTitle}</th>
              <th>{t.colOwner}</th>
              <th>{t.colCategory}</th>
              <th>{t.colStatus}</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td>{item.title}</td>
                <td>{item.owner_label || item.owner_email?.split("@")[0] || item.owner_display_name || item.owner_user_id}</td>
                <td>{item.category}</td>
                <td>
                  <StatusBadge status={item.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
