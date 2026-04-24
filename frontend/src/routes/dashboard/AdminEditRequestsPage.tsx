import { useEffect, useState } from "react";
import { apiGet, apiPost } from "../../lib/api";
import { useI18n } from "../../lib/i18n";
import { useSeo } from "../../lib/seo";

type EditRequest = {
  id: string;
  file_id: string;
  requested_by_user_id: string;
  reason: string | null;
  proposed_patch: Record<string, unknown>;
  status: "pending" | "approved" | "rejected";
  requested_at: string;
};

export function AdminEditRequestsPage() {
  const [items, setItems] = useState<EditRequest[]>([]);
  const [error, setError] = useState("");
  const { t, locale } = useI18n();

  useSeo({
    title: t.adminEditRequestsTitle,
    description: t.adminEditRequestsTitle,
    path: "/dashboard/admin/edits",
    lang: locale,
    index: false,
    follow: false
  });

  async function load() {
    try {
      const res = await apiGet<{ items: EditRequest[] }>("/admin/edit-requests", true);
      setItems(res.items);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function approve(id: string) {
    await apiPost(`/admin/edit-requests/${id}/approve`, undefined, true);
    await load();
  }

  async function reject(id: string) {
    await apiPost(`/admin/edit-requests/${id}/reject`, undefined, true);
    await load();
  }

  return (
    <section className="admin-page">
      <h1>{t.adminEditRequestsTitle}</h1>
      <p className="admin-lead">{t.adminEditRequestsLead}</p>
      {error && <p className="admin-message-error">{error}</p>}
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>{t.colRequest}</th>
              <th>{t.colFile}</th>
              <th>{t.colReason}</th>
              <th>{t.adminEditPatch}</th>
              <th>{t.colActions}</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td>{item.id.slice(0, 8)}</td>
                <td>{item.file_id.slice(0, 8)}</td>
                <td>{item.reason ?? "-"}</td>
                <td>
                  <code>{JSON.stringify(item.proposed_patch)}</code>
                </td>
                <td>
                  <div className="admin-actions-inline">
                    <button className="chip-btn" onClick={() => approve(item.id)}>
                      {t.approve}
                    </button>
                    <button className="chip-btn" onClick={() => reject(item.id)}>
                      {t.reject}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
