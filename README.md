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
- Shopify student messaging is authenticated server-side through the app proxy's verified `logged_in_customer_id`.

## Paid membership automation

`POST /api/shopify/order-paid` accepts Shopify's `orders/paid` webhook. It verifies
the Shopify HMAC before it writes anything. For the supported membership products it:

- creates or updates the Operations HQ student;
- records the payment and access entitlement;
- creates and links the student's retained conversation; and
- applies the Shopify customer tags used by the Liquid portal access checks.

Required production environment variables:

- `SHOPIFY_CLIENT_SECRET` (also used by the existing app proxy)
- `SHOPIFY_ADMIN_ACCESS_TOKEN` with customer write access
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Register an `orders/paid` webhook in the existing Shopify custom app with the
production URL `https://draft-btm-operations-hub.vercel.app/api/shopify/order-paid`
and JSON format. Shopify customer accounts must be collected for membership
orders because the portal and messages are tied to `logged_in_customer_id`.

Shopify Inbox is not used as the database or API for this implementation.
