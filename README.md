# Satellites

Static satellite / SEO pages for Cyber City Media projects. One folder per project.

These are standalone static HTML pages with no framework. They are designed to
be indexed by search engines and LLM crawlers, and to link back to the main project sites.

## Projects

| Folder | Project | Main site | Status |
|--------|---------|-----------|--------|
| `hov/` | House of Vibes | https://houseofvibes.app | live |
| `ccm/` | Cyber City Media | https://cybercitymedia.com | live |

Each folder contains:

- `index.html` — the satellite page (structured data + FAQ + curated links)
- `llms.txt` — a plain-text summary for LLM crawlers

## Routing

`vercel.json` rewrites each folder to its own path prefix:

- `/` → root hub
- `/hov` → `hov/index.html`
- `/ccm` → `ccm/index.html`
- `/hov/llms.txt`, `/ccm/llms.txt` → the LLM summaries

Custom domains are wired only after the owner picks them. Until then the pages serve on the
Vercel project URL.

## Rules

- No domain purchase, no paid plan, no changes to the main sites.
- Backlinks to the main sites are allowed.
- Content is curated from public sources; each entry links to its original.

## Adding a project

1. Create `<project>/index.html` and `<project>/llms.txt`.
2. Add a rewrite pair in `vercel.json`.
3. Add a row to the table above and a link on the root hub.

## Optional analytics source preparation

`npm ci` installs the pinned `@vercel/analytics` 2.0.1 SDK and build tool. Node 22 or newer
is required. `npm test` runs inert privacy and static-preservation checks; `npm run build`
copies the existing public files into `dist/` and compiles one local vanilla adapter.
Add new public files to `scripts/build.mjs` when adding a project.

Collection is explicitly **OFF** in `src/public-analytics.mjs`. While OFF, the HTML output
is byte-for-byte unchanged and no adapter or collector script is added to any page.
The candidate Vercel build settings only select this static output; they do not enable
Web Analytics or change a provider plan.

Any future activation needs separate source/privacy and hosting review. The prepared
guard admits only `https://satellites-silk.vercel.app` at `/`, `/hov`, and `/ccm`, with clean
URLs/referrers, available storage, no saved `__va_attribution`, and no browser privacy
signal or explicit opt-out. The dedicated preference key is
`satellites_public_analytics_opt_out_v1` (`1` opts out, `0` or absent does not). No preference
UI or writes are included; their future integration remains unperformed. Automatic
tracking is disabled and custom events are rejected. No live ingestion, consent UI,
collector revocation lifecycle, preview or production acceptance is claimed.
