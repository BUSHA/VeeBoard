# Cloudflare Worker Deployment Guide

This project uses a Cloudflare Worker for board data, user management, and image handling.
The worker expects:

- a D1 database bound as `DB`
- an R2 bucket bound as `BUCKET`

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

## 4. Initialize The Database

Run the schema once:

```bash
cd cloudflare-worker
npx wrangler d1 execute veeboard_db --remote --file=./schema.sql
```

The worker also contains runtime schema checks, but applying the schema explicitly is still the correct setup step.

## 5. Deploy The Worker

```bash
cd cloudflare-worker
npx wrangler deploy
```

After deploy, copy the Worker URL.

## 6. Connect The Frontend

1. Open VeeBoard in the browser.
2. Open `Settings`.
3. Enter the Worker URL.
4. Optionally enter a board ID.
5. Save.

## 7. Create The First User

- If the board has no users yet, the first signup becomes the approved admin.
- After that, new signups require admin approval before they can log in.

## Notes

- Image uploads require the R2 bucket binding to be configured correctly.
