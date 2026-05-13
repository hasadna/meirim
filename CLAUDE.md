# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Meirim.org is an Israeli civic engagement platform that makes urban planning information accessible to citizens. It consists of three parts: a **crawler** (data collection from Israeli planning authorities), a **backend API** (Express.js), and a **frontend** (React). The server and client are separate packages in this monorepo (no workspace tooling).

## Common Commands

### Server (from `server/`)
```bash
npm install                    # Install dependencies
npm start                      # Start API server on port 3001
npm run serve                  # Start combined server (API + static frontend) on port 80
npm run crawl                  # Run the plan crawler
npm run watch                  # Start with nodemon (auto-reload)
npm run lint                   # ESLint with auto-fix
npm test                       # Run all tests (Mocha, requires MySQL on port 33060)
npm run test:integration       # Run integration tests in watch mode
```

Run a single test file:
```bash
NODE_ENV=test ./node_modules/.bin/mocha ./tests/unit/some_test.js --exit --require ./tests/setup.js --timeout 40000
```

Database migrations (from `server/`):
```bash
$(npm bin)/knex migrate:latest
```

### Client (from `client/`)
```bash
npm install          # Install dependencies
npm start            # Dev server on port 3000 (proxies /api to localhost:3001)
npm run build        # Production build
npx cypress open     # Open Cypress E2E test UI
```

### Test Database Setup
Tests require MySQL on port **33060** (intentionally non-standard to prevent accidental use of dev DB):
```bash
docker run -p 33060:3306 -e MYSQL_ROOT_PASSWORD=password -d mysql:5.7
```

## Architecture

### Monorepo Structure
- `server/` — Express API + crawler + data pipeline (CommonJS/Node.js)
- `client/` — React 17 SPA (Create React App via react-app-rewired)
- `cli/` — CLI install scripts
- `docs/` — Project documentation

### Server Architecture
- **Entry points**: `server/bin/api` (dev, port 3001), `server/bin/serve` (production, port 80 serving API + static files)
- **Routes**: `server/api/apiRoutes.js` — all API routes under `/api`
- **Controllers**: `server/api/controller/` — business logic. Use `wrap()` for authenticated endpoints, `publicWrapper()` for public ones
- **Models**: `server/api/model/` — Bookshelf.js ORM models extending `base_model.js`
- **Services**: `server/api/service/` — email, geocoding, database connection
- **Libraries**: `server/api/lib/` — config, logging (Winston), session, encryption, image processing
- **Database**: MySQL 5.7 with Knex migrations (`server/migrations/`) and Bookshelf ORM
- **Config**: `server/config/default.json` base config, override with `server/config/local.json` (not committed)

### Crawler Architecture
Crawlers live in `server/bin/` and scrape Israeli planning data sources:
- `iplan` — main plan crawler (Kavim Kchulim/iplan national database)
- `fetch_tree_permit` — tree permit scrapers from multiple municipalities
- `complete_mavat_data` — enriches plans from Mavat (Ministry of Interior) using Puppeteer
- `send_emails` / `send_emails_trees` — alert delivery
- `plan_status_change` — monitors plan status transitions
- `aggregate_views` — analytics aggregation

Data source scrapers are in `server/api/lib/mavat/` (national planning authority) and `server/api/lib/trees/` (per-municipality tree permits: Tel Aviv, Haifa, Hod Hasharon, Ramat Gan, Beer Sheva, Yavne).

### Client Architecture
- **State management**: Redux Toolkit with slices in `client/src/redux/` (plan, search, tree, comments, user, etc.) + Redux Persist
- **Routing**: React Router v5 in `client/src/router/`
- **UI**: Material-UI v4 with custom theme (`client/src/theme.js`) + Styled Components
- **Maps**: Mapbox GL and Leaflet/React Leaflet
- **API proxy**: `client/src/setupProxy.js` forwards `/api/*` to `localhost:3001` in development
- **Locale**: Hebrew support in `client/src/locale/`

### Testing
- **Backend**: Mocha + Chai + Sinon + Nock. Tests in `server/tests/integration/` and `server/tests/unit/`. Setup in `server/tests/setup.js`
- **Frontend E2E**: Cypress. Config in `client/cypress.json`

## Code Style

Both server and client use **tabs for indentation**, single quotes, semicolons required, Unix line breaks. The server ESLint extends `eslint:recommended`; the client extends `eslint:recommended` + `plugin:react/recommended` + `prettier`.
