import { useEffect, useState } from "react";
import { apiGet, apiPost } from "../../lib/api";
import { useI18n } from "../../lib/i18n";
import { useSeo } from "../../lib/seo";

type PublicationRequest = {
  id: string;
  title: string;
  slug: string;
  category: string;
  status: "pending_review";
  owner_user_id: string;
  created_at: string;
};

export function AdminPublicationRequestsPage() {
  const [items, setItems] = useState<PublicationRequest[]>([]);
  const [error, setError] = useState("");
  const { t, locale } = useI18n();

  useSeo({
    title: t.adminPublicationPendingTitle,
    description: t.adminPublicationPendingTitle,
    path: "/dashboard/admin/publications",
    lang: locale,
    index: false,
    follow: false
  });

  async function load() {
    try {
      const res = await apiGet<{ items: PublicationRequest[] }>("/admin/publication-requests", true);
      setItems(res.items);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function approve(fileId: string) {
    await apiPost(`/admin/publication-requests/${fileId}/approve`, undefined, true);
    await load();
  }

  async function reject(fileId: string) {
    await apiPost(`/admin/publication-requests/${fileId}/reject`, undefined, true);
    await load();
  }

  return (
    <section className="admin-page">
      <h1>{t.adminPublicationPendingTitle}</h1>
      <p className="admin-lead">{t.adminPublicationPendingLead}</p>
      {error && <p className="admin-message-error">{error}</p>}
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>{t.colTitle}</th>
              <th>{t.colCategory}</th>
              <th>{t.uploadedAt}</th>
              <th>{t.colActions}</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td>{item.title}</td>
                <td>{item.category}</td>
                <td>{new Date(item.created_at).toLocaleString()}</td>
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
