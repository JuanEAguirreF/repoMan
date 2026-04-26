declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

type AnalyticsEventParams = Record<string, string | number | boolean | null | undefined>;

const GA_ID = (import.meta.env.VITE_GA_MEASUREMENT_ID as string | undefined)?.trim() || "";
const GTAG_SRC = GA_ID ? `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GA_ID)}` : "";
let initialized = false;

function ensureDataLayer() {
  if (!window.dataLayer) window.dataLayer = [];
}

function ensureGtagFunction() {
  if (typeof window.gtag === "function") return;
  window.gtag = (...args: unknown[]) => {
    ensureDataLayer();
    window.dataLayer!.push(args);
  };
}

export function isAnalyticsEnabled(): boolean {
  return GA_ID.length > 0;
}

export function initAnalytics() {
  if (!isAnalyticsEnabled() || initialized) return;
  initialized = true;

  ensureDataLayer();
  ensureGtagFunction();

  const existingScript = document.querySelector<HTMLScriptElement>(`script[data-ga-id="${GA_ID}"]`);
  if (!existingScript) {
    const script = document.createElement("script");
    script.async = true;
    script.src = GTAG_SRC;
    script.dataset.gaId = GA_ID;
    document.head.appendChild(script);
  }

  window.gtag!("js", new Date());
  window.gtag!("config", GA_ID, { send_page_view: false });
}

export function trackPageView(path: string) {
  if (!isAnalyticsEnabled()) return;
  if (!initialized) initAnalytics();
  if (typeof window.gtag !== "function") return;
  window.gtag("event", "page_view", {
    page_path: path,
    page_location: window.location.href,
    page_title: document.title
  });
}

export function trackEvent(eventName: string, params?: AnalyticsEventParams) {
  if (!isAnalyticsEnabled()) return;
  if (!initialized) initAnalytics();
  if (typeof window.gtag !== "function") return;
  window.gtag("event", eventName, params ?? {});
}
