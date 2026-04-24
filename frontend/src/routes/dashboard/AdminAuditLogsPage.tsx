import { useEffect, useState } from "react";
import { apiGet } from "../../lib/api";
import { useI18n } from "../../lib/i18n";
import { useSeo } from "../../lib/seo";

type AuditLog = {
  id: string;
  action: string;
  target_type: string;
  target_id: string;
  metadata: Record<string, unknown>;
  created_at: string;
};

export function AdminAuditLogsPage() {
  const [items, setItems] = useState<AuditLog[]>([]);
  const [error, setError] = useState("");
  const { t, locale } = useI18n();

  useSeo({
    title: t.adminAuditTitle,
    description: t.adminAuditTitle,
    path: "/dashboard/admin/audit",
    lang: locale,
    index: false,
    follow: false
  });

  useEffect(() => {
    apiGet<{ items: AuditLog[] }>("/admin/audit-logs?limit=200", true)
      .then((res) => setItems(res.items))
      .catch((e) => setError((e as Error).message));
  }, []);

  return (
    <section className="admin-page">
      <h1>{t.adminAuditTitle}</h1>
      <p className="admin-lead">{t.adminAuditLead}</p>
      {error && <p className="admin-message-error">{error}</p>}
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>{t.uploadedAt}</th>
              <th>{t.adminAuditAction}</th>
              <th>{t.adminAuditTarget}</th>
              <th>{t.adminAuditMetadata}</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td>{new Date(item.created_at).toLocaleString()}</td>
                <td>{item.action}</td>
                <td>
                  {item.target_type}:{item.target_id}
                </td>
                <td>
                  <code>{JSON.stringify(item.metadata ?? {})}</code>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
