import { useEffect, useState } from "react";
import { apiGet, apiPost } from "../../lib/api";
import { StatusBadge } from "../../components/StatusBadge";
import { useI18n } from "../../lib/i18n";
import { useSeo } from "../../lib/seo";

type MyFile = {
  id: string;
  title: string;
  description: string;
  category: string;
  status: "active" | "pending_review" | "rejected_review" | "pending_deletion" | "deleted";
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

  async function requestCorrection(item: MyFile) {
    const reason = window.prompt(t.editRequestReasonPrompt) || "";
    const title = window.prompt(t.editRequestTitlePrompt, item.title) || item.title;
    const description = window.prompt(t.editRequestDescriptionPrompt, item.description) || item.description;
    const category = window.prompt(t.editRequestCategoryPrompt, item.category) || item.category;

    await apiPost(
      `/files/${item.id}/edit-requests`,
      { reason, proposedPatch: { title, description, category } },
      true
    );
    await load();
  }

  async function resubmitReview(fileId: string) {
    await apiPost(`/files/${fileId}/publication-resubmit`, undefined, true);
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
                <div className="admin-actions-inline">
                  {item.status === "active" && (
                    <>
                      <button className="chip-btn" onClick={() => requestDeletion(item.id)}>
                        {t.requestDeletion}
                      </button>
                      <button className="chip-btn" onClick={() => requestCorrection(item)}>
                        {t.requestEdit}
                      </button>
                    </>
                  )}
                  {item.status === "rejected_review" && (
                    <button className="chip-btn" onClick={() => resubmitReview(item.id)}>
                      {t.resubmitReview}
                    </button>
                  )}
                  {(item.status === "pending_review" || item.status === "pending_deletion" || item.status === "deleted") && (
                    <span>{t.noActions}</span>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
