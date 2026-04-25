import { useEffect, useState } from "react";
import { apiGet, apiPost } from "../../lib/api";
import { useI18n } from "../../lib/i18n";
import { useSeo } from "../../lib/seo";
import { resolveCoverUrl } from "../../lib/api";
import { supabase } from "../../lib/supabase";

type PublicationRequest = {
  id: string;
  title: string;
  slug: string;
  category: string;
  status: "pending_review";
  owner_user_id: string;
  created_at: string;
  cover_image_path?: string;
  mime_type?: string;
  file_size_bytes?: number;
  original_filename?: string;
  has_backup?: boolean;
};

type ReviewTreeNode = {
  type: "file" | "folder";
  name: string;
  path: string;
  children?: ReviewTreeNode[];
};

type ReviewTreeResponse = {
  file: {
    id: string;
    title: string;
    originalFilename: string;
    mimeType: string;
    sizeBytes: number;
  };
  inspection: {
    format: "zip" | "rar" | "pdf" | "other";
    nodes: ReviewTreeNode[];
    summary: {
      files: number;
      folders: number;
      totalEntries: number;
      truncated: boolean;
    };
    warnings: string[];
  };
};

type DownloadTokenResponse = {
  token: string;
  expiresAt: string;
  ttlSeconds: number;
};

const API_BASE = import.meta.env.VITE_API_BASE_URL as string;

function formatBytes(bytes?: number): string {
  const value = Number(bytes ?? 0);
  if (!Number.isFinite(value) || value <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let size = value;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  const digits = size >= 100 || unit === 0 ? 0 : size >= 10 ? 1 : 2;
  return `${size.toFixed(digits)} ${units[unit]}`;
}

function TreeNodeView({ node }: { node: ReviewTreeNode }) {
  if (node.type === "file") {
    return <li className="review-tree-file">{node.name}</li>;
  }

  return (
    <li className="review-tree-folder">
      <span>{node.name}</span>
      {node.children && node.children.length > 0 && (
        <ul className="review-tree-list">
          {node.children.map((child) => (
            <TreeNodeView key={child.path} node={child} />
          ))}
        </ul>
      )}
    </li>
  );
}

export function AdminPublicationRequestsPage() {
  const [items, setItems] = useState<PublicationRequest[]>([]);
  const [error, setError] = useState("");
  const [treeLoadingId, setTreeLoadingId] = useState<string | null>(null);
  const [downloadLoadingId, setDownloadLoadingId] = useState<string | null>(null);
  const [reviewTree, setReviewTree] = useState<ReviewTreeResponse | null>(null);
  const [reviewTreeOpen, setReviewTreeOpen] = useState(false);
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

  async function openTree(fileId: string) {
    try {
      setTreeLoadingId(fileId);
      setError("");
      const res = await apiGet<ReviewTreeResponse>(`/admin/publication-requests/${fileId}/content-tree`, true);
      setReviewTree(res);
      setReviewTreeOpen(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setTreeLoadingId(null);
    }
  }

  async function downloadForReview(fileId: string) {
    try {
      setDownloadLoadingId(fileId);
      setError("");
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error("Unauthorized");

      const downloadToken = await apiPost<DownloadTokenResponse>(
        `/admin/publication-requests/${fileId}/download-token`,
        undefined,
        true
      );
      if (!downloadToken?.token) throw new Error("Could not issue a secure download token.");

      const res = await fetch(
        `${API_BASE}/admin/publication-requests/${fileId}/download?token=${encodeURIComponent(downloadToken.token)}`,
        {
        headers: { Authorization: `Bearer ${token}` }
        }
      );
      if (!res.ok) throw new Error(await res.text());

      const blob = await res.blob();
      const contentDisposition = res.headers.get("content-disposition") || "";
      const filenameMatch = contentDisposition.match(/filename="([^"]+)"/i);
      const filename = filenameMatch?.[1] || `review-${fileId}`;

      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setDownloadLoadingId(null);
    }
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
              <th>{t.adminReviewCover}</th>
              <th>{t.colTitle}</th>
              <th>{t.adminReviewFile}</th>
              <th>{t.colCategory}</th>
              <th>{t.uploadedAt}</th>
              <th>{t.colActions}</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td>
                  <img className="admin-publication-cover" src={resolveCoverUrl(item.id, item.cover_image_path)} alt={item.title} />
                </td>
                <td>
                  <strong>{item.title}</strong>
                  <div className="meta-line">{item.slug}</div>
                </td>
                <td>
                  {item.has_backup ? (
                    <>
                      <div>{item.original_filename || "-"}</div>
                      <div className="meta-line">{formatBytes(item.file_size_bytes)} · {item.mime_type || "application/octet-stream"}</div>
                    </>
                  ) : (
                    <span className="meta-line">{t.adminReviewNoBackup}</span>
                  )}
                </td>
                <td>{item.category}</td>
                <td>{new Date(item.created_at).toLocaleString()}</td>
                <td>
                  <div className="admin-actions-inline">
                    {item.has_backup && (
                      <>
                        <button className="chip-btn" onClick={() => openTree(item.id)} disabled={treeLoadingId === item.id}>
                          {treeLoadingId === item.id ? t.adminReviewLoadingTree : t.adminReviewViewTree}
                        </button>
                        <button
                          className="chip-btn"
                          onClick={() => downloadForReview(item.id)}
                          disabled={downloadLoadingId === item.id}
                        >
                          {downloadLoadingId === item.id ? t.adminReviewPreparing : t.adminReviewDownload}
                        </button>
                      </>
                    )}
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
      {reviewTreeOpen && reviewTree && (
        <div className="success-modal-backdrop" role="dialog" aria-modal="true">
          <div className="success-modal-card admin-review-tree-modal">
            <h3>{t.adminReviewTreeTitle}</h3>
            <p>
              <strong>{reviewTree.file.title}</strong><br />
              {reviewTree.file.originalFilename} · {formatBytes(reviewTree.file.sizeBytes)} · {reviewTree.file.mimeType}
            </p>
            <p className="meta-line">
              {t.adminReviewTreeFormat}: {reviewTree.inspection.format.toUpperCase()} · {t.adminReviewTreeEntries}:{" "}
              {reviewTree.inspection.summary.totalEntries} · {t.adminReviewTreeFiles}: {reviewTree.inspection.summary.files} ·{" "}
              {t.adminReviewTreeFolders}: {reviewTree.inspection.summary.folders}
            </p>
            {reviewTree.inspection.warnings.length > 0 && (
              <div className="admin-message-error">
                {reviewTree.inspection.warnings.map((warning) => (
                  <div key={warning}>{warning}</div>
                ))}
              </div>
            )}
            <div className="review-tree-wrap">
              <ul className="review-tree-list">
                {reviewTree.inspection.nodes.map((node) => (
                  <TreeNodeView key={node.path} node={node} />
                ))}
              </ul>
            </div>
            <div className="success-modal-actions">
              <button type="button" className="ghost-btn" onClick={() => setReviewTreeOpen(false)}>
                {t.adminReviewTreeClose}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
