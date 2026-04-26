import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { initAnalytics } from "./lib/analytics";
import "./styles.css";

const headerImageUrl = (import.meta.env.VITE_HEADER_IMAGE_URL as string | undefined)?.trim();
if (headerImageUrl) {
  let favicon = document.querySelector<HTMLLinkElement>("link[rel='icon']");
  if (!favicon) {
    favicon = document.createElement("link");
    favicon.rel = "icon";
    document.head.appendChild(favicon);
  }
  favicon.href = headerImageUrl;
}

initAnalytics();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
