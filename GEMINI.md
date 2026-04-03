# VeeBoard Project Context

VeeBoard is a minimal, Trello-inspired Kanban board application designed to be lightweight, privacy-focused, and highly customizable. It uses Cloudflare D1 as its only board data store.

## Project Overview
- **Purpose:** A personal productivity tool for managing tasks using a Kanban-style board.
- **Architecture:** 
    - **Frontend:** Single-page application (SPA) built with vanilla HTML, CSS, and JavaScript.
    - **Persistence:** Uses **Cloudflare D1** via a Cloudflare Worker for board data.
- **Main Technologies:**
    - HTML5 / CSS3 / JavaScript (ES6+)
    - Cloudflare Workers, D1 (Database), and R2 (Storage)
    - Native HTML5 Drag and Drop API

## Key Files & Directories
- `index.html`: Entry point of the application.
- `script.js`: Core application logic, organized into modules (Utils, Store, UI, Dnd, App).
- `styles.css`: All styling, including light and dark mode support.
- `translations.js`: i18n data supporting English (`en`) and Ukrainian (`uk`).
- `cloudflare-worker/`: Contains the backend code for Cloudflare D1 synchronization.
    - `src/index.js`: Worker logic for D1 (`/load`, `/save`) and R2 (`/upload`, `/delete-image`, `/image`).
    - `wrangler.json`: Configuration for Cloudflare Worker including D1 and R2 bindings.
    - `schema.sql`: Database schema for D1.

## Building and Running

### Frontend
The frontend is a static site and does not require a build step.
- **Running locally:** Use any static file server.
    - `npx serve .`
    - `python -m http.server 8000`
    - Or simply open `index.html` in a browser.

### Cloudflare Worker (Backend)
Required only if cloud synchronization is enabled.
1. **Navigate to directory:** `cd cloudflare-worker`
2. **Install dependencies:** `npm install` (if applicable, though it's mostly wrangler-based).
3. **Authentication:** `npx wrangler login`
4. **Deploy:** `npx wrangler deploy`
5. **Database Initialization:** `npx wrangler d1 execute veeboard_db --remote --file=./schema.sql`
6. **R2 Setup:** Create the bucket named `veeboard-attachments`:
    - `npx wrangler r2 bucket create veeboard-attachments`

## Development Conventions
- **No Frameworks:** Strictly vanilla JavaScript and CSS. Avoid adding heavy libraries unless absolutely necessary.
- **Modular JavaScript:** `script.js` is structured into several functional modules. Maintain this structure for readability.
- **I18n:** All user-facing strings must be added to `translations.js` for both supported languages. Use `I18n.t('key')` in the code.
- **Capitalization:** Avoid redundant capitalization in UI labels. Use sentence case unless it's a proper noun or specific brand name (e.g., "Cloudflare D1").
- **Styling:** Adhere to the existing CSS variables in `styles.css` for consistent theming. Do not use hover effects or scaling on UI elements as per global preferences.
- **Persistence:** Ensure all state changes are synchronized with Cloudflare D1.

## Image Management
- **Limits:** Maximum 4 pictures per card, each limited to 5MB.
- **Processing:** Client-side conversion to **WebP** is required before upload to save space.
- **Lifecycle:** Images are automatically deleted from R2 when the associated card or picture is removed.
- **Authorization:** Requires Board ID and API Key (passed in headers for API calls and query params for direct image URLs).

## User & Tag Management
- **Autocomplete:** Smart autocomplete triggers on focus and typing. It dynamically pulls users or tags directly from the board's existing data to build comprehensive suggestions.
- **Visuals:** Tags and assigned users share a procedural color-generation algorithm (`Utils.colorFromString`) to provide consistent, randomized colors without hardcoded mappings.
- **Cloudflare D1 users:** Users are stored in the board state with `name` and `pinCode`. Non-admin users may self-register through the D1 settings flow.

## D1 Card Ownership Rules
- **Authorship metadata:** New cards record `createdBy`, `createdAt`, `lastChanged`, `contentChangedAt`, and `positionChangedAt`. Older cards backfill `createdBy` on first save.
- **Footer metadata:** Card footers display `Created` or `Edited` with the author badge and timestamp. Column moves do not count as content edits.
- **Permissions:** Admin can manage all cards and users. Non-admin users can edit or delete only cards where `createdBy` matches their own name.
- **Assigned-card moves:** A non-admin user may still move cards assigned to them between columns, including mark-done / undo flows, but may not edit the card fields unless they are the owner.
- **Enforcement:** These rules are enforced both in the frontend and in `cloudflare-worker/src/index.js`. If rules change, keep both layers aligned.

## UI / UX Architecture Context
- **Forms & Buttons:** Editor dialogues use `display: flex; flex-direction: column` for main structural layout, with `.actions-main` and `.actions-extra` container classes to robustly segment secondary operators (Archive, Mark Done) from primary operators (Save, Cancel). This avoids grid-related visual bugs, enforcing a consistent layout across mobile displays.

## Roadmap / TODOs
- [ ] Enhance data export/import validation.
