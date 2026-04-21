import { useEffect } from "react";

type SeoOptions = {
  title: string;
  description?: string;
  path?: string;
  index?: boolean;
  follow?: boolean;
  image?: string;
  type?: "website" | "article";
  lang?: string;
  jsonLd?: Record<string, unknown> | Array<Record<string, unknown>>;
};

const BRAND_NAME = "RepoMan";
const JSON_LD_SCRIPT_ID = "repoman-seo-jsonld";

function getSiteUrl() {
  const fromEnv = (import.meta.env.VITE_SITE_URL as string | undefined)?.trim().replace(/\/$/, "");
  if (fromEnv) return fromEnv;
  if (typeof window !== "undefined" && window.location?.origin) return window.location.origin;
  return "https://repoman.comunidaddelmanga.com";
}

function toAbsoluteUrl(pathOrUrl?: string): string {
  if (!pathOrUrl) return `${getSiteUrl()}/`;
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  const normalizedPath = pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`;
  return `${getSiteUrl()}${normalizedPath}`;
}

function upsertMeta(attrs: { name?: string; property?: string; content: string }) {
  const selector = attrs.name ? `meta[name="${attrs.name}"]` : `meta[property="${attrs.property}"]`;
  let node = document.head.querySelector<HTMLMetaElement>(selector);

  if (!node) {
    node = document.createElement("meta");
    if (attrs.name) node.setAttribute("name", attrs.name);
    if (attrs.property) node.setAttribute("property", attrs.property);
    document.head.appendChild(node);
  }

  node.setAttribute("content", attrs.content);
}

function removeMeta(attrs: { name?: string; property?: string }) {
  const selector = attrs.name ? `meta[name="${attrs.name}"]` : `meta[property="${attrs.property}"]`;
  document.head.querySelector(selector)?.remove();
}

function upsertCanonical(url: string) {
  let node = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!node) {
    node = document.createElement("link");
    node.rel = "canonical";
    document.head.appendChild(node);
  }
  node.href = url;
}

function upsertJsonLd(data?: SeoOptions["jsonLd"]) {
  const existing = document.getElementById(JSON_LD_SCRIPT_ID);
  if (!data) {
    existing?.remove();
    return;
  }

  const node = existing ?? document.createElement("script");
  node.id = JSON_LD_SCRIPT_ID;
  node.setAttribute("type", "application/ld+json");
  node.textContent = JSON.stringify(data);

  if (!existing) {
    document.head.appendChild(node);
  }
}

export function useSeo(options: SeoOptions) {
  useEffect(() => {
    const title = options.title.includes(BRAND_NAME) ? options.title : `${options.title} | ${BRAND_NAME}`;
    const description =
      options.description?.trim() ||
      "Catalogo de manga y lost media con acceso publico solo a metadatos y portadas.";
    const canonicalUrl = toAbsoluteUrl(options.path || window.location.pathname);
    const index = options.index ?? true;
    const follow = options.follow ?? true;
    const robotsValue = `${index ? "index" : "noindex"},${follow ? "follow" : "nofollow"}`;
    const ogType = options.type ?? "website";
    const locale = options.lang === "es" ? "es_ES" : "en_US";

    document.title = title;
    if (options.lang) {
      document.documentElement.lang = options.lang;
    }

    upsertMeta({ name: "description", content: description });
    upsertMeta({ name: "robots", content: robotsValue });

    upsertMeta({ property: "og:title", content: title });
    upsertMeta({ property: "og:description", content: description });
    upsertMeta({ property: "og:type", content: ogType });
    upsertMeta({ property: "og:url", content: canonicalUrl });
    upsertMeta({ property: "og:site_name", content: BRAND_NAME });
    upsertMeta({ property: "og:locale", content: locale });

    const twitterCard = options.image ? "summary_large_image" : "summary";
    upsertMeta({ name: "twitter:card", content: twitterCard });
    upsertMeta({ name: "twitter:title", content: title });
    upsertMeta({ name: "twitter:description", content: description });

    if (options.image) {
      const imageUrl = toAbsoluteUrl(options.image);
      upsertMeta({ property: "og:image", content: imageUrl });
      upsertMeta({ name: "twitter:image", content: imageUrl });
    } else {
      removeMeta({ property: "og:image" });
      removeMeta({ name: "twitter:image" });
    }

    upsertCanonical(canonicalUrl);
    upsertJsonLd(options.jsonLd);
  }, [
    options.description,
    options.follow,
    options.image,
    options.index,
    options.jsonLd,
    options.lang,
    options.path,
    options.title,
    options.type
  ]);
}
