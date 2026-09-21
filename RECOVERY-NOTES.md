# BTM Operations HQ recovery

## Authoritative baseline

- Vercel deployment: `dpl_3q3ZXaUdKu91giZMi7W999u2D7qS`
- Vercel project: `btm-operations-hq-empty-trial-v2`
- Deployment state at recovery: `READY`
- Deployment target: production artifact, but the project currently reports no active production deployment
- Recovered source bundle: `BTM-Operations-HQ-V2-Fast-Fix.zip`
- Bundle timestamp: 35 minutes before the authoritative deployment
- Verification: filenames, API routes, polling behaviour, Shopify proxy behaviour, and live runtime routes match the deployment logs

## Recovery changes

- Preserved the recovered UI and existing communications data contract.
- Added staff authorization to `/api/shopify/customers`; the endpoint no longer returns customer PII to unauthenticated callers.
- Added bearer-token forwarding from the staff UI.
- Added Supabase-backed check-ins and approvals UI.
- Added an additive, idempotent operational migration with RLS and authenticated staff policies.
- Kept all Shopify secrets and the Supabase service-role key server-side.

## Production-data rule

Do not run `supabase-operational-migration.sql` against production until it passes in a Supabase branch or disposable clone. The migration is additive and contains no deletes, truncates, or destructive column changes.

Do not promote or replace the live Vercel deployment without Christine's explicit approval after preview acceptance.
