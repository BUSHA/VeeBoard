# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

VeeBoard is a lightweight Kanban board SPA — vanilla HTML/CSS/JavaScript frontend with a Cloudflare Worker backend (D1 database + R2 object storage). **No build step** for the frontend.

## Running Locally

Serve the root directory with any static server:
```bash
python -m http.server 8000
# or
npx serve .
```

There are no tests or linters.

## Backend (Cloudflare Worker)

```bash
cd cloudflare-worker
npm install
npx wrangler login
npx wrangler deploy
```

For initial setup, see `CLOUDFLARE_DEPLOY.md`.

## Architecture

### Frontend (`index.html`, `script.js`, `styles.css`, `translations.js`)

`script.js` is organized into 5 module-pattern objects:

- **Utils** — DOM helpers, color generation (deterministic hash-based), image processing (client-side WebP conversion), date utilities
- **Store** — Centralized state + persistence; communicates with the Worker API; board state is a JSON blob saved to D1
- **UI** — All DOM rendering and event handling; uses `<template>` tags for card/column markup
- **Dnd** — Drag-and-drop for cards and columns (HTML5 native API + custom auto-scroll)
- **App** — Initialization, event delegation, authentication flow

Additional modules in `script.js`: `I18n` (EN/UK translations), `DbSettings` (localStorage for worker URL, board ID, session token), `CloudflareBackend` (API wrapper), `PasswordValidator`.

### Backend (`cloudflare-worker/src/index.js`)

REST API with these endpoints: `/load`, `/auth`, `/signup`, `/profile`, `/users`, `/user`, `/save`, `/upload`, `/image`, `/delete-image`.

**Permission model**: Admins can modify board structure (columns, any card). Non-admins can only edit their own cards and move cards assigned to them between columns. Comment ownership is also enforced. Permissions are checked on both client (UI gating) and server (API enforcement).

**Session management**: 30-day token TTL, passed in request headers, stored client-side in `DbSettings`.

### Database (`cloudflare-worker/schema.sql`)

4 tables: `boards` (JSON state blob), `board_users` (profiles + admin/approval flags), `board_user_credentials` (PBKDF2 hash + salt), `board_sessions` (token + expiry).

## Key Conventions

- **No frameworks** — vanilla JS only; no bundler, no transpilation
- **CSS variables** for theming — all colors go through `--color-*` variables (supports light/dark mode)
- **Sentence case** for all UI labels
- **Optimistic UI** — state updates immediately in the DOM, then persists to backend asynchronously
- **Image uploads** — converted to WebP client-side before upload; max 4 attachments per card, 1MB each
- **Translations** — all user-visible strings go through `I18n.t('key')`; add to both `en` and `uk` in `translations.js`
- **First signup** auto-approves and grants admin rights (bootstrap mechanism)
