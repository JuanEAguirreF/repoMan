import { useEffect, useState } from "react";
import { apiGet } from "../../lib/api";
import { StatusBadge } from "../../components/StatusBadge";
import { useI18n } from "../../lib/i18n";

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
  const { t } = useI18n();

  useEffect(() => {
    apiGet<{ items: AdminFile[] }>("/admin/files", true).then((res) => setItems(res.items));
  }, []);

  return (
    <section>
      <h1>{t.adminAllFilesTitle}</h1>
      <table width="100%" cellPadding={8}>
        <thead>
          <tr>
            <th align="left">{t.colTitle}</th>
            <th align="left">{t.colOwner}</th>
            <th align="left">{t.colCategory}</th>
            <th align="left">{t.colStatus}</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id}>
              <td>{item.title}</td>
              <td>{item.owner_label || item.owner_email || item.owner_display_name || item.owner_user_id}</td>
              <td>{item.category}</td>
              <td>
                <StatusBadge status={item.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
