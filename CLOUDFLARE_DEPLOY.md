# Cloudflare D1 Deployment Guide for VeeBoard

To enable cloud sync for your VeeBoard using Cloudflare D1, follow these steps:

## 1. Prerequisites
- A Cloudflare account.
- `wrangler` CLI installed (`npm install -g wrangler`).

## 2. Initialize D1 Database & R2 Bucket
Run the following commands in your terminal:
```bash
# Login to Cloudflare
npx wrangler login

# Create the database
npx wrangler d1 create veeboard_db

# Create the R2 bucket for image attachments
npx wrangler r2 bucket create veeboard-attachments
```
**Take note of the `database_id` returned.**

## 3. Set a Password (API Key)
Protect your data by setting a secret key that only your app knows:
```bash
cd cloudflare-worker
npx wrangler secret put API_KEY
# Enter a strong password when prompted
```

## 4. Update Configuration
Open `cloudflare-worker/wrangler.json` and:
1. Replace `REPLACE_WITH_YOUR_D1_DATABASE_ID` with your actual database ID.
2. Ensure the `r2_buckets` binding for `BUCKET` matches your actual bucket name (`veeboard-attachments`).

## 5. Deploy the Worker
```bash
# Initialize the database schema
npx wrangler d1 execute veeboard_db --remote --file=./schema.sql

# Deploy the worker
npx wrangler deploy
```

## 6. Configure VeeBoard
1. Open your VeeBoard in the browser.
2. Click the **☰ Menu** -> **Database & sync**.
3. Select **Cloudflare D1**.
4. Enter your **Worker URL**, **Board ID**, and the **Password** you set in step 3.
5. Click **Save**.

Your board will now sync securely with Cloudflare D1 and support image attachments via R2!
