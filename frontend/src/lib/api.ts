import { supabase } from "./supabase";

const API_BASE = import.meta.env.VITE_API_BASE_URL as string;

async function authHeaders() {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function apiGet<T>(path: string, auth = false): Promise<T> {
  const headers = auth ? await authHeaders() : {};
  const res = await fetch(`${API_BASE}${path}`, { headers });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as T;
}

export async function apiPost<T>(path: string, body?: unknown, auth = false): Promise<T> {
  const headers: Record<string, string> = auth ? ((await authHeaders()) as Record<string, string>) : {};
  if (body && !(body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers,
    body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined
  });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as T;
}

export async function apiPostFormWithProgress<T>(
  path: string,
  formData: FormData,
  onProgress: (pct: number) => void
): Promise<T> {
  const headers = (await authHeaders()) as Record<string, string>;

  return new Promise<T>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API_BASE}${path}`, true);

    Object.entries(headers).forEach(([key, value]) => {
      xhr.setRequestHeader(key, value);
    });

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable || event.total <= 0) return;
      const pct = Math.min(100, Math.round((event.loaded / event.total) * 100));
      onProgress(pct);
    };

    xhr.onerror = () => {
      reject(new Error("Network error"));
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText) as T);
        } catch {
          resolve({} as T);
        }
      } else {
        reject(new Error(xhr.responseText || `HTTP ${xhr.status}`));
      }
    };

    xhr.send(formData);
  });
}

export function publicCoverUrl(fileId: string) {
  return `${API_BASE}/public/files/${fileId}/cover`;
}

export function resolveCoverUrl(fileId: string, coverPath?: string) {
  if (coverPath && /^https?:\/\//i.test(coverPath)) {
    return coverPath;
  }
  return publicCoverUrl(fileId);
}
