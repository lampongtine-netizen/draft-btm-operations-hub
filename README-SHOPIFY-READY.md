# BTM Operations HQ V2 — Shopify Communications Ready

This build keeps the V2 empty Operations HQ and replaces the browser-only Communications trial with Supabase-backed messaging.

## Before Donamae pastes the Shopify code
1. In Supabase SQL Editor, run `supabase-migration.sql` once.
2. In the V2 Vercel project, add the environment variables shown in `.env.example`.
3. The Shopify app must include `read_customers`. The backend exchanges `SHOPIFY_CLIENT_ID` + `SHOPIFY_CLIENT_SECRET` for a short-lived Admin API token automatically. The backend verifies that the supplied customer exists, the email matches, and the customer has the `member` tag.
4. Redeploy V2.
5. Open V2, log in with Bree's demo access code, and open Communications. It should start empty until a Shopify member sends a message.
6. In `SHOPIFY-COMMUNICATIONS.liquid`, replace `https://YOUR-V2-PROJECT.vercel.app` with the actual deployed V2 URL.
7. Donamae can then add that Liquid code to the logged-in member Communications section.

## Test
Use one Shopify test customer tagged exactly `member`.
- Log into Shopify as that member.
- Send a message from Communications.
- Open V2 Operations HQ > Communications; the member conversation should appear.
- Reply as Bree Wilkinson.
- Confirm the reply appears in Shopify within about 5 seconds.
- Reply as BTM Support Team and confirm again.

## Security note
This build performs server-side Shopify customer lookup and member-tag verification and never exposes Shopify/Supabase secrets to the browser. For a full production launch, move the customer identity assertion to a Shopify App Proxy or Customer Account authenticated app flow so the backend receives a cryptographically authenticated Shopify identity rather than customer ID/email supplied by theme JavaScript.
