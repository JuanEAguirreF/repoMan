# RepoMan Improvements Backlog

This document tracks future improvements that are intentionally postponed to keep the current release stable.

## 1) SEO + Performance: Hybrid Prerender for Public Pages

### Status
- Planned (future iteration)

### Goal
- Improve SEO crawlability and first paint performance without sacrificing dynamic catalog freshness.

### Why this approach
- The homepage (`/`) contains dynamic catalog data and live search behavior.
- Fully static prerender of the full catalog would become stale unless rebuilt often.
- Runtime SSR would increase server CPU/RAM usage and operational complexity.

### Proposed strategy
- Prerender only the **static shell** of `/`:
  - Header
  - Hero
  - Layout structure
  - Base SEO metadata
- Keep catalog content dynamic via existing API calls:
  - `GET /api/public/files`
  - `GET /api/public/files/:slug` (or current public detail endpoint)
- Keep search client-side using fresh API data.

### Cache strategy (recommended)
- Keep HTML shell cache-friendly.
- Apply short API caching with revalidation:
  - `Cache-Control: public, max-age=30, stale-while-revalidate=120`
- Continue cache invalidation already present in backend when:
  - new file is published
  - deletion state changes visibility
  - admin approves/rejects requests affecting listing visibility

### Expected server impact
- Runtime impact: low (close to current behavior)
- Build impact: slightly higher (prerender step)
- Operational risk: low compared to full SSR runtime

### Scope for first iteration
- Include prerender shell for:
  - `/`
  - `/que-es-repoman`
  - `/faq`
- Keep detail pages dynamic at first.
- Optionally prerender top-N detail pages later.

### Risks and mitigations
- Risk: stale homepage content if catalog is embedded in HTML.
  - Mitigation: do not embed full catalog in prerendered HTML; fetch via API.
- Risk: duplicate SEO signals between dynamic and static metadata.
  - Mitigation: ensure canonical URL consistency and keep metadata centralized.

### Acceptance criteria
- Public pages retain current behavior and freshness.
- New uploads appear on homepage without rebuild.
- Lighthouse/PSI improves for initial render metrics.
- No measurable increase in backend CPU under normal traffic.

### Revisit checklist
- Confirm deployment pipeline supports prerender artifacts.
- Validate API caching headers in production.
- Run Rich Results + Lighthouse after rollout.
- Compare server metrics before/after (CPU, memory, latency).

