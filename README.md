# VeeBoard

VeeBoard is a minimal Trello-like Kanban board built with **HTML + CSS + JavaScript**.
No frameworks, no backend — works entirely in the browser with **localStorage** persistence.

### No clouds - your data belongs to you!

![Vibecode alert](vibealert.png "Vibecode alert!")

### Created with AI, may contain glitches

## Features

- **Columns & Cards** — Create, rename, reorder, and delete columns. Add, edit, move, archive and delete cards.
- **Drag & Drop** — Move cards and columns using native HTML5 drag-and-drop.
- **Due Date Reminders & Notifications** — Set a reminder for any card with a precise due date and time. A Service Worker sends a persistent browser notification at a specified time (e.g., 30 minutes before), which works even if the tab is closed.
- **Rich Text Description** — The card description supports bold text (**Cmd/Ctrl+B**) and hyperlinks. Create links by pasting a URL onto selected text, and remove them with **Cmd/Ctrl+K**. All content is sanitized for security.
- **Card Editor** — A simple popup form for editing a card's title, rich text description, due date, and tags.
- **Tag Filtering** — Clickable tags to filter visible cards.
- **Search** — Instant search to filter cards by title, description, or tags.
- **Theme Toggle** — Light and dark modes with saved preference.
- **Basic Mobile Support** — Works on mobile devices, but experience is optimized for desktop.

## How It Works

- **Storage:** All board data is saved in `localStorage`.
- **Customizable:** Modify `styles.css` and `app.js` to fit your needs.
- **Offline-Ready:** Runs locally or from any static hosting provider.

## Demo

**[Live demo](https://busha.github.io/VeeBoard)** (not just a demo, actually a working version that you can use)

---

**License:** MIT — free to use and modify.
