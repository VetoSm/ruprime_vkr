# Website Baseline Audit (2026-04-15)

## Scope
- Requested: add baseline website essentials except email verification and password recovery.
- Services reviewed: frontend, auth, core, ml, llm.

## Before vs After

### 1) Public UX baseline
- **Before:** no dedicated `404` page, wildcard redirected to `/`.
- **After:** added `NotFound` page and routed `*` to it.

### 2) Legal and trust pages
- **Before:** no dedicated pages for privacy/terms/contacts/about.
- **After:** added routes and pages:
  - `/about`
  - `/contacts`
  - `/privacy`
  - `/terms`

### 3) Footer and discoverability
- **Before:** no global informational footer.
- **After:** added reusable `SiteFooter` and included in both public and authenticated layouts.

### 4) SEO/indexing basics
- **Before:** minimal HTML head, no robots/sitemap/manifest.
- **After:**
  - improved `index.html` metadata (`description`, `theme-color`, favicon)
  - added `public/robots.txt`
  - added `public/sitemap.xml`
  - added `public/site.webmanifest`
  - added `public/favicon.svg`

### 5) Client-side resilience
- **Before:** no app-level error boundary.
- **After:** added `AppErrorBoundary` + global runtime error tracking hooks.

### 6) Telemetry/events
- **Before:** no centralized frontend telemetry channel.
- **After:**
  - frontend: `trackEvent()` utility + page views + API 5xx signals + runtime errors
  - backend: new endpoint `POST /public/client-event` in core

### 7) Session management UX
- **Before:** backend had `/auth/logout-all`, no UI control.
- **After:** added "Выйти на всех устройствах" in player settings page.

### 8) Security baseline (headers + CORS)
- **Before:** `allow_origins=["*"]` in all services; no common response security headers.
- **After:**
  - switched to env-based `CORS_ORIGINS` in `auth/core/ml/llm`
  - added security headers middleware in each service:
    - `X-Content-Type-Options`
    - `X-Frame-Options`
    - `Referrer-Policy`
    - `Permissions-Policy`
  - auth additionally sets `Cache-Control: no-store`

### 9) Rate limiting baseline
- **Before:** no rate limiting for auth/public telemetry.
- **After:**
  - auth in-memory rate limit on:
    - `POST /auth/register`
    - `POST /auth/login`
    - `POST /auth/refresh`
  - core in-memory rate limit on:
    - `POST /public/client-event`

### 10) Accessibility quick wins
- **Before:** some icon buttons without explicit labels.
- **After:** added `aria-label` to key icon/action buttons in layout/profile.

## Explicitly out of scope (as requested)
- Email confirmation flow
- Password recovery flow

## Follow-up recommendations (next iteration)
- Persisted/distributed rate limit (Redis) for multi-instance deployments.
- CSP (`Content-Security-Policy`) rollout after inventory of allowed domains.
- Dedicated status page and synthetic uptime checks.
- CI check for broken links and sitemap freshness.
