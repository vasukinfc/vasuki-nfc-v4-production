# Release Blockers

Date: 2026-07-13

## Resolved

### RB-001: `/card/vasuki-demo` hidden fallback heading

Status: Resolved

The demo digital card now renders with the visible card as the primary heading source. Desktop and mobile checks pass.

### RB-002: Missing authenticated Admin CRM QA

Status: Resolved

Real authenticated Admin CRM QA was completed with the configured MongoDB-backed `super_admin` account.

Verified:

- Admin login/logout
- Invalid login rejection
- Session persistence
- Protected-route redirects
- Super admin authorization
- Admin Dashboard
- Customer Management
- Order Management
- Subscription Manager
- Notification Manager
- Analytics Dashboard
- Desktop and mobile console checks

### RB-003: MongoDB Atlas integration not verified

Status: Resolved

The real application reports MongoDB configured and connected. Collections and indexes were verified safely without destructive resets.

## Active release blockers

No active code or QA release blockers remain for the local Test Mode release checkpoint.

### RB-004: Razorpay Test Mode backend payment verification

Status: Resolved for the newly completed Test Mode payment

The new successful Razorpay Test Mode payment was located and matched to exactly one `vasukinfc_v4.orders` record. The app order has matching receipt/local order id, matching Razorpay order id, `SUCCESS` payment status, stored payment id, stored `verifiedAt`, and stable tracking token.

Verified:

- Exact verification replay is idempotent.
- A different/fake payment id is rejected.
- No fake payment id is stored.
- Payment fields and tracking token remain unchanged after replay/replacement checks.
- MongoDB persistence survived app restart.
- Secure public tracking exposes only safe fields.
- Notification collection has no duplicate order notification records.

### RB-005: Authenticated paid-order UI/admin update QA pending login sessions

Status: Resolved by manual real-browser QA

The real customer account and real `super_admin` account were manually logged in and checked in the user's normal browser. Codex did not inspect or store credentials.

Verified:

- Customer Dashboard shows the latest paid order.
- Customer Dashboard still shows the paid order after refresh.
- Admin Order Management shows the same order.
- Admin Order Management still shows payment `SUCCESS` after refresh.
- Fulfillment status was safely updated to `PROCESSING`.
- Public tracking shows `PROCESSING`.
- Fulfillment status persisted after refresh.
- Payment/order/tracking references remained present after the admin update.
- Payment fields remained unchanged after the admin update.

### RB-006: Admin Order Details full identifier display

Status: Resolved

Admin Order Details now masks `trackingToken`, `paymentId`, and `razorpayOrderId` by default for authenticated admins. Each field has intentional reveal/hide and copy controls. Backend values and MongoDB records remain unchanged.

### RB-007: Render production environment configuration drift

Status: Resolved locally; Render dashboard values still require manual verification

The project deployment configuration was aligned for Render:

- `render.yaml` now uses `npm ci` and `npm start`.
- Node runtime compatibility is declared.
- `MONGODB_DB_NAME` now targets `vasukinfc_v4`.
- `TRUST_PROXY=1` is configured for Render's proxy.
- Production environment validation is enabled.
- Brevo/API SMTP variable names are documented.
- Razorpay examples default to Test Mode placeholders and do not enable Live Mode.
- Media persistence remains an explicit production dependency before Profile Editor media features are enabled.

### RB-008: Local Git metadata unavailable for deployment status

Status: Recovery branch prepared; commit/push pending approval

