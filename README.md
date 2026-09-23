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

## Paid membership automation through Make.com

The existing Make scenario remains the payment automation source. After Stripe
confirms payment and Make creates or updates the Shopify customer (including the
portal access tag), Make sends the same event to:

`POST /api/integrations?action=payment`

The endpoint:

- creates or updates the Operations HQ student;
- records the payment and access entitlement;
- creates or links the student's retained conversation; and
- keeps retries idempotent using the Stripe event ID.

Required production environment variables:

- `MAKE_INTEGRATION_SECRET` (the same bearer token configured in Make)
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Make must post to
`https://draft-btm-operations-hub.vercel.app/api/integrations?action=payment`.
The Shopify modules in Make remain responsible for the customer record and tags
that unlock the Liquid portal. Customer accounts must be collected for membership
orders because portal access and messages are tied to `logged_in_customer_id`.

Shopify Inbox is not used as the database or API for this implementation.
