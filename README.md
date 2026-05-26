# VeeBoard

VeeBoard is a lightweight Kanban board built with plain HTML, CSS, and JavaScript.
The static frontend is deployed as Cloudflare Workers assets alongside a Worker API backed by D1 and R2.

![Vibecode alert](cloudflare-worker/public/vibealert.png "Vibecode alert!")

## Features

- Columns and cards: create, rename, reorder, archive, and delete.
- Drag and drop for cards and columns on desktop.
- Rich text card descriptions with sanitized links.
- Due dates with overdue highlighting outside done/archive columns.
- User assignment with autocomplete from board users.
- Card authorship and edit metadata.
- Threaded comments on cards.
- Image attachments stored through the worker/R2.
- Archive column with toggle visibility.
- Profile editing with avatar upload.
- Admin panel for user approval, role management, and password resets.
- Password quality feedback when setting or changing passwords.
- English and Ukrainian UI.
- Responsive layout for desktop and mobile.

## Authentication And Permissions

- Users log in with email and password.
- If the board has no users yet, the first signup becomes the approved admin.
- Later signups stay pending until an admin approves them.
- Admins can manage users, columns, cards, comments, and settings.
- Non-admin users can edit or delete only their own cards.
- Non-admin users can still move cards assigned to them between columns.
- Comment edit/delete permissions are limited to the author unless the current user is an admin.

## Attachments

- Up to 4 image attachments per card.
- Images are converted to WebP on the client before upload.
- Attachments are stored through the worker and removed from R2 when deleted.

## Configuration

The deployed app uses its same-origin Worker API by default. In the app, open `Settings` only if you need to override the Worker URL or use a non-default board ID.

## Development

The frontend has no build step and lives in the Worker assets directory.

- Run the full app locally with `wrangler dev` from [`cloudflare-worker/`](/Users/busha/projects/VeeBoard/cloudflare-worker).
- Deploy the full app with `wrangler deploy` from [`cloudflare-worker/`](/Users/busha/projects/VeeBoard/cloudflare-worker).

Detailed setup steps are in [CLOUDFLARE_DEPLOY.md](/Users/busha/projects/VeeBoard/CLOUDFLARE_DEPLOY.md).

## Project Structure

- [cloudflare-worker/public/index.html](/Users/busha/projects/VeeBoard/cloudflare-worker/public/index.html): app markup and dialogs
- [cloudflare-worker/public/styles.css](/Users/busha/projects/VeeBoard/cloudflare-worker/public/styles.css): all styles
- [cloudflare-worker/public/script.js](/Users/busha/projects/VeeBoard/cloudflare-worker/public/script.js): frontend logic
- [cloudflare-worker/public/translations.js](/Users/busha/projects/VeeBoard/cloudflare-worker/public/translations.js): English and Ukrainian strings
- [cloudflare-worker/src/index.js](/Users/busha/projects/VeeBoard/cloudflare-worker/src/index.js): worker API
- [cloudflare-worker/schema.sql](/Users/busha/projects/VeeBoard/cloudflare-worker/schema.sql): database schema

## License

MIT
