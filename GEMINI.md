# VeeBoard+ Project Context

VeeBoard+ is a minimal, Trello-inspired Kanban board application designed to be lightweight, privacy-focused, and highly customizable. It operates primarily as a client-side application with optional cloud synchronization.

## Project Overview
- **Purpose:** A personal productivity tool for managing tasks using a Kanban-style board.
- **Architecture:** 
    - **Frontend:** Single-page application (SPA) built with vanilla HTML, CSS, and JavaScript.
    - **Persistence:** Uses **IndexedDB** for main board state (with automatic migration from `localStorage`). Small settings (theme, language) still use `localStorage` for simplicity.
    - **Cloud Sync (Optional):** Integration with Cloudflare D1 via a Cloudflare Worker for cross-device synchronization.
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
- **Capitalization:** Avoid redundant capitalization in UI labels. Use sentence case (e.g., "Browser storage", "Database & sync") unless it's a proper noun or specific brand name (e.g., "Cloudflare D1").
- **Styling:** Adhere to the existing CSS variables in `styles.css` for consistent theming. Do not use hover effects or scaling on UI elements as per global preferences.
- **Persistence:** Ensure all state changes are synchronized with the active `Store` provider (Local or Cloud).

## Image Management
- **Limits:** Maximum 4 pictures per card, each limited to 1MB.
- **Processing:** Client-side conversion to **WebP** is required before upload to save space.
- **Lifecycle:** Images are automatically deleted from R2 when the associated card or picture is removed.
- **Authorization:** Requires Board ID and API Key (passed in headers for API calls and query params for direct image URLs).

## Roadmap / TODOs
- [ ] Add more comprehensive mobile touch support for drag-and-drop.
- [ ] Enhance data export/import validation.
