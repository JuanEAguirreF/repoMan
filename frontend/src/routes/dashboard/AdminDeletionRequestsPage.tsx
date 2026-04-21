import { useEffect, useState } from "react";
import { apiGet, apiPost } from "../../lib/api";
import { useI18n } from "../../lib/i18n";
import { useSeo } from "../../lib/seo";

type DeletionRequest = {
  id: string;
  file_id: string;
  requested_by_user_id: string;
  reason: string | null;
  status: "pending" | "approved" | "rejected";
  requested_at: string;
};

export function AdminDeletionRequestsPage() {
  const [items, setItems] = useState<DeletionRequest[]>([]);
  const [error, setError] = useState("");
  const { t, locale } = useI18n();

  useSeo({
    title: t.adminPendingTitle,
    description: t.adminPendingTitle,
    path: "/dashboard/admin/deletions",
    lang: locale,
    index: false,
    follow: false
  });

  async function load() {
    try {
      const res = await apiGet<{ items: DeletionRequest[] }>("/admin/deletion-requests", true);
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
    await apiPost(`/admin/deletion-requests/${id}/approve`, undefined, true);
    await load();
  }

  async function reject(id: string) {
    await apiPost(`/admin/deletion-requests/${id}/reject`, undefined, true);
    await load();
  }

  return (
    <section>
      <h1>{t.adminPendingTitle}</h1>
      {error && <p style={{ color: "crimson" }}>{error}</p>}
      <table width="100%" cellPadding={8}>
        <thead>
          <tr>
            <th align="left">{t.colRequest}</th>
            <th align="left">{t.colFile}</th>
            <th align="left">{t.colReason}</th>
            <th align="left">{t.colActions}</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id}>
              <td>{item.id.slice(0, 8)}</td>
              <td>{item.file_id.slice(0, 8)}</td>
              <td>{item.reason ?? "-"}</td>
              <td style={{ display: "flex", gap: 8 }}>
                <button onClick={() => approve(item.id)}>{t.approve}</button>
                <button onClick={() => reject(item.id)}>{t.reject}</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
