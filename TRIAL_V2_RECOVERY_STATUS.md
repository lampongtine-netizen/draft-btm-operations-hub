# BTM Operations HQ — Trial V2 recovery and release status

Date: 2026-09-21. Status: BLOCKED for production handover; do not deploy the older `main` branch to Trial V2.

## Authoritative application

- Vercel project: `btm-operations-hq-empty-trial-v2` (`prj_sDrQCKu8E8ZfAZbJoXUlNAoI4yxg`).
- Current confirmed CLI production deployment: `dpl_3q3ZXaUdKu91giZMi7W999u2D7qS`; production alias `btm-operations-hq-empty-trial-v2.vercel.app`.
- Its Vercel Source tab visibly includes `api/`, `.env.example`, `README-DEMO.md`, `README-SHOPIFY-READY...`, `SHOPIFY-COMMUNICATION...`, `index.html`, `package.json`, `student-test.html`, and `supabase-migration.sql`.
- GitHub `main` has an earlier frontend and a different set of API files. Git integration was added later; connecting it does NOT make GitHub a copy of the deployed source. Never deploy `main` as the updated version.
- The available Vercel connector exposes deployment metadata, logs and HTTP fetch, but no complete deployment source download action. A verified complete source tree is required for faithful reconciliation, especially serverless endpoints. Browser-rendered HTML alone is not a sufficient backend backup.

## Production backend — read-only verification

Supabase project `cheaehziqvdnwiavzwxh` contains 5 student records, 4 staff records, 5 tasks, 3 conversations, and 7 messages. Three conversations have Shopify customer IDs; zero student profiles have Shopify customer IDs. Two of four staff entries match Auth users; Bree and Donna Mae are not yet matched. These are database counts, not proof of business accuracy or a complete Shopify integration.

A prior migration `restrict_admin_check_anonymous_execution` revoked anonymous execution of `public.is_current_user_admin()`, verified via `has_function_privilege`. Remaining Supabase security advisors include authenticated execution of that SECURITY DEFINER function and disabled leaked-password protection. Review policies and dependent privileges before changing anything further.

## Non-destructive HTTP smoke checks already run

- Production homepage returns HTTP 200.
- `/api/admin/conversations` without a session returns HTTP 401.
- `/api/shopify/proxy` without a valid signature returns HTTP 401.
- These checks do NOT establish successful authenticated workflows, real Shopify syncing, payments, student permissions or user-level data access.

## Hard release gates

1. Recover the full current deployed source files, including all API handlers, from the Vercel deployment or original CLI deployment source. Compare against this branch file by file; remove any secrets from tracked files.
2. Commit reconciled code on a preview-only branch. Never overwrite the live deployment from the older GitHub main.
3. Verify preview environment variables and Supabase access; test a separate non-production database or test records without changing real student data.
4. Replace fixed zero dashboard figures and placeholder actions with verified read/write operations; show clear failures instead of optimistic success UI.
5. Link verified Shopify customers to students according to Bree-approved business rules. Do not infer membership from generic Shopify customers.
6. Confirm Donna Mae and Bree account ownership, provision distinct Auth accounts with scoped permissions, and test sign-in/sign-out and unauthorized access.
7. Verify student ↔ admin communications with actual authenticated identities, payments/entitlements, notes, tasks, audits, support plans, check-ins, approvals and reporting end-to-end.
8. Run security checks and test rollback, then secure sign-off before promoting to production.

No production deployment or data migration was performed by this recovery status update. Do not describe the app as launch-ready or handoff-ready until these gates pass.
