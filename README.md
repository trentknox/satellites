# Satellites

Static satellite / SEO pages for Cyber City Media projects. One folder per project.

These are standalone static HTML pages — no build step, no framework. They are designed to
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
