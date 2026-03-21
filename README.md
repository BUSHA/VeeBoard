# VeeBoard

VeeBoard is a minimal Trello-like Kanban board built with **HTML + CSS + JavaScript**.
No frameworks, no backend — works entirely in the browser with **IndexedDB** persistence. With optional Cloudflare D1 database support.

### No clouds - your data belongs to you!

![Vibecode alert](vibealert.png "Vibecode alert!")

### Created with AI, may contain glitches

## Features

- **Columns & Cards** — Create, rename, reorder, and delete columns. Add, edit, move, archive and delete cards.
- **Drag & Drop** — Move cards and columns using native HTML5 drag-and-drop.
- **Due Date Tracking** — Set a precise due date and time for any card to track deadlines. All content is sanitized for security.
- **Rich Text Description** — The card description supports bold text (**Cmd/Ctrl+B**) and hyperlinks. Create links by pasting a URL onto selected text, and remove them with **Cmd/Ctrl+K**. All content is sanitized for security.
- **Card Editor** — A simple popup form for editing a card's title, rich text description, due date, users, and tags.
- **User Assignment** — Assign users to tasks with smart autocomplete that suggests existing users on your board.
- **Image Attachments** — Attach up to 4 images per card (auto-converted to WebP for optimization).
- **Filtering & Search** — Filter cards effortlessly by clicking tags or user avatars, or use the instant search bar for finding titles and descriptions.
- **Theme Toggle** — Light and dark modes with saved preference.
- **Mobile Support** — Responsive layout adapted for mobile screens with specialized action menus and forms.
- **Multi-language support** — Works in English and Ukrainian.

## How It Works

- **Storage:** All board data is saved in **IndexedDB** (with automatic migration from localStorage). Small settings (theme, language) use `localStorage`. Or you can use your own Cloudflare D1 database.
- **Customizable:** Modify `styles.css` and `script.js` to fit your needs.
- **Offline-ready:** Runs locally or from any static hosting provider.

## Demo

**[Live demo](https://busha.github.io/VeeBoard)** (not just a demo, actually a fully functional deployment that you can use with your database)

---

**License:** MIT — free to use and modify.
