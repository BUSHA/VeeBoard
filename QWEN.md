# VeeBoard - Project Context

## Project Overview

VeeBoard is a lightweight, self-hosted Kanban board application built with plain HTML, CSS, and JavaScript. It features a static frontend backed by a Cloudflare Worker that handles data persistence, user management, and file storage using Cloudflare D1 (SQLite database) and R2 (object storage).

### Core Features

- **Kanban Board**: Create, rename, reorder, archive, and delete columns and cards
- **Drag & Drop**: Cards and columns can be reordered via drag-and-drop on desktop
- **Rich Text Descriptions**: Card descriptions with sanitized links (using DOMPurify)
- **Due Dates**: With overdue highlighting for cards outside done/archive columns
- **User Assignment**: Assign cards to users with autocomplete from board users
- **Comments**: Threaded comments on cards with reply support
- **Attachments**: Up to 4 image attachments per card (auto-converted to WebP)
- **Authentication**: Email/password login with role-based permissions
- **Admin Panel**: User approval, role management, password resets
- **Bilingual UI**: English and Ukrainian translations
- **Dark/Light Theme**: Toggle between themes
- **Responsive Design**: Works on desktop and mobile

### Architecture

```
┌─────────────────┐     ┌──────────────────────┐     ┌─────────────┐
│   Frontend      │────▶│  Cloudflare Worker   │────▶│  D1 DB      │
│   (Static)      │     │  (API Layer)         │     │  (SQLite)   │
│   HTML/CSS/JS   │     │  src/index.js        │     └─────────────┘
└─────────────────┘     └──────────────────────┘     ┌─────────────┐
                          │                          │  R2 Bucket  │
                          └─────────────────────────▶│  (Storage)  │
                                                     └─────────────┘
```

## Project Structure

```
VeeBoard/
├── index.html              # Main application markup and dialogs
├── styles.css              # All CSS styles (dark/light themes)
├── script.js               # Frontend logic (~3800 lines)
├── translations.js         # English and Ukrainian UI strings
├── vibealert.png           # Hero image
├── favicon/                # Favicon and PWA assets
├── cloudflare-worker/      # Backend API
│   ├── src/index.js        # Worker API (~740 lines)
│   ├── schema.sql          # D1 database schema
│   ├── wrangler.example.json  # Wrangler config template
│   └── scripts/            # Deployment scripts
└── QWEN.md                 # This file
```

## Building and Running

### Frontend (No Build Step)

The frontend is plain HTML/CSS/JS with no build process. To run locally:

```bash
# Option 1: Using Python
python3 -m http.server 8000

# Option 2: Using Node.js
npx serve .

# Option 3: Using PHP
php -S localhost:8000
```

Then open `http://localhost:8000` in your browser.

### Backend (Cloudflare Worker)

See [CLOUDFLARE_DEPLOY.md](./CLOUDFLARE_DEPLOY.md) for detailed deployment instructions.

Quick setup:

```bash
cd cloudflare-worker

# Install wrangler (if not already installed)
npm install -g wrangler

# Login to Cloudflare
npx wrangler login

# Copy and configure wrangler.json
cp wrangler.example.json wrangler.json
# Edit wrangler.json with your D1 database_id and R2 bucket name

# Create D1 database and R2 bucket
npx wrangler d1 create veeboard_db
npx wrangler r2 bucket create veeboard-attachments

# Initialize database schema
npx wrangler d1 execute veeboard_db --remote --file=./schema.sql

# Deploy worker
npx wrangler deploy
```

After deployment, configure the frontend:
1. Open VeeBoard in browser
2. Open Settings (from dropdown menu)
3. Enter the Worker URL
4. Optionally enter a Board ID
5. Save settings

## Development Conventions

### Code Style

- **Frontend**: Vanilla JavaScript (ES6+), no frameworks or build tools
- **Module Pattern**: Code organized into modules (`Utils`, `Store`, `UI`, `Dnd`, `App`)
- **CSS**: Uses CSS custom properties (variables) for theming
- **HTML**: Semantic markup with ARIA attributes for accessibility

### Key Patterns

- **State Management**: Custom `Store` module with localStorage fallback
- **Event Handling**: Delegated events via `data-action` attributes
- **Templates**: HTML `<template>` elements for columns and cards
- **Internationalization**: `data-i18n` attributes with `TRANSLATIONS` object
- **Dialogs**: Native `<dialog>` elements for modals

### Testing Practices

- No automated test suite currently in place
- Manual testing via browser interaction
- Worker should be tested after each deployment

### Authentication & Permissions

- First user signup becomes the approved admin
- Subsequent signups require admin approval
- Non-admin users can only edit/delete their own cards
- Comment edit/delete limited to author (unless admin)
- Session-based authentication with 30-day expiry

### Data Models

**Board State** (stored in D1):
```javascript
{
  columns: [{
    id: string,
    title: string,
    isDone: boolean,
    isArchive: boolean,
    cards: [{
      id: string,
      title: string,
      description: string,
      tags: string[],
      due: string,
      assignedUser: { email, name },
      attachments: [],
      createdBy: string,
      createdByEmail: string,
      createdAt: string,
      contentChangedAt: string,
      comments: []
    }]
  }]
}
```

**User** (stored in D1):
```javascript
{
  board_id: string,
  email: string,
  name: string,
  avatar_url: string,
  avatar_key: string,
  is_admin: boolean,
  is_approved: boolean
}
```

## Configuration

### Environment Variables

No `.env` files are used. Configuration is done via:

1. **wrangler.json**: Worker name, D1 binding, R2 binding
2. **Frontend Settings Dialog**: Worker URL and Board ID (stored in localStorage)

### localStorage Keys

- `veeboard_cf_worker_url`: Cloudflare Worker URL
- `veeboard_cf_board_id`: Board ID (optional, defaults to "default")
- `veeboard_theme`: "light" or "dark"
- `veeboard_lang`: "en" or "uk"
- `veeboard_session`: Current session token

## API Endpoints (Cloudflare Worker)

The worker exposes these endpoints:

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/auth/signup` | Create user account |
| POST | `/auth/login` | Login and get session token |
| POST | `/auth/logout` | Invalidate session |
| GET | `/board/:id` | Get board state |
| PUT | `/board/:id` | Update board state |
| GET | `/users/:board_id` | List board users |
| POST | `/upload` | Upload image attachment |
| DELETE | `/upload/:key` | Delete image attachment |
| GET | `/admin/users/:board_id` | List users (admin only) |
| PUT | `/admin/users` | Update user (admin only) |

## Troubleshooting

### Common Issues

1. **Image uploads fail**: Verify R2 bucket is created and bound correctly
2. **Database errors**: Ensure D1 schema is applied (`schema.sql`)
3. **Auth issues**: Check session expiry (30 days) and password hashing
4. **CORS errors**: Worker handles CORS; ensure proper binding configuration

### Debug Tips

- Check browser console for frontend errors
- Worker logs available in Cloudflare dashboard
- Use `wrangler tail` to stream worker logs locally

## License

MIT License
