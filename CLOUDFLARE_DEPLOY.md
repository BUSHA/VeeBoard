# Cloudflare Worker Deployment Guide

This project deploys the static VeeBoard frontend and Worker API as one Cloudflare Worker project.
The worker expects:

- a D1 database bound as `DB`
- an R2 bucket bound as `BUCKET`
- optional Telegram bot secrets and configuration for personal Telegram notifications

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

## 7. Optional Telegram Notifications

VeeBoard uses one Telegram bot for every user. Each user privately links their VeeBoard email to their own Telegram chat from `Profile`, then chooses whether delivery is enabled.

1. Create a bot with [@BotFather](https://t.me/BotFather) and note its token and username.
2. Add the non-secret bot username to `wrangler.json`:

```json
"vars": {
  "TELEGRAM_BOT_USERNAME": "your_bot_username"
}
```

3. Store the bot token and a random webhook secret as Worker secrets:

```bash
cd cloudflare-worker
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put TELEGRAM_WEBHOOK_SECRET
```

4. Deploy, then register the Worker webhook with Telegram. Replace the placeholders with the deployed Worker URL, bot token, and the same webhook secret entered above:

```bash
curl -X POST "https://api.telegram.org/bot<BOT_TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://<WORKER_URL>/telegram/webhook","secret_token":"<WEBHOOK_SECRET>","allowed_updates":["message"]}'
```

5. Open VeeBoard, open `Profile`, enable Telegram notifications, and select `Connect Telegram`.

Telegram delivery is limited to notifications caused by another user's action, such as assignments, comments, card movement, approvals, and board-access changes. Queued due and overdue bell notifications are not sent to Telegram.
Messages use the language currently selected by each user in VeeBoard.
Each Telegram message includes an `Open card` or `Open board` button that switches to the relevant board and opens the referenced card after login.

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
