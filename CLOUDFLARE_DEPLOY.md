# Cloudflare Worker Deployment Guide

This project deploys the static VeeBoard frontend and Worker API as one Cloudflare Worker project.
The worker expects:

- a D1 database bound as `DB`
- an R2 bucket bound as `BUCKET`
- optional Resend settings for email notifications

## 1. Prerequisites

- A Cloudflare account
- `wrangler` installed

```bash
npm install -g wrangler
```

## 2. Create Cloudflare Resources

```bash
# Log in
npx wrangler login

# Create the D1 database
npx wrangler d1 create veeboard_db

# Create the R2 bucket for attachments
npx wrangler r2 bucket create veeboard-attachments
```

Save the D1 `database_id` returned by the create command.

## 3. Configure Wrangler

The repo includes [cloudflare-worker/wrangler.example.json](/Users/busha/projects/VeeBoard/cloudflare-worker/wrangler.example.json).

Create your real config from it:

```bash
cd cloudflare-worker
cp wrangler.example.json wrangler.json
```

Then edit `wrangler.json`:

1. Replace `REPLACE_WITH_YOUR_D1_DATABASE_ID` with your real database ID.
2. Confirm the R2 bucket name matches the bucket you created.
3. Keep `assets.directory` pointed at `./public`; Wrangler uploads those static files with the Worker.
4. Keep `name` set to your existing deployed Worker name if you are migrating an existing board. For this repo that name is `veeboard-api`.

## 4. Initialize The Database

Run the schema once:

```bash
cd cloudflare-worker
npx wrangler d1 execute veeboard_db --remote --file=./schema.sql
```

The worker also contains runtime schema checks, but applying the schema explicitly is still the correct setup step.

## 5. Run Locally

```bash
cd cloudflare-worker
npx wrangler dev
```

Wrangler serves both the static assets and API routes from the same local origin.

## 6. Deploy The App

```bash
cd cloudflare-worker
npx wrangler deploy
```

After deploy, open the Worker URL. The frontend uses that same origin for `/load`, `/save`, uploads, auth, and user management.

## 7. Configure Email Notifications With Resend

VeeBoard can email the same transactional notifications that appear in the in-app notification panel. Email delivery is optional and is enabled when both `RESEND_API_KEY` and `RESEND_FROM_EMAIL` are configured.

1. Create a free [Resend](https://resend.com/) account.
2. Add and verify your sending domain in Resend.
3. Create a Resend API key.
4. Store the API key and sender settings as Worker secrets:

```bash
cd cloudflare-worker
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put RESEND_FROM_EMAIL
npx wrangler secret put RESEND_REPLY_TO
npx wrangler secret put APP_URL
```

Use a verified-domain sender such as `VeeBoard <notifications@example.com>` for `RESEND_FROM_EMAIL`. `RESEND_REPLY_TO` is optional. Set `APP_URL` to the deployed VeeBoard URL used by recipients.

For local development, copy `.dev.vars.example` to `.dev.vars` and replace the placeholder values. Do not commit `.dev.vars` or a real API key.

Email failures are logged but do not block board saves or in-app notifications. Resend's free plan currently includes 3,000 emails per month with a 100-email daily limit, so monitor usage in the Resend dashboard.

## 8. Migrating From Pages + Worker

To keep your existing board data, reuse the same D1 database and R2 bucket bindings. Do not run `npx wrangler d1 create` for the migration unless you intentionally want an empty board.

1. Keep the current D1 `database_id` in `cloudflare-worker/wrangler.json`.
2. Keep the current R2 bucket name in `cloudflare-worker/wrangler.json`.
3. Keep `name` set to the existing deployed Worker name.
4. Run `npx wrangler deploy` from `cloudflare-worker`.
5. Open the Worker URL directly and confirm your cards load.
6. Point your custom domain to this Worker, or retire the old Pages deployment after confirming the Worker-served app works.

The migration does not copy or rewrite board cards; it only changes where the static frontend is served from.

## 9. Optional App Settings

1. Open VeeBoard in the browser.
2. Open `Settings`.
3. Override the Worker URL only if you intentionally want a different API origin.
4. Optionally enter a board ID.
5. Save.

## 10. Create The First User

- If the board has no users yet, the first signup becomes the approved admin.
- After that, new signups require admin approval before they can log in.

## Notes

- Image uploads require the R2 bucket binding to be configured correctly.
