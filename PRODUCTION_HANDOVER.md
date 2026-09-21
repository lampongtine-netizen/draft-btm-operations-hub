# BTM Operations HQ — Production readiness and Donna Mae handover

Last verified: 21 September 2026. This document distinguishes verified functionality from features that are only published, partially implemented, or untested. Do not describe the app as fully operational until all release gates below pass.

## Confirmed infrastructure

- Preserve the existing BTM Supabase project (`cheaehziqvdnwiavzwxh`), its data and migrations; do not create a replacement or reset it.
- Existing tables: `admins`, `students`, `conversations`, `messages`, `support_plan_goals`, `notes`, `tasks`, `activity_log`. All have row-level security enabled.
- A migration named `restrict_admin_check_anonymous_execution` was applied and verified on 21 September: `anon` EXECUTE on `public.is_current_user_admin()` is false; authenticated and service-role EXECUTE remain true.
- Vercel Trial V2 deployment is READY and its public HTML returns HTTP 200. `/api/demo-session` reports an inactive session for an unauthenticated request; `/api/admin/conversations` rejects unauthenticated requests with HTTP 401; `/api/shopify/proxy` rejects unsigned requests with HTTP 401. These are limited tests and do not establish end-to-end functionality.
- Existing Supabase staff records include Bree Wilkinson, Christine, Christine (personal), and Donamae. At verification, Bree and Donamae do not match Supabase Auth users, so their staff login must be provisioned and tested individually.

## Release blockers — do not send real members to Trial V2 yet

1. **Choose canonical app and codebase:** original `btm-operations-hq` and `btm-operations-hq-empty-trial-v2` are separate Vercel projects. Trial V2 was deployed from CLI, not confirmed linked to this GitHub repository. Identify the exact current source before modifying or promoting it.
2. **Real dashboard:** Trial V2 currently hardcodes many metrics as zero and shows empty placeholder screens in demo mode. Replace these with authorized, database-backed queries; distinguish demo from production and do not mislabel sample data.
3. **Staff access:** provision separate Supabase Auth accounts for Bree and Donna Mae using verified work email addresses. Check Auth emails, allowlisted admin record, role, session, and sign-out. Implement least privilege before granting access to sensitive student, financial, or conversation data: current RLS policies only check the admin allowlist and do not enforce distinct roles.
4. **Member identity and Shopify:** match Shopify customer IDs to member records on the server and verify program/product membership or tags. Authenticate each member server-side before any customer conversation read/write. Never accept an unauthenticated browser-supplied customer ID.
5. **Payments:** connect to a verified payment/subscription source with appropriate scoped credentials, account for webhook signatures, and only display genuine payment/renewal statuses. No live billing changes without approval and tested reconciliation.
6. **Operational writes:** provide persistent create/edit/delete or status transitions for student profiles, enrolments, audits, support plans, check-ins, Power Sessions, staff/student tasks, approvals, notes, and communications. Test each with a non-real test record and verify reloading persists changes. Avoid optimistic success messages when the database rejects a write.
7. **Security:** review the still-intentional authenticated invocation of `is_current_user_admin`, check all RLS policies, enable leaked-password protection in the Supabase Auth dashboard where available, review server secrets, and validate input encoding and audit logs.
8. **Release and rollback:** take a restorable backup/export, deploy a preview, run end-to-end tests, then promote the validated build to production. Record exact deployment ID, working canonical URL, and rollback target.

## Donna Mae acceptance test

With Donna Mae's own credentials, sign in; verify the permitted sections and absence of unapproved settings; open an authorised test student; update a test note/task and reload to verify persistence; inspect student onboarding, audit, support plan and Power Session statuses; receive and reply to a Shopify test customer without accessing other customers; check reporting matches the underlying test data; sign out and confirm access is revoked. Check permissions separately under Bree's and Christine's accounts.

## Daily operations SOP (activate only after the acceptance test passes)

1. Sign in with your own account. Review urgent dashboard items and unread messages.
2. Verify new students' purchase, product eligibility, membership and portal access.
3. Follow up on missing audit submissions, support plans, check-ins, booking requests and payment exceptions. Do not manually alter payment records without source verification.
4. Reply as the authorised team identity; escalate strategy/clinical/financial exceptions to Bree or Christine as applicable.
5. Assign and close internal tasks with next-action notes and due dates. Check approvals before publication or access changes.
6. Review the activity log and flag discrepancies; sign out after the shift.

## Handover sign-off

Owner/Bree: [ ] approved scope and roles  [ ] approved production release
Christine: [ ] verified end-to-end workflows  [ ] completed QA/rollback documentation
Donna Mae: [ ] signed in independently  [ ] passed acceptance test  [ ] received SOP

**Status as of 21 September 2026: NOT YET SIGNED OFF FOR LIVE HANDOVER.** This document is a release gate, not a claim of completed deployment or functional integration.
