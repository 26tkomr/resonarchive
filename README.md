# RESONA GeoTech Board

RESONA GeoTech Board is a global-first archive of literary science fiction born from reality.

It is not a news site, not a prediction dashboard, and not a risk management tool. Current events, technology shifts, capital movements and social changes exist here as raw material for stories about possible futures.

## Product Direction

- Primary language: English
- Secondary language support: planned for Japanese and other languages
- Main product: long-form speculative stories
- Supporting layers: themes, world map, signals, archive metadata
- Premium: Coming Soon only
- Payments: not implemented
- Paywalls: not implemented

Stories are generated and structured in English first. Internal routes, slugs, metadata, identifiers, theme titles and story titles are English-first.

## Implemented MVP

- Observatory home page
- Floating archive-style theme card grid
- Theme detail pages
- Story-first theme structure
- Long-form scenario fiction entries
- World map with risk/event points and relationship lines
- Story Archive page
- Story Studio page
- Premium Coming Soon page
- Responsive dark interface
- Local bookmark state
- World Shift Index as internal story-generation metadata
- Local API server for signal ingestion, OpenAI story drafting and pending archive storage

## Story System

The current MVP includes a static Story Engine designed to avoid repeated "same story, different city" output.

Each generated story varies by:

- Narrative form: diary, interview, conversation, article, email, letter, court record, AI monologue, scientific report, encyclopedia entry, audio transcript, captain's log, memoir and more
- Region and city
- Year and era
- Viewpoint character
- Emotional tone
- Theme signal
- Recurring-world hints

Story records keep:

```text
id
generatedAt
worldShiftIndex
title
year
city
country
viewpoint
theme
sourceSignals
text
```

The latest visible story is shown on the theme page. Older generated memories remain available through the archive structure.

## Premium Page

The Premium page exists as a future-facing placeholder only.

It shows:

- Full Archive
- Audio Narration
- Extended Stories
- AI Discussions
- PDF Export
- Story Collections

No payment flow, subscription flow, checkout or paywall is active.

## API Integration

The project now includes a small Node API server.

It provides:

- `GET /api/health`
- `GET /api/signals?themeId=...`
- `GET /api/stories/published`
- `POST /api/stories/draft`

The API server can:

- Serve the static web app
- Fetch Signals from GDELT as the primary source
- Use NewsAPI as an optional supplemental source when `NEWSAPI_KEY` is set
- Cache source results to avoid unnecessary API calls
- Save normalized Signals under `data/signals/{theme}.json`
- Analyze Signals with OpenAI into classifications, causal threads and Story Seeds
- Generate English story drafts from Story Seeds
- Translate English drafts into Japanese when OpenAI is configured
- Save generated stories as `draft`, not published
- Publish drafts only after review through the Studio page

Admin and generation routes require `ADMIN_TOKEN`.

Protected routes:

```text
POST /api/signals/analyze
POST /api/story-seeds
POST /api/stories/draft
GET  /api/admin/drafts
GET  /api/admin/published
POST /api/admin/publish
```

The token is sent as `Authorization: Bearer <ADMIN_TOKEN>` or `X-Admin-Token`. The Studio page stores it only in the browser local storage for review actions.

OpenAI keys are never stored in frontend code.

Signal records keep:

```text
title
source
url
region
theme
summary
publishedAt
relevanceScore
```

## Running Locally

This can run as a static HTML/CSS/JavaScript app, or through the local API server.

Open directly:

```bash
open "/Users/tkomr/Documents/New project/resona-geotech-web/index.html"
```

Or run a local server:

```bash
cd "/Users/tkomr/Documents/New project/resona-geotech-web"
python3 -m http.server 4173
```

Then open:

```text
http://localhost:4173
```

### API-connected mode

Start the Node API server:

```bash
cd "/Users/tkomr/Documents/New project/resona-geotech-web/server"
ADMIN_TOKEN="change-this" OPENAI_API_KEY="sk-..." npm run dev
```

Then open:

```text
http://localhost:4173
```

Open the Studio page:

```text
http://localhost:4173/#/studio
```

To enable GDELT-based live signals:

```bash
cd "/Users/tkomr/Documents/New project/resona-geotech-web/server"
ADMIN_TOKEN="change-this" OPENAI_API_KEY="sk-..." npm run dev
```

GDELT is the default source. To add NewsAPI as a supplemental source:

```bash
cd "/Users/tkomr/Documents/New project/resona-geotech-web/server"
ADMIN_TOKEN="change-this" OPENAI_API_KEY="sk-..." NEWSAPI_KEY="..." npm run dev
```

Without `OPENAI_API_KEY`, the server still works, stores Signals and saves local fallback drafts as `draft`.
Without `ADMIN_TOKEN`, public reading routes still work, but generation, review and publish routes return an authorization configuration error.

In Studio:

1. Open `http://localhost:4173/#/studio`
2. Paste the same `ADMIN_TOKEN` into the Admin Token field
3. Save it
4. Generate or publish drafts

Published API stories are loaded on:

```text
http://localhost:4173/#/archive
```

## Deployment

The project includes Docker and Render configuration.

Required production environment variables:

```text
ADMIN_TOKEN
OPENAI_API_KEY
GA_MEASUREMENT_ID
```

`GA_MEASUREMENT_ID` is the Google Analytics 4 measurement ID, such as `G-XXXXXXXXXX`.
It is injected into `index.html` by the Node server at request time. If it is not set, analytics is disabled and the site continues to work normally.

Optional:

```text
NEWSAPI_KEY
OPENAI_MODEL
OPENAI_TRANSLATION_MODEL
SIGNAL_CACHE_TTL_MINUTES
```

Docker:

```bash
cd "/Users/tkomr/Documents/New project/resona-geotech-web"
docker build -t resona-geotech-web .
docker run -p 4173:4173 -e ADMIN_TOKEN="change-this" -e OPENAI_API_KEY="sk-..." resona-geotech-web
```

Render:

- Use `render.yaml`
- Set `ADMIN_TOKEN` and `OPENAI_API_KEY` in Render environment variables
- Do not commit real API keys

For another device on the same Wi-Fi/LAN:

```bash
cd "/Users/tkomr/Documents/New project/resona-geotech-web"
python3 -m http.server 4173 --bind 0.0.0.0
```

Find the Mac IP address:

```bash
ipconfig getifaddr en0
```

Then open:

```text
http://<Mac-IP-address>:4173
```

If another device cannot open it, check the Wi-Fi/LAN, macOS firewall, VPN, guest network isolation, and whether the server was started with `--bind 0.0.0.0`.

## File Structure

```text
resona-geotech-web/
  index.html   Static SPA entry
  app.js       Routes, data, story engine, rendering
  styles.css   Visual system, cards, map, responsive layout
  server/      Local API server for signals and pending story generation
  data/        Signals, cache, story seeds and generated draft/published stories
  README.md    Project notes and run instructions
```

## Future Expansion

- Editorial review UI for approving pending story candidates
- Multilingual story translation pipeline
- Persistent production storage with Supabase/PostgreSQL/Firebase
- Full text search by country, region, technology, era and viewpoint
- Audio narration
- Story collections and recurring worldlines
- AI-assisted story drafting with human review
- Rich illustrated story pages
- Map-based archive exploration