`git status` cannot be verified in this workspace because Git reports that the project folder is not a valid repository. The `.git` path is a directory, but it is empty and contains no `HEAD`, no `config`, no `objects`, no `refs`, and no `packed-refs`. No parent repository was found under `C:\`, and no recoverable remote URL, branch, refs, or commit history exists in this workspace.

Recovery completed safely:

- Confirmed remote repository: `vasukinfc/vasuki-nfc-v4-production`.
- Confirmed remote branch: `main`.
- Latest remote commit inspected: `d81f982 Update style.css`.
- Cloned into `C:\vasuki-nfc-v4-production-recovery`.
- Created local branch `recovery/v4-production-sync`.
- Copied reviewed application/config/test/report files only.
- Did not copy `.env`, `node_modules`, `uploads`, runtime JSON data, logs/temp files, `.vscode`, secrets, or the empty/corrupt `.git` directory.
- Did not commit or push.

Required manual action:

- Review the recovery branch diff.
- Approve commit creation.
- Approve push of `recovery/v4-production-sync`.

### RB-009: Legacy Supabase anon key review

Status: Resolved — application hardening complete and Supabase RLS/policies manually verified

`public/index.html` contains a legacy `SUPABASE_KEY` value used by homepage review code. The key decodes as a Supabase `anon` role JWT, not a privileged `service_role` key. Supabase anon keys are designed to be browser-visible only when Row Level Security policies are correctly configured, but this repository contains no Supabase migrations, policy files, or RLS evidence for the `reviews` table.

Required manual action:

- Completed: Supabase Reviews RLS was manually executed and verified successfully.

Additional confirmed hardening needs:

- Homepage review reads now use explicit fields only: `name`, `text`, `rating`, and `created_at`.
- Homepage review submission now uses the V4 backend endpoint `POST /api/reviews`.
- Direct browser-side Supabase insert has been removed.
- No frontend update/delete operations were found.
- The frontend escapes rendered `name` and `text`, reducing stored-XSS risk.
- Frontend and backend validation enforce name length `2..80`, review text length `10..1000`, and integer rating range `1..5`.
- Backend validation rejects unknown and privileged/moderation fields.
- Anonymous review submission now has app-side rate limiting: 5 submissions per 10 minutes per IP by default.

Minimum safe policy before production:

- RLS enabled on `public.reviews`.
- Anonymous `SELECT` restricted to approved reviews and safe public columns.
- Anonymous `INSERT` restricted to `name`, `rating`, and `text` only.
- Anonymous `UPDATE` denied.
- Anonymous `DELETE` denied.
- Database checks enforce rating and text/name length limits.
- Moderation fields must be server/default-owned, not client-writable.

### RB-010: Local JSON fallback data not fully ignored

Status: Fixed in recovery branch; commit pending approval

The current `.gitignore` covers `.env`, `.env.*`, `node_modules/`, `uploads/`, `data/uploads/`, logs, temp files, `orders.json`, and `users.json`. However, `data/*.json` fallback/runtime files are present and are not currently ignored. These files should not be committed without explicit review because they can contain local analytics/profile/runtime data.

Recovery action:

- Added `data/*.json` to `.gitignore` in the recovery branch.
- `node_modules/` from recovery-clone test installation remains ignored.

Required manual action:

- Approve commit of the `.gitignore` update with the recovered project files.

## Remaining production dependencies

These must be completed before final production launch:

1. Keep `ADMIN_BOOTSTRAP_PASSWORD` removed after first-admin setup.
2. Enter and verify Render dashboard values for all `sync: false` variables in `render.yaml`.
3. Keep Razorpay Test Mode keys for staging; configure Live Mode only during the final approved launch step.
4. Run live Razorpay order creation and payment verification in the intended production payment environment.
5. Configure and verify production email/WhatsApp delivery credentials if external notifications are required at launch.
6. Ensure production media storage is persistent for deployed Profile Editor/Public Card media before enabling media-dependent features.
7. Review and approve committing/pushing this report-only Supabase verification update.
8. Create/review/merge the approved recovery branch through the normal GitHub flow before Render deployment.
9. Configure Render to deploy only from the approved merged branch after deployment approval.

## Pre-commit cleanup status

Status: Safe to commit after approval

The 16 reviewed obsolete remote-only legacy files were removed from the recovery branch with Git-aware deletion. No V4 `public/`, `src/`, `scripts/`, `tests/`, required root configuration, or report file was deleted.

Removed:

- `index.html`
- `admin-login.html`
- `admin-panel.html`
- `admin/index.html`
- `customer-login.html`
- `customer-panel.html`
- `customer/index.html`
- `card.html`
- `card/index.html`
- `direct-links.html`
- `firebase.js`
- `js/app.js`
- `css/style.css`
- `manifest.json`
- `service-worker.js`
- `assets/icon.svg`

Validation after removal:

- Dependency dry-run passed.
- Focused regression tests passed: 14/14.
- Syntax checks passed.
- Static/admin/customer asset smoke checks passed.
- Existing local route probes passed.
- Secret-sensitive scan found no Live Razorpay key, real MongoDB credential, or SMTP/Brevo secret.

Remaining production dependency:

- Supabase anon key remains public-anon and is now backed by manually verified Reviews RLS/policies.

## QA artifact status

- QA wrapper scripts: removed
- Razorpay stubs/mock services: removed
- SMTP catcher: removed
- DNS patch wrapper: removed
- QA local JSON files: absent
- QA upload files: absent
- QA MongoDB user/order records from this phase: removed
- Remaining QA marker records in MongoDB: 0

## Review security hardening verification

Status: Resolved — application-side hardening complete and manual Supabase RLS verification passed.

Verified:

- Manual SQL plan file `SUPABASE_REVIEWS_RLS.sql` exists and has not been executed by Codex.
- Homepage review reads use explicit fields only.
- Homepage review submissions use `POST /api/reviews`.
- Direct browser-side Supabase insert was removed.
- Frontend and backend validation are aligned.
- Backend rejects unknown and privileged review fields.
- Review submission rate limit is scoped to `POST /api/reviews` only.
- Focused review tests passed 10/10.
- Existing focused regression tests passed 14/14.
- Syntax, diff, and secret-value scans passed for the review hardening checkpoint.

Remaining manual action:

- Completed: Supabase RLS policies were manually executed and verified successfully.
## Supabase Reviews RLS manual verification result

Status: Resolved

Verified manually by project owner:

- `approved` column exists with default `false`.
- Only two anonymous policies exist.
- Anonymous `SELECT` is approved-only.
- Anonymous `INSERT` is pending-only with validation.
- Anonymous `UPDATE` and `DELETE` are denied.
- Database constraints are active.

Result: Supabase Reviews RLS is no longer a release blocker.