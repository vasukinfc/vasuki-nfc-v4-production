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

Status: RLS verification and application hardening required

`public/index.html` contains a legacy `SUPABASE_KEY` value used by homepage review code. The key decodes as a Supabase `anon` role JWT, not a privileged `service_role` key. Supabase anon keys are designed to be browser-visible only when Row Level Security policies are correctly configured, but this repository contains no Supabase migrations, policy files, or RLS evidence for the `reviews` table.

Required manual action:

- Verify Supabase Row Level Security for the `reviews` table before production launch, or rotate/remove the key in a separate approved cleanup if the legacy review integration is no longer required.

Additional confirmed hardening needs:

- The homepage performs anonymous `select('*')` on `reviews`.
- The homepage performs anonymous insert of `name`, `rating`, and `text`.
- No frontend update/delete operations were found.
- The frontend escapes rendered `name` and `text`, reducing stored-XSS risk.
- The frontend does not enforce explicit max lengths for `name` or `text`.
- The frontend does not revalidate rating as an integer in range `1..5` before insert.
- Anonymous review submission has no app-side rate limiting or moderation workflow.

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

The current `.gitignore` covers `.env`, `.env.*`, `node_modules/`, `uploads/`, `data/uploads/`, `data/*.json`, logs, temp files, `orders.json`, and `users.json`. Fallback/runtime files should remain excluded because they can contain local analytics/profile/runtime data.

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
7. Review and approve commit/push of recovery branch `recovery/v4-production-sync`.
8. Verify/harden Supabase `reviews` RLS and approve application hardening for review submission.
9. Confirm Render should deploy from the approved recovery branch only after it is pushed.

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

- Supabase anon key remains public-anon/RLS-unverified and needs manual RLS verification or approved cleanup.

## 2026-07-15 Current-source blocker update

### RB-011: Homepage review submission used direct browser-side Supabase insert

Status: Resolved in current source

The current official project still contained the older homepage review flow where the browser directly inserted into Supabase and loaded reviews with `select('*')`.

Fix completed:

- Added backend `POST /api/reviews`.
- Backend accepts only `name`, `text`, and `rating`.
- Backend rejects unknown and privileged/moderation fields.
- Backend trims and validates name, text, and rating.
- Added review-specific rate limiting: default `5` submissions per `10` minutes per IP.
- Homepage submission now calls `/api/reviews`.
- Direct browser-side Supabase insert was removed.
- Review reads now use explicit public fields only.
- Existing XSS-safe rendering remains in place.

Validation:

- Review tests passed: `10/10`.
- Existing focused regressions passed: `14/14`.
- Syntax sweep passed: `116` JS/CJS files.

Remaining dependency:

- Render must have `SUPABASE_URL` and `SUPABASE_ANON_KEY` configured.
- Supabase Reviews RLS must remain verified for approved-only reads and pending-only anonymous inserts.

### RB-012: Local Git metadata unavailable

Status: Still production-process dependency

The official project folder is now the source of truth, but its `.git` metadata remains invalid locally. This does not block local code execution or testing, but it blocks safe commit/deployment operations from this exact folder until Git metadata is repaired or changes are migrated through a valid repository workflow.

Runtime data note:

- `data/*.json` is now ignored in `.gitignore` so local fallback/runtime JSON files are not accidentally included in future repository recovery or commits.

## QA artifact status

- QA wrapper scripts: removed
- Razorpay stubs/mock services: removed
- SMTP catcher: removed
- DNS patch wrapper: removed
- QA local JSON files: absent
- QA upload files: absent
- QA MongoDB user/order records from this phase: removed
- Remaining QA marker records in MongoDB: 0
