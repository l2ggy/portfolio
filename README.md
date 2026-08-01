# Portfolio (Cloudflare Workers)

A minimal personal portfolio site served by a Cloudflare Worker.

## Overview

This project combines:

- **Static frontend assets** in `public/` (HTML, CSS, JavaScript, and images).
- **A Worker backend** in `src/worker.js` for dynamic stats and visit tracking.
- **Cloudflare D1** for visitor analytics storage.

At runtime, the Worker serves static files through the `ASSETS` binding and exposes lightweight JSON APIs under `/api/*`.

## Architecture

### Frontend (`public/`)

- `public/index.html` contains the semantic portfolio content.
- `public/js/main.js` initializes theme, remote stats, visit tracking, and the interactive globe.

### Backend (`src/worker.js`)

The Worker provides three API routes:

- `POST /api/visit` — records a page visit (path + geo/IP metadata from Cloudflare request context).
- `GET /api/visit-stats` — returns total visits, unique visitors, and aggregated map points.
- `GET /api/stats` — fetches LeetCode + Monkeytype stats and returns a unified payload.

All non-API requests are forwarded to static assets via `env.ASSETS.fetch(request)`.

### Data layer (D1)

- SQL schema changes live in `migrations/`.
- `visits` preserves timestamp, path, IP, and location history.
- Trigger-maintained aggregate tables make visit counts and globe markers constant-cost to query.

## Configuration

`wrangler.toml` configures:

- Worker entrypoint (`src/worker.js`)
- Compatibility date
- Static assets binding (`[assets]`)
- Build hook (`scripts/sync-shared-monkeytype.mjs`)
- D1 binding (`DB`)

## Local development

### Prerequisites

- Node.js 22 or newer
- Wrangler CLI
- Cloudflare account/project setup

### Run locally

```bash
npm install
npm run db:migrate:local
npm run dev
```

If this repository is used without a full npm setup, run Wrangler directly as configured in your environment.

## Database migration and deploy

Run these commands from the repository root. Apply the D1 migration before deploying the updated Worker.

1. Confirm Node.js 22+ is active and Wrangler is signed in to the Cloudflare account that owns `portfolio-visits`:

   ```bash
   node --version
   npx wrangler --version
   npx wrangler whoami
   ```

   If needed, sign in with `npx wrangler login` and rerun `whoami`.

2. Confirm the production database identity and save the Time Travel bookmark printed by the second command as a recovery point:

   ```bash
   npx wrangler d1 info portfolio-visits
   npx wrangler d1 time-travel info portfolio-visits
   ```

   The database ID must match `wrangler.toml` before continuing.

3. List the unapplied production migrations. For the existing portfolio database, this should show only `0002_aggregate_visits.sql`:

   ```bash
   npx wrangler d1 migrations list portfolio-visits --remote
   ```

   Stop if `0001_visits.sql` or any unexpected migration appears.

4. Apply the pending migration. Confirm the prompt only after checking that the target is the remote `portfolio-visits` database and the list contains exactly `0002_aggregate_visits.sql`:

   ```bash
   npx wrangler d1 migrations apply portfolio-visits --remote
   ```

   Wrangler creates a backup first and rolls back the failing migration if an error occurs.

5. Verify that no migrations remain and that every aggregate matches the preserved raw visits:

   ```bash
   npx wrangler d1 migrations list portfolio-visits --remote
   npx wrangler d1 execute portfolio-visits --remote --command "
   SELECT
     (SELECT total_visits FROM visit_totals WHERE id = 1) =
       (SELECT COUNT(*) FROM visits) AS totals_match,
     (SELECT unique_visitors FROM visit_totals WHERE id = 1) =
       (SELECT COUNT(DISTINCT CASE
          WHEN ip IS NOT NULL AND ip != '' THEN ip
        END) FROM visits) AS unique_match,
     (SELECT COALESCE(SUM(visit_count), 0) FROM visit_locations) =
       (SELECT COUNT(*) FROM visits
        WHERE typeof(lat) IN ('integer', 'real')
          AND typeof(lon) IN ('integer', 'real')
          AND lat BETWEEN -90 AND 90
          AND lon BETWEEN -180 AND 180) AS locations_match;
   "
   ```

   The migration list should say `No migrations to apply`, and all three verification values should be `1`.

6. Deploy only after the checks above succeed:

   ```bash
   npm run deploy
   ```

## Notes

- Monkeytype parsing logic is shared across Worker and frontend via `src/shared/monkeytype.js` and synced into `public/js/shared/` during build.
- Stats endpoints are resilient: frontend falls back gracefully when external APIs are unavailable.
