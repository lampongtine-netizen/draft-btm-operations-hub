# BTM Operations HQ — Live Communications Backend

This version preserves the existing BTM Operations HQ frontend and adds a real server-side messaging backend scaffold for Vercel + Supabase.

## Setup

1. Create a Supabase project.
2. Open SQL Editor and run `db/schema.sql`.
3. Change the demo admin email in the SQL seed if you want it in the `admins` table.
4. In Vercel → Project → Settings → Environment Variables, add the values from `.env.example`.
5. Redeploy.
6. Open Operations HQ → Messages. The first visit will ask for the admin email/password.

## Security

- Supabase service-role key is only used inside Vercel serverless functions.
- Browser code never receives the service-role key.
- Admin API routes require an HttpOnly signed session cookie.
- Shopify customer authentication is intentionally NOT implemented yet. Do not trust a raw customer ID from the browser as authorization.

## Next integration

The Shopify student Communications page should be changed only after this backend is verified. The student side should authenticate the Shopify customer server-side (for example through a Shopify app/app-proxy flow) before reading or writing that customer's conversation.

Shopify Inbox is not used as the database or API for this implementation.
