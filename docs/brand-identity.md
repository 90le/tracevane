# Tracevane domain and identity direction

Last checked: 2026-07-06 (Asia/Shanghai). This is product/brand execution evidence, not legal or registrar advice; register the chosen domain before public launch and run trademark clearance before external marketing.

## Recommended domain

**Primary registration target: `tracevane.com`**

Why this is the strongest fit:

- Exact-match `.com` for the product name; no prefix, suffix, hyphen, or TLD explanation needed.
- Distinctive coined compound: `trace` (evidence, execution trail, diagnostics) + `vane` (direction, control, routing), which matches Tracevane's local AI agent control workbench positioning.
- Easy spoken handoff in English and Chinese teams: “Tracevane dot com”.
- Leaves room for the product to expand beyond developer-only surfaces; `.dev` is a useful defensive redirect but too narrow as the main public home.

## Availability evidence

RDAP checks through `https://rdap.org/domain/<domain>` returned no domain record (`404`) for the core shortlist below, and local host resolution returned no active host records for the same names. Registrar state can change at any time; register immediately if accepted.

| Candidate | Evidence observed | Recommendation |
| --- | --- | --- |
| `tracevane.com` | RDAP no record; no local host record | **Register first / canonical public domain** |
| `tracevane.dev` | RDAP no record; no local host record | Defensive redirect for developer docs |
| `tracevane.app` | RDAP no record; no local host record | Defensive redirect for app download/product page |
| `tracevane.io` | RDAP no record; no local host record | Optional startup-style redirect if budget allows |
| `tracevane.co` | RDAP no record; no local host record | Lower priority typo/alternate |
| `tracevane.so` | RDAP no record; no local host record | Lower priority; can feel SaaS/community oriented |

Rejected or lower-confidence directions:

- `gettracevane.com`, `trytracevane.com`, `tracevanehq.com`: only needed if exact-match `.com` becomes unavailable.
- `trace-vane.com`: hyphen weakens recall and makes spoken handoff error-prone.
- Generic `trace*` alternatives: current market has many “Trace”/observability/agent products, so preserving the full coined name is safer and more ownable.

## Identity route selected

**Route: Signal Vane**

The selected mark is a small-size-first compass-vane arrow riding over a traced execution path. It intentionally combines:

- **Trace path** — evidence trail, run history, and debugging visibility.
- **Vane arrow** — direction, routing, and human-controlled steering.
- **Aurora teal + warm signal accent** — maps to the existing Tracevane/Aurora product palette while keeping enough contrast for favicons and dense IDE surfaces.
- **Rounded app tile** — reads as a browser icon, extension icon, and sidebar product mark without needing the full wordmark.

Avoided directions:

- Generic mountain/landscape icons, which felt decorative and less tied to the control/evidence product promise.
- Plain “T” monograms, which were too generic at favicon size.
- Overly detailed circuit/agent motifs, which collapse in browser tabs and can date quickly.
- Fake seals, certification badges, partner marks, or taglines.

## Asset inventory

Production assets now live in two places:

- `apps/web/public/` — browser/runtime assets served by the Vite app.
- `assets/brand/` — repo-level brand source pack for landing page, release notes, and external handoff.

Created/updated assets:

- `apps/web/public/favicon.svg`
- `apps/web/public/favicon.ico`
- `apps/web/public/favicon-16.png`
- `apps/web/public/favicon-32.png`
- `apps/web/public/apple-touch-icon.png`
- `apps/web/public/icon-192.png`
- `apps/web/public/icon-512.png`
- `apps/web/public/site.webmanifest`
- `apps/web/public/brand/tracevane-mark.svg`
- `apps/web/public/brand/tracevane-lockup.svg`
- matching repo-level copies under `assets/brand/`

## Usage rules

- Use `tracevane-mark.svg` for square app marks, sidebars, favicons, extension tiles, and social avatars.
- Use `tracevane-lockup.svg` for website headers, docs covers, release pages, and slides where the product name needs to be visible.
- Keep the mark on solid white, Aurora-mint, graphite, or dark navy backgrounds. Avoid placing it over busy gradients without a solid tile.
- Do not redraw the vane or trace path independently; use the SVG source to preserve small-size recognition.
- If the domain is registered, canonicalize public links to `https://tracevane.com` and redirect `.dev`/`.app` to the relevant docs/download pages.
