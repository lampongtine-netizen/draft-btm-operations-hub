# BTM Operations HQ — Donna Mae handover

## Release status — 21 September 2026

- Authoritative source: Vercel deployment `dpl_3q3ZXaUdKu91giZMi7W999u2D7qS`.
- Recovery branch: `recovery/btm-trial-v2-20260921`.
- Tested preview: `https://btm-operations-hq-empty-trial-v2-5z42rn8ed.vercel.app`.
- Production is unchanged. Do not promote or replace production without Christine's explicit approval.
- Production data was preserved: 3 conversations and 7 messages remain in Supabase.
- There are no example students, payments, entitlements, or uploaded documents in production.

## What is complete

### Communications

- Existing conversations display again in Operations HQ.
- Dashboard and navigation counters show total messages, not only unread conversations.
- The final preview displays 7 messages across 3 conversations with no sync error.
- Supabase Realtime listens for conversation and message changes; a 3-second authenticated refresh is the fallback.
- Student messages enter through the signed Shopify app proxy. Staff replies use the same Supabase thread.

### Staff authentication

- Staff use passwordless Supabase magic links and staff-only RLS.
- A preview sign-in email was successfully requested for `csclampong@gmail.com`.
- If a staff member cannot load data, check their exact email in `public.admins` before changing RLS.

### Student, payment and check-in intake

One authenticated endpoint handles automation traffic:

`POST /api/integrations?action=<action>`

Send `Authorization: Bearer <MAKE_WEBHOOK_SECRET>` and JSON.

| Action | Purpose | Required identity |
|---|---|---|
| `payment` | Record a Stripe event and activate/update access | `eventId` plus `email` or `shopifyCustomerId` |
| `shopify-student` | Create/update a student and map access | `email` or `shopifyCustomerId` |
| `checkin` | Store a submitted check-in | Existing student's `email` or `shopifyCustomerId` |

Payment events are idempotent by `eventId`. Paid, succeeded, current, active and trialing states activate access.

| Shopify product or tag | Portal program | Level |
|---|---|---|
| Scale Society or Level 2 | Scale Society | Level 2 |
| Educator | Educators Pathway | Educators Pathway |
| Advisory, Business Support or Level 1 | Business Advisory & Support | Level 1 |
| Anything else | BTM Membership | Member |

### Storage

- Supabase contains `payment_events`, `access_entitlements` and `submission_documents`.
- The `student-submissions` bucket is private, limited to 10 MB, and accepts PDF, JPG, PNG and DOCX.
- Google Drive is not connected. Supabase Storage is the selected secure document store.

## Make.com setup

The Vercel receiver is ready, but the Make scenario still needs an authenticated Make user.

1. Add an HTTP `Make a request` module after the Stripe/Shopify success step.
2. URL: `https://<approved-domain>/api/integrations?action=payment`.
3. Method: `POST`; body type: JSON.
4. Header: `Authorization: Bearer <the Vercel MAKE_WEBHOOK_SECRET>`.
5. Map `eventId`, `email` or `shopifyCustomerId`, payment/subscription status, product title, tags, Stripe IDs, amount and currency.
6. Treat HTTP 200 with `duplicate: true` as success. Retry 5xx responses; fix 400/401 responses before retrying.
7. Use `action=shopify-student` for enrolment and `action=checkin` for check-ins.

Keep the Make secret only in Make's secured connection/variable and Vercel environment settings.

## Verification completed

- 10 automated authentication, validation and access-mapping tests pass.
- Syntax and repository whitespace checks pass.
- Vercel preview build is Ready.
- Communications shows 7 messages across 3 conversations and the correct counter.
- Realtime includes `conversations` and `messages`.
- The private document bucket and commerce tables exist.
- Staff magic-link delivery was accepted by Supabase.
- Unsigned admin, Shopify proxy and integration requests are rejected.

## Remaining acceptance tests before go-live

1. Copy the existing Shopify production variables to the recovery preview: `SHOPIFY_STORE_DOMAIN`, `SHOPIFY_CLIENT_ID`, `SHOPIFY_CLIENT_SECRET`, `BTM_SHOPIFY_ORIGINS`.
2. In Make.com, add the HTTP module using the preview URL and its secret.
3. Use the agreed real test customer/order to verify Stripe → Make → Vercel → Supabase → Shopify tags.
4. Confirm the resulting student and entitlement in Operations HQ.
5. Send a portal message, verify it reaches HQ within 3 seconds, reply as Support and Bree, and verify both replies in the portal.
6. Submit one check-in and one permitted document; confirm the admin record and private storage metadata.
7. Review test records with Christine before retaining or removing them.

Shopify's connection-verification page blocked the remote test browser, and Make.com access was not granted during recovery. Those account-level checks remain release blockers.

## Go-live and rollback

1. Finish every remaining test on the recovery preview.
2. Back up Supabase.
3. Obtain Christine's explicit approval to replace the live deployment.
4. Promote the exact tested commit/deployment.
5. Repeat authentication, messaging, registration, payment, check-in and storage smoke tests.
6. If a critical check fails, restore the previous Vercel production deployment alias. Do not delete Supabase data during rollback.
