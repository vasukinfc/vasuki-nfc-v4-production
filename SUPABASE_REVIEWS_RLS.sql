-- Supabase reviews table security plan for VASUKI NFC.
--
-- Manual execution only.
-- Do not run this file until the table shape has been reviewed in Supabase.
-- This plan assumes the public reviews table is intended to accept public
-- review submissions, keep them unpublished by default, and show only
-- approved reviews on the homepage.

-- 1. Required table hardening.
-- Adjust the ALTER TABLE statements if your column names differ.

alter table public.reviews
  enable row level security;

alter table public.reviews
  alter column name set not null,
  alter column text set not null,
  alter column rating set not null,
  alter column approved set default false,
  alter column created_at set default timezone('utc', now());

alter table public.reviews
  add constraint if not exists reviews_rating_range_chk
  check (rating between 1 and 5);

alter table public.reviews
  add constraint if not exists reviews_name_length_chk
  check (char_length(trim(name)) between 2 and 80);

alter table public.reviews
  add constraint if not exists reviews_text_length_chk
  check (char_length(trim(text)) between 10 and 1000);

-- 2. Remove broad anonymous access before adding narrow policies.
-- Review existing policies first in the Supabase dashboard before dropping.

drop policy if exists "Public can read reviews" on public.reviews;
drop policy if exists "Public can insert reviews" on public.reviews;
drop policy if exists "Public can update reviews" on public.reviews;
drop policy if exists "Public can delete reviews" on public.reviews;

-- 3. Anonymous visitors may read only approved/published reviews.
-- IMPORTANT: Use explicit SELECT columns in application code:
-- name, text, rating, created_at.

create policy "Anon can read approved reviews"
on public.reviews
for select
to anon
using (approved = true);

-- 4. Anonymous visitors may submit only unapproved reviews.
-- Privileged/moderation columns such as approved, featured, admin_reply,
-- owner_id, updated_at, or deleted_at must be database/default/admin-owned.
--
-- Supabase/Postgres RLS cannot by itself limit inserted column names.
-- Enforce this by:
--   a) using column-level grants below;
--   b) keeping moderation columns default-owned;
--   c) preferably submitting through the V4 backend endpoint.

create policy "Anon can submit pending reviews"
on public.reviews
for insert
to anon
with check (
  approved = false
  and rating between 1 and 5
  and char_length(trim(name)) between 2 and 80
  and char_length(trim(text)) between 10 and 1000
);

-- 5. Anonymous visitors must not update or delete reviews.
-- Do not create anon update/delete policies.

-- 6. Column-level privileges for anonymous access.
-- Revoke broad table privileges, then grant only the exact columns required.

revoke all on public.reviews from anon;

grant select (name, text, rating, created_at)
on public.reviews
to anon;

grant insert (name, text, rating)
on public.reviews
to anon;

-- 7. Trusted/admin role policy examples.
-- Replace authenticated/admin checks with your real admin model if needed.
-- Do not grant these privileges to anon.

create policy "Authenticated users can manage reviews"
on public.reviews
for all
to authenticated
using (true)
with check (true);

-- 8. Manual dashboard verification checklist after applying:
-- - RLS is enabled on public.reviews.
-- - anon SELECT returns only approved reviews.
-- - anon SELECT exposes only name, text, rating, created_at.
-- - anon INSERT accepts only name, text, rating.
-- - anon cannot set approved, featured, admin_reply, owner_id, timestamps,
--   or other privileged/moderation fields.
-- - anon UPDATE is denied.
-- - anon DELETE is denied.
-- - rating must be 1 through 5.
-- - name/text cannot be empty or oversized.
