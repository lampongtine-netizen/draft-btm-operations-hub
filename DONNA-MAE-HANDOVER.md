# BTM Operations HQ V2 — Donna Mae handover

## Current status

The authoritative Vercel production artifact has been recovered into source control. The recovered application keeps the existing BTM Operations HQ interface and Shopify member communications workflow, and adds Supabase-backed Check-ins and Approval Tracking.

Production has not been replaced. No production data has been edited or migrated.

## What Donna Mae will manage

### Staff access

1. Staff enter their approved BTM email on the Operations HQ sign-in page.
2. Supabase sends a magic sign-in link.
3. Only emails listed in the Supabase `admins` table receive operational data access through RLS.
4. If a staff member can sign in but sees a permissions message, confirm their exact email is present in `admins` before changing any policy.

### Shopify customer connection

- The Shopify Admin API connection is read-only and requires the `read_customers` scope.
- The Vercel server exchanges the Shopify Client ID and Client Secret for a short-lived access token.
- Customer data is now restricted to authenticated BTM staff or Bree's private review session.
- Do not paste the Shopify Client Secret or Supabase service-role key into Shopify Liquid or browser code.

### Shopify member communications

1. Keep the app proxy path as `/apps/btm-messages`.
2. Use `SHOPIFY-COMMUNICATIONS.liquid` in the logged-in member communications section.
3. The proxy validates Shopify's signed request and the logged-in customer ID.
4. The customer must have either the `member` or `btm graduate support` tag.
5. Messages appear in Operations HQ > Communications. Staff can reply as Bree Wilkinson or BTM Support Team.

### Check-ins and approvals

- Check-ins can be created for a student and marked Submitted, Reviewed, or Overdue.
- Approvals can be assigned to a student and staff owner, given a due date, and marked Pending, Approved, or Changes Requested.
- These records are stored in Supabase and protected by staff-only RLS.

## Preview acceptance test

Run this on the preview URL only:

1. Open the preview and confirm the BTM Operations HQ sign-in page loads.
2. Sign in using an email already listed in `admins`.
3. Confirm Dashboard, Students, Staff Tasks, Communications, Check-ins, Approvals, Reporting, and Team Profiles open without a Supabase error.
4. Add a test check-in, change it to Reviewed, refresh, and confirm it persists.
5. Add a test approval, change it to Approved, refresh, and confirm it persists.
6. Open Shopify Customers and confirm it loads only after staff sign-in.
7. In a Shopify test customer tagged `member`, send a test message through `/apps/btm-messages`.
8. Confirm the conversation appears in Operations HQ, reply as BTM Support Team, and confirm the reply appears in Shopify.
9. Repeat the reply as Bree Wilkinson.
10. Confirm an unsigned direct request to the Shopify proxy is rejected.

## Migration and release order

1. Run `supabase-operational-migration.sql` in a Supabase branch or disposable clone.
2. Complete the preview acceptance test.
3. Review Supabase security and performance advisors.
4. Back up the production database.
5. Obtain Christine's approval.
6. Apply the reviewed migration to production.
7. Promote the tested preview artifact or deploy the approved commit to production.
8. Re-run the acceptance test and check runtime errors.

## Environment variables

The preview needs these Vercel variables:

- `BTM_DEMO_ACCESS_CODE`
- `BTM_DEMO_SESSION_SECRET`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SHOPIFY_STORE_DOMAIN`
- `SHOPIFY_CLIENT_ID`
- `SHOPIFY_CLIENT_SECRET`
- `BTM_SHOPIFY_ORIGINS`

Keep all values in Vercel environment settings. Do not commit real values.

## Rollback

If preview testing fails, do not promote it. The existing deployment remains unchanged. If a production release is later approved and fails, restore the previous Vercel deployment alias first, then investigate without deleting Supabase data.
