import { useEffect, useState } from "react";
import { apiGet, apiPost } from "../../lib/api";
import { StatusBadge } from "../../components/StatusBadge";
import { useI18n } from "../../lib/i18n";
import { useSeo } from "../../lib/seo";

type MyFile = {
  id: string;
  title: string;
  category: string;
  status: "active" | "pending_deletion" | "deleted";
  mime_type: string;
  file_size_bytes: number;
  created_at: string;
};

export function MyFilesPage() {
  const [items, setItems] = useState<MyFile[]>([]);
  const [error, setError] = useState("");
  const { t, locale } = useI18n();

  useSeo({
    title: t.myFilesTitle,
    description: t.myFilesTitle,
    path: "/dashboard/files",
    lang: locale,
    index: false,
    follow: false
  });

  async function load() {
    try {
      const res = await apiGet<{ items: MyFile[] }>("/files/me", true);
      setItems(res.items);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function requestDeletion(fileId: string) {
    await apiPost(`/files/${fileId}/deletion-requests`, { reason: "Requested by uploader" }, true);
    await load();
  }

  return (
    <section>
      <h1>{t.myFilesTitle}</h1>
      {error && <p style={{ color: "crimson" }}>{error}</p>}
      <table width="100%" cellPadding={8}>
        <thead>
          <tr>
            <th align="left">{t.colTitle}</th>
            <th align="left">{t.colCategory}</th>
            <th align="left">{t.colStatus}</th>
            <th align="left">{t.colActions}</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id}>
              <td>{item.title}</td>
              <td>{item.category}</td>
              <td>
                <StatusBadge status={item.status} />
              </td>
              <td>
                {item.status === "active" ? (
                  <button onClick={() => requestDeletion(item.id)}>{t.requestDeletion}</button>
                ) : (
                  <span>{t.noActions}</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
