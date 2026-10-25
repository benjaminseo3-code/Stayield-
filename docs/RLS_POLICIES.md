# Access rules as Postgres RLS (for the later Supabase move)

Today every rule lives in `src/lib/policies.ts` and is enforced by the data layer in `src/lib/data`.
When Supabase Postgres is plugged in, the same rules map to row-level security like this. `auth.uid()`
is the signed-in user id (`users.id`); `is_admin()` checks `users.role = 'admin'`.

```sql
-- properties: live listings are public; owner/admin see their own regardless of status
alter table properties enable row level security;
create policy properties_public_read on properties for select
  using (status = 'live' or owner_id = auth.uid() or is_admin());
create policy properties_owner_write on properties for update
  using (owner_id = auth.uid() or is_admin());

-- property_photos: follow the parent property
create policy photos_read on property_photos for select using (
  exists (select 1 from properties p where p.id = property_id
          and (p.status = 'live' or p.owner_id = auth.uid() or is_admin())));

-- monthly_aggregates: owner, admin, or a buyer holding an unlock (permanent)
alter table monthly_aggregates enable row level security;
create policy aggregates_read on monthly_aggregates for select using (
  is_admin()
  or exists (select 1 from properties p where p.id = property_id and p.owner_id = auth.uid())
  or exists (select 1 from unlocks u where u.property_id = monthly_aggregates.property_id
             and u.buyer_id = auth.uid()));

-- reservations: owner/admin only. Buyers get NO policy => no access.
alter table reservations enable row level security;
create policy reservations_read on reservations for select using (
  is_admin() or exists (select 1 from properties p where p.id = property_id and p.owner_id = auth.uid()));

-- data_submissions (raw file keys, verification internals): admin only
alter table data_submissions enable row level security;
create policy submissions_admin on data_submissions for select using (is_admin());

-- unlocks / payments / saved_properties: the buyer's own rows
create policy unlocks_own on unlocks for select using (buyer_id = auth.uid());
create policy payments_own on payments for select using (buyer_id = auth.uid() or is_admin());
create policy saved_own on saved_properties for all using (buyer_id = auth.uid());

-- Writes to unlocks/payments/aggregates/submissions happen only through the server (service role).
```

Anything not listed has RLS enabled with no policy, i.e. denied (fail closed).
